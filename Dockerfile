# syntax=docker/dockerfile:1

FROM python:3.12-slim-bookworm AS builder

WORKDIR /usr/src/app

# Инструменты сборки нужны только на этом этапе — в финальный образ не попадут
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --prefix=/install -r requirements.txt


FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /usr/src/app

# libpq5 — рантайм-зависимость psycopg (динамическая библиотека клиента PostgreSQL)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m appuser

COPY --from=builder /install /usr/local
COPY ./pulse_ai .
RUN chown -R appuser:appuser /usr/src/app

USER appuser
EXPOSE 8125
ENV HOME=/tmp

RUN chmod +x /usr/src/app/entrypoint.sh

ENTRYPOINT ["/bin/bash", "/usr/src/app/entrypoint.sh"]

# Прод-команда по умолчанию. Для разработки переопределяется
# в docker-compose.override.yml на manage.py runserver.
CMD ["gunicorn", "main.wsgi:application", "--bind", "0.0.0.0:8125", "--workers", "3"]
