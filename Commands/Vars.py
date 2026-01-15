from Modules import Variables


def run(args, properties):
    """
    Lists current script variables. Optional filters:
      - name:<varname> to show a single variable
    """
    vars_map = Variables.all_vars()
    name = properties.get('name')

    if name:
        val = vars_map.get(name)
        if val is None:
            print(f"No variable named '{name}'.")
        else:
            print(f"@{name} = {val}")
        return

    if not vars_map:
        print("No variables set.")
        return

    for k, v in vars_map.items():
        print(f"@{k} = {v}")


def get_help_message():
    return """
Usage: vars [name:<varname>]
Description: Lists current script variables or a single variable by name.
Example: vars
Example: vars name:project
"""

