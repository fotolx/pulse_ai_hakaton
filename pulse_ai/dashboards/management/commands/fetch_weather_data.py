"""
Загружает почасовые погодные данные ERA5 (Open-Meteo Historical Weather
API, эндпоинт /v1/archive) для заданной точки за период и сохраняет их в
погодную витрину (WeatherLocation + WeatherHourly).

Документация: https://open-meteo.com/en/docs/historical-weather-api

Использование:
    python manage.py fetch_weather_data \
        --name "Москва" \
        --latitude 55.7558 --longitude 37.6176 \
        --start-date 2026-01-01 --end-date 2026-12-31 \
        --timezone Europe/Moscow

Повторный запуск с теми же координатами использует ту же точку
(WeatherLocation ищется по --name). По умолчанию уже загруженные часы за
пересекающийся период просто пропускаются при вставке (ignore_conflicts).
Если нужно принудительно обновить данные за период (например, ERA5 задним
числом скорректировала значения — источник обновляется "ежедневно с
задержкой 5 дней", см. документацию) — используйте --overwrite, тогда
существующие записи за указанный период будут удалены и загружены заново.
"""
from datetime import datetime

import requests
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from dashboards.models import WeatherHourly, WeatherLocation

ARCHIVE_API_URL = "https://archive-api.open-meteo.com/v1/archive"

# Ровно те 4 показателя, что нужны для метео-признаков модели предсказания.
HOURLY_VARS = ["temperature_2m", "relative_humidity_2m", "pressure_msl", "precipitation"]

BATCH_SIZE = 2000


class Command(BaseCommand):
    help = "Загружает почасовые данные ERA5 из Open-Meteo Historical Weather API в погодную витрину"

    def add_arguments(self, parser):
        parser.add_argument("--name", required=True, help="Название точки, например 'Москва'")
        parser.add_argument("--latitude", type=float, required=True)
        parser.add_argument("--longitude", type=float, required=True)
        parser.add_argument("--start-date", required=True, help="YYYY-MM-DD")
        parser.add_argument("--end-date", required=True, help="YYYY-MM-DD")
        parser.add_argument("--timezone", default="Europe/Moscow")
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Удалить и перезагрузить уже существующие записи точки за этот период",
        )

    def handle(self, *args, **options):
        location, created = WeatherLocation.objects.get_or_create(
            name=options["name"],
            defaults={
                "requested_latitude": options["latitude"],
                "requested_longitude": options["longitude"],
                "timezone": options["timezone"],
            },
        )
        self.stdout.write(
            f"{'Создана новая' if created else 'Используем существующую'} точка: {location}"
        )

        params = {
            "latitude": options["latitude"],
            "longitude": options["longitude"],
            "start_date": options["start_date"],
            "end_date": options["end_date"],
            "hourly": ",".join(HOURLY_VARS),
            "timezone": options["timezone"],
            "models": "era5",  # явно фиксируем модель — без этого API может
                                # подмешать IFS/ERA5-Land через "best_match",
                                # что ломает консистентность данных за год
        }

        self.stdout.write(f"Запрос к Open-Meteo: {ARCHIVE_API_URL} params={params}")
        try:
            response = requests.get(ARCHIVE_API_URL, params=params, timeout=60)
        except requests.exceptions.RequestException as e:
            raise CommandError(f"Ошибка сети при обращении к Open-Meteo: {e}")

        if response.status_code != 200:
            raise CommandError(f"Open-Meteo вернул {response.status_code}: {response.text[:500]}")

        data = response.json()

        # Сохраняем фактическую ячейку сетки/высоту — API может вернуть
        # координаты, отличные от запрошенных (см. cell_selection=land)
        location.grid_latitude = data.get("latitude")
        location.grid_longitude = data.get("longitude")
        location.elevation_m = data.get("elevation")
        location.save(update_fields=["grid_latitude", "grid_longitude", "elevation_m"])
        self.stdout.write(
            f"  Фактическая ячейка сетки: ({location.grid_latitude}, {location.grid_longitude}), "
            f"высота {location.elevation_m} м"
        )

        hourly = data.get("hourly")
        if not hourly or "time" not in hourly:
            raise CommandError("В ответе API нет почасовых данных (hourly.time)")

        times = hourly["time"]
        n = len(times)
        self.stdout.write(f"Получено {n} часовых записей от {times[0]} до {times[-1]}")

        if options["overwrite"]:
            start_date = datetime.strptime(options["start_date"], "%Y-%m-%d").date()
            end_date = datetime.strptime(options["end_date"], "%Y-%m-%d").date()
            deleted, _ = WeatherHourly.objects.filter(
                location=location,
                observed_at__date__gte=start_date,
                observed_at__date__lte=end_date,
            ).delete()
            self.stdout.write(f"Удалено {deleted} существующих записей за период (--overwrite)")

        temperature = hourly.get("temperature_2m", [None] * n)
        humidity = hourly.get("relative_humidity_2m", [None] * n)
        pressure = hourly.get("pressure_msl", [None] * n)
        precipitation = hourly.get("precipitation", [None] * n)

        records = []
        for i, time_str in enumerate(times):
            # Open-Meteo отдаёт время в формате "YYYY-MM-DDTHH:MM" (без секунд)
            observed_at = datetime.strptime(time_str, "%Y-%m-%dT%H:%M")
            records.append(
                WeatherHourly(
                    location=location,
                    observed_at=observed_at,
                    temperature_2m=temperature[i],
                    relative_humidity_2m=humidity[i],
                    pressure_msl=pressure[i],
                    precipitation=precipitation[i],
                )
            )

        with transaction.atomic():
            WeatherHourly.objects.bulk_create(records, batch_size=BATCH_SIZE, ignore_conflicts=True)

        self.stdout.write(
            self.style.SUCCESS(f"Загружено (или уже было загружено) {len(records)} часовых записей для {location}")
        )
