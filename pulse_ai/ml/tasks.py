import logging
from datetime import datetime, timedelta

from celery import shared_task
from django.utils import timezone

from pulse_ai.ml.predictors import PredictionService

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def run_hourly_predictions(self, model_name: str = "A3"):
    """
    Периодическая задача: предсказание для всех сущностей 
    на начало текущего часа.
    
    Запускается через Celery Beat каждый час в 05 минут.
    """
    try:
        service = PredictionService()
        
        # Прогноз на начало текущего часа
        prediction_time = timezone.now().replace(
            minute=0, second=0, microsecond=0
        )
        
        predictions = service.predict(
            model_name=model_name,
            prediction_time=prediction_time,
        )
        
        saved_count = service.save_predictions(predictions, model_name)
        
        logger.info(
            "Task %s completed: %d predictions saved",
            model_name, saved_count
        )
        return {"model": model_name, "predictions": saved_count}
    
    except Exception as exc:
        logger.exception("Prediction task failed for %s", model_name)
        raise self.retry(exc=exc)


@shared_task
def run_all_models():
    """Запуск всех активных моделей."""
    from pulse_ai.ml.constants import MODEL_REGISTRY
    
    results = {}
    for model_name in MODEL_REGISTRY:
        try:
            task_result = run_hourly_predictions.delay(model_name)
            results[model_name] = task_result.id
        except Exception as e:
            logger.exception("Failed to schedule %s", model_name)
            results[model_name] = f"error: {e}"
    
    return results