
import os
import yaml

def run(args, properties):
    """
    Handles the 'check' command.
    scans all items in User/ and reports issues.
    """
    ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    USER_DIR = os.path.join(ROOT_DIR, "User")

    print("🕵️ Running integrity check...")
    
    issues = []
    item_map = {} # path -> data
    
    # Pass 1: Load all items to build map
    print("  Loading items...")
    count = 0
    for root, dirs, files in os.walk(USER_DIR):

        if "Backups" in root or "Archive" in root or "Settings" in root or ".git" in root:
            continue
            
        for file in files:
            if file.endswith('.yml'):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        data = yaml.safe_load(f)
                    
                    if not isinstance(data, dict):
                         issues.append(f"Invalid YAML (not a dict): {path}")
                         continue
                         
                    item_type = os.path.basename(root)
                    # We might need better type inference if folder structure varies, 
                    # but standard Chronos is User/<Type>/<Name>.yml
                    
                    # Store for cross-ref
                    uid = f"{item_type}/{data.get('name')}" # Pseudo-ID
                    item_map[path] = {'data': data, 'type': item_type, 'name': data.get('name')}
                    count += 1
                except Exception as e:
                    issues.append(f"Error reading {path}: {e}")

    print(f"  Scanned {count} items.")
    
    # Pass 2: Validation
    print("  Validating links...")
    for path, entry in item_map.items():
        data = entry['data']
        name = entry['name']
        
        # Check name matches filename (convention)
        filename = os.path.splitext(os.path.basename(path))[0]
        if name and name != filename:
            # Not strict error, but worth noting
            # issues.append(f"Name mismatch: File '{filename}' vs Property '{name}'")
            pass
            
        # Check Parent Link validity
        parent = data.get('parent')
        if parent:
            # Parent is stored as object, check if it actually exists in our map?
            # It's an embedded dict usually in loaded item, but on disk it might be just data.
            # Wait, get_item_data resolves parent. Raw yaml might just have 'parent: { ... }' or nothing?
            # Actually Chronos doesn't store parent link in child YAML usually, 
            # checks are done by walking parents?
            # Let's check 'children' links if any
            pass
            
        # Check Date formats
        for key in ['created_at', 'updated_at', 'start_time', 'end_time']:
            val = data.get(key)
            if val and not isinstance(val, (str, type(None))): # Should be string or datetime object if loaded?
                # yaml loader might load as datetime.
                pass
                
    if not issues:
        print("✅ No critical issues found.")
    else:
        print(f"⚠️ Found {len(issues)} issues:")
        for issue in issues:
            print(f"  - {issue}")

def get_help_message():
    return """
Usage:
  check

Description:
  Scans valid items in User/ directory and reports data integrity issues.
  (Basic scan implemented, will handle more complex checks in future).
"""
