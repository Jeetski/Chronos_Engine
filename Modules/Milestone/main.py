import os
import yaml
from datetime import datetime, timedelta
from Modules.ItemManager import (
    generic_handle_new, read_item_data, write_item_data, list_all_items
)

# Define the item type for this module
ITEM_TYPE = "milestone"


def handle_command(command, item_type, item_name, _text, properties):
    """
    Supports:
      - new: create a milestone (delegates to generic)
      - track: compute and show milestone progress
    """
    if command == 'new':
        generic_handle_new(item_type, item_name, properties)
        return

    if command == 'track':
        _track_milestone(item_name)
        return

    print(f"Unsupported command for milestone: {command}")


def evaluate_and_update_milestones():
    """
    Scans all milestones, computes progress based on criteria, updates status,
    and fires completion triggers once.
    """
    all_ms = list_all_items('milestone') or []
    for m in all_ms:
        if not isinstance(m, dict):
            continue
        name = m.get('name') or 'Milestone'
        computed = _compute_progress(m)
        if not computed:
            continue
        changed = False
        if m.get('progress') != computed['progress']:
            m['progress'] = computed['progress']
            changed = True
        # Completion handling
        if computed['progress']['percent'] >= 100 and str(m.get('status','')).lower() != 'completed':
            m['status'] = 'completed'
            m['completed'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            changed = True
            _fire_triggers(m)
        # Move into in-progress if >0 and not finished
        if 0 < computed['progress']['percent'] < 100 and str(m.get('status','')).lower() == 'pending':
            m['status'] = 'in-progress'
            changed = True
        if changed:
            write_item_data('milestone', name, m)


def _track_milestone(milestone_name: str):
    m = read_item_data('milestone', milestone_name)
    if not m:
        print(f"Milestone '{milestone_name}' not found.")
        return
    res = _compute_progress(m)
    if not res:
        print(f"Milestone '{milestone_name}' has no criteria.")
        return
    p = res['progress']
    st = m.get('status', 'pending')
    crit_desc = res['criteria_desc']
    print(f"--- Milestone ---\n  Name: {milestone_name}\n  Goal: {m.get('goal','')}\n  Status: {st}\n  Criteria: {crit_desc}\n  Progress: {p['current']} / {p['target']}  ({p['percent']:.0f}%)")


def _compute_progress(m: dict):
    criteria = m.get('criteria') or {}
    # Support legacy shapes
    if 'count' in criteria:
        return _progress_count(criteria['count'], m)
    if 'checklist' in criteria:
        return _progress_checklist(criteria['checklist'], m)
    # If top-level already is one of them
    if 'of' in criteria and 'times' in criteria:
        return _progress_count(criteria, m)
    if 'items' in criteria:
        return _progress_checklist(criteria, m)
    return None


def _progress_count(cfg: dict, m: dict):
    target = int(cfg.get('times') or 0)
    period = str(cfg.get('period') or 'all').lower()
    of = cfg.get('of')
    items = of if isinstance(of, list) else ([of] if isinstance(of, dict) else [])
    current = 0
    for it in items:
        t = str(it.get('type') or '')
        n = str(it.get('name') or '')
        if not t or not n:
            continue
        data = read_item_data(t, n) or {}
        dates = data.get('completion_dates') or []
        current += _count_in_period(dates, period)
    percent = min(100.0, (current / target * 100.0) if target > 0 else 0.0)
    return {
        'progress': {'current': current, 'target': target, 'percent': percent},
        'criteria_desc': f"count of {', '.join([it.get('name','') for it in items])} in {period}"
    }


def _progress_checklist(cfg: dict, m: dict):
    items = cfg.get('items') or []
    require = cfg.get('require') or 'all'
    completed = 0
    total = len(items)
    for it in items:
        t = str(it.get('type') or '')
        n = str(it.get('name') or '')
        if not t or not n:
            continue
        data = read_item_data(t, n) or {}
        # Consider completed if explicit status is completed OR any completion date exists
        st = str(data.get('status','')).lower()
        dates = data.get('completion_dates') or []
        if st == 'completed' or (isinstance(dates, list) and len(dates) > 0):
            completed += 1
    target = total if str(require).lower() == 'all' else int(require)
    target = max(0, min(target, total))
    percent = min(100.0, (completed / target * 100.0) if target > 0 else 0.0)
    return {
        'progress': {'current': completed, 'target': target, 'percent': percent},
        'criteria_desc': f"checklist {completed}/{total} (require {target})"
    }


def _count_in_period(dates, period: str) -> int:
    try:
        today = datetime.now().date()
        if period == 'day':
            s = today.strftime('%Y-%m-%d')
            return sum(1 for ds in (dates or []) if ds == s)
        if period == 'week':
            yr, wk, _ = today.isocalendar()
            c = 0
            for ds in dates or []:
                try:
                    d = datetime.strptime(ds, '%Y-%m-%d').date()
                    y, w, _ = d.isocalendar()
                    if (y, w) == (yr, wk):
                        c += 1
                except Exception:
                    continue
            return c
        if period == 'month':
            prefix = today.strftime('%Y-%m')
            return sum(1 for ds in (dates or []) if isinstance(ds, str) and ds.startswith(prefix))
        # 'all'
        return len(dates or [])
    except Exception:
        return 0


def _fire_triggers(m: dict):
    actions = m.get('on_complete') or []
    if not isinstance(actions, list):
        return
    for action in actions:
        if not isinstance(action, dict):
            continue
        at = str(action.get('type') or '').lower()
        if at == 'script':
            p = action.get('path') or action.get('script')
            if isinstance(p, str) and p:
                _run_script(p)
        elif at == 'achievement':
            nm = action.get('name') or f"{m.get('goal','Goal')} - {m.get('name','Milestone')} achieved"
            props = action.get('properties') if isinstance(action.get('properties'), dict) else {}
            _create_item('achievement', str(nm), props)
        elif at == 'reward':
            nm = action.get('name') or f"{m.get('goal','Goal')} - {m.get('name','Milestone')} reward"
            props = action.get('properties') if isinstance(action.get('properties'), dict) else {}
            _create_item('reward', str(nm), props)


def _run_script(script_path: str):
    try:
        import sys as _sys, os as _os, subprocess as _sub
        root = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..', '..'))
        # Prefer running via Console to leverage command parsing
        launcher = _os.path.join(root, 'console_launcher.bat')
        if _os.path.exists(launcher) and script_path.lower().endswith('.chs'):
            _sub.Popen(f'"{launcher}" "{script_path}"', shell=True, cwd=root)
        else:
            # Fallback: try to run as cmd string via Console 'cmd'
            from Modules import Console as ConsoleModule  # type: ignore
            ConsoleModule.run_command('cmd', [script_path], {})
    except Exception:
        pass


def _create_item(item_type: str, name: str, properties: dict):
    try:
        generic_handle_new(item_type, name, properties or {})
    except Exception:
        pass
