import sys

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'echo' command, printing its arguments to the console.
    """
    print(' '.join(args))

def get_help_message():
    return """
Usage: echo <text_to_print>
Description: Prints the provided text to the console.
Example: echo Hello, World!
"""