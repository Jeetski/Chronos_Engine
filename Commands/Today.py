
import os
import yaml
from datetime import datetime, timedelta
import re
from Modules.Scheduler import (
    get_day_template_path, read_template, format_time, is_ancestor,
    get_flattened_schedule, remove_item_from_schedule, update_parent_times,
    ROOT_DIR, USER_DIR, TODAY_SCHEDULE_PATH, MODULES_DIR, MANUAL_MODIFICATIONS_PATH,
    load_manual_modifications, save_manual_modifications, apply_manual_modifications,
    find_item_in_schedule, save_schedule, display_schedule, list_day_template_paths,
    build_block_key, normalize_completion_entries
)



from Utilities.duration_parser import parse_duration_string # Import parse_duration_string
from Modules.ItemManager import read_item_data # Import read_item_data

def _normalize_status_key(name):
    if not name:
        return ""
    return str(name).strip().lower().replace(" ", "_")

def _load_status_level_values(status_name):
    """
    Loads the optional <Status>_Settings.yml file and returns { level -> numeric value }.
    """
    filename = f"{status_name.replace(' ', '_')}_Settings.yml"
    path = os.path.join(USER_DIR, "Settings", filename)
    data = read_template(path)
    if not isinstance(data, dict):
        return {}

    # Values are usually nested under Focus_Settings / Energy_Settings, etc.
    if len(data) == 1:
        inner_value = next(iter(data.values()))
        if isinstance(inner_value, dict):
            data = inner_value

    level_map = {}
    for level_name, level_info in data.items():
        normalized_level = _normalize_status_key(level_name)
        if isinstance(level_info, dict) and "value" in level_info:
            level_map[normalized_level] = level_info.get("value")
        elif isinstance(level_info, (int, float)):
            level_map[normalized_level] = level_info
    return level_map

def build_status_context(status_settings_data, current_status_data):
    """
    Normalizes status settings plus the pilot's current values so downstream scoring
    doesn't need to worry about file shapes.
    """
    context = {"types": {}, "current": {}}

    # Current status can either be a flat dict or wrapped in current_status key.
    if isinstance(current_status_data, dict):
        if "current_status" in current_status_data and isinstance(current_status_data["current_status"], dict):
            source = current_status_data["current_status"]
        else:
            source = current_status_data
        context["current"] = {
            _normalize_status_key(key): str(value).strip().lower()
            for key, value in source.items()
        }

    status_defs = []
    if isinstance(status_settings_data, dict):
        status_defs = status_settings_data.get("Status_Settings", [])
    elif isinstance(status_settings_data, list):
        status_defs = status_settings_data

    for entry in status_defs or []:
        name = entry.get("Name")
        if not name:
            continue
        slug = _normalize_status_key(name)
        context["types"][slug] = {
            "name": name,
            "rank": entry.get("Rank", 1),
            "values": _load_status_level_values(name),
        }

    return context

def _collect_status_values(raw_value):
    """
    Normalizes status preference representations (scalar/list/dict) into a list of strings.
    """
    if raw_value is None:
        return []
    if isinstance(raw_value, str):
        return [raw_value]
    if isinstance(raw_value, list):
        return [str(v) for v in raw_value]
    if isinstance(raw_value, dict):
        values = []
        for key in ("required", "preferred", "values"):
            if key in raw_value:
                values.extend(_collect_status_values(raw_value[key]))
        return values
    return []

def extract_status_requirements(source, status_context):
    """
    Returns { status_slug -> [allowed values] } based on status_requirements plus legacy keys.
    """
    if not isinstance(source, dict) or not status_context:
        return {}

    requirements = {}
    raw_requirements = source.get("status_requirements")
    if isinstance(raw_requirements, dict):
        for raw_key, raw_value in raw_requirements.items():
            slug = _normalize_status_key(raw_key)
            values = [val.strip().lower() for val in _collect_status_values(raw_value)]
            if values:
                requirements[slug] = values

    for status_slug, type_info in status_context.get("types", {}).items():
        candidate_keys = {
            status_slug,
            status_slug.replace("_", " "),
            type_info.get("name", ""),
            type_info.get("name", "").lower(),
            type_info.get("name", "").replace(" ", "_").lower(),
        }
        for key in candidate_keys:
            if not key:
                continue
            if key in source:
                values = [val.strip().lower() for val in _collect_status_values(source[key])]
                if values:
                    requirements.setdefault(status_slug, []).extend(values)

    # Ensure values are unique per slug
    return {slug: sorted(set(values)) for slug, values in requirements.items()}

def score_status_alignment(requirements, status_context):
    """
    Scores how well the current status matches a requirement dict.
    Positive scores mean closer alignment, negative scores penalize mismatches.
    """
    if not requirements or not status_context:
        return 0

    total = 0
    current_values = status_context.get("current", {})
    for status_slug, values in requirements.items():
        type_info = status_context.get("types", {}).get(status_slug)
        if not type_info:
            continue
        rank = type_info.get("rank", 1)
        normalized_values = [val.strip().lower() for val in values]
        current_value = current_values.get(status_slug)

        if current_value and current_value in normalized_values:
            total += rank
            continue

        level_map = type_info.get("values") or {}
        if current_value and current_value in level_map and normalized_values:
            target_diffs = []
            for candidate in normalized_values:
                if candidate in level_map:
                    target_diffs.append(abs(level_map[current_value] - level_map[candidate]))
            if target_diffs:
                diff = min(target_diffs)
                total -= rank * (0.25 + diff)
                continue

        # Unknown or outright mismatch yields a gentle penalty
        total -= rank * 0.5

    return total

def select_template_for_day(day_of_week, status_context):
    """
    Returns a dict describing the best template for the day:
    { 'path': ..., 'template': {...}, 'score': float }
    """
    candidate_paths = list_day_template_paths(day_of_week)
    if not candidate_paths:
        fallback_path = get_day_template_path(day_of_week)
        return {"path": fallback_path, "template": read_template(fallback_path), "score": 0}

    fallback_path = get_day_template_path(day_of_week)
    candidates = []
    for path in candidate_paths:
        template = read_template(path)
        if not template:
            continue
        requirements = extract_status_requirements(template, status_context)
        score = score_status_alignment(requirements, status_context)
        canonical = os.path.normpath(path) == os.path.normpath(fallback_path)
        candidates.append((score, not canonical, path, template))

    if not candidates:
        fallback_path = candidate_paths[0]
        return {"path": fallback_path, "template": read_template(fallback_path), "score": 0}

    candidates.sort(reverse=True)
    best_score, _, best_path, best_template = candidates[0]
    return {"path": best_path, "template": best_template, "score": best_score}

def load_completion_payload(date_str):
    """
    Loads (and if necessary migrates) the per-day completion data.
    Returns (data_dict, file_path).
    """
    completions_dir = os.path.join(USER_DIR, "Schedules", "completions")
    os.makedirs(completions_dir, exist_ok=True)
    per_day_path = os.path.join(completions_dir, f"{date_str}.yml")
    legacy_path = os.path.join(USER_DIR, "Schedules", "today_completion.yml")

    if os.path.exists(legacy_path):
        try:
            with open(legacy_path, "r") as fh:
                legacy_data = yaml.safe_load(fh) or {}
        except Exception:
            legacy_data = {}

        existing_data = {}
        if os.path.exists(per_day_path):
            with open(per_day_path, "r") as fh:
                existing_data = yaml.safe_load(fh) or {}

        merged = {**legacy_data, **existing_data}
        with open(per_day_path, "w") as fh:
            yaml.dump(merged, fh, default_flow_style=False)
        try:
            os.remove(legacy_path)
        except OSError:
            pass

    if os.path.exists(per_day_path):
        with open(per_day_path, "r") as fh:
            data = yaml.safe_load(fh) or {}
    else:
        data = {"entries": {}}

    if "entries" not in data:
        data = {"entries": data}

    return data, per_day_path

def _should_auto_reschedule(item):
    policy = str(item.get("original_item_data", {}).get("reschedule_policy", "auto")).lower()
    return policy != "manual"

def promote_missed_items(schedule, completion_entries, now, summary_bucket, skipped_bucket, *,
                         importance_ceiling=80, time_budget_minutes=None):
    """
    Moves unfinished leaf items that ended before 'now' to start just after the current time.
    Their importance is boosted so Phase 3 handling favors them.
    """
    if not schedule:
        return

    flattened = [i for i in get_flattened_schedule(schedule) if not i.get("children")]
    candidates = []
    for item in flattened:
        if item.get("is_buffer") or not _should_auto_reschedule(item):
            continue
        start, end = item.get("start_time"), item.get("end_time")
        if not isinstance(start, datetime) or not isinstance(end, datetime):
            continue
        if end >= now:
            continue

        key = build_block_key(item.get("name"), start)
        entry = completion_entries.get(key)
        if entry and entry.get("status", "").lower() in {"completed", "skipped"}:
            continue

        candidates.append(item)

    if not candidates:
        return

    candidates.sort(key=lambda item: item.get("importance_score", 999))

    if time_budget_minutes is None:
        day_end = now.replace(hour=23, minute=59, second=59, microsecond=0)
        time_budget_minutes = max(0, int((day_end - now).total_seconds() / 60))

    requeue_cursor = now
    remaining_budget = max(0, time_budget_minutes)
    for item in candidates:
        importance = item.get("importance_score", 999)
        duration = max(0, int(item.get("duration", 0)))
        if importance > importance_ceiling:
            skipped_bucket.append({
                "name": item.get("name", "Unnamed Item"),
                "reason": f"importance>{importance_ceiling}"
            })
            continue
        if duration <= 0:
            continue
        if duration > remaining_budget:
            skipped_bucket.append({
                "name": item.get("name", "Unnamed Item"),
                "reason": "insufficient time"
            })
            continue

        # Requeue directly after the current cursor.
        requeue_cursor = max(requeue_cursor, now)
        item["start_time"] = requeue_cursor
        item["end_time"] = requeue_cursor + timedelta(minutes=item.get("duration", 0))
        update_parent_times(item)
        item["importance_score"] = max(1, min(item.get("importance_score", 100), 5))
        requeue_cursor = item["end_time"] + timedelta(minutes=1)
        remaining_budget = max(0, remaining_budget - duration)
        summary_bucket.append({
            "name": item.get("name", "Unnamed Item"),
            "new_start": format_time(item["start_time"]),
        })
def build_initial_schedule(template, current_start_time=None, parent=None):
    """
    Builds an 'impossible' ideal schedule from a template, recursively handling nested items.
    This phase does not resolve conflicts or add buffers, it just lays out items based on ideal times.
    """
    schedule = []
    conflicts = []
    
    # If no current_start_time is provided, start from 8 AM today
    if current_start_time is None:
        current_start_time = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)

    if not template or "children" not in template: # Changed from "items" to "children"
        return schedule, conflicts

    for child_entry in template["children"]:
        child_name = child_entry.get('name')
        child_type = child_entry.get('type')

        if not child_name or not child_type:
            conflicts.append(f"Error: Child entry in template missing name or type: {child_entry}")
            continue

        item_data = read_item_data(child_type, child_name) # Read the actual item data
        if not item_data:
            conflicts.append(f"Error: Item data not found for {child_type} '{child_name}'")
            continue
        item = {
            "name": item_data.get("name", "Unnamed Item"),
            "type": item_data.get("type", child_type), # Ensure type is carried over
            "status": "pending",
            "duration": 0, # Initialize duration to 0, will be calculated below
            "start_time": None,
            "end_time": None,
            "ideal_start_time": item_data.get("ideal_start_time") or item_data.get("start_time"), # Check for start_time as well
            "ideal_end_time": item_data.get("ideal_end_time"),
            "children": [], # Use generic children list
            "parent": parent, # Add parent reference
            "depends_on": item_data.get("depends_on", []), # Add dependency tracking
            "is_parallel_item": item_data.get("duration") == "parallel", # New flag
            "original_item_data": item_data # Store original item_data
        }

        # Determine item's start time based on ideal_start_time or current_start_time
        item_actual_start_time = current_start_time
        if item["ideal_start_time"]:
            try:
                ideal_start_dt = datetime.now().replace(hour=int(item["ideal_start_time"].split(':')[0]), minute=int(item["ideal_start_time"].split(':')[1]), second=0, microsecond=0)
                item_actual_start_time = ideal_start_dt
            except:
                pass # Ignore invalid time formats

        # Always recursively process children if they exist
        children_total_duration = 0
        if "children" in item_data and item_data["children"]:
            child_schedule, child_conflicts = build_initial_schedule({"children": item_data["children"]}, current_start_time=item_actual_start_time, parent=item)
            item["children"] = child_schedule
            conflicts.extend(child_conflicts)
            children_total_duration = sum(parse_duration_string(child_item["duration"]) for child_item in child_schedule if not child_item.get("is_parallel_item"))

        # Determine item's duration
        explicit_parent_duration_str = item_data.get("duration")
        
        if explicit_parent_duration_str and explicit_parent_duration_str != "parallel":
            item["duration"] = parse_duration_string(explicit_parent_duration_str)
        else:
            item["duration"] = children_total_duration

        # Ensure duration is not 0 if it has an ideal_end_time and ideal_start_time
        if item["duration"] == 0 and item["ideal_start_time"] and item["ideal_end_time"]:
            try:
                start_dt = datetime.now().replace(hour=int(item["ideal_start_time"].split(':')[0]), minute=int(item["ideal_start_time"].split(':')[1]), second=0, microsecond=0)
                end_dt = datetime.now().replace(hour=int(item["ideal_end_time"].split(':')[0]), minute=int(item["ideal_end_time"].split(':')[1]), second=0, microsecond=0)
                item["duration"] = int((end_dt - start_dt).total_seconds() / 60)
            except:
                pass # Ignore invalid time formats


        item["start_time"] = item_actual_start_time

        # Determine end time
        item_end_time = item_actual_start_time + timedelta(minutes=item["duration"])
        if item["ideal_end_time"]:
            try:
                ideal_end = datetime.now().replace(hour=int(item["ideal_end_time"].split(':')[0]), minute=int(item["ideal_end_time"].split(':')[1]), second=0, microsecond=0)
                # If item's calculated end time exceeds its ideal end time, it's a conflict
                if item_end_time > ideal_end:
                     conflicts.append(f"Conflict: '{item['name']}' has a duration of {item['duration']} minutes which makes it end after its ideal end time of {item['ideal_end_time']}.")
                item_end_time = ideal_end # Use ideal end time for this phase
            except:
                pass # Ignore invalid time formats


        item["end_time"] = item_end_time
        schedule.append(item)
        current_start_time = item_end_time # Update current_start_time for the next item in sequence

    return schedule, conflicts

def _status_alignment_penalty(item, status_context, priority_rank):
    if not status_context:
        return 0
    original = item.get("original_item_data", {})
    requirements = extract_status_requirements(original, status_context)
    if not requirements:
        return 0

    current_values = status_context.get("current", {})
    penalty = 0
    for status_slug, values in requirements.items():
        type_info = status_context.get("types", {}).get(status_slug)
        if not type_info:
            continue
        rank = type_info.get("rank", 1)
        normalized_values = [val.strip().lower() for val in values]
        current_value = current_values.get(status_slug)
        level_map = type_info.get("values") or {}

        if current_value and current_value in normalized_values:
            penalty -= priority_rank * rank
            continue

        if current_value and current_value in level_map:
            diffs = []
            for value in normalized_values:
                if value in level_map:
                    diffs.append(abs(level_map[current_value] - level_map[value]))
            if diffs:
                penalty += priority_rank * rank * (0.5 + min(diffs))
                continue
        penalty += priority_rank * (rank / 2)

    return penalty

def calculate_item_importance(item, scheduling_priorities, priority_settings, category_settings, status_context):
    """
    Calculates an importance score for an item based on scheduling priorities, priority settings, category settings,
    and the current user status context. Lower score => higher priority.
    """
    base_importance = 100
    importance_score = base_importance

    for priority_setting in scheduling_priorities.get("Scheduling_Priorities", []):
        priority_name = priority_setting.get("Name")
        priority_rank = priority_setting.get("Rank", 1)

        if priority_name == "Due Date" and "due_date" in item:
            try:
                due_date = datetime.strptime(str(item["due_date"]), "%Y-%m-%d")
                days_until_due = (due_date - datetime.now()).days
                importance_score += max(days_until_due, -5) * priority_rank
            except ValueError:
                pass

        elif priority_name == "Priority Property" and "priority" in item:
            item_priority_level = item["priority"].capitalize()
            priority_value = (
                priority_settings.get("Priority_Settings", {})
                .get(item_priority_level, {})
                .get("value")
            )
            if priority_value is not None:
                importance_score += priority_value * priority_rank

        elif priority_name == "Category" and "category" in item:
            item_category = item["category"].capitalize()
            category_value = (
                category_settings.get("Category_Settings", {})
                .get(item_category, {})
                .get("value")
            )
            if category_value is not None:
                importance_score += category_value * priority_rank

        elif priority_name == "Status Alignment":
            importance_score += _status_alignment_penalty(item, status_context, priority_rank)

        elif priority_name == "Environment" and "environment" in item:
            importance_score += 1 * priority_rank

        elif priority_name == "Template Membership" and ("sub_items" in item or "microroutines" in item):
            importance_score += 1 * priority_rank

    item["importance_score"] = max(1, importance_score)
    return item

def check_total_duration(schedule):
    """
    Calculates the total duration of all items in the schedule and checks against 24 hours.
    """
    total_duration_minutes = 0
    
    def calculate_duration_recursive(items):
        nonlocal total_duration_minutes
        for item in items:
            total_duration_minutes += item["duration"]
            if "children" in item and item["children"]:
                calculate_duration_recursive(item["children"])

    calculate_duration_recursive(schedule)

    max_daily_minutes = 24 * 60 # 24 hours in minutes
    
    if total_duration_minutes > max_daily_minutes:
        overflow_minutes = total_duration_minutes - max_daily_minutes
        return f"Capacity Conflict: Total duration of all items ({total_duration_minutes} minutes) exceeds 24 hours by {overflow_minutes} minutes."
    else:
        return f"Capacity Check: All items fit within 24 hours. Total duration: {total_duration_minutes} minutes."

def propagate_dependency_shift(shifted_item, schedule, conflict_log):
    """
    Recursively shifts dependent items if their prerequisite has been shifted.
    """
    for item in schedule:
        if shifted_item["name"] in item.get("depends_on", []):
            # If the dependent item starts before the shifted item ends, shift it
            if item["start_time"] < shifted_item["end_time"]:
                original_start_time = item["start_time"]
                item["start_time"] = shifted_item["end_time"]
                item["end_time"] = item["start_time"] + timedelta(minutes=item["duration"])
                update_parent_times(item)
                conflict_log.append({"phase": "3g", "action": "dependency_shifted", "item": item["name"], "from": original_start_time.strftime("%H:%M"), "to": item["start_time"].strftime("%H:%M"), "reason": f"due to shift of {shifted_item['name']}"})
                propagate_dependency_shift(item, schedule, conflict_log) # Recursively propagate
        
        # Check children for dependencies
        if "children" in item and item["children"]:
            propagate_dependency_shift(shifted_item, item["children"], conflict_log)




def phase3f_iterative_resolution_loop(schedule, conflict_log):
    """
    Iteratively applies conflict resolution phases until no conflicts remain and total duration is within 24 hours.
    This is Phase 3f: Iterative Conflict Resolution Loop.
    """
    resolved_schedule = schedule[:]
    iteration_count = 0
    max_iterations = 10 # Prevent infinite loops

    while iteration_count < max_iterations:
        iteration_count += 1
        print(f"🔄 Conflict Resolution Loop - Iteration {iteration_count}")

        # Get flattened schedule for item lookup
        flattened_schedule = get_flattened_schedule(resolved_schedule)

        # Identify conflicts at the start of the iteration
        conflicts_at_start_of_iteration = identify_conflicts(resolved_schedule)
        capacity_report_at_start = check_total_duration(resolved_schedule)
        
        if not conflicts_at_start_of_iteration and "Capacity Conflict" not in capacity_report_at_start:
            print("✅ All conflicts resolved and capacity within limits.")
            break

        # Apply Phase 3c: Prioritized Shifting
        resolved_schedule, _ = phase3c_prioritized_shifting(resolved_schedule, conflicts_at_start_of_iteration, conflict_log, flattened_schedule)
        
        # Apply Phase 3d: Trimming Less Important Items
        resolved_schedule, _ = phase3d_trimming_less_important_items(resolved_schedule, conflict_log, flattened_schedule)

        # Apply Phase 3e: Cutting Least Important Items
        resolved_schedule, _ = phase3e_cutting_least_important_items(resolved_schedule, conflict_log, flattened_schedule)

        # Re-check conflicts and capacity after a full pass of phases
        conflicts_at_end_of_iteration = identify_conflicts(resolved_schedule)
        capacity_report_at_end = check_total_duration(resolved_schedule)

        # Check if any progress was made in this iteration
        progress_made = (len(conflicts_at_end_of_iteration) < len(conflicts_at_start_of_iteration)) or \
                        ("Capacity Conflict" in capacity_report_at_start and "Capacity Conflict" not in capacity_report_at_end)

        if not progress_made and conflicts_at_end_of_iteration:
            print("⚠️ No further conflicts resolved in this iteration. Exiting loop to prevent infinite loop.")
            break
    
    final_conflicts = identify_conflicts(resolved_schedule)
    final_capacity_report = check_total_duration(resolved_schedule)
    if "Capacity Conflict" in final_capacity_report:
        final_conflicts.append(final_capacity_report)

    return resolved_schedule, final_conflicts

def phase3c_prioritized_shifting(schedule, conflicts, conflict_log, flattened_schedule):
    """
    Resolves conflicts by shifting less important items without buffer manipulation.
    This is Phase 3c: Prioritized Shifting and Reordering.
    """
    resolved_schedule = schedule[:] # Create a copy to modify
    
    # Sort conflicts by the start time of the first item in the conflict
    # This helps process conflicts in chronological order
    conflicts.sort(key=lambda c: c.split('(')[1].split(' ')[0]) # Crude sorting by start time string

    conflict_pattern = re.compile(r"Overlap Conflict: '(.+?)' \(.+?\) overlaps with '(.+?)' \(.+?\)")

    for conflict_str in conflicts:
        match = conflict_pattern.search(conflict_str)
        if not match:
            conflict_log.append({"phase": "3c", "action": "parse_error", "conflict_string": conflict_str})
            continue

        item1_name, item2_name = match.groups()

        # Find the actual item objects in the flattened_schedule (case-insensitive and strip spaces)
        item1 = next((i for i in flattened_schedule if i.get("name", "").strip().lower() == item1_name.strip().lower()), None)
        item2 = next((i for i in flattened_schedule if i.get("name", "").strip().lower() == item2_name.strip().lower()), None)

        if not item1 or not item2:
            conflict_log.append({"phase": "3c", "action": "item_not_found", "item1_name": item1_name, "item2_name": item2_name})
            continue

        # Determine which item is less important (higher importance_score means less important)
        if item1.get("importance_score", 100) > item2.get("importance_score", 100):
            less_important_item = item1
            more_important_item = item2
        else:
            less_important_item = item2
            more_important_item = item1

        original_start_time = less_important_item["start_time"]
        # Shift the less important item to start after the more important item ends
        less_important_item["start_time"] = more_important_item["end_time"]
        less_important_item["end_time"] = less_important_item["start_time"] + timedelta(minutes=less_important_item["duration"])

        # Update parent item times recursively
        update_parent_times(less_important_item)
        propagate_dependency_shift(less_important_item, resolved_schedule, conflict_log) # Propagate shift to dependents

        conflict_log.append({"phase": "3c", "action": "shifted", "item": less_important_item["name"], "from": original_start_time.strftime("%H:%M"), "to": less_important_item["start_time"].strftime("%H:%M"), "reason": f"overlapped with {more_important_item['name']}"})

    # Re-identify conflicts after resolution attempts
    remaining_conflicts = identify_conflicts(resolved_schedule)

    return resolved_schedule, remaining_conflicts

def phase3d_trimming_less_important_items(schedule, conflict_log, flattened_schedule):
    """
    Resolves conflicts by iteratively trimming less important items.
    This is Phase 3d: Trimming Less Important Items (Iterative).
    """
    resolved_schedule = schedule[:] # Create a copy to modify
    conflict_pattern = re.compile(r"Overlap Conflict: '(.+?)' \(.+?\) overlaps with '(.+?)' \(.+?\)")
    MIN_ITEM_DURATION = 5 # minutes

    for _ in range(5): # Iterate a few times to allow for iterative trimming
        current_conflicts_to_process = identify_conflicts(resolved_schedule)
        if not current_conflicts_to_process:
            break

        initial_conflict_count = len(current_conflicts_to_process)
        conflicts_resolved_in_iteration = False
        for conflict_str in current_conflicts_to_process:
            match = conflict_pattern.search(conflict_str)
            if not match:
                conflict_log.append({"phase": "3d", "action": "parse_error", "conflict_string": conflict_str})
                continue

            item1_name, item2_name = match.groups()

            item1 = next((i for i in flattened_schedule if i.get("name", "").strip().lower() == item1_name.strip().lower()), None)
            item2 = next((i for i in flattened_schedule if i.get("name", "").strip().lower() == item2_name.strip().lower()), None)

            if not item1 or not item2:
                conflict_log.append({"phase": "3d", "action": "item_not_found", "item1_name": item1_name, "item2_name": item2_name})
                continue

            # Determine overlap duration
            overlap_start = max(item1["start_time"], item2["start_time"])
            overlap_end = min(item1["end_time"], item2["end_time"])
            overlap_duration = (overlap_end - overlap_start).total_seconds() / 60

            if overlap_duration <= 0:
                continue # No actual overlap

            # Determine which item is less important
            if item1.get("importance_score", 100) > item2.get("importance_score", 100):
                less_important_item = item1
                more_important_item = item2
            else:
                less_important_item = item2
                more_important_item = item1

            # Trim the less important item
            if less_important_item["duration"] > MIN_ITEM_DURATION:
                trim_amount = min(overlap_duration, less_important_item["duration"] - MIN_ITEM_DURATION)
                less_important_item["duration"] -= trim_amount
                less_important_item["end_time"] = less_important_item["start_time"] + timedelta(minutes=less_important_item["duration"])
                update_parent_times(less_important_item)
                conflict_log.append({"phase": "3d", "action": "trimmed", "item": less_important_item["name"], "amount": trim_amount, "reason": f"overlapped with {more_important_item['name']}"})
                conflicts_resolved_in_iteration = True
        
        # Re-identify conflicts after this pass to update current_conflicts_to_process
        current_conflicts_to_process = identify_conflicts(resolved_schedule)

        if not conflicts_resolved_in_iteration and initial_conflict_count == len(current_conflicts_to_process):
            break # No conflicts were resolved in this iteration, stop to prevent infinite loop

    # Re-identify conflicts after resolution attempts
    remaining_conflicts = identify_conflicts(resolved_schedule)

    return resolved_schedule, remaining_conflicts

def remove_item_from_schedule(schedule, item_to_remove):
    """
    Recursively removes an item from the schedule.
    """
    for i, item in enumerate(schedule):
        if item == item_to_remove:
            del schedule[i]
            return True
        if "sub_items" in item and item["sub_items"]:
            if remove_item_from_schedule(item["sub_items"], item_to_remove):
                return True
        if "microroutines" in item and item["microroutines"]:
            if remove_item_from_schedule(item["microroutines"], item_to_remove):
                return True
    return False

def phase3e_cutting_least_important_items(schedule, conflict_log, flattened_schedule):
    """
    Resolves conflicts by cutting the least important items.
    This is Phase 3e: Cutting Least Important Items.
    """
    resolved_schedule = schedule[:] # Create a copy to modify
    conflict_pattern = re.compile(r"Overlap Conflict: '(.+?)' \(.+?\) overlaps with '(.+?)' \(.+?\)")
    remaining_conflicts = [] # Initialize to ensure it's always defined

    # Continue cutting until no more conflicts can be resolved by cutting
    while True:
        current_conflicts_to_process = identify_conflicts(resolved_schedule)
        if not current_conflicts_to_process:
            return resolved_schedule, [] # Explicitly return if no conflicts left

        initial_conflict_count = len(current_conflicts_to_process)
        conflicts_resolved_in_iteration = False
        for conflict_str in current_conflicts_to_process:
            match = conflict_pattern.search(conflict_str)
            if not match:
                conflict_log.append({"phase": "3e", "action": "parse_error", "conflict_string": conflict_str})
                continue

            item1_name, item2_name = match.groups()

            item1 = next((i for i in flattened_schedule if i.get("name", "").strip().lower() == item1_name.strip().lower()), None)
            item2 = next((i for i in flattened_schedule if i.get("name", "").strip().lower() == item2_name.strip().lower()), None)

            if not item1 or not item2:
                conflict_log.append({"phase": "3e", "action": "item_not_found", "item1_name": item1_name, "item2_name": item2_name})
                continue

            # Determine which item is less important
            if item1.get("importance_score", 100) > item2.get("importance_score", 100):
                least_important_item = item1
            else:
                least_important_item = item2

            # Remove the least important item
            # if remove_item_from_schedule(resolved_schedule, least_important_item):
            #     conflict_log.append({"phase": "3e", "action": "cut", "item": least_important_item["name"], "reason": f"overlapped with {item1_name if least_important_item == item2 else item2_name}"})
            #     conflicts_resolved_in_iteration = True
            #     # Update parent times if the item had a parent
            #     if least_important_item.get("parent"):
            #         update_parent_times(least_important_item["parent"])
            #     # No break here, continue to process other conflicts in the same iteration
            # else:
            #     # If item could not be removed (e.g., not found in schedule), log it
            #     conflict_log.append({"phase": "3e", "action": "cut_failed", "item": least_important_item["name"], "reason": "item not found in schedule for cutting"})

        if not conflicts_resolved_in_iteration and initial_conflict_count == len(identify_conflicts(resolved_schedule)):
            return resolved_schedule, identify_conflicts(resolved_schedule) # Explicitly return if no progress

    # Re-identify conflicts after resolution attempts
    remaining_conflicts = identify_conflicts(resolved_schedule)

    print(f"DEBUG: phase3e returning resolved_schedule length: {len(resolved_schedule)}, remaining_conflicts: {len(remaining_conflicts)}")

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
    Returns a flattened list of all items (including children) in the schedule.
    """
    flat_schedule = []
    def flatten(items):
        for item in items:
            flat_schedule.append(item)
            if "children" in item and item["children"]:
                flatten(item["children"])
    flatten(schedule)
    return flat_schedule

def identify_conflicts(schedule):
    """
    Identifies conflicts in the schedule, such as overlapping items or items exceeding ideal end times.
    """
    conflicts = []
    
    # Flatten the schedule to easily check for overlaps
    flat_schedule = []
    def flatten(items):
        for item in items:
            flat_schedule.append(item)
            if "children" in item and item["children"]:
                flatten(item["children"])
    flatten(schedule)

    # Sort the flattened schedule by start time
    flat_schedule.sort(key=lambda x: x["start_time"])

    # Check for overlapping items
    for i in range(len(flat_schedule)):
        for j in range(i + 1, len(flat_schedule)):
            item1 = flat_schedule[i]
            item2 = flat_schedule[j]

            # Check for overlap
            if item1["start_time"] < item2["end_time"] and item2["start_time"] < item1["end_time"]:
                # Ignore conflicts between an item and its ancestor
                if is_ancestor(item1, item2) or is_ancestor(item2, item1):
                    continue
                conflicts.append(f"Overlap Conflict: '{item1['name']}' ({format_time(item1['start_time'])} - {format_time(item1['end_time'])}) overlaps with '{item2['name']}' ({format_time(item2['start_time'])} - {format_time(item2['end_time'])}).")

    return conflicts

def run(args, properties):
    """
    The main entry point for the 'today' command.
    Generates, resolves, and displays the daily schedule, with persistence.
    """
    reschedule_requested = "reschedule" in args
    resolved_schedule = []
    all_conflicts = []
    conflict_log = []

    today_str = datetime.now().strftime("%Y-%m-%d")
    today_completion_data, _ = load_completion_payload(today_str)
    completion_entries = normalize_completion_entries(today_completion_data)
    rescheduled_items_summary = []
    skipped_reschedule_summary = []

    if reschedule_requested or not os.path.exists(TODAY_SCHEDULE_PATH):
        # --- Full Generation and Resolution Process ---
        # 1. Get the current day of the week
        day_of_week = datetime.now().strftime("%A")

        # Load settings files
        scheduling_priorities_path = os.path.join(USER_DIR, "Settings", "Scheduling_Priorities.yml")
        priority_settings_path = os.path.join(USER_DIR, "Settings", "Priority_Settings.yml")
        category_settings_path = os.path.join(USER_DIR, "Settings", "Category_Settings.yml")
        status_settings_path = os.path.join(USER_DIR, "Settings", "Status_Settings.yml")
        current_user_status_path = os.path.join(USER_DIR, "Current_Status.yml")
        buffer_settings_path = os.path.join(USER_DIR, "Settings", "Buffer_Settings.yml")
        
        scheduling_priorities = read_template(scheduling_priorities_path) or {}
        priority_settings = read_template(priority_settings_path) or {}
        category_settings = read_template(category_settings_path) or {}
        status_settings = read_template(status_settings_path) or {}
        current_user_status = read_template(current_user_status_path) or {}
        buffer_settings = read_template(buffer_settings_path)
        status_context = build_status_context(status_settings, current_user_status)

        if not scheduling_priorities:
            print("Warning: Scheduling_Priorities.yml not found. Importance calculation may be inaccurate.")
        if not priority_settings:
            print("Warning: Priority_Settings.yml not found. Importance calculation may be inaccurate.")
        if not category_settings:
            print("Warning: Category_Settings.yml not found. Importance calculation may be inaccurate.")
        if not status_settings:
            print("Warning: Status_Settings.yml not found. Status-based importance calculation may be inaccurate.")
        if not current_user_status:
            print("Warning: Current_Status.yml not found. Status-based importance calculation may be inaccurate.")

        # 2-3. Select the best template for the day
        template_info = select_template_for_day(day_of_week, status_context)
        template = template_info.get("template")
        template_path = template_info.get("path")
        if not template:
            print(f"No template found for {day_of_week}. Please create a '{day_of_week}.yml' file in the 'User/Days' directory.")
            return
        canonical_path = get_day_template_path(day_of_week)
        if template_info.get("score", 0) > 0 and os.path.normpath(template_path) != os.path.normpath(canonical_path):
            print(f"Status-aware pick: using '{os.path.basename(template_path)}' (score {template_info['score']:.2f}).")

        # 4. Build the initial schedule (Phase 1: Impossible Ideal Schedule)
        schedule, initial_conflicts = build_initial_schedule(template)
        if initial_conflicts:
            conflict_log.append({"phase": "Initial Schedule", "conflicts": initial_conflicts})

        # Apply manual modifications
        manual_modifications = load_manual_modifications(MANUAL_MODIFICATIONS_PATH)
        if manual_modifications:
            print("Applying manual modifications...")
            schedule = apply_manual_modifications(schedule, manual_modifications)
            # Clear manual modifications after applying them
            save_manual_modifications([], MANUAL_MODIFICATIONS_PATH)

        # Evaluate commitments and trigger actions before final resolution
        try:
            from Modules.Commitment import main as CommitmentModule  # type: ignore
            CommitmentModule.evaluate_and_trigger()
        except Exception as e:
            print(f"Warning: Could not evaluate commitments: {e}")
        # Evaluate milestones as well so progress reflects new state today
        try:
            from Modules.Milestone import main as MilestoneModule  # type: ignore
            MilestoneModule.evaluate_and_update_milestones()
        except Exception:
            pass

        # 5. Calculate item importance (Phase 3b)
        def apply_importance_recursive(items):
            if not items: # Handle empty or None items list
                return
            for item in items:
                calculate_item_importance(item, scheduling_priorities, priority_settings, category_settings, status_context)
                if "children" in item and item["children"] is not None:
                    apply_importance_recursive(item["children"])
        apply_importance_recursive(schedule)

        if reschedule_requested:
            promote_missed_items(
                schedule,
                completion_entries,
                datetime.now(),
                rescheduled_items_summary,
                skipped_reschedule_summary,
            )
            schedule.sort(key=lambda i: i.get("start_time", datetime.now()))

        # 6. Perform high-level capacity check (Phase 3a)
        capacity_report = check_total_duration(schedule)
        print(capacity_report) # Display capacity report to the user
        if "Capacity Conflict" in capacity_report:
            conflict_log.append({"phase": "Capacity Check", "report": capacity_report})

        # 7. Iterative Conflict Resolution Loop (Phase 3f)
        resolved_schedule, all_conflicts = phase3f_iterative_resolution_loop(schedule, conflict_log)

        # 8. Final Buffer Insertion (Phase 4)
        if buffer_settings:
            print("Inserting buffers...")
            resolved_schedule = phase4_final_buffer_insertion(resolved_schedule, buffer_settings)

        # Archive previous schedule before saving new one
        if os.path.exists(TODAY_SCHEDULE_PATH):
            try:
                archive_dir = os.path.join(USER_DIR, "Archive", "Schedules")
                os.makedirs(archive_dir, exist_ok=True)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                archive_path = os.path.join(archive_dir, f"today_schedule_{timestamp}.yml")
                from shutil import copy2
                copy2(TODAY_SCHEDULE_PATH, archive_path)
                # prune old archives? maybe later
            except Exception as e:
                print(f"Warning: Failed to archive previous schedule: {e}")

        # Save the resolved schedule to today_schedule.yml
        with open(TODAY_SCHEDULE_PATH, 'w') as f:
            yaml.dump(resolved_schedule, f, default_flow_style=False)
        print(f"✅ Resolved schedule saved to: {TODAY_SCHEDULE_PATH}")

        # Write conflict log to file
        log_dir = os.path.join(USER_DIR, "Logs")
        os.makedirs(log_dir, exist_ok=True)
        log_filename = datetime.now().strftime("conflict_log_%Y%m%d_%H%M%S.yml")
        log_path = os.path.join(log_dir, log_filename)
        with open(log_path, 'w') as f:
            yaml.dump(conflict_log, f, default_flow_style=False)
        print(f"Conflict resolution log saved to: {log_path}")

    else:
        # --- Load and Display Existing Schedule ---
        print(f"Loading schedule from: {TODAY_SCHEDULE_PATH}")
        with open(TODAY_SCHEDULE_PATH, 'r') as f:
            resolved_schedule = yaml.safe_load(f)
        all_conflicts = identify_conflicts(resolved_schedule) # Re-identify conflicts for display

    # 11. Display the schedule (even if conflicts remain, for visualization)
    display_level = float('inf')
    if "routines" in args:
        display_level = 0
    elif "subroutines" in args:
        display_level = 1
    elif "microroutines" in args:
        display_level = 2

    display_schedule(resolved_schedule, all_conflicts, indent=0, display_level=display_level, today_completion_data=today_completion_data)

    if rescheduled_items_summary:
        print("\nRescheduled the following missed blocks:")
        for entry in rescheduled_items_summary:
            print(f"- {entry['name']} (now starts at {entry['new_start']})")
    if skipped_reschedule_summary:
        print("\nCould not reschedule:")
        for entry in skipped_reschedule_summary:
            print(f"- {entry['name']} ({entry['reason']})")


def phase4_final_buffer_insertion(schedule, buffer_settings):
    """
    Inserts buffers into the schedule based on complex buffer settings, including context-aware and dynamic buffers.
    This is the revised Phase 4: Final Buffer Insertion.
    """
    if not buffer_settings:
        return schedule

    # --- Extract Buffer Settings ---
    template_buffers = buffer_settings.get("template_buffers", {})
    micro_buffer_min = template_buffers.get("microroutine_buffer_minutes", 5)
    sub_buffer_min = template_buffers.get("subroutine_buffer_minutes", 5)
    routine_buffer_min = template_buffers.get("routine_buffer_minutes", 10) # User specified 10 min

    dynamic_buffer_settings = buffer_settings.get("global_dynamic_buffer", {})
    dynamic_interval_min = dynamic_buffer_settings.get("buffer_interval_minutes", 45)
    dynamic_duration_min = dynamic_buffer_settings.get("buffer_duration_minutes", 5)

    # --- Recursive Buffer Insertion ---
    def insert_buffers_recursive(items, last_end_time, time_since_last_buffer):
        buffered_items = []
        current_last_end_time = last_end_time
        current_time_since_buffer = time_since_last_buffer

        for i, item in enumerate(items):
            # --- Dynamic Buffer Check before item ---
            if dynamic_interval_min > 0 and current_last_end_time:
                time_since_item_start = item["start_time"] - current_last_end_time
                if current_time_since_buffer + time_since_item_start >= timedelta(minutes=dynamic_interval_min):
                    buffer_start = current_last_end_time
                    buffer_end = buffer_start + timedelta(minutes=dynamic_duration_min)
                    dynamic_buffer = {
                        "name": "Dynamic Buffer", "start_time": buffer_start, "end_time": buffer_end,
                        "duration": dynamic_duration_min, "is_buffer": True, "buffer_type": "dynamic"
                    }
                    buffered_items.append(dynamic_buffer)
                    shift_amount = buffer_end - item["start_time"]
                    item["start_time"] += shift_amount
                    item["end_time"] += shift_amount
                    update_parent_times(item)
                    current_last_end_time = buffer_end
                    current_time_since_buffer = timedelta(minutes=0)

            buffered_items.append(item)
            current_last_end_time = item["end_time"]
            current_time_since_buffer += timedelta(minutes=item["duration"])

            # --- Template Buffer Check after item ---
            buffer_to_add_min = 0
            if not item.get("is_parallel_item"): # Only add buffers if not a parallel item itself
                item_type = item.get("type", "task")
                if "microroutine" in item_type: buffer_to_add_min = micro_buffer_min
                elif "subroutine" in item_type: buffer_to_add_min = sub_buffer_min
                elif "routine" in item_type: buffer_to_add_min = routine_buffer_min

            if buffer_to_add_min > 0 and i < len(items) - 1:
                buffer_start = item["end_time"]
                buffer_end = buffer_start + timedelta(minutes=buffer_to_add_min)
                template_buffer = {
                    "name": f"Buffer", "start_time": buffer_start, "end_time": buffer_end,
                    "duration": buffer_to_add_min, "is_buffer": True, "buffer_type": "template"
                }
                buffered_items.append(template_buffer)
                next_item = items[i+1]
                shift_amount = buffer_end - next_item["start_time"]
                if shift_amount > timedelta(seconds=0):
                    next_item["start_time"] += shift_amount
                    next_item["end_time"] += shift_amount
                    update_parent_times(next_item)
                current_last_end_time = buffer_end
                current_time_since_buffer += timedelta(minutes=buffer_to_add_min)

            # --- Recursion for nested items ---
            if "children" in item and item["children"]:
                nested_items = sorted(item["children"], key=lambda x: x["start_time"])
                item["children"], current_last_end_time, current_time_since_buffer = insert_buffers_recursive(
                    nested_items, item["start_time"], current_time_since_buffer
                )

        return buffered_items, current_last_end_time, current_time_since_buffer

    # --- Main Execution ---
    schedule.sort(key=lambda x: x["start_time"])
    initial_start_time = schedule[0]["start_time"] if schedule else datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
    final_schedule, _, _ = insert_buffers_recursive(schedule, None, timedelta(minutes=0))

    return final_schedule
