import subprocess
import sys
import os

# --- Command Definition ---
def run(args, properties):
    """
    Executes a command-line (CMD) command.
    """
    if not args:
        print(get_help_message())
        return

    # Join all arguments to form the CMD command string
    cmd_command = ' '.join(args)

    try:
        # Execute the CMD command
        # Set PYTHONIOENCODING for the subprocess to ensure correct encoding handling
        env = os.environ.copy()
        env['PYTHONIOENCODING'] = 'utf-8'

        result = subprocess.run(
            cmd_command,
            shell=True,
            capture_output=True,
            text=True,  # Decode stdout/stderr as text
            encoding='utf-8',  # Explicitly set encoding for subprocess communication
            env=env
        )

        if result.stdout:
            print(result.stdout.strip())
        if result.stderr:
            print(f"❌ CMD Error:\n{result.stderr.strip()}")

    except FileNotFoundError:
        print("❌ Command not found. Ensure the command is in your system's PATH.")
    except Exception as e:
        print(f"❌ An unexpected error occurred: {e}")

def get_help_message():
    return """
Usage: cmd <command>
Description: Executes the provided command-line (CMD) command.
Example: cmd dir
Example: cmd echo Hello from CMD!
"""

