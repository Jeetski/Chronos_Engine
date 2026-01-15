import sys
from Modules.ItemManager import read_item_data, write_item_data

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'remove' command, deleting a specific property from an item.
    """
    # Validate command arguments
    if len(args) < 3:
        print(get_help_message())
        return

    # Extract item type, item name, and property key, handling pluralization
    item_type_raw = args[0].lower()
    if item_type_raw.endswith('s'):
        item_type = item_type_raw[:-1]
    else:
        item_type = item_type_raw
    
    item_name = args[1]
    property_key = args[2]

    # Read item data
    data = read_item_data(item_type, item_name)
    if not data:
        print(f"❌ {item_type.capitalize()} '{item_name}' does not exist.")
        return

    # Remove the property
    if property_key in data:
        del data[property_key]
        write_item_data(item_type, item_name, data)
        print(f"✅ Property '{property_key}' removed from {item_type} '{item_name}'.")
    else:
        print(f"❌ Property '{property_key}' not found in {item_type} '{item_name}'.")

def get_help_message():
    return """
Usage: remove <item_type> <item_name> <property_key>
Description: Removes a specified property from an item.
Example: remove note MyMeetingNotes category
"""
