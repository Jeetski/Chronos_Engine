import sys
from Modules.ItemManager import dispatch_command
try:
    from Commands import Archive
except ImportError:
    # Fallback if Archive.py isn't loaded yet in some contexts, though typically it should be.
    Archive = None

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'delete' command.
    By default, it archives the item (soft delete).
    If -f or --force or force:true is present, it permanently deletes.
    """
    if len(args) < 2:
        print("❌ Usage: delete [-f|--force] <item_type> <item_name>")
        return

    item_type = args[0].lower()
    item_name = args[1]
    
    # Check for force flag
    # Console.py handles stripping -f from args list but puts it in properties as 'force': True if configured, 
    # OR we check properties manually.
    force = bool(properties.get('force', False))

    if force:
        # Permanent delete
        dispatch_command("delete", item_type, item_name, None, properties)
    else:
        # Soft delete (Archive)
        if Archive:
            print(f"📦 Archiving '{item_name}' (soft delete). Use -f to delete permanently.")
            # Pass hidden property to indicate this was a delete op
            archive_props = properties.copy()
            archive_props['_deleted'] = True
            Archive.run([item_type, item_name], archive_props)
        else:
            # Fallback if Archive module missing
            print(f"⚠️ Archive command not found. Proceeding with permanent delete.")
            dispatch_command("delete", item_type, item_name, None, properties)

def get_help_message():
    return """
Usage: delete [-f|--force] <item_type> <item_name>
Description: 
  Deletes an item of the specified type.
  - By default, moves the item to 'User/Archive' (soft delete).
  - Use -f or --force (or force:true) to permanently delete.
Example: 
  delete note MyOldNote          # Archives it
  delete note MyOldNote --force  # Deletes it forever
"""
