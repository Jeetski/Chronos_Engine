
import os
import subprocess
from Modules.Console import ROOT_DIR

DOCS_DIR = os.path.join(ROOT_DIR, "Docs")

def run(args, properties):
    """
    Handles the 'docs' command.
    docs -> opens Docs/ folder
    docs <topic> -> opens Docs/<topic>.md
    """
    target = args[0] if args else None
    
    path_to_open = DOCS_DIR
    
    if target:
        # Try finding the file
        candidates = [
            os.path.join(DOCS_DIR, target),
            os.path.join(DOCS_DIR, f"{target}.md"),
            os.path.join(DOCS_DIR, f"{target}.txt"),
        ]
        
        found = False
        for p in candidates:
            if os.path.exists(p):
                path_to_open = p
                found = True
                break
        
        if not found:
            print(f"❌ Documentation for '{target}' not found.")
            print("Opening Docs folder instead...")

    print(f"Opening: {path_to_open}")
    try:
        if os.name == 'nt':
            os.startfile(path_to_open)
        elif sys.platform == 'darwin':
            subprocess.Popen(['open', path_to_open])
        else:
            subprocess.Popen(['xdg-open', path_to_open])
    except Exception as e:
        print(f"Error opening file: {e}")

def get_help_message():
    return """
Usage:
  docs [topic]

Description:
  Opens the Chronos documentation in your default viewer.
  If no topic is provided, opens the Docs folder.

Example:
  docs agents
  docs architecture
"""
