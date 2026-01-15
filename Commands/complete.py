
# In Commands/complete.py

import sys
from Modules.ItemManager import dispatch_command
try:
    from Utilities.tracking import is_trackable, mark_complete
except Exception:
    is_trackable = None
    mark_complete = None
import os
import yaml
from datetime import datetime
from Modules.Scheduler import get_flattened_schedule, build_block_key, schedule_path_for_date
from Commands.today import load_completion_payload
from Modules import quality_utils

def run(args, properties):
    """
    Handles the 'complete' command by dispatching it to the appropriate item handler
    to mark it as complete for the day.
    """
    if len(args) < 2 or any(arg in ['/h', '-h', '--help'] for arg in args):
        print(get_help_message())
        return

    item_type = args[0].lower()
    # Parse item name and optional properties from remaining args
    item_name_parts = []
    cmd_props = {}
    parsing_item_name = True
    for part in args[1:]:
        if ':' in part and part.count(':') >= 1:
            parsing_item_name = False
            key, value = part.split(':', 1)
            # normalize booleans
            if isinstance(value, str) and value.lower() in ('true', 'false'):
                cmd_props[key] = (value.lower() == 'true')
            else:
                cmd_props[key] = value
        elif part.startswith('--'):
            parsing_item_name = False
            key = part[2:]
            cmd_props[key] = True
        elif parsing_item_name:
            item_name_parts.append(part)
        else:
            # If properties appear before finishing name, treat as name continuation
            item_name_parts.append(part)
    item_name = ' '.join(item_name_parts)
    # Merge into incoming properties (CLI may pass empty by default)
    properties = {**properties, **cmd_props}

    quality_raw = properties.get("quality")
    quality, err = quality_utils.canonicalize_quality(quality_raw)
    if err:
        print(err)
        return

    # If this is a trackable type (excluding habit which has its own module handling),
    # update tracking directly; otherwise, dispatch to module.
    if is_trackable and is_trackable(item_type) and item_type != 'habit' and mark_complete:
        minutes = properties.get('minutes')
        count = properties.get('count')
        outcome = None
        count_as_completion = True
        # Appointment-specific flags
        if item_type == 'appointment':
            no_show = bool(properties.get('no_show', False))
            attended_prop = properties.get('attended')
            if no_show or (isinstance(attended_prop, bool) and attended_prop is False):
                outcome = 'no_show'
                count_as_completion = False
            else:
                outcome = 'attended'
                count_as_completion = True
        mark_complete(item_type, item_name, minutes=minutes, count=count, outcome=outcome, count_as_completion=count_as_completion)
        # Evaluate commitments after completion to trigger immediate actions
        try:
            from Modules.Commitment import main as CommitmentModule  # type: ignore
            CommitmentModule.evaluate_and_trigger()
        except Exception as e:
            print(f"Warning: Could not evaluate commitments: {e}")
        # Evaluate milestones as well
        try:
            from Modules.Milestone import main as MilestoneModule  # type: ignore
            MilestoneModule.evaluate_and_update_milestones()
        except Exception:
            pass
        # Award points
        try:
            from Utilities import points as Points
            pts = Points.award_on_complete(item_type, item_name, minutes=minutes if isinstance(minutes, int) else None)
            if isinstance(pts, int) and pts > 0:
                print(f"+{pts} points awarded.")
        except Exception:
            pass
    else:
        # Dispatch the command to the specific item module
        dispatch_command("complete", item_type, item_name, None, properties)
        # Evaluate commitments after module-driven completion
        try:
            from Modules.Commitment import main as CommitmentModule  # type: ignore
            CommitmentModule.evaluate_and_trigger()
        except Exception as e:
            print(f"Warning: Could not evaluate commitments: {e}")
        # Evaluate milestones as well
        try:
            from Modules.Milestone import main as MilestoneModule  # type: ignore
            MilestoneModule.evaluate_and_update_milestones()
        except Exception:
            pass
        # Award points
        try:
            from Utilities import points as Points
            pts = Points.award_on_complete(item_type, item_name, minutes=None)
            if isinstance(pts, int) and pts > 0:
                print(f"+{pts} points awarded.")
        except Exception:
            pass

    # Also record completion in per-day completion log for display integration
    try:
        today_str = datetime.now().strftime('%Y-%m-%d')
        completion_data, completion_path = load_completion_payload(today_str)
        entries = completion_data.setdefault("entries", {})
        schedule_path = schedule_path_for_date(today_str)
        scheduled_start = None
        scheduled_end = None
        if os.path.exists(schedule_path):
            with open(schedule_path, "r", encoding="utf-8") as fh:
                schedule = yaml.safe_load(fh) or []
            for item in get_flattened_schedule(schedule):
                if item.get("name", "").strip().lower() != item_name.strip().lower():
                    continue
                if item.get("is_buffer"):
                    continue
                if item.get("start_time"):
                    scheduled_start = item["start_time"].strftime("%H:%M")
                if item.get("end_time"):
                    scheduled_end = item["end_time"].strftime("%H:%M")
                break
        if scheduled_start:
            block_key = build_block_key(item_name, scheduled_start)
        else:
            block_key = build_block_key(item_name, "unscheduled")
        status = "completed" if count_as_completion else "skipped"
        entry = {
            "name": item_name,
            "status": status,
            "scheduled_start": scheduled_start,
            "scheduled_end": scheduled_end,
            "logged_at": datetime.now().isoformat(timespec="seconds"),
        }
        if quality:
            entry["quality"] = quality
        entries[block_key] = entry
        with open(completion_path, "w", encoding="utf-8") as f:
            yaml.dump(completion_data, f, default_flow_style=False, sort_keys=False)
    except Exception:
        pass

def get_help_message():
    return """
Usage: complete <item_type> <item_name>
Description: Marks an item as complete for today and updates tracking (streaks, sessions).
Examples:
  complete task "Deep Work" minutes:50 quality:Excellent
  complete routine "Morning Routine" quality:Good
  complete appointment "Dentist" attended:true
  complete appointment "Dentist" no_show:true  (records a session but does NOT count as completion)
"""
