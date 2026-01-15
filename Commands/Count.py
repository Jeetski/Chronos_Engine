import sys
from Modules.ItemManager import list_all_items

# --- Command Definition ---
def run(args, properties):
    """
    Handles the 'count' command, counting items of a specific type or matching properties.
    """
    # Validate command arguments
    if len(args) < 1:
        print(get_help_message())
        return

    # Extract item type, handling pluralization
    item_type_raw = args[0].lower()
    if item_type_raw.endswith('s'):
        item_type = item_type_raw[:-1]
    else:
        item_type = item_type_raw
    
    all_items = list_all_items(item_type)
    
    if not all_items:
        print(f"No {item_type}s found.")
        return

    # Filter items based on provided properties
    filtered_items = []
    if properties:
        for item in all_items:
            match = True
            for key, value in properties.items():
                if str(item.get(key)).lower() != str(value).lower():
                    match = False
                    break
            if match:
                filtered_items.append(item)
    else:
        # If no properties are provided, count all items of the type
        filtered_items = all_items

    count = len(filtered_items)
    if properties:
        print(f"Found {count} {item_type}s matching properties: {properties}")
    else:
        print(f"Found {count} {item_type}s in total.")

def get_help_message():
    return """
Usage: count <item_type> [property_key:property_value ...]
Description: Counts items of a specific type, optionally filtered by properties.
Example: count note category:work
Example: count task status:pending priority:high
"""