
import os
import shutil
import time
import glob
import yaml
from Modules.ItemManager import USER_DIR, get_item_dir

ARCHIVE_DIR = os.path.join(USER_DIR, "Archive")

def run(args, properties):
    """
    Handles the 'undo' command.
    undo delete [type] -> restores the most recently archived item (of that type, or global).
    undo reschedule -> restores the most recent schedule from Archive/Schedules/.
    """
    if not args:
        print(get_help_message())
        return

    action = args[0].lower()

    if action == "delete":
        handle_undo_delete(args[1:] if len(args) > 1 else [])
    elif action == "reschedule":
        handle_undo_reschedule()
    else:
        print(f"Unknown undo action: {action}")
        print(get_help_message())

def handle_undo_delete(args):
    """
    Restores the most recently modified file in User/Archive.
    If a type is provided, filters by that type.
    """
    target_type = args[0].lower() if args else None
    
    search_pattern = os.path.join(ARCHIVE_DIR, "**", "*.yml")
    if target_type:
         # Need to resolve the actual usage directory name (e.g. note -> notes)
         # get_item_dir returns full path User/notes
         full_dir = get_item_dir(target_type)
         dir_name = os.path.basename(full_dir)
         search_pattern = os.path.join(ARCHIVE_DIR, dir_name, "*.yml")
    
    # recursive glob if no type, or specific glob if type
    files = glob.glob(search_pattern, recursive=True)
    if not files:
        print("Nothing to undo (Archive is empty).")
        return

    # Sort by modification time, newest first
    files.sort(key=os.path.getmtime, reverse=True)
    latest_file = files[0]
    
    # Restore it
    # rel_path relative to Archive -> User/Archive/tasks/foo.yml -> tasks/foo.yml
    rel_path = os.path.relpath(latest_file, ARCHIVE_DIR)
    dest_path = os.path.join(USER_DIR, rel_path)
    
    # Check if dest exists
    if os.path.exists(dest_path):
        print(f"Warning: Destination '{dest_path}' already exists. Cannot undo restore.")
        return

    try:
        # Remove archived_at key if we want to be clean, but maybe keep it for history?
        # Let's remove it to restore exact state.
        with open(latest_file, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f) or {}
        
        if 'archived_at' in data:
            del data['archived_at']
            
        ensure_dir(os.path.dirname(dest_path))
        
        with open(dest_path, 'w', encoding='utf-8') as f:
             yaml.dump(data, f, default_flow_style=False, sort_keys=False)
             
        os.remove(latest_file)
        print(f"Restored '{rel_path}'")
        
    except Exception as e:
        print(f"Error undoing delete: {e}")

def handle_undo_reschedule():
    """
    Restores the latest schedule from User/Archive/Schedules/
    """
    schedules_dir = os.path.join(ARCHIVE_DIR, "Schedules")
    if not os.path.exists(schedules_dir):
        print("No archived schedules found.")
        return

    files = glob.glob(os.path.join(schedules_dir, "today_schedule_*.yml"))
    if not files:
        print("No previous schedules found to restore.")
        return

    # Sort by name (timestamp) or mtime
    files.sort(key=os.path.getmtime, reverse=True)
    latest_backup = files[0]
    
    current_schedule = os.path.join(USER_DIR, "today_schedule.yml")
    
    try:
        shutil.copy2(latest_backup, current_schedule)
        print(f"Restored schedule from {os.path.basename(latest_backup)}")
        # Optional: delete the backup we just used? Or keep it?
        # Let's keep it for now.
    except Exception as e:
        print(f"Error restoring schedule: {e}")

def ensure_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)

def get_help_message():
    return """
Usage:
  undo delete [type]
  undo reschedule

Description:
  undo delete: Restores the most recently archived item.
  undo reschedule: Reverts 'User/today_schedule.yml' to the previous version.
"""
