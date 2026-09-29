import os
from pathlib import Path
from celery.schedules import crontab
# from django.conf import settings
from dotenv import load_dotenv
load_dotenv()


# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = str(os.getenv('SECRET_KEY'))

# SECURITY WARNING: don't run with debug turned on in production!
def _env_bool(name, default=False):
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes")

DEBUG = _env_bool("DEBUG")

ALLOWED_HOSTS = [h.strip() for h in os.getenv('ALLOWED_HOSTS', '').split(',') if h.strip()]
CSRF_TRUSTED_ORIGINS = ['https://pulse-ai.5d4.ru']

# Application definition
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    'django.contrib.sites',
    'django.contrib.flatpages',
    'django_celery_beat',
    'django_celery_results',
    'admin_panel',
    'auth_users',
    'dashboards',
    'ml',
    'django.contrib.postgres',
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    'django.contrib.flatpages.middleware.FlatpageFallbackMiddleware',
]

TEMPLATE_CONTEXT_PROCESSORS = (
    "django.core.context_processors.request",
)

ROOT_URLCONF = "main.urls"

SITE_ID = 1

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "main.wsgi.application"

# Для разработки — используем прямое подключение (проще отлаживать)
# Для продакшена — переключите на pgBouncer
USE_PGBOUNCER = os.getenv('USE_PGBOUNCER', 'False').lower() in ('true', '1')

if USE_PGBOUNCER:
    # Через pgBouncer (для продакшена)
    DB_HOST = os.getenv('PGBOUNCER_HOST')
    DB_PORT = os.getenv('PGBOUNCER_PORT', '6432')
    DB_CONN_MAX_AGE = 0
else:
    # Прямое подключение (для разработки — проще)
    DB_HOST = os.getenv('DATABASE_DIRECT_HOST')
    DB_PORT = os.getenv('DATABASE_DIRECT_PORT', '5432')
    DB_CONN_MAX_AGE = 0 if DEBUG else 600

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('POSTGRES_DB', 'pulse_ai_db'),
        'USER': os.getenv('DJANGO_DB_USER', 'django_user'),
        'PASSWORD': os.getenv('DJANGO_DB_PASSWORD'),
        'HOST': DB_HOST,
        'PORT': DB_PORT,
        'CONN_MAX_AGE': DB_CONN_MAX_AGE,
        'OPTIONS': {
            'options': f'-c statement_timeout={os.getenv("DB_STATEMENT_TIMEOUT", "30000")}',
            'client_encoding': 'UTF8',
        },
    },
}

# Для COPY используем прямое подключение всегда
DATABASES['direct'] = {
    'ENGINE': 'django.db.backends.postgresql',
    'NAME': os.getenv('POSTGRES_DB', 'pulse_ai_db'),
    'USER': os.getenv('DJANGO_DB_USER', 'django_user'),
    'PASSWORD': os.getenv('DJANGO_DB_PASSWORD'),
    'HOST': os.getenv('DATABASE_DIRECT_HOST', '127.0.0.1'),
    'PORT': os.getenv('DATABASE_DIRECT_PORT', '5432'),
    'CONN_MAX_AGE': 600,
}

# Redis 
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', '')
REDIS_AUTH = f':{REDIS_PASSWORD}@' if REDIS_PASSWORD else ''

CELERY_BROKER_URL = os.getenv(
    'CELERY_BROKER_URL', 
    f'redis://{REDIS_AUTH}127.0.0.1:6379/0'
)

# Internationalization
LANGUAGE_CODE = "ru-RU"
TIME_ZONE = "Europe/Moscow"
USE_I18N = True
USE_TZ = False

# Celery
CELERY_RESULT_BACKEND = 'django-db'  # используем django_celery_results
CELERY_CACHE_BACKEND = 'django-cache'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE          # 'Europe/Moscow', чтобы совпадало с Django
CELERY_ENABLE_UTC = False            # у вас USE_TZ = False, держите в согласии

# django-celery-beat: расписание хранится в БД, а не в файле
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'

CELERY_BEAT_SCHEDULE = {
    "hourly-a3-predictions": {
        "task": "ml.tasks.run_hourly_predictions",
        "schedule": crontab(minute=5),  # Каждый час в 05 минут
        "args": ("A3",),
    },
    "hourly-a4-predictions": {
        "task": "ml.tasks.run_hourly_predictions",
        "schedule": crontab(minute=10),
        "args": ("A4",),
    },
}



CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': f'redis://{REDIS_AUTH}127.0.0.1:6379/1',
    }
}

# Password validation

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# Static files (CSS, JavaScript, Images)
# STATIC_ROOT = BASE_DIR / "static"
STATIC_URL = "static/"
STATICFILES_DIRS = (os.path.join(BASE_DIR, "static"),)
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# Default primary key field type
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGIN_REDIRECT_URL = 'main'
LOGOUT_REDIRECT_URL = 'main'

DATA_UPLOAD_MAX_MEMORY_SIZE = 31_457_280
FILE_UPLOAD_MAX_MEMORY_SIZE = 31_457_280