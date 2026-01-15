import os
import re
import yaml
from Modules.ItemManager import read_item_data, write_item_data


SUPPORTED_TYPES = {"task", "milestone", "goal", "project"}
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _normalize_item_type(raw):
    if not isinstance(raw, str):
        return ""
    item_type = raw.strip().lower()
    if item_type.endswith("s"):
        item_type = item_type[:-1]
    return item_type


def _split_date_time(raw):
    if not raw:
        return None, None
    text = str(raw).strip()
    date_match = re.search(r"(\d{4}-\d{2}-\d{2})", text)
    time_match = re.search(r"(\d{2}:\d{2})", text)
    date = date_match.group(1) if date_match else None
    time = time_match.group(1) if time_match else None
    return date, time


def _normalize_recurrence(value):
    if value is None:
        return None
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        parts = [p.strip() for p in value.split(",") if p.strip()]
        return parts if parts else None
    return None


def _load_defaults(item_type):
    settings_dir = os.path.join(ROOT_DIR, "User", "Settings")
    variants = [
        f"{item_type}_defaults.yml",
        f"{item_type}_Defaults.yml",
        f"{item_type.capitalize()}_Defaults.yml",
    ]
    for name in variants:
        path = os.path.join(settings_dir, name)
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh) or {}
        except Exception:
            continue
        if isinstance(data, dict):
            return {str(k).lower().replace("default_", ""): v for k, v in data.items()}
    return {}


def _unique_item_name(item_type, base_name):
    if not base_name:
        base_name = "Reminder"
    name = base_name
    counter = 2
    while read_item_data(item_type, name):
        name = f"{base_name} ({counter})"
        counter += 1
    return name


def _resolve_date_kind(item, explicit):
    if explicit:
        return explicit
    has_deadline = bool(item.get("deadline"))
    has_due = bool(item.get("due_date"))
    if has_deadline and not has_due:
        return "deadline"
    if has_due and not has_deadline:
        return "due_date"
    return None


def _extract_date_time(item, date_kind, override_date, override_time):
    raw = override_date
    if not raw:
        raw = item.get("deadline") if date_kind == "deadline" else item.get("due_date")
    date, time = _split_date_time(raw)
    time = override_time or time
    return date, time


def run(args, properties):
    """
    Create a reminder from an item's deadline or due date.
    Usage: reminder from <type> <name> [use:deadline|due_date] [date:YYYY-MM-DD] [time:HH:MM] [message:"..."]
    """
    if not args or args[0].lower() != "from" or len(args) < 3:
        print(get_help_message())
        return

    item_type = _normalize_item_type(args[1])
    if item_type not in SUPPORTED_TYPES:
        print(f"? Unsupported item type '{item_type}'. Use: task, milestone, goal, project.")
        return

    item_name = " ".join(args[2:]).strip()
    if not item_name:
        print("? Item name is required.")
        return

    item = read_item_data(item_type, item_name)
    if not item:
        print(f"? {item_type.capitalize()} '{item_name}' not found.")
        return

    date_kind = str(properties.get("use") or "").strip().lower() or None
    if date_kind and date_kind not in {"deadline", "due_date"}:
        print("? use must be 'deadline' or 'due_date'.")
        return

    date_kind = _resolve_date_kind(item, date_kind)
    if not date_kind:
        print("? Item has both deadline and due_date. Add use:deadline or use:due_date.")
        return

    override_date = properties.get("date")
    override_time = properties.get("time")
    date, time = _extract_date_time(item, date_kind, override_date, override_time)
    if not date:
        print("? No date found. Add date:YYYY-MM-DD or set deadline/due_date on the item.")
        return
    if not time:
        defaults = _load_defaults("reminder")
        time = defaults.get("time") or "09:00"

    base_suffix = "deadline reminder" if date_kind == "deadline" else "due reminder"
    reminder_name = _unique_item_name("reminder", f"{item_name} {base_suffix}")
    message = properties.get("message") or properties.get("label")
    recurrence = _normalize_recurrence(properties.get("recurrence")) or ["daily"]
    enabled = properties.get("enabled")
    if enabled is None:
        enabled = True

    data = {
        "name": reminder_name,
        "type": "reminder",
        "date": date,
        "time": time,
        "enabled": bool(enabled),
        "recurrence": recurrence,
    }
    if message:
        data["label"] = message

    write_item_data("reminder", reminder_name, data)
    print(f"? Created reminder: {reminder_name}.yml")


def get_help_message():
    return """
Usage: reminder from <type> <name> [use:deadline|due_date] [date:YYYY-MM-DD] [time:HH:MM] [message:"..."] [recurrence:daily]
Description:
  Creates a reminder from an item's deadline or due_date.
Examples:
  reminder from task "Ship v1" use:deadline time:09:00
  reminder from milestone "Finalize docs" use:due_date date:2025-01-14 time:10:00 message:"Docs due"
"""
