import sys
from Modules.ItemManager import list_all_items
from Modules.Console import run_command, parse_input

def _depluralize(word):
    """A simple de-pluralizer for English words."""
    if not word:
        return ""
    if word.lower() == 'people':
        return 'person'
    # Handle words ending in 'ies'
    if word.endswith('ies'):
        return word[:-3] + 'y'
    # Handle words ending in 's' (general case)
    if word.endswith('s') and not word.endswith('ss'): # Avoid de-pluralizing words like 'boss'
        return word[:-1]
    return word

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'list' command by filtering and sorting items directly.
    Also supports piping results to another command using 'then'.
    """
    if len(args) < 1:
        print(get_help_message())
        return

    # Check for 'then' keyword to separate list arguments from sub-command
    then_index = -1
    try:
        then_index = args.index('then')
    except ValueError:
        pass

    list_args = args
    sub_command_parts = []

    if then_index != -1:
        list_args = args[:then_index]
        sub_command_parts = args[then_index + 1:]
        with open("debug_list.txt", "w") as f:
            f.write(f"list_args={list_args}\n")
            f.write(f"sub_command_parts={sub_command_parts}\n")
        if not sub_command_parts:
            print("Error: 'then' keyword must be followed by a command.")
            return

    # Parse list-specific arguments and properties
    item_type_raw = list_args[0].lower()
    item_type = _depluralize(item_type_raw)
    
    # Extract properties for filtering and sorting from list_args
    list_properties = {}
    # Assuming list_args can also contain properties like 'priority:high'
    # This part needs to be robustly parsed from list_args
    # For now, we'll assume properties are passed directly in the 'properties' dict
    # and that list_args only contains the item_type if no 'then' is present
    # or if 'then' is present, list_args is just the item_type

    # Re-parse properties from the original 'properties' dict, filtering out 'sort_by' and 'reverse_sort'
    # This is a simplification, a more robust parser would handle properties within list_args
    filter_properties = {k: v for k, v in properties.items() if k not in ['sort_by', 'reverse_sort']}
    sort_by = properties.get('sort_by')
    reverse_sort = properties.get('reverse_sort', False)

    all_items = list_all_items(item_type)
    
    if not all_items:
        print(f"No {item_type}s found.")
        return

    # Filter items
    filtered_items = []
    if not filter_properties:
        filtered_items = all_items
    else:
        for item in all_items:
            match = True
            for key, value in filter_properties.items():
                if str(item.get(key)) != str(value):
                    match = False
                    break
            if match:
                filtered_items.append(item)

    # Sort items
    if sort_by:
        filtered_items.sort(key=lambda x: x.get(sort_by, 0), reverse=reverse_sort)

    if not filtered_items:
        print(f"No {item_type}s found matching the criteria.")
        return

    # If a sub-command is provided, execute it for each item
    if sub_command_parts:
        print(f"Executing command for {len(filtered_items)} items...")
        for item in filtered_items:
            item_name = item.get('name')
            item_type_from_item = item.get('type', item_type) # Use item's type if available, else default

            # Construct the full command for parse_input
            # The sub-command is expected to be in the format: <command_name> [item_type] [item_name] [properties...]
            # We need to insert item_type and item_name into the sub_command_parts
            # Assuming the sub-command expects item_type and item_name as the first two arguments after command_name
            full_sub_command_parts = [sub_command_parts[0], item_type_from_item, item_name] + sub_command_parts[1:]
            
            sub_command_name, sub_command_args, sub_command_properties = parse_input(full_sub_command_parts)

            # Extract k:v tokens from args into properties for the piped command
            # because Console.parse_input does not handle colon properties.
            extracted_props = {}
            remaining_args = []
            for token in sub_command_args:
                if isinstance(token, str) and ':' in token:
                    key, val = token.split(':', 1)
                    lv = val.lower()
                    if lv == 'true':
                        extracted_props[key] = True
                    elif lv == 'false':
                        extracted_props[key] = False
                    else:
                        extracted_props[key] = val
                else:
                    remaining_args.append(token)
            sub_command_args = remaining_args
            if not isinstance(sub_command_properties, dict):
                sub_command_properties = {}
            sub_command_properties.update(extracted_props)

            # Automatically add force:True for delete command when piped
            if sub_command_name == 'delete':
                sub_command_properties['force'] = True
            
            if sub_command_name:
                print(f"  -> Running: {sub_command_name} {sub_command_args} {sub_command_properties}")
                run_command(sub_command_name, sub_command_args, sub_command_properties)
            else:
                print(f"  -> Warning: Could not parse sub-command from {full_sub_command_parts}")
        print("Command execution complete.")
    else:
        # Otherwise, display items in a readable block format
        headers = list(filtered_items[0].keys())
        for idx, item in enumerate(filtered_items, 1):
            label = str(item.get('name') or item.get('Name') or f"{item_type.title()} {idx}")
            print(label)
            for header in headers:
                if header.lower() == 'name':
                    continue
                value = item.get(header, "")
                if value is None or value == '':
                    continue
                if isinstance(value, (dict, list)):
                    value_repr = repr(value)
                else:
                    value_repr = str(value)
                value_repr = value_repr.replace('\n', '\\n').replace('\r', '\\r')
                print(f"     {header}:{value_repr}")
            print()

def get_help_message():
    return """
Usage: list <item_type> [sort_by:<property_key>] [reverse_sort:True/False] [property_key:property_value ...]
       list <item_type> [list_properties...] then <command> [command_args...]

Description:
  Lists items of the specified type, optionally filtered and sorted by a property.
  Can also pipe the listed items to another command for bulk operations.

Examples:
  list note sort_by:priority reverse_sort:True
  list tasks status:pending then set status:in-progress
  list tasks priority:high then delete
"""
