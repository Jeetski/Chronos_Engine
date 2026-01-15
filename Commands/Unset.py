from Modules import Variables


def run(args, properties):
    """
    Unsets a script variable.
    Usage: unset var <name>
    """
    if not args or args[0].lower() != 'var' or len(args) < 2:
        print(get_help_message())
        return

    name = args[1]
    Variables.unset_var(name)
    print(f"Unset @{name}.")


def get_help_message():
    return """
Usage: unset var <name>
Description: Removes a script variable from the current session.
Example: unset var project
"""

