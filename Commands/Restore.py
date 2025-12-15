
import os
import zipfile
import glob
import shutil
from Modules.ItemManager import USER_DIR, ROOT_DIR
from Commands import Backup

BACKUPS_DIR = Backup.BACKUPS_DIR

def run(args, properties):
    """
    Handles the 'restore' command.
    restore <filename|latest>
    """
    if len(args) < 1:
        print(get_help_message())
        return

    target = args[0]
    
    # Locate the file
    backup_path = None
    
    if target.lower() == "latest":
        files = glob.glob(os.path.join(BACKUPS_DIR, "*.zip"))
        if not files:
            print("No backups found.")
            return
        files.sort(key=os.path.getmtime, reverse=True)
        backup_path = files[0]
    else:
        # Check if full path or just filename
        if os.path.exists(target):
            backup_path = target
        else:
            # check in Backups dir
            possible_path = os.path.join(BACKUPS_DIR, target)
            if not possible_path.endswith('.zip'):
                possible_path += ".zip"
            
            if os.path.exists(possible_path):
                backup_path = possible_path
            
    if not backup_path:
        print(f"Error: Backup '{target}' not found.")
        return

    # Confirmation
    force = bool(properties.get('force', False))
    if not force:
        print(f"⚠️  WARNING: This will overwrite your current 'User' data with '{os.path.basename(backup_path)}'.")
        print("Type 'yes' to confirm or use restore <file> force:true")
        # In actual CLI usage, interactive input isn't always easy. 
        # But Console.py supports input() so we can try.
        # However, for safety, let's just demand the force flag or checking if user typed 'yes' in args?
        # No, let's just ask for force:true property for now to be safe and consistent with non-interactive usage.
        print("To proceed, run: restore <file> force:true")
        return

    print(f"Restoring from {backup_path}...")
    
    try:
        with zipfile.ZipFile(backup_path, 'r') as zf:
            # We extract to ROOT_DIR because the zip contains 'User/...' structure
            # But let's verify archive structure
            names = zf.namelist()
            has_user_prefix = any(n.startswith('User/') or n.startswith('User\\') for n in names)
            
            extract_root = ROOT_DIR if has_user_prefix else USER_DIR
            
            zf.extractall(extract_root)
            
        print("✅ Restore complete.")
        
    except Exception as e:
        print(f"❌ Restore failed: {e}")

def get_help_message():
    return """
Usage:
  restore <filename|latest> force:true

Description:
  Restores the 'User' directory from a backup zip.
  Requires 'force:true' property to confirm overwrite.
  
Example:
  restore latest force:true
  restore chronos_backup_20250101.zip force:true
"""
