import os
import yaml
import subprocess
from datetime import datetime, timedelta
import importlib.util
from Modules.FilterManager import FilterManager

# Determine the root directory of the Chronos Engine project
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
USER_DIR = os.path.join(ROOT_DIR, "User")

def get_user_dir():
    return USER_DIR

# --- Utility Functions ---
def ensure_dir(path):
    """
    Ensures that a directory exists. If not, it creates the directory.
    """
    if not os.path.exists(path):
        os.makedirs(path)

def _pluralize(word):
    """A simple pluralizer for English words."""
    if not word:
        return ""
    if word.endswith('y') and len(word) > 1 and word[-2] not in 'aeiou':
        return word[:-1] + 'ies'
    if word.endswith(('s', 'x', 'z')) or word.endswith(('ch', 'sh')):
        return word + 'es'
    return word + 's'

def get_item_dir(item_type):
    """
    Constructs the absolute path to the directory for a given item type
    based on the new convention (Title_Case_Underscored, Plural).
    """
    if item_type.lower() == 'person':
        dir_name = 'people'
    else:
        words = item_type.lower().split('_')
        words[-1] = _pluralize(words[-1])
        dir_name = '_'.join(words)
    return os.path.join(ROOT_DIR, "User", dir_name)

def get_item_path(item_type, name):
    """
    Constructs the absolute path to an item's YAML file.
    Sanitizes the name for use in filenames.
    """
    item_dir = get_item_dir(item_type)
    sanitized_name = name.lower().replace('&', 'and').replace(':', '-') # Convert to lowercase and replace '&' with 'and', and colons with hyphens
    return os.path.join(item_dir, f"{sanitized_name}.yml")

def read_item_data(item_type, name):
    """
    Reads and parses the YAML data of a specific item.
    """
    path = get_item_path(item_type, name)
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8') as f:
        raw_data = yaml.safe_load(f) or {}
        data = {k.lower(): v for k, v in raw_data.items()}
    return data

def write_item_data(item_type, name, data):
    """
    Writes the given data to an item's YAML file.
    """
    path = get_item_path(item_type, name)
    ensure_dir(os.path.dirname(path))
    with open(path, 'w', encoding='utf-8') as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True)

def list_all_items(item_type):
    """
    Lists all items of a given type.
    """
    item_dir = get_item_dir(item_type)
    if not os.path.exists(item_dir):
        return []
    files = [f for f in os.listdir(item_dir) if f.endswith(".yml")]
    items_data = []
    for f in files:
        path = os.path.join(item_dir, f)
        try:
            with open(path, 'r', encoding='utf-8') as item_file:
                data = yaml.safe_load(item_file) or {}
                items_data.append(data)
        except Exception as e:
            print(f"⚠️ Could not read {f}: {e}")
    return items_data

def get_filtered_items(item_type):
    """
    Retrieves all items of a given type and applies the active filter.
    """
    all_items = list_all_items(item_type)
    return FilterManager.apply_filter(all_items)

def delete_item(item_type, name):
    """
    Deletes an item's YAML file.
    """
    path = get_item_path(item_type, name)
    with open("debug_delete.txt", "a") as f:
        f.write(f"Attempting to delete: {path}\n")
    if not os.path.exists(path):
        with open("debug_delete.txt", "a") as f:
            f.write(f"File not found: {path}\n")
        return False
    os.remove(path)
    with open("debug_delete.txt", "a") as f:
        f.write(f"Successfully deleted: {path}\n")
    return True

# --- Command Dispatcher ---
def dispatch_command(command_name, item_type, item_name, text_to_append, properties):
    """
    Dispatches a command to the appropriate item-specific module or a generic handler.
    """
    module_name_capitalized = '_'.join(word.capitalize() for word in item_type.split('_'))
    module_path = os.path.join(ROOT_DIR, "Modules", module_name_capitalized, "main.py")
    module = None
    if os.path.exists(module_path):
        spec = importlib.util.spec_from_file_location(f"chronos_module.{module_name_capitalized}", module_path)
        module = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(module)
        except Exception as e:
            with open("debug_delete.txt", "a") as f:
                f.write(f"Error loading module {module_path}: {e}\n")
            module = None

    if module and hasattr(module, "handle_command"):
        # This module uses the generic handle_command function
        getattr(module, "handle_command")(command_name, item_type, item_name, text_to_append, properties)
    elif module:
        # This module uses the specific handle_<command> functions
        handler_name = f"handle_{command_name}"
        if hasattr(module, handler_name):
            handler = getattr(module, handler_name)
            with open("debug_delete.txt", "a") as f:
                f.write(f"dispatch_command: Calling handler {handler_name} in module {item_type}\n")
            handler(item_name, properties)
        else:
            print(f"❌ Command '{command_name}' not supported by module '{item_type}'.")
    else:
        if command_name == "new":
            generic_handle_new(item_type, item_name, properties)
        elif command_name == "append":
            generic_handle_append(item_type, item_name, text_to_append, properties)
        elif command_name == "delete":
            generic_handle_delete(item_type, item_name, properties)
        else:
            print(f"❌ No handler for command '{command_name}' in module '{item_type}' and no generic handler exists.")

# --- Generic Command Handlers ---
def generic_handle_new(item_type, item_name, properties):
    """
    Generic handler for the 'new' command.
    """
    default_properties = {}
    settings_dir = get_item_dir('setting')
    # Resolve defaults file with flexible naming (lowercase preferred)
    def _candidates():
        # lowercase preferred
        yield os.path.join(settings_dir, f"{item_type}_defaults.yml")
        yield os.path.join(settings_dir, f"{item_type}_Defaults.yml")
        # TitleCase variants
        yield os.path.join(settings_dir, f"{item_type.capitalize()}_Defaults.yml")
        yield os.path.join(settings_dir, f"{'_'.join(w.capitalize() for w in item_type.split('_'))}_Defaults.yml")
    default_file_path = None
    for p in _candidates():
        if os.path.exists(p):
            default_file_path = p
            break
    if default_file_path:
        with open(default_file_path, 'r', encoding='utf-8') as f:
            default_properties = yaml.safe_load(f) or {}

    now = datetime.now()
    placeholders = {
        "{{timestamp}}": now.strftime("%Y-%m-%d_%H-%M-%S"),
        "{{tomorrow}}": (now + timedelta(days=1)).strftime("%Y-%m-%d"),
    }

    content = {k.lower().replace('default_', ''): v for k, v in default_properties.items()}
    content['name'] = item_name
    content['duration'] = 0 # Default duration to 0

    for key, value in content.items():
        if isinstance(value, str):
            for placeholder, replacement in placeholders.items():
                value = value.replace(placeholder, replacement)
            content[key] = value

    normalized_properties = {k.lower(): v for k, v in properties.items()}
    # Set default recurrence for alarms and reminders if not provided
    if item_type in ["alarm", "reminder"] and 'recurrence' not in normalized_properties:
        content['recurrence'] = ["daily"]

    content.update(normalized_properties)
    content['type'] = item_type

    write_item_data(item_type, item_name, content)
    print(f"✨ Created new {item_type}: {item_name}.yml")

def generic_handle_append(item_type, item_name, text_to_append, properties):
    """
    Generic handler for the 'append' command.
    """
    data = read_item_data(item_type, item_name)
    if not data:
        print(f"❌ {item_type.capitalize()} '{item_name}' does not exist.")
        return

    current = data.get("content", "")
    if current:
        data["content"] = current + "\n" + text_to_append
    else:
        data["content"] = text_to_append
    data.update({k.lower(): v for k, v in properties.items()})

    write_item_data(item_type, item_name, data)
    print(f"🔧 Appended to {item_type}: {item_name}.yml")

def generic_handle_delete(item_type, item_name, properties):
    """
    Generic handler for the 'delete' command.
    """
    force = properties.get("force", False)
    with open("debug_delete.txt", "a") as f:
        f.write(f"generic_handle_delete: item_type={item_type}, item_name={item_name}, force={force}\n")
    if not force:
        confirm = input(f"⚠️ Are you sure you want to delete '{item_name}'? (y/n): ").strip().lower()
        if confirm not in {"y", "yes"}:
            print("❌ Deletion cancelled.")
            return

    if delete_item(item_type, item_name):
        print(f"🗑️ Deleted {item_type}: {item_name}.yml")
    else:
        print(f"❌ {item_type.capitalize()} '{item_name}' does not exist.")

# --- Editor Management ---
def get_editor_command(properties):
    """
    Determines the editor command to use based on properties, config, or environment variables.
    """
    settings_dir = get_item_dir('setting')
    chosen_editor = None

    if 'editor' in properties:
        chosen_editor = properties['editor']
    else:
        config_path = os.path.join(settings_dir, "Config.yml")
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)
                if config and 'default_editor' in config:
                    chosen_editor = config['default_editor']

        if not chosen_editor:
            chosen_editor = os.environ.get('EDITOR') or os.environ.get('VISUAL')

        if not chosen_editor:
            chosen_editor = "notepad.exe"

    return chosen_editor

def open_item_in_editor(item_type, name, editor_command):
    """
    Opens an item's YAML file in the specified editor.
    """
    path = get_item_path(item_type, name)
    if not os.path.exists(path):
        print(f"❌ {item_type.capitalize()} '{name}' does not exist.")
        return

    if not editor_command:
        print("❌ No editor found. Please specify an editor using 'editor:<editor_name>' property...")
        return

    try:
        print(f"Attempting to open '{name}.yml' with '{editor_command}'...")
        subprocess.run([editor_command, path], check=True)
        print(f"✅ Opened {item_type} '{name}.yml' in {editor_command}.")
    except FileNotFoundError:
        print(f"❌ Editor '{editor_command}' not found. Please ensure it's in your PATH.")
    except Exception as e:
        print(f"❌ An error occurred while opening the editor: {e}")
