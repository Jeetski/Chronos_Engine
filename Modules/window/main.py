import datetime
from Modules.item_manager import (
    generic_handle_new,
    generic_handle_append,
    generic_handle_delete,
    read_item_data,
    write_item_data,
    open_item_in_editor,
)

ITEM_TYPE = "window"

def handle_new(name, properties):
    """Create a new Time Window."""
    # Default properties for a Window
    defaults = {
        "start_time": "09:00",
        "end_time": "11:00",
        "days": ["mon", "tue", "wed", "thu", "fri"],
        "filter": {
            "category": "Work",
            "tags": [],
            "energy": "High"
        },
        "description": "A time window for specific types of work."
    }
    # Merge provided properties into defaults
    if properties:
        defaults.update(properties)
        
    generic_handle_new(ITEM_TYPE, name, defaults)


def handle_command(command, item_type, item_name, text_to_append, properties):
    """
    Standard lifecycle commands for Windows.
    """
    normalized = (command or "").strip().lower()

    if normalized in ("new", "create"):
        handle_new(item_name, properties)
        return

    if normalized == "append":
        if not text_to_append:
            print("Info: Nothing to append.")
            return
        generic_handle_append(item_type, item_name, text_to_append, properties)
        return

    if normalized == "delete":
        generic_handle_delete(item_type, item_name, properties)
        return

    if normalized in ("info", "view"):
        _print_window(item_name)
        return

    if normalized in ("set", "update", "edit"):
        _update_properties(item_name, properties)
        return

    if normalized == "open":
        open_item_in_editor(item_type, item_name, None)
        return

    print(f"Unsupported command for window: {command}")


def _print_window(name: str):
    data = read_item_data(ITEM_TYPE, name)
    if not data:
        print(f"Window '{name}' not found.")
        return
    
    print("--- Time Window ---")
    print(f"  Name: {name}")
    print(f"  Time: {data.get('start_time', '?')} - {data.get('end_time', '?')}")
    print(f"  Days: {', '.join(data.get('days', []))}")
    print(f"  Filter: {data.get('filter', {})}")
    print(f"  Description: {data.get('description', '')}")


def _update_properties(name: str, updates: dict):
    if not updates:
        print("No properties provided to update.")
        return
    data = read_item_data(ITEM_TYPE, name)
    if not data:
        print(f"Window '{name}' not found.")
        return
    
    for key, value in updates.items():
        if key is None:
            continue
        # Support updating nested filter via "filter.key" syntax if needed
        # For now, just direct update
        data[str(key).lower()] = value
        
    write_item_data(ITEM_TYPE, name, data)
    print(f"Window '{name}' updated.")
