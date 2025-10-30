import sys
from Modules.Console import load_module

def run(args, properties):
    if len(args) < 2:
        print(get_help_message())
        return

    item_type = args[0].lower()
    keyword = args[1]

    module = load_module(item_type.capitalize())
    if module and hasattr(module, "handle_find"):
        module.handle_find(keyword, properties)
    else:
        print(f"❌ Unknown item type '{item_type}' or module does not support 'find' operation.")

def get_help_message():
    return """
Usage: find <item_type> <keyword> [property_key:property_value ...]
Description: Searches for items of the specified type based on a keyword and optional properties.
Example: find note meeting category:work
"""
