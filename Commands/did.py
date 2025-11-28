import os
import yaml
from datetime import datetime

from Modules.Scheduler import TODAY_SCHEDULE_PATH, get_flattened_schedule, build_block_key
from Commands.Today import load_completion_payload


def _normalize_time_str(value):
    if not value:
        return None
    try:
        parsed = datetime.strptime(value, "%H:%M")
    except ValueError:
        print(f"Invalid time '{value}'. Use HH:MM (24h).")
        return None
    return parsed.strftime("%H:%M")


def _load_schedule():
    if not os.path.exists(TODAY_SCHEDULE_PATH):
        return []
    with open(TODAY_SCHEDULE_PATH, "r") as fh:
        return yaml.safe_load(fh) or []


def _find_block(schedule, name, desired_start):
    if not schedule:
        return None
    candidates = [
        item for item in get_flattened_schedule(schedule)
        if item.get("name", "").strip().lower() == name.strip().lower()
        and not item.get("is_buffer")
    ]
    if not candidates:
        return None
    if desired_start:
        for item in candidates:
            if item.get("start_time") and item["start_time"].strftime("%H:%M") == desired_start:
                return item
    now = datetime.now()
    upcoming = [item for item in candidates if item.get("start_time") and item["start_time"] >= now]
    return upcoming[0] if upcoming else candidates[-1]


def run(args, properties):
    """
    Log what actually happened for a scheduled block.
    Usage: did "Block Name" [start_time:HH:MM] [end_time:HH:MM] [status:completed|skipped|partial] [note:"..."]
    """
    if not args:
        print('Usage: did "Block Name" [start_time:HH:MM] [end_time:HH:MM] [status:completed|skipped|partial]')
        return

    block_name = args[0]
    target_date = properties.get("date") or datetime.now().strftime("%Y-%m-%d")
    try:
        datetime.strptime(target_date, "%Y-%m-%d")
    except ValueError:
        print("Use YYYY-MM-DD for date overrides.")
        return

    start_time_prop = properties.get("start_time")
    end_time_prop = properties.get("end_time")
    actual_start_override = properties.get("actual_start")
    actual_end_override = properties.get("actual_end")
    note = properties.get("note")
    normalized_start_prop = _normalize_time_str(start_time_prop) if start_time_prop else None
    if start_time_prop and not normalized_start_prop:
        return
    normalized_end_prop = _normalize_time_str(end_time_prop) if end_time_prop else None
    if end_time_prop and not normalized_end_prop:
        return
    normalized_actual_start = _normalize_time_str(actual_start_override) if actual_start_override else None
    if actual_start_override and not normalized_actual_start:
        return
    normalized_actual_end = _normalize_time_str(actual_end_override) if actual_end_override else None
    if actual_end_override and not normalized_actual_end:
        return

    completion_data, completion_path = load_completion_payload(target_date)
    entries = completion_data.setdefault("entries", {})

    schedule = _load_schedule() if target_date == datetime.now().strftime("%Y-%m-%d") else []
    scheduled_block = _find_block(schedule, block_name, normalized_start_prop)

    scheduled_start = None
    scheduled_end = None
    if scheduled_block:
        if scheduled_block.get("start_time"):
            scheduled_start = scheduled_block["start_time"].strftime("%H:%M")
        if scheduled_block.get("end_time"):
            scheduled_end = scheduled_block["end_time"].strftime("%H:%M")

    if not scheduled_start:
        scheduled_start = normalized_start_prop
    if not scheduled_end:
        scheduled_end = normalized_end_prop

    if not scheduled_start or not scheduled_end:
        print("Provide start_time/end_time when the block isn't found in today's schedule.")
        return

    actual_start = normalized_actual_start or scheduled_start
    actual_end = normalized_actual_end or scheduled_end

    status = str(properties.get("status", "completed")).lower()
    key = build_block_key(block_name, scheduled_start)
    entry = {
        "name": block_name,
        "status": status,
        "scheduled_start": scheduled_start,
        "scheduled_end": scheduled_end,
        "actual_start": actual_start,
        "actual_end": actual_end,
        "logged_at": datetime.now().isoformat(timespec="seconds"),
    }
    if note:
        entry["note"] = note

    entries[key] = entry

    with open(completion_path, "w") as fh:
        yaml.dump(completion_data, fh, default_flow_style=False)

    print(f"Logged {status} for '{block_name}' ({scheduled_start}-{scheduled_end}).")
