import sys
from Modules.ItemManager import read_item_data

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'view' command, displaying the content and properties of a specific item.
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
    item_name = args[1]

    # Read item data
    data = read_item_data(item_type, item_name)
    if not data:
        print(f"❌ {item_type.capitalize()} '{item_name}' does not exist.")
        return

    # --- Display Item Data ---
    # This part should ideally be handled by the module for item-specific display
    # For now, a generic display of all key-value pairs
    print(f"\n📖 {item_type.capitalize()} Viewer")
    print("──────────────────────────────")
    for key, value in data.items():
        print(f"{key.capitalize()}: {value}")
    print("──────────────────────────────\n")

def get_help_message():
    return """
Usage: view <item_type> <item_name> [property_key:property_value ...]
Description: Displays the content and properties of a specific item.
Example: view note MyMeetingNotes
"""
