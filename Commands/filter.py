def get_help_message():
    return """
Usage: filter <item_type> [property:value ...] | filter all | filter off
Description: Sets or clears the active filter for Chronos items.
Example: filter note category:work
Example: filter all
Example: filter off
Example: filter type:all
"""



# Commands/filter.py

from Modules.FilterManager import FilterManager

def run(args, properties):
    """
    Sets or clears the active filter for Chronos items.
    Usage:
        filter <item_type> [property:value ...]
        filter all
        filter off
    """
    if not args or "--help" in args or "-h" in args:
        print(get_help_message())
        return

    command = args[0].lower()

    if command == "off":
        FilterManager.clear_filter()
    elif command in {"all", "type:all", "type:any"}:
        FilterManager.set_filter(item_type=None, properties={}) # Set filter to include all
    else:
        item_type = command
        FilterManager.set_filter(item_type=item_type, properties=properties)
