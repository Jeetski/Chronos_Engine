import os
import webbrowser

from modules.item_manager import (
    generic_handle_append,
    generic_handle_delete,
    generic_handle_new,
    list_all_items,
    read_item_data,
    write_item_data,
)


ITEM_TYPE = "tile"
TILE_TYPES = ["url", "file", "folder", "group"]
ICON_CHOICES = ["globe", "folder", "file", "group", "star", "link", "custom"]


def handle_command(command_name, item_type, item_name, text, properties):
    if command_name == "new":
        generic_handle_new(ITEM_TYPE, item_name, properties)
        return
    if command_name == "append":
        generic_handle_append(ITEM_TYPE, item_name, text, properties)
        return
    if command_name == "delete":
        generic_handle_delete(ITEM_TYPE, item_name, properties)
        return
    print(f"Tile module has no custom item-manager handler for '{command_name}'.")


def _normalize_targets(raw_targets):
    if isinstance(raw_targets, list):
        return [str(x).strip() for x in raw_targets if str(x).strip()]
    if isinstance(raw_targets, str):
        return [line.strip() for line in raw_targets.splitlines() if line.strip()]
    return []


def normalize_tile_data(data):
    row = dict(data or {})
    row["type"] = ITEM_TYPE
    row["tile_type"] = str(row.get("tile_type") or "url").strip().lower()
    if row["tile_type"] not in TILE_TYPES:
        row["tile_type"] = "url"
    row["icon"] = str(row.get("icon") or "globe").strip().lower()
    row["icon_path"] = str(row.get("icon_path") or "").strip()
    row["target"] = str(row.get("target") or "").strip()
    row["targets"] = _normalize_targets(row.get("targets"))
    row["linked_item_type"] = str(row.get("linked_item_type") or "").strip().lower()
    row["linked_item_name"] = str(row.get("linked_item_name") or "").strip()
    row["ring"] = int(row.get("ring") or 1)
    row["slot"] = int(row.get("slot") or 0)
    row["enabled"] = bool(row.get("enabled", True))
    row["pinned"] = bool(row.get("pinned", False))
    return row


def get_tile(name):
    data = read_item_data(ITEM_TYPE, name)
    if not isinstance(data, dict):
        return None
    return normalize_tile_data(data)


def save_tile(data):
    row = normalize_tile_data(data)
    name = str(row.get("name") or "").strip()
    if not name:
        raise ValueError("Tile name is required.")
    write_item_data(ITEM_TYPE, name, row)
    return row


def list_tiles():
    return [normalize_tile_data(row) for row in list_all_items(ITEM_TYPE) if isinstance(row, dict)]


def get_tiles_for_ring(ring=1):
    wanted = int(ring)
    rows = [row for row in list_tiles() if int(row.get("ring") or 0) == wanted]
    rows.sort(key=lambda row: int(row.get("slot") or 0))
    return rows


def get_tiles_by_slot(ring=1):
    out = {}
    for row in get_tiles_for_ring(ring):
        out[int(row.get("slot") or 0)] = row
    return out


def set_tile_link(name, linked_item_type, linked_item_name):
    row = get_tile(name)
    if not row:
        raise FileNotFoundError(name)
    row["linked_item_type"] = str(linked_item_type or "").strip().lower()
    row["linked_item_name"] = str(linked_item_name or "").strip()
    return save_tile(row)


def clear_tile_link(name):
    return set_tile_link(name, "", "")


def add_target(name, value):
    row = get_tile(name)
    if not row:
        raise FileNotFoundError(name)
    val = str(value or "").strip()
    if not val:
        return row
    targets = list(row.get("targets") or [])
    if val not in targets:
        targets.append(val)
    row["targets"] = targets
    if not row.get("target"):
        row["target"] = val
    return save_tile(row)


def remove_target(name, value):
    row = get_tile(name)
    if not row:
        raise FileNotFoundError(name)
    val = str(value or "").strip()
    row["targets"] = [item for item in row.get("targets") or [] if item != val]
    if str(row.get("target") or "").strip() == val:
        row["target"] = row["targets"][0] if row["targets"] else ""
    return save_tile(row)


def open_tile_target(tile):
    row = normalize_tile_data(tile)
    tile_type = str(row.get("tile_type") or "").lower()
    target = str(row.get("target") or "").strip()
    if tile_type == "group":
        return False
    if not target:
        return False
    if tile_type == "url" or target.startswith(("http://", "https://")):
        webbrowser.open_new_tab(target)
        return True
    if os.name == "nt":
        os.startfile(target)  # type: ignore[attr-defined]
        return True
    webbrowser.open(f"file://{os.path.abspath(target)}")
    return True
