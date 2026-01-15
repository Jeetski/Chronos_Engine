
import os
import time
import glob
import shutil
from Modules.ItemManager import USER_DIR

BACKUPS_DIR = os.path.join(USER_DIR, "Backups")
ARCHIVE_DIR = os.path.join(USER_DIR, "Archive")

def run(args, properties):
    """
    Handles the 'clean' command.
    clean backups -> Keeps last 5 backups.
    clean archives -> Deletes archives older than X days (default 30).
    clean temp -> Deletes temp files (if any known).
    """
    if not args:
        print(get_help_message())
        return

    target = args[0].lower()
    
    if target == "backups":
        clean_backups(properties)
    elif target == "archives":
        clean_archives(properties)
    elif target == "temp":
        clean_temp()
    else:
        print(f"Unknown target: {target}")
        print(get_help_message())

def clean_backups(properties):
    keep_count = properties.get('keep', 5)
    
    files = glob.glob(os.path.join(BACKUPS_DIR, "*.zip"))
    if not files:
        print("No backups found.")
        return
        
    # Sort by time, newest first
    files.sort(key=os.path.getmtime, reverse=True)
    
    if len(files) <= keep_count:
        print(f"Backups count ({len(files)}) is within limit ({keep_count}). No action needed.")
        return
        
    to_delete = files[keep_count:]
    print(f"Cleaning {len(to_delete)} old backups...")
    
    for f in to_delete:
        try:
            os.remove(f)
            print(f"Deleted: {os.path.basename(f)}")
        except OSError as e:
            print(f"Error deleting {f}: {e}")

def clean_archives(properties):
    days = properties.get('days', 30)
    cutoff = time.time() - (days * 86400)
    
    print(f"Cleaning archives older than {days} days...")
    
    count = 0
    # Walk archive dir
    for root, dirs, files in os.walk(ARCHIVE_DIR):
        for name in files:
            path = os.path.join(root, name)
            try:
                mtime = os.path.getmtime(path)
                if mtime < cutoff:
                    os.remove(path)
                    print(f"Deleted: {os.path.basename(path)}")
                    count += 1
            except OSError as e:
                print(f"Error checking/deleting {path}: {e}")
                
    if count == 0:
        print("No old archives found.")
    else:
        print(f"Cleaned {count} archived files.")
        
    # Optional: cleanup empty dirs?
    for root, dirs, files in os.walk(ARCHIVE_DIR, topdown=False):
        for name in dirs:
            try:
                os.rmdir(os.path.join(root, name))
            except OSError:
                pass # not empty

def clean_temp():
    # Placeholder: if we define a temp dir later
    print("No temporary files defined to clean.")

def get_help_message():
    return """
Usage:
  clean backups [keep:5]
  clean archives [days:30]
  clean temp

Description:
  Maintenance command to free up space.
  
Example:
  clean backups keep:3
  clean archives days:60
"""
