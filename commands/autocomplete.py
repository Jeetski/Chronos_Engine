import os

try:
    import yaml  # type: ignore
except Exception:
    yaml = None

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SETTINGS_PATH = os.path.join(ROOT_DIR, "user", "settings", "console_settings.yml")


def _to_bool(value):
    s = str(value or "").strip().lower()
    if s in {"on", "true", "1", "yes"}:
        return True
    if s in {"off", "false", "0", "no"}:
        return False
    return None


def _load_settings():
    defaults = {
        "prompt_toolkit_default": False,
        "autocomplete_enabled": True,
    }
    if yaml is None:
        return defaults
    try:
        if not os.path.exists(SETTINGS_PATH):
            return defaults
        with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        if isinstance(data, dict):
            out = dict(defaults)
            out.update(data)
            return out
    except Exception:
        pass
    return defaults


def _save_settings(data):
    if yaml is None:
        return False
    try:
        os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
        with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
            yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
        return True
    except Exception:
        return False


def _print_status(settings):
    enabled = bool(_to_bool(settings.get("autocomplete_enabled")))
    print(f"Autocomplete suggestions: {'on' if enabled else 'off'}")
    print("Note: applies to new interactive sessions.")


def run(args, properties):
    settings = _load_settings()

    if not args:
        _print_status(settings)
        return

    sub = str(args[0]).strip().lower()
    if sub in {"status", "list"}:
        _print_status(settings)
        return

    if sub == "toggle":
        current = bool(_to_bool(settings.get("autocomplete_enabled")))
        settings["autocomplete_enabled"] = not current
        if _save_settings(settings):
            _print_status(settings)
        else:
            print("❌ Failed to save console settings.")
        return

    value = _to_bool(sub)
    if value is None:
        print(get_help_message())
        return

    settings["autocomplete_enabled"] = value
    if _save_settings(settings):
        _print_status(settings)
    else:
        print("❌ Failed to save console settings.")


def get_help_message():
    return """
Usage:
  autocomplete
  autocomplete status
  autocomplete on|off
  autocomplete toggle

Description:
  Turns interactive CLI autocomplete suggestions on or off.
  This updates user/settings/console_settings.yml.
  Changes apply to new interactive console sessions.
"""


