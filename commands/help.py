import os
import importlib.util
import re
from modules import console as Console
from modules import alpha_gate as AlphaGate

# Determine the root directory of the Chronos Engine project
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
COMMANDS_DIR = os.path.join(ROOT_DIR, "commands")


def _canonical_command_name(command_name: str) -> str:
    name = str(command_name or "").strip()
    if not name:
        return ""
    name = name.replace("-", "_").replace(" ", "_")
    name = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    name = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", name)
    name = name.lower()
    name = re.sub(r"_+", "_", name)
    return name.strip("_")


def _command_file_map():
    mapping = {}
    for fn in os.listdir(COMMANDS_DIR):
        if not fn.endswith(".py"):
            continue
        if fn in {"__init__.py"}:
            continue
        stem = fn[:-3]
        canonical = _canonical_command_name(stem)
        if canonical and canonical not in mapping:
            mapping[canonical] = fn
    return mapping


def run(args, properties):
    """
    Displays help messages for available commands.
    """
    if not args:
        # Display help for all commands
        print("\nChronos Engine Commands")
        print("=" * 60)
        file_map = _command_file_map()
        plugin_snapshot = Console.get_plugins_snapshot(force=False)
        plugin_commands = set((plugin_snapshot.get("command_meta") or {}).keys())
        command_names = sorted(
            [
                name for name in set(file_map.keys()) | plugin_commands
                if name != "help" and AlphaGate.is_command_discoverable(name)
            ],
            key=lambda s: s.lower(),
        )
        for command_name in command_names:
            command_file = file_map.get(command_name)
            print(f"\nCommand: {command_name}")
            if command_file:
                try:
                    spec = importlib.util.spec_from_file_location(command_name, os.path.join(COMMANDS_DIR, command_file))
                    command_module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(command_module)
                    if hasattr(command_module, "get_help_message"):
                        print(command_module.get_help_message())
                    else:
                        print("Description: No help message available.")
                    continue
                except Exception as e:
                    print(f"Description: Error loading help message: {e}")
                    continue
            plugin_help = Console.get_plugin_help(command_name)
            if plugin_help:
                print(plugin_help)
            else:
                meta = (plugin_snapshot.get("command_meta") or {}).get(command_name) or {}
                pid = str(meta.get("plugin_id") or "").strip()
                if pid:
                    print(f"Description: Plugin command from '{pid}'.")
                else:
                    print("Description: No help message available.")

        print(f"\nCommand: help")
        print(get_help_message())
        print("=" * 60 + "\n")
    else:
        # Display help for a specific command
        command_name = _canonical_command_name(args[0])
        if AlphaGate.is_internal_command(command_name):
            print(f"Command '{command_name}' is not listed in public help.")
            return
        if AlphaGate.is_command_hidden(command_name):
            print(f"Command '{command_name}' is hidden by the active alpha gate.")
            return
        command_file = _command_file_map().get(command_name)
        command_path = os.path.join(COMMANDS_DIR, command_file) if command_file else None
        if command_path:
            try:
                spec = importlib.util.spec_from_file_location(command_name, command_path)
                command_module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(command_module)
                print(f"\nCommand: {command_name}")
                if hasattr(command_module, "get_help_message"):
                    print(command_module.get_help_message())
                else:
                    print("Description: No help message available.")
            except Exception as e:
                print(f"\nCommand: {command_name}")
                print(f"Description: Error loading help message: {e}")
        else:
            plugin_help = Console.get_plugin_help(command_name)
            if plugin_help:
                print(f"\nCommand: {command_name}")
                print(plugin_help)
                return
            print(f"Error: Command '{command_name}' not found.")


def get_help_message():
    return """
Usage: help
Description: Displays this help message, listing all available commands and their usage.
"""


