import re

# Simple in-memory variable store shared across commands
_VARS = {}
_STATUS_MANAGED = set()
_ALIASES = {
    "location": "status_place",
}


def canonical_var_name(name: str) -> str:
    raw = str(name or "").strip()
    if not raw:
        return raw
    mapped = _ALIASES.get(raw.lower())
    return mapped if mapped else raw


def set_var(name: str, value):
    if name is None:
        return
    _VARS[canonical_var_name(str(name))] = str(value)


def get_var(name: str, default=None):
    key = canonical_var_name(str(name))
    return _VARS.get(key, default)


def unset_var(name: str):
    _VARS.pop(canonical_var_name(str(name)), None)


def all_vars():
    return dict(_VARS)


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


_re_braced = re.compile(r"@\{([A-Za-z_][A-Za-z0-9_]*)\}")
# Only expand @var when not preceded by a word char to avoid emails/usernames
_re_simple = re.compile(r"(?<![A-Za-z0-9_])@([A-Za-z_][A-Za-z0-9_]*)")


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
