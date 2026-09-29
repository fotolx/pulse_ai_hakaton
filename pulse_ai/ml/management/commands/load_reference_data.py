"""
Загрузка справочников:
- channels_with_keys.csv → ml_channels_keys
- fault_episode_registry.csv → ml_fault_episodes
- event_value_dictionary_v1.csv → ml_event_value_dictionary
"""
import csv
import logging
from pathlib import Path

import pandas as pd
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Count

from ml.models import ChannelKey, FaultEpisode, EventValueDictionary

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Загрузка справочников: каналы, эпизоды отказов, значения датчиков"

    def add_arguments(self, parser):
        parser.add_argument(
            "--channels-csv",
            type=str,
            required=True,
            help="Путь к channels_with_keys.csv",
        )
        parser.add_argument(
            "--episodes-csv",
            type=str,
            required=True,
            help="Путь к fault_episode_registry.csv",
        )
        parser.add_argument(
            "--event-dict-csv",
            type=str,
            required=True,
            help="Путь к event_value_dictionary_v1.csv",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Удалить существующие записи перед загрузкой",
        )

    def handle(self, *args, **options):
        channels_path = Path(options["channels_csv"])
        episodes_path = Path(options["episodes_csv"])
        event_dict_path = Path(options["event_dict_csv"])

        for p in [channels_path, episodes_path, event_dict_path]:
            if not p.exists():
                raise CommandError(f"Файл не найден: {p}")

        if options["clear"]:
            self.stdout.write(self.style.WARNING("Удаление существующих записей..."))
            ChannelKey.objects.all().delete()
            FaultEpisode.objects.all().delete()
            EventValueDictionary.objects.all().delete()

        # ════════════════════════════════════════════════════════
        # 1. Загрузка channels_with_keys.csv
        # ════════════════════════════════════════════════════════
        self.stdout.write("\n[1/3] Загрузка channels_with_keys.csv...")
        channels_df = pd.read_csv(
            channels_path, sep=";", encoding="utf-8-sig", dtype="string"
        )
        self.stdout.write(f"  Строк в файле: {len(channels_df)}")

        created_channels = 0
        batch = []
        batch_size = 5000

        with transaction.atomic():
            for _, row in channels_df.iterrows():
                try:
                    batch.append(ChannelKey(
                        channel_id=int(row["ид_канала_данных"]),
                        object_id=int(row["ид_объект"]) if pd.notna(row.get("ид_объект")) else None,
                        sensor_type=str(row.get("тип_датчика", "")),
                        sensor_name=str(row.get("название_датчика", "")),
                        engineering_system_type=str(row.get("тип_инж_системы", "")),
                        picket_number=str(row.get("номер_пикета", "")),
                        channel_key=str(row["channel_key"]),
                        system_key=str(row["system_key"]),
                        picket_key=str(row["picket_key"]),
                        maintenance_unit_key=str(row["maintenance_unit_key"]),
                    ))

                    if len(batch) >= batch_size:
                        ChannelKey.objects.bulk_create(batch, ignore_conflicts=True)
                        created_channels += len(batch)
                        batch = []
                except Exception as e:
                    self.stderr.write(self.style.WARNING(
                        f"  ⚠ Ошибка канала {row.get('ид_канала_данных')}: {e}"
                    ))

            if batch:
                ChannelKey.objects.bulk_create(batch, ignore_conflicts=True)
                created_channels += len(batch)

        self.stdout.write(self.style.SUCCESS(f"  Загружено каналов: {created_channels}"))

        # ════════════════════════════════════════════════════════
        # 2. Загрузка fault_episode_registry.csv
        # ════════════════════════════════════════════════════════
        self.stdout.write("\n[2/3] Загрузка fault_episode_registry.csv...")
        episodes_df = pd.read_csv(
            episodes_path, sep=";", encoding="utf-8-sig", dtype="string"
        )
        self.stdout.write(f"  Строк в файле: {len(episodes_df)}")

        # Приведение типов
        episodes_df["episode_start_time"] = pd.to_datetime(episodes_df["episode_start_time"])
        episodes_df["episode_end_time"] = pd.to_datetime(episodes_df["episode_end_time"], errors="coerce")
        episodes_df["episode_duration_min"] = pd.to_numeric(episodes_df["episode_duration_min"], errors="coerce")
        episodes_df["fault_event_count"] = pd.to_numeric(episodes_df["fault_event_count"], errors="coerce").fillna(0).astype(int)

        created_episodes = 0
        batch = []

        with transaction.atomic():
            for _, row in episodes_df.iterrows():
                try:
                    batch.append(FaultEpisode(
                        episode_id=str(row["fault_episode_id"]),
                        channel_id=int(row["ид_канала_данных"]),
                        sensor_type=str(row.get("тип_датчика", "")),
                        episode_start_time=row["episode_start_time"],
                        episode_end_time=row["episode_end_time"] if pd.notna(row["episode_end_time"]) else None,
                        episode_duration_min=float(row["episode_duration_min"]) if pd.notna(row["episode_duration_min"]) else None,
                        fault_event_count=int(row["fault_event_count"]),
                        fault_values=str(row.get("fault_values", "")),
                        label_source=str(row.get("label_source", "")),
                        rule_id=str(row.get("rule_id", "")),
                    ))

                    if len(batch) >= batch_size:
                        FaultEpisode.objects.bulk_create(batch, ignore_conflicts=True)
                        created_episodes += len(batch)
                        batch = []
                except Exception as e:
                    self.stderr.write(self.style.WARNING(
                        f"  ⚠ Ошибка эпизода {row.get('fault_episode_id')}: {e}"
                    ))

            if batch:
                FaultEpisode.objects.bulk_create(batch, ignore_conflicts=True)
                created_episodes += len(batch)

        self.stdout.write(self.style.SUCCESS(f"  Загружено эпизодов: {created_episodes}"))

        # ════════════════════════════════════════════════════════
        # 3. Загрузка event_value_dictionary_v1.csv
        # ════════════════════════════════════════════════════════
        self.stdout.write("\n[3/3] Загрузка event_value_dictionary_v1.csv...")
        event_df = pd.read_csv(
            event_dict_path, sep=";", encoding="utf-8-sig", dtype="string"
        )
        self.stdout.write(f"  Строк в файле: {len(event_df)}")

        event_df["event_count"] = pd.to_numeric(event_df["event_count"], errors="coerce").fillna(0).astype(int)
        event_df["alarm_count"] = pd.to_numeric(event_df["alarm_count"], errors="coerce").fillna(0).astype(int)
        event_df["channel_count"] = pd.to_numeric(event_df["channel_count"], errors="coerce").fillna(0).astype(int)

        created_events = 0
        batch = []

        with transaction.atomic():
            for _, row in event_df.iterrows():
                try:
                    category = str(row.get("event_category", "unknown")).strip().lower()
                    if category not in ("fault", "warning", "detection", "normal", "unknown"):
                        category = "unknown"

                    batch.append(EventValueDictionary(
                        sensor_type=str(row.get("тип_датчика", "")),
                        sensor_value=str(row.get("значение_датчика", "")),
                        event_category=category,
                        label_source=str(row.get("label_source", "")),
                        rule_id=str(row.get("rule_id", "")),
                        event_count=int(row["event_count"]),
                        alarm_count=int(row["alarm_count"]),
                        channel_count=int(row["channel_count"]),
                        is_active=True,
                        version=1,
                    ))

                    if len(batch) >= batch_size:
                        EventValueDictionary.objects.bulk_create(batch, ignore_conflicts=True)
                        created_events += len(batch)
                        batch = []
                except Exception as e:
                    self.stderr.write(self.style.WARNING(f"  ⚠ Ошибка: {e}"))

            if batch:
                EventValueDictionary.objects.bulk_create(batch, ignore_conflicts=True)
                created_events += len(batch)

        self.stdout.write(self.style.SUCCESS(f"  Загружено значений датчиков: {created_events}"))

        # ════════════════════════════════════════════════════════
        # Итоговая статистика
        # ════════════════════════════════════════════════════════
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.SUCCESS("=== ИТОГОВАЯ СТАТИСТИКА ==="))
        self.stdout.write(f"Каналов: {ChannelKey.objects.count()}")
        self.stdout.write(f"Эпизодов отказов: {FaultEpisode.objects.count()}")
        self.stdout.write(f"Значений датчиков: {EventValueDictionary.objects.count()}")
        self.stdout.write(f"Уникальных систем: {ChannelKey.objects.values('system_key').distinct().count()}")
        self.stdout.write(f"Уникальных пикетов: {ChannelKey.objects.values('picket_key').distinct().count()}")

        # Распределение по категориям
        stats = (
            EventValueDictionary.objects
            .values("event_category")
            .annotate(cnt=Count("id"))
        )
        self.stdout.write("\nРаспределение значений датчиков по категориям:")
        for s in stats:
            self.stdout.write(f"  {s['event_category']}: {s['cnt']}")