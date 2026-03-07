from datetime import datetime
from Modules.scheduler import schedule_path_for_date, anchor_item_in_file
from Modules.item_manager import read_item_data, write_item_data


def run(args, properties):
    if len(args) < 1 or '--help' in args or '-h' in args:
        print(get_help_message())
        return

    scope = str(properties.get('scope') or 'today').lower()
    item_name = ' '.join(args).strip()
    if not item_name:
        print(get_help_message())
        return

    if scope in {'item', 'always'}:
        item_type = str(properties.get('type') or 'task').lower()
        data = read_item_data(item_type, item_name)
        if not data:
            print(f"❌ Item '{item_name}' of type '{item_type}' not found.")
            return
        data['reschedule'] = 'never'
        write_item_data(item_type, item_name, data)
        print(f"✅ Anchored '{item_name}' for all schedules.")
        return

    schedule_path = schedule_path_for_date(datetime.now())
    anchor_item_in_file(schedule_path, item_name, scope='today')

def get_help_message():
    return """
Usage: anchor <item_name> [scope:today|item]
Description: Anchors an item so it cannot be moved or trimmed by reschedules.
Example: anchor "Deep Work" scope:today
"""
