from datetime import datetime, timedelta
import os
import yaml
import json

from modules.item_manager import list_all_items_any
from modules.scheduler import (
    schedule_path_for_date,
    get_flattened_schedule,
    build_block_key,
    normalize_completion_entries,
)
from commands.today import load_completion_payload
from utilities.duration_parser import parse_duration_string


DONE_STATUSES = {"completed", "done", "skipped", "archived"}
SETTINGS_FILE = os.path.join("user", "Settings", "quick_wins_settings.yml")


def _load_settings():
    defaults = {
        "max_minutes": 15,
        "days_window": 3,
        "limit": 20,
        "include_missed": True,
        "include_overdue": True,
        "include_due": True,
        "quick_label": "quick",
    }
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, "r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh) or {}
            if isinstance(data, dict):
                defaults.update(data)
    except Exception:
        pass
    return defaults


def _parse_bool(val, default=False):
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return val != 0
    if isinstance(val, str):
        return val.strip().lower() in {"1", "true", "yes", "y", "on"}
    return default


def _parse_int(val, default):
    try:
        return int(val)
    except Exception:
        return default


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        raw = value.strip()
        for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
            try:
                return datetime.strptime(raw, fmt).date()
            except ValueError:
                continue
    return None


def _get_ci(item, keys):
    if not isinstance(item, dict):
        return None
    for k in keys:
        if k in item:
            return item.get(k)
        for key in item.keys():
            if str(key).lower() == str(k).lower():
                return item.get(key)
    return None


def _item_duration_minutes(item):
    raw = _get_ci(item, ["duration", "minutes", "time"])
    if raw is None:
        return None
    try:
        minutes = parse_duration_string(raw)
    except Exception:
        minutes = None
    if isinstance(minutes, (int, float)):
        return int(minutes)
    return None


def _duration_flags(item):
    raw = _get_ci(item, ["duration"])
    if raw is None and isinstance(item, dict):
        raw = item.get("original_item_data", {}).get("duration")
    if isinstance(raw, str):
        if raw.strip().lower() == "parallel":
            return True, False
        if raw.strip().isdigit() and int(raw.strip()) == 0:
            return False, True
    if isinstance(raw, (int, float)) and int(raw) == 0:
        return False, True
    return False, False


def _load_schedule_for_date(target_date):
    schedule_path = schedule_path_for_date(target_date)
    if not os.path.exists(schedule_path):
        return []
    try:
        with open(schedule_path, "r", encoding="utf-8") as fh:
            return yaml.safe_load(fh) or []
    except Exception:
        return []


def _explicit_duration_minutes(item):
    raw = item.get("duration") if isinstance(item, dict) else None
    if raw is None and isinstance(item, dict):
        raw = item.get("original_item_data", {}).get("duration")
    if isinstance(raw, str) and raw.strip().lower() == "parallel":
        return None
    try:
        minutes = int(raw)
    except Exception:
        minutes = _item_duration_minutes(item)
    if minutes and minutes > 0:
        return minutes
    return None


def _infer_child_durations(schedule):
    inferred = {}

    def walk(item, inherited_total=None):
        if not isinstance(item, dict):
            return
        children = item.get("children") or []
        if not children:
            return

        explicit = _explicit_duration_minutes(item)
        available = explicit if explicit is not None else inherited_total
        node_has_real = explicit is not None

        if available and available > 0:
            known = 0
            candidates = []
            for child in children:
                child_explicit = _explicit_duration_minutes(child)
                child_parallel, child_zero = _duration_flags(child)
                if child_explicit:
                    known += child_explicit
                    continue
                if child_zero:
                    continue
                if child_parallel and not node_has_real:
                    continue
                candidates.append(child)
            remaining = max(0, available - known)
            if candidates and remaining > 0:
                share = remaining / len(candidates)
                share_minutes = max(1, int(round(share)))
                for child in candidates:
                    inferred[id(child)] = share_minutes

        for child in children:
            child_explicit = _explicit_duration_minutes(child)
            if child_explicit is not None:
                child_inherited = None
            else:
                child_inherited = inferred.get(id(child))
            walk(child, child_inherited)

    for root in schedule or []:
        walk(root, None)
    return inferred


def _collect_missed_scheduled(max_minutes, target_date):
    now = datetime.now()
    base_date = target_date
    today = now.date()
    schedule = _load_schedule_for_date(base_date)
    if not schedule:
        return []
    inferred = _infer_child_durations(schedule)
    completion_data, _ = load_completion_payload(base_date.strftime("%Y-%m-%d"))
    completion_entries = normalize_completion_entries(completion_data)
    results = []
    if base_date > today:
        return results
    for item in get_flattened_schedule(schedule):
        if item.get("children"):
            continue
        if item.get("is_buffer"):
            continue
        start = item.get("start_time")
        end = item.get("end_time")
        if isinstance(start, datetime) and isinstance(end, datetime):
            if base_date == today and end >= now:
                continue
        key = build_block_key(item.get("name"), start)
        entry = completion_entries.get(key)
        if entry and str(entry.get("status", "")).lower() in {"completed", "skipped"}:
            continue
        is_parallel, is_zero = _duration_flags(item)
        minutes = item.get("duration")
        try:
            minutes = int(minutes)
        except Exception:
            minutes = _item_duration_minutes(item)
        inferred_flag = False
        if is_parallel:
            minutes = inferred.get(id(item))
            if minutes is not None and minutes > 0:
                inferred_flag = True
        elif is_zero:
            minutes = 0
        elif minutes is None or minutes <= 0:
            minutes = inferred.get(id(item))
            if minutes is None:
                minutes = 0
        if minutes is None or minutes > max_minutes:
            continue
        results.append({
            "name": item.get("name") or "Unnamed",
            "type": item.get("type") or "task",
            "minutes": minutes,
            "reason": "missed (today schedule)" if base_date == today else f"missed ({base_date.isoformat()})",
            "rank": 2,
            "inferred": inferred_flag,
        })
    return results


def _collect_due_items(max_minutes, days_window, base_date):
    today = base_date
    due_soon_end = today + timedelta(days=days_window)
    results = []
    for item in list_all_items_any() or []:
        name = _get_ci(item, ["name"]) or ""
        if not name:
            continue
        status = str(_get_ci(item, ["status"]) or "").lower()
        if status in DONE_STATUSES:
            continue

        duration = _item_duration_minutes(item)
        is_parallel, is_zero = _duration_flags(item)
        inferred_flag = False
        if is_parallel:
            duration = None
        elif is_zero:
            duration = 0
        if duration is None or duration > max_minutes:
            continue

        deadline = _parse_date(_get_ci(item, ["deadline"]))
        due_date = _parse_date(_get_ci(item, ["due_date", "due date"]))

        if not deadline and not due_date:
            continue

        if deadline and deadline < today:
            results.append({
                "name": name,
                "type": _get_ci(item, ["type"]) or "task",
                "minutes": duration,
                "reason": f"overdue deadline ({deadline.isoformat()})",
                "rank": 0,
                "inferred": inferred_flag,
            })
            continue
        if due_date and due_date < today:
            results.append({
                "name": name,
                "type": _get_ci(item, ["type"]) or "task",
                "minutes": duration,
                "reason": f"overdue due_date ({due_date.isoformat()})",
                "rank": 1,
                "inferred": inferred_flag,
            })
            continue

        if deadline and deadline <= due_soon_end:
            label = "due today" if deadline == today else f"due in { (deadline - today).days }d"
            results.append({
                "name": name,
                "type": _get_ci(item, ["type"]) or "task",
                "minutes": duration,
                "reason": f"deadline {label} ({deadline.isoformat()})",
                "rank": 3 if deadline == today else 5,
                "inferred": inferred_flag,
            })
            continue
        if due_date and due_date <= due_soon_end:
            label = "due today" if due_date == today else f"due in { (due_date - today).days }d"
            results.append({
                "name": name,
                "type": _get_ci(item, ["type"]) or "task",
                "minutes": duration,
                "reason": f"due_date {label} ({due_date.isoformat()})",
                "rank": 4 if due_date == today else 6,
                "inferred": inferred_flag,
            })
            continue
    return results


def run(args, properties):
    """
    quickwins [minutes:N] [days:N] [limit:N] [missed:true|false] [overdue:true|false] [due:true|false]
    """
    settings = _load_settings()
    date_prop = properties.get("date")
    target_date = _parse_date(date_prop) or datetime.now().date()
    max_minutes = _parse_int(properties.get("minutes"), settings.get("max_minutes", 15))
    days_window = _parse_int(properties.get("days"), settings.get("days_window", 3))
    limit = _parse_int(properties.get("limit"), settings.get("limit", 20))
    include_missed = _parse_bool(properties.get("missed", settings.get("include_missed", True)), True)
    include_overdue = _parse_bool(properties.get("overdue", settings.get("include_overdue", True)), True)
    include_due = _parse_bool(properties.get("due", settings.get("include_due", True)), True)
    quick_label = str(settings.get("quick_label") or "quick")

    items = []
    if include_missed:
        items.extend(_collect_missed_scheduled(max_minutes, target_date))
    if include_overdue or include_due:
        due_items = _collect_due_items(max_minutes, days_window, target_date)
        if not include_overdue:
            due_items = [i for i in due_items if not i["reason"].startswith("overdue")]
        if not include_due:
            due_items = [i for i in due_items if i["reason"].startswith("overdue")]
        items.extend(due_items)

    # De-dup by type+name, keep best rank
    dedup = {}
    for item in items:
        key = f"{item.get('type')}::{item.get('name')}"
        if key not in dedup or item["rank"] < dedup[key]["rank"]:
            dedup[key] = item
    items = list(dedup.values())

    items.sort(key=lambda x: (x.get("rank", 9), x.get("minutes", 999), str(x.get("name") or "").lower()))
    if limit > 0:
        items = items[:limit]

    if not items:
        if str(properties.get("format") or "").lower() == "json":
            print(json.dumps({"ok": True, "items": [], "date": target_date.isoformat()}))
            return
        print("No quick wins found.")
        return

    if str(properties.get("format") or "").lower() == "json":
        print(json.dumps({"ok": True, "items": items, "date": target_date.isoformat()}))
        return

    print(f"Quick Wins (<= {max_minutes}m)")
    for idx, it in enumerate(items, 1):
        name = it.get("name")
        itype = it.get("type")
        minutes = it.get("minutes")
        reason = it.get("reason")
        if minutes is None or minutes <= 0:
            minutes_label = quick_label
        elif it.get("inferred"):
            minutes_label = f"~{minutes}m"
        else:
            minutes_label = f"{minutes}m"
        print(f"{idx:02d}. {name} [{itype}] ({minutes_label}) — {reason}")
    print("\nTip: use `complete <type> \"<name>\"` or `today inject \"<name>\" at HH:MM`.")


def get_help_message():
    return """
Usage: quickwins [minutes:N] [days:N] [limit:N] [missed:true|false] [overdue:true|false] [due:true|false] [date:YYYY-MM-DD] [format:json]
Description: Lists small quick wins (<= minutes) from overdue/due soon items and missed blocks today.
Settings file: user/Settings/quick_wins_settings.yml
Date: quickwins date:YYYY-MM-DD
Example: quickwins minutes:15 days:3 limit:15
"""



