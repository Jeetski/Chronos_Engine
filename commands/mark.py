
import os
import yaml
from datetime import datetime
from modules.item_manager import get_item_path, read_item_data, write_item_data
from modules.scheduler import schedule_path_for_date, build_block_key
from commands.today import load_completion_payload
from modules import quality_utils
from Utilities.completion_effects import run_completion_effects


def _normalize_time_str(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.strftime("%H:%M")
    if isinstance(value, str):
        txt = value.strip()
        if not txt:
            return None
        try:
            parsed = datetime.strptime(txt, "%H:%M")
        except ValueError:
            return None
        return parsed.strftime("%H:%M")
    return None

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

def find_item_in_nested_schedule(schedule, item_name, desired_start=None):
    """
    Recursively searches for an item by name in the nested schedule structure.
    Returns the item dictionary if found, otherwise None.
    """
    if not schedule:
        return None

    candidates = []
    for item in schedule:
        if isinstance(item, dict) and item.get('name', '').strip().lower() == item_name.strip().lower():
            candidates.append(item)
        if "children" in item and item["children"]:
            found_in_children = find_item_in_nested_schedule(item["children"], item_name, desired_start)
            if found_in_children:
                candidates.append(found_in_children)
    if not candidates:
        return None
    if desired_start:
        for item in candidates:
            start_time = item.get("start_time")
            if start_time and _normalize_time_str(start_time) == desired_start:
                return item
    return candidates[0]

def run(args, properties):
    """
    Marks an item with a new status. For repeating items (with a 'frequency' property),
    it updates a daily completion file. For non-repeating items, it updates the item's own file.
    """
    if not args or "help" in args or "--help" in args:
        print(get_help_message())
        return

    full_arg_string = ' '.join(args) # Join all parts to form the full argument string

    try:
        # Find the last colon to separate item_name from status
        last_colon_index = full_arg_string.rfind(':')
        if last_colon_index == -1:
            raise ValueError("No colon found in argument.")

        item_name = full_arg_string[:last_colon_index].strip()
        new_status = full_arg_string[last_colon_index + 1:].strip()

        if not item_name or not new_status:
            raise ValueError("Item name or status is empty.")

    except ValueError as e:
        print(f"❌ Invalid format: {e}. Use 'mark \"item name\":status'")
        return

    # Per-day completion file under User/Schedules/completions/YYYY-MM-DD.yml.
    # Supports date override from dashboard flows (e.g., calendar day view).
    from datetime import datetime, timedelta
    target_date = str(properties.get("date") or datetime.now().strftime('%Y-%m-%d')).strip()
    try:
        datetime.strptime(target_date, "%Y-%m-%d")
    except ValueError:
        print("❌ Invalid date. Use YYYY-MM-DD.")
        return

    schedule_path = schedule_path_for_date(target_date)
    completion_data, completion_path = load_completion_payload(target_date)
    entries = completion_data.setdefault("entries", {})

    if not os.path.exists(schedule_path):
        print("❌ schedule file not found. Generate a schedule with 'today'.")
        return

    with open(schedule_path, 'r') as f:
        schedule = yaml.safe_load(f)

    desired_start = _normalize_time_str(properties.get("start_time") or properties.get("scheduled_start"))
    desired_end = _normalize_time_str(properties.get("end_time") or properties.get("scheduled_end"))
    item_in_schedule = find_item_in_nested_schedule(schedule, item_name, desired_start)

    has_item_file = True

    if not item_in_schedule:
        # If not found in schedule, it might be a non-scheduled item, try to get its type from its name
        # This is a fallback for items not in today's schedule but still markable
        # This part needs to be more robust, potentially searching all item types
        # For now, we'll assume if it's not in the schedule, it's a top-level item
        # and we need to infer its type or get it from a global item list
        print(f"❌ Item '{item_name}' not found in the schedule. Attempting to infer type...")
        # This is a placeholder for more sophisticated type inference
        # For now, we'll assume it's a 'note' if not found in schedule
        item_type = "note" # Fallback type
        item_data = read_item_data(item_type, item_name)
        if not item_data:
            print(f"❌ Item '{item_name}' not found as a note either. Cannot mark.")
            return
    else:
        item_type = item_in_schedule.get('type')
        if not item_type:
            print(f"❌ Item '{item_name}' has no type in the schedule.")
            return
        item_data = read_item_data(item_type, item_name)

        if not item_data:
            # Some schedule rows (e.g. anchor timeblocks) do not map to item files.
            # Allow per-day completion logging for those schedule-only blocks.
            has_item_file = False
            item_data = {}

    # Detect repeating via 'frequency' or 'Frequency'
    is_repeating = has_item_file and (('frequency' in item_data) or ('Frequency' in item_data))
    quality_raw = properties.get("quality")
    quality, err = quality_utils.canonicalize_quality(quality_raw)
    if err:
        print(err)
        return

    scheduled_start = desired_start
    scheduled_end = desired_end
    if item_in_schedule:
        if item_in_schedule.get("start_time"):
            scheduled_start = item_in_schedule["start_time"].strftime("%H:%M")
        if item_in_schedule.get("end_time"):
            scheduled_end = item_in_schedule["end_time"].strftime("%H:%M")

    def _log_completion_entry():
        if not (item_in_schedule or scheduled_start):
            return
        block_key = build_block_key(item_name, scheduled_start or "unscheduled")
        entry = {
            "name": item_name,
            "status": new_status,
            "scheduled_start": scheduled_start,
            "scheduled_end": scheduled_end,
            "logged_at": datetime.now().isoformat(timespec="seconds"),
        }
        if quality:
            entry["quality"] = quality
        entries[block_key] = entry
        with open(completion_path, 'w') as f:
            yaml.dump(completion_data, f, default_flow_style=False, sort_keys=False)

    status_lower = str(new_status).lower()
    if is_repeating:
        # This is a repeating item, so update the completion file + history
        _log_completion_entry()

        # Prepare to also update the item's own completion history (for repeating items)
        def _update_repeating_history():
            try:
                from datetime import datetime, timedelta
                today = target_date
                last_completed = item_data.get('last_completed')
                if new_status == 'completed':
                    completion_dates = item_data.get('completion_dates', [])
                    if today not in completion_dates:
                        completion_dates.append(today)
                    item_data['completion_dates'] = completion_dates
                    item_data['last_completed'] = today
                    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
                    if last_completed == yesterday:
                        item_data['current_streak'] = item_data.get('current_streak', 0) + 1
                    else:
                        item_data['current_streak'] = 1
                    if item_data.get('current_streak', 0) > item_data.get('longest_streak', 0):
                        item_data['longest_streak'] = item_data['current_streak']
                    write_item_data(item_type, item_name, item_data)
            except Exception:
                pass

        _update_repeating_history()

        print(f"✅ Marked repeating item '{item_name}' as '{new_status}' for today.")
        minutes = _minutes_between(scheduled_start, scheduled_end)
        run_completion_effects(
            item_type,
            item_name,
            minutes=minutes,
            count_as_completion=(status_lower == 'completed'),
            run_milestones=(status_lower == 'completed'),
        )

    else:
        # This is a non-repeating item, so update the item's own file
        if has_item_file:
            item_data['status'] = new_status
            write_item_data(item_type, item_name, item_data)
        _log_completion_entry()
        if has_item_file:
            print(f"✅ Marked non-repeating item '{item_name}' as '{new_status}'.")
        else:
            print(f"✅ Marked schedule block '{item_name}' as '{new_status}' for {target_date}.")
        minutes = _minutes_between(scheduled_start, scheduled_end)
        run_completion_effects(
            item_type,
            item_name,
            minutes=minutes,
            count_as_completion=(status_lower == 'completed'),
            run_milestones=(status_lower == 'completed'),
        )

def get_help_message():
    """
    Returns the help message for the 'mark' command.
    """
    return """
Usage: mark <item_name>:<status>
Description: Marks an item in the daily schedule with a new status.
Example: mark "Morning Routine":completed
"""

