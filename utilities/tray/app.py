import os
import sys
import threading
import subprocess
import ctypes
import json
import uuid
import winreg
from datetime import datetime, timedelta
from pathlib import Path
import tkinter as tk
from tkinter import ttk
import re
from urllib.parse import urlencode

try:
    import yaml
except Exception as exc:
    raise RuntimeError("PyYAML is required for Chronos tray.") from exc

try:
    import pystray
    from pystray import MenuItem as Item
except Exception as exc:
    raise RuntimeError("pystray is required for Chronos tray.") from exc

try:
    from PIL import Image, ImageDraw
except Exception as exc:
    raise RuntimeError("Pillow is required for Chronos tray.") from exc


ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

PID_DIR = ROOT_DIR / "user" / "temp"
LEGACY_PID_DIR = ROOT_DIR / "user" / "Temp"
PID_PATH = PID_DIR / "tray.pid"
LEGACY_PID_PATH = LEGACY_PID_DIR / "tray.pid"
NOTIFICATION_ACTIONS_DIR = PID_DIR / "notification_actions" / "inbox"
NOTIFICATION_HISTORY_PATH = ROOT_DIR / "user" / "data" / "notification_history.json"
NOTIFICATION_HISTORY_LIMIT = 200

from modules.timer import main as Timer
from modules.scheduler import get_flattened_schedule, schedule_path_for_date, status_current_path
from modules.scheduler.sleep_gate import SLEEP_POLICY_OPTIONS, build_sleep_interrupt
from modules.console import invoke_command
from modules.item_manager import list_all_items

DEFAULT_NOTIFICATION_SETTINGS = {
    "enabled": True,
    "quiet_hours_enabled": True,
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "07:00",
    "allow_during_sleep": ["critical"],
    "allow_during_quiet_hours": ["critical"],
    "anchor_warning_minutes": 10,
    "start_day_reminder_time": "09:00",
    "start_day_reminder_cutoff": "14:00",
    "status_nudge_stale_hours": 4,
    "due_soon_lookahead_days": 3,
    "yesterday_checkin_start_time": "06:00",
    "yesterday_checkin_cutoff": "16:00",
    "event_settings": {
        "schedule_check_in": True,
        "upcoming_anchor": True,
        "bedtime_reminder": True,
        "waiting_for_anchor": True,
        "start_day_reminder": True,
        "status_nudge": True,
        "due_soon": True,
        "yesterday_checkin": True,
    },
}

NOTIFICATION_EVENT_LABELS = {
    "schedule_check_in": "Timer Check-In",
    "upcoming_anchor": "Upcoming Anchor",
    "bedtime_reminder": "Bedtime Reminder",
    "waiting_for_anchor": "Waiting For Anchor",
    "start_day_reminder": "Start Day Reminder",
    "status_nudge": "Status Nudge",
    "due_soon": "Due Soon",
    "yesterday_checkin": "Yesterday Check-In",
}

APP_USER_MODEL_ID = "Chronos"
NOTIFICATION_PROTOCOL = "chronos"


class ChronosTrayApp:
    def __init__(self):
        self._set_windows_app_id()
        self._register_notification_protocol()
        self.root = tk.Tk()
        self.root.withdraw()
        self.root.title("Chronos Mini")
        self.root.protocol("WM_DELETE_WINDOW", self.hide_window)
        self.window = None
        self.notification_window = None
        self.notification_history_window = None
        self._theme_ready = False
        self._window_icon_path = self._resolve_window_icon_path()

        self.status_var = tk.StringVar(value="Timer: idle")
        self.phase_var = tk.StringVar(value="Phase: -")
        self.block_var = tk.StringVar(value="Block: -")
        self.queue_var = tk.StringVar(value="Schedule: -")

        self.schedule_box = None
        self.timer_ring_canvas = None
        self.timer_ring_arc = None
        self.timer_ring_clock = None
        self.timer_ring_label = None
        self.timer_profile_var = tk.StringVar(value="")
        self.timer_profile_combo = None
        self.timer_start_stop_button = None
        self.timer_pause_resume_button = None
        self.status_controls = {}
        self.status_schema = self._load_status_schema()
        self._latest_timer_state = {}
        self._notification_history = {}
        self._notification_log = self._load_notification_log()
        self._notification_history_listbox = None
        self._notification_history_details_var = tk.StringVar(value="Select a notification to inspect it.")
        self._last_icon_key = None
        self._tick_job = None
        self._quitting = False
        self._last_pending_prompt_key = None
        self._pending_popup = None
        self._pending_popup_key = None
        self._sleep_popup = None
        self._notification_settings_vars = {}
        self._base_icon = self._load_base_icon()
        self._apply_window_icon(self.root)
        self.icon = pystray.Icon("chronos_tray", self._base_icon, "Chronos", self._build_menu())

    def _set_windows_app_id(self):
        if os.name != "nt":
            return
        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_USER_MODEL_ID)
        except Exception:
            pass

    def _pythonw_executable(self):
        exe = Path(sys.executable)
        if exe.name.lower() == "python.exe":
            gui = exe.with_name("pythonw.exe")
            if gui.exists():
                return str(gui)
        venv_gui = ROOT_DIR / ".venv" / "Scripts" / "pythonw.exe"
        if venv_gui.exists():
            return str(venv_gui)
        return str(exe)

    def _register_notification_protocol(self):
        if os.name != "nt":
            return
        try:
            command = f'"{self._pythonw_executable()}" "{ROOT_DIR / "utilities" / "tray" / "notification_action.py"}" "%1"'
            root_path = rf"Software\Classes\{NOTIFICATION_PROTOCOL}"
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, root_path) as key:
                winreg.SetValueEx(key, "", 0, winreg.REG_SZ, "URL:Chronos Notification Action")
                winreg.SetValueEx(key, "URL Protocol", 0, winreg.REG_SZ, "")
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, root_path + r"\DefaultIcon") as icon_key:
                    icon_path = self._window_icon_path or str(ROOT_DIR / "assets" / "chronos.ico")
                    winreg.SetValueEx(icon_key, "", 0, winreg.REG_SZ, icon_path)
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, root_path + r"\shell") as _:
                pass
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, root_path + r"\shell\open") as _:
                pass
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, root_path + r"\shell\open\command") as cmd_key:
                winreg.SetValueEx(cmd_key, "", 0, winreg.REG_SZ, command)
        except Exception:
            pass

    def _slugify(self, value):
        return re.sub(r"\s+", "_", str(value or "").strip().lower())

    def _settings_path(self, name):
        return ROOT_DIR / "user" / "settings" / name

    def _read_yaml(self, path):
        try:
            if Path(path).exists():
                return yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
        except Exception:
            return {}
        return {}

    def _write_yaml(self, path, data):
        try:
            target = Path(path)
            target.parent.mkdir(parents=True, exist_ok=True)
            with open(target, "w", encoding="utf-8") as fh:
                yaml.safe_dump(
                    data or {},
                    fh,
                    default_flow_style=False,
                    sort_keys=False,
                    allow_unicode=True,
                )
            return True
        except Exception:
            return False

    def _load_notification_log(self):
        try:
            if NOTIFICATION_HISTORY_PATH.exists():
                rows = json.loads(NOTIFICATION_HISTORY_PATH.read_text(encoding="utf-8"))
                if isinstance(rows, list):
                    return [row for row in rows if isinstance(row, dict)][-NOTIFICATION_HISTORY_LIMIT:]
        except Exception:
            return []
        return []

    def _save_notification_log(self):
        try:
            NOTIFICATION_HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
            rows = list(self._notification_log or [])[-NOTIFICATION_HISTORY_LIMIT:]
            NOTIFICATION_HISTORY_PATH.write_text(json.dumps(rows, indent=2), encoding="utf-8")
            return True
        except Exception:
            return False

    def _append_notification_log(self, entry):
        if not isinstance(entry, dict):
            return
        self._notification_log.append(entry)
        self._notification_log = self._notification_log[-NOTIFICATION_HISTORY_LIMIT:]
        self._save_notification_log()
        self._refresh_notification_history_list()

    def _notification_settings(self):
        raw = self._read_yaml(self._settings_path("notification_settings.yml"))
        settings = dict(DEFAULT_NOTIFICATION_SETTINGS)
        if isinstance(raw, dict):
            settings.update({k: v for k, v in raw.items() if k != "event_settings"})
            event_settings = dict(DEFAULT_NOTIFICATION_SETTINGS.get("event_settings") or {})
            maybe_events = raw.get("event_settings")
            if isinstance(maybe_events, dict):
                event_settings.update(maybe_events)
            settings["event_settings"] = event_settings
        return settings

    def _status_current(self):
        try:
            path = Path(status_current_path())
            if path.exists():
                data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
                return data if isinstance(data, dict) else {}
        except Exception:
            return {}
        return {}

    def _status_last_updated(self):
        try:
            path = Path(status_current_path())
            if path.exists():
                return datetime.fromtimestamp(path.stat().st_mtime)
        except Exception:
            return None
        return None

    def _load_status_schema(self):
        schema = []
        raw = self._read_yaml(self._settings_path("status_settings.yml"))
        rows = raw.get("Status_Settings") if isinstance(raw, dict) else []
        if not isinstance(rows, list):
            rows = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            label = str(row.get("Name") or "").strip()
            if not label:
                continue
            slug = self._slugify(label)
            options = self._load_status_options(slug)
            schema.append({
                "label": label,
                "slug": slug,
                "options": options,
            })
        return schema

    def _load_status_options(self, slug):
        raw = self._read_yaml(self._settings_path(f"{slug}_settings.yml"))
        if not isinstance(raw, dict) or not raw:
            return []
        root = next(iter(raw.values()), {})
        if not isinstance(root, dict):
            return []
        ranked = []
        for label, meta in root.items():
            rank = None
            if isinstance(meta, dict):
                try:
                    rank = float(meta.get("value"))
                except Exception:
                    rank = None
            ranked.append((str(label), rank))
        ranked.sort(key=lambda item: (999 if item[1] is None else item[1]))
        # Existing status files use lower numeric value as better/higher state.
        return [label for label, _ in ranked]

    def _apply_status_preset(self, preset_name):
        presets = {
            "high": {
                "energy": "High",
                "mind_state": "Clear",
                "focus": "Laser",
                "emotion": "Positive",
                "vibe": "Great",
                "health": "Good",
            },
            "steady": {
                "energy": "Medium",
                "mind_state": "Neutral",
                "focus": "Good",
                "emotion": "Neutral",
                "vibe": "Okay",
                "health": "Good",
            },
            "recovery": {
                "energy": "Low",
                "mind_state": "Overwhelmed",
                "focus": "Scattered",
                "emotion": "Neutral",
                "vibe": "Okay",
                "health": "Fair",
            },
        }
        values = presets.get(str(preset_name or "").strip().lower()) or {}
        for slug, value in values.items():
            control = self.status_controls.get(slug)
            if control:
                try:
                    control.set(value)
                except Exception:
                    pass

    def _refresh_status_controls(self):
        current = self._status_current()
        for entry in self.status_schema:
            slug = entry["slug"]
            control = self.status_controls.get(slug)
            if not control:
                continue
            value = current.get(slug)
            options = entry.get("options") or []
            if value in options:
                control.set(value)
            elif options:
                control.set(options[0])

    def _update_status_from_controls(self):
        any_fail = False
        for entry in self.status_schema:
            slug = entry["slug"]
            control = self.status_controls.get(slug)
            value = control.get().strip() if control else ""
            if not value:
                continue
            try:
                invoke_command("status", [], {slug: value})
            except Exception:
                any_fail = True
        self._refresh_status_controls()
        return not any_fail

    def _apply_theme(self):
        if self._theme_ready:
            return
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except Exception:
            pass

        bg = "#0b1220"
        panel = "#111a2b"
        border = "#22314f"
        text = "#e6edf7"
        dim = "#9fb0ca"
        accent = "#5aa9ff"
        accent_active = "#7bc2ff"

        self.root.configure(bg=bg)
        style.configure("Chronos.TFrame", background=panel)
        style.configure("Chronos.Header.TLabel", background=panel, foreground=text, font=("Segoe UI", 8, "bold"))
        style.configure("Chronos.TLabel", background=panel, foreground=dim, font=("Segoe UI", 7))
        style.configure(
            "Chronos.TEntry",
            fieldbackground="#18243a",
            background="#18243a",
            foreground=text,
            bordercolor=border,
            lightcolor=border,
            darkcolor=border,
            insertcolor=text,
            padding=(6, 3),
        )
        style.map(
            "Chronos.TEntry",
            fieldbackground=[("focus", "#18243a")],
            bordercolor=[("focus", accent)],
        )
        style.configure(
            "Chronos.TCheckbutton",
            background=panel,
            foreground=text,
            font=("Segoe UI", 7),
            indicatorcolor="#18243a",
            indicatormargin=2,
            indicatordiameter=10,
            padding=(2, 2),
        )
        style.map(
            "Chronos.TCheckbutton",
            background=[("active", panel)],
            foreground=[("disabled", "#6f809b"), ("active", text)],
            indicatorcolor=[("selected", accent), ("active", "#213454")],
        )
        style.configure(
            "Chronos.TButton",
            background="#18243a",
            foreground=text,
            bordercolor=border,
            lightcolor=border,
            darkcolor=border,
            relief="flat",
            padding=(8, 4),
            font=("Segoe UI", 7, "bold"),
        )
        style.map(
            "Chronos.TButton",
            background=[("active", "#213454"), ("pressed", "#18243a")],
            foreground=[("disabled", "#6f809b"), ("active", text)],
            bordercolor=[("active", accent), ("pressed", accent_active)],
        )
        style.configure(
            "ChronosAccent.TButton",
            background=accent,
            foreground="#07101f",
            bordercolor=accent,
            lightcolor=accent,
            darkcolor=accent,
            relief="flat",
            padding=(8, 4),
            font=("Segoe UI", 7, "bold"),
        )
        style.map(
            "ChronosAccent.TButton",
            background=[("active", accent_active), ("pressed", accent)],
            foreground=[("active", "#07101f"), ("pressed", "#07101f")],
        )
        style.configure(
            "Chronos.TCombobox",
            fieldbackground="#18243a",
            background="#18243a",
            foreground=text,
            arrowcolor=text,
            bordercolor=border,
            lightcolor=border,
            darkcolor=border,
            insertcolor=text,
            padding=(6, 3),
        )
        style.map(
            "Chronos.TCombobox",
            fieldbackground=[("readonly", "#18243a"), ("disabled", "#111a2b")],
            background=[("readonly", "#18243a"), ("active", "#213454")],
            foreground=[("readonly", text), ("disabled", "#6f809b")],
            arrowcolor=[("readonly", text), ("active", accent_active)],
            bordercolor=[("focus", accent), ("readonly", border)],
        )
        style.configure(
            "Chronos.Vertical.TScrollbar",
            background="#18243a",
            troughcolor="#0e1728",
            bordercolor=border,
            arrowcolor=text,
            darkcolor="#18243a",
            lightcolor="#18243a",
            gripcount=0,
        )
        style.map(
            "Chronos.Vertical.TScrollbar",
            background=[("active", "#213454"), ("pressed", accent)],
            arrowcolor=[("active", accent_active)],
        )
        self.root.option_add("*TCombobox*Listbox.background", "#18243a")
        self.root.option_add("*TCombobox*Listbox.foreground", text)
        self.root.option_add("*TCombobox*Listbox.selectBackground", "#213454")
        self.root.option_add("*TCombobox*Listbox.selectForeground", text)
        self._theme_ready = True

    def _load_base_icon(self):
        candidates = [
            ROOT_DIR / "assets" / "chronos.ico",
            ROOT_DIR / "assets" / "images" / "icon.ico",
            ROOT_DIR / "assets" / "images" / "hivemind_studio_icon.ico",
        ]
        for path in candidates:
            if path.exists():
                try:
                    return Image.open(path).convert("RGBA").resize((64, 64))
                except Exception:
                    continue
        return Image.new("RGBA", (64, 64), (20, 26, 37, 255))

    def _resolve_window_icon_path(self):
        candidates = [
            ROOT_DIR / "assets" / "chronos.ico",
            ROOT_DIR / "assets" / "images" / "icon.ico",
            ROOT_DIR / "assets" / "images" / "hivemind_studio_icon.ico",
        ]
        for path in candidates:
            if path.exists():
                return str(path)
        return None

    def _apply_window_icon(self, win):
        if not win:
            return
        icon_path = self._window_icon_path
        if not icon_path:
            return
        try:
            win.iconbitmap(icon_path)
        except Exception:
            pass

    def _render_ring_icon(self, percent):
        img = self._base_icon.copy().resize((64, 64))
        draw = ImageDraw.Draw(img, "RGBA")
        outer = (4, 4, 60, 60)
        draw.ellipse(outer, outline=(80, 95, 120, 180), width=6)
        sweep = max(0, min(360, int(round((percent / 100.0) * 360))))
        if sweep > 0:
            draw.arc(outer, start=-90, end=(-90 + sweep), fill=(96, 180, 255, 255), width=6)
        return img

    def _timer_progress_percent(self, st):
        if not isinstance(st, dict):
            return 0
        rem = int(st.get("remaining_seconds") or 0)
        block = st.get("current_block") if isinstance(st.get("current_block"), dict) else {}
        mode = str(st.get("mode") or "").lower()
        prof = st.get("profile") if isinstance(st.get("profile"), dict) else {}
        total = 1
        if mode == "schedule" and block:
            try:
                total = max(1, int(float(block.get("minutes") or 1) * 60))
            except Exception:
                total = 1
        else:
            phase = str(st.get("current_phase") or "")
            if phase == "focus":
                total = max(1, int(prof.get("focus_minutes") or 25) * 60)
            elif phase == "short_break":
                total = max(1, int(prof.get("short_break_minutes") or 5) * 60)
            elif phase == "long_break":
                total = max(1, int(prof.get("long_break_minutes") or 15) * 60)
        return max(0, min(100, int(round(((total - rem) / total) * 100))))

    def _hhmmss(self, seconds):
        s = max(0, int(seconds or 0))
        mm, ss = divmod(s, 60)
        return f"{mm:02d}:{ss:02d}"

    def _nice_label(self, value):
        txt = str(value or "").strip()
        if not txt:
            return "-"
        return txt.replace("_", " ").title()

    def _status_phase_time_line(self, status, phase, rem):
        status_txt = self._nice_label(status or "idle")
        phase_txt = self._nice_label(phase or "-")
        rem_txt = self._hhmmss(rem or 0)
        if status_txt.lower() == "running":
            return f"{phase_txt} | {rem_txt}"
        return f"{status_txt} | {phase_txt} | {rem_txt}"

    def _is_quiet_hours_now(self, settings):
        if not bool(settings.get("quiet_hours_enabled")):
            return False
        start = self._minutes_from_label(settings.get("quiet_hours_start"))
        end = self._minutes_from_label(settings.get("quiet_hours_end"))
        if start is None or end is None:
            return False
        now = datetime.now()
        current = (int(now.hour) * 60) + int(now.minute)
        if start == end:
            return False
        if start < end:
            return start <= current < end
        return current >= start or current < end

    def _is_sleep_active(self):
        try:
            return bool(build_sleep_interrupt("today", ["reschedule"], {}))
        except Exception:
            return False

    def _emit_desktop_notification(self, title, message):
        try:
            self.icon.notify(message, title)
            return True
        except Exception:
            return False

    def _toast_logo_path(self):
        candidates = [
            ROOT_DIR / "assets" / "images" / "logo_no_background.png",
            ROOT_DIR / "assets" / "images" / "logo.png",
            ROOT_DIR / "assets" / "images" / "hivemind_studio_no_background.png",
            ROOT_DIR / "assets" / "chronos.ico",
        ]
        for path in candidates:
            if path.exists():
                return str(path.resolve())
        return ""

    def _xml_escape(self, value):
        return (
            str(value or "")
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;")
        )

    def _notification_action_uri(self, action, **payload):
        params = {"action": action}
        for key, value in payload.items():
            if value is None:
                continue
            params[str(key)] = str(value)
        return f"{NOTIFICATION_PROTOCOL}://notification?{urlencode(params)}"

    def _default_notification_actions(self, event_type, message_context=None):
        context = message_context if isinstance(message_context, dict) else {}
        event_key = str(event_type or "").strip().lower()
        if event_key == "schedule_check_in":
            block_name = str(context.get("block_name") or "Current Block").strip() or "Current Block"
            prompted_at = str(context.get("prompted_at") or "").strip()
            return [
                {"label": "Open Mini", "uri": self._notification_action_uri("open_mini")},
                {"label": "Done", "uri": self._notification_action_uri("timer_done", block_name=block_name, prompted_at=prompted_at)},
            ]
        if event_key == "start_day_reminder":
            return [
                {"label": "Open Mini", "uri": self._notification_action_uri("open_mini")},
                {"label": "Start Day", "uri": self._notification_action_uri("start_day")},
            ]
        if event_key == "status_nudge":
            return [
                {"label": "Open Mini", "uri": self._notification_action_uri("open_mini")},
                {"label": "Dashboard", "uri": self._notification_action_uri("open_dashboard")},
            ]
        if event_key == "yesterday_checkin":
            return [
                {"label": "Open Mini", "uri": self._notification_action_uri("open_mini")},
                {"label": "Dashboard", "uri": self._notification_action_uri("open_dashboard")},
            ]
        if event_key == "due_soon":
            return [
                {"label": "Open Mini", "uri": self._notification_action_uri("open_mini")},
                {"label": "Dashboard", "uri": self._notification_action_uri("open_dashboard")},
            ]
        if event_key in {"upcoming_anchor", "bedtime_reminder", "waiting_for_anchor"}:
            return [
                {"label": "Open Mini", "uri": self._notification_action_uri("open_mini")},
                {"label": "Dashboard", "uri": self._notification_action_uri("open_dashboard")},
            ]
        return [
            {"label": "Open Mini", "uri": self._notification_action_uri("open_mini")},
            {"label": "Dashboard", "uri": self._notification_action_uri("open_dashboard")},
        ]

    def _emit_windows_toast(self, title, message, actions=None, launch_uri=None):
        if os.name != "nt":
            return False
        actions = list(actions or [])
        launch_value = self._xml_escape(launch_uri or self._notification_action_uri("open_mini"))
        icon_path = self._toast_logo_path()
        icon_uri = Path(icon_path).resolve().as_uri() if icon_path else ""
        action_xml = ""
        if actions:
            parts = []
            for action in actions:
                if not isinstance(action, dict):
                    continue
                label = self._xml_escape(action.get("label") or "")
                uri = self._xml_escape(action.get("uri") or "")
                if not label or not uri:
                    continue
                parts.append(
                    f'<action content="{label}" arguments="{uri}" activationType="protocol" />'
                )
            if parts:
                action_xml = f"<actions>{''.join(parts)}</actions>"
        xml = (
            '<toast activationType="protocol" launch="'
            + launch_value
            + '"><visual><binding template="ToastGeneric">'
            + (f'<image placement="appLogoOverride" hint-crop="none" src="{self._xml_escape(icon_uri)}" />' if icon_uri else "")
            + "<text>"
            + self._xml_escape(title)
            + "</text><text>"
            + self._xml_escape(message)
            + "</text></binding></visual>"
            + action_xml
            + "</toast>"
        )
        script = f"""
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$xml = @'
{xml}
'@
$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
$toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{APP_USER_MODEL_ID}')
$notifier.Show($toast)
"""
        try:
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
                timeout=10,
            )
            return proc.returncode == 0
        except Exception:
            return False

    def _notify_event(self, event_type, title, message, *, severity="attention", dedupe_key=None, cooldown_seconds=3600, force=False, actions=None, launch_uri=None, message_context=None):
        settings = self._notification_settings()
        if (not force) and (not bool(settings.get("enabled", True))):
            return False
        event_settings = settings.get("event_settings") if isinstance(settings.get("event_settings"), dict) else {}
        if (not force) and event_settings and not bool(event_settings.get(event_type, True)):
            return False
        allow_quiet = {str(v).strip().lower() for v in (settings.get("allow_during_quiet_hours") or []) if str(v).strip()}
        allow_sleep = {str(v).strip().lower() for v in (settings.get("allow_during_sleep") or []) if str(v).strip()}
        severity_key = str(severity or "").strip().lower()
        event_key = str(event_type or "").strip().lower()
        if (not force) and self._is_quiet_hours_now(settings) and severity_key not in allow_quiet and event_key not in allow_quiet:
            return False
        if (not force) and self._is_sleep_active() and severity_key not in allow_sleep and event_key not in allow_sleep:
            return False
        key = str(dedupe_key or f"{event_type}:{title}:{message}")
        now = datetime.now()
        last_sent = self._notification_history.get(key)
        if (not force) and isinstance(last_sent, datetime):
            if (now - last_sent).total_seconds() < max(0, int(cooldown_seconds or 0)):
                return False
        toast_actions = list(actions or self._default_notification_actions(event_type, message_context=message_context))
        sent = False
        sent = self._emit_windows_toast(
            title,
            message,
            actions=toast_actions,
            launch_uri=launch_uri or self._notification_action_uri("open_mini"),
        )
        if not sent:
            sent = self._emit_desktop_notification(title, message)
        if sent:
            self._notification_history[key] = now
            self._append_notification_log(
                {
                    "created_at": now.isoformat(timespec="seconds"),
                    "event_type": str(event_type or ""),
                    "title": str(title or ""),
                    "message": str(message or ""),
                    "severity": severity_key,
                    "dedupe_key": key,
                    "actions": [str(action.get("label") or "").strip() for action in toast_actions if isinstance(action, dict)],
                }
            )
        return sent

    def _process_notification_actions(self):
        action_dir = NOTIFICATION_ACTIONS_DIR
        try:
            action_dir.mkdir(parents=True, exist_ok=True)
        except Exception:
            return
        for path in sorted(action_dir.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                try:
                    path.unlink()
                except Exception:
                    pass
                continue
            try:
                action = str(payload.get("action") or "").strip().lower()
                if action == "open_mini":
                    self.show_window()
                elif action == "open_dashboard":
                    self.open_dashboard()
                elif action == "timer_done":
                    self.timer_done()
                elif action == "timer_later":
                    self.timer_later()
                elif action == "start_day":
                    self.start_day()
            finally:
                try:
                    path.unlink()
                except Exception:
                    pass

    def _refresh_timer_ring(self, timer_state):
        if not self.timer_ring_canvas:
            return
        percent = self._timer_progress_percent(timer_state)
        extent = max(0, min(359.9, (float(percent) / 100.0) * 360.0))
        clock_text = self._hhmmss((timer_state or {}).get("remaining_seconds") or 0)
        if self.timer_ring_arc is not None:
            try:
                self.timer_ring_canvas.itemconfigure(self.timer_ring_arc, extent=-extent)
            except Exception:
                pass
        if self.timer_ring_clock is not None:
            try:
                self.timer_ring_canvas.itemconfigure(self.timer_ring_clock, text=clock_text)
            except Exception:
                pass
        if self.timer_ring_label is not None:
            try:
                self.timer_ring_canvas.itemconfigure(self.timer_ring_label, text=f"{int(round(percent))}% elapsed")
            except Exception:
                pass

    def _minutes_from_label(self, value):
        if value is None:
            return None
        txt = str(value).strip()
        if not txt:
            return None
        for fmt in ("%H:%M", "%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
            try:
                dt = datetime.strptime(txt, fmt)
                return (int(dt.hour) * 60) + int(dt.minute)
            except Exception:
                continue
        return None

    def _display_time_label(self, value):
        mins = self._minutes_from_label(value)
        if mins is None:
            return "--:--"
        hh = mins // 60
        mm = mins % 60
        return f"{hh:02d}:{mm:02d}"

    def _history_time_label(self, value):
        txt = str(value or "").strip()
        if not txt:
            return "--:--"
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(txt, fmt).strftime("%m-%d %H:%M")
            except Exception:
                continue
        try:
            return datetime.fromisoformat(txt.replace("Z", "+00:00")).replace(tzinfo=None).strftime("%m-%d %H:%M")
        except Exception:
            return txt

    def _parse_date_value(self, value):
        txt = str(value or "").strip()
        if not txt:
            return None
        for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d", "%m/%d/%Y"):
            try:
                return datetime.strptime(txt, fmt)
            except Exception:
                continue
        try:
            return datetime.fromisoformat(txt.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return None

    def _days_until(self, target_date):
        if not isinstance(target_date, datetime):
            return None
        today = datetime.now()
        start = datetime(today.year, today.month, today.day)
        target = datetime(target_date.year, target_date.month, target_date.day)
        return int((target - start).days)

    def _due_soon_items(self):
        settings = self._notification_settings()
        lookahead_days = int(settings.get("due_soon_lookahead_days") or 3)
        if lookahead_days < 0:
            lookahead_days = 0
        horizon = datetime.now() + timedelta(days=lookahead_days)
        items = []
        for item_type in ["task", "goal", "milestone", "project", "appointment"]:
            try:
                rows = list_all_items(item_type) or []
            except Exception:
                rows = []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                deadline = row.get("deadline")
                due_raw = deadline or row.get("due_date") or row.get("due") or row.get("date")
                due_dt = self._parse_date_value(due_raw)
                if not due_dt:
                    continue
                status = str(row.get("status") or "").strip().lower()
                if status in {"done", "completed", "complete"}:
                    continue
                if due_dt > horizon:
                    continue
                items.append(
                    {
                        "name": str(row.get("name") or "(untitled)"),
                        "type": item_type,
                        "due_kind": "deadline" if deadline else "due_date",
                        "due_raw": str(due_raw or ""),
                        "due_dt": due_dt,
                    }
                )
        now = datetime.now()
        items.sort(
            key=lambda item: (
                0 if item["due_dt"] < now else 1,
                item["due_dt"],
                0 if item["due_kind"] == "deadline" else 1,
                item["name"].lower(),
            )
        )
        return items

    def _current_schedule_blocks(self):
        path = schedule_path_for_date(datetime.now())
        if not os.path.exists(path):
            return []
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh) or []
        except Exception:
            return []
        if not isinstance(data, list):
            return []
        flat = get_flattened_schedule(data)
        blocks = []
        for blk in flat:
            if not isinstance(blk, dict):
                continue
            name = str(blk.get("name") or "Unnamed")
            start = blk.get("start_time") or blk.get("ideal_start_time") or ""
            end = blk.get("end_time") or blk.get("ideal_end_time") or ""
            subtype = str(blk.get("subtype") or blk.get("timeblock_subtype") or "").strip().lower()
            typ = str(blk.get("type") or "").strip().lower()
            block_id = str(blk.get("block_id") or "").strip().lower()
            is_buffer = bool(blk.get("is_buffer") or blk.get("is_break"))
            if not is_buffer:
                if (
                    subtype in {"buffer", "break"}
                    or typ in {"buffer", "break"}
                    or "::buffer::" in block_id
                    or "::break::" in block_id
                ):
                    is_buffer = True
            blocks.append(
                {
                    "name": name,
                    "start": str(start),
                    "end": str(end),
                    "is_buffer": is_buffer,
                    "is_anchor": bool(subtype == "anchor" or "anchor" in name.lower() or "::anchor::" in block_id),
                    "type": typ,
                    "subtype": subtype,
                }
            )
        return blocks

    def _block_key(self, name, start_label):
        return f"{str(name or '').strip()}@{str(start_label or '').strip()}"

    def _is_window_or_meta_block(self, block):
        try:
            if bool(block.get("is_buffer")) or bool(block.get("is_break")):
                return True
            block_id = str(block.get("block_id") or "").strip().lower()
            window_name = str(block.get("window_name") or "").strip().upper()
            block_type = str(block.get("type") or "").strip().lower()
            subtype = str(block.get("subtype") or block.get("timeblock_subtype") or "").strip().lower()
            if block_id.startswith("window::"):
                return True
            if window_name in {"GAP", "HIERARCHY"}:
                return True
            if bool(block.get("window")):
                return True
            if block_type in {"window"} or subtype in {"window"}:
                return True
        except Exception:
            return False
        return False

    def _yesterday_checkin_rows(self):
        target_dt = datetime.now() - timedelta(days=1)
        target_date = target_dt.strftime("%Y-%m-%d")
        sched_path = schedule_path_for_date(target_date)
        schedule_data = []
        if os.path.exists(sched_path):
            try:
                with open(sched_path, "r", encoding="utf-8") as fh:
                    schedule_data = yaml.safe_load(fh) or []
            except Exception:
                schedule_data = []
        flat = []
        try:
            if isinstance(schedule_data, list):
                flat = get_flattened_schedule(schedule_data) or []
        except Exception:
            flat = []
        scheduled_blocks = []
        for block in flat:
            if not isinstance(block, dict):
                continue
            if self._is_window_or_meta_block(block):
                continue
            children = block.get("children") or block.get("items") or []
            if isinstance(children, list) and children:
                continue
            raw = block.get("original_item_data") if isinstance(block.get("original_item_data"), dict) else {}
            name = str(block.get("name") or raw.get("name") or "").strip()
            start = self._display_time_label(block.get("start_time") or raw.get("start_time") or block.get("ideal_start_time"))
            end = self._display_time_label(block.get("end_time") or block.get("ideal_end_time"))
            item_type = str(block.get("type") or raw.get("type") or "task").strip().lower()
            if not name or start == "--:--":
                continue
            scheduled_blocks.append(
                {
                    "key": self._block_key(name, start),
                    "name": name,
                    "type": item_type,
                    "scheduled_start": start,
                    "scheduled_end": None if end == "--:--" else end,
                }
            )
        completions_dir = ROOT_DIR / "user" / "schedules" / "completions"
        completion_path = completions_dir / f"{target_date}.yml"
        completion_payload = {"entries": {}}
        if completion_path.exists():
            try:
                completion_payload = yaml.safe_load(completion_path.read_text(encoding="utf-8")) or {"entries": {}}
            except Exception:
                completion_payload = {"entries": {}}
        entries = completion_payload.get("entries") if isinstance(completion_payload, dict) else {}
        if not isinstance(entries, dict):
            entries = {}
        rows = []
        for block in scheduled_blocks:
            key = str(block.get("key") or "")
            entry = entries.get(key) if isinstance(entries.get(key), dict) else {}
            status = str(entry.get("status") or "missed").strip().lower()
            rows.append(
                {
                    "key": key,
                    "name": block.get("name"),
                    "type": block.get("type"),
                    "scheduled_start": block.get("scheduled_start"),
                    "scheduled_end": block.get("scheduled_end"),
                    "status": status,
                    "auto_missed": bool(entry.get("auto_missed") or entry.get("source") == "auto_miss_yesterday"),
                }
            )
        return target_date, rows

    def _is_sleep_block(self, blk):
        name = str((blk or {}).get("name") or "").strip().lower()
        return "sleep" in name or "bedtime" in name

    def _maybe_notify_upcoming_schedule_events(self, blocks):
        settings = self._notification_settings()
        warning_minutes = int(settings.get("anchor_warning_minutes") or 10)
        if warning_minutes <= 0:
            return
        now = datetime.now()
        now_min = (int(now.hour) * 60) + int(now.minute)
        for blk in blocks:
            if not isinstance(blk, dict):
                continue
            if blk.get("is_buffer") or not blk.get("is_anchor"):
                continue
            start_min = self._minutes_from_label(blk.get("start"))
            if start_min is None:
                continue
            delta = start_min - now_min
            if delta < 0 or delta > warning_minutes:
                continue
            name = str(blk.get("name") or "Anchor").strip() or "Anchor"
            start_label = self._display_time_label(blk.get("start"))
            dedupe = f"anchor:{name}:{blk.get('start')}"
            if self._is_sleep_block(blk):
                self._notify_event(
                    "bedtime_reminder",
                    "Bedtime Soon",
                    f"{name} starts at {start_label}.",
                    severity="attention",
                    dedupe_key=dedupe,
                    cooldown_seconds=8 * 60 * 60,
                    message_context={"block_name": name, "start_time": str(blk.get("start") or "")},
                )
            else:
                self._notify_event(
                    "upcoming_anchor",
                    "Upcoming Anchor",
                    f"{name} starts in {delta} minutes.",
                    severity="attention",
                    dedupe_key=dedupe,
                    cooldown_seconds=4 * 60 * 60,
                    message_context={"block_name": name, "start_time": str(blk.get("start") or "")},
                )

    def _maybe_notify_waiting_for_anchor(self, timer_state):
        st = timer_state if isinstance(timer_state, dict) else {}
        if not bool(st.get("waiting_for_anchor_start")):
            return
        block = st.get("current_block") if isinstance(st.get("current_block"), dict) else {}
        name = str(block.get("name") or "Upcoming Anchor").strip() or "Upcoming Anchor"
        start_label = self._display_time_label(block.get("start_time") or block.get("ideal_start_time"))
        dedupe_key = f"waiting-anchor:{name}:{block.get('start_time') or block.get('ideal_start_time')}"
        self._notify_event(
            "waiting_for_anchor",
            "Waiting For Anchor",
            f'{name} is queued and will begin at {start_label}.',
            severity="attention",
            dedupe_key=dedupe_key,
            cooldown_seconds=2 * 60 * 60,
            message_context={"block_name": name, "start_time": str(block.get("start_time") or block.get("ideal_start_time") or "")},
        )

    def _maybe_notify_start_day_reminder(self, blocks, timer_state):
        if not isinstance(blocks, list) or not blocks:
            return
        st = timer_state if isinstance(timer_state, dict) else {}
        status = str(st.get("status") or "").strip().lower()
        if status in {"running", "paused"}:
            return
        if st.get("pending_confirmation"):
            return
        settings = self._notification_settings()
        start_min = self._minutes_from_label(settings.get("start_day_reminder_time"))
        cutoff_min = self._minutes_from_label(settings.get("start_day_reminder_cutoff"))
        if start_min is None:
            return
        now = datetime.now()
        now_min = (int(now.hour) * 60) + int(now.minute)
        if now_min < start_min:
            return
        if cutoff_min is not None and now_min > cutoff_min:
            return
        actionable_blocks = [blk for blk in blocks if isinstance(blk, dict) and not blk.get("is_buffer")]
        if not actionable_blocks:
            return
        next_block = None
        for blk in actionable_blocks:
            start_val = self._minutes_from_label(blk.get("start"))
            end_val = self._minutes_from_label(blk.get("end"))
            if end_val is not None and end_val <= now_min:
                continue
            next_block = blk
            if start_val is None or start_val >= now_min:
                break
        if not next_block:
            return
        dedupe_key = f"start-day:{now.strftime('%Y-%m-%d')}"
        block_name = str(next_block.get("name") or "today's first block").strip() or "today's first block"
        block_time = self._display_time_label(next_block.get("start"))
        self._notify_event(
            "start_day_reminder",
            "Start Day",
            f"Your schedule is ready. Next block: {block_name} at {block_time}.",
            severity="attention",
            dedupe_key=dedupe_key,
            cooldown_seconds=18 * 60 * 60,
            message_context={"block_name": block_name, "start_time": str(next_block.get("start") or "")},
        )

    def _maybe_notify_status_nudge(self):
        settings = self._notification_settings()
        stale_hours = float(settings.get("status_nudge_stale_hours") or 4)
        if stale_hours <= 0:
            return
        updated = self._status_last_updated()
        now = datetime.now()
        if updated is not None:
            age_hours = (now - updated).total_seconds() / 3600.0
            if age_hours < stale_hours:
                return
        dedupe_key = f"status-nudge:{now.strftime('%Y-%m-%d')}:{int(now.hour // max(1, int(stale_hours)))}"
        updated_label = updated.strftime("%H:%M") if updated else "unknown"
        self._notify_event(
            "status_nudge",
            "Status Check",
            f"It's been a while since your last status update. Last update: {updated_label}.",
            severity="attention",
            dedupe_key=dedupe_key,
            cooldown_seconds=max(3600, int(stale_hours * 3600)),
            message_context={"last_updated": updated_label},
        )

    def _maybe_notify_due_soon(self):
        items = self._due_soon_items()
        if not items:
            return
        now = datetime.now()
        top = items[0]
        ddiff = self._days_until(top.get("due_dt"))
        if ddiff is None:
            return
        if ddiff < 0:
            due_label = f"Overdue by {abs(ddiff)}d"
        elif ddiff == 0:
            due_label = "Due today"
        else:
            due_label = f"Due in {ddiff}d"
        extra = len(items) - 1
        extra_label = f" + {extra} more" if extra > 0 else ""
        message = f'{top.get("name") or "(untitled)"} ({str(top.get("type") or "").upper()}) {due_label}.{extra_label}'
        dedupe_key = f"due-soon:{now.strftime('%Y-%m-%d')}:{top.get('name')}:{top.get('due_raw')}"
        self._notify_event(
            "due_soon",
            "Due Soon",
            message,
            severity="attention",
            dedupe_key=dedupe_key,
            cooldown_seconds=8 * 60 * 60,
            message_context={"block_name": str(top.get("name") or ""), "due_raw": str(top.get("due_raw") or "")},
        )

    def _maybe_notify_yesterday_checkin(self):
        settings = self._notification_settings()
        start_min = self._minutes_from_label(settings.get("yesterday_checkin_start_time"))
        cutoff_min = self._minutes_from_label(settings.get("yesterday_checkin_cutoff"))
        now = datetime.now()
        now_min = (int(now.hour) * 60) + int(now.minute)
        if start_min is not None and now_min < start_min:
            return
        if cutoff_min is not None and now_min > cutoff_min:
            return
        target_date, rows = self._yesterday_checkin_rows()
        if not rows:
            return
        missed_rows = [row for row in rows if str(row.get("status") or "").strip().lower() in {"missed", "partial", "skipped"}]
        if not missed_rows:
            return
        primary = missed_rows[0]
        extra = len(missed_rows) - 1
        extra_label = f" + {extra} more" if extra > 0 else ""
        message = f'{primary.get("name") or "Yesterday block"} needs review for {target_date}.{extra_label}'
        dedupe_key = f"yesterday-checkin:{target_date}"
        self._notify_event(
            "yesterday_checkin",
            "Yesterday Check-In",
            message,
            severity="attention",
            dedupe_key=dedupe_key,
            cooldown_seconds=12 * 60 * 60,
            message_context={"date": target_date, "block_name": str(primary.get("name") or "")},
        )

    def _build_menu(self):
        return pystray.Menu(
            Item(lambda _: self._menu_status_line(), None, enabled=False),
            pystray.Menu.SEPARATOR,
            Item("Show Mini Panel", lambda: self.show_window()),
            Item("Start Day", lambda: self.start_day()),
            Item("Reschedule Today", lambda: self.reschedule_today()),
            Item("Start Timer", lambda: self.timer_start_default()),
            Item("Pause/Resume Timer", lambda: self.timer_pause_resume()),
            Item("Stop Timer", lambda: self.timer_stop()),
            pystray.Menu.SEPARATOR,
            Item("Done", lambda: self.timer_done()),
            Item("Skip Today", lambda: self.timer_skip_today()),
            Item("Later", lambda: self.timer_later()),
            Item("Start Over", lambda: self.timer_start_over()),
            Item("Stretch", lambda: self.timer_stretch()),
            pystray.Menu.SEPARATOR,
            Item("Open Console", lambda: self.open_cli()),
            Item("Open Dashboard", lambda: self.open_dashboard()),
            Item("Open Topos", lambda: self.open_topos()),
            pystray.Menu.SEPARATOR,
            Item("Notification History", lambda: self.open_notification_history()),
            Item("Notification Settings", lambda: self.open_notification_settings()),
            Item("Quit", self.request_quit),
        )

    def _menu_status_line(self):
        st = self._latest_timer_state or {}
        return f"Timer: {self._status_phase_time_line(st.get('status'), st.get('current_phase'), st.get('remaining_seconds'))}"

    def open_cli(self):
        subprocess.Popen(["cmd", "/c", "console_launcher.bat"], cwd=str(ROOT_DIR))

    def open_dashboard(self):
        subprocess.Popen(["cmd", "/c", "dashboard_launcher.bat"], cwd=str(ROOT_DIR))

    def open_notification_settings(self):
        if self.notification_window and self.notification_window.winfo_exists():
            self._refresh_notification_settings_controls()
            self.notification_window.deiconify()
            self.notification_window.lift()
            self.notification_window.focus_force()
            return
        self.notification_window = self._build_notification_settings_window()
        self.notification_window.deiconify()
        self.notification_window.lift()
        self.notification_window.focus_force()

    def open_notification_history(self):
        if self.notification_history_window and self.notification_history_window.winfo_exists():
            self._refresh_notification_history_list()
            self.notification_history_window.deiconify()
            self.notification_history_window.lift()
            self.notification_history_window.focus_force()
            return
        self.notification_history_window = self._build_notification_history_window()
        self.notification_history_window.deiconify()
        self.notification_history_window.lift()
        self.notification_history_window.focus_force()

    def open_topos(self):
        subprocess.Popen(["cmd", "/c", "topos_launcher.bat"], cwd=str(ROOT_DIR))

    def _notification_settings_path(self):
        return ROOT_DIR / "user" / "settings" / "notification_settings.yml"

    def _normalize_notification_settings(self, settings):
        normalized = dict(DEFAULT_NOTIFICATION_SETTINGS)
        if isinstance(settings, dict):
            normalized.update({k: v for k, v in settings.items() if k != "event_settings"})
            events = dict(DEFAULT_NOTIFICATION_SETTINGS.get("event_settings") or {})
            if isinstance(settings.get("event_settings"), dict):
                events.update({k: bool(v) for k, v in settings.get("event_settings", {}).items()})
            normalized["event_settings"] = events
        return normalized

    def _refresh_notification_settings_controls(self):
        if not self._notification_settings_vars:
            return
        settings = self._normalize_notification_settings(self._notification_settings())
        vars_map = self._notification_settings_vars
        vars_map["enabled"].set(bool(settings.get("enabled", True)))
        vars_map["quiet_hours_enabled"].set(bool(settings.get("quiet_hours_enabled", True)))
        vars_map["quiet_hours_start"].set(str(settings.get("quiet_hours_start") or "22:00"))
        vars_map["quiet_hours_end"].set(str(settings.get("quiet_hours_end") or "07:00"))
        vars_map["anchor_warning_minutes"].set(str(settings.get("anchor_warning_minutes") or 10))
        vars_map["start_day_reminder_time"].set(str(settings.get("start_day_reminder_time") or "09:00"))
        vars_map["start_day_reminder_cutoff"].set(str(settings.get("start_day_reminder_cutoff") or "14:00"))
        vars_map["status_nudge_stale_hours"].set(str(settings.get("status_nudge_stale_hours") or 4))
        vars_map["due_soon_lookahead_days"].set(str(settings.get("due_soon_lookahead_days") or 3))
        vars_map["yesterday_checkin_start_time"].set(str(settings.get("yesterday_checkin_start_time") or "06:00"))
        vars_map["yesterday_checkin_cutoff"].set(str(settings.get("yesterday_checkin_cutoff") or "16:00"))
        vars_map["allow_during_sleep_critical"].set("critical" in {str(v).strip().lower() for v in (settings.get("allow_during_sleep") or [])})
        vars_map["allow_during_quiet_hours_critical"].set("critical" in {str(v).strip().lower() for v in (settings.get("allow_during_quiet_hours") or [])})
        event_settings = settings.get("event_settings") if isinstance(settings.get("event_settings"), dict) else {}
        for key, var in vars_map["events"].items():
            var.set(bool(event_settings.get(key, True)))
        status_var = vars_map.get("status")
        if status_var:
            status_var.set("")

    def _collect_notification_settings_from_controls(self):
        vars_map = self._notification_settings_vars

        def _int_value(key, fallback):
            try:
                return max(0, int(str(vars_map[key].get() or "").strip()))
            except Exception:
                return fallback

        def _float_value(key, fallback):
            try:
                value = float(str(vars_map[key].get() or "").strip())
                return max(0.0, value)
            except Exception:
                return fallback

        settings = {
            "enabled": bool(vars_map["enabled"].get()),
            "quiet_hours_enabled": bool(vars_map["quiet_hours_enabled"].get()),
            "quiet_hours_start": str(vars_map["quiet_hours_start"].get() or "22:00").strip() or "22:00",
            "quiet_hours_end": str(vars_map["quiet_hours_end"].get() or "07:00").strip() or "07:00",
            "allow_during_sleep": ["critical"] if bool(vars_map["allow_during_sleep_critical"].get()) else [],
            "allow_during_quiet_hours": ["critical"] if bool(vars_map["allow_during_quiet_hours_critical"].get()) else [],
            "anchor_warning_minutes": _int_value("anchor_warning_minutes", 10),
            "start_day_reminder_time": str(vars_map["start_day_reminder_time"].get() or "09:00").strip() or "09:00",
            "start_day_reminder_cutoff": str(vars_map["start_day_reminder_cutoff"].get() or "14:00").strip() or "14:00",
            "status_nudge_stale_hours": _float_value("status_nudge_stale_hours", 4),
            "due_soon_lookahead_days": _int_value("due_soon_lookahead_days", 3),
            "yesterday_checkin_start_time": str(vars_map["yesterday_checkin_start_time"].get() or "06:00").strip() or "06:00",
            "yesterday_checkin_cutoff": str(vars_map["yesterday_checkin_cutoff"].get() or "16:00").strip() or "16:00",
            "event_settings": {key: bool(var.get()) for key, var in vars_map["events"].items()},
        }
        return settings

    def _save_notification_settings(self):
        settings = self._collect_notification_settings_from_controls()
        ok = self._write_yaml(self._notification_settings_path(), settings)
        status_var = self._notification_settings_vars.get("status")
        if status_var:
            status_var.set("Saved notification settings." if ok else "Failed to save notification settings.")
        if ok:
            self.refresh_state()
        return ok

    def _hide_notification_settings(self):
        if self.notification_window and self.notification_window.winfo_exists():
            self.notification_window.withdraw()

    def _hide_notification_history(self):
        if self.notification_history_window and self.notification_history_window.winfo_exists():
            self.notification_history_window.withdraw()

    def _refresh_notification_history_details(self, index=None):
        rows = list(self._notification_log or [])
        if not rows:
            self._notification_history_details_var.set("No notifications yet.")
            return
        if index is None:
            if not self._notification_history_listbox:
                self._notification_history_details_var.set("Select a notification to inspect it.")
                return
            try:
                selection = self._notification_history_listbox.curselection()
                index = int(selection[0]) if selection else 0
            except Exception:
                index = 0
        display_rows = list(reversed(rows))
        if index < 0 or index >= len(display_rows):
            self._notification_history_details_var.set("Select a notification to inspect it.")
            return
        row = display_rows[index]
        actions = ", ".join([label for label in (row.get("actions") or []) if str(label).strip()]) or "-"
        details = (
            f"{row.get('title') or '(untitled)'}\n"
            f"{row.get('message') or '-'}\n\n"
            f"Time: {row.get('created_at') or '-'}\n"
            f"Type: {row.get('event_type') or '-'}\n"
            f"Severity: {row.get('severity') or '-'}\n"
            f"Actions: {actions}"
        )
        self._notification_history_details_var.set(details)

    def _on_notification_history_select(self, _event=None):
        self._refresh_notification_history_details()

    def _refresh_notification_history_list(self):
        if not self._notification_history_listbox:
            return
        listbox = self._notification_history_listbox
        listbox.delete(0, tk.END)
        rows = list(reversed(self._notification_log or []))
        if not rows:
            listbox.insert(tk.END, "No notifications yet.")
            listbox.itemconfig(0, fg="#6f809b")
            self._notification_history_details_var.set("No notifications yet.")
            return
        for row in rows:
            timestamp = self._history_time_label(row.get("created_at"))
            event_type = self._nice_label(row.get("event_type") or "notification")
            title = str(row.get("title") or "(untitled)").strip() or "(untitled)"
            if len(title) > 42:
                title = title[:39] + "..."
            listbox.insert(tk.END, f"{timestamp}  {event_type}  {title}")
        try:
            listbox.selection_clear(0, tk.END)
            listbox.selection_set(0)
            listbox.activate(0)
        except Exception:
            pass
        self._refresh_notification_history_details(0)

    def _clear_notification_history(self):
        self._notification_log = []
        self._save_notification_log()
        self._refresh_notification_history_list()

    def _build_notification_history_window(self):
        self._apply_theme()
        win = tk.Toplevel(self.root)
        win.title("Chronos Notification History")
        win.geometry("700x420")
        win.minsize(700, 420)
        win.protocol("WM_DELETE_WINDOW", self._hide_notification_history)
        win.attributes("-topmost", True)
        win.configure(bg="#0b1220")
        self._apply_window_icon(win)

        frame = ttk.Frame(win, padding=10, style="Chronos.TFrame")
        frame.pack(fill=tk.BOTH, expand=True)

        header = ttk.Frame(frame, style="Chronos.TFrame")
        header.pack(fill=tk.X, pady=(0, 8))
        ttk.Label(header, text="Notification History", style="Chronos.Header.TLabel").pack(side=tk.LEFT)
        ttk.Button(header, text="Clear", command=self._clear_notification_history, style="Chronos.TButton").pack(side=tk.RIGHT)

        ttk.Label(
            frame,
            text="Recent Chronos tray notifications, newest first.",
            style="Chronos.TLabel",
            wraplength=660,
            justify=tk.LEFT,
        ).pack(anchor=tk.W, pady=(0, 8))

        content = ttk.Frame(frame, style="Chronos.TFrame")
        content.pack(fill=tk.BOTH, expand=True)

        list_card = ttk.Frame(content, padding=8, style="Chronos.TFrame")
        list_card.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 8))
        ttk.Label(list_card, text="Recent", style="Chronos.Header.TLabel").pack(anchor=tk.W, pady=(0, 6))

        list_frame = ttk.Frame(list_card, style="Chronos.TFrame")
        list_frame.pack(fill=tk.BOTH, expand=True)
        list_scroll = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, style="Chronos.Vertical.TScrollbar")
        self._notification_history_listbox = tk.Listbox(
            list_frame,
            bg="#0e1728",
            fg="#d5e2f7",
            selectbackground="#1e3a5f",
            selectforeground="#ecf3ff",
            highlightthickness=1,
            highlightbackground="#22314f",
            highlightcolor="#5aa9ff",
            borderwidth=0,
            relief="flat",
            activestyle="none",
            font=("Consolas", 8),
            yscrollcommand=list_scroll.set,
        )
        list_scroll.config(command=self._notification_history_listbox.yview)
        self._notification_history_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        list_scroll.pack(side=tk.RIGHT, fill=tk.Y, padx=(8, 0))
        self._notification_history_listbox.bind("<<ListboxSelect>>", self._on_notification_history_select)

        detail_card = ttk.Frame(content, padding=8, style="Chronos.TFrame")
        detail_card.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        ttk.Label(detail_card, text="Details", style="Chronos.Header.TLabel").pack(anchor=tk.W, pady=(0, 6))
        tk.Label(
            detail_card,
            textvariable=self._notification_history_details_var,
            bg="#0e1728",
            fg="#d5e2f7",
            justify=tk.LEFT,
            anchor="nw",
            padx=10,
            pady=10,
            wraplength=280,
            font=("Segoe UI", 8),
        ).pack(fill=tk.BOTH, expand=True)

        self._refresh_notification_history_list()
        return win

    def _build_notification_settings_window(self):
        self._apply_theme()
        win = tk.Toplevel(self.root)
        win.title("Chronos Notification Settings")
        win.geometry("560x540")
        win.minsize(560, 540)
        win.protocol("WM_DELETE_WINDOW", self._hide_notification_settings)
        win.attributes("-topmost", True)
        win.configure(bg="#0b1220")
        self._apply_window_icon(win)

        frame = ttk.Frame(win, padding=10, style="Chronos.TFrame")
        frame.pack(fill=tk.BOTH, expand=True)

        vars_map = {
            "enabled": tk.BooleanVar(value=True),
            "quiet_hours_enabled": tk.BooleanVar(value=True),
            "quiet_hours_start": tk.StringVar(value="22:00"),
            "quiet_hours_end": tk.StringVar(value="07:00"),
            "allow_during_sleep_critical": tk.BooleanVar(value=True),
            "allow_during_quiet_hours_critical": tk.BooleanVar(value=True),
            "anchor_warning_minutes": tk.StringVar(value="10"),
            "start_day_reminder_time": tk.StringVar(value="09:00"),
            "start_day_reminder_cutoff": tk.StringVar(value="14:00"),
            "status_nudge_stale_hours": tk.StringVar(value="4"),
            "due_soon_lookahead_days": tk.StringVar(value="3"),
            "yesterday_checkin_start_time": tk.StringVar(value="06:00"),
            "yesterday_checkin_cutoff": tk.StringVar(value="16:00"),
            "events": {key: tk.BooleanVar(value=True) for key in NOTIFICATION_EVENT_LABELS},
            "status": tk.StringVar(value=""),
        }
        self._notification_settings_vars = vars_map

        ttk.Label(frame, text="Notification Settings", style="Chronos.Header.TLabel").pack(anchor=tk.W)
        ttk.Label(
            frame,
            text="Control tray toasts, quiet-hour behavior, and which Chronos notifications are allowed to fire.",
            style="Chronos.TLabel",
            wraplength=520,
            justify=tk.LEFT,
        ).pack(anchor=tk.W, pady=(4, 8))

        toggles_card = ttk.Frame(frame, padding=9, style="Chronos.TFrame")
        toggles_card.pack(fill=tk.X, pady=(0, 8))
        ttk.Checkbutton(toggles_card, text="Enable notifications", variable=vars_map["enabled"], style="Chronos.TCheckbutton").pack(anchor=tk.W)
        ttk.Checkbutton(toggles_card, text="Enable quiet hours", variable=vars_map["quiet_hours_enabled"], style="Chronos.TCheckbutton").pack(anchor=tk.W, pady=(4, 0))
        ttk.Checkbutton(toggles_card, text="Allow critical notifications during sleep", variable=vars_map["allow_during_sleep_critical"], style="Chronos.TCheckbutton").pack(anchor=tk.W, pady=(4, 0))
        ttk.Checkbutton(toggles_card, text="Allow critical notifications during quiet hours", variable=vars_map["allow_during_quiet_hours_critical"], style="Chronos.TCheckbutton").pack(anchor=tk.W, pady=(4, 0))

        timing_card = ttk.Frame(frame, padding=9, style="Chronos.TFrame")
        timing_card.pack(fill=tk.X, pady=(0, 8))
        ttk.Label(timing_card, text="Timing", style="Chronos.Header.TLabel").pack(anchor=tk.W, pady=(0, 6))

        def add_field_row(parent, left_label, left_key, right_label=None, right_key=None):
            row = ttk.Frame(parent, style="Chronos.TFrame")
            row.pack(fill=tk.X, pady=(0, 6))
            ttk.Label(row, text=left_label, style="Chronos.TLabel", width=21).pack(side=tk.LEFT)
            ttk.Entry(row, textvariable=vars_map[left_key], width=10, style="Chronos.TEntry").pack(side=tk.LEFT, padx=(0, 10))
            if right_label and right_key:
                ttk.Label(row, text=right_label, style="Chronos.TLabel", width=18).pack(side=tk.LEFT)
                ttk.Entry(row, textvariable=vars_map[right_key], width=10, style="Chronos.TEntry").pack(side=tk.LEFT)

        add_field_row(timing_card, "Quiet hours start", "quiet_hours_start", "Quiet hours end", "quiet_hours_end")
        add_field_row(timing_card, "Anchor warning (min)", "anchor_warning_minutes", "Due soon lookahead", "due_soon_lookahead_days")
        add_field_row(timing_card, "Start day reminder", "start_day_reminder_time", "Reminder cutoff", "start_day_reminder_cutoff")
        add_field_row(timing_card, "Status stale hours", "status_nudge_stale_hours", "Yesterday check-in", "yesterday_checkin_start_time")
        add_field_row(timing_card, "Yesterday cutoff", "yesterday_checkin_cutoff")

        events_card = ttk.Frame(frame, padding=9, style="Chronos.TFrame")
        events_card.pack(fill=tk.BOTH, expand=True, pady=(0, 8))
        ttk.Label(events_card, text="Event Toggles", style="Chronos.Header.TLabel").pack(anchor=tk.W, pady=(0, 6))
        events_grid = ttk.Frame(events_card, style="Chronos.TFrame")
        events_grid.pack(fill=tk.X)
        column = 0
        row_index = 0
        for key, label in NOTIFICATION_EVENT_LABELS.items():
            cell = ttk.Frame(events_grid, style="Chronos.TFrame")
            cell.grid(row=row_index, column=column, sticky="w", padx=(0, 16), pady=(0, 4))
            ttk.Checkbutton(cell, text=label, variable=vars_map["events"][key], style="Chronos.TCheckbutton").pack(anchor=tk.W)
            column += 1
            if column > 1:
                column = 0
                row_index += 1

        footer = ttk.Frame(frame, style="Chronos.TFrame")
        footer.pack(fill=tk.X)
        ttk.Label(footer, textvariable=vars_map["status"], style="Chronos.TLabel").pack(side=tk.LEFT)
        ttk.Button(footer, text="Reload", command=self._refresh_notification_settings_controls, style="Chronos.TButton").pack(side=tk.RIGHT)
        ttk.Button(footer, text="Close", command=self._hide_notification_settings, style="Chronos.TButton").pack(side=tk.RIGHT, padx=(0, 6))
        ttk.Button(footer, text="Save", command=self._save_notification_settings, style="ChronosAccent.TButton").pack(side=tk.RIGHT, padx=(0, 6))

        self._refresh_notification_settings_controls()
        return win

    def start_day(self):
        props = {}
        sleep_policy = self._resolve_sleep_conflict("start", ["day"], props)
        if sleep_policy is False:
            self.refresh_state()
            return
        if sleep_policy:
            props["sleep_policy"] = sleep_policy
        try:
            invoke_command("start", ["day"], props)
        except Exception:
            pass
        self.refresh_state()

    def reschedule_today(self):
        props = {}
        sleep_policy = self._resolve_sleep_conflict("today", ["reschedule"], props)
        if sleep_policy is False:
            self.refresh_state()
            return
        if sleep_policy:
            props["sleep_policy"] = sleep_policy
        try:
            invoke_command("today", ["reschedule"], props)
        except Exception:
            pass
        self.refresh_state()

    def _close_sleep_popup(self):
        popup = self._sleep_popup
        self._sleep_popup = None
        if popup is None:
            return
        try:
            if popup.winfo_exists():
                popup.grab_release()
        except Exception:
            pass
        try:
            if popup.winfo_exists():
                popup.destroy()
        except Exception:
            pass

    def _resolve_sleep_conflict(self, command_name, args, properties):
        interrupt = build_sleep_interrupt(command_name, args, properties or {})
        if not interrupt:
            return None
        return self._show_sleep_conflict_popup(interrupt)

    def _show_sleep_conflict_popup(self, interrupt):
        sleep_block = interrupt.get("sleep_block") if isinstance(interrupt, dict) else {}
        options = list(SLEEP_POLICY_OPTIONS)
        result = {"choice": None}

        self._close_sleep_popup()
        self._apply_theme()
        pop = tk.Toplevel(self.root)
        pop.title("Chronos Sleep Conflict")
        pop.geometry("500x430")
        pop.resizable(False, False)
        pop.attributes("-topmost", True)
        pop.configure(bg="#0b1220")
        self._apply_window_icon(pop)
        self._sleep_popup = pop

        frame = ttk.Frame(pop, padding=14, style="Chronos.TFrame")
        frame.pack(fill=tk.BOTH, expand=True)

        ttk.Label(frame, text="Sleep Conflict", style="Chronos.Header.TLabel").pack(anchor=tk.W)
        ttk.Label(
            frame,
            text="You're inside a scheduled sleep block. What is happening?",
            style="Chronos.TLabel",
            wraplength=450,
            justify=tk.LEFT,
        ).pack(anchor=tk.W, pady=(6, 10))

        detail = ttk.Frame(frame, style="Chronos.TFrame")
        detail.pack(fill=tk.X, pady=(0, 10))
        detail_lines = [
            f"Sleep block: {sleep_block.get('name') or 'Sleep'}",
            f"Window: {sleep_block.get('start_time') or '??:??'}-{sleep_block.get('end_time') or '??:??'}",
            f"Template: {sleep_block.get('template_name') or 'Unknown template'}",
        ]
        for line in detail_lines:
            ttk.Label(detail, text=line, style="Chronos.TLabel", wraplength=450, justify=tk.LEFT).pack(anchor=tk.W)

        def choose(policy):
            result["choice"] = policy
            self._close_sleep_popup()

        for idx, (policy, label) in enumerate(options):
            note = {
                "woke_early": "End the current sleep block now and rebuild from this moment.",
                "stay_awake": "Start the day now and treat the rest of sleep as intentionally canceled.",
                "go_back_to_sleep": "Cancel this action and leave the schedule alone.",
                "shift_later": "Continue now, but treat this as a late-start day.",
                "ignore_today": "Bypass this sleep block for today only without changing defaults.",
                "edit_sleep": "Open the dashboard so you can change sleep settings.",
            }.get(policy, "")
            card = ttk.Frame(frame, style="Chronos.TFrame")
            card.pack(fill=tk.X, pady=(0, 6))
            ttk.Button(card, text=label, command=lambda value=policy: choose(value), style="Chronos.TButton").pack(fill=tk.X)
            ttk.Label(card, text=note, style="Chronos.TLabel", wraplength=450, justify=tk.LEFT).pack(anchor=tk.W, pady=(2, 0))

        def on_close():
            # Required decision gate: closing maps to cancel.
            choose("go_back_to_sleep")

        pop.protocol("WM_DELETE_WINDOW", on_close)
        try:
            pop.transient(self.window if self.window and self.window.winfo_exists() else self.root)
        except Exception:
            pass
        try:
            pop.grab_set()
        except Exception:
            pass
        try:
            pop.lift()
            pop.focus_force()
        except Exception:
            pass
        self.root.wait_window(pop)

        choice = result.get("choice")
        if choice == "edit_sleep":
            self.open_dashboard()
            return False
        if choice == "go_back_to_sleep" or not choice:
            return False
        return choice

    def _default_profile(self):
        settings_path = ROOT_DIR / "user" / "settings" / "timer_settings.yml"
        legacy_settings_path = ROOT_DIR / "user" / "settings" / "Timer_Settings.yml"
        if not settings_path.exists() and legacy_settings_path.exists():
            settings_path = legacy_settings_path
        if not settings_path.exists():
            return "classic_pomodoro"
        try:
            data = yaml.safe_load(settings_path.read_text(encoding="utf-8")) or {}
            return str(data.get("default_profile") or "classic_pomodoro")
        except Exception:
            return "classic_pomodoro"

    def _timer_profiles(self):
        try:
            Timer.ensure_default_profiles()
            return Timer.profiles_list() or []
        except Exception:
            return []

    def _selected_timer_profile(self):
        selected = str(self.timer_profile_var.get() or "").strip()
        if selected:
            return selected
        return self._default_profile()

    def timer_start_default(self):
        profile = self._selected_timer_profile()
        try:
            Timer.start_timer(profile)
        except Exception:
            pass
        self.refresh_state()

    def timer_pause_resume(self):
        st = Timer.status()
        status = str(st.get("status") or "idle").lower()
        try:
            if status == "paused":
                Timer.resume_timer()
            elif status == "running":
                Timer.pause_timer()
        except Exception:
            pass
        self.refresh_state()

    def timer_start_stop(self):
        status = str((self._latest_timer_state or {}).get("status") or "").lower()
        if status in {"running", "paused"}:
            self.timer_stop()
            return
        self.timer_start_default()

    def timer_pause_or_resume(self):
        self.timer_pause_resume()

    def timer_stop(self):
        try:
            Timer.stop_timer()
        except Exception:
            pass
        self.refresh_state()

    def _timer_confirm_action(self, action):
        try:
            # Uses the same schedule confirmation actions as the dashboard timer widget.
            Timer.confirm_schedule_block(None, action)
        except Exception:
            pass
        self.refresh_state()

    def timer_done(self):
        self._timer_confirm_action("yes")

    def timer_skip_today(self):
        self._timer_confirm_action("skip")

    def timer_later(self):
        # Keep behavior aligned with the dashboard timer widget's "Later" action.
        self._timer_confirm_action("skip")

    def timer_start_over(self):
        self._timer_confirm_action("start_over")

    def timer_stretch(self):
        self._timer_confirm_action("stretch")

    def _close_pending_popup(self):
        popup = self._pending_popup
        self._pending_popup = None
        self._pending_popup_key = None
        if popup is None:
            return
        try:
            if popup.winfo_exists():
                popup.destroy()
        except Exception:
            pass

    def _show_pending_popup(self, block_name, prompt_key):
        name = str(block_name or "").strip() or "this block"
        key = str(prompt_key or "").strip()
        if (
            self._pending_popup
            and self._pending_popup.winfo_exists()
            and self._pending_popup_key == key
        ):
            try:
                self._pending_popup.deiconify()
                self._pending_popup.lift()
                self._pending_popup.focus_force()
            except Exception:
                pass
            return

        self._close_pending_popup()
        self._apply_theme()
        pop = tk.Toplevel(self.root)
        pop.title("Chronos Timer")
        pop.geometry("360x206")
        pop.resizable(False, False)
        pop.attributes("-topmost", True)
        pop.configure(bg="#0b1220")
        self._apply_window_icon(pop)

        frame = ttk.Frame(pop, padding=12, style="Chronos.TFrame")
        frame.pack(fill=tk.BOTH, expand=True)

        ttk.Label(frame, text="Timer Check-in", style="Chronos.Header.TLabel").pack(anchor=tk.W)
        ttk.Label(
            frame,
            text=f'Finished "{name}"?',
            style="Chronos.TLabel",
            wraplength=320,
            justify=tk.LEFT,
        ).pack(anchor=tk.W, pady=(6, 12))

        row1 = ttk.Frame(frame, style="Chronos.TFrame")
        row1.pack(fill=tk.X, pady=(0, 6))
        ttk.Button(row1, text="Done", command=self.timer_done, style="ChronosAccent.TButton").pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(row1, text="Skip Today", command=self.timer_skip_today, style="Chronos.TButton").pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(row1, text="Later", command=self.timer_later, style="Chronos.TButton").pack(side=tk.LEFT)

        row2 = ttk.Frame(frame, style="Chronos.TFrame")
        row2.pack(fill=tk.X, pady=(0, 6))
        ttk.Button(row2, text="Start Over", command=self.timer_start_over, style="Chronos.TButton").pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(row2, text="Stretch", command=self.timer_stretch, style="Chronos.TButton").pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(row2, text="Open Mini", command=self.show_window, style="Chronos.TButton").pack(side=tk.LEFT)

        def _on_close():
            # Dismiss UI only; keep timer pending state untouched.
            self._close_pending_popup()

        pop.protocol("WM_DELETE_WINDOW", _on_close)
        self._pending_popup = pop
        self._pending_popup_key = key

    def _build_window(self):
        self._apply_theme()
        win = tk.Toplevel(self.root)
        win.title("Chronos Mini")
        win.geometry("660x620")
        win.minsize(660, 620)
        win.protocol("WM_DELETE_WINDOW", self.hide_window)
        win.attributes("-topmost", True)
        win.configure(bg="#0b1220")
        self._apply_window_icon(win)

        frame = ttk.Frame(win, padding=9, style="Chronos.TFrame")
        frame.pack(fill=tk.BOTH, expand=True)

        left_col = ttk.Frame(frame, style="Chronos.TFrame")
        left_col.pack(side=tk.LEFT, fill=tk.BOTH, expand=False, padx=(0, 9))

        right_col = ttk.Frame(frame, style="Chronos.TFrame")
        right_col.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        status_card = ttk.Frame(left_col, padding=9, style="Chronos.TFrame")
        status_card.pack(fill=tk.X, pady=(0, 8))
        status_header = ttk.Frame(status_card, style="Chronos.TFrame")
        status_header.pack(fill=tk.X)

        ring_wrap = tk.Frame(status_header, bg="#111a2b", highlightthickness=0, bd=0)
        ring_wrap.pack(side=tk.LEFT, padx=(0, 9))
        self.timer_ring_canvas = tk.Canvas(
            ring_wrap,
            width=96,
            height=96,
            bg="#111a2b",
            highlightthickness=0,
            bd=0,
        )
        self.timer_ring_canvas.pack()
        self.timer_ring_canvas.create_oval(10, 10, 86, 86, outline="#22314f", width=8)
        self.timer_ring_arc = self.timer_ring_canvas.create_arc(
            10,
            10,
            86,
            86,
            start=90,
            extent=0,
            style=tk.ARC,
            outline="#5aa9ff",
            width=8,
        )
        self.timer_ring_clock = self.timer_ring_canvas.create_text(
            48,
            43,
            text="00:00",
            fill="#e6edf7",
            font=("Segoe UI", 12, "bold"),
        )
        self.timer_ring_label = self.timer_ring_canvas.create_text(
            48,
            61,
            text="0% elapsed",
            fill="#9fb0ca",
            font=("Segoe UI", 7),
        )

        status_meta = ttk.Frame(status_header, style="Chronos.TFrame")
        status_meta.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        ttk.Label(status_meta, textvariable=self.status_var, style="Chronos.Header.TLabel").pack(anchor=tk.W)
        ttk.Label(status_meta, textvariable=self.phase_var, style="Chronos.TLabel").pack(anchor=tk.W, pady=(3, 0))
        ttk.Label(status_meta, textvariable=self.block_var, style="Chronos.TLabel").pack(anchor=tk.W, pady=(3, 0))
        ttk.Label(status_meta, textvariable=self.queue_var, style="Chronos.TLabel").pack(anchor=tk.W, pady=(3, 0))

        controls_card = ttk.Frame(left_col, padding=9, style="Chronos.TFrame")
        controls_card.pack(fill=tk.X, pady=(0, 8))
        ttk.Label(controls_card, text="Quick Actions", style="Chronos.Header.TLabel").pack(anchor=tk.W, pady=(0, 6))

        profile_row = ttk.Frame(controls_card, style="Chronos.TFrame")
        profile_row.pack(fill=tk.X, pady=(0, 4))
        ttk.Label(profile_row, text="Profile", style="Chronos.TLabel", width=7).pack(side=tk.LEFT)
        profile_values = self._timer_profiles()
        self.timer_profile_combo = ttk.Combobox(
            profile_row,
            textvariable=self.timer_profile_var,
            values=profile_values,
            state="readonly",
            width=16,
            style="Chronos.TCombobox",
        )
        self.timer_profile_combo.pack(side=tk.LEFT, fill=tk.X, expand=True)
        default_profile = self._default_profile()
        if default_profile in profile_values:
            self.timer_profile_var.set(default_profile)
        elif profile_values:
            self.timer_profile_var.set(profile_values[0])

        day_row = ttk.Frame(controls_card, style="Chronos.TFrame")
        day_row.pack(fill=tk.X, pady=(0, 4))
        ttk.Button(day_row, text="Start Day", command=self.start_day, style="ChronosAccent.TButton").pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(day_row, text="Reschedule", command=self.reschedule_today, style="Chronos.TButton").pack(side=tk.LEFT, padx=(0, 6))
        self.timer_start_stop_button = ttk.Button(day_row, text="Start Timer", command=self.timer_start_stop, style="Chronos.TButton")
        self.timer_start_stop_button.pack(side=tk.LEFT)

        timer_row = ttk.Frame(controls_card, style="Chronos.TFrame")
        timer_row.pack(fill=tk.X, pady=(0, 4))
        self.timer_pause_resume_button = ttk.Button(timer_row, text="Pause", command=self.timer_pause_or_resume, style="Chronos.TButton")
        self.timer_pause_resume_button.pack(side=tk.LEFT, padx=(0, 6))

        launch_row = ttk.Frame(controls_card, style="Chronos.TFrame")
        launch_row.pack(fill=tk.X)
        ttk.Button(launch_row, text="Console", command=self.open_cli, style="Chronos.TButton").pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(launch_row, text="Dashboard", command=self.open_dashboard, style="Chronos.TButton").pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(launch_row, text="Topos", command=self.open_topos, style="Chronos.TButton").pack(side=tk.LEFT)

        status_card = ttk.Frame(left_col, padding=9, style="Chronos.TFrame")
        status_card.pack(fill=tk.BOTH, expand=True)
        ttk.Label(status_card, text="Status Station", style="Chronos.Header.TLabel").pack(anchor=tk.W, pady=(0, 3))
        status_frame = ttk.Frame(status_card, style="Chronos.TFrame")
        status_frame.pack(fill=tk.X, pady=(3, 0))
        self.status_controls = {}
        for entry in self.status_schema:
            row = ttk.Frame(status_frame, style="Chronos.TFrame")
            row.pack(fill=tk.X, pady=(0, 3))
            ttk.Label(row, text=entry["label"], style="Chronos.TLabel", width=10).pack(side=tk.LEFT)
            var = tk.StringVar()
            combo = ttk.Combobox(
                row,
                textvariable=var,
                values=entry.get("options") or [],
                state="readonly",
                width=14,
                style="Chronos.TCombobox",
            )
            combo.pack(side=tk.LEFT, fill=tk.X, expand=True)
            self.status_controls[entry["slug"]] = var
        preset_row = ttk.Frame(status_frame, style="Chronos.TFrame")
        preset_row.pack(fill=tk.X, pady=(3, 3))
        ttk.Button(preset_row, text="High / Focus", command=lambda: self._apply_status_preset("high"), style="Chronos.TButton").pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(preset_row, text="Medium / Steady", command=lambda: self._apply_status_preset("steady"), style="Chronos.TButton").pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(preset_row, text="Low / Recovery", command=lambda: self._apply_status_preset("recovery"), style="Chronos.TButton").pack(side=tk.LEFT)
        status_action_row = ttk.Frame(status_frame, style="Chronos.TFrame")
        status_action_row.pack(fill=tk.X, pady=(0, 2))
        ttk.Button(status_action_row, text="Refresh Status", command=self._refresh_status_controls, style="Chronos.TButton").pack(side=tk.LEFT, padx=(0, 6))
        ttk.Button(status_action_row, text="Update Status", command=self._update_status_from_controls, style="ChronosAccent.TButton").pack(side=tk.LEFT)

        schedule_card = ttk.Frame(right_col, padding=9, style="Chronos.TFrame")
        schedule_card.pack(fill=tk.BOTH, expand=True)
        ttk.Label(schedule_card, text="Today's Schedule", style="Chronos.Header.TLabel").pack(anchor=tk.W, pady=(0, 6))
        schedule_frame = ttk.Frame(schedule_card, style="Chronos.TFrame")
        schedule_frame.pack(fill=tk.BOTH, expand=True)
        schedule_scroll = ttk.Scrollbar(schedule_frame, orient=tk.VERTICAL, style="Chronos.Vertical.TScrollbar")
        self.schedule_box = tk.Listbox(
            schedule_frame,
            height=14,
            bg="#0e1728",
            fg="#d5e2f7",
            selectbackground="#1e3a5f",
            selectforeground="#ecf3ff",
            highlightthickness=1,
            highlightbackground="#22314f",
            highlightcolor="#5aa9ff",
            borderwidth=0,
            relief="flat",
            activestyle="none",
            font=("Consolas", 8),
            yscrollcommand=schedule_scroll.set,
        )
        schedule_scroll.config(command=self.schedule_box.yview)
        self.schedule_box.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        schedule_scroll.pack(side=tk.RIGHT, fill=tk.Y, padx=(8, 0))
        self._refresh_status_controls()
        return win

    def show_window(self):
        if self.window is None or not self.window.winfo_exists():
            self.window = self._build_window()
            self.timer_start_stop_button = self.timer_start_stop_button if self.window else None
        self.window.deiconify()
        self.window.lift()
        self.window.focus_force()
        self.refresh_state()

    def hide_window(self):
        if self.window and self.window.winfo_exists():
            self.window.withdraw()

    def _refresh_schedule_list(self, current_block_name):
        if not self.schedule_box:
            return
        blocks = self._current_schedule_blocks()
        self.schedule_box.delete(0, tk.END)
        now = datetime.now()
        now_min = (int(now.hour) * 60) + int(now.minute)
        for blk in blocks:
            marker = ">" if current_block_name and blk["name"] == current_block_name else " "
            kind = "break" if blk["is_buffer"] else "focus"
            start_label = self._display_time_label(blk.get("start"))
            end_label = self._display_time_label(blk.get("end"))
            line = f"{marker} [{kind}] {start_label} - {end_label}  {blk['name']}"
            self.schedule_box.insert(tk.END, line.strip())

            start_min = self._minutes_from_label(blk.get("start"))
            end_min = self._minutes_from_label(blk.get("end"))
            tone = "future"
            if end_min is not None and end_min <= now_min:
                tone = "past"
            elif start_min is not None and end_min is not None and start_min <= now_min < end_min:
                tone = "now"
            elif start_min is not None and start_min <= now_min:
                tone = "past"

            idx = self.schedule_box.size() - 1
            if tone == "past":
                self.schedule_box.itemconfig(idx, fg="#ff6b6b")
            elif tone == "now":
                self.schedule_box.itemconfig(idx, fg="#66b3ff")
            else:
                self.schedule_box.itemconfig(idx, fg="#4fd89b")

    def refresh_state(self):
        st = Timer.status()
        self._latest_timer_state = st if isinstance(st, dict) else {}
        status = st.get("status") or "idle"
        phase = st.get("current_phase") or "-"
        rem = self._hhmmss(st.get("remaining_seconds") or 0)
        block = st.get("current_block") if isinstance(st.get("current_block"), dict) else {}
        block_name = str(block.get("name") or "-")

        sched = st.get("schedule_state") if isinstance(st.get("schedule_state"), dict) else {}
        total = int(sched.get("total_blocks") or 0)
        idx = int(sched.get("current_index") or 0)
        queue_line = f"Schedule: block {min(total, idx + 1)} of {total}" if total > 0 else "Schedule: -"

        self.status_var.set(f"Timer: {status} ({rem})")
        self.phase_var.set(f"Phase: {phase}")
        self.block_var.set(f"Block: {block_name}")
        self.queue_var.set(queue_line)
        self._refresh_timer_ring(st)
        if self.timer_start_stop_button:
            next_label = "Stop" if str(status).lower() in {"running", "paused"} else "Start Timer"
            try:
                self.timer_start_stop_button.configure(text=next_label)
            except Exception:
                pass
        if self.timer_pause_resume_button:
            pause_label = "Resume" if str(status).lower() == "paused" else "Pause"
            pause_state = tk.NORMAL if str(status).lower() in {"running", "paused"} else tk.DISABLED
            try:
                self.timer_pause_resume_button.configure(text=pause_label, state=pause_state)
            except Exception:
                pass
        if self.timer_profile_combo:
            profile_values = self._timer_profiles()
            try:
                self.timer_profile_combo.configure(values=profile_values)
            except Exception:
                pass
            active_profile = str(st.get("profile_name") or self.timer_profile_var.get() or self._default_profile()).strip()
            if active_profile in profile_values:
                self.timer_profile_var.set(active_profile)
            elif profile_values and not self.timer_profile_var.get():
                self.timer_profile_var.set(profile_values[0])
        if self.window and self.window.winfo_exists():
            self._refresh_status_controls()
        schedule_blocks = self._current_schedule_blocks()
        self._refresh_schedule_list(block_name if block_name != "-" else "")

        self._update_tray_icon(st)
        self._maybe_notify_pending_confirmation(st)
        self._maybe_notify_upcoming_schedule_events(schedule_blocks)
        self._maybe_notify_waiting_for_anchor(st)
        self._maybe_notify_start_day_reminder(schedule_blocks, st)
        self._maybe_notify_status_nudge()
        self._maybe_notify_due_soon()
        self._maybe_notify_yesterday_checkin()
        state_line = self._status_phase_time_line(status, phase, st.get("remaining_seconds"))
        if block_name and block_name != "-":
            short_block = (block_name[:48] + "...") if len(block_name) > 51 else block_name
            self.icon.title = f"Chronos\n{short_block}\n{state_line}"
        else:
            self.icon.title = f"Chronos\nNo active block\n{state_line}"
        self.icon.update_menu()

    def _update_tray_icon(self, st):
        status = str(st.get("status") or "idle").lower()
        if status in {"running", "paused"}:
            pct = self._timer_progress_percent(st)
            key = f"ring:{pct}"
            if key != self._last_icon_key:
                self.icon.icon = self._render_ring_icon(pct)
                self._last_icon_key = key
            return
        if self._last_icon_key != "base":
            self.icon.icon = self._base_icon
            self._last_icon_key = "base"

    def _maybe_notify_pending_confirmation(self, st):
        pending = st.get("pending_confirmation") if isinstance(st, dict) else None
        if not isinstance(pending, dict):
            self._last_pending_prompt_key = None
            self._close_pending_popup()
            return
        block = pending.get("block") if isinstance(pending.get("block"), dict) else {}
        block_name = str(block.get("name") or "this block").strip() or "this block"
        prompted_at = str(pending.get("prompted_at") or "").strip()
        key = f"{block_name}|{prompted_at}"
        if key == self._last_pending_prompt_key:
            return
        self._last_pending_prompt_key = key
        self._show_pending_popup(block_name, key)
        self._notify_event(
            "schedule_check_in",
            "Chronos Timer Check-In",
            f'Finished "{block_name}"? Open Chronos Mini to confirm.',
            severity="action_required",
            dedupe_key=f"checkin:{key}",
            cooldown_seconds=12 * 60 * 60,
            launch_uri=self._notification_action_uri("open_mini"),
            message_context={"block_name": block_name, "prompted_at": prompted_at},
        )

    def test_notifications(self):
        def _runner():
            samples = [
                {
                    "event_type": "schedule_check_in",
                    "title": "Chronos Timer Check-In",
                    "message": 'Finished "Sample Focus Block"? Open Chronos Mini to confirm.',
                    "severity": "action_required",
                    "dedupe_key": "demo:schedule_check_in",
                    "launch_uri": self._notification_action_uri("open_mini"),
                    "message_context": {"block_name": "Sample Focus Block", "prompted_at": "demo"},
                },
                (
                    "upcoming_anchor",
                    "Upcoming Anchor",
                    "Breakfast Anchor starts in 10 minutes.",
                    "attention",
                    "demo:upcoming_anchor",
                ),
                (
                    "bedtime_reminder",
                    "Bedtime Soon",
                    "Bedtime Anchor starts at 22:00.",
                    "attention",
                    "demo:bedtime_reminder",
                ),
                (
                    "status_nudge",
                    "Status Check",
                    "It's been a while since your last status update.",
                    "attention",
                    "demo:status_nudge",
                ),
                (
                    "due_soon",
                    "Due Soon",
                    "Finish taxes (TASK) Due in 1d. + 2 more",
                    "attention",
                    "demo:due_soon",
                ),
                (
                    "yesterday_checkin",
                    "Yesterday Check-In",
                    "Morning Review needs review for yesterday. + 2 more",
                    "attention",
                    "demo:yesterday_checkin",
                ),
            ]
            for sample in samples:
                if isinstance(sample, dict):
                    self._notify_event(
                        sample.get("event_type"),
                        sample.get("title"),
                        sample.get("message"),
                        severity=sample.get("severity"),
                        dedupe_key=sample.get("dedupe_key"),
                        cooldown_seconds=0,
                        force=True,
                        launch_uri=sample.get("launch_uri"),
                        message_context=sample.get("message_context"),
                    )
                else:
                    event_type, title, message, severity, dedupe_key = sample
                    self._notify_event(
                        event_type,
                        title,
                        message,
                        severity=severity,
                        dedupe_key=dedupe_key,
                        cooldown_seconds=0,
                        force=True,
                    )
                try:
                    threading.Event().wait(3.0)
                except Exception:
                    pass

        threading.Thread(target=_runner, daemon=True).start()

    def _tick(self):
        if self._quitting:
            return
        try:
            self._process_notification_actions()
            self.refresh_state()
        finally:
            self._tick_job = self.root.after(1000, self._tick)

    def run(self):
        self.icon.run_detached()
        self._tick_job = self.root.after(400, self._tick)
        self.root.mainloop()

    def request_quit(self, *args):
        # pystray callback thread -> marshal all Tk work onto UI thread.
        if self._quitting:
            return
        try:
            self.root.after(0, self.quit)
        except Exception:
            self.quit()

    def quit(self):
        if self._quitting:
            return
        self._quitting = True
        try:
            if self._tick_job:
                self.root.after_cancel(self._tick_job)
        except Exception:
            pass
        self._close_pending_popup()
        try:
            self.icon.visible = False
        except Exception:
            pass
        try:
            self.icon.stop()
        except Exception:
            pass
        _clear_pid_file()
        try:
            self.root.quit()
            self.root.destroy()
        except Exception:
            pass


def _read_pid_file():
    for path in (PID_PATH, LEGACY_PID_PATH):
        try:
            raw = path.read_text(encoding="utf-8").strip()
            return int(raw) if raw else None
        except Exception:
            continue
    return None


def _write_pid_file(pid):
    try:
        PID_DIR.mkdir(parents=True, exist_ok=True)
        PID_PATH.write_text(str(int(pid)), encoding="utf-8")
    except Exception:
        pass


def _clear_pid_file():
    for path in (PID_PATH, LEGACY_PID_PATH):
        try:
            if path.exists():
                path.unlink()
        except Exception:
            pass


def _pid_alive(pid):
    if not isinstance(pid, int) or pid <= 0:
        return False
    if os.name == "nt":
        try:
            proc = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
            )
            out = (proc.stdout or "").strip().lower()
            return bool(out) and (not out.startswith("info: no tasks")) and (str(pid) in out)
        except Exception:
            return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def main():
    existing = _read_pid_file()
    if existing and _pid_alive(existing):
        return
    _write_pid_file(os.getpid())
    app = ChronosTrayApp()
    app.run()


if __name__ == "__main__":
    main()
