import os
import re
from typing import Any

import yaml

# Simple in-memory variable store shared across commands
_VARS = {}
_STATUS_MANAGED = set()
_ALIASES = {
    "location": "status_place",
    "profile.nickname": "nickname",
    "timer.profile": "timer_profile",
}
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_BINDINGS_PATH = os.path.join(_PROJECT_ROOT, "user", "settings", "variable_bindings.yml")
_PROFILE_PATH = os.path.join(_PROJECT_ROOT, "user", "profile", "profile.yml")
_TIMER_SETTINGS_PATH = os.path.join(_PROJECT_ROOT, "user", "settings", "timer_settings.yml")
_TIMER_PROFILES_PATH = os.path.join(_PROJECT_ROOT, "user", "settings", "timer_profiles.yml")
_BINDINGS_CACHE = {
    "mtime": None,
    "by_var": {},
}


def canonical_var_name(name: str) -> str:
    raw = str(name or "").strip()
    if not raw:
        return raw
    low = raw.lower()
    # Namespace illusion: map dotted status keys to canonical flat keys.
    if low.startswith("status.") and len(raw) > len("status."):
        tail = raw[len("status."):]
        return f"status_{_status_slug(tail)}"
    mapped = _ALIASES.get(low)
    return mapped if mapped else raw


def set_var(name: str, value):
    if name is None:
        return
    _VARS[canonical_var_name(str(name))] = str(value)


def get_var(name: str, default=None):
    key = canonical_var_name(str(name))
    if key in _VARS:
        return _VARS.get(key, default)
    val = _read_bound_var(key)
    return default if val is None else val


def unset_var(name: str):
    _VARS.pop(canonical_var_name(str(name)), None)


def all_vars():
    merged = dict(_VARS)
    for key, binding in _load_bindings_by_var().items():
        if key in merged:
            continue
        if not _binding_can_read(binding):
            continue
        val = _read_bound_var(key)
        if val is not None:
            merged[key] = val
    return merged


def _project_relpath(path: str | None) -> str | None:
    raw = str(path or "").strip()
    if not raw:
        return None
    if not os.path.isabs(raw):
        return raw.replace("\\", "/")
    try:
        return os.path.relpath(raw, _PROJECT_ROOT).replace("\\", "/")
    except Exception:
        return raw.replace("\\", "/")


def _builtin_aliases(name: str) -> list[str]:
    key = canonical_var_name(name)
    low = key.lower()
    aliases = []
    if low.startswith("status_") and len(low) > len("status_"):
        indicator = low[len("status_"):]
        aliases.append(f"status.{indicator}")
        if low == "status_place":
            aliases.insert(0, "location")
    elif low == "nickname":
        aliases.append("profile.nickname")
    elif low == "timer_profile":
        aliases.append("timer.profile")
    return aliases


def _builtin_var_meta(name: str):
    key = canonical_var_name(name)
    low = key.lower()
    if low.startswith("status_") and len(low) > len("status_"):
        try:
            from modules.scheduler import status_current_path
            source_path = _project_relpath(status_current_path())
        except Exception:
            source_path = "user/current_status.yml"
        return {
            "persistence": "persistent",
            "kind": "status",
            "source_label": "Current Status",
            "source_path": source_path,
            "mode": "readwrite",
            "can_read": True,
            "can_write": True,
            "can_delete": False,
            "aliases": _builtin_aliases(key),
        }
    if low == "nickname":
        return {
            "persistence": "persistent",
            "kind": "profile",
            "source_label": "Profile",
            "source_path": _project_relpath(_PROFILE_PATH),
            "mode": "readwrite",
            "can_read": True,
            "can_write": True,
            "can_delete": False,
            "aliases": _builtin_aliases(key),
        }
    if low == "timer_profile":
        return {
            "persistence": "persistent",
            "kind": "timer_profile",
            "source_label": "Timer Settings",
            "source_path": _project_relpath(_TIMER_SETTINGS_PATH),
            "mode": "readwrite",
            "can_read": True,
            "can_write": True,
            "can_delete": False,
            "aliases": _builtin_aliases(key),
        }
    return None


def describe_var(name: str) -> dict:
    key = canonical_var_name(name)
    meta = _builtin_var_meta(key)
    if meta is None:
        binding = _load_bindings_by_var().get(key)
        if binding:
            mode = _binding_mode(binding.get("mode"))
            meta = {
                "persistence": "persistent",
                "kind": "binding",
                "source_label": "Variable Binding",
                "source_path": _project_relpath(binding.get("file")),
                "mode": mode,
                "can_read": _binding_can_read(binding),
                "can_write": _binding_can_write(binding),
                "can_delete": False,
                "aliases": _builtin_aliases(key),
            }
        else:
            meta = {
                "persistence": "session",
                "kind": "runtime",
                "source_label": "Current Session",
                "source_path": None,
                "mode": "readwrite",
                "can_read": True,
                "can_write": True,
                "can_delete": True,
                "aliases": _builtin_aliases(key),
            }
    value = get_var(key)
    return {
        "name": key,
        "value": None if value is None else str(value),
        "has_value": value is not None,
        "in_memory": key in _VARS,
        **meta,
    }


def all_var_entries() -> list[dict]:
    keys = {canonical_var_name(k) for k in _VARS.keys()}
    keys.update(canonical_var_name(k) for k in all_vars().keys())
    return [describe_var(k) for k in sorted(keys)]


def can_delete_var(name: str) -> bool:
    return bool(describe_var(name).get("can_delete"))


def unset_session_var(name: str):
    if not can_delete_var(name):
        meta = describe_var(name)
        return False, f"Variable '@{meta.get('name')}' is persistent and cannot be deleted from the dashboard."
    unset_var(name)
    return True, None


def _status_slug(name):
    raw = str(name or "").strip().lower()
    raw = re.sub(r"[^a-z0-9]+", "_", raw)
    return raw.strip("_")


def sync_status_vars(status_map):
    """
    Mirror current status values into runtime vars:
      status_energy, status_focus, status_health, ...
    """
    global _STATUS_MANAGED
    source = status_map if isinstance(status_map, dict) else {}
    next_managed = set()
    for key, value in source.items():
        slug = _status_slug(key)
        if not slug:
            continue
        var_name = f"status_{slug}"
        set_var(var_name, value)
        next_managed.add(var_name)
    for stale in (_STATUS_MANAGED - next_managed):
        unset_var(stale)
    _STATUS_MANAGED = next_managed


_VAR_TOKEN = r"[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*"
_re_braced = re.compile(rf"@\{{({_VAR_TOKEN})\}}")
# Only expand @var when not preceded by a word char to avoid emails/usernames
_re_simple = re.compile(rf"(?<![A-Za-z0-9_])@({_VAR_TOKEN})")


def _replace_match(match):
    key = match.group(1)
    val = get_var(key)
    return "" if val is None else str(val)


def expand_token(token: str) -> str:
    if not isinstance(token, str):
        return token
    # Protect escaped @@ sequences during expansion
    sentinel = "\x00_AT_"
    protected = token.replace("@@", sentinel)
    # First replace braced occurrences like @{var}
    expanded = _re_braced.sub(_replace_match, protected)
    # Then replace simple occurrences like @var (with boundary rule)
    expanded = _re_simple.sub(_replace_match, expanded)
    # Restore escaped @
    expanded = expanded.replace(sentinel, "@")
    return expanded


def expand_list(tokens):
    return [expand_token(t) for t in tokens]


def _binding_mode(raw_mode: Any) -> str:
    mode = str(raw_mode or "readwrite").strip().lower()
    return mode if mode in {"read", "write", "readwrite"} else "readwrite"


def _binding_can_read(binding: dict) -> bool:
    return _binding_mode(binding.get("mode")) in {"read", "readwrite"}


def _binding_can_write(binding: dict) -> bool:
    return _binding_mode(binding.get("mode")) in {"write", "readwrite"}


def _resolve_binding_file(raw_file: Any) -> str | None:
    rel_or_abs = str(raw_file or "").strip()
    if not rel_or_abs:
        return None
    candidate = rel_or_abs
    if not os.path.isabs(candidate):
        candidate = os.path.join(_PROJECT_ROOT, candidate)
    resolved = os.path.abspath(candidate)
    try:
        root_norm = os.path.normcase(_PROJECT_ROOT)
        resolved_norm = os.path.normcase(resolved)
        common = os.path.commonpath([root_norm, resolved_norm])
        if common != root_norm:
            return None
    except Exception:
        return None
    ext = os.path.splitext(resolved)[1].lower()
    if ext not in {".yml", ".yaml"}:
        return None
    return resolved


def _split_path(path_str: Any) -> list[str]:
    raw = str(path_str or "").strip()
    if not raw:
        return []
    return [p.strip() for p in raw.split(".") if str(p).strip()]


def _get_nested(mapping: Any, path_parts: list[str]):
    curr = mapping
    for part in path_parts:
        if not isinstance(curr, dict):
            return None
        if part not in curr:
            return None
        curr = curr.get(part)
    return curr


def _set_nested(mapping: dict, path_parts: list[str], value: Any):
    curr = mapping
    for part in path_parts[:-1]:
        nxt = curr.get(part)
        if not isinstance(nxt, dict):
            nxt = {}
            curr[part] = nxt
        curr = nxt
    curr[path_parts[-1]] = value


def _parse_binding_entry(raw_entry: dict, fallback_var: str | None = None):
    if not isinstance(raw_entry, dict):
        return None
    raw_var = raw_entry.get("var") if raw_entry.get("var") is not None else fallback_var
    var_name = canonical_var_name(str(raw_var or "").strip())
    if not var_name:
        return None
    file_path = _resolve_binding_file(raw_entry.get("file"))
    if not file_path:
        return None
    path_parts = _split_path(raw_entry.get("path"))
    if not path_parts:
        return None
    return {
        "var": var_name,
        "file": file_path,
        "path_parts": path_parts,
        "mode": _binding_mode(raw_entry.get("mode")),
    }


def _read_yaml(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_yaml(path: str, payload: dict):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(payload, f, default_flow_style=False, sort_keys=False)


def _load_bindings_by_var() -> dict:
    if not os.path.exists(_BINDINGS_PATH):
        _BINDINGS_CACHE["mtime"] = None
        _BINDINGS_CACHE["by_var"] = {}
        return _BINDINGS_CACHE["by_var"]
    try:
        mtime = os.path.getmtime(_BINDINGS_PATH)
    except Exception:
        _BINDINGS_CACHE["mtime"] = None
        _BINDINGS_CACHE["by_var"] = {}
        return _BINDINGS_CACHE["by_var"]
    if _BINDINGS_CACHE["mtime"] == mtime:
        return _BINDINGS_CACHE["by_var"]

    by_var = {}
    try:
        with open(_BINDINGS_PATH, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
    except Exception:
        raw = {}
    bindings = raw.get("bindings") if isinstance(raw, dict) else None

    if isinstance(bindings, dict):
        for var_name, entry in bindings.items():
            parsed = _parse_binding_entry(entry, fallback_var=str(var_name))
            if parsed:
                by_var[parsed["var"]] = parsed
    elif isinstance(bindings, list):
        for entry in bindings:
            parsed = _parse_binding_entry(entry)
            if parsed:
                by_var[parsed["var"]] = parsed

    _BINDINGS_CACHE["mtime"] = mtime
    _BINDINGS_CACHE["by_var"] = by_var
    return by_var


def _read_bound_var(name: str):
    binding = _load_bindings_by_var().get(canonical_var_name(name))
    if not binding or not _binding_can_read(binding):
        return None
    data = _read_yaml(binding["file"])
    val = _get_nested(data, binding["path_parts"])
    return None if val is None else str(val)


def write_bound_var(name: str, value):
    """
    Write variable value via optional user-defined binding rules.

    Returns:
      (handled: bool, final_value: str | None, error: str | None, target: str | None)
    """
    var_name = canonical_var_name(name)
    binding = _load_bindings_by_var().get(var_name)
    if not binding:
        return False, None, None, None
    if not _binding_can_write(binding):
        return True, None, f"Variable '{var_name}' is bound as read-only.", None

    data = _read_yaml(binding["file"])
    raw_value = str(value)
    try:
        _set_nested(data, binding["path_parts"], raw_value)
        _write_yaml(binding["file"], data)
    except Exception as e:
        return True, None, f"Failed to write bound variable '{var_name}': {e}", None
    return True, raw_value, None, os.path.relpath(binding["file"], _PROJECT_ROOT)


def _sync_status_var_to_yaml(var_name: str, var_value):
    raw_name = str(var_name or "").strip()
    if not raw_name.lower().startswith("status_"):
        return False, None, None, None

    from modules import status_utils
    from modules.scheduler import status_current_path

    indicator = status_utils.status_slug(raw_name[len("status_"):])
    if not indicator:
        return True, "Invalid status variable name.", None, None
    normalized_value, err = status_utils.canonicalize_status_value(indicator, var_value)
    if err:
        return True, err, None, None

    path = status_current_path()
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                current = yaml.safe_load(f) or {}
        else:
            current = {}
        if not isinstance(current, dict):
            current = {}
    except Exception:
        current = {}

    current[indicator] = normalized_value
    try:
        with open(path, "w", encoding="utf-8") as f:
            yaml.dump(current, f, default_flow_style=False)
    except Exception as e:
        return True, f"Failed to write status file: {e}", None, None

    try:
        sync_status_vars(current)
    except Exception:
        pass
    return True, None, str(normalized_value), _project_relpath(path)


def _sync_nickname_var_to_profile(var_name: str, var_value):
    raw_name = str(var_name or "").strip().lower()
    if raw_name != "nickname":
        return False, None, None, None

    nickname = str(var_value or "").strip()
    if not nickname:
        return True, "Nickname cannot be empty.", None, None

    profile = {}
    try:
        if os.path.exists(_PROFILE_PATH):
            with open(_PROFILE_PATH, "r", encoding="utf-8") as f:
                profile = yaml.safe_load(f) or {}
        if not isinstance(profile, dict):
            profile = {}
    except Exception:
        profile = {}

    profile["nickname"] = nickname
    try:
        os.makedirs(os.path.dirname(_PROFILE_PATH), exist_ok=True)
        with open(_PROFILE_PATH, "w", encoding="utf-8") as f:
            yaml.dump(profile, f, default_flow_style=False, sort_keys=False)
    except Exception as e:
        return True, f"Failed to write profile nickname: {e}", None, None

    return True, None, nickname, _project_relpath(_PROFILE_PATH)


def _sync_timer_profile_var_to_settings(var_name: str, var_value):
    raw_name = str(var_name or "").strip().lower()
    if raw_name != "timer_profile":
        return False, None, None, None

    profile_name = str(var_value or "").strip()
    if not profile_name:
        return True, "Timer profile cannot be empty.", None, None

    profiles = {}
    try:
        if os.path.exists(_TIMER_PROFILES_PATH):
            with open(_TIMER_PROFILES_PATH, "r", encoding="utf-8") as f:
                profiles = yaml.safe_load(f) or {}
        if not isinstance(profiles, dict):
            profiles = {}
    except Exception:
        profiles = {}

    if profiles and profile_name not in profiles:
        lower_map = {str(k).lower(): str(k) for k in profiles.keys()}
        match = lower_map.get(profile_name.lower())
        if not match:
            return True, f"Unknown timer profile '{profile_name}'.", None, None
        profile_name = match

    settings = {}
    try:
        if os.path.exists(_TIMER_SETTINGS_PATH):
            with open(_TIMER_SETTINGS_PATH, "r", encoding="utf-8") as f:
                settings = yaml.safe_load(f) or {}
        if not isinstance(settings, dict):
            settings = {}
    except Exception:
        settings = {}

    settings["default_profile"] = profile_name
    try:
        os.makedirs(os.path.dirname(_TIMER_SETTINGS_PATH), exist_ok=True)
        with open(_TIMER_SETTINGS_PATH, "w", encoding="utf-8") as f:
            yaml.dump(settings, f, default_flow_style=False, sort_keys=False)
    except Exception as e:
        return True, f"Failed to write timer settings: {e}", None, None

    return True, None, profile_name, _project_relpath(_TIMER_SETTINGS_PATH)


def apply_var_assignment(name: str, value):
    requested_name = str(name or "").strip()
    var_name = canonical_var_name(requested_name)

    handled, err, final_value, sync_target = _sync_status_var_to_yaml(var_name, value)
    sync_kind = "status" if handled and not err and final_value is not None else None
    if err:
        return {"ok": False, "name": var_name, "error": err}

    if not handled:
        handled, err, final_value, sync_target = _sync_nickname_var_to_profile(var_name, value)
        if handled and not err and final_value is not None:
            sync_kind = "profile"
        if err:
            return {"ok": False, "name": var_name, "error": err}

    if not handled:
        handled, err, final_value, sync_target = _sync_timer_profile_var_to_settings(var_name, value)
        if handled and not err and final_value is not None:
            sync_kind = "timer_profile"
        if err:
            return {"ok": False, "name": var_name, "error": err}

    if not handled:
        handled_bound, normalized_bound_value, bound_err, bound_sync_target = write_bound_var(var_name, value)
        if bound_err:
            return {"ok": False, "name": var_name, "error": bound_err}
        if handled_bound:
            handled = True
            final_value = normalized_bound_value
            sync_target = _project_relpath(bound_sync_target)
            sync_kind = "binding"

    if final_value is None:
        final_value = str(value)

    set_var(var_name, final_value)
    return {
        "ok": True,
        "requested_name": requested_name,
        "name": var_name,
        "value": str(final_value),
        "alias_used": requested_name != var_name,
        "sync_kind": sync_kind,
        "sync_target": sync_target,
        "entry": describe_var(var_name),
    }
