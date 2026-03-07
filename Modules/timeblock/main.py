from Modules.item_manager import (
    generic_handle_new,
    generic_handle_append,
    generic_handle_delete,
    read_item_data,
    write_item_data,
    open_item_in_editor,
)

ITEM_TYPE = "timeblock"

def handle_new(name, properties):
    """Create a new Time Block."""
    defaults = {
        "duration": 60,
        "consumable_by": {
            "categories": [],
            "tags": [],
            "items": []
        },
        "is_elastic": False,
        "priority_modifier": 1.0,
        "description": "A block of time dedicated to specific types of tasks."
    }
    if properties:
        defaults.update(properties)
        
    generic_handle_new(ITEM_TYPE, name, defaults)


def handle_command(command, item_type, item_name, text_to_append, properties):
    """
    Standard lifecycle commands for Timeblocks.
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
        _print_timeblock(item_name)
        return

    if normalized in ("set", "update", "edit"):
        _update_properties(item_name, properties)
        return

    if normalized == "open":
        open_item_in_editor(item_type, item_name, None)
        return

    print(f"Unsupported command for timeblock: {command}")


def _print_timeblock(name: str):
    data = read_item_data(ITEM_TYPE, name)
    if not data:
        print(f"Timeblock '{name}' not found.")
        return
    
    print("--- Time Block ---")
    print(f"  Name: {name}")
    print(f"  Duration: {data.get('duration', 0)} min")
    print(f"  Elastic: {data.get('is_elastic', False)}")
    
    consumable = data.get('consumable_by', {})
    if consumable:
        cats = consumable.get('categories')
        tags = consumable.get('tags')
        if cats: print(f"  Consumable by Cats: {', '.join(cats)}")
        if tags: print(f"  Consumable by Tags: {', '.join(tags)}")
        
    print(f"  Description: {data.get('description', '')}")


def _update_properties(name: str, updates: dict):
    if not updates:
        print("No properties provided to update.")
        return
    data = read_item_data(ITEM_TYPE, name)
    if not data:
        print(f"Timeblock '{name}' not found.")
        return
    
    for key, value in updates.items():
        if key is None:
            continue
        data[str(key).lower()] = value
        
    write_item_data(ITEM_TYPE, name, data)
    print(f"Timeblock '{name}' updated.")
