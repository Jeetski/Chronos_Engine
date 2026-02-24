import os
import yaml
from Modules.ItemManager import get_user_dir

ASSOC_FILE = os.path.join(get_user_dir(), "Settings", "happiness_value_name_assoc.yml")
MAP_FILE = os.path.join(get_user_dir(), "Settings", "map_of_happiness.yml")

_CACHE = {"mtime": None, "data": None}


def _load_raw():
    if not os.path.exists(ASSOC_FILE):
        return {}
    try:
        with open(ASSOC_FILE, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        if isinstance(data, dict):
            return data
    except Exception:
        return {}
    return {}


def load_associations():
    try:
        mtime = os.path.getmtime(ASSOC_FILE) if os.path.exists(ASSOC_FILE) else None
    except Exception:
        mtime = None
    if _CACHE["data"] is not None and _CACHE["mtime"] == mtime:
        return _CACHE["data"]
    raw = _load_raw()
    assoc = raw.get("happiness") if isinstance(raw, dict) else None
    if not isinstance(assoc, dict):
        assoc = {}
    _CACHE["data"] = assoc
    _CACHE["mtime"] = mtime
    return assoc


def _load_happiness_keys():
    if not os.path.exists(MAP_FILE):
        return set()
    try:
        with open(MAP_FILE, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
    except Exception:
        return set()
    keys = set()
    for entry in data.get("map") or []:
        if not isinstance(entry, dict):
            continue
        key = entry.get("key") or entry.get("label")
        if key:
            keys.add(str(key).strip().lower())
    return keys


def _normalize_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return [v for v in value if v is not None and str(v).strip() != ""]
    return [value]


def _as_text(value):
    try:
        return str(value).strip().lower()
    except Exception:
        return ""


def _match_value(item_value, target_value, *, contains=False):
    if item_value is None:
        return False
    if isinstance(item_value, list):
        return any(_match_value(v, target_value, contains=contains) for v in item_value)
    item_text = _as_text(item_value)
    target_text = _as_text(target_value)
    if not item_text or not target_text:
        return False
    if contains:
        return target_text in item_text
    return item_text == target_text


def infer_happiness_values(item_type, data):
    assoc = load_associations()
    if not assoc:
        return []
    allowed = _load_happiness_keys()
    if not isinstance(data, dict):
        data = {}
    out = []
    for happiness_key, rules in assoc.items():
        if not isinstance(rules, dict) or not rules:
            continue
        if allowed:
            if str(happiness_key).strip().lower() not in allowed:
                continue
        matched = False
        for prop, values in rules.items():
            if values is None:
                continue
            prop_name = str(prop or "").strip().lower()
            if not prop_name:
                continue
            if prop_name == "type":
                for target in _normalize_list(values):
                    if _match_value(item_type, target):
                        matched = True
                        break
                if matched:
                    break
                continue
            contains = False
            if prop_name.endswith("_contains"):
                contains = True
                prop_name = prop_name[: -len("_contains")]
            item_val = None
            if prop_name in data:
                item_val = data.get(prop_name)
            else:
                for k in data.keys():
                    if str(k).lower() == prop_name:
                        item_val = data.get(k)
                        break
            if item_val is None:
                continue
            for target in _normalize_list(values):
                if _match_value(item_val, target, contains=contains):
                    matched = True
                    break
            if matched:
                break
        if matched:
            out.append(str(happiness_key))
    return out


def apply_happiness_associations(item_type, data):
    if not isinstance(data, dict):
        return data
    if data.get("happiness_auto") is False:
        return data
    inferred = infer_happiness_values(item_type, data)
    if not inferred:
        return data
    raw = data.get("happiness")
    if isinstance(raw, list):
        current = [str(v) for v in raw if v is not None and str(v).strip() != ""]
    elif isinstance(raw, str):
        current = [raw]
    else:
        current = []
    norm = {v.strip().lower() for v in current if v}
    changed = False
    for val in inferred:
        if str(val).strip().lower() not in norm:
            current.append(val)
            norm.add(str(val).strip().lower())
            changed = True
    if changed:
        data["happiness"] = current
    return data
