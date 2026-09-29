"""
Ручной запуск моделей предсказания.

Примеры использования:
    # Запуск одной модели
    python manage.py run_prediction --model A3
    
    # Запуск всех ежечасных моделей
    python manage.py run_prediction --all-hourly
    
    # Запуск с конкретным временем (для тестирования)
    python manage.py run_prediction --model A3 --time "2026-09-28 14:00"
    
    # Принудительный запуск (игнорирует проверку идемпотентности)
    python manage.py run_prediction --model A3 --force
    
    # Только сбор признаков без предсказания (для отладки)
    python manage.py run_prediction --model A3 --dry-run
"""
import logging
from datetime import datetime

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from ml.constants import MODEL_REGISTRY

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Ручной запуск моделей предсказания"

    def add_arguments(self, parser):
        parser.add_argument(
            "--model",
            type=str,
            choices=list(MODEL_REGISTRY.keys()),
            help="Код модели для запуска (A3, A4, B1, C1, F1_7d, F1_30d)",
        )
        parser.add_argument(
            "--all-hourly",
            action="store_true",
            help="Запустить все ежечасные модели",
        )
        parser.add_argument(
            "--all",
            action="store_true",
            help="Запустить все модели",
        )
        parser.add_argument(
            "--time",
            type=str,
            help="Время предсказания в формате 'YYYY-MM-DD HH:MM' (по умолчанию текущее)",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Принудительный запуск, игнорируя проверку идемпотентности",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Только сбор признаков, без предсказания и сохранения",
        )
        parser.add_argument(
            "--async",
            action="store_true",
            dest="asynchronous",
            help="Запустить через Celery (асинхронно), а не синхронно",
        )

    def handle(self, *args, **options):
        model_name = options.get("model")
        all_hourly = options.get("all_hourly")
        all_models = options.get("all")
        force = options.get("force")
        dry_run = options.get("dry_run")
        asynchronous = options.get("asynchronous")

        if not model_name and not all_hourly and not all_models:
            raise CommandError(
                "Укажите --model, --all-hourly или --all"
            )

        # Определяем время предсказания
        if options.get("time"):
            try:
                prediction_time = datetime.strptime(
                    options["time"], "%Y-%m-%d %H:%M"
                )
                prediction_time = timezone.make_aware(prediction_time)
            except ValueError:
                raise CommandError(
                    "Неверный формат времени. Используйте 'YYYY-MM-DD HH:MM'"
                )
        else:
            prediction_time = self._find_last_active_hour()
            self.stdout.write(f"Автоматически выбран час: {prediction_time}")

        # Определяем список моделей для запуска
        if all_models:
            models_to_run = list(MODEL_REGISTRY.keys())
        elif all_hourly:
            models_to_run = [
                name for name, cfg in MODEL_REGISTRY.items()
                if cfg.get("schedule") == "hourly"
            ]
        else:
            models_to_run = [model_name]

        self.stdout.write(f"Модели для запуска: {', '.join(models_to_run)}")
        self.stdout.write(f"Время предсказания: {prediction_time}")
        self.stdout.write(f"Режим: {'асинхронный' if asynchronous else 'синхронный'}")
        self.stdout.write("-" * 60)

        # Запуск моделей
        for model in models_to_run:
            try:
                if asynchronous:
                    # Асинхронный запуск через Celery
                    from ml.tasks import run_hourly_prediction, run_daily_models
                    
                    if model in ("F1_7d", "F1_30d"):
                        task = run_daily_models.delay(force)
                    else:
                        task = run_hourly_prediction.delay(model, force)
                    
                    self.stdout.write(self.style.SUCCESS(
                        f"✓ {model}: задача поставлена в очередь (task_id={task.id})"
                    ))
                else:
                    # Синхронный запуск
                    result = self._run_model_sync(
                        model, prediction_time, force, dry_run
                    )
                    
                    if result["status"] == "success":
                        self.stdout.write(self.style.SUCCESS(
                            f"✓ {model}: сохранено {result['predictions']} предсказаний"
                        ))
                    elif result["status"] == "skipped_exists":
                        self.stdout.write(self.style.WARNING(
                            f"⊘ {model}: предсказание уже существует (используйте --force)"
                        ))
                    elif result["status"] == "no_data":
                        self.stdout.write(self.style.WARNING(
                            f"⊘ {model}: нет данных для предсказания"
                        ))
                    elif result["status"] == "dry_run":
                        self.stdout.write(self.style.SUCCESS(
                            f"✓ {model}: собрано {result['features']} строк признаков (dry-run)"
                        ))

            except Exception as e:
                logger.exception(f"Ошибка запуска {model}")
                self.stdout.write(self.style.ERROR(f"✗ {model}: {e}"))

    def _find_last_active_hour(self) -> datetime:
        """Находит последний час, в котором есть события."""
        from django.db import connections
        
        sql = """
        SELECT DATE_TRUNC('hour', MAX(occurred_at)) AS last_hour
        FROM dashboards_sensorevent
        """
        
        with connections["direct"].cursor() as cursor:
            cursor.execute(sql)
            row = cursor.fetchone()
            return row[0] if row and row[0] else timezone.now().replace(
                minute=0, second=0, microsecond=0
            )

    def _run_model_sync(
        self,
        model_name: str,
        prediction_time: datetime,
        force: bool,
        dry_run: bool,
    ) -> dict:
        """Синхронный запуск модели."""
        from ml.services.feature_engineering import (
            build_a3_features,
            build_a4_features,
            build_b1_features,
            build_c1_features,
            build_f1_features,
        )
        from ml.services.predictor import predict, save_predictions
        from ml.models import MLPrediction

        # Проверка идемпотентности
        if not force and not dry_run:
            exists = MLPrediction.objects.filter(
                model_name=model_name,
                prediction_time=prediction_time,
            ).exists()
            if exists:
                return {"status": "skipped_exists"}

        # Сбор признаков
        builders = {
            "A3": lambda t: build_a3_features(t),
            "A4": lambda t: build_a4_features(t),
            "B1": lambda t: build_b1_features(t),
            "C1": lambda t: build_c1_features(t),
            "F1_7d": lambda t: build_f1_features(t),
            "F1_30d": lambda t: build_f1_features(t),
        }

        if model_name not in builders:
            raise CommandError(f"Неизвестная модель: {model_name}")

        self.stdout.write(f"  Сбор признаков для {model_name}...")
        features_df = builders[model_name](prediction_time)

        if features_df.empty:
            return {"status": "no_data"}

        if dry_run:
            return {"status": "dry_run", "features": len(features_df)}

        # Предсказание
        self.stdout.write(f"  Выполнение предсказания...")
        predictions = predict(model_name, features_df, prediction_time)

        # Сохранение
        self.stdout.write(f"  Сохранение результатов...")
        saved = save_predictions(predictions)

        # Обновление снимка
        from ml.tasks import update_forecast_snapshot
        update_forecast_snapshot(model_name)

        return {"status": "success", "predictions": saved}