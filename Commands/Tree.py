
import os
import yaml
from Modules.ItemManager import read_item_data, get_item_path
from Modules.ItemManager import USER_DIR

def run(args, properties):
    """
    Handles the 'tree' command.
    tree <type> <name> -> visuals nested item structure
    tree dir <path> -> visualizes directory structure
    """
    if len(args) < 2:
        print(get_help_message())
        return

    target_type = args[0].lower()
    target_name = args[1] # Can be item name or path if type is 'dir'

    if target_type == "dir":
        # Check relative to User dir for safety
        path = os.path.join(USER_DIR, target_name)
        if not os.path.exists(path):
            print(f"Directory not found: {path}")
            return
        print(f"📂 {os.path.basename(path)}")
        print_dir_tree(path)
    else:
        # Item tree
        item_data = read_item_data(target_type, target_name)
        if not item_data:
            print(f"Item not found: {target_type} '{target_name}'")
            return
        
        print(f"📦 {item_data.get('name', target_name)} ({target_type})")
        # Check for children keys: children, tasks, milestones, subroutines, etc.
        # We'll use a generic approach looking for list-of-dicts or list-of-strings
        print_item_tree(item_data)

def print_dir_tree(path, prefix=""):
    try:
        entries = sorted(os.listdir(path))
    except PermissionError:
        return
        
    entries = [e for e in entries if not e.startswith('.')] # skip hidden
    
    for i, entry in enumerate(entries):
        is_last = (i == len(entries) - 1)
        connector = "└── " if is_last else "├── "
        full_path = os.path.join(path, entry)
        
        print(f"{prefix}{connector}{entry}")
        
        if os.path.isdir(full_path):
            extension = "    " if is_last else "│   "
            print_dir_tree(full_path, prefix + extension)

def print_item_tree(item_data, prefix="", visited=None):
    if visited is None:
        visited = set()
    
    # Avoid infinite recursion
    item_id = f"{item_data.get('type')}:{item_data.get('name')}"
    if item_id in visited:
        print(f"{prefix}└── [Recursive: {item_data.get('name')}]")
        return
    visited.add(item_id)

    # Gather children from known keys
    children = []
    
    # 1. explicit children list (Template Builder style)
    if "children" in item_data and isinstance(item_data["children"], list):
        children.extend(item_data["children"])
        
    # 2. specific keys common in Chronos
    for key in ["tasks", "milestones", "subroutines", "microroutines", "items"]:
        if key in item_data and isinstance(item_data[key], list):
             for child in item_data[key]:
                 if isinstance(child, str):
                     # Likely just a name, or specific format like "Task: Name"
                     # Try to resolve type info if possible, or just treat as generic child
                     if ":" in child:
                         c_type, c_name = child.split(":", 1)
                         children.append({"type": c_type.strip(), "name": c_name.strip()})
                     else:
                         # Use key as type hint (tasks -> task)
                         type_hint = key[:-1] if key.endswith('s') else key
                         children.append({"type": type_hint, "name": child})
                 elif isinstance(child, dict):
                     children.append(child)

    # 3. inventory items, seeds, etc
    if "inventory_items" in item_data:
        for child in item_data["inventory_items"]:
             children.append({"type": "inventory_item", "name": child})

    # Render
    for i, child in enumerate(children):
        is_last = (i == len(children) - 1)
        connector = "└── " if is_last else "├── "
        
        c_name = child.get("name", "Unknown")
        c_type = child.get("type", "item")
        
        # Try to resolve full data for nested visualization
        c_data = read_item_data(c_type, c_name)
        
        lbl = f"{c_name} ({c_type})"
        # Add quick status info if available
        if c_data and "status" in c_data:
            lbl += f" [{c_data['status']}]"
            
        print(f"{prefix}{connector}{lbl}")
        
        # Recurse if we found the item data
        if c_data:
            extension = "    " if is_last else "│   "
            print_item_tree(c_data, prefix + extension, visited.copy())

def get_help_message():
    return """
Usage:
  tree <type> <name>
  tree dir <path>

Description:
  Visualizes the hierarchy of an item (routines, projects) or a directory.
  
Example:
  tree routine "Morning Core"
  tree project "My Game"
  tree dir User/Tasks
"""
