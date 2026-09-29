from django.db import models
from django.contrib.postgres.indexes import BrinIndex

from .constants import EVENT_CATEGORIES


class ChannelKey(models.Model):
    """
    Справочник каналов: маппинг ид_канала_данных → ключи.
    Источник: channels_with_keys.csv
    """

    class Meta:
        db_table = "ml_channels_keys"
        verbose_name = "Ключ канала"
        verbose_name_plural = "Справочник ключей каналов"

    channel_id = models.BigIntegerField("ID канала данных", unique=True)
    object_id = models.BigIntegerField("ID объекта", null=True, blank=True)
    sensor_type = models.CharField("Тип датчика", max_length=255, db_index=True)
    sensor_name = models.CharField("Название датчика", max_length=255, blank=True, default="")
    engineering_system_type = models.CharField("Тип инженерной системы", max_length=255)
    picket_number = models.CharField("Номер пикета", max_length=50, blank=True, default="")

    channel_key = models.CharField("channel_key", max_length=100, unique=True)
    system_key = models.CharField("system_key", max_length=255, db_index=True)
    picket_key = models.CharField("picket_key", max_length=255, db_index=True)
    maintenance_unit_key = models.CharField("maintenance_unit_key", max_length=100, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.channel_key} ({self.sensor_type})"


class FaultEpisode(models.Model):
    """
    Реестр эпизодов отказов.
    Источник: fault_episode_registry.csv
    """

    class Meta:
        db_table = "ml_fault_episodes"
        indexes = [
            BrinIndex(fields=["episode_start_time"]),
            models.Index(fields=["channel_id", "episode_start_time"]),
            models.Index(fields=["episode_start_time", "episode_end_time"]),
        ]
        verbose_name = "Эпизод отказа"
        verbose_name_plural = "Реестр эпизодов отказов"

    episode_id = models.CharField("ID эпизода", max_length=100, unique=True)
    channel_id = models.BigIntegerField("ID канала данных", db_index=True)
    sensor_type = models.CharField("Тип датчика", max_length=255, blank=True, default="")

    episode_start_time = models.DateTimeField("Начало эпизода", db_index=True)
    episode_end_time = models.DateTimeField("Конец эпизода", null=True, blank=True)
    episode_duration_min = models.FloatField("Длительность (мин)", null=True, blank=True)

    fault_event_count = models.IntegerField("Число событий отказа", default=0)
    fault_values = models.TextField("Значения отказов", blank=True, default="")

    label_source = models.CharField("Источник разметки", max_length=100, blank=True, default="")
    rule_id = models.CharField("ID правила", max_length=100, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.episode_id} @ {self.episode_start_time}"


class EventValueDictionary(models.Model):
    """
    Справочник: значение датчика → категория события.
    Источник: event_value_dictionary_v1.csv
    """

    class Meta:
        db_table = "ml_event_value_dictionary"
        unique_together = ("sensor_type", "sensor_value")
        indexes = [
            models.Index(fields=["event_category", "is_active"]),
        ]
        verbose_name = "Значение датчика (справочник)"
        verbose_name_plural = "Справочник значений датчиков"

    sensor_type = models.CharField("Тип датчика", max_length=255, db_index=True)
    sensor_value = models.CharField("Значение датчика", max_length=255)
    event_category = models.CharField(
        "Категория события",
        max_length=20,
        choices=[(c, c) for c in EVENT_CATEGORIES],
    )
    label_source = models.CharField("Источник разметки", max_length=100, blank=True, default="")
    rule_id = models.CharField("ID правила", max_length=100, blank=True, default="")
    event_count = models.BigIntegerField("Число событий", default=0)
    alarm_count = models.BigIntegerField("Число тревог", default=0)
    channel_count = models.IntegerField("Число каналов", default=0)
    is_active = models.BooleanField("Активно", default=True)
    version = models.IntegerField("Версия справочника", default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.sensor_type}: {self.sensor_value!r} → {self.event_category}"


class MLModelMetadata(models.Model):
    """Метаданные обученных моделей."""

    class Meta:
        db_table = "ml_model_metadata"
        verbose_name = "Метаданные модели"
        verbose_name_plural = "Метаданные моделей"

    name = models.CharField("Код модели", max_length=20, unique=True)
    display_name = models.CharField("Название", max_length=255)
    file_path = models.CharField("Путь к файлу модели", max_length=500)
    engine = models.CharField("Движок", max_length=20)
    feature_count = models.IntegerField("Число признаков", default=0)
    granularity = models.CharField("Гранулярность", max_length=50)
    horizon_hours = models.IntegerField("Горизонт (часы)", null=True, blank=True)
    horizon_days = models.IntegerField("Горизонт (дни)", null=True, blank=True)
    trained_at = models.DateTimeField(null=True, blank=True)
    metrics = models.JSONField("Метрики", default=dict, blank=True)
    is_active = models.BooleanField("Активна", default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.display_name})"


class MLPrediction(models.Model):
    """Предсказания моделей."""

    class Meta:
        db_table = "ml_predictions"
        indexes = [
            BrinIndex(fields=["prediction_time"]),
            models.Index(fields=["model_name", "prediction_time"]),
            models.Index(fields=["entity_id", "model_name"]),
            models.Index(fields=["model_name", "label", "prediction_time"]),
        ]
        verbose_name = "Предсказание"
        verbose_name_plural = "Предсказания"

    entity_id = models.CharField("ID сущности", max_length=200, db_index=True)
    model_name = models.CharField("Модель", max_length=20, db_index=True)
    prediction_time = models.DateTimeField("Время прогноза", db_index=True)
    probability = models.FloatField("Вероятность")
    label = models.SmallIntegerField("Метка", default=0)
    features_snapshot = models.JSONField("Снимок признаков", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.model_name} | {self.entity_id} | {self.probability:.4f}"


class ForecastSnapshot(models.Model):
    """Агрегированный снимок прогноза для мобильного приложения."""

    class Meta:
        db_table = "ml_forecast_snapshots"
        indexes = [
            models.Index(fields=["forecast_type", "updated_at"]),
        ]
        verbose_name = "Снимок прогноза"
        verbose_name_plural = "Снимки прогнозов"

    forecast_type = models.CharField("Тип прогноза", max_length=50)
    period = models.CharField("Период", max_length=10)
    title = models.CharField("Заголовок", max_length=255)
    horizons = models.JSONField("Горизонты", default=dict)
    confidence_threshold = models.FloatField(default=0.58)
    version = models.IntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.forecast_type} v{self.version} @ {self.updated_at}"