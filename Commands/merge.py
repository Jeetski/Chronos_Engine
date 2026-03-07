from datetime import datetime
from Modules.scheduler import schedule_path_for_date, merge_item_in_file


def run(args, properties):
    if len(args) < 3 or '--help' in args or '-h' in args:
        print(get_help_message())
        return

    # Expect: merge <item> with <other>
    if 'with' not in [a.lower() for a in args]:
        print(get_help_message())
        return

    idx = [a.lower() for a in args].index('with')
    item_name = ' '.join(args[:idx]).strip()
    other_name = ' '.join(args[idx+1:]).strip()
    if not item_name or not other_name:
        print(get_help_message())
        return

    schedule_path = schedule_path_for_date(datetime.now())
    merge_item_in_file(schedule_path, item_name, other_name)

def get_help_message():
    return """
Usage: merge <item_name> with <other_item_name>
Description: Merges two items in today's schedule into one block.
Example: merge "Deep Work" with "Email"
"""
