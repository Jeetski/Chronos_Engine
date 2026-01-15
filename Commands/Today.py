
import os
import yaml
import math
from datetime import datetime, timedelta
import re
from Modules.Scheduler import (
    get_day_template_path, read_template, format_time, is_ancestor,
    get_flattened_schedule, remove_item_from_schedule, update_parent_times,
    ROOT_DIR, USER_DIR, MODULES_DIR,
    load_manual_modifications, save_manual_modifications, apply_manual_modifications,
    find_item_in_schedule, save_schedule, display_schedule, list_day_template_paths,
    build_block_key, normalize_completion_entries, is_template_eligible_for_day,
    resolve_variant, scan_and_inject_items, schedule_flexible_items,
    schedule_path_for_date, manual_modifications_path_for_date, status_current_path
)

from Utilities.duration_parser import parse_duration_string
from Modules.ItemManager import read_item_data

# =============================================================================
# CONFIGURATION LOADING
# =============================================================================

def load_scheduling_config():
    """
    Loads scheduling configuration with defaults and user overrides.
    Returns merged config dict.
    """
    defaults_path = os.path.join(USER_DIR, "Settings", "scheduling_defaults.yml")
    settings_path = os.path.join(USER_DIR, "Settings", "scheduling_settings.yml")
    
    defaults = read_template(defaults_path) or {}
    settings = read_template(settings_path) or {}
    
    # Deep merge settings over defaults
    config = _deep_merge(defaults, settings)
    return config

def _deep_merge(base, override):
    """Recursively merge override dict into base dict."""
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result

def load_happiness_map():
    """
    Loads map_of_happiness.yml if it exists.
    Returns dict with 'map' list and 'keys' set, or None if not configured.
    """
    map_path = os.path.join(USER_DIR, "Settings", "map_of_happiness.yml")
    data = read_template(map_path)
    if not data or not isinstance(data.get("map"), list):
        return None
    
    map_entries = data["map"]
    keys = {entry.get("key", "").lower().strip() for entry in map_entries if entry.get("key")}
    
    return {
        "map": map_entries,
        "keys": keys,
        "by_key": {entry.get("key", "").lower().strip(): entry for entry in map_entries}
    }

def convert_ranked_value(value, n):
    """
    Convert a ranked value (1=best) to 0-100 scale (100=best).
    Formula: 100 - ((value - 1) * (100 / n))
    
    Args:
        value: The rank value (1 = highest priority)
        n: Total number of values in the ranking
    Returns:
        Converted score 0-100 where 100 = best
    """
    if n <= 0:
        return 50  # Neutral if no values
    x = 100 / n
    y = value - 1  # 0-indexed
    return max(0, min(100, 100 - (x * y)))

def resolve_max_iterations(setting, item_count):
    """
    Resolve max_iterations from config (number or preset name).
    """
    if isinstance(setting, (int, float)):
        return int(setting)
    if isinstance(setting, str):
        setting = setting.lower().strip()
        if setting == "adaptive":
            return int(5 + math.sqrt(item_count))
        elif setting == "generous":
            return max(1, int(item_count / 2))
    return 10  # Default fallback

# =============================================================================
# ANCHOR ITEMS & TIMEBLOCKS
# =============================================================================

def is_anchor_item(item):
    """
    Check if an item is an anchor (cannot be trimmed, cut, or moved).
    Anchor items have reschedule: never or reschedule: false.
    """
    reschedule = item.get("reschedule", "auto")
    if isinstance(reschedule, bool):
        return not reschedule
    if isinstance(reschedule, str):
        return reschedule.lower().strip() in ("never", "false", "no")
    return False

def is_timeblock(item):
    """
    Check if an item is a timeblock.
    """
    return item.get("type", "").lower().strip() == "timeblock"

def get_timeblock_subtype(item):
    """
    Get the subtype of a timeblock (buffer, category, free).
    """
    return item.get("subtype", "free").lower().strip()

def is_flexible(item):
    """
    Check if an item can be moved/split by the scheduler.
    Anchor items are never flexible.
    """
    if is_anchor_item(item):
        return False
    return item.get("flexible", True)

def is_trimmable(item):
    """
    Check if an item can be trimmed by the scheduler.
    Anchor items cannot be trimmed.
    """
    if is_anchor_item(item):
        return False
    # Timeblocks are trimmable by default unless explicitly set
    if is_timeblock(item):
        return item.get("absorbable", True)
    return True


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
    Smart Template Selection: All templates compete, best wins.
    
    Process:
    1. Gather ALL templates from User/Days/
    2. Filter by eligibility (days property + filename matching)
    3. Score by status alignment
    4. Pick highest scorer
    
    Returns: { 'path': ..., 'template': {...}, 'score': float }
    """
    # Load scheduling config for potential forced template
    config = load_scheduling_config()
    template_config = config.get("template_selection", {})
    
    # Check for forced template
    if template_config.get("mode") == "explicit" and template_config.get("forced_template"):
        forced_path = os.path.join(USER_DIR, "Days", template_config["forced_template"])
        if os.path.exists(forced_path):
            template = read_template(forced_path)
            if template:
                return {"path": forced_path, "template": template, "score": float('inf')}
    
    # Gather all templates
    candidate_paths = list_day_template_paths(day_of_week)
    if not candidate_paths:
        fallback_path = get_day_template_path(day_of_week)
        return {"path": fallback_path, "template": read_template(fallback_path), "score": 0}

    candidates = []
    fallback_path = get_day_template_path(day_of_week)
    
    for path in candidate_paths:
        template = read_template(path)
        if not template:
            continue
        
        # Check eligibility based on 'days' property or filename
        filename = os.path.basename(path)
        stem = os.path.splitext(filename)[0].lower()
        
        # Check if template has explicit 'days' property
        if is_template_eligible_for_day(template, day_of_week):
            # Template is eligible - check if it's day-specific or universal
            has_days_prop = template.get("days") is not None
            has_status_req = bool(template.get("status_requirements"))
            
            # If no days property and no status requirements, must match filename
            if not has_days_prop and not has_status_req:
                # Traditional weekday template - filename must match
                if not (stem == day_of_week.lower() or 
                        stem.startswith(f"{day_of_week.lower()}_") or
                        stem.startswith(f"{day_of_week.lower()}__")):
                    continue
            
            # Calculate score
            requirements = extract_status_requirements(template, status_context)
            score = score_status_alignment(requirements, status_context)
            
            # Bonus for specific day match (prefer Monday.yml over generic sick day on Monday)
            is_day_specific = stem.startswith(day_of_week.lower())
            day_bonus = 5 if is_day_specific else 0
            
            # Bonus for having status requirements that match
            status_bonus = 10 if has_status_req and score > 0 else 0
            
            total_score = score + day_bonus + status_bonus
            
            candidates.append((total_score, path, template))

    if not candidates:
        return {"path": fallback_path, "template": read_template(fallback_path), "score": 0}

    # Sort by score (highest first)
    candidates.sort(key=lambda x: x[0], reverse=True)
    best_score, best_path, best_template = candidates[0]
    
    return {"path": best_path, "template": best_template, "score": best_score}

def load_completion_payload(date_str):
    """
    Loads (and if necessary migrates) the per-day completion data.
    Returns (data_dict, file_path).
    """
    completions_dir = os.path.join(USER_DIR, "Schedules", "completions")
    os.makedirs(completions_dir, exist_ok=True)
    per_day_path = os.path.join(completions_dir, f"{date_str}.yml")

    if os.path.exists(per_day_path):
        with open(per_day_path, "r") as fh:
            data = yaml.safe_load(fh) or {}
    else:
        data = {"entries": {}}

    if "entries" not in data or not isinstance(data.get("entries"), dict):
        data = {"entries": {}}

    return data, per_day_path

def _should_auto_reschedule(item):
    policy = str(item.get("original_item_data", {}).get("reschedule_policy", "auto")).lower()
    return policy != "manual"

def promote_missed_items(schedule, completion_entries, now, summary_bucket, skipped_bucket, *,
                         importance_threshold=30, time_budget_minutes=None):
    """
    Moves unfinished leaf items that ended before 'now' to start just after the current time.
    Their importance is boosted so Phase 3 handling favors them.
    
    Updated for Phase 1 Importance System: 0-100 scale, higher is better.
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

    # Sort by importance (Highest first in new system)
    candidates.sort(key=lambda item: item.get("importance_score", 0), reverse=True)

    if time_budget_minutes is None:
        day_end = now.replace(hour=23, minute=59, second=59, microsecond=0)
        time_budget_minutes = max(0, int((day_end - now).total_seconds() / 60))

    requeue_cursor = now
    remaining_budget = max(0, time_budget_minutes)
    
    for item in candidates:
        importance = item.get("importance_score", 0)
        duration = max(0, int(item.get("duration", 0)))
        
        # Skip if importance is BELOW threshold (too unimportant to reschedule)
        if importance < importance_threshold:
            skipped_bucket.append({
                "name": item.get("name", "Unnamed Item"),
                "reason": f"importance < {importance_threshold}"
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
        
        # Boost importance by +20 (Urgency penalty turned into boost)
        # Instead of overriding to 95, we just increase urgency relative to its base priority.
        # This allows high-priority scheduled items (like Deep Work) to potentially survive conflicts 
        # against rescheduled low-priority items.
        current_imp = item.get("importance_score", 0)
        item["importance_score"] = min(100, current_imp + 20)
        
        requeue_cursor = item["end_time"] + timedelta(minutes=1)
        remaining_budget = max(0, remaining_budget - duration)
        summary_bucket.append({
            "name": item.get("name", "Unnamed Item"),
            "new_start": format_time(item["start_time"]),
        })
def build_initial_schedule(template, current_start_time=None, parent=None, status_context=None):
    """
    Builds an 'impossible' ideal schedule from a template, recursively handling nested items.
    This phase does not resolve conflicts or add buffers, it just lays out items based on ideal times.
    """
    schedule = []
    conflicts = []
    
    # If no current_start_time is provided, start from 8 AM today
    if current_start_time is None:
        current_start_time = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)

    if status_context:
        pass # Debug print removed
    else:
        pass # Debug print removed

    if not template:
        return schedule, conflicts

    # Support both 'children' (nested structure) and 'sequence' (legacy/day structure)
    items = template.get("children") or template.get("sequence")
    if not items:
         return schedule, conflicts

    for child_entry in items:
        child_name = child_entry.get('name')
        child_type = child_entry.get('type')
        if not child_name:
             conflicts.append(f"Error: Child entry missing name: {child_entry}")
             continue

        # Try to read external item data, but fallback to inline data if not found
        item_data = None
        if child_type:
            item_data = read_item_data(child_type, child_name)
        
        # If no external data found, use the entry itself as the data source (Virtual/Inline Item)
        # This allows routines to have simple steps like "- name: brush teeth\n  duration: 5" without a file.
        if not item_data:
             item_data = child_entry.copy()
             if "type" not in item_data:
                 item_data["type"] = "task" # Default type for inline items
            
        # --- Variant Resolution ---
        # If status_context is provided, resolve any variants BEFORE processing the item
        if status_context:
            item_data = resolve_variant(item_data, status_context)
            
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
            "essential": item_data.get("essential") or child_entry.get("essential"), # IMPORTANT: Carry over essential flag
            "original_item_data": item_data # Store original item_data
        }
        
        # If variant was applied, verify if we need to update the item name from the variant?
        # resolve_variant already updates item_data['name'], so we are good.

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
        # Check both item_data (resolved variants) and original template structure?
        # resolve_variant replaces 'children'/'items' in item_data, so we use item_data.
        # Note: Scheduler.py resolve_variant maps 'items', 'children', 'sequence' all to 'children' or keeps them? 
        # Wait, resolve_variant merges into resolved_item. If "items" was in variant, it overrides.
        # But build_initial_schedule logic below looks for "children" in item_data.
        # Variant logic in Scheduler.py needs to align on keys. 
        # My resolve_variant implementation copies 'items', 'children', 'sequence' directly.
        # So check all keys.
        
        children_source = item_data.get("children") or item_data.get("items") or item_data.get("sequence")
        
        if children_source:
            # We must pass status_context recursively!
            child_schedule, child_conflicts = build_initial_schedule({"children": children_source}, current_start_time=item_actual_start_time, parent=item, status_context=status_context)
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

def calculate_item_importance(item, scheduling_priorities, priority_settings, category_settings, status_context, happiness_map=None):
    """
    Calculates an importance score for an item using a SUBTRACTIVE model.
    
    HIGHER SCORE = MORE IMPORTANT (intuitive)
    
    Process:
    1. Start at base score (100)
    2. For each factor, convert settings value (1=best) to 0-100 scale
    3. Subtract penalty: (100 - converted_value) * weight / max_weight
    4. Final score: 0-100 where higher = more important
    
    Factors (by weight):
    - Environment (7): Can you even do it?
    - Category (6): Life priorities
    - Happiness (5): Map of happiness alignment
    - Due Date (4): Deadlines
    - Status Alignment (3): Energy/focus match
    - Priority Property (2): Item importance
    - Template Membership (1): Structure bonus
    """
    base_importance = 100
    importance_score = base_importance
    
    # Get max weight for normalization
    factors = scheduling_priorities.get("Scheduling_Priorities", [])
    max_weight = max((f.get("Rank", 1) for f in factors), default=1)
    
    # Count settings for conversion formula
    priority_count = len(priority_settings.get("Priority_Settings", {}))
    category_count = len(category_settings.get("Category_Settings", {}))
    happiness_count = len(happiness_map.get("map", [])) if happiness_map else 0

    for factor in factors:
        factor_name = factor.get("Name", "")
        weight = factor.get("Rank", 1)
        penalty = 0
        
        # ===== ENVIRONMENT =====
        if factor_name == "Environment" and "environment" in item:
            # Environment is a hard gate - if not met, heavy penalty
            # TODO: Check environment match against current place/tools
            # For now, having an environment requirement gets a small penalty
            penalty = 10  # Placeholder until environment checking is implemented
        
        # ===== CATEGORY =====
        elif factor_name == "Category" and "category" in item:
            item_category = str(item["category"]).strip()
            # Try different capitalizations
            category_info = None
            for key in [item_category, item_category.capitalize(), item_category.lower(), item_category.upper()]:
                category_info = category_settings.get("Category_Settings", {}).get(key)
                if category_info:
                    break
            
            if category_info and "value" in category_info:
                raw_value = category_info["value"]
                converted = convert_ranked_value(raw_value, category_count)
                penalty = (100 - converted) * weight / max_weight
        
        # ===== HAPPINESS =====
        elif factor_name == "Happiness" and happiness_map:
            item_happiness = item.get("happiness", [])
            if isinstance(item_happiness, str):
                if item_happiness.lower() == "all":
                    item_happiness = list(happiness_map.get("keys", []))
                else:
                    item_happiness = [item_happiness]
            
            if item_happiness:
                # Calculate average score based on tagged happiness needs
                total_score = 0
                for need_key in item_happiness:
                    need_key = need_key.lower().strip()
                    need_info = happiness_map.get("by_key", {}).get(need_key)
                    if need_info:
                        priority = need_info.get("priority", happiness_count)
                        converted = convert_ranked_value(priority, happiness_count)
                        total_score += converted
                
                if len(item_happiness) > 0:
                    avg_score = total_score / len(item_happiness)
                    penalty = (100 - avg_score) * weight / max_weight
            else:
                # No happiness tags = neutral (no penalty, no bonus)
                penalty = 0
        
        # ===== DEADLINE =====
        elif factor_name == "Deadline" and "deadline" in item:
            try:
                deadline_date = datetime.strptime(str(item["deadline"]), "%Y-%m-%d")
                days_until_deadline = (deadline_date - datetime.now()).days

                # Convert days to 0-100: 0 or negative days = 100 (urgent), 30+ days = 0
                if days_until_deadline <= 0:
                    converted = 100  # Due or overdue = maximum urgency
                elif days_until_deadline >= 30:
                    converted = 0  # 30+ days = no urgency
                else:
                    converted = 100 - (days_until_deadline * 100 / 30)

                penalty = (100 - converted) * weight / max_weight
            except (ValueError, TypeError) as e:
                print(f"Warning: Deadline parse error for {item.get('name', 'unknown')}: {e}")

        # ===== DUE DATE =====
        elif factor_name == "Due Date" and "due_date" in item and "deadline" not in item:
            try:
                due_date = datetime.strptime(str(item["due_date"]), "%Y-%m-%d")
                days_until_due = (due_date - datetime.now()).days
                
                # Convert days to 0-100: 0 or negative days = 100 (urgent), 30+ days = 0
                if days_until_due <= 0:
                    converted = 100  # Due or overdue = maximum urgency
                elif days_until_due >= 30:
                    converted = 0  # 30+ days = no urgency
                else:
                    converted = 100 - (days_until_due * 100 / 30)
                
                penalty = (100 - converted) * weight / max_weight
            except (ValueError, TypeError) as e:
                print(f"Warning: Due date parse error for {item.get('name', 'unknown')}: {e}")
        
        # ===== STATUS ALIGNMENT =====
        elif factor_name == "Status Alignment":
            alignment_score = _status_alignment_penalty(item, status_context, 1)  # Get raw score
            # Convert alignment score to 0-100 (alignment penalty is already in the right direction)
            # Lower alignment penalty = better match = higher score
            converted = max(0, min(100, 50 - alignment_score * 10))
            penalty = (100 - converted) * weight / max_weight
        
        # ===== PRIORITY PROPERTY =====
        elif factor_name == "Priority Property" and "priority" in item:
            item_priority = str(item["priority"]).strip()
            priority_info = None
            for key in [item_priority, item_priority.capitalize(), item_priority.lower(), item_priority.upper()]:
                priority_info = priority_settings.get("Priority_Settings", {}).get(key)
                if priority_info:
                    break
            
            if priority_info and "value" in priority_info:
                raw_value = priority_info["value"]
                converted = convert_ranked_value(raw_value, priority_count)
                penalty = (100 - converted) * weight / max_weight
        
        # ===== TEMPLATE MEMBERSHIP =====
        elif factor_name == "Template Membership":
            # Items with children/structure get a small bonus
            has_structure = "sub_items" in item or "microroutines" in item or "children" in item
            if has_structure:
                penalty = 0  # Bonus: no penalty
            else:
                penalty = 10 * weight / max_weight  # Small penalty for leaf items
        
        # Apply penalty
        importance_score -= penalty

    # Clamp to valid range
    item["importance_score"] = max(1, min(100, importance_score))
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




def phase3f_iterative_resolution_loop(schedule, conflict_log, *, allow_cutting=True):
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
        if allow_cutting:
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
        # Note: With new subtractive model, HIGHER score = MORE important
        if item1.get("importance_score", 50) < item2.get("importance_score", 50):
            less_important_item = item1
            more_important_item = item2
        else:
            less_important_item = item2
            more_important_item = item1

        # Skip if the less important item is an anchor (cannot be moved)
        if is_anchor_item(less_important_item) or not is_flexible(less_important_item):
            conflict_log.append({"phase": "3c", "action": "skipped", "item": less_important_item.get("name"), "reason": "anchor item cannot be shifted"})
            continue

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
            # Note: With new subtractive model, HIGHER score = MORE important
            if item1.get("importance_score", 50) < item2.get("importance_score", 50):
                less_important_item = item1
                more_important_item = item2
            else:
                less_important_item = item2
                more_important_item = item1

            # Skip if the less important item cannot be trimmed (anchor item)
            if not is_trimmable(less_important_item):
                conflict_log.append({"phase": "3d", "action": "skipped", "item": less_important_item.get("name"), "reason": "anchor item cannot be trimmed"})
                continue

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
            # Note: With new subtractive model, HIGHER score = MORE important
            if item1.get("importance_score", 50) < item2.get("importance_score", 50):
                least_important_item = item1
            else:
                least_important_item = item2

            # Skip if the least important item is an anchor (cannot be cut)
            if is_anchor_item(least_important_item):
                conflict_log.append({"phase": "3e", "action": "skipped", "item": least_important_item.get("name"), "reason": "anchor item cannot be cut"})
                continue

            # Skip if the item is essential
            if least_important_item.get("essential"):
                 conflict_log.append({"phase": "3e", "action": "skipped", "item": least_important_item.get("name"), "reason": "essential item cannot be cut"})
                 continue

            # Remove the least important item
            if remove_item_from_schedule(resolved_schedule, least_important_item):
                conflict_log.append({"phase": "3e", "action": "cut", "item": least_important_item["name"], "reason": f"overlapped with {item1_name if least_important_item == item2 else item2_name}"})
                conflicts_resolved_in_iteration = True
                # Update parent times if the item had a parent
                if least_important_item.get("parent"):
                    update_parent_times(least_important_item["parent"])
            else:
                # If item could not be removed (e.g., not found in schedule), log it
                conflict_log.append({"phase": "3e", "action": "cut_failed", "item": least_important_item["name"], "reason": "item not found in schedule for cutting"})


        if not conflicts_resolved_in_iteration and initial_conflict_count == len(identify_conflicts(resolved_schedule)):
            return resolved_schedule, identify_conflicts(resolved_schedule)

    # Re-identify conflicts after resolution attempts
    remaining_conflicts = identify_conflicts(resolved_schedule)
    return resolved_schedule, remaining_conflicts

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
    schedule_path = schedule_path_for_date(today_str)
    manual_mod_path = manual_modifications_path_for_date(today_str)
    today_completion_data, _ = load_completion_payload(today_str)
    completion_entries = normalize_completion_entries(today_completion_data)
    rescheduled_items_summary = []
    skipped_reschedule_summary = []

    if reschedule_requested or not os.path.exists(schedule_path):
        # --- Full Generation and Resolution Process ---
        # 1. Get the current day of the week
        day_of_week = datetime.now().strftime("%A")

        # Load settings files
        scheduling_priorities_path = os.path.join(USER_DIR, "Settings", "Scheduling_Priorities.yml")
        priority_settings_path = os.path.join(USER_DIR, "Settings", "Priority_Settings.yml")
        category_settings_path = os.path.join(USER_DIR, "Settings", "Category_Settings.yml")
        status_settings_path = os.path.join(USER_DIR, "Settings", "Status_Settings.yml")
        current_user_status_path = status_current_path()
        buffer_settings_path = os.path.join(USER_DIR, "Settings", "Buffer_Settings.yml")
        
        scheduling_priorities = read_template(scheduling_priorities_path) or {}
        priority_settings = read_template(priority_settings_path) or {}
        category_settings = read_template(category_settings_path) or {}
        status_settings = read_template(status_settings_path) or {}
        current_user_status = read_template(current_user_status_path) or {}
        buffer_settings = read_template(buffer_settings_path)
        status_context = build_status_context(status_settings, current_user_status)
        
        # Load happiness map and scheduling config
        happiness_map = load_happiness_map()  # Returns None if not configured
        scheduling_config = load_scheduling_config()

        if not scheduling_priorities:
            print("Warning: Scheduling_Priorities.yml not found. Importance calculation may be inaccurate.")
        if not priority_settings:
            print("Warning: Priority_Settings.yml not found. Importance calculation may be inaccurate.")
        if not category_settings:
            print("Warning: Category_Settings.yml not found. Importance calculation may be inaccurate.")
        if not status_settings:
            print("Warning: Status_Settings.yml not found. Status-based importance calculation may be inaccurate.")
        if not current_user_status:
            print("Warning: Profile/Current_Status.yml not found. Status-based importance calculation may be inaccurate.")

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
        schedule, initial_conflicts = build_initial_schedule(template, status_context=status_context.get("current", {}))
        if initial_conflicts:
            conflict_log.append({"phase": "Initial Schedule", "conflicts": initial_conflicts})

        # Apply manual modifications
        manual_modifications = load_manual_modifications(manual_mod_path)
        if manual_modifications:
            print("Applying manual modifications...")
            schedule = apply_manual_modifications(schedule, manual_modifications)
            # Clear manual modifications after applying them
            save_manual_modifications([], manual_mod_path)

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
                calculate_item_importance(item, scheduling_priorities, priority_settings, category_settings, status_context, happiness_map)
                if "children" in item and item["children"] is not None:
                    apply_importance_recursive(item["children"])
        apply_importance_recursive(schedule)

        # --- Phase 3b.1: Promote Missed Items ---
        if reschedule_requested:
            reschedule_cfg = scheduling_config.get("rescheduling", {}) if isinstance(scheduling_config, dict) else {}
            threshold = reschedule_cfg.get("importance_threshold", 30)
            try:
                threshold = int(threshold)
            except Exception:
                threshold = 30
            promote_missed_items(
                schedule,
                completion_entries,
                datetime.now(),
                rescheduled_items_summary,
                skipped_reschedule_summary,
                importance_threshold=threshold,
            )
            # Re-flatten because promote_missed_items modifies items (moves them)
            # Actually promote_missed_items modifies objects in-place, but order changes.
            flat_schedule = get_flattened_schedule(schedule)

        # --- Phase 3b.5: Triggered Injections ---
        # Inject items based on status context (e.g. Power Nap if tired)
        injected_items = scan_and_inject_items(schedule, status_context.get("current", {}))
        if injected_items:
             print(f"✨ Injecting {len(injected_items)} items based on status...")
             
             current_time = datetime.now()
             injection_start_time = current_time
             
             for item in injected_items:
                 item["start_time"] = injection_start_time
                 item["end_time"] = injection_start_time + timedelta(minutes=item["duration"])
                 schedule.insert(0, item) # Insert at top
                 injection_start_time = item["end_time"] # Chain them if multiple
                 
             # Re-flatten again to include injected items
             flat_schedule = get_flattened_schedule(schedule)



        schedule.sort(key=lambda i: i.get("start_time", datetime.now()))

        # 6. Perform high-level capacity check (Phase 3a)
        capacity_report = check_total_duration(schedule)
        print(capacity_report) # Display capacity report to the user
        if "Capacity Conflict" in capacity_report:
            conflict_log.append({"phase": "Capacity Check", "report": capacity_report})

        # 7. Iterative Conflict Resolution Loop (Phase 3f)
        conflict_cfg = scheduling_config.get("conflict_resolution", {}) if isinstance(scheduling_config, dict) else {}
        allow_cutting = bool(conflict_cfg.get("allow_cutting", False))
        resolved_schedule, all_conflicts = phase3f_iterative_resolution_loop(
            schedule,
            conflict_log,
            allow_cutting=allow_cutting,
        )

        # 7.5 Phase 4: Work Windows (Flexible Scheduling)
        # Extract windows from sequence (windows are microroutines with window=True flag)
        
        def extract_windows_from_sequence(template):
            """Extract window nodes from template sequence."""
            windows = []
            sequence = template.get("sequence", [])
            
            for item in sequence:
                if isinstance(item, dict) and item.get("window"):
                    # This is a window node
                    windows.append(item)
            
            return windows
        
        windows = extract_windows_from_sequence(template)
        if windows:
            print(f"🪟 Processing Work Windows ({len(windows)} defined)...")
            resolved_schedule = schedule_flexible_items(resolved_schedule, windows, status_context)

        # 8. Final Buffer Insertion (Phase 4)
        if buffer_settings:
            print("Inserting buffers...")
            resolved_schedule = phase4_final_buffer_insertion(resolved_schedule, buffer_settings)

        # Archive previous schedule before saving new one
        if os.path.exists(schedule_path):
            try:
                archive_dir = os.path.join(USER_DIR, "Archive", "Schedules")
                os.makedirs(archive_dir, exist_ok=True)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                archive_path = os.path.join(archive_dir, f"schedule_{today_str}_{timestamp}.yml")
                from shutil import copy2
                copy2(schedule_path, archive_path)
                # prune old archives? maybe later
            except Exception as e:
                print(f"Warning: Failed to archive previous schedule: {e}")

        # Save the resolved schedule to the dated schedule file
        with open(schedule_path, 'w') as f:
            yaml.dump(resolved_schedule, f, default_flow_style=False)
        print(f"✅ Resolved schedule saved to: {schedule_path}")

        # Write conflict log to file
        log_dir = os.path.join(USER_DIR, "Logs")
        os.makedirs(log_dir, exist_ok=True)
        log_filename = datetime.now().strftime("conflict_log_%Y%m%d_%H%M%S.yml")
        log_path = os.path.join(log_dir, log_filename)
        with open(log_path, 'w') as f:
            yaml.dump(conflict_log, f, default_flow_style=False)
        print(f"Conflict resolution log saved to: {log_path}")

    else:
        # --- Load and Display Existing Schedule (Simplified View) ---
        # Shows what the user should do from NOW onwards, not what was missed earlier
        with open(schedule_path, 'r') as f:
            resolved_schedule = yaml.safe_load(f)
        
        now = datetime.now()
        
        def is_relevant_item(item):
            """
            Check if item is relevant for current view:
            - Upcoming: start_time >= now
            - In Progress: start_time < now < end_time
            - Has relevant children
            """
            start_time = item.get("start_time")
            end_time = item.get("end_time")
            
            # Check if this item itself is relevant
            if start_time and end_time:
                if isinstance(start_time, datetime) and isinstance(end_time, datetime):
                    # Item is in progress or upcoming
                    if end_time >= now:
                        return True
            
            # Check children
            children = item.get("children", [])
            if children:
                return any(is_relevant_item(child) for child in children)
            
            return False
        
        def filter_relevant_items(items):
            """Keep items that are in progress, upcoming, or have relevant children."""
            if not items:
                return []
            filtered = []
            for item in items:
                if is_relevant_item(item):
                    filtered_item = item.copy()
                    children = item.get("children", [])
                    if children:
                        filtered_item["children"] = filter_relevant_items(children)
                    filtered.append(filtered_item)
            return filtered
        
        resolved_schedule = filter_relevant_items(resolved_schedule)
        all_conflicts = []  # Don't show conflicts for simple view


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
