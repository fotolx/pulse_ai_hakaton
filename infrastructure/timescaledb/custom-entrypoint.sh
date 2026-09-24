#!/bin/sh
# custom-entrypoint.sh
# Генерирует /docker-entrypoint-initdb.d/init.sql из переменных окружения
# прямо перед стартом официального entrypoint'а postgres/timescaledb.
set -e

# Падаем с понятной ошибкой, если чего-то не хватает в .env,
# вместо того чтобы сгенерировать SQL с пустым паролем
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${DJANGO_DB_USER:?DJANGO_DB_USER is required}"
: "${DJANGO_DB_PASSWORD:?DJANGO_DB_PASSWORD is required}"
: "${ADMIN_DB_USER:?ADMIN_DB_USER is required}"
: "${ADMIN_DB_PASSWORD:?ADMIN_DB_PASSWORD is required}"

mkdir -p /docker-entrypoint-initdb.d

# Делимитер БЕЗ кавычек ("EOSQL", не 'EOSQL') — поэтому ${VAR} подставляются shell'ом
cat > /docker-entrypoint-initdb.d/init.sql <<EOSQL
-- Сгенерировано custom-entrypoint.sh, не редактируйте вручную

CREATE USER ${DJANGO_DB_USER} WITH PASSWORD '${DJANGO_DB_PASSWORD}';
ALTER ROLE ${DJANGO_DB_USER} SET client_encoding TO 'utf8';
ALTER ROLE ${DJANGO_DB_USER} SET default_transaction_isolation TO 'read committed';
ALTER ROLE ${DJANGO_DB_USER} SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${DJANGO_DB_USER};

CREATE USER ${ADMIN_DB_USER} WITH PASSWORD '${ADMIN_DB_PASSWORD}' SUPERUSER;

GRANT ALL ON SCHEMA public TO ${DJANGO_DB_USER};
GRANT ALL ON SCHEMA public TO ${ADMIN_DB_USER};
EOSQL

echo "✅ init.sql сгенерирован в /docker-entrypoint-initdb.d/"

# Передаём управление оригинальному entrypoint'у образа со всеми аргументами (CMD)
exec docker-entrypoint.sh "$@"
