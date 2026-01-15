
import os
import yaml
from Modules.ItemManager import get_item_path, read_item_data, write_item_data
from Modules.Scheduler import schedule_path_for_date, build_block_key
from Commands.today import load_completion_payload
from Modules import quality_utils

def find_item_in_nested_schedule(schedule, item_name):
    """
    Recursively searches for an item by name in the nested schedule structure.
    Returns the item dictionary if found, otherwise None.
    """
    if not schedule:
        return None

    for item in schedule:
        if isinstance(item, dict) and item.get('name', '').strip().lower() == item_name.strip().lower():
            return item
        if "children" in item and item["children"]:
            found_in_children = find_item_in_nested_schedule(item["children"], item_name)
            if found_in_children:
                return found_in_children
    return None

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

    # Per-day completion file under User/Schedules/completions/YYYY-MM-DD.yml
    from datetime import datetime, timedelta
    today_str = datetime.now().strftime('%Y-%m-%d')
    schedule_path = schedule_path_for_date(today_str)
    completion_data, completion_path = load_completion_payload(today_str)
    entries = completion_data.setdefault("entries", {})

    if not os.path.exists(schedule_path):
        print("❌ schedule file not found. Generate a schedule with 'today'.")
        return

    with open(schedule_path, 'r') as f:
        schedule = yaml.safe_load(f)

    item_in_schedule = find_item_in_nested_schedule(schedule, item_name)

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
            print(f"❌ Could not read data for item '{item_name}' of type '{item_type}'.")
            return

    # Detect repeating via 'frequency' or 'Frequency'
    is_repeating = ('frequency' in item_data) or ('Frequency' in item_data)
    quality_raw = properties.get("quality")
    quality, err = quality_utils.canonicalize_quality(quality_raw)
    if err:
        print(err)
        return

    if is_repeating:
        # This is a repeating item, so update the completion file
        scheduled_start = None
        scheduled_end = None
        if item_in_schedule:
            if item_in_schedule.get("start_time"):
                scheduled_start = item_in_schedule["start_time"].strftime("%H:%M")
            if item_in_schedule.get("end_time"):
                scheduled_end = item_in_schedule["end_time"].strftime("%H:%M")
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

        print(f"✅ Marked repeating item '{item_name}' as '{new_status}' for today.")
        # Evaluate commitments after marking to trigger immediate actions
        try:
            from Modules.Commitment import main as CommitmentModule  # type: ignore
            CommitmentModule.evaluate_and_trigger()
        except Exception as e:
            print(f"Warning: Could not evaluate commitments: {e}")

    else:
        # This is a non-repeating item, so update the item's own file
        item_data['status'] = new_status
        write_item_data(item_type, item_name, item_data)
        print(f"✅ Marked non-repeating item '{item_name}' as '{new_status}'.")
        # Evaluate commitments after marking to trigger immediate actions
        try:
            from Modules.Commitment import main as CommitmentModule  # type: ignore
            CommitmentModule.evaluate_and_trigger()
        except Exception as e:
            print(f"Warning: Could not evaluate commitments: {e}")

def get_help_message():
    """
    Returns the help message for the 'mark' command.
    """
    return """
Usage: mark <item_name>:<status>
Description: Marks an item in the daily schedule with a new status.
Example: mark "Morning Routine":completed
"""

