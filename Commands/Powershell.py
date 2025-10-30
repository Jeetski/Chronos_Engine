import subprocess
import sys
import os

# --- Command Definition ---
def run(args, properties):
    """
    Executes PowerShell code provided as arguments.
    """
    if not args:
        print(get_help_message())
        return

    # Join all arguments to form the PowerShell command string
    powershell_command = ' '.join(args)

    # Construct the full command to execute in PowerShell
    # We use -Command "& { ... }" to ensure the command is executed as a script block
    # and to allow setting $OutputEncoding for the duration of the command.
    full_ps_command = f"powershell.exe -NoProfile -Command \"& {{ [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; {powershell_command} }}\""

    try:
        # Execute the PowerShell command
        # Set PYTHONIOENCODING for the subprocess to ensure correct encoding handling
        env = os.environ.copy()
        env['PYTHONIOENCODING'] = 'utf-8'

        result = subprocess.run(
            full_ps_command,
            shell=True,
            capture_output=True,
            text=True, # Decode stdout/stderr as text
            encoding='utf-8', # Explicitly set encoding for subprocess communication
            env=env
        )

        if result.stdout:
            print(result.stdout.strip())
        if result.stderr:
            print(f"❌ PowerShell Error:\n{result.stderr.strip()}")

    except FileNotFoundError:
        print("❌ powershell.exe not found. Ensure PowerShell is installed and in your system's PATH.")
    except Exception as e:
        print(f"❌ An unexpected error occurred: {e}")

def get_help_message():
    return """
Usage: powershell <powershell_code>
Description: Executes the provided PowerShell code.
Example: powershell Get-Process | Select-Object -First 3
Example: powershell Write-Host \"Hello from PowerShell!\"
"""
