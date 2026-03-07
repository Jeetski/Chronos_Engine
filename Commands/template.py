import os
import yaml
from datetime import datetime
from Modules.scheduler import schedule_path_for_date

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
USER_DIR = os.path.join(ROOT_DIR, "User")


def _format_time(dt):
    try:
        return dt.strftime("%H:%M")
    except Exception:
        return None


def _duration_to_str(minutes):
    try:
        minutes = int(minutes)
        if minutes <= 0:
            return None
        return f"{minutes}m"
    except Exception:
        return None


def _convert_item(item):
    if not isinstance(item, dict):
        return None
    if item.get("is_buffer"):
        return None

    entry = {
        "name": item.get("name", "Unnamed"),
        "type": item.get("type", "task"),
    }

    ideal_start = _format_time(item.get("start_time"))
    if ideal_start:
        entry["ideal_start_time"] = ideal_start

    duration = item.get("duration")
    dur_str = _duration_to_str(duration)
    if dur_str:
        entry["duration"] = dur_str

    if item.get("essential"):
        entry["essential"] = True

    children = item.get("children") or []
    if children:
        converted = []
        for child in children:
            out = _convert_item(child)
            if out:
                converted.append(out)
        if converted:
            entry["children"] = converted

    return entry


def run(args, properties):
    if len(args) < 2 or args[0].lower() != "save" or args[1].lower() != "day":
        print(get_help_message())
        return

    name = properties.get("name")
    if not name:
        name = " ".join(args[2:]).strip()
    if not name:
        name = datetime.now().strftime("%A").lower()

    overwrite = str(properties.get("overwrite") or "false").lower() in {"true", "1", "yes"}
    weekday = properties.get("weekday")

    schedule_path = schedule_path_for_date(datetime.now())
    if not os.path.exists(schedule_path):
        print("❌ No schedule found for today. Run 'today' first.")
        return

    with open(schedule_path, 'r') as f:
        schedule = yaml.safe_load(f) or []

    # Sort by start time when possible
    try:
        schedule = sorted(schedule, key=lambda i: i.get("start_time") or datetime.now())
    except Exception:
        pass

    children = []
    for item in schedule:
        converted = _convert_item(item)
        if converted:
            children.append(converted)

    data = {
        "name": name,
        "type": "day",
        "description": f"Generated from schedule on {datetime.now().strftime('%Y-%m-%d')}",
        "duration": "24h",
        "children": children,
    }
    if weekday:
        data["days"] = [weekday]

    days_dir = os.path.join(USER_DIR, "Days")
    os.makedirs(days_dir, exist_ok=True)
    filename = name.replace('/', '_').strip()
    path = os.path.join(days_dir, f"{filename}.yml")

    if os.path.exists(path) and not overwrite:
        print(f"❌ Template '{name}' already exists. Use overwrite:true to replace.")
        return

    with open(path, 'w') as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)

    try:
        from Modules.achievement import evaluator as AchievementEvaluator  # type: ignore
        AchievementEvaluator.emit_event("template_saved", {
            "template_type": "day",
            "name": name,
            "source": "command:template",
        })
    except Exception:
        pass

    print(f"✅ Saved day template: {path}")


def get_help_message():
    return """
Usage: template save day [name:<name>] [weekday:<Weekday>] [overwrite:true|false]
Description: Saves the current schedule as a day template.
Example: template save day name:"Focus Friday" overwrite:true
"""
