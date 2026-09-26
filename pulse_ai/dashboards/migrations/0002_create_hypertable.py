"""
Превращает таблицу dashboards_sensorevent в гипертаблицу TimescaleDB,
партиционированную по occurred_at.

ВАЖНО: dependencies ниже указывает на "0001_initial" — если ваша первая
автосгенерированная миграция dashboards называется иначе (например, вы
дописывали модели в уже существующий dashboards app с более ранними
номерами миграций), поправьте номер на актуальный самый свежий файл
в dashboards/migrations/.
"""
from django.db import migrations


class Migration(migrations.Migration):

    # Хайпертейбл создаётся вне транзакции — некоторые версии TimescaleDB
    # требуют autocommit для create_hypertable на непустой таблице
    # (с migrate_data => TRUE). На пустой таблице это не обязательно,
    # но atomic = False безопасно оставить в любом случае.
    atomic = False

    dependencies = [
        ("dashboards", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                SELECT create_hypertable(
                    'dashboards_sensorevent',
                    'occurred_at',
                    if_not_exists => TRUE,
                    migrate_data => TRUE
                );
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
