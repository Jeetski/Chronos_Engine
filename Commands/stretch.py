from datetime import datetime
from Modules.Scheduler import schedule_path_for_date, stretch_item_in_file

def run(args, properties):
    if len(args) < 2 or '--help' in args or '-h' in args:
        print(get_help_message())
        return

    item_name_parts = []
    amount_minutes = None

    for part in args:
        if part.isdigit():
            amount_minutes = int(part)
            break
        item_name_parts.append(part)

    item_name = ' '.join(item_name_parts).strip()
    if not item_name or amount_minutes is None:
        print(get_help_message())
        return

    schedule_path = schedule_path_for_date(datetime.now())
    stretch_item_in_file(schedule_path, item_name, amount_minutes)

def get_help_message():
    return """
Usage: stretch <item_name> <amount_in_minutes>
Description: Increases the duration of an item in the current day's schedule.
Example: stretch "Deep Work" 15
"""
