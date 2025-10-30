import os
import yaml
from datetime import datetime, timedelta
import re

# --- Constants ---
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
USER_DIR = os.path.join(ROOT_DIR, "User")
TODAY_SCHEDULE_PATH = os.path.join(USER_DIR, "Schedules", "today_schedule.yml")
MANUAL_MODIFICATIONS_PATH = os.path.join(USER_DIR, "manual_modifications.yml")
MODULES_DIR = os.path.join(ROOT_DIR, "Modules")

# --- Helper Functions ---
def get_day_template_path(day_of_week):
    """
    Gets the path to the day template for the given day of the week.
    """
    return os.path.join(USER_DIR, "Days", f"{day_of_week}.yml")

def read_template(template_path):
    """
    Reads a YAML template file.
    """
    if not os.path.exists(template_path):
        return None
    with open(template_path, 'r') as f:
        return yaml.safe_load(f)

def format_time(time_obj):
    """
    Formats a datetime object into a string.
    """
    return time_obj.strftime("%H:%M")

def is_ancestor(ancestor_item, descendant_item):
    """
    Recursively checks if ancestor_item is an ancestor of descendant_item.
    """
    current_parent = descendant_item.get("parent")
    while current_parent:
        if current_parent == ancestor_item:
            return True
        current_parent = current_parent.get("parent")
    return False

def get_flattened_schedule(schedule):
    """
    Returns a flattened list of all items (including sub_items and microroutines) in the schedule.
    """
    flat_schedule = []
    def flatten(items):
        for item in items:
            flat_schedule.append(item)
            if "children" in item and item["children"]:
                flatten(item["children"])
    flatten(schedule)
    return flat_schedule

def remove_item_from_schedule(schedule, item_to_remove):
    """
    Recursively removes an item from the schedule.
    """
    for i, item in enumerate(schedule):
        if item == item_to_remove:
            del schedule[i]
            return True
        if "children" in item and item["children"]:
            if remove_item_from_schedule(item["children"], item_to_remove):
                return True
    return False

from Utilities.duration_parser import parse_duration_string # Import parse_duration_string

def update_parent_times(item):
    """
    Recursively updates the start and end times of parent items based on their children's times.
    Also ensures parent's duration respects its explicit duration or expands if children exceed it.
    """
    print(f"DEBUG: update_parent_times called for item: {item.get('name', 'Unnamed Item')}") # ADD THIS LINE
    if not item.get("parent"):
        print(f"DEBUG: {item.get('name', 'Unnamed Item')} has no parent, returning.") # ADD THIS LINE
        return

    parent = item["parent"]
    if not parent.get("children"):
        return

    children = parent.get("children", [])
    if not children:
        return

    parent["start_time"] = min(child["start_time"] for child in children)
    parent["end_time"] = max(child["end_time"] for child in children)
    
    # Calculate duration based on children's span
    children_span_duration = (parent["end_time"] - parent["start_time"]).total_seconds() / 60
    print(f"DEBUG: children_span_duration for {parent["name"]}: {children_span_duration})") # ADD THIS LINE

    # Get explicit duration from original_item_data if available
    explicit_parent_duration_str = parent.get("original_item_data", {}).get("duration")
    print(f"DEBUG: explicit_parent_duration_str for {parent["name"]}: {explicit_parent_duration_str})") # ADD THIS LINE
    
    if explicit_parent_duration_str and explicit_parent_duration_str != "parallel":
        explicit_duration_minutes = parse_duration_string(explicit_parent_duration_str)
        parent["duration"] = max(explicit_duration_minutes, children_span_duration)
    elif explicit_parent_duration_str == "parallel":
        parent["duration"] = 0 # Explicitly parallel parent has 0 duration
    else:
        parent["duration"] = children_span_duration # No explicit duration, use children's span
    print(f"DEBUG: Final parent[\"duration\"] for {parent["name"]}: {parent["duration"]})") # ADD THIS LINE

    update_parent_times(parent)

def find_item_in_schedule(schedule, item_name):
    """
    Recursively searches for an item by name in the nested schedule structure.
    Returns the item dictionary and its parent item dictionary (or None if top-level).
    """
    for item in schedule:
        if item.get("name", "").strip().lower() == item_name.strip().lower():
            return item, item.get("parent")

        if "children" in item and item["children"]:
            found_item, found_parent = find_item_in_schedule(item["children"], item_name)
            if found_item:
                return found_item, found_parent
    return None, None

def save_schedule(schedule, file_path):
    """
    Saves the given schedule to a YAML file.
    """
    with open(file_path, 'w') as f:
        yaml.dump(schedule, f, default_flow_style=False)

def load_manual_modifications(file_path):
    """
    Loads manual modifications from a YAML file.
    """
    if not os.path.exists(file_path):
        return []
    with open(file_path, 'r') as f:
        return yaml.safe_load(f) or []

def save_manual_modifications(modifications, file_path):
    """
    Saves manual modifications to a YAML file.
    """
    with open(file_path, 'w') as f:
        yaml.dump(modifications, f, default_flow_style=False)

def trim_item_in_file(file_path, item_name, amount_to_trim_minutes):
    """
    Records a trim modification for the specified item.
    """
    modifications = load_manual_modifications(MANUAL_MODIFICATIONS_PATH)
    modifications.append({"action": "trim", "item_name": item_name, "amount": amount_to_trim_minutes})
    save_manual_modifications(modifications, MANUAL_MODIFICATIONS_PATH)
    print(f"✅ Recorded trim for '{item_name}' by {amount_to_trim_minutes} minutes. Run 'today reschedule' to apply changes.")
    return True

def cut_item_in_file(file_path, item_name):
    """
    Records a cut modification for the specified item.
    """
    modifications = load_manual_modifications(MANUAL_MODIFICATIONS_PATH)
    modifications.append({"action": "cut", "item_name": item_name})
    save_manual_modifications(modifications, MANUAL_MODIFICATIONS_PATH)
    print(f"✅ Recorded cut for '{item_name}'. Run 'today reschedule' to apply changes.")
    return True

def change_item_time_in_file(file_path, item_name, new_start_time_str):
    """
    Records a change modification for the specified item's start time.
    """
    modifications = load_manual_modifications(MANUAL_MODIFICATIONS_PATH)
    modifications.append({"action": "change", "item_name": item_name, "new_start_time": new_start_time_str})
    save_manual_modifications(modifications, MANUAL_MODIFICATIONS_PATH)
    print(f"✅ Recorded start time change for '{item_name}' to {new_start_time_str}. Run 'today reschedule' to apply changes.")
    return True

def apply_manual_modifications(schedule, manual_modifications):
    """
    Applies a list of manual modifications (trim, cut, change) to an in-memory schedule.
    """
    for mod in manual_modifications:
        action = mod.get("action")
        item_name = mod.get("item_name")

        item, parent_item = find_item_in_schedule(schedule, item_name)
        if not item:
            print(f"⚠️ Warning: Manual modification for item '{item_name}' could not be applied (item not found).")
            continue

        if action == "trim":
            amount = mod.get("amount")
            if amount is not None:
                if item["duration"] - amount < 5:
                    print(f"⚠️ Warning: Cannot trim '{item_name}' by {amount} minutes. Minimum duration is 5 minutes. Skipping modification.")
                    continue
                item["duration"] -= amount
                item["end_time"] = item["start_time"] + timedelta(minutes=item["duration"])
                update_parent_times(item)
                print(f"✅ Applied manual trim for '{item_name}' by {amount} minutes.")
        elif action == "cut":
            if parent_item:
                if "children" in parent_item and item in parent_item["children"]:
                    parent_item["children"].remove(item)
                update_parent_times(parent_item)
            else:
                # If it's a top-level item, remove it from the main schedule list
                for i, top_level_item in enumerate(schedule):
                    if top_level_item == item:
                        del schedule[i]
                        break
            print(f"✅ Applied manual cut for '{item_name}'.")
        elif action == "change":
            new_start_time_str = mod.get("new_start_time")
            if new_start_time_str:
                try:
                    new_hour = int(new_start_time_str.split(':')[0])
                    new_minute = int(new_start_time_str.split(':')[1])
                    new_start_time = datetime.now().replace(hour=new_hour, minute=new_minute, second=0, microsecond=0)
                except (ValueError, IndexError):
                    print(f"❌ Error: Invalid time format for '{new_start_time_str}' in manual change for '{item_name}'. Please use HH:MM. Skipping modification.")
                    continue
                item["start_time"] = new_start_time
                item["end_time"] = new_start_time + timedelta(minutes=item["duration"])
                update_parent_times(item)
                print(f"✅ Applied manual change for '{item_name}' to {new_start_time_str}.")


from Modules.ItemManager import read_item_data # Import read_item_data
import subprocess
import os

# Define the path to the colorprint executable
COLORPRINT_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Utilities", "colorprint", "colorprint.exe"))

def display_schedule(schedule, conflicts, indent=0, display_level=float('inf'), current_level=0, today_completion_data=None):
    """
    Displays the schedule to the user, recursively handling nested items up to a certain display level,
    with color coding based on completion status using the external colorprint.exe.
    """
    indent_str = "  " * indent
    if indent == 0:
        # Use colorprint for the header as well
        subprocess.run([COLORPRINT_PATH, 'print:--- Today\'s Schedule ---', 'text:white', 'background:dark_blue'], capture_output=False)

    for item in schedule:
        if item.get("is_buffer"):
            subprocess.run([COLORPRINT_PATH, f'print:{indent_str}--- Buffer ({item['duration']} minutes) ---', 'text:gray', 'background:dark_blue'], capture_output=False)
        else:
            item_name = item.get('name', 'Unnamed Item')
            item_type = item.get('type')
            text_color = "red" # Default color

            if item_type:
                # Check if it's a repeating item by trying to read its full data
                full_item_data = read_item_data(item_type, item_name)
                # Consider both 'frequency' and 'Frequency' keys for compatibility
                is_repeating = False
                if full_item_data:
                    if 'frequency' in full_item_data:
                        is_repeating = True
                    elif 'Frequency' in full_item_data:
                        is_repeating = True
                if is_repeating:
                    # Repeating item: check today_completion_data
                    if today_completion_data and item_name in today_completion_data:
                        current_status = today_completion_data[item_name]
                        if current_status == "completed":
                            text_color = "green"
                else:
                    # Non-repeating item: check its own status
                    if full_item_data and 'status' in full_item_data:
                        current_status = full_item_data['status']
                        if current_status == "completed":
                            text_color = "green"
            
            message = ""
            if item.get("is_parallel_item"):
                message = f'{indent_str}{format_time(item['start_time'])} - {format_time(item['end_time'])}: {item_name} (parallel)'
            else:
                message = f'{indent_str}{format_time(item['start_time'])} - {format_time(item['end_time'])}: {item_name} ({item['duration']} minutes)'
            
            subprocess.run([COLORPRINT_PATH, f'print:{message}', f'text:{text_color}', 'background:dark_blue'], capture_output=False)
        
        if "children" in item and item["children"] and current_level < display_level:
            display_schedule(item["children"], conflicts, indent + 1, display_level, current_level + 1, today_completion_data)

    if indent == 0 and conflicts:
        subprocess.run([COLORPRINT_PATH, 'print:\n--- Conflicts ---', 'text:white', 'background:dark_blue'], capture_output=False)
        for conflict in conflicts:
            subprocess.run([COLORPRINT_PATH, f'print:{conflict}', 'text:red'], capture_output=False)
