import os
import webbrowser
import json
import subprocess
import time
import sys
import socket
from datetime import datetime
from urllib import request as urlrequest, error as urlerror
from modules.scheduler import status_current_path
from utilities.webview_launcher import launch_webview_window

try:
    import yaml
except Exception:
    yaml = None

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _dashboard_health_url(host, port):
    return f"http://{host}:{port}/health"


def _as_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    raw = str(value).strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return default


def _dashboard_server_healthy(host, port, timeout=1.5):
    try:
        with urlrequest.urlopen(_dashboard_health_url(host, port), timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
        return getattr(resp, "status", 0) == 200 and "chronos-dashboard" in body
    except Exception:
        return False


def _port_listening(host, port, timeout=0.75):
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return True
    except Exception:
        return False


def _find_listening_pids(port):
    try:
        proc = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except Exception:
        return []
    needle = f":{int(port)}"
    pids = []
    for raw_line in (proc.stdout or "").splitlines():
        line = raw_line.strip()
        if not line or "LISTENING" not in line:
            continue
        parts = line.split()
        if len(parts) < 5:
            continue
        local_addr = parts[1]
        state = parts[3]
        pid = parts[4]
        if state != "LISTENING" or not local_addr.endswith(needle):
            continue
        try:
            pids.append(int(pid))
        except Exception:
            continue
    return sorted(set(pids))


def _kill_processes(pids):
    for pid in pids:
        try:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                cwd=ROOT_DIR,
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
        except Exception:
            continue


def _start_dashboard_server(server_script, env, visible_console=False):
    kwargs = {
        "cwd": ROOT_DIR,
        "env": env,
    }
    if os.name == "nt":
        flags = 0
        if visible_console:
            flags |= getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
        if flags:
            kwargs["creationflags"] = flags
    try:
        subprocess.Popen([sys.executable, server_script], **kwargs)
        return True
    except Exception as e:
        print(f"Warning: Could not start dashboard server: {e}")
        return False


def _ensure_dashboard_server(host, port, env, server_script, *, visible_console=False, restart=False):
    if _dashboard_server_healthy(host, port) and not restart:
        return True

    pids = _find_listening_pids(port)
    if pids:
        _kill_processes(pids)
        time.sleep(0.75)

    if not _start_dashboard_server(server_script, env, visible_console=visible_console):
        return False

    deadline = time.time() + 8.0
    while time.time() < deadline:
        if _dashboard_server_healthy(host, port):
            return True
        if not _port_listening(host, port):
            time.sleep(0.2)
            continue
        time.sleep(0.25)
    return False

def _read_dashboard_config():
    """Optional dashboard launch settings from user/settings config."""
    if yaml is None:
        return {}
    settings_dir = os.path.join(ROOT_DIR, "user", "settings")
    for fname in ("config.yml", "Config.yml"):
        path = os.path.join(settings_dir, fname)
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f) or {}
            if isinstance(cfg, dict):
                return cfg
        except Exception:
            continue
    return {}


def _read_dashboard_browser_setting():
    cfg = _read_dashboard_config()
    val = cfg.get("dashboard_browser") if isinstance(cfg, dict) else ""
    if not val and isinstance(cfg, dict):
        val = cfg.get("browser")
    return str(val or "").strip()


def _read_dashboard_mode_setting():
    cfg = _read_dashboard_config()
    if not isinstance(cfg, dict):
        return "browser"
    return str(cfg.get("dashboard_mode") or "browser").strip().lower() or "browser"

def _normalize_browser_command(raw):
    token = str(raw or "").strip()
    if not token:
        return ""
    low = token.lower()
    aliases = {
        "edge": "msedge",
        "msedge": "msedge",
        "chrome": "chrome",
        "google-chrome": "chrome",
        "firefox": "firefox",
        "brave": "brave",
        "opera": "opera",
        "default": "",
        "system": "",
    }
    return aliases.get(low, token)

def _open_dashboard_url(url, browser_cmd=""):
    cmd = _normalize_browser_command(browser_cmd)
    if not cmd:
        webbrowser.open_new_tab(url)
        return "default"
    try:
        subprocess.Popen([cmd, url], cwd=ROOT_DIR)
        return cmd
    except Exception:
        try:
            webbrowser.get(cmd).open_new_tab(url)
            return cmd
        except Exception:
            webbrowser.open_new_tab(url)
            return "default"


def _open_dashboard_webview(url, title="Chronos Dashboard"):
    return launch_webview_window(url, title)


def run(args, properties):
    """
    Bundles settings into a generated manifest and opens the dashboard HTML.
    Looks for utilities/dashboard/dashboard.html first; falls back to Chronos_Engine_Dashboard.html.
    """
    print(f"[dashboard] Interpreter: {sys.executable}")
    try:
        bundle_settings_for_dashboard()
    except Exception as e:
        print(f"Warning: Could not bundle dashboard settings: {e}")
    try:
        from utilities import registry_builder
        registry_builder.write_trick_registry()
    except Exception as e:
        print(f"Warning: Could not build TRICK registry: {e}")
    try:
        from utilities import registry_builder
        registry_builder.write_skills_registry()
    except Exception as e:
        print(f"Warning: Could not build skills registry: {e}")

    util_dashboard = os.path.join(ROOT_DIR, "utilities", "dashboard", "dashboard.html")
    if not os.path.exists(util_dashboard):
        print("No dashboard HTML found at 'utilities/dashboard/dashboard.html'.")
        return

    # Launch local YAML API + static server
    host = properties.get('host', '127.0.0.1') if isinstance(properties, dict) else '127.0.0.1'
    port = str(properties.get('port', '7357')) if isinstance(properties, dict) else '7357'
    env = os.environ.copy()
    env['CHRONOS_DASH_HOST'] = host
    env['CHRONOS_DASH_PORT'] = port

    server_script = os.path.join(ROOT_DIR, 'utilities', 'dashboard', 'server.py')
    visible_console = _as_bool(properties.get("server_console"), False) if isinstance(properties, dict) else False
    restart_server = _as_bool(properties.get("restart_server"), False) if isinstance(properties, dict) else False
    no_server = _as_bool(properties.get("browser_only"), False) if isinstance(properties, dict) else False
    server_ready = True
    if not no_server:
        server_ready = _ensure_dashboard_server(
            host,
            port,
            env,
            server_script,
            visible_console=visible_console,
            restart=restart_server,
        )
    if not server_ready:
        print(f"Warning: Dashboard server on {host}:{port} did not pass health checks.")

    url = f"http://{host}:{port}/dashboard.html"
    browser_from_props = ""
    mode_from_props = ""
    if isinstance(properties, dict):
        browser_from_props = str(properties.get("browser") or "").strip()
        mode_from_props = str(properties.get("dashboard_mode") or properties.get("mode") or "").strip().lower()
    browser_setting = browser_from_props or _read_dashboard_browser_setting()
    dashboard_mode = mode_from_props or _read_dashboard_mode_setting()
    try:
        if dashboard_mode == "webview":
            if _open_dashboard_webview(url, "Chronos Dashboard"):
                print(f"Opened dashboard in webview: {url}")
            else:
                print("Warning: pywebview launcher unavailable; falling back to browser.")
                opened_with = _open_dashboard_url(url, browser_setting)
                if opened_with == "default":
                    print(f"Opened dashboard: {url}")
                else:
                    print(f"Opened dashboard in '{opened_with}': {url}")
        else:
            opened_with = _open_dashboard_url(url, browser_setting)
            if opened_with == "default":
                print(f"Opened dashboard: {url}")
            else:
                print(f"Opened dashboard in '{opened_with}': {url}")
    except Exception as e:
        print(f"Could not open dashboard: {e}\nOpen manually: {url}")


def get_help_message():
    return """
Usage: dashboard
Description: Opens the Chronos dashboard UI in your default browser.
Optional: set `dashboard_mode` to `browser` or `webview` in user/settings/config.yml.
Optional: set `browser` (or `dashboard_browser`) in user/settings/config.yml, or pass `browser:<cmd>`.
Also pre-bundles user/settings YAML into generated/settings_bundle.js for the UI to consume.
"""


def bundle_settings_for_dashboard():
    """
    Reads relevant YAMLs from user/settings and writes utilities/dashboard/generated/settings_bundle.js
    that sets window.CHRONOS_SETTINGS for the dashboard to use without fetch.
    """
    if yaml is None:
        raise RuntimeError("PyYAML not available")

    settings_dir = os.path.join(ROOT_DIR, "user", "settings")
    out_dir = os.path.join(ROOT_DIR, "utilities", "dashboard", "generated")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "settings_bundle.js")

    def read_yaml_first(*names):
        for n in names:
            p = os.path.join(settings_dir, n)
            if os.path.exists(p):
                with open(p, 'r', encoding='utf-8') as f:
                    try:
                        return yaml.safe_load(f) or {}
                    except Exception:
                        return {}
        return {}

    pr = read_yaml_first('priority_settings.yml', 'priority_settings.yml')
    cat = read_yaml_first('category_settings.yml', 'category_settings.yml')
    views_cfg = read_yaml_first('dashboard_views.yml', 'Dashboard_Views.yml')
    widgets_cfg = read_yaml_first('dashboard_widgets.yml', 'Dashboard_Widgets.yml')
    note_defaults = read_yaml_first('note_defaults.yml', 'Note_Defaults.yml')
    appointment_defaults = read_yaml_first('appointment_defaults.yml', 'Appointment_Defaults.yml')
    alarm_defaults = read_yaml_first('alarm_defaults.yml', 'Alarm_Defaults.yml')
    status_cfg = read_yaml_first('status_settings.yml', 'status_settings.yml')
    profile_cfg = read_yaml_first('profile.yml', 'Profile.yml') # Read profile.yml
    dashboard_key_bindings_cfg = read_yaml_first('dashboard_key_bindings.yml', 'Dashboard_Key_Bindings.yml')

    # Status option files (attempt common variants)
    status_files = {
        'Health': ['health_settings.yml', 'Health_Settings.yml'],
        'Place': ['place_settings.yml', 'Place_Settings.yml'],
        'Energy': ['energy_settings.yml', 'Energy_Settings.yml'],
        'Mind State': ['mind_state_settings.yml', 'Mind_State_Settings.yml'],
        'Focus': ['focus_settings.yml', 'Focus_Settings.yml'],
        'Emotion': ['emotion_settings.yml', 'Emotion_Settings.yml'],
        'Vibe': ['vibe_settings.yml', 'Vibe_Settings.yml'],
    }

    # Current status
    current_status = {}
    p = status_current_path()
    if os.path.exists(p):
        with open(p, 'r', encoding='utf-8') as f:
            try:
                cs = yaml.safe_load(f) or {}
                if isinstance(cs, dict):
                    current_status = {str(k).lower(): str(v) for k, v in cs.items()}
            except Exception:
                pass

    def extract_priorities(pry):
        res = []
        if isinstance(pry, dict):
            if 'Priority_Settings' in pry and isinstance(pry['Priority_Settings'], dict):
                res = list(pry['Priority_Settings'].keys())
            else:
                res = [k for k, v in pry.items() if isinstance(v, dict)]
        return [str(x).lower() for x in res]

    def extract_categories(caty):
        res = []
        if isinstance(caty, dict):
            if 'Category_Settings' in caty and isinstance(caty['Category_Settings'], dict):
                res = list(caty['Category_Settings'].keys())
            else:
                res = [k for k, v in caty.items() if isinstance(v, dict)]
        return res

    priorities = extract_priorities(pr)
    categories = extract_categories(cat)
    views = views_cfg.get('views') if isinstance(views_cfg, dict) else None
    widgets = widgets_cfg.get('widgets') if isinstance(widgets_cfg, dict) else None

    bundle = {
        'source': {
            'generated_at': datetime.utcnow().isoformat() + 'Z',
            'files': [
                'priority_settings.yml',
                'category_settings.yml',
                'dashboard_views.yml',
                'dashboard_widgets.yml',
                'note_defaults.yml',
                'profile.yml', # Add profile.yml to the list of source files
                'dashboard_key_bindings.yml',
            ]
        },
        'priorities': priorities or ['low', 'medium', 'high'],
        'categories': categories or ['work', 'personal'],
        'views': views or [{'id': 'calendar', 'label': 'Calendar', 'default': True, 'enabled': True}],
        'widgets': widgets or [{'id': 'notes', 'label': 'Notes', 'default_open': True, 'enabled': True}],
        'defaults': {
            'note': note_defaults or {},
            'appointment': appointment_defaults or {},
            'alarm': alarm_defaults or {},
        },
        'profile': profile_cfg or {}, # Include profile data in the bundle
        'dashboard_key_bindings': dashboard_key_bindings_cfg or {},
    }

    # Build status payload
    def extract_status_types(cfg):
        res = []
        if isinstance(cfg, dict) and 'Status_Settings' in cfg and isinstance(cfg['Status_Settings'], list):
            for item in cfg['Status_Settings']:
                name = item.get('Name') if isinstance(item, dict) else None
                if name:
                    res.append(str(name))
        return res

    def extract_levels_from_file(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                d = yaml.safe_load(f) or {}
                if isinstance(d, dict):
                    # Take first top-level key that ends with _Settings
                    for k, v in d.items():
                        if isinstance(v, dict) and k.lower().endswith('_settings'):
                            return list(v.keys())
        except Exception:
            return None
        return None

    status_types = extract_status_types(status_cfg)
    status_options = {}
    for stype in status_types:
        files = status_files.get(stype, [])
        levels = None
        for n in files:
            p = os.path.join(settings_dir, n)
            if os.path.exists(p):
                levels = extract_levels_from_file(p)
                if levels:
                    break
        status_options[stype] = levels or []

    bundle['status'] = {
        'types': status_types,
        'options': status_options,
        'current': current_status,
    }

    # Ensure Status widget appears by default alongside Notes
    if not widgets:
        widgets = [
            {'id': 'notes', 'label': 'Notes', 'default_open': True, 'enabled': True},
            {'id': 'status', 'label': 'Status', 'default_open': True, 'enabled': True},
        ]
    else:
        ids = {w.get('id') for w in widgets if isinstance(w, dict)}
        if 'status' not in ids:
            widgets.append({'id': 'status', 'label': 'Status', 'default_open': True, 'enabled': True})

    bundle['widgets'] = widgets

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('window.CHRONOS_SETTINGS = ')
        json.dump(bundle, f, ensure_ascii=False)
        f.write(';')



