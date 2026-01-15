
import os
import shutil
import time
import yaml
from Modules.ItemManager import get_item_path

def run(args, properties):
    """
    Archives an item by moving it to User/Archive/<Type>/.
    Adds an 'archived_at' timestamp to the item.
    """
    if len(args) < 2:
        print(get_help_message())
        return

    item_type = args[0]
    item_name = args[1]

    # Resolve paths
    src_path = get_item_path(item_type, item_name)
    if not src_path or not os.path.exists(src_path):
        print(f"Error: Could not find {item_type} '{item_name}'")
        return

    # Prepare archive path
    # src_path is something like User/tasks/mytask.yml
    # We want User/Archive/tasks/mytask.yml
    
    # robust way: get relative path from User directory
    # assumption: get_item_path returns abs path. Modules.ItemManager.USER_DIR is the base.
    from Modules.ItemManager import USER_DIR
    
    # safeguard against weird paths
    if not src_path.startswith(os.path.abspath(USER_DIR)):
         print(f"Error: Item path '{src_path}' is outside the User directory.")
         return

    rel_path = os.path.relpath(src_path, USER_DIR)
    archive_base = os.path.join(USER_DIR, "Archive")
    dest_path = os.path.join(archive_base, rel_path)

    ensure_dir(os.path.dirname(dest_path))

    # Read, Modify, Write to temp, Move
    try:
        with open(src_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f) or {}
        
        # Add metadata
        # Add metadata
        data['archived_at'] = time.strftime('%Y-%m-%d %H:%M:%S')
        
        # Check if caller requested tag as deleted
        if properties.get('_deleted'):
            data['deleted'] = True
            data['deleted_at'] = data['archived_at']

        
        # Write to destination
        with open(dest_path, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False)
            
        # Delete source
        os.remove(src_path)
        
        print(f"Archived {item_type} '{item_name}' to {dest_path}")
        
    except Exception as e:
        print(f"Error archiving item: {e}")

def ensure_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)

def get_help_message():
    return """
Usage:
  archive <type> <name>

Description:
  Moves an item to the 'User/Archive' directory for safekeeping.
  Adds an 'archived_at' timestamp to the item.
  
  Equivalent to 'delete' without flags (soft delete).
"""
