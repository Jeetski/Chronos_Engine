
import os
from Modules.Console import execute_script, ROOT_DIR

def run(args, properties):
    """
    Handles the 'run' command.
    run <script_name_or_path>
    """
    if not args:
        print(get_help_message())
        return

    script_name = args[0]
    
    # Try direct path
    path = os.path.abspath(script_name)
    if os.path.isfile(path):
         execute_script(path)
         return
         
    # Try inside ROOT_DIR
    path = os.path.join(ROOT_DIR, script_name)
    if os.path.isfile(path):
        execute_script(path)
        return
        
    # Try inside Scripts/
    path = os.path.join(ROOT_DIR, "Scripts", script_name)
    if os.path.isfile(path):
        execute_script(path)
        return

    # Try .chs extension
    if not script_name.endswith('.chs'):
        script_name += '.chs'
        
        # Retry with extension
        path = os.path.abspath(script_name)
        if os.path.isfile(path):
             execute_script(path)
             return
             
        path = os.path.join(ROOT_DIR, script_name)
        if os.path.isfile(path):
            execute_script(path)
            return

        path = os.path.join(ROOT_DIR, "Scripts", script_name)
        if os.path.isfile(path):
            execute_script(path)
            return

    print(f"❌ Script '{args[0]}' not found.")

def get_help_message():
    return """
Usage:
  run <script_file>

Description:
  Executes a Chronos Script (.chs) file.
  Searches in current directory, project root, and Scripts/ folder.
  
Example:
  run my_script.chs
  run test_safety
"""
