from django.db import models
from django.utils import timezone

def user_directory_path(instance, filename):
    return 'saved_models/user_{0}/%Y-%m-%d-%H-%M-%S-{1}'.format(instance.user.id, filename)

# class SavedModel(models.Model):
#     timestamp = models.DateTimeField(default=timezone.now)
#     name = models.CharField(max_length=100)
#     description = models.TextField(default="", blank=True)
#     accuracy = models.FloatField(default=0.0)
#     model_file = models.FileField(upload_to=user_directory_path, max_length=255)
#     metadata_file = models.FileField(upload_to=user_directory_path, max_length=255)
#     def __str__(self):
#         return self.timestamp.__str__()+" - "+self.name

"""
Модели построены по четырём выгрузкам:

  - справочник_объектов_диспетчер.csv      -> DispatchObject
  - справочник_каналов_датчиков_new.csv    -> SensorChannel
  - справочник_состоянии_.csv              -> SensorState
  - journal_2025_unique.csv                -> SensorEvent

Важное упрощение: в справочнике каналов НЕТ поля "ид_набор_состояний",
поэтому строго связать конкретный канал с конкретным набором состояний
по данным из выгрузок нельзя — SensorState остаётся отдельным
справочником-lookup'ом (используется по текстовому совпадению
sensor_type в коде, а не через ForeignKey).
"""

class DispatchObject(models.Model):
    """Справочник объектов диспетчеризации (иерархия объектов)."""

    OBJECT_KIND_CHOICES = [
        ("controlHouse", "Диспетчерский пункт / шкаф управления"),
        ("guardObject", "Охраняемый объект"),
    ]

    id = models.BigIntegerField(
        primary_key=True, verbose_name="ID объекта (ид_объект)"
    )
    hierarchy_level = models.PositiveSmallIntegerField(
        verbose_name="Уровень иерархии"
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
        verbose_name="Родительский объект",
    )
    kind = models.CharField(
        max_length=32,
        choices=OBJECT_KIND_CHOICES,
        verbose_name="Вид объекта",
    )
    dispatcher_name = models.CharField(
        max_length=255, verbose_name="Диспетчерское название объекта"
    )

    class Meta:
        verbose_name = "Объект диспетчеризации"
        verbose_name_plural = "Справочник объектов диспетчеризации"
        indexes = [
            models.Index(fields=["parent"]),
            models.Index(fields=["kind"]),
        ]

    def __str__(self):
        return self.dispatcher_name


class SensorChannel(models.Model):
    """Справочник каналов датчиков."""

    id = models.BigIntegerField(
        primary_key=True, verbose_name="ID канала данных (ид_канала_данных)"
    )
    engineering_system_type = models.CharField(
        max_length=255, verbose_name="Тип инженерной системы"
    )
    sensor_type = models.CharField(max_length=255, verbose_name="Тип датчика")
    engineering_system_tag = models.CharField(
        max_length=255, verbose_name="Тег инженерной системы"
    )
    sensor_name = models.CharField(max_length=255, verbose_name="Название датчика")
    dispatch_object = models.ForeignKey(
        DispatchObject,
        on_delete=models.CASCADE,
        related_name="sensor_channels",
        verbose_name="Объект",
    )

    class Meta:
        verbose_name = "Канал датчика"
        verbose_name_plural = "Справочник каналов датчиков"
        indexes = [
            models.Index(fields=["sensor_type"]),
            models.Index(fields=["dispatch_object"]),
        ]

    def __str__(self):
        return f"{self.sensor_name} ({self.engineering_system_tag})"


class SensorState(models.Model):
    """
    Справочник возможных состояний по типу датчика.
    Не связан ForeignKey с SensorChannel — см. пояснение в шапке файла,
    сопоставление возможно только по текстовому sensor_type.
    """

    sensor_type = models.CharField(max_length=255, verbose_name="Тип датчика")
    state_set_id = models.PositiveIntegerField(verbose_name="ID набора состояний")
    name = models.CharField(max_length=255, verbose_name="Название состояния")
    is_alarm = models.BooleanField(default=False, verbose_name="Тревожное состояние")

    class Meta:
        verbose_name = "Состояние датчика"
        verbose_name_plural = "Справочник состояний датчиков"
        constraints = [
            models.UniqueConstraint(
                fields=["sensor_type", "state_set_id", "name"],
                name="uniq_sensor_state",
            )
        ]
        indexes = [
            models.Index(fields=["sensor_type", "state_set_id"]),
        ]

    def __str__(self):
        return f"{self.sensor_type} / набор {self.state_set_id}: {self.name}"


class SensorEvent(models.Model):
    """
    Журнал событий/показаний датчиков — основная таблица данных (time-series).

    Первичный ключ — составной, (source_event_id, occurred_at), без
    отдельного суррогатного id. Это сразу удовлетворяет требованию
    TimescaleDB: после превращения таблицы в гипертаблицу (см. миграцию
    0002_create_hypertable) partitioning-колонка occurred_at обязана
    входить в КАЖДЫЙ unique/primary key constraint таблицы — иначе
    create_hypertable() откажет с ошибкой. Суррогатный AutoField здесь не
    нужен: source_event_id и так уникален по смыслу данных (значение
    "ид_события" из источника), а Django пока не поддерживает AutoField
    как часть составного первичного ключа без отдельных костылей.
    """

    pk = models.CompositePrimaryKey("source_event_id", "occurred_at")
    source_event_id = models.BigIntegerField(
        verbose_name="ID события в источнике (ид_события)",
    )
    channel = models.ForeignKey(
        SensorChannel,
        on_delete=models.CASCADE,
        related_name="events",
        verbose_name="Канал датчика",
    )
    occurred_at = models.DateTimeField(
        verbose_name="Дата и время события",
        help_text="Объединённые поля дата+время из журнала",
    )
    is_alarm = models.BooleanField(default=False, verbose_name="Тревожное")
    raw_value = models.CharField(
        max_length=255,
        verbose_name="Значение датчика (сырое)",
        help_text="Числовое показание либо текстовое название состояния",
    )

    class Meta:
        verbose_name = "Событие датчика"
        verbose_name_plural = "Журнал событий датчиков"
        indexes = [
            models.Index(fields=["occurred_at"]),
            models.Index(fields=["channel", "occurred_at"]),
            models.Index(fields=["is_alarm"]),
        ]
        ordering = ["-occurred_at"]

    def __str__(self):
        return f"{self.channel_id} @ {self.occurred_at}: {self.raw_value}"

    @property
    def numeric_value(self):
        """float(raw_value), либо None, если это текстовое название состояния."""
        try:
            return float(str(self.raw_value).replace(",", "."))
        except (TypeError, ValueError):
            return None

class WeatherLocation(models.Model):
    """
    Точка, для которой запрашивается и хранится погода. Отдельная сущность
    (а не просто lat/lon-поля прямо в WeatherHourly), потому что реальная
    ячейка сетки ERA5, которую вернул API, отличается от запрошенных
    координат (см. requested_* vs grid_*) — это стоит хранить один раз на
    точку, а не дублировать в каждой из ~8760 часовых записей за год.
    """

    name = models.CharField(max_length=255, unique=True, verbose_name="Название точки")
    requested_latitude = models.FloatField(verbose_name="Запрошенная широта")
    requested_longitude = models.FloatField(verbose_name="Запрошенная долгота")
    grid_latitude = models.FloatField(
        null=True, blank=True, verbose_name="Широта ячейки сетки (по ответу API)"
    )
    grid_longitude = models.FloatField(
        null=True, blank=True, verbose_name="Долгота ячейки сетки (по ответу API)"
    )
    elevation_m = models.FloatField(null=True, blank=True, verbose_name="Высота, м")
    timezone = models.CharField(
        max_length=64, default="Europe/Moscow", verbose_name="Часовой пояс"
    )

    class Meta:
        verbose_name = "Точка запроса погоды"
        verbose_name_plural = "Точки запроса погоды"

    def __str__(self):
        return f"{self.name} ({self.requested_latitude}, {self.requested_longitude})"


class WeatherHourly(models.Model):
    """
    Погодная витрина: почасовые метеопоказатели ERA5 (Open-Meteo Historical
    Weather API, /v1/archive, models=era5) для конкретной точки.

    observed_at — ЛОКАЛЬНОЕ время точки (naive datetime, как и occurred_at
    в SensorEvent — согласуется с USE_TZ=False в settings.py), потому что
    запрос делается с &timezone=Europe/Moscow и API возвращает временные
    метки уже в этом часовом поясе, без смещения.

    Составной первичный ключ (location, observed_at) — по той же причине,
    что и в SensorEvent: TimescaleDB требует, чтобы partitioning-колонка
    (observed_at) входила в любой unique/primary key constraint таблицы.
    """

    pk = models.CompositePrimaryKey("location", "observed_at")
    location = models.ForeignKey(
        WeatherLocation,
        on_delete=models.CASCADE,
        related_name="hourly_records",
        verbose_name="Точка",
    )
    observed_at = models.DateTimeField(verbose_name="Дата и время (локальное)")
    temperature_2m = models.FloatField(
        null=True, blank=True, verbose_name="Температура на 2м, °C"
    )
    relative_humidity_2m = models.FloatField(
        null=True, blank=True, verbose_name="Отн. влажность на 2м, %"
    )
    pressure_msl = models.FloatField(
        null=True, blank=True, verbose_name="Давление на уровне моря, hPa"
    )
    precipitation = models.FloatField(
        null=True, blank=True, verbose_name="Осадки за предшествующий час, мм"
    )

    class Meta:
        verbose_name = "Погодные данные (час)"
        verbose_name_plural = "Погодная витрина (почасовая)"
        indexes = [
            models.Index(fields=["observed_at"]),
            models.Index(fields=["location", "observed_at"]),
        ]
        ordering = ["observed_at"]

    def __str__(self):
        return f"{self.location_id} @ {self.observed_at}"
