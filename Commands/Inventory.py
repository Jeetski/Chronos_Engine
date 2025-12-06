from Modules.ItemManager import (
    list_all_items,
    read_item_data,
    write_item_data,
    dispatch_command,
)


def run(args, properties):
    """
    High-level gear management helper.
    """
    if not args:
        print(get_help_message())
        return

    sub = args[0].lower()
    tail = args[1:]
    props = properties or {}

    if sub == "list":
        _list_inventories(props)
    elif sub == "show":
        if not tail:
            print("Usage: inventory show <inventory_name>")
            return
        _show_inventory(" ".join(tail))
    elif sub == "new":
        name = " ".join(tail).strip()
        if not name:
            print("Usage: inventory new <name> [property:value ...]")
            return
        dispatch_command("new", "inventory", name, None, props)
    elif sub == "add-item":
        if len(tail) < 2:
            print("Usage: inventory add-item <inventory_name> <item_name> [quantity:n]")
            return
        _add_inventory_entry(tail[0], tail[1], props, entry_type="inventory_item")
    elif sub == "remove-item":
        if len(tail) < 2:
            print("Usage: inventory remove-item <inventory_name> <item_name>")
            return
        _remove_inventory_entry(tail[0], tail[1], entry_type="inventory_item")
    elif sub == "add-tool":
        if len(tail) < 2:
            print("Usage: inventory add-tool <inventory_name> <tool_name>")
            return
        _add_inventory_entry(tail[0], tail[1], props, entry_type="tool")
    elif sub == "remove-tool":
        if len(tail) < 2:
            print("Usage: inventory remove-tool <inventory_name> <tool_name>")
            return
        _remove_inventory_entry(tail[0], tail[1], entry_type="tool")
    elif sub == "items":
        _handle_inventory_items(tail, props)
    elif sub == "tools":
        _handle_tools(tail, props)
    else:
        print(f"Unknown inventory subcommand '{sub}'.")
        print(get_help_message())


def _normalize_record(record):
    return {str(k).lower(): v for k, v in record.items()}


def _list_inventories(filters):
    records = [ _normalize_record(it) for it in list_all_items("inventory") ]
    if not records:
        print("No inventories found.")
        return
    place_filter = str(filters.get("place") or filters.get("places") or "").lower()
    tag_filter = str(filters.get("tag") or filters.get("tags") or "").lower()

    for rec in records:
        name = rec.get("name", "Unnamed inventory")
        places = _ensure_list(rec.get("places") or rec.get("location"))
        tags = _ensure_list(rec.get("tags"))

        if place_filter and all(str(p).lower() != place_filter for p in places):
            continue
        if tag_filter and all(str(t).lower() != tag_filter for t in tags):
            continue

        print(f"- {name}")
        if places:
            print(f"    Places: {', '.join(places)}")
        if tags:
            print(f"    Tags: {', '.join(tags)}")
        inv_items = rec.get("inventory_items") or rec.get("items") or []
        print(f"    Items: {len(inv_items)}  |  Tools: {len(rec.get('tools') or [])}")
    print()


def _show_inventory(name):
    data = read_item_data("inventory", name)
    if not data:
        print(f"Inventory '{name}' not found.")
        return
    inv_name = data.get("name", name)
    print(f"\nInventory: {inv_name}")
    places = _ensure_list(data.get("places") or data.get("location"))
    if places:
        print(f"  Places: {', '.join(places)}")
    tags = _ensure_list(data.get("tags"))
    if tags:
        print(f"  Tags: {', '.join(tags)}")
    desc = data.get("description")
    if desc:
        print(f"  Description: {desc}")
    items = data.get("inventory_items") or data.get("items") or []
    if items:
        print("  Inventory Items:")
        for entry in items:
            qty = entry.get("quantity", 1)
            print(f"    - {entry.get('name')} (qty: {qty})")
    tools = data.get("tools") or []
    if tools:
        print("  Tools:")
        for entry in tools:
            print(f"    - {entry.get('name')}")
    notes = data.get("notes")
    if notes:
        print("  Notes:")
        print("    " + "\n    ".join(str(notes).splitlines()))
    print()


def _handle_inventory_items(args, props):
    if not args or args[0].lower() == "list":
        _list_items(props)
        return
    sub = args[0].lower()
    tail = args[1:]
    if sub == "new":
        name = " ".join(tail).strip()
        if not name:
            print("Usage: inventory items new <name> [property:value ...]")
            return
        dispatch_command("new", "inventory_item", name, None, props)
    elif sub == "show":
        if not tail:
            print("Usage: inventory items show <name>")
            return
        _show_simple_item("inventory_item", " ".join(tail))
    else:
        print("Usage: inventory items [list|new|show]")


def _handle_tools(args, props):
    if not args or args[0].lower() == "list":
        _list_tools(props)
        return
    sub = args[0].lower()
    tail = args[1:]
    if sub == "new":
        name = " ".join(tail).strip()
        if not name:
            print("Usage: inventory tools new <name> [property:value ...]")
            return
        dispatch_command("new", "tool", name, None, props)
    elif sub == "show":
        if not tail:
            print("Usage: inventory tools show <name>")
            return
        _show_simple_item("tool", " ".join(tail))
    else:
        print("Usage: inventory tools [list|new|show]")


def _list_items(filters):
    records = [ _normalize_record(it) for it in list_all_items("inventory_item") ]
    if not records:
        print("No inventory items found.")
        return
    place_filter = str(filters.get("place") or filters.get("places") or "").lower()
    for rec in records:
        places = [str(p).lower() for p in _ensure_list(rec.get("places"))]
        if place_filter and place_filter not in places:
            continue
        qty = rec.get("quantity", 1)
        print(f"- {rec.get('name')} (qty: {qty})")
        if rec.get("category"):
            print(f"    Category: {rec.get('category')}")
        if places:
            print(f"    Places: {', '.join(_ensure_list(rec.get('places')))}")
    print()


def _list_tools(filters):
    records = [ _normalize_record(it) for it in list_all_items("tool") ]
    if not records:
        print("No tools found.")
        return
    place_filter = str(filters.get("place") or filters.get("places") or "").lower()
    for rec in records:
        locations = [str(p).lower() for p in _ensure_list(rec.get("locations"))]
        if place_filter and place_filter not in locations:
            continue
        print(f"- {rec.get('name')}")
        if rec.get("category"):
            print(f"    Category: {rec.get('category')}")
        caps = _ensure_list(rec.get("capabilities"))
        if caps:
            print(f"    Capabilities: {', '.join(caps)}")
        if rec.get("locations"):
            print(f"    Locations: {', '.join(_ensure_list(rec.get('locations')))}")
    print()


def _show_simple_item(item_type, name):
    data = read_item_data(item_type, name)
    if not data:
        print(f"{item_type.replace('_', ' ').title()} '{name}' not found.")
        return
    print(f"\n{item_type.replace('_', ' ').title()}: {data.get('name', name)}")
    for key, value in data.items():
        if key == "name":
            continue
        print(f"  {key}: {value}")
    print()


def _add_inventory_entry(inventory_name, entry_name, properties, entry_type):
    data = read_item_data("inventory", inventory_name)
    if not data:
        print(f"Inventory '{inventory_name}' not found.")
        return
    key = "inventory_items" if entry_type == "inventory_item" else "tools"
    entries = list(data.get(key) or data.get("items") or []) if entry_type == "inventory_item" else list(data.get(key) or [])
    normalized_name = entry_name.lower()
    existing = None
    for entry in entries:
        if str(entry.get("name", "")).lower() == normalized_name:
            existing = entry
            break
    if existing:
        if entry_type == "inventory_item":
            qty = properties.get("quantity")
            if qty is not None:
                try:
                    existing["quantity"] = int(qty)
                except Exception:
                    pass
        print(f"Updated existing {entry_type.replace('_', ' ')} '{entry_name}' in inventory '{inventory_name}'.")
    else:
        entry = {"type": entry_type, "name": entry_name}
        if entry_type == "inventory_item":
            qty = properties.get("quantity")
            if qty is not None:
                try:
                    entry["quantity"] = int(qty)
                except Exception:
                    entry["quantity"] = qty
            else:
                entry["quantity"] = 1
        entries.append(entry)
        print(f"Added {entry_type.replace('_', ' ')} '{entry_name}' to inventory '{inventory_name}'.")

    if entry_type == "inventory_item":
        data["inventory_items"] = entries
    else:
        data["tools"] = entries
    write_item_data("inventory", inventory_name, data)


def _remove_inventory_entry(inventory_name, entry_name, entry_type):
    data = read_item_data("inventory", inventory_name)
    if not data:
        print(f"Inventory '{inventory_name}' not found.")
        return
    key = "inventory_items" if entry_type == "inventory_item" else "tools"
    entries = list(data.get(key) or data.get("items") or []) if entry_type == "inventory_item" else list(data.get(key) or [])
    before = len(entries)
    entries = [entry for entry in entries if str(entry.get("name", "")).lower() != entry_name.lower()]
    if before == len(entries):
        print(f"{entry_type.replace('_', ' ').title()} '{entry_name}' not found in inventory '{inventory_name}'.")
        return
    print(f"Removed {entry_type.replace('_', ' ')} '{entry_name}' from inventory '{inventory_name}'.")
    if entry_type == "inventory_item":
        data["inventory_items"] = entries
    else:
        data["tools"] = entries
    write_item_data("inventory", inventory_name, data)


def _ensure_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def get_help_message():
    return """
Inventory command

Usage:
  inventory list [place:At Home]
  inventory show <inventory_name>
  inventory new <inventory_name> [property:value ...]
  inventory add-item <inventory_name> <item_name> [quantity:n]
  inventory remove-item <inventory_name> <item_name>
  inventory add-tool <inventory_name> <tool_name>
  inventory remove-tool <inventory_name> <tool_name>
  inventory items [list|new|show]
  inventory tools [list|new|show]

Description:
  Provides a friendly wrapper around the generic commands so you can
  list, create, and edit inventories, inventory items, and tools without
  remembering every verb.

Examples:
  inventory list place:\"On The Go\"
  inventory new \"Studio Rig\" places:\"At Home\" tags:music
  inventory add-item \"Everyday Carry Kit\" \"Pocket Notebook\" quantity:2
  inventory items new \"Field Recorder\" category:audio places:\"On The Go\"
"""
