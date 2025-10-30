import os
import importlib.util

# Determine the root directory of the Chronos Engine project
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
COMMANDS_DIR = os.path.join(ROOT_DIR, "Commands")

# --- Command Definition ---
def run(args, properties):
    """
    Displays help messages for available commands.
    """
    if not args:
        # Display help for all commands
        print("\nChronos Engine Commands")
        print("──────────────────────────────")
        command_files = [f for f in os.listdir(COMMANDS_DIR) if f.endswith(".py") and f != "__init__.py" and f != "Help.py"]
        # Case-insensitive alphabetical ordering
        command_files = sorted(command_files, key=lambda s: s.lower())
        for command_file in command_files:
            command_name = command_file[:-3]
            try:
                spec = importlib.util.spec_from_file_location(command_name, os.path.join(COMMANDS_DIR, command_file))
                command_module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(command_module)
                if hasattr(command_module, "get_help_message"):
                    print(f"\nCommand: {command_name}")
                    print(command_module.get_help_message())
                else:
                    print(f"\nCommand: {command_name}")
                    print("Description: No help message available.")
            except Exception as e:
                print(f"\nCommand: {command_name}")
                print(f"Description: Error loading help message: {e}")
        print(f"\nCommand: help")
        print(get_help_message())
        print("──────────────────────────────\n")
    else:
        # Display help for a specific command
        command_name = args[0].lower()
        command_file = f"{command_name.capitalize()}.py"
        command_path = os.path.join(COMMANDS_DIR, command_file)
        if not os.path.exists(command_path):
            # try lowercase
            command_file = f"{command_name}.py"
            command_path = os.path.join(COMMANDS_DIR, command_file)

        if os.path.exists(command_path):
            try:
                spec = importlib.util.spec_from_file_location(command_name, command_path)
                command_module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(command_module)
                if hasattr(command_module, "get_help_message"):
                    print(f"\nCommand: {command_name}")
                    print(command_module.get_help_message())
                else:
                    print(f"\nCommand: {command_name}")
                    print("Description: No help message available.")
            except Exception as e:
                print(f"\nCommand: {command_name}")
                print(f"Description: Error loading help message: {e}")
        else:
            print(f"Error: Command '{command_name}' not found.")

def get_help_message():
    return """
Usage: help
Description: Displays this help message, listing all available commands and their usage.
"""
