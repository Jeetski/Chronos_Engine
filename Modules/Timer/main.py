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

from Modules.ItemManager import get_user_dir, read_item_data, write_item_data
from Utilities import points as Points


STATE_DIR = os.path.join(get_user_dir(), 'Timers')
STATE_FILE = os.path.join(STATE_DIR, 'state.yml')
SESSIONS_DIR = os.path.join(STATE_DIR, 'sessions')
PLAN_FILE = os.path.join(STATE_DIR, 'start_day_plan.yml')
PROFILES_FILE = os.path.join(get_user_dir(), 'Settings', 'Timer_Profiles.yml')
SETTINGS_FILE = os.path.join(get_user_dir(), 'Settings', 'Timer_Settings.yml')


def _ensure_dirs():
    os.makedirs(STATE_DIR, exist_ok=True)
    os.makedirs(SESSIONS_DIR, exist_ok=True)


def _now_str():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


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
        'deep_work_50_10': {
            'type': 'pomodoro',
            'focus_minutes': 50,
            'short_break_minutes': 10,
            'long_break_minutes': 20,
            'long_break_every': 4,
            'points_per_focus': 10,
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
    schedule_state = {
        'plan': plan,
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
        'current_block': first_block,
    }
    _save_plan(plan)
    _save_state(st)
    return st


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
                from_path = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Alarm', 'Sounds')), sound_filename)
                if os.path.exists(from_path):
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
    # 2) Global Timer_Settings.yml sounds
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
        settings_dir = os.path.join(get_user_dir(), 'Settings')
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
    st['remaining_seconds'] = _block_minutes_value(block) * 60
    st['status'] = 'running'
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

    return _begin_schedule_block(st, next_index)


def confirm_schedule_block(completed: bool):
    st = _load_state()
    if st.get('mode') != 'schedule':
        return st
    pending = st.get('pending_confirmation')
    if not pending:
        return st

    block_index = int(pending.get('block_index', 0))
    next_index = int(pending.get('next_index', block_index + 1))
    st['pending_confirmation'] = None

    if completed:
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
    try:
        dt = datetime.strptime(ts, '%Y-%m-%d %H:%M:%S')
        delta = datetime.now() - dt
        return max(0, int(delta.total_seconds()))
    except Exception:
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
    st = _load_state()
    if st.get('status') != 'running':
        return st
    delta = _seconds_since(st.get('last_tick')) or 1
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
