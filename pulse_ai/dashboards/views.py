from django.shortcuts import redirect, render
from django.views import View
from django.views.generic import CreateView
from django.http import JsonResponse
from django.core.serializers import serialize
from django.http import HttpResponse
from django.utils.decorators import method_decorator  
from django.views.decorators.csrf import csrf_exempt 
from django.utils import timezone
from datetime import datetime,timedelta
from .models import *
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping
import pandas as pd
import numpy as np
from django.conf import settings
import time
import pickle
import os
import joblib
import json
from django.core.paginator import Paginator
from django.utils.dateparse import parse_date
from .models import SensorChannel, SensorEvent, WeatherHourly, WeatherLocation
import logging

logger = logging.getLogger(__name__)

PAGE_SIZE_DEFAULT = 500
PAGE_SIZE_MAX = 5000
INGEST_BATCH_MAX = 5000

def mobile(request):
    return render(request, 'mobile.html')   

@method_decorator(csrf_exempt, name='dispatch')
class DetectorDataCreateView(CreateView):
    context_object_name = "detector_data"
    fields = '__all__'

    def post(self, request, *args, **kwargs):
        return HttpResponse("Success", status=200)
 
@method_decorator(csrf_exempt, name='dispatch')
class RisksValuesView(View):
    def get(self, request, *args, **kwargs):
        risks = {"status": "Success",}      
        return HttpResponse(serialize("json", [risks]), content_type="application/json", status=200)
    
    def post(self, request, *args, **kwargs):
        if request.POST.get("id") is None:
            return HttpResponse("Bad request", status=400)
        result = {
            "status": "Success",
            "message": "Настройки сохранены успешно.",
            }
        return HttpResponse(json.dumps(result), content_type="application/json", status=200)

# @method_decorator(csrf_exempt, name='dispatch')
class TasksView(View):
    def get(self, request, *args, **kwargs):
        tasks = {
  "items": [
    {
      "id": "task-107-001",
      "technicianName": "Иванов Иван",
      "position": "Техник",
      "nodeId": "107",
      "nodeName": "Узел 107",
      "district": "Первомайский",
      "task": "Плановое ТО",
      "closedAt": "2026-09-25T08:15:00.000Z",
      "statusMap": {
        "door": "norm",
        "smoke": "norm",
        "temp": "norm",
        "motion": "norm",
        "gas": "norm",
        "ups": "fault"
      },
      "checklist": [
        { "id": "door", "label": "КД Дверь", "status": "norm" },
        { "id": "ups", "label": "ИБП", "status": "fault" }
      ],
      "comment": "ИБП требует замены батареи",
      "photos": [],
      "receivedAt": "2026-09-25T08:15:03.000Z"
    }
  ]
}      
        return JsonResponse(tasks, status=200)

    def post(self, request, *args, **kwargs):
        result = {
            "id": request.POST.get("id"),
            "status": "Success",
            "message": "Задача закрыта успешно.",
            }
        return HttpResponse(json.dumps(result), content_type="application/json", status=200)


# @method_decorator(csrf_exempt, name='dispatch')
class ArrivalsView(View):
    def get(self, request, *args, **kwargs):
        arrivals = {
  "items": [
    {
      "id": "arrival-107-001",
      "technicianName": "Иванов Иван",
      "position": "Техник",
      "nodeId": "107",
      "nodeName": "Узел 107",
      "district": "Первомайский",
      "task": "Плановое ТО",
      "arrivedAt": "2026-09-25T07:30:00.000Z",
      "receivedAt": "2026-09-25T07:30:02.000Z"
    }
  ]
}    
        return JsonResponse(arrivals, status=200)

    def post(self, request, *args, **kwargs):
        if request.POST.get("id") is None:
            return HttpResponse("Bad request", status=400)
        result = {
            "id": request.POST.get("id"),
            "status": "Success",
            "message": "Прибытие сохранено успешно.",
            }
        return HttpResponse(json.dumps(result), content_type="application/json", status=200)

def _parse_bool(value):
    if value is None:
        return None
    return value.strip().lower() in ("1", "true", "yes", "да")


def _serialize_events(queryset):
    return [
        {
            "source_event_id": event.source_event_id,
            "occurred_at": event.occurred_at.isoformat(),
            "channel_id": event.channel_id,
            "sensor_name": event.channel.sensor_name,
            "sensor_type": event.channel.sensor_type,
            "engineering_system_type": event.channel.engineering_system_type,
            "object_id": event.channel.dispatch_object_id,
            "object_name": event.channel.dispatch_object.dispatcher_name,
            "is_alarm": event.is_alarm,
            "raw_value": event.raw_value,
            "numeric_value": event.numeric_value,
        }
        for event in queryset
    ]


class BaseSensorEventListView(View):
    """Общая логика: диапазон дат приходит из get_range(), остальное — фильтры/пагинация."""

    def get_range(self, request):
        """Должен вернуть (start, end) — naive datetime, end не включается."""
        raise NotImplementedError

    def get(self, request, *args, **kwargs):
        try:
            start, end = self.get_range(request)
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=400)

        qs = SensorEvent.objects.select_related(
            "channel", "channel__dispatch_object"
        ).filter(occurred_at__gte=start, occurred_at__lt=end)

        channel_id = request.GET.get("channel_id")
        if channel_id:
            qs = qs.filter(channel_id=channel_id)

        object_id = request.GET.get("object_id")
        if object_id:
            qs = qs.filter(channel__dispatch_object_id=object_id)

        alarm = _parse_bool(request.GET.get("alarm"))
        if alarm is not None:
            qs = qs.filter(is_alarm=alarm)

        qs = qs.order_by("occurred_at")

        try:
            page_size = min(int(request.GET.get("page_size", PAGE_SIZE_DEFAULT)), PAGE_SIZE_MAX)
            page_number = int(request.GET.get("page", 1))
        except ValueError:
            return JsonResponse({"error": "page и page_size должны быть числами"}, status=400)

        paginator = Paginator(qs, page_size)
        page = paginator.get_page(page_number)

        return JsonResponse(
            {
                "range": {"start": start.isoformat(), "end": end.isoformat()},
                "count": paginator.count,
                "page": page.number,
                "pages": paginator.num_pages,
                "page_size": page_size,
                "results": _serialize_events(page.object_list),
            }
        )


class DayEventsView(BaseSensorEventListView):
    """GET /api/events/day/?date=2025-01-15 — без ?date берётся сегодня."""

    def get_range(self, request):
        date_str = request.GET.get("date")
        if date_str:
            day = parse_date(date_str)
            if day is None:
                raise ValueError("Неверный формат date, ожидается YYYY-MM-DD")
        else:
            day = datetime.now().date()

        start = datetime.combine(day, datetime.min.time())
        end = start + timedelta(days=1)
        return start, end


class WeekEventsView(BaseSensorEventListView):
    """GET /api/events/week/?date=2025-01-15 — ISO-неделя (пн-вс) вокруг date."""

    def get_range(self, request):
        date_str = request.GET.get("date")
        if date_str:
            day = parse_date(date_str)
            if day is None:
                raise ValueError("Неверный формат date, ожидается YYYY-MM-DD")
        else:
            day = datetime.now().date()

        week_start_date = day - timedelta(days=day.weekday())  # понедельник
        start = datetime.combine(week_start_date, datetime.min.time())
        end = start + timedelta(days=7)
        return start, end


class MonthEventsView(BaseSensorEventListView):
    """GET /api/events/month/?year=2025&month=1 — без параметров текущий месяц."""

    def get_range(self, request):
        now = datetime.now()
        try:
            year = int(request.GET.get("year", now.year))
            month = int(request.GET.get("month", now.month))
        except ValueError:
            raise ValueError("year и month должны быть числами")

        if not (1 <= month <= 12):
            raise ValueError("month должен быть от 1 до 12")

        start = datetime(year, month, 1)
        end = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
        return start, end

@method_decorator(csrf_exempt, name="dispatch")
class IngestEventsView(View):
    """
    POST /api/events/ingest/

    Приём одного или пачки событий от внешней системы (имитатора потока
    или реальной диспетчерской системы). Тело запроса — JSON:

        {"events": [
            {
                "source_event_id": 4040642809,
                "channel_id": 2869,
                "occurred_at": "2025-08-28 13:55:17",
                "is_alarm": false,
                "raw_value": "41"
            },
            ...
        ]}

    Либо один объект события без обёртки "events" — для отправки по одному.

    Аутентификация: если задана переменная окружения INGEST_API_KEY,
    запрос обязан передать заголовок X-API-Key с этим значением.
    Если переменная не задана — проверка пропускается (удобно для
    локальной разработки), но в лог пишется предупреждение.

    Идемпотентность: используется тот же bulk_create(ignore_conflicts=True)
    и тот же composite PK (source_event_id, occurred_at), что и в
    management-команде импорта — повторная отправка одного и того же
    события безопасна и не создаёт дублей.
    """

    REQUIRED_FIELDS = ("source_event_id", "channel_id", "occurred_at")

    def _check_api_key(self, request):
        expected = os.environ.get("INGEST_API_KEY")
        if not expected:
            logger.warning(
                "INGEST_API_KEY не задан — эндпоинт приёма данных работает без аутентификации"
            )
            return True
        return request.headers.get("X-API-Key") == expected

    def post(self, request, *args, **kwargs):
        if not self._check_api_key(request):
            return JsonResponse({"error": "Неверный или отсутствующий X-API-Key"}, status=401)

        try:
            payload = json.loads(request.body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JsonResponse({"error": "Тело запроса должно быть валидным JSON"}, status=400)

        events_raw = payload.get("events") if isinstance(payload, dict) and "events" in payload else payload
        if isinstance(events_raw, dict):
            events_raw = [events_raw]
        if not isinstance(events_raw, list):
            return JsonResponse(
                {"error": "Ожидается объект события или {'events': [...]}"}, status=400
            )
        if len(events_raw) > INGEST_BATCH_MAX:
            return JsonResponse(
                {"error": f"Слишком большая пачка: максимум {INGEST_BATCH_MAX} событий за запрос"},
                status=400,
            )

        channel_ids = set()
        parsed = []
        errors = []

        for i, item in enumerate(events_raw):
            missing = [f for f in self.REQUIRED_FIELDS if item.get(f) in (None, "")]
            if missing:
                errors.append({"index": i, "error": f"Отсутствуют поля: {missing}"})
                continue
            try:
                occurred_at = datetime.strptime(str(item["occurred_at"]), "%Y-%m-%d %H:%M:%S")
            except ValueError:
                errors.append(
                    {"index": i, "error": "occurred_at должен быть в формате YYYY-MM-DD HH:MM:SS"}
                )
                continue

            channel_id = item["channel_id"]
            channel_ids.add(channel_id)
            parsed.append(
                {
                    "source_event_id": item["source_event_id"],
                    "channel_id": channel_id,
                    "occurred_at": occurred_at,
                    "is_alarm": bool(item.get("is_alarm", False)),
                    "raw_value": str(item.get("raw_value", "")),
                }
            )

        existing_channel_ids = set(
            SensorChannel.objects.filter(id__in=channel_ids).values_list("id", flat=True)
        )

        to_create = []
        skipped_channel = 0
        for item in parsed:
            if item["channel_id"] not in existing_channel_ids:
                skipped_channel += 1
                continue
            to_create.append(SensorEvent(**item))

        SensorEvent.objects.bulk_create(to_create, ignore_conflicts=True)

        return JsonResponse(
            {
                "received": len(events_raw),
                "accepted_for_insert": len(to_create),
                "skipped_unknown_channel": skipped_channel,
                "validation_errors": errors,
            },
            status=201,
        )

def _serialize_weather(queryset):
    return [
        {
            "location_id": w.location_id,
            "observed_at": w.observed_at.isoformat(),
            "temperature_2m": w.temperature_2m,
            "relative_humidity_2m": w.relative_humidity_2m,
            "pressure_msl": w.pressure_msl,
            "precipitation": w.precipitation,
        }
        for w in queryset
    ]


class WeatherAtView(View):
    """
    GET /api/weather/at/?location_id=1&datetime=2026-06-15T14:30:00

    Возвращает погодную запись за час, к которому относится указанный
    момент времени (минуты отбрасываются — ERA5 почасовая). Нужен для
    расчёта метео-признаков во время работы модели предсказания: для
    произвольного occurred_at события находим соответствующий час погоды.
    Без ?datetime берётся текущий момент.
    """

    def get(self, request, *args, **kwargs):
        location_id = request.GET.get("location_id")
        if not location_id:
            return JsonResponse({"error": "Параметр location_id обязателен"}, status=400)

        dt_str = request.GET.get("datetime")
        if dt_str:
            try:
                dt = datetime.fromisoformat(dt_str)
            except ValueError:
                return JsonResponse(
                    {"error": "datetime должен быть в формате ISO 8601, например 2026-06-15T14:30:00"},
                    status=400,
                )
        else:
            dt = datetime.now()

        hour_start = dt.replace(minute=0, second=0, microsecond=0)

        try:
            record = WeatherHourly.objects.get(location_id=location_id, observed_at=hour_start)
        except WeatherHourly.DoesNotExist:
            return JsonResponse(
                {
                    "error": f"Нет данных за {hour_start.isoformat()} для точки {location_id}",
                    "requested_hour": hour_start.isoformat(),
                },
                status=404,
            )

        return JsonResponse(_serialize_weather([record])[0])


class WeatherRangeView(View):
    """
    GET /api/weather/range/?location_id=1&start=2026-01-01&end=2026-01-31

    Возвращает все часовые записи за диапазон дат (включительно) —
    для обучения модели/анализа исторической погоды. Диапазон дат
    обязателен, без разумного диапазона тут можно случайно запросить
    весь год разом.
    """

    def get(self, request, *args, **kwargs):
        location_id = request.GET.get("location_id")
        if not location_id:
            return JsonResponse({"error": "Параметр location_id обязателен"}, status=400)

        start_str = request.GET.get("start")
        end_str = request.GET.get("end")
        if not start_str or not end_str:
            return JsonResponse({"error": "Параметры start и end (YYYY-MM-DD) обязательны"}, status=400)

        start_date = parse_date(start_str)
        end_date = parse_date(end_str)
        if start_date is None or end_date is None:
            return JsonResponse({"error": "start/end должны быть в формате YYYY-MM-DD"}, status=400)

        qs = (
            WeatherHourly.objects.filter(
                location_id=location_id,
                observed_at__date__gte=start_date,
                observed_at__date__lte=end_date,
            )
            .order_by("observed_at")
        )

        try:
            page_size = min(int(request.GET.get("page_size", PAGE_SIZE_DEFAULT)), PAGE_SIZE_MAX)
            page_number = int(request.GET.get("page", 1))
        except ValueError:
            return JsonResponse({"error": "page и page_size должны быть числами"}, status=400)

        paginator = Paginator(qs, page_size)
        page = paginator.get_page(page_number)

        return JsonResponse(
            {
                "location_id": int(location_id),
                "range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
                "count": paginator.count,
                "page": page.number,
                "pages": paginator.num_pages,
                "page_size": page_size,
                "results": _serialize_weather(page.object_list),
            }
        )
   