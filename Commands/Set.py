import sys
from Modules.ItemManager import read_item_data, write_item_data
from Modules import Variables

# --- Global Variables for Scripting ---
# This dictionary stores variables set by the 'set var' command.
# In a more robust system, this would be managed by the Console or a dedicated scripting engine
GLOBAL_VARS = {}

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'set' command, which can either set properties of an item
    or define a global script variable.
    """
    # Validate command arguments
    if len(args) < 1:
        print(get_help_message())
        return

    first_arg = args[0].lower()

    # --- Handle 'set var' sub-command ---
    if first_arg == "var":
        if len(args) < 2:
            print("Usage: set var <variable_name>:<value>")
            return
        
        var_assignment = args[1]
        if ':' in var_assignment:
            var_name, var_value = var_assignment.split(':', 1)
            Variables.set_var(var_name, var_value)
            print(f"✅ Variable '{var_name}' set to '{var_value}'.")
        else:
            print(f"❌ Invalid variable assignment: {var_assignment}. Expected format: <variable_name>:<value>")
    # --- Handle 'set <item_type>' command ---
    else: # Assume it's an item type
        # Validate arguments for item property setting
        if len(args) < 2: # Need at least item_type and item_name
            print("Usage: set <item_type> <item_name> <property_key>:<value> [...]")
            return

        # Extract item type and name, handling pluralization
        item_type_raw = first_arg
        if item_type_raw.endswith('s'):
            item_type = item_type_raw[:-1]
        else:
            item_type = item_type_raw
        item_name = args[1]
        
        # The properties to set are already in the 'properties' dictionary
        item_properties_to_set = properties 

        # Ensure there are properties to set
        if not item_properties_to_set:
            print("❌ No properties specified to set.")
            return

        # Read item data, update, and write back
        data = read_item_data(item_type, item_name)
        if not data:
            print(f"❌ {item_type.capitalize()} '{item_name}' does not exist.")
            return

        data.update(item_properties_to_set)

        write_item_data(item_type, item_name, data)
        print(f"✅ Properties of {item_type} '{item_name}' updated.")

def get_help_message():
    return """
Usage: set <item_type> <item_name> <property_key>:<value> [...]
       set var <variable_name>:<value>
Description: Sets properties of an item or defines a script variable.
Example: set note MyMeetingNotes priority:high category:work
Example: set var my_variable:some_value
"""
