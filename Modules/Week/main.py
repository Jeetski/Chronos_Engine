import os
import yaml
from datetime import datetime
from Modules.ItemManager import (
    ensure_dir, get_item_path, read_item_data, write_item_data,
    list_all_items, delete_item, get_editor_command, open_item_in_editor
)

# Define the item type for this module
ITEM_TYPE = "week"

# --- Handler Functions for 'week' Item Type ---

def handle_new(name, properties):
    """
    Handles the creation of a new week template item.
    Initializes with default properties and an empty sequence.
    """
    # Default properties for a new week
    content = {
        "Name": name,
        "Description": f"A new {ITEM_TYPE} template.",
        "Category": "General",
        "Duration": "7d",
        "Sequence": [] # Initialize with an empty sequence of days
    }
    content.update(properties) # Apply any additional properties passed

    write_item_data(ITEM_TYPE, name, content)
    print(f"✅ Created new {ITEM_TYPE} template: {name}.yml")
    print(f"💡 You can now edit this template using: edit {ITEM_TYPE} {name}")

def handle_view(name, properties):
    """
    Handles viewing the content and properties of a week template item.
    """
    data = read_item_data(ITEM_TYPE, name)
    if not data:
        print(f"❌ {ITEM_TYPE.capitalize()} template '{name}' does not exist.")
        return

    print(f"\n📖 {ITEM_TYPE.capitalize()} Template Viewer")
    print("──────────────────────────────")
    for key, value in data.items():
        if key == "Sequence":
            print(f"\n--- Sequence of Days ---")
            if value:
                for i, day_entry in enumerate(value):
                    print(f"  {i+1}. Day:")
                    for day_key, day_value in day_entry.get("Day", {}).items():
                        print(f"     {day_key}: {day_value}")
            else:
                print("  (empty sequence)")
        else:
            print(f"{key}: {value}")
    print("──────────────────────────────\n")

def handle_edit(name, properties):
    """
    Handles opening a week template item in a text editor.
    """
    editor_command = get_editor_command(properties)
    open_item_in_editor(ITEM_TYPE, name, editor_command)

def handle_list(sort_by, properties):
    """
    Handles listing week template items.
    """
    items_data = list_all_items(ITEM_TYPE)
    if not items_data:
        print(f"❌ No {ITEM_TYPE} templates found.")
        return

    print(f"\n✅ {ITEM_TYPE.capitalize()} Templates List")
    print("──────────────────────────────")
    for data in items_data:
        name = data.get("Name", "Unknown")
        description = data.get("Description", "N/A")
        print(f"📝 {name}  |  Description: {description}")
    print("──────────────────────────────\n")

def handle_delete(name, properties):
    """
    Handles deleting a week template item, with optional force confirmation.
    """
    force = properties.get("force", False)

    if not get_item_path(ITEM_TYPE, name):
        print(f"❌ {ITEM_TYPE.capitalize()} template '{name}' does not exist.")
        return

    if not force:
        confirm = input(f"⚠️ Are you sure you want to delete {ITEM_TYPE} template '{name}'? (y/n): ").strip().lower()
        if confirm not in {"y", "yes"}:
            print("❌ Deletion cancelled.")
            return

    if delete_item(ITEM_TYPE, name):
        print(f"🗑️ Deleted {ITEM_TYPE} template: {name}.yml")
    else:
        print(f"❌ Failed to delete {ITEM_TYPE} template '{name}'.")
