from django.db import migrations, models
import django.contrib.postgres.indexes


class Migration(migrations.Migration):
    initial = True
    dependencies = []

    operations = [
        # ─────────────────────────────────────────────────────────
        # ChannelKey
        # ─────────────────────────────────────────────────────────
        migrations.CreateModel(
            name="ChannelKey",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("channel_id", models.BigIntegerField(unique=True, verbose_name="ID канала данных")),
                ("object_id", models.BigIntegerField(blank=True, null=True, verbose_name="ID объекта")),
                ("sensor_type", models.CharField(max_length=255, db_index=True, verbose_name="Тип датчика")),
                ("sensor_name", models.CharField(blank=True, default="", max_length=255, verbose_name="Название датчика")),
                ("engineering_system_type", models.CharField(max_length=255, verbose_name="Тип инженерной системы")),
                ("picket_number", models.CharField(blank=True, default="", max_length=50, verbose_name="Номер пикета")),
                ("channel_key", models.CharField(max_length=100, unique=True, verbose_name="channel_key")),
                ("system_key", models.CharField(max_length=255, db_index=True, verbose_name="system_key")),
                ("picket_key", models.CharField(max_length=255, db_index=True, verbose_name="picket_key")),
                ("maintenance_unit_key", models.CharField(max_length=100, db_index=True, verbose_name="maintenance_unit_key")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "ml_channels_keys",
                "verbose_name": "Ключ канала",
                "verbose_name_plural": "Справочник ключей каналов",
            },
        ),

        # ─────────────────────────────────────────────────────────
        # FaultEpisode
        # ─────────────────────────────────────────────────────────
        migrations.CreateModel(
            name="FaultEpisode",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("episode_id", models.CharField(max_length=100, unique=True, verbose_name="ID эпизода")),
                ("channel_id", models.BigIntegerField(db_index=True, verbose_name="ID канала данных")),
                ("sensor_type", models.CharField(blank=True, default="", max_length=255, verbose_name="Тип датчика")),
                ("episode_start_time", models.DateTimeField(db_index=True, verbose_name="Начало эпизода")),
                ("episode_end_time", models.DateTimeField(blank=True, null=True, verbose_name="Конец эпизода")),
                ("episode_duration_min", models.FloatField(blank=True, null=True, verbose_name="Длительность (мин)")),
                ("fault_event_count", models.IntegerField(default=0, verbose_name="Число событий отказа")),
                ("fault_values", models.TextField(blank=True, default="", verbose_name="Значения отказов")),
                ("label_source", models.CharField(blank=True, default="", max_length=100, verbose_name="Источник разметки")),
                ("rule_id", models.CharField(blank=True, default="", max_length=100, verbose_name="ID правила")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "ml_fault_episodes",
                "verbose_name": "Эпизод отказа",
                "verbose_name_plural": "Реестр эпизодов отказов",
            },
        ),
        # ВАЖНО: добавлен параметр name
        migrations.AddIndex(
            model_name="FaultEpisode",
            index=django.contrib.postgres.indexes.BrinIndex(
                fields=["episode_start_time"],
                name="idx_fault_episodes_start_brin",
            ),
        ),
        migrations.AddIndex(
            model_name="FaultEpisode",
            index=models.Index(
                fields=["channel_id", "episode_start_time"],
                name="idx_fault_episodes_channel_start",
            ),
        ),
        migrations.AddIndex(
            model_name="FaultEpisode",
            index=models.Index(
                fields=["episode_start_time", "episode_end_time"],
                name="idx_fault_episodes_time_range",
            ),
        ),

        # ─────────────────────────────────────────────────────────
        # EventValueDictionary
        # ─────────────────────────────────────────────────────────
        migrations.CreateModel(
            name="EventValueDictionary",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("sensor_type", models.CharField(max_length=255, db_index=True, verbose_name="Тип датчика")),
                ("sensor_value", models.CharField(max_length=255, verbose_name="Значение датчика")),
                ("event_category", models.CharField(max_length=20, verbose_name="Категория события")),
                ("label_source", models.CharField(blank=True, default="", max_length=100)),
                ("rule_id", models.CharField(blank=True, default="", max_length=100)),
                ("event_count", models.BigIntegerField(default=0)),
                ("alarm_count", models.BigIntegerField(default=0)),
                ("channel_count", models.IntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("version", models.IntegerField(default=1)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "ml_event_value_dictionary",
                "unique_together": {("sensor_type", "sensor_value")},
                "verbose_name": "Значение датчика (справочник)",
                "verbose_name_plural": "Справочник значений датчиков",
            },
        ),
        migrations.AddIndex(
            model_name="EventValueDictionary",
            index=models.Index(
                fields=["event_category", "is_active"],
                name="idx_event_dict_cat_active",
            ),
        ),

        # ─────────────────────────────────────────────────────────
        # MLModelMetadata
        # ─────────────────────────────────────────────────────────
        migrations.CreateModel(
            name="MLModelMetadata",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=20, unique=True)),
                ("display_name", models.CharField(max_length=255)),
                ("file_path", models.CharField(max_length=500)),
                ("engine", models.CharField(max_length=20)),
                ("feature_count", models.IntegerField(default=0)),
                ("granularity", models.CharField(max_length=50)),
                ("horizon_hours", models.IntegerField(blank=True, null=True)),
                ("horizon_days", models.IntegerField(blank=True, null=True)),
                ("trained_at", models.DateTimeField(blank=True, null=True)),
                ("metrics", models.JSONField(blank=True, default=dict)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "ml_model_metadata",
                "verbose_name": "Метаданные модели",
                "verbose_name_plural": "Метаданные моделей",
            },
        ),

        # ─────────────────────────────────────────────────────────
        # MLPrediction
        # ─────────────────────────────────────────────────────────
        migrations.CreateModel(
            name="MLPrediction",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("entity_id", models.CharField(max_length=200, db_index=True)),
                ("model_name", models.CharField(max_length=20, db_index=True)),
                ("prediction_time", models.DateTimeField(db_index=True)),
                ("probability", models.FloatField()),
                ("label", models.SmallIntegerField(default=0)),
                ("features_snapshot", models.JSONField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "ml_predictions",
                "verbose_name": "Предсказание",
                "verbose_name_plural": "Предсказания",
            },
        ),
        # ВАЖНО: добавлен параметр name
        migrations.AddIndex(
            model_name="MLPrediction",
            index=django.contrib.postgres.indexes.BrinIndex(
                fields=["prediction_time"],
                name="idx_ml_predictions_time_brin",
            ),
        ),
        migrations.AddIndex(
            model_name="MLPrediction",
            index=models.Index(
                fields=["model_name", "prediction_time"],
                name="idx_ml_predictions_model_time",
            ),
        ),
        migrations.AddIndex(
            model_name="MLPrediction",
            index=models.Index(
                fields=["entity_id", "model_name"],
                name="idx_ml_predictions_entity_model",
            ),
        ),
        migrations.AddIndex(
            model_name="MLPrediction",
            index=models.Index(
                fields=["model_name", "label", "prediction_time"],
                name="idx_ml_predictions_model_label_time",
            ),
        ),

        # ─────────────────────────────────────────────────────────
        # ForecastSnapshot
        # ─────────────────────────────────────────────────────────
        migrations.CreateModel(
            name="ForecastSnapshot",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("forecast_type", models.CharField(max_length=50)),
                ("period", models.CharField(max_length=10)),
                ("title", models.CharField(max_length=255)),
                ("horizons", models.JSONField(default=dict)),
                ("confidence_threshold", models.FloatField(default=0.58)),
                ("version", models.IntegerField(default=1)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "ml_forecast_snapshots",
                "verbose_name": "Снимок прогноза",
                "verbose_name_plural": "Снимки прогнозов",
            },
        ),
        migrations.AddIndex(
            model_name="ForecastSnapshot",
            index=models.Index(
                fields=["forecast_type", "updated_at"],
                name="idx_forecast_type_updated",
            ),
        ),
    ]