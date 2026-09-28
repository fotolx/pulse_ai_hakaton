"""
Загрузка обученных моделей и выполнение предсказаний.
"""
import logging
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from django.conf import settings

from pulse_ai.ml.constants import MODEL_REGISTRY
from pulse_ai.ml.feature_engineering import FeatureEngineeringService

logger = logging.getLogger(__name__)


@lru_cache(maxsize=8)
def _load_model(model_path: str):
    """Кэшированная загрузка модели CatBoost."""
    from catboost import CatBoost
    
    full_path = Path(settings.BASE_DIR) / model_path
    if not full_path.exists():
        raise FileNotFoundError(f"Model not found: {full_path}")
    
    model = CatBoost()
    model.load_model(str(full_path))
    logger.info("Model loaded: %s", model_path)
    return model


class PredictionService:
    """Сервис выполнения предсказаний."""

    def __init__(self):
        self.feature_service = FeatureEngineeringService()

    def _align_features(
        self, 
        df: pd.DataFrame, 
        required_columns: list,
    ) -> pd.DataFrame:
        """Выравнивание признаков под ожидаемый моделью набор."""
        missing = [c for c in required_columns if c not in df.columns]
        if missing:
            logger.warning("Missing %d features, filling with 0: %s", 
                           len(missing), missing[:5])
            for col in missing:
                df[col] = 0
        return df[required_columns]

    def predict(
        self,
        model_name: str,
        prediction_time: pd.Timestamp,
        entity_id: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        Выполнение предсказания.
        
        Возвращает DataFrame с колонками:
        - идентификатор сущности (канал/система/пикет)
        - prediction_time
        - predicted_probability
        - predicted_label
        """
        if model_name not in MODEL_REGISTRY:
            raise ValueError(f"Unknown model: {model_name}")
        
        config = MODEL_REGISTRY[model_name]
        
        # 1. Готовим признаки
        features_df = self.feature_service.build_features(
            model_name, prediction_time, entity_id
        )
        
        if features_df.empty:
            logger.warning("No features built for %s at %s", 
                           model_name, prediction_time)
            return pd.DataFrame()
        
        # 2. Выравниваем под ожидаемый набор признаков
        X = self._align_features(features_df.copy(), config["features"])
        
        # 3. Загружаем модель и предсказываем
        model = _load_model(config["model_path"])
        probabilities = model.predict_proba(X)[:, 1]
        
        # 4. Формируем результат
        id_column = self._get_id_column(model_name)
        result = features_df[[id_column]].copy()
        result["prediction_time"] = prediction_time
        result["predicted_probability"] = probabilities
        result["predicted_label"] = (probabilities >= 0.5).astype(int)
        
        logger.info(
            "%s predictions: %d rows, %d positives (%.2f%%)",
            model_name,
            len(result),
            int(result["predicted_label"].sum()),
            100.0 * result["predicted_label"].mean(),
        )
        return result

    @staticmethod
    def _get_id_column(model_name: str) -> str:
        """Определение идентификатора сущности по модели."""
        granularity = MODEL_REGISTRY[model_name]["granularity"]
        return {
            "channel": "ид_канала_данных",
            "system": "system_key",
            "picket": "picket_key",
            "maintenance_unit": "maintenance_unit_key",
        }[granularity]

    def save_predictions(self, predictions_df: pd.DataFrame, model_name: str) -> int:
        """Сохранение предсказаний в БД (через COPY для производительности)."""
        from django.db import connections
        import io
        
        if predictions_df.empty:
            return 0
        
        # Подготовка таблицы (выполнить миграцией заранее)
        buffer = io.StringIO()
        for _, row in predictions_df.iterrows():
            buffer.write("\t".join([
                str(row.iloc[0]),          # entity_id
                str(model_name),
                row["prediction_time"].isoformat(),
                f"{row['predicted_probability']:.6f}",
                str(row["predicted_label"]),
            ]) + "\n")
        buffer.seek(0)
        
        with connections["direct"].cursor() as cursor:
            cursor.copy_expert("""
                COPY ml_predictions 
                (entity_id, model_name, prediction_time, probability, label)
                FROM STDIN WITH (FORMAT text, DELIMITER E'\t')
            """, buffer)
        
        return len(predictions_df)