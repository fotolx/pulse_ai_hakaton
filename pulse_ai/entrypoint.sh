#!/bin/bash
set -e

echo "⏳ Ждём базу данных..."
until python manage.py check --database default > /dev/null 2>&1; do
  sleep 1
done
echo "✅ База данных доступна"

echo "🔄 Применяем миграции..."
python manage.py migrate --noinput

echo "🎨 Собираем статику..."
case "$(echo "${DEBUG}" | tr '[:upper:]' '[:lower:]')" in
  true|1|yes)
    echo "🐞 DEBUG включён — пропускаем collectstatic"
    ;;
  *)
    echo "🎨 Собираем статику..."
    python manage.py collectstatic --noinput
    ;;
esac

echo "🚀 Запускаем приложение..."
exec "$@"