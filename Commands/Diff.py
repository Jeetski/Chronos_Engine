
import os
import difflib
import yaml
from Modules.ItemManager import read_item_data, get_item_path

def run(args, properties):
    """
    Handles the 'diff' command.
    diff <type> <name1> <name2> -> compares two items of the same type.
    diff file <path1> <path2> -> compares two files.
    """
    if len(args) < 3:
        print(get_help_message())
        return

    mode = args[0].lower()
    
    if mode == "file":
        path1 = args[1]
        path2 = args[2]
        diff_files(path1, path2)
    else:
        # Item comparison
        item_type = mode # First arg is type (e.g., 'task')
        name1 = args[1]
        name2 = args[2]
        diff_items(item_type, name1, name2)

def diff_files(path1, path2):
    if not os.path.exists(path1):
        print(f"Error: File '{path1}' not found.")
        return
    if not os.path.exists(path2):
        print(f"Error: File '{path2}' not found.")
        return
        
    try:
        with open(path1, 'r', encoding='utf-8') as f1, open(path2, 'r', encoding='utf-8') as f2:
            lines1 = f1.readlines()
            lines2 = f2.readlines()
            
        print_diff(lines1, lines2, path1, path2)
    except Exception as e:
        print(f"Error diffing files: {e}")

def diff_items(item_type, name1, name2):
    item1 = read_item_data(item_type, name1)
    if not item1:
        print(f"Error: {item_type} '{name1}' not found.")
        return

    item2 = read_item_data(item_type, name2)
    if not item2:
        print(f"Error: {item_type} '{name2}' not found.")
        return
        
    # Convert to YAML strings for line-by-line diff
    # Sort keys for consistent comparison
    yaml1 = yaml.dump(item1, default_flow_style=False, sort_keys=True).splitlines(keepends=True)
    yaml2 = yaml.dump(item2, default_flow_style=False, sort_keys=True).splitlines(keepends=True)
    
    print_diff(yaml1, yaml2, f"{item_type}:{name1}", f"{item_type}:{name2}")

def print_diff(lines1, lines2, label1, label2):
    print(f"Comparing {label1} vs {label2}")
    print("-" * 40)
    
    diff = difflib.unified_diff(
        lines1, lines2,
        fromfile=label1, tofile=label2,
        lineterm=''
    )
    
    has_diff = False
    for line in diff:
        has_diff = True
        if line.startswith('+'):
            print(f"\033[92m{line.rstrip()}\033[0m") # Green
        elif line.startswith('-'):
            print(f"\033[91m{line.rstrip()}\033[0m") # Red
        elif line.startswith('^'):
            print(f"\033[94m{line.rstrip()}\033[0m") # Blue (headers)
        else:
            print(line.rstrip())
            
    if not has_diff:
        print("Files are identical.")

def get_help_message():
    return """
Usage:
  diff <type> <name1> <name2>
  diff file <path1> <path2>

Description:
  show differences between two items or two files.
  
Example:
  diff routine "Morning A" "Morning B"
  diff file User/Settings/Points.yml User/Settings/Points.bak
"""
