import sys
import os
from Modules.ItemManager import get_item_path, read_item_data, write_item_data, delete_item

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'rename' command, changing the name of an existing item.
    This involves updating the 'Name' property within the item's YAML and renaming the file.
    """
    # Validate command arguments
    if len(args) < 3:
        print(get_help_message())
        return

    # Extract item type, old name, and new name, handling pluralization
    item_type_raw = args[0].lower()
    if item_type_raw.endswith('s'):
        item_type = item_type_raw[:-1]
    else:
        item_type = item_type_raw
    old_name = args[1]
    new_name = args[2]

    # --- Validation Checks ---
    # Check if the item to be renamed exists
    old_path = get_item_path(item_type, old_name)
    if not os.path.exists(old_path):
        print(f"❌ {item_type.capitalize()} '{old_name}' does not exist.")
        return

    # Check if an item with the new name already exists
    new_path = get_item_path(item_type, new_name)
    if os.path.exists(new_path):
        print(f"❌ {item_type.capitalize()} '{new_name}' already exists. Cannot rename.")
        return

    # --- Rename Logic ---
    # Read the data from the old file
    data = read_item_data(item_type, old_name)
    if data:
        data["Name"] = new_name # Update the 'Name' property inside the YAML content
        write_item_data(item_type, new_name, data) # Write the updated data to the new file name
        delete_item(item_type, old_name) # Delete the old file
        print(f"✅ Renamed {item_type} from '{old_name}' to '{new_name}'.")
    else:
        print(f"❌ Failed to read data from {item_type} '{old_name}'.")

def get_help_message():
    return """
Usage: rename <item_type> <old_name> <new_name> [properties]
Description: Renames an existing item.
Example: rename note MyOldNote MyNewNote
"""
