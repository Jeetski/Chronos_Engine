import os
import math
from datetime import datetime, timedelta

from Modules.Console import invoke_command
from Modules.Scheduler import USER_DIR, get_flattened_schedule, schedule_path_for_date
from Utilities.duration_parser import parse_duration_string
from Modules.Timer import main as Timer


def run(args, properties):
    """
    start day|today
    """
    if not args:
        print(get_help_message())
        return

    target = (args[0] or "").strip().lower()
    if target in {"day", "today"}:
        _start_day(properties)
        return

    # allow "start my day"
    if target == "my" and len(args) >= 2 and args[1].strip().lower() in {"day", "today"}:
        _start_day(properties)
        return

    print(get_help_message())


def _start_day(properties):
    print("▶ Building today's schedule...")
    try:
        invoke_command("today", ["reschedule"], {})
    except Exception as exc:
        print(f"Error running 'today reschedule': {exc}")
        return

    schedule = _load_today_schedule()
    if not schedule:
        print("No schedule available after reschedule. Aborting.")
        return

    settings = _load_timer_settings()
    min_minutes = int(settings.get("start_day_min_minutes") or settings.get("start_day_min_block_minutes") or 5)
    profile_name = settings.get("start_day_profile") or settings.get("default_profile") or "classic_pomodoro"
    confirm_completion = settings.get("confirm_completion")
    if confirm_completion is None:
        confirm_completion = True
    flat_schedule = get_flattened_schedule(schedule or [])
    queue = _build_plan(flat_schedule, min_minutes=min_minutes, now_dt=datetime.now())
    if not queue.get("blocks"):
        print(f"No runnable blocks found (min duration {min_minutes} minutes).")
        return

    try:
        state = Timer.start_schedule_plan(
            queue,
            profile_name=profile_name,
            confirm_completion=bool(confirm_completion),
        )
    except Exception as exc:
        print(f"Timer error: {exc}")
        return

    focus_count = sum(1 for b in queue["blocks"] if not b.get("is_buffer"))
    buffer_count = len(queue["blocks"]) - focus_count
    total_focus = sum(b.get("minutes", 0) for b in queue["blocks"] if not b.get("is_buffer"))
    total_break = sum(b.get("minutes", 0) for b in queue["blocks"] if b.get("is_buffer"))
    first_block = queue["blocks"][0]
    print(f"Started schedule timer using profile '{profile_name}'.")
    print(f"Blocks: {focus_count} focus / {buffer_count} buffers | Focus minutes: {total_focus} | Break minutes: {total_break}")
    print(f"Next up: {first_block.get('name')} ({first_block.get('minutes')}m)")
    if not bool(confirm_completion):
        print("Auto-advance enabled (completion confirmations disabled).")
    else:
        print("You'll be asked to confirm each block completion inside the Timer widget.")


def _load_today_schedule():
    schedule_path = schedule_path_for_date(datetime.now())
    if not os.path.exists(schedule_path):
        return []
    try:
        import yaml  # type: ignore
    except Exception:
        yaml = None  # type: ignore
    if yaml is None:
        return []
    with open(schedule_path, "r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or []
    return data if isinstance(data, list) else []


def _load_timer_settings():
    settings_path = os.path.join(USER_DIR, "Settings", "Timer_Settings.yml")
    try:
        import yaml  # type: ignore
    except Exception:
        yaml = None  # type: ignore
    if yaml is None or not os.path.exists(settings_path):
        return {}
    try:
        with open(settings_path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _build_plan(schedule, *, min_minutes=5, now_dt=None):
    blocks = []
    for block in sorted(schedule, key=_sort_key):
        plan_entry = _block_to_plan(block, now_dt=now_dt)
        if not plan_entry:
            continue
        if (not plan_entry.get("is_buffer")) and plan_entry["minutes"] < max(1, int(min_minutes)):
            continue
        blocks.append(plan_entry)

    return {
        "generated_at": datetime.now().isoformat(),
        "source": "schedule",
        "blocks": blocks,
    }


def _block_to_plan(block, now_dt=None):
    if not isinstance(block, dict):
        return None
    if block.get("is_parallel_item"):
        return None
    if not _should_include_block(block):
        return None
    minutes = _extract_duration_minutes(block)
    if minutes <= 0:
        return None
    start_dt, end_dt = _extract_block_window(block)
    if now_dt and end_dt and end_dt <= now_dt:
        return None
    if now_dt and start_dt and end_dt and start_dt <= now_dt < end_dt:
        remaining_minutes = max(1, math.ceil((end_dt - now_dt).total_seconds() / 60))
    else:
        remaining_minutes = minutes
    start_label = _format_time(block.get("start_time")) or block.get("ideal_start_time")
    end_label = _format_time(block.get("end_time")) or block.get("ideal_end_time")
    name = block.get("name") or block.get("original_item_data", {}).get("name") or "Unnamed block"
    return {
        "name": name,
        "minutes": remaining_minutes,
        "is_buffer": bool(block.get("is_buffer")),
        "schedule_type": block.get("type"),
        "start": start_label,
        "end": end_label,
        "buffer_type": block.get("buffer_type"),
    }


def _should_include_block(block):
    if block.get("is_buffer"):
        return True
    children = block.get("children") or []
    if not children:
        return True
    for child in children:
        if not isinstance(child, dict):
            continue
        if child.get("is_buffer"):
            continue
        if child.get("is_parallel_item"):
            continue
        if _extract_duration_minutes(child) > 0:
            return False
    return True


def _extract_block_window(block):
    start_raw = block.get("start_time") or block.get("ideal_start_time")
    end_raw = block.get("end_time") or block.get("ideal_end_time")
    start_dt = _parse_schedule_dt(start_raw)
    end_dt = _parse_schedule_dt(end_raw)
    if not end_dt and start_dt:
        duration_min = _extract_duration_minutes(block)
        if duration_min > 0:
            end_dt = start_dt + timedelta(minutes=duration_min)
    return start_dt, end_dt


def _extract_duration_minutes(block):
    raw_duration = block.get("duration")
    minutes = _coerce_minutes(raw_duration)
    if minutes > 0:
        return minutes

    orig_duration = (block.get("original_item_data") or {}).get("duration")
    minutes = _coerce_minutes(orig_duration)
    if minutes > 0:
        return minutes

    start = _parse_time_like(block.get("start_time") or block.get("ideal_start_time"))
    end = _parse_time_like(block.get("end_time") or block.get("ideal_end_time"))
    if start and end:
        delta = int((end - start).total_seconds() / 60)
        if delta > 0:
            return delta
    return 0


def _coerce_minutes(value):
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return max(0, int(round(value)))
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return 0
        if value.isdigit():
            return int(value)
        try:
            parsed = parse_duration_string(value)
            if isinstance(parsed, (int, float)):
                return max(0, int(parsed))
        except Exception:
            pass
    return 0


def _parse_time_like(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        txt = value.strip()
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%H:%M:%S", "%H:%M"):
            try:
                parsed = datetime.strptime(txt, fmt)
                return _normalize_to_today(parsed)
            except ValueError:
                continue
    return None


def _parse_schedule_dt(value):
    if isinstance(value, datetime):
        return value
    result = _parse_time_like(value)
    if result:
        return result
    return None


def _normalize_to_today(dt_obj):
    if not isinstance(dt_obj, datetime):
        return None
    if dt_obj.year == 1900:
        now = datetime.now()
        return dt_obj.replace(year=now.year, month=now.month, day=now.day)
    return dt_obj


def _format_time(value):
    dt_obj = _parse_time_like(value)
    if not dt_obj:
        return None
    return dt_obj.strftime("%H:%M")


def _sort_key(block):
    start = _parse_time_like(block.get("start_time") or block.get("ideal_start_time"))
    return start or datetime.now()


def get_help_message():
    return """Usage:
  start day
  start today

Rebuilds today's schedule, extracts sequential blocks (buffers included),
and launches the timer to run them with completion confirmations."""
