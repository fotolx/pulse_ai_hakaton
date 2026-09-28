from django.db import models
from django.contrib.postgres.indexes import BrinIndex


class MLModelMetadata(models.Model):
    """Метаданные обученных моделей."""
    name = models.CharField(max_length=50, unique=True)  # A3, A4, B1...
    version = models.CharField(max_length=50)
    model_path = models.CharField(max_length=255)
    feature_count = models.IntegerField()
    trained_at = models.DateTimeField()
    metrics = models.JSONField(default=dict)  # ROC-AUC, PR-AUC и т.д.
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "ml_model_metadata"


class MLPrediction(models.Model):
    """Предсказания моделей."""
    entity_id = models.CharField(max_length=100)
    model_name = models.CharField(max_length=20)
    prediction_time = models.DateTimeField()
    probability = models.FloatField()
    label = models.SmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ml_predictions"
        indexes = [
            BrinIndex(fields=["prediction_time"]),
            models.Index(fields=["model_name", "prediction_time"]),
            models.Index(fields=["entity_id", "model_name"]),
        ]