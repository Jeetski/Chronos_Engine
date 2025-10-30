import sys
from Modules.ItemManager import dispatch_command

try:
    from Utilities.tracking import is_trackable, mark_missed
except Exception:
    is_trackable = None
    mark_missed = None


def run(args, properties):
    """
    Handles the 'miss' command: records a missed occurrence (does not count as completion),
    useful for commitments and appointments (no-show).
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

    if is_trackable and is_trackable(item_type) and mark_missed:
        # Appointment-specific: default outcome to no_show
        outcome = 'no_show' if item_type == 'appointment' else 'missed'
        # Allow override via outcome:<value>
        if 'outcome' in properties:
            outcome = properties.get('outcome')
        mark_missed(item_type, item_name, outcome=outcome)
        # Evaluate commitments after a miss (e.g., never rules)
        try:
            from Modules.Commitment import main as CommitmentModule  # type: ignore
            CommitmentModule.evaluate_and_trigger()
        except Exception as e:
            print(f"Warning: Could not evaluate commitments: {e}")
    else:
        # Dispatch to module-specific handler if it exists
        dispatch_command("miss", item_type, item_name, None, properties)


def get_help_message():
    return """
Usage: miss <item_type> <item_name>
Description: Records a missed occurrence (does not count as completion). Helpful for commitments and appointment no-shows.
Examples:
  miss commitment "Daily Promise"
  miss appointment "Dentist"            (equivalent to no_show)
  miss appointment "Dentist" outcome:no_show
"""
