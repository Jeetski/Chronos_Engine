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
    
    # The item name is the second argument
    item_name = args[1]

    # Dispatch the command
    dispatch_command("new", item_type, item_name, None, properties)

def get_help_message():
    return """
Usage: create <item_type> <item_name> [property_key:property_value ...]
Description: Creates a new item of the specified type with the given name and properties.
Example: create note MyMeetingNotes category:work priority:high

Note: For 'alarm' and 'reminder' item types, you can add a 'script' property to execute a .chs file when triggered.
Example: create alarm MyAlarm time:08:00 script:Scripts/my_script.chs
"""
