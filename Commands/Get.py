import sys
from Modules.ItemManager import read_item_data
from Modules import Variables

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'get' command, retrieving a specific property from an item.
    The retrieved value can optionally be stored in a script variable.
    """
    # Validate command arguments
    if len(args) < 3:
        print(get_help_message())
        return

    # Extract item type, name, and property key, handling pluralization
    item_type_raw = args[0].lower()
    if item_type_raw.endswith('s'):
        item_type = item_type_raw[:-1]
    else:
        item_type = item_type_raw
    item_name = args[1]
    property_key = args[2]
    variable_name = properties.get('variable_name')  # Check for variable_name property

    # Read item data
    data = read_item_data(item_type, item_name)
    if not data:
        print(f"❌ {item_type.capitalize()} '{item_name}' does not exist.")
        return

    # Retrieve the property value
    value = data.get(property_key)

    # If a variable name is provided, store the value and exit early
    if value is not None and variable_name:
        Variables.set_var(variable_name, value)
        print(f"✨ Stored '{property_key}' of {item_type} '{item_name}' to @{variable_name} = '{value}'.")
        return

    # Display or store the value
    if value is not None:
        if variable_name:
            # In a real scenario, this would interact with a global variable store in Console.py
            print(f"✨ Property '{property_key}' of {item_type} '{item_name}' retrieved. Value: '{value}'. (Would be stored in variable '{variable_name}')")
        else:
            print(f"✨ Property '{property_key}' of {item_type} '{item_name}': {value}")
    else:
        print(f"❌ Property '{property_key}' not found in {item_type} '{item_name}'.")

def get_help_message():
    return """
Usage: get <item_type> <item_name> <property_key> [variable_name:<var_name>] [property_key:property_value ...]
Description: Retrieves the value of a specific property from an item.
Example: get note MyMeetingNotes category variable_name:my_category
"""

