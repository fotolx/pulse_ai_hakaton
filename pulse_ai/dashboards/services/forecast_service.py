"""
Сервис агрегации прогнозов из результатов моделей машинного обучения.
"""
import logging
from datetime import datetime, timedelta
from typing import Optional

from django.utils import timezone

logger = logging.getLogger(__name__)


# Маппинг моделей на типы прогнозов для мобильного приложения
MODEL_TO_FORECAST_MAP = {
    "B1": {
        "forecast_type": "fire",
        "period": "short",
        "title": "Пожарный риск",
        "horizons_hours": [1, 6, 24],
    },
    "C1": {
        "forecast_type": "flooding",
        "period": "short",
        "title": "Риск затопления",
        "horizons_hours": [6, 24],
    },
    "A3": {
        "forecast_type": "channel-fault",
        "period": "short",
        "title": "Риск отказа канала",
        "horizons_hours": [24],
    },
    "A4": {
        "forecast_type": "system-fault",
        "period": "short",
        "title": "Риск отказа системы",
        "horizons_hours": [24],
    },
    "F1_7d": {
        "forecast_type": "preventive-repair",
        "period": "long",
        "title": "Необходимость предупредительного ремонта",
        "horizons_hours": [168],  # 7 дней
    },
    "F1_30d": {
        "forecast_type": "preventive-repair",
        "period": "long",
        "title": "Необходимость предупредительного ремонта",
        "horizons_hours": [720],  # 30 дней
    },
}


class ForecastAggregationService:
    """Сервис агрегации прогнозов из таблицы ml_predictions."""

    DEFAULT_CONFIDENCE_THRESHOLD = 0.58

    def get_severity(self, value: int, max_value: int = 3) -> str:
        """Определение серьёзности прогноза."""
        if value == 0:
            return "none"
        elif value == 1:
            return "normal"
        elif value == 2:
            return "warning"
        else:
            return "danger"

    def aggregate_forecast(
        self,
        model_name: str,
        threshold: Optional[float] = None,
    ) -> dict:
        """
        Агрегация прогнозов по модели.
        
        Возвращает словарь с горизонтами и пикетами, 
        где вероятность превышает порог.
        """
        from ml.models import MLPrediction
        from mobile_api.models import Picket
        
        if model_name not in MODEL_TO_FORECAST_MAP:
            raise ValueError(f"Unknown model: {model_name}")
        
        config = MODEL_TO_FORECAST_MAP[model_name]
        threshold = threshold or self.DEFAULT_CONFIDENCE_THRESHOLD
        
        horizons = {}
        
        # Получаем последние предсказания для каждого горизонта
        for horizon_hours in config["horizons_hours"]:
            horizon_key = str(horizon_hours)
            
            # Время прогноза: текущий час - горизонт
            # (так как предсказание делается на будущее)
            prediction_time = timezone.now() - timedelta(hours=horizon_hours)
            
            # Берём предсказания с высокой вероятностью
            predictions = MLPrediction.objects.filter(
                model_name=model_name,
                probability__gte=threshold,
                prediction_time__gte=prediction_time - timedelta(hours=1),
                prediction_time__lte=prediction_time + timedelta(hours=1),
            ).select_related("entity_id")
            
            nodes = []
            for pred in predictions:
                # entity_id может быть picket_key или maintenance_unit_key
                picket = Picket.objects.filter(
                    picket_id=str(pred.entity_id)
                ).first()
                
                if picket:
                    nodes.append({
                        "node": picket.picket_id,
                        "picket": picket.picket_id,
                        "district": picket.district,
                    })
            
            horizons[horizon_key] = {
                "value": len(nodes),
                "severity": self.get_severity(len(nodes)),
                "nodes": nodes,
            }
        
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
        """
        Построение полного ответа для /api/forecast.
        """
        from ml.models import MLPrediction
        
        # Получаем время последнего обновления прогнозов
        latest_prediction = MLPrediction.objects.order_by("-created_at").first()
        updated_at = latest_prediction.created_at if latest_prediction else timezone.now()
        
        rows = []
        
        # Агрегируем все типы прогнозов
        for model_name in MODEL_TO_FORECAST_MAP.keys():
            try:
                forecast_data = self.aggregate_forecast(model_name)
                
                # Объединяем прогнозы с одинаковым forecast_type
                existing = next(
                    (r for r in rows if r["id"] == forecast_data["id"]), None
                )
                
                if existing:
                    # Объединяем горизонты
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