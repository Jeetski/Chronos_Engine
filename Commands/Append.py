import sys
from Modules.ItemManager import dispatch_command

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'append' command by dispatching it to the appropriate item handler.
    """
    # Validate command arguments
    if len(args) < 3:
        print(get_help_message())
        return

    # Extract item type, item name, and text to append
    item_type_raw = args[0].lower()
    if item_type_raw.endswith('s'):
        item_type = item_type_raw[:-1]
    else:
        item_type = item_type_raw
    
    item_name = args[1]
    text_to_append = args[2]

    # Dispatch the command
    dispatch_command("append", item_type, item_name, text_to_append, properties)

def get_help_message():
    return """
Usage: append <item_type> <item_name> "<text_to_append>" [property_key:property_value ...]
Description: Appends text to the content of an existing item.
Example: append note MyMeetingNotes "- Discuss Q3 results"
"""
