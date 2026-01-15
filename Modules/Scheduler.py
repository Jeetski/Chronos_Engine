import os
import yaml
from datetime import datetime, timedelta
import re

# --- Constants ---
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
USER_DIR = os.path.join(ROOT_DIR, "User")
MODULES_DIR = os.path.join(ROOT_DIR, "Modules")

SCHEDULE_DATE_FORMAT = "%Y-%m-%d"

def _normalize_date_str(date_value=None):
    if not date_value:
        return datetime.now().strftime(SCHEDULE_DATE_FORMAT)
    if isinstance(date_value, datetime):
        return date_value.strftime(SCHEDULE_DATE_FORMAT)
    return str(date_value)

def schedule_path_for_date(date_value=None):
    date_str = _normalize_date_str(date_value)
    return os.path.join(USER_DIR, "Schedules", f"schedule_{date_str}.yml")

def manual_modifications_path_for_date(date_value=None):
    date_str = _normalize_date_str(date_value)
    return os.path.join(USER_DIR, "Schedules", f"manual_modifications_{date_str}.yml")

def status_current_path():
    candidates = [
        os.path.join(USER_DIR, "current_status.yml"),
        os.path.join(USER_DIR, "Profile", "Current_Status.yml"),
        os.path.join(USER_DIR, "Profile", "current_status.yml"),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return candidates[0]

def status_history_path_for_date(date_value=None):
    date_str = _normalize_date_str(date_value)
    candidates = [
        os.path.join(USER_DIR, "Logs", f"status_{date_str}.yml"),
        os.path.join(USER_DIR, "Profile", "Status", f"status_{date_str}.yml"),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return candidates[0]

def _extract_schedule_date(schedule_path):
    if not schedule_path:
        return None
    match = re.search(r"schedule_(\d{4}-\d{2}-\d{2})\.yml$", str(schedule_path))
    if not match:
        return None
    return match.group(1)

def manual_modifications_path_for_schedule(schedule_path):
    date_str = _extract_schedule_date(schedule_path)
    return manual_modifications_path_for_date(date_str)

# --- Helper Functions ---
def get_day_template_path(day_of_week):
    """
    Gets the path to the day template for the given day of the week.
    """
    return os.path.join(USER_DIR, "Days", f"{day_of_week}.yml")

def list_day_template_paths(day_of_week):
    """
    Returns ALL template candidates from User/Days/.
    Templates self-describe their eligibility via 'days' property.
    If no 'days' property, the template is eligible for any day.
    """
    days_dir = os.path.join(USER_DIR, "Days")
    if not os.path.isdir(days_dir):
        return []

    candidates = []
    for filename in os.listdir(days_dir):
        if not filename.lower().endswith(".yml"):
            continue
        candidates.append(os.path.join(days_dir, filename))

    return candidates

def list_all_day_templates():
    """
    Returns all template files from User/Days/ without any filtering.
    """
    days_dir = os.path.join(USER_DIR, "Days")
    if not os.path.isdir(days_dir):
        return []
    
    templates = []
    for filename in os.listdir(days_dir):
        if filename.lower().endswith(".yml"):
            templates.append(os.path.join(days_dir, filename))
    return templates

def is_template_eligible_for_day(template, day_of_week):
    """
    Check if a template is eligible for the given day.
    - If template has 'days' property, current day must be in the list
    - If no 'days' property, check if filename matches day (backwards compatible)
    - Templates with status_requirements but no days are eligible for any day
    """
    days_prop = template.get("days", None)
    
    if days_prop is not None:
        # Explicit days property - check if current day is in list
        if isinstance(days_prop, list):
            normalized_days = [d.lower().strip() for d in days_prop]
            return day_of_week.lower() in normalized_days
        elif isinstance(days_prop, str):
            return day_of_week.lower() == days_prop.lower().strip()
        elif days_prop == [] or days_prop is False:
            # Empty list or False = eligible for any day (status-only template)
            return True
    
    # No days property - check if template has status_requirements
    # If it has status requirements, it's a special template eligible any day
    if template.get("status_requirements"):
        return True
    
    # Fallback: no days property and no status_requirements
    # This is a regular weekday template - rely on filename matching
    return True


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

def build_block_key(item_name, start_time_obj_or_str):
    """
    Builds the composite key used to persist completion entries. Accepts datetime or preformatted HH:MM.
    """
    if isinstance(start_time_obj_or_str, datetime):
        start_str = format_time(start_time_obj_or_str)
    else:
        start_str = start_time_obj_or_str or ""
    safe_name = (item_name or "Unnamed").strip()
    return f"{safe_name}@{start_str}"

def normalize_completion_entries(today_completion_data):
    """
    Normalizes completion payloads so callers can always expect a dict of block key -> entry.
    """
    if not isinstance(today_completion_data, dict):
        return {}

    if "entries" in today_completion_data and isinstance(today_completion_data["entries"], dict):
        return today_completion_data["entries"]
    return {}

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
    if not item.get("parent"):
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

    # Get explicit duration from original_item_data if available
    explicit_parent_duration_str = parent.get("original_item_data", {}).get("duration")
    
    if explicit_parent_duration_str and explicit_parent_duration_str != "parallel":
        explicit_duration_minutes = parse_duration_string(explicit_parent_duration_str)
        parent["duration"] = max(explicit_duration_minutes, children_span_duration)
    elif explicit_parent_duration_str == "parallel":
        parent["duration"] = 0 # Explicitly parallel parent has 0 duration
    else:
        parent["duration"] = children_span_duration # No explicit duration, use children's span

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
    manual_path = manual_modifications_path_for_schedule(file_path)
    modifications = load_manual_modifications(manual_path)
    modifications.append({"action": "trim", "item_name": item_name, "amount": amount_to_trim_minutes})
    save_manual_modifications(modifications, manual_path)
    print(f"✅ Recorded trim for '{item_name}' by {amount_to_trim_minutes} minutes. Run 'today reschedule' to apply changes.")
    return True

def cut_item_in_file(file_path, item_name):
    """
    Records a cut modification for the specified item.
    """
    manual_path = manual_modifications_path_for_schedule(file_path)
    modifications = load_manual_modifications(manual_path)
    modifications.append({"action": "cut", "item_name": item_name})
    save_manual_modifications(modifications, manual_path)
    print(f"✅ Recorded cut for '{item_name}'. Run 'today reschedule' to apply changes.")
    return True

def change_item_time_in_file(file_path, item_name, new_start_time_str):
    """
    Records a change modification for the specified item's start time.
    """
    manual_path = manual_modifications_path_for_schedule(file_path)
    modifications = load_manual_modifications(manual_path)
    modifications.append({"action": "change", "item_name": item_name, "new_start_time": new_start_time_str})
    save_manual_modifications(modifications, manual_path)
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


from Modules.ItemManager import read_item_data, list_all_items_any
import subprocess
import os

# Define the path to the colorprint executable
COLORPRINT_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Utilities", "colorprint", "colorprint.exe"))

STATUS_COLOR_MAP = {
    "completed": "green",
    "skipped": "yellow",
    "partial": "cyan",
    "missed": "red",
    "in_progress": "bright_cyan",
    "upcoming": "white",
}

COMPLETION_DONE_STATUSES = {"completed", "skipped"}

def _resolve_block_status(item, completion_entries):
    """
    Returns (status_key, completion_entry) for schedule display.
    """
    if item.get("is_buffer"):
        return "buffer", None

    key = build_block_key(item.get("name"), item.get("start_time"))
    entry = completion_entries.get(key)
    if entry and entry.get("status"):
        return entry["status"].lower(), entry

    now = datetime.now()
    start_time = item.get("start_time")
    end_time = item.get("end_time")
    if not isinstance(start_time, datetime) or not isinstance(end_time, datetime):
        return "upcoming", None

    if now < start_time:
        return "upcoming", None
    if start_time <= now < end_time:
        return "in_progress", None
    return "missed", None

def display_schedule(schedule, conflicts, indent=0, display_level=float('inf'), current_level=0, today_completion_data=None, color_override=None, title=None):
    """
    Displays the schedule to the user, recursively handling nested items up to a certain display level,
    with color coding based on completion status using the external colorprint.exe.
    """
    indent_str = "  " * indent
    if indent == 0:
        # Use colorprint for the header as well
        header = title or "--- Today's Schedule ---"
        subprocess.run([COLORPRINT_PATH, f'print:{header}', 'text:white', 'background:dark_blue'], capture_output=False)

    completion_entries = normalize_completion_entries(today_completion_data or {})

    for item in schedule:
        if item.get("is_buffer"):
            subprocess.run([COLORPRINT_PATH, f'print:{indent_str}--- Buffer ({item["duration"]} minutes) ---', 'text:gray', 'background:dark_blue'], capture_output=False)
        else:
            item_name = item.get('name', 'Unnamed Item')
            status_key, completion_entry = _resolve_block_status(item, completion_entries)
            status_label = "" if status_key == "buffer" else f" [{status_key.replace('_', ' ').title()}]"

            text_color = STATUS_COLOR_MAP.get(status_key, "red")
            if color_override == "future":
                text_color = "green"

            if item.get("is_parallel_item"):
                message = f'{indent_str}{format_time(item["start_time"])} - {format_time(item["end_time"])}: {item_name} (parallel){status_label}'
            else:
                message = f'{indent_str}{format_time(item["start_time"])} - {format_time(item["end_time"])}: {item_name} ({item["duration"]} minutes){status_label}'

            if completion_entry and (completion_entry.get("actual_start") or completion_entry.get("actual_end")):
                actual_start = completion_entry.get("actual_start") or completion_entry.get("actual_end")
                actual_end = completion_entry.get("actual_end") or completion_entry.get("actual_start")
                if actual_start or actual_end:
                    message += f' -> did {actual_start or "??"}-{actual_end or "??"}'

            subprocess.run([COLORPRINT_PATH, f'print:{message}', f'text:{text_color}', 'background:dark_blue'], capture_output=False)
        
        if "children" in item and item["children"] and current_level < display_level:
            display_schedule(item["children"], conflicts, indent + 1, display_level, current_level + 1, today_completion_data, color_override, title)

    if indent == 0 and conflicts:
        subprocess.run([COLORPRINT_PATH, 'print:\n--- Conflicts ---', 'text:white', 'background:dark_blue'], capture_output=False)
        for conflict in conflicts:
            subprocess.run([COLORPRINT_PATH, f'print:{conflict}', 'text:red'], capture_output=False)

# --- Routine Variants Logic ---

def _check_status_requirements(requirements, status_context):
    """
    Checks if the given requirements match the current status context.
    Returns True if all requirements are met.
    """
    if not requirements or not status_context:
        return True
        
    for key, req_value in requirements.items():
        # Handle dot notation (e.g. "health.energy")
        parts = key.split('.')
        curr_val = status_context
        found = True
        for part in parts:
            if isinstance(curr_val, dict) and part in curr_val:
                curr_val = curr_val[part]
            else:
                found = False
                break
        
        if not found:
            # If key not found in status, assume default "neutral" or ignore?
            # Stricter: requirement not met if status not present.
            return False
            
        # Comparison (simple equality for now)
        if str(curr_val).lower() != str(req_value).lower():
            return False
            
    return True

def resolve_variant(item_data, status_context):
    """
    Checks if 'item_data' has a 'variants' list.
    If so, looks for the first variant whose 'status_requirements' are met by 'status_context'.
    
    If a match is found:
    - Merges variant properties into a copy of item_data.
    - 'items' (children) are REPLACED, not merged.
    - Other scalar properties (duration, name) are overwritten.
    
    Returns the resolved item dict.
    """
    if not item_data or "variants" not in item_data:
        return item_data
        
    variants = item_data["variants"]
    if not isinstance(variants, list):
        return item_data
        
    resolved_item = item_data.copy()
    
    match_found = False
    for variant in variants:
        reqs = variant.get("status_requirements", {})
        if _check_status_requirements(reqs, status_context):
            # Match found! Apply this variant.
            match_found = True
            
            # Apply overrides
            for k, v in variant.items():
                if k in ["status_requirements", "name"]: 
                     if k == "name":
                        resolved_item["name"] = v
                     continue
                
                # Special handling for 'items'/'children' -> Complete Replacement
                if k in ["items", "children", "sequence"]:
                     resolved_item[k] = v
                else:
                     resolved_item[k] = v
            
            resolved_item["variant_applied"] = variant.get("name", "Unnamed Variant")
            break # Stop after first match (Priority to top of list)
            
    # Clean up variants key from the final object
    resolved_item.pop("variants", None)
    
    
    return resolved_item

def scan_and_inject_items(current_schedule, status_context):
    """
    Scans for items with 'auto_inject' property and checks if they match the current status.
    Returns a list of items to inject if they are not already in the schedule.
    """
    injected_items = []
    if not status_context:
        return injected_items

    existing_names = set()
    def collect_names(items):
        for item in items:
            existing_names.add(item.get("name", "").lower())
            if "children" in item:
                collect_names(item["children"])
    collect_names(current_schedule)

    all_items = list_all_items_any()
    
    for item_data in all_items:
        # Check for boolean auto_inject flag
        auto_inject_flag = item_data.get("auto_inject")
        
        if auto_inject_flag is not True:
            continue
            
        # Check requirements (standard status_requirements used for Phase 1/Variants)
        requirements = item_data.get("status_requirements")
        
        if not requirements:
            continue

        if _check_status_requirements(requirements, status_context):
            # Requirement met! Check duplication.
            if item_data.get("name", "").lower() in existing_names:
                continue
                
            # Create a clean schedule item
            new_item = {
                "name": item_data.get("name", "Injected Item"),
                "type": item_data.get("type", "task"),
                "status": "pending",
                "duration": parse_duration_string(item_data.get("duration", "15m")),
                "start_time": None,
                "end_time": None,
                "children": [],
                "essential": item_data.get("essential", False),
                "injected": True
            }
            
            # Resolve variants for injected item if needed
            if "variants" in item_data:
                resolved_data = resolve_variant(item_data, status_context)
                new_item["name"] = resolved_data.get("name")
                # update duration from resolved data
                new_item["duration"] = parse_duration_string(resolved_data.get("duration", str(new_item["duration"])))

            injected_items.append(new_item)
            print(f"💉 Injection Triggered: {new_item['name']}")

    return injected_items

def schedule_flexible_items(schedule, windows, status_context, current_date=None):
    """
    Phase 4: Work Windows.
    Fits items with no start_time (flexible items) into defined Windows based on Generic Filters.
    
    Args:
        schedule: List of dicts (the flattened schedule so far). Modified in-place.
        windows: List of window definitions from the day template.
        status_context: Current user status (for consistency, though windows handle filtering).
        current_date: datetime.date object for creating datetimes. Defaults to today.
    """
    if not windows:
        return schedule
        
    if current_date is None:
        current_date = datetime.now().date()
        
    # Helper to parse time strings (HH:MM) into datetime for the current day
    def to_datetime(time_str):
        try:
            h, m = map(int, time_str.split(":"))
            return datetime.combine(current_date, datetime.min.time().replace(hour=h, minute=m))
        except (ValueError, IndexError):
            return None

    # 1. Identify Flexible Items (items with no start_time or explicit None)
    # We only care about items already in the list but unscheduled, OR we could scan for them.
    # Architecture Decision: 'Today.py' likely loads ALL items. 
    # But currently, 'Today.py' only puts items in the schedule if they are in the template.
    # Flexible items are by definition NOT in the template's 'sequence'.
    # So we must SCAN for them, similar to 'scan_and_inject_items', but filtered by window.
    
    # Let's scan ALL items in the system again.
    all_items = list_all_items_any()
    
    # We need to know what's already scheduled to avoid duplicates
    scheduled_names = {i.get("name", "").lower() for i in schedule}
    
    # Sort windows by start time to fill earlier windows first
    windows.sort(key=lambda w: w.get("start", "00:00"))
    
    for window in windows:
        w_start = to_datetime(window.get("start"))
        w_end = to_datetime(window.get("end"))
        filters = window.get("filters", {})
        
        if not w_start or not w_end:
            continue
            
        print(f"🪟 Processing Window: {window.get('name')} ({window.get('start')} - {window.get('end')})")
        
        # Find candidates for this window
        candidates = []
        for item in all_items:
            name = item.get("name", "").lower()
            if name in scheduled_names:
                continue
            if item.get("start_time"): # Skip items that claim to make their own time (if any)
                continue
                
            # check filters
            matches = True
            for key, val in filters.items():
                item_val = item.get(key)
                
                # Normalize lists for comparison
                if not isinstance(val, list):
                    val = [val]
                    
                # If item property is a list (e.g. tags), check intersection
                if isinstance(item_val, list):
                    # true if ANY match
                    if not any(v in val for v in item_val):
                        matches = False
                        break
                else:
                    # strict equality (val is list of allowed options)
                    if item_val not in val:
                        matches = False
                        break
            
            if matches:
                 candidates.append(item)
                 
        if not candidates:
            continue
            
        # Sort candidates? Maybe by importance or duration?
        # For now, simplistic order.
        
        # Fit candidates into the window
        # We need to compute 'gaps' in this window based on what's ALREADY in the schedule
        # Items in schedule might overlap this window.
        
        current_cursor = w_start
        
        for candidate in candidates:
            duration_minutes = parse_duration_string(candidate.get("duration", "30m"))
            duration_delta = timedelta(minutes=duration_minutes)
            
            # Find next available slot for this duration
            # This is a mini collision detection loop
            placed = False
            while current_cursor + duration_delta <= w_end:
                # Check collision with ANY existing item
                candidate_start = current_cursor
                candidate_end = current_cursor + duration_delta
                
                collision = None
                for existing in schedule:
                    e_start = existing.get("start_time")
                    e_end = existing.get("end_time")
                    if not isinstance(e_start, datetime) or not isinstance(e_end, datetime):
                        continue
                        
                    # Overlap logic: StartA < EndB and EndA > StartB
                    if candidate_start < e_end and candidate_end > e_start:
                        collision = existing
                        break
                
                if collision:
                    # Move cursor to end of collider
                    current_cursor = collision["end_time"]
                    # Round up to nearest 5m? Optional Polish.
                    continue
                else:
                    # No collision! Place it.
                    placed = True
                    candidate["start_time"] = candidate_start
                    candidate["end_time"] = candidate_end
                    candidate["window"] = window.get("name") # Metadata
                    candidate["status"] = "pending" # ensure status
                    
                    schedule.append(candidate)
                    scheduled_names.add(candidate.get("name", "").lower())
                    print(f"  -> Scheduled '{candidate['name']}' at {candidate_start.strftime('%H:%M')}")
                    
                    # Advance cursor
                    current_cursor = candidate_end
                    break
            
            if not placed:
                 print(f"  -> Could not fit '{candidate['name']}' in window.")
                 
    return schedule
