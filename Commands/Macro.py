
import os
import yaml
from Modules.Console import ROOT_DIR

MACROS_CONF = os.path.join(ROOT_DIR, "User", "Scripts", "Macros", "macros.yml")

def run(args, properties):
    """
    Handles the 'macro' command.
    macro list
    macro enable
    macro disable
    """
    if not args:
        print(get_help_message())
        return

    sub = args[0].lower()
    
    if sub == 'list':
        _list_macros()
    elif sub == 'enable':
        _set_enabled(True)
    elif sub == 'disable':
        _set_enabled(False)
    else:
        print(get_help_message())

def _load_config():
    if not os.path.exists(MACROS_CONF):
        return {}
    try:
        with open(MACROS_CONF, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}

def _save_config(data):
    try:
        os.makedirs(os.path.dirname(MACROS_CONF), exist_ok=True)
        with open(MACROS_CONF, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False)
        return True
    except Exception as e:
        print(f"Error saving config: {e}")
        return False

def _list_macros():
    cfg = _load_config()
    enabled = cfg.get('enable_macros', False)
    print(f"Macros Enabled: {enabled}")
    
    before = cfg.get('before_command', {})
    after = cfg.get('after_command', {})
    
    if before:
        print("\nBefore Hooks:")
        for cmd, steps in before.items():
            print(f"  {cmd}: {steps}")
            
    if after:
        print("\nAfter Hooks:")
        for cmd, steps in after.items():
            print(f"  {cmd}: {steps}")

def _set_enabled(state):
    cfg = _load_config()
    cfg['enable_macros'] = state
    if _save_config(cfg):
        print(f"Macros {'enabled' if state else 'disabled'}.")

def get_help_message():
    return """
Usage:
  macro list
  macro enable
  macro disable

Description:
  Manages the macro system (User/Scripts/Macros/macros.yml).
"""
