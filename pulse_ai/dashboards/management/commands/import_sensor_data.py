"""
Импорт данных из четырёх CSV в модели dashboards.

Использование:
    python manage.py import_sensor_data --dir /path/to/csv_folder

Журнал (journal) грузится ПОТОКОВО чанками через pandas(chunksize=...) —
рассчитано на десятки миллионов строк без раздутия памяти процесса.
Справочники (объекты/каналы/состояния) читаются целиком — они маленькие
(десятки-тысячи строк), стриминг для них избыточен.

Флаги:
    --dir DIR           папка с CSV (по умолчанию текущая)
    --skip-dicts         не перезагружать справочники, только журнал
    --no-truncate        не очищать таблицу событий перед загрузкой
                          (для инкрементальной догрузки новых файлов)
    --chunk-size N        сколько строк CSV читать за один чанк (по умолчанию 50000)
    --progress-every N     печатать прогресс раз в N чанков (по умолчанию 20)

Порядок загрузки важен: объекты -> каналы -> состояния -> журнал,
т.к. каналы ссылаются на объекты, а журнал — на каналы.

Запуск на большом файле:
docker compose exec web python manage.py import_sensor_data \
  --dir /usr/src/app/media/uploads \
  --chunk-size 50000 \
  --progress-every 10

"""
from datetime import datetime

import pandas as pd
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from dashboards.models import DispatchObject, SensorChannel, SensorEvent, SensorState

DICT_BATCH_SIZE = 2000
JOURNAL_CHUNK_SIZE_DEFAULT = 50_000
JOURNAL_INSERT_BATCH_SIZE = 5_000
PROGRESS_EVERY_DEFAULT = 20

# Переименовываем колонки в ASCII сразу после чтения чанка — избегаем
# любых сюрпризов с кириллическими именами атрибутов в itertuples()
# и делаем код независимым от точного написания заголовков в CSV.
JOURNAL_COLUMN_MAP = {
    "ид_события": "event_id",
    "ид_канала_данных": "channel_id",
    "дата": "date",
    "время": "time",
    "тревожное": "alarm",
    "значение_датчика": "value",
}


def _to_bool_tf(value):
    """Преобразует 't'/'f' (в любом регистре) в bool. Прочее — по правде Python."""
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("t", "true", "1", "да")


class Command(BaseCommand):
    help = "Импортирует справочники объектов/каналов/состояний и журнал событий из CSV"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dir", default=".", help="Папка, где лежат CSV-файлы (по умолчанию текущая)"
        )
        parser.add_argument("--objects", default="справочник_объектов_диспетчер.csv")
        parser.add_argument("--channels", default="справочник_каналов_датчиков.csv")
        parser.add_argument("--states", default="справочник_состояний.csv")
        parser.add_argument("--journal", default="journal.csv")
        parser.add_argument(
            "--skip-dicts",
            action="store_true",
            help="Не перезагружать справочники (объекты/каналы/состояния), только журнал",
        )
        parser.add_argument(
            "--no-truncate",
            action="store_true",
            help="Не очищать таблицу событий перед загрузкой (для инкрементальной догрузки)",
        )
        parser.add_argument(
            "--chunk-size",
            type=int,
            default=JOURNAL_CHUNK_SIZE_DEFAULT,
            help=f"Сколько строк CSV читать за один чанк (по умолчанию {JOURNAL_CHUNK_SIZE_DEFAULT})",
        )
        parser.add_argument(
            "--progress-every",
            type=int,
            default=PROGRESS_EVERY_DEFAULT,
            help=f"Печатать прогресс раз в N чанков (по умолчанию {PROGRESS_EVERY_DEFAULT})",
        )

    def handle(self, *args, **options):
        base = options["dir"].rstrip("/")

        if not options["skip_dicts"]:
            self.import_objects(f"{base}/{options['objects']}")
            self.import_channels(f"{base}/{options['channels']}")
            self.import_states(f"{base}/{options['states']}")
        else:
            self.stdout.write("Справочники пропущены (--skip-dicts)")

        self.import_journal_streaming(
            f"{base}/{options['journal']}",
            chunk_size=options["chunk_size"],
            truncate=not options["no_truncate"],
            progress_every=options["progress_every"],
        )

        self.stdout.write(self.style.SUCCESS("Импорт завершён успешно."))

    # ------------------------------------------------------------------ #
    # Справочник объектов (двухпроходная загрузка из-за self-FK "родитель")
    # ------------------------------------------------------------------ #
    def import_objects(self, path):
        try:
            df = pd.read_csv(path, encoding="utf-8")
        except FileNotFoundError:
            raise CommandError(f"Файл не найден: {path}")

        self.stdout.write(f"Объекты: читаю {len(df)} строк из {path}")

        objects = [
            DispatchObject(
                id=row["ид_объект"],
                hierarchy_level=row["иерархия_уровень"],
                kind=row["вид_объекта"],
                dispatcher_name=row["диспетчерское_название_объекта"],
                parent=None,
            )
            for _, row in df.iterrows()
        ]
        with transaction.atomic():
            DispatchObject.objects.all().delete()
            DispatchObject.objects.bulk_create(objects, batch_size=DICT_BATCH_SIZE)

        existing_ids = set(DispatchObject.objects.values_list("id", flat=True))
        missing_parents = set()
        to_update = []
        for _, row in df.iterrows():
            parent_id = row["родитель"]
            if parent_id in existing_ids:
                to_update.append(DispatchObject(id=row["ид_объект"], parent_id=parent_id))
            elif pd.notna(parent_id):
                missing_parents.add(parent_id)

        DispatchObject.objects.bulk_update(to_update, ["parent"], batch_size=DICT_BATCH_SIZE)

        if missing_parents:
            self.stdout.write(
                self.style.WARNING(
                    f"  Пропущено {len(missing_parents)} ссылок на несуществующего "
                    f"родителя (id: {sorted(missing_parents)[:20]}...)"
                )
            )
        self.stdout.write(self.style.SUCCESS(f"  Загружено объектов: {len(objects)}"))

    # ------------------------------------------------------------------ #
    def import_channels(self, path):
        try:
            df = pd.read_csv(path, encoding="utf-8")
        except FileNotFoundError:
            raise CommandError(f"Файл не найден: {path}")

        self.stdout.write(f"Каналы: читаю {len(df)} строк из {path}")

        existing_object_ids = set(DispatchObject.objects.values_list("id", flat=True))
        channels = []
        skipped = 0
        for _, row in df.iterrows():
            object_id = row["ид_объект"]
            if object_id not in existing_object_ids:
                skipped += 1
                continue
            channels.append(
                SensorChannel(
                    id=row["ид_канала_данных"],
                    engineering_system_type=row["тип_инж_системы"],
                    sensor_type=row["тип_датчика"],
                    engineering_system_tag=row["тег_инженерной_системы"],
                    sensor_name=row["название_датчика"],
                    dispatch_object_id=object_id,
                )
            )

        with transaction.atomic():
            SensorChannel.objects.all().delete()
            SensorChannel.objects.bulk_create(channels, batch_size=DICT_BATCH_SIZE)

        if skipped:
            self.stdout.write(
                self.style.WARNING(f"  Пропущено {skipped} каналов — не найден объект")
            )
        self.stdout.write(self.style.SUCCESS(f"  Загружено каналов: {len(channels)}"))

    # ------------------------------------------------------------------ #
    def import_states(self, path):
        try:
            df = pd.read_csv(path, encoding="utf-8")
        except FileNotFoundError:
            raise CommandError(f"Файл не найден: {path}")

        self.stdout.write(f"Состояния: читаю {len(df)} строк из {path}")

        before = len(df)
        df = df.drop_duplicates(
            subset=["тип_датчика", "ид_набор_состояний", "название_состояния"]
        )
        dropped = before - len(df)
        if dropped:
            self.stdout.write(
                self.style.WARNING(
                    f"  В справочнике состояний {dropped} дублирующихся строк "
                    f"(одинаковые тип_датчика + ид_набор_состояний + название_состояния) — пропущены"
                )
            )

        states = [
            SensorState(
                sensor_type=row["тип_датчика"],
                state_set_id=row["ид_набор_состояний"],
                name=row["название_состояния"],
                is_alarm=_to_bool_tf(row["тревожное"]),
            )
            for _, row in df.iterrows()
        ]
        with transaction.atomic():
            SensorState.objects.all().delete()
            SensorState.objects.bulk_create(states, batch_size=DICT_BATCH_SIZE)

        self.stdout.write(self.style.SUCCESS(f"  Загружено состояний: {len(states)}"))

    # ------------------------------------------------------------------ #
    # Журнал — потоковая загрузка чанками, без накопления в памяти
    # ------------------------------------------------------------------ #
    def import_journal_streaming(self, path, chunk_size, truncate, progress_every):
        if truncate:
            self.stdout.write("Журнал: очищаю таблицу dashboards_sensorevent (TRUNCATE)...")
            with connection.cursor() as cursor:
                cursor.execute("TRUNCATE TABLE dashboards_sensorevent")

        self.stdout.write(
            f"Журнал: потоковая загрузка из {path} (чанк {chunk_size} строк)..."
        )

        # Набор существующих id каналов кэшируем один раз — не бьём БД на каждый чанк
        existing_channel_ids = set(SensorChannel.objects.values_list("id", flat=True))

        total_read = 0
        total_inserted_or_ignored = 0
        total_skipped_channel = 0

        try:
            reader = pd.read_csv(path, encoding="utf-8", chunksize=chunk_size)
        except FileNotFoundError:
            raise CommandError(f"Файл не найден: {path}")

        for chunk_number, chunk in enumerate(reader, start=1):
            chunk = chunk.rename(columns=JOURNAL_COLUMN_MAP)

            batch = []
            for row in chunk.itertuples(index=False):
                channel_id = row.channel_id
                if channel_id not in existing_channel_ids:
                    total_skipped_channel += 1
                    continue
                occurred_at = datetime.strptime(f"{row.date} {row.time}", "%Y-%m-%d %H:%M:%S")
                batch.append(
                    SensorEvent(
                        source_event_id=row.event_id,
                        channel_id=channel_id,
                        occurred_at=occurred_at,
                        is_alarm=_to_bool_tf(row.alarm),
                        raw_value=str(row.value),
                    )
                )

            total_read += len(chunk)

            # Вставляем сам чанк под-батчами — так пиковое потребление памяти
            # на вставку не растёт вместе с размером чанка
            for i in range(0, len(batch), JOURNAL_INSERT_BATCH_SIZE):
                sub_batch = batch[i : i + JOURNAL_INSERT_BATCH_SIZE]
                with transaction.atomic():
                    SensorEvent.objects.bulk_create(
                        sub_batch,
                        batch_size=JOURNAL_INSERT_BATCH_SIZE,
                        ignore_conflicts=True,
                    )
                total_inserted_or_ignored += len(sub_batch)

            if chunk_number % progress_every == 0:
                self.stdout.write(
                    f"  чанк {chunk_number}: прочитано строк {total_read}, "
                    f"вставлено/проигнорировано как дубль {total_inserted_or_ignored}"
                )

        if total_skipped_channel:
            self.stdout.write(
                self.style.WARNING(
                    f"  Пропущено {total_skipped_channel} событий — не найден канал"
                )
            )
        self.stdout.write(
            self.style.SUCCESS(
                f"  Журнал загружен: обработано строк {total_read}, "
                f"вставлено/проигнорировано {total_inserted_or_ignored}"
            )
        )