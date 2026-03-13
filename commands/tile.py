from modules.item_manager import dispatch_command
from modules.tile import main as tile_module


def _parse_name_and_properties(tokens):
    name_parts = []
    props = {}
    parsing_name = True
    for part in tokens:
        if ":" in part:
            parsing_name = False
            key, value = part.split(":", 1)
            props[key.lower()] = value
        elif part.startswith("--"):
            parsing_name = False
            props[part[2:].lower()] = True
        elif parsing_name:
            name_parts.append(part)
        else:
            name_parts.append(part)
    return " ".join(name_parts).strip(), props


def run(args, properties):
    if not args or str(args[0]).lower() in {"help", "-h", "--help"}:
        print(get_help_message())
        return

    sub = str(args[0]).strip().lower()
    if sub == "new":
        name, props = _parse_name_and_properties(args[1:])
        props.update({str(k).lower(): v for k, v in (properties or {}).items()})
        if not name:
            print("Tile name is required.")
            print(get_help_message())
            return
        dispatch_command("new", "tile", name, None, props)
        return

    if sub == "list":
        rows = tile_module.list_tiles()
        if not rows:
            print("No tiles found.")
            return
        print("\nTopos Tiles")
        print("──────────")
        for row in rows:
            print(
                f"- {row.get('name')} | type={row.get('tile_type')} | "
                f"ring={row.get('ring')} slot={row.get('slot')} | target={row.get('target') or '-'}"
            )
        return

    if sub == "open":
        name = " ".join(args[1:]).strip()
        if not name:
            print("Tile name is required.")
            return
        row = tile_module.get_tile(name)
        if not row:
            print(f"Tile '{name}' not found.")
            return
        if row.get("tile_type") == "group":
            print(f"Tile '{name}' is a group and does not have a single open target.")
            return
        ok = tile_module.open_tile_target(row)
        print(f"{'Opened' if ok else 'Could not open'} tile '{name}'.")
        return

    if sub == "link":
        name, props = _parse_name_and_properties(args[1:])
        item_type = str(props.get("item_type") or props.get("linked_item_type") or "").strip()
        item_name = str(props.get("item_name") or props.get("linked_item_name") or "").strip()
        if not name or not item_type or not item_name:
            print("Usage: tile link <tile_name> item_type:<type> item_name:<name>")
            return
        try:
            tile_module.set_tile_link(name, item_type, item_name)
            print(f"Linked tile '{name}' to {item_type} '{item_name}'.")
        except FileNotFoundError:
            print(f"Tile '{name}' not found.")
        return

    if sub == "unlink":
        name = " ".join(args[1:]).strip()
        if not name:
            print("Tile name is required.")
            return
        try:
            tile_module.clear_tile_link(name)
            print(f"Cleared link for tile '{name}'.")
        except FileNotFoundError:
            print(f"Tile '{name}' not found.")
        return

    if sub == "add-target":
        name, props = _parse_name_and_properties(args[1:])
        value = str(props.get("value") or props.get("target") or "").strip()
        if not name or not value:
            print("Usage: tile add-target <tile_name> value:<path_or_url>")
            return
        try:
            tile_module.add_target(name, value)
            print(f"Added target to tile '{name}'.")
        except FileNotFoundError:
            print(f"Tile '{name}' not found.")
        return

    if sub == "remove-target":
        name, props = _parse_name_and_properties(args[1:])
        value = str(props.get("value") or props.get("target") or "").strip()
        if not name or not value:
            print("Usage: tile remove-target <tile_name> value:<path_or_url>")
            return
        try:
            tile_module.remove_target(name, value)
            print(f"Removed target from tile '{name}'.")
        except FileNotFoundError:
            print(f"Tile '{name}' not found.")
        return

    print(get_help_message())


def get_help_message():
    return """
Usage:
  tile new <name> tile_type:<url|file|folder|group> target:<value> [icon:<icon>] [ring:<n>] [slot:<n>]
  tile list
  tile open <name>
  tile link <name> item_type:<type> item_name:<name>
  tile unlink <name>
  tile add-target <name> value:<path_or_url>
  tile remove-target <name> value:<path_or_url>

Description:
  Manage Topos tiles as first-class Chronos items.
"""
