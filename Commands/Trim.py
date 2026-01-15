import sys
from datetime import datetime
from Modules.Scheduler import trim_item_in_file, schedule_path_for_date

def run(args, properties):
    """
    Handles the 'trim' command to reduce an item's duration in the schedule.
    """
    if len(args) < 2 or "--help" in args or "-h" in args:
        print(get_help_message())
        return

    item_name_parts = []
    amount_to_trim_minutes = None

    # Parse item name and amount to trim
    for part in args:
        if part.isdigit():
            amount_to_trim_minutes = int(part)
            break
        item_name_parts.append(part)
    
    item_name = ' '.join(item_name_parts)

    if not item_name or amount_to_trim_minutes is None:
        print(get_help_message())
        return

    schedule_path = schedule_path_for_date(datetime.now())
    trim_item_in_file(schedule_path, item_name, amount_to_trim_minutes)

def get_help_message():
    return """
Usage: trim <item_name> <amount_in_minutes>
Description: Reduces the duration of an item in the current day's schedule.
Example: trim "Morning Routine" 10
"""
