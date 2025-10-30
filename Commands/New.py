import sys
from Modules.ItemManager import dispatch_command

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'new' command by dispatching it to the appropriate item handler.
    """
    # Validate command arguments
    if len(args) < 1:
        print(get_help_message())
        return

    item_type_raw = args[0].lower()
    if item_type_raw.endswith('s'):
        item_type = item_type_raw[:-1]
    else:
        item_type = item_type_raw

    item_name_parts = []
    command_properties = {}

    # Parse item name and properties from the rest of the args
    # The item name can be multi-word and might be quoted, so we need to be careful
    # We assume the item name comes before any properties
    parsing_item_name = True
    for part in args[1:]:
        if ':' in part and part.count(':') >= 1:
            parsing_item_name = False # Found a property, stop parsing item name
            key, value = part.split(':', 1)
            if value.lower() == 'true':
                command_properties[key] = True
            elif value.lower() == 'false':
                command_properties[key] = False
            else:
                command_properties[key] = value
        elif part.startswith('--'):
            parsing_item_name = False # Found a flag, stop parsing item name
            key = part[2:] # Remove '--'
            command_properties[key] = True
        elif parsing_item_name:
            item_name_parts.append(part)
        else:
            # This case should ideally not happen if properties are always at the end
            # For now, we'll treat it as an item name part if parsing_item_name is False
            # but it's not a property. This might need refinement.
            item_name_parts.append(part)

    item_name = ' '.join(item_name_parts)

    if not item_name:
        print("Error: Item name is required.")
        print(get_help_message())
        return

    # Dispatch the command
    dispatch_command("new", item_type, item_name, None, command_properties)

def get_help_message():
    return """
Usage: new <item_type> <item_name> [property_key:property_value ...]
Description: Creates a new item of the specified type with the given name and properties.
Example: new note MyMeetingNotes category:work priority:high

Note: For 'alarm' and 'reminder' item types, you can add a 'script' property to execute a .chs file when triggered.
Example: new alarm MyAlarm time:08:00 script:Scripts/my_script.chs
"""
