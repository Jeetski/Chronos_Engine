from __future__ import annotations

import os
from pathlib import Path
from typing import Dict

try:
    import yaml  # type: ignore
except Exception:  # pragma: no cover
    yaml = None

DEFAULT_THEME: Dict[str, str] = {"background": "dark_blue", "text": "white"}


def _safe_load_yaml(path: Path):
    if yaml is None:
        return None
    try:
        if not path.exists():
            return None
        with path.open("r", encoding="utf-8") as handle:
            return yaml.safe_load(handle)
    except Exception:  # pragma: no cover - defensive guard
        return None


def resolve_theme_colors(root_dir: str | Path) -> Dict[str, str]:
    """Return the background/text colors configured for the console."""
    colors: Dict[str, str] = DEFAULT_THEME.copy()
    root = Path(root_dir)

    profile = _safe_load_yaml(root / "User" / "Profile" / "profile.yml") or {}
    theme_cfg = _safe_load_yaml(root / "User" / "Settings" / "theme_settings.yml") or {}
    themes = (theme_cfg.get("themes") if isinstance(theme_cfg, dict) else None) or {}

    theme_name = None
    if isinstance(profile, dict):
        theme_name = profile.get("theme")
        console_cfg = profile.get("console")
        if not theme_name and isinstance(console_cfg, dict):
            theme_name = console_cfg.get("theme")
    if isinstance(theme_name, str):
        theme = themes.get(theme_name) if isinstance(themes, dict) else None
        if isinstance(theme, dict):
            bg = theme.get("background")
            fg = theme.get("text")
            if isinstance(bg, str):
                colors["background"] = bg
            if isinstance(fg, str):
                colors["text"] = fg

    if isinstance(profile, dict):
        console_cfg = profile.get("console") if isinstance(profile.get("console"), dict) else None
        bg = profile.get("background") or (console_cfg and console_cfg.get("background"))
        fg = profile.get("text") or (console_cfg and console_cfg.get("text"))
        if isinstance(bg, str):
            colors["background"] = bg
        if isinstance(fg, str):
            colors["text"] = fg

    return colors


def _nibble_from_hex_or_name(value: str, fallback: str) -> str:
    value = (value or "").strip()
    if not value:
        return fallback
    name_map = {
        "black": "0",
        "jet_black": "0",
        "dark_blue": "1",
        "navy": "1",
        "dark_green": "2",
        "dark_cyan": "3",
        "teal": "3",
        "aqua": "3",
        "dark_red": "4",
        "maroon": "4",
        "dark_purple": "5",
        "purple": "5",
        "dark_yellow": "6",
        "brown": "6",
        "dark_brown": "6",
        "gray": "7",
        "light_gray": "7",
        "dark_gray": "8",
        "charcoal": "8",
        "blue": "9",
        "light_blue": "9",
        "diamond_blue": "9",
        "green": "A",
        "light_green": "A",
        "neon_green": "A",
        "light_cyan": "B",
        "neon_cyan": "B",
        "cyan": "B",
        "red": "C",
        "light_red": "C",
        "neon_red": "C",
        "magenta": "D",
        "light_purple": "D",
        "lavender": "D",
        "neon_purple": "D",
        "yellow": "E",
        "light_yellow": "E",
        "neon_yellow": "E",
        "white": "F",
        "off_white": "F",
        "neon_white": "F",
        "chalk": "F",
    }
    hex_value = name_map.get(value.lower())
    if hex_value:
        return hex_value

    if value.startswith("#") and len(value) in (4, 7):
        def _parse_hex(code: str) -> tuple[int, int, int]:
            code = code.lstrip("#")
            if len(code) == 3:
                r = int(code[0] * 2, 16)
                g = int(code[1] * 2, 16)
                b = int(code[2] * 2, 16)
            else:
                r = int(code[0:2], 16)
                g = int(code[2:4], 16)
                b = int(code[4:6], 16)
            return r, g, b

        target = _parse_hex(value)
        palette = {
            "0": (0, 0, 0),
            "1": (0, 0, 128),
            "2": (0, 128, 0),
            "3": (0, 128, 128),
            "4": (128, 0, 0),
            "5": (128, 0, 128),
            "6": (128, 128, 0),
            "7": (192, 192, 192),
            "8": (128, 128, 128),
            "9": (0, 0, 255),
            "A": (0, 255, 0),
            "B": (0, 255, 255),
            "C": (255, 0, 0),
            "D": (255, 0, 255),
            "E": (255, 255, 0),
            "F": (255, 255, 255),
        }
        best_key = "7"
        best_distance = 1_000_000
        for key, rgb in palette.items():
            dr = rgb[0] - target[0]
            dg = rgb[1] - target[1]
            db = rgb[2] - target[2]
            distance = dr * dr + dg * dg + db * db
            if distance < best_distance:
                best_distance = distance
                best_key = key
        return best_key

    return fallback


def apply_theme_to_console(root_dir: str | Path, colors: Dict[str, str] | None = None) -> Dict[str, str]:
    """Apply the configured theme to the active console window (Windows only)."""
    resolved = colors or resolve_theme_colors(root_dir)
    if os.name == "nt":
        bg = _nibble_from_hex_or_name(resolved.get("background", ""), "1")
        fg = _nibble_from_hex_or_name(resolved.get("text", ""), "F")
        try:
            os.system(f"color {bg}{fg}")
        except Exception:  # pragma: no cover - best-effort
            os.system("color 1F")
    return resolved
