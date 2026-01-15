import sys
from datetime import datetime
from Modules.Scheduler import cut_item_in_file, schedule_path_for_date

def run(args, properties):
    """
    Handles the 'cut' command to remove an item from the schedule.
    """
    if len(args) < 1 or "--help" in args or "-h" in args:
        print(get_help_message())
        return

    item_name = ' '.join(args)

    schedule_path = schedule_path_for_date(datetime.now())
    cut_item_in_file(schedule_path, item_name)

def get_help_message():
    return """
Usage: cut <item_name>
Description: Removes an item from the current day's schedule.
Example: cut "Morning Routine"
"""
