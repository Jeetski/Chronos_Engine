from datetime import datetime
from Modules.Scheduler import schedule_path_for_date, split_item_in_file


def run(args, properties):
    if len(args) < 1 or '--help' in args or '-h' in args:
        print(get_help_message())
        return

    count = properties.get('count')
    if count is None:
        # Allow last arg to be numeric
        if args and str(args[-1]).isdigit():
            count = int(args[-1])
            args = args[:-1]
    try:
        count = int(count) if count is not None else 2
    except Exception:
        count = 2

    item_name = ' '.join(args).strip()
    if not item_name:
        print(get_help_message())
        return

    schedule_path = schedule_path_for_date(datetime.now())
    split_item_in_file(schedule_path, item_name, count=count)

def get_help_message():
    return """
Usage: split <item_name> [count:<n>]
Description: Splits an item into N equal parts in today's schedule.
Example: split "Deep Work" count:3
"""
