"""
Превращает dashboards_weatherhourly в гипертаблицу TimescaleDB,
партиционированную по observed_at (по аналогии с 0002_create_hypertable
для журнала событий датчиков).

ВАЖНО: dependencies ниже указывает на "0002_create_hypertable" — если у
вас между ней и этой миграцией уже есть другие файлы (например, вы успели
сделать ещё какие-то makemigrations), поправьте номер на актуальный
самый свежий файл в dashboards/migrations/, который создаёт модель
WeatherHourly.
"""
from django.db import migrations


class Migration(migrations.Migration):

    atomic = False

    dependencies = [
        ("dashboards", "0003_weatherlocation_weatherhourly"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                SELECT create_hypertable(
                    'dashboards_weatherhourly',
                    'observed_at',
                    if_not_exists => TRUE,
                    migrate_data => TRUE
                );
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
