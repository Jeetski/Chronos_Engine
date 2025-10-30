# In Commands/track.py

import sys
from Modules.ItemManager import dispatch_command
try:
    from Utilities.tracking import is_trackable, show_tracking
except Exception:
    is_trackable = None
    show_tracking = None

def run(args, properties):
    """
    Handles the 'track' command by dispatching it to the appropriate item handler
    to display its tracking data.
    """
    if len(args) < 2 or any(arg in ['/h', '-h', '--help'] for arg in args):
        print(get_help_message())
        return

    item_type = args[0].lower()
    # Parse item name and optional properties from remaining args
    item_name_parts = []
    cmd_props = {}
    parsing_item_name = True
    for part in args[1:]:
        if ':' in part and part.count(':') >= 1:
            parsing_item_name = False
            key, value = part.split(':', 1)
            # normalize booleans
            if isinstance(value, str) and value.lower() in ('true', 'false'):
                cmd_props[key] = (value.lower() == 'true')
            else:
                cmd_props[key] = value
        elif part.startswith('--'):
            parsing_item_name = False
            key = part[2:]
            cmd_props[key] = True
        elif parsing_item_name:
            item_name_parts.append(part)
        else:
            item_name_parts.append(part)
    item_name = ' '.join(item_name_parts)
    properties = {**properties, **cmd_props}

    # If this is a trackable type (excluding habit which has bespoke tracking),
    # render tracking directly; otherwise dispatch to module.
    if is_trackable and is_trackable(item_type) and item_type != 'habit' and show_tracking:
        show_tracking(item_type, item_name)
    else:
        # Dispatch the command to the specific item module
        dispatch_command("track", item_type, item_name, None, properties)

def get_help_message():
    return """
Usage: track <item_type> <item_name>
Description: Displays tracking data for a specific item (streaks, sessions, minutes, history).
Examples:
  track task "Deep Work"
  track routine "Morning Routine"
"""
