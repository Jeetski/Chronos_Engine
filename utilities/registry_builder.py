import ast
import json
import re
import os
import hashlib
from datetime import datetime

import yaml

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
COMMANDS_DIR = os.path.join(ROOT_DIR, "commands")
USER_DIR = os.path.join(ROOT_DIR, "user")
SETTINGS_DIR = os.path.join(USER_DIR, "settings")
REGISTRY_DIR = os.path.join(ROOT_DIR, "registry")

SKIP_ITEM_DIRS = {
    "archive",
    "backups",
    "data",
    "examples",
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
        {"slots": ["kw:sync", "choice*:matrix|core|events|behavior|journal|memory|trends|trends_digest|all"], "allow_properties": False},
        {"slots": ["kw:trends"], "allow_properties": False},
    ],
    "register": [{"slots": ["choice:commands|items|settings|properties|trick|skills|all|full"], "allow_properties": False}],
    "trick": [
        {"slots": ["choice:list|show|actions|where|refresh"], "allow_properties": True},
    ],
    "skills": [
        {"slots": ["choice:list|show|where|refresh"], "allow_properties": True},
    ],
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


def _humanize_component_label(name: str) -> str:
    """Convert module/folder names into menu-friendly labels."""
    raw = str(name or "").strip()
    if not raw:
        return ""
    s = re.sub(r"[_\-]+", " ", raw)
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", s)
    s = re.sub(r"\s+", " ", s).strip()

    acronyms = {"ai", "api", "cli", "aduc", "mp3", "ui", "ux"}
    words = []
    for token in s.split(" "):
        t = token.strip()
        if not t:
            continue
        low = t.lower()
        if low in acronyms:
            words.append(low.upper())
            continue
        if low == "nia":
            words.append("Nia")
            continue
        if low == "big5":
            words.extend(["Big", "5"])
            continue
        m = re.fullmatch(r"([a-z]+)(\d+)", low)
        if m:
            head, num = m.group(1), m.group(2)
            if head == "big":
                words.extend(["Big", num])
            else:
                words.append(head.capitalize() + num)
            continue
        if low.isdigit():
            words.append(low)
            continue
        words.append(low.capitalize())
    return " ".join(words)


def _write_json(path: str, data: dict) -> None:
    _ensure_dir(os.path.dirname(path))
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=True)


def _read_json(path: str):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def _read_yaml(path: str):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return yaml.safe_load(fh) or {}
    except Exception:
        return {}


def _read_text(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except Exception:
        return ""


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


def _canonical_command_name(command_name: str) -> str:
    name = str(command_name or "").strip()
    if not name:
        return ""
    name = name.replace("-", "_").replace(" ", "_")
    name = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    name = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", name)
    name = name.lower()
    name = re.sub(r"_+", "_", name)
    return name.strip("_")


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
    # Core aliases in modules/console.py
    console_path = os.path.join(ROOT_DIR, "modules", "console.py")
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
                                        src = _canonical_command_name(k.value)
                                        dst = _canonical_command_name(v.value)
                                        if src and dst:
                                            aliases[src] = dst
    except Exception:
        pass
    # User aliases
    aliases_path = os.path.join(SETTINGS_DIR, "aliases.yml")
    data = _read_yaml(aliases_path)
    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(k, str) and isinstance(v, str):
                src = _canonical_command_name(k)
                dst = _canonical_command_name(v)
                if src and dst:
                    aliases[src] = dst
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
        name = _canonical_command_name(stem)
        if not name:
            continue
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



def build_settings_registry():
    """
    Fast scan of user/settings/ to build authoritative lists for UI/Autocomplete.
    """
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
    timer_data = _read_yaml(os.path.join(SETTINGS_DIR, "timer_profiles.yml"))
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
            "sleep": {"values": ["true", "false"]},
            "status": {"children": status_children},
        },
        "status_indicators": sorted({s.replace(" ", "_").lower() for s in status_indicators}),
        "timer_profiles": timer_profiles,
        "defaults_keys_by_type": defaults_keys_by_type,
    }


def build_property_registry():
    """
    Deep scan of ALL user items to discover ad-hoc property keys.
    This is slower and should be run less frequently.
    """
    unique_keys_by_type = {}
    
    if os.path.isdir(USER_DIR):
        for entry in os.scandir(USER_DIR):
            if not entry.is_dir():
                continue
            dir_name = entry.name
            if dir_name.lower() in SKIP_ITEM_DIRS:
                continue
            
            item_type = _infer_type_from_dir(dir_name)
            type_keys = unique_keys_by_type.setdefault(item_type, set())
            
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
                    
                    if isinstance(data, dict):
                        for k in data.keys():
                            type_keys.add(str(k).lower())

    # Convert sets to sorted lists
    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "keys_by_type": {k: sorted(v) for k, v in unique_keys_by_type.items()}
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


def write_settings_registry(path: str = None) -> str:
    if path is None:
        path = os.path.join(REGISTRY_DIR, "settings_registry.json")
    _write_json(path, build_settings_registry())
    return path


def write_property_registry(path: str = None) -> str:
    if path is None:
        path = os.path.join(REGISTRY_DIR, "property_registry.json")
    _write_json(path, build_property_registry())
    return path


def build_wizards_registry():
    """Auto-discover wizards by scanning Dashboard/Wizards directory."""
    wizards = []
    dashboard_dir = os.path.join(ROOT_DIR, "utilities", "dashboard")
    wizards_dir = os.path.join(dashboard_dir, "wizards")
    
    if not os.path.exists(wizards_dir):
        return {
            "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "wizards": []
        }
    
    for entry in os.scandir(wizards_dir):
        if not entry.is_dir():
            continue
        
        if entry.name.startswith(('.', '_')):
            continue
            
        wizard_name = entry.name
        label = _humanize_component_label(wizard_name)
        
        wizard_def = {
            "id": wizard_name.lower(),
            "label": label,
            "module": wizard_name,
            "enabled": True
        }
        
        # Check for optional metadata file
        meta_path = os.path.join(entry.path, "wizard.yml")
        if os.path.exists(meta_path):
            try:
                meta = _read_yaml(meta_path)
                if isinstance(meta, dict):
                    wizard_def.update(meta)
            except:
                pass
        
        wizards.append(wizard_def)
    
    wizards.sort(key=lambda w: w.get("label", w["id"]))
    
    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "wizards": wizards
    }

def build_themes_registry():
    themes = []
    
    # 1. Core Themes
    core_themes_dir = os.path.join(ROOT_DIR, "utilities", "dashboard", "themes")
    # 2. User Themes
    user_themes_dir = os.path.join(USER_DIR, "Themes")
    
    seen_ids = set()
    
    def scan_themes(directory, is_core=False):
        if not os.path.exists(directory):
            return
        for fn in os.listdir(directory):
            if fn.lower().endswith(".css"):
                # Try to parse comment header for metadata
                path = os.path.join(directory, fn)
                theme_def = {
                    "id": os.path.splitext(fn)[0],
                    "file": fn,
                    "label": os.path.splitext(fn)[0].replace("-", " ").title(),
                    "is_core": is_core
                }
                
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        css = f.read()
                        # Optional legacy header format:
                        # /* Theme: My Theme | Accent: #123456 | Desc: ... */
                        line1 = css.splitlines()[0] if css else ""
                        if line1.startswith("/*") and "Theme:" in line1:
                            parts = line1.strip("/* \n\t").split("|")
                            for p in parts:
                                if "Theme:" in p:
                                    theme_def["label"] = p.split(":")[1].strip()
                                if "Accent:" in p:
                                    theme_def["accent"] = p.split(":")[1].strip()
                                if "Desc:" in p:
                                    theme_def["description"] = p.split(":")[1].strip()

                        # Modern themes define accent via CSS variables.
                        if not theme_def.get("accent"):
                            m = re.search(r"--chronos-accent\s*:\s*([^;]+);", css)
                            if not m:
                                m = re.search(r"--accent\s*:\s*([^;]+);", css)
                            if m:
                                theme_def["accent"] = m.group(1).strip()
                except:
                   pass
                   
                if theme_def["id"] not in seen_ids:
                    themes.append(theme_def)
                    seen_ids.add(theme_def["id"])

    scan_themes(core_themes_dir, is_core=True)
    scan_themes(user_themes_dir, is_core=False)
    
    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "themes": themes
    }

def write_wizards_registry(path: str = None) -> str:
    if path is None:
        path = os.path.join(REGISTRY_DIR, "wizards_registry.json")
    _write_json(path, build_wizards_registry())
    return path

def write_themes_registry(path: str = None) -> str:
    if path is None:
        path = os.path.join(REGISTRY_DIR, "themes_registry.json")
    _write_json(path, build_themes_registry())
    return path


def build_widgets_registry():
    """Auto-discover widgets by scanning Dashboard/Widgets directory."""
    widgets = []
    dashboard_dir = os.path.join(ROOT_DIR, "utilities", "dashboard")
    widgets_dir = os.path.join(dashboard_dir, "widgets")
    
    if not os.path.exists(widgets_dir):
        return {
            "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "widgets": []
        }
    
    for entry in os.scandir(widgets_dir):
        if not entry.is_dir():
            continue
        
        # Skip hidden/system directories
        if entry.name.startswith(('.', '_')):
            continue
            
        widget_name = entry.name
        # Generate readable label from PascalCase
        import re
        label = re.sub(r'(?<!^)(?=[A-Z])', ' ', widget_name)
        
        widget_def = {
            "name": widget_name,
            "label": label,
            "module": widget_name,
            "dev": False
        }
        
        # Check for optional metadata file
        meta_path = os.path.join(entry.path, "widget.yml")
        if os.path.exists(meta_path):
            try:
                meta = _read_yaml(meta_path)
                if isinstance(meta, dict):
                    widget_def.update(meta)
            except:
                pass
        
        widgets.append(widget_def)
    
    widgets.sort(key=lambda w: w.get("label", w["name"]))
    
    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "widgets": widgets
    }


def build_views_registry():
    """Auto-discover views by scanning Dashboard/Views directory."""
    views = []
    dashboard_dir = os.path.join(ROOT_DIR, "utilities", "dashboard")
    views_dir = os.path.join(dashboard_dir, "views")
    
    if not os.path.exists(views_dir):
        return {
            "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "views": []
        }
    
    for entry in os.scandir(views_dir):
        if not entry.is_dir():
            continue
        
        if entry.name.startswith(('.', '_')):
            continue
            
        view_name = entry.name
        label = _humanize_component_label(view_name)
        
        view_def = {
            "name": view_name,
            "label": label,
            "module": view_name,
            "dev": False
        }
        
        # Check for optional metadata file
        meta_path = os.path.join(entry.path, "view.yml")
        if os.path.exists(meta_path):
            try:
                meta = _read_yaml(meta_path)
                if isinstance(meta, dict):
                    view_def.update(meta)
            except:
                pass
        
        views.append(view_def)
    
    views.sort(key=lambda v: v.get("label", v["name"]))
    
    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "views": views
    }


def build_panels_registry():
    """Auto-discover panels by scanning Dashboard/Panels directory."""
    panels = []
    dashboard_dir = os.path.join(ROOT_DIR, "utilities", "dashboard")
    panels_dir = os.path.join(dashboard_dir, "panels")
    
    if not os.path.exists(panels_dir):
        return {
            "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "panels": []
        }
    
    for entry in os.scandir(panels_dir):
        if not entry.is_dir():
            continue
        
        if entry.name.startswith(('.', '_')):
            continue
            
        panel_name = entry.name
        panel_def = {
            "id": panel_name.lower(),
            "label": panel_name,
            "module": panel_name,
            "enabled": True
        }
        
        # Check for optional metadata file
        meta_path = os.path.join(entry.path, "panel.yml")
        if os.path.exists(meta_path):
            try:
                meta = _read_yaml(meta_path)
                if isinstance(meta, dict):
                    panel_def.update(meta)
            except:
                pass
        
        panels.append(panel_def)
    
    panels.sort(key=lambda p: p.get("label", p["id"]))
    
    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "panels": panels
    }


def build_popups_registry():
    """Auto-discover popups by scanning Dashboard/Popups directory."""
    popups = []
    dashboard_dir = os.path.join(ROOT_DIR, "utilities", "dashboard")
    popups_dir = os.path.join(dashboard_dir, "popups")
    
    if not os.path.exists(popups_dir):
        return {
            "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "popups": []
        }
    
    for entry in os.scandir(popups_dir):
        if not entry.is_dir():
            continue
        
        if entry.name.startswith(('.', '_')):
            continue
            
        popup_name = entry.name
        popup_def = {
            "id": popup_name.lower(),
            "label": _humanize_component_label(popup_name),
            "module": popup_name,
            "enabled": True
        }
        
        # Check for optional metadata file
        meta_path = os.path.join(entry.path, "popup.yml")
        if os.path.exists(meta_path):
            try:
                meta = _read_yaml(meta_path)
                if isinstance(meta, dict):
                    popup_def.update(meta)
            except:
                pass
        
        popups.append(popup_def)
    
    popups.sort(key=lambda p: p.get("module", p["id"]))
    
    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "popups": popups
    }


def build_gadgets_registry():
    """Auto-discover gadgets by scanning Dashboard/Gadgets directory."""
    gadgets = []
    dashboard_dir = os.path.join(ROOT_DIR, "utilities", "dashboard")
    gadgets_dir = os.path.join(dashboard_dir, "gadgets")

    if not os.path.exists(gadgets_dir):
        return {
            "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "gadgets": []
        }

    for entry in os.scandir(gadgets_dir):
        if not entry.is_dir():
            continue
        if entry.name.startswith(('.', '_')):
            continue

        gadget_name = entry.name
        label = re.sub(r'(?<!^)(?=[A-Z])', ' ', gadget_name)
        gadget_def = {
            "id": gadget_name.lower(),
            "label": label,
            "module": gadget_name,
            "enabled": True,
            "order": 100,
        }

        meta_path = os.path.join(entry.path, "gadget.yml")
        if os.path.exists(meta_path):
            try:
                meta = _read_yaml(meta_path)
                if isinstance(meta, dict):
                    gadget_def.update(meta)
            except Exception:
                pass

        gadgets.append(gadget_def)

    gadgets.sort(key=lambda g: (int(g.get("order", 100)), str(g.get("label", g.get("id", ""))).lower()))

    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "gadgets": gadgets,
    }


def _read_markdown_heading_summary(path: str) -> tuple[str, str]:
    text = _read_text(path).strip()
    if not text:
        return "", ""
    heading = ""
    summary = ""
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if not heading and s.startswith("#"):
            heading = re.sub(r"^#+\s*", "", s).strip()
            continue
        if s.startswith("#"):
            continue
        summary = s
        break
    return heading, summary


def build_skills_registry():
    """Auto-discover agent skills from docs/agents/skills/*/skill.md."""
    skills = []
    skills_dir = os.path.join(ROOT_DIR, "docs", "agents", "skills")
    if not os.path.isdir(skills_dir):
        return {
            "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "skills": [],
        }

    for entry in os.scandir(skills_dir):
        if not entry.is_dir() or entry.name.startswith((".", "_")):
            continue
        skill_id = str(entry.name).strip().lower()
        if skill_id in {"templates", "template"}:
            # Keep both if present, but preserve deterministic ordering below.
            pass
        skill_path = os.path.join(entry.path, "skill.md")
        if not os.path.isfile(skill_path):
            continue
        heading, summary = _read_markdown_heading_summary(skill_path)
        label = heading or _humanize_component_label(skill_id)
        skills.append({
            "id": skill_id,
            "label": label,
            "summary": summary,
            "path": os.path.relpath(skill_path, ROOT_DIR).replace("\\", "/"),
        })

    skills.sort(key=lambda s: str(s.get("label") or s.get("id") or "").lower())
    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "skills": skills,
    }


def _iter_trick_manifest_paths():
    dash_dir = os.path.join(ROOT_DIR, "utilities", "dashboard")
    roots = ("widgets", "views", "panels", "popups", "gadgets", "wizards")
    paths = []
    for root_name in roots:
        root = os.path.join(dash_dir, root_name)
        if not os.path.isdir(root):
            continue
        for entry in os.scandir(root):
            if not entry.is_dir() or entry.name.startswith((".", "_")):
                continue
            p = os.path.join(entry.path, "trick.yml")
            if os.path.exists(p):
                paths.append(p)
    return sorted(paths, key=lambda x: x.lower())


def _trick_registry_input_hash(manifest_paths):
    hasher = hashlib.sha256()
    hasher.update(b"trick_registry_v2\n")
    for p in manifest_paths:
        rel = os.path.relpath(p, ROOT_DIR).replace("\\", "/")
        hasher.update(rel.encode("utf-8", errors="replace"))
        hasher.update(b"\n")
        try:
            with open(p, "rb") as fh:
                hasher.update(fh.read())
        except Exception:
            pass
        hasher.update(b"\n")
    return hasher.hexdigest()


def build_trick_registry(force: bool = False):
    """
    Build TRICK registry from dashboard component trick.yml manifests.

    Caches by input hash in registry/trick_registry.meta.json to avoid
    unnecessary rebuilds when manifests are unchanged.
    """
    reg_path = os.path.join(REGISTRY_DIR, "trick_registry.json")
    meta_path = os.path.join(REGISTRY_DIR, "trick_registry.meta.json")

    manifests = _iter_trick_manifest_paths()
    input_hash = _trick_registry_input_hash(manifests)

    if not force and os.path.exists(reg_path) and os.path.exists(meta_path):
        meta = _read_json(meta_path) or {}
        if str(meta.get("input_hash") or "") == input_hash:
            cached = _read_json(reg_path) or {}
            if isinstance(cached, dict) and cached:
                return cached

    surfaces = []
    elements_index = {}

    for path in manifests:
        data = _read_yaml(path)
        if not isinstance(data, dict):
            continue
        stype = str(data.get("type") or "").strip().lower()
        sname = str(data.get("name") or "").strip().lower()
        if stype not in {"widget", "view", "panel", "popup", "gadget", "wizard"}:
            continue
        if not sname:
            continue
        surface_id = f"{stype}.{sname}"
        module = str(data.get("module") or sname).strip()
        label = str(data.get("label") or _humanize_component_label(sname)).strip()
        root_id = str(data.get("root") or surface_id).strip().lower()

        rows = data.get("elements") if isinstance(data.get("elements"), list) else []
        norm_rows = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            elem_name = str(row.get("name") or row.get("id") or "").strip().lower()
            if not elem_name:
                continue
            full_id = f"{surface_id}.{elem_name}"
            kind = str(row.get("kind") or "unknown").strip().lower() or "unknown"
            actions = row.get("actions") if isinstance(row.get("actions"), list) else []
            actions = [str(a).strip().lower() for a in actions if str(a).strip()]
            if "highlight" not in actions:
                actions.append("highlight")
            value_type = str(row.get("value_type") or "").strip().lower() or None
            desc = str(row.get("description") or "").strip() or None
            element_def = {
                "id": full_id,
                "name": elem_name,
                "kind": kind,
                "actions": actions,
                "value_type": value_type,
                "description": desc,
                "source": os.path.relpath(path, ROOT_DIR).replace("\\", "/"),
            }
            norm_rows.append(element_def)
            elements_index[full_id] = element_def

        surfaces.append({
            "id": surface_id,
            "type": stype,
            "name": sname,
            "label": label,
            "module": module,
            "root": root_id,
            "elements": norm_rows,
            "source": os.path.relpath(path, ROOT_DIR).replace("\\", "/"),
        })

    surfaces.sort(key=lambda s: s.get("id", ""))
    out = {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "input_hash": input_hash,
        "surfaces": surfaces,
        "elements": elements_index,
    }
    _write_json(reg_path, out)
    _write_json(meta_path, {
        "input_hash": input_hash,
        "generated_at": out["generated_at"],
        "manifest_count": len(manifests),
    })
    return out


def write_trick_registry(path: str = None) -> str:
    if path is None:
        path = os.path.join(REGISTRY_DIR, "trick_registry.json")
    data = build_trick_registry(force=False)
    _write_json(path, data)
    return path


def write_skills_registry(path: str = None) -> str:
    if path is None:
        path = os.path.join(REGISTRY_DIR, "skills_registry.json")
    _write_json(path, build_skills_registry())
    return path




