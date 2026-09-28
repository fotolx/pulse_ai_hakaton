"""
Справочник признаков моделей.
"""

# Временные окна для скользящих статистик
ROLLING_WINDOWS = {
    "1h": "1 hour",
    "6h": "6 hours",
    "24h": "24 hours",
    "72h": "72 hours",
    "7d": "7 days",
    "30d": "30 days",
}

# Категории событий (из event_value_dictionary)
EVENT_CATEGORIES = {
    "fault": [
        "Отказ", "Неисправность", "Обрыв", "КЗ", "Ошибка",
        "Задымление", "Загазованность", "Протечка",
    ],
    "warning": [
        "Внимание", "Предупреждение", "Низкий заряд", "Перегрев",
    ],
    "detection": [
        "Обнаружено движение", "Открыта дверь", "Доступ",
        "Дым", "Огонь",
    ],
    "normal": [
        "Норма", "Закрыто", "Движения нет", "Есть питание",
    ],
}

# ============================================================
# A3: признаки отказа канала на 24 часа вперёд (147 признаков)
# ============================================================
A3_FEATURE_COLUMNS = [
    # --- Активность и тишина ---
    "hours_since_previous_active",
    "silent_hours_before",
    
    # --- История эпизодов отказов ---
    "hours_since_last_fault_episode",
    "fault_episodes_prev_7d",
    "fault_episodes_prev_30d",
    "active_fault_flag",
    
    # --- Доли пропущенных интервалов ---
    "missing_interval_share_1h",
    "missing_interval_share_6h",
    "missing_interval_share_24h",
    "missing_interval_share_72h",
    "missing_interval_share_7d",
    "missing_interval_share_30d",
    
    # --- Счётчики событий по категориям в скользящих окнах ---
    *[f"{cat}_cat_prev_{window}" 
      for cat in ["fault", "warning", "detection", "normal"]
      for window in ["1h", "6h", "24h", "72h", "7d", "30d"]],
    
    # --- Тревоги ---
    *[f"alarm_count_prev_{w}" for w in ["1h", "6h", "24h", "72h", "7d", "30d"]],
    
    # --- Переключения оборудования ---
    "equipment_switch_count_prev_24h",
    "motion_transition_count_prev_24h",
    
    # --- Энтропия значений датчика ---
    "value_entropy_prev_24h",
    "value_entropy_prev_7d",
    
    # --- Системный контекст (взаимное сравнение с другими каналами) ---
    "system_event_count_prev_24h",
    "system_alarm_count_prev_24h",
    "system_fault_event_count_prev_24h",
    "system_active_channel_count_prev_24h",
    "peer_event_ratio_prev_24h",
    "peer_alarm_ratio_prev_24h",
    
    # --- Лаги (точные календарные) ---
    *[f"event_count_lag_{w}" for w in ["1h", "6h", "24h", "72h", "7d", "30d"]],
    
    # --- Флаги тишины ---
    *[f"silent_prev_{w}_flag" for w in ["1h", "6h", "24h", "72h", "7d", "30d"]],
]

# ============================================================
# A4: признаки эпизода отказа системы на 24 часа вперёд
# ============================================================
A4_FEATURE_COLUMNS = [
    "power_off_events_prev_24h",
    "pump_on_events_prev_24h",
    "pump_problem_events_prev_24h",
    "fan_on_events_prev_24h",
    "fan_problem_events_prev_24h",
    "cascade_15m_count_prev_24h",
    "max_channels_in_15m_prev_24h",
    "system_event_count_prev_24h",
    "system_alarm_count_prev_24h",
    "system_fault_event_count_prev_24h",
]

# ============================================================
# B1: признаки пожара на пикете на 24 часа вперёд
# ============================================================
B1_FEATURE_COLUMNS = [
    "uirr_prev_24h",
    "uirr_channels_prev_24h",
    "fire_last_activity_age_h",
    "temp_last_value",
    "temp_last_age_h",
    "temp_max_prev_24h",
    "temp_min_prev_24h",
    "temp_mean_prev_24h",
]

# ============================================================
# C1: признаки затопления на пикете на 24 часа вперёд
# ============================================================
C1_FEATURE_COLUMNS = [
    "precipitation_prev_12h",
    "precipitation_prev_24h",
    "flooding_last_activity_age_h",
    "water_sensor_activity_prev_24h",
]

# ============================================================
# F1: признаки отказа оборудования на 7/30 дней вперёд
# ============================================================
F1_FEATURE_COLUMNS = [
    # История отказов
    "fault_episodes_prev_7d",
    "fault_episodes_prev_30d",
    "fault_episodes_prev_90d",
    "days_since_last_fault_episode",
    # Погода за 7 дней
    "precipitation_prev_7d",
    "temperature_mean_prev_7d",
    "temperature_min_prev_7d",
    "temperature_max_prev_7d",
    "humidity_mean_prev_7d",
    "pressure_mean_prev_7d",
    "freeze_thaw_days_prev_7d",
    # Погода за 30 дней
    "precipitation_prev_30d",
    "temperature_mean_prev_30d",
    "temperature_min_prev_30d",
    "temperature_max_prev_30d",
    "humidity_mean_prev_30d",
    "pressure_mean_prev_30d",
    "freeze_thaw_days_prev_30d",
    # Погода за 90 дней
    "precipitation_prev_90d",
    "temperature_mean_prev_90d",
    "temperature_min_prev_90d",
    "temperature_max_prev_90d",
]

MODEL_REGISTRY = {
    "A3": {
        "model_path": "ml/models/a3_catboost_final_2025.cbm",
        "features": A3_FEATURE_COLUMNS,
        "granularity": "channel",  # channel_key × hour
        "horizon_hours": 24,
    },
    "A4": {
        "model_path": "ml/models/a4_catboost_final_2025.cbm",
        "features": A4_FEATURE_COLUMNS,
        "granularity": "system",   # system_key × hour
        "horizon_hours": 24,
    },
    "B1": {
        "model_path": "ml/models/b1_catboost_final_2025.cbm",
        "features": B1_FEATURE_COLUMNS,
        "granularity": "picket",   # picket_key × hour
        "horizon_hours": 24,
    },
    "C1": {
        "model_path": "ml/models/c1_catboost_final_2025.cbm",
        "features": C1_FEATURE_COLUMNS,
        "granularity": "picket",
        "horizon_hours": 24,
    },
    "F1_7d": {
        "model_path": "ml/models/f1_7d_catboost_final_2025.cbm",
        "features": F1_FEATURE_COLUMNS,
        "granularity": "maintenance_unit",  # maintenance_unit_key × day
        "horizon_days": 7,
    },
    "F1_30d": {
        "model_path": "ml/models/f1_30d_catboost_final_2025.cbm",
        "features": F1_FEATURE_COLUMNS,
        "granularity": "maintenance_unit",
        "horizon_days": 30,
    },
}