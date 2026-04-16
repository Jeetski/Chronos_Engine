# Expose legacy Scheduler API for backward compatibility
from .v1 import *
from .runtime import (
    DAY_RUNTIME_KIND,
    DAY_RUNTIME_VERSION,
    build_day_runtime_payload,
    build_schedule_plan,
    extract_execution_units,
    extract_schedule_items,
    get_flattened_runtime_items,
    is_day_runtime_payload,
    load_day_runtime,
    load_schedule_items_for_date,
    load_schedule_payload_for_date,
    load_schedule_plan_for_date,
    save_day_runtime,
    schedule_runtime_path_for_date,
)

# Expose new Kairos Engine
from .kairos import KairosScheduler
from .kairos_v2 import KairosV2Scheduler
from .weekly_generator import WeeklyGenerator, save_weekly_skeleton

# Backward-compatible alias used by existing patch targets/tests.
kairosScheduler = KairosScheduler
