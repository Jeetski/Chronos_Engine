import os
import yaml
from datetime import datetime

from Modules.Scheduler import get_flattened_schedule, build_block_key, schedule_path_for_date
from Commands.Today import load_completion_payload
from Modules import quality_utils
try:
    from Utilities import points as Points
except Exception:
    Points = None


def _normalize_time_str(value):
    if not value:
        return None
    try:
        parsed = datetime.strptime(value, "%H:%M")
    except ValueError:
        print(f"Invalid time '{value}'. Use HH:MM (24h).")
        return None
    return parsed.strftime("%H:%M")


def _minutes_between(start_str, end_str):
    if not start_str or not end_str:
        return None
    try:
        start_dt = datetime.strptime(start_str, "%H:%M")
        end_dt = datetime.strptime(end_str, "%H:%M")
    except Exception:
        return None
    minutes = int((end_dt - start_dt).total_seconds() // 60)
    if minutes <= 0:
        return None
    return minutes


def _load_schedule(date_str):
    schedule_path = schedule_path_for_date(date_str)
    if not os.path.exists(schedule_path):
        return []
    with open(schedule_path, "r") as fh:
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
    Usage: did "Block Name" [start_time:HH:MM] [end_time:HH:MM] [status:completed|skipped|partial] [quality:<value>] [note:"..."]
    """
    if not args:
        print('Usage: did "Block Name" [start_time:HH:MM] [end_time:HH:MM] [status:completed|skipped|partial] [quality:<value>]')
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
    quality_raw = properties.get("quality")
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

    schedule = _load_schedule(target_date)
    scheduled_block = _find_block(schedule, block_name, normalized_start_prop)

    scheduled_start = None
    scheduled_end = None
    item_type = None
    if scheduled_block:
        if scheduled_block.get("start_time"):
            scheduled_start = scheduled_block["start_time"].strftime("%H:%M")
        if scheduled_block.get("end_time"):
            scheduled_end = scheduled_block["end_time"].strftime("%H:%M")
        item_type = scheduled_block.get("type")

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
    quality, err = quality_utils.canonicalize_quality(quality_raw)
    if err:
        print(err)
        return
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
    if quality:
        entry["quality"] = quality
    extra_keys = {
        "date",
        "start_time",
        "end_time",
        "actual_start",
        "actual_end",
        "status",
        "quality",
        "note",
    }
    for key, value in properties.items():
        if key in extra_keys or key in entry:
            continue
        entry[key] = value

    entries[key] = entry

    with open(completion_path, "w") as fh:
        yaml.dump(completion_data, fh, default_flow_style=False)

    if Points and status in {"completed", "partial"} and item_type:
        try:
            minutes = _minutes_between(actual_start, actual_end)
            Points.award_on_complete(item_type, block_name, minutes=minutes if isinstance(minutes, int) else None)
        except Exception:
            pass

    print(f"Logged {status} for '{block_name}' ({scheduled_start}-{scheduled_end}).")


def get_help_message():
    return """
Usage: did "Block Name" [start_time:HH:MM] [end_time:HH:MM] [status:completed|skipped|partial] [quality:<value>] [note:"..."] [date:YYYY-MM-DD]
Description: Log what actually happened for a scheduled block and persist completion data.
Examples:
  did "Deep Work"
  did "Workout" status:partial note:"Stopped early"
  did "Planning" start_time:09:00 end_time:09:45 date:2026-03-01
"""
