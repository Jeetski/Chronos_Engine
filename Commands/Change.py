import sys
from Modules.Scheduler import change_item_time_in_file, TODAY_SCHEDULE_PATH

def run(args, properties):
    """
    Handles the 'change' command to modify an item's start time in the schedule.
    """
    if len(args) < 2 or "--help" in args or "-h" in args:
        print(get_help_message())
        return

    item_name_parts = []
    new_start_time_str = None

    # Parse item name and new start time
    # Assuming the last argument is the time string (HH:MM)
    if ':' in args[-1] and len(args[-1].split(':')) == 2:
        new_start_time_str = args[-1]
        item_name_parts = args[:-1]
    else:
        print(get_help_message())
        return
    
    item_name = ' '.join(item_name_parts)

    if not item_name or not new_start_time_str:
        print(get_help_message())
        return

    change_item_time_in_file(TODAY_SCHEDULE_PATH, item_name, new_start_time_str)

def get_help_message():
    return """
Usage: change <item_name> <new_start_time_HH:MM>
Description: Changes the start time of an item in the current day's schedule.
Example: change "Morning Routine" 08:30
"""