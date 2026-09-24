import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'main.settings')

app = Celery('main')

# Берёт все настройки с префиксом CELERY_ из settings.py
app.config_from_object('django.conf:settings', namespace='CELERY')

# Автоматически находит tasks.py во всех INSTALLED_APPS
app.autodiscover_tasks()