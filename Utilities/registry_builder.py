import ast
import json
import os
from datetime import datetime

import yaml

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
COMMANDS_DIR = os.path.join(ROOT_DIR, "Commands")
USER_DIR = os.path.join(ROOT_DIR, "User")
SETTINGS_DIR = os.path.join(USER_DIR, "Settings")
REGISTRY_DIR = os.path.join(ROOT_DIR, "Registry")

SKIP_ITEM_DIRS = {
    "archive",
    "backups",
    "data",
    "exports",
    "logs",
    "media",
    "profile",
    "reviews",
    "schedules",
    "scripts",
    "settings",
}

KNOWN_SUBCOMMANDS = {
    "today": ["reschedule", "routines", "subroutines", "microroutines"],
    "tomorrow": [],
    "this": [],
    "next": [],
    "review": ["daily", "weekly", "monthly", "export", "open"],
    "did": [],
}

KNOWN_SUBCOMMAND_GROUPS = {
    "timer": {"profiles": ["list", "view", "save", "delete"]},
}

STOP_SUBCOMMANDS = {
    "to",
    "yes",
    "no",
}

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
]

COMMAND_SYNTAX_OVERRIDES = {
    "new": [{"slots": ["item_type", "item_name"], "allow_properties": True}],
    "create": [{"slots": ["item_type", "item_name"], "allow_properties": True}],
    "set": [
        {"slots": ["kw:var", "value"], "allow_properties": False},
        {"slots": ["item_type", "item_name"], "allow_properties": True},
    ],
    "get": [{"slots": ["item_type", "item_name", "item_property"], "allow_properties": True}],
    "remove": [{"slots": ["item_type", "item_name", "item_property"], "allow_properties": False}],
    "copy": [
        {"slots": ["item_type", "item_name"], "allow_properties": True},
        {"slots": ["item_type", "item_name", "new_name"], "allow_properties": True},
    ],
    "rename": [{"slots": ["item_type", "item_name", "new_name"], "allow_properties": True}],
    "move": [
        {"slots": ["item_type", "item_name"], "allow_properties": True},
        {"slots": ["item_type", "item_name", "new_name"], "allow_properties": True},
    ],
    "delete": [{"slots": ["item_type", "item_name"], "allow_properties": True}],
    "view": [{"slots": ["item_type", "item_name"], "allow_properties": False}],
    "edit": [{"slots": ["item_type", "item_name"], "allow_properties": False}],
    "archive": [{"slots": ["item_type", "item_name"], "allow_properties": False}],
    "miss": [{"slots": ["item_type", "item_name"], "allow_properties": False}],
    "track": [{"slots": ["item_type", "item_name"], "allow_properties": False}],
    "complete": [
        {
            "slots": ["item_type", "item_name"],
            "allow_properties": True,
            "property_keys": ["minutes", "quality", "count", "attended", "no_show"],
        }
    ],
    "append": [{"slots": ["item_type", "item_name", "value"], "allow_properties": True}],
    "list": [
        {
            "slots": ["item_type"],
            "allow_properties": True,
            "property_keys": ["sort_by", "reverse_sort"],
            "pipeline_keyword": "then",
        }
    ],
    "find": [{"slots": ["item_type", "value"], "allow_properties": True}],
    "count": [{"slots": ["item_type"], "allow_properties": True}],
    "status": [
        {
            "slots": [],
            "allow_properties": True,
            "property_keys": ["status_indicators"],
        }
    ],
    "review": [
        {"slots": ["choice:daily|weekly|monthly"], "allow_properties": False},
        {"slots": ["choice:daily|weekly|monthly", "value"], "allow_properties": False},
        {"slots": ["kw:export", "choice:daily|weekly|monthly", "value"], "allow_properties": False},
        {"slots": ["kw:open", "choice:daily|weekly|monthly", "value"], "allow_properties": False},
    ],
    "today": [
        {"slots": [], "allow_properties": False},
        {"slots": ["choice:reschedule|routines|subroutines|microroutines"], "allow_properties": False},
    ],
    "tomorrow": [
        {"slots": [], "allow_properties": True, "property_keys": ["days"]},
    ],
    "this": [{"slots": ["weekday"], "allow_properties": False}],
    "next": [
        {"slots": ["kw:day"], "allow_properties": False},
        {"slots": ["weekday"], "allow_properties": False},
        {"slots": ["ordinal", "month"], "allow_properties": False},
        {"slots": ["ordinal", "kw:of", "month"], "allow_properties": False},
    ],
    "timer": [
        {
            "slots": ["kw:start", "timer_profile"],
            "allow_properties": True,
            "property_keys": ["type", "name", "cycles", "auto_advance"],
        },
        {"slots": ["kw:pause"], "allow_properties": False},
        {"slots": ["kw:resume"], "allow_properties": False},
        {"slots": ["kw:stop"], "allow_properties": False},
        {"slots": ["kw:status"], "allow_properties": False},
        {"slots": ["kw:confirm", "choice:yes|no"], "allow_properties": False},
        {"slots": ["kw:profiles", "choice:list|view|save|delete"], "allow_properties": False},
        {"slots": ["kw:profiles", "kw:view", "timer_profile"], "allow_properties": False},
        {"slots": ["kw:profiles", "kw:delete", "timer_profile"], "allow_properties": False},
        {
            "slots": ["kw:profiles", "kw:save", "value"],
            "allow_properties": True,
        },
    ],
    "sequence": [
        {"slots": ["kw:status"], "allow_properties": False},
        {"slots": ["kw:sync", "choice*:matrix|core|events|memory|trends|trends_digest|all"], "allow_properties": False},
        {"slots": ["kw:trends"], "allow_properties": False},
    ],
    "register": [{"slots": ["choice:commands|items|properties|all"], "allow_properties": False}],
    "filter": [
        {"slots": ["kw:all"], "allow_properties": False},
        {"slots": ["kw:off"], "allow_properties": False},
        {"slots": ["item_type"], "allow_properties": True},
    ],
    "bulk": [
        {
            "slots": ["choice:set|append|remove|mark|trim|change|cut|did|delete|copy|move"],
            "allow_properties": True,
            "property_keys": ["dry", "run", "limit", "force", "no_macros"],
        }
    ],
    "run": [{"slots": ["path"], "allow_properties": False}],
    "if": [{"slots": ["value"], "allow_properties": False}],
    "vars": [{"slots": [], "allow_properties": False}],
    "unset": [{"slots": ["kw:var", "value"], "allow_properties": False}],
    "pause": [{"slots": ["value"], "allow_properties": False}],
}


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _write_json(path: str, data: dict) -> None:
    _ensure_dir(os.path.dirname(path))
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=True)


def _read_yaml(path: str):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return yaml.safe_load(fh) or {}
    except Exception:
        return {}


def _extract_help_text(path: str):
    try:
        src = open(path, "r", encoding="utf-8").read()
    except Exception:
        return None
    try:
        tree = ast.parse(src, filename=path)
    except Exception:
        return None
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "get_help_message":
            for child in ast.walk(node):
                if isinstance(child, ast.Return):
                    val = child.value
                    if isinstance(val, ast.Constant) and isinstance(val.value, str):
                        return val.value
                    if isinstance(val, ast.JoinedStr):
                        parts = []
                        for part in val.values:
                            if isinstance(part, ast.Constant) and isinstance(part.value, str):
                                parts.append(part.value)
                        if parts:
                            return "".join(parts)
            break
    return None


def _extract_usage_lines(help_text: str):
    if not help_text:
        return []
    lines = help_text.splitlines()
    usage_lines = []
    capturing = False
    for line in lines:
        raw = line.rstrip()
        stripped = raw.strip()
        if not stripped:
            if capturing:
                break
            continue
        if stripped.lower().startswith("usage:"):
            capturing = True
            usage_lines.append(stripped[len("usage:"):].strip())
            continue
        if capturing:
            if stripped.lower().startswith(("description:", "example", "examples:", "notes:")):
                break
            usage_lines.append(stripped)
    return [ln for ln in usage_lines if ln]


def _normalize_token(token: str) -> str:
    return token.strip().strip("[]")

def _strip_bracketed(text: str) -> str:
    import re
    out = re.sub(r"\[[^\]]*\]", " ", text)
    out = re.sub(r"<[^>]*>", " ", out)
    return out


def _is_valid_subtoken(token: str) -> bool:
    if not token:
        return False
    if token in STOP_SUBCOMMANDS:
        return False
    if token.startswith(("-", "[")) or ":" in token:
        return False
    if any(ch in token for ch in "<>[]()"):
        return False
    if token.isdigit():
        return False
    if not token[0].isalpha():
        return False
    for ch in token:
        if not (ch.isalnum() or ch in {"_", "-"}):
            return False
    return True


def _extract_subcommands(command: str, usage_lines):
    subs = set()
    groups = {}
    cmd = command.lower()
    for line in usage_lines:
        if not line.lower().startswith(cmd):
            continue
        rest = _strip_bracketed(line[len(cmd):].strip())
        if not rest:
            continue
        segments = [seg.strip() for seg in rest.split("|")]
        if not segments:
            continue
        base_tokens = segments[0].split()
        base = _normalize_token(base_tokens[0]) if base_tokens else ""
        if not _is_valid_subtoken(base):
            continue
        if base in ("profiles",) and len(base_tokens) > 1:
            subs.add(base)
            group = { _normalize_token(base_tokens[1]) }
            for seg in segments[1:]:
                parts = seg.split()
                if parts:
                    group.add(_normalize_token(parts[0]))
            groups[base] = sorted(g for g in group if _is_valid_subtoken(g))
            continue
        subs.add(base)
        for seg in segments[1:]:
            parts = seg.split()
            if parts:
                token = _normalize_token(parts[0])
                if _is_valid_subtoken(token):
                    subs.add(token)
    return sorted(subs), groups


def _parse_usage_slots(command: str, usage_lines):
    patterns = []
    for line in usage_lines or []:
        if not line.lower().startswith(command):
            continue
        tail = line[len(command):].strip()
        if not tail:
            patterns.append({"slots": [], "allow_properties": False})
            continue
        tokens = tail.split()
        slots = []
        allow_properties = False
        property_keys = set()
        for raw in tokens:
            tok = raw.strip().strip(",")
            optional = tok.startswith("[") and tok.endswith("]")
            if optional:
                tok = tok[1:-1]
            if not tok:
                continue
            if "..." in tok:
                if not optional:
                    slots.append("value")
                continue
            if ":" in tok:
                key = tok.split(":", 1)[0].strip("[]")
                if key:
                    property_keys.add(key)
                allow_properties = True
                if optional:
                    continue
            if tok.startswith("<") and tok.endswith(">"):
                label = tok[1:-1].lower()
                if label in ("type", "item_type"):
                    slots.append("item_type")
                elif label in ("name", "item_name"):
                    slots.append("item_name")
                elif label in ("property_key", "property"):
                    slots.append("item_property")
                elif label in ("command",):
                    slots.append("command")
                elif label in ("weekday",):
                    slots.append("weekday")
                elif label in ("month",):
                    slots.append("month")
                elif label in ("ordinal",):
                    slots.append("ordinal")
                elif label in ("profile",):
                    slots.append("timer_profile")
                elif "path" in label or "file" in label or "script" in label:
                    slots.append("path")
                else:
                    slots.append("value")
                continue
            if "|" in tok:
                slots.append(f"choice:{tok}")
                continue
            slots.append(f"kw:{tok.lower()}")
        if slots or allow_properties:
            entry = {"slots": slots, "allow_properties": allow_properties}
            if property_keys:
                entry["property_keys"] = sorted(property_keys)
            patterns.append(entry)
    return patterns


def _infer_type_from_dir(dir_name: str) -> str:
    slug = dir_name.replace(" ", "_").lower()
    if slug == "people":
        return "person"
    if slug == "canvas_boards":
        return "canvas_board"
    if slug.endswith("ies"):
        return slug[:-3] + "y"
    if slug.endswith("s"):
        return slug[:-1]
    return slug


def _load_command_aliases():
    aliases = {}
    # Core aliases in Modules/Console.py
    console_path = os.path.join(ROOT_DIR, "Modules", "Console.py")
    try:
        tree = ast.parse(open(console_path, "r", encoding="utf-8").read(), filename=console_path)
        for node in tree.body:
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id == "COMMAND_ALIASES":
                        if isinstance(node.value, ast.Dict):
                            for k, v in zip(node.value.keys, node.value.values):
                                if isinstance(k, ast.Constant) and isinstance(v, ast.Constant):
                                    if isinstance(k.value, str) and isinstance(v.value, str):
                                        aliases[k.value.lower()] = v.value.lower()
    except Exception:
        pass
    # User aliases
    aliases_path = os.path.join(SETTINGS_DIR, "aliases.yml")
    data = _read_yaml(aliases_path)
    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(k, str) and isinstance(v, str):
                aliases[k.lower()] = v.lower()
    return aliases


def build_command_registry():
    commands = {}
    aliases = _load_command_aliases()
    for fn in os.listdir(COMMANDS_DIR):
        if not fn.lower().endswith(".py"):
            continue
        if fn == "__init__.py":
            continue
        stem = os.path.splitext(fn)[0]
        name = stem.lower()
        help_text = _extract_help_text(os.path.join(COMMANDS_DIR, fn))
        usage_lines = _extract_usage_lines(help_text or "")
        subcommands, sub_groups = _extract_subcommands(name, usage_lines)
        if name in KNOWN_SUBCOMMANDS:
            subcommands = sorted(set(subcommands).union(KNOWN_SUBCOMMANDS[name]))
        groups = KNOWN_SUBCOMMAND_GROUPS.get(name, {})
        if sub_groups:
            groups = {**groups, **sub_groups}
        syntax = COMMAND_SYNTAX_OVERRIDES.get(name)
        if syntax is None:
            syntax = _parse_usage_slots(name, usage_lines)
        cmd_aliases = [a for a, target in aliases.items() if target == name]
        commands[name] = {
            "aliases": sorted(set(cmd_aliases)),
            "subcommands": subcommands,
            "subcommand_groups": groups,
            "usage": usage_lines,
            "syntax": syntax or [],
        }
    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "commands": commands,
        "aliases": aliases,
    }


def build_item_registry():
    item_types = set()
    item_names_by_type = {}
    if not os.path.isdir(USER_DIR):
        return {
            "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "item_types": [],
            "item_names_by_type": {},
        }

    for entry in os.scandir(USER_DIR):
        if not entry.is_dir():
            continue
        dir_name = entry.name
        if dir_name.lower() in SKIP_ITEM_DIRS:
            continue
        item_type = _infer_type_from_dir(dir_name)
        item_types.add(item_type)
        names = item_names_by_type.setdefault(item_type, set())
        for root, _, files in os.walk(entry.path):
            for filename in files:
                if not filename.lower().endswith((".yml", ".yaml")):
                    continue
                path = os.path.join(root, filename)
                try:
                    with open(path, "r", encoding="utf-8") as fh:
                        data = yaml.safe_load(fh) or {}
                except Exception:
                    continue
                if isinstance(data, dict) and data.get("name"):
                    names.add(str(data.get("name")))
                else:
                    names.add(os.path.splitext(filename)[0])

    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "item_types": sorted(item_types),
        "item_names_by_type": {k: sorted(v) for k, v in item_names_by_type.items()},
    }


def build_property_registry():
    # Status indicators + values
    status_settings = _read_yaml(os.path.join(SETTINGS_DIR, "status_settings.yml"))
    status_defs = status_settings.get("Status_Settings") if isinstance(status_settings, dict) else []
    status_indicators = []
    for entry in status_defs or []:
        if isinstance(entry, dict) and entry.get("Name"):
            status_indicators.append(str(entry["Name"]))

    status_children = {}
    for name in status_indicators:
        slug = name.replace(" ", "_").lower()
        path = os.path.join(SETTINGS_DIR, f"{slug}_settings.yml")
        data = _read_yaml(path)
        if isinstance(data, dict) and len(data) == 1:
            only_val = next(iter(data.values()))
            if isinstance(only_val, dict):
                data = only_val
        if isinstance(data, dict):
            status_children[slug] = sorted(str(k) for k in data.keys())

    # Category / priority / quality
    categories = []
    cat_data = _read_yaml(os.path.join(SETTINGS_DIR, "category_settings.yml"))
    if isinstance(cat_data, dict) and isinstance(cat_data.get("Category_Settings"), dict):
        categories = sorted(str(k) for k in cat_data["Category_Settings"].keys())

    priorities = []
    pr_data = _read_yaml(os.path.join(SETTINGS_DIR, "priority_settings.yml"))
    if isinstance(pr_data, dict) and isinstance(pr_data.get("Priority_Settings"), dict):
        priorities = sorted(str(k) for k in pr_data["Priority_Settings"].keys())

    qualities = []
    q_data = _read_yaml(os.path.join(SETTINGS_DIR, "quality_settings.yml"))
    if isinstance(q_data, dict) and isinstance(q_data.get("Quality_Settings"), dict):
        qualities = sorted(str(k) for k in q_data["Quality_Settings"].keys())

    # Timer profiles
    timer_profiles = []
    timer_data = _read_yaml(os.path.join(SETTINGS_DIR, "Timer_Profiles.yml"))
    if isinstance(timer_data, dict):
        timer_profiles = sorted(str(k) for k in timer_data.keys())

    # Defaults keys by type
    defaults_keys_by_type = {}
    if os.path.isdir(SETTINGS_DIR):
        for fn in os.listdir(SETTINGS_DIR):
            if not fn.lower().endswith("_defaults.yml"):
                continue
            path = os.path.join(SETTINGS_DIR, fn)
            data = _read_yaml(path)
            if not isinstance(data, dict):
                continue
            stem = os.path.splitext(fn)[0].lower()
            item_type = stem[:-9] if stem.endswith("_defaults") else stem
            defaults_keys_by_type[item_type] = sorted({str(k).lower() for k in data.keys()})

    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "properties": {
            "category": {"values": categories},
            "priority": {"values": priorities},
            "quality": {"values": qualities},
            "status": {"children": status_children},
        },
        "status_indicators": sorted({s.replace(" ", "_").lower() for s in status_indicators}),
        "timer_profiles": timer_profiles,
        "defaults_keys_by_type": defaults_keys_by_type,
    }


def write_command_registry(path: str = None) -> str:
    if path is None:
        path = os.path.join(REGISTRY_DIR, "command_registry.json")
    _write_json(path, build_command_registry())
    return path


def write_item_registry(path: str = None) -> str:
    if path is None:
        path = os.path.join(REGISTRY_DIR, "item_registry.json")
    _write_json(path, build_item_registry())
    return path


def write_property_registry(path: str = None) -> str:
    if path is None:
        path = os.path.join(REGISTRY_DIR, "property_registry.json")
    _write_json(path, build_property_registry())
    return path
