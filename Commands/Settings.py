
import os
import yaml

def find_settings_file(file_shortcut):
    settings_dir = os.path.join("User", "Settings")
    best_match = None
    for filename in os.listdir(settings_dir):
        if filename.endswith(".yml"):
            # Normalize the filename by removing _Settings, _Defaults, and .yml
            normalized_filename = filename.replace("_Settings", "").replace("_Defaults", "").replace(".yml", "").lower()
            if file_shortcut.lower() == normalized_filename:
                return os.path.join(settings_dir, filename)
            if file_shortcut.lower() in normalized_filename and not best_match:
                best_match = os.path.join(settings_dir, filename)
    return best_match

def run(args, properties):
    """
    Handles the 'settings' command.
    Modifies a specified settings file with a given property and value.
    Accepts a shorthand for the settings file name.
    """
    if len(args) < 3:
        print("Usage: settings <file_shortcut> <property> <value>")
        return

    file_shortcut = args[0]
    prop_key = args[1]
    prop_value = args[2]

    settings_path = find_settings_file(file_shortcut)

    if not settings_path:
        print(f"Error: Settings file matching '{file_shortcut}' not found.")
        return

    with open(settings_path, 'r') as f:
        data = yaml.safe_load(f)

    keys = prop_key.split('.')
    temp_data = data
    for key in keys[:-1]:
        if key not in temp_data:
            temp_data[key] = {}
        temp_data = temp_data[key]
    
    # Attempt to convert value to a number or boolean if possible
    if prop_value.lower() == 'true':
        prop_value = True
    elif prop_value.lower() == 'false':
        prop_value = False
    else:
        try:
            prop_value = int(prop_value)
        except ValueError:
            try:
                prop_value = float(prop_value)
            except ValueError:
                pass # Keep as string

    temp_data[keys[-1]] = prop_value

    with open(settings_path, 'w') as f:
        yaml.dump(data, f, default_flow_style=False)

    print(f"Success: Updated '{prop_key}' in '{os.path.basename(settings_path)}'.")

def get_help_message():
    return '''
Usage: settings <file_shortcut> <property> <value>
Description: Modifies a setting in a specified settings file.
Arguments:
  <file_shortcut>: A shorthand for the settings file name (e.g., 'buffer' for 'Buffer_Settings.yml').
  <property>: The name of the property to modify. Use dot notation for nested properties (e.g., 'global_dynamic_buffer.buffer_interval_minutes').
  <value>: The new value for the property.
'''
