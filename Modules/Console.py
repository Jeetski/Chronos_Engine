import os
import sys
import importlib.util
import time
import shlex
import subprocess

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

    # Expand variables in all tokens first
    parts = Variables.expand_list(input_parts)

    command = parts[0]
    raw = parts[1:]

    # Special-cases: keep raw args to allow colon syntax
    if command.lower() == 'set' and raw and str(raw[0]).lower() == 'var':
        args = raw
        return command, args, properties
    if command.lower() == 'if':
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
        i = 0
        L = len(lines)

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
        while True:
            try:
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
                else:
                    print("❌ No command parsed from input.")

            except KeyboardInterrupt:
                print() # Add a newline for cleaner exit
                exit_lines = _load_exit_lines()
                for line in exit_lines:
                    print(line)
                    time.sleep(1)
                break
