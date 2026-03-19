"""
Chronos `copy` command.

Important compatibility note:
- This file is named `copy.py` because it powers the `copy` CLI command.
- In some Chronos startup paths, the `commands/` directory can end up on
  `sys.path`, which means imports like `from copy import deepcopy` may
  accidentally resolve to this file instead of Python's standard-library
  `copy` module.

To avoid breaking those imports, this command file proxies the standard-library
`copy` API (`copy`, `deepcopy`, and related error symbols) before defining the
Chronos command entrypoints.
"""

import importlib.util
import os
import sysconfig


def _load_stdlib_copy_module():
    """Load the real Python standard-library `copy` module by filesystem path."""
    stdlib_dir = sysconfig.get_path("stdlib")
    if not stdlib_dir:
        raise ImportError("Could not locate Python stdlib path for copy module.")

    copy_path = os.path.join(stdlib_dir, "copy.py")
    spec = importlib.util.spec_from_file_location("_chronos_stdlib_copy", copy_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load stdlib copy module from: {copy_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_STDLIB_COPY = _load_stdlib_copy_module()

# Re-export the stdlib API so `from copy import deepcopy` still works even if
# this file is resolved as module `copy`.
copy = _STDLIB_COPY.copy
deepcopy = _STDLIB_COPY.deepcopy
Error = getattr(_STDLIB_COPY, "Error", Exception)
error = getattr(_STDLIB_COPY, "error", Error)

__all__ = ["copy", "deepcopy", "Error", "error", "run", "get_help_message"]

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'copy' command, creating a duplicate of an existing item.
    """
    from modules.item_manager import read_item_data, write_item_data, get_item_path

    # Validate command arguments
    if len(args) < 2:
        print(get_help_message())
        return

    # Extract item type, source item name, and optional new item name
    item_type_raw = args[0].lower()
    if item_type_raw.endswith('s'):
        item_type = item_type_raw[:-1]
    else:
        item_type = item_type_raw
    
    source_item_name = args[1]
    new_item_name = source_item_name # Default to same name if not provided

    # Check if a new item name is provided as the third argument
    if len(args) > 2:
        new_item_name = args[2]

    # Read source item data
    source_data = read_item_data(item_type, source_item_name)
    if not source_data:
        print(f"❌ {item_type.capitalize()} '{source_item_name}' does not exist.")
        return

    # Check if an item with the new name already exists
    new_item_path = get_item_path(item_type, new_item_name)
    if os.path.exists(new_item_path):
        print(f"❌ {item_type.capitalize()} '{new_item_name}' already exists. Cannot copy.")
        return

    # Create a copy of the data and update properties
    copied_data = source_data.copy()
    copied_data["Name"] = new_item_name # Update the name property in the copied data
    
    # Normalize property keys from user-provided properties, especially 'content' to 'Content'
    normalized_properties = {}
    for key, value in properties.items():
        if key.lower() == "content":
            normalized_properties["Content"] = value
        else:
            normalized_properties[key] = value

    copied_data.update(normalized_properties) # Apply any additional properties passed

    # Normalize 'content' key from copied_data if present
    if "content" in copied_data and "Content" not in copied_data:
        copied_data["Content"] = copied_data.pop("content")

    # Write the new item data
    write_item_data(item_type, new_item_name, copied_data)
    print(f"✅ Copied {item_type} '{source_item_name}' to '{new_item_name}'.")

def get_help_message():
    return """
Usage: copy <item_type> <source_item_name> [new_item_name] [property_key:property_value ...]
Description: Creates a duplicate of an existing item, optionally with a new name and modified properties.
Example: copy note MyMeetingNotes MyMeetingNotes_Copy
Example: copy task "Old Task" "New Task" status:pending priority:high
"""
