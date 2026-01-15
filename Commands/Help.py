import os
import importlib.util

# Determine the root directory of the Chronos Engine project
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
COMMANDS_DIR = os.path.join(ROOT_DIR, "Commands")


def run(args, properties):
    """
    Displays help messages for available commands.
    """
    if not args:
        # Display help for all commands
        print("\nChronos Engine Commands")
        print("=" * 60)
        command_files = [
            f for f in os.listdir(COMMANDS_DIR)
            if f.endswith(".py") and f not in {"__init__.py", "Help.py"}
        ]
        command_files = sorted(command_files, key=lambda s: s.lower())
        for command_file in command_files:
            command_name = command_file[:-3]
            try:
                spec = importlib.util.spec_from_file_location(command_name, os.path.join(COMMANDS_DIR, command_file))
                command_module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(command_module)
                print(f"\nCommand: {command_name}")
                if hasattr(command_module, "get_help_message"):
                    print(command_module.get_help_message())
                else:
                    print("Description: No help message available.")
            except Exception as e:
                print(f"\nCommand: {command_name}")
                print(f"Description: Error loading help message: {e}")
        print(f"\nCommand: help")
        print(get_help_message())
        print("=" * 60 + "\n")
    else:
        # Display help for a specific command
        command_name = args[0].lower()
        # Try both Title and lowercase for flexibility
        candidates = [f"{command_name.capitalize()}.py", f"{command_name}.py"]
        command_path = None
        for fn in candidates:
            p = os.path.join(COMMANDS_DIR, fn)
            if os.path.exists(p):
                command_path = p
                break
        if command_path:
            try:
                spec = importlib.util.spec_from_file_location(command_name, command_path)
                command_module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(command_module)
                print(f"\nCommand: {command_name}")
                if hasattr(command_module, "get_help_message"):
                    print(command_module.get_help_message())
                else:
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

