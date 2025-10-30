import os
import yaml
from datetime import datetime
from Modules.ItemManager import (
    ensure_dir, get_item_path, read_item_data, write_item_data,
    list_all_items, delete_item, get_editor_command, open_item_in_editor,
    generic_handle_new # <--- Add this import
)

# Define the item type for this module
ITEM_TYPE = "task"

# --- Handler Functions for 'task' Item Type ---

def handle_new(name, properties):
    """
    Handles the creation of a new task item.
    Delegates to the generic handler in ItemManager.
    """
    generic_handle_new(ITEM_TYPE, name, properties) # <--- Call generic handler

def handle_list(sort_by, properties):
    """
    Handles listing task items, with optional sorting.
    """
    items_data = list_all_items(ITEM_TYPE)
    if not items_data:
        print(f"❌ No {ITEM_TYPE}s found.")
        return

    # Load priority settings for sorting if sorting by priority
    priority_map = {}
    settings_dir = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")), "User", "Settings")
    priority_settings_path = os.path.join(settings_dir, "Priority_Settings.yml")
    if os.path.exists(priority_settings_path):
        with open(priority_settings_path, 'r') as f:
            priority_config = yaml.safe_load(f)
            if priority_config:
                for p_name, p_data in priority_config.items():
                    if 'value' in p_data:
                        priority_map[p_name.lower()] = p_data['value']

    if sort_by:
        if sort_by.lower() == 'priority':
            # Sort by numerical priority value, fallback to a high number if not found
            items_data.sort(key=lambda x: priority_map.get(str(x.get('priority', '')).lower(), 999),
                            reverse=properties.get('reverse_sort', False))
        else:
            # Generic sort for other properties
            items_data.sort(key=lambda x: x.get(sort_by, ""), reverse=properties.get('reverse_sort', False))

    print(f"\n✅ {ITEM_TYPE.capitalize()}s List")
    print("──────────────────────────────")
    for data in items_data:
        name = data.get("Name", "Unknown")
        status = data.get("Status", "N/A")
        priority = data.get("priority", "N/A")
        print(f"📝 {name}  |  Status: {status} | Priority: {priority}")
    print("──────────────────────────────\n")

def handle_view(name, properties):
    """
    Handles viewing the content and properties of a task item.
    """
    data = read_item_data(ITEM_TYPE, name)
    if not data:
        print(f"❌ {ITEM_TYPE.capitalize()} '{name}' does not exist.")
        return

    print(f"\n📖 {ITEM_TYPE.capitalize()} Viewer")
    print("──────────────────────────────")
    print(f"📝 Name: {data.get('Name', 'Unknown')}")
    print(f"⏳ Created: {data.get('Created', 'Unknown')}")
    print(f"✅ Status: {data.get('Status', 'N/A')}")
    print(f"⭐ Priority: {data.get('priority', 'N/A')}")
    print("\n--- Content ---")
    content = data.get("Content", "")
    if content.strip():
        print(content.strip())
    else:
        print("(empty)")
    print("──────────────────────────────\n")

def handle_edit(name, properties):
    """
    Handles opening a task item in a text editor.
    """
    editor_command = get_editor_command(properties)
    open_item_in_editor(ITEM_TYPE, name, editor_command)

def handle_get(name, property_key, variable_name, properties):
    """
    Handles retrieving a specific property from a task item.
    """
    data = read_item_data(ITEM_TYPE, name)
    if not data:
        print(f"❌ {ITEM_TYPE.capitalize()} '{name}' does not exist.")
        return

    value = data.get(property_key)

    if value is not None:
        if variable_name:
            # In a real scenario, this would interact with a global variable store in Console.py
            print(f"✅ Property '{property_key}' of {ITEM_TYPE} '{name}' retrieved. Value: '{value}'. (Would be stored in variable '{variable_name}')")
        else:
            print(f"✅ Property '{property_key}' of {ITEM_TYPE} '{name}': {value}")
    else:
        print(f"❌ Property '{property_key}' not found in {ITEM_TYPE} '{name}'.")

def handle_set_property(name, property_key, property_value, properties):
    """
    Handles setting a specific property of a task item.
    """
    data = read_item_data(ITEM_TYPE, name)
    if not data:
        print(f"❌ {ITEM_TYPE.capitalize()} '{name}' does not exist.")
        return

    data[property_key] = property_value
    data.update(properties) # Apply any additional properties passed

    write_item_data(ITEM_TYPE, name, data)
    print(f"✅ Property '{property_key}' of {ITEM_TYPE} '{name}' set to '{property_value}'.")

def handle_find(keyword, properties):
    """
    Handles searching for task items based on a keyword and optional properties.
    """
    items_data = list_all_items(ITEM_TYPE)
    if not items_data:
        print(f"❌ No {ITEM_TYPE}s found to search.")
        return

    found_items = []
    for data in items_data:
        # Check keyword in Name or Content
        name_match = keyword.lower() in data.get("Name", "").lower()
        content_match = keyword.lower() in data.get("Content", "").lower()

        # Check properties
        properties_match = True
        for key, value in properties.items():
            if str(data.get(key)).lower() != str(value).lower():
                properties_match = False
                break
        
        if (name_match or content_match) and properties_match:
            found_items.append(data)

    if found_items:
        print(f"\n🔎 Found {ITEM_TYPE.capitalize()}s")
        print("──────────────────────────────")
        for data in found_items:
            name = data.get("Name", "Unknown")
            status = data.get("Status", "N/A")
            priority = data.get("priority", "N/A")
            print(f"📝 {name}  |  Status: {status} | Priority: {priority}")
        print("──────────────────────────────\n")
    else:
        print(f"❌ No {ITEM_TYPE}s found matching '{keyword}' and specified properties.")

def handle_delete(name, properties):
    """
    Handles deleting a task item, with optional force confirmation.
    """
    force = properties.get("force", False)

    if not get_item_path(ITEM_TYPE, name):
        print(f"❌ {ITEM_TYPE.capitalize()} '{name}' does not exist.")
        return

    if not force:
        confirm = input(f"⚠️ Are you sure you want to delete '{name}'? (y/n): ").strip().lower()
        if confirm not in {"y", "yes"}:
            print("❌ Deletion cancelled.")
            return

    if delete_item(ITEM_TYPE, name):
        print(f"🗑️ Deleted {ITEM_TYPE}: {name}.yml")
    else:
        print(f"❌ Failed to delete {ITEM_TYPE} '{name}'.")