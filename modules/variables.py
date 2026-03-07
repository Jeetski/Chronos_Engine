import re

# Simple in-memory variable store shared across commands
_VARS = {}


def set_var(name: str, value):
    if name is None:
        return
    _VARS[str(name)] = str(value)


def get_var(name: str, default=None):
    return _VARS.get(str(name), default)


def unset_var(name: str):
    _VARS.pop(str(name), None)


def all_vars():
    return dict(_VARS)


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
