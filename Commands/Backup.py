
import os
import zipfile
import time
import glob
from Modules.ItemManager import USER_DIR, ROOT_DIR

BACKUPS_DIR = os.path.join(USER_DIR, "Backups")

def run(args, properties):
    """
    Handles the 'backup' command.
    backup -> creates a new zip backup of the User directory.
    backup list -> lists available backups.
    """
    action = args[0].lower() if args else "create"
    
    if action == "create":
        create_backup(args, properties)
    elif action == "list":
        list_backups()
    else:
        # Default to create if unknown arg, or maybe help?
        # Let's assume 'create' is default but if they typed a name, maybe they meant to name it?
        # Actually standard syntax: backup [name]
        create_backup(args, properties)

def create_backup(args, properties):
    os.makedirs(BACKUPS_DIR, exist_ok=True)
    
    # Optional name from args
    if args and args[0] != "create":
         base_name = args[0]
         if not base_name.endswith('.zip'):
             base_name += ".zip"
    else:
         ts = time.strftime('%Y%m%d_%H%M%S')
         base_name = f"chronos_backup_{ts}.zip"
         
    out_path = os.path.join(BACKUPS_DIR, base_name)
    
    print(f"Creating backup at {out_path}...")
    try:
        with zipfile.ZipFile(out_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
            # Walk User dir
            # We want the zip to contain 'User/...' so we walk USER_DIR but use ROOT_DIR for relpath
            for folder, _dirs, files in os.walk(USER_DIR):
                for fname in files:
                    # Skip the Backups folder itself to avoid recursion or huge files
                    if "Backups" in folder:
                        continue
                        
                    abs_path = os.path.join(folder, fname)
                    arc = os.path.relpath(abs_path, ROOT_DIR) 
                    zf.write(abs_path, arc)
                    
        print(f"✅ Backup created: {out_path}")
        
    except Exception as e:
        print(f"❌ Backup failed: {e}")

def list_backups():
    if not os.path.exists(BACKUPS_DIR):
        print("No backups found (User/Backups directory missing).")
        return
        
    files = glob.glob(os.path.join(BACKUPS_DIR, "*.zip"))
    files.sort(key=os.path.getmtime, reverse=True)
    
    if not files:
        print("No backups found.")
        return
        
    print("Available Backups:")
    for f in files:
        size_mb = os.path.getsize(f) / (1024 * 1024)
        mtime = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(os.path.getmtime(f)))
        print(f"- {os.path.basename(f)}  ({size_mb:.2f} MB)  [{mtime}]")

def get_help_message():
    return """
Usage:
  backup [name]
  backup list

Description:
  Creates a full backup of the 'User' directory.
  Saves to 'User/Backups/'.
  
Example:
  backup
  backup snapshot_v1
  backup list
"""
