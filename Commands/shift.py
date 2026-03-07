from datetime import datetime, timedelta
import os
import re
import yaml

from Modules.scheduler import schedule_path_for_date, change_item_time_in_file


def _parse_minutes(raw):
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    if text.startswith('+'):
        text = text[1:]
    try:
        return int(text)
    except Exception:
        return None


def _to_hm(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime("%H:%M")
    text = str(value).strip()
    m = re.search(r"(\d{1,2}):(\d{2})", text)
    if not m:
        return None
    hh = max(0, min(23, int(m.group(1))))
    mm = max(0, min(59, int(m.group(2))))
    return f"{hh:02d}:{mm:02d}"


def _find_start(items, item_name, desired_start=None):
    if not isinstance(items, list):
        return None
    target_name = str(item_name or "").strip().lower()
    wanted_start = _to_hm(desired_start) if desired_start else None
    candidates = []

    def walk(nodes):
        for node in nodes:
            if not isinstance(node, dict):
                continue
            original = node.get("original_item_data") if isinstance(node.get("original_item_data"), dict) else {}
            name = str(node.get("name") or original.get("name") or "").strip()
            if name.lower() == target_name:
                st = _to_hm(node.get("start_time") or original.get("start_time") or node.get("ideal_start_time"))
                if st:
                    candidates.append(st)
            children = node.get("children") or node.get("items") or []
            if isinstance(children, list) and children:
                walk(children)

    walk(items)
    if not candidates:
        return None
    if wanted_start:
        for st in candidates:
            if st == wanted_start:
                return st
    return candidates[0]


def _shift_hm(hm, minutes):
    base = datetime.strptime(hm, "%H:%M")
    shifted = base + timedelta(minutes=minutes)
    day_start = base.replace(hour=0, minute=0)
    day_end = base.replace(hour=23, minute=59)
    if shifted < day_start:
        shifted = day_start
    if shifted > day_end:
        shifted = day_end
    return shifted.strftime("%H:%M")


def run(args, properties):
    if len(args) < 2 or "--help" in args or "-h" in args:
        print(get_help_message())
        return

    amount = _parse_minutes(args[-1])
    if amount is None:
        print("❌ Invalid minutes amount. Use an integer, e.g. +15 or -10.")
        return
    if amount == 0:
        print("ℹ️ Shift amount is 0; no changes recorded.")
        return

    item_name = " ".join(args[:-1]).strip()
    if not item_name:
        print(get_help_message())
        return

    target_date = str((properties or {}).get("date") or datetime.now().strftime("%Y-%m-%d")).strip()
    try:
        datetime.strptime(target_date, "%Y-%m-%d")
    except Exception:
        print("❌ Invalid date format. Use YYYY-MM-DD.")
        return

    schedule_path = schedule_path_for_date(target_date)
    if not os.path.exists(schedule_path):
        print(f"❌ Schedule file not found for {target_date}.")
        return

    desired_start = _to_hm((properties or {}).get("start_time") or (properties or {}).get("scheduled_start"))
    try:
        with open(schedule_path, "r", encoding="utf-8") as fh:
            schedule = yaml.safe_load(fh) or []
    except Exception as e:
        print(f"❌ Failed to read schedule: {e}")
        return

    current_start = _find_start(schedule if isinstance(schedule, list) else (schedule.get("items") or schedule.get("children") or []), item_name, desired_start)
    if not current_start:
        print(f"❌ Could not find '{item_name}' in {target_date} schedule.")
        return

    next_start = _shift_hm(current_start, amount)
    change_item_time_in_file(schedule_path, item_name, next_start)
    sign = "+" if amount > 0 else ""
    print(f"✅ Shifted '{item_name}' by {sign}{amount}m ({current_start} -> {next_start}) for {target_date}.")


def get_help_message():
    return """
Usage: shift <item_name> <minutes>
Description: Shifts an item's start time by +/- minutes in the selected day's schedule.
Examples:
  shift "Morning Routine" +15
  shift "Deep Work" -10 date:2026-02-24 start_time:09:00
"""
