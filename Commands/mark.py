
import os
import yaml
from Modules.ItemManager import get_item_path, read_item_data, write_item_data

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

    schedule_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'User', 'Schedules', 'today_schedule.yml'))
    # Per-day completion file under User/Schedules/completions/YYYY-MM-DD.yml
    schedules_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'User', 'Schedules'))
    completions_dir = os.path.join(schedules_dir, 'completions')
    os.makedirs(completions_dir, exist_ok=True)
    from datetime import datetime, timedelta
    today_str = datetime.now().strftime('%Y-%m-%d')
    completion_path = os.path.join(completions_dir, f'{today_str}.yml')

    if not os.path.exists(schedule_path):
        print("❌ today_schedule.yml not found. Generate a schedule with 'today'.")
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
    if is_repeating:
        # This is a repeating item, so update the completion file
        if os.path.exists(completion_path):
            with open(completion_path, 'r') as f:
                completion_data = yaml.safe_load(f) or {}
        else:
            completion_data = {}

        completion_data[item_name] = new_status

        # Prepare to also update the item's own completion history (for repeating items)
        def _update_repeating_history():
            try:
                from datetime import datetime, timedelta
                today = datetime.now().strftime('%Y-%m-%d')
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

        # Persist per-day completion status and update history
        with open(completion_path, 'w') as f:
            yaml.dump(completion_data, f, default_flow_style=False, sort_keys=False)
        _update_repeating_history()

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
