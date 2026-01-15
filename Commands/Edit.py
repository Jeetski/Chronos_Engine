import sys
from Modules.ItemManager import get_editor_command, open_item_in_editor

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'edit' command, opening an item's YAML file in a text editor.
    The editor is determined by command properties, config, or environment variables.
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
    item_name = ' '.join(args[1:])

    # Determine the editor command and open the item
    editor_command = get_editor_command(properties)
    open_item_in_editor(item_type, item_name, editor_command)

def get_help_message():
    return """
Usage: edit <item_type> <item_name> [editor:<editor_name>] [property_key:property_value ...]
Description: Opens an item in a text editor for modification.
Example: edit note MyMeetingNotes editor:nvim
"""
