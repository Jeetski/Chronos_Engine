import sys

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'pause' command, pausing script execution until a key is pressed.
    An optional message can be displayed.
    """
    message = "Press any key to continue..."
    if args:
        message = ' '.join(args)
    
    input(message)

def get_help_message():
    return """
Usage: pause [message]
Description: Pauses script execution until a key is pressed. Displays an optional message.
Example: pause
Example: pause Script paused. Press Enter to proceed.
"""