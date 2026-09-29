# Pulse Ai
# Лидеры цифровой трансформации. Международный хакатон 2026 
## Сервис прогнозирования инцидентов и управления ремонтными работами инженерных коллекторов Москвы

### Команда DS Crafters

---
---
# Порог срабатывания моделей намеренно занижен, для увеличения чувствительности и количества событий. В норме активных событий и предупреждений будет выдаваться значительно меньше
---
### Запуск сервиса как контейнер Docker
1. Скопировать файл .env_example в .env
2. Заполнить поля в файле .env указав секретный ключ, имя базы данных, имя пользователя базы данных, пароль, адрес сервера базы данных и порт сервера.

Создание секретного ключа Django в командной строке:
```
python3 -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'
```
3. Создать и запустить контейнер с инфраструктурой (TimescaleDB, PostgreSQL, pgbouncer, Redis, Celery)
```
cd infrastructure
docker compose up -d
```
4. Вернуться в папку проекта
```
cd ..
```
Для запуска на пустой базе данных понадобятся команды:
```
docker compose exec web python3 manage.py makemigrations
docker compose exec web python3 manage.py migrate
docker compose exec web python3 manage.py createsuperuser
```
Если возникает ошибка при создании суперпользователя, выполнить следующую команду:
```
docker compose exec web python3 manage.py migrate --run-syncdb
```

4. Запустить контейнер веб-сервиса 
```
docker compose up -d
```
8126 - порт, на котором будет работать запущенный сервис. Можно изменить на необходимый, так же исправив его в файле docker-compose.yml

Для перезапуска инфраструктуры с очисткой базы данных используйте этот набор команд
```
cd pulse_ai_hakaton/infrastructure
docker compose down
docker compose down -v
sudo rm -rf redis_data/ timescale_data/
docker compose up -d --force-recreate
```

Для перезапуска контейнера с веб-сервисом используйте следующий набор команд
```
cd pulse_ai_hakaton/
docker compose down
docker compose down -v
docker compose up -d --force-recreate
```

5. Загрузить справочники

```
docker compose exec web python manage.py load_reference_data \
    --channels-csv data/channels_with_keys.csv \
    --episodes-csv data/fault_episode_registry.csv \
    --event-dict-csv data/event_value_dictionary_v1.csv \
    --clear
```

6. Загрузить метаданные моделей
```
docker compose exec web python manage.py shell -c "
from ml.models import MLModelMetadata
from ml.constants import MODEL_REGISTRY

for name, cfg in MODEL_REGISTRY.items():
    MLModelMetadata.objects.update_or_create(
        name=name,
        defaults={
            'display_name': name,
            'file_path': str(cfg['file']),
            'engine': cfg['engine'],
            'feature_count': len(cfg['features']),
            'granularity': cfg['granularity'],
            'horizon_hours': cfg.get('horizon_hours'),
            'horizon_days': cfg.get('horizon_days'),
            'is_active': True,
        }
    )
print('Метаданные моделей загружены')
"
```

7. Перезапустить контейнер
```
docker compose down && docker compose up -d
```

Модели выполняют прогноз по умолчанию каждый час в 05 минут.
Для ручного запуска используются команды:  
```
# Запуск одной модели
python manage.py run_prediction --model A3

# Запуск всех ежечасных моделей
python manage.py run_prediction --all-hourly

# Запуск всех моделей
python manage.py run_prediction --all

# Запуск с конкретным временем (для тестирования на исторических данных)
python manage.py run_prediction --all-hourly --time "2026-09-28 12:00"
python manage.py run_prediction --model A3 --time "2026-09-28 14:00"

# Принудительный запуск (пересоздать даже если уже есть)
python manage.py run_prediction --model A3 --force

# Только сбор признаков без предсказания (для отладки)
python manage.py run_prediction --model A3 --dry-run

# Асинхронный запуск через Celery
python manage.py run_prediction --model A3 --async
```
8. Проверить прогноз
```
curl http://127.0.0.1:8126/api/forecast | python -m json.tool
```



## Имитатор внешней диспетчерской системы для pulse_ai.

Читает CSV-журнал (схема: ид_события, ид_канала_данных, дата, время,
тревожное, значение_датчика) ОДИН РАЗ, чанками (память ограничена
размером одного чанка вне зависимости от размера файла на диске).
Файл содержит данные за весь календарный год, включая ещё не наступившие
("будущие") события.  
Запуск:
```
    python sensor_stream_simulator.py \
        --csv journal.csv \
        --api-url http://addres:port/api/events/ingest/ \
        --api-key mysecret
```


## Загрузка погодных данных за 2026 год для точки
```
docker compose exec web python manage.py fetch_weather_data \
  --name "Москва" \
  --latitude 55.7558 --longitude 37.6176 \
  --start-date 2026-01-01 --end-date 2026-12-31 \
  --timezone Europe/Moscow
```

### Ожидаемый вывод:
```
Создана новая точка: Москва (55.7558, 37.6176)
Запрос к Open-Meteo: https://archive-api.open-meteo.com/v1/archive params={...}
  Фактическая ячейка сетки: (55.75, 37.5), высота 149.0 м
Получено 8760 часовых записей от 2026-01-01T00:00 до 2026-12-31T23:00
Загружено (или уже было загружено) 8760 часовых записей для Москва (55.7558, 37.6176)
```

## Созданные страницы
```
/events/
/equipment/
/pickets/
/scheme/
```

## Созданные эндпоинты
```
/api/arrivals
/api/tasks
/api/forecast
/api/health
/api/events
/api/events?from=2026-09-22&to=2026-09-29&status=Закрыто&limit=500
/api/events/day/
/api/events/week/
/api/events/month/
/api/events/ingest/
/api/weather/at/ 
/api/weather/range/
```
### проверка API
```curl "https://server-name/api/weather/at/?location_id=1&datetime=2026-06-15T14:30:00"```  
```curl "https://server-name/api/weather/range/?location_id=1&start=2026-06-01&end=2026-06-07"```  
```curl "https://server-name/api/events?from=2026-09-22&to=2026-09-29&status=Закрыто&limit=500"```  
## Продакшен

```bash
cp .env.example .env.prod            
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build

docker compose -f docker-compose.yml -f docker-compose.prod.yml exec web python3 manage.py migrate
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec web python3 manage.py collectstatic --noinput
```

Явный список `-f docker-compose.yml -f docker-compose.prod.yml` (без override)
отключает dev-специфичные настройки (bind-mount кода, runserver, публикация
порта 8125 наружу) и добавляет прод-слой: постоянные volumes для `static/` и
`media/`, а также nginx перед приложением.

## Подключение к БД

БД — отдельный сервис PostgreSQL, доступный по IP (поднимается в отдельном
compose вместе с другими необходимыми сервисами). Обязательно проверить:

- `HOST` в `.env`/`.env.prod` — реальный IP/домен сервера БД, не `127.0.0.1`.
- На стороне PostgreSQL (`pg_hba.conf`, `listen_addresses`, фаервол) разрешён
  вход с внешнего IP докер-хоста (NAT — сервер БД видит внешний IP хоста, а не
  внутренний адрес контейнера).
- Если соединение идёт не по доверенной локальной сети — использовать
  `sslmode=require` (или строже) в параметрах подключения psycopg.

## Известные ограничения

- В dev-режиме процесс в контейнере работает под `appuser`, а смонтированный
  каталог `./pulse_ai` принадлежит пользователю хоста — если возникнут
  проблемы с правами на запись (например, при генерации файлов в `media/`),
  проще всего локально запускать dev-контейнер от root
  (`docker compose run --user root web ...`) либо синхронизировать UID.
