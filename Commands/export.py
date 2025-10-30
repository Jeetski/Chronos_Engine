
import sys
import os
import io
import yaml
import zipfile
import time

# This is a bit of a hack, but it's the cleanest way to access the run_command function
# without creating circular dependencies.
from Modules.Console import run_command, parse_input

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
USER_DIR = os.path.join(ROOT_DIR, "User")
EXPORTS_DIR = os.path.join(USER_DIR, "Exports")

def run(args, properties):
    """
    Handles the 'export' command.
    """
    # Mode A: export all → zip entire User folder
    if args and str(args[0]).lower() == 'all':
        # Syntax: export all [filename.zip]
        if len(args) >= 2:
            zip_name = args[1]
        else:
            ts = time.strftime('%Y%m%d_%H%M%S')
            zip_name = f'chronos_user_backup_{ts}.zip'
        if not zip_name.lower().endswith('.zip'):
            zip_name += '.zip'
        os.makedirs(EXPORTS_DIR, exist_ok=True)
        out_path = os.path.join(EXPORTS_DIR, zip_name)
        # Create zip with paths relative to ROOT_DIR so contents include 'User/...'
        with zipfile.ZipFile(out_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
            for folder, _dirs, files in os.walk(USER_DIR):
                for fname in files:
                    abs_path = os.path.join(folder, fname)
                    arc = os.path.relpath(abs_path, ROOT_DIR)
                    zf.write(abs_path, arc)
        print(f"Exported full user data to {out_path}")
        return

    # Mode B: export table output to YAML (existing behavior)
    if len(args) < 2:
        print(get_help_message())
        return

    filename = args[0]
    command_to_execute = args[1:]

    # Ensure the User/Exports directory exists
    if not os.path.exists(EXPORTS_DIR):
        os.makedirs(EXPORTS_DIR)

    # 1. Redirect stdout
    old_stdout = sys.stdout
    sys.stdout = captured_output = io.StringIO()

    # 2. Execute the command
    command_name, command_args, command_properties = parse_input(command_to_execute)
    run_command(command_name, command_args, command_properties)

    # 3. Restore stdout
    sys.stdout = old_stdout

    # 4. Get the captured output
    output_str = captured_output.getvalue()

    # 5. Parse the table output back into a list of dictionaries
    lines = output_str.strip().split('\n')
    if len(lines) < 3:
        print("Error: The command did not produce any data to export.")
        return

    headers = [h.strip() for h in lines[0].split('|')]
    data = []
    for line in lines[2:]:
        values = [v.strip() for v in line.split('|')]
        data.append(dict(zip(headers, values)))

    if not filename.endswith('.yml'):
        filename += '.yml'
    file_path = os.path.join(EXPORTS_DIR, filename)
    with open(file_path, 'w') as f:
        yaml.dump(data, f, default_flow_style=False)

    print(f"Successfully exported data to {file_path}")

def get_help_message():
    return """
Usage:
  export all [filename.zip]
  export <filename> <command> [args...]

Description:
  export all: Zips the entire User/ directory into User/Exports/[filename].zip.
  export filename: Executes a command and saves its table output to YAML in User/Exports/.

Example:
  export all chronos_backup.zip
  export my_tasks.yml list tasks priority:high
"""
