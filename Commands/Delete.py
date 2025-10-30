import sys
from Modules.ItemManager import dispatch_command

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'delete' command by dispatching it to the appropriate item handler.
    """
    # Validate command arguments
    # Check for force flag in properties, as Console.py already parses it
    # The item_type and item_name are now in args[0] and args[1]
    # because Console.py already removed the force flag from args if it was present
    if len(args) < 2:
        print("❌ Usage: delete [-f|--force] <item_type> <item_name>")
        return

    item_type = args[0].lower()
    item_name = args[1]

    dispatch_command("delete", item_type, item_name, None, properties)

def get_help_message():
    return """
Usage: delete [-f|--force] <item_type> <item_name> [property_key:property_value ...]
Description: Deletes an item of the specified type. Use -f or --force to skip confirmation.
Example: delete note MyOldNote --force
"""
