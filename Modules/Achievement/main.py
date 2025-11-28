from datetime import datetime
from Modules.ItemManager import (
    generic_handle_new,
    generic_handle_append,
    generic_handle_delete,
    read_item_data,
    write_item_data,
    open_item_in_editor,
)

ITEM_TYPE = "achievement"


def handle_new(name, properties):
    """Create a new achievement using the generic handler."""
    generic_handle_new(ITEM_TYPE, name, properties)


def handle_command(command, item_type, item_name, text_to_append, properties):
    """
    Router for achievement commands so they behave like other item types.
    Supports: new/create, append, delete, info/view/track, set/update, open.
    """
    normalized = (command or "").strip().lower()

    if normalized in ("new", "create"):
        generic_handle_new(item_type, item_name, properties)
        return

    if normalized == "append":
        if not text_to_append:
            print("Info: Nothing to append. Provide text after the achievement name.")
            return
        generic_handle_append(item_type, item_name, text_to_append, properties)
        return

    if normalized == "delete":
        generic_handle_delete(item_type, item_name, properties)
        return

    if normalized in ("info", "view", "track"):
        _print_achievement(item_name)
        return

    if normalized in ("set", "update", "edit"):
        _update_properties(item_name, properties)
        return

    if normalized == "open":
        open_item_in_editor(item_type, item_name, None)
        return

    print(f"Unsupported command for achievement: {command}")


def _print_achievement(name: str):
    data = read_item_data(ITEM_TYPE, name)
    if not data:
        print(f"Achievement '{name}' not found.")
        return

    status = str(data.get("status") or "").strip().lower()
    awarded_at = data.get("awarded_at") or data.get("awarded_on") or data.get("completed")
    awarded = bool(awarded_at) or status in ("awarded", "done", "completed")
    points = data.get("points") or data.get("value") or 0
    print("--- Achievement ---")
    print(f"  Name: {name}")
    print(f"  Description: {data.get('description') or data.get('notes') or 'N/A'}")
    print(f"  Category: {data.get('category') or 'general'}")
    print(f"  Priority: {data.get('priority') or 'normal'}")
    print(f"  Status: {status or ('awarded' if awarded else 'pending')}")
    if awarded_at:
        print(f"  Awarded at: {awarded_at}")
    if points:
        print(f"  Points: {points}")
    tags = data.get("tags")
    if isinstance(tags, list):
        print(f"  Tags: {', '.join(str(t) for t in tags)}")


def _update_properties(name: str, updates: dict):
    if not updates:
        print("No properties provided to update.")
        return
    data = read_item_data(ITEM_TYPE, name)
    if not data:
        print(f"Achievement '{name}' not found.")
        return
    for key, value in updates.items():
        if key is None:
            continue
        data[str(key).lower()] = value
    if "awarded" in data and data.get("awarded") and not data.get("awarded_at"):
        data["awarded_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    write_item_data(ITEM_TYPE, name, data)
    print(f"Achievement '{name}' updated.")
