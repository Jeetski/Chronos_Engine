import sys
from Modules.ItemManager import dispatch_command

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'create' command by dispatching it to the appropriate item handler.
    """
    # Validate command arguments
    if len(args) < 2:
        print(get_help_message())
        return

    # Extract item type and name, handling pluralization
    item_type_raw = args[0].lower()
    if item_type_raw.endswith('s'):
        item_type = item_type_raw[:-1]
    else:
        item_type = item_type_raw

    # Collect multi-word item name until a property token (key:value) or flag appears
    name_parts = []
    for part in args[1:]:
        if (':' in part and part.count(':') >= 1) or part.startswith('--'):
            break
        name_parts.append(part)
    item_name = ' '.join(name_parts) if name_parts else args[1]

    # Dispatch the command
    dispatch_command("new", item_type, item_name, None, properties)

def get_help_message():
    return """
Usage: create <item_type> <item_name> [property_key:property_value ...]
Description: Creates a new item of the specified type with the given name and properties.
Example: create note MyMeetingNotes category:work priority:high

Note: For 'alarm' and 'reminder' item types, you can add a 'script' property to execute a .chs file when triggered.
Example: create alarm MyAlarm time:08:00 script:Scripts/my_script.chs

Linking alarms/reminders to items:
- Add a 'target' object to the YAML (via properties or by editing the file) to execute an action on trigger.
  target:
    type: task
    name: "Deep Work"
    action: complete   # or: open | set_status
    status: completed  # required only when action == set_status
    properties: { minutes: 25 }  # optional extra args for the action
"""
