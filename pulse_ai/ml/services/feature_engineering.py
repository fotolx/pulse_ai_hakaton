"""
Вычисление признаков моделей через SQL-запросы к PostgreSQL.
Адаптация под реальную схему БД:
- Таблица событий: dashboards_sensorevent
- Колонки: source_event_id, occurred_at, is_alarm, raw_value, channel_id
- Погода: dashboards_weatherhourly (temperature_2m, relative_humidity_2m, pressure_msl, precipitation)
"""
import logging
from datetime import datetime
from typing import Optional

import pandas as pd
from django.db import connections

logger = logging.getLogger(__name__)

DB_ALIAS = "direct"

# location_id для погоды (Москва)
WEATHER_LOCATION_ID = 1


def _cursor():
    return connections[DB_ALIAS].cursor()


# ════════════════════════════════════════════════════════════════
# A3: Признаки канала × час
# ════════════════════════════════════════════════════════════════

def build_a3_features(
    prediction_time: datetime,
    channel_id: Optional[str] = None,
) -> pd.DataFrame:
    """Признаки модели A3 (отказ канала на 24 часа)."""
    lookback_days = 31
    channel_filter = "AND ck.channel_key = %(channel_id)s" if channel_id else ""

    sql = f"""
    WITH params AS (
        SELECT
            %(prediction_time)s::timestamptz AS t,
            %(prediction_time)s::timestamptz - INTERVAL '{lookback_days} days' AS lookback_start
    ),
    events_categorized AS (
        SELECT
            ck.channel_key,
            ck.system_key,
            ck.sensor_type,
            e.occurred_at,
            DATE_TRUNC('hour', e.occurred_at) AS hour,
            e.is_alarm,
            COALESCE(d.event_category, 'unknown') AS event_category
        FROM dashboards_sensorevent e
        INNER JOIN ml_channels_keys ck ON e.channel_id = ck.channel_id
        LEFT JOIN ml_event_value_dictionary d
            ON d.sensor_value = e.raw_value
            AND LOWER(d.sensor_type) = LOWER(ck.sensor_type)
            AND d.is_active = TRUE
        INNER JOIN params p ON TRUE
        WHERE e.occurred_at >= p.lookback_start
          AND e.occurred_at < p.t
          {channel_filter}
    ),
    -- Генерируем целевой час для всех каналов, у которых была активность в окне
    target_hour_grid AS (
        SELECT DISTINCT
            channel_key,
            system_key,
            sensor_type,
            DATE_TRUNC('hour', %(prediction_time)s::timestamptz) AS hour
        FROM events_categorized
    ),
    
    channel_hour_base AS (
        -- Реальные часы с событиями
        SELECT
            channel_key, system_key, sensor_type, hour,
            COUNT(*) AS event_count,
            SUM(CASE WHEN is_alarm THEN 1 ELSE 0 END) AS alarm_count,
            SUM(CASE WHEN event_category = 'fault' THEN 1 ELSE 0 END) AS fault_event_count,
            SUM(CASE WHEN event_category = 'warning' THEN 1 ELSE 0 END) AS warning_event_count,
            SUM(CASE WHEN event_category = 'detection' THEN 1 ELSE 0 END) AS detection_event_count,
            SUM(CASE WHEN event_category = 'normal' THEN 1 ELSE 0 END) AS normal_event_count,
            SUM(CASE WHEN event_category = 'unknown' THEN 1 ELSE 0 END) AS unknown_event_count
        FROM events_categorized
        GROUP BY channel_key, system_key, sensor_type, hour
        
        UNION ALL
        
        -- Целевой час прогноза с нулевыми значениями
        SELECT
            channel_key, system_key, sensor_type, hour,
            0, 0, 0, 0, 0, 0, 0
        FROM target_hour_grid
    ),
    channel_hour_windowed AS (
        SELECT
            *,
            EXTRACT(EPOCH FROM (
                (SELECT t FROM params) - LAG(hour) OVER (
                    PARTITION BY channel_key ORDER BY hour
                )
            )) / 3600.0 AS hours_since_previous_active,

            SUM(event_count) OVER w_1h AS events_prev_1h,
            SUM(event_count) OVER w_6h AS events_prev_6h,
            SUM(event_count) OVER w_24h AS events_prev_24h,
            SUM(event_count) OVER w_72h AS events_prev_72h,
            SUM(event_count) OVER w_7d AS events_prev_7d,
            SUM(event_count) OVER w_30d AS events_prev_30d,

            SUM(alarm_count) OVER w_1h AS alarms_prev_1h,
            SUM(alarm_count) OVER w_6h AS alarms_prev_6h,
            SUM(alarm_count) OVER w_24h AS alarms_prev_24h,
            SUM(alarm_count) OVER w_72h AS alarms_prev_72h,
            SUM(alarm_count) OVER w_7d AS alarms_prev_7d,
            SUM(alarm_count) OVER w_30d AS alarms_prev_30d,

            SUM(fault_event_count) OVER w_1h AS faults_prev_1h,
            SUM(fault_event_count) OVER w_6h AS faults_prev_6h,
            SUM(fault_event_count) OVER w_24h AS faults_prev_24h,
            SUM(fault_event_count) OVER w_72h AS faults_prev_72h,
            SUM(fault_event_count) OVER w_7d AS faults_prev_7d,
            SUM(fault_event_count) OVER w_30d AS faults_prev_30d,

            COUNT(*) OVER w_1h AS active_hours_prev_1h,
            COUNT(*) OVER w_6h AS active_hours_prev_6h,
            COUNT(*) OVER w_24h AS active_hours_prev_24h,
            COUNT(*) OVER w_72h AS active_hours_prev_72h,
            COUNT(*) OVER w_7d AS active_hours_prev_7d,
            COUNT(*) OVER w_30d AS active_hours_prev_30d,

            SUM(fault_event_count) OVER w_1h AS fault_cat_prev_1h,
            SUM(warning_event_count) OVER w_1h AS warning_cat_prev_1h,
            SUM(detection_event_count) OVER w_1h AS detection_cat_prev_1h,
            SUM(normal_event_count) OVER w_1h AS normal_cat_prev_1h,
            SUM(unknown_event_count) OVER w_1h AS unknown_cat_prev_1h,

            SUM(fault_event_count) OVER w_6h AS fault_cat_prev_6h,
            SUM(warning_event_count) OVER w_6h AS warning_cat_prev_6h,
            SUM(detection_event_count) OVER w_6h AS detection_cat_prev_6h,
            SUM(normal_event_count) OVER w_6h AS normal_cat_prev_6h,
            SUM(unknown_event_count) OVER w_6h AS unknown_cat_prev_6h,

            SUM(fault_event_count) OVER w_24h AS fault_cat_prev_24h,
            SUM(warning_event_count) OVER w_24h AS warning_cat_prev_24h,
            SUM(detection_event_count) OVER w_24h AS detection_cat_prev_24h,
            SUM(normal_event_count) OVER w_24h AS normal_cat_prev_24h,
            SUM(unknown_event_count) OVER w_24h AS unknown_cat_prev_24h,

            SUM(fault_event_count) OVER w_72h AS fault_cat_prev_72h,
            SUM(warning_event_count) OVER w_72h AS warning_cat_prev_72h,
            SUM(detection_event_count) OVER w_72h AS detection_cat_prev_72h,
            SUM(normal_event_count) OVER w_72h AS normal_cat_prev_72h,
            SUM(unknown_event_count) OVER w_72h AS unknown_cat_prev_72h,

            SUM(fault_event_count) OVER w_7d AS fault_cat_prev_7d,
            SUM(warning_event_count) OVER w_7d AS warning_cat_prev_7d,
            SUM(detection_event_count) OVER w_7d AS detection_cat_prev_7d,
            SUM(normal_event_count) OVER w_7d AS normal_cat_prev_7d,
            SUM(unknown_event_count) OVER w_7d AS unknown_cat_prev_7d,

            SUM(fault_event_count) OVER w_30d AS fault_cat_prev_30d,
            SUM(warning_event_count) OVER w_30d AS warning_cat_prev_30d,
            SUM(detection_event_count) OVER w_30d AS detection_cat_prev_30d,
            SUM(normal_event_count) OVER w_30d AS normal_cat_prev_30d,
            SUM(unknown_event_count) OVER w_30d AS unknown_cat_prev_30d,

            MAX(event_count) OVER w_lag_1h AS event_count_lag_1h,
            MAX(alarm_count) OVER w_lag_1h AS alarm_count_lag_1h,
            MAX(fault_event_count) OVER w_lag_1h AS fault_count_lag_1h

        FROM channel_hour_base
        WINDOW
            w_1h AS (PARTITION BY channel_key ORDER BY hour
                RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND INTERVAL '1 microsecond' PRECEDING),
            w_6h AS (PARTITION BY channel_key ORDER BY hour
                RANGE BETWEEN INTERVAL '6 hours' PRECEDING AND INTERVAL '1 microsecond' PRECEDING),
            w_24h AS (PARTITION BY channel_key ORDER BY hour
                RANGE BETWEEN INTERVAL '24 hours' PRECEDING AND INTERVAL '1 microsecond' PRECEDING),
            w_72h AS (PARTITION BY channel_key ORDER BY hour
                RANGE BETWEEN INTERVAL '72 hours' PRECEDING AND INTERVAL '1 microsecond' PRECEDING),
            w_7d AS (PARTITION BY channel_key ORDER BY hour
                RANGE BETWEEN INTERVAL '7 days' PRECEDING AND INTERVAL '1 microsecond' PRECEDING),
            w_30d AS (PARTITION BY channel_key ORDER BY hour
                RANGE BETWEEN INTERVAL '30 days' PRECEDING AND INTERVAL '1 microsecond' PRECEDING),
            w_lag_1h AS (PARTITION BY channel_key ORDER BY hour
                RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND INTERVAL '1 hour' PRECEDING)
    ),
    fault_episode_info AS (
        SELECT
            ck.channel_key,
            MAX(fe.episode_start_time) AS last_fault_episode_time
        FROM ml_fault_episodes fe
        INNER JOIN ml_channels_keys ck ON fe.channel_id = ck.channel_id
        WHERE fe.episode_start_time < %(prediction_time)s::timestamptz
        GROUP BY ck.channel_key
    )

    SELECT
        w.channel_key,
        w.hour,
        w.sensor_type,
        COALESCE(w.hours_since_previous_active, 0) AS hours_since_previous_active,
        COALESCE(w.hours_since_previous_active, 0) AS silent_hours_before,
        COALESCE(
            EXTRACT(EPOCH FROM (%(prediction_time)s::timestamptz - fe.last_fault_episode_time)) / 3600.0,
            9999
        ) AS hours_since_last_fault_episode,

        COALESCE(w.events_prev_1h, 0) AS events_prev_1h,
        COALESCE(w.events_prev_6h, 0) AS events_prev_6h,
        COALESCE(w.events_prev_24h, 0) AS events_prev_24h,
        COALESCE(w.events_prev_72h, 0) AS events_prev_72h,
        COALESCE(w.events_prev_7d, 0) AS events_prev_7d,
        COALESCE(w.events_prev_30d, 0) AS events_prev_30d,

        COALESCE(w.alarms_prev_1h, 0) AS alarms_prev_1h,
        COALESCE(w.alarms_prev_6h, 0) AS alarms_prev_6h,
        COALESCE(w.alarms_prev_24h, 0) AS alarms_prev_24h,
        COALESCE(w.alarms_prev_72h, 0) AS alarms_prev_72h,
        COALESCE(w.alarms_prev_7d, 0) AS alarms_prev_7d,
        COALESCE(w.alarms_prev_30d, 0) AS alarms_prev_30d,

        COALESCE(w.faults_prev_1h, 0) AS faults_prev_1h,
        COALESCE(w.faults_prev_6h, 0) AS faults_prev_6h,
        COALESCE(w.faults_prev_24h, 0) AS faults_prev_24h,
        COALESCE(w.faults_prev_72h, 0) AS faults_prev_72h,
        COALESCE(w.faults_prev_7d, 0) AS faults_prev_7d,
        COALESCE(w.faults_prev_30d, 0) AS faults_prev_30d,

        COALESCE(w.active_hours_prev_1h, 0) AS active_hours_prev_1h,
        COALESCE(w.active_hours_prev_6h, 0) AS active_hours_prev_6h,
        COALESCE(w.active_hours_prev_24h, 0) AS active_hours_prev_24h,
        COALESCE(w.active_hours_prev_72h, 0) AS active_hours_prev_72h,
        COALESCE(w.active_hours_prev_7d, 0) AS active_hours_prev_7d,
        COALESCE(w.active_hours_prev_30d, 0) AS active_hours_prev_30d,

        1 AS observable_hours_prev_1h,
        6 AS observable_hours_prev_6h,
        24 AS observable_hours_prev_24h,
        72 AS observable_hours_prev_72h,
        168 AS observable_hours_prev_7d,
        720 AS observable_hours_prev_30d,

        GREATEST(0, 1.0 - (COALESCE(w.active_hours_prev_1h, 0)::numeric / 1.0)) AS missing_interval_share_1h,
        GREATEST(0, 1.0 - (COALESCE(w.active_hours_prev_6h, 0)::numeric / 6.0)) AS missing_interval_share_6h,
        GREATEST(0, 1.0 - (COALESCE(w.active_hours_prev_24h, 0)::numeric / 24.0)) AS missing_interval_share_24h,
        GREATEST(0, 1.0 - (COALESCE(w.active_hours_prev_72h, 0)::numeric / 72.0)) AS missing_interval_share_72h,
        GREATEST(0, 1.0 - (COALESCE(w.active_hours_prev_7d, 0)::numeric / 168.0)) AS missing_interval_share_7d,
        GREATEST(0, 1.0 - (COALESCE(w.active_hours_prev_30d, 0)::numeric / 720.0)) AS missing_interval_share_30d,

        0 AS equipment_switches_prev_1h,
        0 AS equipment_switches_prev_6h,
        0 AS equipment_switches_prev_24h,
        0 AS equipment_switches_prev_72h,
        0 AS equipment_switches_prev_7d,
        0 AS equipment_switches_prev_30d,

        0 AS motion_transitions_prev_1h,
        0 AS motion_transitions_prev_6h,
        0 AS motion_transitions_prev_24h,
        0 AS motion_transitions_prev_72h,
        0 AS motion_transitions_prev_7d,
        0 AS motion_transitions_prev_30d,

        0 AS event_category_entropy_prev_1h,
        0 AS event_category_entropy_prev_6h,
        0 AS event_category_entropy_prev_24h,
        0 AS event_category_entropy_prev_72h,
        0 AS event_category_entropy_prev_7d,
        0 AS event_category_entropy_prev_30d,

        0 AS event_intensity_prev_1h,
        0 AS event_intensity_prev_6h,
        0 AS event_intensity_prev_24h,
        0 AS event_intensity_prev_72h,
        0 AS event_intensity_prev_7d,
        0 AS event_intensity_prev_30d,

        0 AS system_events_prev_1h,
        0 AS system_events_prev_6h,
        0 AS system_events_prev_24h,
        0 AS system_events_prev_72h,
        0 AS system_events_prev_7d,
        0 AS system_events_prev_30d,

        0 AS system_alarms_prev_1h,
        0 AS system_alarms_prev_6h,
        0 AS system_alarms_prev_24h,
        0 AS system_alarms_prev_72h,
        0 AS system_alarms_prev_7d,
        0 AS system_alarms_prev_30d,

        0 AS system_faults_prev_1h,
        0 AS system_faults_prev_6h,
        0 AS system_faults_prev_24h,
        0 AS system_faults_prev_72h,
        0 AS system_faults_prev_7d,
        0 AS system_faults_prev_30d,

        0 AS peer_event_ratio_prev_1h,
        0 AS peer_event_ratio_prev_6h,
        0 AS peer_event_ratio_prev_24h,
        0 AS peer_event_ratio_prev_72h,
        0 AS peer_event_ratio_prev_7d,
        0 AS peer_event_ratio_prev_30d,

        0 AS system_event_share_prev_1h,
        0 AS system_event_share_prev_6h,
        0 AS system_event_share_prev_24h,
        0 AS system_event_share_prev_72h,
        0 AS system_event_share_prev_7d,
        0 AS system_event_share_prev_30d,

        COALESCE(w.fault_cat_prev_1h, 0) AS fault_cat_prev_1h,
        COALESCE(w.warning_cat_prev_1h, 0) AS warning_cat_prev_1h,
        COALESCE(w.detection_cat_prev_1h, 0) AS detection_cat_prev_1h,
        COALESCE(w.normal_cat_prev_1h, 0) AS normal_cat_prev_1h,
        COALESCE(w.unknown_cat_prev_1h, 0) AS unknown_cat_prev_1h,

        COALESCE(w.fault_cat_prev_6h, 0) AS fault_cat_prev_6h,
        COALESCE(w.warning_cat_prev_6h, 0) AS warning_cat_prev_6h,
        COALESCE(w.detection_cat_prev_6h, 0) AS detection_cat_prev_6h,
        COALESCE(w.normal_cat_prev_6h, 0) AS normal_cat_prev_6h,
        COALESCE(w.unknown_cat_prev_6h, 0) AS unknown_cat_prev_6h,

        COALESCE(w.fault_cat_prev_24h, 0) AS fault_cat_prev_24h,
        COALESCE(w.warning_cat_prev_24h, 0) AS warning_cat_prev_24h,
        COALESCE(w.detection_cat_prev_24h, 0) AS detection_cat_prev_24h,
        COALESCE(w.normal_cat_prev_24h, 0) AS normal_cat_prev_24h,
        COALESCE(w.unknown_cat_prev_24h, 0) AS unknown_cat_prev_24h,

        COALESCE(w.fault_cat_prev_72h, 0) AS fault_cat_prev_72h,
        COALESCE(w.warning_cat_prev_72h, 0) AS warning_cat_prev_72h,
        COALESCE(w.detection_cat_prev_72h, 0) AS detection_cat_prev_72h,
        COALESCE(w.normal_cat_prev_72h, 0) AS normal_cat_prev_72h,
        COALESCE(w.unknown_cat_prev_72h, 0) AS unknown_cat_prev_72h,

        COALESCE(w.fault_cat_prev_7d, 0) AS fault_cat_prev_7d,
        COALESCE(w.warning_cat_prev_7d, 0) AS warning_cat_prev_7d,
        COALESCE(w.detection_cat_prev_7d, 0) AS detection_cat_prev_7d,
        COALESCE(w.normal_cat_prev_7d, 0) AS normal_cat_prev_7d,
        COALESCE(w.unknown_cat_prev_7d, 0) AS unknown_cat_prev_7d,

        COALESCE(w.fault_cat_prev_30d, 0) AS fault_cat_prev_30d,
        COALESCE(w.warning_cat_prev_30d, 0) AS warning_cat_prev_30d,
        COALESCE(w.detection_cat_prev_30d, 0) AS detection_cat_prev_30d,
        COALESCE(w.normal_cat_prev_30d, 0) AS normal_cat_prev_30d,
        COALESCE(w.unknown_cat_prev_30d, 0) AS unknown_cat_prev_30d,

        COALESCE(w.event_count_lag_1h, 0) AS event_count_lag_1h,
        COALESCE(w.events_prev_6h, 0) AS event_count_lag_6h,
        COALESCE(w.events_prev_24h, 0) AS event_count_lag_24h,
        COALESCE(w.events_prev_72h, 0) AS event_count_lag_72h,
        COALESCE(w.events_prev_7d, 0) AS event_count_lag_7d,
        COALESCE(w.events_prev_30d, 0) AS event_count_lag_30d,

        COALESCE(w.alarm_count_lag_1h, 0) AS alarm_count_lag_1h,
        COALESCE(w.alarms_prev_6h, 0) AS alarm_count_lag_6h,
        COALESCE(w.alarms_prev_24h, 0) AS alarm_count_lag_24h,
        COALESCE(w.alarms_prev_72h, 0) AS alarm_count_lag_72h,
        COALESCE(w.alarms_prev_7d, 0) AS alarm_count_lag_7d,
        COALESCE(w.alarms_prev_30d, 0) AS alarm_count_lag_30d,

        COALESCE(w.fault_count_lag_1h, 0) AS fault_count_lag_1h,
        COALESCE(w.faults_prev_6h, 0) AS fault_count_lag_6h,
        COALESCE(w.faults_prev_24h, 0) AS fault_count_lag_24h,
        COALESCE(w.faults_prev_72h, 0) AS fault_count_lag_72h,
        COALESCE(w.faults_prev_7d, 0) AS fault_count_lag_7d,
        COALESCE(w.faults_prev_30d, 0) AS fault_count_lag_30d,

        CASE WHEN COALESCE(w.events_prev_1h, 0) = 0 THEN 1 ELSE 0 END AS silent_prev_1h_flag,
        CASE WHEN COALESCE(w.events_prev_6h, 0) = 0 THEN 1 ELSE 0 END AS silent_prev_6h_flag,
        CASE WHEN COALESCE(w.events_prev_24h, 0) = 0 THEN 1 ELSE 0 END AS silent_prev_24h_flag,
        CASE WHEN COALESCE(w.events_prev_72h, 0) = 0 THEN 1 ELSE 0 END AS silent_prev_72h_flag,
        CASE WHEN COALESCE(w.events_prev_7d, 0) = 0 THEN 1 ELSE 0 END AS silent_prev_7d_flag,
        CASE WHEN COALESCE(w.events_prev_30d, 0) = 0 THEN 1 ELSE 0 END AS silent_prev_30d_flag

    FROM channel_hour_windowed w
    LEFT JOIN fault_episode_info fe ON w.channel_key = fe.channel_key
    WHERE w.hour = DATE_TRUNC('hour', %(prediction_time)s::timestamptz)
    ORDER BY w.channel_key
    """

    params = {"prediction_time": prediction_time}
    if channel_id:
        params["channel_id"] = channel_id

    with _cursor() as cursor:
        cursor.execute(sql, params)
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()

    df = pd.DataFrame(rows, columns=columns)
    logger.info(f"A3: построено {len(df)} строк признаков")
    return df


# ════════════════════════════════════════════════════════════════
# A4: Признаки системы × час
# ════════════════════════════════════════════════════════════════

def build_a4_features(
    prediction_time: datetime,
    system_key: Optional[str] = None,
) -> pd.DataFrame:
    """Признаки модели A4 (эпизод отказа системы на 24 часа)."""
    lookback_days = 31
    system_filter = "AND ck.system_key = %(system_key)s" if system_key else ""

    sql = f"""
    WITH params AS (
        SELECT
            %(prediction_time)s::timestamptz AS t,
            %(prediction_time)s::timestamptz - INTERVAL '{lookback_days} days' AS lookback_start
    ),
    events_categorized AS (
        SELECT
            ck.system_key,
            ck.picket_key,
            e.occurred_at,
            DATE_TRUNC('hour', e.occurred_at) AS hour,
            e.is_alarm,
            COALESCE(d.event_category, 'unknown') AS event_category
        FROM dashboards_sensorevent e
        INNER JOIN ml_channels_keys ck ON e.channel_id = ck.channel_id
        LEFT JOIN ml_event_value_dictionary d
            ON d.sensor_value = e.raw_value
            AND LOWER(d.sensor_type) = LOWER(ck.sensor_type)
        INNER JOIN params p ON TRUE
        WHERE e.occurred_at >= p.lookback_start
          AND e.occurred_at < p.t
          {system_filter}
    ),
    target_hour_grid AS (
        SELECT DISTINCT
            system_key,
            DATE_TRUNC('hour', %(prediction_time)s::timestamptz) AS hour
        FROM events_categorized
    ),
    
    system_hour_base AS (
        SELECT
            system_key, hour,
            COUNT(*) AS event_count,
            SUM(CASE WHEN is_alarm THEN 1 ELSE 0 END) AS alarm_count,
            SUM(CASE WHEN event_category = 'fault' THEN 1 ELSE 0 END) AS fault_event_count
        FROM events_categorized
        GROUP BY system_key, hour
        
        UNION ALL
        
        SELECT system_key, hour, 0, 0, 0
        FROM target_hour_grid
    ),
    system_hour_windowed AS (
        SELECT
            *,
            SUM(event_count) OVER w_1h AS system_events_prev_1h,
            SUM(event_count) OVER w_6h AS system_events_prev_6h,
            SUM(event_count) OVER w_24h AS system_events_prev_24h,
            SUM(event_count) OVER w_72h AS system_events_prev_72h,
            SUM(event_count) OVER w_7d AS system_events_prev_7d,
            SUM(event_count) OVER w_30d AS system_events_prev_30d,

            SUM(alarm_count) OVER w_1h AS system_alarms_prev_1h,
            SUM(alarm_count) OVER w_6h AS system_alarms_prev_6h,
            SUM(alarm_count) OVER w_24h AS system_alarms_prev_24h,
            SUM(alarm_count) OVER w_72h AS system_alarms_prev_72h,
            SUM(alarm_count) OVER w_7d AS system_alarms_prev_7d,
            SUM(alarm_count) OVER w_30d AS system_alarms_prev_30d,

            SUM(fault_event_count) OVER w_1h AS system_faults_prev_1h,
            SUM(fault_event_count) OVER w_6h AS system_faults_prev_6h,
            SUM(fault_event_count) OVER w_24h AS system_faults_prev_24h,
            SUM(fault_event_count) OVER w_72h AS system_faults_prev_72h,
            SUM(fault_event_count) OVER w_7d AS system_faults_prev_7d,
            SUM(fault_event_count) OVER w_30d AS system_faults_prev_30d
        FROM system_hour_base
        WINDOW
            w_1h AS (PARTITION BY system_key ORDER BY hour
                RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND INTERVAL '1 microsecond' PRECEDING),
            w_6h AS (PARTITION BY system_key ORDER BY hour
                RANGE BETWEEN INTERVAL '6 hours' PRECEDING AND INTERVAL '1 microsecond' PRECEDING),
            w_24h AS (PARTITION BY system_key ORDER BY hour
                RANGE BETWEEN INTERVAL '24 hours' PRECEDING AND INTERVAL '1 microsecond' PRECEDING),
            w_72h AS (PARTITION BY system_key ORDER BY hour
                RANGE BETWEEN INTERVAL '72 hours' PRECEDING AND INTERVAL '1 microsecond' PRECEDING),
            w_7d AS (PARTITION BY system_key ORDER BY hour
                RANGE BETWEEN INTERVAL '7 days' PRECEDING AND INTERVAL '1 microsecond' PRECEDING),
            w_30d AS (PARTITION BY system_key ORDER BY hour
                RANGE BETWEEN INTERVAL '30 days' PRECEDING AND INTERVAL '1 microsecond' PRECEDING)
    ),
    -- Режимы оборудования: кириллица передаётся через параметры
    equipment_mode_events AS (
        SELECT
            ck.system_key,
            CASE
                WHEN LOWER(ck.sensor_type) LIKE %(phase_pattern)s AND e.raw_value = %(phase_off_value)s THEN 'power_off'
                WHEN LOWER(ck.sensor_type) LIKE %(pump_pattern)s AND e.raw_value = %(pump_on_value)s THEN 'pump_on'
                WHEN LOWER(ck.sensor_type) LIKE %(pump_pattern)s AND e.raw_value = ANY(%(pump_problem_values)s) THEN 'pump_problem'
                WHEN LOWER(ck.sensor_type) LIKE %(fan_pattern)s AND e.raw_value = %(fan_on_value)s THEN 'fan_on'
                WHEN LOWER(ck.sensor_type) LIKE %(fan_pattern)s AND e.raw_value = ANY(%(fan_problem_values)s) THEN 'fan_problem'
                ELSE NULL
            END AS mode_state
        FROM dashboards_sensorevent e
        INNER JOIN ml_channels_keys ck ON e.channel_id = ck.channel_id
        INNER JOIN params p ON TRUE
        WHERE e.occurred_at >= p.t - INTERVAL '24 hours'
          AND e.occurred_at < p.t
          AND (
              LOWER(ck.sensor_type) LIKE %(phase_pattern)s
              OR LOWER(ck.sensor_type) LIKE %(pump_pattern)s
              OR LOWER(ck.sensor_type) LIKE %(fan_pattern)s
          )
          {system_filter}
    ),
    equipment_mode_stats AS (
        SELECT
            system_key,
            COUNT(*) FILTER (WHERE mode_state = 'power_off') AS power_off_events_prev_24h,
            COUNT(*) FILTER (WHERE mode_state = 'pump_on') AS pump_on_events_prev_24h,
            COUNT(*) FILTER (WHERE mode_state = 'pump_problem') AS pump_problem_events_prev_24h,
            COUNT(*) FILTER (WHERE mode_state = 'fan_on') AS fan_on_events_prev_24h,
            COUNT(*) FILTER (WHERE mode_state = 'fan_problem') AS fan_problem_events_prev_24h
        FROM equipment_mode_events
        GROUP BY system_key
    ),
    -- 15-минутные каскады
    system_cascade_15m AS (
        SELECT
            ck.system_key,
            DATE_TRUNC('hour', e.occurred_at)
                + INTERVAL '1 minute' * (FLOOR(EXTRACT(MINUTE FROM e.occurred_at) / 15) * 15) AS bucket_15m,
            COUNT(*) AS signal_event_count
        FROM dashboards_sensorevent e
        INNER JOIN ml_channels_keys ck ON e.channel_id = ck.channel_id
        INNER JOIN params p ON TRUE
        WHERE e.occurred_at >= p.t - INTERVAL '24 hours'
          AND e.occurred_at < p.t
          {system_filter}
        GROUP BY ck.system_key, bucket_15m
    ),
    cascade_stats AS (
        SELECT
            system_key,
            COUNT(*) AS cascade_15m_count_prev_24h,
            COALESCE(MAX(signal_event_count), 0) AS max_channels_in_15m_prev_24h
        FROM system_cascade_15m
        GROUP BY system_key
    ),
    system_reference AS (
        SELECT
            system_key,
            MAX(object_id) AS object_id,
            MAX(engineering_system_type) AS system_type
        FROM ml_channels_keys
        GROUP BY system_key
    )

    SELECT
        w.system_key,
        w.hour,
        COALESCE(w.system_events_prev_1h, 0) AS system_events_prev_1h,
        COALESCE(w.system_events_prev_6h, 0) AS system_events_prev_6h,
        COALESCE(w.system_events_prev_24h, 0) AS system_events_prev_24h,
        COALESCE(w.system_events_prev_72h, 0) AS system_events_prev_72h,
        COALESCE(w.system_events_prev_7d, 0) AS system_events_prev_7d,
        COALESCE(w.system_events_prev_30d, 0) AS system_events_prev_30d,

        COALESCE(w.system_alarms_prev_1h, 0) AS system_alarms_prev_1h,
        COALESCE(w.system_alarms_prev_6h, 0) AS system_alarms_prev_6h,
        COALESCE(w.system_alarms_prev_24h, 0) AS system_alarms_prev_24h,
        COALESCE(w.system_alarms_prev_72h, 0) AS system_alarms_prev_72h,
        COALESCE(w.system_alarms_prev_7d, 0) AS system_alarms_prev_7d,
        COALESCE(w.system_alarms_prev_30d, 0) AS system_alarms_prev_30d,

        COALESCE(w.system_faults_prev_1h, 0) AS system_faults_prev_1h,
        COALESCE(w.system_faults_prev_6h, 0) AS system_faults_prev_6h,
        COALESCE(w.system_faults_prev_24h, 0) AS system_faults_prev_24h,
        COALESCE(w.system_faults_prev_72h, 0) AS system_faults_prev_72h,
        COALESCE(w.system_faults_prev_7d, 0) AS system_faults_prev_7d,
        COALESCE(w.system_faults_prev_30d, 0) AS system_faults_prev_30d,

        COALESCE(m.power_off_events_prev_24h, 0) AS power_off_events_prev_24h,
        COALESCE(m.pump_on_events_prev_24h, 0) AS pump_on_events_prev_24h,
        COALESCE(m.pump_problem_events_prev_24h, 0) AS pump_problem_events_prev_24h,
        COALESCE(m.fan_on_events_prev_24h, 0) AS fan_on_events_prev_24h,
        COALESCE(m.fan_problem_events_prev_24h, 0) AS fan_problem_events_prev_24h,

        COALESCE(c.cascade_15m_count_prev_24h, 0) AS cascade_15m_count_prev_24h,
        COALESCE(c.max_channels_in_15m_prev_24h, 0) AS max_channels_in_15m_prev_24h,

        0 AS neighbor_events_prev_24h,
        0 AS neighbor_alarms_prev_24h,
        0 AS neighbor_faults_prev_24h,

        r.object_id,
        r.system_type

    FROM system_hour_windowed w
    LEFT JOIN equipment_mode_stats m ON w.system_key = m.system_key
    LEFT JOIN cascade_stats c ON w.system_key = c.system_key
    LEFT JOIN system_reference r ON w.system_key = r.system_key
    WHERE w.hour = DATE_TRUNC('hour', %(prediction_time)s::timestamptz)
    ORDER BY w.system_key
    """

    params = {
        "prediction_time": prediction_time,
        # Кириллические паттерны передаются как параметры (нижний регистр)
        "phase_pattern": "%фаз%",
        "pump_pattern": "%насос%",
        "fan_pattern": "%вентиля%",
        "phase_off_value": "обесточен",
        "pump_on_value": "включен",
        "pump_problem_values": ["выключен", "неисправен", "обесточен"],
        "fan_on_value": "включен",
        "fan_problem_values": ["выключен", "неисправен", "обесточен"],
    }
    if system_key:
        params["system_key"] = system_key

    with _cursor() as cursor:
        cursor.execute(sql, params)
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()

    df = pd.DataFrame(rows, columns=columns)
    logger.info(f"A4: построено {len(df)} строк признаков")
    return df


# ════════════════════════════════════════════════════════════════
# B1: Признаки пикета (пожар)
# ════════════════════════════════════════════════════════════════

def build_b1_features(
    prediction_time: datetime,
    picket_key: Optional[str] = None,
) -> pd.DataFrame:
    """Признаки модели B1 (пожар на пикете на 24 часа)."""
    lookback_hours = 24
    picket_filter = "AND ck.picket_key = %(picket_key)s" if picket_key else ""

    sql = rf"""
    WITH params AS (
        SELECT
            %(prediction_time)s::timestamptz AS t,
            %(prediction_time)s::timestamptz - INTERVAL '{lookback_hours} hours' AS lookback_start
    ),
    fire_signals AS (
        SELECT
            ck.picket_key,
            ck.channel_key,
            ck.sensor_type,
            e.occurred_at,
            CASE
                WHEN LOWER(ck.sensor_type) LIKE %(smoke_pattern)s THEN 'smoke'
                WHEN LOWER(ck.sensor_type) LIKE %(heat_pattern)s THEN 'heat'
                WHEN LOWER(ck.sensor_type) LIKE %(manual_pattern)s THEN 'manual_alarm'
                WHEN LOWER(ck.sensor_type) LIKE %(uirr_pattern)s THEN 'uirr'
                ELSE 'other_fire'
            END AS fire_signal_type
        FROM dashboards_sensorevent e
        INNER JOIN ml_channels_keys ck ON e.channel_id = ck.channel_id
        INNER JOIN params p ON TRUE
        WHERE e.occurred_at >= p.lookback_start
          AND e.occurred_at < p.t
          {picket_filter}
          AND (
              LOWER(ck.sensor_type) LIKE %(smoke_pattern)s
              OR LOWER(ck.sensor_type) LIKE %(heat_pattern)s
              OR LOWER(ck.sensor_type) LIKE %(manual_pattern)s
              OR LOWER(ck.sensor_type) LIKE %(uirr_pattern)s
          )
    ),
    picket_fire_stats AS (
        SELECT
            picket_key,
            CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END AS fire_any_prev_24h,
            COUNT(DISTINCT channel_key) AS fire_active_channels_prev_24h,
            COUNT(DISTINCT fire_signal_type) AS fire_sensor_types_prev_24h,
            CASE WHEN COUNT(DISTINCT channel_key) >= 2 THEN 1 ELSE 0 END AS fire_multi_channel_prev_24h,
            CASE WHEN COUNT(DISTINCT fire_signal_type) >= 2 THEN 1 ELSE 0 END AS fire_multi_type_prev_24h,
            CASE WHEN SUM(CASE WHEN fire_signal_type = 'smoke' THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END AS smoke_prev_24h,
            COUNT(DISTINCT CASE WHEN fire_signal_type = 'smoke' THEN channel_key END) AS smoke_channels_prev_24h,
            CASE WHEN SUM(CASE WHEN fire_signal_type = 'heat' THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END AS heat_prev_24h,
            COUNT(DISTINCT CASE WHEN fire_signal_type = 'heat' THEN channel_key END) AS heat_channels_prev_24h,
            CASE WHEN SUM(CASE WHEN fire_signal_type = 'manual_alarm' THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END AS manual_alarm_prev_24h,
            COUNT(DISTINCT CASE WHEN fire_signal_type = 'manual_alarm' THEN channel_key END) AS manual_alarm_channels_prev_24h,
            CASE WHEN SUM(CASE WHEN fire_signal_type = 'uirr' THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END AS uirr_prev_24h,
            COUNT(DISTINCT CASE WHEN fire_signal_type = 'uirr' THEN channel_key END) AS uirr_channels_prev_24h
        FROM fire_signals
        GROUP BY picket_key
    ),
    fire_last_activity AS (
        SELECT
            ck.picket_key,
            MAX(e.occurred_at) AS last_fire_activity
        FROM dashboards_sensorevent e
        INNER JOIN ml_channels_keys ck ON e.channel_id = ck.channel_id
        WHERE (
            LOWER(ck.sensor_type) LIKE %(smoke_pattern)s
            OR LOWER(ck.sensor_type) LIKE %(heat_pattern)s
            OR LOWER(ck.sensor_type) LIKE %(manual_pattern)s
            OR LOWER(ck.sensor_type) LIKE %(uirr_pattern)s
        )
        GROUP BY ck.picket_key
    ),
    -- Температурные признаки: ищем датчики температуры с числовыми значениями
    temperature_events AS (
        SELECT
            ck.picket_key,
            e.occurred_at,
            NULLIF(e.raw_value, '')::numeric AS temperature
        FROM dashboards_sensorevent e
        INNER JOIN ml_channels_keys ck ON e.channel_id = ck.channel_id
        INNER JOIN params p ON TRUE
        WHERE e.occurred_at >= p.lookback_start
          AND e.occurred_at < p.t
          {picket_filter}
          AND LOWER(ck.sensor_type) LIKE %(temp_pattern)s
          AND e.raw_value ~ '^-?[0-9]+(\.[0-9]+)?$'
    ),
    temperature_stats AS (
        SELECT
            picket_key,
            MAX(temperature) AS temp_max_prev_24h,
            MIN(temperature) AS temp_min_prev_24h,
            AVG(temperature) AS temp_mean_prev_24h
        FROM temperature_events
        GROUP BY picket_key
    ),
    temp_last AS (
        SELECT DISTINCT ON (picket_key)
            picket_key,
            temperature AS temp_last_value,
            EXTRACT(EPOCH FROM ((SELECT t FROM params) - occurred_at)) / 3600.0 AS temp_last_age_h
        FROM temperature_events
        ORDER BY picket_key, occurred_at DESC
    )

    SELECT
        p.picket_key,
        COALESCE(f.fire_any_prev_24h, 0) AS fire_any_prev_24h,
        COALESCE(f.fire_active_channels_prev_24h, 0) AS fire_active_channels_prev_24h,
        COALESCE(f.fire_sensor_types_prev_24h, 0) AS fire_sensor_types_prev_24h,
        COALESCE(f.fire_multi_channel_prev_24h, 0) AS fire_multi_channel_prev_24h,
        COALESCE(f.fire_multi_type_prev_24h, 0) AS fire_multi_type_prev_24h,
        COALESCE(f.smoke_prev_24h, 0) AS smoke_prev_24h,
        COALESCE(f.smoke_channels_prev_24h, 0) AS smoke_channels_prev_24h,
        COALESCE(f.heat_prev_24h, 0) AS heat_prev_24h,
        COALESCE(f.heat_channels_prev_24h, 0) AS heat_channels_prev_24h,
        COALESCE(f.manual_alarm_prev_24h, 0) AS manual_alarm_prev_24h,
        COALESCE(f.manual_alarm_channels_prev_24h, 0) AS manual_alarm_channels_prev_24h,
        COALESCE(f.uirr_prev_24h, 0) AS uirr_prev_24h,
        COALESCE(f.uirr_channels_prev_24h, 0) AS uirr_channels_prev_24h,
        COALESCE(
            EXTRACT(EPOCH FROM (%(prediction_time)s::timestamptz - la.last_fire_activity)) / 3600.0,
            9999
        ) AS fire_last_activity_age_h,
        COALESCE(tl.temp_last_value, 0) AS temp_last_value,
        COALESCE(tl.temp_last_age_h, 9999) AS temp_last_age_h,
        COALESCE(ts.temp_max_prev_24h, 0) AS temp_max_prev_24h,
        COALESCE(ts.temp_min_prev_24h, 0) AS temp_min_prev_24h,
        COALESCE(ts.temp_mean_prev_24h, 0) AS temp_mean_prev_24h,
        COALESCE(ts.temp_max_prev_24h - ts.temp_min_prev_24h, 0) AS temp_max_rise_prev_24h
    FROM (SELECT DISTINCT picket_key FROM ml_channels_keys WHERE picket_key IS NOT NULL AND picket_key != '') p
    LEFT JOIN picket_fire_stats f ON p.picket_key = f.picket_key
    LEFT JOIN fire_last_activity la ON p.picket_key = la.picket_key
    LEFT JOIN temperature_stats ts ON p.picket_key = ts.picket_key
    LEFT JOIN temp_last tl ON p.picket_key = tl.picket_key
    ORDER BY p.picket_key
    """

    params = {
        "prediction_time": prediction_time,
        # Кириллические паттерны передаются как параметры (нижний регистр)
        "smoke_pattern": "%дым%",
        "heat_pattern": "%теплов%",
        "manual_pattern": "%ручн%",
        "uirr_pattern": "%уир%",
        "temp_pattern": "%температур%",
    }
    if picket_key:
        params["picket_key"] = picket_key

    with _cursor() as cursor:
        cursor.execute(sql, params)
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()

    df = pd.DataFrame(rows, columns=columns)
    logger.info(f"B1: построено {len(df)} строк признаков")
    return df


# ════════════════════════════════════════════════════════════════
# C1: Признаки пикета (затопление)
# ════════════════════════════════════════════════════════════════

def build_c1_features(prediction_time: datetime) -> pd.DataFrame:
    """Признаки модели C1 (затопление пикета на 24 часа)."""

    sql = """
    WITH pump_events AS (
        SELECT
            ck.picket_key,
            e.occurred_at,
            CASE
                WHEN e.raw_value = %(flood_value)s THEN 'pump_flood'
                WHEN e.raw_value = ANY(%(pump_problem_values)s) THEN 'pump_problem'
                WHEN e.raw_value = %(pump_on_value)s THEN 'pump_on'
                WHEN e.raw_value = %(pump_off_value)s THEN 'pump_off'
                ELSE NULL
            END AS pump_state,
            ck.sensor_type
        FROM dashboards_sensorevent e
        INNER JOIN ml_channels_keys ck ON e.channel_id = ck.channel_id
        WHERE e.occurred_at >= %(prediction_time)s::timestamptz - INTERVAL '72 hours'
          AND e.occurred_at < %(prediction_time)s::timestamptz
          AND (
              LOWER(ck.sensor_type) LIKE %(pump_pattern)s
              OR LOWER(ck.sensor_type) LIKE %(flood_sensor_pattern)s
          )
    ),
    picket_pump_stats AS (
        SELECT
            picket_key,
            MAX(CASE WHEN LOWER(sensor_type) LIKE %(pump_pattern)s THEN 1 ELSE 0 END) AS has_pump,
            MAX(CASE WHEN LOWER(sensor_type) LIKE %(flood_sensor_pattern)s THEN 1 ELSE 0 END) AS has_flood_sensor,
            COUNT(DISTINCT CASE WHEN LOWER(sensor_type) LIKE %(pump_pattern)s THEN picket_key END) AS pump_channel_count,
            COUNT(DISTINCT CASE WHEN LOWER(sensor_type) LIKE %(flood_sensor_pattern)s THEN picket_key END) AS flood_sensor_channel_count,
            COUNT(*) FILTER (WHERE pump_state = 'pump_flood' AND occurred_at >= %(prediction_time)s::timestamptz - INTERVAL '6 hours') AS pump_flood_prev_6h,
            COUNT(*) FILTER (WHERE pump_state = 'pump_flood' AND occurred_at >= %(prediction_time)s::timestamptz - INTERVAL '24 hours') AS pump_flood_prev_24h,
            COUNT(*) FILTER (WHERE pump_state = 'pump_flood') AS pump_flood_prev_72h,
            COUNT(*) FILTER (WHERE pump_state = 'pump_problem' AND occurred_at >= %(prediction_time)s::timestamptz - INTERVAL '6 hours') AS pump_problem_prev_6h,
            COUNT(*) FILTER (WHERE pump_state = 'pump_problem' AND occurred_at >= %(prediction_time)s::timestamptz - INTERVAL '24 hours') AS pump_problem_prev_24h,
            COUNT(*) FILTER (WHERE pump_state = 'pump_problem') AS pump_problem_prev_72h,
            COUNT(*) FILTER (WHERE pump_state = 'pump_on' AND occurred_at >= %(prediction_time)s::timestamptz - INTERVAL '6 hours') AS pump_on_prev_6h,
            COUNT(*) FILTER (WHERE pump_state = 'pump_on' AND occurred_at >= %(prediction_time)s::timestamptz - INTERVAL '24 hours') AS pump_on_prev_24h,
            COUNT(*) FILTER (WHERE pump_state = 'pump_off' AND occurred_at >= %(prediction_time)s::timestamptz - INTERVAL '6 hours') AS pump_off_prev_6h,
            COUNT(*) FILTER (WHERE pump_state = 'pump_off' AND occurred_at >= %(prediction_time)s::timestamptz - INTERVAL '24 hours') AS pump_off_prev_24h
        FROM pump_events
        GROUP BY picket_key
    ),
    weather_stats AS (
        SELECT
            COALESCE(SUM(CASE WHEN observed_at >= %(prediction_time)s::timestamptz - INTERVAL '6 hours' THEN precipitation ELSE 0 END), 0) AS precipitation_prev_6h,
            COALESCE(SUM(CASE WHEN observed_at >= %(prediction_time)s::timestamptz - INTERVAL '12 hours' THEN precipitation ELSE 0 END), 0) AS precipitation_prev_12h,
            COALESCE(SUM(CASE WHEN observed_at >= %(prediction_time)s::timestamptz - INTERVAL '24 hours' THEN precipitation ELSE 0 END), 0) AS precipitation_prev_24h
        FROM dashboards_weatherhourly
        WHERE location_id = %(weather_location_id)s
          AND observed_at >= %(prediction_time)s::timestamptz - INTERVAL '24 hours'
          AND observed_at < %(prediction_time)s::timestamptz
    )

    SELECT
        p.picket_key,
        COALESCE(s.has_pump, 0) AS has_pump,
        COALESCE(s.has_flood_sensor, 0) AS has_flood_sensor,
        COALESCE(s.pump_channel_count, 0) AS pump_channel_count,
        COALESCE(s.flood_sensor_channel_count, 0) AS flood_sensor_channel_count,
        COALESCE(s.pump_flood_prev_6h, 0) AS pump_flood_prev_6h,
        COALESCE(s.pump_flood_prev_24h, 0) AS pump_flood_prev_24h,
        COALESCE(s.pump_flood_prev_72h, 0) AS pump_flood_prev_72h,
        COALESCE(s.pump_problem_prev_6h, 0) AS pump_problem_prev_6h,
        COALESCE(s.pump_problem_prev_24h, 0) AS pump_problem_prev_24h,
        COALESCE(s.pump_problem_prev_72h, 0) AS pump_problem_prev_72h,
        COALESCE(s.pump_on_prev_6h, 0) AS pump_on_prev_6h,
        COALESCE(s.pump_on_prev_24h, 0) AS pump_on_prev_24h,
        COALESCE(s.pump_off_prev_6h, 0) AS pump_off_prev_6h,
        COALESCE(s.pump_off_prev_24h, 0) AS pump_off_prev_24h,
        COALESCE(w.precipitation_prev_6h, 0) AS precipitation_prev_6h,
        COALESCE(w.precipitation_prev_12h, 0) AS precipitation_prev_12h,
        COALESCE(w.precipitation_prev_24h, 0) AS precipitation_prev_24h
    FROM (SELECT DISTINCT picket_key FROM ml_channels_keys WHERE picket_key IS NOT NULL AND picket_key != '') p
    LEFT JOIN picket_pump_stats s ON p.picket_key = s.picket_key
    CROSS JOIN weather_stats w
    ORDER BY p.picket_key
    """

    params = {
        "prediction_time": prediction_time,
        "weather_location_id": WEATHER_LOCATION_ID,
        # Кириллические значения передаются как параметры
        "flood_value": "затоплен",
        "pump_problem_values": ["неисправен", "обесточен"],
        "pump_on_value": "включен",
        "pump_off_value": "выключен",
        "pump_pattern": "%насос%",
        "flood_sensor_pattern": "%затоплен%",
    }

    with _cursor() as cursor:
        cursor.execute(sql, params)
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()

    df = pd.DataFrame(rows, columns=columns)
    logger.info(f"C1: построено {len(df)} строк признаков")
    return df


# ════════════════════════════════════════════════════════════════
# F1: Признаки оборудования × день (7d / 30d)
# ════════════════════════════════════════════════════════════════

def build_f1_features(prediction_date: datetime) -> pd.DataFrame:
    """Признаки модели F1 (отказ оборудования на 7/30 дней)."""
    lookback_days = 91

    sql = f"""
    WITH params AS (
        SELECT
            %(prediction_date)s::date AS t_day,
            %(prediction_date)s::date - INTERVAL '{lookback_days} days' AS lookback_start
    ),
    events_daily AS (
        SELECT
            ck.maintenance_unit_key,
            ck.system_key,
            CAST(e.occurred_at AS DATE) AS day,
            COUNT(*) AS event_count,
            SUM(CASE WHEN e.is_alarm THEN 1 ELSE 0 END) AS alarm_count,
            SUM(CASE WHEN COALESCE(d.event_category, 'unknown') = 'fault' THEN 1 ELSE 0 END) AS fault_count
        FROM dashboards_sensorevent e
        INNER JOIN ml_channels_keys ck ON e.channel_id = ck.channel_id
        LEFT JOIN ml_event_value_dictionary d
            ON d.sensor_value = e.raw_value
            AND LOWER(d.sensor_type) = LOWER(ck.sensor_type)
        INNER JOIN params p ON TRUE
        WHERE CAST(e.occurred_at AS DATE) >= p.lookback_start
          AND CAST(e.occurred_at AS DATE) < p.t_day
        GROUP BY ck.maintenance_unit_key, ck.system_key, CAST(e.occurred_at AS DATE)
    ),
    unit_day_windowed AS (
        SELECT
            maintenance_unit_key,
            system_key,
            day,
            SUM(event_count) OVER w_7d AS events_prev_7d,
            SUM(alarm_count) OVER w_7d AS alarms_prev_7d,
            SUM(fault_count) OVER w_7d AS faults_prev_7d,
            COUNT(*) OVER w_7d AS active_days_prev_7d,
            7 AS observed_days_prev_7d,
            GREATEST(0, 7 - COUNT(*) OVER w_7d) AS silent_days_prev_7d,

            SUM(event_count) OVER w_30d AS events_prev_30d,
            SUM(alarm_count) OVER w_30d AS alarms_prev_30d,
            SUM(fault_count) OVER w_30d AS faults_prev_30d,
            COUNT(*) OVER w_30d AS active_days_prev_30d,
            30 AS observed_days_prev_30d,
            GREATEST(0, 30 - COUNT(*) OVER w_30d) AS silent_days_prev_30d,

            SUM(event_count) OVER w_90d AS events_prev_90d,
            SUM(alarm_count) OVER w_90d AS alarms_prev_90d,
            SUM(fault_count) OVER w_90d AS faults_prev_90d,
            COUNT(*) OVER w_90d AS active_days_prev_90d,
            90 AS observed_days_prev_90d,
            GREATEST(0, 90 - COUNT(*) OVER w_90d) AS silent_days_prev_90d,

            0 AS equipment_switches_prev_7d,
            0 AS equipment_switches_prev_30d,
            0 AS equipment_switches_prev_90d,
            0 AS motion_transitions_prev_7d,
            0 AS motion_transitions_prev_30d,
            0 AS motion_transitions_prev_90d

        FROM events_daily
        WINDOW
            w_7d AS (PARTITION BY maintenance_unit_key ORDER BY day
                RANGE BETWEEN INTERVAL '7 days' PRECEDING AND INTERVAL '1 day' PRECEDING),
            w_30d AS (PARTITION BY maintenance_unit_key ORDER BY day
                RANGE BETWEEN INTERVAL '30 days' PRECEDING AND INTERVAL '1 day' PRECEDING),
            w_90d AS (PARTITION BY maintenance_unit_key ORDER BY day
                RANGE BETWEEN INTERVAL '90 days' PRECEDING AND INTERVAL '1 day' PRECEDING)
    ),
    fault_episodes_agg AS (
        SELECT
            ck.maintenance_unit_key,
            COUNT(*) FILTER (WHERE CAST(fe.episode_start_time AS DATE) >= %(prediction_date)s::date - INTERVAL '7 days') AS fault_episodes_prev_7d,
            COUNT(*) FILTER (WHERE CAST(fe.episode_start_time AS DATE) >= %(prediction_date)s::date - INTERVAL '30 days') AS fault_episodes_prev_30d,
            COUNT(*) AS fault_episodes_prev_90d,
            MAX(CAST(fe.episode_start_time AS DATE)) AS last_fault_day
        FROM ml_fault_episodes fe
        INNER JOIN ml_channels_keys ck ON fe.channel_id = ck.channel_id
        INNER JOIN params p ON TRUE
        WHERE CAST(fe.episode_start_time AS DATE) >= p.lookback_start
          AND CAST(fe.episode_start_time AS DATE) < p.t_day
        GROUP BY ck.maintenance_unit_key
    ),
    weather_daily AS (
        SELECT
            CAST(observed_at AS DATE) AS day,
            AVG(temperature_2m) AS temperature_mean,
            MIN(temperature_2m) AS temperature_min,
            MAX(temperature_2m) AS temperature_max,
            AVG(relative_humidity_2m) AS humidity_mean,
            AVG(pressure_msl) AS pressure_mean,
            COALESCE(SUM(precipitation), 0) AS precipitation_sum,
            SUM(CASE WHEN
                LAG(temperature_2m) OVER (ORDER BY observed_at) IS NOT NULL
                AND (
                    (LAG(temperature_2m) OVER (ORDER BY observed_at) < 0 AND temperature_2m >= 0)
                    OR (LAG(temperature_2m) OVER (ORDER BY observed_at) >= 0 AND temperature_2m < 0)
                )
                THEN 1 ELSE 0 END) AS freeze_thaw_transitions
        FROM dashboards_weatherhourly
        WHERE location_id = %(weather_location_id)s
          AND observed_at >= (SELECT lookback_start FROM params)
          AND observed_at < (SELECT t_day FROM params)::timestamptz
        GROUP BY CAST(observed_at AS DATE)
    ),
    weather_windowed AS (
        SELECT
            day,
            SUM(precipitation_sum) OVER w_7d AS precipitation_prev_7d,
            AVG(temperature_mean) OVER w_7d AS temperature_mean_prev_7d,
            MIN(temperature_min) OVER w_7d AS temperature_min_prev_7d,
            MAX(temperature_max) OVER w_7d AS temperature_max_prev_7d,
            AVG(humidity_mean) OVER w_7d AS humidity_mean_prev_7d,
            AVG(pressure_mean) OVER w_7d AS pressure_mean_prev_7d,
            SUM(freeze_thaw_transitions) OVER w_7d AS freeze_thaw_days_prev_7d,

            SUM(precipitation_sum) OVER w_30d AS precipitation_prev_30d,
            AVG(temperature_mean) OVER w_30d AS temperature_mean_prev_30d,
            MIN(temperature_min) OVER w_30d AS temperature_min_prev_30d,
            MAX(temperature_max) OVER w_30d AS temperature_max_prev_30d,
            AVG(humidity_mean) OVER w_30d AS humidity_mean_prev_30d,
            AVG(pressure_mean) OVER w_30d AS pressure_mean_prev_30d,
            SUM(freeze_thaw_transitions) OVER w_30d AS freeze_thaw_days_prev_30d,

            SUM(precipitation_sum) OVER w_90d AS precipitation_prev_90d,
            AVG(temperature_mean) OVER w_90d AS temperature_mean_prev_90d,
            MIN(temperature_min) OVER w_90d AS temperature_min_prev_90d,
            MAX(temperature_max) OVER w_90d AS temperature_max_prev_90d,
            AVG(humidity_mean) OVER w_90d AS humidity_mean_prev_90d,
            AVG(pressure_mean) OVER w_90d AS pressure_mean_prev_90d,
            SUM(freeze_thaw_transitions) OVER w_90d AS freeze_thaw_days_prev_90d
        FROM weather_daily
        WINDOW
            w_7d AS (ORDER BY day RANGE BETWEEN INTERVAL '7 days' PRECEDING AND INTERVAL '1 day' PRECEDING),
            w_30d AS (ORDER BY day RANGE BETWEEN INTERVAL '30 days' PRECEDING AND INTERVAL '1 day' PRECEDING),
            w_90d AS (ORDER BY day RANGE BETWEEN INTERVAL '90 days' PRECEDING AND INTERVAL '1 day' PRECEDING)
    )

    SELECT
        u.maintenance_unit_key,
        u.system_key,
        %(prediction_date)s::date AS day,

        COALESCE(u.events_prev_7d, 0) AS events_prev_7d,
        COALESCE(u.alarms_prev_7d, 0) AS alarms_prev_7d,
        COALESCE(u.faults_prev_7d, 0) AS faults_prev_7d,
        COALESCE(f.fault_episodes_prev_7d, 0) AS fault_episodes_prev_7d,
        COALESCE(u.equipment_switches_prev_7d, 0) AS equipment_switches_prev_7d,
        COALESCE(u.motion_transitions_prev_7d, 0) AS motion_transitions_prev_7d,
        COALESCE(u.active_days_prev_7d, 0) AS active_days_prev_7d,
        COALESCE(u.observed_days_prev_7d, 7) AS observed_days_prev_7d,
        COALESCE(u.silent_days_prev_7d, 7) AS silent_days_prev_7d,

        COALESCE(u.events_prev_30d, 0) AS events_prev_30d,
        COALESCE(u.alarms_prev_30d, 0) AS alarms_prev_30d,
        COALESCE(u.faults_prev_30d, 0) AS faults_prev_30d,
        COALESCE(f.fault_episodes_prev_30d, 0) AS fault_episodes_prev_30d,
        COALESCE(u.equipment_switches_prev_30d, 0) AS equipment_switches_prev_30d,
        COALESCE(u.motion_transitions_prev_30d, 0) AS motion_transitions_prev_30d,
        COALESCE(u.active_days_prev_30d, 0) AS active_days_prev_30d,
        COALESCE(u.observed_days_prev_30d, 30) AS observed_days_prev_30d,
        COALESCE(u.silent_days_prev_30d, 30) AS silent_days_prev_30d,

        COALESCE(u.events_prev_90d, 0) AS events_prev_90d,
        COALESCE(u.alarms_prev_90d, 0) AS alarms_prev_90d,
        COALESCE(u.faults_prev_90d, 0) AS faults_prev_90d,
        COALESCE(f.fault_episodes_prev_90d, 0) AS fault_episodes_prev_90d,
        COALESCE(u.equipment_switches_prev_90d, 0) AS equipment_switches_prev_90d,
        COALESCE(u.motion_transitions_prev_90d, 0) AS motion_transitions_prev_90d,
        COALESCE(u.active_days_prev_90d, 0) AS active_days_prev_90d,
        COALESCE(u.observed_days_prev_90d, 90) AS observed_days_prev_90d,
        COALESCE(u.silent_days_prev_90d, 90) AS silent_days_prev_90d,

        COALESCE(
            %(prediction_date)s::date - f.last_fault_day,
            9999
        ) AS days_since_last_fault_episode,

        CASE WHEN COALESCE(f.fault_episodes_prev_7d, 0) > 0 THEN 1 ELSE 0 END AS had_fault_prev_7d,
        CASE WHEN COALESCE(f.fault_episodes_prev_30d, 0) > 0 THEN 1 ELSE 0 END AS had_fault_prev_30d,
        CASE WHEN COALESCE(f.fault_episodes_prev_90d, 0) > 0 THEN 1 ELSE 0 END AS had_fault_prev_90d,

        CASE WHEN COALESCE(f.fault_episodes_prev_7d, 0) > 1 THEN 1 ELSE 0 END AS repeated_fault_prev_7d,
        CASE WHEN COALESCE(f.fault_episodes_prev_30d, 0) > 1 THEN 1 ELSE 0 END AS repeated_fault_prev_30d,
        CASE WHEN COALESCE(f.fault_episodes_prev_90d, 0) > 1 THEN 1 ELSE 0 END AS repeated_fault_prev_90d,

        1 AS system_context_available_flag,
        0 AS system_events_prev_7d,
        0 AS system_alarms_prev_7d,
        0 AS system_faults_prev_7d,
        0 AS system_fault_episodes_prev_7d,
        0 AS system_active_days_prev_7d,
        0 AS system_avg_faulty_share_prev_7d,
        0 AS system_avg_silent_share_prev_7d,

        0 AS system_events_prev_30d,
        0 AS system_alarms_prev_30d,
        0 AS system_faults_prev_30d,
        0 AS system_fault_episodes_prev_30d,
        0 AS system_active_days_prev_30d,
        0 AS system_avg_faulty_share_prev_30d,
        0 AS system_avg_silent_share_prev_30d,

        0 AS system_events_prev_90d,
        0 AS system_alarms_prev_90d,
        0 AS system_faults_prev_90d,
        0 AS system_fault_episodes_prev_90d,
        0 AS system_active_days_prev_90d,
        0 AS system_avg_faulty_share_prev_90d,
        0 AS system_avg_silent_share_prev_90d,

        COALESCE(w.precipitation_prev_7d, 0) AS precipitation_prev_7d,
        COALESCE(w.temperature_mean_prev_7d, 0) AS temperature_mean_prev_7d,
        COALESCE(w.temperature_min_prev_7d, 0) AS temperature_min_prev_7d,
        COALESCE(w.temperature_max_prev_7d, 0) AS temperature_max_prev_7d,
        COALESCE(w.humidity_mean_prev_7d, 0) AS humidity_mean_prev_7d,
        COALESCE(w.pressure_mean_prev_7d, 0) AS pressure_mean_prev_7d,
        COALESCE(w.freeze_thaw_days_prev_7d, 0) AS freeze_thaw_days_prev_7d,

        COALESCE(w.precipitation_prev_30d, 0) AS precipitation_prev_30d,
        COALESCE(w.temperature_mean_prev_30d, 0) AS temperature_mean_prev_30d,
        COALESCE(w.temperature_min_prev_30d, 0) AS temperature_min_prev_30d,
        COALESCE(w.temperature_max_prev_30d, 0) AS temperature_max_prev_30d,
        COALESCE(w.humidity_mean_prev_30d, 0) AS humidity_mean_prev_30d,
        COALESCE(w.pressure_mean_prev_30d, 0) AS pressure_mean_prev_30d,
        COALESCE(w.freeze_thaw_days_prev_30d, 0) AS freeze_thaw_days_prev_30d,

        COALESCE(w.precipitation_prev_90d, 0) AS precipitation_prev_90d,
        COALESCE(w.temperature_mean_prev_90d, 0) AS temperature_mean_prev_90d,
        COALESCE(w.temperature_min_prev_90d, 0) AS temperature_min_prev_90d,
        COALESCE(w.temperature_max_prev_90d, 0) AS temperature_max_prev_90d,
        COALESCE(w.humidity_mean_prev_90d, 0) AS humidity_mean_prev_90d,
        COALESCE(w.pressure_mean_prev_90d, 0) AS pressure_mean_prev_90d,
        COALESCE(w.freeze_thaw_days_prev_90d, 0) AS freeze_thaw_days_prev_90d

    FROM unit_day_windowed u
    LEFT JOIN fault_episodes_agg f
        ON u.maintenance_unit_key = f.maintenance_unit_key
    LEFT JOIN weather_windowed w
        ON u.day = w.day
    WHERE u.day = %(prediction_date)s::date - INTERVAL '1 day'
    ORDER BY u.maintenance_unit_key
    """

    params = {
        "prediction_date": prediction_date,
        "weather_location_id": WEATHER_LOCATION_ID,
    }

    with _cursor() as cursor:
        cursor.execute(sql, params)
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()

    df = pd.DataFrame(rows, columns=columns)
    logger.info(f"F1: построено {len(df)} строк признаков")
    return df