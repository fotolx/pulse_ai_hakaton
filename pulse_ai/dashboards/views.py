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
from .models import SensorEvent

PAGE_SIZE_DEFAULT = 500
PAGE_SIZE_MAX = 5000

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
    