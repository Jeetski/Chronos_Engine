import io
import os
import sys
import yaml
import json
import base64
import threading
from datetime import datetime, timedelta
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import subprocess, shlex

# Paths
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# Ensure project root is importable so 'Modules' can be imported
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
DASHBOARD_DIR = os.path.abspath(os.path.join(ROOT_DIR, "Utilities", "Dashboard"))

from Utilities.dashboard_matrix import (
    compute_matrix,
    get_metadata as matrix_metadata,
    parse_filters as parse_matrix_filters,
    parse_dimension_sequence as parse_matrix_dimensions,
    list_matrix_presets,
    load_matrix_preset,
    save_matrix_preset,
    delete_matrix_preset,
)

# In-memory dashboard-scoped variables (exposed via /api/vars)
_DASH_VARS = {}
_LISTENER_PROC = None

def _vars_all():
    try:
        from Modules import Variables as _V
        try:
            m = _V.all_vars()
            if isinstance(m, dict):
                return m
        except Exception:
            pass
    except Exception:
        pass
    return dict(_DASH_VARS)

def _vars_set(k, v):
    try:
        from Modules import Variables as _V
        try:
            _V.set_var(str(k), v)
        except Exception:
            pass
    except Exception:
        pass
    _DASH_VARS[str(k)] = str(v)

def _vars_unset(k):
    try:
        from Modules import Variables as _V
        try:
            _V.unset_var(str(k))
        except Exception:
            pass
    except Exception:
        pass
    _DASH_VARS.pop(str(k), None)

def _expand_text(text):
    try:
        from Modules import Variables as _V
        try:
            return _V.expand_token(text)
        except Exception:
            return str(text)
    except Exception:
        # Simple fallback: replace @{var} and @var using _DASH_VARS
        import re
        m = _vars_all()
        def braced(mo):
            return str(m.get(mo.group(1), ''))
        def simple(mo):
            return str(m.get(mo.group(1), ''))
        s = str(text).replace('@@', '\x00AT\x00')
        s = re.sub(r"@\{([A-Za-z_][A-Za-z0-9_]*)\}", braced, s)
        s = re.sub(r"(?<![A-Za-z0-9_])@([A-Za-z_][A-Za-z0-9_]*)", simple, s)
        return s.replace('\x00AT\x00', '@')

def _vars_seed_defaults():
    try:
        # Seed nickname from profile.yml
        prof_path = os.path.join(ROOT_DIR, 'User', 'Profile', 'profile.yml')
        if os.path.exists(prof_path):
            try:
                with open(prof_path, 'r', encoding='utf-8') as f:
                    y = yaml.safe_load(f) or {}
                nick = None
                if isinstance(y, dict):
                    nick = y.get('nickname') or y.get('nick')
                    # console-nested nickname fallback if present
                    if not nick and isinstance(y.get('console'), dict):
                        nick = y.get('console', {}).get('nickname')
                if nick:
                    _vars_set('nickname', nick)
            except Exception:
                pass
        # Seed from optional User/Settings/vars.yml
        vpath = os.path.join(ROOT_DIR, 'User', 'Settings', 'vars.yml')
        if os.path.exists(vpath):
            try:
                with open(vpath, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f) or {}
                if isinstance(data, dict):
                    for k, v in data.items():
                        try:
                            if k is None: continue
                            _vars_set(str(k), v)
                        except Exception:
                            continue
            except Exception:
                pass
    except Exception:
        pass

# Seed vars at import time
try:
    _vars_seed_defaults()
except Exception:
    pass

def run_console_command(command_name, args_list):
    """
    Invoke the Console command pipeline.
    Preferred: in-process import of Modules.Console.run_command.
    Fallback: subprocess execution of Console via Python.
    Returns (ok, stdout, stderr).
    """
    # Try in-process
    try:
        from Modules import Console as ConsoleModule  # type: ignore
        old_out, old_err = sys.stdout, sys.stderr
        out_buf, err_buf = io.StringIO(), io.StringIO()
        sys.stdout, sys.stderr = out_buf, err_buf
        ok = True
        try:
            ConsoleModule.run_command(command_name, args_list, {})
        except Exception as e:
            ok = False
            print(f"Error: {e}")
        finally:
            sys.stdout, sys.stderr = old_out, old_err
        return ok, out_buf.getvalue().strip(), err_buf.getvalue().strip()
    except Exception:
        # Fallback: subprocess
        import subprocess

        def quote(t: str) -> str:
            s = str(t)
            if any(c.isspace() for c in s) or any(c in s for c in ['"', "'", ':']):
                s = '"' + s.replace('"', '\\"') + '"'
            return s

        cmdline = ' '.join([command_name] + [quote(a) for a in args_list])
        proc = subprocess.Popen([sys.executable, os.path.join(ROOT_DIR, 'Modules', 'Console.py'), cmdline],
                                cwd=ROOT_DIR, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        out, err = proc.communicate(timeout=30)
        ok = proc.returncode == 0
        return ok, (out or '').strip(), (err or '').strip()


class DashboardHandler(SimpleHTTPRequestHandler):
    server_version = "ChronosDashboardServer/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DASHBOARD_DIR, **kwargs)

    def _set_cors(self):
        # Allow same-origin and file:// usage; relax for localhost development
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        sys.stderr.write(f"DEBUG: GET request path: {parsed.path}\n") # DEBUG
        sys.stderr.flush()
        sys.stderr.write(f"DEBUG: Checking path for /api/profile: {parsed.path}\n") # TEMP DEBUG
        sys.stderr.flush()
        # Lazy import ItemManager helpers when API endpoints are hit
        def im():
            from Modules.ItemManager import list_all_items, read_item_data, write_item_data, delete_item, get_item_path
            return list_all_items, read_item_data, write_item_data, delete_item, get_item_path
        if parsed.path == "/health":
            payload = {"ok": True, "service": "chronos-dashboard"}
            data = yaml.safe_dump(payload, allow_unicode=True)
            self.send_response(200)
            self._set_cors()
            self.send_header("Content-Type", "text/yaml; charset=utf-8")
            self.send_header("Content-Length", str(len(data.encode("utf-8"))))
            self.end_headers()
            self.wfile.write(data.encode("utf-8"))
            return
        if parsed.path == "/api/profile":
            # Return profile as JSON map (nickname/theme/etc.)
            try:
                prof_path = os.path.join(ROOT_DIR, 'User', 'Profile', 'profile.yml')
                data = {}
                if os.path.exists(prof_path):
                    with open(prof_path, 'r', encoding='utf-8') as f:
                        y = yaml.safe_load(f) or {}
                        if isinstance(y, dict):
                            data = y
                self._write_json(200, {"ok": True, "profile": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read profile: {e}"})
            return
        if parsed.path == "/api/preferences":
            try:
                pref_path = os.path.join(ROOT_DIR, 'User', 'Profile', 'preferences_settings.yml')
                data = {}
                if os.path.exists(pref_path):
                    with open(pref_path, 'r', encoding='utf-8') as f:
                        data = yaml.safe_load(f) or {}
                self._write_json(200, {"ok": True, "preferences": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read preferences: {e}"})
            return
        if parsed.path == "/api/theme":
            # Lookup a theme by name in User/Settings/theme_settings.yml
            try:
                qs = parse_qs(parsed.query or '')
                name = (qs.get('name') or [''])[0].strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing name"}); return
                settings_path = os.path.join(ROOT_DIR, 'User', 'Settings', 'theme_settings.yml')
                if not os.path.exists(settings_path):
                    self._write_json(404, {"ok": False, "error": "theme_settings.yml not found"}); return
                with open(settings_path, 'r', encoding='utf-8') as f:
                    y = yaml.safe_load(f) or {}
                themes = (y.get('themes') if isinstance(y, dict) else None) or {}
                found = None
                for key, val in (themes.items() if isinstance(themes, dict) else []):
                    if str(key).strip().lower() == name.lower():
                        found = val; break
                if not isinstance(found, dict):
                    self._write_json(404, {"ok": False, "error": "Theme not found"}); return
                # Normalize colors
                bg = found.get('background_hex') or found.get('background') or found.get('bg')
                fg = found.get('text_hex') or found.get('text') or found.get('fg')
                self._write_json(200, {"ok": True, "name": name, "background_hex": bg, "text_hex": fg, "theme": found})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read theme: {e}"})
            return
        if parsed.path == "/api/cockpit/matrix":
            try:
                qs = parse_qs(parsed.query or "")
                row_raw = (qs.get("row") or [None])[0]
                col_raw = (qs.get("col") or [None])[0]
                row = parse_matrix_dimensions(row_raw, ["item_type"])
                col = parse_matrix_dimensions(col_raw, ["item_status"])
                metric = (qs.get("metric") or ["count"])[0] or "count"
                row_sort = (qs.get("row_sort") or ['label-asc'])[0] or 'label-asc'
                col_sort = (qs.get("col_sort") or ['label-asc'])[0] or 'label-asc'
                filters_raw = (qs.get("filters") or [None])[0]
                filters = parse_matrix_filters(filters_raw) if filters_raw else {}
                meta_only = ((qs.get("meta") or ["false"])[0] or "").lower() == "true"
                if meta_only:
                    payload = matrix_metadata()
                else:
                    payload = compute_matrix(row, col, metric, filters, row_sort=row_sort, col_sort=col_sort)
                self._write_json(200, {"ok": True, **payload})
            except ValueError as e:
                self._write_json(400, {"ok": False, "error": str(e)})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Matrix error: {e}"})
            return
        if parsed.path == "/api/cockpit/matrix/presets":
            try:
                qs = parse_qs(parsed.query or "")
                name = (qs.get("name") or [""])[0].strip()
                if name:
                    preset = load_matrix_preset(name)
                    self._write_json(200, {"ok": True, "preset": preset})
                else:
                    self._write_json(200, {"ok": True, "presets": list_matrix_presets()})
            except FileNotFoundError:
                self._write_json(404, {"ok": False, "error": "Preset not found"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Preset error: {e}"})
            return
        if parsed.path == "/api/status/current":
            try:
                status_path = os.path.join(ROOT_DIR, 'User', 'current_status.yml')
                data = {}
                if os.path.exists(status_path):
                    with open(status_path, 'r', encoding='utf-8') as f:
                        data = yaml.safe_load(f) or {}
                self._write_json(200, {"ok": True, "status": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read current_status: {e}"})
            return
        if parsed.path == "/api/habits":
            # Enumerate habits with basic fields and today status
            try:
                user_dir = os.path.join(ROOT_DIR, 'User')
                habits_dir = os.path.join(user_dir, 'Habits')
                items = []
                today = None
                try:
                    today = datetime.now().strftime('%Y-%m-%d')
                except Exception:
                    pass
                if os.path.isdir(habits_dir):
                    for fn in os.listdir(habits_dir):
                        if not fn.lower().endswith('.yml'):
                            continue
                        fpath = os.path.join(habits_dir, fn)
                        try:
                            with open(fpath, 'r', encoding='utf-8') as f:
                                d = yaml.safe_load(f) or {}
                            def g(key, alt=None):
                                return d.get(key) if key in d else d.get(alt) if alt else None
                            name = g('name') or os.path.splitext(fn)[0]
                            category = g('category')
                            priority = g('priority')
                            polarity = str(g('polarity', 'polarity') or 'good').lower()
                            curr = int(g('current_streak', 'current_streak') or 0)
                            longest = int(g('longest_streak', 'longest_streak') or 0)
                            clean_curr = int(g('clean_current_streak', 'clean_current_streak') or 0)
                            clean_long = int(g('clean_longest_streak', 'clean_longest_streak') or 0)
                            comp = g('completion_dates', 'completion_dates') or []
                            inc = g('incident_dates', 'incident_dates') or []
                            today_status = None
                            if today:
                                if polarity == 'bad' and isinstance(inc, list) and today in inc:
                                    today_status = 'incident'
                                elif polarity != 'bad' and isinstance(comp, list) and today in comp:
                                    today_status = 'done'
                            items.append({
                                'name': str(name),
                                'polarity': polarity,
                                'category': category,
                                'priority': priority,
                                'streak_current': curr,
                                'streak_longest': longest,
                                'clean_current': clean_curr,
                                'clean_longest': clean_long,
                                'today_status': today_status,
                            })
                        except Exception:
                            continue
                self._write_yaml(200, { 'ok': True, 'habits': items })
            except Exception as e:
                self._write_yaml(500, { 'ok': False, 'error': f'Habits error: {e}' })
            return
        if parsed.path == "/api/goals":
            # Return goals with computed overall progress and counts
            try:
                from Modules.Milestone import main as MilestoneModule  # type: ignore
                MilestoneModule.evaluate_and_update_milestones()
            except Exception:
                pass
            try:
                from Modules.ItemManager import list_all_items
                goals = list_all_items('goal') or []
                milestones = list_all_items('milestone') or []
                # Group milestones by goal
                by_goal = {}
                for m in milestones:
                    if not isinstance(m, dict):
                        continue
                    gname = (m.get('goal') or '').strip()
                    if not gname:
                        continue
                    by_goal.setdefault(gname, []).append(m)
                out = []
                for g in goals:
                    if not isinstance(g, dict):
                        continue
                    name = g.get('name') or ''
                    ms = by_goal.get(name, [])
                    total_w = 0
                    acc = 0.0
                    comp = 0
                    pend = 0
                    inprog = 0
                    for m in ms:
                        w = int(m.get('weight') or 1)
                        p = ((m.get('progress') or {}) if isinstance(m.get('progress'), dict) else {})
                        pct = float(p.get('percent') or 0)
                        acc += pct * w
                        total_w += w
                        st = str(m.get('status','pending')).lower()
                        if st == 'completed': comp += 1
                        elif st == 'in-progress': inprog += 1
                        else: pend += 1
                    overall = (acc/total_w) if total_w>0 else 0.0
                    due = g.get('due_date') or g.get('due') or None
                    out.append({
                        'name': name,
                        'overall': round(overall, 1),
                        'milestones_total': len(ms),
                        'milestones_completed': comp,
                        'milestones_in_progress': inprog,
                        'milestones_pending': pend,
                        'due_date': due,
                        'priority': g.get('priority'),
                        'status': g.get('status'),
                        'category': g.get('category'),
                    })
                self._write_json(200, {"ok": True, "goals": out})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Goals error: {e}"})
            return
        if parsed.path == "/api/points":
            try:
                from Utilities import points as Points
                qs = parse_qs(parsed.query or '')
                limit_raw = (qs.get('limit') or [''])[0].strip()
                last = None
                if limit_raw:
                    try:
                        last_val = int(limit_raw)
                        if last_val > 0:
                            last = last_val
                    except Exception:
                        last = None
                history = Points.get_history(last) or []
                balance = Points.get_balance()
                self._write_json(200, {"ok": True, "balance": balance, "history": history})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Points error: {e}"})
            return
        if parsed.path == "/api/rewards":
            try:
                from Modules.ItemManager import list_all_items
                rewards = list_all_items('reward') or []
                now = datetime.now()
                def parse_int(val, default=None):
                    try:
                        if val is None or (isinstance(val, str) and not val.strip()):
                            return default
                        return int(val)
                    except Exception:
                        return default
                def parse_dt(val):
                    if not val:
                        return None
                    text = str(val).strip()
                    if not text:
                        return None
                    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
                        try:
                            return datetime.strptime(text, fmt)
                        except Exception:
                            continue
                    try:
                        return datetime.fromisoformat(text)
                    except Exception:
                        return None
                items = []
                for raw in rewards:
                    if not isinstance(raw, dict):
                        continue
                    name = str(raw.get('name') or raw.get('title') or '').strip()
                    if not name:
                        continue
                    cost_map = raw.get('cost') if isinstance(raw.get('cost'), dict) else {}
                    points_cost = parse_int(cost_map.get('points'), 0) or 0
                    cooldown_min = parse_int(raw.get('cooldown_minutes'), 0) or 0
                    last_dt = parse_dt(raw.get('last_redeemed'))
                    ready_at = None
                    cooldown_ready = True
                    cooldown_remaining = 0
                    if cooldown_min and last_dt:
                        ready_at = last_dt + timedelta(minutes=cooldown_min)
                        if ready_at > now:
                            cooldown_ready = False
                            cooldown_remaining = max(0, int((ready_at - now).total_seconds() // 60))
                    redemptions = parse_int(raw.get('redemptions'), 0) or 0
                    max_red = parse_int(raw.get('max_redemptions'))
                    limit_ready = True
                    if isinstance(max_red, int) and max_red > 0 and redemptions >= max_red:
                        limit_ready = False
                    available = cooldown_ready and limit_ready
                    items.append({
                        "name": name,
                        "description": raw.get('description') or raw.get('notes') or raw.get('summary'),
                        "category": raw.get('category'),
                        "priority": raw.get('priority'),
                        "cost_points": points_cost,
                        "cooldown_minutes": cooldown_min,
                        "cooldown_ready": cooldown_ready,
                        "cooldown_remaining_minutes": cooldown_remaining,
                        "cooldown_ready_at": ready_at.strftime('%Y-%m-%d %H:%M:%S') if ready_at else None,
                        "redemptions": redemptions,
                        "max_redemptions": max_red,
                        "last_redeemed": raw.get('last_redeemed'),
                        "target": raw.get('target'),
                        "tags": raw.get('tags'),
                        "available": available,
                        "limit_ready": limit_ready,
                    })
                items.sort(key=lambda r: (not r.get('available', False), str(r.get('name','')).lower()))
                self._write_json(200, {"ok": True, "rewards": items})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Rewards error: {e}"})
            return
        if parsed.path == "/api/achievements":
            try:
                from Modules.ItemManager import list_all_items
                rows = list_all_items('achievement') or []
                def parse_int(val):
                    try:
                        if val is None or val == '':
                            return None
                        return int(val)
                    except Exception:
                        return None
                items = []
                for raw in rows:
                    if not isinstance(raw, dict):
                        continue
                    name = str(raw.get('name') or '').strip()
                    if not name:
                        continue
                    status = str(raw.get('status') or '').strip().lower()
                    awarded_at = raw.get('awarded_at') or raw.get('awarded_on') or raw.get('completed')
                    awarded_flag = bool(raw.get('awarded')) or bool(awarded_at) or status in ('awarded','completed','done','celebrated')
                    archived_flag = bool(raw.get('archived')) or status == 'archived'
                    state = 'archived' if archived_flag else ('awarded' if awarded_flag else (status or 'pending'))
                    tags = raw.get('tags')
                    if isinstance(tags, str):
                        tags = [t.strip() for t in tags.split(',') if t.strip()]
                    elif not isinstance(tags, list):
                        tags = []
                    items.append({
                        "name": name,
                        "description": raw.get('description') or raw.get('notes'),
                        "category": raw.get('category'),
                        "priority": raw.get('priority'),
                        "status": status or state,
                        "state": state,
                        "awarded": awarded_flag,
                        "awarded_at": awarded_at,
                        "points": parse_int(raw.get('points') or raw.get('value')) or 0,
                        "tags": tags,
                        "created": raw.get('created') or raw.get('date_created'),
                        "updated": raw.get('updated') or raw.get('last_updated'),
                    })
                total = len(items)
                awarded = sum(1 for r in items if r.get('state') == 'awarded')
                archived = sum(1 for r in items if r.get('state') == 'archived')
                pending = total - awarded - archived
                counts = {
                    "total": total,
                    "awarded": awarded,
                    "archived": archived,
                    "pending": pending,
                }
                self._write_json(200, {"ok": True, "achievements": items, "counts": counts})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Achievements error: {e}"})
            return
        if parsed.path == "/api/commitments":
            try:
                from Modules.ItemManager import list_all_items
                from Modules.Commitment import main as CommitmentModule  # type: ignore
                commitments = list_all_items('commitment') or []
                today_str = datetime.now().strftime('%Y-%m-%d')
                out = []
                met_count = 0
                violation_count = 0
                for raw in commitments:
                    if not isinstance(raw, dict):
                        continue
                    name = str(raw.get('name') or 'Commitment')
                    freq = raw.get('frequency') if isinstance(raw.get('frequency'), dict) else None
                    assoc = raw.get('associated_items') if isinstance(raw.get('associated_items'), list) else []
                    forb = raw.get('forbidden_items') if isinstance(raw.get('forbidden_items'), list) else []
                    times = int(freq.get('times') or 0) if freq else 0
                    period = str(freq.get('period') or 'week').lower() if freq else None
                    progress = 0
                    if freq and assoc:
                        for it in assoc:
                            if not isinstance(it, dict):
                                continue
                            t = str(it.get('type') or '').strip()
                            n = str(it.get('name') or '').strip()
                            if not t or not n:
                                continue
                            try:
                                dates = CommitmentModule._get_completion_dates(t, n)
                                progress += CommitmentModule._count_in_period(dates, period or 'week')
                            except Exception:
                                continue
                    met = bool(freq and times > 0 and progress >= times)
                    violation = False
                    if raw.get('never') and forb:
                        for it in forb:
                            if not isinstance(it, dict):
                                continue
                            t = str(it.get('type') or '').strip()
                            n = str(it.get('name') or '').strip()
                            if not t or not n:
                                continue
                            try:
                                dates = CommitmentModule._get_completion_dates(t, n)
                                if today_str in (dates or []):
                                    violation = True
                                    break
                            except Exception:
                                continue
                    state = 'violation' if violation else ('met' if met else 'pending')
                    if state == 'met':
                        met_count += 1
                    elif state == 'violation':
                        violation_count += 1
                    out.append({
                        "name": name,
                        "description": raw.get('description') or raw.get('notes'),
                        "frequency": freq,
                        "period": period or 'week',
                        "times_required": times,
                        "progress": progress,
                        "associated": assoc,
                        "forbidden": forb,
                        "never": bool(raw.get('never')),
                        "triggers": raw.get('triggers'),
                        "status": state,
                        "met": met,
                        "violation": violation,
                        "last_met": raw.get('last_met'),
                        "last_violation": raw.get('last_violation'),
                    })
                counts = {
                    "total": len(out),
                    "met": met_count,
                    "violations": violation_count,
                    "pending": len(out) - met_count - violation_count,
                }
                self._write_json(200, {"ok": True, "commitments": out, "counts": counts})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Commitments error: {e}"})
            return
        if parsed.path == "/api/milestones":
            try:
                from Modules.Milestone import main as MilestoneModule  # type: ignore
                from Modules.ItemManager import list_all_items
                try:
                    MilestoneModule.evaluate_and_update_milestones()
                except Exception:
                    pass
                rows = list_all_items('milestone') or []
                items = []
                status_counts = {'total':0,'completed':0,'in_progress':0,'pending':0}
                for raw in rows:
                    if not isinstance(raw, dict):
                        continue
                    name = str(raw.get('name') or '').strip()
                    if not name:
                        continue
                    prog = raw.get('progress') if isinstance(raw.get('progress'), dict) else {}
                    percent = float(prog.get('percent') or 0)
                    current = prog.get('current')
                    target = prog.get('target')
                    status = (raw.get('status') or 'pending').lower()
                    if status not in status_counts:
                        status_counts[status] = 0
                    status_counts['total'] += 1
                    if status == 'completed':
                        status_counts['completed'] += 1
                    elif status == 'in-progress':
                        status_counts['in_progress'] += 1
                    else:
                        status_counts['pending'] += 1
                    items.append({
                        "name": name,
                        "goal": raw.get('goal'),
                        "status": status,
                        "priority": raw.get('priority'),
                        "category": raw.get('category'),
                        "due_date": raw.get('due_date') or raw.get('due'),
                        "progress_percent": percent,
                        "progress_current": current,
                        "progress_target": target,
                        "weight": raw.get('weight'),
                        "completed_at": raw.get('completed'),
                        "criteria": raw.get('criteria'),
                        "triggers": raw.get('triggers'),
                    })
                self._write_json(200, {"ok": True, "milestones": items, "counts": status_counts})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Milestones error: {e}"})
            return
        if parsed.path == "/api/goal":
            try:
                from Modules.Milestone import main as MilestoneModule  # type: ignore
                MilestoneModule.evaluate_and_update_milestones()
            except Exception:
                pass
            try:
                qs = parse_qs(parsed.query)
                name = (qs.get('name') or [''])[0].strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing goal name"}); return
                from Modules.ItemManager import read_item_data, list_all_items
                goal = read_item_data('goal', name)
                if not goal:
                    self._write_json(404, {"ok": False, "error": "Goal not found"}); return
                milestones = [m for m in (list_all_items('milestone') or []) if isinstance(m, dict) and (m.get('goal') or '').strip()==name]
                # Compute overall
                total_w = 0; acc = 0.0
                det_ms = []
                for m in milestones:
                    w = int(m.get('weight') or 1)
                    pr = ((m.get('progress') or {}) if isinstance(m.get('progress'), dict) else {})
                    pct = float(pr.get('percent') or 0)
                    acc += pct * w
                    total_w += w
                    # criteria summary
                    crit = m.get('criteria') or {}
                    summary = ''
                    try:
                        if 'count' in crit:
                            c = crit['count'] or {}
                            of = c.get('of') or {}
                            summary = f"{of.get('type','')}:{of.get('name','')} x {c.get('times','?')} ({c.get('period','all')})"
                        elif 'checklist' in crit:
                            cl = crit['checklist'] or {}
                            items = cl.get('items') or []
                            summary = f"checklist {len(items)} (require {cl.get('require','all')})"
                    except Exception:
                        pass
                    det_ms.append({
                        'name': m.get('name'),
                        'status': m.get('status'),
                        'progress': pr,
                        'weight': w,
                        'criteria': summary,
                        'links': m.get('links') or [],
                        'completed': m.get('completed') or None,
                    })
                overall = (acc/total_w) if total_w>0 else 0.0
                self._write_json(200, {"ok": True, "goal": {
                    'name': name,
                    'overall': round(overall,1),
                    'due_date': goal.get('due_date') or goal.get('due') or None,
                    'status': goal.get('status'),
                    'priority': goal.get('priority'),
                    'category': goal.get('category'),
                    'milestones': det_ms,
                }})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Goal detail error: {e}"})
            return
        if parsed.path == "/api/timer/status":
            try:
                from Modules.Timer import main as Timer
                st = Timer.status()
                self._write_json(200, {"ok": True, "status": st})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer status error: {e}"})
            return
        if parsed.path == "/api/timer/profiles":
            try:
                from Modules.Timer import main as Timer
                Timer.ensure_default_profiles()
                profiles = {}
                for name in (Timer.profiles_list() or []):
                    profiles[name] = Timer.profiles_view(name)
                self._write_json(200, {"ok": True, "profiles": profiles})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer profiles error: {e}"})
            return
        if parsed.path == "/api/timer/settings":
            try:
                # Load Timer_Settings.yml if present
                path = os.path.join(ROOT_DIR, 'User', 'Settings', 'Timer_Settings.yml')
                data = {}
                if os.path.exists(path):
                    with open(path, 'r') as f:
                        data = yaml.safe_load(f) or {}
                self._write_json(200, {"ok": True, "settings": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer settings error: {e}"})
            return
        if parsed.path == "/api/profile":
            try:
                profile_path = os.path.join(ROOT_DIR, 'User', 'Profile', 'profile.yml')
                profile_data = {}
                nickname = None
                avatar_rel = None
                avatar_data_url = None
                welcome_block = { 'line1': None, 'line2': None, 'line3': None }
                exit_block = { 'line1': None, 'line2': None }
                preferences_map = None

                if os.path.exists(profile_path):
                    with open(profile_path, 'r', encoding='utf-8') as f:
                        profile_data = yaml.safe_load(f) or {}
                    nickname = profile_data.get('nickname')
                    avatar_rel = profile_data.get('avatar')
                    # welcome: prefer 'welcome', fallback 'welcome_message'
                    try:
                        wb = profile_data.get('welcome') or profile_data.get('welcome_message') or {}
                        if isinstance(wb, dict):
                            welcome_block['line1'] = wb.get('line1')
                            welcome_block['line2'] = wb.get('line2')
                            welcome_block['line3'] = wb.get('line3')
                    except Exception:
                        pass
                    # exit/goodbye: prefer 'exit_message', fallback 'goodbye_message'
                    try:
                        eb = profile_data.get('exit_message') or profile_data.get('goodbye_message') or {}
                        if isinstance(eb, dict):
                            exit_block['line1'] = eb.get('line1')
                            exit_block['line2'] = eb.get('line2')
                    except Exception:
                        pass
                    # preferences: support preferences.yml/.yaml and preferences_settings.yml
                    try:
                        pref_candidates = [
                            os.path.join(ROOT_DIR, 'User', 'Profile', 'preferences.yml'),
                            os.path.join(ROOT_DIR, 'User', 'Profile', 'preferences.yaml'),
                            os.path.join(ROOT_DIR, 'User', 'Profile', 'preferences_settings.yml'),
                        ]
                        for pp in pref_candidates:
                            if os.path.exists(pp) and os.path.isfile(pp):
                                with open(pp, 'r', encoding='utf-8') as pf:
                                    loaded = yaml.safe_load(pf) or {}
                                if isinstance(loaded, dict):
                                    preferences_map = loaded
                                    break
                    except Exception:
                        preferences_map = None

                # Normalize avatar path and embed as data URL if available
                if isinstance(avatar_rel, str) and avatar_rel.strip():
                    # Allow either forward or back slashes in YAML
                    norm_rel = avatar_rel.replace('\\', '/').lstrip('/')
                    # If path is already under User/, respect as project-relative
                    avatar_abs = os.path.join(ROOT_DIR, norm_rel) if not os.path.isabs(norm_rel) else norm_rel
                    try:
                        if os.path.exists(avatar_abs) and os.path.isfile(avatar_abs):
                            ext = os.path.splitext(avatar_abs)[1].lower()
                            mime = 'image/jpeg'
                            if ext in ['.png']: mime = 'image/png'
                            elif ext in ['.gif']: mime = 'image/gif'
                            elif ext in ['.webp']: mime = 'image/webp'
                            with open(avatar_abs, 'rb') as af:
                                b64 = base64.b64encode(af.read()).decode('ascii')
                            avatar_data_url = f"data:{mime};base64,{b64}"
                    except Exception:
                        avatar_data_url = None

                response_data = {"ok": True, "profile": {"nickname": nickname, "avatar_path": avatar_rel, "avatar_data_url": avatar_data_url, "welcome": welcome_block, "exit": exit_block, "preferences": preferences_map}}
                self._write_json(200, response_data)
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to load profile: {e}"})
            return
        if parsed.path == "/api/profile/avatar":
            try:
                profile_path = os.path.join(ROOT_DIR, 'User', 'Profile', 'profile.yml')
                avatar_rel = None
                if os.path.exists(profile_path):
                    with open(profile_path, 'r', encoding='utf-8') as f:
                        prof = yaml.safe_load(f) or {}
                        avatar_rel = prof.get('avatar')
                if not avatar_rel:
                    self.send_response(404)
                    self._set_cors()
                    self.end_headers();
                    return
                norm_rel = str(avatar_rel).replace('\\', '/').lstrip('/')
                avatar_abs = os.path.join(ROOT_DIR, norm_rel) if not os.path.isabs(norm_rel) else norm_rel
                if not (os.path.exists(avatar_abs) and os.path.isfile(avatar_abs)):
                    self.send_response(404); self._set_cors(); self.end_headers(); return
                ext = os.path.splitext(avatar_abs)[1].lower()
                mime = 'image/jpeg'
                if ext in ['.png']: mime = 'image/png'
                elif ext in ['.gif']: mime = 'image/gif'
                elif ext in ['.webp']: mime = 'image/webp'
                with open(avatar_abs, 'rb') as af:
                    data = af.read()
                self.send_response(200)
                self._set_cors()
                self.send_header('Content-Type', mime)
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self.send_response(500)
                self._set_cors()
                self.end_headers()
            return
        if parsed.path == "/api/settings":
            # List or fetch user settings files under User/Settings
            try:
                qs = parse_qs(parsed.query or '')
                settings_root = os.path.join(ROOT_DIR, 'User', 'Settings')
                if not os.path.isdir(settings_root):
                    self._write_json(200, {"ok": True, "files": []}); return
                fname = (qs.get('file') or [''])[0].strip()
                if fname:
                    # Sanitize
                    if ('..' in fname) or (fname.startswith('/') or fname.startswith('\\')):
                        self._write_yaml(400, {"ok": False, "error": "Invalid file"}); return
                    fpath = os.path.abspath(os.path.join(settings_root, fname))
                    if not fpath.startswith(os.path.abspath(settings_root)):
                        self._write_yaml(403, {"ok": False, "error": "Forbidden"}); return
                    if not os.path.exists(fpath) or not os.path.isfile(fpath):
                        self._write_yaml(404, {"ok": False, "error": "Not found"}); return
                    try:
                        with open(fpath, 'r', encoding='utf-8') as fh:
                            text = fh.read()
                        parsed_yaml = {}
                        try:
                            loaded = yaml.safe_load(text) or {}
                            if isinstance(loaded, dict):
                                parsed_yaml = loaded
                        except Exception:
                            parsed_yaml = {}
                        self._write_json(200, {"ok": True, "file": fname, "content": text, "data": parsed_yaml})
                    except Exception as e:
                        self._write_json(500, {"ok": False, "error": f"Read failed: {e}"})
                    return
                # List files
                files = [fn for fn in os.listdir(settings_root) if fn.lower().endswith(('.yml', '.yaml'))]
                files.sort(key=lambda s: s.lower())
                self._write_json(200, {"ok": True, "files": files})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Settings error: {e}"})
            return
        if parsed.path == "/api/items":
            # Query params: type, q, props (csv key:value)
            try:
                qs = parse_qs(parsed.query)
                item_type = (qs.get('type') or [''])[0].strip().lower()
                q = (qs.get('q') or [''])[0].strip().lower()
                props_csv = (qs.get('props') or [''])[0]
                props = {}
                if props_csv:
                    for part in str(props_csv).split(','):
                        if ':' in part:
                            k, v = part.split(':', 1)
                            props[k.strip().lower()] = v.strip().lower()
                list_all_items, _, _, _, get_item_path = im()
                items = list_all_items(item_type) if item_type else []
                out = []
                for d in items:
                    if not isinstance(d, dict):
                        continue
                    # Normalize keys
                    dn = {str(k).lower(): v for k, v in d.items()}
                    name = dn.get('name') or ''
                    if q and q not in str(name).lower() and q not in str(dn.get('content','')).lower():
                        continue
                    ok = True
                    for pk, pv in props.items():
                        dv = dn.get(pk)
                        if dv is None or str(dv).lower() != pv:
                            ok = False; break
                    if not ok:
                        continue
                    # Determine updated timestamp from file mtime
                    upd = None
                    try:
                        fpath = get_item_path(item_type, name)
                        if fpath and os.path.exists(fpath):
                            from datetime import datetime as _dt
                            upd = _dt.fromtimestamp(os.path.getmtime(fpath)).strftime('%Y-%m-%d %H:%M')
                    except Exception:
                        upd = None
                    entry = {
                        'name': name,
                        'type': item_type,
                        'category': dn.get('category'),
                        'priority': dn.get('priority'),
                        'status': dn.get('status'),
                        'updated': upd,
                    }
                    if item_type == 'project':
                        entry['state'] = dn.get('state') or dn.get('status')
                        entry['stage'] = dn.get('stage')
                        entry['owner'] = dn.get('owner')
                    elif item_type == 'inventory':
                        # Surface placement metadata and linked entries so dashboards can show counts
                        entry['places'] = dn.get('places') or dn.get('location')
                        entry['tags'] = dn.get('tags')
                        inv_items = dn.get('inventory_items')
                        if not isinstance(inv_items, list):
                            inv_items = dn.get('items') if isinstance(dn.get('items'), list) else []
                        entry['inventory_items'] = inv_items if isinstance(inv_items, list) else []
                        tools = dn.get('tools')
                        entry['tools'] = tools if isinstance(tools, list) else []
                    out.append(entry)
                self._write_json(200, {"ok": True, "items": out})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to list items: {e}"})
            return
        if parsed.path == "/api/project/detail":
            try:
                qs = parse_qs(parsed.query or '')
                proj_name = (qs.get('name') or [''])[0].strip()
                if not proj_name:
                    self._write_json(400, {"ok": False, "error": "Missing project name"}); return
                from Modules.ItemManager import read_item_data, list_all_items
                project = read_item_data('project', proj_name)
                if not project:
                    self._write_json(404, {"ok": False, "error": "Project not found"}); return
                key = proj_name.strip().lower()
                def _belongs(item):
                    return str(item.get('project') or '').strip().lower() == key
                milestones = [m for m in (list_all_items('milestone') or []) if _belongs(m)]
                linked = {}
                link_types = ['task','habit','routine','subroutine','microroutine','note','plan','appointment','ritual']
                for t in link_types:
                    arr = [it for it in (list_all_items(t) or []) if _belongs(it)]
                    if arr:
                        linked[t] = arr
                self._write_json(200, {"ok": True, "project": project, "milestones": milestones, "linked": linked})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Project detail error: {e}"})
            return
        if parsed.path == "/api/vars":
            try:
                self._write_json(200, {"ok": True, "vars": _vars_all()})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to get vars: {e}"})
            return
        if parsed.path == "/api/template/list":
            # List templates by type (routine|subroutine|microroutine|day|week)
            try:
                qs = parse_qs(parsed.query or '')
                t = (qs.get('type') or [''])[0].strip().lower()
                if not t:
                    self._write_json(400, {"ok": False, "error": "Missing type"}); return
                # Use ItemManager to locate dir
                from Modules.ItemManager import get_item_dir
                d = get_item_dir(t)
                out = []
                if os.path.isdir(d):
                    for fn in os.listdir(d):
                        if not fn.lower().endswith('.yml'): continue
                        name = os.path.splitext(fn)[0]
                        try:
                            # Try reading YAML for explicit name
                            with open(os.path.join(d, fn), 'r', encoding='utf-8') as f:
                                y = yaml.safe_load(f) or {}
                                n = y.get('name') or y.get('Name') or None
                                if isinstance(n, str) and n.strip():
                                    name = n.strip()
                        except Exception:
                            pass
                        out.append(name)
                out = sorted({str(x) for x in out}, key=lambda s: s.lower())
                self._write_json(200, {"ok": True, "type": t, "templates": out})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Template list error: {e}"})
            return
        if parsed.path == "/api/template":
            # GET: return template YAML (as JSON) with normalized children
            try:
                qs = parse_qs(parsed.query or '')
                t = (qs.get('type') or [''])[0].strip().lower()
                n = (qs.get('name') or [''])[0].strip()
                if not t or not n:
                    self._write_json(400, {"ok": False, "error": "Missing type or name"}); return
                from Modules.ItemManager import read_item_data
                data = read_item_data(t, n) or {}
                # Normalize children
                children = []
                try:
                    if t == "inventory":
                        for key in ("inventory_items", "tools"):
                            seq = data.get(key)
                            if isinstance(seq, list):
                                children.extend(seq)
                    elif isinstance(data.get('children'), list):
                        children = data['children']
                    elif isinstance(data.get('items'), list):
                        children = data['items']
                except Exception:
                    children = []
                self._write_json(200, {"ok": True, "type": t, "name": n, "template": data, "children": children})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Template read error: {e}"})
            return
        if parsed.path == "/api/review":
            # Return review YAML as text for a given type and period
            try:
                qs = parse_qs(parsed.query or '')
                t = (qs.get('type') or [''])[0].strip().lower()
                period = (qs.get('period') or [''])[0].strip()
                if t not in ("daily", "weekly", "monthly"):
                    self._write_yaml(400, {"ok": False, "error": "Invalid type (daily|weekly|monthly)"}); return
                base = os.path.join(ROOT_DIR, 'User', 'Reviews', t)
                os.makedirs(base, exist_ok=True)
                fname = None
                if t == 'daily':
                    import re
                    if not re.match(r"^\d{4}-\d{2}-\d{2}$", period):
                        self._write_yaml(400, {"ok": False, "error": "Invalid period for daily (YYYY-MM-DD)"}); return
                    fname = f"{period}.yml"
                elif t == 'monthly':
                    import re
                    if not re.match(r"^\d{4}-\d{2}$", period):
                        self._write_yaml(400, {"ok": False, "error": "Invalid period for monthly (YYYY-MM)"}); return
                    fname = f"{period}.yml"
                else:
                    import re
                    m = re.match(r"^(\d{4})-(\d{2})$", period)
                    if not m:
                        self._write_yaml(400, {"ok": False, "error": "Invalid period for weekly (YYYY-WW)"}); return
                    year = int(m.group(1)); week = int(m.group(2))
                    fname = f"{year}-{week:02d}.yml"
                fpath = os.path.join(base, fname)
                if not fpath.startswith(os.path.abspath(base)):
                    self._write_yaml(403, {"ok": False, "error": "Forbidden"}); return
                if not os.path.exists(fpath):
                    self._write_yaml(404, {"ok": False, "error": "Review not found. Generate it first."}); return
                with open(fpath, 'r', encoding='utf-8') as fh:
                    data = fh.read()
                self.send_response(200)
                self._set_cors()
                self.send_header("Content-Type", "text/yaml; charset=utf-8")
                self.send_header("Content-Length", str(len(data.encode('utf-8'))))
                self.end_headers()
                self.wfile.write(data.encode('utf-8'))
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Failed to read review: {e}"})
            return
        if parsed.path == "/api/item":
            # Return full YAML for an item
            try:
                qs = parse_qs(parsed.query)
                item_type = (qs.get('type') or [''])[0].strip().lower()
                name = (qs.get('name') or [''])[0].strip()
                if not item_type or not name:
                    self._write_yaml(400, {"ok": False, "error": "Missing type or name"}); return
                _, read_item_data, _, _, _ = im()
                data = read_item_data(item_type, name)
                if not data:
                    self._write_yaml(404, {"ok": False, "error": "Not found"}); return
                self._write_json(200, {"ok": True, "item": data})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Failed to load item: {e}"})
            return
        if parsed.path == "/api/completions":
            try:
                qs = parse_qs(parsed.query or '')
                date_str = None
                if qs:
                    arr = qs.get('date') or []
                    if arr:
                        date_str = str(arr[0])
                # Default to today
                if not date_str:
                    date_str = datetime.now().strftime('%Y-%m-%d')
                comp_dir = os.path.join(ROOT_DIR, 'User', 'Schedules', 'completions')
                comp_path = os.path.join(comp_dir, f"{date_str}.yml")
                completed = []
                if os.path.exists(comp_path):
                    try:
                        with open(comp_path, 'r', encoding='utf-8') as f:
                            d = yaml.safe_load(f) or {}
                        if isinstance(d, dict):
                            for k, v in d.items():
                                if str(v).strip().lower() == 'completed':
                                    completed.append(str(k))
                    except Exception:
                        pass
                self._write_yaml(200, { 'ok': True, 'date': date_str, 'completed': completed })
            except Exception as e:
                self._write_yaml(500, { 'ok': False, 'error': f'Completions error: {e}' })
            return
        if parsed.path == "/api/today":
            # Return simplified blocks for today's schedule as YAML { ok, blocks }
            user_dir = os.path.join(ROOT_DIR, 'User')
            candidate_paths = [
                os.path.join(user_dir, 'Schedules', 'today_schedule.yml'),
                os.path.join(user_dir, 'today_schedule.yml'),
            ]
            sched_path = next((p for p in candidate_paths if os.path.exists(p)), None)
            if not sched_path:
                self._write_yaml(404, {"ok": False, "error": "today_schedule.yml not found", "paths_tried": candidate_paths})
                return
            try:
                with open(sched_path, 'r', encoding='utf-8') as f:
                    schedule_data = yaml.safe_load(f) or []

                # Flatten into simple blocks with HH:MM strings
                import re

                def parse_hm(val):
                    if not val:
                        return None
                    s = str(val)
                    m = re.search(r"(\d{1,2}):(\d{2})", s)
                    if not m:
                        return None
                    h = int(m.group(1))
                    mnt = int(m.group(2))
                    h = max(0, min(23, h))
                    mnt = max(0, min(59, mnt))
                    return f"{h:02d}:{mnt:02d}"

                blocks = []

                def is_parallel(it: dict) -> bool:
                    try:
                        if it.get('is_parallel_item'):
                            return True
                        orig = it.get('original_item_data') or {}
                        return str(orig.get('duration','')).strip().lower() == 'parallel'
                    except Exception:
                        return False

                def walk(items, depth=0):
                    if not items:
                        return
                    for order_idx, it in enumerate(items):
                        if not isinstance(it, dict):
                            continue
                        name = it.get('name') or (it.get('original_item_data') or {}).get('name') or ''
                        item_type = it.get('type') or (it.get('original_item_data') or {}).get('type') or ''
                        st = it.get('start_time') or (it.get('original_item_data') or {}).get('start_time') or it.get('ideal_start_time')
                        et = it.get('end_time') or it.get('ideal_end_time')
                        start_s = parse_hm(st)
                        end_s = parse_hm(et)
                        if start_s and end_s:
                            blocks.append({
                                'start': start_s,
                                'end': end_s,
                                'text': str(name),
                                'type': str(item_type).lower(),
                                'depth': int(depth),
                                'is_parallel': bool(is_parallel(it)),
                                'order': int(order_idx),
                            })
                        # Recurse children if present
                        child_list = it.get('children') or it.get('items') or []
                        if isinstance(child_list, list):
                            walk(child_list, depth+1)

                if isinstance(schedule_data, list):
                    walk(schedule_data, depth=0)
                elif isinstance(schedule_data, dict):
                    walk((schedule_data.get('items') or schedule_data.get('children') or []), depth=0)

                blocks.sort(key=lambda b: b.get('start') or "")
                self._write_yaml(200, {"ok": True, "blocks": blocks})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Failed to read schedule: {e}"})
            return
        # Serve project Assets under /assets/ (case-insensitive URL segment)
        path_l = parsed.path.lower()
        # Serve project Temp files under /temp/ (case-insensitive URL segment)
        if path_l.startswith("/temp/"):
            try:
                _first, _second, rel = parsed.path.split('/', 2)
            except ValueError:
                rel = ''
            temp_root = os.path.join(ROOT_DIR, 'Temp')
            fpath = os.path.abspath(os.path.join(temp_root, rel))
            if not fpath.startswith(os.path.abspath(temp_root)):
                self.send_response(403)
                self.end_headers()
                return
            if not os.path.exists(fpath) or not os.path.isfile(fpath):
                self.send_response(404)
                self.end_headers()
                return
            ctype = 'application/octet-stream'
            fl = fpath.lower()
            if fl.endswith('.js'): ctype = 'application/javascript; charset=utf-8'
            elif fl.endswith('.json'): ctype = 'application/json; charset=utf-8'
            elif fl.endswith('.txt') or fl.endswith('.log'): ctype = 'text/plain; charset=utf-8'
            try:
                with open(fpath, 'rb') as fh:
                    data = fh.read()
                self.send_response(200)
                self._set_cors()
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception:
                self.send_response(500)
                self.end_headers()
            return
        
        if path_l.startswith("/assets/"):
            # Extract relative path after the first '/assets/' segment preserving original case
            try:
                first, second, rel = parsed.path.split('/', 2)
                # first is '' (leading slash), second is 'assets' (any case), rel is the remainder
            except ValueError:
                rel = ''
            assets_root = os.path.join(ROOT_DIR, 'Assets')
            fpath = os.path.abspath(os.path.join(assets_root, rel))
            # Prevent path traversal
            if not fpath.startswith(os.path.abspath(assets_root)):
                self.send_response(403)
                self.end_headers()
                return
            if not os.path.exists(fpath) or not os.path.isfile(fpath):
                self.send_response(404)
                self.end_headers()
                return
            # Minimal content-type detection
            ctype = 'application/octet-stream'
            if fpath.lower().endswith('.png'): ctype = 'image/png'
            elif fpath.lower().endswith('.jpg') or fpath.lower().endswith('.jpeg'): ctype = 'image/jpeg'
            elif fpath.lower().endswith('.svg'): ctype = 'image/svg+xml'
            elif fpath.lower().endswith('.ico'): ctype = 'image/x-icon'
            try:
                with open(fpath, 'rb') as fh:
                    data = fh.read()
                self.send_response(200)
                self._set_cors()
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception:
                self.send_response(500)
                self.end_headers()
            return
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get('Content-Length', '0'))
        raw = self.rfile.read(length) if length > 0 else b''
        text = raw.decode('utf-8', errors='replace')

        # Parse YAML payload
        try:
            payload = yaml.safe_load(text) or {}
        except Exception as e:
            self._write_yaml(400, {"ok": False, "error": f"Invalid YAML: {e}"})
            return

        if parsed.path == "/api/cli":
            # Expected payload: {command: str, args: [..], properties: {k:v}}
            cmd = str(payload.get('command', '')).strip()
            if not cmd:
                self._write_yaml(400, {"ok": False, "error": "Missing 'command'"})
                return
            args = payload.get('args') or []
            if not isinstance(args, list):
                self._write_yaml(400, {"ok": False, "error": "'args' must be a list"})
                return
            props = payload.get('properties') or {}
            if not isinstance(props, dict):
                self._write_yaml(400, {"ok": False, "error": "'properties' must be a map"})
                return

            # Flatten properties to key:value tokens for the CLI parser
            prop_tokens = []
            for k, v in props.items():
                if isinstance(v, list):
                    # Convert lists to comma-separated values
                    v_str = ", ".join(str(x) for x in v)
                elif isinstance(v, bool):
                    v_str = "true" if v else "false"
                else:
                    v_str = str(v)
                prop_tokens.append(f"{k}:{v_str}")

            ok, out, err = run_console_command(cmd, [*args, *prop_tokens])
            status = 200 if ok else 500
            self._write_json(status, {"ok": ok, "stdout": out, "stderr": err})
            return

        if parsed.path == "/api/cockpit/matrix/presets":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Preset payload must be a map"}); return
                save_matrix_preset(payload)
                self._write_json(200, {"ok": True})
            except ValueError as e:
                self._write_json(400, {"ok": False, "error": str(e)})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Preset save failed: {e}"})
            return

        if parsed.path == "/api/cockpit/matrix/presets/delete":
            try:
                name = (payload.get('name') or '').strip() if isinstance(payload, dict) else ''
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing preset name"}); return
                removed = delete_matrix_preset(name)
                if not removed:
                    self._write_json(404, {"ok": False, "error": "Preset not found"})
                else:
                    self._write_json(200, {"ok": True})
            except ValueError as e:
                self._write_json(400, {"ok": False, "error": str(e)})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Preset delete failed: {e}"})
            return

        if parsed.path == "/api/vars":
            # Payload YAML: { set: {k:v}, unset: [k1,k2] }
            try:
                to_set = payload.get('set') if isinstance(payload.get('set'), dict) else {}
                to_unset = payload.get('unset') if isinstance(payload.get('unset'), (list, tuple)) else []
                for k, v in to_set.items():
                    _vars_set(k, v)
                for k in to_unset:
                    _vars_unset(k)
                self._write_json(200, {"ok": True, "vars": _vars_all()})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Vars update failed: {e}"})
            return

        if parsed.path == "/api/vars/expand":
            # Expand text or list using current vars
            try:
                if isinstance(payload.get('text'), str):
                    out = _expand_text(payload.get('text'))
                    self._write_json(200, {"ok": True, "text": out}); return
                if isinstance(payload.get('list'), list):
                    arr = [ _expand_text(x) for x in payload.get('list') ]
                    self._write_json(200, {"ok": True, "list": arr}); return
                self._write_json(400, {"ok": False, "error": "Provide 'text' or 'list'"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Expand failed: {e}"})
            return

        if parsed.path == "/api/new/note":
            # Expected payload: {name, category?, priority?, tags? (list or csv), content?}
            name = (payload.get('name') or '').strip()
            if not name:
                self._write_yaml(400, {"ok": False, "error": "Missing 'name'"})
                return
            props = {}
            for key in ("category", "priority", "content"):
                if key in payload and payload[key] is not None:
                    props[key] = payload[key]
            # tags: accept list or csv string
            tags = payload.get('tags')
            if isinstance(tags, list):
                props['tags'] = ", ".join(str(x) for x in tags)
            elif isinstance(tags, str) and tags.strip():
                props['tags'] = tags

            # Build args for 'new'
            prop_tokens = []
            for k, v in props.items():
                if isinstance(v, bool):
                    v_str = "true" if v else "false"
                else:
                    v_str = str(v)
                prop_tokens.append(f"{k}:{v_str}")

            ok, out, err = run_console_command("new", ["note", name, *prop_tokens])
            status = 200 if ok else 500
            self._write_yaml(status, {"ok": ok, "stdout": out, "stderr": err})
            return
        if parsed.path == "/api/reward/redeem":
            name = (payload.get('name') or '').strip() if isinstance(payload, dict) else ''
            if not name:
                self._write_json(400, {"ok": False, "error": "Missing reward name"})
                return
            props = payload.get('properties') if isinstance(payload, dict) else None
            args = ["reward", name]
            if isinstance(props, dict):
                for k, v in props.items():
                    if v is None:
                        continue
                    if isinstance(v, bool):
                        v_str = "true" if v else "false"
                    elif isinstance(v, (list, tuple)):
                        v_str = ", ".join(str(x) for x in v)
                    else:
                        v_str = str(v)
                    args.append(f"{k}:{v_str}")
            ok, out, err = run_console_command("redeem", args)
            status = 200 if ok else 500
            body = {"ok": ok, "stdout": out, "stderr": err}
            try:
                from Utilities import points as Points
                body["balance"] = Points.get_balance()
            except Exception:
                pass
            self._write_json(status, body)
            return
        if parsed.path == "/api/achievement/update":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                name = (payload.get('name') or '').strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing achievement name"}); return
                fields = payload.get('fields') if isinstance(payload.get('fields'), dict) else {}
                award_now = bool(payload.get('award_now'))
                archive_now = bool(payload.get('archive') or payload.get('archive_now'))
                if not fields and not award_now and not archive_now:
                    self._write_json(400, {"ok": False, "error": "Nothing to update"}); return
                from Modules.ItemManager import read_item_data, write_item_data
                data = read_item_data('achievement', name)
                if not data:
                    self._write_json(404, {"ok": False, "error": "Achievement not found"}); return
                updated = dict(data)
                for k, v in fields.items():
                    if k is None:
                        continue
                    updated[str(k).lower()] = v
                now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                if award_now:
                    updated['awarded'] = True
                    if not updated.get('awarded_at'):
                        updated['awarded_at'] = now
                    updated['status'] = 'awarded'
                if archive_now:
                    updated['status'] = 'archived'
                    updated['archived'] = True
                write_item_data('achievement', name, updated)
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Achievement update failed: {e}"})
            return
        if parsed.path == "/api/milestone/update":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                name = (payload.get('name') or '').strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing milestone name"}); return
                action = (payload.get('action') or '').strip().lower()
                fields = payload.get('fields') if isinstance(payload.get('fields'), dict) else {}
                from Modules.ItemManager import read_item_data, write_item_data
                data = read_item_data('milestone', name)
                if not data:
                    self._write_json(404, {"ok": False, "error": "Milestone not found"}); return
                updated = dict(data)
                for k, v in fields.items():
                    if k is None:
                        continue
                    updated[str(k).lower()] = v
                if action == 'complete':
                    updated['status'] = 'completed'
                    updated['completed'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    prog = updated.get('progress') if isinstance(updated.get('progress'), dict) else {}
                    prog['percent'] = 100
                    if 'current' in prog and 'target' in prog:
                        prog['current'] = prog['target']
                    updated['progress'] = prog
                elif action == 'reset':
                    updated['status'] = 'pending'
                    prog = updated.get('progress') if isinstance(updated.get('progress'), dict) else {}
                    prog['percent'] = min(float(prog.get('percent') or 0), 99)
                    updated['progress'] = prog
                    updated.pop('completed', None)
                write_item_data('milestone', name, updated)
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Milestone update failed: {e}"})
            return
        if parsed.path == "/api/file/read":
            try:
                path = (payload.get('path') or '').strip() if isinstance(payload, dict) else ''
                if not path and parsed.query:
                    qs = parse_qs(parsed.query)
                    path = (qs.get('path') or [''])[0].strip()
                if not path:
                    self._write_json(400, {"ok": False, "error": "Missing path"}); return
                target = os.path.abspath(os.path.join(ROOT_DIR, path))
                if not target.startswith(ROOT_DIR):
                    self._write_json(403, {"ok": False, "error": "Forbidden"}); return
                if not os.path.isfile(target):
                    self._write_json(404, {"ok": False, "error": "File not found"}); return
                with open(target, 'r', encoding='utf-8') as fh:
                    data = fh.read()
                self._write_json(200, {"ok": True, "path": path, "content": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Read failed: {e}"})
            return
        if parsed.path == "/api/file/write":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map with path/content"}); return
                path = (payload.get('path') or '').strip()
                content = payload.get('content') or ''
                if not path:
                    self._write_json(400, {"ok": False, "error": "Missing path"}); return
                target = os.path.abspath(os.path.join(ROOT_DIR, path))
                if not target.startswith(ROOT_DIR):
                    self._write_json(403, {"ok": False, "error": "Forbidden"}); return
                allowed_ext = ('.md', '.markdown', '.yml', '.yaml', '.txt')
                if not target.lower().endswith(allowed_ext):
                    self._write_json(400, {"ok": False, "error": "Extension not allowed"}); return
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, 'w', encoding='utf-8') as fh:
                    fh.write(str(content))
                self._write_json(200, {"ok": True, "path": path})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Write failed: {e}"})
            return

        if parsed.path == "/api/status/update":
            # Payload: map of indicator:value, e.g., { energy: high, focus: good }
            if not isinstance(payload, dict):
                self._write_json(400, {"ok": False, "error": "Payload must be a map of indicator:value"})
                return
            results = {}
            overall_ok = True
            for k, v in payload.items():
                if v is None:
                    continue
                # Call 'status' once per indicator
                ok, out, err = run_console_command("status", [f"{k}:{v}"])
                results[str(k)] = {"ok": ok, "stdout": out, "stderr": err}
                if not ok:
                    overall_ok = False
            self._write_json(200 if overall_ok else 500, {"ok": overall_ok, "results": results})
            return

        if parsed.path == "/api/today/reschedule":
            ok, out, err = run_console_command("today", ["reschedule"])
            self._write_yaml(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err})
            return

        if parsed.path == "/api/day/start":
            target = "day"
            try:
                if isinstance(payload, dict):
                    tgt = str(payload.get('target') or '').strip().lower()
                    if tgt in {'today', 'day'}:
                        target = tgt
                ok, out, err = run_console_command("start", [target])
                status_snapshot = None
                try:
                    from Modules.Timer import main as Timer
                    status_snapshot = Timer.status()
                except Exception:
                    status_snapshot = None
                self._write_json(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err, "status": status_snapshot})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Start day failed: {e}"})
            return

        if parsed.path == "/api/profile":
            # Save nickname and welcome/exit message lines into User/Profile/profile.yml
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                prof_path = os.path.join(ROOT_DIR, 'User', 'Profile', 'profile.yml')
                # Load existing to preserve other fields (e.g., avatar)
                data = {}
                if os.path.exists(prof_path):
                    try:
                        with open(prof_path, 'r', encoding='utf-8') as f:
                            data = yaml.safe_load(f) or {}
                    except Exception:
                        data = {}
                if not isinstance(data, dict):
                    data = {}

                nickname = payload.get('nickname')
                if isinstance(nickname, str):
                    data['nickname'] = nickname

                # welcome lines
                w = payload.get('welcome') or {}
                if isinstance(w, dict):
                    wb = data.get('welcome') if isinstance(data.get('welcome'), dict) else {}
                    wb['line1'] = w.get('line1') if w.get('line1') is not None else wb.get('line1')
                    wb['line2'] = w.get('line2') if w.get('line2') is not None else wb.get('line2')
                    wb['line3'] = w.get('line3') if w.get('line3') is not None else wb.get('line3')
                    data['welcome'] = wb

                # exit/goodbye lines (write as exit_message)
                e = payload.get('exit') or {}
                if isinstance(e, dict):
                    eb = data.get('exit_message') if isinstance(data.get('exit_message'), dict) else {}
                    eb['line1'] = e.get('line1') if e.get('line1') is not None else eb.get('line1')
                    eb['line2'] = e.get('line2') if e.get('line2') is not None else eb.get('line2')
                    data['exit_message'] = eb

                # Ensure directory exists
                os.makedirs(os.path.dirname(prof_path), exist_ok=True)
                with open(prof_path, 'w', encoding='utf-8') as f:
                    yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Profile save failed: {e}"})
            return
        if parsed.path == "/api/preferences":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                pref_path = os.path.join(ROOT_DIR, 'User', 'Profile', 'preferences_settings.yml')
                existing = {}
                if os.path.exists(pref_path):
                    with open(pref_path, 'r', encoding='utf-8') as f:
                        existing = yaml.safe_load(f) or {}
                if not isinstance(existing, dict):
                    existing = {}
                for k, v in payload.items():
                    existing[k] = v
                os.makedirs(os.path.dirname(pref_path), exist_ok=True)
                with open(pref_path, 'w', encoding='utf-8') as f:
                    yaml.safe_dump(existing, f, allow_unicode=True, sort_keys=False)
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Preferences save failed: {e}"})
            return

        if parsed.path == "/api/item":
            # Create/update an item. Payload YAML: { type, name, properties: {...} } or raw item map
            try:
                if not isinstance(payload, dict):
                    self._write_yaml(400, {"ok": False, "error": "Payload must be a map"}); return
                item_type = (payload.get('type') or '').strip().lower()
                name = (payload.get('name') or '').strip()
                if not item_type or not name:
                    self._write_yaml(400, {"ok": False, "error": "Missing type or name"}); return
                props = payload.get('properties') if isinstance(payload.get('properties'), dict) else None
                content_yaml = payload.get('content') if isinstance(payload.get('content'), str) else None
                if props is not None:
                    data = {k: v for k, v in props.items()}
                elif content_yaml is not None:
                    try:
                        parsed_yaml = yaml.safe_load(content_yaml) or {}
                        data = parsed_yaml if isinstance(parsed_yaml, dict) else {"content": content_yaml}
                    except Exception:
                        data = {"content": content_yaml}
                else:
                    # Treat payload itself as the item map
                    data = payload
                # Ensure canonical fields are present/updated
                if isinstance(data, dict):
                    data['name'] = name
                    data['type'] = item_type
                from Modules.ItemManager import write_item_data
                write_item_data(item_type, name, data)
                self._write_yaml(200, {"ok": True})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Failed to write item: {e}"})
            return

        if parsed.path == "/api/item/copy":
            # Payload: { type, source, new_name, properties? }
            try:
                item_type = (payload.get('type') or '').strip().lower()
                source = (payload.get('source') or '').strip()
                new_name = (payload.get('new_name') or '').strip()
                if not item_type or not source or not new_name:
                    self._write_yaml(400, {"ok": False, "error": "Missing type, source, or new_name"}); return
                from Modules.ItemManager import read_item_data, write_item_data
                data = read_item_data(item_type, source) or {}
                data['name'] = new_name
                # Optional overlay
                if isinstance(payload.get('properties'), dict):
                    data.update(payload['properties'])
                write_item_data(item_type, new_name, data)
                self._write_yaml(200, {"ok": True})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Copy failed: {e}"})
            return

        if parsed.path == "/api/item/rename":
            # Payload: { type, old_name, new_name }
            try:
                item_type = (payload.get('type') or '').strip().lower()
                old_name = (payload.get('old_name') or '').strip()
                new_name = (payload.get('new_name') or '').strip()
                if not item_type or not old_name or not new_name:
                    self._write_yaml(400, {"ok": False, "error": "Missing type, old_name, or new_name"}); return
                from Modules.ItemManager import read_item_data, write_item_data, delete_item
                data = read_item_data(item_type, old_name)
                if not data:
                    self._write_yaml(404, {"ok": False, "error": "Source not found"}); return
                data['name'] = new_name
                write_item_data(item_type, new_name, data)
                delete_item(item_type, old_name)
                self._write_yaml(200, {"ok": True})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Rename failed: {e}"})
            return

        if parsed.path.startswith("/api/profile"):
            try:
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to save profile: {e}"})
            return

        if parsed.path == "/api/open-in-editor":
            try:
                file_to_open = payload.get('file_path')
                if not file_to_open:
                    self._write_json(400, {"ok": False, "error": "Missing file_path"}); return

                # Basic sanitization
                if '..' in file_to_open or not file_to_open.startswith('User/Profile/'):
                    self._write_json(400, {"ok": False, "error": "Invalid file path"}); return
                
                full_path = os.path.join(ROOT_DIR, file_to_open)

                from Modules.ItemManager import get_editor_command
                
                editor_command = get_editor_command({}) # empty properties
                
                import subprocess
                subprocess.run([editor_command, full_path], check=True)

                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to open file in editor: {e}"})
            return

        if parsed.path == "/api/settings":
            # Write a settings file. Options:
            # - POST /api/settings?file=Name.yml with raw YAML body
            # - Payload: { file: Name.yml, data: {...} } (server dumps YAML)
            # - Payload: { file: Name.yml, raw: "yaml..." } (server writes raw)
            try:
                qs = parse_qs(parsed.query or '')
                settings_root = os.path.join(ROOT_DIR, 'User', 'Settings')
                os.makedirs(settings_root, exist_ok=True)

                fname = (qs.get('file') or [''])[0].strip()
                if not fname and isinstance(payload, dict):
                    fname = str(payload.get('file') or '').strip()
                if not fname:
                    self._write_yaml(400, {"ok": False, "error": "Missing 'file'"}); return
                if ('..' in fname) or fname.startswith('/') or fname.startswith('\\'):
                    self._write_yaml(400, {"ok": False, "error": "Invalid file"}); return
                fpath = os.path.abspath(os.path.join(settings_root, fname))
                if not fpath.startswith(os.path.abspath(settings_root)):
                    self._write_yaml(403, {"ok": False, "error": "Forbidden"}); return

                # Prefer raw body if query param 'file' is used
                raw_text = None
                if (qs.get('file') and isinstance(text, str) and text.strip()):
                    raw_text = text
                elif isinstance(payload, dict) and isinstance(payload.get('raw'), str):
                    raw_text = payload.get('raw')

                if raw_text is not None:
                    # Validate YAML, but write original to preserve comments/formatting
                    try:
                        yaml.safe_load(raw_text)
                    except Exception as e:
                        self._write_yaml(400, {"ok": False, "error": f"Invalid YAML: {e}"}); return
                    with open(fpath, 'w', encoding='utf-8') as fh:
                        fh.write(raw_text)
                    self._write_yaml(200, {"ok": True}); return

                # Else, check for 'data' map to dump
                if isinstance(payload, dict) and isinstance(payload.get('data'), (dict, list)):
                    with open(fpath, 'w', encoding='utf-8') as fh:
                        fh.write(yaml.safe_dump(payload.get('data'), allow_unicode=True))
                    self._write_yaml(200, {"ok": True}); return

                self._write_yaml(400, {"ok": False, "error": "Missing content (raw or data)"})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Settings write error: {e}"})
            return

        if parsed.path == "/api/template":
            # Save a template's children to its YAML
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                t = (payload.get('type') or '').strip().lower()
                n = (payload.get('name') or '').strip()
                children = payload.get('children') if isinstance(payload.get('children'), list) else None
                if not t or not n or children is None:
                    self._write_json(400, {"ok": False, "error": "Missing type, name, or children[]"}); return
                from Modules.ItemManager import read_item_data, write_item_data
                data = read_item_data(t, n) or {}
                if t == "inventory":
                    inv_items = []
                    tools = []
                    for child in children:
                        if not isinstance(child, dict):
                            continue
                        entry = dict(child)
                        entry.pop("children", None)
                        entry.pop("depends_on", None)
                        entry.pop("ideal_start_time", None)
                        entry.pop("ideal_end_time", None)
                        entry.pop("duration", None)
                        dtype = str(entry.get("type") or "").lower()
                        if dtype == "tool":
                            tools.append(entry)
                        else:
                            inv_items.append(entry)
                    data['inventory_items'] = inv_items
                    data['tools'] = tools
                    data.pop('children', None)
                else:
                    data['children'] = children
                write_item_data(t, n, data)
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Template save error: {e}"})
            return

        if parsed.path == "/api/item/delete":
            # Payload: { type, name }
            try:
                item_type = (payload.get('type') or '').strip().lower()
                name = (payload.get('name') or '').strip()
                if not item_type or not name:
                    self._write_yaml(400, {"ok": False, "error": "Missing type or name"}); return
                from Modules.ItemManager import delete_item
                ok = delete_item(item_type, name)
                self._write_yaml(200 if ok else 404, {"ok": bool(ok)})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Delete failed: {e}"})
            return

        if parsed.path == "/api/items/delete":
            # Payload: { type, names: [] }
            try:
                item_type = (payload.get('type') or '').strip().lower()
                names = payload.get('names') or []
                if not item_type or not isinstance(names, list) or not names:
                    self._write_yaml(400, {"ok": False, "error": "Missing type or names[]"}); return
                from Modules.ItemManager import delete_item
                results = {}
                overall_ok = True
                for n in names:
                    ok = bool(delete_item(item_type, n))
                    results[n] = ok
                    if not ok:
                        overall_ok = False
                self._write_yaml(200 if overall_ok else 207, {"ok": overall_ok, "results": results})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Bulk delete failed: {e}"})
            return

        if parsed.path == "/api/items/setprop":
            # Payload: { type, names: [], property: key, value }
            try:
                item_type = (payload.get('type') or '').strip().lower()
                names = payload.get('names') or []
                prop = (payload.get('property') or '').strip()
                val = payload.get('value')
                if not item_type or not isinstance(names, list) or not names or not prop:
                    self._write_yaml(400, {"ok": False, "error": "Missing type, names[] or property"}); return
                from Modules.ItemManager import read_item_data, write_item_data
                results = {}
                for n in names:
                    d = read_item_data(item_type, n) or {}
                    d[prop] = val
                    write_item_data(item_type, n, d)
                    results[n] = True
                self._write_yaml(200, {"ok": True, "results": results})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Bulk set failed: {e}"})
            return

        if parsed.path == "/api/items/copy":
            # Payload: { type, sources: [], prefix?, suffix? }
            try:
                item_type = (payload.get('type') or '').strip().lower()
                sources = payload.get('sources') or []
                prefix = payload.get('prefix') or ''
                suffix = payload.get('suffix') or ' Copy'
                if not item_type or not isinstance(sources, list) or not sources:
                    self._write_yaml(400, {"ok": False, "error": "Missing type or sources[]"}); return
                from Modules.ItemManager import read_item_data, write_item_data
                results = {}
                for s in sources:
                    new_name = f"{prefix}{s}{suffix}".strip()
                    data = read_item_data(item_type, s) or {}
                    data['name'] = new_name
                    write_item_data(item_type, new_name, data)
                    results[s] = new_name
                self._write_yaml(200, {"ok": True, "results": results})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Bulk copy failed: {e}"})
            return

        if parsed.path == "/api/items/export":
            # Payload: { type, names: [] } → creates zip under Temp/ and returns temp URL
            try:
                item_type = (payload.get('type') or '').strip().lower()
                names = payload.get('names') or []
                if not item_type or not isinstance(names, list) or not names:
                    self._write_yaml(400, {"ok": False, "error": "Missing type or names[]"}); return
                import zipfile, time
                temp_root = os.path.join(ROOT_DIR, 'Temp')
                os.makedirs(temp_root, exist_ok=True)
                ts = time.strftime('%Y%m%d_%H%M%S')
                zip_rel = f"exports_items_{ts}.zip"
                zip_path = os.path.join(temp_root, zip_rel)
                from Modules.ItemManager import get_item_path
                with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
                    for n in names:
                        p = get_item_path(item_type, n)
                        if os.path.exists(p):
                            zf.write(p, arcname=os.path.join(item_type, os.path.basename(p)))
                self._write_yaml(200, {"ok": True, "zip": f"/temp/{zip_rel}"})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Export failed: {e}"})
            return

        if parsed.path == "/api/timer/start":
            try:
                from Modules.Timer import main as Timer
                prof = (payload.get('profile') or '').strip()
                if not prof:
                    self._write_json(400, {"ok": False, "error": "Missing 'profile'"}); return
                st = Timer.start_timer(
                    prof,
                    bind_type=(payload.get('bind_type') or None),
                    bind_name=(payload.get('bind_name') or None),
                    cycles=(int(payload.get('cycles')) if isinstance(payload.get('cycles'), int) or (isinstance(payload.get('cycles'), str) and str(payload.get('cycles')).isdigit()) else None),
                    auto_advance=(bool(payload.get('auto_advance')) if payload.get('auto_advance') is not None else True)
                )
                self._write_json(200, {"ok": True, "status": st})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer start error: {e}"})
            return
        if parsed.path == "/api/timer/pause":
            try:
                from Modules.Timer import main as Timer
                st = Timer.pause_timer()
                self._write_json(200, {"ok": True, "status": st})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer pause error: {e}"})
            return
        if parsed.path == "/api/timer/resume":
            try:
                from Modules.Timer import main as Timer
                st = Timer.resume_timer()
                self._write_json(200, {"ok": True, "status": st})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer resume error: {e}"})
            return
        if parsed.path == "/api/timer/stop":
            try:
                from Modules.Timer import main as Timer
                st = Timer.stop_timer()
                self._write_json(200, {"ok": True, "status": st})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer stop error: {e}"})
            return
        if parsed.path == "/api/timer/cancel":
            try:
                from Modules.Timer import main as Timer
                st = Timer.cancel_timer()
                self._write_json(200, {"ok": True, "status": st})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer cancel error: {e}"})
            return
        if parsed.path == "/api/timer/confirm":
            try:
                completed = True
                if isinstance(payload, dict) and 'completed' in payload:
                    val = payload.get('completed')
                    if isinstance(val, str):
                        completed = val.strip().lower() in {'1', 'true', 'yes', 'y', 'done'}
                    else:
                        completed = bool(val)
                from Modules.Timer import main as Timer
                st = Timer.confirm_schedule_block(completed)
                self._write_json(200, {"ok": True, "status": st})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer confirm error: {e}"})
            return
        if parsed.path == "/api/listener/start":
            try:
                global _LISTENER_PROC
                if _LISTENER_PROC and _LISTENER_PROC.poll() is None:
                    self._write_json(200, {"ok": True, "status": "already running"}); return
                py = sys.executable or "python"
                listener_path = os.path.join(ROOT_DIR, 'Modules', 'Listener', 'Listener.py')
                _LISTENER_PROC = subprocess.Popen([py, listener_path], cwd=ROOT_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                self._write_json(200, {"ok": True, "status": "started"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Listener start error: {e}"})
            return

        self._write_yaml(404, {"ok": False, "error": "Unknown endpoint"})

    def _write_yaml(self, code, obj):
        data = yaml.safe_dump(obj, allow_unicode=True)
        self.send_response(code)
        self._set_cors()
        self.send_header("Content-Type", "text/yaml; charset=utf-8")
        self.send_header("Content-Length", str(len(data.encode("utf-8"))))
        self.end_headers()
        self.wfile.write(data.encode("utf-8"))

    def _write_json(self, code, obj):
        try:
            import json
            data = json.dumps(obj, ensure_ascii=False)
        except Exception:
            data = '{}'
        self.send_response(code)
        self._set_cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data.encode("utf-8"))))
        self.end_headers()
        self.wfile.write(data.encode("utf-8"))


def serve(host="127.0.0.1", port=7357):
    httpd = ThreadingHTTPServer((host, port), DashboardHandler)
    print(f"Chronos Dashboard server listening on http://{host}:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    # Optional env overrides
    host = os.environ.get("CHRONOS_DASH_HOST", "127.0.0.1")
    try:
        port = int(os.environ.get("CHRONOS_DASH_PORT", "7357"))
    except Exception:
        port = 7357
    serve(host=host, port=port)
        
