import os

import sys
import importlib.util
import time
import shlex
import subprocess
import json
import re

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
    # Set title (colors handled later via theme/colorprint if available)
    os.system("title Chronos Engine v1")
else:
    os.system("clear")

# --- Path Configuration ---
# Determine the root directory of the Chronos Engine project
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Add ROOT_DIR to sys.path to allow absolute imports from project root
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

# Define paths for commands and modules directories
COMMANDS_DIR = os.path.join(ROOT_DIR, "Commands")
MODULES_DIR = os.path.join(ROOT_DIR, "Modules")

# Ensure both COMMANDS_DIR and MODULES_DIR are in sys.path
# This allows Python to find command and module files when imported dynamically
if COMMANDS_DIR not in sys.path:
    sys.path.insert(0, COMMANDS_DIR)
if MODULES_DIR not in sys.path:
    sys.path.insert(0, MODULES_DIR)

# Now that MODULES_DIR is on sys.path, import Variables helper
from Modules import Variables
from Modules import theme_utils
from Modules.Logger import Logger

try:
    from prompt_toolkit import PromptSession
    from prompt_toolkit.completion import Completer, Completion
    from prompt_toolkit.key_binding import KeyBindings
    from prompt_toolkit.auto_suggest import AutoSuggest, Suggestion
    from prompt_toolkit.history import InMemoryHistory
    from prompt_toolkit.styles import Style
    from prompt_toolkit.output import ColorDepth
except Exception:
    PromptSession = None

# --- Theme + ColorPrint integration ---
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


def _find_colorprint_exe():
    try:
        exe = os.path.join(ROOT_DIR, 'Utilities', 'colorprint', 'colorprint.exe')
        return exe if os.path.exists(exe) else None
    except Exception:
        return None


def color_print(message: str, text: str = 'white', background: str = 'dark_blue'):
    exe = _find_colorprint_exe()
    if exe and os.name == 'nt':
        try:
            subprocess.run([exe, f"print:{message}", f"text:{text}", f"background:{background}"], check=False)
            return
        except Exception:
            pass
    print(message)


REGISTRY_DIR = os.path.join(ROOT_DIR, "Registry")
_REGISTRY_CACHE = {}
_REGISTRY_MTIMES = {}


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
    cmd = _load_registry("command")
    item = _load_registry("item")
    prop = _load_registry("property")
    return {
        "commands": cmd.get("commands") or {},
        "aliases": cmd.get("aliases") or {},
        "item_types": item.get("item_types") or [],
        "item_names_by_type": item.get("item_names_by_type") or {},
        "properties": prop.get("properties") or {},
        "status_indicators": prop.get("status_indicators") or [],
        "timer_profiles": prop.get("timer_profiles") or [],
        "defaults_keys_by_type": prop.get("defaults_keys_by_type") or {},
    }


def _split_args_safe(text: str):
    try:
        return shlex.split(text)
    except Exception:
        return [t for t in text.split() if t]


def _normalize_token(token: str) -> str:
    return str(token or "").strip()


def _load_color_palette():
    if yaml is None:
        return {}
    path = os.path.join(ROOT_DIR, "Utilities", "colorprint", "colors.yml")
    data = _safe_load_yaml(path)
    if not isinstance(data, dict):
        return {}
    palette = {}
    for group in data.values():
        if isinstance(group, dict):
            for name, value in group.items():
                if isinstance(name, str) and isinstance(value, str):
                    palette[name.lower()] = value
    return palette


def _resolve_theme_hex_colors():
    try:
        colors = theme_utils.resolve_theme_colors(ROOT_DIR)
    except Exception:
        return None, None
    palette = _load_color_palette()
    def _to_hex(value):
        if not isinstance(value, str) or not value:
            return None
        val = value.strip()
        if val.startswith("#") and len(val) in (4, 7):
            return val
        return palette.get(val.lower())
    return _to_hex(colors.get("background")), _to_hex(colors.get("text"))


def _normalize_hex_color(value: str) -> str | None:
    if not isinstance(value, str):
        return None
    val = value.strip().lstrip("#")
    if len(val) == 3:
        val = "".join(ch * 2 for ch in val)
    if len(val) != 6:
        return None
    try:
        int(val, 16)
    except Exception:
        return None
    return f"#{val}"


def _blend_hex(fg: str, bg: str, alpha: float) -> str | None:
    fg_hex = _normalize_hex_color(fg)
    bg_hex = _normalize_hex_color(bg)
    if not fg_hex or not bg_hex:
        return None
    fr = int(fg_hex[1:3], 16)
    fg_g = int(fg_hex[3:5], 16)
    fb = int(fg_hex[5:7], 16)
    br = int(bg_hex[1:3], 16)
    bg_g = int(bg_hex[3:5], 16)
    bb = int(bg_hex[5:7], 16)
    r = int(fr * alpha + br * (1 - alpha))
    g = int(fg_g * alpha + bg_g * (1 - alpha))
    b = int(fb * alpha + bb * (1 - alpha))
    return f"#{r:02x}{g:02x}{b:02x}"


def _get_property_values(registry: dict, key: str):
    if not key:
        return []
    props = registry.get("properties") or {}
    k = key.lower()
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

    cmd_token = base_tokens[0].lower()
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
        prof = _safe_load_yaml(os.path.join(ROOT_DIR, 'User', 'Profile', 'profile.yml')) or {}
        if isinstance(prof, dict):
            nick = prof.get('nickname') or (isinstance(prof.get('profile'), dict) and prof['profile'].get('nickname'))
            if isinstance(nick, str) and nick:
                try:
                    Variables.set_var('nickname', nick)
                except Exception:
                    pass
    except Exception:
        pass


def _load_welcome_lines():
    """
    Load welcome lines exclusively from User/Profile/profile.yml.
    Supports either 'welcome' or 'welcome_message' block, each with line1/line2/line3.
    Expands @nickname and other variables via Variables.
    """
    defaults = [
        "⌛ Chronos Engine v1",
        "🚀 Welcome, @nickname",
        "🌌 You are the navigator of your reality.",
    ]
    try:
        prof = _safe_load_yaml(os.path.join(ROOT_DIR, 'User', 'Profile', 'profile.yml')) or {}
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
    Load exit lines from User/Profile/profile.yml.
    Supports 'exit_message' or 'goodbye_message', each with line1/line2.
    Expands @nickname and other variables.
    """
    defaults = [
        "👋 Safe travels, @nickname.",
        "🌌 Returning you to baseline reality...",
    ]
    try:
        prof = _safe_load_yaml(os.path.join(ROOT_DIR, 'User', 'Profile', 'profile.yml')) or {}
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
        theme_utils.apply_theme_to_console(ROOT_DIR)
    except Exception:
        pass

# --- Module Management ---
# Dictionary to store loaded modules to avoid re-importing
LOADED_MODULES = {}

# Command aliases (lowercase) -> canonical command name
# Command aliases (lowercase) -> canonical command name
COMMAND_ALIASES = {
    "dash": "dashboard",
}

def _load_aliases():
    """Load aliases from User/Settings/aliases.yml"""
    path = os.path.join(ROOT_DIR, 'User', 'Settings', 'aliases.yml')
    aliases = {}
    
    # Load default map first
    aliases.update(COMMAND_ALIASES)
    
    try:
        data = _safe_load_yaml(path)
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, str):
                    aliases[k.lower()] = v
    except Exception:
        pass
    return aliases

def resolve_command_alias(command_name):
    """
    Map shorthand command names to their canonical counterparts.
    """
    if not isinstance(command_name, str):
        return command_name
        
    aliases = _load_aliases()
    return aliases.get(command_name.lower(), command_name)

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
            from Modules import MacroEngine
            MacroEngine.run_before(command_name, args, properties)
        except Exception:
            pass
    try:
        run_command(command_name, args, properties)
    finally:
        if not suppress:
            try:
                from Modules import MacroEngine
                MacroEngine.run_after(command_name, args, properties, {"ok": True})
            except Exception:
                pass

def load_module(module_name):
    """
    Dynamically loads a module from the Modules directory.
    Modules are expected to be in a structure like Modules/<ModuleName>/main.py.
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
    command_file_path = os.path.join(COMMANDS_DIR, f"{command_name}.py")
    if os.path.isfile(command_file_path):
        # Dynamically load the command module
        spec = importlib.util.spec_from_file_location(command_name, command_file_path)
        command_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(command_module)
        
        # Check if the module has a 'run' function and execute it
        if hasattr(command_module, "run"):
            command_module.run(args, properties)
        else:
            print(f"❌ Command '{command_name}' does not have a run() function.")
        return

    print(f"❌ Unknown command: {command_name}")

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

    # Expand variables in all tokens first
    parts = Variables.expand_list(input_parts)

    command = parts[0]
    raw = parts[1:]

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
                from Modules import MacroEngine
                MacroEngine.run_before(command_name, args, properties)
            except Exception:
                pass
        run_command_core(command_name, args, properties)
    finally:
        try:
            if not suppress:
                from Modules import MacroEngine
                MacroEngine.run_after(command_name, args, properties, {"ok": True})
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
                    import Modules.Conditions as Conditions
                    Conditions.set_context_line(line_no)
                except Exception:
                    pass
            invoke_command(command, args, properties.copy())
            if command.lower() == 'if' and line_no is not None:
                try:
                    import Modules.Conditions as Conditions
                    Conditions.clear_context_line()
                except Exception:
                    pass

    def run_lines(lines):
        import Modules.Conditions as Conditions
        from Modules import Variables as _V
        from Modules.ItemManager import list_all_items
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
    # Seed variables (e.g., @nickname from profile)
    try:
        _load_profile_and_seed_vars()
    except Exception:
        pass
    # Apply console theme via Windows 'color' command when available
    try:
        theme_utils.apply_theme_to_console(ROOT_DIR)
    except Exception:
        pass
    # Display Chronos Engine banner
    print(" _____ _____ _____ _____ _____ _____ _____ ")
    print("|     |  |  | __  |     |   | |     |   __|")
    print("|   --|     |    -|  |  | | | |  |  |__   |")
    print("|_____|__|__|__|__|_____|_|___|_____|_____|")
    print()
    try:
        _wl = _load_welcome_lines()
    except Exception:
        _wl = [
            "⌛ Chronos Engine v1",
            "🚀 Welcome, @nickname",
            "🌌 You are the navigator of your reality.",
        ]
    for _ln in _wl:
        print(_ln)
    print("")

    # Check if a .chs script file is provided
    if len(sys.argv) > 1 and sys.argv[1].endswith('.chs'):
        script_path = os.path.join(ROOT_DIR, sys.argv[1])
        success = execute_script(script_path)
        sys.exit(0 if success else 1)


    # Check if command-line arguments are provided
    if len(sys.argv) > 1:
        # Join all arguments into a single string to handle quotes correctly
        user_input_str = ' '.join(sys.argv[1:])
        # Use shlex.split to parse the string, respecting quotes
        parts = shlex.split(user_input_str)
        command, args, properties = parse_input(parts)
        if command:
            # Set a best-effort line number for single-line if via CLI
            if command.lower() == 'if':
                try:
                    import Modules.Conditions as Conditions
                    Conditions.set_context_line(1)
                except Exception:
                    pass
            invoke_command(command, args, properties.copy())
            _apply_console_theme()
            if command.lower() == 'if':
                try:
                    import Modules.Conditions as Conditions
                    Conditions.clear_context_line()
                except Exception:
                    pass
        else:
            print("❌ No command parsed from arguments.")
    else:
        # Enter interactive mode if no command-line arguments
        if PromptSession:
            registry = _load_registry_bundle()
            completer = RegistryCompleter(registry)
            autosuggest = RegistryAutoSuggest(registry)
            history = InMemoryHistory()
            kb = KeyBindings()
            style = None
            color_depth = None
            bg_hex, fg_hex = _resolve_theme_hex_colors()
            if bg_hex or fg_hex:
                bg = _normalize_hex_color(bg_hex or "") or "default"
                fg = _normalize_hex_color(fg_hex or "") or "default"
                menu_bg = _blend_hex(fg, bg, 0.08) or bg
                menu_sel_bg = _blend_hex(fg, bg, 0.18) or bg
                auto_fg = _blend_hex(fg, bg, 0.45) or fg
                try:
                    style = Style.from_dict({
                        "": f"bg:{bg} fg:{fg}",
                        "prompt": f"fg:{fg}",
                        "completion-menu": f"bg:{menu_bg} fg:{fg}",
                        "completion-menu.completion": f"bg:{menu_bg} fg:{fg}",
                        "completion-menu.completion.current": f"bg:{menu_sel_bg} fg:{fg}",
                        "auto-suggestion": f"fg:{auto_fg}",
                    })
                    color_depth = ColorDepth.TRUE_COLOR
                except Exception:
                    style = None
                    color_depth = None

            @kb.add("enter")
            def _(event):
                buf = event.app.current_buffer
                if buf.complete_state and buf.complete_state.current_completion:
                    buf.apply_completion(buf.complete_state.current_completion)
                    return
                if buf.suggestion:
                    buf.insert_text(buf.suggestion.text)
                    return
                buf.validate_and_handle()

            session = PromptSession(completer=completer, auto_suggest=autosuggest, history=history, key_bindings=kb, complete_while_typing=True, style=style, color_depth=color_depth)

            while True:
                try:
                    _apply_console_theme()
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
                            print(line)
                            time.sleep(1)
                        break
                    parts = shlex.split(user_input)
                    command, args, properties = parse_input(parts)
                    if command:
                        invoke_command(command, args, properties.copy())
                        _apply_console_theme()
                    else:
                        print("❌ No command parsed from input.")
                except KeyboardInterrupt:
                    print()
                    exit_lines = _load_exit_lines()
                    for line in exit_lines:
                        print(line)
                        time.sleep(1)
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
                            print(line)
                            time.sleep(1)
                        break

                    # Use shlex.split for interactive input to handle quotes
                    parts = shlex.split(user_input)
                    command, args, properties = parse_input(parts)

                    if command:
                        invoke_command(command, args, properties.copy())
                        _apply_console_theme()
                    else:
                        print("❌ No command parsed from input.")

                except KeyboardInterrupt:
                    print() # Add a newline for cleaner exit
                    exit_lines = _load_exit_lines()
                    for line in exit_lines:
                        print(line)
                        time.sleep(1)
                    break
