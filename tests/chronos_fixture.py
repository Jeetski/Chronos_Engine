import os
import shutil
import uuid
from contextlib import contextmanager
from datetime import datetime

import yaml

from commands import start as Start
from commands import today as Today
from modules import item_manager as ItemManager
import modules.scheduler as SchedulerPackage
from modules.scheduler import kairos_v2 as KairosV2
from modules.scheduler import runtime as SchedulerRuntime
from modules.scheduler import v1 as SchedulerV1
from modules.timer import main as TimerMain


FIXTURE_NOW = datetime(2026, 4, 16, 8, 0, 0)
FIXTURE_DAY_TEMPLATE_NAME = "Weekday Fixed Test"
FIXTURE_BLOCK_NAMES = [
    "Deep Work Sprint",
    "Inbox Zero Sweep",
    "Stretch Break",
]

_FIXTURE_DIRECTORIES = [
    "days",
    "tasks",
    "habits",
    "settings",
    os.path.join("schedules", "completions"),
    "logs",
    "data",
    "profile",
]

_FIXTURE_FILES = {
    os.path.join("settings", "category_settings.yml"): {
        "Category_Settings": {
            "Health and Wellbeing": {"value": 1},
            "Relationships": {"value": 2},
            "Work": {"value": 3},
            "Admin & Upkeep": {"value": 4},
            "Finance": {"value": 5},
            "Personal Development": {"value": 6},
            "Hobbies": {"value": 7},
        }
    },
    os.path.join("settings", "priority_settings.yml"): {
        "Priority_Settings": {
            "High": {"value": 1},
            "Medium": {"value": 2},
            "Low": {"value": 3},
        }
    },
    os.path.join("settings", "scheduling_priorities.yml"): {
        "Scheduling_Priorities": [
            {
                "Name": "priority",
                "Order": 1,
                "Rank": 5,
                "Description": "Prefer high-priority work first.",
            },
            {
                "Name": "category",
                "Order": 2,
                "Rank": 4,
                "Description": "Keep category weighting stable.",
            },
        ]
    },
    os.path.join("settings", "status_settings.yml"): {
        "Status_Settings": [
            {"Name": "energy", "Rank": 1},
            {"Name": "focus", "Rank": 2},
        ]
    },
    os.path.join("settings", "buffer_settings.yml"): {
        "default_buffer_minutes": 10,
    },
    os.path.join("settings", "quick_wins_settings.yml"): {
        "max_minutes": 15,
        "quick_label": "quick_win",
    },
    os.path.join("settings", "scheduling_settings.yml"): {
        "runtime_helper_windows": {
            "max_windows_per_day": 2,
        }
    },
    os.path.join("settings", "timer_profiles.yml"): {
        "classic_pomodoro": {
            "focus_minutes": 25,
            "short_break_minutes": 5,
            "long_break_minutes": 15,
            "long_break_every": 4,
        }
    },
    os.path.join("settings", "timer_settings.yml"): {
        "default_profile": "classic_pomodoro",
        "start_day_profile": "classic_pomodoro",
        "start_day_min_minutes": 5,
        "confirm_completion": False,
    },
    os.path.join("profile", "current_status.yml"): {
        "energy": "high",
        "focus": "good",
    },
    os.path.join("habits", "bedtime.yml"): {
        "name": "Bedtime",
        "type": "habit",
        "target_sleep_hours": 8,
    },
    os.path.join("tasks", "deep_work_sprint.yml"): {
        "name": "Deep Work Sprint",
        "type": "task",
        "duration": "90m",
        "category": "Work",
        "priority": "High",
        "tags": ["maker", "deep_work"],
    },
    os.path.join("tasks", "inbox_zero_sweep.yml"): {
        "name": "Inbox Zero Sweep",
        "type": "task",
        "duration": "30m",
        "category": "Admin & Upkeep",
        "priority": "Medium",
        "tags": ["admin"],
    },
    os.path.join("habits", "stretch_break.yml"): {
        "name": "Stretch Break",
        "type": "habit",
        "duration": "10m",
        "category": "Health and Wellbeing",
        "priority": "Low",
        "tags": ["recovery"],
        "frequency": "daily",
    },
    os.path.join("days", "weekday_fixed_test.yml"): {
        "name": FIXTURE_DAY_TEMPLATE_NAME,
        "type": "day",
        "days": [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        ],
        "sequence": [
            {
                "name": "Deep Work Sprint",
                "type": "task",
                "start": "09:00",
                "end": "10:30",
                "duration": "90m",
                "category": "Work",
                "priority": "High",
            },
            {
                "name": "Inbox Zero Sweep",
                "type": "task",
                "start": "10:45",
                "end": "11:15",
                "duration": "30m",
                "category": "Admin & Upkeep",
                "priority": "Medium",
            },
            {
                "name": "Stretch Break",
                "type": "habit",
                "start": "11:20",
                "end": "11:30",
                "duration": "10m",
                "category": "Health and Wellbeing",
                "priority": "Low",
            },
        ],
    },
}


def _write_yaml(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        yaml.safe_dump(payload, handle, sort_keys=False, allow_unicode=True)


def seed_fake_kairos_user(user_dir):
    for rel_dir in _FIXTURE_DIRECTORIES:
        os.makedirs(os.path.join(user_dir, rel_dir), exist_ok=True)
    for rel_path, payload in _FIXTURE_FILES.items():
        _write_yaml(os.path.join(user_dir, rel_path), payload)


def _retarget_timer_paths(user_dir):
    TimerMain.STATE_DIR = os.path.join(user_dir, "Timers")
    TimerMain.STATE_FILE = os.path.join(TimerMain.STATE_DIR, "state.yml")
    TimerMain.LOCK_FILE = os.path.join(TimerMain.STATE_DIR, "state.lock")
    TimerMain.SESSIONS_DIR = os.path.join(TimerMain.STATE_DIR, "sessions")
    TimerMain.PLAN_FILE = os.path.join(TimerMain.STATE_DIR, "start_day_plan.yml")
    TimerMain.PROFILES_FILE = os.path.join(user_dir, "settings", "timer_profiles.yml")
    TimerMain.SETTINGS_FILE = os.path.join(user_dir, "settings", "timer_settings.yml")


@contextmanager
def temporary_kairos_user_fixture():
    base_dir = os.path.join(os.getcwd(), ".tmp_test_kairos_v2_user")
    run_root = os.path.join(base_dir, f"run_{uuid.uuid4().hex}")
    user_dir = os.path.join(run_root, "user")
    os.makedirs(user_dir, exist_ok=True)
    seed_fake_kairos_user(user_dir)

    originals = {
        "today_user_dir": Today.USER_DIR,
        "start_user_dir": Start.USER_DIR,
        "scheduler_pkg_user_dir": SchedulerPackage.USER_DIR,
        "scheduler_v1_user_dir": SchedulerV1.USER_DIR,
        "scheduler_runtime_user_dir": SchedulerRuntime.USER_DIR,
        "kairos_v2_user_dir": KairosV2.USER_DIR,
        "item_manager_user_dir": ItemManager.USER_DIR,
        "item_manager_root_dir": ItemManager.ROOT_DIR,
        "timer_state_dir": TimerMain.STATE_DIR,
        "timer_state_file": TimerMain.STATE_FILE,
        "timer_lock_file": TimerMain.LOCK_FILE,
        "timer_sessions_dir": TimerMain.SESSIONS_DIR,
        "timer_plan_file": TimerMain.PLAN_FILE,
        "timer_profiles_file": TimerMain.PROFILES_FILE,
        "timer_settings_file": TimerMain.SETTINGS_FILE,
    }

    try:
        Today.USER_DIR = user_dir
        Start.USER_DIR = user_dir
        SchedulerPackage.USER_DIR = user_dir
        SchedulerV1.USER_DIR = user_dir
        SchedulerRuntime.USER_DIR = user_dir
        KairosV2.USER_DIR = user_dir
        ItemManager.USER_DIR = user_dir
        ItemManager.ROOT_DIR = run_root
        _retarget_timer_paths(user_dir)
        yield {
            "root_dir": run_root,
            "user_dir": user_dir,
        }
    finally:
        Today.USER_DIR = originals["today_user_dir"]
        Start.USER_DIR = originals["start_user_dir"]
        SchedulerPackage.USER_DIR = originals["scheduler_pkg_user_dir"]
        SchedulerV1.USER_DIR = originals["scheduler_v1_user_dir"]
        SchedulerRuntime.USER_DIR = originals["scheduler_runtime_user_dir"]
        KairosV2.USER_DIR = originals["kairos_v2_user_dir"]
        ItemManager.USER_DIR = originals["item_manager_user_dir"]
        ItemManager.ROOT_DIR = originals["item_manager_root_dir"]
        TimerMain.STATE_DIR = originals["timer_state_dir"]
        TimerMain.STATE_FILE = originals["timer_state_file"]
        TimerMain.LOCK_FILE = originals["timer_lock_file"]
        TimerMain.SESSIONS_DIR = originals["timer_sessions_dir"]
        TimerMain.PLAN_FILE = originals["timer_plan_file"]
        TimerMain.PROFILES_FILE = originals["timer_profiles_file"]
        TimerMain.SETTINGS_FILE = originals["timer_settings_file"]
        shutil.rmtree(run_root, ignore_errors=True)
