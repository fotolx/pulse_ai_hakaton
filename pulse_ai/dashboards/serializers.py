"""
Сериализаторы для преобразования данных в формат мобильного приложения.
"""
from typing import Optional
from django.utils import timezone


def format_datetime(dt) -> Optional[str]:
    """Форматирование даты в ISO 8601 с миллисекундами и 'Z'."""
    if dt is None:
        return None
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def serialize_arrival(arrival) -> dict:
    """Сериализация прибытия для мобильного приложения."""
    return {
        "id": arrival.arrival_id,
        "technicianName": arrival.technician.full_name,
        "position": arrival.technician.position,
        "nodeId": arrival.picket.picket_id,
        "nodeName": arrival.picket.name,
        "district": arrival.picket.district,
        "task": arrival.task_description,
        "arrivedAt": format_datetime(arrival.arrived_at),
        "receivedAt": format_datetime(arrival.received_at),
    }


def serialize_task(task) -> dict:
    """Сериализация задачи для мобильного приложения."""
    checklist = [
        {
            "id": item.item_id,
            "label": item.label,
            "status": item.status,
        }
        for item in task.checklist_items.all()
    ]
    
    return {
        "id": task.task_id,
        "technicianName": task.technician.full_name,
        "position": task.technician.position,
        "nodeId": task.picket.picket_id,
        "nodeName": task.picket.name,
        "district": task.picket.district,
        "task": task.task_description,
        "closedAt": format_datetime(task.closed_at),
        "receivedAt": format_datetime(task.received_at),
        "statusMap": task.status_map,
        "checklist": checklist,
        "comment": task.comment,
        "photos": task.photos or [],
    }


def serialize_event(event) -> dict:
    """Сериализация события для журнала."""
    picket = event.picket
    
    return {
        "id": event.event_id,
        "occurredAt": format_datetime(event.occurred_at),
        "picketId": picket.picket_id if picket else None,
        "collector": picket.collector if picket else "",
        "district": picket.district if picket else "",
        "okrug": picket.okrug if picket else "",
        "type": event.event_type,
        "description": event.description,
        "source": event.source,
        "status": event.status,
    }


def serialize_forecast(forecast) -> dict:
    """Сериализация прогноза для мобильного приложения."""
    return {
        "id": forecast.forecast_type,
        "period": forecast.period,
        "title": forecast.title,
        "horizons": forecast.horizons,
    }


def parse_iso_datetime(value: str):
    """Парсинг ISO 8601 даты из мобильного приложения."""
    from datetime import datetime
    
    if not value:
        return None
    
    # Обработка формата "2026-09-28T12:00:00.000Z"
    value = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        # Попытка парсинга без миллисекунд
        return datetime.strptime(value[:19], "%Y-%m-%dT%H:%M:%S").replace(
            tzinfo=timezone.utc
        )
    