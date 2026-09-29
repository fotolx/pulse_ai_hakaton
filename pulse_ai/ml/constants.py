"""
Реестр моделей, признаков и констант.
Источник: model_features_dictionary_2025.csv
"""
from pathlib import Path
from django.conf import settings

MODELS_DIR = Path(settings.BASE_DIR) / "ml" / "models"
DATA_DIR = Path(settings.BASE_DIR) / "data"

# ────────────────────────────────────────────────────────────────
# Временные окна
# ────────────────────────────────────────────────────────────────
_WINDOWS = ["1h", "6h", "24h", "72h", "7d", "30d"]
_F1_WINDOWS = ["7d", "30d", "90d"]
_CATEGORIES = ["fault", "warning", "detection", "normal", "unknown"]

# ────────────────────────────────────────────────────────────────
# A3: признаки канала (148 признаков)
# ────────────────────────────────────────────────────────────────
A3_FEATURE_COLUMNS = [
    "hours_since_previous_active",
    "silent_hours_before",
    "hours_since_last_fault_episode",
    *[f"events_prev_{w}" for w in _WINDOWS],
    *[f"alarms_prev_{w}" for w in _WINDOWS],
    *[f"faults_prev_{w}" for w in _WINDOWS],
    *[f"active_hours_prev_{w}" for w in _WINDOWS],
    *[f"observable_hours_prev_{w}" for w in _WINDOWS],
    *[f"missing_interval_share_{w}" for w in _WINDOWS],
    *[f"equipment_switches_prev_{w}" for w in _WINDOWS],
    *[f"motion_transitions_prev_{w}" for w in _WINDOWS],
    *[f"event_category_entropy_prev_{w}" for w in _WINDOWS],
    *[f"event_intensity_prev_{w}" for w in _WINDOWS],
    *[f"system_events_prev_{w}" for w in _WINDOWS],
    *[f"system_alarms_prev_{w}" for w in _WINDOWS],
    *[f"system_faults_prev_{w}" for w in _WINDOWS],
    *[f"peer_event_ratio_prev_{w}" for w in _WINDOWS],
    *[f"system_event_share_prev_{w}" for w in _WINDOWS],
    *[f"{cat}_cat_prev_{w}" for w in _WINDOWS for cat in _CATEGORIES],
    *[f"event_count_lag_{w}" for w in _WINDOWS],
    *[f"alarm_count_lag_{w}" for w in _WINDOWS],
    *[f"fault_count_lag_{w}" for w in _WINDOWS],
    *[f"silent_prev_{w}_flag" for w in _WINDOWS],
    "sensor_type",
]

# ────────────────────────────────────────────────────────────────
# A4: признаки системы (30 признаков)
# ────────────────────────────────────────────────────────────────
A4_FEATURE_COLUMNS = [
    *[f"system_events_prev_{w}" for w in _WINDOWS],
    *[f"system_alarms_prev_{w}" for w in _WINDOWS],
    *[f"system_faults_prev_{w}" for w in _WINDOWS],
    "power_off_events_prev_24h",
    "pump_on_events_prev_24h",
    "pump_problem_events_prev_24h",
    "fan_on_events_prev_24h",
    "fan_problem_events_prev_24h",
    "cascade_15m_count_prev_24h",
    "max_channels_in_15m_prev_24h",
    "neighbor_events_prev_24h",
    "neighbor_alarms_prev_24h",
    "neighbor_faults_prev_24h",
    "object_id",
    "system_type",
]

# ────────────────────────────────────────────────────────────────
# B1: признаки пикета (20 признаков)
# ────────────────────────────────────────────────────────────────
B1_FEATURE_COLUMNS = [
    "fire_any_prev_24h",
    "fire_active_channels_prev_24h",
    "fire_sensor_types_prev_24h",
    "fire_multi_channel_prev_24h",
    "fire_multi_type_prev_24h",
    "smoke_prev_24h",
    "smoke_channels_prev_24h",
    "heat_prev_24h",
    "heat_channels_prev_24h",
    "manual_alarm_prev_24h",
    "manual_alarm_channels_prev_24h",
    "uirr_prev_24h",
    "uirr_channels_prev_24h",
    "fire_last_activity_age_h",
    "temp_last_value",
    "temp_last_age_h",
    "temp_max_prev_24h",
    "temp_min_prev_24h",
    "temp_mean_prev_24h",
    "temp_max_rise_prev_24h",
]

# ────────────────────────────────────────────────────────────────
# C1: признаки затопления (17 признаков)
# ────────────────────────────────────────────────────────────────
C1_FEATURE_COLUMNS = [
    "has_pump",
    "has_flood_sensor",
    "pump_channel_count",
    "flood_sensor_channel_count",
    "pump_flood_prev_6h",
    "pump_flood_prev_24h",
    "pump_flood_prev_72h",
    "pump_problem_prev_6h",
    "pump_problem_prev_24h",
    "pump_problem_prev_72h",
    "pump_on_prev_6h",
    "pump_on_prev_24h",
    "pump_off_prev_6h",
    "pump_off_prev_24h",
    "precipitation_prev_6h",
    "precipitation_prev_12h",
    "precipitation_prev_24h",
]

# ────────────────────────────────────────────────────────────────
# D1: признаки эпизода доступа (11 признаков)
# ────────────────────────────────────────────────────────────────
D1_FEATURE_COLUMNS = [
    "log_duration",
    "log_signal_count",
    "log_confirming_channels",
    "hour_sin",
    "hour_cos",
    "weekend_flag",
    "hour_rarity_train",
    "guard_known_flag",
    "known_picket_flag",
    "door_signal_flag",
    "hatch_signal_flag",
]

# ────────────────────────────────────────────────────────────────
# F1: признаки оборудования (77 признаков, одинаковый для 7d и 30d)
# ────────────────────────────────────────────────────────────────
F1_FEATURE_COLUMNS = [
    *[f"events_prev_{w}" for w in _F1_WINDOWS],
    *[f"alarms_prev_{w}" for w in _F1_WINDOWS],
    *[f"faults_prev_{w}" for w in _F1_WINDOWS],
    *[f"fault_episodes_prev_{w}" for w in _F1_WINDOWS],
    *[f"equipment_switches_prev_{w}" for w in _F1_WINDOWS],
    *[f"motion_transitions_prev_{w}" for w in _F1_WINDOWS],
    *[f"active_days_prev_{w}" for w in _F1_WINDOWS],
    *[f"observed_days_prev_{w}" for w in _F1_WINDOWS],
    *[f"silent_days_prev_{w}" for w in _F1_WINDOWS],
    "days_since_last_fault_episode",
    *[f"had_fault_prev_{w}" for w in _F1_WINDOWS],
    *[f"repeated_fault_prev_{w}" for w in _F1_WINDOWS],
    "system_context_available_flag",
    *[f"system_events_prev_{w}" for w in _F1_WINDOWS],
    *[f"system_alarms_prev_{w}" for w in _F1_WINDOWS],
    *[f"system_faults_prev_{w}" for w in _F1_WINDOWS],
    *[f"system_fault_episodes_prev_{w}" for w in _F1_WINDOWS],
    *[f"system_active_days_prev_{w}" for w in _F1_WINDOWS],
    *[f"system_avg_faulty_share_prev_{w}" for w in _F1_WINDOWS],
    *[f"system_avg_silent_share_prev_{w}" for w in _F1_WINDOWS],
    *[f"precipitation_prev_{w}" for w in _F1_WINDOWS],
    *[f"temperature_mean_prev_{w}" for w in _F1_WINDOWS],
    *[f"temperature_min_prev_{w}" for w in _F1_WINDOWS],
    *[f"temperature_max_prev_{w}" for w in _F1_WINDOWS],
    *[f"humidity_mean_prev_{w}" for w in _F1_WINDOWS],
    *[f"pressure_mean_prev_{w}" for w in _F1_WINDOWS],
    *[f"freeze_thaw_days_prev_{w}" for w in _F1_WINDOWS],
]

# ────────────────────────────────────────────────────────────────
# РЕЕСТР МОДЕЛЕЙ
# ────────────────────────────────────────────────────────────────
MODEL_REGISTRY = {
    "A3": {
        "file": "a3_catboost_final_2025.cbm",
        "engine": "catboost",
        "features": A3_FEATURE_COLUMNS,
        "cat_features": ["sensor_type"],
        "granularity": "channel",
        "horizon_hours": 24,
        "schedule": "hourly",
    },
    "A4": {
        "file": "a4_catboost_final_2025.cbm",
        "engine": "catboost",
        "features": A4_FEATURE_COLUMNS,
        "cat_features": ["object_id", "system_type"],
        "granularity": "system",
        "horizon_hours": 24,
        "schedule": "hourly",
    },
    "B1": {
        "file": "b1_catboost_2025.cbm",
        "engine": "catboost",
        "features": B1_FEATURE_COLUMNS,
        "cat_features": [],
        "granularity": "picket",
        "horizon_hours": 24,
        "schedule": "hourly",
    },
    "C1": {
        "file": "c1_catboost_2025.cbm",
        "engine": "catboost",
        "features": C1_FEATURE_COLUMNS,
        "cat_features": [],
        "granularity": "picket",
        "horizon_hours": 24,
        "schedule": "hourly",
    },
    "D1": {
        "file": "d1_isolation_forest_2025.joblib",
        "engine": "sklearn",
        "features": D1_FEATURE_COLUMNS,
        "cat_features": [],
        "granularity": "episode",
        "horizon_hours": None,
        "schedule": "on_event",
    },
    "F1_7d": {
        "file": "f1_7d_catboost_final_2025.cbm",
        "engine": "catboost",
        "features": F1_FEATURE_COLUMNS,
        "cat_features": [],
        "granularity": "maintenance_unit",
        "horizon_days": 7,
        "schedule": "daily",
    },
    "F1_30d": {
        "file": "f1_30d_catboost_final_2025.cbm",
        "engine": "catboost",
        "features": F1_FEATURE_COLUMNS,
        "cat_features": [],
        "granularity": "maintenance_unit",
        "horizon_days": 30,
        "schedule": "daily",
    },
}

# ────────────────────────────────────────────────────────────────
# КОНСТАНТЫ
# ────────────────────────────────────────────────────────────────
EVENT_CATEGORIES = ["fault", "warning", "detection", "normal", "unknown"]
FORECAST_CONFIDENCE_THRESHOLD = 0.58
WEATHER_LOCATION_ID = 1  # Москва