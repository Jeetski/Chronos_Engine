import os

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'cls' command, clearing the terminal screen.
    Detects the operating system to use the appropriate clear command.
    """
    # For Windows
    if os.name == 'nt':
        _ = os.system('cls')
    # For macOS and Linux (where os.name is 'posix')
    else:
        _ = os.system('clear')

def get_help_message():
    return """
Usage: cls
Description: Clears the terminal screen.
Example: cls
"""
