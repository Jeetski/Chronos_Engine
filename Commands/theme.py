import os
import sys
from typing import Dict, Any, Tuple

try:
    import yaml  # type: ignore
except Exception:
    yaml = None

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def get_help_message():
    return (
        "Usage: theme <subcommand>\n"
        "Subcommands:\n"
        "  list                 List available themes\n"
        "  current              Show current theme/background/text\n"
        "  set <name>           Set theme by name (from theme_settings.yml)\n"
        "  set-colors [background:<name|#hex>] [text:<name|#hex>]\n"
        "                       Set explicit console colors (overrides theme)\n"
        "Notes:\n"
        "- Themes come from User/Settings/theme_settings.yml (themes: { name: { background, text } }).\n"
        "- Current selection is stored in User/profile.yml under 'theme' or 'console: { theme }'.\n"
        "- Explicit 'background'/'text' in profile override the theme.\n"
    )


def _load_yaml(path: str) -> Any:
    if yaml is None:
        return None
    try:
        if not os.path.exists(path):
            return None
        with open(path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except Exception:
        return None


def _save_yaml(path: str, data: Any) -> bool:
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
        return True
    except Exception:
        return False


def _read_themes() -> Dict[str, Dict[str, str]]:
    cfg = _load_yaml(os.path.join(ROOT_DIR, 'User', 'Settings', 'theme_settings.yml'))
    if isinstance(cfg, dict) and isinstance(cfg.get('themes'), dict):
        return cfg['themes']  # type: ignore
    return {}


def _read_profile() -> Dict[str, Any]:
    prof = _load_yaml(os.path.join(ROOT_DIR, 'User', 'profile.yml'))
    return prof if isinstance(prof, dict) else {}


def _write_profile(prof: Dict[str, Any]) -> bool:
    return _save_yaml(os.path.join(ROOT_DIR, 'User', 'profile.yml'), prof)


def _resolve_profile_theme(prof: Dict[str, Any], themes: Dict[str, Dict[str, str]]) -> Tuple[str, str, str]:
    # Defaults match existing console default
    bg, fg = 'dark_blue', 'white'
    name = str(prof.get('theme') or (isinstance(prof.get('console'), dict) and prof['console'].get('theme')) or 'default')
    if name in themes:
        t = themes[name]
        bg = str(t.get('background', bg))
        fg = str(t.get('text', fg))
    # Explicit overrides win
    console_dict = prof.get('console') if isinstance(prof.get('console'), dict) else None
    bg = str(prof.get('background') or (console_dict and console_dict.get('background')) or bg)
    fg = str(prof.get('text') or (console_dict and console_dict.get('text')) or fg)
    return name, bg, fg


def _hex_to_console_nibble(hex_or_name: str, default_nibble: str, compare_with: str) -> str:
    # Map names to Windows "color" nibbles; approximate hex to nearest 16-color.
    # TODO(colorhex): Once a dedicated C# colorhex.exe exists, prefer calling it
    # to set precise hex background/foreground; keep this approximation as a
    # fallback for systems without that binary.
    val = (hex_or_name or '').strip()
    name_map = {
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
        try:
            h = val.lstrip('#')
            if len(h) == 3:
                r, g, b = int(h[0]*2, 16), int(h[1]*2, 16), int(h[2]*2, 16)
            else:
                r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
            palette = {
                '0': (0,0,0), '1': (0,0,128), '2': (0,128,0), '3': (0,128,128),
                '4': (128,0,0), '5': (128,0,128), '6': (128,128,0), '7': (192,192,192),
                '8': (128,128,128), '9': (0,0,255), 'A': (0,255,0), 'B': (0,255,255),
                'C': (255,0,0), 'D': (255,0,255), 'E': (255,255,0), 'F': (255,255,255)
            }
            best, bestd = '7', 10**9
            for k, (pr, pg, pb) in palette.items():
                dr, dg, db = pr - r, pg - g, pb - b
                d = dr*dr + dg*dg + db*db
                if d < bestd:
                    bestd, best = d, k
            return best
        except Exception:
            pass
    return name_map.get(val.lower(), None) or default_nibble


def _apply_console_color(bg: str, fg: str) -> None:
    if os.name != 'nt':
        return
    bg_n = _hex_to_console_nibble(bg, '1', bg)
    fg_n = _hex_to_console_nibble(fg, 'F', fg)
    try:
        os.system(f"color {bg_n}{fg_n}")
    except Exception:
        os.system("color 1F")


def run(args, properties):
    # Normalize
    sub = (args[0].lower() if args else 'help')
    themes = _read_themes()
    prof = _read_profile()

    if sub in ('help', '-h', '--help'):
        print(get_help_message())
        return

    if sub == 'list':
        if not themes:
            print("No themes found. Ensure User/Settings/theme_settings.yml exists.")
            return
        print("Available themes:")
        for name, t in themes.items():
            bg = t.get('background', '')
            fg = t.get('text', '')
            print(f" - {name}: background={bg}, text={fg}")
        return

    if sub == 'current':
        name, bg, fg = _resolve_profile_theme(prof, themes)
        print(f"Current theme: {name}")
        print(f"Background: {bg}")
        print(f"Text: {fg}")
        return

    if sub == 'set':
        if len(args) < 2:
            print("Provide a theme name. Example: theme set hacker")
            return
        name = args[1]
        if name not in themes:
            print(f"Unknown theme '{name}'. Try: theme list")
            return
        # Persist: set theme and clear explicit overrides so theme takes effect
        prof.setdefault('console', {}) if isinstance(prof.get('console'), dict) else None
        prof['theme'] = name
        for k in ('background', 'text'):
            if k in prof:
                del prof[k]
            if isinstance(prof.get('console'), dict) and k in prof['console']:
                del prof['console'][k]
        if not _write_profile(prof):
            print("Warning: Failed to write profile.yml; theme may not persist.")
        # Apply now
        bg = str(themes[name].get('background', 'dark_blue'))
        fg = str(themes[name].get('text', 'white'))
        _apply_console_color(bg, fg)
        print(f"Applied theme '{name}' (background={bg}, text={fg}).")
        return

    if sub == 'set-colors':
        bg = properties.get('background')
        fg = properties.get('text')
        if not bg and not fg:
            print("Provide background/text properties. Example: theme set-colors background:black text:white")
            return
        if bg:
            prof['background'] = str(bg)
        if fg:
            prof['text'] = str(fg)
        if not _write_profile(prof):
            print("Warning: Failed to write profile.yml; colors may not persist.")
        _apply_console_color(str(prof.get('background', 'dark_blue')), str(prof.get('text', 'white')))
        print(f"Applied custom console colors (background={prof.get('background')}, text={prof.get('text')}).")
        return

    print("Unknown subcommand.\n" + get_help_message())
