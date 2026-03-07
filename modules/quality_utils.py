import os
import re

try:
    import yaml
except Exception:
    yaml = None

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
USER_SETTINGS_DIR = os.path.join(ROOT_DIR, "User", "Settings")


def _slugify(value: str) -> str:
    raw = str(value or "").strip().lower()
    raw = re.sub(r"[^a-z0-9]+", "_", raw)
    return raw.strip("_")


def load_quality_options():
    if yaml is None:
        return []
    path = os.path.join(USER_SETTINGS_DIR, "quality_settings.yml")
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle) or {}
    except Exception:
        return []
    if not isinstance(data, dict):
        return []
    values = data.get("Quality_Settings")
    if isinstance(values, dict):
        return list(values.keys())
    for _, payload in data.items():
        if isinstance(payload, dict):
            return list(payload.keys())
    return []


def canonicalize_quality(value):
    if value is None:
        return None, None
    raw = str(value).strip()
    if not raw:
        return None, None
    options = load_quality_options()
    if not options:
        return raw, None
    for opt in options:
        if str(opt) == raw:
            return opt, None
    lower_raw = raw.lower()
    for opt in options:
        if str(opt).lower() == lower_raw:
            return opt, None
    raw_slug = _slugify(raw)
    for opt in options:
        if _slugify(opt) == raw_slug:
            return opt, None
    return None, f"Invalid quality '{raw}'. Allowed: {', '.join(options)}"
