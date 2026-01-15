
import os
import yaml
import zipfile
from Modules.ItemManager import read_item_data, write_item_data

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def run(args, properties):
    """
    Handles the 'import' command.
    """
    if len(args) < 1 or (args and str(args[0]).lower() in {"help", "-h", "--help"}):
        print(get_help_message())
        return

    file_path_arg = args[0]
    
    # Check if the file exists
    if not os.path.exists(file_path_arg):
        # If not, try to find it in the User/Exports directory
        file_path = os.path.join(ROOT_DIR, "User", "Exports", file_path_arg)
        if not os.path.exists(file_path):
            print(f"Error: File not found at '{file_path_arg}' or in 'User/Exports/'.")
            return
    else:
        file_path = file_path_arg

    # Mode A: Import a full backup zip
    if file_path.lower().endswith('.zip'):
        overwrite = False
        mode = (properties.get('mode') if isinstance(properties, dict) else None) or None
        if isinstance(properties, dict):
            if properties.get('overwrite') is True or str(mode).lower() == 'overwrite':
                overwrite = True
        try:
            user_dir = os.path.join(ROOT_DIR, 'User')
            with zipfile.ZipFile(file_path, 'r') as zf:
                # Decide extraction base: if archive contains 'User/...', extract to ROOT_DIR; else to User/
                names = zf.namelist()
                contains_user_root = any(n.startswith('User/') or n.startswith('User\\') for n in names)
                base = ROOT_DIR if contains_user_root else user_dir
                base = os.path.abspath(base)
                for member in names:
                    # Skip directories
                    if member.endswith('/') or member.endswith('\\'):
                        continue
                    # Compute safe destination path
                    dest = os.path.abspath(os.path.join(base, member)) if contains_user_root else os.path.abspath(os.path.join(base, member))
                    # Path traversal guard
                    if not dest.startswith(base):
                        continue
                    # Ensure directory exists
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    if not overwrite and os.path.exists(dest):
                        # Skip existing
                        continue
                    with zf.open(member, 'r') as src, open(dest, 'wb') as out:
                        out.write(src.read())
            print(f"Imported backup from '{file_path}' into '{base}'.")
        except Exception as e:
            print(f"Error importing backup: {e}")
        return

    # Mode B: Import list of items from YAML (existing behavior)
    # Read the YAML file
    try:
        with open(file_path, 'r') as f:
            data_to_import = yaml.safe_load(f)
    except Exception as e:
        print(f"Error reading or parsing YAML file: {e}")
        return

    if not isinstance(data_to_import, list):
        print("Error: The YAML file must contain a list of items.")
        return

    created_count = 0
    skipped_count = 0

    for item in data_to_import:
        item_type = item.get('type')
        item_name = item.get('name')

        if not item_type or not item_name:
            print(f"Warning: Skipping item with missing 'type' or 'name'. Item: {item}")
            skipped_count += 1
            continue

        # Check if the item already exists
        if read_item_data(item_type, item_name) is not None:
            print(f"Skipping existing item: {item_type} '{item_name}'")
            skipped_count += 1
            continue

        # Create the new item
        write_item_data(item_type, item_name, item)
        created_count += 1

    print(f"\nImport complete.")
    print(f"- {created_count} new items created.")
    print(f"- {skipped_count} items skipped (already exist or missing data).")

def get_help_message():
    return """
Usage:
  import <file_path>

Description:
  - If <file_path> ends with .zip, extracts the backup into the User/ directory.
    Use property overwrite:true or mode:overwrite to overwrite existing files.
  - If <file_path> is a YAML list, imports items (skips if already exist).

Example:
  import User/Exports/my_tasks.yml
  import User/Exports/chronos_backup.zip overwrite:true
"""
