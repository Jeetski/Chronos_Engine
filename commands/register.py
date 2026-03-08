import os

from utilities import registry_builder


def run(args, properties):
    """
    register commands | items | settings | properties | trick | skills | all | full
    """
    if not args or args[0].lower() in {"-h", "--help", "help"}:
        print(get_help_message())
        return

    sub = args[0].lower()
    outputs = []

    # Command Registry
    if sub in {"commands", "all", "full"}:
        outputs.append(registry_builder.write_command_registry())

    # Item Registry
    if sub in {"items", "all", "full"}:
        outputs.append(registry_builder.write_item_registry())

    # Settings Registry (Fast)
    if sub in {"settings", "all", "full"}:
        outputs.append(registry_builder.write_settings_registry())

    # Property Registry (Deep Scan)
    if sub in {"properties", "full"}:
        print("Performing deep scan of all properties... this may take a moment.")
        outputs.append(registry_builder.write_property_registry())

    # TRICK Registry (dashboard interface controls)
    if sub in {"trick", "all", "full"}:
        outputs.append(registry_builder.write_trick_registry())

    # Skills Registry (docs/agents/skills/*/skill.md)
    if sub in {"skills", "all", "full"}:
        outputs.append(registry_builder.write_skills_registry())

    if sub not in {"commands", "items", "settings", "properties", "trick", "skills", "all", "full"}:
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
  register settings   (Fast: categories, statuses, defaults)
  register properties (Slow: deep scan of all file keys)
  register trick      (TRICK surface/element registry from trick.yml manifests)
  register skills     (Agent skills registry from docs/agents/skills/*/skill.md)
  register all        (commands + items + settings + trick + skills)
  register full       (all + properties)

Description:
  Builds JSON registries used by autosuggest and tooling.
  Outputs files under the registry/ folder.
"""


