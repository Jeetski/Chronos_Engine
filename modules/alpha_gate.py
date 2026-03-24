import json
import os

try:
    import yaml  # type: ignore
except Exception:
    yaml = None


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CONFIG_PATH = os.path.join(ROOT_DIR, "utilities", "dashboard", "config", "alpha_gate_profiles.json")
SETTINGS_PATH = os.path.join(ROOT_DIR, "user", "settings", "alpha_gate_settings.yml")


def _safe_load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def _safe_load_yaml(path):
    try:
        if yaml is None or not os.path.exists(path):
            return {}
        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _to_bool(value):
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return None


def _normalize_text(value):
    return str(value or "").strip().lower()


def _normalize_command_name(value):
    text = _normalize_text(value).replace("-", "_").replace(" ", "_")
    while "__" in text:
        text = text.replace("__", "_")
    return text.strip("_")


def _normalize_item_type(value):
    return _normalize_command_name(value)


def load_profiles():
    data = _safe_load_json(CONFIG_PATH)
    return data if isinstance(data, dict) else {}


def load_settings():
    return _safe_load_yaml(SETTINGS_PATH)


def get_default_profile():
    profiles = load_profiles()
    value = str(profiles.get("default_profile") or "").strip()
    return value or "alpha_v0_3"


def get_release_profile():
    env_value = str(os.getenv("CHRONOS_RELEASE_PROFILE") or "").strip()
    if env_value:
        return env_value
    settings = load_settings()
    value = str(settings.get("release_profile") or "").strip()
    return value or get_default_profile()


def show_hidden_items():
    env_value = _to_bool(os.getenv("CHRONOS_SHOW_HIDDEN_ITEMS"))
    if env_value is not None:
        return env_value
    settings = load_settings()
    value = _to_bool(settings.get("show_hidden_items"))
    return bool(value)


def is_full_dev():
    return _normalize_text(get_release_profile()) == "full_dev"


def get_profile(profile_name=None):
    profiles = load_profiles().get("profiles") or {}
    if not isinstance(profiles, dict):
        profiles = {}
    name = str(profile_name or get_release_profile() or "").strip()
    profile = profiles.get(name)
    return profile if isinstance(profile, dict) else {}


def _hidden_bucket(kind):
    if is_full_dev() or show_hidden_items():
        return set()
    profile = get_profile()
    cli_hidden = ((profile.get("cli") or {}).get("hidden") or {}) if isinstance(profile, dict) else {}
    values = cli_hidden.get(kind) if isinstance(cli_hidden, dict) else []
    if not isinstance(values, list):
        return set()
    if kind == "commands":
        return { _normalize_command_name(v) for v in values if str(v or "").strip() }
    if kind == "item_types":
        return { _normalize_item_type(v) for v in values if str(v or "").strip() }
    return { _normalize_text(v) for v in values if str(v or "").strip() }


def is_command_hidden(command_name):
    return _normalize_command_name(command_name) in _hidden_bucket("commands")


def is_item_type_hidden(item_type):
    return _normalize_item_type(item_type) in _hidden_bucket("item_types")


def filter_commands_dict(commands):
    hidden = _hidden_bucket("commands")
    if not hidden or not isinstance(commands, dict):
        return commands
    out = {}
    for key, value in commands.items():
        canonical = _normalize_command_name(key)
        if canonical in hidden:
            continue
        out[key] = value
    return out


def filter_aliases_dict(aliases):
    hidden = _hidden_bucket("commands")
    if not hidden or not isinstance(aliases, dict):
        return aliases
    out = {}
    for alias, target in aliases.items():
        alias_name = _normalize_command_name(alias)
        target_name = _normalize_command_name(target)
        if alias_name in hidden or target_name in hidden:
            continue
        out[alias] = target
    return out


def filter_item_types(item_types):
    hidden = _hidden_bucket("item_types")
    if not hidden or not isinstance(item_types, list):
        return item_types
    return [item_type for item_type in item_types if _normalize_item_type(item_type) not in hidden]


def filter_item_names_by_type(item_names_by_type):
    hidden = _hidden_bucket("item_types")
    if not hidden or not isinstance(item_names_by_type, dict):
        return item_names_by_type
    out = {}
    for item_type, names in item_names_by_type.items():
        if _normalize_item_type(item_type) in hidden:
            continue
        out[item_type] = names
    return out
