import os
import yaml
from datetime import datetime, timedelta

try:
    import pygame.mixer
except Exception:
    pygame = None  # type: ignore

try:
    import tkinter as tk
    from tkinter import messagebox
except Exception:
    tk = None  # type: ignore

from modules.item_manager import get_user_dir, read_item_data, write_item_data
from modules.scheduler import get_flattened_schedule, schedule_path_for_date, stretch_item_in_file
from utilities.duration_parser import parse_duration_string
from utilities import points as Points


STATE_DIR = os.path.join(get_user_dir(), 'Timers')
STATE_FILE = os.path.join(STATE_DIR, 'state.yml')
SESSIONS_DIR = os.path.join(STATE_DIR, 'sessions')
PLAN_FILE = os.path.join(STATE_DIR, 'start_day_plan.yml')
PROFILES_FILE = os.path.join(get_user_dir(), 'settings', 'timer_profiles.yml')
SETTINGS_FILE = os.path.join(get_user_dir(), 'settings', 'timer_settings.yml')
ASSETS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'assets'))

def _resolve_timer_sound_path(sound_value: str | None):
    if not sound_value:
        return None
    raw = str(sound_value).strip()
    if not raw:
        return None
    if os.path.isabs(raw):
        return raw if os.path.exists(raw) else None
    candidate = os.path.join(ASSETS_DIR, raw)
    if os.path.exists(candidate):
        return candidate
    # Backward compatibility for legacy filenames without "sounds/" prefix.
    fallback = os.path.join(ASSETS_DIR, 'sounds', os.path.basename(raw))
    if os.path.exists(fallback):
        return fallback
    return candidate


def _ensure_dirs():
    os.makedirs(STATE_DIR, exist_ok=True)
    os.makedirs(SESSIONS_DIR, exist_ok=True)


def _now_str():
    # Include fractional seconds so frequent status polling does not quantize
    # tick calculations to whole-second boundaries.
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')


def _load_state():
    _ensure_dirs()
    if not os.path.exists(STATE_FILE):
        return {'status': 'idle'}
    try:
        with open(STATE_FILE, 'r') as f:
            return yaml.safe_load(f) or {'status': 'idle'}
    except Exception:
        return {'status': 'idle'}


def _save_state(st):
    _ensure_dirs()
    with open(STATE_FILE, 'w') as f:
        yaml.dump(st, f, default_flow_style=False)

def _save_plan(plan):
    _ensure_dirs()
    with open(PLAN_FILE, 'w') as f:
        yaml.dump(plan, f, default_flow_style=False)

def _load_plan():
    if not os.path.exists(PLAN_FILE):
        return {}
    try:
        with open(PLAN_FILE, 'r') as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}

def _clear_plan_file():
    try:
        if os.path.exists(PLAN_FILE):
            os.remove(PLAN_FILE)
    except OSError:
        pass


def _load_profiles():
    if not os.path.exists(PROFILES_FILE):
        return {}
    try:
        with open(PROFILES_FILE, 'r') as f:
            data = yaml.safe_load(f) or {}
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_profiles(p):
    os.makedirs(os.path.dirname(PROFILES_FILE), exist_ok=True)
    with open(PROFILES_FILE, 'w') as f:
        yaml.dump(p, f, default_flow_style=False)

def _load_settings():
    if not os.path.exists(SETTINGS_FILE):
        return {}
    try:
        with open(SETTINGS_FILE, 'r') as f:
            data = yaml.safe_load(f) or {}
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _default_profiles():
    return {
        'classic_pomodoro': {
            'type': 'pomodoro',
            'focus_minutes': 25,
            'short_break_minutes': 5,
            'long_break_minutes': 15,
            'long_break_every': 4,
            'points_per_focus': 0,
        },
        'deep_work_60_10': {
            'type': 'pomodoro',
            'focus_minutes': 60,
            'short_break_minutes': 10,
            'long_break_minutes': 20,
            'long_break_every': 3,
            'points_per_focus': 10,
        },
        'deep_work_50_10': {
            'type': 'pomodoro',
            'focus_minutes': 50,
            'short_break_minutes': 10,
            'long_break_minutes': 20,
            'long_break_every': 4,
            'points_per_focus': 10,
        },
        'desk_time_52_17': {
            'type': 'pomodoro',
            'focus_minutes': 52,
            'short_break_minutes': 17,
            'long_break_minutes': 20,
            'long_break_every': 3,
            'points_per_focus': 12,
        },
        'desk_time_112_26': {
            'type': 'pomodoro',
            'focus_minutes': 112,
            'short_break_minutes': 26,
            'long_break_minutes': 30,
            'long_break_every': 2,
            'points_per_focus': 20,
        },
        'hourly_55_5': {
            'type': 'pomodoro',
            'focus_minutes': 55,
            'short_break_minutes': 5,
            'long_break_minutes': 15,
            'long_break_every': 4,
            'points_per_focus': 8,
        },
        'microbreak_25_2': {
            'type': 'pomodoro',
            'focus_minutes': 25,
            'short_break_minutes': 2,
            'long_break_minutes': 10,
            'long_break_every': 4,
            'points_per_focus': 5,
        },
        'sprint_75_15': {
            'type': 'pomodoro',
            'focus_minutes': 75,
            'short_break_minutes': 15,
            'long_break_minutes': 20,
            'long_break_every': 3,
            'points_per_focus': 12,
        },
        'sprint_90_30': {
            'type': 'pomodoro',
            'focus_minutes': 90,
            'short_break_minutes': 10,
            'long_break_minutes': 30,
            'long_break_every': 3,
            'points_per_focus': 0,
        },
    }


def ensure_default_profiles():
    if not os.path.exists(PROFILES_FILE):
        _save_profiles(_default_profiles())


def start_timer(profile_name: str, *, bind_type: str | None = None, bind_name: str | None = None, cycles: int | None = None, auto_advance: bool = True):
    ensure_default_profiles()
    profs = _load_profiles()
    prof = profs.get(profile_name)
    if not prof:
        raise ValueError(f"Profile '{profile_name}' not found")

    focus_sec = int(prof.get('focus_minutes', 25)) * 60

    st = {
        'status': 'running',
        'mode': 'profile',
        'profile_name': profile_name,
        'profile': prof,
        'current_phase': 'focus',
        'phase_start': _now_str(),
        'remaining_seconds': focus_sec,
        'cycle_index': 0,
        'cycles_goal': int(cycles) if isinstance(cycles, int) else None,
        'auto_advance': bool(auto_advance),
        'bound_item': {'type': bind_type, 'name': bind_name} if bind_type and bind_name else None,
        'last_tick': _now_str(),
        'schedule_state': None,
        'pending_confirmation': None,
        'confirm_completion': False,
        'current_block': None,
        'waiting_for_anchor_start': False,
    }
    _save_state(st)
    return st


def start_schedule_plan(plan: dict, *, profile_name: str | None = None, confirm_completion: bool = True):
    ensure_default_profiles()
    if not isinstance(plan, dict) or not plan.get('blocks'):
        raise ValueError("Plan must include at least one block.")

    settings = _load_settings()
    if not profile_name:
        profile_name = settings.get('start_day_profile') or settings.get('default_profile') or 'classic_pomodoro'
    profs = _load_profiles()
    prof = profs.get(profile_name) or {}

    blocks = plan.get('blocks') or []
    first_block = blocks[0]
    focus_sec = _block_minutes_value(first_block) * 60
    plan_date = str(plan.get('date') or datetime.now().strftime('%Y-%m-%d'))
    schedule_state = {
        'plan': plan,
        'plan_date': plan_date,
        'current_index': 0,
        'completed_indices': [],
        'total_blocks': len(blocks),
        'plan_generated_at': plan.get('generated_at'),
        'source': plan.get('source'),
    }
    st = {
        'status': 'running',
        'mode': 'schedule',
        'profile_name': profile_name,
        'profile': prof,
        'current_phase': 'focus' if not first_block.get('is_buffer') else 'break',
        'phase_start': _now_str(),
        'remaining_seconds': focus_sec,
        'cycle_index': 0,
        'cycles_goal': None,
        'auto_advance': True,
        'bound_item': None,
        'last_tick': _now_str(),
        'schedule_state': schedule_state,
        'pending_confirmation': None,
        'confirm_completion': bool(confirm_completion),
        'current_block': None,
        'waiting_for_anchor_start': False,
    }
    _save_plan(plan)
    _begin_schedule_block(st, 0)
    return _load_state()


def pause_timer():
    st = _load_state()
    if st.get('status') != 'running':
        return st
    st['status'] = 'paused'
    st['last_tick'] = _now_str()
    _save_state(st)
    return st


def resume_timer():
    st = _load_state()
    if st.get('status') != 'paused':
        return st
    st['status'] = 'running'
    st['last_tick'] = _now_str()
    _save_state(st)
    return st


def stop_timer():
    st = _load_state()
    if st.get('status') in ('running', 'paused'):
        # finalize current partial session
        _finalize_current_phase(st, final=True)
    st['status'] = 'idle'
    st['remaining_seconds'] = 0
    st['current_phase'] = None
    st['last_tick'] = _now_str()
    st['schedule_state'] = None
    st['pending_confirmation'] = None
    st['current_block'] = None
    st['waiting_for_anchor_start'] = False
    _clear_plan_file()
    _save_state(st)
    return st


def cancel_timer():
    st = _load_state()
    # do not log/award; just reset
    st = {
        'status': 'idle',
        'profile_name': None,
        'profile': {},
        'current_phase': None,
        'remaining_seconds': 0,
        'cycle_index': 0,
        'cycles_goal': None,
        'auto_advance': True,
        'bound_item': None,
        'last_tick': _now_str(),
        'schedule_state': None,
        'pending_confirmation': None,
        'confirm_completion': False,
        'current_block': None,
        'waiting_for_anchor_start': False,
    }
    _clear_plan_file()
    _save_state(st)
    return st


def status():
    return auto_tick()


def profiles_list():
    ensure_default_profiles()
    return list(_load_profiles().keys())


def profiles_view(name: str):
    ensure_default_profiles()
    return _load_profiles().get(name)


def profiles_save(name: str, config: dict):
    p = _load_profiles()
    p[name] = config
    _save_profiles(p)


def profiles_delete(name: str):
    p = _load_profiles()
    if name in p:
        del p[name]
        _save_profiles(p)


def _sessions_file_for_today():
    return os.path.join(SESSIONS_DIR, datetime.now().strftime('%Y-%m-%d') + '.yml')


def _append_session(entry: dict):
    path = _sessions_file_for_today()
    try:
        if os.path.exists(path):
            with open(path, 'r') as f:
                data = yaml.safe_load(f) or {'entries': []}
        else:
            data = {'entries': []}
        if not isinstance(data.get('entries'), list):
            data['entries'] = []
        data['entries'].append(entry)
        with open(path, 'w') as f:
            yaml.dump(data, f, default_flow_style=False)
    except Exception:
        pass


def _notify(title: str, message: str, *, channel_index: int = 2, sound_filename: str | None = None):
    # Play sound
    try:
        if pygame and pygame.mixer:
            pygame.mixer.init()
            if sound_filename:
                from_path = _resolve_timer_sound_path(sound_filename)
                if from_path and os.path.exists(from_path):
                    snd = pygame.mixer.Sound(from_path)
                    ch = pygame.mixer.Channel(channel_index)
                    if not ch.get_busy():
                        ch.play(snd)
    except Exception:
        pass
    # Popup
    try:
        if tk:
            root = tk.Tk()
            root.withdraw()
            messagebox.showinfo(title, message)
            root.destroy()
    except Exception:
        pass


def _award_points_for_focus(st):
    prof = st.get('profile') or {}
    pts = int(prof.get('points_per_focus') or 0)
    if pts > 0:
        Points.add_points(pts, reason=f"timer:focus:{st.get('profile_name')}")


def _log_to_bound_item(st, seconds: int):
    try:
        bound = st.get('bound_item') or {}
        t = bound.get('type'); n = bound.get('name')
        if not t or not n:
            return
        data = read_item_data(t, n) or {}
        # minimal ensure fields
        if 'sessions' not in data or data.get('sessions') is None:
            data['sessions'] = []
        if 'totals' not in data or data.get('totals') is None:
            data['totals'] = {'sessions': 0, 'minutes': 0}
        minutes = max(1, seconds // 60)
        data['sessions'].append({'date': _now_str(), 'minutes': minutes, 'source': 'timer'})
        data['totals']['sessions'] = int(data['totals'].get('sessions', 0)) + 1
        data['totals']['minutes'] = int(data['totals'].get('minutes', 0)) + minutes
        write_item_data(t, n, data)
    except Exception:
        pass


def _phase_sound_name(phase: str) -> str | None:
    # Order of precedence:
    # 1) Profile-specific sounds (stashed in current state profile.sounds)
    # 2) Global timer_settings.yml sounds
    # 3) Alarm/Reminder defaults as fallback
    try:
        # Profile override via current state
        st = _load_state()
        prof = st.get('profile') or {}
        sounds = prof.get('sounds') or {}
        if isinstance(sounds, dict):
            sn = sounds.get(phase)
            if isinstance(sn, str) and sn:
                return sn

        # Global Timer settings
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r') as f:
                cfg = yaml.safe_load(f) or {}
                snd = ((cfg.get('sounds') or {}) if isinstance(cfg.get('sounds'), dict) else {})
                sn = snd.get(phase)
                if isinstance(sn, str) and sn:
                    return sn

        # Fallback: Alarm/Reminder defaults
        settings_dir = os.path.join(get_user_dir(), 'settings')
        p = os.path.join(settings_dir, 'Alarm_Defaults.yml') if phase == 'focus_end' else os.path.join(settings_dir, 'Reminder_Defaults.yml')
        if os.path.exists(p):
            with open(p, 'r') as f:
                d = yaml.safe_load(f) or {}
                return d.get('default_sound')
    except Exception:
        return None
    return None


def _finalize_current_phase(st, final=False):
    # Compute elapsed seconds for this phase
    try:
        prof = st.get('profile') or {}
        phase = st.get('current_phase')
        total = 0
        if phase == 'focus':
            total = int(prof.get('focus_minutes', 25)) * 60
        elif phase == 'short_break':
            total = int(prof.get('short_break_minutes', 5)) * 60
        elif phase == 'long_break':
            total = int(prof.get('long_break_minutes', 15)) * 60
        remaining = int(st.get('remaining_seconds') or 0)
        elapsed = max(0, total - remaining)
    except Exception:
        elapsed = 0

    # Append session entry
    entry = {
        'profile': st.get('profile_name'),
        'phase': st.get('current_phase'),
        'start': st.get('phase_start'),
        'end': _now_str(),
        'seconds': elapsed,
        'bound_item': st.get('bound_item') or None,
    }
    _append_session(entry)

    # Focus-specific award and bound item logging
    if st.get('current_phase') == 'focus':
        _award_points_for_focus(st)
        _log_to_bound_item(st, elapsed)


def _advance_phase(st):
    prof = st.get('profile') or {}
    phase = st.get('current_phase')
    if phase == 'focus':
        # focus completed
        st['cycle_index'] = int(st.get('cycle_index') or 0) + 1
        every = int(prof.get('long_break_every', 4) or 4)
        if every > 0 and st['cycle_index'] % every == 0:
            st['current_phase'] = 'long_break'
            st['remaining_seconds'] = int(prof.get('long_break_minutes', 15)) * 60
        else:
            st['current_phase'] = 'short_break'
            st['remaining_seconds'] = int(prof.get('short_break_minutes', 5)) * 60
        st['phase_start'] = _now_str()
        _notify('Focus Complete', f"Cycle {st['cycle_index']} complete. Break started.", sound_filename=_phase_sound_name('focus_end'))
        # Goal check
        goal = st.get('cycles_goal')
        if isinstance(goal, int) and st['cycle_index'] >= goal:
            # Stop after logging focus; keep break but set auto_advance false
            st['auto_advance'] = False
    elif phase in ('short_break', 'long_break'):
        st['current_phase'] = 'focus'
        st['remaining_seconds'] = int(prof.get('focus_minutes', 25)) * 60
        st['phase_start'] = _now_str()
        _notify('Break Over', 'Focus started.', sound_filename=_phase_sound_name('break_end'))
    # schedule-driven runs handle their own sequencing


def _schedule_blocks(st):
    sched = st.get('schedule_state') or {}
    plan = sched.get('plan') or {}
    blocks = plan.get('blocks') if isinstance(plan, dict) else None
    if isinstance(blocks, list):
        return blocks
    return []

def _record_schedule_completion(block, status: str = "completed"):
    if not isinstance(block, dict):
        return
    if block.get("is_buffer"):
        return
    name = block.get("name") or "Unnamed block"
    scheduled_start = block.get("start") or block.get("scheduled_start")
    scheduled_end = block.get("end") or block.get("scheduled_end")
    try:
        from commands.today import load_completion_payload
        from modules.scheduler import build_block_key
        schedule_date = str(block.get("date") or datetime.now().strftime("%Y-%m-%d"))
        completion_data, completion_path = load_completion_payload(schedule_date)
        entries = completion_data.setdefault("entries", {})
        block_key = build_block_key(name, scheduled_start or "unscheduled")
        entry = {
            "name": name,
            "status": status,
            "scheduled_start": scheduled_start,
            "scheduled_end": scheduled_end,
            "logged_at": datetime.now().isoformat(timespec="seconds"),
        }
        entries[block_key] = entry
        with open(completion_path, "w") as fh:
            yaml.dump(completion_data, fh, default_flow_style=False, sort_keys=False)
    except Exception:
        return

    if status == "completed":
        try:
            item_type = block.get("type") or block.get("item_type")
            minutes = _block_minutes_value(block)
            if item_type:
                Points.award_on_complete(str(item_type), name, minutes=minutes if isinstance(minutes, int) else None)
        except Exception:
            pass


def _begin_schedule_block(st, index):
    blocks = _schedule_blocks(st)
    sched = st.get('schedule_state') or {}
    if index >= len(blocks):
        _complete_schedule_run(st)
        return False
    block = blocks[index]
    sched['current_index'] = index
    st['schedule_state'] = sched
    st['current_phase'] = 'focus' if not block.get('is_buffer') else 'break'
    st['phase_start'] = _now_str()
    # Reset tick baseline so a restarted block begins at full duration.
    st['last_tick'] = _now_str()
    st['remaining_seconds'] = _block_minutes_value(block) * 60
    st['waiting_for_anchor_start'] = False
    st['status'] = 'running'
    if _is_future_anchor_block(block):
        st['status'] = 'paused'
        st['waiting_for_anchor_start'] = True
    st['current_block'] = block
    st['pending_confirmation'] = None
    _save_state(st)
    return True


def _complete_schedule_run(st):
    st['status'] = 'idle'
    st['current_phase'] = None
    st['remaining_seconds'] = 0
    st['current_block'] = None
    st['pending_confirmation'] = None
    st['schedule_state'] = None
    st['waiting_for_anchor_start'] = False
    _clear_plan_file()
    _save_state(st)
    _notify('Schedule Complete', 'All schedule blocks finished.', sound_filename=_phase_sound_name('focus_end'))


def _handle_schedule_completion(st):
    blocks = _schedule_blocks(st)
    sched = st.get('schedule_state') or {}
    idx = int(sched.get('current_index') or 0)
    block = blocks[idx] if idx < len(blocks) else None
    completed = sched.setdefault('completed_indices', [])
    if idx not in completed:
        completed.append(idx)
    st['schedule_state'] = sched

    if block and not block.get('is_buffer') and not bool(st.get('confirm_completion')):
        _record_schedule_completion(block, status="completed")

    next_index = idx + 1
    if block and bool(st.get('confirm_completion')) and not block.get('is_buffer'):
        st['pending_confirmation'] = {
            'block_index': idx,
            'next_index': next_index,
            'block': block,
            'prompted_at': _now_str(),
        }
        st['status'] = 'paused'
        st['remaining_seconds'] = 0
        _save_state(st)
        return False

    if next_index >= len(blocks):
        _complete_schedule_run(st)
        return False

    # Respect auto_advance for schedule mode: queue next block paused at full duration.
    if not bool(st.get('auto_advance', True)):
        next_block = blocks[next_index]
        sched['current_index'] = next_index
        st['schedule_state'] = sched
        st['current_block'] = next_block
        st['current_phase'] = 'focus' if not next_block.get('is_buffer') else 'break'
        st['remaining_seconds'] = _block_minutes_value(next_block) * 60
        st['status'] = 'paused'
        st['phase_start'] = _now_str()
        st['last_tick'] = _now_str()
        st['pending_confirmation'] = None
        _save_state(st)
        return False

    return _begin_schedule_block(st, next_index)


def _stretch_schedule_block(st, minutes: int):
    if st.get('mode') != 'schedule':
        return st
    if minutes <= 0:
        return st
    pending = st.get('pending_confirmation') or {}
    block_index = int(pending.get('block_index', st.get('schedule_state', {}).get('current_index', 0)) or 0)
    blocks = _schedule_blocks(st)
    block = blocks[block_index] if block_index < len(blocks) else st.get('current_block')
    if not block:
        return st
    block_name = str(block.get('name') or '').strip()
    if not block_name:
        return st

    target_block_id = str(block.get("block_id") or "").strip()
    target_name_l = block_name.lower()
    schedule_date = str(
        (st.get('schedule_state') or {}).get('plan_date')
        or block.get('date')
        or datetime.now().strftime('%Y-%m-%d')
    ).strip()
    today_key = datetime.now().strftime('%Y-%m-%d')

    # Persist stretch as a manual schedule change first.
    try:
        path = schedule_path_for_date(schedule_date)
        stretch_item_in_file(path, block_name, int(minutes))
    except Exception:
        # Fallback to timer-only extension if schedule write fails.
        st['current_block'] = block
        st['current_phase'] = 'focus' if not block.get('is_buffer') else 'break'
        st['remaining_seconds'] = int(st.get('remaining_seconds') or 0) + (int(minutes) * 60)
        st['status'] = 'running'
        st['phase_start'] = _now_str()
        st['last_tick'] = _now_str()
        st['pending_confirmation'] = None
        _save_state(st)
        return st

    # Reschedule today so downstream blocks are shifted coherently.
    if schedule_date == today_key:
        try:
            from commands import today as TodayCommand
            TodayCommand.run(['reschedule'], {})
        except Exception:
            pass

    # Reload and sync timer state to latest schedule.
    st = _load_state()
    st = sync_schedule_state()
    if not isinstance(st, dict):
        st = _load_state()

    # Keep focus on the stretched block if still present after reschedule.
    sched = st.get('schedule_state') or {}
    all_blocks = _schedule_blocks(st)
    if isinstance(sched, dict) and isinstance(all_blocks, list) and all_blocks:
        found_idx = None
        if target_block_id:
            for i, b in enumerate(all_blocks):
                if str((b or {}).get('block_id') or '').strip() == target_block_id:
                    found_idx = i
                    break
        if found_idx is None:
            for i, b in enumerate(all_blocks):
                if str((b or {}).get('name') or '').strip().lower() == target_name_l:
                    found_idx = i
                    break
        if found_idx is not None:
            sched['current_index'] = int(found_idx)
            st['schedule_state'] = sched
            st['current_block'] = all_blocks[found_idx]
            st['current_phase'] = 'focus' if not all_blocks[found_idx].get('is_buffer') else 'break'

    # Add extension to remaining timer and clamp to block duration.
    rem = int(st.get('remaining_seconds') or 0)
    rem += int(minutes) * 60
    try:
        max_sec = _block_minutes_value(st.get('current_block') or {}) * 60
        if max_sec > 0:
            rem = min(rem, int(max_sec))
    except Exception:
        pass
    st['remaining_seconds'] = max(0, rem)
    st['pending_confirmation'] = None
    st['phase_start'] = _now_str()
    st['last_tick'] = _now_str()
    st['status'] = 'running'
    st = _sync_waiting_anchor_state(st)
    _save_state(st)
    return st


def confirm_schedule_block(completed: bool | None = None, action: str | None = None, *, stretch_minutes: int | None = None):
    st = _load_state()
    if st.get('mode') != 'schedule':
        return st
    pending = st.get('pending_confirmation')
    if not pending:
        # Allow manual block actions from UI even when no pending check-in is active.
        blocks = _schedule_blocks(st)
        sched = st.get('schedule_state') or {}
        block_index = int(sched.get('current_index', 0) or 0)
        block = blocks[block_index] if block_index < len(blocks) else st.get('current_block')
        if not block:
            return st
        pending = {
            'block_index': block_index,
            'next_index': block_index + 1,
            'block': block,
            'prompted_at': _now_str(),
        }
        st['pending_confirmation'] = pending

    block_index = int(pending.get('block_index', 0))
    next_index = int(pending.get('next_index', block_index + 1))
    block = pending.get('block')
    st['pending_confirmation'] = None

    if action:
        action = str(action).strip().lower()
    if completed is None:
        if action in {'yes', 'y', 'complete', 'completed', 'done'}:
            completed = True
        elif action in {'skip', 'skipped'}:
            completed = True
        else:
            completed = False

    if action in {'start_over', 'restart', 'repeat'}:
        # Restart should truly rewind this block in schedule state.
        sched = st.get('schedule_state') or {}
        completed = sched.get('completed_indices')
        if isinstance(completed, list):
            rewound = []
            for i in completed:
                try:
                    if int(i) == block_index:
                        continue
                except Exception:
                    pass
                rewound.append(i)
            sched['completed_indices'] = rewound
        sched['current_index'] = block_index
        st['schedule_state'] = sched
        _begin_schedule_block(st, block_index)
        return _load_state()

    if action in {'stretch', 'extend'}:
        minutes = None
        if isinstance(stretch_minutes, int):
            minutes = stretch_minutes
        else:
            try:
                settings = _load_settings()
                minutes = int(settings.get('stretch_minutes') or 5)
            except Exception:
                minutes = 5
        return _stretch_schedule_block(st, max(1, minutes))

    if action in {'skip', 'skipped'}:
        if block and not block.get('is_buffer'):
            _record_schedule_completion(block, status="skipped")
        blocks = _schedule_blocks(st)
        if next_index >= len(blocks):
            _complete_schedule_run(st)
            return _load_state()
        _begin_schedule_block(st, next_index)
        return _load_state()

    if completed:
        if block and not block.get('is_buffer'):
            _record_schedule_completion(block, status="completed")
        blocks = _schedule_blocks(st)
        if next_index >= len(blocks):
            _complete_schedule_run(st)
            return _load_state()
        _begin_schedule_block(st, next_index)
        return _load_state()

    # Repeat the same block if not completed
    _begin_schedule_block(st, block_index)
    return _load_state()


def tick():
    st = _load_state()
    if st.get('status') != 'running':
        return
    _tick_seconds(st, 1)


def _seconds_since(ts: str | None) -> int:
    if not ts:
        return 0
    text = str(ts).strip()
    if not text:
        return 0
    for fmt in ('%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%d %H:%M:%S'):
        try:
            dt = datetime.strptime(text, fmt)
            delta = datetime.now() - dt
            return max(0, int(delta.total_seconds()))
        except Exception:
            continue
    return 0


def _tick_seconds(st: dict, seconds: int):
    if st.get('status') != 'running':
        return st
    remaining = max(0, int(st.get('remaining_seconds') or 0))
    left = max(0, int(seconds))
    while left > 0 and st.get('status') == 'running':
        if remaining > left:
            remaining -= left
            left = 0
            break
        # consume the current phase
        left -= remaining
        remaining = 0
        _finalize_current_phase(st, final=False)
        if st.get('mode') == 'schedule':
            advanced = _handle_schedule_completion(st)
            if not advanced:
                remaining = int(st.get('remaining_seconds') or 0)
                break
            remaining = max(0, int(st.get('remaining_seconds') or 0))
            continue
        if not bool(st.get('auto_advance', True)):
            st['status'] = 'paused'
            st['remaining_seconds'] = 0
            _save_state(st)
            return st
        _advance_phase(st)
        remaining = max(0, int(st.get('remaining_seconds') or 0))
        # if remaining==0 loop continues to avoid stuck state
    st['remaining_seconds'] = remaining
    st['last_tick'] = _now_str()
    _save_state(st)
    return st


def auto_tick():
    sync_schedule_state()
    st = _load_state()
    st_before = dict(st)
    st = _sync_waiting_anchor_state(st)
    if st != st_before:
        _save_state(st)
    if st.get('status') != 'running':
        return st
    delta = _seconds_since(st.get('last_tick'))
    if delta <= 0:
        return st
    return _tick_seconds(st, delta)


def _block_minutes_value(block):
    try:
        minutes = block.get('minutes', 1)
        if isinstance(minutes, (int, float)):
            return max(1, int(round(minutes)))
        if isinstance(minutes, str) and minutes.strip().isdigit():
            return max(1, int(minutes.strip()))
    except Exception:
        pass
    return 1


def _block_identity(block: dict) -> str:
    if not isinstance(block, dict):
        return ""
    block_id = str(block.get("block_id") or "").strip()
    if block_id:
        return f"id:{block_id}"
    name = str(block.get("name") or "").strip().lower()
    start = str(block.get("start") or block.get("scheduled_start") or "").strip()
    end = str(block.get("end") or block.get("scheduled_end") or "").strip()
    buf = "1" if bool(block.get("is_buffer")) else "0"
    return f"{name}|{start}|{end}|{buf}"


def _time_to_minutes(label):
    if not isinstance(label, str):
        return None
    txt = label.strip()
    if not txt:
        return None
    try:
        dt = datetime.strptime(txt, "%H:%M")
        return (dt.hour * 60) + dt.minute
    except Exception:
        return None


def _is_future_anchor_block(block):
    if not isinstance(block, dict):
        return False
    schedule_type = str(block.get("schedule_type") or "").strip().lower()
    if "anchor" not in schedule_type:
        return False
    start_label = block.get("start") or block.get("scheduled_start")
    start_min = _time_to_minutes(str(start_label or ""))
    if start_min is None:
        return False
    now = datetime.now()
    now_min = (int(now.hour) * 60) + int(now.minute)
    return start_min > now_min


def _sync_waiting_anchor_state(st):
    if not isinstance(st, dict):
        return st
    if st.get("mode") != "schedule":
        st["waiting_for_anchor_start"] = False
        return st
    block = st.get("current_block")
    if not isinstance(block, dict):
        st["waiting_for_anchor_start"] = False
        return st
    # Any future anchor should remain waiting/paused until scheduled time.
    if _is_future_anchor_block(block):
        st["waiting_for_anchor_start"] = True
        st["status"] = "paused"
        return st
    waiting = bool(st.get("waiting_for_anchor_start"))
    if not waiting:
        return st
    if _is_future_anchor_block(block):
        st["status"] = "paused"
        return st
    st["waiting_for_anchor_start"] = False
    st["status"] = "running"
    st["phase_start"] = _now_str()
    st["last_tick"] = _now_str()
    return st


def _normalize_time_label(value):
    if isinstance(value, datetime):
        return value.strftime("%H:%M")
    if isinstance(value, str):
        txt = value.strip()
        if not txt:
            return None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%H:%M:%S", "%H:%M"):
            try:
                parsed = datetime.strptime(txt, fmt)
                return parsed.strftime("%H:%M")
            except ValueError:
                continue
    return None


def _duration_minutes(block):
    raw = block.get("duration")
    if isinstance(raw, (int, float)):
        return max(0, int(round(raw)))
    if isinstance(raw, str):
        txt = raw.strip()
        if txt.isdigit():
            return max(0, int(txt))
        try:
            parsed = parse_duration_string(txt)
            if isinstance(parsed, (int, float)):
                return max(0, int(parsed))
        except Exception:
            pass
    return 0


def _extract_minutes(block):
    mins = _duration_minutes(block)
    if mins > 0:
        return mins
    start = block.get("start_time") or block.get("ideal_start_time")
    end = block.get("end_time") or block.get("ideal_end_time")
    try:
        st = _normalize_time_label(start)
        en = _normalize_time_label(end)
        if st and en:
            st_dt = datetime.strptime(st, "%H:%M")
            en_dt = datetime.strptime(en, "%H:%M")
            delta = int((en_dt - st_dt).total_seconds() // 60)
            if delta > 0:
                return delta
    except Exception:
        pass
    return 0


def _is_break_or_buffer_block(block):
    if not isinstance(block, dict):
        return False
    if bool(block.get("is_buffer")) or bool(block.get("is_break")):
        return True
    subtype = str(block.get("subtype") or "").strip().lower()
    if subtype in {"buffer", "break"}:
        return True
    schedule_type = str(block.get("type") or block.get("schedule_type") or "").strip().lower()
    if schedule_type in {"buffer", "break"}:
        return True
    return False


def _should_include_schedule_block(block):
    if _is_break_or_buffer_block(block):
        return True
    children = block.get("children") or []
    if not children:
        return True
    for child in children:
        if not isinstance(child, dict):
            continue
        if _is_break_or_buffer_block(child):
            continue
        if child.get("is_parallel_item"):
            continue
        if _extract_minutes(child) > 0:
            return False
    return True


def _build_schedule_plan_for_date(date_key: str):
    path = schedule_path_for_date(date_key)
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or []
    except Exception:
        return []
    if not isinstance(data, list):
        return []

    flat = get_flattened_schedule(data or [])
    settings = _load_settings()
    try:
        min_minutes = int(settings.get("start_day_min_minutes") or settings.get("start_day_min_block_minutes") or 5)
    except Exception:
        min_minutes = 5
    blocks = []
    for block in flat:
        if not isinstance(block, dict):
            continue
        if block.get("is_parallel_item"):
            continue
        if not _should_include_schedule_block(block):
            continue
        is_buffer = _is_break_or_buffer_block(block)
        minutes = _extract_minutes(block)
        if minutes <= 0:
            continue
        if (not is_buffer) and int(minutes) < max(1, int(min_minutes)):
            continue
        name = str(block.get("name") or "Unnamed block")
        plan_block = {
            "name": name,
            "minutes": max(1, int(minutes)),
            "is_buffer": is_buffer,
            "schedule_type": block.get("type"),
            "start": _normalize_time_label(block.get("start_time") or block.get("ideal_start_time")),
            "end": _normalize_time_label(block.get("end_time") or block.get("ideal_end_time")),
            "buffer_type": block.get("buffer_type"),
            "block_id": block.get("block_id"),
            "date": date_key,
        }
        blocks.append(plan_block)

    def _sort_key(b):
        s = str(b.get("start") or "")
        try:
            return datetime.strptime(s, "%H:%M")
        except Exception:
            return datetime.min

    blocks.sort(key=_sort_key)
    return blocks


def sync_schedule_state():
    st = _load_state()
    if st.get("mode") != "schedule":
        return st
    sched = st.get("schedule_state") or {}
    if not isinstance(sched, dict):
        return st
    plan = sched.get("plan") or {}
    if not isinstance(plan, dict):
        return st

    date_key = str(sched.get("plan_date") or plan.get("date") or datetime.now().strftime("%Y-%m-%d")).strip()
    try:
        datetime.strptime(date_key, "%Y-%m-%d")
    except Exception:
        date_key = datetime.now().strftime("%Y-%m-%d")

    latest_blocks = _build_schedule_plan_for_date(date_key)
    if not latest_blocks:
        return st

    old_blocks = plan.get("blocks") if isinstance(plan.get("blocks"), list) else []
    if not old_blocks:
        return st

    old_identities = [_block_identity(b) for b in old_blocks]
    new_identities = [_block_identity(b) for b in latest_blocks]
    if old_identities == new_identities:
        return st

    old_completed = set(int(i) for i in (sched.get("completed_indices") or []) if isinstance(i, int))
    completed_ids = {old_identities[i] for i in old_completed if 0 <= i < len(old_identities)}

    current_index = int(sched.get("current_index") or 0)
    current_block = st.get("current_block") or (old_blocks[current_index] if 0 <= current_index < len(old_blocks) else None)
    current_id = _block_identity(current_block) if isinstance(current_block, dict) else ""

    new_completed_indices = [idx for idx, ident in enumerate(new_identities) if ident in completed_ids]
    new_current_index = 0
    if current_id and current_id in new_identities:
        new_current_index = new_identities.index(current_id)
    else:
        pending = [i for i in range(len(latest_blocks)) if i not in set(new_completed_indices)]
        new_current_index = pending[0] if pending else max(0, len(latest_blocks) - 1)

    sched["plan"] = {
        **plan,
        "date": date_key,
        "blocks": latest_blocks,
        "generated_at": datetime.now().isoformat(),
        "source": "schedule_sync",
    }
    sched["plan_date"] = date_key
    sched["total_blocks"] = len(latest_blocks)
    sched["completed_indices"] = new_completed_indices
    sched["current_index"] = new_current_index
    st["schedule_state"] = sched
    st["current_block"] = latest_blocks[new_current_index] if latest_blocks else None

    # Keep remaining seconds valid for current block duration.
    try:
        max_sec = int((st["current_block"] or {}).get("minutes") or 1) * 60
        rem = int(st.get("remaining_seconds") or 0)
        if rem > max_sec:
            st["remaining_seconds"] = max_sec
    except Exception:
        pass

    _save_state(st)
    return st


