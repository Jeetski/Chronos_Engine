import os

from Utilities import registry_builder


def run(args, properties):
    """
    register commands | items | properties | all
    """
    if not args or args[0].lower() in {"-h", "--help", "help"}:
        print(get_help_message())
        return

    sub = args[0].lower()
    outputs = []

    if sub in {"commands", "all"}:
        outputs.append(registry_builder.write_command_registry())
    if sub in {"items", "all"}:
        outputs.append(registry_builder.write_item_registry())
    if sub in {"properties", "all"}:
        outputs.append(registry_builder.write_property_registry())

    if sub not in {"commands", "items", "properties", "all"}:
        print(get_help_message())
        return

    if outputs:
        print("Registry updated:")
        for path in outputs:
            rel = os.path.relpath(path, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
            print(f"- {rel}")


def get_help_message():
    return """
Usage:
  register commands
  register items
  register properties
  register all

Description:
  Builds JSON registries used by autosuggest and tooling.
  Outputs files under the Registry/ folder.
"""
