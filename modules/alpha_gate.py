import json
import os

try:
    import yaml  # type: ignore
except Exception:
    yaml = None


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CONFIG_PATH = os.path.join(ROOT_DIR, "utilities", "dashboard", "config", "alpha_gate_profiles.json")
SETTINGS_PATH = os.path.join(ROOT_DIR, "user", "settings", "alpha_gate_settings.yml")
INTERNAL_COMMANDS = {"alphagate"}
DEFAULT_SHOW_HIDDEN_ITEMS = False
DEFAULT_DISABLE_HIDDEN_FEATURES = True
DEFAULT_SHOW_ALPHA_GATE_TOGGLE = False


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


def get_profile_names():
    profiles = load_profiles().get("profiles") or {}
    if not isinstance(profiles, dict):
        return []
    return sorted(str(name).strip() for name in profiles.keys() if str(name).strip())


def get_profile(profile_name=None):
    profiles = load_profiles().get("profiles") or {}
    if not isinstance(profiles, dict):
        profiles = {}
    name = str(profile_name or get_release_profile() or "").strip()
    profile = profiles.get(name)
    return profile if isinstance(profile, dict) else {}


def get_settings():
    settings = {
        "release_profile": get_default_profile(),
        "show_hidden_items": DEFAULT_SHOW_HIDDEN_ITEMS,
        "disable_hidden_features": DEFAULT_DISABLE_HIDDEN_FEATURES,
        "show_alpha_gate_toggle": DEFAULT_SHOW_ALPHA_GATE_TOGGLE,
    }
    raw = load_settings()
    if isinstance(raw, dict):
        profile = str(raw.get("release_profile") or "").strip()
        if profile:
            settings["release_profile"] = profile
        for key in ("show_hidden_items", "disable_hidden_features", "show_alpha_gate_toggle"):
            value = _to_bool(raw.get(key))
            if value is not None:
                settings[key] = value

    env_profile = str(os.getenv("CHRONOS_RELEASE_PROFILE") or "").strip()
    if env_profile:
        settings["release_profile"] = env_profile
    for key, env_key in {
        "show_hidden_items": "CHRONOS_SHOW_HIDDEN_ITEMS",
        "disable_hidden_features": "CHRONOS_DISABLE_HIDDEN_FEATURES",
        "show_alpha_gate_toggle": "CHRONOS_SHOW_ALPHA_GATE_TOGGLE",
    }.items():
        env_value = _to_bool(os.getenv(env_key))
        if env_value is not None:
            settings[key] = env_value
    return settings


def get_release_profile():
    return str(get_settings().get("release_profile") or get_default_profile()).strip() or get_default_profile()


def show_hidden_items():
    return bool(get_settings().get("show_hidden_items"))


def disable_hidden_features():
    return bool(get_settings().get("disable_hidden_features"))


def show_alpha_gate_toggle():
    return bool(get_settings().get("show_alpha_gate_toggle"))


def is_full_dev():
    return _normalize_text(get_release_profile()) == "full_dev"


def is_internal_command(command_name):
    return _normalize_command_name(command_name) in INTERNAL_COMMANDS


def _hidden_bucket(kind):
    if is_full_dev() or show_hidden_items():
        return set()
    profile = get_profile()
    cli_hidden = ((profile.get("cli") or {}).get("hidden") or {}) if isinstance(profile, dict) else {}
    values = cli_hidden.get(kind) if isinstance(cli_hidden, dict) else []
    if not isinstance(values, list):
        return set()
    if kind == "commands":
        return {_normalize_command_name(v) for v in values if str(v or "").strip()}
    if kind == "item_types":
        return {_normalize_item_type(v) for v in values if str(v or "").strip()}
    return {_normalize_text(v) for v in values if str(v or "").strip()}


def _disabled_bucket(kind):
    if is_full_dev() or not disable_hidden_features():
        return set()
    profile = get_profile()
    cli_hidden = ((profile.get("cli") or {}).get("hidden") or {}) if isinstance(profile, dict) else {}
    values = cli_hidden.get(kind) if isinstance(cli_hidden, dict) else []
    if not isinstance(values, list):
        return set()
    if kind == "commands":
        return {_normalize_command_name(v) for v in values if str(v or "").strip()}
    if kind == "item_types":
        return {_normalize_item_type(v) for v in values if str(v or "").strip()}
    return {_normalize_text(v) for v in values if str(v or "").strip()}


def is_command_hidden(command_name):
    return _normalize_command_name(command_name) in _hidden_bucket("commands")


def is_command_discoverable(command_name):
    normalized = _normalize_command_name(command_name)
    if not normalized:
        return False
    return normalized not in INTERNAL_COMMANDS and normalized not in _hidden_bucket("commands")


def is_command_disabled(command_name):
    normalized = _normalize_command_name(command_name)
    if not normalized or normalized in INTERNAL_COMMANDS:
        return False
    return normalized in _disabled_bucket("commands")


def is_item_type_hidden(item_type):
    return _normalize_item_type(item_type) in _hidden_bucket("item_types")


def is_item_type_disabled(item_type):
    return _normalize_item_type(item_type) in _disabled_bucket("item_types")


def filter_commands_dict(commands):
    if not isinstance(commands, dict):
        return commands
    out = {}
    for key, value in commands.items():
        if not is_command_discoverable(key):
            continue
        out[key] = value
    return out


def filter_aliases_dict(aliases):
    if not isinstance(aliases, dict):
        return aliases
    out = {}
    for alias, target in aliases.items():
        if not is_command_discoverable(alias):
            continue
        if not is_command_discoverable(target):
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


def settings_snapshot():
    return {
        "release_profile": get_release_profile(),
        "show_hidden_items": show_hidden_items(),
        "disable_hidden_features": disable_hidden_features(),
        "show_alpha_gate_toggle": show_alpha_gate_toggle(),
    }


def save_settings(data):
    if not isinstance(data, dict):
        raise ValueError("alpha gate settings must be a dict")
    payload = {
        "release_profile": str(data.get("release_profile") or get_default_profile()).strip() or get_default_profile(),
        "show_hidden_items": bool(data.get("show_hidden_items")),
        "disable_hidden_features": bool(data.get("disable_hidden_features", DEFAULT_DISABLE_HIDDEN_FEATURES)),
        "show_alpha_gate_toggle": bool(data.get("show_alpha_gate_toggle")),
    }
    os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
    lines = [
        f"release_profile: {payload['release_profile']}",
        f"show_hidden_items: {'true' if payload['show_hidden_items'] else 'false'}",
        f"disable_hidden_features: {'true' if payload['disable_hidden_features'] else 'false'}",
        f"show_alpha_gate_toggle: {'true' if payload['show_alpha_gate_toggle'] else 'false'}",
        "",
    ]
    with open(SETTINGS_PATH, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines))
    return payload


def update_settings(**changes):
    current = settings_snapshot()
    current.update({k: v for k, v in changes.items() if v is not None})
    return save_settings(current)
