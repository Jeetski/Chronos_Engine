import sys
from Modules.ItemManager import dispatch_command


def run(args, properties):
    """
    Usage: redeem reward <name>
    Description: Redeems a reward, deducting points and delivering its target.
    """
    if len(args) < 2 or any(arg in ['--help', '-h', 'help'] for arg in args):
        print(get_help_message())
        return

    item_type = args[0].lower()
    # Collect multi-word name
    name_parts = []
    for part in args[1:]:
        if (':' in part and part.count(':') >= 1) or part.startswith('--'):
            break
        name_parts.append(part)
    item_name = ' '.join(name_parts) if name_parts else args[1]

    dispatch_command('redeem', item_type, item_name, None, properties)


def get_help_message():
    return """
Usage: redeem reward <name>
Description: Redeems a reward, deducting points and delivering its target.
Examples:
  redeem reward "Game Break"
"""

