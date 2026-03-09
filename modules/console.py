import os

import sys
import importlib.util
import time
import shlex
import json
import re
import io
from contextlib import redirect_stdout

try:
    import yaml  # type: ignore
except Exception:
    yaml = None

# --- I/O Encoding Safety (Windows consoles often default to cp1252) ---
try:
    # Prefer UTF-8 to avoid UnicodeEncodeError when printing symbols/emojis
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# --- Console Setup ---
# Set console background to blue with white text (Windows only)
if os.name == "nt":
    # Set console code page to UTF-8 for broader character support
    try:
        os.system("chcp 65001 > nul")
    except Exception:
        pass
    # Set title (colors handled later via console styling if available)
    os.system("title Chronos Engine Alpha v0.2")
else:
    os.system("clear")

# --- Path Configuration ---
# Determine the root directory of the Chronos Engine project
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CONSOLE_SETTINGS_PATH = os.path.join(ROOT_DIR, "user", "settings", "console_settings.yml")

# Add ROOT_DIR to sys.path to allow absolute imports from project root
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

# Define paths for commands and modules directories
COMMANDS_DIR = os.path.join(ROOT_DIR, "commands")
MODULES_DIR = os.path.join(ROOT_DIR, "modules")
USER_PLUGINS_DIR = os.path.join(ROOT_DIR, "user", "plugins")
PLUGINS_CONFIG_PATH = os.path.join(USER_PLUGINS_DIR, "plugins.yml")

# Ensure both COMMANDS_DIR and MODULES_DIR are in sys.path
# This allows Python to find command and module files when imported dynamically
if COMMANDS_DIR not in sys.path:
    sys.path.insert(0, COMMANDS_DIR)
if MODULES_DIR not in sys.path:
    sys.path.insert(0, MODULES_DIR)

PLUGIN_ID_RE = re.compile(r"^[a-z0-9_-]+$")
_PLUGIN_COMMANDS = {}
_PLUGIN_ALIAS_MAP = {}
_PLUGIN_COMMAND_META = {}
_PLUGIN_BOOT_LOG = {
    "loaded": [],
    "disabled": [],
    "failed": [],
}
_PLUGINS_LOADED = False

# Now that MODULES_DIR is on sys.path, import Variables helper
from modules import variables as Variables
from modules import console_style
from modules.logger import Logger

# Suppress pygame's support prompt in non-interactive command usage.
os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")

try:
    from modules import sound_fx as SoundFX
except Exception:
    SoundFX = None  # type: ignore

try:
    from prompt_toolkit import PromptSession
    from prompt_toolkit.completion import Completer, Completion
    from prompt_toolkit.key_binding import KeyBindings
    from prompt_toolkit.auto_suggest import AutoSuggest, Suggestion
    from prompt_toolkit.history import InMemoryHistory
    from prompt_toolkit.styles import Style
except Exception:
    PromptSession = None

# --- Console Color integration ---
def _safe_load_yaml(path):
    try:
        if yaml is None:
            return None
        if not os.path.exists(path):
            return None
        with open(path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except Exception:
        return None


def _to_bool_token(value):
    if isinstance(value, bool):
        return value
    s = str(value or "").strip().lower()
    if s in {"true", "1", "yes", "on"}:
        return True
    if s in {"false", "0", "no", "off"}:
        return False
    return None


def _load_console_settings():
    defaults = {
        "prompt_toolkit_default": False,
        "autocomplete_enabled": True,
        "show_startup_banner": False,
        "run_startup_sync": False,
        "play_startup_sound": False,
    }
    data = _safe_load_yaml(CONSOLE_SETTINGS_PATH)
    if isinstance(data, dict):
        out = dict(defaults)
        out.update(data)
        return out
    return defaults


def _extract_runtime_options(argv_tokens):
    """
    Parse runtime-only key:value tokens from argv without using -- switches.
    Supported:
      prompt_toolkit:true|false
      autocomplete:true|false
      startup_banner:true|false
      startup_sync:true|false
      startup_sound:true|false
    Returns: (options_dict, remaining_tokens)
    """
    options = {
        "prompt_toolkit": None,
        "autocomplete": None,
        "startup_banner": None,
        "startup_sync": None,
        "startup_sound": None,
    }
    remaining = []
    for tok in (argv_tokens or []):
        t = str(tok or "").strip()
        if not _is_property_token(t):
            remaining.append(tok)
            continue
        key, _sep, val = t.partition(":")
        k = key.strip().lower()
        b = _to_bool_token(val)
        if k in {"prompt_toolkit", "ptk"} and b is not None:
            options["prompt_toolkit"] = b
            continue
        if k in {"autocomplete", "autosuggest", "suggestions"} and b is not None:
            options["autocomplete"] = b
            continue
        if k in {"startup_banner", "banner"} and b is not None:
            options["startup_banner"] = b
            continue
        if k in {"startup_sync", "sync_on_startup"} and b is not None:
            options["startup_sync"] = b
            continue
        if k in {"startup_sound", "sound_on_startup"} and b is not None:
            options["startup_sound"] = b
            continue
        remaining.append(tok)
    return options, remaining


def _normalize_plugin_id(raw_id):
    pid = str(raw_id or "").strip().lower()
    if not pid:
        return ""
    if not PLUGIN_ID_RE.match(pid):
        return ""
    return pid


def _path_is_within(base_dir, target_path):
    try:
        base_real = os.path.realpath(base_dir)
        target_real = os.path.realpath(target_path)
        common = os.path.commonpath([base_real, target_real])
        return common == base_real
    except Exception:
        return False


def _iter_plugin_entries(config):
    if isinstance(config, dict):
        entries = config.get("plugins")
        if isinstance(entries, list):
            return entries
    if isinstance(config, list):
        return config
    return []


def _plugin_contract_to_maps(module, register_result):
    commands_map = {}
    aliases_map = {}
    help_map = {}

    if isinstance(register_result, dict):
        commands_map = register_result.get("commands") or {}
        aliases_map = register_result.get("aliases") or {}
        help_map = register_result.get("help") or {}

    if not commands_map:
        commands_map = getattr(module, "COMMANDS", {}) or {}
    if not aliases_map:
        aliases_map = getattr(module, "ALIASES", {}) or {}
    if not help_map:
        help_map = getattr(module, "HELP", {}) or {}

    if not isinstance(commands_map, dict):
        commands_map = {}
    if not isinstance(aliases_map, dict):
        aliases_map = {}
    if not isinstance(help_map, dict):
        help_map = {}

    return commands_map, aliases_map, help_map


def _load_plugins(force=False):
    global _PLUGINS_LOADED
    if _PLUGINS_LOADED and not force:
        return _PLUGIN_BOOT_LOG

    _PLUGIN_COMMANDS.clear()
    _PLUGIN_ALIAS_MAP.clear()
    _PLUGIN_COMMAND_META.clear()
    _PLUGIN_BOOT_LOG["loaded"] = []
    _PLUGIN_BOOT_LOG["disabled"] = []
    _PLUGIN_BOOT_LOG["failed"] = []

    cfg = _safe_load_yaml(PLUGINS_CONFIG_PATH)
    entries = _iter_plugin_entries(cfg)

    for entry in entries:
        if not isinstance(entry, dict):
            continue

        raw_id = entry.get("id") or entry.get("plugin") or entry.get("name")
        plugin_id = _normalize_plugin_id(raw_id)
        if not plugin_id:
            _PLUGIN_BOOT_LOG["failed"].append({"id": str(raw_id or ""), "reason": "invalid_id"})
            continue

        enabled = _to_bool_token(entry.get("enabled"))
        if enabled is False:
            _PLUGIN_BOOT_LOG["disabled"].append(plugin_id)
            continue

        allow_override = bool(_to_bool_token(entry.get("allow_override")))
        plugin_dir = os.path.join(USER_PLUGINS_DIR, plugin_id)
        module_path = os.path.join(plugin_dir, "plugin.py")

        if not _path_is_within(USER_PLUGINS_DIR, plugin_dir):
            _PLUGIN_BOOT_LOG["failed"].append({"id": plugin_id, "reason": "path_not_allowed"})
            continue
        if not os.path.isfile(module_path):
            _PLUGIN_BOOT_LOG["failed"].append({"id": plugin_id, "reason": "missing_plugin_py"})
            continue

        try:
            spec = importlib.util.spec_from_file_location(
                f"chronos_plugin.{plugin_id}", module_path
            )
            if spec is None or spec.loader is None:
                raise RuntimeError("spec_load_failed")
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
        except Exception as e:
            _PLUGIN_BOOT_LOG["failed"].append({"id": plugin_id, "reason": f"import_error:{e}"})
            continue

        try:
            register_result = None
            if hasattr(mod, "register"):
                context = {
                    "root_dir": ROOT_DIR,
                    "user_dir": os.path.join(ROOT_DIR, "user"),
                    "commands_dir": COMMANDS_DIR,
                    "plugin_id": plugin_id,
                    "plugin_dir": plugin_dir,
                }
                try:
                    register_result = mod.register(context)
                except TypeError:
                    # Backward-compatible fallback for register() with no args.
                    register_result = mod.register()
            commands_map, aliases_map, help_map = _plugin_contract_to_maps(mod, register_result)
        except Exception as e:
            _PLUGIN_BOOT_LOG["failed"].append({"id": plugin_id, "reason": f"register_error:{e}"})
            continue

        loaded_commands = 0
        for raw_name, fn in commands_map.items():
            cmd_name = _canonical_command_name(raw_name)
            if not cmd_name or not callable(fn):
                continue
            has_core = bool(_get_command_file_stem(cmd_name))
            if has_core and not allow_override:
                continue
            _PLUGIN_COMMANDS[cmd_name] = fn
            h = help_map.get(raw_name)
            if h is None:
                h = help_map.get(cmd_name)
            if h is None:
                h = getattr(fn, "help_message", None) or getattr(fn, "__doc__", None)
            _PLUGIN_COMMAND_META[cmd_name] = {
                "plugin_id": plugin_id,
                "help": h,
            }
            loaded_commands += 1

        loaded_aliases = 0
        for raw_alias, raw_target in aliases_map.items():
            alias_name = _canonical_command_name(raw_alias)
            target_name = _canonical_command_name(raw_target)
            if not alias_name or not target_name:
                continue
            has_core_alias_target = bool(_get_command_file_stem(alias_name))
            if has_core_alias_target and not allow_override:
                continue
            _PLUGIN_ALIAS_MAP[alias_name] = target_name
            loaded_aliases += 1

        _PLUGIN_BOOT_LOG["loaded"].append({
            "id": plugin_id,
            "commands": loaded_commands,
            "aliases": loaded_aliases,
        })

    _PLUGINS_LOADED = True
    return _PLUGIN_BOOT_LOG


def _print_plugin_boot_log():
    log = _load_plugins()
    for item in log.get("loaded", []):
        pid = item.get("id")
        cmds = int(item.get("commands") or 0)
        aliases = int(item.get("aliases") or 0)
        print(f"Loaded plugin {pid} (commands:{cmds}, aliases:{aliases})")
    for pid in log.get("disabled", []):
        print(f"Skipped plugin {pid} (disabled)")
    for item in log.get("failed", []):
        print(f"Failed plugin {item.get('id')} ({item.get('reason')})")


def get_plugins_snapshot(force=False):
    log = _load_plugins(force=force)
    return {
        "loaded": list(log.get("loaded") or []),
        "disabled": list(log.get("disabled") or []),
        "failed": list(log.get("failed") or []),
        "commands": dict(_PLUGIN_COMMANDS or {}),
        "aliases": dict(_PLUGIN_ALIAS_MAP or {}),
        "command_meta": dict(_PLUGIN_COMMAND_META or {}),
    }


def get_plugin_help(command_name):
    try:
        _load_plugins()
        canonical = _canonical_command_name(command_name)
        if not canonical:
            return None
        meta = (_PLUGIN_COMMAND_META or {}).get(canonical) or {}
        help_val = meta.get("help")
        if callable(help_val):
            return str(help_val())
        if isinstance(help_val, str) and help_val.strip():
            return help_val.strip()
    except Exception:
        return None
    return None


REGISTRY_DIR = os.path.join(ROOT_DIR, "registry")
_REGISTRY_CACHE = {}
_REGISTRY_MTIMES = {}
_COMMAND_REGISTRY_CHECKED_AT = 0.0


def _latest_command_mtime():
    latest = None
    try:
        for root, _dirs, files in os.walk(COMMANDS_DIR):
            for fname in files:
                if not fname.lower().endswith(".py"):
                    continue
                path = os.path.join(root, fname)
                try:
                    mtime = os.path.getmtime(path)
                except Exception:
                    continue
                if latest is None or mtime > latest:
                    latest = mtime
    except Exception:
        return None
    return latest


def _maybe_refresh_command_registry():
    global _COMMAND_REGISTRY_CHECKED_AT
    now = time.time()
    if (now - _COMMAND_REGISTRY_CHECKED_AT) < 2.0:
        return
    _COMMAND_REGISTRY_CHECKED_AT = now
    try:
        reg_path = os.path.join(REGISTRY_DIR, "command_registry.json")
        reg_mtime = os.path.getmtime(reg_path) if os.path.exists(reg_path) else 0
        latest_cmd = _latest_command_mtime()
        if latest_cmd and latest_cmd > reg_mtime:
            from utilities import registry_builder
            registry_builder.write_command_registry()
    except Exception:
        pass


def _read_registry_json(name: str):
    path = os.path.join(REGISTRY_DIR, f"{name}_registry.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def _load_registry(name: str):
    path = os.path.join(REGISTRY_DIR, f"{name}_registry.json")
    try:
        mtime = os.path.getmtime(path)
    except Exception:
        mtime = None
    if name in _REGISTRY_CACHE and _REGISTRY_MTIMES.get(name) == mtime:
        return _REGISTRY_CACHE[name]
    data = _read_registry_json(name)
    _REGISTRY_CACHE[name] = data
    _REGISTRY_MTIMES[name] = mtime
    return data


def _load_registry_bundle():
    _maybe_refresh_command_registry()
    cmd = _load_registry("command")
    item = _load_registry("item")
    # Load settings (fast rules)
    settings = _load_registry("settings")
    # Load deep properties (slow scan)
    deep = _load_registry("property")
    
    # Start with defaults from settings
    defaults_by_type = settings.get("defaults_keys_by_type") or {}
    
    # Merge deep scan keys into defaults_by_type
    deep_keys = deep.get("keys_by_type") or {}
    for itype, keys_list in deep_keys.items():
        existing = set(defaults_by_type.get(itype, []))
        existing.update(keys_list)
        defaults_by_type[itype] = sorted(existing)

    return {
        "commands": cmd.get("commands") or {},
        "aliases": cmd.get("aliases") or {},
        "item_types": item.get("item_types") or [],
        "item_names_by_type": item.get("item_names_by_type") or {},
        "properties": settings.get("properties") or {},
        "status_indicators": settings.get("status_indicators") or [],
        "timer_profiles": settings.get("timer_profiles") or [],
        "defaults_keys_by_type": defaults_by_type,
    }


def _split_args_safe(text: str):
    try:
        return shlex.split(text)
    except Exception:
        return [t for t in text.split() if t]


def _normalize_token(token: str) -> str:
    return str(token or "").strip()


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


_COMMAND_FILE_MAP = {}
_COMMAND_FILE_MAP_MTIME = None


def _build_command_file_map():
    mapping = {}
    try:
        for fn in os.listdir(COMMANDS_DIR):
            if not fn.lower().endswith(".py"):
                continue
            if fn == "__init__.py":
                continue
            stem = os.path.splitext(fn)[0]
            canonical = _canonical_command_name(stem)
            if canonical and canonical not in mapping:
                mapping[canonical] = stem
    except Exception:
        return {}
    return mapping


def _get_command_file_stem(command_name: str):
    global _COMMAND_FILE_MAP_MTIME
    latest = _latest_command_mtime()
    if not _COMMAND_FILE_MAP or _COMMAND_FILE_MAP_MTIME != latest:
        _COMMAND_FILE_MAP.clear()
        _COMMAND_FILE_MAP.update(_build_command_file_map())
        _COMMAND_FILE_MAP_MTIME = latest
    canonical = _canonical_command_name(command_name)
    if not canonical:
        return None
    return _COMMAND_FILE_MAP.get(canonical)




def _get_property_values(registry: dict, key: str):
    if not key:
        return []
    props = registry.get("properties") or {}
    k = key.lower()
    if k in props and isinstance(props.get(k), dict) and isinstance(props.get(k).get("values"), list):
        return props.get(k, {}).get("values", [])
    if k == "category":
        return props.get("category", {}).get("values", [])
    if k == "priority":
        return props.get("priority", {}).get("values", [])
    if k == "quality":
        return props.get("quality", {}).get("values", [])
    if k in (registry.get("status_indicators") or []):
        return props.get("status", {}).get("children", {}).get(k, [])
    return []


def _get_property_keys(registry: dict):
    keys = set()
    for key in (registry.get("properties") or {}).keys():
        if key != "status":
            keys.add(key)
    for key in (registry.get("status_indicators") or []):
        keys.add(key)
    for keys_by_type in (registry.get("defaults_keys_by_type") or {}).values():
        for key in keys_by_type:
            keys.add(str(key))
    return sorted(keys)


def _parse_slot(slot: str):
    if slot.startswith("kw:"):
        return ("kw", slot[3:], False)
    if slot.startswith("choice*:"):
        opts = [o.strip().lower() for o in slot[8:].split("|") if o.strip()]
        return ("choice", opts, True)
    if slot.startswith("choice:"):
        opts = [o.strip().lower() for o in slot[7:].split("|") if o.strip()]
        return ("choice", opts, False)
    return (slot, None, False)


def _match_pattern(pattern: dict, positional_tokens: list):
    slots = pattern.get("slots") or []
    ctx = {}
    idx = 0
    slot_idx = 0
    while slot_idx < len(slots) and idx < len(positional_tokens):
        slot = slots[slot_idx]
        kind, data, repeatable = _parse_slot(slot)
        token = positional_tokens[idx]
        token_lower = token.lower()
        if kind == "kw":
            if token_lower != data:
                return None
            slot_idx += 1
            idx += 1
            continue
        if kind == "choice":
            if token_lower not in data:
                return None
            idx += 1
            if repeatable and idx < len(positional_tokens) and positional_tokens[idx].lower() in data:
                continue
            slot_idx += 1
            continue
        if kind == "item_type":
            ctx["item_type"] = token_lower
        elif kind == "item_name":
            ctx["item_name"] = token
        elif kind == "item_property":
            ctx["item_property"] = token_lower
        elif kind == "timer_profile":
            ctx["timer_profile"] = token_lower
        slot_idx += 1
        idx += 1
    if idx < len(positional_tokens):
        return None
    next_slot = slots[slot_idx] if slot_idx < len(slots) else None
    return {
        "context": ctx,
        "next_slot": next_slot,
        "complete": slot_idx >= len(slots),
    }


def _property_key_candidates(registry: dict, pattern: dict):
    keys = set()
    allowed = pattern.get("property_keys")
    if allowed:
        for key in allowed:
            if key == "status_indicators":
                for ind in registry.get("status_indicators") or []:
                    keys.add(ind)
            else:
                keys.add(key)
        return sorted(keys)
    return _get_property_keys(registry)


def _item_property_keys(registry: dict, item_type: str | None):
    if item_type:
        defaults = registry.get("defaults_keys_by_type") or {}
        keys = defaults.get(item_type, [])
        if keys:
            return sorted({str(k) for k in keys})
    return _get_property_keys(registry)


COMMANDS_WITH_ITEM_TYPE = {
    "new",
    "create",
    "set",
    "get",
    "remove",
    "copy",
    "rename",
    "move",
    "delete",
    "view",
    "track",
    "count",
    "find",
    "list",
    "export",
    "import",
    "archive",
    "miss",
    "complete",
    "edit",
    "diff",
    "tree",
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


def _build_suggestions(registry: dict, text: str):
    ends_with_space = text.endswith(" ")
    tokens = _split_args_safe(text)
    current = "" if ends_with_space else (tokens[-1] if tokens else "")
    base_tokens = tokens if ends_with_space else tokens[:-1]
    suggestions = set()

    if not base_tokens:
        suggestions.update((registry.get("commands") or {}).keys())
        suggestions.update((registry.get("aliases") or {}).keys())
        return sorted(suggestions), current

    cmd_token = _canonical_command_name(base_tokens[0])
    cmd = (registry.get("aliases") or {}).get(cmd_token, cmd_token)
    cmd_def = (registry.get("commands") or {}).get(cmd) or {}
    syntax = cmd_def.get("syntax") or []

    if cmd == "list" and "then" in base_tokens:
        then_idx = base_tokens.index("then")
        nested_tokens = base_tokens[then_idx + 1:]
        nested_current = current if len(tokens) > then_idx + 1 else ""
        if not nested_tokens and not nested_current:
            suggestions.update((registry.get("commands") or {}).keys())
            suggestions.update((registry.get("aliases") or {}).keys())
            return sorted(suggestions), nested_current
        nested_text = " ".join(nested_tokens + ([nested_current] if nested_current else []))
        if ends_with_space and len(tokens) > then_idx + 1 and not nested_current:
            nested_text = f"{nested_text} "
        nested_suggestions, nested_cur = _build_suggestions(registry, nested_text)
        return nested_suggestions, nested_cur

    if cmd == "bulk" and len(base_tokens) >= 2:
        bulk_sub = base_tokens[1].lower()
        if len(base_tokens) == 2 and not ends_with_space:
            suggestions.update([bulk_sub])
        elif bulk_sub:
            nested_tokens = base_tokens[1:]
            nested_current = current if len(tokens) > 1 else ""
            nested_text = " ".join(nested_tokens + ([nested_current] if nested_current else []))
            if ends_with_space and len(tokens) > 1 and not nested_current:
                nested_text = f"{nested_text} "
            nested_suggestions, nested_cur = _build_suggestions(registry, nested_text)
            suggestions.update(nested_suggestions)
            bulk_pattern = syntax[0] if syntax else {}
            if bulk_pattern.get("allow_properties"):
                if ":" in current:
                    key, _val = current.split(":", 1)
                    for val in _get_property_values(registry, key):
                        suggestions.add(f"{key}:{val}")
                else:
                    for key in _property_key_candidates(registry, bulk_pattern):
                        suggestions.add(f"{key}:")
            return sorted(suggestions), nested_cur

    if syntax:
        positional = [t for t in base_tokens[1:] if not _is_property_token(t)]
        property_tokens = [t for t in base_tokens[1:] if _is_property_token(t)]
        matched_any = False
        for pattern in syntax:
            match = _match_pattern(pattern, positional)
            if not match:
                continue
            matched_any = True
            ctx = match["context"]
            next_slot = match["next_slot"]
            if next_slot is None:
                if pattern.get("allow_properties"):
                    if ":" in current:
                        key, _val = current.split(":", 1)
                        for val in _get_property_values(registry, key):
                            suggestions.add(f"{key}:{val}")
                    else:
                        for key in _property_key_candidates(registry, pattern):
                            suggestions.add(f"{key}:")
                    if cmd == "list" and "then" not in base_tokens:
                        suggestions.add("then")
                continue

            kind, data, _repeatable = _parse_slot(next_slot)
            if kind == "kw":
                suggestions.add(data)
            elif kind == "choice":
                for opt in data:
                    suggestions.add(opt)
            elif kind == "item_type":
                suggestions.update(registry.get("item_types") or [])
            elif kind == "item_name":
                item_type = ctx.get("item_type")
                names = (registry.get("item_names_by_type") or {}).get(item_type or "", [])
                suggestions.update(names)
            elif kind == "item_property":
                item_type = ctx.get("item_type")
                for key in _item_property_keys(registry, item_type):
                    suggestions.add(key)
            elif kind == "command":
                suggestions.update((registry.get("commands") or {}).keys())
                suggestions.update((registry.get("aliases") or {}).keys())
            elif kind == "weekday":
                suggestions.update(WEEKDAYS)
            elif kind == "month":
                suggestions.update(MONTHS)
            elif kind == "timer_profile":
                suggestions.update(registry.get("timer_profiles") or [])
        if matched_any:
            return sorted(suggestions), current

    if len(base_tokens) == 1:
        suggestions.update(cmd_def.get("subcommands") or [])
    return sorted(suggestions), current


if PromptSession:
    class RegistryCompleter(Completer):
        def __init__(self, registry: dict):
            self.registry = registry

        def get_completions(self, document, complete_event):
            text = document.text_before_cursor
            suggestions, current = _build_suggestions(self.registry, text)
            current_norm = _normalize_token(current).lower()
            for suggestion in suggestions:
                if current_norm and not suggestion.lower().startswith(current_norm):
                    continue
                yield Completion(
                    suggestion,
                    start_position=-len(current),
                    display=suggestion,
                )


    class RegistryAutoSuggest(AutoSuggest):
        def __init__(self, registry: dict):
            self.registry = registry

        def get_suggestion(self, buffer, document):
            text = document.text_before_cursor
            suggestions, current = _build_suggestions(self.registry, text)
            if not suggestions:
                return None
            current_norm = _normalize_token(current).lower()
            for suggestion in suggestions:
                if current_norm and not suggestion.lower().startswith(current_norm):
                    continue
                remainder = suggestion[len(current):]
                if remainder:
                    return Suggestion(remainder)
            return None


# --- Profile + Welcome Message ---
def _load_profile_and_seed_vars():
    try:
        # Default nickname fallback
        try:
            Variables.set_var('nickname', 'Pilot')
        except Exception:
            pass
        prof = _safe_load_yaml(os.path.join(ROOT_DIR, 'user', 'profile', 'profile.yml')) or {}
        if isinstance(prof, dict):
            nick = prof.get('nickname') or (isinstance(prof.get('profile'), dict) and prof['profile'].get('nickname'))
            if isinstance(nick, str) and nick:
                try:
                    Variables.set_var('nickname', nick)
                except Exception:
                    pass

        # Mirror current status values into runtime vars (e.g., @status_energy).
        status_candidates = [
            os.path.join(ROOT_DIR, "user", "current_status.yml"),
            os.path.join(ROOT_DIR, "user", "profile", "current_status.yml"),
        ]
        status_map = {}
        for path in status_candidates:
            data = _safe_load_yaml(path)
            if isinstance(data, dict):
                status_map = data
                break
        try:
            Variables.sync_status_vars(status_map)
        except Exception:
            pass

        # Mirror timer default profile into runtime var.
        try:
            timer_cfg = _safe_load_yaml(os.path.join(ROOT_DIR, "user", "settings", "timer_settings.yml")) or {}
            if isinstance(timer_cfg, dict):
                default_profile = str(timer_cfg.get("default_profile") or "").strip()
                if default_profile:
                    Variables.set_var("timer_profile", default_profile)
        except Exception:
            pass
    except Exception:
        pass


def _load_welcome_lines():
    """
    Load welcome lines exclusively from user/profile/profile.yml.
    Supports either 'welcome' or 'welcome_message' block, each with line1/line2/line3.
    Expands @nickname and other variables via Variables.
    """
    defaults = [
        "⌛ Chronos Engine Alpha v0.2",
        "🚀 Welcome, @nickname",
        "🌌 You are the navigator of your reality.",
    ]
    try:
        prof = _safe_load_yaml(os.path.join(ROOT_DIR, 'user', 'profile', 'profile.yml')) or {}
        block = None
        if isinstance(prof, dict):
            block = prof.get('welcome') or prof.get('welcome_message')
        if isinstance(block, dict):
            lines = [block.get('line1'), block.get('line2'), block.get('line3')]
        else:
            lines = [None, None, None]
        out = []
        for i in range(3):
            raw = lines[i] if i < len(lines) else None
            txt = raw if isinstance(raw, str) and raw.strip() else defaults[i]
            try:
                txt = Variables.expand_token(txt)
            except Exception:
                pass
            out.append(txt)
        return out
    except Exception:
        return defaults


def _load_exit_lines():
    """
    Load exit lines from user/profile/profile.yml.
    Supports 'exit_message' or 'goodbye_message', each with line1/line2.
    Expands @nickname and other variables.
    """
    defaults = [
        "👋 Safe travels, @nickname.",
        "🌌 Returning you to baseline reality...",
    ]
    try:
        prof = _safe_load_yaml(os.path.join(ROOT_DIR, 'user', 'profile', 'profile.yml')) or {}
        block = None
        if isinstance(prof, dict):
            block = prof.get('exit_message') or prof.get('goodbye_message')
        if isinstance(block, dict):
            lines = [block.get('line1'), block.get('line2')]
        else:
            lines = [None, None]
        out = []
        for i in range(2):
            raw = lines[i] if i < len(lines) else None
            txt = raw if isinstance(raw, str) and raw.strip() else defaults[i]
            try:
                txt = Variables.expand_token(txt)
            except Exception:
                pass
            out.append(txt)
        return out
    except Exception:
        return defaults

def _apply_console_theme():
    try:
        console_style.reset_theme_cache()
    except Exception:
        pass
    try:
        console_style.apply_global_colors()
    except Exception:
        pass

# --- Module Management ---
# Dictionary to store loaded modules to avoid re-importing
LOADED_MODULES = {}

# Command aliases (lowercase) -> canonical command name
# Command aliases (lowercase) -> canonical command name
COMMAND_ALIASES = {
    "dash": "dashboard",
    "sounds": "sound",
    "plugin": "plugins",
}


def _play_cli_sound(sound_name: str, wait: bool = False):
    try:
        if SoundFX:
            SoundFX.play(sound_name, wait=wait)
    except Exception:
        pass


def _run_startup_core_sync_with_macro_hook():
    """
    Always refresh the core mirror at console startup.
    Wrapped in MacroEngine before/after hooks via pseudo-command '__startup__'
    so pilots can attach custom startup automation in macros.yml.
    """
    hook_cmd = "__startup__"
    hook_args = ["core_sync"]
    hook_props = {}
    sync_ok = True

    try:
        from modules import macro_engine
        MacroEngine.run_before(hook_cmd, hook_args, hook_props)
    except Exception:
        pass

    try:
        from modules.sequence.core_builder import sync_core_db
        sync_core_db()
        try:
            console_style.print_role("Core mirror sync complete.", "info")
        except Exception:
            print("Core mirror sync complete.")
    except Exception as e:
        sync_ok = False
        try:
            Logger.error("Startup core sync failed", e)
        except Exception:
            pass
        print(f"⚠️ Startup core sync failed: {e}")
    finally:
        try:
            from modules import macro_engine
            MacroEngine.run_after(hook_cmd, hook_args, hook_props, {"ok": sync_ok})
        except Exception:
            pass

def _load_aliases():
    """Load aliases from user/settings/aliases.yml"""
    path = os.path.join(ROOT_DIR, 'user', 'settings', 'aliases.yml')
    aliases = {}
    
    # Load default map first
    aliases.update({
        _canonical_command_name(k): _canonical_command_name(v)
        for k, v in COMMAND_ALIASES.items()
    })
    
    try:
        data = _safe_load_yaml(path)
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, str):
                    source = _canonical_command_name(k)
                    target = _canonical_command_name(v)
                    if source and target:
                        aliases[source] = target
    except Exception:
        pass
    try:
        _load_plugins()
        for k, v in (_PLUGIN_ALIAS_MAP or {}).items():
            aliases[k] = v
    except Exception:
        pass
    return aliases

def resolve_command_alias(command_name):
    """
    Map shorthand command names to their canonical counterparts.
    """
    if not isinstance(command_name, str):
        return command_name
    canonical = _canonical_command_name(command_name)
    if not canonical:
        return canonical
    aliases = _load_aliases()
    return aliases.get(canonical, canonical)

def invoke_command(command_name, args, properties):
    """
    Run a command while triggering MacroEngine hooks before/after when enabled.
    Suppress by setting env CHRONOS_SUPPRESS_MACROS or passing property no_macros:true.
    """
    command_name = resolve_command_alias(command_name)
    suppress = False
    try:
        if os.environ.get("CHRONOS_SUPPRESS_MACROS"):
            suppress = True
        if str((properties or {}).get("no_macros")).lower() in ("1", "true", "yes"):
            suppress = True
    except Exception:
        pass
    if not suppress:
        try:
            from modules import macro_engine
            MacroEngine.run_before(command_name, args, properties)
        except Exception:
            pass
    try:
        run_command(command_name, args, properties)
    finally:
        if not suppress:
            try:
                from modules import macro_engine
                MacroEngine.run_after(command_name, args, properties, {"ok": True})
            except Exception:
                pass

def load_module(module_name):
    """
    Dynamically loads a module from the Modules directory.
    Modules are expected to be in a structure like modules/<ModuleName>/main.py.
    """
    if module_name in LOADED_MODULES:
        return LOADED_MODULES[module_name]

    module_path = os.path.join(MODULES_DIR, module_name, "main.py")
    if not os.path.isfile(module_path):
        return None

    # Use importlib to load the module
    spec = importlib.util.spec_from_file_location(f"chronos_module.{module_name}", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    LOADED_MODULES[module_name] = module
    return module

# --- Command Execution ---
def run_command(command_name, args, properties):
    """
    Executes a command by dynamically loading its corresponding Python file
    from the 'commands' directory and calling its 'run' function.
    """
    command_name = resolve_command_alias(command_name)
    stem = _get_command_file_stem(command_name)
    command_file_path = os.path.join(COMMANDS_DIR, f"{stem}.py") if stem else ""
    if os.path.isfile(command_file_path):
        try:
            # Dynamically load the command module
            spec = importlib.util.spec_from_file_location(stem, command_file_path)
            command_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(command_module)

            # Check if the module has a 'run' function and execute it
            if hasattr(command_module, "run"):
                command_module.run(args, properties)
                if command_name.lower() == "today" and any(str(a).lower() == "reschedule" for a in (args or [])):
                    _play_cli_sound("done")
            else:
                print(f"❌ Command '{command_name}' does not have a run() function.")
                _play_cli_sound("error")
        except Exception as e:
            print(f"❌ Error running command '{command_name}': {e}")
            Logger.error(f"Command failed: {command_name}", e)
            _play_cli_sound("error")
        return

    try:
        _load_plugins()
        plugin_fn = _PLUGIN_COMMANDS.get(command_name)
        if callable(plugin_fn):
            try:
                plugin_fn(args, properties)
            except Exception as e:
                print(f"❌ Error running plugin command '{command_name}': {e}")
                Logger.error(f"Plugin command failed: {command_name}", e)
                _play_cli_sound("error")
            return
    except Exception:
        pass

    print(f"❌ Unknown command: {command_name}")
    _play_cli_sound("error")

def _is_property_token(token: str) -> bool:
    if not isinstance(token, str):
        return False
    # Only treat as property if it looks like key:value with a valid key
    # Avoid catching Windows paths like C:\foo
    if ":" not in token:
        return False
    key, _sep, _rest = token.partition(":")
    return key and key[0].isalpha() and all(c.isalnum() or c == '_' for c in key)


def _coerce_value(val: str):
    lv = str(val).lower()
    if lv == 'true':
        return True
    if lv == 'false':
        return False
    # int
    try:
        if lv.isdigit() or (lv.startswith('-') and lv[1:].isdigit()):
            return int(val)
    except Exception:
        pass
    return val


_REDIR_VAR_SIMPLE_RE = re.compile(r"^@([A-Za-z_][A-Za-z0-9_]*)$")
_REDIR_VAR_BRACED_RE = re.compile(r"^@\{([A-Za-z_][A-Za-z0-9_]*)\}$")


def _parse_redirection_target(raw_target: str):
    """
    Parse redirection target token.
    - @name / @{name} => variable target
    - otherwise => file path target (after variable expansion)
    Returns: (kind, target)
    """
    token = str(raw_target or "").strip()
    if not token:
        return None, None
    m = _REDIR_VAR_SIMPLE_RE.match(token) or _REDIR_VAR_BRACED_RE.match(token)
    if m:
        return "var", m.group(1)
    # For file targets we allow variable expansion in token text.
    return "file", Variables.expand_token(token)


def _extract_redirection_tokens(command: str, raw_tokens: list):
    """
    Extract a trailing redirection from raw tokens.
    Supported: ... > target, ... >> target
    Returns: (tokens_without_redirection, op, target_kind, target_value)
    """
    if not raw_tokens:
        return raw_tokens, None, None, None
    op_idx = None
    op_val = None
    # Take the last operator so regular '>' text in args remains usable.
    for i, tok in enumerate(raw_tokens):
        t = str(tok).strip()
        if t in (">", ">>"):
            op_idx = i
            op_val = t
    if op_idx is None:
        return raw_tokens, None, None, None
    if op_idx + 1 >= len(raw_tokens):
        print("❌ Redirection target missing after > or >>.")
        return raw_tokens[:op_idx], None, None, None
    target_raw = str(raw_tokens[op_idx + 1] or "").strip()
    kind, target = _parse_redirection_target(target_raw)
    if not kind or not target:
        print("❌ Invalid redirection target.")
        return raw_tokens[:op_idx], None, None, None
    # Ignore any extra tokens after target to keep behavior deterministic.
    return raw_tokens[:op_idx], op_val, kind, target


def _route_command_output(op: str, target_kind: str, target_value: str, output_text: str):
    """
    Route captured command stdout according to redirection.
    """
    text = str(output_text or "")
    if target_kind == "var":
        var_name = str(target_value).strip()
        if op == ">>":
            prev = Variables.get_var(var_name, "")
            Variables.set_var(var_name, f"{prev}{text}")
        else:
            Variables.set_var(var_name, text)
        return

    # File target
    path = str(target_value).strip()
    if not os.path.isabs(path):
        path = os.path.join(ROOT_DIR, path)
    os.makedirs(os.path.dirname(path) or ROOT_DIR, exist_ok=True)
    mode = "a" if op == ">>" else "w"
    with open(path, mode, encoding="utf-8") as fh:
        fh.write(text)


def parse_input(input_parts):
    command = None
    args = []
    properties = {}

    if not input_parts:
        return None, [], {}

    command = input_parts[0]
    raw = input_parts[1:]

    if command.lower() in ('set', 'if', 'while', 'repeat', 'for'):
        # Keep raw args so loop/condition handlers can expand at execution time
        args = raw
        return command, args, properties

    # Parse redirection before variable expansion so `@var` targets are kept
    # as variable references instead of being expanded to values.
    raw, redir_op, redir_kind, redir_target = _extract_redirection_tokens(command, raw)

    # Expand variables in all tokens first
    parts = Variables.expand_list([command] + raw)

    command = parts[0]
    raw = parts[1:]
    if redir_op:
        properties["__redir_op"] = redir_op
        properties["__redir_kind"] = redir_kind
        properties["__redir_target"] = redir_target

    # Special-case: keep raw args to allow colon syntax
    if command.lower() == 'set' and raw and str(raw[0]).lower() == 'var':
        args = raw
        return command, args, properties

    # Split key:value tokens into properties, keep others as args
    for tok in raw:
        if _is_property_token(tok):
            key, _sep, val = tok.partition(":")
            properties[key] = _coerce_value(val)
        else:
            args.append(tok)

    return command, args, properties

# --- Main Execution Block ---
# Rebind core runner with macro hooks for external callers (Dashboard, etc.)
try:
    run_command_core  # type: ignore[name-defined]
except NameError:
    # Define alias only if not already rebound elsewhere
    run_command_core = run_command  # type: ignore[assignment]

def run_command(command_name, args, properties):
    command_name = resolve_command_alias(command_name)
    try:
        props_local = dict(properties or {})
        redir_op = props_local.pop("__redir_op", None)
        redir_kind = props_local.pop("__redir_kind", None)
        redir_target = props_local.pop("__redir_target", None)
        suppress = False
        try:
            if os.environ.get("CHRONOS_SUPPRESS_MACROS"):
                suppress = True
            if str((props_local or {}).get("no_macros")).lower() in ("1", "true", "yes"):
                suppress = True
        except Exception:
            pass
        if not suppress:
            try:
                from modules import macro_engine
                MacroEngine.run_before(command_name, args, props_local)
            except Exception:
                pass
        if redir_op in (">", ">>") and redir_kind in ("var", "file") and redir_target:
            capture = io.StringIO()
            with redirect_stdout(capture):
                run_command_core(command_name, args, props_local)
            try:
                _route_command_output(redir_op, redir_kind, redir_target, capture.getvalue())
            except Exception as e:
                print(f"❌ Redirection failed: {e}")
                # Fallback: print captured output so it isn't lost.
                out = capture.getvalue()
                if out:
                    print(out, end="" if out.endswith("\n") else "\n")
        else:
            run_command_core(command_name, args, props_local)
        try:
            from modules.achievement import evaluator as AchievementEvaluator  # type: ignore
            AchievementEvaluator.emit_event("command_executed", {
                "command": str(command_name or "").lower(),
                "args": list(args or []),
                "properties": dict(props_local or {}),
            })
        except Exception:
            pass
    finally:
        try:
            if not suppress:
                from modules import macro_engine
                MacroEngine.run_after(command_name, args, props_local, {"ok": True})
        except Exception:
            pass

# --- Script Execution Logic ---
def execute_script(script_path):
    """
    Parses and runs a .chs script file.
    """
    if not os.path.isfile(script_path):
        print(f"❌ Script file not found: {script_path}")
        return False

    with open(script_path, 'r', encoding='utf-8') as script_file:
        all_lines = [ln.rstrip('\n') for ln in script_file]

    def exec_line(raw_line, line_no=None):
        ln = raw_line.strip()
        if not ln or ln.startswith('#'):
            return
        parts = shlex.split(ln)
        command, args, properties = parse_input(parts)
        if command:
            # Set context line for single-line 'if' error reporting
            if command.lower() == 'if' and line_no is not None:
                try:
                    import modules.conditions as Conditions
                    Conditions.set_context_line(line_no)
                except Exception:
                    pass
            invoke_command(command, args, properties.copy())
            if command.lower() == 'if' and line_no is not None:
                try:
                    import modules.conditions as Conditions
                    Conditions.clear_context_line()
                except Exception:
                    pass

    def run_lines(lines):
        import modules.conditions as Conditions
        from modules import variables as _V
        from modules.item_manager import list_all_items
        i = 0
        L = len(lines)

        def _depluralize(word):
            if not word:
                return ""
            if word.lower() == 'people':
                return 'person'
            if word.endswith('ies'):
                return word[:-3] + 'y'
            if word.endswith('s') and not word.endswith('ss'):
                return word[:-1]
            return word

        def is_block_start(sl):
            return (
                (sl.startswith('if ') and sl.endswith(' then'))
                or (sl.startswith('repeat ') and sl.endswith(' then'))
                or (sl.startswith('for ') and sl.endswith(' then'))
                or (sl.startswith('while ') and sl.endswith(' then'))
            )

        def collect_block(start_idx):
            depth = 0
            j = start_idx
            block = []
            while j < L:
                r = lines[j]
                s = r.strip()
                sl = s.lower()
                if is_block_start(sl):
                    depth += 1
                if sl == 'end':
                    depth -= 1
                    block.append(r)
                    j += 1
                    if depth == 0:
                        break
                    continue
                block.append(r)
                j += 1
            return block, j

        def _parse_repeat_count(header_tokens):
            count_val = None
            for tok in header_tokens:
                if isinstance(tok, str) and ':' in tok:
                    key, _sep, val = tok.partition(':')
                    if key.lower() in ('count', 'times', 'n'):
                        count_val = val
                elif count_val is None:
                    if str(tok).isdigit():
                        count_val = tok
            try:
                count_int = int(str(count_val))
            except Exception:
                count_int = None
            if not count_int or count_int < 1:
                return None
            return count_int

        def _parse_for_header(header_raw):
            raw_tokens = shlex.split(header_raw)
            if not raw_tokens:
                return None
            var_name = raw_tokens[0]
            if not isinstance(var_name, str) or not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", var_name):
                return None
            rest_tokens = _V.expand_list(raw_tokens[1:])
            try:
                in_idx = [t.lower() for t in rest_tokens].index('in')
            except ValueError:
                return None
            if in_idx + 1 >= len(rest_tokens):
                return None
            item_type_raw = str(rest_tokens[in_idx + 1])
            item_type = _depluralize(item_type_raw.lower())
            filter_tokens = rest_tokens[in_idx + 2:]
            props = {}
            for tok in filter_tokens:
                if _is_property_token(tok):
                    key, _sep, val = tok.partition(':')
                    props[key] = _coerce_value(val)
                elif str(tok).strip():
                    # ignore non-property tokens
                    pass
            return var_name, item_type, props

        def _parse_while_header(header_raw):
            raw_tokens = shlex.split(header_raw)
            max_raw = None
            cond_tokens = []
            for tok in raw_tokens:
                if isinstance(tok, str) and ':' in tok:
                    key, _sep, val = tok.partition(':')
                    if key.lower() in ('max', 'limit'):
                        max_raw = val
                        continue
                cond_tokens.append(tok)
            if not max_raw:
                return None, None
            max_expanded = _V.expand_list([str(max_raw)])[0]
            try:
                max_int = int(str(max_expanded))
            except Exception:
                max_int = None
            if not max_int or max_int < 1:
                return None, None
            return cond_tokens, max_int

        def collect_if_block(start_idx):
            depth = 0
            j = start_idx
            block = []
            while j < L:
                r = lines[j]
                s = r.strip()
                sl = s.lower()
                if sl.startswith('if ') and sl.endswith(' then'):
                    depth += 1
                if sl == 'end':
                    depth -= 1
                    block.append(r)
                    j += 1
                    if depth == 0:
                        break
                    continue
                block.append(r)
                j += 1
            return block, j

        def collect_commands(start_idx):
            cmds = []
            j = start_idx
            while j < L:
                r = lines[j]
                s = r.strip()
                sl = s.lower()
                if sl == 'end' or (sl.startswith('elseif ') and sl.endswith(' then')) or sl == 'else':
                    break
                if sl.startswith('if ') and sl.endswith(' then'):
                    block, j2 = collect_if_block(j)
                    cmds.append(('BLOCK', block))
                    j = j2
                    continue
                if s and not s.startswith('#'):
                    cmds.append(('LINE', r))
                j += 1
            return cmds, j

        while i < L:
            raw = lines[i]
            stripped = raw.strip()
            if not stripped or stripped.startswith('#'):
                i += 1
                continue
            sl = stripped.lower()
            if sl.startswith('repeat ') and sl.endswith(' then'):
                block, i = collect_block(i)
                header = stripped[7:-5].strip()
                header_tokens = _V.expand_list(shlex.split(header))
                count = _parse_repeat_count(header_tokens)
                if not count:
                    print("❌ Invalid repeat count. Use: repeat count:<n> then")
                    continue
                body = block[1:-1]
                prev_i = _V.get_var('i')
                for idx in range(count):
                    _V.set_var('i', str(idx + 1))
                    run_lines(body)
                if prev_i is None:
                    _V.unset_var('i')
                else:
                    _V.set_var('i', prev_i)
                continue

            if sl.startswith('for ') and sl.endswith(' then'):
                block, i = collect_block(i)
                header = stripped[4:-5].strip()
                parsed = _parse_for_header(header)
                if not parsed:
                    print("❌ Invalid for syntax. Use: for <var> in <type> [filters] then")
                    continue
                var_name, item_type, props = parsed
                sort_by = props.pop('sort_by', None)
                reverse_sort = props.pop('reverse_sort', False)
                items = list_all_items(item_type) or []
                filtered = []
                for item in items:
                    ok = True
                    for key, value in props.items():
                        if str(item.get(key)) != str(value):
                            ok = False
                            break
                    if ok:
                        filtered.append(item)
                if sort_by:
                    filtered.sort(key=lambda x: x.get(sort_by, 0), reverse=bool(reverse_sort))
                body = block[1:-1]
                prev_i = _V.get_var('i')
                prev_var = _V.get_var(var_name)
                prev_var_type = _V.get_var(f"{var_name}_type")
                for idx, item in enumerate(filtered, start=1):
                    name = item.get('name')
                    if not name:
                        continue
                    item_type_val = item.get('type', item_type)
                    _V.set_var('i', str(idx))
                    _V.set_var(var_name, str(name))
                    _V.set_var(f"{var_name}_type", str(item_type_val))
                    run_lines(body)
                if prev_i is None:
                    _V.unset_var('i')
                else:
                    _V.set_var('i', prev_i)
                if prev_var is None:
                    _V.unset_var(var_name)
                else:
                    _V.set_var(var_name, prev_var)
                if prev_var_type is None:
                    _V.unset_var(f"{var_name}_type")
                else:
                    _V.set_var(f"{var_name}_type", prev_var_type)
                continue

            if sl.startswith('while ') and sl.endswith(' then'):
                line_no = i + 1
                block, i = collect_block(i)
                header = stripped[6:-5].strip()
                cond_tokens, max_iters = _parse_while_header(header)
                if not cond_tokens or not max_iters:
                    print("❌ Invalid while syntax. Use: while <condition> max:<n> then")
                    continue
                body = block[1:-1]
                prev_i = _V.get_var('i')
                for idx in range(1, max_iters + 1):
                    cond_expanded = _V.expand_list(cond_tokens)
                    try:
                        truth = Conditions.evaluate_cond_tokens(cond_expanded)
                    except Exception as e:
                        print(f"Condition error on line {line_no}: {e}")
                        truth = False
                    if not truth:
                        break
                    _V.set_var('i', str(idx))
                    run_lines(body)
                if prev_i is None:
                    _V.unset_var('i')
                else:
                    _V.set_var('i', prev_i)
                continue

            if sl.startswith('if ') and sl.endswith(' then'):
                header = stripped[3:-5].strip()
                header_parts = shlex.split(header)
                cond_tokens = _V.expand_list(header_parts)
                cond_line_no = i + 1
                blocks = [(cond_tokens, [], cond_line_no)]
                i += 1
                cmds, i = collect_commands(i)
                blocks[0] = (blocks[0][0], cmds, blocks[0][2])

                while i < L:
                    s = lines[i].strip()
                    sl2 = s.lower()
                    if sl2.startswith('elseif ') and sl2.endswith(' then'):
                        elif_header = s[7:-5].strip()
                        parts2 = shlex.split(elif_header)
                        cond2 = _V.expand_list(parts2)
                        elif_line_no = i + 1
                        i += 1
                        cmds, i = collect_commands(i)
                        blocks.append((cond2, cmds, elif_line_no))
                    else:
                        break

                if i < L and lines[i].strip().lower() == 'else':
                    else_line_no = i + 1
                    i += 1
                    else_cmds, i = collect_commands(i)
                    blocks.append((None, else_cmds, else_line_no))

                if not (i < L and lines[i].strip().lower() == 'end'):
                    print("❌ Missing 'end' for if block.")
                    break
                i += 1

                executed = False
                for entry in blocks:
                    # Support tuples with or without line numbers
                    if len(entry) == 3:
                        cond, cmdlist, line_no = entry
                    else:
                        cond, cmdlist = entry
                        line_no = cond_line_no
                    truth = False
                    if cond is None:
                        truth = not executed
                    else:
                        try:
                            truth = Conditions.evaluate_cond_tokens(cond)
                        except Exception as e:
                            print(f"Condition error on line {line_no}: {e}")
                            truth = False
                    if truth and not executed:
                        for kind, payload in cmdlist:
                            if kind == 'LINE':
                                exec_line(payload)
                            elif kind == 'BLOCK':
                                # Recursively run nested block
                                run_lines(payload)
                        executed = True
                continue

            # default single-line execution
            # Mark line number for 'if' single-line error messages
            exec_line(raw, i + 1)
            i += 1

    run_lines(all_lines)
    return True


if __name__ == "__main__":
    runtime_options, cli_args = _extract_runtime_options(sys.argv[1:])
    console_cfg = _load_console_settings()

    has_cli_input = bool(cli_args)

    startup_banner_enabled = runtime_options.get("startup_banner")
    if startup_banner_enabled is None:
        startup_banner_enabled = bool(_to_bool_token(console_cfg.get("show_startup_banner")))

    startup_sync_enabled = runtime_options.get("startup_sync")
    if startup_sync_enabled is None:
        startup_sync_enabled = bool(_to_bool_token(console_cfg.get("run_startup_sync")))

    startup_sound_enabled = runtime_options.get("startup_sound")
    if startup_sound_enabled is None:
        startup_sound_enabled = bool(_to_bool_token(console_cfg.get("play_startup_sound")))

    # In one-shot command/script mode, keep IO clean unless explicitly enabled.
    if has_cli_input:
        startup_banner_enabled = bool(startup_banner_enabled)
        startup_sync_enabled = bool(startup_sync_enabled)
        startup_sound_enabled = bool(startup_sound_enabled)

    # Seed variables (e.g., @nickname from profile)
    try:
        _load_profile_and_seed_vars()
    except Exception:
        pass

    # Load plugins early so aliases/commands are ready before first command.
    try:
        _load_plugins(force=True)
        if not has_cli_input:
            _print_plugin_boot_log()
    except Exception:
        pass

    try:
        from modules.achievement import evaluator as AchievementEvaluator  # type: ignore
        AchievementEvaluator.emit_event("chronos_started", {
            "mode": "cli_args" if has_cli_input else "interactive",
        })
    except Exception:
        pass

    if startup_banner_enabled:
        # Apply console color defaults for the interactive startup experience.
        try:
            console_style.apply_global_colors()
        except Exception:
            pass
        try:
            console_style.enable_themed_print()
        except Exception:
            pass
        try:
            os.system("cls" if os.name == "nt" else "clear")
        except Exception:
            pass
        console_style.print_role("Aquiring hyperdimensional object at the end of time...", "info")
        try:
            os.system("cls" if os.name == "nt" else "clear")
        except Exception:
            pass
        # Display Chronos Engine banner
        console_style.print_role(" _____ _____ _____ _____ _____ _____ _____ ", "logo")
        console_style.print_role("|     |  |  | __  |     |   | |     |   __|", "logo")
        console_style.print_role("|   --|     |    -|  |  | | | |  |  |__   |", "logo")
        console_style.print_role("|_____|__|__|__|__|_____|_|___|_____|_____|", "logo")
        console_style.print_role("", "logo")
        try:
            _wl = _load_welcome_lines()
        except Exception:
            _wl = [
                "⌛ Chronos Engine Alpha v0.2",
                "🚀 Welcome, @nickname",
                "🌌 You are the navigator of your reality.",
            ]
        for _ln in _wl:
            console_style.print_role(_ln, "info")
        console_style.print_role("", "info")

    if startup_sync_enabled:
        _run_startup_core_sync_with_macro_hook()
    if startup_sound_enabled:
        _play_cli_sound("startup")

    # Check if a .chs script file is provided
    if cli_args and str(cli_args[0]).endswith('.chs'):
        script_path = os.path.join(ROOT_DIR, cli_args[0])
        success = execute_script(script_path)
        sys.exit(0 if success else 1)


    # Check if command-line arguments are provided
    if cli_args:
        # Join all arguments into a single string to handle quotes correctly
        user_input_str = ' '.join(cli_args)
        # Use shlex.split to parse the string, respecting quotes
        parts = shlex.split(user_input_str)
        command, args, properties = parse_input(parts)
        if command:
            if command.lower() in {"exit", "quit"}:
                exit_lines = _load_exit_lines()
                for line in exit_lines:
                    console_style.print_role(line, "info")
                    time.sleep(1)
                _play_cli_sound("exit", wait=True)
                sys.exit(0)
            # Set a best-effort line number for single-line if via CLI
            if command.lower() == 'if':
                try:
                    import modules.conditions as Conditions
                    Conditions.set_context_line(1)
                except Exception:
                    pass
            invoke_command(command, args, properties.copy())
            if startup_banner_enabled:
                _apply_console_theme()
            if command.lower() == 'if':
                try:
                    import modules.conditions as Conditions
                    Conditions.clear_context_line()
                except Exception:
                    pass
        else:
            print("❌ No command parsed from arguments.")
            _play_cli_sound("error")
    else:
        # Enter interactive mode if no command-line arguments
        console_cfg = _load_console_settings()
        prompt_toolkit_enabled = runtime_options.get("prompt_toolkit")
        if prompt_toolkit_enabled is None:
            prompt_toolkit_enabled = bool(_to_bool_token(console_cfg.get("prompt_toolkit_default")))
        autocomplete_enabled = runtime_options.get("autocomplete")
        if autocomplete_enabled is None:
            autocomplete_enabled = bool(_to_bool_token(console_cfg.get("autocomplete_enabled")))

        if PromptSession and prompt_toolkit_enabled:
            history = InMemoryHistory()
            kb = KeyBindings()
            style = console_style.build_style()
            color_depth = console_style.get_color_depth()
            completer = None
            autosuggest = None

            if autocomplete_enabled:
                registry = _load_registry_bundle()
                completer = RegistryCompleter(registry)
                autosuggest = RegistryAutoSuggest(registry)

            @kb.add("enter")
            def _(event):
                buf = event.app.current_buffer
                if autocomplete_enabled:
                    if buf.complete_state and buf.complete_state.current_completion:
                        buf.apply_completion(buf.complete_state.current_completion)
                        return
                    if buf.suggestion:
                        buf.insert_text(buf.suggestion.text)
                        return
                buf.validate_and_handle()

            session = PromptSession(
                completer=completer,
                auto_suggest=autosuggest,
                history=history,
                key_bindings=kb,
                complete_while_typing=bool(autocomplete_enabled),
                style=style,
                color_depth=color_depth,
            )

            while True:
                try:
                    _apply_console_theme()
                    if autocomplete_enabled:
                        completer.registry = _load_registry_bundle()
                        autosuggest.registry = completer.registry
                    user_input = session.prompt([("class:prompt", "> ")])
                    if user_input is None:
                        continue
                    user_input = user_input.strip()
                    if not user_input:
                        continue
                    if user_input.lower() in {"exit", "quit"}:
                        exit_lines = _load_exit_lines()
                        for line in exit_lines:
                            console_style.print_role(line, "info")
                            time.sleep(1)
                        _play_cli_sound("exit", wait=True)
                        break
                    parts = shlex.split(user_input)
                    command, args, properties = parse_input(parts)
                    if command:
                        invoke_command(command, args, properties.copy())
                        _apply_console_theme()
                    else:
                        print("❌ No command parsed from input.")
                        _play_cli_sound("error")
                except KeyboardInterrupt:
                    console_style.print_role("", "info")
                    exit_lines = _load_exit_lines()
                    for line in exit_lines:
                        console_style.print_role(line, "info")
                        time.sleep(1)
                    _play_cli_sound("exit", wait=True)
                    break
                except EOFError:
                    break
        else:
            while True:
                try:
                    _apply_console_theme()
                    user_input = input("> ").strip()
                    if not user_input:
                        continue
                    if user_input.lower() in {"exit", "quit"}:
                        exit_lines = _load_exit_lines()
                        for line in exit_lines:
                            console_style.print_role(line, "info")
                            time.sleep(1)
                        _play_cli_sound("exit", wait=True)
                        break

                    # Use shlex.split for interactive input to handle quotes
                    parts = shlex.split(user_input)
                    command, args, properties = parse_input(parts)

                    if command:
                        invoke_command(command, args, properties.copy())
                        _apply_console_theme()
                    else:
                        print("❌ No command parsed from input.")
                        _play_cli_sound("error")

                except KeyboardInterrupt:
                    console_style.print_role("", "info")
                    exit_lines = _load_exit_lines()
                    for line in exit_lines:
                        console_style.print_role(line, "info")
                        time.sleep(1)
                    _play_cli_sound("exit", wait=True)
                    break



