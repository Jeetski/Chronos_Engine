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
