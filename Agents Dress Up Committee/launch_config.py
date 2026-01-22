"""
Launcher Config Reader
Reads settings/launcher_config.yml and returns values for the launcher.
Usage: python launch_config.py <key>
"""
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    # Fallback if PyYAML not installed - use simple line parsing
    yaml = None

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "settings" / "launcher_config.yml"

DEFAULTS = {
    "cli_backend": "codex",
    "working_directory": "chronos",
    "cli_timeout": "0",
    "immersive": "true",
    "include_memory": "true",
}


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return DEFAULTS.copy()
    
    try:
        text = CONFIG_PATH.read_text(encoding="utf-8")
        if yaml:
            data = yaml.safe_load(text) or {}
        else:
            # Simple fallback parser for key: value lines
            data = {}
            for line in text.splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if ":" in line:
                    k, v = line.split(":", 1)
                    data[k.strip()] = v.strip().strip('"').strip("'")
        # Merge with defaults
        result = DEFAULTS.copy()
        for k, v in data.items():
            if v is not None:
                result[k] = str(v).lower() if isinstance(v, bool) else str(v)
        return result
    except Exception as e:
        print(f"Error reading config: {e}", file=sys.stderr)
        return DEFAULTS.copy()


def main():
    if len(sys.argv) < 2:
        print("Usage: python launch_config.py <key>", file=sys.stderr)
        sys.exit(1)
    
    key = sys.argv[1].lower()
    config = load_config()
    
    if key == "all":
        for k, v in config.items():
            print(f"{k}={v}")
    elif key in config:
        print(config[key])
    else:
        print(f"Unknown key: {key}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
