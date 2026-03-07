import os
import re

try:
    import yaml
except Exception:
    yaml = None

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
USER_SETTINGS_DIR = os.path.join(ROOT_DIR, "User", "Settings")


def status_slug(name):
    raw = str(name or "").strip().lower()
    raw = re.sub(r"[^a-z0-9]+", "_", raw)
    return raw.strip("_")


def load_status_options(indicator):
    if yaml is None:
        return []
    slug = status_slug(indicator)
    if not slug:
        return []
    path = os.path.join(USER_SETTINGS_DIR, f"{slug}_settings.yml")
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    except Exception:
        return []
    if isinstance(data, dict):
        for _, values in data.items():
            if isinstance(values, dict):
                return list(values.keys())
    return []


def canonicalize_status_value(indicator, value):
    if value is None:
        return None, "Missing value"
    raw = str(value).strip()
    if not raw:
        return None, "Missing value"
    options = load_status_options(indicator)
    if not options:
        return raw, None
    for opt in options:
        if str(opt) == raw:
            return opt, None
    lower_raw = raw.lower()
    for opt in options:
        if str(opt).lower() == lower_raw:
            return opt, None
    raw_slug = status_slug(raw)
    for opt in options:
        if status_slug(opt) == raw_slug:
            return opt, None
    return None, f"Invalid value '{raw}' for {indicator}. Allowed: {', '.join(options)}"
