import io
import os
import sys
import yaml
import json
import queue
import re
import base64
import threading
import socket
import tempfile
import secrets
import time
from datetime import datetime, timedelta
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote, quote, urlencode
from urllib import request as urlrequest, error as urlerror

import subprocess, shlex

# Paths
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# Ensure project root is importable so 'modules' can be imported
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
COMMANDS_DIR = os.path.abspath(os.path.join(ROOT_DIR, "commands"))
if COMMANDS_DIR not in sys.path:
    sys.path.insert(0, COMMANDS_DIR)
DASHBOARD_DIR = os.path.abspath(os.path.join(ROOT_DIR, "utilities", "dashboard"))

from modules.logger import Logger

from utilities.dashboard_matrix import (
    compute_matrix,
    get_metadata as matrix_metadata,
    parse_filters as parse_matrix_filters,
    parse_dimension_sequence as parse_matrix_dimensions,
    list_matrix_presets,
    load_matrix_preset,
    save_matrix_preset,
    delete_matrix_preset,
)
from modules.scheduler import schedule_path_for_date, status_current_path, build_block_key, get_flattened_schedule

# In-memory dashboard-scoped variables (exposed via /api/vars)
_DASH_VARS = {}
_LISTENER_PROC = None
_ADUC_PORT = 8080
_ADUC_LOG_PATH = os.path.join(tempfile.gettempdir(), "aduc_launch.log")
_ADUC_NO_BROWSER_FLAG = os.path.join(tempfile.gettempdir(), "ADUC", "no_browser.flag")
_ADUC_NO_BROWSER_FLAG_LOCAL = os.path.join(ROOT_DIR, "Agents Dress Up Committee", "temp", "no_browser.flag")
_LINK_SETTINGS_PATH = os.path.join(ROOT_DIR, "user", "settings", "link_settings.yml")
_TEMP_DIR = os.path.join(ROOT_DIR, "temp")
_LEGACY_TEMP_DIR = os.path.join(ROOT_DIR, "Temp")
_EDITOR_OPEN_REQUEST_PATH = os.path.join(_TEMP_DIR, "editor_open_request.json")
_TRICK_SESSION_STATE = {}
_TRICK_OPEN_REQUESTS = []
_TRICK_OPEN_LOCK = threading.Lock()
_TRICK_OPEN_SEQ = 0
_FILE_API_ALLOWED_ROOTS = [
    os.path.join(ROOT_DIR, "user"),
    os.path.join(ROOT_DIR, "Agents Dress Up Committee", "familiars", "nia"),
]
_EDITOR_API_ALLOWED_ROOTS = [
    os.path.join(ROOT_DIR, "user"),
    _TEMP_DIR,
]


def _aduc_proxy_request(path: str, method: str = "GET", payload: dict | None = None, timeout: float = 8.0):
    """Proxy a request to the local ADUC server and return (status, body_dict)."""
    host = "127.0.0.1"
    url = f"http://{host}:{_ADUC_PORT}{path}"
    headers = {"Accept": "application/json"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urlrequest.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urlrequest.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                body = json.loads(raw) if raw.strip() else {}
            except Exception:
                body = {"ok": False, "error": raw}
            return int(getattr(resp, "status", 200) or 200), body
    except urlerror.HTTPError as e:
        raw = ""
        try:
            raw = e.read().decode("utf-8", errors="replace")
        except Exception:
            raw = str(e)
        try:
            body = json.loads(raw) if raw.strip() else {"ok": False, "error": str(e)}
        except Exception:
            body = {"ok": False, "error": raw or str(e)}
        return int(getattr(e, "code", 502) or 502), body
    except Exception as e:
        return 502, {"ok": False, "error": f"ADUC request failed: {e}"}


def _path_within(base_dir: str, target_path: str) -> bool:
    try:
        base_real = os.path.normcase(os.path.realpath(base_dir))
        target_real = os.path.normcase(os.path.realpath(target_path))
        return os.path.commonpath([base_real, target_real]) == base_real
    except Exception:
        return False


def _resolve_file_api_target(path_value: str):
    rel = str(path_value or "").strip().replace("\\", "/")
    if not rel:
        return None, "Missing path"
    target = os.path.abspath(os.path.join(ROOT_DIR, rel))
    if not _path_within(ROOT_DIR, target):
        return None, "Forbidden"
    for allowed_root in _FILE_API_ALLOWED_ROOTS:
        if _path_within(allowed_root, target):
            return target, None
    return None, "Path is outside allowed file API roots"


def _resolve_editor_api_target(path_value: str):
    rel = str(path_value or "").strip().replace("\\", "/")
    if not rel:
        return None, "Missing path"
    target = os.path.abspath(os.path.join(ROOT_DIR, rel))
    if not _path_within(ROOT_DIR, target):
        return None, "Forbidden"
    for allowed_root in _EDITOR_API_ALLOWED_ROOTS:
        if _path_within(allowed_root, target):
            return target, None
    return None, "Path is outside allowed editor roots"


def _legacy_or_canonical_temp_path(filename: str) -> str:
    canonical = os.path.join(_TEMP_DIR, filename)
    legacy = os.path.join(_LEGACY_TEMP_DIR, filename)
    if os.path.exists(canonical):
        return canonical
    if os.path.exists(legacy):
        return legacy
    return canonical


def _trick_registry():
    from utilities import registry_builder
    return registry_builder.build_trick_registry(force=False)


def _trick_actor_key(actor):
    key = str(actor or "default").strip().lower()
    key = re.sub(r"[^a-z0-9_.-]+", "_", key)
    return key or "default"


def _trick_session(actor):
    key = _trick_actor_key(actor)
    state = _TRICK_SESSION_STATE.get(key)
    if not isinstance(state, dict):
        state = {
            "clipboard": "",
            "profile_select": "classic_pomodoro",
            "cycles_input": None,
            "auto_advance_checkbox": True,
            "bind_type_input": "",
            "bind_name_input": "",
            "today": {
                "environment_slider": 7,
                "category_slider": 6,
                "happiness_slider": 5,
                "due_date_slider": 4,
                "deadline_slider": 5,
                "status_slider": 3,
                "priority_slider": 2,
                "template_slider": 1,
                "custom_property_key_input": "",
                "custom_property_slider": 5,
                "balance_slider": 5,
                "enforcer_environment_scope_select": "day",
                "enforcer_environment_input": "",
                "enforcer_template_day_input": "",
                "enforcer_template_input": "",
                "schedule_state_select": "draft",
                "buffers_checkbox": True,
                "timer_breaks_checkbox": False,
                "sprints_checkbox": False,
                "ignore_trends_checkbox": False,
                "repair_trim_checkbox": True,
                "repair_cut_checkbox": False,
                "timer_profile_input": "",
                "template_override_input": "",
                "quickwins_input": None,
                "repair_min_duration_input": None,
                "repair_cut_threshold_input": None,
                "status_threshold_input": None,
                "preset_hint_text": "Safe: trim on, cut off, min 20m, threshold 0.85. Balanced: trim on, cut on, min 12m, threshold 0.60. Aggressive: trim on, cut on, min 8m, threshold 0.40.",
                "window_filter_row_count": 0,
                "calendar_context_visible": False,
                "calendar_day_label": "Calendar day selected.",
                "calendar_day_note": "",
                "selection_hint": "Select a day in Calendar to preview the schedule.",
                "status_text": "Ready.",
                "minimized": False,
                "closed": False,
            },
            "terminal": {
                "identity_text": "chronos@you",
                "input_field": "",
                "ghost_text": "",
                "expand_checkbox": True,
                "output_text": "",
                "status_text": "Ready.",
                "minimized": False,
                "closed": False,
            },
            "item_manager": {
                "type_select": "task",
                "search_input": "",
                "count_text": "0 items",
                "list_items": [],
                "item_name_input": "",
                "yaml_input": "",
                "status_text": "Ready.",
                "minimized": False,
                "closed": False,
            },
            "status_widget": {
                "values": {},
                "status_text": "Ready.",
                "minimized": False,
                "closed": False,
            },
            "goal_tracker": {
                "search_input": "",
                "goals": [],
                "selected_goal": None,
                "goal_title_text": "Select a goal",
                "goal_progress": 0,
                "goal_meta_text": "",
                "milestones_text": "",
                "status_text": "Ready.",
                "minimized": False,
                "closed": False,
            },
            "milestones_widget": {
                "search_input": "",
                "status_filter_select": "all",
                "project_filter_select": "all",
                "goal_filter_select": "all",
                "list_open": False,
                "milestones": [],
                "summary": {"total": 0, "completed": 0, "in_progress": 0},
                "status_text": "",
                "minimized": False,
                "closed": False,
            },
            "commitments_widget": {
                "search_input": "",
                "status_filter_select": "all",
                "list_open": False,
                "commitments": [],
                "summary": {"total": 0, "met": 0, "violations": 0},
                "status_text": "",
                "minimized": False,
                "closed": False,
            },
            "rewards_widget": {
                "search_input": "",
                "ready_only_checkbox": False,
                "list_open": False,
                "balance": 0,
                "history": [],
                "rewards": [],
                "status_text": "",
                "minimized": False,
                "closed": False,
            },
            "achievements_widget": {
                "search_input": "",
                "status_filter_select": "all",
                "title_select": "",
                "list_open": False,
                "achievements": [],
                "counts": {"total": 0, "awarded": 0, "pending": 0, "archived": 0},
                "current_title": "",
                "profile_progress": {"level": 1, "xp_total": 0, "xp_into_level": 0, "xp_to_next_level": 1000},
                "status_text": "",
                "minimized": False,
                "closed": False,
            },
            "habit_tracker": {
                "search_input": "",
                "polarity_select": "all",
                "habits": [],
                "summary_text": "",
                "status_text": "",
                "minimized": False,
                "closed": False,
            },
            "review_widget": {
                "type_select": "daily",
                "period_input": "",
                "expand_checkbox": True,
                "status_text": "",
                "log_text": "",
                "minimized": False,
                "closed": False,
            },
            "variables_widget": {
                "rows": {},
                "status_text": "",
                "minimized": False,
                "closed": False,
            },
            "resolution_tracker": {
                "items": [],
                "stats_text": "",
                "list_text": "",
                "status_text": "",
                "minimized": False,
                "closed": False,
            },
            "notes_widget": {
                "title_input": "",
                "format_select": "note",
                "preview_checkbox": False,
                "category_select": "",
                "priority_select": "",
                "tags_input": "",
                "path_hint_text": "",
                "content_input": "",
                "preview_text": "",
                "status_text": "",
                "minimized": False,
                "closed": False,
            },
            "inventory_manager_widget": {
                "search_input": "",
                "place_filter_select": "",
                "new_name_input": "",
                "new_places_input": "",
                "new_tags_input": "",
                "inventories": [],
                "selected_name": "",
                "selected_detail": "",
                "count_text": "",
                "status_text": "",
                "minimized": False,
                "closed": False,
            },
            "profile_widget": {
                "nickname_input": "",
                "title_select": "",
                "available_titles": [],
                "welcome_line1_input": "",
                "welcome_line2_input": "",
                "welcome_line3_input": "",
                "exit_line1_input": "",
                "exit_line2_input": "",
                "avatar_preview": "",
                "status_text": "Ready.",
                "minimized": False,
                "closed": False,
            },
            "settings_widget": {
                "file_select": "",
                "files": [],
                "form_mode_checkbox": True,
                "editor_input": "",
                "dynamic_content": "",
                "status_text": "Ready.",
                "minimized": False,
                "closed": False,
            },
            "sleep_settings_widget": {
                "mode_select": "monophasic",
                "splits_input": 3,
                "template_mode_select": "selected",
                "template_name_input": "Sleep Skeleton",
                "selected_templates": [],
                "available_templates": [],
                "blocks_text": "Core Sleep|22:00|06:00|mon,tue,wed,thu,fri,sat,sun",
                "chart_container": "Sleep total: 8h",
                "status_text": "Ready.",
                "minimized": False,
                "closed": False,
            },
            "link_widget": {
                "peer_input": "",
                "token_input": "",
                "board_select": "",
                "boards": [],
                "status_text": "offline",
                "peer_status_text": "unknown",
                "last_sync_text": "Last sync: never",
                "invite_text": "",
                "connected": False,
                "minimized": False,
                "closed": False,
            },
            "trends_widget": {
                "metrics_container": "Loading...",
                "status_text": "Ready.",
                "minimized": False,
                "closed": False,
            },
            "admin_widget": {
                "db_select": "",
                "dbs": [],
                "registry_select": "wizards",
                "status_text": "Ready.",
                "minimized": False,
                "closed": False,
            },
            "cockpit_minimap_widget": {
                "hint_text": "Open the Cockpit view to use the minimap.",
                "track_container": "",
                "minimized": False,
                "closed": False,
            },
            "debug_console_widget": {
                "filter_select": "all",
                "output_text": "",
                "status_text": "Ready.",
                "minimized": False,
                "closed": False,
            },
            "clock_widget": {
                "mode_select": "analog",
                "time_text": "",
                "date_text": "",
                "status_text": "Ready.",
                "minimized": False,
                "closed": False,
            },
            "journal_widget": {
                "type_filter_select": "all",
                "search_input": "",
                "entry_type_select": "journal_entry",
                "date_input": "",
                "title_input": "",
                "tags_input": "",
                "content_input": "",
                "list_text": "",
                "status_text": "Ready.",
                "selected_type": "",
                "selected_name": "",
                "minimized": False,
                "closed": False,
            },
            "mp3_player_widget": {
                "playlist_select": "",
                "status_text": "Ready.",
                "track_title_text": "",
                "track_artist_text": "",
                "library_text": "",
                "playlist_text": "",
                "is_playing": False,
                "minimized": False,
                "closed": False,
            },
            "sticky_notes_widget": {
                "new_content_input": "",
                "new_color_select": "amber",
                "notes_text": "",
                "status_text": "Ready.",
                "selected_note": "",
                "minimized": False,
                "closed": False,
            },
        }
        _TRICK_SESSION_STATE[key] = state
    return state


def _timer_status_safe():
    try:
        from modules.timer import main as Timer
        st = Timer.status() or {}
        return st if isinstance(st, dict) else {}
    except Exception:
        return {}


def _fmt_mmss(seconds):
    try:
        total = int(seconds or 0)
    except Exception:
        total = 0
    total = max(0, total)
    mm, ss = divmod(total, 60)
    return f"{mm:02d}:{ss:02d}"


def _trick_timer_elements(actor):
    sess = _trick_session(actor)
    st = _timer_status_safe()
    status_key = str(st.get("status") or "idle").lower()
    current_phase = str(st.get("current_phase") or "-")
    cycle_index = int(st.get("cycle_index") or 0)
    remaining = int(st.get("remaining_seconds") or 0)

    profile = st.get("profile") if isinstance(st.get("profile"), dict) else {}
    block = st.get("current_block") if isinstance(st.get("current_block"), dict) else {}
    sched = st.get("schedule_state") if isinstance(st.get("schedule_state"), dict) else {}
    pending = st.get("pending_confirmation") if isinstance(st.get("pending_confirmation"), dict) else {}

    total = 1
    mode = str(st.get("mode") or "").lower()
    if mode == "schedule" and block and block.get("minutes"):
        try:
            total = max(1, int(float(block.get("minutes")) * 60))
        except Exception:
            total = 1
    elif current_phase == "focus":
        total = max(1, int(profile.get("focus_minutes") or 25) * 60)
    elif current_phase == "short_break":
        total = max(1, int(profile.get("short_break_minutes") or 5) * 60)
    elif current_phase == "long_break":
        total = max(1, int(profile.get("long_break_minutes") or 15) * 60)
    pct = max(0, min(100, int(round(((total - remaining) / total) * 100))))

    block_text = ""
    if block:
        block_text = f"Block: {block.get('name') or 'Block'} ({block.get('minutes') or '?'}m)"

    queue_text = ""
    plan = sched.get("plan") if isinstance(sched.get("plan"), dict) else {}
    total_blocks = int(sched.get("total_blocks") or (len(plan.get("blocks") or []) if isinstance(plan.get("blocks"), list) else 0))
    current_idx = int(sched.get("current_index") or 0)
    if total_blocks > 0:
        queue_text = f"Schedule: block {min(total_blocks, current_idx + 1)} of {total_blocks}"

    waiting_anchor = bool(st.get("waiting_for_anchor_start"))
    has_pending = bool(pending and isinstance(pending.get("block"), dict))
    has_target = bool(block) and not waiting_anchor
    banner_visible = has_pending or has_target or (waiting_anchor and bool(block))

    confirmation_text = "No active schedule block right now."
    if has_pending:
        blk = pending.get("block") if isinstance(pending.get("block"), dict) else {}
        confirmation_text = f"Finished \"{blk.get('name') or 'this block'}\"?"
    elif waiting_anchor and block:
        confirmation_text = f"Waiting for anchor \"{block.get('name') or 'block'}\""
    elif has_target and block:
        confirmation_text = f"Block \"{block.get('name') or 'current block'}\" actions"

    run_state = status_key in {"running", "paused"}
    is_paused = status_key == "paused"

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    return {
        "widget.timer.title": _mk("Timer"),
        "widget.timer.minimize_button": _mk("_"),
        "widget.timer.close_button": _mk("x"),
        "widget.timer.phase_text": _mk(f"Phase: {current_phase}"),
        "widget.timer.cycle_text": _mk(f"Cycle: {cycle_index}"),
        "widget.timer.status_text": _mk(f"Status: {status_key}"),
        "widget.timer.clock_text": _mk(_fmt_mmss(remaining)),
        "widget.timer.progress_text": _mk(f"{pct}% elapsed"),
        "widget.timer.block_text": _mk(block_text, visible=bool(block_text)),
        "widget.timer.queue_text": _mk(queue_text, visible=bool(queue_text)),
        "widget.timer.confirmation_banner": _mk("visible" if banner_visible else "hidden", visible=banner_visible),
        "widget.timer.confirmation_text": _mk(confirmation_text, visible=banner_visible),
        "widget.timer.confirm_yes_button": _mk("Yes", visible=banner_visible, enabled=has_target),
        "widget.timer.confirm_skip_today_button": _mk("Skip Today", visible=banner_visible, enabled=has_target),
        "widget.timer.confirm_later_button": _mk("Later", visible=banner_visible, enabled=has_target),
        "widget.timer.confirm_start_over_button": _mk("Start Over", visible=banner_visible, enabled=has_target),
        "widget.timer.confirm_stretch_button": _mk("Stretch", visible=banner_visible, enabled=has_target),
        "widget.timer.profile_select": _mk(sess.get("profile_select") or "classic_pomodoro"),
        "widget.timer.cycles_input": _mk(sess.get("cycles_input")),
        "widget.timer.auto_advance_checkbox": _mk(bool(sess.get("auto_advance_checkbox", True))),
        "widget.timer.bind_type_input": _mk(sess.get("bind_type_input") or ""),
        "widget.timer.bind_name_input": _mk(sess.get("bind_name_input") or ""),
        "widget.timer.start_button": _mk("Stop" if run_state else "Start"),
        "widget.timer.start_day_button": _mk("Start Day"),
        "widget.timer.pause_resume_button": _mk("Resume" if is_paused else "Pause", enabled=run_state),
        "widget.timer.cancel_button": _mk("Cancel", enabled=run_state),
        "widget.timer.refresh_button": _mk("Refresh"),
    }


def _trick_today_session(actor):
    session = _trick_session(actor)
    today = session.get("today")
    if not isinstance(today, dict):
        today = {}
        session["today"] = today
    return today


def _trick_today_apply_preset(today, preset_name):
    preset = str(preset_name or "").strip().lower()
    if preset == "safe":
        today["repair_trim_checkbox"] = True
        today["repair_cut_checkbox"] = False
        today["repair_min_duration_input"] = 20
        today["repair_cut_threshold_input"] = 0.85
    elif preset == "balanced":
        today["repair_trim_checkbox"] = True
        today["repair_cut_checkbox"] = True
        today["repair_min_duration_input"] = 12
        today["repair_cut_threshold_input"] = 0.60
    elif preset == "aggressive":
        today["repair_trim_checkbox"] = True
        today["repair_cut_checkbox"] = True
        today["repair_min_duration_input"] = 8
        today["repair_cut_threshold_input"] = 0.40
    return preset


def _trick_today_run(action_args, props=None):
    ok, out, err = run_console_command("today", action_args, props or {})
    return ok, out, err


def _trick_today_props(today):
    props = {}
    props["buffers"] = bool(today.get("buffers_checkbox", True))
    props["breaks"] = "timer" if bool(today.get("timer_breaks_checkbox")) else "none"
    props["sprints"] = bool(today.get("sprints_checkbox"))
    props["ignore-trends"] = bool(today.get("ignore_trends_checkbox"))
    props["repair-trim"] = bool(today.get("repair_trim_checkbox", True))
    props["repair-cut"] = bool(today.get("repair_cut_checkbox"))
    custom_key = str(today.get("custom_property_key_input") or "").strip()
    if custom_key:
        props["custom_property"] = custom_key
        try:
            weight = int(today.get("custom_property_slider") or 0)
        except Exception:
            weight = 0
        if weight > 0:
            props["prioritize"] = f"custom_property={weight}"
    for key, prop_name, caster in [
        ("timer_profile_input", "timer_profile", str),
        ("template_override_input", "template", str),
        ("quickwins_input", "quickwins", int),
        ("repair_min_duration_input", "repair-min-duration", int),
        ("repair_cut_threshold_input", "repair-cut-threshold", float),
        ("status_threshold_input", "status-threshold", float),
    ]:
        raw = today.get(key)
        if raw in (None, ""):
            continue
        try:
            value = caster(raw)
        except Exception:
            continue
        if prop_name == "status-threshold":
            value = max(0.0, min(1.0, float(value)))
        props[prop_name] = value
    return props


def _trick_today_elements(actor):
    today = _trick_today_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(today.get("closed"))
    visible = not closed
    minimized = bool(today.get("minimized"))
    calendar_visible = bool(today.get("calendar_context_visible"))
    row_count = max(0, int(today.get("window_filter_row_count") or 0))

    elements = {
        "widget.today.title": _mk("Scheduler", visible=visible),
        "widget.today.minimize_button": _mk("−", visible=visible),
        "widget.today.close_button": _mk("×", visible=visible),
        "widget.today.refresh_button": _mk("↻ Refresh", visible=visible and not minimized),
        "widget.today.reschedule_button": _mk("📅 Generate / Reschedule", visible=visible and not minimized),
        "widget.today.scheduling_controls": _mk("Scheduling Controls", visible=visible and not minimized),
        "widget.today.priority_weights_section": _mk("Priority Weights (1-10)", visible=visible and not minimized),
        "widget.today.advanced_weights_section": _mk("Advanced Weights", visible=visible and not minimized),
        "widget.today.enforcers_section": _mk("Enforcers", visible=visible and not minimized),
        "widget.today.quick_toggles_section": _mk("Quick Toggles", visible=visible and not minimized),
        "widget.today.environment_slider": _mk(today.get("environment_slider"), visible=visible and not minimized),
        "widget.today.category_slider": _mk(today.get("category_slider"), visible=visible and not minimized),
        "widget.today.happiness_slider": _mk(today.get("happiness_slider"), visible=visible and not minimized),
        "widget.today.due_date_slider": _mk(today.get("due_date_slider"), visible=visible and not minimized),
        "widget.today.deadline_slider": _mk(today.get("deadline_slider"), visible=visible and not minimized),
        "widget.today.status_slider": _mk(today.get("status_slider"), visible=visible and not minimized),
        "widget.today.priority_slider": _mk(today.get("priority_slider"), visible=visible and not minimized),
        "widget.today.template_slider": _mk(today.get("template_slider"), visible=visible and not minimized),
        "widget.today.custom_property_key_input": _mk(today.get("custom_property_key_input") or "", visible=visible and not minimized),
        "widget.today.custom_property_slider": _mk(today.get("custom_property_slider"), visible=visible and not minimized),
        "widget.today.balance_slider": _mk(today.get("balance_slider"), visible=visible and not minimized),
        "widget.today.enforcer_environment_scope_select": _mk(today.get("enforcer_environment_scope_select") or "day", visible=visible and not minimized),
        "widget.today.enforcer_environment_input": _mk(today.get("enforcer_environment_input") or "", visible=visible and not minimized),
        "widget.today.enforcer_template_day_input": _mk(today.get("enforcer_template_day_input") or "", visible=visible and not minimized),
        "widget.today.enforcer_template_input": _mk(today.get("enforcer_template_input") or "", visible=visible and not minimized),
        "widget.today.schedule_state_select": _mk(today.get("schedule_state_select") or "draft", visible=visible and not minimized),
        "widget.today.buffers_checkbox": _mk(bool(today.get("buffers_checkbox", True)), visible=visible and not minimized),
        "widget.today.timer_breaks_checkbox": _mk(bool(today.get("timer_breaks_checkbox")), visible=visible and not minimized),
        "widget.today.sprints_checkbox": _mk(bool(today.get("sprints_checkbox")), visible=visible and not minimized),
        "widget.today.ignore_trends_checkbox": _mk(bool(today.get("ignore_trends_checkbox")), visible=visible and not minimized),
        "widget.today.repair_trim_checkbox": _mk(bool(today.get("repair_trim_checkbox", True)), visible=visible and not minimized),
        "widget.today.repair_cut_checkbox": _mk(bool(today.get("repair_cut_checkbox")), visible=visible and not minimized),
        "widget.today.timer_profile_input": _mk(today.get("timer_profile_input") or "", visible=visible and not minimized),
        "widget.today.template_override_input": _mk(today.get("template_override_input") or "", visible=visible and not minimized),
        "widget.today.quickwins_input": _mk(today.get("quickwins_input"), visible=visible and not minimized),
        "widget.today.repair_min_duration_input": _mk(today.get("repair_min_duration_input"), visible=visible and not minimized),
        "widget.today.repair_cut_threshold_input": _mk(today.get("repair_cut_threshold_input"), visible=visible and not minimized),
        "widget.today.status_threshold_input": _mk(today.get("status_threshold_input"), visible=visible and not minimized),
        "widget.today.preset_safe_button": _mk("Safe", visible=visible and not minimized),
        "widget.today.preset_balanced_button": _mk("Balanced", visible=visible and not minimized),
        "widget.today.preset_aggressive_button": _mk("Aggressive", visible=visible and not minimized),
        "widget.today.preset_hint_text": _mk(today.get("preset_hint_text") or "", visible=visible and not minimized),
        "widget.today.window_filter_rows": _mk(row_count, visible=visible and not minimized),
        "widget.today.add_window_filter_row_button": _mk("+ Add Override", visible=visible and not minimized),
        "widget.today.calendar_context": _mk("visible" if calendar_visible else "hidden", visible=visible and calendar_visible and not minimized),
        "widget.today.calendar_day_label": _mk(today.get("calendar_day_label") or "Calendar day selected.", visible=visible and calendar_visible and not minimized),
        "widget.today.calendar_day_note": _mk(today.get("calendar_day_note") or "", visible=visible and calendar_visible and not minimized),
        "widget.today.status_text": _mk(today.get("status_text") or "Ready.", visible=visible and not minimized),
        "widget.today.selection_hint": _mk(today.get("selection_hint") or "", visible=visible and not minimized),
    }

    slider_to_value = {
        "widget.today.environment_slider": "widget.today.environment_value",
        "widget.today.category_slider": "widget.today.category_value",
        "widget.today.happiness_slider": "widget.today.happiness_value",
        "widget.today.due_date_slider": "widget.today.due_date_value",
        "widget.today.deadline_slider": "widget.today.deadline_value",
        "widget.today.status_slider": "widget.today.status_value",
        "widget.today.priority_slider": "widget.today.priority_value",
        "widget.today.template_slider": "widget.today.template_value",
        "widget.today.custom_property_slider": "widget.today.custom_property_value",
        "widget.today.balance_slider": "widget.today.balance_value",
    }
    for slider_id, value_id in slider_to_value.items():
        payload = elements.get(slider_id, {})
        elements[value_id] = _mk(payload.get("value"), visible=payload.get("visible", False))
    return elements


def _trick_terminal_session(actor):
    session = _trick_session(actor)
    terminal = session.get("terminal")
    if not isinstance(terminal, dict):
        terminal = {}
        session["terminal"] = terminal
    return terminal


def _trick_terminal_run_command(actor):
    terminal = _trick_terminal_session(actor)
    line = str(terminal.get("input_field") or "").strip()
    if not line:
        terminal["status_text"] = "Ready."
        return True, {"stdout": "", "stderr": "", "mode": "noop"}, None

    terminal["output_text"] = f"{terminal.get('identity_text') or 'chronos@you'}> {line}\n"
    terminal["status_text"] = "Running..."

    if line.lower() in {"cls", "clear"}:
        terminal["output_text"] = ""
        terminal["status_text"] = "Cleared."
        terminal["input_field"] = ""
        return True, {"stdout": "", "stderr": "", "mode": "clear"}, None

    try:
        parts = shlex.split(line)
    except Exception as e:
        terminal["output_text"] += f"{e}\n"
        terminal["status_text"] = "Command failed."
        return False, {"stdout": "", "stderr": str(e), "mode": "parse"}, str(e)

    if not parts:
        terminal["status_text"] = "Ready."
        return True, {"stdout": "", "stderr": "", "mode": "noop"}, None

    cmd = str(parts[0] or "").strip()
    args = list(parts[1:])
    if cmd.lower() == "vars":
        try:
            data = load_runtime_vars() or {}
            text = json.dumps(data, indent=2, ensure_ascii=True)
            terminal["output_text"] += text + ("\n" if text else "")
            terminal["status_text"] = "Variables loaded."
            terminal["input_field"] = ""
            return True, {"stdout": text, "stderr": "", "mode": "vars"}, None
        except Exception as e:
            terminal["output_text"] += f"{e}\n"
            terminal["status_text"] = "Command failed."
            terminal["input_field"] = ""
            return False, {"stdout": "", "stderr": str(e), "mode": "vars"}, str(e)

    from utilities import registry_builder
    registry = registry_builder.build_command_registry()
    commands = registry.get("commands") if isinstance(registry, dict) else {}
    aliases = registry.get("aliases") if isinstance(registry, dict) else {}
    resolved = aliases.get(cmd, cmd)
    is_cli = resolved in commands

    if is_cli:
        ok, out, err = run_console_command(cmd, args)
        if out:
            terminal["output_text"] += str(out).rstrip() + "\n"
        if err:
            terminal["output_text"] += str(err).rstrip() + "\n"
        terminal["status_text"] = "Command completed." if ok else "Command failed."
        terminal["input_field"] = ""
        return ok, {"stdout": out, "stderr": err, "mode": "cli"}, None if ok else (err or out or "CLI command failed")

    proc = subprocess.run(
        line,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    out = proc.stdout or ""
    err = proc.stderr or ""
    if out:
        terminal["output_text"] += out.rstrip() + "\n"
    if err:
        terminal["output_text"] += err.rstrip() + "\n"
    terminal["status_text"] = "Command completed." if proc.returncode == 0 else "Command failed."
    terminal["input_field"] = ""
    return proc.returncode == 0, {
        "stdout": out,
        "stderr": err,
        "code": proc.returncode,
        "mode": "shell",
    }, None if proc.returncode == 0 else (err or out or "Shell command failed")


def _trick_terminal_elements(actor):
    terminal = _trick_terminal_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(terminal.get("closed"))
    visible = not closed
    minimized = bool(terminal.get("minimized"))
    body_visible = visible and not minimized

    return {
        "widget.terminal.title": _mk("Terminal", visible=visible),
        "widget.terminal.copy_button": _mk("C", visible=visible),
        "widget.terminal.minimize_button": _mk("_", visible=visible),
        "widget.terminal.close_button": _mk("x", visible=visible),
        "widget.terminal.output_text": _mk(terminal.get("output_text") or "", visible=body_visible),
        "widget.terminal.identity_text": _mk(terminal.get("identity_text") or "chronos@you", visible=body_visible),
        "widget.terminal.input_field": _mk(terminal.get("input_field") or "", visible=body_visible),
        "widget.terminal.ghost_text": _mk(terminal.get("ghost_text") or "", visible=body_visible),
        "widget.terminal.run_button": _mk("Run", visible=body_visible),
        "widget.terminal.expand_checkbox": _mk(bool(terminal.get("expand_checkbox", True)), visible=body_visible),
        "widget.terminal.status_text": _mk(terminal.get("status_text") or "Ready.", visible=visible),
    }


def _trick_item_manager_session(actor):
    session = _trick_session(actor)
    item_manager = session.get("item_manager")
    if not isinstance(item_manager, dict):
        item_manager = {}
        session["item_manager"] = item_manager
    return item_manager


def _trick_item_manager_refresh(actor):
    item_manager = _trick_item_manager_session(actor)
    item_type = str(item_manager.get("type_select") or "task").strip() or "task"
    query = str(item_manager.get("search_input") or "").strip()
    qs = urlencode({"type": item_type, "q": query})
    origin = "http://127.0.0.1:7357"
    try:
        with urlrequest.urlopen(f"{origin}/api/items?{qs}", timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as e:
        item_manager["status_text"] = "Load failed."
        return False, {"items": [], "error": str(e)}, str(e)

    rows = payload.get("items") if isinstance(payload, dict) else []
    norm = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        norm.append({
            "name": str(row.get("name") or "").strip(),
            "type": str(row.get("type") or item_type).strip(),
            "status": str(row.get("status") or "").strip(),
            "priority": str(row.get("priority") or "").strip(),
            "category": str(row.get("category") or "").strip(),
        })
    item_manager["list_items"] = norm
    item_manager["count_text"] = f"{len(norm)} items"
    item_manager["status_text"] = f"Loaded {len(norm)} items."
    return True, {"items": norm, "count": len(norm)}, None


def _trick_item_manager_load_item(actor, name=None):
    item_manager = _trick_item_manager_session(actor)
    item_type = str(item_manager.get("type_select") or "task").strip() or "task"
    item_name = str(name or item_manager.get("item_name_input") or "").strip()
    if not item_name:
        item_manager["status_text"] = "Load failed."
        return False, {"error": "Missing item name"}, "Missing item name"
    qs = urlencode({"type": item_type, "name": item_name})
    origin = "http://127.0.0.1:7357"
    try:
        with urlrequest.urlopen(f"{origin}/api/item?{qs}", timeout=10) as resp:
            text = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        item_manager["status_text"] = "Load failed."
        return False, {"error": str(e)}, str(e)

    try:
        payload = json.loads(text)
        raw = payload.get("content") or payload.get("item") or payload.get("text") or ""
        if isinstance(raw, dict):
            text = yaml.safe_dump(raw, sort_keys=False, allow_unicode=False)
        else:
            text = str(raw or "")
    except Exception:
        pass

    item_manager["item_name_input"] = item_name
    item_manager["yaml_input"] = text
    item_manager["status_text"] = f'Loaded "{item_name}".'
    return True, {"name": item_name, "content": text}, None


def _trick_item_manager_save(actor):
    item_manager = _trick_item_manager_session(actor)
    item_type = str(item_manager.get("type_select") or "task").strip() or "task"
    item_name = str(item_manager.get("item_name_input") or "").strip()
    if not item_name:
        item_manager["status_text"] = "Save failed."
        return False, {"error": "Name required"}, "Name required"
    body = json.dumps({
        "type": item_type,
        "name": item_name,
        "content": str(item_manager.get("yaml_input") or ""),
    }).encode("utf-8")
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/item",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        item_manager["status_text"] = "Save failed."
        return False, {"error": str(e)}, str(e)
    if payload.get("ok") is False:
        msg = payload.get("error") or "Save failed"
        item_manager["status_text"] = "Save failed."
        return False, payload, msg
    item_manager["status_text"] = f'Saved "{item_name}".'
    return True, payload, None


def _trick_item_manager_post(action_path, payload):
    body = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(
        f"http://127.0.0.1:7357{action_path}",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urlrequest.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    return data


def _trick_item_manager_elements(actor):
    item_manager = _trick_item_manager_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(item_manager.get("closed"))
    visible = not closed
    minimized = bool(item_manager.get("minimized"))
    body_visible = visible and not minimized
    list_items = item_manager.get("list_items") if isinstance(item_manager.get("list_items"), list) else []
    list_text = "\n".join(str(row.get("name") or "").strip() for row in list_items if isinstance(row, dict))

    return {
        "widget.item_manager.title": _mk("Item Manager", visible=visible),
        "widget.item_manager.minimize_button": _mk("_", visible=visible),
        "widget.item_manager.close_button": _mk("x", visible=visible),
        "widget.item_manager.type_select": _mk(item_manager.get("type_select") or "task", visible=body_visible),
        "widget.item_manager.search_input": _mk(item_manager.get("search_input") or "", visible=body_visible),
        "widget.item_manager.search_button": _mk("Search", visible=body_visible),
        "widget.item_manager.refresh_button": _mk("Refresh", visible=body_visible),
        "widget.item_manager.new_button": _mk("New", visible=body_visible),
        "widget.item_manager.count_text": _mk(item_manager.get("count_text") or "0 items", visible=body_visible),
        "widget.item_manager.list_container": _mk(list_text, visible=body_visible),
        "widget.item_manager.item_name_input": _mk(item_manager.get("item_name_input") or "", visible=body_visible),
        "widget.item_manager.yaml_input": _mk(item_manager.get("yaml_input") or "", visible=body_visible),
        "widget.item_manager.save_button": _mk("Save", visible=body_visible),
        "widget.item_manager.copy_button": _mk("Copy", visible=body_visible),
        "widget.item_manager.rename_button": _mk("Rename", visible=body_visible),
        "widget.item_manager.delete_button": _mk("Delete", visible=body_visible),
        "widget.item_manager.status_text": _mk(item_manager.get("status_text") or "Ready.", visible=visible),
    }


def _trick_status_session(actor):
    session = _trick_session(actor)
    status_widget = session.get("status_widget")
    if not isinstance(status_widget, dict):
        status_widget = {}
        session["status_widget"] = status_widget
    return status_widget


def _trick_status_refresh(actor):
    status_widget = _trick_status_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/status/current", timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        status_widget["status_text"] = "Status load failed."
        return False, {"error": str(e)}, str(e)
    raw = payload.get("status") if isinstance(payload, dict) else {}
    if not isinstance(raw, dict):
        raw = {}
    norm = {}
    for key, value in raw.items():
        slug = re.sub(r"\s+", "_", str(key or "").strip().lower())
        if slug:
            norm[slug] = value
    status_widget["values"] = norm
    status_widget["status_text"] = "Status loaded."
    return True, {"values": norm}, None


def _trick_status_update(actor):
    status_widget = _trick_status_session(actor)
    values = status_widget.get("values") if isinstance(status_widget.get("values"), dict) else {}
    lines = []
    for key, value in values.items():
        if value not in (None, ""):
            lines.append(f"{key}: {value}")
    body = "\n".join(lines).encode("utf-8")
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/status/update",
        data=body,
        method="POST",
        headers={"Content-Type": "text/yaml"},
    )
    try:
        with urlrequest.urlopen(req, timeout=10) as resp:
            ok = getattr(resp, "status", 200) < 400
    except Exception as e:
        status_widget["status_text"] = "Status update failed."
        return False, {"error": str(e)}, str(e)
    status_widget["status_text"] = "Status updated." if ok else "Status update failed."
    return ok, {"values": values}, None if ok else "Status update failed."


def _trick_status_elements(actor):
    status_widget = _trick_status_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(status_widget.get("closed"))
    visible = not closed
    minimized = bool(status_widget.get("minimized"))
    body_visible = visible and not minimized
    values = status_widget.get("values") if isinstance(status_widget.get("values"), dict) else {}
    fields_text = "\n".join(f"{k}: {v}" for k, v in values.items())

    return {
        "widget.status.title": _mk("Status Station", visible=visible),
        "widget.status.minimize_button": _mk("_", visible=visible),
        "widget.status.close_button": _mk("x", visible=visible),
        "widget.status.fields_container": _mk(fields_text, visible=body_visible),
        "widget.status.update_button": _mk("Update", visible=body_visible),
        "widget.status.status_text": _mk(status_widget.get("status_text") or "Ready.", visible=visible),
    }


def _trick_parse_status_text(text):
    out = {}
    for raw in str(text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw.strip()
        if not line or ":" not in line:
            continue
        key, value = line.split(":", 1)
        slug = re.sub(r"\s+", "_", str(key or "").strip().lower())
        if slug:
            out[slug] = value.strip()
    return out


def _trick_goal_tracker_session(actor):
    session = _trick_session(actor)
    goal_tracker = session.get("goal_tracker")
    if not isinstance(goal_tracker, dict):
        goal_tracker = {}
        session["goal_tracker"] = goal_tracker
    return goal_tracker


def _trick_goal_tracker_refresh(actor):
    goal_tracker = _trick_goal_tracker_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/goals", timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        goal_tracker["status_text"] = "Goal load failed."
        return False, {"error": str(e)}, str(e)
    goals = payload.get("goals") if isinstance(payload, dict) else []
    query = str(goal_tracker.get("search_input") or "").strip().lower()
    norm = []
    for row in goals if isinstance(goals, list) else []:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or "").strip()
        if query and query not in name.lower():
            continue
        norm.append({
            "name": name,
            "overall": int(row.get("overall") or 0),
            "priority": str(row.get("priority") or "").strip(),
            "due_date": str(row.get("due_date") or "").strip(),
            "status": str(row.get("status") or "").strip(),
        })
    norm.sort(key=lambda x: x.get("overall", 0), reverse=True)
    goal_tracker["goals"] = norm
    goal_tracker["status_text"] = f"Loaded {len(norm)} goals."
    return True, {"goals": norm, "count": len(norm)}, None


def _trick_goal_tracker_select(actor, goal_name=None):
    goal_tracker = _trick_goal_tracker_session(actor)
    name = str(goal_name or goal_tracker.get("selected_goal") or "").strip()
    if not name:
        goals = goal_tracker.get("goals") if isinstance(goal_tracker.get("goals"), list) else []
        if goals:
            name = str(goals[0].get("name") or "").strip()
    if not name:
        goal_tracker["status_text"] = "No goal selected."
        return False, {"error": "No goal selected"}, "No goal selected"
    try:
        with urlrequest.urlopen(f"http://127.0.0.1:7357/api/goal?name={quote(name)}", timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        goal_tracker["status_text"] = "Goal load failed."
        return False, {"error": str(e)}, str(e)
    goal = payload.get("goal") if isinstance(payload, dict) else {}
    if not isinstance(goal, dict) or not goal.get("name"):
        goal_tracker["status_text"] = "Goal load failed."
        return False, {"error": "Goal not found"}, "Goal not found"
    goal_tracker["selected_goal"] = str(goal.get("name") or "").strip()
    goal_tracker["goal_title_text"] = goal_tracker["selected_goal"]
    goal_tracker["goal_progress"] = int(goal.get("overall") or 0)
    meta = []
    if goal.get("priority"):
        meta.append(f"Priority: {goal.get('priority')}")
    if goal.get("due_date"):
        meta.append(f"Due: {goal.get('due_date')}")
    if goal.get("status"):
        meta.append(f"Status: {goal.get('status')}")
    goal_tracker["goal_meta_text"] = "  •  ".join(meta)
    milestones = goal.get("milestones") if isinstance(goal.get("milestones"), list) else []
    lines = []
    for milestone in milestones:
        if not isinstance(milestone, dict):
            continue
        pct = round((milestone.get("progress") or {}).get("percent") or 0)
        lines.append(f"{milestone.get('name')}: {pct}% [{milestone.get('status') or 'unknown'}]")
    goal_tracker["milestones_text"] = "\n".join(lines) if lines else "No milestones defined for this goal."
    goal_tracker["status_text"] = f'Loaded "{goal_tracker["selected_goal"]}".'
    return True, {"goal": goal}, None


def _trick_goal_tracker_recalc(actor):
    goal_tracker = _trick_goal_tracker_session(actor)
    req = urlrequest.Request("http://127.0.0.1:7357/api/milestone/recalc", data=b"", method="POST")
    try:
        with urlrequest.urlopen(req, timeout=10) as resp:
            _ = resp.read()
    except Exception as e:
        goal_tracker["status_text"] = "Recalc failed."
        return False, {"error": str(e)}, str(e)
    goal_tracker["status_text"] = "Milestones recalculated."
    _trick_goal_tracker_refresh(actor)
    if goal_tracker.get("selected_goal"):
        _trick_goal_tracker_select(actor, goal_tracker.get("selected_goal"))
    return True, {"recalculated": True}, None


def _trick_goal_tracker_primary_milestone(goal):
    milestones = goal.get("milestones") if isinstance(goal, dict) else []
    for milestone in milestones if isinstance(milestones, list) else []:
        if isinstance(milestone, dict) and milestone.get("name"):
            return milestone
    return None


def _trick_goal_tracker_complete_primary(actor):
    goal_tracker = _trick_goal_tracker_session(actor)
    ok, payload, err = _trick_goal_tracker_select(actor, goal_tracker.get("selected_goal"))
    if not ok:
        return False, payload, err
    goal = payload.get("goal") if isinstance(payload, dict) else {}
    milestone = _trick_goal_tracker_primary_milestone(goal)
    if not milestone:
        goal_tracker["status_text"] = "No milestone available."
        return False, {"error": "No milestone available"}, "No milestone available"
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/milestone/complete",
        data=json.dumps({"name": milestone.get("name")}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=10) as resp:
            _ = resp.read()
    except Exception as e:
        goal_tracker["status_text"] = "Milestone completion failed."
        return False, {"error": str(e)}, str(e)
    goal_tracker["status_text"] = f'Completed milestone "{milestone.get("name")}".'
    _trick_goal_tracker_select(actor, goal_tracker.get("selected_goal"))
    return True, {"milestone": milestone.get("name")}, None


def _trick_goal_tracker_focus_primary(actor):
    goal_tracker = _trick_goal_tracker_session(actor)
    ok, payload, err = _trick_goal_tracker_select(actor, goal_tracker.get("selected_goal"))
    if not ok:
        return False, payload, err
    goal = payload.get("goal") if isinstance(payload, dict) else {}
    milestone = _trick_goal_tracker_primary_milestone(goal)
    if not milestone:
        goal_tracker["status_text"] = "No milestone available."
        return False, {"error": "No milestone available"}, "No milestone available"
    link = {}
    links = milestone.get("links")
    if isinstance(links, list) and links:
        first = links[0]
        if isinstance(first, dict):
            link = first
    if not link.get("type") or not link.get("name"):
        goal_tracker["status_text"] = "No linked item to bind."
        return False, {"error": "No linked item to bind"}, "No linked item to bind"
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/timer/start",
        data=json.dumps({"profile": "classic_pomodoro", "bind_type": link.get("type"), "bind_name": link.get("name")}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=10) as resp:
            _ = resp.read()
    except Exception as e:
        goal_tracker["status_text"] = "Focus start failed."
        return False, {"error": str(e)}, str(e)
    goal_tracker["status_text"] = f'Started focus for "{milestone.get("name")}".'
    return True, {"milestone": milestone.get("name")}, None


def _trick_goal_tracker_elements(actor):
    goal_tracker = _trick_goal_tracker_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(goal_tracker.get("closed"))
    visible = not closed
    minimized = bool(goal_tracker.get("minimized"))
    body_visible = visible and not minimized
    goals = goal_tracker.get("goals") if isinstance(goal_tracker.get("goals"), list) else []
    goal_list_text = "\n".join(f"{g.get('name')}: {g.get('overall')}%" for g in goals if isinstance(g, dict))

    return {
        "widget.goal_tracker.title": _mk("Goals", visible=visible),
        "widget.goal_tracker.minimize_button": _mk("_", visible=visible),
        "widget.goal_tracker.close_button": _mk("x", visible=visible),
        "widget.goal_tracker.search_input": _mk(goal_tracker.get("search_input") or "", visible=body_visible),
        "widget.goal_tracker.search_button": _mk("Search", visible=body_visible),
        "widget.goal_tracker.recalc_button": _mk("Recalc", visible=body_visible),
        "widget.goal_tracker.refresh_button": _mk("Refresh", visible=body_visible),
        "widget.goal_tracker.list_container": _mk(goal_list_text, visible=body_visible),
        "widget.goal_tracker.goal_list": _mk(goal_list_text, visible=body_visible),
        "widget.goal_tracker.goal_title_text": _mk(goal_tracker.get("goal_title_text") or "Select a goal", visible=body_visible),
        "widget.goal_tracker.goal_progress_bar": _mk(goal_tracker.get("goal_progress") or 0, visible=body_visible),
        "widget.goal_tracker.goal_meta_text": _mk(goal_tracker.get("goal_meta_text") or "", visible=body_visible),
        "widget.goal_tracker.complete_primary_button": _mk("Complete Primary", visible=body_visible),
        "widget.goal_tracker.focus_primary_button": _mk("Focus Primary", visible=body_visible),
        "widget.goal_tracker.milestones_container": _mk(goal_tracker.get("milestones_text") or "", visible=body_visible),
        "widget.goal_tracker.status_text": _mk(goal_tracker.get("status_text") or "Ready.", visible=visible),
    }


def _trick_milestones_session(actor):
    session = _trick_session(actor)
    milestones_widget = session.get("milestones_widget")
    if not isinstance(milestones_widget, dict):
        milestones_widget = {}
        session["milestones_widget"] = milestones_widget
    return milestones_widget


def _trick_milestones_filtered_rows(milestones_widget):
    rows = milestones_widget.get("milestones") if isinstance(milestones_widget.get("milestones"), list) else []
    term = str(milestones_widget.get("search_input") or "").strip().lower()
    wanted = str(milestones_widget.get("status_filter_select") or "all").strip().lower()
    wanted_project = str(milestones_widget.get("project_filter_select") or "all").strip().lower()
    wanted_goal = str(milestones_widget.get("goal_filter_select") or "all").strip().lower()
    out = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        if wanted != "all" and str(item.get("status") or "").strip().lower() != wanted:
            continue
        if wanted_project != "all" and str(item.get("project") or "").strip().lower() != wanted_project:
            continue
        if wanted_goal != "all" and str(item.get("goal") or "").strip().lower() != wanted_goal:
            continue
        if term:
            hay = " ".join([
                str(item.get("name") or ""),
                str(item.get("goal") or ""),
                str(item.get("project") or ""),
                str(item.get("category") or ""),
            ]).lower()
            if term not in hay:
                continue
        out.append(item)
    return out


def _trick_milestones_refresh(actor):
    milestones_widget = _trick_milestones_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/milestones", timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        milestones_widget["status_text"] = "Failed to load milestones."
        return False, {"error": str(e)}, str(e)
    rows = payload.get("milestones") if isinstance(payload, dict) else []
    milestones_widget["milestones"] = rows if isinstance(rows, list) else []
    filtered = _trick_milestones_filtered_rows(milestones_widget)
    milestones_widget["summary"] = {
        "total": len(filtered),
        "completed": len([m for m in filtered if str(m.get("status") or "").lower() == "completed"]),
        "in_progress": len([m for m in filtered if str(m.get("status") or "").lower() == "in-progress"]),
    }
    milestones_widget["status_text"] = ""
    return True, {"count": len(filtered)}, None


def _trick_milestones_primary(milestones_widget):
    filtered = _trick_milestones_filtered_rows(milestones_widget)
    return filtered[0] if filtered else None


def _trick_milestones_update(actor, action):
    milestones_widget = _trick_milestones_session(actor)
    item = _trick_milestones_primary(milestones_widget)
    if not item or not item.get("name"):
        milestones_widget["status_text"] = "No milestone available."
        return False, {"error": "No milestone available"}, "No milestone available"
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/milestone/update",
        data=json.dumps({"name": item.get("name"), "action": action}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=10) as resp:
            _ = resp.read()
    except Exception as e:
        milestones_widget["status_text"] = f"Update failed: {e}"
        return False, {"error": str(e)}, str(e)
    milestones_widget["status_text"] = "Milestone updated."
    _trick_milestones_refresh(actor)
    return True, {"name": item.get("name"), "action": action}, None


def _trick_milestones_elements(actor):
    milestones_widget = _trick_milestones_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(milestones_widget.get("closed"))
    visible = not closed
    minimized = bool(milestones_widget.get("minimized"))
    list_open = bool(milestones_widget.get("list_open"))
    body_visible = visible and not minimized
    list_visible = body_visible and list_open
    filtered = _trick_milestones_filtered_rows(milestones_widget)
    list_text = "\n".join(f"{m.get('name')}: {m.get('status')}" for m in filtered if isinstance(m, dict))
    summary = milestones_widget.get("summary") if isinstance(milestones_widget.get("summary"), dict) else {}

    return {
        "widget.milestones.title": _mk("Milestones", visible=visible),
        "widget.milestones.minimize_button": _mk("_", visible=visible),
        "widget.milestones.close_button": _mk("x", visible=visible),
        "widget.milestones.total_text": _mk(summary.get("total", 0), visible=body_visible),
        "widget.milestones.completed_text": _mk(summary.get("completed", 0), visible=body_visible),
        "widget.milestones.in_progress_text": _mk(summary.get("in_progress", 0), visible=body_visible),
        "widget.milestones.list_toggle_button": _mk("Hide List Section ▴" if list_open else "Show List Section ▾", visible=body_visible),
        "widget.milestones.list_section": _mk("open" if list_open else "closed", visible=list_visible),
        "widget.milestones.search_input": _mk(milestones_widget.get("search_input") or "", visible=list_visible),
        "widget.milestones.status_filter_select": _mk(milestones_widget.get("status_filter_select") or "all", visible=list_visible),
        "widget.milestones.project_filter_select": _mk(milestones_widget.get("project_filter_select") or "all", visible=list_visible),
        "widget.milestones.goal_filter_select": _mk(milestones_widget.get("goal_filter_select") or "all", visible=list_visible),
        "widget.milestones.refresh_button": _mk("Refresh", visible=list_visible),
        "widget.milestones.complete_primary_button": _mk("Complete Primary", visible=list_visible),
        "widget.milestones.reset_primary_button": _mk("Reset Primary", visible=list_visible),
        "widget.milestones.status_text": _mk(milestones_widget.get("status_text") or "", visible=body_visible),
        "widget.milestones.list_container": _mk(list_text, visible=list_visible),
    }


def _trick_commitments_session(actor):
    session = _trick_session(actor)
    commitments_widget = session.get("commitments_widget")
    if not isinstance(commitments_widget, dict):
        commitments_widget = {}
        session["commitments_widget"] = commitments_widget
    return commitments_widget


def _trick_commitments_filtered_rows(commitments_widget):
    rows = commitments_widget.get("commitments") if isinstance(commitments_widget.get("commitments"), list) else []
    term = str(commitments_widget.get("search_input") or "").strip().lower()
    wanted = str(commitments_widget.get("status_filter_select") or "all").strip().lower()
    out = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        if wanted != "all" and str(item.get("status") or "").strip().lower() != wanted:
            continue
        if term:
            hay = " ".join([
                str(item.get("name") or ""),
                str(item.get("description") or ""),
                str(item.get("period") or ""),
                " ".join(str(t.get("name") or "") for t in (item.get("targets") or []) if isinstance(t, dict)),
            ]).lower()
            if term not in hay:
                continue
        out.append(item)
    out.sort(key=lambda item: (
        {"violation": 0, "pending": 1, "met": 2}.get(str(item.get("status") or "pending").lower(), 1),
        str(item.get("name") or "").lower(),
    ))
    return out


def _trick_commitments_recount(commitments_widget):
    filtered = _trick_commitments_filtered_rows(commitments_widget)
    commitments_widget["summary"] = {
        "total": len(filtered),
        "met": len([c for c in filtered if str(c.get("status") or "").lower() == "met"]),
        "violations": len([c for c in filtered if str(c.get("status") or "").lower() == "violation"]),
    }
    return filtered


def _trick_commitments_refresh(actor):
    commitments_widget = _trick_commitments_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/commitments", timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        commitments_widget["status_text"] = "Failed to load commitments."
        return False, {"error": str(e)}, str(e)
    rows = payload.get("commitments") if isinstance(payload, dict) else []
    commitments_widget["commitments"] = rows if isinstance(rows, list) else []
    _trick_commitments_recount(commitments_widget)
    commitments_widget["status_text"] = ""
    return True, {"count": len(commitments_widget.get("commitments") or [])}, None


def _trick_commitments_primary(commitments_widget):
    filtered = _trick_commitments_filtered_rows(commitments_widget)
    return filtered[0] if filtered else None


def _trick_commitments_override(actor, state):
    commitments_widget = _trick_commitments_session(actor)
    item = _trick_commitments_primary(commitments_widget)
    if not item or not item.get("name"):
        commitments_widget["status_text"] = "No commitment available."
        return False, {"error": "No commitment available"}, "No commitment available"
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/commitments/override",
        data=json.dumps({"name": item.get("name"), "state": state}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        commitments_widget["status_text"] = f"Check-in failed: {e}"
        return False, {"error": str(e)}, str(e)
    commitments_widget["status_text"] = "Daily check-in saved."
    _trick_commitments_refresh(actor)
    return True, payload, None


def _trick_commitments_evaluate(actor):
    commitments_widget = _trick_commitments_session(actor)
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/cli",
        data=json.dumps({"command": "commitments", "args": ["check"], "properties": {}}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=15) as resp:
            text = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        commitments_widget["status_text"] = f"Evaluation failed: {e}"
        return False, {"error": str(e)}, str(e)
    _trick_commitments_refresh(actor)
    commitments_widget["status_text"] = "Commitments evaluated."
    return True, {"stdout": text}, None


def _trick_commitments_elements(actor):
    commitments_widget = _trick_commitments_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(commitments_widget.get("closed"))
    visible = not closed
    minimized = bool(commitments_widget.get("minimized"))
    list_open = bool(commitments_widget.get("list_open"))
    body_visible = visible and not minimized
    list_visible = body_visible and list_open
    filtered = _trick_commitments_filtered_rows(commitments_widget)
    list_text = "\n".join(f"{c.get('name')}: {c.get('status')}" for c in filtered if isinstance(c, dict))
    summary = commitments_widget.get("summary") if isinstance(commitments_widget.get("summary"), dict) else {}

    return {
        "widget.commitments.title": _mk("Commitments", visible=visible),
        "widget.commitments.evaluate_button": _mk("Evaluate", visible=visible),
        "widget.commitments.minimize_button": _mk("_", visible=visible),
        "widget.commitments.close_button": _mk("x", visible=visible),
        "widget.commitments.total_text": _mk(summary.get("total", 0), visible=body_visible),
        "widget.commitments.met_text": _mk(summary.get("met", 0), visible=body_visible),
        "widget.commitments.violations_text": _mk(summary.get("violations", 0), visible=body_visible),
        "widget.commitments.list_toggle_button": _mk("Hide List Section ▴" if list_open else "Show List Section ▾", visible=body_visible),
        "widget.commitments.list_section": _mk("open" if list_open else "closed", visible=list_visible),
        "widget.commitments.search_input": _mk(commitments_widget.get("search_input") or "", visible=list_visible),
        "widget.commitments.status_filter_select": _mk(commitments_widget.get("status_filter_select") or "all", visible=list_visible),
        "widget.commitments.refresh_button": _mk("Refresh", visible=list_visible),
        "widget.commitments.met_primary_button": _mk("Mark Primary Met", visible=list_visible),
        "widget.commitments.violation_primary_button": _mk("Mark Primary Violated", visible=list_visible),
        "widget.commitments.clear_primary_button": _mk("Clear Primary", visible=list_visible),
        "widget.commitments.status_text": _mk(commitments_widget.get("status_text") or "", visible=body_visible),
        "widget.commitments.list_container": _mk(list_text, visible=list_visible),
    }


def _trick_rewards_session(actor):
    session = _trick_session(actor)
    rewards_widget = session.get("rewards_widget")
    if not isinstance(rewards_widget, dict):
        rewards_widget = {}
        session["rewards_widget"] = rewards_widget
    return rewards_widget


def _trick_rewards_filtered_rows(rewards_widget):
    rows = rewards_widget.get("rewards") if isinstance(rewards_widget.get("rewards"), list) else []
    term = str(rewards_widget.get("search_input") or "").strip().lower()
    ready_only = bool(rewards_widget.get("ready_only_checkbox"))
    out = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        if ready_only and not bool(item.get("available")):
            continue
        if term:
            hay = " ".join([
                str(item.get("name") or ""),
                str(item.get("category") or ""),
                str(item.get("description") or ""),
            ]).lower()
            if term not in hay:
                continue
        out.append(item)
    out.sort(key=lambda item: (
        not bool(item.get("available")),
        int(item.get("cost_points") or 0),
        str(item.get("name") or "").lower(),
    ))
    return out


def _trick_rewards_refresh(actor):
    rewards_widget = _trick_rewards_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/points?limit=6", timeout=10) as resp:
            points_payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
        with urlrequest.urlopen("http://127.0.0.1:7357/api/rewards", timeout=10) as resp:
            rewards_payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        rewards_widget["status_text"] = "Failed to load rewards."
        return False, {"error": str(e)}, str(e)
    rewards_widget["balance"] = int(points_payload.get("balance") or 0) if isinstance(points_payload, dict) else 0
    history = points_payload.get("history") if isinstance(points_payload, dict) else []
    rewards_widget["history"] = history if isinstance(history, list) else []
    rows = rewards_payload.get("rewards") if isinstance(rewards_payload, dict) else []
    rewards_widget["rewards"] = rows if isinstance(rows, list) else []
    rewards_widget["status_text"] = ""
    return True, {"count": len(rewards_widget["rewards"]), "balance": rewards_widget["balance"]}, None


def _trick_rewards_primary(rewards_widget):
    filtered = _trick_rewards_filtered_rows(rewards_widget)
    return filtered[0] if filtered else None


def _trick_rewards_redeem(actor):
    rewards_widget = _trick_rewards_session(actor)
    item = _trick_rewards_primary(rewards_widget)
    if not item or not item.get("name"):
        rewards_widget["status_text"] = "No reward available."
        return False, {"error": "No reward available"}, "No reward available"
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/reward/redeem",
        data=json.dumps({"name": item.get("name")}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        rewards_widget["status_text"] = str(e)
        return False, {"error": str(e)}, str(e)
    rewards_widget["status_text"] = str(payload.get("stdout") or f'Redeemed {item.get("name")}.').strip()
    _trick_rewards_refresh(actor)
    if "balance" in payload:
        try:
            rewards_widget["balance"] = int(payload.get("balance") or 0)
        except Exception:
            pass
    return True, payload, None


def _trick_rewards_elements(actor):
    rewards_widget = _trick_rewards_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(rewards_widget.get("closed"))
    visible = not closed
    minimized = bool(rewards_widget.get("minimized"))
    list_open = bool(rewards_widget.get("list_open"))
    body_visible = visible and not minimized
    list_visible = body_visible and list_open
    filtered = _trick_rewards_filtered_rows(rewards_widget)
    list_text = "\n".join(
        f"{r.get('name')}: {r.get('cost_points')} pts ({'ready' if r.get('available') else 'locked'})"
        for r in filtered if isinstance(r, dict)
    )
    history = rewards_widget.get("history") if isinstance(rewards_widget.get("history"), list) else []
    ledger_text = "\n".join(
        f"{entry.get('delta', 0)} {entry.get('reason') or entry.get('source') or ''} {entry.get('date') or ''}".strip()
        for entry in history[-5:] if isinstance(entry, dict)
    )

    return {
        "widget.rewards.title": _mk("Rewards", visible=visible),
        "widget.rewards.minimize_button": _mk("_", visible=visible),
        "widget.rewards.close_button": _mk("x", visible=visible),
        "widget.rewards.balance_text": _mk(rewards_widget.get("balance") or 0, visible=body_visible),
        "widget.rewards.ledger_container": _mk(ledger_text, visible=body_visible),
        "widget.rewards.list_toggle_button": _mk("Hide List Section ▴" if list_open else "Show List Section ▾", visible=body_visible),
        "widget.rewards.list_section": _mk("open" if list_open else "closed", visible=list_visible),
        "widget.rewards.search_input": _mk(rewards_widget.get("search_input") or "", visible=list_visible),
        "widget.rewards.ready_only_checkbox": _mk(bool(rewards_widget.get("ready_only_checkbox")), visible=list_visible),
        "widget.rewards.refresh_button": _mk("Refresh", visible=list_visible),
        "widget.rewards.redeem_primary_button": _mk("Redeem Primary", visible=list_visible),
        "widget.rewards.status_text": _mk(rewards_widget.get("status_text") or "", visible=body_visible),
        "widget.rewards.list_container": _mk(list_text, visible=list_visible),
    }


def _trick_achievements_session(actor):
    session = _trick_session(actor)
    achievements_widget = session.get("achievements_widget")
    if not isinstance(achievements_widget, dict):
        achievements_widget = {}
        session["achievements_widget"] = achievements_widget
    return achievements_widget


def _trick_achievements_filtered_rows(achievements_widget):
    rows = achievements_widget.get("achievements") if isinstance(achievements_widget.get("achievements"), list) else []
    term = str(achievements_widget.get("search_input") or "").strip().lower()
    wanted = str(achievements_widget.get("status_filter_select") or "all").strip().lower()
    out = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        state = str(item.get("state") or item.get("status") or "pending").strip().lower()
        if wanted != "all" and state != wanted:
            continue
        if term:
            tags = item.get("tags") if isinstance(item.get("tags"), list) else []
            hay = " ".join([
                str(item.get("name") or ""),
                str(item.get("description") or ""),
                str(item.get("category") or ""),
                " ".join(str(t) for t in tags),
            ]).lower()
            if term not in hay:
                continue
        out.append(item)
    out.sort(key=lambda item: (
        {"awarded": 0, "pending": 1, "archived": 2}.get(str(item.get("state") or "pending").lower(), 1),
        str(item.get("name") or "").lower(),
    ))
    return out


def _trick_achievements_refresh(actor):
    achievements_widget = _trick_achievements_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/achievements", timeout=10) as resp:
            achievements_payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
        with urlrequest.urlopen("http://127.0.0.1:7357/api/profile", timeout=10) as resp:
            profile_payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        achievements_widget["status_text"] = "Failed to load achievements."
        return False, {"error": str(e)}, str(e)
    rows = achievements_payload.get("achievements") if isinstance(achievements_payload, dict) else []
    achievements_widget["achievements"] = rows if isinstance(rows, list) else []
    counts = achievements_payload.get("counts") if isinstance(achievements_payload, dict) else {}
    achievements_widget["counts"] = counts if isinstance(counts, dict) else {"total": 0, "awarded": 0, "pending": 0, "archived": 0}
    profile = profile_payload.get("profile") if isinstance(profile_payload, dict) else {}
    if not isinstance(profile, dict):
        profile = {}
    achievements_widget["current_title"] = str(profile.get("title") or "")
    achievements_widget["title_select"] = achievements_widget["current_title"]
    achievements_widget["profile_progress"] = {
        "level": int(profile.get("level") or 1),
        "xp_total": int(profile.get("xp_total") or 0),
        "xp_into_level": int(profile.get("xp_into_level") or 0),
        "xp_to_next_level": int(profile.get("xp_to_next_level") or 1000),
    }
    achievements_widget["status_text"] = ""
    return True, {"count": len(achievements_widget["achievements"])}, None


def _trick_achievements_primary(achievements_widget):
    filtered = _trick_achievements_filtered_rows(achievements_widget)
    return filtered[0] if filtered else None


def _trick_achievements_update(actor, action):
    achievements_widget = _trick_achievements_session(actor)
    item = _trick_achievements_primary(achievements_widget)
    if not item or not item.get("name"):
        achievements_widget["status_text"] = "No achievement available."
        return False, {"error": "No achievement available"}, "No achievement available"
    payload = {"name": item.get("name")}
    if action == "award":
        payload["award_now"] = True
    elif action == "archive":
        payload["archive_now"] = True
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/achievement/update",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        achievements_widget["status_text"] = f"Update failed: {e}"
        return False, {"error": str(e)}, str(e)
    achievements_widget["status_text"] = "Achievement marked as awarded." if action == "award" else "Achievement archived."
    _trick_achievements_refresh(actor)
    return True, result, None


def _trick_achievements_set_title(actor):
    achievements_widget = _trick_achievements_session(actor)
    title = str(achievements_widget.get("title_select") or "").strip()
    if not title:
        achievements_widget["status_text"] = "No title selected."
        return False, {"error": "No title selected"}, "No title selected"
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/profile",
        data=json.dumps({"title": title}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        achievements_widget["status_text"] = "Failed to update title."
        return False, {"error": str(e)}, str(e)
    achievements_widget["current_title"] = title
    achievements_widget["title_select"] = title
    achievements_widget["status_text"] = "Title updated."
    return True, result, None


def _trick_achievements_elements(actor):
    achievements_widget = _trick_achievements_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(achievements_widget.get("closed"))
    visible = not closed
    minimized = bool(achievements_widget.get("minimized"))
    list_open = bool(achievements_widget.get("list_open"))
    body_visible = visible and not minimized
    list_visible = body_visible and list_open
    filtered = _trick_achievements_filtered_rows(achievements_widget)
    list_text = "\n".join(
        f"{a.get('name')}: {a.get('state') or a.get('status')}"
        for a in filtered if isinstance(a, dict)
    )
    progress = achievements_widget.get("profile_progress") if isinstance(achievements_widget.get("profile_progress"), dict) else {}
    level = int(progress.get("level") or 1)
    xp_into = int(progress.get("xp_into_level") or 0)
    xp_next = int(progress.get("xp_to_next_level") or 1000)
    level_pct = 100 if xp_next <= 0 else max(0, min(100, round((xp_into / xp_next) * 100)))
    counts = achievements_widget.get("counts") if isinstance(achievements_widget.get("counts"), dict) else {}

    return {
        "widget.achievements.title": _mk("Achievements", visible=visible),
        "widget.achievements.minimize_button": _mk("_", visible=visible),
        "widget.achievements.close_button": _mk("x", visible=visible),
        "widget.achievements.total_text": _mk(counts.get("total", 0), visible=body_visible),
        "widget.achievements.awarded_text": _mk(counts.get("awarded", 0), visible=body_visible),
        "widget.achievements.pending_text": _mk(counts.get("pending", 0), visible=body_visible),
        "widget.achievements.level_ring": _mk(level_pct, visible=body_visible),
        "widget.achievements.level_text": _mk(f"LVL {level}", visible=body_visible),
        "widget.achievements.level_meta_text": _mk(f"{xp_into} / {xp_next} XP" if xp_next > 0 else f"MAX • {int(progress.get('xp_total') or 0)} XP", visible=body_visible),
        "widget.achievements.list_toggle_button": _mk("Hide List Section ▴" if list_open else "Show List Section ▾", visible=body_visible),
        "widget.achievements.list_section": _mk("open" if list_open else "closed", visible=list_visible),
        "widget.achievements.search_input": _mk(achievements_widget.get("search_input") or "", visible=list_visible),
        "widget.achievements.status_filter_select": _mk(achievements_widget.get("status_filter_select") or "all", visible=list_visible),
        "widget.achievements.title_select": _mk(achievements_widget.get("title_select") or "", visible=list_visible),
        "widget.achievements.set_title_button": _mk("Set Title", visible=list_visible),
        "widget.achievements.refresh_button": _mk("Refresh", visible=list_visible),
        "widget.achievements.award_primary_button": _mk("Award Primary", visible=list_visible),
        "widget.achievements.archive_primary_button": _mk("Archive Primary", visible=list_visible),
        "widget.achievements.status_text": _mk(achievements_widget.get("status_text") or "", visible=body_visible),
        "widget.achievements.list_container": _mk(list_text, visible=list_visible),
    }


def _trick_habit_tracker_session(actor):
    session = _trick_session(actor)
    habit_tracker = session.get("habit_tracker")
    if not isinstance(habit_tracker, dict):
        habit_tracker = {}
        session["habit_tracker"] = habit_tracker
    return habit_tracker


def _trick_habit_tracker_filtered_rows(habit_tracker):
    rows = habit_tracker.get("habits") if isinstance(habit_tracker.get("habits"), list) else []
    term = str(habit_tracker.get("search_input") or "").strip().lower()
    wanted = str(habit_tracker.get("polarity_select") or "all").strip().lower()
    out = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        if wanted != "all" and str(item.get("polarity") or "").strip().lower() != wanted:
            continue
        if term and term not in str(item.get("name") or "").strip().lower():
            continue
        out.append(item)
    return out


def _trick_habit_tracker_summary(rows):
    try:
        good = [h for h in rows if str(h.get("polarity") or "").lower() != "bad"]
        bad = [h for h in rows if str(h.get("polarity") or "").lower() == "bad"]
        good_done = len([h for h in good if str(h.get("today_status") or "").lower() == "done"])
        bad_inc = len([h for h in bad if str(h.get("today_status") or "").lower() == "incident"])
        return f"Good: {good_done}/{len(good)} done today | Bad: {bad_inc}/{len(bad)} incidents today"
    except Exception:
        return ""


def _trick_habit_tracker_refresh(actor):
    habit_tracker = _trick_habit_tracker_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/habits", timeout=10) as resp:
            payload = yaml.safe_load(resp.read().decode("utf-8", errors="replace") or "") or {}
    except Exception as e:
        habit_tracker["status_text"] = "Failed to load habits."
        return False, {"error": str(e)}, str(e)
    rows = payload.get("habits") if isinstance(payload, dict) else []
    norm = []
    for item in rows if isinstance(rows, list) else []:
        if not isinstance(item, dict):
            continue
        norm.append({
            "name": str(item.get("name") or ""),
            "polarity": str(item.get("polarity") or "good"),
            "category": str(item.get("category") or ""),
            "priority": str(item.get("priority") or ""),
            "streak_current": int(item.get("streak_current") or 0),
            "streak_longest": int(item.get("streak_longest") or 0),
            "clean_current": int(item.get("clean_current") or 0),
            "clean_longest": int(item.get("clean_longest") or 0),
            "today_status": item.get("today_status"),
        })
    habit_tracker["habits"] = norm
    habit_tracker["summary_text"] = _trick_habit_tracker_summary(norm)
    habit_tracker["status_text"] = ""
    return True, {"count": len(norm)}, None


def _trick_habit_tracker_primary(habit_tracker):
    rows = _trick_habit_tracker_filtered_rows(habit_tracker)
    return rows[0] if rows else None


def _trick_habit_tracker_update(actor, action):
    habit_tracker = _trick_habit_tracker_session(actor)
    item = _trick_habit_tracker_primary(habit_tracker)
    if not item or not item.get("name"):
        habit_tracker["status_text"] = "No habit available."
        return False, {"error": "No habit available"}, "No habit available"
    endpoint = "incident" if action == "incident" else "complete"
    req = urlrequest.Request(
        f"http://127.0.0.1:7357/api/habits/{endpoint}",
        data=json.dumps({"name": item.get("name")}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        habit_tracker["status_text"] = "Habit update failed."
        return False, {"error": str(e)}, str(e)
    habit_tracker["status_text"] = "Habit updated."
    _trick_habit_tracker_refresh(actor)
    return True, payload, None


def _trick_habit_tracker_elements(actor):
    habit_tracker = _trick_habit_tracker_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(habit_tracker.get("closed"))
    visible = not closed
    minimized = bool(habit_tracker.get("minimized"))
    body_visible = visible and not minimized
    filtered = _trick_habit_tracker_filtered_rows(habit_tracker)
    list_text = "\n".join(
        f"{h.get('name')}: {h.get('today_status') or 'pending'}"
        for h in filtered if isinstance(h, dict)
    )
    return {
        "widget.habit_tracker.title": _mk("Habits", visible=visible),
        "widget.habit_tracker.search_input": _mk(habit_tracker.get("search_input") or "", visible=body_visible),
        "widget.habit_tracker.polarity_select": _mk(habit_tracker.get("polarity_select") or "all", visible=body_visible),
        "widget.habit_tracker.refresh_button": _mk("R", visible=visible),
        "widget.habit_tracker.minimize_button": _mk("_", visible=visible),
        "widget.habit_tracker.close_button": _mk("x", visible=visible),
        "widget.habit_tracker.done_primary_button": _mk("Done Primary", visible=body_visible),
        "widget.habit_tracker.incident_primary_button": _mk("Incident Primary", visible=body_visible),
        "widget.habit_tracker.summary_text": _mk(habit_tracker.get("summary_text") or "", visible=body_visible),
        "widget.habit_tracker.status_text": _mk(habit_tracker.get("status_text") or "", visible=body_visible),
        "widget.habit_tracker.list_container": _mk(list_text, visible=body_visible),
    }


def _trick_review_session(actor):
    session = _trick_session(actor)
    review_widget = session.get("review_widget")
    if not isinstance(review_widget, dict):
        review_widget = {}
        session["review_widget"] = review_widget
    return review_widget


def _trick_review_today():
    return datetime.now().strftime("%Y-%m-%d")


def _trick_review_this_week():
    now = datetime.utcnow()
    iso_year, iso_week, _ = now.isocalendar()
    return f"{iso_year}-{iso_week:02d}"


def _trick_review_this_month():
    now = datetime.now()
    return f"{now.year}-{now.month:02d}"


def _trick_review_set_this(review_widget):
    review_type = str(review_widget.get("type_select") or "daily").strip().lower()
    if review_type == "weekly":
        review_widget["period_input"] = _trick_review_this_week()
    elif review_type == "monthly":
        review_widget["period_input"] = _trick_review_this_month()
    else:
        review_widget["period_input"] = _trick_review_today()
    return review_widget["period_input"]


def _trick_review_shift_period(review_widget, direction):
    review_type = str(review_widget.get("type_select") or "daily").strip().lower()
    period = str(review_widget.get("period_input") or "").strip()
    try:
        if review_type == "daily":
            dt = datetime.strptime(period if re.match(r"^\d{4}-\d{2}-\d{2}$", period) else _trick_review_today(), "%Y-%m-%d")
            dt = dt + timedelta(days=direction)
            review_widget["period_input"] = dt.strftime("%Y-%m-%d")
        elif review_type == "weekly":
            m = re.match(r"^(\d{4})-(\d{2})$", period or "")
            if not m:
                review_widget["period_input"] = _trick_review_this_week()
            else:
                year = int(m.group(1))
                week = int(m.group(2))
                monday = datetime.fromisocalendar(year, week, 1) + timedelta(days=7 * direction)
                iso_year, iso_week, _ = monday.isocalendar()
                review_widget["period_input"] = f"{iso_year}-{iso_week:02d}"
        else:
            m = re.match(r"^(\d{4})-(\d{2})$", period or "")
            if not m:
                review_widget["period_input"] = _trick_review_this_month()
            else:
                year = int(m.group(1))
                month = int(m.group(2))
                month += direction
                while month < 1:
                    year -= 1
                    month += 12
                while month > 12:
                    year += 1
                    month -= 12
                review_widget["period_input"] = f"{year}-{month:02d}"
    except Exception:
        _trick_review_set_this(review_widget)
    return review_widget["period_input"]


def _trick_review_fetch(review_widget):
    review_type = str(review_widget.get("type_select") or "daily").strip().lower()
    period = str(review_widget.get("period_input") or "").strip()
    url = f"http://127.0.0.1:7357/api/review?type={quote(review_type)}&period={quote(period)}"
    with urlrequest.urlopen(url, timeout=10) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _trick_review_run_cli(command_args):
    ok, out, err = run_console_command("review", command_args)
    return ok, out, err


def _trick_review_generate(actor):
    review_widget = _trick_review_session(actor)
    review_type = str(review_widget.get("type_select") or "daily").strip().lower()
    period = str(review_widget.get("period_input") or "").strip()
    ok, out, err = _trick_review_run_cli([review_type, period] if period else [review_type])
    if not ok:
        review_widget["status_text"] = "Generation failed."
        return False, {"stdout": out, "stderr": err}, err or out or "Generation failed"
    try:
        review_widget["log_text"] = _trick_review_fetch(review_widget)
    except Exception:
        review_widget["log_text"] = ""
    review_widget["status_text"] = "Done"
    return True, {"stdout": out, "stderr": err}, None


def _trick_review_open(actor):
    review_widget = _trick_review_session(actor)
    try:
        review_widget["log_text"] = _trick_review_fetch(review_widget)
    except Exception as e:
        review_widget["status_text"] = "Load failed."
        return False, {"error": str(e)}, str(e)
    review_widget["status_text"] = "Done"
    return True, {"loaded": True}, None


def _trick_review_export(actor):
    review_widget = _trick_review_session(actor)
    review_type = str(review_widget.get("type_select") or "daily").strip().lower()
    period = str(review_widget.get("period_input") or "").strip()
    ok, out, err = _trick_review_run_cli(["export", review_type, period] if period else ["export", review_type])
    review_widget["status_text"] = "Done" if ok else "Export failed."
    return ok, {"stdout": out, "stderr": err}, None if ok else (err or out or "Export failed")


def _trick_review_elements(actor):
    review_widget = _trick_review_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(review_widget.get("closed"))
    visible = not closed
    minimized = bool(review_widget.get("minimized"))
    body_visible = visible and not minimized
    return {
        "widget.review.title": _mk("Review", visible=visible),
        "widget.review.minimize_button": _mk("_", visible=visible),
        "widget.review.close_button": _mk("x", visible=visible),
        "widget.review.type_select": _mk(review_widget.get("type_select") or "daily", visible=body_visible),
        "widget.review.period_input": _mk(review_widget.get("period_input") or "", visible=body_visible),
        "widget.review.this_button": _mk("This", visible=body_visible),
        "widget.review.generate_button": _mk("Generate", visible=body_visible),
        "widget.review.open_button": _mk("Open", visible=body_visible),
        "widget.review.export_button": _mk("Export", visible=body_visible),
        "widget.review.prev_button": _mk("Prev", visible=body_visible),
        "widget.review.next_button": _mk("Next", visible=body_visible),
        "widget.review.expand_checkbox": _mk(bool(review_widget.get("expand_checkbox")), visible=body_visible),
        "widget.review.status_text": _mk(review_widget.get("status_text") or "", visible=body_visible),
        "widget.review.log_text": _mk(review_widget.get("log_text") or "", visible=body_visible),
    }


def _trick_variables_session(actor):
    session = _trick_session(actor)
    variables_widget = session.get("variables_widget")
    if not isinstance(variables_widget, dict):
        variables_widget = {}
        session["variables_widget"] = variables_widget
    return variables_widget


def _trick_variables_refresh(actor):
    variables_widget = _trick_variables_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/vars", timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        variables_widget["status_text"] = "Refresh failed."
        return False, {"error": str(e)}, str(e)
    variables_widget["rows"] = payload.get("vars") if isinstance(payload.get("vars"), dict) else {}
    variables_widget["status_text"] = "Refreshed."
    return True, {"count": len(variables_widget["rows"])}, None


def _trick_variables_save(actor):
    variables_widget = _trick_variables_session(actor)
    rows = variables_widget.get("rows") if isinstance(variables_widget.get("rows"), dict) else {}
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/vars",
        data=json.dumps({"set": rows, "unset": []}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        variables_widget["status_text"] = "Save failed."
        return False, {"error": str(e)}, str(e)
    variables_widget["rows"] = payload.get("vars") if isinstance(payload.get("vars"), dict) else rows
    variables_widget["status_text"] = "Saved."
    return True, payload, None


def _trick_variables_grid_text(rows):
    return "\n".join(f"{k}={v}" for k, v in sorted((rows or {}).items()))


def _trick_variables_elements(actor):
    variables_widget = _trick_variables_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(variables_widget.get("closed"))
    visible = not closed
    minimized = bool(variables_widget.get("minimized"))
    body_visible = visible and not minimized
    rows = variables_widget.get("rows") if isinstance(variables_widget.get("rows"), dict) else {}
    return {
        "widget.variables.title": _mk("Variables", visible=visible),
        "widget.variables.minimize_button": _mk("_", visible=visible),
        "widget.variables.close_button": _mk("x", visible=visible),
        "widget.variables.add_button": _mk("Add", visible=body_visible),
        "widget.variables.save_button": _mk("Save", visible=body_visible),
        "widget.variables.refresh_button": _mk("Refresh", visible=body_visible),
        "widget.variables.grid_container": _mk(_trick_variables_grid_text(rows), visible=body_visible),
        "widget.variables.status_text": _mk(variables_widget.get("status_text") or "", visible=body_visible),
    }


def _trick_parse_grid_text(value):
    rows = {}
    for raw in str(value or "").splitlines():
        line = str(raw).strip()
        if not line or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        if key:
            rows[key] = val.strip()
    return rows


def _trick_resolution_tracker_session(actor):
    session = _trick_session(actor)
    resolution_tracker = session.get("resolution_tracker")
    if not isinstance(resolution_tracker, dict):
        resolution_tracker = {}
        session["resolution_tracker"] = resolution_tracker
    return resolution_tracker


def _trick_resolution_tracker_refresh(actor):
    resolution_tracker = _trick_resolution_tracker_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/items", timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        resolution_tracker["status_text"] = "Failed to load resolutions."
        return False, {"error": str(e)}, str(e)
    all_items = payload.get("items") if isinstance(payload.get("items"), list) else []
    projects_by_name = {
        str(i.get("name")): i.get("resolution")
        for i in all_items if isinstance(i, dict) and str(i.get("type") or "").lower() == "project" and i.get("name") and i.get("resolution")
    }
    goals_by_name = {
        str(i.get("name")): i
        for i in all_items if isinstance(i, dict) and str(i.get("type") or "").lower() == "goal" and i.get("name")
    }
    resolved = []
    for item in all_items:
        if not isinstance(item, dict):
            continue
        out = dict(item)
        eff = out.get("resolution") or None
        if (not eff) and out.get("resolution_ref"):
            eff = projects_by_name.get(str(out.get("resolution_ref"))) or None
        if not eff:
            t = str(out.get("type") or "").lower()
            if t in {"goal", "milestone"} and out.get("project"):
                eff = projects_by_name.get(str(out.get("project"))) or None
            if (not eff) and t == "milestone" and out.get("goal"):
                goal = goals_by_name.get(str(out.get("goal")))
                if isinstance(goal, dict) and goal.get("project"):
                    eff = projects_by_name.get(str(goal.get("project"))) or None
        out["__resolution_effective"] = eff or None
        if out["__resolution_effective"]:
            resolved.append(out)
    resolution_tracker["items"] = resolved
    current_year = datetime.now().year
    year_items = [item for item in resolved if not item.get("__resolution_effective", {}).get("year") or int(item.get("__resolution_effective", {}).get("year")) in {current_year, current_year + 1}]
    groups = {}
    for item in year_items:
        res = item.get("__resolution_effective") or {}
        key = "||".join([str(res.get("year") or ""), str(res.get("affirmation") or ""), str(res.get("raw_text") or "")])
        groups.setdefault(key, {"resolution": res, "items": []})["items"].append(item)
    entries = []
    for entry in groups.values():
        linked = entry["items"]
        avg = round(sum([0 if not isinstance(i, dict) else (100 if str(i.get("type") or "").lower() == "routine" else (100 if (str(i.get("type") or "").lower() == "task" and (i.get("complete") or str(i.get("status") or "").lower() == "complete")) else 0)) for i in linked]) / max(1, len(linked)))
        affirmation = str((entry["resolution"] or {}).get("affirmation") or "No affirmation")
        entries.append({"affirmation": affirmation, "percent": avg, "count": len(linked)})
    entries.sort(key=lambda row: (-int(row.get("percent") or 0), str(row.get("affirmation") or "").lower()))
    resolution_tracker["stats_text"] = f"{len(entries)} resolutions | {round(sum(int(e.get('percent') or 0) for e in entries) / max(1, len(entries)))}% overall" if entries else ""
    resolution_tracker["list_text"] = "\n".join(f"{row['affirmation']}: {row['percent']}%" for row in entries)
    resolution_tracker["status_text"] = "Loaded." if entries else "No resolutions found."
    return True, {"count": len(entries)}, None


def _trick_resolution_tracker_elements(actor):
    resolution_tracker = _trick_resolution_tracker_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(resolution_tracker.get("closed"))
    visible = not closed
    minimized = bool(resolution_tracker.get("minimized"))
    body_visible = visible and not minimized
    return {
        "widget.resolution_tracker.title": _mk("Resolutions", visible=visible),
        "widget.resolution_tracker.refresh_button": _mk("R", visible=visible),
        "widget.resolution_tracker.minimize_button": _mk("_", visible=visible),
        "widget.resolution_tracker.close_button": _mk("x", visible=visible),
        "widget.resolution_tracker.stats_text": _mk(resolution_tracker.get("stats_text") or "", visible=body_visible),
        "widget.resolution_tracker.list_container": _mk(resolution_tracker.get("list_text") or "", visible=body_visible),
        "widget.resolution_tracker.status_text": _mk(resolution_tracker.get("status_text") or "", visible=body_visible),
    }


def _trick_notes_session(actor):
    session = _trick_session(actor)
    notes_widget = session.get("notes_widget")
    if not isinstance(notes_widget, dict):
        notes_widget = {}
        session["notes_widget"] = notes_widget
    return notes_widget


def _trick_notes_update_preview(notes_widget):
    title = str(notes_widget.get("title_input") or "").strip()
    body = str(notes_widget.get("content_input") or "")
    notes_widget["preview_text"] = (f"{title}\n\n{body}" if title else body).strip()


def _trick_notes_create(actor):
    notes_widget = _trick_notes_session(actor)
    name = str(notes_widget.get("title_input") or "").strip()
    if not name:
        notes_widget["status_text"] = "Create failed."
        return False, {"error": "Missing note title"}, "Missing note title"
    category = str(notes_widget.get("category_select") or "").strip()
    priority = str(notes_widget.get("priority_select") or "").strip()
    tags = [s.strip() for s in str(notes_widget.get("tags_input") or "").split(",") if s.strip()]
    content = str(notes_widget.get("content_input") or "")
    fmt = str(notes_widget.get("format_select") or "note").strip().lower()
    if fmt == "note":
        req = urlrequest.Request(
            "http://127.0.0.1:7357/api/new/note",
            data=json.dumps({"name": name, "category": category, "priority": priority, "tags": tags, "content": content}).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
    else:
        ext = ".md" if fmt == "markdown" else ".yml"
        fname = re.sub(r"\s+", " ", name.lower().replace("&", "and").replace(":", "-")).strip() or "untitled"
        target = str(notes_widget.get("path_hint_text") or "").replace("Path: ", "").strip() or f"user/notes/{fname}{ext}"
        payload_content = content
        req = urlrequest.Request(
            "http://127.0.0.1:7357/api/file/write",
            data=json.dumps({"path": target, "content": payload_content}).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        notes_widget["path_hint_text"] = f"Path: {target}"
    try:
        with urlrequest.urlopen(req, timeout=15) as resp:
            _ = resp.read()
    except Exception as e:
        notes_widget["status_text"] = "Create failed."
        return False, {"error": str(e)}, str(e)
    notes_widget["status_text"] = "Created note." if fmt == "note" else "Saved."
    return True, {"name": name, "format": fmt}, None


def _trick_notes_load(actor):
    notes_widget = _trick_notes_session(actor)
    path = str(notes_widget.get("path_hint_text") or "").replace("Path: ", "").strip()
    title = str(notes_widget.get("title_input") or "").strip()
    if path:
        req = urlrequest.Request(
            "http://127.0.0.1:7357/api/file/read",
            data=json.dumps({"path": path}).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            with urlrequest.urlopen(req, timeout=10) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
        except Exception as e:
            notes_widget["status_text"] = "Load failed."
            return False, {"error": str(e)}, str(e)
        try:
            obj = json.loads(raw)
            content = obj.get("content") if isinstance(obj, dict) else raw
        except Exception:
            content = raw
        notes_widget["content_input"] = str(content or "")
        _trick_notes_update_preview(notes_widget)
        notes_widget["status_text"] = "Loaded."
        return True, {"path": path}, None
    if title:
        try:
            from modules.item_manager import read_item_data
            data = read_item_data("note", title)
        except Exception as e:
            notes_widget["status_text"] = "Load failed."
            return False, {"error": str(e)}, str(e)
        if not isinstance(data, dict):
            notes_widget["status_text"] = "Load failed."
            return False, {"error": "Note not found"}, "Note not found"
        notes_widget["category_select"] = str(data.get("category") or "")
        notes_widget["priority_select"] = str(data.get("priority") or "")
        tags = data.get("tags") if isinstance(data.get("tags"), list) else []
        notes_widget["tags_input"] = ", ".join(str(t) for t in tags)
        notes_widget["content_input"] = str(data.get("content") or "")
        notes_widget["format_select"] = "note"
        notes_widget["path_hint_text"] = ""
        _trick_notes_update_preview(notes_widget)
        notes_widget["status_text"] = "Loaded."
        return True, {"name": title}, None
    notes_widget["status_text"] = "Load failed."
    return False, {"error": "No title or path"}, "No title or path"


def _trick_notes_to_sticky(actor):
    notes_widget = _trick_notes_session(actor)
    title = str(notes_widget.get("title_input") or "").strip()
    body = str(notes_widget.get("content_input") or "").strip()
    if not title and not body:
        notes_widget["status_text"] = "Sticky export failed."
        return False, {"error": "Empty note"}, "Empty note"
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/sticky-notes",
        data=json.dumps({"name": title, "content": body or title}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        notes_widget["status_text"] = "Sticky export failed."
        return False, {"error": str(e)}, str(e)
    notes_widget["status_text"] = "Sent to Sticky Notes."
    return True, payload, None


def _trick_notes_elements(actor):
    notes_widget = _trick_notes_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(notes_widget.get("closed"))
    visible = not closed
    minimized = bool(notes_widget.get("minimized"))
    body_visible = visible and not minimized
    return {
        "widget.notes.title": _mk("Notes", visible=visible),
        "widget.notes.minimize_button": _mk("_", visible=visible),
        "widget.notes.close_button": _mk("x", visible=visible),
        "widget.notes.title_input": _mk(notes_widget.get("title_input") or "", visible=body_visible),
        "widget.notes.format_select": _mk(notes_widget.get("format_select") or "note", visible=body_visible),
        "widget.notes.preview_checkbox": _mk(bool(notes_widget.get("preview_checkbox")), visible=body_visible),
        "widget.notes.category_select": _mk(notes_widget.get("category_select") or "", visible=body_visible),
        "widget.notes.priority_select": _mk(notes_widget.get("priority_select") or "", visible=body_visible),
        "widget.notes.tags_input": _mk(notes_widget.get("tags_input") or "", visible=body_visible),
        "widget.notes.path_hint_text": _mk(notes_widget.get("path_hint_text") or "", visible=body_visible),
        "widget.notes.content_input": _mk(notes_widget.get("content_input") or "", visible=body_visible),
        "widget.notes.preview_text": _mk(notes_widget.get("preview_text") or "", visible=body_visible),
        "widget.notes.load_button": _mk("Load", visible=body_visible),
        "widget.notes.to_sticky_button": _mk("To Sticky", visible=body_visible),
        "widget.notes.create_button": _mk("Create", visible=body_visible),
        "widget.notes.status_text": _mk(notes_widget.get("status_text") or "", visible=body_visible),
    }


def _trick_inventory_manager_session(actor):
    session = _trick_session(actor)
    inventory_widget = session.get("inventory_manager_widget")
    if not isinstance(inventory_widget, dict):
        inventory_widget = {}
        session["inventory_manager_widget"] = inventory_widget
    return inventory_widget


def _trick_inventory_manager_filtered_rows(inventory_widget):
    rows = inventory_widget.get("inventories") if isinstance(inventory_widget.get("inventories"), list) else []
    term = str(inventory_widget.get("search_input") or "").strip().lower()
    place = str(inventory_widget.get("place_filter_select") or "").strip().lower()
    out = []
    for inv in rows:
        if not isinstance(inv, dict):
            continue
        name = str(inv.get("name") or "").lower()
        if term and term not in name:
            continue
        if place:
            places = inv.get("places") if isinstance(inv.get("places"), list) else ([inv.get("location")] if inv.get("location") else [])
            if place not in [str(p).lower() for p in places]:
                continue
        out.append(inv)
    return out


def _trick_inventory_manager_refresh(actor):
    inventory_widget = _trick_inventory_manager_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/items?type=inventory", timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        inventory_widget["status_text"] = "Failed to load inventories."
        return False, {"error": str(e)}, str(e)
    items = payload.get("items") if isinstance(payload.get("items"), list) else (payload if isinstance(payload, list) else [])
    inventory_widget["inventories"] = items
    filtered = _trick_inventory_manager_filtered_rows(inventory_widget)
    inventory_widget["count_text"] = f"{len(filtered)} / {len(items)} inventories" if items else "No inventories"
    inventory_widget["status_text"] = f"Loaded {len(items)} inventories."
    if filtered and not inventory_widget.get("selected_name"):
        inventory_widget["selected_name"] = str(filtered[0].get("name") or "")
    return _trick_inventory_manager_load_selected(actor)


def _trick_inventory_manager_load_selected(actor):
    inventory_widget = _trick_inventory_manager_session(actor)
    name = str(inventory_widget.get("selected_name") or "").strip()
    if not name:
        inventory_widget["selected_detail"] = "Select an inventory to see details."
        return True, {"selected": None}, None
    try:
        with urlrequest.urlopen(f"http://127.0.0.1:7357/api/item?type=inventory&name={quote(name)}", timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        inventory_widget["status_text"] = "Failed to load inventory."
        return False, {"error": str(e)}, str(e)
    item = payload.get("item") if isinstance(payload, dict) else {}
    if not isinstance(item, dict):
        item = {}
    places = item.get("places") if isinstance(item.get("places"), list) else ([item.get("location")] if item.get("location") else [])
    tags = item.get("tags") if isinstance(item.get("tags"), list) else []
    items = item.get("inventory_items") if isinstance(item.get("inventory_items"), list) else (item.get("items") if isinstance(item.get("items"), list) else [])
    tools = item.get("tools") if isinstance(item.get("tools"), list) else []
    parts = [str(item.get("name") or "Inventory")]
    if places:
        parts.append(f"Places: {', '.join(str(p) for p in places)}")
    if tags:
        parts.append(f"Tags: {', '.join(str(t) for t in tags)}")
    parts.append(f"Items: {len(items)}")
    parts.append(f"Tools: {len(tools)}")
    inventory_widget["selected_detail"] = "\n".join(parts)
    inventory_widget["status_text"] = f"Loaded {name}."
    return True, {"selected": name}, None


def _trick_inventory_manager_create(actor):
    inventory_widget = _trick_inventory_manager_session(actor)
    name = str(inventory_widget.get("new_name_input") or "").strip()
    if not name:
        inventory_widget["status_text"] = "Inventory name is required."
        return False, {"error": "Inventory name is required"}, "Inventory name is required"
    places = [s.strip() for s in str(inventory_widget.get("new_places_input") or "").split(",") if s.strip()]
    tags = [s.strip() for s in str(inventory_widget.get("new_tags_input") or "").split(",") if s.strip()]
    payload = {
        "type": "inventory",
        "name": name,
        "properties": {"type": "inventory", "name": name, "description": "", "places": places, "tags": tags, "inventory_items": [], "tools": []},
    }
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/item",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=15) as resp:
            _ = resp.read()
    except Exception as e:
        inventory_widget["status_text"] = "Failed to create inventory."
        return False, {"error": str(e)}, str(e)
    inventory_widget["selected_name"] = name
    inventory_widget["status_text"] = f"Created inventory '{name}'."
    return _trick_inventory_manager_refresh(actor)


def _trick_inventory_manager_list_text(rows):
    return "\n".join(str(inv.get("name") or "") for inv in rows if isinstance(inv, dict))


def _trick_inventory_manager_elements(actor):
    inventory_widget = _trick_inventory_manager_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(inventory_widget.get("closed"))
    visible = not closed
    minimized = bool(inventory_widget.get("minimized"))
    body_visible = visible and not minimized
    filtered = _trick_inventory_manager_filtered_rows(inventory_widget)
    return {
        "widget.inventory_manager.title": _mk("Inventory Manager", visible=visible),
        "widget.inventory_manager.minimize_button": _mk("_", visible=visible),
        "widget.inventory_manager.close_button": _mk("x", visible=visible),
        "widget.inventory_manager.search_input": _mk(inventory_widget.get("search_input") or "", visible=body_visible),
        "widget.inventory_manager.place_filter_select": _mk(inventory_widget.get("place_filter_select") or "", visible=body_visible),
        "widget.inventory_manager.search_button": _mk("Search", visible=body_visible),
        "widget.inventory_manager.refresh_button": _mk("Refresh", visible=body_visible),
        "widget.inventory_manager.new_name_input": _mk(inventory_widget.get("new_name_input") or "", visible=body_visible),
        "widget.inventory_manager.new_places_input": _mk(inventory_widget.get("new_places_input") or "", visible=body_visible),
        "widget.inventory_manager.new_tags_input": _mk(inventory_widget.get("new_tags_input") or "", visible=body_visible),
        "widget.inventory_manager.create_button": _mk("Create", visible=body_visible),
        "widget.inventory_manager.count_text": _mk(inventory_widget.get("count_text") or "", visible=body_visible),
        "widget.inventory_manager.list_container": _mk(_trick_inventory_manager_list_text(filtered), visible=body_visible),
        "widget.inventory_manager.detail_container": _mk(inventory_widget.get("selected_detail") or "", visible=body_visible),
        "widget.inventory_manager.status_text": _mk(inventory_widget.get("status_text") or "", visible=body_visible),
    }


def _trick_profile_session(actor):
    session = _trick_session(actor)
    profile_widget = session.get("profile_widget")
    if not isinstance(profile_widget, dict):
        profile_widget = {}
        session["profile_widget"] = profile_widget
    return profile_widget


def _trick_profile_refresh(actor):
    profile_widget = _trick_profile_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/profile", timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        profile_widget["status_text"] = "Failed to load profile."
        return False, {"error": str(e)}, str(e)
    data = payload.get("profile") if isinstance(payload, dict) else {}
    if not isinstance(data, dict):
        data = {}
    profile_widget["nickname_input"] = str(data.get("nickname") or "")
    profile_widget["title_select"] = str(data.get("title") or "")
    welcome = data.get("welcome") if isinstance(data.get("welcome"), dict) else {}
    exit_block = data.get("exit") if isinstance(data.get("exit"), dict) else {}
    profile_widget["welcome_line1_input"] = str(welcome.get("line1") or "")
    profile_widget["welcome_line2_input"] = str(welcome.get("line2") or "")
    profile_widget["welcome_line3_input"] = str(welcome.get("line3") or "")
    profile_widget["exit_line1_input"] = str(exit_block.get("line1") or "")
    profile_widget["exit_line2_input"] = str(exit_block.get("line2") or "")
    profile_widget["avatar_preview"] = str(data.get("avatar_path") or data.get("avatar_data_url") or "")
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/achievements", timeout=15) as resp:
            achievements_payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception:
        achievements_payload = {}
    achievements = achievements_payload.get("achievements") if isinstance(achievements_payload, dict) else []
    titles = []
    if isinstance(achievements, list):
        for achievement in achievements:
            if not isinstance(achievement, dict):
                continue
            state = str(achievement.get("state") or achievement.get("status") or "").lower()
            title = str(achievement.get("title") or "").strip()
            if state == "awarded" and title:
                titles.append(title)
    profile_widget["available_titles"] = sorted(set(titles))
    profile_widget["status_text"] = "Profile loaded."
    return True, {"profile": data}, None


def _trick_profile_save(actor):
    profile_widget = _trick_profile_session(actor)
    payload = {
        "nickname": str(profile_widget.get("nickname_input") or "").strip(),
        "title": str(profile_widget.get("title_select") or "").strip(),
        "welcome": {
            "line1": str(profile_widget.get("welcome_line1_input") or ""),
            "line2": str(profile_widget.get("welcome_line2_input") or ""),
            "line3": str(profile_widget.get("welcome_line3_input") or ""),
        },
        "exit": {
            "line1": str(profile_widget.get("exit_line1_input") or ""),
            "line2": str(profile_widget.get("exit_line2_input") or ""),
        },
    }
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/profile",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=15) as resp:
            _ = resp.read()
    except Exception as e:
        profile_widget["status_text"] = "Save failed."
        return False, {"error": str(e)}, str(e)
    profile_widget["status_text"] = "Profile saved."
    return True, payload, None


def _trick_profile_elements(actor):
    profile_widget = _trick_profile_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(profile_widget.get("closed"))
    visible = not closed
    minimized = bool(profile_widget.get("minimized"))
    body_visible = visible and not minimized
    return {
        "widget.profile.title": _mk("Profile", visible=visible),
        "widget.profile.minimize_button": _mk("_", visible=visible),
        "widget.profile.close_button": _mk("x", visible=visible),
        "widget.profile.nickname_input": _mk(profile_widget.get("nickname_input") or "", visible=body_visible),
        "widget.profile.title_select": _mk(profile_widget.get("title_select") or "", visible=body_visible),
        "widget.profile.available_titles_text": _mk(", ".join(profile_widget.get("available_titles") or []), visible=body_visible),
        "widget.profile.welcome_line1_input": _mk(profile_widget.get("welcome_line1_input") or "", visible=body_visible),
        "widget.profile.welcome_line2_input": _mk(profile_widget.get("welcome_line2_input") or "", visible=body_visible),
        "widget.profile.welcome_line3_input": _mk(profile_widget.get("welcome_line3_input") or "", visible=body_visible),
        "widget.profile.exit_line1_input": _mk(profile_widget.get("exit_line1_input") or "", visible=body_visible),
        "widget.profile.exit_line2_input": _mk(profile_widget.get("exit_line2_input") or "", visible=body_visible),
        "widget.profile.avatar_preview": _mk(profile_widget.get("avatar_preview") or "", visible=body_visible),
        "widget.profile.save_button": _mk("Save Changes", visible=body_visible),
        "widget.profile.edit_preferences_button": _mk("Edit Agent Preferences", visible=body_visible),
        "widget.profile.edit_preferences_settings_button": _mk("Edit Preferences Settings", visible=body_visible),
        "widget.profile.edit_pilot_brief_button": _mk("Edit Pilot Brief", visible=body_visible),
        "widget.profile.status_text": _mk(profile_widget.get("status_text") or "", visible=body_visible),
    }


def _trick_settings_session(actor):
    session = _trick_session(actor)
    settings_widget = session.get("settings_widget")
    if not isinstance(settings_widget, dict):
        settings_widget = {}
        session["settings_widget"] = settings_widget
    return settings_widget


def _trick_settings_summarize(yaml_text):
    lines = [line.rstrip() for line in str(yaml_text or "").splitlines() if line.strip()]
    return "\n".join(lines[:12])


def _trick_settings_refresh(actor):
    settings_widget = _trick_settings_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/settings", timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        settings_widget["status_text"] = "Failed to list settings files."
        return False, {"error": str(e)}, str(e)
    files = payload.get("files") if isinstance(payload, dict) and isinstance(payload.get("files"), list) else []
    settings_widget["files"] = [str(f) for f in files]
    if not settings_widget.get("file_select") and files:
        settings_widget["file_select"] = str(files[0])
    if settings_widget.get("file_select"):
        return _trick_settings_load_file(actor, settings_widget.get("file_select"))
    settings_widget["editor_input"] = ""
    settings_widget["dynamic_content"] = ""
    settings_widget["status_text"] = "Loaded settings files."
    return True, {"files": files}, None


def _trick_settings_load_file(actor, file_name):
    settings_widget = _trick_settings_session(actor)
    name = str(file_name or "").strip()
    if not name:
        settings_widget["status_text"] = "Select a file first."
        return False, {"error": "Missing file"}, "Missing file"
    try:
        with urlrequest.urlopen(f"http://127.0.0.1:7357/api/settings?file={quote(name)}", timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        settings_widget["status_text"] = "Failed to load file."
        return False, {"error": str(e)}, str(e)
    content = str(payload.get("content") or "")
    settings_widget["file_select"] = name
    settings_widget["editor_input"] = content
    settings_widget["dynamic_content"] = _trick_settings_summarize(content)
    settings_widget["status_text"] = f"Loaded {name}"
    return True, {"file": name, "content": content}, None


def _trick_settings_save(actor):
    settings_widget = _trick_settings_session(actor)
    name = str(settings_widget.get("file_select") or "").strip()
    if not name:
        settings_widget["status_text"] = "Select a file first."
        return False, {"error": "Missing file"}, "Missing file"
    req = urlrequest.Request(
        f"http://127.0.0.1:7357/api/settings?file={quote(name)}",
        data=str(settings_widget.get("editor_input") or "").encode("utf-8"),
        method="POST",
        headers={"Content-Type": "text/yaml"},
    )
    try:
        with urlrequest.urlopen(req, timeout=15) as resp:
            _ = resp.read()
    except Exception as e:
        settings_widget["status_text"] = "Save failed."
        return False, {"error": str(e)}, str(e)
    settings_widget["dynamic_content"] = _trick_settings_summarize(settings_widget.get("editor_input") or "")
    settings_widget["status_text"] = "Saved."
    return True, {"file": name}, None


def _trick_settings_elements(actor):
    settings_widget = _trick_settings_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(settings_widget.get("closed"))
    visible = not closed
    minimized = bool(settings_widget.get("minimized"))
    body_visible = visible and not minimized
    return {
        "widget.settings.title": _mk("Settings", visible=visible),
        "widget.settings.minimize_button": _mk("_", visible=visible),
        "widget.settings.close_button": _mk("x", visible=visible),
        "widget.settings.file_select": _mk(settings_widget.get("file_select") or "", visible=body_visible),
        "widget.settings.files_text": _mk(", ".join(settings_widget.get("files") or []), visible=body_visible),
        "widget.settings.reload_button": _mk("Reload", visible=body_visible),
        "widget.settings.form_mode_checkbox": _mk(bool(settings_widget.get("form_mode_checkbox", True)), visible=body_visible),
        "widget.settings.editor_input": _mk(settings_widget.get("editor_input") or "", visible=body_visible),
        "widget.settings.dynamic_content": _mk(settings_widget.get("dynamic_content") or "", visible=body_visible),
        "widget.settings.save_button": _mk("Save", visible=body_visible),
        "widget.settings.status_text": _mk(settings_widget.get("status_text") or "", visible=body_visible),
    }


def _trick_sleep_settings_session(actor):
    session = _trick_session(actor)
    sleep_widget = session.get("sleep_settings_widget")
    if not isinstance(sleep_widget, dict):
        sleep_widget = {}
        session["sleep_settings_widget"] = sleep_widget
    return sleep_widget


def _trick_sleep_settings_parse_blocks(value):
    blocks = []
    for line in str(value or "").splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [part.strip() for part in line.split("|")]
        if len(parts) < 4:
            continue
        blocks.append(
            {
                "label": parts[0] or "Sleep Segment",
                "start": parts[1],
                "end": parts[2],
                "days": [day.strip() for day in parts[3].split(",") if day.strip()],
            }
        )
    return blocks


def _trick_sleep_settings_blocks_text(blocks):
    rows = []
    for block in blocks or []:
        if not isinstance(block, dict):
            continue
        rows.append(
            f"{str(block.get('label') or 'Sleep Segment')}|{str(block.get('start') or '')}|{str(block.get('end') or '')}|{','.join(str(day) for day in (block.get('days') or []))}"
        )
    return "\n".join(rows)


def _trick_sleep_settings_refresh_chart(sleep_widget):
    blocks = _trick_sleep_settings_parse_blocks(sleep_widget.get("blocks_text") or "")
    total_minutes = 0
    for block in blocks:
        start = block.get("start")
        end = block.get("end")
        try:
            sh, sm = [int(x) for x in str(start).split(":", 1)]
            eh, em = [int(x) for x in str(end).split(":", 1)]
            mins = (eh * 60 + em) - (sh * 60 + sm)
            if mins <= 0:
                mins += 1440
            total_minutes += mins
        except Exception:
            continue
    hours = total_minutes // 60
    minutes = total_minutes % 60
    sleep_widget["chart_container"] = f"Sleep total: {hours}h {minutes}m" if minutes else f"Sleep total: {hours}h"


def _trick_sleep_settings_refresh(actor):
    sleep_widget = _trick_sleep_settings_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/template/list?type=day", timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        sleep_widget["status_text"] = "Failed to load templates."
        return False, {"error": str(e)}, str(e)
    templates = payload.get("templates") if isinstance(payload, dict) and isinstance(payload.get("templates"), list) else []
    sleep_widget["available_templates"] = [str(t) for t in templates]
    if not sleep_widget.get("selected_templates") and templates:
        sleep_widget["selected_templates"] = [str(templates[0])]
    _trick_sleep_settings_refresh_chart(sleep_widget)
    sleep_widget["status_text"] = "Templates loaded."
    return True, {"templates": templates}, None


def _trick_sleep_settings_apply_mode(actor):
    sleep_widget = _trick_sleep_settings_session(actor)
    mode = str(sleep_widget.get("mode_select") or "monophasic").strip().lower()
    splits = int(sleep_widget.get("splits_input") or 3)
    if mode == "biphasic":
        blocks = [
            {"label": "Core Sleep", "start": "22:30", "end": "06:00", "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]},
            {"label": "Second Sleep", "start": "14:00", "end": "15:00", "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]},
        ]
    elif mode == "polyphasic":
        blocks = [
            {"label": f"Sleep {idx + 1}", "start": "", "end": "", "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}
            for idx in range(max(3, min(6, splits)))
        ]
    else:
        blocks = [{"label": "Core Sleep", "start": "22:00", "end": "06:00", "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}]
    sleep_widget["blocks_text"] = _trick_sleep_settings_blocks_text(blocks)
    _trick_sleep_settings_refresh_chart(sleep_widget)
    sleep_widget["status_text"] = "Mode preset applied."
    return True, {"mode": mode, "blocks": blocks}, None


def _trick_sleep_settings_apply(actor):
    sleep_widget = _trick_sleep_settings_session(actor)
    blocks = _trick_sleep_settings_parse_blocks(sleep_widget.get("blocks_text") or "")
    if not blocks:
        sleep_widget["status_text"] = "Add at least one sleep block."
        return False, {"error": "Missing blocks"}, "Missing blocks"
    names = list(sleep_widget.get("selected_templates") or [])
    mode = str(sleep_widget.get("template_mode_select") or "selected")
    if mode == "new":
        names = [str(sleep_widget.get("template_name_input") or "").strip() or "Sleep Skeleton"]
    elif mode == "all":
        names = list(sleep_widget.get("available_templates") or [])
    if not names:
        sleep_widget["status_text"] = "Select at least one template."
        return False, {"error": "Missing templates"}, "Missing templates"

    entries = []
    for idx, block in enumerate(blocks, start=1):
        label = str(block.get("label") or f"Sleep {idx}")
        entries.append(
            {
                "name": label,
                "type": "timeblock",
                "start_time": str(block.get("start") or ""),
                "end_time": str(block.get("end") or ""),
                "tags": ["anchor", "sleep"],
                "category": "sleep",
                "sleep": True,
                "description": "sleep anchor created by Sleep Settings widget.",
            }
        )

    for name in names:
        req = urlrequest.Request(
            "http://127.0.0.1:7357/api/template",
            data=json.dumps({"type": "day", "name": name, "children": entries}).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            with urlrequest.urlopen(req, timeout=15) as resp:
                _ = resp.read()
        except Exception as e:
            sleep_widget["status_text"] = "Apply failed."
            return False, {"error": str(e)}, str(e)
    sleep_widget["status_text"] = "Sleep anchors applied."
    return True, {"templates": names, "entries": entries}, None


def _trick_sleep_settings_elements(actor):
    sleep_widget = _trick_sleep_settings_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(sleep_widget.get("closed"))
    visible = not closed
    minimized = bool(sleep_widget.get("minimized"))
    body_visible = visible and not minimized
    return {
        "widget.sleep_settings.title": _mk("Sleep Settings", visible=visible),
        "widget.sleep_settings.minimize_button": _mk("_", visible=visible),
        "widget.sleep_settings.close_button": _mk("x", visible=visible),
        "widget.sleep_settings.mode_select": _mk(sleep_widget.get("mode_select") or "monophasic", visible=body_visible),
        "widget.sleep_settings.splits_input": _mk(sleep_widget.get("splits_input"), visible=body_visible),
        "widget.sleep_settings.apply_mode_button": _mk("Apply Mode Preset", visible=body_visible),
        "widget.sleep_settings.blocks_container": _mk(sleep_widget.get("blocks_text") or "", visible=body_visible),
        "widget.sleep_settings.chart_container": _mk(sleep_widget.get("chart_container") or "", visible=body_visible),
        "widget.sleep_settings.template_mode_select": _mk(sleep_widget.get("template_mode_select") or "selected", visible=body_visible),
        "widget.sleep_settings.template_name_input": _mk(sleep_widget.get("template_name_input") or "", visible=body_visible),
        "widget.sleep_settings.templates_text": _mk(", ".join(sleep_widget.get("available_templates") or []), visible=body_visible),
        "widget.sleep_settings.add_segment_button": _mk("Add Sleep Segment", visible=body_visible),
        "widget.sleep_settings.add_sleep_in_button": _mk("Add Sleep-In", visible=body_visible),
        "widget.sleep_settings.apply_sleep_button": _mk("Apply Sleep Anchors", visible=body_visible),
        "widget.sleep_settings.status_text": _mk(sleep_widget.get("status_text") or "", visible=body_visible),
    }


def _trick_link_session(actor):
    session = _trick_session(actor)
    link_widget = session.get("link_widget")
    if not isinstance(link_widget, dict):
        link_widget = {}
        session["link_widget"] = link_widget
    return link_widget


def _trick_link_write_settings(link_widget):
    try:
        os.makedirs(os.path.dirname(_LINK_SETTINGS_PATH), exist_ok=True)
        with open(_LINK_SETTINGS_PATH, "w", encoding="utf-8") as f:
            yaml.safe_dump(
                {
                    "peer": str(link_widget.get("peer_input") or ""),
                    "token": str(link_widget.get("token_input") or ""),
                    "board": str(link_widget.get("board_select") or ""),
                    "link_id": _load_link_settings().get("link_id") or f"link-{secrets.token_hex(4)}",
                },
                f,
                allow_unicode=True,
                sort_keys=False,
            )
    except Exception:
        pass


def _trick_link_refresh(actor):
    link_widget = _trick_link_session(actor)
    settings = _load_link_settings()
    link_widget["peer_input"] = str(settings.get("peer") or link_widget.get("peer_input") or "")
    link_widget["token_input"] = str(settings.get("token") or link_widget.get("token_input") or "")
    link_widget["board_select"] = str(settings.get("board") or link_widget.get("board_select") or "")
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/items?type=canvas_board", timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        link_widget["status_text"] = "offline"
        return False, {"error": str(e)}, str(e)
    items = payload.get("items") if isinstance(payload, dict) and isinstance(payload.get("items"), list) else []
    link_widget["boards"] = [str(item.get("name") or "") for item in items if isinstance(item, dict)]
    if not link_widget.get("board_select") and link_widget["boards"]:
        link_widget["board_select"] = link_widget["boards"][0]
    link_widget["status_text"] = "offline" if not link_widget.get("connected") else str(link_widget.get("status_text") or "connecting")
    return True, {"boards": link_widget["boards"]}, None


def _trick_link_connect(actor):
    link_widget = _trick_link_session(actor)
    peer = str(link_widget.get("peer_input") or "").strip()
    token = str(link_widget.get("token_input") or "").strip()
    board = str(link_widget.get("board_select") or "").strip()
    if not peer or not token or not board:
        link_widget["status_text"] = "offline"
        return False, {"error": "Missing peer, token, or board"}, "Missing peer, token, or board"
    link_widget["connected"] = True
    link_widget["status_text"] = "connecting"
    _trick_link_write_settings(link_widget)
    return _trick_link_sync(actor)


def _trick_link_sync(actor):
    link_widget = _trick_link_session(actor)
    peer = str(link_widget.get("peer_input") or "").strip().rstrip("/")
    if peer and not peer.startswith("http://") and not peer.startswith("https://"):
        peer = f"http://{peer}"
    token = str(link_widget.get("token_input") or "").strip()
    board = str(link_widget.get("board_select") or "").strip()
    if not link_widget.get("connected"):
        link_widget["status_text"] = "offline"
        return False, {"error": "Not connected"}, "Not connected"
    try:
        req = urlrequest.Request(
            f"{peer}/api/link/board?name={quote(board)}",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urlrequest.urlopen(req, timeout=15) as resp:
            _ = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
        with urlrequest.urlopen(f"{peer}/api/link/status", timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        link_widget["connected"] = False
        link_widget["status_text"] = "offline"
        link_widget["peer_status_text"] = "offline"
        return False, {"error": str(e)}, str(e)
    link_widget["status_text"] = "synced"
    link_widget["peer_status_text"] = str(payload.get("link_id") or "online")
    link_widget["last_sync_text"] = f"Last sync: {datetime.utcnow().strftime('%H:%M:%S')}"
    return True, {"board": board}, None


def _trick_link_invite(actor):
    link_widget = _trick_link_session(actor)
    board = str(link_widget.get("board_select") or "").strip()
    if not board:
        link_widget["status_text"] = "offline"
        return False, {"error": "Missing board"}, "Missing board"
    try:
        with urlrequest.urlopen(f"http://127.0.0.1:7357/api/link/invite?board={quote(board)}", timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        return False, {"error": str(e)}, str(e)
    link_widget["invite_text"] = str(payload.get("url") or "")
    link_widget["status_text"] = "invite ready"
    return True, payload, None


def _trick_link_disconnect(actor):
    link_widget = _trick_link_session(actor)
    link_widget["connected"] = False
    link_widget["status_text"] = "offline"
    link_widget["peer_status_text"] = "offline"
    link_widget["last_sync_text"] = "Last sync: never"
    return True, {"connected": False}, None


def _trick_link_elements(actor):
    link_widget = _trick_link_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {
            "value": value,
            "text": "" if value is None else str(value),
            "visible": bool(visible),
            "enabled": bool(enabled),
        }

    closed = bool(link_widget.get("closed"))
    visible = not closed
    minimized = bool(link_widget.get("minimized"))
    body_visible = visible and not minimized
    connected = bool(link_widget.get("connected"))
    return {
        "widget.link.title": _mk("Link", visible=visible),
        "widget.link.minimize_button": _mk("_", visible=visible),
        "widget.link.close_button": _mk("x", visible=visible),
        "widget.link.peer_input": _mk(link_widget.get("peer_input") or "", visible=body_visible),
        "widget.link.token_input": _mk(link_widget.get("token_input") or "", visible=body_visible),
        "widget.link.board_select": _mk(link_widget.get("board_select") or "", visible=body_visible),
        "widget.link.boards_text": _mk(", ".join(link_widget.get("boards") or []), visible=body_visible),
        "widget.link.connect_button": _mk("Connect", visible=body_visible, enabled=not connected),
        "widget.link.sync_button": _mk("Sync Now", visible=body_visible, enabled=connected),
        "widget.link.invite_button": _mk("Invite", visible=body_visible),
        "widget.link.disconnect_button": _mk("Disconnect", visible=body_visible, enabled=connected),
        "widget.link.status_text": _mk(link_widget.get("status_text") or "", visible=body_visible),
        "widget.link.peer_status_text": _mk(link_widget.get("peer_status_text") or "", visible=body_visible),
        "widget.link.last_sync_text": _mk(link_widget.get("last_sync_text") or "", visible=body_visible),
        "widget.link.invite_text": _mk(link_widget.get("invite_text") or "", visible=body_visible),
    }


def _trick_trends_session(actor):
    session = _trick_session(actor)
    trends_widget = session.get("trends_widget")
    if not isinstance(trends_widget, dict):
        trends_widget = {}
        session["trends_widget"] = trends_widget
    return trends_widget


def _trick_trends_refresh(actor):
    trends_widget = _trick_trends_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/trends/metrics", timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        trends_widget["metrics_container"] = f"Error: {e}"
        trends_widget["status_text"] = "Load failed."
        return False, {"error": str(e)}, str(e)
    metrics = payload.get("metrics") if isinstance(payload, dict) else {}
    parts = []
    if isinstance(metrics, dict):
        habit_stats = metrics.get("habit_stats") if isinstance(metrics.get("habit_stats"), dict) else {}
        if habit_stats:
            parts.append(f"Habits: {habit_stats.get('habits_with_current_streak', 0)} active streaks")
        goal_stats = metrics.get("goal_stats") if isinstance(metrics.get("goal_stats"), dict) else {}
        if goal_stats:
            parts.append(f"Goals: {goal_stats.get('total_goals', 0)} total")
        timer_stats = metrics.get("timer_stats") if isinstance(metrics.get("timer_stats"), dict) else {}
        if timer_stats:
            parts.append(f"Focus: {timer_stats.get('focus_minutes', 0)} minutes")
    trends_widget["metrics_container"] = "\n".join(parts) if parts else "No data available"
    trends_widget["status_text"] = "Metrics loaded."
    return True, {"metrics": metrics}, None


def _trick_trends_elements(actor):
    trends_widget = _trick_trends_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {"value": value, "text": "" if value is None else str(value), "visible": bool(visible), "enabled": bool(enabled)}

    closed = bool(trends_widget.get("closed"))
    visible = not closed
    minimized = bool(trends_widget.get("minimized"))
    body_visible = visible and not minimized
    return {
        "widget.trends.title": _mk("Performance", visible=visible),
        "widget.trends.refresh_button": _mk("Refresh", visible=visible),
        "widget.trends.minimize_button": _mk("-", visible=visible),
        "widget.trends.close_button": _mk("x", visible=visible),
        "widget.trends.metrics_container": _mk(trends_widget.get("metrics_container") or "", visible=body_visible),
        "widget.trends.status_text": _mk(trends_widget.get("status_text") or "", visible=body_visible),
    }


def _trick_admin_session(actor):
    session = _trick_session(actor)
    admin_widget = session.get("admin_widget")
    if not isinstance(admin_widget, dict):
        admin_widget = {}
        session["admin_widget"] = admin_widget
    return admin_widget


def _trick_admin_refresh(actor):
    admin_widget = _trick_admin_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/system/databases", timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        admin_widget["status_text"] = "Failed to load databases."
        return False, {"error": str(e)}, str(e)
    dbs = payload.get("databases") if isinstance(payload, dict) and isinstance(payload.get("databases"), list) else []
    admin_widget["dbs"] = [str(db.get("name") or "") for db in dbs if isinstance(db, dict)]
    if not admin_widget.get("db_select") and admin_widget["dbs"]:
        admin_widget["db_select"] = admin_widget["dbs"][0]
    admin_widget["status_text"] = "Admin data loaded."
    return True, {"databases": dbs}, None


def _trick_admin_run(actor, command_text):
    admin_widget = _trick_admin_session(actor)
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/system/command",
        data=json.dumps({"command": command_text}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        admin_widget["status_text"] = f"Command failed: {e}"
        return False, {"error": str(e)}, str(e)
    if not payload.get("ok", False):
        err = str(payload.get("error") or payload.get("stderr") or "Command failed")
        admin_widget["status_text"] = err
        return False, payload, err
    admin_widget["status_text"] = str(payload.get("stdout") or payload.get("message") or "Done").strip() or "Done"
    return True, payload, None


def _trick_admin_elements(actor):
    admin_widget = _trick_admin_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {"value": value, "text": "" if value is None else str(value), "visible": bool(visible), "enabled": bool(enabled)}

    closed = bool(admin_widget.get("closed"))
    visible = not closed
    minimized = bool(admin_widget.get("minimized"))
    body_visible = visible and not minimized
    return {
        "widget.admin.title": _mk("System Admin", visible=visible),
        "widget.admin.minimize_button": _mk("_", visible=visible),
        "widget.admin.close_button": _mk("x", visible=visible),
        "widget.admin.db_select": _mk(admin_widget.get("db_select") or "", visible=body_visible),
        "widget.admin.dbs_text": _mk(", ".join(admin_widget.get("dbs") or []), visible=body_visible),
        "widget.admin.registry_select": _mk(admin_widget.get("registry_select") or "wizards", visible=body_visible),
        "widget.admin.clear_logs_button": _mk("Purge Logs", visible=body_visible),
        "widget.admin.clear_schedules_button": _mk("Purge Sch.", visible=body_visible),
        "widget.admin.clear_cache_button": _mk("Reset Cache", visible=body_visible),
        "widget.admin.clear_temp_button": _mk("Clear Temp", visible=body_visible),
        "widget.admin.clear_db_button": _mk("Delete DB", visible=body_visible),
        "widget.admin.clear_registry_button": _mk("Clear Cache", visible=body_visible),
        "widget.admin.clear_archives_button": _mk("Delete All Archives", visible=body_visible),
        "widget.admin.status_text": _mk(admin_widget.get("status_text") or "", visible=body_visible),
    }


def _trick_cockpit_minimap_session(actor):
    session = _trick_session(actor)
    minimap_widget = session.get("cockpit_minimap_widget")
    if not isinstance(minimap_widget, dict):
        minimap_widget = {}
        session["cockpit_minimap_widget"] = minimap_widget
    return minimap_widget


def _trick_cockpit_minimap_elements(actor):
    minimap_widget = _trick_cockpit_minimap_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {"value": value, "text": "" if value is None else str(value), "visible": bool(visible), "enabled": bool(enabled)}

    closed = bool(minimap_widget.get("closed"))
    visible = not closed
    minimized = bool(minimap_widget.get("minimized"))
    body_visible = visible and not minimized
    return {
        "widget.cockpit_minimap.title": _mk("Cockpit Minimap", visible=visible),
        "widget.cockpit_minimap.collapse_button": _mk("_", visible=visible),
        "widget.cockpit_minimap.track_container": _mk(minimap_widget.get("track_container") or "", visible=body_visible),
        "widget.cockpit_minimap.hint_text": _mk(minimap_widget.get("hint_text") or "", visible=body_visible),
    }


def _trick_debug_console_session(actor):
    session = _trick_session(actor)
    debug_widget = session.get("debug_console_widget")
    if not isinstance(debug_widget, dict):
        debug_widget = {}
        session["debug_console_widget"] = debug_widget
    return debug_widget


def _trick_debug_console_refresh(actor):
    debug_widget = _trick_debug_console_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/logs?limit=20", timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        debug_widget["status_text"] = "Refresh failed."
        return False, {"error": str(e)}, str(e)
    logs = payload.get("logs") if isinstance(payload, dict) and isinstance(payload.get("logs"), list) else []
    debug_widget["output_text"] = "\n".join(str(line) for line in logs)
    debug_widget["status_text"] = "Logs refreshed."
    return True, {"logs": logs}, None


def _trick_debug_console_elements(actor):
    debug_widget = _trick_debug_console_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {"value": value, "text": "" if value is None else str(value), "visible": bool(visible), "enabled": bool(enabled)}

    closed = bool(debug_widget.get("closed"))
    visible = not closed
    minimized = bool(debug_widget.get("minimized"))
    body_visible = visible and not minimized
    return {
        "widget.debug_console.title": _mk("Debug Console", visible=visible),
        "widget.debug_console.minimize_button": _mk("_", visible=visible),
        "widget.debug_console.clear_button": _mk("Clear", visible=visible),
        "widget.debug_console.close_button": _mk("x", visible=visible),
        "widget.debug_console.filter_select": _mk(debug_widget.get("filter_select") or "all", visible=body_visible),
        "widget.debug_console.refresh_button": _mk("Refresh", visible=body_visible),
        "widget.debug_console.open_editor_button": _mk("Open in Editor", visible=body_visible),
        "widget.debug_console.copy_button": _mk("Copy", visible=body_visible),
        "widget.debug_console.output_text": _mk(debug_widget.get("output_text") or "", visible=body_visible),
        "widget.debug_console.status_text": _mk(debug_widget.get("status_text") or "", visible=body_visible),
    }


def _trick_clock_session(actor):
    session = _trick_session(actor)
    clock_widget = session.get("clock_widget")
    if not isinstance(clock_widget, dict):
        clock_widget = {}
        session["clock_widget"] = clock_widget
    return clock_widget


def _trick_clock_refresh(actor):
    clock_widget = _trick_clock_session(actor)
    now = datetime.now()
    clock_widget["time_text"] = now.strftime("%H:%M")
    clock_widget["date_text"] = now.strftime("%Y-%m-%d")
    clock_widget["status_text"] = "Clock refreshed."
    return True, {"time": clock_widget["time_text"]}, None


def _trick_clock_elements(actor):
    clock_widget = _trick_clock_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {"value": value, "text": "" if value is None else str(value), "visible": bool(visible), "enabled": bool(enabled)}

    closed = bool(clock_widget.get("closed"))
    visible = not closed
    minimized = bool(clock_widget.get("minimized"))
    body_visible = visible and not minimized
    return {
        "widget.clock.title": _mk("Chronos Clock", visible=visible),
        "widget.clock.minimize_button": _mk("_", visible=visible),
        "widget.clock.close_button": _mk("x", visible=visible),
        "widget.clock.mode_select": _mk(clock_widget.get("mode_select") or "analog", visible=body_visible),
        "widget.clock.time_text": _mk(clock_widget.get("time_text") or "", visible=body_visible),
        "widget.clock.date_text": _mk(clock_widget.get("date_text") or "", visible=body_visible),
        "widget.clock.appointment_button": _mk("Set Appointment", visible=body_visible),
        "widget.clock.alarm_button": _mk("Set Alarm", visible=body_visible),
        "widget.clock.reminder_button": _mk("Set Reminder", visible=body_visible),
        "widget.clock.status_text": _mk(clock_widget.get("status_text") or "", visible=body_visible),
    }


def _trick_journal_session(actor):
    session = _trick_session(actor)
    journal_widget = session.get("journal_widget")
    if not isinstance(journal_widget, dict):
        journal_widget = {}
        session["journal_widget"] = journal_widget
    return journal_widget


def _trick_journal_refresh(actor):
    journal_widget = _trick_journal_session(actor)
    entries = []
    for item_type in ("journal_entry", "dream_diary_entry"):
        try:
            with urlrequest.urlopen(f"http://127.0.0.1:7357/api/items?type={item_type}", timeout=15) as resp:
                payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
        except Exception:
            continue
        rows = payload.get("items") if isinstance(payload, dict) and isinstance(payload.get("items"), list) else []
        for row in rows:
            if isinstance(row, dict):
                entries.append((item_type, str(row.get("name") or "")))
    journal_widget["list_text"] = "\n".join(name for _, name in entries)
    journal_widget["status_text"] = f"Loaded {len(entries)} entries."
    return True, {"entries": entries}, None


def _trick_journal_save(actor):
    journal_widget = _trick_journal_session(actor)
    item_type = str(journal_widget.get("entry_type_select") or "journal_entry")
    title = str(journal_widget.get("title_input") or "").strip()
    if not title:
        journal_widget["status_text"] = "Title is required."
        return False, {"error": "Title is required"}, "Title is required"
    payload = {
        "type": item_type,
        "name": title,
        "properties": {
            "type": item_type,
            "name": title,
            "date": str(journal_widget.get("date_input") or ""),
            "tags": [s.strip() for s in str(journal_widget.get("tags_input") or "").split(",") if s.strip()],
            "content": str(journal_widget.get("content_input") or ""),
        },
    }
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/item",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=15) as resp:
            _ = resp.read()
    except Exception as e:
        journal_widget["status_text"] = "Save failed."
        return False, {"error": str(e)}, str(e)
    journal_widget["selected_type"] = item_type
    journal_widget["selected_name"] = title
    journal_widget["status_text"] = "Saved."
    return _trick_journal_refresh(actor)


def _trick_journal_to_sticky(actor):
    journal_widget = _trick_journal_session(actor)
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/sticky-notes",
        data=json.dumps({"name": str(journal_widget.get("title_input") or "").strip(), "content": str(journal_widget.get("content_input") or "")}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=15) as resp:
            _ = resp.read()
    except Exception as e:
        journal_widget["status_text"] = "Sticky export failed."
        return False, {"error": str(e)}, str(e)
    journal_widget["status_text"] = "Sent to Sticky Notes."
    return True, {}, None


def _trick_journal_elements(actor):
    journal_widget = _trick_journal_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {"value": value, "text": "" if value is None else str(value), "visible": bool(visible), "enabled": bool(enabled)}

    closed = bool(journal_widget.get("closed"))
    visible = not closed
    minimized = bool(journal_widget.get("minimized"))
    body_visible = visible and not minimized
    return {
        "widget.journal.title": _mk("Journal", visible=visible),
        "widget.journal.minimize_button": _mk("_", visible=visible),
        "widget.journal.close_button": _mk("x", visible=visible),
        "widget.journal.type_filter_select": _mk(journal_widget.get("type_filter_select") or "all", visible=body_visible),
        "widget.journal.search_input": _mk(journal_widget.get("search_input") or "", visible=body_visible),
        "widget.journal.new_button": _mk("New", visible=body_visible),
        "widget.journal.save_button": _mk("Save", visible=body_visible),
        "widget.journal.sticky_button": _mk("To Sticky", visible=body_visible),
        "widget.journal.entry_type_select": _mk(journal_widget.get("entry_type_select") or "journal_entry", visible=body_visible),
        "widget.journal.date_input": _mk(journal_widget.get("date_input") or "", visible=body_visible),
        "widget.journal.title_input": _mk(journal_widget.get("title_input") or "", visible=body_visible),
        "widget.journal.tags_input": _mk(journal_widget.get("tags_input") or "", visible=body_visible),
        "widget.journal.content_input": _mk(journal_widget.get("content_input") or "", visible=body_visible),
        "widget.journal.list_container": _mk(journal_widget.get("list_text") or "", visible=body_visible),
        "widget.journal.status_text": _mk(journal_widget.get("status_text") or "", visible=body_visible),
    }


def _trick_mp3_player_session(actor):
    session = _trick_session(actor)
    mp3_widget = session.get("mp3_player_widget")
    if not isinstance(mp3_widget, dict):
        mp3_widget = {}
        session["mp3_player_widget"] = mp3_widget
    return mp3_widget


def _trick_mp3_player_refresh(actor):
    mp3_widget = _trick_mp3_player_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/media/mp3", timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        mp3_widget["status_text"] = "Library load failed."
        return False, {"error": str(e)}, str(e)
    files = payload.get("files") if isinstance(payload, dict) and isinstance(payload.get("files"), list) else []
    mp3_widget["library_text"] = "\n".join(str(row.get("name") or row.get("filename") or row) for row in files)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/media/playlists", timeout=15) as resp:
            playlists_payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception:
        playlists_payload = {}
    playlists = playlists_payload.get("playlists") if isinstance(playlists_payload, dict) and isinstance(playlists_payload.get("playlists"), list) else []
    playlist_names = [str(row.get("slug") or row.get("name") or row) for row in playlists]
    mp3_widget["playlist_text"] = "\n".join(playlist_names)
    if not mp3_widget.get("playlist_select") and playlist_names:
        mp3_widget["playlist_select"] = playlist_names[0]
    if files:
        first = files[0]
        if isinstance(first, dict):
            mp3_widget["track_title_text"] = str(first.get("title") or first.get("name") or "")
            mp3_widget["track_artist_text"] = str(first.get("artist") or "")
    mp3_widget["status_text"] = "Library refreshed."
    return True, {"files": files}, None


def _trick_mp3_player_elements(actor):
    mp3_widget = _trick_mp3_player_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {"value": value, "text": "" if value is None else str(value), "visible": bool(visible), "enabled": bool(enabled)}

    closed = bool(mp3_widget.get("closed"))
    visible = not closed
    minimized = bool(mp3_widget.get("minimized"))
    body_visible = visible and not minimized
    return {
        "widget.mp3_player.title": _mk("MP3 Player", visible=visible),
        "widget.mp3_player.minimize_button": _mk("_", visible=visible),
        "widget.mp3_player.close_button": _mk("x", visible=visible),
        "widget.mp3_player.playlist_select": _mk(mp3_widget.get("playlist_select") or "", visible=body_visible),
        "widget.mp3_player.refresh_button": _mk("Refresh", visible=body_visible),
        "widget.mp3_player.play_pause_button": _mk("PlayPause", visible=body_visible),
        "widget.mp3_player.prev_button": _mk("Prev", visible=body_visible),
        "widget.mp3_player.next_button": _mk("Next", visible=body_visible),
        "widget.mp3_player.track_title_text": _mk(mp3_widget.get("track_title_text") or "", visible=body_visible),
        "widget.mp3_player.track_artist_text": _mk(mp3_widget.get("track_artist_text") or "", visible=body_visible),
        "widget.mp3_player.library_container": _mk(mp3_widget.get("library_text") or "", visible=body_visible),
        "widget.mp3_player.playlist_container": _mk(mp3_widget.get("playlist_text") or "", visible=body_visible),
        "widget.mp3_player.status_text": _mk(mp3_widget.get("status_text") or "", visible=body_visible),
    }


def _trick_sticky_notes_session(actor):
    session = _trick_session(actor)
    sticky_widget = session.get("sticky_notes_widget")
    if not isinstance(sticky_widget, dict):
        sticky_widget = {}
        session["sticky_notes_widget"] = sticky_widget
    return sticky_widget


def _trick_sticky_notes_refresh(actor):
    sticky_widget = _trick_sticky_notes_session(actor)
    try:
        with urlrequest.urlopen("http://127.0.0.1:7357/api/sticky-notes", timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
    except Exception as e:
        sticky_widget["status_text"] = "Refresh failed."
        return False, {"error": str(e)}, str(e)
    notes = payload.get("notes") if isinstance(payload, dict) and isinstance(payload.get("notes"), list) else []
    sticky_widget["notes_text"] = "\n".join(str(note.get("name") or "") for note in notes if isinstance(note, dict))
    sticky_widget["status_text"] = f"Loaded {len(notes)} notes."
    return True, {"notes": notes}, None


def _trick_sticky_notes_create(actor):
    sticky_widget = _trick_sticky_notes_session(actor)
    content = str(sticky_widget.get("new_content_input") or "").strip()
    if not content:
        sticky_widget["status_text"] = "Content is required."
        return False, {"error": "Content is required"}, "Content is required"
    req = urlrequest.Request(
        "http://127.0.0.1:7357/api/sticky-notes",
        data=json.dumps({"name": "Sticky Note", "content": content, "color": str(sticky_widget.get("new_color_select") or "amber")}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=15) as resp:
            _ = resp.read()
    except Exception as e:
        sticky_widget["status_text"] = "Create failed."
        return False, {"error": str(e)}, str(e)
    sticky_widget["status_text"] = "Created sticky note."
    return _trick_sticky_notes_refresh(actor)


def _trick_sticky_notes_elements(actor):
    sticky_widget = _trick_sticky_notes_session(actor)

    def _mk(value, visible=True, enabled=True):
        return {"value": value, "text": "" if value is None else str(value), "visible": bool(visible), "enabled": bool(enabled)}

    closed = bool(sticky_widget.get("closed"))
    visible = not closed
    minimized = bool(sticky_widget.get("minimized"))
    body_visible = visible and not minimized
    return {
        "widget.sticky_notes.title": _mk("Sticky Notes", visible=visible),
        "widget.sticky_notes.refresh_button": _mk("Refresh", visible=visible),
        "widget.sticky_notes.minimize_button": _mk("_", visible=visible),
        "widget.sticky_notes.close_button": _mk("x", visible=visible),
        "widget.sticky_notes.new_content_input": _mk(sticky_widget.get("new_content_input") or "", visible=body_visible),
        "widget.sticky_notes.new_color_select": _mk(sticky_widget.get("new_color_select") or "amber", visible=body_visible),
        "widget.sticky_notes.create_button": _mk("Create", visible=body_visible),
        "widget.sticky_notes.notes_container": _mk(sticky_widget.get("notes_text") or "", visible=body_visible),
        "widget.sticky_notes.status_text": _mk(sticky_widget.get("status_text") or "", visible=body_visible),
    }


def _trick_all_elements(actor):
    elements = {}
    elements.update(_trick_timer_elements(actor))
    elements.update(_trick_today_elements(actor))
    elements.update(_trick_terminal_elements(actor))
    elements.update(_trick_item_manager_elements(actor))
    elements.update(_trick_status_elements(actor))
    elements.update(_trick_goal_tracker_elements(actor))
    elements.update(_trick_milestones_elements(actor))
    elements.update(_trick_commitments_elements(actor))
    elements.update(_trick_rewards_elements(actor))
    elements.update(_trick_achievements_elements(actor))
    elements.update(_trick_habit_tracker_elements(actor))
    elements.update(_trick_review_elements(actor))
    elements.update(_trick_variables_elements(actor))
    elements.update(_trick_resolution_tracker_elements(actor))
    elements.update(_trick_notes_elements(actor))
    elements.update(_trick_inventory_manager_elements(actor))
    elements.update(_trick_profile_elements(actor))
    elements.update(_trick_settings_elements(actor))
    elements.update(_trick_sleep_settings_elements(actor))
    elements.update(_trick_link_elements(actor))
    elements.update(_trick_trends_elements(actor))
    elements.update(_trick_admin_elements(actor))
    elements.update(_trick_cockpit_minimap_elements(actor))
    elements.update(_trick_debug_console_elements(actor))
    elements.update(_trick_clock_elements(actor))
    elements.update(_trick_journal_elements(actor))
    elements.update(_trick_mp3_player_elements(actor))
    elements.update(_trick_sticky_notes_elements(actor))
    return elements


def _trick_note_surface_action(surface_id, action, actor):
    surface_id = str(surface_id or "").strip().lower()
    action = str(action or "").strip().lower()
    if surface_id == "widget.today":
        today = _trick_today_session(actor)
        if action == "open":
            today["closed"] = False
        elif action == "close":
            today["closed"] = True
    if surface_id == "widget.terminal":
        terminal = _trick_terminal_session(actor)
        if action == "open":
            terminal["closed"] = False
        elif action == "close":
            terminal["closed"] = True
    if surface_id == "widget.item_manager":
        item_manager = _trick_item_manager_session(actor)
        if action == "open":
            item_manager["closed"] = False
        elif action == "close":
            item_manager["closed"] = True
    if surface_id == "widget.status":
        status_widget = _trick_status_session(actor)
        if action == "open":
            status_widget["closed"] = False
        elif action == "close":
            status_widget["closed"] = True
    if surface_id == "widget.goal_tracker":
        goal_tracker = _trick_goal_tracker_session(actor)
        if action == "open":
            goal_tracker["closed"] = False
        elif action == "close":
            goal_tracker["closed"] = True
    if surface_id == "widget.milestones":
        milestones_widget = _trick_milestones_session(actor)
        if action == "open":
            milestones_widget["closed"] = False
        elif action == "close":
            milestones_widget["closed"] = True
    if surface_id == "widget.commitments":
        commitments_widget = _trick_commitments_session(actor)
        if action == "open":
            commitments_widget["closed"] = False
        elif action == "close":
            commitments_widget["closed"] = True
    if surface_id == "widget.rewards":
        rewards_widget = _trick_rewards_session(actor)
        if action == "open":
            rewards_widget["closed"] = False
        elif action == "close":
            rewards_widget["closed"] = True
    if surface_id == "widget.achievements":
        achievements_widget = _trick_achievements_session(actor)
        if action == "open":
            achievements_widget["closed"] = False
        elif action == "close":
            achievements_widget["closed"] = True
    if surface_id == "widget.habit_tracker":
        habit_tracker = _trick_habit_tracker_session(actor)
        if action == "open":
            habit_tracker["closed"] = False
        elif action == "close":
            habit_tracker["closed"] = True
    if surface_id == "widget.review":
        review_widget = _trick_review_session(actor)
        if action == "open":
            review_widget["closed"] = False
        elif action == "close":
            review_widget["closed"] = True
    if surface_id == "widget.variables":
        variables_widget = _trick_variables_session(actor)
        if action == "open":
            variables_widget["closed"] = False
        elif action == "close":
            variables_widget["closed"] = True
    if surface_id == "widget.resolution_tracker":
        resolution_tracker = _trick_resolution_tracker_session(actor)
        if action == "open":
            resolution_tracker["closed"] = False
        elif action == "close":
            resolution_tracker["closed"] = True
    if surface_id == "widget.notes":
        notes_widget = _trick_notes_session(actor)
        if action == "open":
            notes_widget["closed"] = False
        elif action == "close":
            notes_widget["closed"] = True
    if surface_id == "widget.inventory_manager":
        inventory_widget = _trick_inventory_manager_session(actor)
        if action == "open":
            inventory_widget["closed"] = False
        elif action == "close":
            inventory_widget["closed"] = True
    if surface_id == "widget.profile":
        profile_widget = _trick_profile_session(actor)
        if action == "open":
            profile_widget["closed"] = False
        elif action == "close":
            profile_widget["closed"] = True
    if surface_id == "widget.settings":
        settings_widget = _trick_settings_session(actor)
        if action == "open":
            settings_widget["closed"] = False
        elif action == "close":
            settings_widget["closed"] = True
    if surface_id == "widget.sleep_settings":
        sleep_widget = _trick_sleep_settings_session(actor)
        if action == "open":
            sleep_widget["closed"] = False
        elif action == "close":
            sleep_widget["closed"] = True
    if surface_id == "widget.link":
        link_widget = _trick_link_session(actor)
        if action == "open":
            link_widget["closed"] = False
        elif action == "close":
            link_widget["closed"] = True
    if surface_id == "widget.trends":
        trends_widget = _trick_trends_session(actor)
        if action == "open":
            trends_widget["closed"] = False
        elif action == "close":
            trends_widget["closed"] = True
    if surface_id == "widget.admin":
        admin_widget = _trick_admin_session(actor)
        if action == "open":
            admin_widget["closed"] = False
        elif action == "close":
            admin_widget["closed"] = True
    if surface_id == "widget.cockpit_minimap":
        minimap_widget = _trick_cockpit_minimap_session(actor)
        if action == "open":
            minimap_widget["closed"] = False
        elif action == "close":
            minimap_widget["closed"] = True
    if surface_id == "widget.debug_console":
        debug_widget = _trick_debug_console_session(actor)
        if action == "open":
            debug_widget["closed"] = False
        elif action == "close":
            debug_widget["closed"] = True
    if surface_id == "widget.clock":
        clock_widget = _trick_clock_session(actor)
        if action == "open":
            clock_widget["closed"] = False
        elif action == "close":
            clock_widget["closed"] = True
    if surface_id == "widget.journal":
        journal_widget = _trick_journal_session(actor)
        if action == "open":
            journal_widget["closed"] = False
        elif action == "close":
            journal_widget["closed"] = True
    if surface_id == "widget.mp3_player":
        mp3_widget = _trick_mp3_player_session(actor)
        if action == "open":
            mp3_widget["closed"] = False
        elif action == "close":
            mp3_widget["closed"] = True
    if surface_id == "widget.sticky_notes":
        sticky_widget = _trick_sticky_notes_session(actor)
        if action == "open":
            sticky_widget["closed"] = False
        elif action == "close":
            sticky_widget["closed"] = True


def _trick_surface_exists(surface_id):
    reg = _trick_registry()
    for s in reg.get("surfaces", []) if isinstance(reg, dict) else []:
        if str(s.get("id") or "").lower() == surface_id:
            return True
    return False


def _trick_surface_entry(surface_id):
    sid = str(surface_id or "").strip().lower()
    if not sid:
        return None
    reg = _trick_registry()
    for s in reg.get("surfaces", []) if isinstance(reg, dict) else []:
        if str(s.get("id") or "").lower() == sid:
            return s if isinstance(s, dict) else None
    return None


def _trick_ui_request_push(req: dict):
    global _TRICK_OPEN_SEQ
    if not isinstance(req, dict) or not req:
        return None
    with _TRICK_OPEN_LOCK:
        _TRICK_OPEN_SEQ += 1
        req = dict(req)
        req["id"] = int(_TRICK_OPEN_SEQ)
        req["requested_at"] = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    with _TRICK_OPEN_LOCK:
        _TRICK_OPEN_REQUESTS.append(req)
        if len(_TRICK_OPEN_REQUESTS) > 64:
            del _TRICK_OPEN_REQUESTS[:-64]
    return req


def _trick_open_request_push(surface_id, action: str = "open"):
    entry = _trick_surface_entry(surface_id)
    if not isinstance(entry, dict):
        return None
    return _trick_ui_request_push({
        "action": str(action or "open").strip().lower() or "open",
        "surface": str(entry.get("id") or "").strip().lower(),
        "type": str(entry.get("type") or "").strip().lower(),
        "name": str(entry.get("name") or "").strip().lower(),
        "label": str(entry.get("label") or "").strip(),
        "module": str(entry.get("module") or "").strip(),
    })


def _trick_highlight_request_push(target, actor="default", mode="spotlight", duration_ms=0, message=None):
    target_id = str(target or "").strip().lower()
    if not target_id:
        return None
    surface_id = ".".join(target_id.split(".")[:2]) if target_id.count(".") >= 1 else target_id
    entry = _trick_surface_entry(surface_id)
    if not isinstance(entry, dict):
        return None
    mode_value = str(mode or "spotlight").strip().lower() or "spotlight"
    if mode_value not in {"spotlight", "pulse"}:
        mode_value = "spotlight"
    try:
        duration = int(duration_ms or 0)
    except Exception:
        duration = 0
    duration = max(0, min(60000, duration))
    note = str(message or "").strip()
    return _trick_ui_request_push({
        "action": "highlight",
        "surface": str(entry.get("id") or "").strip().lower(),
        "target": target_id,
        "type": str(entry.get("type") or "").strip().lower(),
        "name": str(entry.get("name") or "").strip().lower(),
        "label": str(entry.get("label") or "").strip(),
        "module": str(entry.get("module") or "").strip(),
        "actor": _trick_actor_key(actor),
        "mode": mode_value,
        "duration_ms": duration,
        "message": note or None,
    })


def _trick_open_request_latest():
    with _TRICK_OPEN_LOCK:
        if not _TRICK_OPEN_REQUESTS:
            return None
        return _TRICK_OPEN_REQUESTS[-1]


def _trick_element_allowed(element_id, action):
    reg = _trick_registry()
    elements = reg.get("elements") if isinstance(reg, dict) else {}
    row = elements.get(element_id) if isinstance(elements, dict) else None
    if not isinstance(row, dict):
        return False
    actions = row.get("actions") if isinstance(row.get("actions"), list) else []
    return str(action).lower() in {str(a).lower() for a in actions}


def _trick_exec_timer(action_args, props=None):
    ok, out, err = run_console_command("timer", action_args, props or {})
    return ok, out, err, _timer_status_safe()


def _trick_click(target, actor):
    session = _trick_session(actor)
    status_key = str(_timer_status_safe().get("status") or "idle").lower()
    target = str(target or "").strip().lower()

    if target == "widget.timer.start_button":
        if status_key in {"running", "paused"}:
            ok, out, err, st = _trick_exec_timer(["stop"])
            return ok, {"status": st, "stdout": out, "stderr": err}, None if ok else (err or out or "Timer stop failed")
        prof = str(session.get("profile_select") or "classic_pomodoro").strip() or "classic_pomodoro"
        props = {
            "auto_advance": bool(session.get("auto_advance_checkbox", True)),
        }
        if session.get("bind_type_input"):
            props["type"] = str(session.get("bind_type_input")).strip()
        if session.get("bind_name_input"):
            props["name"] = str(session.get("bind_name_input")).strip()
        if session.get("cycles_input") not in (None, ""):
            try:
                props["cycles"] = int(session.get("cycles_input"))
            except Exception:
                pass
        ok, out, err, st = _trick_exec_timer(["start", prof], props)
        return ok, {"status": st, "stdout": out, "stderr": err}, None if ok else (err or out or "Timer start failed")

    if target == "widget.timer.pause_resume_button":
        cmd = "resume" if status_key == "paused" else "pause"
        ok, out, err, st = _trick_exec_timer([cmd])
        return ok, {"status": st, "stdout": out, "stderr": err}, None if ok else (err or out or f"Timer {cmd} failed")

    if target == "widget.timer.cancel_button":
        # Cancel in UI semantics maps to stopping the active timer run.
        # Prefer "stop" (supported by current timer CLI); keep a fallback
        # to "cancel" for forward/backward compatibility.
        ok, out, err, st = _trick_exec_timer(["stop"])
        if (not ok) and "Usage:" in str(out or ""):
            ok, out, err, st = _trick_exec_timer(["cancel"])
        return ok, {"status": st, "stdout": out, "stderr": err}, None if ok else (err or out or "Timer cancel/stop failed")

    if target == "widget.timer.confirm_yes_button":
        ok, out, err, st = _trick_exec_timer(["confirm", "yes"])
        return ok, {"status": st, "stdout": out, "stderr": err}, None if ok else (err or out or "Timer confirm yes failed")

    if target in {"widget.timer.confirm_skip_today_button", "widget.timer.confirm_later_button"}:
        ok, out, err, st = _trick_exec_timer(["confirm", "skip"])
        return ok, {"status": st, "stdout": out, "stderr": err}, None if ok else (err or out or "Timer confirm skip failed")

    if target == "widget.timer.confirm_start_over_button":
        ok, out, err, st = _trick_exec_timer(["confirm", "start_over"])
        return ok, {"status": st, "stdout": out, "stderr": err}, None if ok else (err or out or "Timer confirm start_over failed")

    if target == "widget.timer.confirm_stretch_button":
        ok, out, err, st = _trick_exec_timer(["confirm", "stretch"])
        return ok, {"status": st, "stdout": out, "stderr": err}, None if ok else (err or out or "Timer confirm stretch failed")

    if target == "widget.timer.start_day_button":
        ok, out, err = run_console_command("start", ["day"])
        st = _timer_status_safe()
        return ok, {"status": st, "stdout": out, "stderr": err}, None if ok else (err or out or "Start day failed")

    if target in {"widget.timer.refresh_button", "widget.timer.minimize_button", "widget.timer.close_button"}:
        # Refresh is read-only server-side; minimize/close are UI-local and no-op via API.
        return True, {"status": _timer_status_safe(), "ui_only": target.endswith("minimize_button") or target.endswith("close_button")}, None

    today = _trick_today_session(actor)

    if target == "widget.today.refresh_button":
        today["status_text"] = "Refreshing schedule..."
        today["selection_hint"] = "Select a day in Calendar to preview the schedule."
        today["closed"] = False
        return True, {"status_text": today["status_text"], "refreshed": True}, None

    if target == "widget.today.reschedule_button":
        today["status_text"] = "Generating schedule..."
        props = _trick_today_props(today)
        ok, out, err = _trick_today_run(["reschedule"], props)
        today["status_text"] = "Schedule generated." if ok else "Reschedule failed."
        return ok, {
            "status_text": today["status_text"],
            "stdout": out,
            "stderr": err,
            "properties": props,
        }, None if ok else (err or out or "Today reschedule failed")

    if target == "widget.today.preset_safe_button":
        _trick_today_apply_preset(today, "safe")
        return True, {"preset": "safe", "status_text": today.get("status_text")}, None

    if target == "widget.today.preset_balanced_button":
        _trick_today_apply_preset(today, "balanced")
        return True, {"preset": "balanced", "status_text": today.get("status_text")}, None

    if target == "widget.today.preset_aggressive_button":
        _trick_today_apply_preset(today, "aggressive")
        return True, {"preset": "aggressive", "status_text": today.get("status_text")}, None

    if target == "widget.today.add_window_filter_row_button":
        today["window_filter_row_count"] = max(0, int(today.get("window_filter_row_count") or 0)) + 1
        return True, {"row_count": today["window_filter_row_count"]}, None

    if target == "widget.today.minimize_button":
        today["minimized"] = not bool(today.get("minimized"))
        return True, {"minimized": today["minimized"], "ui_only": True}, None

    if target == "widget.today.close_button":
        today["closed"] = True
        return True, {"closed": True, "ui_only": True}, None

    terminal = _trick_terminal_session(actor)

    if target == "widget.terminal.run_button":
        return _trick_terminal_run_command(actor)

    if target == "widget.terminal.copy_button":
        return True, {"copied": True, "ui_only": True, "text": terminal.get("output_text") or ""}, None

    if target == "widget.terminal.minimize_button":
        terminal["minimized"] = not bool(terminal.get("minimized"))
        terminal["status_text"] = "Minimized." if terminal["minimized"] else "Ready."
        return True, {"minimized": terminal["minimized"], "ui_only": True}, None

    if target == "widget.terminal.close_button":
        terminal["closed"] = True
        terminal["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    item_manager = _trick_item_manager_session(actor)

    if target in {"widget.item_manager.search_button", "widget.item_manager.refresh_button"}:
        return _trick_item_manager_refresh(actor)

    if target == "widget.item_manager.new_button":
        item_type = str(item_manager.get("type_select") or "task").strip() or "task"
        item_manager["item_name_input"] = ""
        item_manager["yaml_input"] = yaml.safe_dump({"type": item_type, "name": "", "duration": 0}, sort_keys=False, allow_unicode=False)
        item_manager["status_text"] = f"Prepared new {item_type}."
        return True, {"type": item_type, "prepared": True}, None

    if target == "widget.item_manager.save_button":
        return _trick_item_manager_save(actor)

    if target == "widget.item_manager.copy_button":
        src = str(item_manager.get("item_name_input") or "").strip()
        if not src:
            item_manager["status_text"] = "Copy failed."
            return False, {"error": "Load an item first."}, "Load an item first."
        dest = f"{src} copy"
        try:
            payload = _trick_item_manager_post("/api/item/copy", {
                "type": str(item_manager.get("type_select") or "task").strip() or "task",
                "source": src,
                "new_name": dest,
            })
        except Exception as e:
            item_manager["status_text"] = "Copy failed."
            return False, {"error": str(e)}, str(e)
        item_manager["status_text"] = f'Copied to "{dest}".'
        item_manager["item_name_input"] = dest
        _trick_item_manager_refresh(actor)
        _trick_item_manager_load_item(actor, dest)
        return True, payload, None

    if target == "widget.item_manager.rename_button":
        src = str(item_manager.get("item_name_input") or "").strip()
        if not src:
            item_manager["status_text"] = "Rename failed."
            return False, {"error": "Load an item first."}, "Load an item first."
        dest = f"{src} renamed"
        try:
            payload = _trick_item_manager_post("/api/item/rename", {
                "type": str(item_manager.get("type_select") or "task").strip() or "task",
                "old_name": src,
                "new_name": dest,
            })
        except Exception as e:
            item_manager["status_text"] = "Rename failed."
            return False, {"error": str(e)}, str(e)
        item_manager["status_text"] = f'Renamed to "{dest}".'
        item_manager["item_name_input"] = dest
        _trick_item_manager_refresh(actor)
        _trick_item_manager_load_item(actor, dest)
        return True, payload, None

    if target == "widget.item_manager.delete_button":
        name = str(item_manager.get("item_name_input") or "").strip()
        if not name:
            item_manager["status_text"] = "Delete failed."
            return False, {"error": "Load an item first."}, "Load an item first."
        try:
            payload = _trick_item_manager_post("/api/item/delete", {
                "type": str(item_manager.get("type_select") or "task").strip() or "task",
                "name": name,
            })
        except Exception as e:
            item_manager["status_text"] = "Delete failed."
            return False, {"error": str(e)}, str(e)
        item_manager["status_text"] = f'Deleted "{name}".'
        item_manager["item_name_input"] = ""
        item_manager["yaml_input"] = ""
        _trick_item_manager_refresh(actor)
        return True, payload, None

    if target == "widget.item_manager.minimize_button":
        item_manager["minimized"] = not bool(item_manager.get("minimized"))
        item_manager["status_text"] = "Minimized." if item_manager["minimized"] else "Ready."
        return True, {"minimized": item_manager["minimized"], "ui_only": True}, None

    if target == "widget.item_manager.close_button":
        item_manager["closed"] = True
        item_manager["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    status_widget = _trick_status_session(actor)

    if target == "widget.status.update_button":
        return _trick_status_update(actor)

    if target == "widget.status.minimize_button":
        status_widget["minimized"] = not bool(status_widget.get("minimized"))
        status_widget["status_text"] = "Minimized." if status_widget["minimized"] else "Ready."
        return True, {"minimized": status_widget["minimized"], "ui_only": True}, None

    if target == "widget.status.close_button":
        status_widget["closed"] = True
        status_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    goal_tracker = _trick_goal_tracker_session(actor)

    if target in {"widget.goal_tracker.search_button", "widget.goal_tracker.refresh_button"}:
        ok, result, err = _trick_goal_tracker_refresh(actor)
        if ok and not goal_tracker.get("selected_goal"):
            _trick_goal_tracker_select(actor)
        elif ok and goal_tracker.get("selected_goal"):
            _trick_goal_tracker_select(actor, goal_tracker.get("selected_goal"))
        return ok, result, err

    if target == "widget.goal_tracker.recalc_button":
        return _trick_goal_tracker_recalc(actor)

    if target == "widget.goal_tracker.complete_primary_button":
        return _trick_goal_tracker_complete_primary(actor)

    if target == "widget.goal_tracker.focus_primary_button":
        return _trick_goal_tracker_focus_primary(actor)

    if target == "widget.goal_tracker.minimize_button":
        goal_tracker["minimized"] = not bool(goal_tracker.get("minimized"))
        goal_tracker["status_text"] = "Minimized." if goal_tracker["minimized"] else "Ready."
        return True, {"minimized": goal_tracker["minimized"], "ui_only": True}, None

    if target == "widget.goal_tracker.close_button":
        goal_tracker["closed"] = True
        goal_tracker["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    milestones_widget = _trick_milestones_session(actor)

    if target == "widget.milestones.refresh_button":
        return _trick_milestones_refresh(actor)

    if target == "widget.milestones.list_toggle_button":
        milestones_widget["list_open"] = not bool(milestones_widget.get("list_open"))
        return True, {"list_open": milestones_widget["list_open"], "ui_only": True}, None

    if target == "widget.milestones.complete_primary_button":
        return _trick_milestones_update(actor, "complete")

    if target == "widget.milestones.reset_primary_button":
        return _trick_milestones_update(actor, "reset")

    if target == "widget.milestones.minimize_button":
        milestones_widget["minimized"] = not bool(milestones_widget.get("minimized"))
        milestones_widget["status_text"] = "Minimized." if milestones_widget["minimized"] else ""
        return True, {"minimized": milestones_widget["minimized"], "ui_only": True}, None

    if target == "widget.milestones.close_button":
        milestones_widget["closed"] = True
        milestones_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    commitments_widget = _trick_commitments_session(actor)

    if target == "widget.commitments.evaluate_button":
        return _trick_commitments_evaluate(actor)

    if target == "widget.commitments.refresh_button":
        return _trick_commitments_refresh(actor)

    if target == "widget.commitments.list_toggle_button":
        commitments_widget["list_open"] = not bool(commitments_widget.get("list_open"))
        return True, {"list_open": commitments_widget["list_open"], "ui_only": True}, None

    if target == "widget.commitments.met_primary_button":
        return _trick_commitments_override(actor, "met")

    if target == "widget.commitments.violation_primary_button":
        return _trick_commitments_override(actor, "violation")

    if target == "widget.commitments.clear_primary_button":
        return _trick_commitments_override(actor, "clear")

    if target == "widget.commitments.minimize_button":
        commitments_widget["minimized"] = not bool(commitments_widget.get("minimized"))
        commitments_widget["status_text"] = "Minimized." if commitments_widget["minimized"] else ""
        return True, {"minimized": commitments_widget["minimized"], "ui_only": True}, None

    if target == "widget.commitments.close_button":
        commitments_widget["closed"] = True
        commitments_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    rewards_widget = _trick_rewards_session(actor)

    if target == "widget.rewards.refresh_button":
        return _trick_rewards_refresh(actor)

    if target == "widget.rewards.list_toggle_button":
        rewards_widget["list_open"] = not bool(rewards_widget.get("list_open"))
        return True, {"list_open": rewards_widget["list_open"], "ui_only": True}, None

    if target == "widget.rewards.redeem_primary_button":
        return _trick_rewards_redeem(actor)

    if target == "widget.rewards.minimize_button":
        rewards_widget["minimized"] = not bool(rewards_widget.get("minimized"))
        rewards_widget["status_text"] = "Minimized." if rewards_widget["minimized"] else ""
        return True, {"minimized": rewards_widget["minimized"], "ui_only": True}, None

    if target == "widget.rewards.close_button":
        rewards_widget["closed"] = True
        rewards_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    achievements_widget = _trick_achievements_session(actor)

    if target == "widget.achievements.refresh_button":
        return _trick_achievements_refresh(actor)

    if target == "widget.achievements.list_toggle_button":
        achievements_widget["list_open"] = not bool(achievements_widget.get("list_open"))
        return True, {"list_open": achievements_widget["list_open"], "ui_only": True}, None

    if target == "widget.achievements.set_title_button":
        return _trick_achievements_set_title(actor)

    if target == "widget.achievements.award_primary_button":
        return _trick_achievements_update(actor, "award")

    if target == "widget.achievements.archive_primary_button":
        return _trick_achievements_update(actor, "archive")

    if target == "widget.achievements.minimize_button":
        achievements_widget["minimized"] = not bool(achievements_widget.get("minimized"))
        achievements_widget["status_text"] = "Minimized." if achievements_widget["minimized"] else ""
        return True, {"minimized": achievements_widget["minimized"], "ui_only": True}, None

    if target == "widget.achievements.close_button":
        achievements_widget["closed"] = True
        achievements_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    habit_tracker = _trick_habit_tracker_session(actor)

    if target == "widget.habit_tracker.refresh_button":
        return _trick_habit_tracker_refresh(actor)

    if target == "widget.habit_tracker.done_primary_button":
        return _trick_habit_tracker_update(actor, "complete")

    if target == "widget.habit_tracker.incident_primary_button":
        return _trick_habit_tracker_update(actor, "incident")

    if target == "widget.habit_tracker.minimize_button":
        habit_tracker["minimized"] = not bool(habit_tracker.get("minimized"))
        habit_tracker["status_text"] = "Minimized." if habit_tracker["minimized"] else ""
        return True, {"minimized": habit_tracker["minimized"], "ui_only": True}, None

    if target == "widget.habit_tracker.close_button":
        habit_tracker["closed"] = True
        habit_tracker["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    review_widget = _trick_review_session(actor)

    if target == "widget.review.this_button":
        return True, {"period": _trick_review_set_this(review_widget)}, None

    if target == "widget.review.generate_button":
        review_widget["status_text"] = "Generating..."
        review_widget["log_text"] = ""
        return _trick_review_generate(actor)

    if target == "widget.review.open_button":
        review_widget["status_text"] = "Loading..."
        review_widget["log_text"] = ""
        return _trick_review_open(actor)

    if target == "widget.review.export_button":
        review_widget["status_text"] = "Exporting..."
        review_widget["log_text"] = ""
        return _trick_review_export(actor)

    if target == "widget.review.prev_button":
        return True, {"period": _trick_review_shift_period(review_widget, -1)}, None

    if target == "widget.review.next_button":
        return True, {"period": _trick_review_shift_period(review_widget, 1)}, None

    if target == "widget.review.minimize_button":
        review_widget["minimized"] = not bool(review_widget.get("minimized"))
        review_widget["status_text"] = "Minimized." if review_widget["minimized"] else ""
        return True, {"minimized": review_widget["minimized"], "ui_only": True}, None

    if target == "widget.review.close_button":
        review_widget["closed"] = True
        review_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    variables_widget = _trick_variables_session(actor)

    if target == "widget.variables.add_button":
        rows = variables_widget.get("rows") if isinstance(variables_widget.get("rows"), dict) else {}
        base = "new_var"
        idx = 1
        while f"{base}_{idx}" in rows:
            idx += 1
        rows[f"{base}_{idx}"] = ""
        variables_widget["rows"] = rows
        return True, {"rows": rows}, None

    if target == "widget.variables.save_button":
        return _trick_variables_save(actor)

    if target == "widget.variables.refresh_button":
        return _trick_variables_refresh(actor)

    if target == "widget.variables.minimize_button":
        variables_widget["minimized"] = not bool(variables_widget.get("minimized"))
        variables_widget["status_text"] = "Minimized." if variables_widget["minimized"] else ""
        return True, {"minimized": variables_widget["minimized"], "ui_only": True}, None

    if target == "widget.variables.close_button":
        variables_widget["closed"] = True
        variables_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    resolution_tracker = _trick_resolution_tracker_session(actor)

    if target == "widget.resolution_tracker.refresh_button":
        return _trick_resolution_tracker_refresh(actor)

    if target == "widget.resolution_tracker.minimize_button":
        resolution_tracker["minimized"] = not bool(resolution_tracker.get("minimized"))
        resolution_tracker["status_text"] = "Minimized." if resolution_tracker["minimized"] else ""
        return True, {"minimized": resolution_tracker["minimized"], "ui_only": True}, None

    if target == "widget.resolution_tracker.close_button":
        resolution_tracker["closed"] = True
        resolution_tracker["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    notes_widget = _trick_notes_session(actor)

    if target == "widget.notes.load_button":
        return _trick_notes_load(actor)

    if target == "widget.notes.to_sticky_button":
        return _trick_notes_to_sticky(actor)

    if target == "widget.notes.create_button":
        return _trick_notes_create(actor)

    if target == "widget.notes.minimize_button":
        notes_widget["minimized"] = not bool(notes_widget.get("minimized"))
        notes_widget["status_text"] = "Minimized." if notes_widget["minimized"] else ""
        return True, {"minimized": notes_widget["minimized"], "ui_only": True}, None

    if target == "widget.notes.close_button":
        notes_widget["closed"] = True
        notes_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    inventory_widget = _trick_inventory_manager_session(actor)

    if target in {"widget.inventory_manager.search_button", "widget.inventory_manager.refresh_button"}:
        return _trick_inventory_manager_refresh(actor)

    if target == "widget.inventory_manager.create_button":
        return _trick_inventory_manager_create(actor)

    if target == "widget.inventory_manager.minimize_button":
        inventory_widget["minimized"] = not bool(inventory_widget.get("minimized"))
        inventory_widget["status_text"] = "Minimized." if inventory_widget["minimized"] else ""
        return True, {"minimized": inventory_widget["minimized"], "ui_only": True}, None

    if target == "widget.inventory_manager.close_button":
        inventory_widget["closed"] = True
        inventory_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    profile_widget = _trick_profile_session(actor)

    if target == "widget.profile.save_button":
        return _trick_profile_save(actor)

    if target in {
        "widget.profile.edit_preferences_button",
        "widget.profile.edit_preferences_settings_button",
        "widget.profile.edit_pilot_brief_button",
    }:
        path_map = {
            "widget.profile.edit_preferences_button": "user/profile/preferences.md",
            "widget.profile.edit_preferences_settings_button": "user/profile/preferences_settings.yml",
            "widget.profile.edit_pilot_brief_button": "user/profile/pilot_brief.md",
        }
        ok = _editor_open_request_write(path_map[target])
        profile_widget["status_text"] = "Opened in Notes." if ok else "Open failed."
        return ok, {"path": path_map[target]}, None if ok else "Failed to queue editor open request"

    if target == "widget.profile.minimize_button":
        profile_widget["minimized"] = not bool(profile_widget.get("minimized"))
        profile_widget["status_text"] = "Minimized." if profile_widget["minimized"] else "Ready."
        return True, {"minimized": profile_widget["minimized"], "ui_only": True}, None

    if target == "widget.profile.close_button":
        profile_widget["closed"] = True
        profile_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    settings_widget = _trick_settings_session(actor)

    if target == "widget.settings.reload_button":
        return _trick_settings_refresh(actor)

    if target == "widget.settings.save_button":
        return _trick_settings_save(actor)

    if target == "widget.settings.minimize_button":
        settings_widget["minimized"] = not bool(settings_widget.get("minimized"))
        settings_widget["status_text"] = "Minimized." if settings_widget["minimized"] else "Ready."
        return True, {"minimized": settings_widget["minimized"], "ui_only": True}, None

    if target == "widget.settings.close_button":
        settings_widget["closed"] = True
        settings_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    sleep_widget = _trick_sleep_settings_session(actor)

    if target == "widget.sleep_settings.apply_mode_button":
        return _trick_sleep_settings_apply_mode(actor)

    if target == "widget.sleep_settings.add_segment_button":
        blocks = _trick_sleep_settings_parse_blocks(sleep_widget.get("blocks_text") or "")
        blocks.append({"label": "Sleep Segment", "start": "", "end": "", "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]})
        sleep_widget["blocks_text"] = _trick_sleep_settings_blocks_text(blocks)
        _trick_sleep_settings_refresh_chart(sleep_widget)
        sleep_widget["status_text"] = "Added sleep segment."
        return True, {"blocks": blocks}, None

    if target == "widget.sleep_settings.add_sleep_in_button":
        blocks = _trick_sleep_settings_parse_blocks(sleep_widget.get("blocks_text") or "")
        blocks.append({"label": "Sleep In", "start": "", "end": "", "days": ["sat", "sun"]})
        sleep_widget["blocks_text"] = _trick_sleep_settings_blocks_text(blocks)
        _trick_sleep_settings_refresh_chart(sleep_widget)
        sleep_widget["status_text"] = "Added sleep-in segment."
        return True, {"blocks": blocks}, None

    if target == "widget.sleep_settings.apply_sleep_button":
        return _trick_sleep_settings_apply(actor)

    if target == "widget.sleep_settings.minimize_button":
        sleep_widget["minimized"] = not bool(sleep_widget.get("minimized"))
        sleep_widget["status_text"] = "Minimized." if sleep_widget["minimized"] else "Ready."
        return True, {"minimized": sleep_widget["minimized"], "ui_only": True}, None

    if target == "widget.sleep_settings.close_button":
        sleep_widget["closed"] = True
        sleep_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    link_widget = _trick_link_session(actor)

    if target == "widget.link.connect_button":
        return _trick_link_connect(actor)

    if target == "widget.link.sync_button":
        return _trick_link_sync(actor)

    if target == "widget.link.invite_button":
        return _trick_link_invite(actor)

    if target == "widget.link.disconnect_button":
        return _trick_link_disconnect(actor)

    if target == "widget.link.minimize_button":
        link_widget["minimized"] = not bool(link_widget.get("minimized"))
        link_widget["status_text"] = "offline" if link_widget["minimized"] and not link_widget.get("connected") else str(link_widget.get("status_text") or "Ready.")
        return True, {"minimized": link_widget["minimized"], "ui_only": True}, None

    if target == "widget.link.close_button":
        link_widget["closed"] = True
        link_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    trends_widget = _trick_trends_session(actor)

    if target == "widget.trends.refresh_button":
        return _trick_trends_refresh(actor)

    if target == "widget.trends.minimize_button":
        trends_widget["minimized"] = not bool(trends_widget.get("minimized"))
        trends_widget["status_text"] = "Minimized." if trends_widget["minimized"] else "Ready."
        return True, {"minimized": trends_widget["minimized"], "ui_only": True}, None

    if target == "widget.trends.close_button":
        trends_widget["closed"] = True
        trends_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    admin_widget = _trick_admin_session(actor)

    if target == "widget.admin.clear_logs_button":
        return _trick_admin_run(actor, "clear logs force")

    if target == "widget.admin.clear_schedules_button":
        return _trick_admin_run(actor, "clear schedules force")

    if target == "widget.admin.clear_cache_button":
        return _trick_admin_run(actor, "clear cache force")

    if target == "widget.admin.clear_temp_button":
        return _trick_admin_run(actor, "clear temp force")

    if target == "widget.admin.clear_db_button":
        return _trick_admin_run(actor, f"clear db:{str(admin_widget.get('db_select') or '').strip()} force")

    if target == "widget.admin.clear_registry_button":
        return _trick_admin_run(actor, f"clear registry:{str(admin_widget.get('registry_select') or '').strip()} force")

    if target == "widget.admin.clear_archives_button":
        return _trick_admin_run(actor, "clear archives force")

    if target == "widget.admin.minimize_button":
        admin_widget["minimized"] = not bool(admin_widget.get("minimized"))
        admin_widget["status_text"] = "Minimized." if admin_widget["minimized"] else "Ready."
        return True, {"minimized": admin_widget["minimized"], "ui_only": True}, None

    if target == "widget.admin.close_button":
        admin_widget["closed"] = True
        admin_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    minimap_widget = _trick_cockpit_minimap_session(actor)

    if target == "widget.cockpit_minimap.collapse_button":
        minimap_widget["minimized"] = not bool(minimap_widget.get("minimized"))
        return True, {"minimized": minimap_widget["minimized"], "ui_only": True}, None

    debug_widget = _trick_debug_console_session(actor)

    if target == "widget.debug_console.refresh_button":
        return _trick_debug_console_refresh(actor)

    if target == "widget.debug_console.clear_button":
        debug_widget["output_text"] = ""
        debug_widget["status_text"] = "Cleared."
        return True, {"cleared": True}, None

    if target == "widget.debug_console.copy_button":
        return _trick_copy_value("widget.debug_console.output_text", actor)

    if target == "widget.debug_console.open_editor_button":
        ok = _editor_open_request_write("temp/debug_console_capture.txt", 1)
        debug_widget["status_text"] = "Queued for editor." if ok else "Editor queue failed."
        return ok, {"path": "temp/debug_console_capture.txt"}, None if ok else "Failed to queue editor request"

    if target == "widget.debug_console.minimize_button":
        debug_widget["minimized"] = not bool(debug_widget.get("minimized"))
        debug_widget["status_text"] = "Minimized." if debug_widget["minimized"] else "Ready."
        return True, {"minimized": debug_widget["minimized"], "ui_only": True}, None

    if target == "widget.debug_console.close_button":
        debug_widget["closed"] = True
        debug_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    clock_widget = _trick_clock_session(actor)

    if target == "widget.clock.appointment_button":
        return _trick_clock_refresh(actor)

    if target == "widget.clock.alarm_button":
        return _trick_clock_refresh(actor)

    if target == "widget.clock.reminder_button":
        return _trick_clock_refresh(actor)

    if target == "widget.clock.minimize_button":
        clock_widget["minimized"] = not bool(clock_widget.get("minimized"))
        return True, {"minimized": clock_widget["minimized"], "ui_only": True}, None

    if target == "widget.clock.close_button":
        clock_widget["closed"] = True
        clock_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    journal_widget = _trick_journal_session(actor)

    if target == "widget.journal.new_button":
        journal_widget["selected_type"] = ""
        journal_widget["selected_name"] = ""
        journal_widget["title_input"] = ""
        journal_widget["tags_input"] = ""
        journal_widget["content_input"] = ""
        journal_widget["status_text"] = "New entry."
        return True, {"new": True}, None

    if target == "widget.journal.save_button":
        return _trick_journal_save(actor)

    if target == "widget.journal.sticky_button":
        return _trick_journal_to_sticky(actor)

    if target == "widget.journal.minimize_button":
        journal_widget["minimized"] = not bool(journal_widget.get("minimized"))
        return True, {"minimized": journal_widget["minimized"], "ui_only": True}, None

    if target == "widget.journal.close_button":
        journal_widget["closed"] = True
        journal_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    mp3_widget = _trick_mp3_player_session(actor)

    if target == "widget.mp3_player.refresh_button":
        return _trick_mp3_player_refresh(actor)

    if target == "widget.mp3_player.play_pause_button":
        mp3_widget["is_playing"] = not bool(mp3_widget.get("is_playing"))
        mp3_widget["status_text"] = "Playing." if mp3_widget["is_playing"] else "Paused."
        return True, {"playing": mp3_widget["is_playing"]}, None

    if target == "widget.mp3_player.prev_button":
        mp3_widget["status_text"] = "Previous track."
        return True, {"action": "prev"}, None

    if target == "widget.mp3_player.next_button":
        mp3_widget["status_text"] = "Next track."
        return True, {"action": "next"}, None

    if target == "widget.mp3_player.minimize_button":
        mp3_widget["minimized"] = not bool(mp3_widget.get("minimized"))
        return True, {"minimized": mp3_widget["minimized"], "ui_only": True}, None

    if target == "widget.mp3_player.close_button":
        mp3_widget["closed"] = True
        mp3_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    sticky_widget = _trick_sticky_notes_session(actor)

    if target == "widget.sticky_notes.refresh_button":
        return _trick_sticky_notes_refresh(actor)

    if target == "widget.sticky_notes.create_button":
        return _trick_sticky_notes_create(actor)

    if target == "widget.sticky_notes.minimize_button":
        sticky_widget["minimized"] = not bool(sticky_widget.get("minimized"))
        return True, {"minimized": sticky_widget["minimized"], "ui_only": True}, None

    if target == "widget.sticky_notes.close_button":
        sticky_widget["closed"] = True
        sticky_widget["status_text"] = "Closed."
        return True, {"closed": True, "ui_only": True}, None

    return False, {}, f"Unsupported CLICK target: {target}"


def _trick_get_value(target, actor):
    target = str(target or "").strip().lower()
    if target == "widget.timer":
        return True, {"surface": target, "elements": _trick_timer_elements(actor)}, None
    if target == "widget.today":
        return True, {"surface": target, "elements": _trick_today_elements(actor)}, None
    if target == "widget.terminal":
        return True, {"surface": target, "elements": _trick_terminal_elements(actor)}, None
    if target == "widget.item_manager":
        return True, {"surface": target, "elements": _trick_item_manager_elements(actor)}, None
    if target == "widget.status":
        return True, {"surface": target, "elements": _trick_status_elements(actor)}, None
    if target == "widget.goal_tracker":
        return True, {"surface": target, "elements": _trick_goal_tracker_elements(actor)}, None
    if target == "widget.milestones":
        return True, {"surface": target, "elements": _trick_milestones_elements(actor)}, None
    if target == "widget.commitments":
        return True, {"surface": target, "elements": _trick_commitments_elements(actor)}, None
    if target == "widget.rewards":
        return True, {"surface": target, "elements": _trick_rewards_elements(actor)}, None
    if target == "widget.achievements":
        return True, {"surface": target, "elements": _trick_achievements_elements(actor)}, None
    if target == "widget.habit_tracker":
        return True, {"surface": target, "elements": _trick_habit_tracker_elements(actor)}, None
    if target == "widget.review":
        return True, {"surface": target, "elements": _trick_review_elements(actor)}, None
    if target == "widget.variables":
        return True, {"surface": target, "elements": _trick_variables_elements(actor)}, None
    if target == "widget.resolution_tracker":
        return True, {"surface": target, "elements": _trick_resolution_tracker_elements(actor)}, None
    if target == "widget.notes":
        return True, {"surface": target, "elements": _trick_notes_elements(actor)}, None
    if target == "widget.inventory_manager":
        return True, {"surface": target, "elements": _trick_inventory_manager_elements(actor)}, None
    if target == "widget.profile":
        return True, {"surface": target, "elements": _trick_profile_elements(actor)}, None
    if target == "widget.settings":
        return True, {"surface": target, "elements": _trick_settings_elements(actor)}, None
    if target == "widget.sleep_settings":
        return True, {"surface": target, "elements": _trick_sleep_settings_elements(actor)}, None
    if target == "widget.link":
        return True, {"surface": target, "elements": _trick_link_elements(actor)}, None
    if target == "widget.trends":
        return True, {"surface": target, "elements": _trick_trends_elements(actor)}, None
    if target == "widget.admin":
        return True, {"surface": target, "elements": _trick_admin_elements(actor)}, None
    if target == "widget.cockpit_minimap":
        return True, {"surface": target, "elements": _trick_cockpit_minimap_elements(actor)}, None
    if target == "widget.debug_console":
        return True, {"surface": target, "elements": _trick_debug_console_elements(actor)}, None
    if target == "widget.clock":
        return True, {"surface": target, "elements": _trick_clock_elements(actor)}, None
    if target == "widget.journal":
        return True, {"surface": target, "elements": _trick_journal_elements(actor)}, None
    if target == "widget.mp3_player":
        return True, {"surface": target, "elements": _trick_mp3_player_elements(actor)}, None
    if target == "widget.sticky_notes":
        return True, {"surface": target, "elements": _trick_sticky_notes_elements(actor)}, None
    elements = _trick_all_elements(actor)
    if target in elements:
        return True, {"target": target, **elements[target]}, None
    return False, {}, f"Unknown target: {target}"


def _trick_set_value(target, value, actor):
    target = str(target or "").strip().lower()
    session = _trick_session(actor)
    today = _trick_today_session(actor)

    if target == "widget.timer.profile_select":
        session["profile_select"] = str(value or "").strip() or "classic_pomodoro"
    elif target == "widget.timer.cycles_input":
        if value in (None, ""):
            session["cycles_input"] = None
        else:
            try:
                session["cycles_input"] = int(value)
            except Exception:
                return False, {}, "cycles_input expects an integer"
    elif target == "widget.timer.auto_advance_checkbox":
        if isinstance(value, bool):
            session["auto_advance_checkbox"] = value
        elif isinstance(value, (int, float)):
            session["auto_advance_checkbox"] = bool(value)
        else:
            session["auto_advance_checkbox"] = str(value or "").strip().lower() in {"1", "true", "yes", "on"}
    elif target == "widget.timer.bind_type_input":
        session["bind_type_input"] = str(value or "").strip()
    elif target == "widget.timer.bind_name_input":
        session["bind_name_input"] = str(value or "").strip()
    elif target.startswith("widget.today."):
        bool_targets = {
            "widget.today.buffers_checkbox",
            "widget.today.timer_breaks_checkbox",
            "widget.today.sprints_checkbox",
            "widget.today.ignore_trends_checkbox",
            "widget.today.repair_trim_checkbox",
            "widget.today.repair_cut_checkbox",
        }
        int_targets = {
            "widget.today.environment_slider",
            "widget.today.category_slider",
            "widget.today.happiness_slider",
            "widget.today.due_date_slider",
            "widget.today.deadline_slider",
            "widget.today.status_slider",
            "widget.today.priority_slider",
            "widget.today.template_slider",
            "widget.today.custom_property_slider",
            "widget.today.balance_slider",
            "widget.today.quickwins_input",
            "widget.today.repair_min_duration_input",
        }
        float_targets = {
            "widget.today.repair_cut_threshold_input",
            "widget.today.status_threshold_input",
        }
        field = target.split(".", 2)[2]
        if target in bool_targets:
            if isinstance(value, bool):
                today[field] = value
            elif isinstance(value, (int, float)):
                today[field] = bool(value)
            else:
                today[field] = str(value or "").strip().lower() in {"1", "true", "yes", "on"}
        elif target in int_targets:
            if value in (None, ""):
                today[field] = None
            else:
                try:
                    today[field] = int(value)
                except Exception:
                    return False, {}, f"{field} expects an integer"
        elif target in float_targets:
            if value in (None, ""):
                today[field] = None
            else:
                try:
                    today[field] = float(value)
                except Exception:
                    return False, {}, f"{field} expects a number"
        elif target in {
            "widget.today.custom_property_key_input",
            "widget.today.enforcer_environment_scope_select",
            "widget.today.enforcer_environment_input",
            "widget.today.enforcer_template_day_input",
            "widget.today.enforcer_template_input",
            "widget.today.schedule_state_select",
            "widget.today.timer_profile_input",
            "widget.today.template_override_input",
        }:
            today[field] = str(value or "").strip()
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.terminal."):
        terminal = _trick_terminal_session(actor)
        field = target.split(".", 2)[2]
        if target == "widget.terminal.input_field":
            terminal[field] = str(value or "")
        elif target == "widget.terminal.expand_checkbox":
            if isinstance(value, bool):
                terminal[field] = value
            elif isinstance(value, (int, float)):
                terminal[field] = bool(value)
            else:
                terminal[field] = str(value or "").strip().lower() in {"1", "true", "yes", "on"}
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.item_manager."):
        item_manager = _trick_item_manager_session(actor)
        field = target.split(".", 2)[2]
        if target in {"widget.item_manager.type_select", "widget.item_manager.search_input", "widget.item_manager.item_name_input", "widget.item_manager.yaml_input"}:
            item_manager[field] = str(value or "")
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.status."):
        status_widget = _trick_status_session(actor)
        if target == "widget.status.fields_container":
            status_widget["values"] = _trick_parse_status_text(value)
            status_widget["status_text"] = "Status draft updated."
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.goal_tracker."):
        goal_tracker = _trick_goal_tracker_session(actor)
        if target == "widget.goal_tracker.search_input":
            goal_tracker["search_input"] = str(value or "")
        elif target == "widget.goal_tracker.goal_title_text":
            goal_tracker["selected_goal"] = str(value or "").strip()
            if goal_tracker["selected_goal"]:
                _trick_goal_tracker_select(actor, goal_tracker["selected_goal"])
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.milestones."):
        milestones_widget = _trick_milestones_session(actor)
        if target in {
            "widget.milestones.search_input",
            "widget.milestones.status_filter_select",
            "widget.milestones.project_filter_select",
            "widget.milestones.goal_filter_select",
        }:
            milestones_widget[target.split(".", 2)[2]] = str(value or "")
            filtered = _trick_milestones_filtered_rows(milestones_widget)
            milestones_widget["summary"] = {
                "total": len(filtered),
                "completed": len([m for m in filtered if str(m.get("status") or "").lower() == "completed"]),
                "in_progress": len([m for m in filtered if str(m.get("status") or "").lower() == "in-progress"]),
            }
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.commitments."):
        commitments_widget = _trick_commitments_session(actor)
        if target in {
            "widget.commitments.search_input",
            "widget.commitments.status_filter_select",
        }:
            commitments_widget[target.split(".", 2)[2]] = str(value or "")
            _trick_commitments_recount(commitments_widget)
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.rewards."):
        rewards_widget = _trick_rewards_session(actor)
        if target == "widget.rewards.search_input":
            rewards_widget["search_input"] = str(value or "")
        elif target == "widget.rewards.ready_only_checkbox":
            if isinstance(value, bool):
                rewards_widget["ready_only_checkbox"] = value
            elif isinstance(value, (int, float)):
                rewards_widget["ready_only_checkbox"] = bool(value)
            else:
                rewards_widget["ready_only_checkbox"] = str(value or "").strip().lower() in {"1", "true", "yes", "on"}
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.achievements."):
        achievements_widget = _trick_achievements_session(actor)
        if target in {
            "widget.achievements.search_input",
            "widget.achievements.status_filter_select",
            "widget.achievements.title_select",
        }:
            achievements_widget[target.split(".", 2)[2]] = str(value or "")
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.habit_tracker."):
        habit_tracker = _trick_habit_tracker_session(actor)
        if target in {"widget.habit_tracker.search_input", "widget.habit_tracker.polarity_select"}:
            habit_tracker[target.split(".", 2)[2]] = str(value or "")
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.review."):
        review_widget = _trick_review_session(actor)
        if target in {"widget.review.type_select", "widget.review.period_input"}:
            review_widget[target.split(".", 2)[2]] = str(value or "")
        elif target == "widget.review.expand_checkbox":
            if isinstance(value, bool):
                review_widget["expand_checkbox"] = value
            elif isinstance(value, (int, float)):
                review_widget["expand_checkbox"] = bool(value)
            else:
                review_widget["expand_checkbox"] = str(value or "").strip().lower() in {"1", "true", "yes", "on"}
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.variables."):
        variables_widget = _trick_variables_session(actor)
        if target == "widget.variables.grid_container":
            variables_widget["rows"] = _trick_parse_grid_text(value)
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.notes."):
        notes_widget = _trick_notes_session(actor)
        field = target.split(".", 2)[2]
        if target == "widget.notes.preview_checkbox":
            if isinstance(value, bool):
                notes_widget[field] = value
            elif isinstance(value, (int, float)):
                notes_widget[field] = bool(value)
            else:
                notes_widget[field] = str(value or "").strip().lower() in {"1", "true", "yes", "on"}
        elif target in {
            "widget.notes.title_input",
            "widget.notes.format_select",
            "widget.notes.category_select",
            "widget.notes.priority_select",
            "widget.notes.tags_input",
            "widget.notes.content_input",
        }:
            notes_widget[field] = str(value or "")
        else:
            return False, {}, f"Unsupported SET target: {target}"
        _trick_notes_update_preview(notes_widget)
    elif target.startswith("widget.inventory_manager."):
        inventory_widget = _trick_inventory_manager_session(actor)
        if target in {
            "widget.inventory_manager.search_input",
            "widget.inventory_manager.place_filter_select",
            "widget.inventory_manager.new_name_input",
            "widget.inventory_manager.new_places_input",
            "widget.inventory_manager.new_tags_input",
        }:
            inventory_widget[target.split(".", 2)[2]] = str(value or "")
            if target == "widget.inventory_manager.search_input" or target == "widget.inventory_manager.place_filter_select":
                filtered = _trick_inventory_manager_filtered_rows(inventory_widget)
                items = inventory_widget.get("inventories") if isinstance(inventory_widget.get("inventories"), list) else []
                inventory_widget["count_text"] = f"{len(filtered)} / {len(items)} inventories" if items else "No inventories"
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.profile."):
        profile_widget = _trick_profile_session(actor)
        if target in {
            "widget.profile.nickname_input",
            "widget.profile.title_select",
            "widget.profile.welcome_line1_input",
            "widget.profile.welcome_line2_input",
            "widget.profile.welcome_line3_input",
            "widget.profile.exit_line1_input",
            "widget.profile.exit_line2_input",
        }:
            profile_widget[target.split(".", 2)[2]] = str(value or "")
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.settings."):
        settings_widget = _trick_settings_session(actor)
        if target == "widget.settings.form_mode_checkbox":
            if isinstance(value, bool):
                settings_widget["form_mode_checkbox"] = value
            elif isinstance(value, (int, float)):
                settings_widget["form_mode_checkbox"] = bool(value)
            else:
                settings_widget["form_mode_checkbox"] = str(value or "").strip().lower() in {"1", "true", "yes", "on"}
        elif target == "widget.settings.file_select":
            settings_widget["file_select"] = str(value or "")
            return _trick_settings_load_file(actor, settings_widget["file_select"])
        elif target == "widget.settings.editor_input":
            settings_widget["editor_input"] = str(value or "")
            settings_widget["dynamic_content"] = _trick_settings_summarize(settings_widget["editor_input"])
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.sleep_settings."):
        sleep_widget = _trick_sleep_settings_session(actor)
        if target == "widget.sleep_settings.mode_select":
            sleep_widget["mode_select"] = str(value or "").strip().lower() or "monophasic"
        elif target == "widget.sleep_settings.splits_input":
            try:
                sleep_widget["splits_input"] = int(value)
            except Exception:
                return False, {}, "splits_input expects an integer"
        elif target == "widget.sleep_settings.blocks_container":
            sleep_widget["blocks_text"] = str(value or "")
            _trick_sleep_settings_refresh_chart(sleep_widget)
        elif target == "widget.sleep_settings.template_mode_select":
            sleep_widget["template_mode_select"] = str(value or "").strip().lower() or "selected"
        elif target == "widget.sleep_settings.template_name_input":
            sleep_widget["template_name_input"] = str(value or "")
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.link."):
        link_widget = _trick_link_session(actor)
        if target in {"widget.link.peer_input", "widget.link.token_input", "widget.link.board_select"}:
            link_widget[target.split(".", 2)[2]] = str(value or "")
            _trick_link_write_settings(link_widget)
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.admin."):
        admin_widget = _trick_admin_session(actor)
        if target in {"widget.admin.db_select", "widget.admin.registry_select"}:
            admin_widget[target.split(".", 2)[2]] = str(value or "")
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.debug_console."):
        debug_widget = _trick_debug_console_session(actor)
        if target == "widget.debug_console.filter_select":
            debug_widget["filter_select"] = str(value or "")
        elif target == "widget.debug_console.output_text":
            debug_widget["output_text"] = str(value or "")
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.clock."):
        clock_widget = _trick_clock_session(actor)
        if target == "widget.clock.mode_select":
            clock_widget["mode_select"] = str(value or "")
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.journal."):
        journal_widget = _trick_journal_session(actor)
        if target in {
            "widget.journal.type_filter_select",
            "widget.journal.search_input",
            "widget.journal.entry_type_select",
            "widget.journal.date_input",
            "widget.journal.title_input",
            "widget.journal.tags_input",
            "widget.journal.content_input",
        }:
            journal_widget[target.split(".", 2)[2]] = str(value or "")
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.mp3_player."):
        mp3_widget = _trick_mp3_player_session(actor)
        if target == "widget.mp3_player.playlist_select":
            mp3_widget["playlist_select"] = str(value or "")
        else:
            return False, {}, f"Unsupported SET target: {target}"
    elif target.startswith("widget.sticky_notes."):
        sticky_widget = _trick_sticky_notes_session(actor)
        if target in {"widget.sticky_notes.new_content_input", "widget.sticky_notes.new_color_select"}:
            sticky_widget[target.split(".", 2)[2]] = str(value or "")
        else:
            return False, {}, f"Unsupported SET target: {target}"
    else:
        return False, {}, f"Unsupported SET target: {target}"

    ok, payload, err = _trick_get_value(target, actor)
    return ok, payload, err


def _trick_type_value(target, value, actor):
    target = str(target or "").strip().lower()
    text = "" if value is None else str(value)
    session = _trick_session(actor)
    today = _trick_today_session(actor)
    terminal = _trick_terminal_session(actor)
    item_manager = _trick_item_manager_session(actor)

    if target in {
        "widget.timer.profile_select",
        "widget.timer.bind_type_input",
        "widget.timer.bind_name_input",
        "widget.today.custom_property_key_input",
        "widget.today.enforcer_environment_scope_select",
        "widget.today.enforcer_environment_input",
        "widget.today.enforcer_template_day_input",
        "widget.today.enforcer_template_input",
        "widget.today.schedule_state_select",
        "widget.today.timer_profile_input",
        "widget.today.template_override_input",
        "widget.terminal.input_field",
        "widget.item_manager.type_select",
        "widget.item_manager.search_input",
        "widget.item_manager.item_name_input",
        "widget.item_manager.yaml_input",
        "widget.goal_tracker.search_input",
        "widget.milestones.search_input",
        "widget.milestones.status_filter_select",
        "widget.milestones.project_filter_select",
        "widget.milestones.goal_filter_select",
        "widget.commitments.search_input",
        "widget.commitments.status_filter_select",
        "widget.rewards.search_input",
        "widget.achievements.search_input",
        "widget.achievements.status_filter_select",
        "widget.achievements.title_select",
        "widget.habit_tracker.search_input",
        "widget.habit_tracker.polarity_select",
        "widget.review.type_select",
        "widget.review.period_input",
        "widget.variables.grid_container",
        "widget.notes.title_input",
        "widget.notes.format_select",
        "widget.notes.category_select",
        "widget.notes.priority_select",
        "widget.notes.tags_input",
        "widget.notes.content_input",
        "widget.inventory_manager.search_input",
        "widget.inventory_manager.place_filter_select",
        "widget.inventory_manager.new_name_input",
        "widget.inventory_manager.new_places_input",
        "widget.inventory_manager.new_tags_input",
        "widget.profile.nickname_input",
        "widget.profile.title_select",
        "widget.profile.welcome_line1_input",
        "widget.profile.welcome_line2_input",
        "widget.profile.welcome_line3_input",
        "widget.profile.exit_line1_input",
        "widget.profile.exit_line2_input",
        "widget.settings.file_select",
        "widget.settings.editor_input",
        "widget.sleep_settings.mode_select",
        "widget.sleep_settings.template_mode_select",
        "widget.sleep_settings.template_name_input",
        "widget.sleep_settings.blocks_container",
        "widget.link.peer_input",
        "widget.link.token_input",
        "widget.link.board_select",
        "widget.admin.db_select",
        "widget.admin.registry_select",
        "widget.debug_console.filter_select",
        "widget.debug_console.output_text",
        "widget.clock.mode_select",
        "widget.journal.type_filter_select",
        "widget.journal.search_input",
        "widget.journal.entry_type_select",
        "widget.journal.date_input",
        "widget.journal.title_input",
        "widget.journal.tags_input",
        "widget.journal.content_input",
        "widget.mp3_player.playlist_select",
        "widget.sticky_notes.new_content_input",
        "widget.sticky_notes.new_color_select",
    }:
        if target.startswith("widget.timer."):
            field = target.split(".", 2)[2]
            session[field] = f"{session.get(field) or ''}{text}" if target.endswith("_input") else text
        elif target.startswith("widget.today."):
            field = target.split(".", 2)[2]
            today[field] = f"{today.get(field) or ''}{text}" if field.endswith("_input") else text
        elif target.startswith("widget.terminal."):
            terminal["input_field"] = f"{terminal.get('input_field') or ''}{text}"
        elif target.startswith("widget.item_manager."):
            field = target.split(".", 2)[2]
            if field in {"search_input", "item_name_input", "yaml_input"}:
                item_manager[field] = f"{item_manager.get(field) or ''}{text}"
            else:
                item_manager[field] = text
        elif target.startswith("widget.goal_tracker."):
            field = target.split(".", 2)[2]
            goal_tracker = _trick_goal_tracker_session(actor)
            goal_tracker[field] = f"{goal_tracker.get(field) or ''}{text}"
        elif target.startswith("widget.milestones."):
            field = target.split(".", 2)[2]
            milestones_widget = _trick_milestones_session(actor)
            milestones_widget[field] = f"{milestones_widget.get(field) or ''}{text}" if field == "search_input" else text
            filtered = _trick_milestones_filtered_rows(milestones_widget)
            milestones_widget["summary"] = {
                "total": len(filtered),
                "completed": len([m for m in filtered if str(m.get("status") or "").lower() == "completed"]),
                "in_progress": len([m for m in filtered if str(m.get("status") or "").lower() == "in-progress"]),
            }
        elif target.startswith("widget.commitments."):
            field = target.split(".", 2)[2]
            commitments_widget = _trick_commitments_session(actor)
            commitments_widget[field] = f"{commitments_widget.get(field) or ''}{text}" if field == "search_input" else text
            _trick_commitments_recount(commitments_widget)
        elif target.startswith("widget.rewards."):
            field = target.split(".", 2)[2]
            rewards_widget = _trick_rewards_session(actor)
            rewards_widget[field] = f"{rewards_widget.get(field) or ''}{text}"
        elif target.startswith("widget.achievements."):
            field = target.split(".", 2)[2]
            achievements_widget = _trick_achievements_session(actor)
            achievements_widget[field] = f"{achievements_widget.get(field) or ''}{text}" if field == "search_input" else text
        elif target.startswith("widget.habit_tracker."):
            field = target.split(".", 2)[2]
            habit_tracker = _trick_habit_tracker_session(actor)
            habit_tracker[field] = f"{habit_tracker.get(field) or ''}{text}" if field == "search_input" else text
        elif target.startswith("widget.review."):
            field = target.split(".", 2)[2]
            review_widget = _trick_review_session(actor)
            review_widget[field] = f"{review_widget.get(field) or ''}{text}" if field == "period_input" else text
        elif target.startswith("widget.variables."):
            variables_widget = _trick_variables_session(actor)
            existing = _trick_variables_grid_text(variables_widget.get("rows") if isinstance(variables_widget.get("rows"), dict) else {})
            variables_widget["rows"] = _trick_parse_grid_text(f"{existing}{text}" if existing else text)
        elif target.startswith("widget.notes."):
            field = target.split(".", 2)[2]
            notes_widget = _trick_notes_session(actor)
            notes_widget[field] = f"{notes_widget.get(field) or ''}{text}" if field in {"title_input", "tags_input", "content_input"} else text
            _trick_notes_update_preview(notes_widget)
        elif target.startswith("widget.inventory_manager."):
            field = target.split(".", 2)[2]
            inventory_widget = _trick_inventory_manager_session(actor)
            inventory_widget[field] = f"{inventory_widget.get(field) or ''}{text}"
        elif target.startswith("widget.profile."):
            field = target.split(".", 2)[2]
            profile_widget = _trick_profile_session(actor)
            profile_widget[field] = f"{profile_widget.get(field) or ''}{text}"
        elif target.startswith("widget.settings."):
            field = target.split(".", 2)[2]
            settings_widget = _trick_settings_session(actor)
            settings_widget[field] = f"{settings_widget.get(field) or ''}{text}" if field == "editor_input" else text
            settings_widget["dynamic_content"] = _trick_settings_summarize(settings_widget.get("editor_input") or "")
        elif target.startswith("widget.sleep_settings."):
            field = target.split(".", 2)[2]
            sleep_widget = _trick_sleep_settings_session(actor)
            sleep_widget[field if field != "blocks_container" else "blocks_text"] = f"{sleep_widget.get(field if field != 'blocks_container' else 'blocks_text') or ''}{text}"
            _trick_sleep_settings_refresh_chart(sleep_widget)
        elif target.startswith("widget.link."):
            field = target.split(".", 2)[2]
            link_widget = _trick_link_session(actor)
            link_widget[field] = f"{link_widget.get(field) or ''}{text}"
            _trick_link_write_settings(link_widget)
        elif target.startswith("widget.admin."):
            field = target.split(".", 2)[2]
            admin_widget = _trick_admin_session(actor)
            admin_widget[field] = f"{admin_widget.get(field) or ''}{text}"
        elif target.startswith("widget.debug_console."):
            field = target.split(".", 2)[2]
            debug_widget = _trick_debug_console_session(actor)
            debug_widget[field] = f"{debug_widget.get(field) or ''}{text}"
        elif target.startswith("widget.clock."):
            field = target.split(".", 2)[2]
            clock_widget = _trick_clock_session(actor)
            clock_widget[field] = f"{clock_widget.get(field) or ''}{text}"
        elif target.startswith("widget.journal."):
            field = target.split(".", 2)[2]
            journal_widget = _trick_journal_session(actor)
            journal_widget[field] = f"{journal_widget.get(field) or ''}{text}"
        elif target.startswith("widget.mp3_player."):
            field = target.split(".", 2)[2]
            mp3_widget = _trick_mp3_player_session(actor)
            mp3_widget[field] = f"{mp3_widget.get(field) or ''}{text}"
        elif target.startswith("widget.sticky_notes."):
            field = target.split(".", 2)[2]
            sticky_widget = _trick_sticky_notes_session(actor)
            sticky_widget[field] = f"{sticky_widget.get(field) or ''}{text}"
        return _trick_get_value(target, actor)
    if target == "widget.status.fields_container":
        status_widget = _trick_status_session(actor)
        existing = "\n".join(f"{k}: {v}" for k, v in (status_widget.get("values") or {}).items())
        merged = f"{existing}{text}" if existing else text
        status_widget["values"] = _trick_parse_status_text(merged)
        status_widget["status_text"] = "Status draft updated."
        return _trick_get_value(target, actor)
    return False, {}, f"Unsupported TYPE target: {target}"


def _trick_copy_value(target, actor):
    target = str(target or "").strip().lower()
    session = _trick_session(actor)
    ok, payload, err = _trick_get_value(target, actor)
    if not ok:
        return False, {}, err
    copied = payload.get("text")
    if copied is None or copied == "":
        copied = payload.get("value")
    session["clipboard"] = "" if copied is None else str(copied)
    return True, {"clipboard": session["clipboard"], "target": target}, None


def _trick_paste_value(target, actor):
    session = _trick_session(actor)
    return _trick_type_value(target, session.get("clipboard") or "", actor)


def _trick_press_key(target, value, actor):
    target = str(target or "").strip().lower()
    key = str(value or "").strip()
    if not key:
        return False, {}, "Missing key"
    key_norm = key.lower()

    session = _trick_session(actor)
    today = _trick_today_session(actor)
    terminal = _trick_terminal_session(actor)
    item_manager = _trick_item_manager_session(actor)

    def _backspace(text):
        s = str(text or "")
        return s[:-1] if s else ""

    if target == "widget.terminal.input_field":
        if key_norm == "enter":
            return _trick_terminal_run_command(actor)
        if key_norm == "backspace":
            terminal["input_field"] = _backspace(terminal.get("input_field"))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            terminal["input_field"] = ""
            terminal["status_text"] = "Ready."
            return _trick_get_value(target, actor)
        if key_norm in {"ctrl+l", "ctrl+l"}:
            terminal["output_text"] = ""
            terminal["status_text"] = "Cleared."
            return True, {"target": target, "value": terminal["input_field"], "cleared": True}, None
        return False, {}, f"Unsupported key for {target}: {key}"

    if target == "widget.item_manager.search_input":
        if key_norm == "enter":
            return _trick_item_manager_refresh(actor)
        if key_norm == "backspace":
            item_manager["search_input"] = _backspace(item_manager.get("search_input"))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            item_manager["search_input"] = ""
            item_manager["status_text"] = "Ready."
            return _trick_get_value(target, actor)
    if target.startswith("widget.profile."):
        profile_widget = _trick_profile_session(actor)
        field = target.split(".", 2)[2]
        if key_norm == "enter" and target == "widget.profile.nickname_input":
            return _trick_profile_save(actor)
        if key_norm == "backspace":
            profile_widget[field] = _backspace(profile_widget.get(field))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            profile_widget[field] = ""
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"
    if target.startswith("widget.settings."):
        settings_widget = _trick_settings_session(actor)
        field = target.split(".", 2)[2]
        if key_norm == "enter" and target == "widget.settings.editor_input":
            return _trick_settings_save(actor)
        if key_norm == "backspace":
            settings_widget[field] = _backspace(settings_widget.get(field))
            settings_widget["dynamic_content"] = _trick_settings_summarize(settings_widget.get("editor_input") or "")
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            settings_widget[field] = ""
            settings_widget["dynamic_content"] = _trick_settings_summarize(settings_widget.get("editor_input") or "")
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"
    if target.startswith("widget.sleep_settings."):
        sleep_widget = _trick_sleep_settings_session(actor)
        field = "blocks_text" if target.endswith("blocks_container") else target.split(".", 2)[2]
        if key_norm == "enter" and target == "widget.sleep_settings.blocks_container":
            _trick_sleep_settings_refresh_chart(sleep_widget)
            return _trick_get_value(target, actor)
        if key_norm == "backspace":
            sleep_widget[field] = _backspace(sleep_widget.get(field))
            _trick_sleep_settings_refresh_chart(sleep_widget)
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            sleep_widget[field] = ""
            _trick_sleep_settings_refresh_chart(sleep_widget)
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"
    if target.startswith("widget.link."):
        link_widget = _trick_link_session(actor)
        field = target.split(".", 2)[2]
        if key_norm == "enter":
            if target in {"widget.link.peer_input", "widget.link.token_input", "widget.link.board_select"}:
                return _trick_link_connect(actor)
        if key_norm == "backspace":
            link_widget[field] = _backspace(link_widget.get(field))
            _trick_link_write_settings(link_widget)
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            link_widget[field] = ""
            _trick_link_write_settings(link_widget)
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"
        return False, {}, f"Unsupported key for {target}: {key}"

    if target == "widget.goal_tracker.search_input":
        goal_tracker = _trick_goal_tracker_session(actor)
        if key_norm == "enter":
            ok, result, err = _trick_goal_tracker_refresh(actor)
            if ok:
                _trick_goal_tracker_select(actor)
            return ok, result, err
        if key_norm == "backspace":
            goal_tracker["search_input"] = _backspace(goal_tracker.get("search_input"))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            goal_tracker["search_input"] = ""
            goal_tracker["status_text"] = "Ready."
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target == "widget.milestones.search_input":
        milestones_widget = _trick_milestones_session(actor)
        if key_norm == "enter":
            return _trick_milestones_refresh(actor)
        if key_norm == "backspace":
            milestones_widget["search_input"] = _backspace(milestones_widget.get("search_input"))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            milestones_widget["search_input"] = ""
            milestones_widget["status_text"] = ""
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target in {
        "widget.milestones.status_filter_select",
        "widget.milestones.project_filter_select",
        "widget.milestones.goal_filter_select",
    }:
        milestones_widget = _trick_milestones_session(actor)
        field = target.split(".", 2)[2]
        if key_norm == "backspace":
            milestones_widget[field] = _backspace(milestones_widget.get(field))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            milestones_widget[field] = "all"
            return _trick_get_value(target, actor)
        if key_norm == "enter":
            filtered = _trick_milestones_filtered_rows(milestones_widget)
            milestones_widget["summary"] = {
                "total": len(filtered),
                "completed": len([m for m in filtered if str(m.get("status") or "").lower() == "completed"]),
                "in_progress": len([m for m in filtered if str(m.get("status") or "").lower() == "in-progress"]),
            }
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target == "widget.commitments.search_input":
        commitments_widget = _trick_commitments_session(actor)
        if key_norm == "enter":
            return _trick_commitments_refresh(actor)
        if key_norm == "backspace":
            commitments_widget["search_input"] = _backspace(commitments_widget.get("search_input"))
            _trick_commitments_recount(commitments_widget)
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            commitments_widget["search_input"] = ""
            commitments_widget["status_text"] = ""
            _trick_commitments_recount(commitments_widget)
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target == "widget.commitments.status_filter_select":
        commitments_widget = _trick_commitments_session(actor)
        if key_norm == "backspace":
            commitments_widget["status_filter_select"] = _backspace(commitments_widget.get("status_filter_select"))
            _trick_commitments_recount(commitments_widget)
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            commitments_widget["status_filter_select"] = "all"
            _trick_commitments_recount(commitments_widget)
            return _trick_get_value(target, actor)
        if key_norm == "enter":
            _trick_commitments_recount(commitments_widget)
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target == "widget.rewards.search_input":
        rewards_widget = _trick_rewards_session(actor)
        if key_norm == "enter":
            return _trick_rewards_refresh(actor)
        if key_norm == "backspace":
            rewards_widget["search_input"] = _backspace(rewards_widget.get("search_input"))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            rewards_widget["search_input"] = ""
            rewards_widget["status_text"] = ""
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target == "widget.achievements.search_input":
        achievements_widget = _trick_achievements_session(actor)
        if key_norm == "enter":
            return _trick_achievements_refresh(actor)
        if key_norm == "backspace":
            achievements_widget["search_input"] = _backspace(achievements_widget.get("search_input"))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            achievements_widget["search_input"] = ""
            achievements_widget["status_text"] = ""
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target in {"widget.achievements.status_filter_select", "widget.achievements.title_select"}:
        achievements_widget = _trick_achievements_session(actor)
        field = target.split(".", 2)[2]
        if key_norm == "backspace":
            achievements_widget[field] = _backspace(achievements_widget.get(field))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            achievements_widget[field] = "" if field == "title_select" else "all"
            return _trick_get_value(target, actor)
        if key_norm == "enter":
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target == "widget.habit_tracker.search_input":
        habit_tracker = _trick_habit_tracker_session(actor)
        if key_norm == "enter":
            return _trick_habit_tracker_refresh(actor)
        if key_norm == "backspace":
            habit_tracker["search_input"] = _backspace(habit_tracker.get("search_input"))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            habit_tracker["search_input"] = ""
            habit_tracker["status_text"] = ""
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target == "widget.habit_tracker.polarity_select":
        habit_tracker = _trick_habit_tracker_session(actor)
        if key_norm == "backspace":
            habit_tracker["polarity_select"] = _backspace(habit_tracker.get("polarity_select"))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            habit_tracker["polarity_select"] = "all"
            return _trick_get_value(target, actor)
        if key_norm == "enter":
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target == "widget.review.period_input":
        review_widget = _trick_review_session(actor)
        if key_norm == "backspace":
            review_widget["period_input"] = _backspace(review_widget.get("period_input"))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            review_widget["period_input"] = ""
            review_widget["status_text"] = ""
            return _trick_get_value(target, actor)
        if key_norm == "enter":
            return _trick_review_open(actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target == "widget.review.type_select":
        review_widget = _trick_review_session(actor)
        if key_norm == "backspace":
            review_widget["type_select"] = _backspace(review_widget.get("type_select"))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            review_widget["type_select"] = "daily"
            return _trick_get_value(target, actor)
        if key_norm == "enter":
            _trick_review_set_this(review_widget)
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target == "widget.variables.grid_container":
        variables_widget = _trick_variables_session(actor)
        if key_norm == "enter":
            return _trick_variables_save(actor)
        if key_norm == "escape":
            variables_widget["rows"] = {}
            variables_widget["status_text"] = ""
            return _trick_get_value(target, actor)
        if key_norm == "backspace":
            text = _trick_variables_grid_text(variables_widget.get("rows") if isinstance(variables_widget.get("rows"), dict) else {})
            variables_widget["rows"] = _trick_parse_grid_text(_backspace(text))
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target in {"widget.notes.title_input", "widget.notes.tags_input", "widget.notes.content_input"}:
        notes_widget = _trick_notes_session(actor)
        field = target.split(".", 2)[2]
        if key_norm == "backspace":
            notes_widget[field] = _backspace(notes_widget.get(field))
            _trick_notes_update_preview(notes_widget)
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            notes_widget[field] = ""
            notes_widget["status_text"] = ""
            _trick_notes_update_preview(notes_widget)
            return _trick_get_value(target, actor)
        if key_norm == "enter" and field == "content_input":
            notes_widget[field] = f"{notes_widget.get(field) or ''}\n"
            _trick_notes_update_preview(notes_widget)
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target in {"widget.inventory_manager.search_input", "widget.inventory_manager.new_name_input", "widget.inventory_manager.new_places_input", "widget.inventory_manager.new_tags_input"}:
        inventory_widget = _trick_inventory_manager_session(actor)
        field = target.split(".", 2)[2]
        if key_norm == "backspace":
            inventory_widget[field] = _backspace(inventory_widget.get(field))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            inventory_widget[field] = ""
            if field == "search_input":
                inventory_widget["status_text"] = ""
            return _trick_get_value(target, actor)
        if key_norm == "enter":
            if field == "search_input":
                return _trick_inventory_manager_refresh(actor)
            if field == "new_name_input":
                return _trick_inventory_manager_create(actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target == "widget.inventory_manager.place_filter_select":
        inventory_widget = _trick_inventory_manager_session(actor)
        if key_norm == "backspace":
            inventory_widget["place_filter_select"] = _backspace(inventory_widget.get("place_filter_select"))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            inventory_widget["place_filter_select"] = ""
            return _trick_get_value(target, actor)
        if key_norm == "enter":
            return _trick_inventory_manager_refresh(actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target in {"widget.item_manager.item_name_input", "widget.item_manager.yaml_input"}:
        field = target.split(".", 2)[2]
        if key_norm == "backspace":
            item_manager[field] = _backspace(item_manager.get(field))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            item_manager[field] = ""
            item_manager["status_text"] = "Ready."
            return _trick_get_value(target, actor)
        if key_norm == "enter" and target == "widget.item_manager.yaml_input":
            item_manager[field] = f"{item_manager.get(field) or ''}\n"
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    today_pressable = {
        "widget.today.custom_property_key_input",
        "widget.today.enforcer_environment_input",
        "widget.today.enforcer_template_day_input",
        "widget.today.enforcer_template_input",
        "widget.today.timer_profile_input",
        "widget.today.template_override_input",
    }
    if target in today_pressable:
        field = target.split(".", 2)[2]
        if key_norm == "backspace":
            today[field] = _backspace(today.get(field))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            today[field] = ""
            today["status_text"] = "Ready."
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    if target in {"widget.timer.bind_type_input", "widget.timer.bind_name_input"}:
        field = target.split(".", 2)[2]
        if key_norm == "backspace":
            session[field] = _backspace(session.get(field))
            return _trick_get_value(target, actor)
        if key_norm == "escape":
            session[field] = ""
            return _trick_get_value(target, actor)
        return False, {}, f"Unsupported key for {target}: {key}"

    return False, {}, f"Unsupported PRESS target: {target}"


def _trick_eval_predicate(predicate, target, expected, actor):
    predicate = str(predicate or "exists").strip().lower()
    target = str(target or "").strip().lower()
    if not target:
        return False, {"error": "Missing target"}

    surface_id = ".".join(target.split(".")[:2]) if "." in target else target
    all_elements = _trick_all_elements(actor)
    exists = _trick_surface_exists(surface_id) and (target == surface_id or target in all_elements)

    if predicate == "exists":
        return exists, {"exists": exists}
    if predicate == "gone":
        return (not exists), {"exists": exists}

    ok, payload, err = _trick_get_value(target, actor)
    if not ok:
        return False, {"error": err}

    if predicate == "visible":
        return bool(payload.get("visible", False)), payload
    if predicate == "enabled":
        return bool(payload.get("enabled", False)), payload
    if predicate == "value":
        lhs = "" if payload.get("value") is None else str(payload.get("value"))
        rhs = "" if expected is None else str(expected)
        return lhs == rhs, payload
    if predicate == "text_contains":
        lhs = str(payload.get("text") or "").lower()
        rhs = str(expected or "").lower()
        return rhs in lhs, payload
    return False, {"error": f"Unsupported predicate: {predicate}"}


def _trick_parse_request(payload):
    req = {
        "command": "",
        "target": "",
        "value": None,
        "actor": "default",
        "predicate": None,
        "expected": None,
        "timeout_ms": 5000,
        "mode": "spotlight",
        "duration_ms": 0,
        "message": None,
    }
    if isinstance(payload, dict):
        req["actor"] = payload.get("actor") or payload.get("familiar") or "default"
        req["target"] = str(payload.get("target") or "").strip()
        req["value"] = payload.get("value")
        req["predicate"] = payload.get("predicate")
        req["expected"] = payload.get("expected")
        req["mode"] = payload.get("mode") or "spotlight"
        req["message"] = payload.get("message")
        try:
            req["timeout_ms"] = int(payload.get("timeout_ms") or 5000)
        except Exception:
            req["timeout_ms"] = 5000
        try:
            req["duration_ms"] = int(payload.get("duration_ms") or 0)
        except Exception:
            req["duration_ms"] = 0

        raw = str(payload.get("input") or payload.get("command") or "").strip()
        if raw:
            toks = raw.split()
            if toks:
                req["command"] = toks[0].upper()
            if req["command"] == "WAIT":
                if len(toks) >= 2 and toks[1].lower() in {"exists", "visible", "enabled", "value", "text_contains", "gone"}:
                    req["predicate"] = toks[1].lower()
                    if len(toks) >= 3:
                        req["target"] = toks[2]
                    tail = toks[3:]
                else:
                    req["predicate"] = req["predicate"] or "exists"
                    if len(toks) >= 2:
                        req["target"] = toks[1]
                    tail = toks[2:]
                if tail:
                    # Accept optional trailing timeout int.
                    if tail and re.fullmatch(r"\d+", str(tail[-1])):
                        req["timeout_ms"] = int(tail[-1])
                        tail = tail[:-1]
                    if tail:
                        req["expected"] = " ".join(tail)
            elif req["command"] == "HIGHLIGHT":
                if len(toks) >= 2 and not req["target"]:
                    req["target"] = toks[1]
                tail = toks[2:]
                if tail and (payload.get("mode") in (None, "")):
                    req["mode"] = tail[0]
                    tail = tail[1:]
                if tail and re.fullmatch(r"\d+", str(tail[0])) and not payload.get("duration_ms"):
                    req["duration_ms"] = int(tail[0])
                    tail = tail[1:]
                if tail and req.get("message") in (None, ""):
                    req["message"] = " ".join(str(part) for part in tail)
            else:
                if len(toks) >= 2 and not req["target"]:
                    req["target"] = toks[1]
                if len(toks) > 2 and req["value"] is None:
                    req["value"] = " ".join(toks[2:])
        elif payload.get("command"):
            req["command"] = str(payload.get("command") or "").strip().upper()

    req["command"] = str(req["command"] or "").strip().upper()
    req["target"] = str(req["target"] or "").strip().lower()
    req["timeout_ms"] = max(100, min(20000, int(req["timeout_ms"] or 5000)))
    req["mode"] = str(req.get("mode") or "spotlight").strip().lower() or "spotlight"
    req["duration_ms"] = max(0, min(60000, int(req.get("duration_ms") or 0)))
    if req.get("message") is not None:
        req["message"] = str(req.get("message") or "").strip() or None
    return req

def _load_link_settings():
    data = {}
    try:
        if os.path.exists(_LINK_SETTINGS_PATH):
            with open(_LINK_SETTINGS_PATH, "r", encoding="utf-8") as f:
                loaded = yaml.safe_load(f) or {}
                if isinstance(loaded, dict):
                    data = loaded
    except Exception:
        data = {}
    changed = False
    if not data.get("link_id"):
        data["link_id"] = f"link-{secrets.token_hex(4)}"
        changed = True
    if not data.get("token"):
        data["token"] = secrets.token_urlsafe(24)
        changed = True
    if changed:
        try:
            os.makedirs(os.path.dirname(_LINK_SETTINGS_PATH), exist_ok=True)
            with open(_LINK_SETTINGS_PATH, "w", encoding="utf-8") as f:
                yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
        except Exception:
            pass
    return data

def _link_auth_ok(headers) -> bool:
    token = _load_link_settings().get("token")
    if not token:
        return False
    auth = (headers.get("Authorization") or "").strip()
    return auth == f"Bearer {token}"

def _editor_open_request_write(path_value: str, line_value=None) -> bool:
    try:
        rel = str(path_value or "").strip().replace("\\", "/")
        if not rel:
            return False
        abs_target, err = _resolve_editor_api_target(rel)
        if err:
            return False
        payload = {"path": os.path.relpath(abs_target, ROOT_DIR).replace("\\", "/")}
        if line_value is not None:
            try:
                payload["line"] = int(line_value)
            except Exception:
                pass
        os.makedirs(os.path.dirname(_EDITOR_OPEN_REQUEST_PATH), exist_ok=True)
        with open(_EDITOR_OPEN_REQUEST_PATH, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False)
        return True
    except Exception:
        return False

def _editor_open_request_pop():
    try:
        request_path = _legacy_or_canonical_temp_path("editor_open_request.json")
        if not os.path.exists(request_path):
            return None
        with open(request_path, "r", encoding="utf-8") as fh:
            payload = json.load(fh) or {}
        try:
            os.remove(request_path)
        except Exception:
            pass
        if not isinstance(payload, dict):
            return None
        path_value = str(payload.get("path") or "").strip().replace("\\", "/")
        if not path_value:
            return None
        abs_target, err = _resolve_editor_api_target(path_value)
        if err:
            return None
        out = {"path": os.path.relpath(abs_target, ROOT_DIR).replace("\\", "/")}
        if payload.get("line") is not None:
            try:
                out["line"] = int(payload.get("line"))
            except Exception:
                pass
        return out
    except Exception:
        return None

def _vars_all():
    try:
        from modules import variables as _V
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
        from modules import variables as _V
        try:
            _V.set_var(str(k), v)
        except Exception:
            pass
    except Exception:
        pass
    _DASH_VARS[str(k)] = str(v)

def _vars_unset(k):
    try:
        from modules import variables as _V
        try:
            _V.unset_var(str(k))
        except Exception:
            pass
    except Exception:
        pass
    _DASH_VARS.pop(str(k), None)

def _expand_text(text):
    try:
        from modules import variables as _V
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
        prof_path = os.path.join(ROOT_DIR, 'user', 'profile', 'profile.yml')
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
        # Seed from optional user/settings/vars.yml
        vpath = os.path.join(ROOT_DIR, 'user', 'settings', 'vars.yml')
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

_CONSOLE_JOB_QUEUE = queue.Queue()
_CONSOLE_WORKER_READY = threading.Event()
_CONSOLE_WORKER_THREAD = None


def _run_console_command_in_process(command_name, args_list, properties=None):
    from modules import console as ConsoleModule  # type: ignore

    old_out, old_err = sys.stdout, sys.stderr
    out_buf, err_buf = io.StringIO(), io.StringIO()
    sys.stdout, sys.stderr = out_buf, err_buf
    ok = True
    try:
        ConsoleModule.run_command(command_name, args_list, properties or {})
    except Exception as e:
        ok = False
        print(f"Error: {e}")
    finally:
        sys.stdout, sys.stderr = old_out, old_err
    return ok, out_buf.getvalue().strip(), err_buf.getvalue().strip()


def _console_command_worker():
    _CONSOLE_WORKER_READY.set()
    while True:
        job = _CONSOLE_JOB_QUEUE.get()
        try:
            if job is None:
                return
            command_name = job.get("command_name")
            args_list = job.get("args_list") or []
            properties = job.get("properties") or {}
            event = job.get("event")
            try:
                result = _run_console_command_in_process(command_name, args_list, properties)
            except Exception as e:
                result = (False, "", f"Worker execution failed: {e}")
            job["result"] = result
            if event:
                event.set()
        finally:
            _CONSOLE_JOB_QUEUE.task_done()


def _ensure_console_worker():
    global _CONSOLE_WORKER_THREAD
    thr = _CONSOLE_WORKER_THREAD
    if thr is not None and thr.is_alive():
        return thr
    _CONSOLE_WORKER_READY.clear()
    thr = threading.Thread(
        target=_console_command_worker,
        name="chronos-dashboard-console-worker",
        daemon=True,
    )
    thr.start()
    _CONSOLE_WORKER_READY.wait(timeout=5)
    _CONSOLE_WORKER_THREAD = thr
    return thr


def run_console_command(command_name, args_list, properties=None):
    """
    Invoke the Console command pipeline.
    Preferred: in-process execution through a single-worker queue.
    Fallback: subprocess execution of Console via Python.
    Returns (ok, stdout, stderr).
    """
    # Try in-process via single worker to avoid shared stdout/stderr races.
    try:
        _ensure_console_worker()
        done = threading.Event()
        job = {
            "command_name": command_name,
            "args_list": list(args_list or []),
            "properties": dict(properties or {}),
            "event": done,
        }
        _CONSOLE_JOB_QUEUE.put(job)
        if not done.wait(timeout=120):
            return False, "", "Command queue timed out after 120 seconds."
        result = job.get("result")
        if isinstance(result, tuple) and len(result) == 3:
            return result
        return False, "", "Command queue returned no result."
    except Exception:
        # Fallback: subprocess
        import subprocess

        def quote(t: str) -> str:
            s = str(t)
            if any(c.isspace() for c in s) or any(c in s for c in ['"', "'", ':']):
                s = '"' + s.replace('"', '\\"') + '"'
            return s

        merged_args = list(args_list or [])
        props = properties or {}
        if isinstance(props, dict) and props:
            for k, v in props.items():
                if isinstance(v, list):
                    v_str = ", ".join(str(x) for x in v)
                elif isinstance(v, bool):
                    v_str = "true" if v else "false"
                else:
                    v_str = str(v)
                tok = f"{k}:{v_str}"
                if tok not in merged_args:
                    merged_args.append(tok)

        cmdline = ' '.join([command_name] + [quote(a) for a in merged_args])
        proc = subprocess.Popen([sys.executable, os.path.join(ROOT_DIR, 'modules', 'console.py'), cmdline],
                                cwd=ROOT_DIR, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        out, err = proc.communicate(timeout=30)
        ok = proc.returncode == 0
        return ok, (out or '').strip(), (err or '').strip()


def _list_system_databases():
    data_dir = os.path.join(ROOT_DIR, "user", "data")
    registry_path = os.path.join(data_dir, "databases.yml")
    databases = []
    seen = set()

    def _safe_getsize(path):
        try:
            return os.path.getsize(path)
        except Exception:
            return None

    def _safe_getmtime(path):
        try:
            return datetime.fromtimestamp(os.path.getmtime(path)).isoformat()
        except Exception:
            return None

    if os.path.exists(registry_path):
        try:
            with open(registry_path, "r", encoding="utf-8") as fh:
                registry = yaml.safe_load(fh) or {}
            entries = registry.get("databases") if isinstance(registry, dict) else {}
            if isinstance(entries, dict):
                for key, entry in entries.items():
                    if not isinstance(entry, dict):
                        continue
                    db_type = str(entry.get("type") or "").strip().lower()
                    filename = str(entry.get("filename") or "").strip()
                    path = str(entry.get("path") or "").strip()
                    if db_type and db_type != "sqlite":
                        continue
                    if not db_type and filename and not filename.lower().endswith(".db"):
                        continue
                    if not db_type and not filename:
                        continue
                    if not path and filename:
                        path = os.path.join(data_dir, filename)
                    if db_type == "sqlite" and filename.lower().endswith(".db"):
                        name = os.path.splitext(filename)[0]
                    else:
                        name = str(entry.get("key") or key or filename).strip()
                    if not name:
                        continue
                    label = str(entry.get("name") or key or name).strip()
                    info = {
                        "name": name,
                        "label": label,
                        "key": str(entry.get("key") or key or "").strip() or None,
                        "type": db_type or None,
                        "filename": filename or None,
                    }
                    if path and os.path.exists(path):
                        info["size"] = _safe_getsize(path)
                        info["modified"] = _safe_getmtime(path)
                    else:
                        info["size"] = None
                        info["modified"] = None
                    databases.append(info)
                    if filename:
                        seen.add(filename)
                    seen.add(name)
        except Exception:
            pass

    if os.path.exists(data_dir):
        try:
            for filename in os.listdir(data_dir):
                if not filename.lower().endswith(".db"):
                    continue
                if filename in seen:
                    continue
                path = os.path.join(data_dir, filename)
                name = os.path.splitext(filename)[0]
                info = {
                    "name": name,
                    "label": name,
                    "key": None,
                    "type": "sqlite",
                    "filename": filename,
                    "size": _safe_getsize(path),
                    "modified": _safe_getmtime(path),
                }
                databases.append(info)
        except Exception:
            pass

    databases.sort(key=lambda item: (item.get("label") or item.get("name") or "").lower())
    return databases

STICKY_NOTE_COLORS = {
    "amber": "#f4d482",
    "citrus": "#ffd6a5",
    "mint": "#c7f9cc",
    "aqua": "#b4e9ff",
    "lilac": "#e3c6ff",
    "slate": "#dfe6f3",
}
DEFAULT_STICKY_NOTE_COLOR = "amber"

MEDIA_ROOT = os.path.join(ROOT_DIR, "user", "Media")
MP3_DIR = os.path.join(MEDIA_ROOT, "mp3")
PLAYLIST_DIR = os.path.join(MEDIA_ROOT, "playlists")
DEFAULT_PLAYLIST_SLUG = "default"
CALENDAR_OVERLAY_PRESET_DIR = os.path.join(ROOT_DIR, "presets", "calendar_overlays")


def _normalize_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return False


def _ensure_calendar_overlay_dir():
    try:
        os.makedirs(CALENDAR_OVERLAY_PRESET_DIR, exist_ok=True)
    except Exception:
        pass


def _overlay_slug(name: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in ("-", "_", " ") else "_" for ch in str(name or ""))
    safe = "_".join(part for part in safe.strip().split())
    return safe.lower() or "overlay"


def _normalize_overlay_preset(raw):
    if not isinstance(raw, dict):
        return None
    name = str(raw.get("name") or raw.get("label") or "").strip()
    if not name:
        return None
    mode = str(raw.get("mode") or raw.get("key") or ("name" if raw.get("match") else "")).strip()
    value = str(raw.get("value") or raw.get("match") or "").strip()
    use_momentum = _normalize_bool(raw.get("use_momentum") or raw.get("momentum"))
    kind = str(raw.get("kind") or "").strip().lower() or "custom"
    if not mode or not value:
        return None
    return {
        "name": name,
        "mode": mode,
        "value": value,
        "use_momentum": use_momentum,
        "kind": kind,
    }


def _list_calendar_overlay_presets():
    _ensure_calendar_overlay_dir()
    presets = []
    try:
        for entry in os.listdir(CALENDAR_OVERLAY_PRESET_DIR):
            if not entry.lower().endswith((".yml", ".yaml")):
                continue
            path = os.path.join(CALENDAR_OVERLAY_PRESET_DIR, entry)
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    data = yaml.safe_load(fh) or {}
                normalized = _normalize_overlay_preset(data)
                if normalized:
                    presets.append(normalized)
            except Exception:
                continue
    except Exception:
        return []
    presets.sort(key=lambda item: (item.get("name") or "").lower())
    return presets


def _load_calendar_overlay_preset(name: str):
    if not name:
        return None
    _ensure_calendar_overlay_dir()
    slug = _overlay_slug(name)
    for ext in (".yml", ".yaml"):
        path = os.path.join(CALENDAR_OVERLAY_PRESET_DIR, f"{slug}{ext}")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh) or {}
            return _normalize_overlay_preset(data)
    return None


def _save_calendar_overlay_preset(preset: dict):
    if not isinstance(preset, dict):
        raise ValueError("Preset payload must be a map")
    normalized = _normalize_overlay_preset(preset)
    if not normalized:
        raise ValueError("Preset must include name, mode, and value")
    _ensure_calendar_overlay_dir()
    slug = _overlay_slug(normalized["name"])
    path = os.path.join(CALENDAR_OVERLAY_PRESET_DIR, f"{slug}.yml")
    payload = {
        "name": normalized["name"],
        "mode": normalized["mode"],
        "value": normalized["value"],
        "use_momentum": normalized.get("use_momentum", False),
        "kind": normalized.get("kind") or "custom",
    }
    with open(path, "w", encoding="utf-8") as fh:
        yaml.safe_dump(payload, fh, allow_unicode=True, sort_keys=False)
    return normalized


def _delete_calendar_overlay_preset(name: str) -> bool:
    if not name:
        return False
    slug = _overlay_slug(name)
    removed = False
    for ext in (".yml", ".yaml"):
        path = os.path.join(CALENDAR_OVERLAY_PRESET_DIR, f"{slug}{ext}")
        if os.path.exists(path):
            try:
                os.remove(path)
                removed = True
            except Exception:
                pass
    return removed


def _coerce_sticky_color(value):
    try:
        color = str(value or "").strip().lower()
    except Exception:
        color = ""
    if color in STICKY_NOTE_COLORS:
        return color
    return DEFAULT_STICKY_NOTE_COLOR


def _tags_from_value(value):
    if isinstance(value, list):
        tags = []
        for t in value:
            try:
                s = str(t or "").strip()
            except Exception:
                s = ""
            if s:
                tags.append(s)
        return tags
    return []


def _ensure_sticky_markers(data):
    tags = _tags_from_value(data.get("tags"))
    if not any(str(t).strip().lower() == "sticky" for t in tags):
        tags.append("sticky")
    data["tags"] = tags
    data["sticky"] = True
    return data


def _is_sticky_note(data):
    if not isinstance(data, dict):
        return False
    sticky_flag = data.get("sticky")
    if _normalize_bool(sticky_flag):
        return True
    tags = _tags_from_value(data.get("tags"))
    return any(str(t).strip().lower() == "sticky" for t in tags)


def _ensure_unique_item_name(item_type, base_name):
    try:
        from modules.item_manager import read_item_data
    except Exception:
        return base_name
    candidate = base_name
    counter = 2
    while read_item_data(item_type, candidate):
        candidate = f"{base_name} ({counter})"
        counter += 1
    return candidate


def _sticky_timestamp_for(name):
    try:
        from modules.item_manager import get_item_path
        fpath = get_item_path("note", name)
        if fpath and os.path.exists(fpath):
            return datetime.fromtimestamp(os.path.getmtime(fpath)).isoformat(timespec="seconds")
    except Exception:
        return None
    return None


def _build_sticky_payload(data):
    if not isinstance(data, dict):
        data = {}
    name = str(data.get("name") or "").strip()
    payload = {
        "name": name,
        "content": str(data.get("content") or ""),
        "color": data.get("color") or DEFAULT_STICKY_NOTE_COLOR,
        "pinned": _normalize_bool(data.get("pinned")),
        "category": data.get("category"),
        "priority": data.get("priority"),
        "tags": _tags_from_value(data.get("tags")),
    }
    payload["updated"] = _sticky_timestamp_for(name)
    return payload


def _list_sticky_notes():
    try:
        from modules.item_manager import list_all_items, read_item_data
    except Exception:
        return []
    rows = list_all_items("note") or []
    results = []
    seen = set()
    for row in rows:
        name = str((row or {}).get("name") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        try:
            data = read_item_data("note", name) or {}
        except Exception:
            data = {}
        if not _is_sticky_note(data):
            continue
        data.setdefault("name", name)
        results.append(_build_sticky_payload(data))
    results.sort(key=lambda item: (0 if item.get("pinned") else 1, (item.get("name") or "").lower()))
    return results


def _generate_sticky_name():
    return f"Sticky {datetime.now().strftime('%Y-%m-%d %H-%M-%S')}"


def _normalize_track_path(path):
    try:
        s = str(path or "").strip()
    except Exception:
        s = ""
    s = s.replace("\\", "/")
    if s.startswith("./"):
        s = s[2:]
    return s


def _read_track_metadata(mp3_path):
    base = os.path.splitext(mp3_path)[0]
    candidates = [
        base + ".yml",
        base + ".yaml",
        os.path.join(os.path.dirname(mp3_path), "metadata.yml"),
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            try:
                with open(candidate, "r", encoding="utf-8") as fh:
                    data = yaml.safe_load(fh) or {}
                if isinstance(data, dict):
                    return data
            except Exception:
                continue
    return {}


def _ensure_media_dirs():
    try:
        os.makedirs(MP3_DIR, exist_ok=True)
        os.makedirs(PLAYLIST_DIR, exist_ok=True)
    except Exception:
        pass


def _sanitize_media_filename(name):
    base = os.path.basename(str(name or "track"))
    safe = []
    for ch in base:
        if ch.isalnum() or ch in (" ", "-", "_", "."):
            safe.append(ch)
        else:
            safe.append("_")
    candidate = "".join(safe).strip() or "track.mp3"
    if not candidate.lower().endswith(".mp3"):
        candidate = candidate + ".mp3"
    return candidate


def _playlist_slug(name, existing=None):
    base = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(name or "playlist"))
    base = base.strip("-") or "playlist"
    base = base[:60]
    cand = base
    counter = 2
    existing = existing or set()
    while cand in existing:
        cand = f"{base}-{counter}"
        counter += 1
    return cand


def _playlist_path(slug):
    safe = "".join(ch for ch in str(slug or DEFAULT_PLAYLIST_SLUG) if ch.isalnum() or ch in ("-", "_"))
    if not safe:
        safe = DEFAULT_PLAYLIST_SLUG
    fname = f"{safe}.yml"
    return os.path.abspath(os.path.join(PLAYLIST_DIR, fname))


def _read_playlist(slug):
    _ensure_media_dirs()
    path = _playlist_path(slug)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        if not isinstance(data, dict):
            data = {}
        data.setdefault("name", slug)
        data.setdefault("tracks", [])
        return data
    except Exception:
        return None


def _write_playlist(slug, data):
    _ensure_media_dirs()
    path = _playlist_path(slug)
    safe_data = data or {}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        yaml.safe_dump(safe_data, fh, allow_unicode=True, sort_keys=False)


def _list_mp3_files():
    _ensure_media_dirs()
    files = []
    mp3_root = os.path.abspath(MP3_DIR)
    for root, _, filenames in os.walk(mp3_root):
        for filename in filenames:
            if not filename.lower().endswith(".mp3"):
                continue
            full = os.path.join(root, filename)
            if not os.path.isfile(full):
                continue
            rel_path = os.path.relpath(full, mp3_root).replace("\\", "/")
            safe_rel = _normalize_track_path(rel_path)
            info = {
                "id": safe_rel,
                "file": safe_rel,
                "title": os.path.splitext(filename)[0],
                "artist": None,
                "album": None,
                "length": None,
                "size": os.path.getsize(full),
                "mtime": datetime.fromtimestamp(os.path.getmtime(full)).isoformat(timespec="seconds"),
                "url": f"/media/mp3/{quote(safe_rel, safe='/')}",
            }
            meta = _read_id3_metadata(full)
            for key, value in meta.items():
                if value:
                    info[key] = value
            extra = _read_track_metadata(full)
            if isinstance(extra, dict):
                info.update(extra)
            files.append(info)
    files.sort(key=lambda row: (row.get("title") or row.get("file") or "").lower())
    return files


def _read_id3_metadata(path):
    meta = {}
    try:
        from mutagen import File as MutagenFile  # type: ignore

        audio = MutagenFile(path)
        if audio is None:
            return meta
        if hasattr(audio, "info") and getattr(audio.info, "length", None):
            meta["length"] = int(audio.info.length)
        tags = getattr(audio, "tags", {}) or {}
        title = _pick_tag(tags, ["TIT2", "title"])
        artist = _pick_tag(tags, ["TPE1", "artist"])
        album = _pick_tag(tags, ["TALB", "album"])
        if title:
            meta["title"] = title
        if artist:
            meta["artist"] = artist
        if album:
            meta["album"] = album
    except Exception:
        pass
    return meta


def _pick_tag(tags, keys):
    try:
        for key in keys:
            if key in tags:
                value = tags[key]
                if isinstance(value, (list, tuple)):
                    if value:
                        return str(value[0])
                else:
                    return str(value)
    except Exception:
        return None
    return None


def _ensure_default_playlist(library=None):
    _ensure_media_dirs()
    lib = library if library is not None else _list_mp3_files()
    if not lib:
        return
    default_path = _playlist_path(DEFAULT_PLAYLIST_SLUG)
    if os.path.exists(default_path):
        return
    tracks = [{"file": track["file"]} for track in lib]
    data = {
        "name": "All Tracks",
        "description": "Auto playlist of every MP3 in user/media/mp3.",
        "tracks": tracks,
    }
    _write_playlist(DEFAULT_PLAYLIST_SLUG, data)


def _list_playlists():
    _ensure_media_dirs()
    results = []
    try:
        entries = sorted(os.listdir(PLAYLIST_DIR))
    except FileNotFoundError:
        entries = []
    seen = set()
    for entry in entries:
        if not entry.lower().endswith((".yml", ".yaml")):
            continue
        slug = os.path.splitext(entry)[0]
        seen.add(slug)
        data = _read_playlist(slug) or {}
        results.append({
            "slug": slug,
            "name": data.get("name") or slug,
            "track_count": len(data.get("tracks") or []),
            "description": data.get("description"),
        })
    if not results:
        _ensure_default_playlist()
        return _list_playlists()
    return results


def _serialize_playlist(slug, library=None):
    playlist = _read_playlist(slug)
    if not playlist:
        return None
    lib = library if library is not None else _list_mp3_files()
    lib_map = {track["file"]: track for track in lib}
    resolved = []
    for entry in playlist.get("tracks") or []:
        file_name = None
        if isinstance(entry, dict):
            file_name = entry.get("file")
        elif isinstance(entry, str):
            file_name = entry
            entry = {"file": file_name}
        file_name = _normalize_track_path(file_name)
        if not file_name:
            continue
        merged = {"file": file_name}
        lib_meta = lib_map.get(file_name)
        if lib_meta:
            merged.update(lib_meta)
        merged.update({k: v for k, v in entry.items() if k not in {"file", "id", "url"}})
        resolved.append(merged)
    return {
        "slug": slug,
        "name": playlist.get("name") or slug,
        "description": playlist.get("description"),
        "tracks": resolved,
        "raw": playlist,
    }


def _remove_track_from_playlists(file_name):
    updated = False
    target = _normalize_track_path(file_name)
    playlists = _list_playlists()
    for meta in playlists:
        slug = meta["slug"]
        data = _read_playlist(slug)
        if not data:
            continue
        tracks = data.get("tracks") or []
        new_tracks = []
        for entry in tracks:
            entry_file = _normalize_track_path(entry.get("file"))
            if entry_file and entry_file == target:
                continue
            new_tracks.append(entry)
        if len(new_tracks) != len(tracks):
            data["tracks"] = new_tracks
            _write_playlist(slug, data)
            updated = True
    return updated


class DashboardHandler(SimpleHTTPRequestHandler):
    server_version = "ChronosDashboardServer/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DASHBOARD_DIR, **kwargs)

    @staticmethod
    def _to_module_name(value):
        raw = str(value or "").strip()
        if not raw:
            return ""
        raw = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", raw)
        raw = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", raw)
        raw = re.sub(r"[-\s]+", "_", raw)
        return raw.lower()

    def translate_path(self, path):
        translated = super().translate_path(path)
        try:
            parsed = urlparse(path)
            rel_path = parsed.path or ""
            for prefix in ("/widgets/", "/views/", "/cockpit/panels/"):
                if not rel_path.startswith(prefix):
                    continue
                head = rel_path[len(prefix):]
                tail = ""
                if "/" in head:
                    head, tail = head.split("/", 1)
                    tail = "/" + tail
                normalized = self._to_module_name(head)
                if not normalized or normalized == head:
                    break
                candidate = super().translate_path(f"{prefix}{normalized}{tail}")
                if os.path.exists(candidate):
                    return candidate
                break
        except Exception:
            pass
        return translated

    def _safe_stderr(self, message):
        try:
            stream = getattr(sys, "__stderr__", None) or getattr(sys, "stderr", None)
            if stream is None or getattr(stream, "closed", False):
                return
            stream.write(message)
            stream.flush()
        except Exception:
            return

    def log_message(self, format, *args):
        try:
            message = "%s - - [%s] %s\n" % (
                self.address_string(),
                self.log_date_time_string(),
                format % args,
            )
        except Exception:
            return
        self._safe_stderr(message)

    def _set_cors(self):
        # Allow same-origin and file:// usage; relax for localhost development
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def end_headers(self):
        # Keep dashboard assets uncached during development so stale JS/CSS/modules
        # do not survive interpreter changes or refactors.
        try:
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        except Exception:
            pass
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        self._safe_stderr(f"DEBUG: GET request path: {parsed.path}\n")

        if parsed.path == "/api/trick/registry":
            try:
                self._write_json(200, {"ok": True, "registry": _trick_registry()})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"TRICK registry error: {e}"})
            return

        if parsed.path == "/api/registry":
            try:
                qs = parse_qs(parsed.query or "")
                name = (qs.get("name") or [""])[0].strip().lower()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing name"}); return
                
                if name in ("wizards", "themes", "widgets", "views", "panels", "popups", "gadgets", "trick", "skills"):
                    # Dynamic build
                    from utilities import registry_builder
                    data = {}
                    if name == "wizards":
                        data = registry_builder.build_wizards_registry()
                    elif name == "themes":
                        data = registry_builder.build_themes_registry()
                    elif name == "widgets":
                        data = registry_builder.build_widgets_registry()
                    elif name == "views":
                        data = registry_builder.build_views_registry()
                    elif name == "panels":
                        data = registry_builder.build_panels_registry()
                    elif name == "popups":
                        data = registry_builder.build_popups_registry()
                    elif name == "gadgets":
                        data = registry_builder.build_gadgets_registry()
                    elif name == "trick":
                        data = registry_builder.build_trick_registry(force=False)
                    elif name == "skills":
                        data = registry_builder.build_skills_registry()
                    self._write_json(200, {"ok": True, "registry": data})
                    return

                if name not in ("command", "item", "property", "skills"):
                    self._write_json(400, {"ok": False, "error": "Invalid registry name"}); return

                reg_dir = os.path.join(ROOT_DIR, 'registry')
                fpath = os.path.join(reg_dir, f"{name}_registry.json")
                
                if not os.path.exists(fpath):
                    self._write_json(200, {"ok": True, "registry": {}}); return

                with open(fpath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                self._write_json(200, {"ok": True, "registry": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Registry error: {e}"})
            return

        if parsed.path == "/api/system/databases":
            try:
                databases = _list_system_databases()
                self._write_json(200, {"ok": True, "databases": databases})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": str(e)})
            return

        # Lazy import ItemManager helpers when API endpoints are hit
        def im():
            from modules.item_manager import list_all_items, read_item_data, write_item_data, delete_item, get_item_path
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
        if parsed.path.startswith("/media/mp3/"):
            try:
                _ensure_media_dirs()
                rel = parsed.path[len("/media/mp3/"):]
                rel = unquote(rel)
                rel = rel.strip("/\\")
                target = os.path.abspath(os.path.join(MP3_DIR, rel))
                mp3_root = os.path.abspath(MP3_DIR)
                if not target.startswith(mp3_root):
                    self.send_response(403)
                    self._set_cors()
                    self.end_headers()
                    return
                if not os.path.exists(target):
                    self.send_response(404)
                    self._set_cors()
                    self.end_headers()
                    return
                with open(target, "rb") as fh:
                    data = fh.read()
                self.send_response(200)
                self._set_cors()
                self.send_header("Content-Type", "audio/mpeg")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception:
                self.send_response(500)
                self._set_cors()
                self.end_headers()
            return
        if parsed.path == "/api/profile":
            # Return profile as JSON map (nickname/theme/etc.)
            try:
                prof_path = os.path.join(ROOT_DIR, 'user', 'profile', 'profile.yml')
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
        if parsed.path == "/api/nia/profile/avatar":
            try:
                p = os.path.join(ROOT_DIR, "Agents Dress Up Committee", "familiars", "nia", "profile", "profile.png")
                if os.path.exists(p):
                    with open(p, "rb") as f:
                        blob = f.read()
                    self.send_response(200)
                    self._set_cors()
                    self.send_header("Content-Type", "image/png")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("Content-Length", str(len(blob)))
                    self.end_headers()
                    self.wfile.write(blob)
                else:
                    self._write_json(404, {"ok": False, "error": "Nia profile image not found"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read Nia profile image: {e}"})
            return
        if parsed.path == "/api/media/mp3":
            try:
                tracks = _list_mp3_files()
                self._write_json(200, {"ok": True, "files": tracks})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to list MP3 files: {e}"})
            return
        if parsed.path == "/api/media/playlists":
            try:
                qs = parse_qs(parsed.query or "")
                slug = (qs.get("name") or qs.get("slug") or [""])[0].strip()
                library = _list_mp3_files()
                if slug:
                    playlist = _serialize_playlist(slug, library)
                    if not playlist:
                        self._write_json(404, {"ok": False, "error": "Playlist not found"})
                    else:
                        payload = {"ok": True, "playlist": playlist}
                        self._write_json(200, payload)
                else:
                    plist = _list_playlists()
                    self._write_json(200, {"ok": True, "playlists": plist})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read playlists: {e}"})
            return
        if parsed.path == "/api/preferences":
            try:
                pref_path = os.path.join(ROOT_DIR, 'user', 'profile', 'preferences_settings.yml')
                data = {}
                if os.path.exists(pref_path):
                    with open(pref_path, 'r', encoding='utf-8') as f:
                        data = yaml.safe_load(f) or {}
                self._write_json(200, {"ok": True, "preferences": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read preferences: {e}"})
            return
        if parsed.path == "/api/link/settings":
            data = _load_link_settings()
            self._write_json(200, {"ok": True, "settings": data})
            return
        if parsed.path == "/api/link/invite":
            try:
                qs = parse_qs(parsed.query or "")
                board = (qs.get("board") or [""])[0].strip()
                if not board:
                    self._write_json(400, {"ok": False, "error": "Missing board"})
                    return
                settings = _load_link_settings()
                host = (self.headers.get("Host") or "127.0.0.1:7357").strip()
                base = f"http://{host}"
                url = f"{base}/link?board={quote(board)}&token={quote(settings.get('token',''))}"
                self._write_json(200, {
                    "ok": True,
                    "board": board,
                    "url": url,
                    "token": settings.get("token", ""),
                    "link_id": settings.get("link_id", ""),
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Invite error: {e}"})
            return
        if parsed.path == "/api/link/status":
            data = _load_link_settings()
            self._write_json(200, {"ok": True, "link_id": data.get("link_id"), "at": datetime.utcnow().isoformat() + "Z"})
            return
        if parsed.path == "/api/link/board":
            if not _link_auth_ok(self.headers):
                self._write_json(401, {"ok": False, "error": "Unauthorized"})
                return
            try:
                qs = parse_qs(parsed.query or "")
                name = (qs.get("name") or [""])[0]
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing name"})
                    return
                list_all_items, read_item_data, write_item_data, delete_item, get_item_path = im()
                data = read_item_data("canvas_board", name)
                if data is None:
                    self._write_json(404, {"ok": False, "error": "Board not found"})
                    return
                self._write_json(200, {"ok": True, "content": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read board: {e}"})
            return
        if parsed.path == "/api/aduc/status":
            try:
                host = "127.0.0.1"
                port = _ADUC_PORT
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.3)
                running = sock.connect_ex((host, port)) == 0
                try:
                    sock.close()
                except Exception:
                    pass
                url = f"http://{host}:{port}"
                self._write_json(200, {"ok": True, "running": running, "url": url})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to check ADUC status: {e}"})
            return
        if parsed.path == "/api/aduc/start":
            try:
                host = "127.0.0.1"
                port = _ADUC_PORT
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.3)
                running = sock.connect_ex((host, port)) == 0
                try:
                    sock.close()
                except Exception:
                    pass
                if running:
                    url = f"http://{host}:{port}"
                    self._write_json(200, {"ok": True, "running": True, "url": url})
                    return
                launcher = os.path.join(ROOT_DIR, "ADUC_launcher.bat")
                if not os.path.exists(launcher):
                    self._write_json(404, {"ok": False, "error": "ADUC_launcher.bat not found"})
                    return
                env = os.environ.copy()
                env["ADUC_NO_BROWSER"] = "1"
                env["ADUC_DASHBOARD"] = "1"
                try:
                    os.makedirs(os.path.dirname(_ADUC_NO_BROWSER_FLAG), exist_ok=True)
                    with open(_ADUC_NO_BROWSER_FLAG, "w", encoding="utf-8") as flagf:
                        flagf.write("1")
                    os.makedirs(os.path.dirname(_ADUC_NO_BROWSER_FLAG_LOCAL), exist_ok=True)
                    with open(_ADUC_NO_BROWSER_FLAG_LOCAL, "w", encoding="utf-8") as flagf_local:
                        flagf_local.write("1")
                except Exception:
                    pass
                cmd = f'"{launcher}"'
                try:
                    with open(_ADUC_LOG_PATH, "w", encoding="utf-8") as logf:
                        logf.write(f"[{datetime.now().isoformat()}] Launching ADUC via {launcher}\n")
                        logf.write(f"CMD: {cmd}\n")
                        logf.flush()
                        subprocess.Popen(
                            cmd,
                            cwd=ROOT_DIR,
                            env=env,
                            stdout=logf,
                            stderr=logf,
                            shell=True,
                        )
                except Exception as e:
                    self._write_json(500, {"ok": False, "error": f"Failed to start ADUC: {e}"})
                    return
                url = f"http://{host}:{port}"
                self._write_json(200, {"ok": True, "running": False, "url": url, "log_path": _ADUC_LOG_PATH})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to start ADUC: {e}"})
            return
        if parsed.path == "/api/aduc/log":
            try:
                if not os.path.exists(_ADUC_LOG_PATH):
                    self._write_json(404, {"ok": False, "error": "Log not found"})
                    return
                with open(_ADUC_LOG_PATH, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                self._write_json(200, {"ok": True, "path": _ADUC_LOG_PATH, "content": content})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read log: {e}"})
            return
        if parsed.path == "/api/aduc/familiars":
            status, body = _aduc_proxy_request("/familiars", method="GET")
            self._write_json(status, body if isinstance(body, dict) else {"ok": False, "error": "Invalid ADUC response"})
            return
        if parsed.path == "/api/aduc/cli/status":
            try:
                qs = parse_qs(parsed.query or "")
                familiar = (qs.get("familiar") or [""])[0].strip()
                turn_id = (qs.get("turn_id") or [""])[0].strip()
                if not familiar or not turn_id:
                    self._write_json(400, {"ok": False, "error": "Missing familiar or turn_id"})
                    return
                path = "/cli/status?" + urlencode({"familiar": familiar, "turn_id": turn_id})
                status, body = _aduc_proxy_request(path, method="GET")
                self._write_json(status, body if isinstance(body, dict) else {"ok": False, "error": "Invalid ADUC response"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to query ADUC status: {e}"})
            return
        if parsed.path == "/api/aduc/settings":
            status, body = _aduc_proxy_request("/settings", method="GET")
            self._write_json(status, body if isinstance(body, dict) else {"ok": False, "error": "Invalid ADUC response"})
            return
        if parsed.path == "/api/docs/tree":
            try:
                docs_root = os.path.abspath(os.path.join(ROOT_DIR, 'docs'))
                if not os.path.exists(docs_root):
                    self._write_json(404, {"ok": False, "error": "Docs folder not found"})
                    return
                paths = []
                for root_dir, _dirs, files in os.walk(docs_root):
                    for fname in files:
                        rel = os.path.relpath(os.path.join(root_dir, fname), docs_root)
                        rel = rel.replace("\\", "/")
                        paths.append(rel)
                paths.sort(key=lambda p: p.lower())
                self._write_json(200, {"ok": True, "paths": paths})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to list docs: {e}"})
            return
        if parsed.path == "/api/docs/read":
            try:
                qs = parse_qs(parsed.query or "")
                rel = (qs.get("path") or [""])[0].strip()
                if not rel:
                    self._write_json(400, {"ok": False, "error": "Missing path"})
                    return
                docs_root = os.path.abspath(os.path.join(ROOT_DIR, 'docs'))
                target = os.path.abspath(os.path.join(docs_root, rel))
                if not target.startswith(docs_root):
                    self._write_json(403, {"ok": False, "error": "Invalid path"})
                    return
                if not os.path.exists(target) or not os.path.isfile(target):
                    self._write_json(404, {"ok": False, "error": "File not found"})
                    return
                with open(target, 'r', encoding='utf-8') as f:
                    content = f.read()
                self._write_json(200, {"ok": True, "path": rel.replace("\\", "/"), "content": content})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read doc: {e}"})
            return
        if parsed.path == "/api/docs/search":
            try:
                qs = parse_qs(parsed.query or "")
                query = (qs.get("q") or [""])[0]
                if not query:
                    self._write_json(400, {"ok": False, "error": "Missing query"})
                    return
                limit = int((qs.get("limit") or ["200"])[0])
                limit = max(1, min(2000, limit))
                docs_root = os.path.abspath(os.path.join(ROOT_DIR, 'docs'))
                if not os.path.exists(docs_root):
                    self._write_json(404, {"ok": False, "error": "Docs folder not found"})
                    return
                needle = query.lower()
                results = []
                for root_dir, _dirs, files in os.walk(docs_root):
                    for fname in files:
                        path = os.path.join(root_dir, fname)
                        try:
                            with open(path, 'r', encoding='utf-8') as f:
                                for idx, line in enumerate(f, start=1):
                                    if needle in line.lower():
                                        rel = os.path.relpath(path, docs_root).replace("\\", "/")
                                        results.append({
                                            "path": rel,
                                            "line": idx,
                                            "text": line.strip()[:240],
                                        })
                                        if len(results) >= limit:
                                            raise StopIteration
                        except StopIteration:
                            raise
                        except Exception:
                            continue
                self._write_json(200, {"ok": True, "results": results})
            except StopIteration:
                self._write_json(200, {"ok": True, "results": results})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to search docs: {e}"})
            return
        if parsed.path == "/api/theme":
            # Lookup a theme by name in user/settings/theme_settings.yml
            try:
                qs = parse_qs(parsed.query or '')
                name = (qs.get('name') or [''])[0].strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing name"}); return
                settings_path = os.path.join(ROOT_DIR, 'user', 'settings', 'theme_settings.yml')
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
        if parsed.path == "/api/console/theme":
            try:
                from modules import console_style
                if hasattr(console_style, "reset_theme_cache"):
                    try:
                        console_style.reset_theme_cache()
                    except Exception:
                        pass
                palette = console_style.load_palette() if hasattr(console_style, "load_palette") else {}
                color_mode = console_style.load_color_mode() if hasattr(console_style, "load_color_mode") else "16"
                self._write_json(200, {
                    "ok": True,
                    "palette": palette if isinstance(palette, dict) else {},
                    "color_mode": str(color_mode or "16"),
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read console theme: {e}"})
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
        if parsed.path == "/api/trends/metrics":
            try:
                import sqlite3
                data_dir = os.path.join(ROOT_DIR, 'user', 'data')
                trends_db = os.path.join(data_dir, 'chronos_trends.db')
                
                if not os.path.exists(trends_db):
                    self._write_json(200, {"ok": True, "metrics": {}})
                    return
                
                conn = sqlite3.connect(trends_db)
                cursor = conn.cursor()
                
                # Get all latest metrics
                rows = cursor.execute("""
                    SELECT metric, value, unit, extra_json
                    FROM metrics
                    ORDER BY generated_at DESC
                    LIMIT 100
                """).fetchall()
                
                metrics = {
                    "blocks_total": 0,
                    "blocks_completed": 0,
                    "quality_counts": {},
                    "habit_stats": {},
                    "goal_stats": {},
                    "timer_stats": {},
                    "adherence_stats": {}
                }
                
                for metric, value, unit, extra_json in rows:
                    if metric.startswith("habits_"):
                        key = metric.replace("habits_", "")
                        metrics["habit_stats"][key] = value
                    elif metric.startswith("goals_"):
                        key = metric.replace("goals_", "")
                        metrics["goal_stats"][key] = value
                    elif metric.startswith("timer_"):
                        key = metric.replace("timer_", "")
                        metrics["timer_stats"][key] = value
                    elif metric.startswith("adherence_"):
                        key = metric.replace("adherence_", "")
                        metrics["adherence_stats"][key] = value
                    elif metric == "blocks_total":
                        metrics["blocks_total"] = int(value)
                    elif metric == "blocks_completed":
                        metrics["blocks_completed"] = int(value)
                    elif metric == "completion_quality_counts" and extra_json:
                        try:
                            metrics["quality_counts"] = json.loads(extra_json)
                        except:
                            pass
                
                # Fix habit_stats keys
                if "total" in metrics["habit_stats"]:
                    metrics["habit_stats"]["total_habits"] = metrics["habit_stats"].pop("total")
                if "with_streak" in metrics["habit_stats"]:
                    metrics["habit_stats"]["habits_with_current_streak"] = metrics["habit_stats"].pop("with_streak")
                if "avg_streak" in metrics["habit_stats"]:
                    pass  # Keep as is
                if "longest_streak" in metrics["habit_stats"]:
                    metrics["habit_stats"]["longest_streak_overall"] = metrics["habit_stats"].pop("longest_streak")
                if "completion_today" in metrics["habit_stats"]:
                    metrics["habit_stats"]["completion_rate_today"] = metrics["habit_stats"].pop("completion_today")
                
                # Fix goal_stats keys
                if "total" in metrics["goal_stats"]:
                    metrics["goal_stats"]["total_goals"] = metrics["goal_stats"].pop("total")
                if "in_progress" in metrics["goal_stats"]:
                    metrics["goal_stats"]["goals_in_progress"] = metrics["goal_stats"].pop("in_progress")
                if "avg_progress" in metrics["goal_stats"]:
                    metrics["goal_stats"]["total_progress"] = metrics["goal_stats"].pop("avg_progress") * metrics["goal_stats"].get("total_goals", 1)
                if "completed_week" in metrics["goal_stats"]:
                    metrics["goal_stats"]["milestones_completed_this_week"] = metrics["goal_stats"].pop("completed_week")
                
                # Fix timer_stats keys
                if "sessions_total" in metrics["timer_stats"]:
                    metrics["timer_stats"]["sessions_total"] = metrics["timer_stats"]["sessions_total"]
                if "focus_minutes" in metrics["timer_stats"]:
                    metrics["timer_stats"]["focus_minutes"] = metrics["timer_stats"]["focus_minutes"]
                
                # Fix adherence_stats keys
                if "on_time" in metrics["adherence_stats"]:
                    metrics["adherence_stats"]["on_time_count"] = metrics["adherence_stats"].pop("on_time")
                if "late" in metrics["adherence_stats"]:
                    metrics["adherence_stats"]["late_count"] = metrics["adherence_stats"].pop("late")
                if "percentage" in metrics["adherence_stats"]:
                    metrics["adherence_stats"]["adherence_percentage"] = metrics["adherence_stats"].pop("percentage")
                
                conn.close()
                self._write_json(200, {"ok": True, "metrics": metrics})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Trends error: {e}"})
            return
        if parsed.path == "/api/status/current":
            try:
                status_path = status_current_path()
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
                user_dir = os.path.join(ROOT_DIR, 'user')
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
                from modules.milestone import main as MilestoneModule  # type: ignore
                MilestoneModule.evaluate_and_update_milestones()
            except Exception:
                pass
            try:
                from modules.item_manager import list_all_items
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
                from utilities import points as Points
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
                from modules.item_manager import list_all_items
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
                from modules.item_manager import list_all_items
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
                        "id": raw.get('id'),
                        "name": name,
                        "description": raw.get('description') or raw.get('notes'),
                        "title": raw.get('title'),
                        "category": raw.get('category'),
                        "priority": raw.get('priority'),
                        "status": status or state,
                        "state": state,
                        "awarded": awarded_flag,
                        "awarded_at": awarded_at,
                        "points": parse_int(raw.get('points') or raw.get('value')) or 0,
                        "xp": parse_int(raw.get('xp')) or 0,
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
                from modules.item_manager import list_all_items
                from modules.commitment import main as CommitmentModule  # type: ignore
                commitments = list_all_items('commitment') or []
                today_key = datetime.now().strftime('%Y-%m-%d')
                out = []
                met_count = 0
                violation_count = 0
                for raw in commitments:
                    if not isinstance(raw, dict):
                        continue
                    name = str(raw.get('name') or 'Commitment')
                    status = CommitmentModule.get_commitment_status(raw)
                    met = bool(status.get('met'))
                    violation = bool(status.get('violation'))
                    state = status.get('state') or ('violation' if violation else ('met' if met else 'pending'))
                    if state == 'met':
                        met_count += 1
                    elif state == 'violation':
                        violation_count += 1
                    manual_map = raw.get('manual_status_by_date') if isinstance(raw.get('manual_status_by_date'), dict) else {}
                    manual_today = str(manual_map.get(today_key) or '').strip().lower()
                    out.append({
                        "name": name,
                        "description": raw.get('description') or raw.get('notes'),
                        "rule_kind": status.get('kind'),
                        "period": status.get('period') or 'week',
                        "times_required": status.get('times') or 0,
                        "required_total": status.get('required_total') or status.get('times') or 0,
                        "progress": status.get('progress') or 0,
                        "remaining": status.get('remaining') or 0,
                        "target_progress": status.get('target_progress') or [],
                        "targets": status.get('targets') or [],
                        "triggers": status.get('triggers'),
                        "status": state,
                        "met": met,
                        "violation": violation,
                        "manual_today": manual_today,
                        "needs_checkin": (state == 'pending' and manual_today not in ('met', 'violation')),
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
        if parsed.path == "/api/tracker/sources":
            try:
                from modules.item_manager import list_all_items
                habits = list_all_items('habit') or []
                commitments = list_all_items('commitment') or []

                def _is_true(value):
                    if isinstance(value, bool):
                        return value
                    text = str(value or '').strip().lower()
                    return text in ('1', 'true', 'yes', 'y', 'on')

                def _num(value):
                    try:
                        n = float(value)
                        if n > 0:
                            return n
                    except Exception:
                        return None
                    return None

                def _sleep_target_hours(raw):
                    if not isinstance(raw, dict):
                        return None
                    keys = (
                        'sleep_target_hours',
                        'target_sleep_hours',
                        'target_hours',
                        'sleep_hours',
                    )
                    for key in keys:
                        n = _num(raw.get(key))
                        if n is not None:
                            return n
                    target = raw.get('target') if isinstance(raw.get('target'), dict) else {}
                    for key in keys:
                        n = _num(target.get(key))
                        if n is not None:
                            return n
                    return None

                sources = []

                for raw in habits:
                    if not isinstance(raw, dict):
                        continue
                    name = str(raw.get('name') or '').strip()
                    if not name:
                        continue
                    polarity = str(raw.get('polarity') or 'good').strip().lower()
                    if polarity not in ('good', 'bad'):
                        polarity = 'good'
                    sleep = _is_true(raw.get('sleep'))
                    sleep_target_hours = _sleep_target_hours(raw)
                    sources.append({
                        "id": f"habit::{name.lower()}",
                        "type": "habit",
                        "name": name,
                        "label": name,
                        "polarity": polarity,
                        "sleep": sleep,
                        "sleep_target_hours": sleep_target_hours,
                    })

                for raw in commitments:
                    if not isinstance(raw, dict):
                        continue
                    name = str(raw.get('name') or '').strip()
                    if not name:
                        continue
                    rule = raw.get('rule') if isinstance(raw.get('rule'), dict) else {}
                    kind = str(rule.get('kind') or raw.get('kind') or '').strip().lower()
                    mode = 'negative' if kind in ('never', 'avoid', 'abstain', 'forbidden') else 'positive'
                    sleep = _is_true(raw.get('sleep'))
                    sleep_target_hours = _sleep_target_hours(raw)
                    sources.append({
                        "id": f"commitment::{name.lower()}",
                        "type": "commitment",
                        "name": name,
                        "label": name,
                        "rule_kind": kind or None,
                        "mode": mode,
                        "sleep": sleep,
                        "sleep_target_hours": sleep_target_hours,
                    })

                sources.sort(key=lambda item: (str(item.get("type") or ""), str(item.get("name") or "").lower()))
                self._write_json(200, {"ok": True, "sources": sources})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Tracker sources error: {e}"})
            return
        if parsed.path == "/api/tracker/year":
            try:
                from modules.item_manager import list_all_items

                qs = parse_qs(parsed.query or '')
                year_raw = str((qs.get('year') or [''])[0] or '').strip()
                source_type = str((qs.get('type') or [''])[0] or '').strip().lower()
                source_name = str((qs.get('name') or [''])[0] or '').strip()
                if not source_type or not source_name:
                    self._write_json(400, {"ok": False, "error": "Missing required query params: type, name"})
                    return
                if source_type not in ('habit', 'commitment'):
                    self._write_json(400, {"ok": False, "error": "type must be habit or commitment"})
                    return
                try:
                    year = int(year_raw) if year_raw else datetime.now().year
                except Exception:
                    year = datetime.now().year
                year = max(1970, min(2200, year))
                today_key = datetime.now().strftime('%Y-%m-%d')
                start_dt = datetime(year, 1, 1)
                end_dt = datetime(year, 12, 31)
                sleep_target_qs = str((qs.get('sleep_target_hours') or [''])[0] or '').strip()

                def _is_true(value):
                    if isinstance(value, bool):
                        return value
                    text = str(value or '').strip().lower()
                    return text in ('1', 'true', 'yes', 'y', 'on')

                def _num(value):
                    try:
                        n = float(value)
                        if n > 0:
                            return n
                    except Exception:
                        return None
                    return None

                def _sleep_target_hours(raw):
                    if not isinstance(raw, dict):
                        return None
                    keys = (
                        'sleep_target_hours',
                        'target_sleep_hours',
                        'target_hours',
                        'sleep_hours',
                    )
                    for key in keys:
                        n = _num(raw.get(key))
                        if n is not None:
                            return n
                    target = raw.get('target') if isinstance(raw.get('target'), dict) else {}
                    for key in keys:
                        n = _num(target.get(key))
                        if n is not None:
                            return n
                    return None

                def _hm_to_minutes(value):
                    text = str(value or '').strip()
                    if not text:
                        return None
                    if ':' not in text:
                        return None
                    parts = text.split(':')
                    if len(parts) < 2:
                        return None
                    try:
                        hh = int(str(parts[0]).strip())
                        mm = int(str(parts[1]).strip()[:2])
                    except Exception:
                        return None
                    hh = max(0, min(23, hh))
                    mm = max(0, min(59, mm))
                    return (hh * 60) + mm

                def normalize_status(value):
                    return str(value or '').strip().lower()

                def map_outcome(raw_status, item_type, item_mode):
                    status = normalize_status(raw_status)
                    if not status:
                        return None
                    if item_type == 'habit':
                        if item_mode == 'bad':
                            if status in ('incident', 'completed', 'done', 'violation', 'broken', 'failed'):
                                return 'done'
                            if status in ('not_done', 'clean', 'abstained', 'kept', 'missed', 'skipped', 'cancelled'):
                                return 'not_done'
                            return None
                        if status in ('completed', 'done', 'met', 'success'):
                            return 'done'
                        if status in ('incident', 'violation', 'broken', 'failed', 'missed', 'skipped', 'not_done', 'cancelled'):
                            return 'not_done'
                        return None
                    if status in ('completed', 'done', 'met', 'kept', 'success'):
                        return 'done'
                    if status in ('violation', 'broken', 'failed', 'missed', 'skipped', 'not_done', 'cancelled'):
                        return 'not_done'
                    return None

                tracked_meta = {
                    "type": source_type,
                    "name": source_name,
                    "polarity": "good",
                    "mode": "positive",
                    "rule_kind": None,
                    "sleep": False,
                    "sleep_target_hours": None,
                }
                days = {}
                sleep_minutes_by_date = {}

                if source_type == 'habit':
                    habits = list_all_items('habit') or []
                    target = None
                    for raw in habits:
                        if not isinstance(raw, dict):
                            continue
                        if str(raw.get('name') or '').strip().lower() == source_name.lower():
                            target = raw
                            break
                    if not target:
                        self._write_json(404, {"ok": False, "error": "Habit not found"})
                        return
                    polarity = str(target.get('polarity') or 'good').strip().lower()
                    if polarity not in ('good', 'bad'):
                        polarity = 'good'
                    tracked_meta['polarity'] = polarity
                    tracked_meta['sleep'] = _is_true(target.get('sleep'))
                    tracked_meta['sleep_target_hours'] = _sleep_target_hours(target)

                    completion_dates = target.get('completion_dates') if isinstance(target.get('completion_dates'), list) else []
                    incident_dates = target.get('incident_dates') if isinstance(target.get('incident_dates'), list) else []

                    for raw_date in completion_dates:
                        date_key = str(raw_date or '').strip()
                        if not date_key.startswith(f"{year}-"):
                            continue
                        if polarity == 'bad':
                            days[date_key] = {"state": "not_done", "status": "clean", "source": "habit_file"}
                        else:
                            days[date_key] = {"state": "done", "status": "completed", "source": "habit_file"}

                    for raw_date in incident_dates:
                        date_key = str(raw_date or '').strip()
                        if not date_key.startswith(f"{year}-"):
                            continue
                        if polarity == 'bad':
                            days[date_key] = {"state": "done", "status": "incident", "source": "habit_file"}
                        else:
                            days[date_key] = {"state": "not_done", "status": "incident", "source": "habit_file"}
                else:
                    commitments = list_all_items('commitment') or []
                    target = None
                    for raw in commitments:
                        if not isinstance(raw, dict):
                            continue
                        if str(raw.get('name') or '').strip().lower() == source_name.lower():
                            target = raw
                            break
                    if not target:
                        self._write_json(404, {"ok": False, "error": "Commitment not found"})
                        return
                    rule = target.get('rule') if isinstance(target.get('rule'), dict) else {}
                    kind = str(rule.get('kind') or target.get('kind') or '').strip().lower()
                    mode = 'negative' if kind in ('never', 'avoid', 'abstain', 'forbidden') else 'positive'
                    tracked_meta['mode'] = mode
                    tracked_meta['rule_kind'] = kind or None
                    tracked_meta['sleep'] = _is_true(target.get('sleep'))
                    tracked_meta['sleep_target_hours'] = _sleep_target_hours(target)

                    manual_map = target.get('manual_status_by_date') if isinstance(target.get('manual_status_by_date'), dict) else {}
                    for raw_date, raw_status in manual_map.items():
                        date_key = str(raw_date or '').strip()
                        if not date_key.startswith(f"{year}-"):
                            continue
                        mapped = map_outcome(raw_status, 'commitment', mode)
                        if mapped:
                            days[date_key] = {"state": mapped, "status": normalize_status(raw_status), "source": "manual_status_by_date"}

                # Overlay/augment from completion entries for the full year.
                # This lets tracker reflect explicit check-ins saved by popups and schedule logs.
                comp_dir = os.path.join(ROOT_DIR, 'user', 'schedules', 'completions')
                span_days = (end_dt - start_dt).days + 1
                for offset in range(span_days):
                    dt = start_dt + timedelta(days=offset)
                    date_key = dt.strftime('%Y-%m-%d')
                    comp_path = os.path.join(comp_dir, f"{date_key}.yml")
                    if not os.path.exists(comp_path):
                        continue
                    try:
                        with open(comp_path, 'r', encoding='utf-8') as f:
                            payload = yaml.safe_load(f) or {}
                    except Exception:
                        continue
                    entries = payload.get('entries') if isinstance(payload, dict) else {}
                    if not isinstance(entries, dict):
                        continue
                    for key, raw_entry in entries.items():
                        entry = raw_entry if isinstance(raw_entry, dict) else {"status": raw_entry}
                        entry_name = str(entry.get('name') or '').strip()
                        if not entry_name and isinstance(key, str) and '@' in key:
                            entry_name = str(key.split('@', 1)[0]).strip()
                        if entry_name.lower() != source_name.lower():
                            continue
                        entry_type = str(entry.get('type') or source_type).strip().lower()
                        allow_mixed_sleep = bool(tracked_meta.get('sleep'))
                        if entry_type != source_type and not allow_mixed_sleep:
                            continue
                        mapped = map_outcome(entry.get('status'), source_type, tracked_meta.get('polarity') if source_type == 'habit' else tracked_meta.get('mode'))
                        if not mapped:
                            continue
                        days[date_key] = {
                            "state": mapped,
                            "status": normalize_status(entry.get('status')),
                            "source": "completion_entries",
                        }
                        if tracked_meta.get('sleep') and mapped == 'done':
                            start_m = _hm_to_minutes(entry.get('actual_start') or entry.get('scheduled_start'))
                            end_m = _hm_to_minutes(entry.get('actual_end') or entry.get('scheduled_end'))
                            if start_m is not None and end_m is not None:
                                duration = end_m - start_m
                                if duration <= 0:
                                    duration += 24 * 60
                                if 0 < duration <= 24 * 60:
                                    prev = int(sleep_minutes_by_date.get(date_key) or 0)
                                    sleep_minutes_by_date[date_key] = min(24 * 60, prev + int(duration))

                day_count = (end_dt - start_dt).days + 1
                if year < datetime.now().year:
                    elapsed_days = day_count
                elif year > datetime.now().year:
                    elapsed_days = 0
                else:
                    elapsed_days = max(0, min(day_count, (datetime.now().date() - start_dt.date()).days + 1))
                year_progress = int(round((elapsed_days / day_count) * 100)) if day_count else 0

                sleep_analysis = None
                if tracked_meta.get('sleep'):
                    target_hours = _num(sleep_target_qs)
                    if target_hours is None:
                        target_hours = _num(tracked_meta.get('sleep_target_hours'))
                    if target_hours is None:
                        target_hours = 8.0
                    target_minutes = int(round(target_hours * 60))

                    if year < datetime.now().year:
                        window_end = end_dt.strftime('%Y-%m-%d')
                    elif year > datetime.now().year:
                        window_end = f"{year}-01-01"
                    else:
                        window_end = datetime.now().strftime('%Y-%m-%d')

                    window_start = f"{year}-01-01"
                    logged_values = []
                    for k, v in sleep_minutes_by_date.items():
                        if k < window_start or k > window_end:
                            continue
                        try:
                            iv = int(v)
                        except Exception:
                            continue
                        if iv > 0:
                            logged_values.append((k, iv))
                    logged_values.sort(key=lambda row: row[0])
                    logged_minutes = [row[1] for row in logged_values]
                    logged_days = len(logged_minutes)
                    total_logged = sum(logged_minutes)
                    average_logged = int(round(total_logged / logged_days)) if logged_days else 0
                    short_nights_7h = len([v for v in logged_minutes if v < (7 * 60)])
                    below_target_nights = len([v for v in logged_minutes if v < target_minutes])

                    debt_logged = max(0, (target_minutes * logged_days) - total_logged)
                    surplus_logged = max(0, total_logged - (target_minutes * logged_days))

                    def _rolling_avg(days_back):
                        if days_back <= 0:
                            return 0
                        if year > datetime.now().year:
                            return 0
                        end_date = end_dt.date() if year < datetime.now().year else datetime.now().date()
                        start_date = max(start_dt.date(), end_date - timedelta(days=days_back - 1))
                        vals = []
                        cursor = start_date
                        while cursor <= end_date:
                            k = cursor.strftime('%Y-%m-%d')
                            if k in sleep_minutes_by_date:
                                try:
                                    iv = int(sleep_minutes_by_date[k])
                                except Exception:
                                    iv = 0
                                if iv > 0:
                                    vals.append(iv)
                            cursor += timedelta(days=1)
                        return int(round(sum(vals) / len(vals))) if vals else 0

                    rolling_7d = _rolling_avg(7)
                    rolling_30d = _rolling_avg(30)

                    sleep_analysis = {
                        "target_hours": float(target_hours),
                        "target_minutes": int(target_minutes),
                        "logged_day_count": int(logged_days),
                        "total_logged_minutes": int(total_logged),
                        "average_logged_minutes": int(average_logged),
                        "debt_minutes": int(debt_logged),
                        "surplus_minutes": int(surplus_logged),
                        "short_nights_under_7h": int(short_nights_7h),
                        "below_target_nights": int(below_target_nights),
                        "rolling_7d_average_minutes": int(rolling_7d),
                        "rolling_30d_average_minutes": int(rolling_30d),
                    }

                self._write_json(200, {
                    "ok": True,
                    "year": year,
                    "today": today_key,
                    "tracked": tracked_meta,
                    "days": days,
                    "sleep_minutes_by_date": sleep_minutes_by_date,
                    "sleep_analysis": sleep_analysis,
                    "year_progress_percent": year_progress,
                    "elapsed_days": elapsed_days,
                    "day_count": day_count,
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Tracker year error: {e}"})
            return
        if parsed.path == "/api/milestones":
            try:
                from modules.milestone import main as MilestoneModule  # type: ignore
                from modules.item_manager import list_all_items
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
                        "project": raw.get('project'),
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
                from modules.milestone import main as MilestoneModule  # type: ignore
                MilestoneModule.evaluate_and_update_milestones()
            except Exception:
                pass
            try:
                qs = parse_qs(parsed.query)
                name = (qs.get('name') or [''])[0].strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing goal name"}); return
                from modules.item_manager import read_item_data, list_all_items
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
                from modules.timer import main as Timer
                st = Timer.status()
                self._write_json(200, {"ok": True, "status": st})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer status error: {e}"})
            return
        if parsed.path == "/api/timer/profiles":
            try:
                from modules.timer import main as Timer
                Timer.ensure_default_profiles()
                profiles = {}
                names = Timer.profiles_list() or []
                for name in names:
                    profiles[name] = Timer.profiles_view(name)

                groups = {}
                settings_path = os.path.join(ROOT_DIR, 'user', 'settings', 'timer_settings.yml')
                settings_data = {}
                if os.path.exists(settings_path):
                    try:
                        with open(settings_path, 'r', encoding='utf-8') as fh:
                            settings_data = yaml.safe_load(fh) or {}
                    except Exception:
                        settings_data = {}

                raw_groups = {}
                if isinstance(settings_data, dict):
                    maybe_groups = settings_data.get('profile_groups')
                    if isinstance(maybe_groups, dict):
                        raw_groups = maybe_groups

                known = set(str(n) for n in names)
                assigned = set()
                for label, raw_list in (raw_groups.items() if isinstance(raw_groups, dict) else []):
                    if not isinstance(raw_list, list):
                        continue
                    ordered = []
                    for item in raw_list:
                        name = str(item or '').strip()
                        if not name or name not in known or name in assigned:
                            continue
                        ordered.append(name)
                        assigned.add(name)
                    if ordered:
                        groups[str(label)] = ordered

                remaining = [n for n in names if n not in assigned]
                if remaining:
                    groups['Other'] = remaining

                self._write_json(200, {"ok": True, "profiles": profiles, "profile_groups": groups})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer profiles error: {e}"})
            return
        if parsed.path == "/api/timer/settings":
            try:
                # Load timer_settings.yml if present
                path = os.path.join(ROOT_DIR, 'user', 'settings', 'timer_settings.yml')
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
                profile_path = os.path.join(ROOT_DIR, 'user', 'profile', 'profile.yml')
                profile_data = {}
                nickname = None
                title = None
                avatar_rel = None
                avatar_data_url = None
                welcome_block = { 'line1': None, 'line2': None, 'line3': None }
                exit_block = { 'line1': None, 'line2': None }
                preferences_map = None

                if os.path.exists(profile_path):
                    with open(profile_path, 'r', encoding='utf-8') as f:
                        profile_data = yaml.safe_load(f) or {}
                    nickname = profile_data.get('nickname')
                    title = profile_data.get('title')
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
                            os.path.join(ROOT_DIR, 'user', 'profile', 'preferences.yml'),
                            os.path.join(ROOT_DIR, 'user', 'profile', 'preferences.yaml'),
                            os.path.join(ROOT_DIR, 'user', 'profile', 'preferences_settings.yml'),
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
                    # If path is already under user/, respect as project-relative
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

                response_data = {"ok": True, "profile": {"nickname": nickname, "title": title, "avatar_path": avatar_rel, "avatar_data_url": avatar_data_url, "welcome": welcome_block, "exit": exit_block, "preferences": preferences_map}}
                self._write_json(200, response_data)
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to load profile: {e}"})
            return
        if parsed.path == "/api/profile/avatar":
            try:
                profile_path = os.path.join(ROOT_DIR, 'user', 'profile', 'profile.yml')
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
            # List or fetch user settings files under user/settings
            try:
                qs = parse_qs(parsed.query or '')
                settings_root = os.path.join(ROOT_DIR, 'user', 'settings')
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
        if parsed.path == "/api/registry":
            try:
                qs = parse_qs(parsed.query or "")
                name = (qs.get("name") or [""])[0].strip().lower()
                if name == "trick":
                    self._write_json(200, {"ok": True, "registry": _trick_registry()})
                    return
                if name == "skills":
                    from utilities import registry_builder
                    self._write_json(200, {"ok": True, "registry": registry_builder.build_skills_registry()})
                    return
                if name not in {"command", "item", "property"}:
                    self._write_json(400, {"ok": False, "error": "Invalid registry name"}); return
                reg_path = os.path.join(ROOT_DIR, "registry", f"{name}_registry.json")
                if not os.path.exists(reg_path):
                    self._write_json(404, {"ok": False, "error": "Registry not found"}); return
                with open(reg_path, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                self._write_json(200, {"ok": True, "registry": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Registry error: {e}"})
            return
        if parsed.path == "/api/items":
            # Query params: type, q, props (csv key:value)
            try:
                qs = parse_qs(parsed.query)
                item_type = (qs.get('type') or [''])[0].strip().lower()
                q = (qs.get('q') or [''])[0].strip().lower()
                props_csv = (qs.get('props') or [''])[0]
                props = {}
                default_item_types = [
                    'goal', 'habit', 'commitment', 'task', 'project', 'routine',
                    'subroutine', 'microroutine', 'note', 'milestone',
                    'achievement', 'reward', 'canvas_board', 'inventory',
                    'journal_entry', 'dream_diary_entry',
                ]
                if props_csv:
                    for part in str(props_csv).split(','):
                        if ':' in part:
                            k, v = part.split(':', 1)
                            props[k.strip().lower()] = v.strip().lower()
                list_all_items, _, _, _, get_item_path = im()
                out = []
                item_types = [item_type] if item_type else list(default_item_types)
                for current_type in item_types:
                    items = list_all_items(current_type) or []
                    for d in items:
                        if not isinstance(d, dict):
                            continue
                        # Normalize keys
                        dn = {str(k).lower(): v for k, v in d.items()}
                        name = dn.get('name') or ''
                        haystacks = [name, dn.get('content', ''), dn.get('description', ''), dn.get('summary', ''), dn.get('notes', '')]
                        if q and not any(q in str(value).lower() for value in haystacks):
                            continue
                        ok = True
                        for pk, pv in props.items():
                            dv = dn.get(pk)
                            if isinstance(dv, list):
                                if not any(str(part).lower() == pv for part in dv):
                                    ok = False
                                    break
                            elif dv is None or str(dv).lower() != pv:
                                ok = False
                                break
                        if not ok:
                            continue
                        # Determine updated timestamp from file mtime
                        upd = None
                        try:
                            fpath = get_item_path(current_type, name)
                            if fpath and os.path.exists(fpath):
                                from datetime import datetime as _dt
                                upd = _dt.fromtimestamp(os.path.getmtime(fpath)).strftime('%Y-%m-%d %H:%M')
                        except Exception:
                            upd = None
                        entry = {
                            'name': name,
                            'type': dn.get('type') or current_type,
                            'category': dn.get('category'),
                            'priority': dn.get('priority'),
                            'status': dn.get('status'),
                            'description': dn.get('description'),
                            'summary': dn.get('summary'),
                            'notes': dn.get('notes'),
                            'tags': dn.get('tags'),
                            'due_date': dn.get('due_date') or dn.get('due') or dn.get('deadline'),
                            'deadline': dn.get('deadline'),
                            'due': dn.get('due'),
                            'date': dn.get('date'),
                            'template': dn.get('template'),
                            'template_name': dn.get('template_name'),
                            'template_type': dn.get('template_type'),
                            'template_id': dn.get('template_id'),
                            'template_membership': dn.get('template_membership'),
                            'is_template': bool(dn.get('is_template')),
                            'updated': upd,
                        }
                        if current_type == 'project':
                            entry['state'] = dn.get('state') or dn.get('status')
                            entry['stage'] = dn.get('stage')
                            entry['owner'] = dn.get('owner')
                        elif current_type == 'inventory':
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
        if parsed.path == "/api/sticky-notes":
            try:
                notes = _list_sticky_notes()
                self._write_json(200, {"ok": True, "notes": notes})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Sticky notes error: {e}"})
            return
        if parsed.path == "/api/project/detail":
            try:
                qs = parse_qs(parsed.query or '')
                proj_name = (qs.get('name') or [''])[0].strip()
                if not proj_name:
                    self._write_json(400, {"ok": False, "error": "Missing project name"}); return
                from modules.item_manager import read_item_data, list_all_items
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
                from modules.item_manager import get_item_dir
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
                from modules.item_manager import read_item_data
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
                base = os.path.join(ROOT_DIR, 'user', 'Reviews', t)
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
        if parsed.path == "/api/calendar/overlays":
            try:
                qs = parse_qs(parsed.query or "")
                name = None
                if qs:
                    arr = qs.get("name") or []
                    if arr:
                        name = str(arr[0]).strip()
                if name:
                    preset = _load_calendar_overlay_preset(name)
                    if not preset:
                        self._write_json(404, {"ok": False, "error": "Preset not found"}); return
                    self._write_json(200, {"ok": True, "preset": preset}); return
                presets = _list_calendar_overlay_presets()
                self._write_json(200, {"ok": True, "presets": presets})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Overlay presets error: {e}"})
            return
        if parsed.path == "/api/calendar/happiness":
            try:
                qs = parse_qs(parsed.query or "")
                mode = (qs.get("mode") or ["completed"])[0].strip().lower()
                if mode not in {"completed", "scheduled"}:
                    self._write_json(400, {"ok": False, "error": "Invalid mode"}); return
                now = datetime.now()
                try:
                    year = int((qs.get("year") or [now.year])[0])
                except Exception:
                    year = now.year
                try:
                    month = int((qs.get("month") or [now.month])[0])
                except Exception:
                    month = now.month
                if month < 1 or month > 12:
                    self._write_json(400, {"ok": False, "error": "Invalid month"}); return

                import calendar
                from modules.scheduler import get_flattened_schedule, build_block_key as scheduler_build_block_key
                from modules.item_manager import read_item_data
                from utilities.happiness_assoc import infer_happiness_values

                def to_hm(val):
                    if not val:
                        return None
                    if isinstance(val, datetime):
                        return val.strftime("%H:%M")
                    try:
                        s = str(val).strip()
                    except Exception:
                        return None
                    if not s:
                        return None
                    # accept HH:MM anywhere
                    try:
                        parts = s.split(":")
                        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
                            return f"{int(parts[0]):02d}:{int(parts[1]):02d}"
                    except Exception:
                        return None
                    return None

                def extract_happiness_from_data(data):
                    raw = None
                    if isinstance(data, dict):
                        raw = data.get("happiness")
                    if isinstance(raw, list):
                        return [str(v) for v in raw if v is not None and str(v).strip() != ""]
                    if isinstance(raw, str) and raw.strip():
                        return [raw.strip()]
                    return []

                def happiness_for_block(block):
                    if not isinstance(block, dict):
                        return []
                    raw_vals = extract_happiness_from_data(block)
                    if not raw_vals:
                        raw_vals = extract_happiness_from_data(block.get("original_item_data") or {})
                    item_type = block.get("type") or (block.get("original_item_data") or {}).get("type")
                    name = block.get("name") or (block.get("original_item_data") or {}).get("name")
                    if (not raw_vals) and item_type and name:
                        data = read_item_data(str(item_type).lower(), str(name))
                        if isinstance(data, dict):
                            raw_vals = extract_happiness_from_data(data)
                            inferred = infer_happiness_values(str(item_type).lower(), data)
                            for v in inferred:
                                if str(v).strip().lower() not in {str(x).strip().lower() for x in raw_vals}:
                                    raw_vals.append(v)
                    return raw_vals

                def load_schedule_blocks(date_obj):
                    date_str = date_obj.strftime("%Y-%m-%d")
                    sched_path = schedule_path_for_date(date_str)
                    if not os.path.exists(sched_path):
                        return []
                    try:
                        with open(sched_path, "r", encoding="utf-8") as fh:
                            schedule_data = yaml.safe_load(fh) or []
                    except Exception:
                        return []
                    return [b for b in get_flattened_schedule(schedule_data) if isinstance(b, dict) and not b.get("is_buffer")]

                def count_scheduled(date_obj):
                    blocks = load_schedule_blocks(date_obj)
                    total = 0
                    for block in blocks:
                        vals = happiness_for_block(block)
                        if vals:
                            total += max(1, len(vals))
                    return total

                def count_completed(date_obj):
                    date_str = date_obj.strftime("%Y-%m-%d")
                    comp_path = os.path.join(ROOT_DIR, "user", "schedules", "completions", f"{date_str}.yml")
                    if not os.path.exists(comp_path):
                        return 0
                    try:
                        with open(comp_path, "r", encoding="utf-8") as fh:
                            comp = yaml.safe_load(fh) or {}
                    except Exception:
                        return 0
                    entries = comp.get("entries") if isinstance(comp, dict) else None
                    if not isinstance(entries, dict):
                        return 0
                    blocks = load_schedule_blocks(date_obj)
                    block_map = {}
                    for block in blocks:
                        name = block.get("name") or (block.get("original_item_data") or {}).get("name")
                        start = to_hm(block.get("start_time") or (block.get("original_item_data") or {}).get("start_time"))
                        if not name or not start:
                            continue
                        block_map[scheduler_build_block_key(str(name), start)] = block
                    total = 0
                    for _, entry in entries.items():
                        if not isinstance(entry, dict):
                            continue
                        status = str(entry.get("status", "")).strip().lower()
                        if status != "completed":
                            continue
                        name = entry.get("name")
                        start = to_hm(entry.get("scheduled_start"))
                        if not name or not start:
                            continue
                        block = block_map.get(scheduler_build_block_key(str(name), start))
                        if not block:
                            continue
                        vals = happiness_for_block(block)
                        if vals:
                            total += max(1, len(vals))
                    return total

                days_in_month = calendar.monthrange(year, month)[1]
                heatmap = {}
                max_score = 1
                for day in range(1, days_in_month + 1):
                    date_obj = datetime(year, month, day)
                    score = count_scheduled(date_obj) if mode == "scheduled" else count_completed(date_obj)
                    key = date_obj.strftime("%Y-%m-%d")
                    heatmap[key] = score
                    if score > max_score:
                        max_score = score
                norm = {k: (v / max_score if max_score else 0) for k, v in heatmap.items()}
                self._write_json(200, {"ok": True, "mode": mode, "year": year, "month": month, "heatmap": norm, "max": max_score})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Happiness overlay error: {e}"})
            return
        if parsed.path == "/api/logs":
            try:
                log_path = os.path.join(ROOT_DIR, "logs", "engine.log")
                if not os.path.exists(log_path):
                    self._write_json(200, {"ok": True, "logs": []})
                    return
                qs = parse_qs(parsed.query or "")
                limit = 50
                try:
                    limit = int((qs.get("limit") or [50])[0])
                except Exception:
                    pass
                lines = []
                with open(log_path, "r", encoding="utf-8") as f:
                    all_lines = f.readlines()
                    lines = [ln.strip() for ln in all_lines[-limit:]]
                self._write_json(200, {"ok": True, "logs": lines})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read logs: {e}"})
            return
        if parsed.path == "/api/yesterday/checkin":
            try:
                from modules.item_manager import list_all_items
                qs = parse_qs(parsed.query or "")
                date_raw = str((qs.get("date") or [""])[0] or "").strip()
                auto_miss_raw = str((qs.get("auto_miss") or ["true"])[0] or "true").strip().lower()
                auto_miss = auto_miss_raw not in ("0", "false", "no", "off")
                if date_raw:
                    try:
                        target_dt = datetime.strptime(date_raw, "%Y-%m-%d")
                    except Exception:
                        self._write_json(400, {"ok": False, "error": "Invalid date format; use YYYY-MM-DD"})
                        return
                else:
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

                def _hm(value):
                    if value is None:
                        return None
                    if isinstance(value, datetime):
                        return value.strftime("%H:%M")
                    text = str(value)
                    m = re.search(r"(\d{1,2}):(\d{2})", text)
                    if not m:
                        return None
                    hh = max(0, min(23, int(m.group(1))))
                    mm = max(0, min(59, int(m.group(2))))
                    return f"{hh:02d}:{mm:02d}"

                def _is_window_or_meta(block):
                    try:
                        if bool(block.get("is_buffer")):
                            return True
                        block_id = str(block.get("block_id") or "").lower()
                        window_name = str(block.get("window_name") or "").strip().upper()
                        if block_id.startswith("window::"):
                            return True
                        # Keep true meta-only rows filtered, but do not blanket-drop TIMEBLOCK
                        # because user-authored timeblock entries are legitimate schedulables.
                        if window_name and window_name in ("GAP", "HIERARCHY"):
                            return True
                        if bool(block.get("window")):
                            return True
                    except Exception:
                        return False
                    return False

                flat = []
                # Local cycle-safe walker (avoids relying on upstream flatteners).
                def _walk(items, out, seen):
                    if not isinstance(items, list):
                        return
                    for it in items:
                        if not isinstance(it, dict):
                            continue
                        obj_id = id(it)
                        if obj_id in seen:
                            continue
                        seen.add(obj_id)
                        out.append(it)
                        children = it.get("children") or it.get("items") or []
                        if isinstance(children, list) and children:
                            _walk(children, out, seen)

                try:
                    if isinstance(schedule_data, list):
                        _walk(schedule_data, flat, set())
                    elif isinstance(schedule_data, dict):
                        root_items = (schedule_data.get("items") or schedule_data.get("children") or [])
                        if isinstance(root_items, list):
                            _walk(root_items, flat, set())
                except Exception:
                    flat = []

                scheduled_blocks = []
                for block in flat:
                    if not isinstance(block, dict):
                        continue
                    if _is_window_or_meta(block):
                        continue
                    children = block.get("children") or []
                    if isinstance(children, list) and children:
                        continue
                    name = str(block.get("name") or (block.get("original_item_data") or {}).get("name") or "").strip()
                    start = _hm(block.get("start_time") or (block.get("original_item_data") or {}).get("start_time") or block.get("ideal_start_time"))
                    end = _hm(block.get("end_time") or block.get("ideal_end_time"))
                    item_type = str(block.get("type") or (block.get("original_item_data") or {}).get("type") or "").strip().lower() or "task"
                    if not name or not start:
                        continue
                    key = build_block_key(name, start)
                    scheduled_blocks.append({
                        "key": key,
                        "name": name,
                        "type": item_type,
                        "scheduled_start": start,
                        "scheduled_end": end,
                    })

                completions_dir = os.path.join(ROOT_DIR, "user", "schedules", "completions")
                os.makedirs(completions_dir, exist_ok=True)
                completion_path = os.path.join(completions_dir, f"{target_date}.yml")
                completion_payload = {"entries": {}}
                if os.path.exists(completion_path):
                    try:
                        with open(completion_path, "r", encoding="utf-8") as fh:
                            completion_payload = yaml.safe_load(fh) or {"entries": {}}
                    except Exception:
                        completion_payload = {"entries": {}}
                if not isinstance(completion_payload, dict):
                    completion_payload = {"entries": {}}
                entries = completion_payload.get("entries")
                if not isinstance(entries, dict):
                    entries = {}
                    completion_payload["entries"] = entries

                auto_added = 0
                if auto_miss:
                    now_iso = datetime.now().isoformat(timespec="seconds")
                    for block in scheduled_blocks:
                        key = str(block.get("key") or "")
                        if not key or key in entries:
                            continue
                        entries[key] = {
                            "name": block.get("name"),
                            "status": "missed",
                            "scheduled_start": block.get("scheduled_start"),
                            "scheduled_end": block.get("scheduled_end"),
                            "logged_at": now_iso,
                            "source": "auto_miss_yesterday",
                            "auto_missed": True,
                        }
                        auto_added += 1
                    if auto_added > 0:
                        with open(completion_path, "w", encoding="utf-8") as fh:
                            yaml.safe_dump(completion_payload, fh, default_flow_style=False, sort_keys=False, allow_unicode=True)

                rows = []
                for block in scheduled_blocks:
                    key = str(block.get("key") or "")
                    entry = entries.get(key) if isinstance(entries.get(key), dict) else {}
                    status = str(entry.get("status") or "missed").strip().lower()
                    rows.append({
                        "key": key,
                        "name": block.get("name"),
                        "type": block.get("type"),
                        "scheduled_start": block.get("scheduled_start"),
                        "scheduled_end": block.get("scheduled_end"),
                        "status": status,
                        "auto_missed": bool(entry.get("auto_missed") or entry.get("source") == "auto_miss_yesterday"),
                        "entry": entry,
                    })

                # Fallback: if we still have no scheduled rows but completion entries exist for the day,
                # surface those rows so the popup can still reconcile and not silently disappear.
                if not rows and isinstance(entries, dict) and entries:
                    for key, raw in entries.items():
                        entry = raw if isinstance(raw, dict) else {}
                        name = str(entry.get("name") or (str(key).split("@", 1)[0] if isinstance(key, str) else "Untitled")).strip()
                        start = _hm(entry.get("scheduled_start")) or (_hm(str(key).split("@", 1)[1]) if isinstance(key, str) and "@" in str(key) else None)
                        end = _hm(entry.get("scheduled_end"))
                        status = str(entry.get("status") or "missed").strip().lower()
                        rows.append({
                            "key": str(key),
                            "name": name or "Untitled",
                            "type": str(entry.get("type") or "task").strip().lower() or "task",
                            "scheduled_start": start,
                            "scheduled_end": end,
                            "status": status,
                            "auto_missed": bool(entry.get("auto_missed") or entry.get("source") == "auto_miss_yesterday"),
                            "entry": entry,
                        })

                allowed_schedulables = ["habit", "task", "routine", "subroutine", "microroutine", "timeblock"]
                schedulables = []
                def _add_sched(name, itype):
                    nm = str(name or "").strip()
                    tp = str(itype or "").strip().lower()
                    if not nm or not tp:
                        return
                    schedulables.append({"name": nm, "type": tp})

                for itype in allowed_schedulables:
                    try:
                        items = list_all_items(itype) or []
                    except Exception:
                        items = []
                    for item in items:
                        if not isinstance(item, dict):
                            continue
                        nm = str(item.get("name") or "").strip()
                        if not nm:
                            continue
                        _add_sched(nm, itype)
                # Window-like entries currently live on microroutines with `window:true`.
                try:
                    micros = list_all_items("microroutine") or []
                except Exception:
                    micros = []
                for item in micros:
                    if not isinstance(item, dict):
                        continue
                    nm = str(item.get("name") or "").strip()
                    if not nm:
                        continue
                    win = str(item.get("window") or "").strip().lower()
                    if win in ("true", "1", "yes", "on"):
                        _add_sched(nm, "window")

                # Include commitment-related target items so check-in can quickly log
                # things tied to active commitments.
                try:
                    commitments = list_all_items("commitment") or []
                except Exception:
                    commitments = []
                for c in commitments:
                    if not isinstance(c, dict):
                        continue
                    status = str(c.get("status") or "active").strip().lower()
                    if status not in ("", "active", "pending"):
                        continue
                    targets = c.get("targets") if isinstance(c.get("targets"), list) else []
                    if not targets:
                        assoc = c.get("associated_items") if isinstance(c.get("associated_items"), list) else []
                        forb = c.get("forbidden_items") if isinstance(c.get("forbidden_items"), list) else []
                        targets = assoc or forb
                    for t in targets:
                        if not isinstance(t, dict):
                            continue
                        _add_sched(t.get("name"), t.get("type"))

                    # Legacy singleton target patterns
                    freq = c.get("frequency") if isinstance(c.get("frequency"), dict) else {}
                    never = c.get("never") if isinstance(c.get("never"), dict) else {}
                    one = None
                    if isinstance(freq.get("of"), dict):
                        one = freq.get("of")
                    elif isinstance(never.get("of"), dict):
                        one = never.get("of")
                    if isinstance(one, dict):
                        _add_sched(one.get("name"), one.get("type"))
                    linked = c.get("linked_habit")
                    if isinstance(linked, str) and linked.strip():
                        _add_sched(linked.strip(), "habit")

                dedupe = {}
                for row in schedulables:
                    k = f"{str(row.get('type') or '').lower()}::{str(row.get('name') or '').lower()}"
                    dedupe[k] = row
                schedulables = sorted(
                    list(dedupe.values()),
                    key=lambda r: (str(r.get("type") or "").lower(), str(r.get("name") or "").lower())
                )

                self._write_json(200, {
                    "ok": True,
                    "date": target_date,
                    "schedule_path": sched_path,
                    "completion_path": completion_path,
                    "auto_miss_applied": bool(auto_miss),
                    "auto_missed_added": int(auto_added),
                    "scheduled_count": len(scheduled_blocks),
                    "rows": rows,
                    "schedulables": schedulables,
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Yesterday check-in error: {e}"})
            return
        if parsed.path == "/api/completions":
            try:
                qs = parse_qs(parsed.query or '')
                date_str = None
                start_str = None
                end_str = None
                days_raw = None
                if qs:
                    arr = qs.get('date') or []
                    if arr:
                        date_str = str(arr[0])
                    arr = qs.get('start') or []
                    if arr:
                        start_str = str(arr[0])
                    arr = qs.get('end') or []
                    if arr:
                        end_str = str(arr[0])
                    arr = qs.get('days') or []
                    if arr:
                        days_raw = str(arr[0])

                comp_dir = os.path.join(ROOT_DIR, 'user', 'schedules', 'completions')

                def _read_completed_for_date(target_date: str):
                    comp_path = os.path.join(comp_dir, f"{target_date}.yml")
                    completed = []
                    if os.path.exists(comp_path):
                        try:
                            with open(comp_path, 'r', encoding='utf-8') as f:
                                d = yaml.safe_load(f) or {}
                            entries = d.get("entries") if isinstance(d, dict) else None
                            if isinstance(entries, dict):
                                for k, v in entries.items():
                                    entry = v if isinstance(v, dict) else {"status": v}
                                    status = str(entry.get("status", "")).strip().lower()
                                    if status == 'completed':
                                        name = entry.get("name")
                                        if not name and isinstance(k, str) and "@" in k:
                                            name = k.split("@", 1)[0]
                                        completed.append(str(name or k))
                        except Exception:
                            pass
                    return completed

                if start_str or end_str or days_raw:
                    # Range mode
                    if not start_str:
                        start_str = datetime.now().strftime('%Y-%m-%d')
                    try:
                        start_dt = datetime.strptime(start_str, '%Y-%m-%d')
                    except Exception:
                        start_dt = datetime.now()
                        start_str = start_dt.strftime('%Y-%m-%d')
                    if days_raw and not end_str:
                        try:
                            days = max(1, min(400, int(days_raw)))
                        except Exception:
                            days = 1
                        end_dt = start_dt + timedelta(days=days - 1)
                        end_str = end_dt.strftime('%Y-%m-%d')
                    if not end_str:
                        end_str = start_str
                    try:
                        end_dt = datetime.strptime(end_str, '%Y-%m-%d')
                    except Exception:
                        end_dt = start_dt
                        end_str = start_dt.strftime('%Y-%m-%d')
                    if end_dt < start_dt:
                        start_dt, end_dt = end_dt, start_dt
                        start_str = start_dt.strftime('%Y-%m-%d')
                        end_str = end_dt.strftime('%Y-%m-%d')
                    span_days = (end_dt - start_dt).days + 1
                    span_days = max(1, min(400, span_days))
                    completed_by_date = {}
                    for offset in range(span_days):
                        day = start_dt + timedelta(days=offset)
                        key = day.strftime('%Y-%m-%d')
                        completed_by_date[key] = _read_completed_for_date(key)
                    self._write_yaml(200, { 'ok': True, 'start': start_str, 'end': end_str, 'completed_by_date': completed_by_date })
                else:
                    # Default to today
                    if not date_str:
                        date_str = datetime.now().strftime('%Y-%m-%d')
                    completed = _read_completed_for_date(date_str)
                    self._write_yaml(200, { 'ok': True, 'date': date_str, 'completed': completed })
            except Exception as e:
                self._write_yaml(500, { 'ok': False, 'error': f'Completions error: {e}' })
            return
        if parsed.path == "/api/today":
            # Return simplified blocks for today's schedule as YAML { ok, blocks }
            date_str = datetime.now().strftime('%Y-%m-%d')
            sched_path = schedule_path_for_date(date_str)
            if not os.path.exists(sched_path):
                self._write_yaml(404, {"ok": False, "error": "schedule file not found"})
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
                
                def is_anchored(it: dict) -> bool:
                    try:
                        if it.get('anchored'):
                            return True
                        reschedule = it.get('reschedule')
                        if isinstance(reschedule, str) and reschedule.strip().lower() == 'never':
                            return True
                        orig = it.get('original_item_data') or {}
                        res_orig = orig.get('reschedule')
                        if isinstance(res_orig, str) and res_orig.strip().lower() == 'never':
                            return True
                    except Exception:
                        return False
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
                            block_id = str(it.get('block_id') or '')
                            window_name = str(it.get('window_name') or '')
                            is_window = bool(it.get('window')) or block_id.lower().startswith('window::') or window_name.strip().upper() not in ('', 'GAP', 'ANCHOR', 'HIERARCHY', 'TIMEBLOCK')
                            blocks.append({
                                'start': start_s,
                                'end': end_s,
                                'text': str(name),
                                'type': str(item_type).lower(),
                                'depth': int(depth),
                                'is_parallel': bool(is_parallel(it)),
                                'anchored': bool(is_anchored(it)),
                                'reschedule': str(it.get('reschedule') or (it.get('original_item_data') or {}).get('reschedule') or ''),
                                'order': int(order_idx),
                                'block_id': block_id,
                                'window_name': window_name,
                                'window': is_window,
                            })
                        # Recurse children if present
                        child_list = it.get('children') or it.get('items') or []
                        if isinstance(child_list, list):
                            walk(child_list, depth+1)

                if isinstance(schedule_data, list):
                    walk(schedule_data, depth=0)
                elif isinstance(schedule_data, dict):
                    walk((schedule_data.get('items') or schedule_data.get('children') or []), depth=0)

                self._write_yaml(200, {"ok": True, "blocks": blocks})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Failed to read schedule: {e}"})
            return
        if parsed.path == "/api/week":
            try:
                qs = parse_qs(parsed.query or "")
                days = int(qs.get('days', ['7'])[0])
                days = max(1, min(14, days))
                start_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

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

                def is_parallel(it: dict) -> bool:
                    try:
                        if it.get('is_parallel_item'):
                            return True
                        orig = it.get('original_item_data') or {}
                        return str(orig.get('duration', '')).strip().lower() == 'parallel'
                    except Exception:
                        return False
                
                def is_anchored(it: dict) -> bool:
                    try:
                        if it.get('anchored'):
                            return True
                        reschedule = it.get('reschedule')
                        if isinstance(reschedule, str) and reschedule.strip().lower() == 'never':
                            return True
                        orig = it.get('original_item_data') or {}
                        res_orig = orig.get('reschedule')
                        if isinstance(res_orig, str) and res_orig.strip().lower() == 'never':
                            return True
                    except Exception:
                        return False
                    return False

                def flatten(schedule_data):
                    blocks = []
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
                                block_id = str(it.get('block_id') or '')
                                window_name = str(it.get('window_name') or '')
                                is_window = bool(it.get('window')) or block_id.lower().startswith('window::') or window_name.strip().upper() not in ('', 'GAP', 'ANCHOR', 'HIERARCHY', 'TIMEBLOCK')
                                blocks.append({
                                    'start': start_s,
                                    'end': end_s,
                                    'text': str(name),
                                    'type': str(item_type).lower(),
                                    'depth': int(depth),
                                    'is_parallel': bool(is_parallel(it)),
                                    'anchored': bool(is_anchored(it)),
                                    'reschedule': str(it.get('reschedule') or (it.get('original_item_data') or {}).get('reschedule') or ''),
                                    'order': int(order_idx),
                                    'block_id': block_id,
                                    'window_name': window_name,
                                    'window': is_window,
                                })
                            child_list = it.get('children') or it.get('items') or []
                            if isinstance(child_list, list):
                                walk(child_list, depth + 1)
                    if isinstance(schedule_data, list):
                        walk(schedule_data, depth=0)
                    elif isinstance(schedule_data, dict):
                        walk((schedule_data.get('items') or schedule_data.get('children') or []), depth=0)
                    return blocks

                from modules.planner import build_preview_for_date

                days_payload = []
                for offset in range(days):
                    date_obj = start_date + timedelta(days=offset)
                    label = date_obj.strftime('%A')
                    if offset == 0:
                        sched_path = schedule_path_for_date(date_obj)
                        sched_data = []
                        if os.path.exists(sched_path):
                            try:
                                with open(sched_path, 'r', encoding='utf-8') as f:
                                    sched_data = yaml.safe_load(f) or []
                            except Exception:
                                sched_data = []
                        blocks = flatten(sched_data)
                        # Keep today's column populated even when today's schedule file
                        # has not been generated yet (or is temporarily empty).
                        if not blocks:
                            preview, _conflicts = build_preview_for_date(date_obj, show_warnings=False)
                            blocks = flatten(preview or [])
                    else:
                        preview, _conflicts = build_preview_for_date(date_obj, show_warnings=False)
                        blocks = flatten(preview or [])
                    days_payload.append({
                        "date": date_obj.strftime('%Y-%m-%d'),
                        "label": label,
                        "blocks": blocks,
                    })

                self._write_json(200, {"ok": True, "days": days_payload})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to build week view: {e}"})
            return
        # Serve project Assets under /assets/ (case-insensitive URL segment)
        path_l = parsed.path.lower()
        # Serve project temp files under /temp/ (case-insensitive URL segment)
        if path_l.startswith("/temp/"):
            try:
                _first, _second, rel = parsed.path.split('/', 2)
            except ValueError:
                rel = ''
            temp_root = _legacy_or_canonical_temp_path("")
            fpath = os.path.abspath(os.path.join(temp_root, rel))
            if not _path_within(temp_root, fpath):
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
            assets_root = os.path.join(ROOT_DIR, 'assets')
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
        
        # /api/items - List items by type (for Item Manager widget)
        if parsed.path == "/api/items":
            self._safe_stderr(f"DEBUG: /api/items handler hit, query={parsed.query}\n")
            try:
                qs = parse_qs(parsed.query or "")
                item_type = (qs.get("type") or ["task"])[0]
                search_q = (qs.get("q") or [""])[0].lower()
                self._safe_stderr(f"DEBUG: /api/items type={item_type}, search={search_q}\n")
                
                list_all_items, read_item_data, write_item_data, delete_item, get_item_path = im()
                all_items = list_all_items(item_type) or []
                self._safe_stderr(f"DEBUG: /api/items list_all_items returned {len(all_items)} items\n")
                results = []
                for raw in all_items:
                    if not isinstance(raw, dict):
                        continue
                    name = raw.get("name") or ""
                    # Search filter
                    if search_q:
                        name_match = search_q in name.lower()
                        content_match = False
                        for v in raw.values():
                            if isinstance(v, str) and search_q in v.lower():
                                content_match = True
                                break
                        if not name_match and not content_match:
                            continue
                    # Format item
                    updated = raw.get("updated") or raw.get("last_updated") or raw.get("created") or ""
                    results.append({
                        "name": name,
                        "type": raw.get("type") or item_type,
                        "priority": raw.get("priority") or "",
                        "status": raw.get("status") or "",
                        "category": raw.get("category") or "",
                        "updated": str(updated)[:10] if updated else "",
                    })
                self._write_json(200, {"ok": True, "items": results})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to list items: {e}"})
            return
        
        # /api/item - Get single item content (for Item Manager widget)
        if parsed.path == "/api/item":
            try:
                qs = parse_qs(parsed.query or "")
                item_type = (qs.get("type") or ["task"])[0]
                name = (qs.get("name") or [""])[0]
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing name"})
                    return
                list_all_items, read_item_data, write_item_data, delete_item, get_item_path = im()
                data = read_item_data(item_type, name)
                if data is None:
                    self._write_json(404, {"ok": False, "error": "Item not found"})
                    return
                # Serialize to YAML
                content = yaml.safe_dump(data, allow_unicode=True, sort_keys=False) if isinstance(data, dict) else str(data)
                self._write_json(200, {"ok": True, "content": content, "item": data})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to get item: {e}"})
            return
        
        if parsed.path == "/api/editor":
            try:
                qs = parse_qs(parsed.query or "")
                path_arg = (qs.get("path") or [""])[0].strip()
                target_path, err = _resolve_editor_api_target(path_arg)
                if err:
                    self._write_json(403 if err != "Missing path" else 400, {"ok": False, "error": err})
                    return
                
                if os.path.isdir(target_path):
                    # List contents (simple top-level for now, client can traverse)
                    entries = []
                    for fn in os.listdir(target_path):
                        full = os.path.join(target_path, fn)
                        is_dir = os.path.isdir(full)
                        entries.append({
                            "name": fn,
                            "is_dir": is_dir
                        })
                    entries.sort(key=lambda x: (not x['is_dir'], x['name'].lower()))
                    # Provide relative path for client
                    rel = os.path.relpath(target_path, ROOT_DIR)
                    if rel == ".": rel = ""
                    self._write_json(200, {"ok": True, "type": "directory", "path": rel, "entries": entries})
                elif os.path.isfile(target_path):
                    enc = (qs.get("encoding") or ["utf-8"])[0].strip()
                    try:
                        with open(target_path, 'r', encoding=enc, errors='replace') as f:
                            content = f.read()
                    except LookupError:
                        # Fallback if invalid encoding
                        with open(target_path, 'r', encoding='utf-8', errors='replace') as f:
                            content = f.read()
                    
                    rel = os.path.relpath(target_path, ROOT_DIR)
                    self._write_json(200, {"ok": True, "type": "file", "path": rel, "content": content, "encoding": enc})
                else:
                    self._write_json(404, {"ok": False, "error": "Path not found"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Editor error: {e}"})
            return
        if parsed.path == "/api/editor/open-request":
            try:
                req = _editor_open_request_pop()
                self._write_json(200, {"ok": True, "request": req})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Editor open request error: {e}"})
            return
        if parsed.path == "/api/trick/open-request":
            try:
                qs = parse_qs(parsed.query or "")
                since = 0
                try:
                    since = int((qs.get("since") or ["0"])[0] or 0)
                except Exception:
                    since = 0
                req = _trick_open_request_latest()
                if isinstance(req, dict):
                    try:
                        if int(req.get("id") or 0) <= since:
                            req = None
                    except Exception:
                        pass
                self._write_json(200, {"ok": True, "request": req})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"TRICK open request error: {e}"})
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

        if parsed.path == "/api/trick":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"})
                    return
                req = _trick_parse_request(payload)
                cmd = req.get("command") or ""
                target = req.get("target") or ""
                actor = req.get("actor") or "default"

                if cmd not in {"OPEN", "CLOSE", "LIST", "GET", "SET", "TYPE", "COPY", "PASTE", "PRESS", "CLICK", "HIGHLIGHT", "WAIT"}:
                    self._write_json(400, {"ok": False, "error": "Invalid TRICK command"})
                    return

                if cmd in {"OPEN", "CLOSE", "LIST"}:
                    if target.count(".") < 1:
                        self._write_json(400, {"ok": False, "error": "Target must be type.name"})
                        return
                    surface = ".".join(target.split(".")[:2])
                    if not _trick_surface_exists(surface):
                        self._write_json(404, {"ok": False, "error": f"Unknown TRICK surface: {surface}"})
                        return
                    if cmd == "OPEN":
                        _trick_note_surface_action(surface, "open", actor)
                        open_req = _trick_open_request_push(surface, "open")
                        self._write_json(200, {
                            "ok": True,
                            "command": cmd,
                            "target": surface,
                            "result": {
                                "opened": bool(open_req),
                                "mode": "queued_ui",
                                "request": open_req,
                                "note": "Open request queued for dashboard UI.",
                            },
                        })
                        return
                    if cmd == "CLOSE":
                        _trick_note_surface_action(surface, "close", actor)
                        close_req = _trick_open_request_push(surface, "close")
                        self._write_json(200, {
                            "ok": True,
                            "command": cmd,
                            "target": surface,
                            "result": {
                                "closed": bool(close_req),
                                "mode": "queued_ui",
                                "request": close_req,
                                "note": "Close request queued for dashboard UI.",
                            },
                        })
                        return

                    reg = _trick_registry()
                    rows = []
                    for s in reg.get("surfaces", []) if isinstance(reg, dict) else []:
                        if str(s.get("id") or "").lower() == surface:
                            rows = s.get("elements") if isinstance(s.get("elements"), list) else []
                            break
                    self._write_json(200, {"ok": True, "command": cmd, "target": surface, "result": {"elements": rows}})
                    return

                if not target:
                    self._write_json(400, {"ok": False, "error": "Missing target"})
                    return

                if cmd == "GET":
                    ok, result, err = _trick_get_value(target, actor)
                    self._write_json(200 if ok else 404, {"ok": ok, "command": cmd, "target": target, "result": result, "error": err})
                    return

                if cmd == "SET":
                    if not _trick_element_allowed(target, "set"):
                        self._write_json(400, {"ok": False, "error": f"SET not allowed for target: {target}"})
                        return
                    ok, result, err = _trick_set_value(target, req.get("value"), actor)
                    self._write_json(200 if ok else 400, {"ok": ok, "command": cmd, "target": target, "result": result, "error": err})
                    return

                if cmd == "TYPE":
                    if not _trick_element_allowed(target, "type"):
                        self._write_json(400, {"ok": False, "error": f"TYPE not allowed for target: {target}"})
                        return
                    ok, result, err = _trick_type_value(target, req.get("value"), actor)
                    self._write_json(200 if ok else 400, {"ok": ok, "command": cmd, "target": target, "result": result, "error": err})
                    return

                if cmd == "COPY":
                    if not _trick_element_allowed(target, "copy"):
                        self._write_json(400, {"ok": False, "error": f"COPY not allowed for target: {target}"})
                        return
                    ok, result, err = _trick_copy_value(target, actor)
                    self._write_json(200 if ok else 400, {"ok": ok, "command": cmd, "target": target, "result": result, "error": err})
                    return

                if cmd == "PASTE":
                    if not _trick_element_allowed(target, "paste"):
                        self._write_json(400, {"ok": False, "error": f"PASTE not allowed for target: {target}"})
                        return
                    ok, result, err = _trick_paste_value(target, actor)
                    self._write_json(200 if ok else 400, {"ok": ok, "command": cmd, "target": target, "result": result, "error": err})
                    return

                if cmd == "PRESS":
                    if not _trick_element_allowed(target, "press"):
                        self._write_json(400, {"ok": False, "error": f"PRESS not allowed for target: {target}"})
                        return
                    ok, result, err = _trick_press_key(target, req.get("value"), actor)
                    self._write_json(200 if ok else 400, {"ok": ok, "command": cmd, "target": target, "result": result, "error": err})
                    return

                if cmd == "CLICK":
                    if not _trick_element_allowed(target, "click"):
                        self._write_json(400, {"ok": False, "error": f"CLICK not allowed for target: {target}"})
                        return
                    ok, result, err = _trick_click(target, actor)
                    self._write_json(200 if ok else 500, {"ok": ok, "command": cmd, "target": target, "result": result, "error": err})
                    return

                if cmd == "HIGHLIGHT":
                    surface = ".".join(target.split(".")[:2]) if target.count(".") >= 1 else target
                    if not _trick_surface_exists(surface):
                        self._write_json(404, {"ok": False, "error": f"Unknown TRICK surface: {surface}"})
                        return
                    if target.count(".") >= 2 and not _trick_element_allowed(target, "highlight"):
                        self._write_json(400, {"ok": False, "error": f"HIGHLIGHT not allowed for target: {target}"})
                        return
                    req_ui = _trick_highlight_request_push(
                        target,
                        actor=actor,
                        mode=req.get("mode") or req.get("value") or "spotlight",
                        duration_ms=req.get("duration_ms") or 0,
                        message=req.get("message"),
                    )
                    self._write_json(200 if req_ui else 400, {
                        "ok": bool(req_ui),
                        "command": cmd,
                        "target": target,
                        "result": {
                            "highlighted": bool(req_ui),
                            "mode": str(req.get("mode") or req.get("value") or "spotlight").strip().lower() or "spotlight",
                            "duration_ms": int(req.get("duration_ms") or 0),
                            "request": req_ui,
                            "note": "Highlight request queued for dashboard UI.",
                        },
                        "error": None if req_ui else "Failed to queue highlight request",
                    })
                    return

                if cmd == "WAIT":
                    predicate = req.get("predicate") or "exists"
                    expected = req.get("expected")
                    timeout_ms = int(req.get("timeout_ms") or 5000)
                    start_t = time.time()
                    last = {}
                    while int((time.time() - start_t) * 1000) < timeout_ms:
                        matched, details = _trick_eval_predicate(predicate, target, expected, actor)
                        last = details if isinstance(details, dict) else {}
                        if matched:
                            self._write_json(200, {
                                "ok": True,
                                "command": cmd,
                                "target": target,
                                "result": {
                                    "predicate": predicate,
                                    "matched": True,
                                    "elapsed_ms": int((time.time() - start_t) * 1000),
                                    "details": last,
                                },
                            })
                            return
                        time.sleep(0.2)
                    self._write_json(408, {
                        "ok": False,
                        "command": cmd,
                        "target": target,
                        "error": "WAIT timeout",
                        "result": {
                            "predicate": predicate,
                            "matched": False,
                            "elapsed_ms": timeout_ms,
                            "details": last,
                        },
                    })
                    return
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"TRICK execution failed: {e}"})
            return

        if parsed.path == "/api/aduc/chat":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"})
                    return
                familiar = str(payload.get("familiar") or "nia").strip() or "nia"
                message = str(payload.get("message") or "").strip()
                if not message:
                    self._write_json(400, {"ok": False, "error": "Missing message"})
                    return
                aduc_payload = {"familiar": familiar, "message": message}
                selected_skills = payload.get("selected_skills")
                if isinstance(selected_skills, list):
                    clean = [str(s).strip() for s in selected_skills if str(s).strip()]
                    if clean:
                        aduc_payload["selected_skills"] = clean
                status, body = _aduc_proxy_request("/chat", method="POST", payload=aduc_payload)
                self._write_json(status, body if isinstance(body, dict) else {"ok": False, "error": "Invalid ADUC response"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to send ADUC chat: {e}"})
            return
        if parsed.path == "/api/aduc/settings":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"})
                    return
                status, body = _aduc_proxy_request("/settings", method="POST", payload=payload)
                self._write_json(status, body if isinstance(body, dict) else {"ok": False, "error": "Invalid ADUC response"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to update ADUC settings: {e}"})
            return
        if parsed.path == "/api/aduc/cli/memory/clear":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"})
                    return
                status, body = _aduc_proxy_request("/cli/memory/clear", method="POST", payload=payload)
                self._write_json(status, body if isinstance(body, dict) else {"ok": False, "error": "Invalid ADUC response"})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to clear ADUC memory: {e}"})
            return

        if parsed.path == "/api/shell/exec":
            # Execute arbitrary shell command
            # Security Warning: This allows full shell access
            cmd = str(payload.get('cmd') or '').strip()
            if not cmd:
                self._write_json(400, {"ok": False, "error": "Missing 'cmd'"})
                return
            
            import subprocess
            try:
                # Use subprocess to run command
                # Capture output
                # Use shell=True for convenience in this local env, though risky in prod
                # Combined stdout/stderr? Or separate?
                
                # Check for 'python' and redirect to sys.executable if needed?
                # Actually, let's just run it.
                
                proc = subprocess.run(
                    cmd, 
                    shell=True, 
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.PIPE,
                    text=True
                )
                
                self._write_json(200, {
                    "ok": proc.returncode == 0, 
                    "stdout": proc.stdout, 
                    "stderr": proc.stderr,
                    "code": proc.returncode
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Exec failed: {e}"})
            return

        if parsed.path == "/api/system/command":
            # Simple wrapper to run a full command string
            cmd_str = str(payload.get('command') or '').strip()
            if not cmd_str:
                self._write_json(400, {"ok": False, "error": "Missing command"})
                return
            import shlex
            try:
                parts = shlex.split(cmd_str)
            except Exception as e:
                self._write_json(400, {"ok": False, "error": f"Invalid command format: {e}"}); return
            
            if not parts:
                self._write_json(400, {"ok": False, "error": "Empty command"}); return
            
            ok, out, err = run_console_command(parts[0], parts[1:])
            self._write_json(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err, "message": out})
            return

        if parsed.path == "/api/system/databases":
            # List configured databases (registry + any orphan .db files)
            try:
                databases = _list_system_databases()
                self._write_json(200, {"ok": True, "databases": databases})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": str(e)})
            return

        if parsed.path == "/api/system/registries":
            # List available registry types
            registries = [
                {"name": "wizards", "description": "Wizard Registry"},
                {"name": "themes", "description": "Theme Registry"},
                {"name": "commands", "description": "Command Registry"},
                {"name": "item_types", "description": "Item Types Registry"}
            ]
            self._write_json(200, {"ok": True, "registries": registries})
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

            # Pass args and properties separately. Appending property tokens into args
            # breaks commands that parse colon syntax from positional arguments (e.g. mark).
            ok, out, err = run_console_command(cmd, args, props)
            status = 200 if ok else 500
            self._write_json(status, {"ok": ok, "stdout": out, "stderr": err})
            return

        if parsed.path == "/api/yesterday/checkin":
            try:
                date_raw = str(payload.get("date") or "").strip()
                if date_raw:
                    try:
                        target_dt = datetime.strptime(date_raw, "%Y-%m-%d")
                    except Exception:
                        self._write_json(400, {"ok": False, "error": "Invalid date format; use YYYY-MM-DD"})
                        return
                else:
                    target_dt = datetime.now() - timedelta(days=1)
                target_date = target_dt.strftime("%Y-%m-%d")

                completions_dir = os.path.join(ROOT_DIR, "user", "schedules", "completions")
                os.makedirs(completions_dir, exist_ok=True)
                completion_path = os.path.join(completions_dir, f"{target_date}.yml")
                completion_payload = {"entries": {}}
                if os.path.exists(completion_path):
                    try:
                        with open(completion_path, "r", encoding="utf-8") as fh:
                            completion_payload = yaml.safe_load(fh) or {"entries": {}}
                    except Exception:
                        completion_payload = {"entries": {}}
                if not isinstance(completion_payload, dict):
                    completion_payload = {"entries": {}}
                entries = completion_payload.get("entries")
                if not isinstance(entries, dict):
                    entries = {}
                    completion_payload["entries"] = entries

                updates = payload.get("updates") if isinstance(payload.get("updates"), list) else []
                additional = payload.get("additional") if isinstance(payload.get("additional"), list) else []
                allowed_statuses = {"completed", "partial", "skipped", "missed", "cancelled"}

                def _hm(value):
                    if value is None:
                        return None
                    if isinstance(value, datetime):
                        return value.strftime("%H:%M")
                    text = str(value)
                    m = re.search(r"(\d{1,2}):(\d{2})", text)
                    if not m:
                        return None
                    hh = max(0, min(23, int(m.group(1))))
                    mm = max(0, min(59, int(m.group(2))))
                    return f"{hh:02d}:{mm:02d}"

                updated_count = 0
                added_count = 0
                errors = []

                for row in updates:
                    if not isinstance(row, dict):
                        continue
                    name = str(row.get("name") or "").strip()
                    key = str(row.get("key") or "").strip()
                    start = _hm(row.get("scheduled_start"))
                    end = _hm(row.get("scheduled_end"))
                    status = str(row.get("status") or "").strip().lower()
                    if status not in allowed_statuses:
                        continue
                    if not key and (not name or not start):
                        continue
                    existing = entries.get(key) if isinstance(entries.get(key), dict) else {}
                    if not name:
                        name = str(existing.get("name") or key.split("@", 1)[0] or "").strip()
                    if not start:
                        start = _hm(existing.get("scheduled_start")) or _hm(key.split("@", 1)[1] if "@" in key else None)
                    if not end:
                        end = _hm(existing.get("scheduled_end"))
                    if not name or not start or not end:
                        continue
                    did_props = {
                        "date": target_date,
                        "start_time": start,
                        "end_time": end,
                        "status": status,
                        "source": "yesterday_checkin",
                    }
                    actual_start = _hm(row.get("actual_start")) if row.get("actual_start") is not None else None
                    actual_end = _hm(row.get("actual_end")) if row.get("actual_end") is not None else None
                    if actual_start:
                        did_props["actual_start"] = actual_start
                    if actual_end:
                        did_props["actual_end"] = actual_end
                    note = row.get("note")
                    if isinstance(note, str) and note.strip():
                        did_props["note"] = note.strip()
                    quality = row.get("quality")
                    if isinstance(quality, str) and quality.strip():
                        did_props["quality"] = quality.strip()
                    ok, out, err = run_console_command("did", [name], did_props)
                    if ok:
                        updated_count += 1
                    else:
                        errors.append({"name": name, "kind": "update", "stdout": out, "stderr": err})

                for row in additional:
                    if not isinstance(row, dict):
                        continue
                    name = str(row.get("name") or "").strip()
                    item_type = str(row.get("type") or "task").strip().lower()
                    status = str(row.get("status") or "completed").strip().lower()
                    if not name or status not in allowed_statuses:
                        continue
                    start = _hm(row.get("scheduled_start")) or _hm(row.get("actual_start")) or "00:00"
                    end = _hm(row.get("scheduled_end")) or _hm(row.get("actual_end")) or start
                    did_props = {
                        "date": target_date,
                        "start_time": start,
                        "end_time": end,
                        "status": status,
                        "type": item_type,
                        "source": "yesterday_checkin_additional",
                        "additional": True,
                    }
                    did_props["actual_start"] = _hm(row.get("actual_start")) or start
                    did_props["actual_end"] = _hm(row.get("actual_end")) or end
                    note = row.get("note")
                    if isinstance(note, str) and note.strip():
                        did_props["note"] = note.strip()
                    quality = row.get("quality")
                    if isinstance(quality, str) and quality.strip():
                        did_props["quality"] = quality.strip()
                    ok, out, err = run_console_command("did", [name], did_props)
                    if ok:
                        added_count += 1
                    else:
                        errors.append({"name": name, "kind": "additional", "stdout": out, "stderr": err})

                # Read back current total after CLI writes.
                total_entries = 0
                try:
                    if os.path.exists(completion_path):
                        with open(completion_path, "r", encoding="utf-8") as fh:
                            refreshed = yaml.safe_load(fh) or {}
                        refreshed_entries = refreshed.get("entries") if isinstance(refreshed, dict) else {}
                        if isinstance(refreshed_entries, dict):
                            total_entries = len(refreshed_entries)
                except Exception:
                    total_entries = 0

                overall_ok = len(errors) == 0
                self._write_json(200 if overall_ok else 207, {
                    "ok": overall_ok,
                    "date": target_date,
                    "completion_path": completion_path,
                    "updated": int(updated_count),
                    "added_additional": int(added_count),
                    "total_entries": int(total_entries),
                    "errors": errors,
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Yesterday check-in save failed: {e}"})
            return

        if parsed.path == "/api/commitments/override":
            try:
                from modules.item_manager import read_item_data, write_item_data
                name = str(payload.get('name') or '').strip()
                state = str(payload.get('state') or '').strip().lower()
                date_key = str(payload.get('date') or datetime.now().strftime('%Y-%m-%d')).strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing commitment name"})
                    return
                if state not in ('met', 'violation', 'clear'):
                    self._write_json(400, {"ok": False, "error": "State must be met, violation, or clear"})
                    return
                data = read_item_data('commitment', name)
                if not isinstance(data, dict):
                    self._write_json(404, {"ok": False, "error": "Commitment not found"})
                    return
                manual_map = data.get('manual_status_by_date') if isinstance(data.get('manual_status_by_date'), dict) else {}
                if state == 'clear':
                    manual_map.pop(date_key, None)
                else:
                    manual_map[date_key] = state
                data['manual_status_by_date'] = manual_map
                write_item_data('commitment', name, data)
                self._write_json(200, {"ok": True, "name": name, "date": date_key, "state": state})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Commitment override failed: {e}"})
            return

        if parsed.path in ("/api/habits/complete", "/api/habits/incident"):
            try:
                from modules.item_manager import read_item_data, write_item_data
                name = str(payload.get("name") or "").strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing habit name"})
                    return
                data = read_item_data("habit", name)
                if not isinstance(data, dict):
                    self._write_json(404, {"ok": False, "error": "Habit not found"})
                    return
                today = datetime.now().strftime("%Y-%m-%d")
                polarity = str(data.get("polarity") or "good").strip().lower()
                completion_dates = data.get("completion_dates") if isinstance(data.get("completion_dates"), list) else []
                incident_dates = data.get("incident_dates") if isinstance(data.get("incident_dates"), list) else []
                previous_last_completed = data.get("last_completed")
                if today not in completion_dates:
                    completion_dates.append(today)
                data["completion_dates"] = completion_dates

                if parsed.path.endswith("/incident") or polarity == "bad":
                    if today not in incident_dates:
                        incident_dates.append(today)
                    data["incident_dates"] = incident_dates
                    prev_last = data.get("last_incident")
                    if prev_last:
                        try:
                            prev_dt = datetime.strptime(str(prev_last), "%Y-%m-%d").date()
                            today_dt = datetime.strptime(today, "%Y-%m-%d").date()
                            just_ended = max(0, (today_dt - prev_dt).days)
                            if just_ended > int(data.get("clean_longest_streak", 0) or 0):
                                data["clean_longest_streak"] = just_ended
                        except Exception:
                            pass
                    data["last_incident"] = today
                    data["clean_current_streak"] = 0
                    action = "incident"
                else:
                    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
                    if previous_last_completed == yesterday:
                        data["current_streak"] = int(data.get("current_streak", 0) or 0) + 1
                    else:
                        data["current_streak"] = 1
                    if int(data.get("current_streak", 0) or 0) > int(data.get("longest_streak", 0) or 0):
                        data["longest_streak"] = int(data.get("current_streak", 0) or 0)
                    action = "complete"
                data["last_completed"] = today

                write_item_data("habit", name, data)
                self._write_json(200, {"ok": True, "name": name, "action": action, "date": today})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Habit update failed: {e}"})
            return

        if parsed.path == "/api/link/board":
            if not _link_auth_ok(self.headers):
                self._write_json(401, {"ok": False, "error": "Unauthorized"})
                return
            try:
                name = str(payload.get("name") or "").strip()
                content = payload.get("content") or {}
                if not name and isinstance(content, dict):
                    name = str(content.get("name") or "").strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing name"})
                    return
                if not isinstance(content, dict):
                    self._write_json(400, {"ok": False, "error": "Invalid content"})
                    return
                content["type"] = "canvas_board"
                content["name"] = name
                from modules.item_manager import write_item_data
                write_item_data("canvas_board", name, content)
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Save failed: {e}"})
            return

        if parsed.path.startswith("/api/datacards/"):
            # /api/datacards/...
            try:
                from modules import data_card_manager as DataCardManager
                subpath = parsed.path[len("/api/datacards/"):]
                
                # GET /api/datacards/series
                if subpath == "series":
                    series = DataCardManager.get_series_list()
                    self._write_json(200, {"ok": True, "series": series})
                    return

                # POST /api/datacards/import
                if subpath == "import" and self.command == "POST":
                    length = int(self.headers.get('Content-Length', 0))
                    body = self.rfile.read(length).decode('utf-8')
                    try:
                        payload = json.loads(body)
                        itype = payload.get("item_type")
                        iname = payload.get("item_name")
                        target_series = payload.get("series")
                        mapping = payload.get("mapping")
                        
                        ok, msg = DataCardManager.import_from_item(itype, iname, target_series, mapping)
                        self._write_json(200 if ok else 400, {"ok": ok, "message": msg})
                    except Exception as e:
                        self._write_json(500, {"ok": False, "error": str(e)})
                    return

                # /api/datacards/:series/cards
                # /api/datacards/:series/rules
                parts = subpath.split('/')
                if len(parts) >= 2:
                    series_name = parts[0]
                    action = parts[1]
                    
                    if action == "cards":
                        if self.command == "POST":
                            # Save card
                            length = int(self.headers.get('Content-Length', 0))
                            body = self.rfile.read(length).decode('utf-8')
                            payload = json.loads(body)
                            cid = payload.get("id") or "new_card"
                            DataCardManager.save_card(series_name, cid, payload)
                            self._write_json(200, {"ok": True})
                            return
                        else:
                            # List cards
                            cards = DataCardManager.get_cards(series_name)
                            self._write_json(200, {"ok": True, "cards": cards})
                            return

                    if action == "rules":
                        if self.command == "POST":
                             # Save rules
                            length = int(self.headers.get('Content-Length', 0))
                            body = self.rfile.read(length).decode('utf-8')
                            payload = json.loads(body)
                            DataCardManager.save_series_rules(series_name, payload)
                            self._write_json(200, {"ok": True})
                            return
                        else:
                            rules = DataCardManager.get_series_rules(series_name)
                            self._write_json(200, {"ok": True, "rules": rules})
                            return
                            
                    if action == "visualize":
                        # GET /api/datacards/:series/visualize
                        # Return matrix-compatible data
                        cards = DataCardManager.get_cards(series_name)
                        rules = DataCardManager.get_series_rules(series_name)
                        limit = 200 # Safety limit
                        
                        # Flatten for Matrix
                        self._write_json(200, {"ok": True, "dataset": cards[:limit], "config": rules.get("visualization", {})})
                        return

            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"DataCard error: {e}"})
            return

        if parsed.path == "/api/media/mp3/upload":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                filename = _sanitize_media_filename(payload.get("filename") or payload.get("name") or "track.mp3")
                data_field = payload.get("data")
                if not data_field:
                    self._write_json(400, {"ok": False, "error": "Missing base64 data"}); return
                if "," in data_field:
                    data_field = data_field.split(",", 1)[1]
                try:
                    file_bytes = base64.b64decode(data_field)
                except Exception as e:
                    self._write_json(400, {"ok": False, "error": f"Invalid base64 payload: {e}"}); return
                overwrite = bool(payload.get("overwrite"))
                _ensure_media_dirs()
                path = os.path.join(MP3_DIR, filename)
                if os.path.exists(path) and not overwrite:
                    self._write_json(409, {"ok": False, "error": "File already exists"}); return
                with open(path, "wb") as fh:
                    fh.write(file_bytes)
                tracks = _list_mp3_files()
                track = next((t for t in tracks if t.get("file") == filename), {"file": filename})
                self._write_json(200, {"ok": True, "track": track})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Upload failed: {e}"})
            return

        if parsed.path == "/api/media/mp3/delete":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                file_name = (payload.get("file") or payload.get("filename") or "").strip()
                if not file_name:
                    self._write_json(400, {"ok": False, "error": "Missing file name"}); return
                target = os.path.abspath(os.path.join(MP3_DIR, file_name))
                if not target.startswith(os.path.abspath(MP3_DIR)):
                    self._write_json(403, {"ok": False, "error": "Forbidden"}); return
                if not os.path.exists(target):
                    self._write_json(404, {"ok": False, "error": "File not found"}); return
                os.remove(target)
                try:
                    _remove_track_from_playlists(file_name)
                except Exception:
                    pass
                self._write_json(200, {"ok": True})

            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Delete failed: {e}"})
            return

        if parsed.path == "/api/editor":
            try:
                path_arg = str(payload.get("path") or "").strip()
                content = payload.get("content")
                if not path_arg:
                    self._write_json(400, {"ok": False, "error": "Missing path"}); return
                
                target_path, err = _resolve_editor_api_target(path_arg)
                if err:
                    self._write_json(403 if err != "Missing path" else 400, {"ok": False, "error": err}); return
                
                # Check for directory traversal or critical files if needed
                # For now just save
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                enc = str(payload.get("encoding") or "utf-8").strip()
                try:
                    with open(target_path, 'w', encoding=enc) as f:
                        f.write(content if content is not None else "")
                except LookupError:
                    # Fallback
                    with open(target_path, 'w', encoding='utf-8') as f:
                        f.write(content if content is not None else "")

                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Save failed: {e}"})
            return
        if parsed.path == "/api/editor/open-request":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                path_value = str(payload.get("path") or "").strip()
                if not path_value:
                    self._write_json(400, {"ok": False, "error": "Missing path"}); return
                line_value = payload.get("line")
                ok = _editor_open_request_write(path_value, line_value)
                self._write_json(200 if ok else 400, {"ok": bool(ok)})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Editor open request write failed: {e}"})
            return

        if parsed.path == "/api/media/playlists/save":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                name = (payload.get("name") or "").strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing playlist name"}); return
                existing = {p["slug"] for p in _list_playlists()}
                slug = (payload.get("slug") or payload.get("name") or "").strip()
                slug = slug if slug in existing else _playlist_slug(slug or name, existing if slug not in existing else None)
                tracks_payload = payload.get("tracks") or []
                tracks = []
                for entry in tracks_payload:
                    if isinstance(entry, str):
                        tracks.append({"file": entry})
                        continue
                    if isinstance(entry, dict):
                        file_name = entry.get("file") or entry.get("name")
                        if not file_name:
                            continue
                        row = {"file": file_name}
                        for key in ("title", "artist", "album", "length", "cover"):
                            if entry.get(key) is not None:
                                row[key] = entry.get(key)
                        tracks.append(row)
                payload_map = {
                    "name": name,
                    "description": payload.get("description"),
                    "tracks": tracks,
                }
                if "shuffle" in payload:
                    payload_map["shuffle"] = bool(payload.get("shuffle"))
                if "repeat" in payload:
                    payload_map["repeat"] = payload.get("repeat")
                _write_playlist(slug, payload_map)
                self._write_json(200, {"ok": True, "slug": slug})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Playlist save failed: {e}"})
            return

        if parsed.path == "/api/media/playlists/delete":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                slug = (payload.get("slug") or payload.get("name") or "").strip()
                if not slug:
                    self._write_json(400, {"ok": False, "error": "Missing playlist slug"}); return
                if slug == DEFAULT_PLAYLIST_SLUG:
                    self._write_json(400, {"ok": False, "error": "Cannot delete default playlist"}); return
                path = _playlist_path(slug)
                if not os.path.exists(path):
                    self._write_json(404, {"ok": False, "error": "Playlist not found"}); return
                os.remove(path)
                self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Playlist delete failed: {e}"})
            return
        if parsed.path == "/api/sticky-notes":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                content = str(payload.get('content') or payload.get('text') or '').rstrip()
                if not content:
                    self._write_json(400, {"ok": False, "error": "Content is required"}); return
                desired_name = str(payload.get('name') or payload.get('title') or '').strip()
                if not desired_name:
                    desired_name = _generate_sticky_name()
                desired_name = desired_name[:160] or _generate_sticky_name()
                name = _ensure_unique_item_name('note', desired_name)
                color = _coerce_sticky_color(payload.get('color'))
                pinned = _normalize_bool(payload.get('pinned'))
                category = str(payload.get('category') or '').strip()
                priority = str(payload.get('priority') or '').strip()
                from modules.item_manager import write_item_data
                note_data = {
                    'name': name,
                    'type': 'note',
                    'content': content,
                    'color': color,
                    'pinned': pinned,
                    'sticky': True,
                }
                if category:
                    note_data['category'] = category
                if priority:
                    note_data['priority'] = priority
                tags = payload.get('tags') if isinstance(payload.get('tags'), list) else None
                if tags:
                    note_data['tags'] = _tags_from_value(tags)
                _ensure_sticky_markers(note_data)
                write_item_data('note', name, note_data)
                self._write_json(200, {"ok": True, "note": _build_sticky_payload(note_data)})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to create sticky note: {e}"})
            return

        if parsed.path == "/api/sticky-notes/update":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                name = str(payload.get('name') or '').strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing note name"}); return
                from modules.item_manager import read_item_data, write_item_data, delete_item
                data = read_item_data('note', name)
                if not data:
                    self._write_json(404, {"ok": False, "error": "Note not found"}); return
                target_name = name
                new_name = str(payload.get('new_name') or '').strip()
                if new_name and new_name != name:
                    target_name = _ensure_unique_item_name('note', new_name[:160] or name)
                if 'content' in payload:
                    data['content'] = str(payload.get('content') or '')
                if 'color' in payload:
                    data['color'] = _coerce_sticky_color(payload.get('color'))
                if 'pinned' in payload:
                    data['pinned'] = _normalize_bool(payload.get('pinned'))
                if 'category' in payload:
                    val = str(payload.get('category') or '').strip()
                    if val:
                        data['category'] = val
                    elif 'category' in data:
                        data.pop('category', None)
                if 'priority' in payload:
                    val = str(payload.get('priority') or '').strip()
                    if val:
                        data['priority'] = val
                    elif 'priority' in data:
                        data.pop('priority', None)
                if 'tags' in payload and isinstance(payload.get('tags'), list):
                    data['tags'] = _tags_from_value(payload.get('tags'))
                _ensure_sticky_markers(data)
                if target_name != name:
                    data['name'] = target_name
                    write_item_data('note', target_name, data)
                    delete_item('note', name)
                else:
                    write_item_data('note', name, data)
                self._write_json(200, {"ok": True, "note": _build_sticky_payload(data)})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to update sticky note: {e}"})
            return

        if parsed.path == "/api/sticky-notes/delete":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                name = str(payload.get('name') or '').strip()
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing note name"}); return
                force = bool(payload.get('force'))
                ok, out, err = run_console_command("delete", ["note", name], {"force": force} if force else {})
                self._write_json(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to delete sticky note: {e}"})
            return

        if parsed.path == "/api/sticky-notes/reminder":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                note_name = str(payload.get('name') or payload.get('note') or '').strip()
                if not note_name:
                    self._write_json(400, {"ok": False, "error": "Missing note name"}); return
                time_field = str(payload.get('time') or '').strip()
                if not time_field:
                    self._write_json(400, {"ok": False, "error": "Missing reminder time"}); return
                message = str(payload.get('message') or f"Review note: {note_name}")
                date_field = str(payload.get('date') or '').strip()
                reminder_name = str(payload.get('reminder_name') or f"{note_name} reminder").strip() or f"{note_name} reminder"
                reminder_name = _ensure_unique_item_name('reminder', reminder_name[:160])
                from modules.item_manager import read_item_data, write_item_data
                note = read_item_data('note', note_name)
                if not note:
                    self._write_json(404, {"ok": False, "error": "Note not found"}); return
                reminder = {
                    'name': reminder_name,
                    'type': 'reminder',
                    'time': time_field,
                    'enabled': True,
                    'message': message,
                    'target': {
                        'type': 'note',
                        'name': note_name,
                        'action': 'open',
                    },
                    'tags': ['sticky'],
                }
                if date_field:
                    reminder['date'] = date_field
                if payload.get('recurrence'):
                    reminder['recurrence'] = payload['recurrence']
                write_item_data('reminder', reminder_name, reminder)
                self._write_json(200, {"ok": True, "reminder": reminder_name})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to create reminder: {e}"})
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

        if parsed.path == "/api/calendar/overlays":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Preset payload must be a map"}); return
                preset = _save_calendar_overlay_preset(payload)
                self._write_json(200, {"ok": True, "preset": preset})
            except ValueError as e:
                self._write_json(400, {"ok": False, "error": str(e)})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Overlay preset save failed: {e}"})
            return

        if parsed.path == "/api/calendar/overlays/delete":
            try:
                name = (payload.get('name') or '').strip() if isinstance(payload, dict) else ''
                if not name:
                    self._write_json(400, {"ok": False, "error": "Missing preset name"}); return
                removed = _delete_calendar_overlay_preset(name)
                if not removed:
                    self._write_json(404, {"ok": False, "error": "Preset not found"})
                else:
                    self._write_json(200, {"ok": True})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Overlay preset delete failed: {e}"})
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
                from utilities import points as Points
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
                # 1) Apply generic field updates through CLI set.
                if fields:
                    safe_fields = {str(k): v for k, v in fields.items() if k is not None}
                    ok, out, err = run_console_command("set", ["achievement", name], safe_fields)
                    if not ok:
                        self._write_json(500, {"ok": False, "error": "Failed to update achievement fields", "stdout": out, "stderr": err}); return
                # 2) Award through dedicated achievements command so evaluator side-effects stay centralized.
                if award_now:
                    ok, out, err = run_console_command("achievements", ["award", name])
                    if not ok:
                        self._write_json(500, {"ok": False, "error": "Failed to award achievement", "stdout": out, "stderr": err}); return
                # 3) Archive state uses set to avoid direct file mutation.
                if archive_now:
                    ok, out, err = run_console_command("set", ["achievement", name], {"status": "archived", "archived": True})
                    if not ok:
                        self._write_json(500, {"ok": False, "error": "Failed to archive achievement", "stdout": out, "stderr": err}); return
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
                if fields:
                    safe_fields = {str(k): v for k, v in fields.items() if k is not None}
                    ok, out, err = run_console_command("set", ["milestone", name], safe_fields)
                    if not ok:
                        self._write_json(500, {"ok": False, "error": "Failed to update milestone fields", "stdout": out, "stderr": err}); return
                if action == 'complete':
                    ok, out, err = run_console_command("set", ["milestone", name], {
                        "status": "completed",
                        "completed": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    })
                    if not ok:
                        self._write_json(500, {"ok": False, "error": "Failed to complete milestone", "stdout": out, "stderr": err}); return
                elif action == 'reset':
                    ok, out, err = run_console_command("set", ["milestone", name], {"status": "pending"})
                    if not ok:
                        self._write_json(500, {"ok": False, "error": "Failed to reset milestone status", "stdout": out, "stderr": err}); return
                    # Remove completed timestamp through CLI, keeping behavior in command layer.
                    run_console_command("remove", ["milestone", name, "completed"])
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
                target, err = _resolve_file_api_target(path)
                if err:
                    self._write_json(403 if err != "Missing path" else 400, {"ok": False, "error": err}); return
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
                target, err = _resolve_file_api_target(path)
                if err:
                    self._write_json(403 if err != "Missing path" else 400, {"ok": False, "error": err}); return
                allowed_ext = ('.md', '.markdown', '.yml', '.yaml', '.txt', '.json')
                if not target.lower().endswith(allowed_ext):
                    self._write_json(400, {"ok": False, "error": "Extension not allowed"}); return
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, 'w', encoding='utf-8') as fh:
                    fh.write(str(content))
                self._write_json(200, {"ok": True, "path": path})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Write failed: {e}"})
            return

        if parsed.path == "/api/file/rename":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                old_path = (payload.get('old_path') or '').strip()
                new_path = (payload.get('new_path') or '').strip()
                if not old_path or not new_path:
                    self._write_json(400, {"ok": False, "error": "Missing old_path or new_path"}); return
                old_target, old_err = _resolve_file_api_target(old_path)
                new_target, new_err = _resolve_file_api_target(new_path)
                if old_err or new_err:
                    self._write_json(403, {"ok": False, "error": old_err or new_err}); return
                if not os.path.exists(old_target):
                    self._write_json(404, {"ok": False, "error": "File not found"}); return
                if os.path.exists(new_target):
                    self._write_json(409, {"ok": False, "error": "Destination file already exists"}); return
                os.rename(old_target, new_target)
                self._write_json(200, {"ok": True, "old_path": old_path, "new_path": new_path})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Rename failed: {e}"})
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
                # Call 'status' with properties so command handlers receive indicator:value correctly.
                ok, out, err = run_console_command("status", [], {str(k): v})
                if not ok:
                    overall_ok = False
                results[str(k)] = {"ok": ok, "stdout": out, "stderr": err}
            self._write_json(200 if overall_ok else 500, {"ok": overall_ok, "details": results})
            return

        if parsed.path == "/api/logs":
            try:
                # Basic log reader: returns last N lines
                log_path = os.path.join(ROOT_DIR, "logs", "engine.log")
                if not os.path.exists(log_path):
                    self._write_json(200, {"ok": True, "logs": []})
                    return
                qs = parse_qs(parsed.query or "")
                limit = 50
                try:
                    limit = int((qs.get("limit") or [50])[0])
                except Exception:
                    pass
                lines = []
                with open(log_path, "r", encoding="utf-8") as f:
                    # Simple tail implementation
                    # For very large files, this should be optimized
                    all_lines = f.readlines()
                    lines = [ln.strip() for ln in all_lines[-limit:]]
                self._write_json(200, {"ok": True, "logs": lines})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Failed to read logs: {e}"})
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
                    from modules.timer import main as Timer
                    status_snapshot = Timer.status()
                except Exception:
                    status_snapshot = None
                self._write_json(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err, "status": status_snapshot})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Start day failed: {e}"})
            return

        if parsed.path == "/api/profile":
            # Save nickname and welcome/exit message lines into user/profile/profile.yml
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                prof_path = os.path.join(ROOT_DIR, 'user', 'profile', 'profile.yml')
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

                title = payload.get('title')
                if isinstance(title, str):
                    data['title'] = title

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

        if parsed.path == "/api/profile/avatar":
            # Save avatar image and set profile avatar path to user/profile/avatar.png
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                avatar_data_url = str(payload.get('avatar_data_url') or '').strip()
                if not avatar_data_url.startswith('data:image/'):
                    self._write_json(400, {"ok": False, "error": "Invalid avatar data"}); return
                if ',' not in avatar_data_url:
                    self._write_json(400, {"ok": False, "error": "Malformed avatar data URL"}); return

                _, b64 = avatar_data_url.split(',', 1)
                try:
                    raw = base64.b64decode(b64, validate=True)
                except Exception:
                    self._write_json(400, {"ok": False, "error": "Invalid avatar base64 data"}); return
                if not raw:
                    self._write_json(400, {"ok": False, "error": "Empty avatar payload"}); return

                prof_dir = os.path.join(ROOT_DIR, 'user', 'profile')
                prof_path = os.path.join(prof_dir, 'profile.yml')
                avatar_path = os.path.join(prof_dir, 'avatar.png')
                os.makedirs(prof_dir, exist_ok=True)
                with open(avatar_path, 'wb') as af:
                    af.write(raw)

                data = {}
                if os.path.exists(prof_path):
                    try:
                        with open(prof_path, 'r', encoding='utf-8') as f:
                            data = yaml.safe_load(f) or {}
                    except Exception:
                        data = {}
                if not isinstance(data, dict):
                    data = {}
                data['avatar'] = 'user/profile/avatar.png'
                with open(prof_path, 'w', encoding='utf-8') as f:
                    yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)

                self._write_json(200, {"ok": True, "avatar_path": data['avatar']})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Avatar save failed: {e}"})
            return

        if parsed.path == "/api/preferences":
            try:
                if not isinstance(payload, dict):
                    self._write_json(400, {"ok": False, "error": "Payload must be a map"}); return
                pref_path = os.path.join(ROOT_DIR, 'user', 'profile', 'preferences_settings.yml')
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
                props_map = data if isinstance(data, dict) else {}
                props_map = {str(k): v for k, v in props_map.items() if k is not None}
                props_map.pop('name', None)
                props_map.pop('type', None)
                exists = False
                try:
                    from modules.item_manager import read_item_data
                    exists = bool(read_item_data(item_type, name))
                except Exception:
                    exists = False
                if exists:
                    ok, out, err = run_console_command("set", [item_type, name], props_map)
                else:
                    ok, out, err = run_console_command("new", [item_type, name], props_map)
                self._write_yaml(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err})
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
                props = payload.get('properties') if isinstance(payload.get('properties'), dict) else {}
                ok, out, err = run_console_command("copy", [item_type, source, new_name], props)
                self._write_yaml(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err})
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
                ok, out, err = run_console_command("rename", [item_type, old_name, new_name])
                try:
                    from modules.item_manager import read_item_data
                    old_exists = bool(read_item_data(item_type, old_name))
                    new_exists = bool(read_item_data(item_type, new_name))
                    if old_exists or not new_exists:
                        ok = False
                        if not (err or "").strip():
                            err = "Rename validation failed: old item still exists or new item missing."
                except Exception:
                    pass
                self._write_yaml(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Rename failed: {e}"})
            return

        if parsed.path == "/api/project/rename":
            # Payload: { old_name, new_name }
            try:
                old_name = (payload.get('old_name') or '').strip()
                new_name = (payload.get('new_name') or '').strip()
                if not old_name or not new_name:
                    self._write_json(400, {"ok": False, "error": "Missing old_name or new_name"}); return
                if old_name.lower() == new_name.lower():
                    self._write_json(200, {"ok": True, "renamed": False, "updated_refs": 0, "updated_by_type": {}}); return

                ok, out, err = run_console_command("rename", ["project", old_name, new_name])
                from modules.item_manager import read_item_data
                old_exists = bool(read_item_data("project", old_name))
                new_exists = bool(read_item_data("project", new_name))
                if (not ok) or old_exists or (not new_exists):
                    self._write_json(500, {"ok": False, "error": err or out or "Project rename failed"}); return

                from modules.item_manager import list_all_items_any, read_item_data, write_item_data
                old_key = old_name.strip().lower()
                updated_refs = 0
                updated_by_type = {}

                for item in (list_all_items_any() or []):
                    if not isinstance(item, dict):
                        continue
                    item_type = str(item.get("type") or "").strip().lower()
                    item_name = str(item.get("name") or "").strip()
                    if not item_type or not item_name:
                        continue
                    if item_type == "project" and item_name.strip().lower() == new_name.strip().lower():
                        continue

                    data = read_item_data(item_type, item_name) or {}
                    if not isinstance(data, dict):
                        continue
                    changed = False
                    if str(data.get("project") or "").strip().lower() == old_key:
                        data["project"] = new_name
                        changed = True
                    if str(data.get("resolution_ref") or "").strip().lower() == old_key:
                        data["resolution_ref"] = new_name
                        changed = True
                    if changed:
                        write_item_data(item_type, item_name, data)
                        updated_refs += 1
                        updated_by_type[item_type] = int(updated_by_type.get(item_type, 0)) + 1

                self._write_json(200, {
                    "ok": True,
                    "renamed": True,
                    "stdout": out,
                    "updated_refs": updated_refs,
                    "updated_by_type": updated_by_type,
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Project rename failed: {e}"})
            return

        if parsed.path == "/api/goal/rename":
            # Payload: { old_name, new_name }
            try:
                old_name = (payload.get('old_name') or '').strip()
                new_name = (payload.get('new_name') or '').strip()
                if not old_name or not new_name:
                    self._write_json(400, {"ok": False, "error": "Missing old_name or new_name"}); return
                if old_name.lower() == new_name.lower():
                    self._write_json(200, {"ok": True, "renamed": False, "updated_refs": 0, "updated_by_type": {}}); return

                ok, out, err = run_console_command("rename", ["goal", old_name, new_name])
                from modules.item_manager import read_item_data
                old_exists = bool(read_item_data("goal", old_name))
                new_exists = bool(read_item_data("goal", new_name))
                if (not ok) or old_exists or (not new_exists):
                    self._write_json(500, {"ok": False, "error": err or out or "Goal rename failed"}); return

                from modules.item_manager import list_all_items_any, read_item_data, write_item_data
                old_key = old_name.strip().lower()
                updated_refs = 0
                updated_by_type = {}

                def _replace_goal_refs(data):
                    changed_local = False
                    if str(data.get("goal") or "").strip().lower() == old_key:
                        data["goal"] = new_name
                        changed_local = True
                    if str(data.get("goal_name") or "").strip().lower() == old_key:
                        data["goal_name"] = new_name
                        changed_local = True
                    for key in ("goals", "linked_goals", "goal_links"):
                        raw = data.get(key)
                        if isinstance(raw, list):
                            nxt = []
                            replaced = False
                            for v in raw:
                                if str(v or "").strip().lower() == old_key:
                                    nxt.append(new_name)
                                    replaced = True
                                else:
                                    nxt.append(v)
                            if replaced:
                                data[key] = nxt
                                changed_local = True
                        elif isinstance(raw, str):
                            parts = [p.strip() for p in raw.split(",")]
                            repl = False
                            for i, p in enumerate(parts):
                                if p.lower() == old_key:
                                    parts[i] = new_name
                                    repl = True
                            if repl:
                                data[key] = ", ".join(parts)
                                changed_local = True
                    return changed_local

                for item in (list_all_items_any() or []):
                    if not isinstance(item, dict):
                        continue
                    item_type = str(item.get("type") or "").strip().lower()
                    item_name = str(item.get("name") or "").strip()
                    if not item_type or not item_name:
                        continue
                    if item_type == "goal" and item_name.strip().lower() == new_name.strip().lower():
                        continue
                    data = read_item_data(item_type, item_name) or {}
                    if not isinstance(data, dict):
                        continue
                    if _replace_goal_refs(data):
                        write_item_data(item_type, item_name, data)
                        updated_refs += 1
                        updated_by_type[item_type] = int(updated_by_type.get(item_type, 0)) + 1

                self._write_json(200, {
                    "ok": True,
                    "renamed": True,
                    "stdout": out,
                    "updated_refs": updated_refs,
                    "updated_by_type": updated_by_type,
                })
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Goal rename failed: {e}"})
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
                if '..' in file_to_open or not file_to_open.startswith('user/profile/'):
                    self._write_json(400, {"ok": False, "error": "Invalid file path"}); return
                
                full_path = os.path.join(ROOT_DIR, file_to_open)

                from modules.item_manager import get_editor_command
                
                editor_command = get_editor_command({}) # empty properties
                if str(editor_command).strip().lower() == 'chronos_editor':
                    rel = os.path.relpath(full_path, ROOT_DIR).replace("\\", "/")
                    ok = _editor_open_request_write(rel, payload.get("line"))
                    if not ok:
                        self._write_json(500, {"ok": False, "error": "Failed to queue file for Chronos Editor"}); return
                    self._write_json(200, {"ok": True, "mode": "chronos_editor", "path": rel})
                    return
                
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
                settings_root = os.path.join(ROOT_DIR, 'user', 'settings')
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
                props = {}
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
                    props['inventory_items'] = inv_items
                    props['tools'] = tools
                    props['children'] = None
                else:
                    props['children'] = children
                exists = False
                try:
                    from modules.item_manager import read_item_data
                    exists = bool(read_item_data(t, n))
                except Exception:
                    exists = False
                if exists:
                    ok, out, err = run_console_command("set", [t, n], props)
                else:
                    ok, out, err = run_console_command("new", [t, n], props)
                if not ok:
                    self._write_json(500, {"ok": False, "error": "Template save failed", "stdout": out, "stderr": err}); return
                try:
                    def _has_habit_stack(nodes):
                        stack = list(nodes or [])
                        while stack:
                            node = stack.pop()
                            if not isinstance(node, dict):
                                continue
                            node_type = str(node.get("type") or "").strip().lower()
                            if node.get("habit_stack") or node.get("habit_stack") is True or node_type == "habit_stack":
                                return True
                            child = node.get("children")
                            if isinstance(child, list) and child:
                                stack.extend(child)
                        return False

                    run_console_command("achievements", ["event", "template_saved"], {
                        "template_type": t,
                        "name": n,
                        "source": "dashboard:/api/template",
                    })
                    if _has_habit_stack(children):
                        run_console_command("achievements", ["event", "habit_stack_created"], {
                            "template_type": t,
                            "name": n,
                            "source": "dashboard:/api/template",
                        })
                except Exception:
                    pass
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
                force = bool(payload.get('force'))
                ok, out, err = run_console_command("delete", [item_type, name], {"force": force} if force else {})
                self._write_yaml(200 if ok else 500, {"ok": ok, "stdout": out, "stderr": err})
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
                results = {}
                overall_ok = True
                for n in names:
                    ok, out, err = run_console_command("delete", [item_type, str(n)])
                    results[str(n)] = {"ok": ok, "stdout": out, "stderr": err}
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
                results = {}
                for n in names:
                    ok, out, err = run_console_command("set", [item_type, str(n)], {prop: val})
                    results[str(n)] = {"ok": ok, "stdout": out, "stderr": err}
                overall_ok = all(bool(v.get("ok")) for v in results.values())
                self._write_yaml(200 if overall_ok else 207, {"ok": overall_ok, "results": results})
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
                results = {}
                for s in sources:
                    new_name = f"{prefix}{s}{suffix}".strip()
                    ok, out, err = run_console_command("copy", [item_type, str(s), new_name])
                    results[str(s)] = {"ok": ok, "new_name": new_name, "stdout": out, "stderr": err}
                overall_ok = all(bool(v.get("ok")) for v in results.values())
                self._write_yaml(200 if overall_ok else 207, {"ok": overall_ok, "results": results})
            except Exception as e:
                self._write_yaml(500, {"ok": False, "error": f"Bulk copy failed: {e}"})
            return

        if parsed.path == "/api/items/export":
            # Payload: { type, names: [] } -> creates zip under temp/ and returns temp URL
            try:
                item_type = (payload.get('type') or '').strip().lower()
                names = payload.get('names') or []
                if not item_type or not isinstance(names, list) or not names:
                    self._write_yaml(400, {"ok": False, "error": "Missing type or names[]"}); return
                import zipfile, time
                temp_root = _TEMP_DIR
                os.makedirs(temp_root, exist_ok=True)
                ts = time.strftime('%Y%m%d_%H%M%S')
                zip_rel = f"exports_items_{ts}.zip"
                zip_path = os.path.join(temp_root, zip_rel)
                from modules.item_manager import get_item_path
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
                prof = (payload.get('profile') or '').strip()
                if not prof:
                    self._write_json(400, {"ok": False, "error": "Missing 'profile'"}); return
                props = {}
                if payload.get('bind_type') not in (None, ''):
                    props['type'] = payload.get('bind_type')
                if payload.get('bind_name') not in (None, ''):
                    props['name'] = payload.get('bind_name')
                if payload.get('cycles') is not None:
                    try:
                        props['cycles'] = int(payload.get('cycles'))
                    except Exception:
                        pass
                if payload.get('auto_advance') is not None:
                    props['auto_advance'] = bool(payload.get('auto_advance'))
                ok, out, err = run_console_command("timer", ["start", prof], props)
                if not ok:
                    self._write_json(500, {"ok": False, "stdout": out, "stderr": err}); return
                try:
                    from modules.timer import main as Timer
                    st = Timer.status()
                except Exception:
                    st = {}
                self._write_json(200, {"ok": True, "status": st, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer start error: {e}"})
            return
        if parsed.path == "/api/timer/pause":
            try:
                ok, out, err = run_console_command("timer", ["pause"])
                if not ok:
                    self._write_json(500, {"ok": False, "stdout": out, "stderr": err}); return
                try:
                    from modules.timer import main as Timer
                    st = Timer.status()
                except Exception:
                    st = {}
                self._write_json(200, {"ok": True, "status": st, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer pause error: {e}"})
            return
        if parsed.path == "/api/timer/resume":
            try:
                ok, out, err = run_console_command("timer", ["resume"])
                if not ok:
                    self._write_json(500, {"ok": False, "stdout": out, "stderr": err}); return
                try:
                    from modules.timer import main as Timer
                    st = Timer.status()
                except Exception:
                    st = {}
                self._write_json(200, {"ok": True, "status": st, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer resume error: {e}"})
            return
        if parsed.path == "/api/timer/stop":
            try:
                ok, out, err = run_console_command("timer", ["stop"])
                if not ok:
                    self._write_json(500, {"ok": False, "stdout": out, "stderr": err}); return
                try:
                    from modules.timer import main as Timer
                    st = Timer.status()
                except Exception:
                    st = {}
                self._write_json(200, {"ok": True, "status": st, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer stop error: {e}"})
            return
        if parsed.path == "/api/timer/cancel":
            try:
                ok, out, err = run_console_command("timer", ["cancel"])
                if not ok:
                    self._write_json(500, {"ok": False, "stdout": out, "stderr": err}); return
                try:
                    from modules.timer import main as Timer
                    st = Timer.status()
                except Exception:
                    st = {}
                self._write_json(200, {"ok": True, "status": st, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer cancel error: {e}"})
            return
        if parsed.path == "/api/timer/confirm":
            try:
                completed = None
                action = None
                stretch_minutes = None
                if isinstance(payload, dict):
                    action = payload.get('action')
                    if 'stretch_minutes' in payload:
                        try:
                            stretch_minutes = int(payload.get('stretch_minutes'))
                        except Exception:
                            stretch_minutes = None
                    if 'completed' in payload:
                        val = payload.get('completed')
                        if isinstance(val, str):
                            completed = val.strip().lower() in {'1', 'true', 'yes', 'y', 'done'}
                        else:
                            completed = bool(val)
                act = str(action or '').strip().lower()
                if not act:
                    if completed is True:
                        act = "yes"
                    elif completed is False:
                        act = "start_over"
                    else:
                        act = "yes"
                args = ["confirm", act]
                if stretch_minutes is not None and act in {"stretch", "extend"}:
                    args.append(str(int(stretch_minutes)))
                ok, out, err = run_console_command("timer", args)
                if not ok:
                    self._write_json(500, {"ok": False, "stdout": out, "stderr": err}); return
                try:
                    from modules.timer import main as Timer
                    st = Timer.status()
                except Exception:
                    st = {}
                self._write_json(200, {"ok": True, "status": st, "stdout": out, "stderr": err})
            except Exception as e:
                self._write_json(500, {"ok": False, "error": f"Timer confirm error: {e}"})
            return
        if parsed.path == "/api/listener/start":
            try:
                ok, out, err = run_console_command("listener", ["start"])
                status_text = (out or "").lower()
                if "already running" in status_text:
                    state = "already running"
                elif "started" in status_text:
                    state = "started"
                else:
                    state = "unknown"
                self._write_json(200 if ok else 500, {"ok": ok, "status": state, "stdout": out, "stderr": err})
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
            data = json.dumps(obj, ensure_ascii=False, default=str)  # default=str handles non-serializable types
        except Exception as e:
            self._safe_stderr(f"DEBUG: _write_json json.dumps failed: {e}\n")
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
        





