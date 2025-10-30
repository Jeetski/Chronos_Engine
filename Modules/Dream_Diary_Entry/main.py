import os
import yaml
from datetime import datetime
from Modules.ItemManager import (
    ensure_dir, get_item_path, read_item_data, write_item_data,
    list_all_items, delete_item, get_editor_command, open_item_in_editor,
    generic_handle_new # Import generic_handle_new
)

# Define the item type for this module
ITEM_TYPE = "dream_diary_entry"

# --- Handler Functions for 'dream_diary_entry' Item Type ---

def handle_new(name, properties):
    """
    Handles the creation of a new dream diary entry item.
    Delegates to the generic handler in ItemManager.
    """
    generic_handle_new(ITEM_TYPE, name, properties)

def handle_view(name, properties):
    """
    Handles viewing the content and properties of a dream diary entry item.
    """
    data = read_item_data(ITEM_TYPE, name)
    if not data:
        print(f"❌ {ITEM_TYPE.capitalize()} '{name}' does not exist.")
        return

    print(f"\n📖 {ITEM_TYPE.capitalize()} Viewer")
    print("──────────────────────────────")
    print(f"📝 Name: {data.get('Name', 'Unknown')}")
    print(f"⏳ Created: {data.get('Created', 'Unknown')}")
    print("\n--- Content ---")
    content = data.get("Content", "")
    if content.strip():
        print(content.strip())
    else:
        print("(empty)")
    print("──────────────────────────────\n")

def handle_edit(name, properties):
    """
    Handles opening a dream diary entry item in a text editor.
    """
    editor_command = get_editor_command(properties)
    open_item_in_editor(ITEM_TYPE, name, editor_command)

def handle_list(sort_by, properties):
    """
    Handles listing dream diary entry items, with optional sorting.
    """
    items_data = list_all_items(ITEM_TYPE)
    if not items_data:
        print(f"❌ No {ITEM_TYPE}s found.")
        return

    print(f"\n📂 {ITEM_TYPE.capitalize()}s Index")
    print("──────────────────────────────")
    for data in items_data:
        name = data.get("Name", "Unknown")
        created = data.get("Created", "Unknown")
        print(f"📝 {name}  |  ⏳ {created}")
    print("──────────────────────────────\n")

def handle_delete(name, properties):
    """
    Handles deleting a dream diary entry item, with optional force confirmation.
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