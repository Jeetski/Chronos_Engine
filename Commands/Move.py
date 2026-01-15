import sys
import os
from Modules.ItemManager import read_item_data, write_item_data, delete_item, get_item_path

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'move' command, moving an item to a new type or renaming it.
    """
    # Validate command arguments
    if len(args) < 2:
        print(get_help_message())
        return

    # Extract source item type and name
    source_item_type_raw = args[0].lower()
    if source_item_type_raw.endswith('s'):
        source_item_type = source_item_type_raw[:-1]
    else:
        source_item_type = source_item_type_raw
    
    source_item_name = args[1]

    # Determine target item type and new item name
    target_item_type = source_item_type # Default to same type
    print(f"DEBUG: Commands/Move.py - target_item_type after initial assignment: {target_item_type}")
    new_item_name = source_item_name # Default to same name

    # Check for new item name in args (if not a property)
    if len(args) > 2 and ':' not in args[2]:
        new_item_name = args[2]

    # Check properties dictionary for 'type' and 'name' overrides
    if "type" in properties:
        target_item_type = properties["type"].lower()
        if target_item_type.endswith('s'):
            target_item_type = target_item_type[:-1]
        print(f"DEBUG: Commands/Move.py - target_item_type from properties: {target_item_type}")
        del properties["type"] # Remove from properties to avoid re-applying to item content

    if "name" in properties:
        new_item_name = properties["name"]
        print(f"DEBUG: Commands/Move.py - new_item_name from properties: {new_item_name}")
        del properties["name"] # Remove from properties to avoid re-applying to item content

    print(f"DEBUG: Commands/Move.py - target_item_type after property checks: {target_item_type}")

    # Read source item data
    source_data = read_item_data(source_item_type, source_item_name)
    if not source_data:
        print(f"❌ {source_item_type.capitalize()} '{source_item_name}' does not exist.")
        return

    # Check if target item already exists
    target_item_path = get_item_path(target_item_type, new_item_name)
    if os.path.exists(target_item_path):
        print(f"❌ {target_item_type.capitalize()} '{new_item_name}' already exists. Cannot move.")
        return

    # Update name property in data if it changed
    copied_data = source_data.copy()
    copied_data["Name"] = new_item_name
    copied_data.update(properties) # Apply any additional properties passed

    # Write to new location/name
    write_item_data(target_item_type, new_item_name, copied_data)

    # Delete original item
    delete_item(source_item_type, source_item_name)

    print(f"DEBUG: Commands/Move.py - target_item_type before final print: {target_item_type}")
    print(f"✅ Moved {source_item_type} '{source_item_name}' to {target_item_type} '{new_item_name}'.")

def get_help_message():
    return """
Usage: move <source_item_type> <source_item_name> [new_item_name] [type:<target_item_type>] [name:<new_item_name>] [property_key:property_value ...]
Description: Moves an item to a new item type, renames it, or both.
Example: move note MyOldNote MyNewNote
Example: move note MyNote type:task
Example: move note MyNote MyTask type:task
"""