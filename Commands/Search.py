
import os
import yaml
from Modules.ItemManager import USER_DIR, ROOT_DIR

def run(args, properties):
    """
    Handles the 'search' command.
    search <query> -> searches all files in User directory
    search type:<type> <query> -> searches only specific item type folders (e.g. type:note)
    """
    if len(args) < 1:
        print(get_help_message())
        return

    query = ""
    target_type = None

    # Parse args
    for arg in args:
        if arg.lower().startswith("type:"):
            target_type = arg.split(":", 1)[1].lower()
        else:
            query = arg
            # Support multi-word query if user didn't quote?
            # Actually args are usually split by space. If multiple args remain, join them.
            # But let's assume we handle the list of args.
    
    # Reconstruct query from remaining args if needed
    if not query:
         # Filter out type: arg and join the rest
         query_parts = [a for a in args if not a.lower().startswith("type:")]
         query = " ".join(query_parts)

    if not query:
        print("Error: No search query provided.")
        return

    print(f"🔎 Searching for '{query}'...")
    
    search_root = USER_DIR
    if target_type:
        # Try to resolve folder for type
        from Modules.ItemManager import get_item_dir
        # This handles pluralization logic
        search_root = get_item_dir(target_type)
        if not os.path.exists(search_root):
             print(f"Warning: Directory for type '{target_type}' not found ({search_root}). Searching global User dir instead.")
             search_root = USER_DIR

    results_found = 0
    
    # Walk directory
    for root, dirs, files in os.walk(search_root):
        # Skip Backups and Archive to avoid noise?
        # User might want to search archive. But definitely skip Backups (zips) and .git
        if "Backups" in root or ".git" in root or "__pycache__" in root:
            continue
            
        for file in files:
            if not file.endswith(('.yml', '.yaml', '.txt', '.md', '.chs')):
                continue
                
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    
                if query.lower() in content.lower():
                    results_found += 1
                    rel_path = os.path.relpath(path, ROOT_DIR)
                    print(f"\n📄 {rel_path}")
                    
                    # Show context snippet
                    lines = content.splitlines()
                    for i, line in enumerate(lines):
                        if query.lower() in line.lower():
                            # Print trimmed line with line number
                            print(f"  {i+1}: {line.strip()[:100]}")
                            # Limit to first 3 matches per file to avoid spam
                            if i > 20: 
                                print("  ...")
                                break
                                
            except Exception:
                pass

    if results_found == 0:
        print("No matches found.")
    else:
        print(f"\nFound matches in {results_found} files.")

def get_help_message():
    return """
Usage:
  search <query>
  search type:<type> <query>

Description:
  Searches for a text string within all text files in the User directory.
  Ignores Backups.
  
Example:
  search "urgent meeting"
  search type:note "idea"
"""
