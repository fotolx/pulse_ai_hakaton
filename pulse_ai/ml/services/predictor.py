"""
Загрузка моделей и выполнение предсказаний.
"""
import logging
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from django.conf import settings

from ml.constants import MODEL_REGISTRY, MODELS_DIR, FORECAST_CONFIDENCE_THRESHOLD

logger = logging.getLogger(__name__)


@lru_cache(maxsize=8)
def _load_model(model_name: str):
    """Кэшированная загрузка модели."""
    config = MODEL_REGISTRY[model_name]
    file_path = MODELS_DIR / config["file"]

    if not file_path.exists():
        raise FileNotFoundError(f"Файл модели не найден: {file_path}")

    if config["engine"] == "catboost":
        from catboost import CatBoost
        model = CatBoost()
        model.load_model(str(file_path))
    elif config["engine"] == "sklearn":
        import joblib
        model = joblib.load(str(file_path))
    else:
        raise ValueError(f"Неизвестный движок: {config['engine']}")

    logger.info(f"Модель {model_name} загружена из {file_path}")
    return model


def align_features(df: pd.DataFrame, model_name: str) -> pd.DataFrame:
    """
    Приведение DataFrame к ожидаемому набору признаков модели.
    Обрабатывает категориальные признаки для CatBoost.
    """
    config = MODEL_REGISTRY[model_name]
    required = config["features"]
    cat_features = config.get("cat_features", [])

    # Добавляем отсутствующие колонки как 0
    for col in required:
        if col not in df.columns:
            df[col] = 0

    # Оставляем только нужные колонки в нужном порядке
    df = df[required].copy()

    # Обрабатываем категориальные признаки для CatBoost
    if config["engine"] == "catboost" and cat_features:
        for col in cat_features:
            if col in df.columns:
                # Заменяем NaN на строку "unknown"
                df[col] = df[col].fillna("unknown")
                
                # Если колонка числовая (например, object_id как 108.0),
                # конвертируем в целые, затем в строки
                if pd.api.types.is_numeric_dtype(df[col]):
                    # Конвертируем в Int64 (nullable integer), чтобы сохранить целочисленность
                    df[col] = df[col].astype("Int64").astype(str)
                else:
                    # Уже строковая — просто приводим к str
                    df[col] = df[col].astype(str)

    # Для некатегориальных признаков заменяем NaN на 0
    non_cat_cols = [c for c in required if c not in cat_features]
    if non_cat_cols:
        df[non_cat_cols] = df[non_cat_cols].apply(
            pd.to_numeric, errors="coerce"
        ).fillna(0)

    return df


def predict(
    model_name: str,
    features_df: pd.DataFrame,
    prediction_time,
    threshold: float = None,
) -> pd.DataFrame:
    """Выполнение предсказания."""
    config = MODEL_REGISTRY[model_name]
    threshold = threshold or FORECAST_CONFIDENCE_THRESHOLD

    if features_df.empty:
        logger.warning(f"{model_name}: нет данных для предсказания")
        return pd.DataFrame(columns=[
            "entity_id", "model_name", "prediction_time", "probability", "label"
        ])

    # Определяем колонку-идентификатор
    granularity = config["granularity"]
    id_col_map = {
        "channel": "channel_key",
        "system": "system_key",
        "picket": "picket_key",
        "maintenance_unit": "maintenance_unit_key",
        "episode": "episode_id",
    }
    id_col = id_col_map.get(granularity, "entity_id")

    if id_col not in features_df.columns:
        for col in features_df.columns:
            if "key" in col or "id" in col:
                id_col = col
                break
        else:
            features_df["entity_id"] = "unknown"
            id_col = "entity_id"

    X = align_features(features_df.copy(), model_name)
    model = _load_model(model_name)

    if config["engine"] == "catboost":
        # Используем predict с prediction_type='Probability'
        probabilities = model.predict(X, prediction_type="Probability")[:, 1]
    elif config["engine"] == "sklearn":
        scores = model.score_samples(X)
        probabilities = 1.0 - (scores - scores.min()) / (scores.max() - scores.min() + 1e-10)

    result = pd.DataFrame({
        "entity_id": features_df[id_col].astype(str).values,
        "model_name": model_name,
        "prediction_time": prediction_time,
        "probability": probabilities,
        "label": (probabilities >= threshold).astype(int),
    })

    logger.info(
        f"{model_name}: {len(result)} предсказаний, "
        f"{result['label'].sum()} положительных ({result['label'].mean()*100:.1f}%)"
    )
    return result


def save_predictions(predictions_df: pd.DataFrame) -> int:
    """
    Сохранение предсказаний в БД через bulk_create.
    Работает с любой версией драйвера (psycopg2 и psycopg3).
    """
    if predictions_df.empty:
        return 0

    from ml.models import MLPrediction

    # Формируем список объектов для создания
    predictions_to_create = [
        MLPrediction(
            entity_id=str(row["entity_id"]),
            model_name=str(row["model_name"]),
            prediction_time=row["prediction_time"],
            probability=float(row["probability"]),
            label=int(row["label"]),
        )
        for _, row in predictions_df.iterrows()
    ]

    # bulk_create с батчами по 5000 записей
    MLPrediction.objects.bulk_create(
        predictions_to_create,
        batch_size=5000,
        ignore_conflicts=True,
    )

    count = len(predictions_to_create)
    logger.info(f"Сохранено {count} предсказаний")
    return count