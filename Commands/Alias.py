
import os
import yaml
from Modules.Console import ROOT_DIR

ALIASES_PATH = os.path.join(ROOT_DIR, 'User', 'Settings', 'aliases.yml')

def run(args, properties):
    """
    Handles the 'alias' command.
    alias list -> show all
    alias remove <name> -> delete alias
    alias <name> <command...> -> set alias
    """
    if not args:
        print(get_help_message())
        return

    sub = args[0].lower()
    
    if sub == 'list':
        _list_aliases()
        return
        
    if sub == 'remove':
        if len(args) < 2:
            print("Usage: alias remove <name>")
            return
        _remove_alias(args[1])
        return
        
    # Set alias
    # alias name command...
    if len(args) < 2:
        print(get_help_message())
        return
        
    alias_name = args[0]
    command_str = ' '.join(args[1:])
    _set_alias(alias_name, command_str)

def _load_aliases():
    if not os.path.exists(ALIASES_PATH):
        return {}
    try:
        with open(ALIASES_PATH, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}

def _save_aliases(data):
    try:
        os.makedirs(os.path.dirname(ALIASES_PATH), exist_ok=True)
        with open(ALIASES_PATH, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False)
        return True
    except Exception as e:
        print(f"Error saving aliases: {e}")
        return False

def _list_aliases():
    data = _load_aliases()
    if not data:
        print("No user aliases defined.")
        return
    print("--- User Aliases ---")
    for k, v in data.items():
        print(f"  {k}: {v}")

def _set_alias(name, command):
    data = _load_aliases()
    data[name] = command
    if _save_aliases(data):
        print(f"✅ Alias set: {name} -> {command}")

def _remove_alias(name):
    data = _load_aliases()
    if name in data:
        del data[name]
        if _save_aliases(data):
            print(f"🗑️ Alias removed: {name}")
    else:
        print(f"Alias '{name}' not found.")

def get_help_message():
    return """
Usage:
  alias <name> <command_string>
  alias list
  alias remove <name>

Description:
  Creates custom command shortcuts.
  Aliases are stored in User/Settings/aliases.yml.

Example:
  alias gm start today
  alias n new note
  alias backup_notes archive notes
"""
