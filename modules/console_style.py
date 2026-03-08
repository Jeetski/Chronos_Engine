from __future__ import annotations

from pathlib import Path
import os
import shutil
import sys
from typing import Dict

try:
    import yaml  # type: ignore
except Exception:  # pragma: no cover
    yaml = None

try:
    from prompt_toolkit import print_formatted_text
    from prompt_toolkit.formatted_text import FormattedText
    from prompt_toolkit.styles import Style
    from prompt_toolkit.output import ColorDepth
except Exception:  # pragma: no cover
    print_formatted_text = None
    FormattedText = None
    Style = None
    ColorDepth = None

ROOT_DIR = Path(__file__).resolve().parent.parent
COLOR_SETTINGS_PATH = ROOT_DIR / "user" / "settings" / "console_color_settings.yml"
CONSOLE_THEME_SETTINGS_PATH = ROOT_DIR / "user" / "settings" / "console_theme_settings.yml"
CONSOLE_THEME_DIR = ROOT_DIR / "user" / "settings" / "console_themes"
LEGACY_THEME_PATH = CONSOLE_THEME_DIR / "blue_skies_theme.yml"

DEFAULT_PALETTE: Dict[str, str] = {
    "bg": "1",
    "fg": "F",
    "header_text": "F",
    "header_bg": "1",
    "subheader_text": "B",
    "status_completed": "A",
    "status_skipped": "E",
    "status_partial": "B",
    "status_missed": "C",
    "status_in_progress": "9",
    "status_upcoming": "F",
    "status_buffer": "7",
    "info": "B",
    "success": "A",
    "warning": "E",
    "error": "C",
    "dim": "7",
    "accent": "D",
    "prompt": "F",
    "prompt_hint": "7",
}

ANSI_16_MAP = {
    "0": "ansiblack",
    "1": "ansiblue",
    "2": "ansigreen",
    "3": "ansicyan",
    "4": "ansired",
    "5": "ansimagenta",
    "6": "ansiyellow",
    "7": "ansigray",
    "8": "ansibrightblack",
    "9": "ansibrightblue",
    "a": "ansibrightgreen",
    "b": "ansibrightcyan",
    "c": "ansibrightred",
    "d": "ansibrightmagenta",
    "e": "ansibrightyellow",
    "f": "ansiwhite",
}

ANSI_SGR_FG = {
    "0": "30",
    "1": "34",
    "2": "32",
    "3": "36",
    "4": "31",
    "5": "35",
    "6": "33",
    "7": "37",
    "8": "90",
    "9": "94",
    "a": "92",
    "b": "96",
    "c": "91",
    "d": "95",
    "e": "93",
    "f": "97",
}

ANSI_SGR_BG = {
    "0": "40",
    "1": "44",
    "2": "42",
    "3": "46",
    "4": "41",
    "5": "45",
    "6": "43",
    "7": "47",
    "8": "100",
    "9": "104",
    "a": "102",
    "b": "106",
    "c": "101",
    "d": "105",
    "e": "103",
    "f": "107",
}

_STYLE_CACHE = None
_PALETTE_CACHE: Dict[str, str] | None = None
_COLOR_MODE_CACHE: str | None = None
_ORIGINAL_PRINT = None


def _safe_load_yaml(path: Path):
    if yaml is None:
        return None
    try:
        if not path.exists():
            return None
        with path.open("r", encoding="utf-8") as handle:
            return yaml.safe_load(handle)
    except Exception:
        return None


def load_color_mode() -> str:
    global _COLOR_MODE_CACHE
    if _COLOR_MODE_CACHE:
        return _COLOR_MODE_CACHE
    data = _safe_load_yaml(COLOR_SETTINGS_PATH)
    if isinstance(data, dict):
        mode = str(data.get("color_mode", "16")).strip()
    else:
        mode = "16"
    _COLOR_MODE_CACHE = mode
    return mode


def reset_theme_cache() -> None:
    global _STYLE_CACHE, _PALETTE_CACHE, _COLOR_MODE_CACHE
    _STYLE_CACHE = None
    _PALETTE_CACHE = None
    _COLOR_MODE_CACHE = None


def _active_theme_name() -> str:
    profile_path = ROOT_DIR / "user" / "profile" / "profile.yml"
    prof = _safe_load_yaml(profile_path)
    if isinstance(prof, dict):
        name = prof.get("theme")
        console_cfg = prof.get("console")
        if not name and isinstance(console_cfg, dict):
            name = console_cfg.get("theme")
        if isinstance(name, str) and name.strip():
            return name.strip()
    return "default"


def _theme_file_for_name(theme_name: str) -> Path | None:
    raw = str(theme_name or "").strip()
    if not raw:
        return None
    slug = raw.replace(" ", "_")
    candidates = [
        CONSOLE_THEME_DIR / f"{raw}.yml",
        CONSOLE_THEME_DIR / f"{raw}.yaml",
        CONSOLE_THEME_DIR / f"{slug}.yml",
        CONSOLE_THEME_DIR / f"{slug}.yaml",
        CONSOLE_THEME_DIR / f"{raw}_theme.yml",
        CONSOLE_THEME_DIR / f"{slug}_theme.yml",
    ]
    for path in candidates:
        if path.exists():
            return path
    return None


def load_palette() -> Dict[str, str]:
    global _PALETTE_CACHE
    if _PALETTE_CACHE is not None:
        return _PALETTE_CACHE
    palette = DEFAULT_PALETTE.copy()

    theme_name = _active_theme_name()
    settings = _safe_load_yaml(CONSOLE_THEME_SETTINGS_PATH)
    themes_map = settings.get("themes") if isinstance(settings, dict) else None
    selected = themes_map.get(theme_name) if isinstance(themes_map, dict) else None
    has_selected_bg = False
    has_selected_fg = False
    if isinstance(selected, dict):
        bg = selected.get("background") or selected.get("bg")
        fg = selected.get("text") or selected.get("fg")
        if isinstance(bg, str) and bg.strip():
            palette["bg"] = bg.strip()
            has_selected_bg = True
        if isinstance(fg, str) and fg.strip():
            palette["fg"] = fg.strip()
            has_selected_fg = True

    theme_file = _theme_file_for_name(theme_name)
    used_legacy_fallback = False
    data = _safe_load_yaml(theme_file) if isinstance(theme_file, Path) else None
    if not isinstance(data, dict):
        data = _safe_load_yaml(LEGACY_THEME_PATH)
        used_legacy_fallback = True
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(key, str) and value is not None:
                k = key.strip()
                # Keep selected bg/fg from console_theme_settings when using fallback palette file.
                if used_legacy_fallback and ((k == "bg" and has_selected_bg) or (k == "fg" and has_selected_fg)):
                    continue
                palette[k] = str(value).strip()

    _PALETTE_CACHE = palette
    return palette


def _to_ansi_name(value: str) -> str:
    return ANSI_16_MAP.get(str(value).strip().lower(), "ansiwhite")


def _pad_line(text: str) -> str:
    width = shutil.get_terminal_size((80, 20)).columns
    if width <= 0:
        return text
    if len(text) >= width:
        return text
    return text + (" " * (width - len(text)))


def build_style() -> "Style | None":
    global _STYLE_CACHE
    if _STYLE_CACHE is not None:
        return _STYLE_CACHE
    if Style is None:
        return None
    palette = load_palette()
    bg = _to_ansi_name(palette.get("bg", "1"))
    fg = _to_ansi_name(palette.get("fg", "F"))
    style_dict = {
        "": f"bg:{bg} fg:{fg}",
        "default": f"bg:{bg} fg:{fg}",
        "logo": f"bg:{bg} fg:{fg} bold",
        "prompt": f"bg:{bg} fg:{_to_ansi_name(palette.get('prompt', palette.get('fg', 'F')))}",
        "auto-suggestion": f"fg:{_to_ansi_name(palette.get('prompt_hint', palette.get('dim', '7')))}",
        "completion-menu": f"bg:{bg} fg:{_to_ansi_name(palette.get('subheader_text', palette.get('fg', 'F')))}",
        "completion-menu.completion": f"bg:{bg} fg:{_to_ansi_name(palette.get('subheader_text', palette.get('fg', 'F')))}",
        "completion-menu.completion.current": f"bg:{_to_ansi_name(palette.get('accent', 'D'))} fg:{fg}",
        "header": f"bg:{_to_ansi_name(palette.get('header_bg', palette.get('bg', '1')))} fg:{_to_ansi_name(palette.get('header_text', palette.get('fg', 'F')))}",
        "subheader": f"bg:{bg} fg:{_to_ansi_name(palette.get('subheader_text', palette.get('fg', 'F')))}",
        "info": f"bg:{bg} fg:{_to_ansi_name(palette.get('info', palette.get('fg', 'F')))}",
        "success": f"bg:{bg} fg:{_to_ansi_name(palette.get('success', palette.get('fg', 'F')))}",
        "warning": f"bg:{bg} fg:{_to_ansi_name(palette.get('warning', palette.get('fg', 'F')))}",
        "error": f"bg:{bg} fg:{_to_ansi_name(palette.get('error', palette.get('fg', 'F')))}",
        "dim": f"bg:{bg} fg:{_to_ansi_name(palette.get('dim', palette.get('fg', 'F')))}",
        "accent": f"bg:{bg} fg:{_to_ansi_name(palette.get('accent', palette.get('fg', 'F')))}",
        "status.completed": f"bg:{bg} fg:{_to_ansi_name(palette.get('status_completed', palette.get('fg', 'F')))}",
        "status.skipped": f"bg:{bg} fg:{_to_ansi_name(palette.get('status_skipped', palette.get('fg', 'F')))}",
        "status.partial": f"bg:{bg} fg:{_to_ansi_name(palette.get('status_partial', palette.get('fg', 'F')))}",
        "status.missed": f"bg:{bg} fg:{_to_ansi_name(palette.get('status_missed', palette.get('fg', 'F')))}",
        "status.in_progress": f"bg:{bg} fg:{_to_ansi_name(palette.get('status_in_progress', palette.get('fg', 'F')))}",
        "status.upcoming": f"bg:{bg} fg:{_to_ansi_name(palette.get('status_upcoming', palette.get('fg', 'F')))}",
        "status.buffer": f"bg:{bg} fg:{_to_ansi_name(palette.get('status_buffer', palette.get('fg', 'F')))}",
    }
    _STYLE_CACHE = Style.from_dict(style_dict)
    return _STYLE_CACHE


def get_color_depth():
    if ColorDepth is None:
        return None
    mode = str(load_color_mode()).strip().lower()
    if mode in ("16", "depth_4", "4"):
        return ColorDepth.DEPTH_4_BIT
    if mode in ("256", "depth_8", "8"):
        return ColorDepth.DEPTH_8_BIT
    if mode in ("24", "true", "truecolor", "full"):
        return ColorDepth.DEPTH_24_BIT
    return ColorDepth.DEPTH_4_BIT


def apply_global_colors() -> None:
    palette = load_palette()
    fg = ANSI_SGR_FG.get(palette.get("fg", "F").lower(), "97")
    bg = ANSI_SGR_BG.get(palette.get("bg", "1").lower(), "44")
    seq = f"\x1b[{bg};{fg}m"
    try:
        print(seq, end="")
    except Exception:
        pass


def _raw_print(line: str) -> None:
    printer = _ORIGINAL_PRINT
    if printer is None:
        printer = __builtins__["print"] if isinstance(__builtins__, dict) else __builtins__.print
    printer(line)


def print_role(text: str, role: str = "default") -> None:
    if text is None:
        return
    if print_formatted_text and FormattedText:
        try:
            style = build_style()
            if str(text) == "":
                apply_global_colors()
                _raw_print(" " * max(1, shutil.get_terminal_size((80, 20)).columns))
                return
            for line in str(text).splitlines():
                padded = _pad_line(line)
                print_formatted_text(FormattedText([(f"class:{role}", padded)]), style=style)
            if str(text).endswith("\n"):
                print_formatted_text(FormattedText([(f"class:{role}", _pad_line(""))]), style=style)
            return
        except Exception:
            # Non-interactive shells (agents/subprocesses) may not have a real console buffer.
            pass
    _raw_print(str(text))


def enable_themed_print(default_role: str = "default") -> None:
    global _ORIGINAL_PRINT
    if _ORIGINAL_PRINT is None:
        _ORIGINAL_PRINT = __builtins__["print"] if isinstance(__builtins__, dict) else __builtins__.print

    def themed_print(*args, **kwargs):
        file = kwargs.get("file")
        end = kwargs.get("end", "\n")
        sep = kwargs.get("sep", " ")
        flush = kwargs.get("flush", False)

        if end != "\n":
            return _ORIGINAL_PRINT(*args, **kwargs)

        if file not in (None, sys.stdout, sys.stderr):
            return _ORIGINAL_PRINT(*args, **kwargs)

        text = sep.join(str(a) for a in args)
        role = default_role
        if file is sys.stderr:
            role = "error"
        print_role(text, role)
        if flush:
            try:
                sys.stdout.flush()
            except Exception:
                pass

    if isinstance(__builtins__, dict):
        __builtins__["print"] = themed_print
    else:
        __builtins__.print = themed_print

