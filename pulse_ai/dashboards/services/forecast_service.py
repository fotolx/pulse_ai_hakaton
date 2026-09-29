"""
Сервис агрегации прогнозов из результатов моделей машинного обучения.
Оптимизированная версия: пакетная загрузка каналов, ограничение выборки.
"""
import logging
from datetime import timedelta
from typing import Optional

from django.utils import timezone

logger = logging.getLogger(__name__)


MODEL_TO_FORECAST_MAP = {
    "B1": {
        "forecast_type": "fire",
        "period": "short",
        "title": "Пожарный риск",
        "horizons_hours": [1, 6, 24],
        "entity_field": "picket_key",
    },
    "C1": {
        "forecast_type": "flooding",
        "period": "short",
        "title": "Риск затопления",
        "horizons_hours": [6, 24],
        "entity_field": "picket_key",
    },
    "A3": {
        "forecast_type": "channel-fault",
        "period": "short",
        "title": "Риск отказа канала",
        "horizons_hours": [24],
        "entity_field": "channel_key",
    },
    "A4": {
        "forecast_type": "system-fault",
        "period": "short",
        "title": "Риск отказа системы",
        "horizons_hours": [24],
        "entity_field": "system_key",
    },
    "F1_7d": {
        "forecast_type": "preventive-repair",
        "period": "long",
        "title": "Необходимость предупредительного ремонта",
        "horizons_hours": [168],
        "entity_field": "maintenance_unit_key",
    },
    "F1_30d": {
        "forecast_type": "preventive-repair",
        "period": "long",
        "title": "Необходимость предупредительного ремонта",
        "horizons_hours": [720],
        "entity_field": "maintenance_unit_key",
    },
}

# Максимальное число предсказаний для обработки на один горизонт
MAX_PREDICTIONS_PER_HORIZON = 50


class ForecastAggregationService:
    """Сервис агрегации прогнозов из таблицы ml_predictions."""

    DEFAULT_CONFIDENCE_THRESHOLD = 0.0058

    def __init__(self):
        # Кэш каналов загружается один раз за запрос
        self._channel_cache = None

    def _get_channel_cache(self):
        """Загружает все каналы одним запросом и строит индексы."""
        if self._channel_cache is not None:
            return self._channel_cache

        from ml.models import ChannelKey

        channels = ChannelKey.objects.all().only(
            "channel_id",
            "channel_key",
            "system_key",
            "picket_key",
            "maintenance_unit_key",
            "picket_number",
            "engineering_system_type",
        )

        # Строим четыре индекса для быстрого поиска
        cache = {
            "by_picket_key": {},
            "by_channel_key": {},
            "by_system_key": {},
            "by_maintenance_unit_key": {},
        }

        for ch in channels:
            if ch.picket_key:
                cache["by_picket_key"][ch.picket_key] = ch
            if ch.channel_key:
                cache["by_channel_key"][ch.channel_key] = ch
            if ch.system_key:
                # Для систем берём первый попавшийся канал
                if ch.system_key not in cache["by_system_key"]:
                    cache["by_system_key"][ch.system_key] = ch
            if ch.maintenance_unit_key:
                if ch.maintenance_unit_key not in cache["by_maintenance_unit_key"]:
                    cache["by_maintenance_unit_key"][ch.maintenance_unit_key] = ch

        self._channel_cache = cache
        logger.info(
            f"Загружено каналов: {len(channels)}, "
            f"пикетов: {len(cache['by_picket_key'])}, "
            f"систем: {len(cache['by_system_key'])}"
        )
        return cache

    def _resolve_picket_info(
        self, entity_id: str, entity_field: str
    ) -> Optional[dict]:
        """Преобразование entity_id в информацию о пикете через кэш."""
        cache = self._get_channel_cache()
        entity_id = str(entity_id)

        # Определяем индекс по типу сущности
        index_key = f"by_{entity_field}"
        channel = cache.get(index_key, {}).get(entity_id)

        # Fallback: ищем во всех индексах
        if not channel:
            for idx in cache.values():
                channel = idx.get(entity_id)
                if channel:
                    break

        if not channel:
            return None

        # Извлекаем номер пикета
        picket_id = channel.picket_number
        if not picket_id and channel.picket_key:
            parts = channel.picket_key.split("|")
            picket_id = parts[-1] if len(parts) > 1 else channel.picket_key

        return {
            "node": picket_id,
            "picket": picket_id,
            "district": channel.engineering_system_type or "",
        }

    def get_severity(self, value: int) -> str:
        """Определение серьёзности прогноза по числу узлов."""
        if value == 0:
            return "none"
        elif value == 1:
            return "danger"
        elif value <= 3:
            return "normal"
        else:
            return "warning"

    def aggregate_forecast(
        self,
        model_name: str,
        threshold: Optional[float] = None,
    ) -> dict:
        """Агрегация прогнозов по модели."""
        from ml.models import MLPrediction

        if model_name not in MODEL_TO_FORECAST_MAP:
            raise ValueError(f"Unknown model: {model_name}")

        config = MODEL_TO_FORECAST_MAP[model_name]
        threshold = threshold or self.DEFAULT_CONFIDENCE_THRESHOLD
        entity_field = config["entity_field"]

        # Находим последнее время предсказания модели
        latest_prediction = (
            MLPrediction.objects
            .filter(model_name=model_name)
            .order_by("-prediction_time")
            .values("prediction_time")
            .first()
        )

        if not latest_prediction:
            logger.warning(f"{model_name}: нет предсказаний в БД")
            return {
                "id": config["forecast_type"],
                "period": config["period"],
                "title": config["title"],
                "horizons": {str(h): None for h in [1, 6, 24, 168, 720]},
            }

        base_time = latest_prediction["prediction_time"]
        horizons = {}

        # ЗАГРУЖАЕМ ВСЕ ПРЕДСКАЗАНИЯ ОДНИМ ЗАПРОСОМ
        all_predictions = list(
            MLPrediction.objects
            .filter(
                model_name=model_name,
                probability__gte=threshold,
                prediction_time=base_time,
            )
            .values("entity_id", "probability")
            .order_by("-probability")
            [:MAX_PREDICTIONS_PER_HORIZON]
        )

        logger.info(
            f"{model_name}: найдено {len(all_predictions)} предсказаний "
            f"выше порога {threshold} на время {base_time}"
        )

        # ПРЕОБРАЗУЕМ В УЗЛЫ ОДИН РАЗ (не на каждый горизонт)
        nodes = []
        seen_pickets = set()

        for pred in all_predictions:
            picket_info = self._resolve_picket_info(
                pred["entity_id"], entity_field
            )
            if picket_info and picket_info["picket"] not in seen_pickets:
                seen_pickets.add(picket_info["picket"])
                nodes.append(picket_info)

        # ОДИНАКОВЫЙ РЕЗУЛЬТАТ ДЛЯ ВСЕХ ГОРИЗОНТОВ МОДЕЛИ
        # (так как модель обучена на один горизонт)
        horizon_data = {
            "value": len(nodes),
            "severity": self.get_severity(len(nodes)),
            "nodes": nodes,
        }

        for horizon_hours in config["horizons_hours"]:
            horizons[str(horizon_hours)] = horizon_data

        # Для отсутствующих горизонтов возвращаем null
        all_horizons = {}
        for h in [1, 6, 24, 168, 720]:
            if str(h) in horizons:
                all_horizons[str(h)] = horizons[str(h)]
            else:
                all_horizons[str(h)] = None

        return {
            "id": config["forecast_type"],
            "period": config["period"],
            "title": config["title"],
            "horizons": all_horizons,
        }

    def build_forecast_response(self) -> dict:
        """Построение полного ответа для /api/forecast."""
        from ml.models import MLPrediction

        latest_prediction = (
            MLPrediction.objects.order_by("-created_at").values("created_at").first()
        )
        updated_at = (
            latest_prediction["created_at"]
            if latest_prediction
            else timezone.now()
        )

        # Предзагружаем кэш каналов ДО обработки моделей
        self._get_channel_cache()

        rows = []

        for model_name in MODEL_TO_FORECAST_MAP.keys():
            try:
                forecast_data = self.aggregate_forecast(model_name)

                existing = next(
                    (r for r in rows if r["id"] == forecast_data["id"]),
                    None,
                )

                if existing:
                    for horizon_key, horizon_data in forecast_data["horizons"].items():
                        if horizon_data is not None:
                            existing["horizons"][horizon_key] = horizon_data
                else:
                    rows.append(forecast_data)
            except Exception as e:
                logger.exception(f"Error aggregating forecast for {model_name}: {e}")
                continue

        return {
            "version": 1,
            "updatedAt": updated_at.strftime("%Y-%m-%dT%H:%M:%S.") + "000Z",
            "confidenceThreshold": self.DEFAULT_CONFIDENCE_THRESHOLD,
            "rows": rows,
        }