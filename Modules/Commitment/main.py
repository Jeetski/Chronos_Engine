import os
import subprocess
from datetime import datetime, timedelta
from Modules.ItemManager import generic_handle_new, list_all_items, read_item_data, write_item_data

ITEM_TYPE = "commitment"

def handle_new(name, properties):
    """Create a new commitment using generic handler."""
    generic_handle_new(ITEM_TYPE, name, properties)


def _count_in_period(dates: list[str], period: str) -> int:
    today = datetime.now().date()
    if period == 'week':
        yr, wk, _ = today.isocalendar()
        c = 0
        for ds in dates or []:
            try:
                d = datetime.strptime(ds, "%Y-%m-%d").date()
                y, w, _ = d.isocalendar()
                if (y, w) == (yr, wk):
                    c += 1
            except Exception:
                continue
        return c
    if period == 'month':
        prefix = today.strftime("%Y-%m")
        return sum(1 for ds in (dates or []) if isinstance(ds, str) and ds.startswith(prefix))
    if period == 'day':
        s = today.strftime("%Y-%m-%d")
        return sum(1 for ds in (dates or []) if ds == s)
    # Fallback: all-time
    return len(dates or [])


def _get_completion_dates(item_type: str, item_name: str) -> list[str]:
    data = read_item_data(item_type, item_name)
    if not data:
        return []
    dates = data.get('completion_dates') or []
    if not isinstance(dates, list):
        return []
    return [d for d in dates if isinstance(d, str)]


def _run_script(script_path: str):
    try:
        # Prefer .chs execution via Console
        from Modules import Console as ConsoleModule  # type: ignore
        if script_path.lower().endswith('.chs'):
            # Use subprocess to call console with script (ensures same behavior as CLI)
            import sys as _sys, os as _os
            root = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
            subprocess.Popen([_sys.executable, os.path.join(root, 'Modules', 'Console.py'), script_path], cwd=root)
        else:
            # Try to run as a console command: e.g., "echo Hello"
            ConsoleModule.run_command('cmd', [script_path], {})
    except Exception:
        pass


def _create_item(item_type: str, name: str, properties: dict):
    try:
        generic_handle_new(item_type, name, properties or {})
    except Exception:
        pass


def evaluate_and_trigger():
    """
    Scans all commitments and fires triggers when their conditions are met.
    Supported patterns:
      - frequency: { times: N, period: day|week|month }, associated_items: [{type,name},...]
      - never: true, forbidden_items: [{type,name},...]
      Triggers: triggers: { on_met: [...], on_violation: [...] }
        action entries can be:
          - { type: 'script', path: 'Scripts/my.chs' }
          - { type: 'achievement', name: '...', properties: {...} }
          - { type: 'reward', name: '...', properties: {...} }
    """
    all_commitments = list_all_items('commitment')
    today_str = datetime.now().strftime('%Y-%m-%d')
    for c in all_commitments:
        if not isinstance(c, dict):
            continue
        name = c.get('name') or 'Commitment'
        freq = c.get('frequency') if isinstance(c.get('frequency'), dict) else None
        never_flag = bool(c.get('never'))
        assoc = c.get('associated_items') if isinstance(c.get('associated_items'), list) else []
        forb = c.get('forbidden_items') if isinstance(c.get('forbidden_items'), list) else []
        triggers = c.get('triggers') if isinstance(c.get('triggers'), dict) else {}

        # Frequency met?
        met = False
        if freq and assoc:
            times = int(freq.get('times') or 0)
            period = str(freq.get('period') or 'week').lower()
            total = 0
            for it in assoc:
                if not isinstance(it, dict):
                    continue
                t = str(it.get('type') or '')
                n = str(it.get('name') or '')
                if not t or not n:
                    continue
                dates = _get_completion_dates(t, n)
                total += _count_in_period(dates, period)
            if times > 0 and total >= times:
                met = True

        violation = False
        if never_flag and forb:
            # If any forbidden item completed today -> violation
            for it in forb:
                if not isinstance(it, dict):
                    continue
                t = str(it.get('type') or '')
                n = str(it.get('name') or '')
                if not t or not n:
                    continue
                dates = _get_completion_dates(t, n)
                if today_str in dates:
                    violation = True
                    break

        # Prevent duplicate triggers per day
        state_changed = False
        if met and not violation:
            last = c.get('last_met')
            if last != today_str:
                for action in (triggers.get('on_met') or []):
                    _perform_action(action, name)
                c['last_met'] = today_str
                state_changed = True
        if violation:
            lastv = c.get('last_violation')
            if lastv != today_str:
                for action in (triggers.get('on_violation') or []):
                    _perform_action(action, name)
                c['last_violation'] = today_str
                state_changed = True

        if state_changed:
            try:
                write_item_data('commitment', name, c)
            except Exception:
                pass


def _perform_action(action: dict, commitment_name: str):
    if not isinstance(action, dict):
        return
    at = str(action.get('type') or '').lower()
    if at == 'script':
        p = action.get('path') or action.get('script')
        if isinstance(p, str) and p:
            _run_script(p)
    elif at == 'achievement':
        nm = action.get('name') or f"{commitment_name} achievement {datetime.now().strftime('%Y-%m-%d')}"
        props = action.get('properties') if isinstance(action.get('properties'), dict) else {}
        _create_item('achievement', str(nm), props)
    elif at == 'reward':
        nm = action.get('name') or f"{commitment_name} reward {datetime.now().strftime('%Y-%m-%d')}"
        props = action.get('properties') if isinstance(action.get('properties'), dict) else {}
        _create_item('reward', str(nm), props)
