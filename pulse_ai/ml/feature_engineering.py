"""
Подготовка признаков для моделей предсказания отказов.
"""
import logging
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from django.db import connections

logger = logging.getLogger(__name__)


class FeatureEngineeringService:
    """
    Сервис подготовки признаков для моделей.
    Все запросы идут через прямое подключение к PostgreSQL
    (минуя pgBouncer) для использования оконных функций.
    """

    # Используем подключение 'direct' из settings.py
    DB_ALIAS = "direct"

    # SQL для определения категории события из значения датчика
    EVENT_CATEGORY_SQL = """
        CASE
            WHEN s.значение_датчика = ANY(%(fault_values)s) 
                THEN 'fault'
            WHEN s.значение_датчика = ANY(%(warning_values)s) 
                THEN 'warning'
            WHEN s.значение_датчика = ANY(%(detection_values)s) 
                THEN 'detection'
            ELSE 'normal'
        END
    """

    def __init__(self):
        from pulse_ai.ml.constants import EVENT_CATEGORIES
        self.fault_values = EVENT_CATEGORIES["fault"]
        self.warning_values = EVENT_CATEGORIES["warning"]
        self.detection_values = EVENT_CATEGORIES["detection"]

    def _get_cursor(self):
        """Получаем курсор прямого подключения к БД."""
        return connections[self.DB_ALIAS].cursor()

    # ================================================================
    # A3: признаки на уровне канала (channel × hour)
    # ================================================================

    def build_a3_features(
        self,
        prediction_time: datetime,
        channel_id: Optional[int] = None,
    ) -> pd.DataFrame:
        """
        Подготовка признаков для модели A3 
        (отказ канала в следующие 24 часа).

        Адаптация ячеек 11-90 исходного ноутбука:
        - Базовая агрегация канал × час
        - Часы с момента последней активности
        - Доли пропущенных интервалов
        - Счётчики событий по категориям в скользящих окнах
        """
        lookback_days = 31  # Нужно для 30-дневных окон

        sql = """
        WITH params AS (
            SELECT 
                %(prediction_time)s::timestamptz AS t,
                (%(prediction_time)s::timestamptz - INTERVAL '%(lookback_days)s days') 
                    AS lookback_start
        ),
        
        -- Категория события из значения датчика
        events_with_category AS (
            SELECT
                e.channel_id AS ид_канала_данных,
                e.event_time AS timestamp,
                e.is_alert AS тревожное,
                DATE_TRUNC('hour', e.event_time) AS hour,
                CASE
                    WHEN e.text_value = ANY(%(fault_values)s) THEN 'fault'
                    WHEN e.text_value = ANY(%(warning_values)s) THEN 'warning'
                    WHEN e.text_value = ANY(%(detection_values)s) THEN 'detection'
                    ELSE 'normal'
                END AS event_category
            FROM sensors_sensorevent e, params p
            WHERE e.event_time >= p.lookback_start
              AND e.event_time < p.t
              {channel_filter}
        ),
        
        -- Базовая агрегация канал × час
        channel_hour_base AS (
            SELECT
                ид_канала_данных,
                hour,
                COUNT(*) AS event_count,
                SUM(CASE WHEN тревожное THEN 1 ELSE 0 END) AS alarm_count,
                SUM(CASE WHEN event_category = 'fault' THEN 1 ELSE 0 END) 
                    AS fault_event_count,
                SUM(CASE WHEN event_category = 'warning' THEN 1 ELSE 0 END) 
                    AS warning_event_count,
                SUM(CASE WHEN event_category = 'detection' THEN 1 ELSE 0 END) 
                    AS detection_event_count,
                SUM(CASE WHEN event_category = 'normal' THEN 1 ELSE 0 END) 
                    AS normal_event_count
            FROM events_with_category
            GROUP BY ид_канала_данных, hour
        ),
        
        -- Активные часы + часы с момента последней активности
        channel_hour_activity AS (
            SELECT
                ид_канала_данных,
                hour,
                event_count,
                alarm_count,
                fault_event_count,
                warning_event_count,
                detection_event_count,
                normal_event_count,
                
                -- Часы с момента предыдущей активности
                EXTRACT(EPOCH FROM (
                    (SELECT p.t FROM params p) - LAG(hour) OVER (
                        PARTITION BY ид_канала_данных 
                        ORDER BY hour
                    )
                )) / 3600.0 AS hours_since_previous_active,
                
                -- Скользящие счётчики по категориям
                SUM(event_count) OVER (
                    PARTITION BY ид_канала_данных
                    ORDER BY hour
                    RANGE BETWEEN INTERVAL '1 hour' PRECEDING 
                        AND INTERVAL '1 microsecond' PRECEDING
                ) AS event_count_prev_1h,
                
                SUM(event_count) OVER (
                    PARTITION BY ид_канала_данных
                    ORDER BY hour
                    RANGE BETWEEN INTERVAL '24 hours' PRECEDING 
                        AND INTERVAL '1 microsecond' PRECEDING
                ) AS event_count_prev_24h,
                
                SUM(alarm_count) OVER (
                    PARTITION BY ид_канала_данных
                    ORDER BY hour
                    RANGE BETWEEN INTERVAL '24 hours' PRECEDING 
                        AND INTERVAL '1 microsecond' PRECEDING
                ) AS alarm_count_prev_24h,
                
                SUM(fault_event_count) OVER (
                    PARTITION BY ид_канала_данных
                    ORDER BY hour
                    RANGE BETWEEN INTERVAL '1 hour' PRECEDING 
                        AND INTERVAL '1 microsecond' PRECEDING
                ) AS fault_cat_prev_1h,
                
                SUM(fault_event_count) OVER (
                    PARTITION BY ид_канала_данных
                    ORDER BY hour
                    RANGE BETWEEN INTERVAL '24 hours' PRECEDING 
                        AND INTERVAL '1 microsecond' PRECEDING
                ) AS fault_cat_prev_24h,
                
                SUM(fault_event_count) OVER (
                    PARTITION BY ид_канала_данных
                    ORDER BY hour
                    RANGE BETWEEN INTERVAL '7 days' PRECEDING 
                        AND INTERVAL '1 microsecond' PRECEDING
                ) AS fault_cat_prev_7d,
                
                SUM(fault_event_count) OVER (
                    PARTITION BY ид_канала_данных
                    ORDER BY hour
                    RANGE BETWEEN INTERVAL '30 days' PRECEDING 
                        AND INTERVAL '1 microsecond' PRECEDING
                ) AS fault_cat_prev_30d,
                
                -- Число часов с активностью за предыдущие 24 часа
                COUNT(*) OVER (
                    PARTITION BY ид_канала_данных
                    ORDER BY hour
                    RANGE BETWEEN INTERVAL '24 hours' PRECEDING 
                        AND INTERVAL '1 microsecond' PRECEDING
                ) AS active_hours_prev_24h
                
            FROM channel_hour_base
        )
        
        -- Финальная выборка: только час прогноза
        SELECT
            ид_канала_данных,
            hour,
            COALESCE(event_count, 0) AS event_count_prev_1h,
            COALESCE(event_count_prev_24h, 0) AS event_count_prev_24h,
            COALESCE(alarm_count_prev_24h, 0) AS alarm_count_prev_24h,
            COALESCE(fault_cat_prev_1h, 0) AS fault_cat_prev_1h,
            COALESCE(fault_cat_prev_24h, 0) AS fault_cat_prev_24h,
            COALESCE(fault_cat_prev_7d, 0) AS fault_cat_prev_7d,
            COALESCE(fault_cat_prev_30d, 0) AS fault_cat_prev_30d,
            COALESCE(active_hours_prev_24h, 0) AS active_hours_prev_24h,
            
            -- Доля пропущенных интервалов за 24 часа
            LEAST(24, GREATEST(1,
                COALESCE(active_hours_prev_24h, 0)
            )) AS observable_hours_prev_24h,
            1.0 - (
                COALESCE(active_hours_prev_24h, 0)::numeric 
                / LEAST(24, GREATEST(1, COALESCE(active_hours_prev_24h, 0)))
            ) AS missing_interval_share_24h,
            
            -- Флаг тишины за 24 часа
            CASE 
                WHEN COALESCE(event_count_prev_24h, 0) = 0 THEN 1 
                ELSE 0 
            END AS silent_prev_24h_flag,
            
            -- Часы тишины перед прогнозом
            COALESCE(hours_since_previous_active, 0) AS silent_hours_before
            
        FROM channel_hour_activity
        WHERE hour = DATE_TRUNC('hour', %(prediction_time)s::timestamptz)
        ORDER BY ид_канала_данных
        """

        # Фильтр по конкретному каналу (если задан)
        channel_filter = (
            "AND e.channel_id = %(channel_id)s" if channel_id else ""
        )
        sql = sql.format(channel_filter=channel_filter)

        params = {
            "prediction_time": prediction_time,
            "lookback_days": lookback_days,
            "fault_values": self.fault_values,
            "warning_values": self.warning_values,
            "detection_values": self.detection_values,
        }
        if channel_id:
            params["channel_id"] = channel_id

        with self._get_cursor() as cursor:
            cursor.execute(sql, params)
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()

        df = pd.DataFrame(rows, columns=columns)
        logger.info(
            "A3 features built: %d rows for %d channels",
            len(df), df["ид_канала_данных"].nunique() if len(df) else 0
        )
        return df

    # ================================================================
    # A4: признаки на уровне системы (system × hour)
    # ================================================================

    def build_a4_features(
        self,
        prediction_time: datetime,
        system_key: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        Признаки инженерных систем для модели A4.
        Адаптация ячеек 143-144 исходного ноутбука:
        - Режимы оборудования (насосы, вентиляторы)
        - 15-минутные каскады событий
        """
        sql = """
        WITH mode_events AS (
            SELECT
                ck.system_key,
                e.event_time,
                e.text_value AS mode_state
            FROM sensors_sensorevent e
            INNER JOIN channels_keys ck 
                ON CAST(e.channel_id AS VARCHAR) = ck.ид_канала_данных
            WHERE e.event_time >= %(lookback_start)s
              AND e.event_time < %(prediction_time)s
              {system_filter}
        ),
        
        -- 15-минутные каскады (аналог ячейки 144)
        system_cascade_15m AS (
            SELECT
                system_key,
                DATE_TRUNC('hour', event_time)
                    + INTERVAL '1 minute' 
                    * (FLOOR(EXTRACT(MINUTE FROM event_time) / 15) * 15)
                    AS bucket_15m,
                COUNT(*) AS signal_event_count,
                COUNT(DISTINCT mode_state) AS mode_state_count
            FROM mode_events
            GROUP BY system_key, bucket_15m
        ),
        
        -- Агрегаты за предыдущие 24 часа
        system_history AS (
            SELECT
                system_key,
                COUNT(*) FILTER (WHERE mode_state = 'power_off') 
                    AS power_off_events_prev_24h,
                COUNT(*) FILTER (WHERE mode_state = 'pump_on') 
                    AS pump_on_events_prev_24h,
                COUNT(*) FILTER (
                    WHERE mode_state IN (
                        'pump_fault', 'pump_deenergized', 'pump_flooded'
                    )
                ) AS pump_problem_events_prev_24h,
                COUNT(*) FILTER (WHERE mode_state = 'fan_on') 
                    AS fan_on_events_prev_24h,
                COUNT(*) FILTER (
                    WHERE mode_state IN ('fan_fault', 'fan_stopped')
                ) AS fan_problem_events_prev_24h,
                COUNT(*) AS system_event_count_prev_24h
            FROM mode_events
            WHERE event_time >= (%(prediction_time)s::timestamptz - INTERVAL '24 hours')
            GROUP BY system_key
        ),
        
        cascade_stats AS (
            SELECT
                system_key,
                COUNT(*) AS cascade_15m_count_prev_24h,
                MAX(signal_event_count) AS max_channels_in_15m_prev_24h
            FROM system_cascade_15m
            WHERE bucket_15m >= (%(prediction_time)s::timestamptz - INTERVAL '24 hours')
            GROUP BY system_key
        )
        
        SELECT
            h.system_key,
            %(prediction_time)s::timestamptz AS hour,
            COALESCE(h.power_off_events_prev_24h, 0) AS power_off_events_prev_24h,
            COALESCE(h.pump_on_events_prev_24h, 0) AS pump_on_events_prev_24h,
            COALESCE(h.pump_problem_events_prev_24h, 0) AS pump_problem_events_prev_24h,
            COALESCE(h.fan_on_events_prev_24h, 0) AS fan_on_events_prev_24h,
            COALESCE(h.fan_problem_events_prev_24h, 0) AS fan_problem_events_prev_24h,
            COALESCE(h.system_event_count_prev_24h, 0) AS system_event_count_prev_24h,
            COALESCE(c.cascade_15m_count_prev_24h, 0) AS cascade_15m_count_prev_24h,
            COALESCE(c.max_channels_in_15m_prev_24h, 0) AS max_channels_in_15m_prev_24h
        FROM system_history h
        LEFT JOIN cascade_stats c USING (system_key)
        ORDER BY h.system_key
        """

        system_filter = (
            "AND ck.system_key = %(system_key)s" if system_key else ""
        )
        sql = sql.format(system_filter=system_filter)

        params = {
            "prediction_time": prediction_time,
            "lookback_start": prediction_time - timedelta(hours=25),
        }
        if system_key:
            params["system_key"] = system_key

        with self._get_cursor() as cursor:
            cursor.execute(sql, params)
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()

        return pd.DataFrame(rows, columns=columns)

    # ================================================================
    # Универсальный метод
    # ================================================================

    def build_features(
        self,
        model_name: str,
        prediction_time: datetime,
        entity_id: Optional[str] = None,
    ) -> pd.DataFrame:
        """Универсальная точка входа для подготовки признаков."""
        from pulse_ai.ml.constants import MODEL_REGISTRY
        
        if model_name not in MODEL_REGISTRY:
            raise ValueError(f"Unknown model: {model_name}")

        builder_map = {
            "A3": self.build_a3_features,
            "A4": self.build_a4_features,
            # B1, C1, F1 добавляются по аналогии
        }
        
        builder = builder_map.get(model_name)
        if builder is None:
            raise NotImplementedError(f"Feature builder for {model_name} not implemented")
        
        return builder(prediction_time, entity_id)