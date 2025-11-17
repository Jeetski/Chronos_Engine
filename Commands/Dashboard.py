import os
import webbrowser
import json
import subprocess
import time
import sys
from datetime import datetime

try:
    import yaml
except Exception:
    yaml = None

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def run(args, properties):
    """
    Bundles settings into a generated manifest and opens the dashboard HTML.
    Looks for Utilities/Dashboard/dashboard.html first; falls back to Chronos_Engine_Dashboard.html.
    """
    try:
        bundle_settings_for_dashboard()
    except Exception as e:
        print(f"Warning: Could not bundle dashboard settings: {e}")

    util_dashboard = os.path.join(ROOT_DIR, "Utilities", "Dashboard", "dashboard.html")
    if not os.path.exists(util_dashboard):
        print("No dashboard HTML found at 'Utilities/Dashboard/dashboard.html'.")
        return

    # Ensure temp dashboard script lives under Temp/ if present at project root
    try:
        tmp_root_js = os.path.join(ROOT_DIR, 'tmp_dashboard_script.js')
        if os.path.exists(tmp_root_js):
            temp_dir = os.path.join(ROOT_DIR, 'Temp')
            os.makedirs(temp_dir, exist_ok=True)
            dest = os.path.join(temp_dir, 'tmp_dashboard_script.js')
            if os.path.abspath(tmp_root_js) != os.path.abspath(dest):
                try:
                    # Move to Temp/ so the dashboard can load it from /temp/
                    os.replace(tmp_root_js, dest)
                    print("Relocated tmp_dashboard_script.js to Temp/.")
                except Exception:
                    pass
    except Exception:
        pass

    # Launch local YAML API + static server
    host = properties.get('host', '127.0.0.1') if isinstance(properties, dict) else '127.0.0.1'
    port = str(properties.get('port', '7357')) if isinstance(properties, dict) else '7357'
    env = os.environ.copy()
    env['CHRONOS_DASH_HOST'] = host
    env['CHRONOS_DASH_PORT'] = port

    server_script = os.path.join(ROOT_DIR, 'Utilities', 'Dashboard', 'server.py')
    try:
        # Start detached process
        subprocess.Popen([sys.executable, server_script], cwd=ROOT_DIR, env=env)
        # Give server a moment to bind
        time.sleep(1.0)
    except Exception as e:
        print(f"Warning: Could not start dashboard server: {e}")

    url = f"http://{host}:{port}/dashboard.html"
    try:
        webbrowser.open_new_tab(url)
        print(f"Opened dashboard: {url}")
    except Exception as e:
        print(f"Could not open dashboard: {e}\nOpen manually: {url}")


def get_help_message():
    return """
Usage: dashboard
Description: Opens the Chronos dashboard UI in your default browser.
Also pre-bundles User/Settings YAML into generated/settings_bundle.js for the UI to consume.
"""


def bundle_settings_for_dashboard():
    """
    Reads relevant YAMLs from User/Settings and writes Utilities/Dashboard/generated/settings_bundle.js
    that sets window.CHRONOS_SETTINGS for the dashboard to use without fetch.
    """
    if yaml is None:
        raise RuntimeError("PyYAML not available")

    settings_dir = os.path.join(ROOT_DIR, "User", "Settings")
    out_dir = os.path.join(ROOT_DIR, "Utilities", "Dashboard", "generated")
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

    pr = read_yaml_first('priority_settings.yml', 'Priority_Settings.yml')
    cat = read_yaml_first('category_settings.yml', 'Category_Settings.yml')
    views_cfg = read_yaml_first('dashboard_views.yml', 'Dashboard_Views.yml')
    widgets_cfg = read_yaml_first('dashboard_widgets.yml', 'Dashboard_Widgets.yml')
    note_defaults = read_yaml_first('note_defaults.yml', 'Note_Defaults.yml')
    appointment_defaults = read_yaml_first('appointment_defaults.yml', 'Appointment_Defaults.yml')
    alarm_defaults = read_yaml_first('alarm_defaults.yml', 'Alarm_Defaults.yml')
    status_cfg = read_yaml_first('status_settings.yml', 'Status_Settings.yml')
    profile_cfg = read_yaml_first('profile.yml', 'Profile.yml') # Read profile.yml

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

    # Current status (try both path variants)
    current_status = {}
    for fname in ('current_status.yml', 'Current_Status.yml'):
        p = os.path.join(settings_dir, '..', fname)
        p = os.path.abspath(p)
        if os.path.exists(p):
            with open(p, 'r', encoding='utf-8') as f:
                try:
                    cs = yaml.safe_load(f) or {}
                    if isinstance(cs, dict):
                        current_status = {str(k).lower(): str(v) for k, v in cs.items()}
                except Exception:
                    pass
            break

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
