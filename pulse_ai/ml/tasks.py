# ml/tasks.py
import logging

from celery import shared_task
from django.utils import timezone

from ml.constants import MODEL_REGISTRY

logger = logging.getLogger(__name__)


def _prediction_exists(model_name: str, prediction_time) -> bool:
    """Проверка, есть ли уже предсказание для данного времени."""
    from ml.models import MLPrediction
    
    return MLPrediction.objects.filter(
        model_name=model_name,
        prediction_time=prediction_time,
    ).exists()


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def run_hourly_prediction(self, model_name: str, force: bool = False):
    """
    Ежечасное предсказание с проверкой идемпотентности.
    
    Аргументы:
        model_name: код модели (A3, A4, B1, C1)
        force: если True, предсказание создаётся даже если уже существует
    """
    try:
        from ml.services.feature_engineering import (
            build_a3_features,
            build_a4_features,
            build_b1_features,
            build_c1_features,
        )
        from ml.services.predictor import predict, save_predictions

        prediction_time = timezone.now().replace(
            minute=0, second=0, microsecond=0
        )

        # Проверка идемпотентности
        if not force and _prediction_exists(model_name, prediction_time):
            logger.info(
                f"{model_name}: предсказание для {prediction_time} уже существует, пропускаем"
            )
            return {"model": model_name, "status": "skipped_exists"}

        builders = {
            "A3": build_a3_features,
            "A4": build_a4_features,
            "B1": build_b1_features,
            "C1": build_c1_features,
        }

        if model_name not in builders:
            return {"model": model_name, "status": "unknown"}

        features_df = builders[model_name](prediction_time)

        if features_df.empty:
            logger.warning(f"{model_name}: нет данных для предсказания")
            return {"model": model_name, "status": "no_data"}

        predictions = predict(model_name, features_df, prediction_time)
        saved = save_predictions(predictions)
        
        # Обновляем снимок для мобильного приложения
        update_forecast_snapshot.delay(model_name)

        logger.info(f"{model_name}: сохранено {saved} предсказаний")
        return {"model": model_name, "predictions": saved}

    except Exception as exc:
        logger.exception(f"Ошибка предсказания {model_name}")
        raise self.retry(exc=exc)


@shared_task
def run_specific_models(model_names: list, force: bool = False):
    """Запуск конкретного набора моделей."""
    results = {}
    for model_name in model_names:
        try:
            run_hourly_prediction.delay(model_name, force)
            results[model_name] = "dispatched"
        except Exception as e:
            logger.exception(f"Не удалось запустить {model_name}")
            results[model_name] = f"error: {e}"
    return results


@shared_task
def run_all_hourly_models(force: bool = False):
    """Запуск всех ежечасных моделей."""
    hourly_models = [
        name for name, cfg in MODEL_REGISTRY.items()
        if cfg.get("schedule") == "hourly"
    ]
    return run_specific_models(hourly_models, force)


@shared_task
def run_daily_models(force: bool = False):
    """Запуск ежедневных моделей (F1_7d, F1_30d)."""
    try:
        from ml.services.feature_engineering import build_f1_features
        from ml.services.predictor import predict, save_predictions
        
        prediction_date = timezone.now().replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        
        results = {}
        
        # Проверка идемпотентности
        if not force and _prediction_exists("F1_7d", prediction_date):
            logger.info("F1: предсказания уже существуют, пропускаем")
            return {"status": "skipped_exists"}
        
        features_df = build_f1_features(prediction_date)
        
        if features_df.empty:
            return {"status": "no_data"}
        
        for model_name in ["F1_7d", "F1_30d"]:
            predictions = predict(model_name, features_df, prediction_date)
            saved = save_predictions(predictions)
            results[model_name] = saved
            update_forecast_snapshot.delay(model_name)
        
        return results
    
    except Exception as exc:
        logger.exception("Ошибка ежедневных моделей")
        raise


@shared_task
def update_forecast_snapshot(model_name: str):
    """Обновление агрегированного снимка прогноза."""
    from datetime import timedelta
    from ml.models import MLPrediction, ForecastSnapshot
    from ml.constants import FORECAST_CONFIDENCE_THRESHOLD

    MODEL_TO_FORECAST = {
        "B1": {"forecast_type": "fire", "period": "short", "title": "Пожарный риск"},
        "C1": {"forecast_type": "flooding", "period": "short", "title": "Риск затопления"},
        "A3": {"forecast_type": "channel-fault", "period": "short", "title": "Риск отказа канала"},
        "A4": {"forecast_type": "system-fault", "period": "short", "title": "Риск отказа системы"},
        "F1_7d": {"forecast_type": "preventive-repair", "period": "long", "title": "Предупредительный ремонт"},
        "F1_30d": {"forecast_type": "preventive-repair", "period": "long", "title": "Предупредительный ремонт"},
    }

    if model_name not in MODEL_TO_FORECAST:
        return

    mapping = MODEL_TO_FORECAST[model_name]
    config = MODEL_REGISTRY[model_name]
    horizon_hours = config.get("horizon_hours") or (config.get("horizon_days", 1) * 24)

    since = timezone.now() - timedelta(hours=horizon_hours)

    predictions = list(
        MLPrediction.objects
        .filter(
            model_name=model_name,
            probability__gte=FORECAST_CONFIDENCE_THRESHOLD,
            prediction_time__gte=since,
        )
        .values("entity_id", "probability")
        .order_by("-probability")
    )

    nodes = [
        {"node": p["entity_id"], "picket": p["entity_id"], "district": ""}
        for p in predictions
    ]
    count = len(nodes)

    if count == 0:
        severity = "none"
    elif count == 1:
        severity = "danger"
    elif count <= 3:
        severity = "normal"
    else:
        severity = "warning"

    horizon_key = str(horizon_hours)

    ForecastSnapshot.objects.update_or_create(
        forecast_type=mapping["forecast_type"],
        defaults={
            "period": mapping["period"],
            "title": mapping["title"],
            "horizons": {
                horizon_key: {
                    "value": count,
                    "severity": severity,
                    "nodes": nodes,
                }
            },
            "confidence_threshold": FORECAST_CONFIDENCE_THRESHOLD,
        },
    )

    logger.info(
        f"Снимок прогноза {mapping['forecast_type']} обновлён: {count} узлов"
    )