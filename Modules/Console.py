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
COMMANDS_DIR = os.path.join(ROOT_DIR, "commands")
MODULES_DIR = os.path.join(ROOT_DIR, "Modules")

# Ensure both COMMANDS_DIR and MODULES_DIR are in sys.path
# This allows Python to find command and module files when imported dynamically
if COMMANDS_DIR not in sys.path:
    sys.path.insert(0, COMMANDS_DIR)
if MODULES_DIR not in sys.path:
    sys.path.insert(0, MODULES_DIR)

# Now that MODULES_DIR is on sys.path, import Variables helper
from Modules import Variables

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


def _resolve_theme_colors():
    colors = {'background': 'dark_blue', 'text': 'white'}
    try:
        prof = _safe_load_yaml(os.path.join(ROOT_DIR, 'User', 'profile.yml')) or {}
        theme_cfg = _safe_load_yaml(os.path.join(ROOT_DIR, 'User', 'Settings', 'theme_settings.yml')) or {}
        themes = (theme_cfg.get('themes') if isinstance(theme_cfg, dict) else None) or {}

        theme_name = None
        if isinstance(prof, dict):
            theme_name = prof.get('theme') or (isinstance(prof.get('console'), dict) and prof.get('console', {}).get('theme'))
        if isinstance(theme_name, str):
            theme = themes.get(theme_name) if isinstance(themes, dict) else None
            if isinstance(theme, dict):
                bg = theme.get('background')
                fg = theme.get('text')
                if isinstance(bg, str):
                    colors['background'] = bg
                if isinstance(fg, str):
                    colors['text'] = fg

        if isinstance(prof, dict):
            console_dict = prof.get('console') if isinstance(prof.get('console'), dict) else None
            bg = prof.get('background') or (console_dict and console_dict.get('background'))
            fg = prof.get('text') or (console_dict and console_dict.get('text'))
            if isinstance(bg, str):
                colors['background'] = bg
            if isinstance(fg, str):
                colors['text'] = fg
    except Exception:
        pass
    return colors


def color_print(message: str, text: str = 'white', background: str = 'dark_blue'):
    exe = _find_colorprint_exe()
    if exe and os.name == 'nt':
        try:
            subprocess.run([exe, f"print:{message}", f"text:{text}", f"background:{background}"], check=False)
            return
        except Exception:
            pass
    print(message)

# --- Module Management ---
# Dictionary to store loaded modules to avoid re-importing
LOADED_MODULES = {}

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
if __name__ == "__main__":
    # Apply console theme via Windows 'color' command when available
    try:
        _tc = _resolve_theme_colors()
        _bg_name = str(_tc.get('background', 'dark_blue'))
        _fg_name = str(_tc.get('text', 'white'))
        if os.name == 'nt':
            # TODO(colorhex): Replace nibble approximation + 'color' with a small
            # C# utility (e.g., Utilities/colorhex/colorhex.exe) that accepts
            # exact hex values and sets the console colors reliably. Keep this
            # path as fallback for environments without colorhex.
            def _nibble_from_hex_or_name(val: str) -> str:
                val = (val or '').strip()
                name_map = {
                    # background/foreground names to console color nibble
                    'black': '0', 'jet_black': '0',
                    'dark_blue': '1', 'navy': '1',
                    'dark_green': '2',
                    'dark_cyan': '3', 'teal': '3', 'aqua': '3',
                    'dark_red': '4', 'maroon': '4',
                    'dark_purple': '5', 'purple': '5',
                    'dark_yellow': '6', 'brown': '6', 'dark_brown': '6',
                    'gray': '7', 'light_gray': '7',
                    'dark_gray': '8', 'charcoal': '8',
                    'blue': '9', 'light_blue': '9', 'diamond_blue': '9',
                    'green': 'A', 'light_green': 'A', 'neon_green': 'A',
                    'light_cyan': 'B', 'neon_cyan': 'B', 'cyan': 'B',
                    'red': 'C', 'light_red': 'C', 'neon_red': 'C',
                    'magenta': 'D', 'light_purple': 'D', 'lavender': 'D', 'neon_purple': 'D',
                    'yellow': 'E', 'light_yellow': 'E', 'neon_yellow': 'E',
                    'white': 'F', 'off_white': 'F', 'neon_white': 'F', 'chalk': 'F'
                }
                if val.startswith('#') and len(val) in (4, 7):
                    # Rough map hex to nearest console color among 16 colors
                    def parse_hex(h):
                        h = h.lstrip('#')
                        if len(h) == 3:
                            r = int(h[0]*2, 16); g = int(h[1]*2, 16); b = int(h[2]*2, 16)
                        else:
                            r = int(h[0:2], 16); g = int(h[2:4], 16); b = int(h[4:6], 16)
                        return (r,g,b)
                    target = parse_hex(val)
                    palette = {
                        '0': (0,0,0), '1': (0,0,128), '2': (0,128,0), '3': (0,128,128),
                        '4': (128,0,0), '5': (128,0,128), '6': (128,128,0), '7': (192,192,192),
                        '8': (128,128,128), '9': (0,0,255), 'A': (0,255,0), 'B': (0,255,255),
                        'C': (255,0,0), 'D': (255,0,255), 'E': (255,255,0), 'F': (255,255,255)
                    }
                    best = '7'; bestd = 10**9
                    for k, rgb in palette.items():
                        dr = rgb[0]-target[0]; dg = rgb[1]-target[1]; db = rgb[2]-target[2]
                        d = dr*dr + dg*dg + db*db
                        if d < bestd:
                            bestd = d; best = k
                    return best
                return name_map.get(val.lower(), None) or ('1' if val == _bg_name else 'F')

            bg_n = _nibble_from_hex_or_name(_bg_name)
            fg_n = _nibble_from_hex_or_name(_fg_name)
            try:
                os.system(f"color {bg_n}{fg_n}")
            except Exception:
                # Fall back to previous default color
                os.system("color 1F")
    except Exception:
        pass
    # Display Chronos Engine banner
    print(" _____ _____ _____ _____ _____ _____ _____ ")
    print("|     |  |  | __  |     |   | |     |   __|")
    print("|   --|     |    -|  |  | | | |  |  |__   |")
    print("|_____|__|__|__|__|_____|_|___|_____|_____|")
    print()
    print("⌛ Chronos Engine v1")
    print("🚀 Welcome, Pilot")
    print("🌌 You are the navigator of your reality.\n")

    # Check if a .chs script file is provided
    if len(sys.argv) > 1 and sys.argv[1].endswith('.chs'):
        script_path = os.path.join(ROOT_DIR, sys.argv[1])
        if os.path.isfile(script_path):
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
                    run_command(command, args, properties.copy())
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
                            print("�?O Missing 'end' for if block.")
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

            # Exit after running the script
            sys.exit(0)
        else:
            print(f"❌ Script file not found: {sys.argv[1]}")
            sys.exit(1)

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
            run_command(command, args, properties.copy())
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
                    print("👋 Safe travels, Pilot.")
                    time.sleep(1)
                    print("🌌 Returning you to baseline reality...")
                    time.sleep(1)
                    break

                # Use shlex.split for interactive input to handle quotes
                parts = shlex.split(user_input)
                command, args, properties = parse_input(parts)
                
                if command:
                    run_command(command, args, properties.copy())
                else:
                    print("❌ No command parsed from input.")

            except KeyboardInterrupt:
                print("\n👋 Exiting Chronos Engine. Goodbye.")
                break
