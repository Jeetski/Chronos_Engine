import os
import yaml
from datetime import datetime

from Modules.Scheduler import (
    get_day_template_path,
    read_template,
    USER_DIR,
)

from Commands.Today import (
    build_initial_schedule,
    calculate_item_importance,
    check_total_duration,
    phase3f_iterative_resolution_loop,
    phase4_final_buffer_insertion,
    build_status_context,
    select_template_for_day,
)


def _warn(msg, enabled):
    if enabled:
        print(msg)


def load_settings(show_warnings=True):
    """Load all scheduling-related settings used by today/tomorrow/next previews."""
    settings_dir = os.path.join(USER_DIR, "Settings")

    def read(name):
        path = os.path.join(settings_dir, name)
        if not os.path.exists(path):
            _warn(f"Warning: {name} not found. Scheduling accuracy may be affected.", show_warnings)
            return None
        return read_template(path)

    scheduling_priorities = read("Scheduling_Priorities.yml")
    priority_settings = read("Priority_Settings.yml")
    category_settings = read("Category_Settings.yml")
    status_settings = read("Status_Settings.yml")
    buffer_settings = read("Buffer_Settings.yml")

    current_status_path = os.path.join(USER_DIR, "Current_Status.yml")
    if not os.path.exists(current_status_path):
        _warn("Warning: Current_Status.yml not found. Status alignment may be inaccurate.", show_warnings)
        current_status = {"current_status": {}}
    else:
        current_status = read_template(current_status_path) or {"current_status": {}}

    status_context = build_status_context(status_settings or {}, current_status or {})

    return {
        "scheduling_priorities": scheduling_priorities or {},
        "priority_settings": priority_settings or {},
        "category_settings": category_settings or {},
        "status_context": status_context,
        "buffer_settings": buffer_settings or {},
    }


def _apply_importance(schedule, settings):
    def recurse(items):
        if not items:
            return
        for item in items:
            calculate_item_importance(
                item,
                settings["scheduling_priorities"],
                settings["priority_settings"],
                settings["category_settings"],
                settings["status_context"],
            )
            if item.get("children"):
                recurse(item["children"])
    recurse(schedule)


def build_preview_for_date(target_date, *, save_path=None, show_warnings=True):
    """
    Build a schedule preview for the given datetime.date/datetime by reusing the Today pipeline.
    Returns (schedule, conflicts). Returns (None, None) if template missing.
    """
    if isinstance(target_date, datetime):
        date_obj = target_date
    else:
        date_obj = datetime.combine(target_date, datetime.min.time())
    day_of_week = date_obj.strftime("%A")
    print(f"Preparing schedule for {day_of_week}, {date_obj.strftime('%Y-%m-%d')}")

    settings = load_settings(show_warnings=show_warnings)

    template_info = select_template_for_day(day_of_week, settings["status_context"])
    template = template_info.get("template")
    if not template:
        print(f"No template found for {day_of_week}. Create 'User/Days/{day_of_week}.yml' first.")
        return None, None
    if template_info.get("score", 0) > 0:
        print(f"Status-aware pick: {os.path.basename(template_info['path'])} (score {template_info['score']:.2f}).")

    schedule, initial_conflicts = build_initial_schedule(template)
    conflict_log = []
    if initial_conflicts:
        conflict_log.append({"phase": "Initial Schedule", "conflicts": initial_conflicts})

    _apply_importance(schedule, settings)

    capacity_report = check_total_duration(schedule)
    print(capacity_report)
    if "Capacity Conflict" in capacity_report:
        conflict_log.append({"phase": "Capacity Check", "report": capacity_report})

    resolved_schedule, remaining_conflicts = phase3f_iterative_resolution_loop(schedule, conflict_log)

    if settings["buffer_settings"]:
        print("Applying buffer rules…")
        resolved_schedule = phase4_final_buffer_insertion(resolved_schedule, settings["buffer_settings"])

    if save_path:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        with open(save_path, "w", encoding="utf-8") as fh:
            yaml.dump(resolved_schedule, fh, default_flow_style=False)
        print(f"Preview saved: {save_path}")

    return resolved_schedule, remaining_conflicts
