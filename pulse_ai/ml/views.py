from datetime import datetime

from django.http import JsonResponse
from django.views import View

from pulse_ai.ml.predictors import PredictionService
from pulse_ai.ml.models import MLPrediction


class PredictionView(View):
    """
    GET /ml/predictions/?model=A3&entity_id=334775&limit=100
    """

    def get(self, request, *args, **kwargs):
        model_name = request.GET.get("model", "A3")
        entity_id = request.GET.get("entity_id")
        limit = int(request.GET.get("limit", 100))

        qs = MLPrediction.objects.filter(model_name=model_name)
        if entity_id:
            qs = qs.filter(entity_id=entity_id)
        
        predictions = qs.order_by("-prediction_time")[:limit]
        
        return JsonResponse({
            "model": model_name,
            "count": len(predictions),
            "items": [
                {
                    "entity_id": p.entity_id,
                    "prediction_time": p.prediction_time.isoformat(),
                    "probability": round(p.probability, 4),
                    "label": p.label,
                }
                for p in predictions
            ],
        }, status=200)


class PredictionOnDemandView(View):
    """
    POST /ml/predict-now/
    {"model": "A3", "entity_id": "334775"}
    """

    def post(self, request, *args, **kwargs):
        import json
        
        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON"}, status=400)
        
        model_name = body.get("model", "A3")
        entity_id = body.get("entity_id")
        
        try:
            service = PredictionService()
            prediction_time = datetime.now().replace(
                minute=0, second=0, microsecond=0
            )
            
            result = service.predict(
                model_name=model_name,
                prediction_time=prediction_time,
                entity_id=entity_id,
            )
            
            return JsonResponse({
                "model": model_name,
                "prediction_time": prediction_time.isoformat(),
                "items": result.to_dict(orient="records"),
            }, status=200)
        
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)