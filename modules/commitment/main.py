import os
import subprocess
from datetime import datetime, timedelta, date
from modules.item_manager import (
    generic_handle_new,
    generic_handle_append,
    generic_handle_delete,
    list_all_items,
    read_item_data,
    write_item_data,
    open_item_in_editor,
)

ITEM_TYPE = "commitment"

def handle_new(name, properties):
    """Create a new commitment using generic handler."""
    generic_handle_new(ITEM_TYPE, name, properties)


def handle_command(command, item_type, item_name, text_to_append, properties):
    """
    Provide the standard item lifecycle for commitments so CLI generic commands work.
    """
    normalized = (command or "").strip().lower()

    if normalized in ("new", "create"):
        generic_handle_new(item_type, item_name, properties)
        return

    if normalized == "append":
        if not text_to_append:
            print("Info: Nothing to append. Provide text after the commitment name.")
            return
        generic_handle_append(item_type, item_name, text_to_append, properties)
        return

    if normalized == "delete":
        generic_handle_delete(item_type, item_name, properties)
        return

    if normalized in ("info", "view", "track"):
        _print_commitment(item_name)
        return

    if normalized in ("set", "update", "edit"):
        _update_properties(item_name, properties)
        return

    if normalized == "open":
        open_item_in_editor(item_type, item_name, None)
        return

    if normalized == "check":
        evaluate_and_trigger()
        return

    print(f"Unsupported command for commitment: {command}")


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

def _period_key(d: date, period: str) -> str:
    if period == 'week':
        yr, wk, _ = d.isocalendar()
        return f"{yr}-W{wk:02d}"
    if period == 'month':
        return d.strftime("%Y-%m")
    return d.strftime("%Y-%m-%d")

def _normalize_targets(c: dict) -> list[dict]:
    # Canonical: targets
    targets = c.get('targets') if isinstance(c.get('targets'), list) else None
    if targets:
        return [t for t in targets if isinstance(t, dict)]

    # Legacy: associated_items / forbidden_items
    assoc = c.get('associated_items') if isinstance(c.get('associated_items'), list) else []
    forb = c.get('forbidden_items') if isinstance(c.get('forbidden_items'), list) else []
    if assoc:
        return [t for t in assoc if isinstance(t, dict)]
    if forb:
        return [t for t in forb if isinstance(t, dict)]

    # Legacy: frequency.of / never.of / linked_habit
    freq = c.get('frequency') if isinstance(c.get('frequency'), dict) else {}
    never = c.get('never') if isinstance(c.get('never'), dict) else {}
    of = None
    if isinstance(freq, dict):
        of = freq.get('of')
    if not of and isinstance(never, dict):
        of = never.get('of')
    if isinstance(of, dict) and of.get('type') and of.get('name'):
        return [of]
    linked = c.get('linked_habit')
    if isinstance(linked, str) and linked.strip():
        return [{"type": "habit", "name": linked.strip()}]
    return []

def _normalize_rule(c: dict) -> tuple[str, int, str]:
    # Canonical: rule
    rule = c.get('rule') if isinstance(c.get('rule'), dict) else None
    if rule:
        kind = str(rule.get('kind') or '').lower()
        times = int(rule.get('times') or 0)
        period = str(rule.get('period') or 'week').lower()
        return (kind, times, period)

    # Legacy: frequency / never
    freq = c.get('frequency') if isinstance(c.get('frequency'), dict) else None
    if freq:
        times = int(freq.get('times') or 0)
        period = str(freq.get('period') or 'week').lower()
        return ('frequency', times, period)
    if c.get('never') is True or isinstance(c.get('never'), dict):
        # Default to day for "never" rules to allow recovery
        return ('never', 0, 'day')
    return ('', 0, 'week')

def _target_required_count(target: dict) -> int:
    if not isinstance(target, dict):
        return 1
    raw = target.get('count')
    if raw is None:
        raw = target.get('times')
    if raw is None:
        raw = target.get('required')
    try:
        n = int(raw)
    except Exception:
        n = 1
    return max(1, n)

def _manual_status_for_date(c: dict, today: date) -> str:
    manual_map = c.get('manual_status_by_date') if isinstance(c.get('manual_status_by_date'), dict) else {}
    val = str(manual_map.get(today.strftime('%Y-%m-%d')) or '').strip().lower()
    if val in ('met', 'violation'):
        return val
    return ''

def _get_item_polarity(item_type: str, item_name: str) -> str:
    data = read_item_data(item_type, item_name)
    if not isinstance(data, dict):
        return "good"
    return str(data.get('polarity') or 'good').lower()

def _get_dates_for_target(item_type: str, item_name: str, *, for_never: bool) -> list[str]:
    data = read_item_data(item_type, item_name)
    if not isinstance(data, dict):
        return []
    if for_never and item_type == 'habit':
        polarity = str(data.get('polarity') or 'good').lower()
        if polarity == 'bad':
            dates = data.get('incident_dates') or []
            return [d for d in dates if isinstance(d, str)]
    dates = data.get('completion_dates') or []
    return [d for d in dates if isinstance(d, str)]

def _normalize_triggers(c: dict) -> dict:
    triggers = c.get('triggers') if isinstance(c.get('triggers'), dict) else {}
    if not triggers:
        return {}
    # Legacy: on_complete -> on_met
    if 'on_complete' in triggers and 'on_met' not in triggers:
        triggers['on_met'] = triggers.get('on_complete')
    # Normalize script actions
    for key in ('on_met', 'on_violation'):
        actions = triggers.get(key) or []
        if not isinstance(actions, list):
            continue
        for action in actions:
            if not isinstance(action, dict):
                continue
            if str(action.get('type') or '').lower() == 'script':
                # Accept path/script/command/name as the script field
                if not action.get('path'):
                    action['path'] = action.get('script') or action.get('command') or action.get('name')
    return triggers

def get_commitment_status(c: dict, today: date | None = None) -> dict:
    today = today or datetime.now().date()
    kind, times, period = _normalize_rule(c)
    targets = _normalize_targets(c)
    triggers = _normalize_triggers(c)

    progress = 0
    required_total = times
    remaining = max(0, required_total - progress)
    met = False
    violation = False
    target_progress = []
    if kind == 'frequency':
        has_per_target_counts = any(isinstance(it, dict) and it.get('count') is not None for it in targets)
        if targets:
            valid_target_count = 0
            if has_per_target_counts:
                required_total = 0
                all_met = True
                for it in targets:
                    t = str(it.get('type') or '').strip()
                    n = str(it.get('name') or '').strip()
                    if not t or not n:
                        continue
                    valid_target_count += 1
                    req = _target_required_count(it)
                    dates = _get_dates_for_target(t, n, for_never=False)
                    tgt_progress = _count_in_period(dates, period)
                    progress += tgt_progress
                    required_total += req
                    tgt_remaining = max(0, req - tgt_progress)
                    if tgt_progress < req:
                        all_met = False
                    target_progress.append({
                        "type": t,
                        "name": n,
                        "required": req,
                        "progress": tgt_progress,
                        "remaining": tgt_remaining,
                        "met": tgt_progress >= req,
                    })
                met = bool(valid_target_count > 0 and all_met)
            else:
                for it in targets:
                    t = str(it.get('type') or '').strip()
                    n = str(it.get('name') or '').strip()
                    if not t or not n:
                        continue
                    valid_target_count += 1
                    dates = _get_dates_for_target(t, n, for_never=False)
                    tgt_progress = _count_in_period(dates, period)
                    progress += tgt_progress
                    target_progress.append({
                        "type": t,
                        "name": n,
                        "required": 1,
                        "progress": tgt_progress,
                        "remaining": max(0, 1 - tgt_progress),
                        "met": tgt_progress >= 1,
                    })
                if times > 0 and valid_target_count > 0 and progress >= times:
                    met = True
        remaining = max(0, required_total - progress)
    elif kind == 'never':
        for it in targets:
            t = str(it.get('type') or '').strip()
            n = str(it.get('name') or '').strip()
            if not t or not n:
                continue
            dates = _get_dates_for_target(t, n, for_never=True)
            if _count_in_period(dates, period) > 0:
                violation = True
                break
        met = not violation

    manual_state = _manual_status_for_date(c, today)
    if manual_state == 'met':
        met = True
        violation = False
    elif manual_state == 'violation':
        violation = True
        met = False

    state = 'violation' if violation else ('met' if met else 'pending')
    return {
        "kind": kind,
        "times": times,
        "period": period,
        "targets": targets,
        "progress": progress,
        "required_total": required_total,
        "remaining": remaining,
        "target_progress": target_progress,
        "met": met,
        "violation": violation,
        "state": state,
        "manual_state": manual_state,
        "triggers": triggers,
    }


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
        from modules import console as ConsoleModule# type: ignore
        if script_path.lower().endswith('.chs'):
            # Use subprocess to call console with script (ensures same behavior as CLI)
            import sys as _sys, os as _os
            root = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
            subprocess.Popen([_sys.executable, os.path.join(root, 'modules', 'console.py'), script_path], cwd=root)
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
          - { type: 'script', path: 'scripts/my.chs' }
          - { type: 'achievement', name: '...', properties: {...} }
          - { type: 'reward', name: '...', properties: {...} }
    """
    all_commitments = list_all_items('commitment')
    today_dt = datetime.now().date()
    today_str = today_dt.strftime('%Y-%m-%d')
    for c in all_commitments:
        if not isinstance(c, dict):
            continue
        name = c.get('name') or 'Commitment'
        status = get_commitment_status(c, today=today_dt)
        met = status["met"]
        violation = status["violation"]
        triggers = status["triggers"]
        period = status["period"]
        period_key = _period_key(today_dt, period)

        # Prevent duplicate triggers per day
        state_changed = False
        if met and not violation:
            last = c.get('last_met')
            if last != period_key:
                for action in (triggers.get('on_met') or []):
                    _perform_action(action, name)
                c['last_met'] = period_key
                state_changed = True
        if violation:
            lastv = c.get('last_violation')
            if lastv != period_key:
                for action in (triggers.get('on_violation') or []):
                    _perform_action(action, name)
                c['last_violation'] = period_key
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


def _print_commitment(name: str):
    data = read_item_data(ITEM_TYPE, name)
    if not data:
        print(f"Commitment '{name}' not found.")
        return
    freq = data.get('frequency') if isinstance(data.get('frequency'), dict) else None
    assoc = data.get('associated_items') if isinstance(data.get('associated_items'), list) else []
    forb = data.get('forbidden_items') if isinstance(data.get('forbidden_items'), list) else []
    print("--- Commitment ---")
    print(f"  Name: {name}")
    print(f"  Description: {data.get('description') or data.get('notes') or 'N/A'}")
    if freq:
        print(f"  Target: {freq.get('times')} per {freq.get('period')}")
    if assoc:
        items = ", ".join(f"{it.get('type','?')}:{it.get('name','')}" for it in assoc if isinstance(it, dict))
        print(f"  Associated: {items}")
    if data.get('never') and forb:
        items = ", ".join(f"{it.get('type','?')}:{it.get('name','')}" for it in forb if isinstance(it, dict))
        print(f"  Forbidden: {items}")
    triggers = data.get('triggers')
    if triggers:
        print(f"  Triggers: {list(triggers.keys())}")
    print(f"  Last met: {data.get('last_met') or 'never'}")
    print(f"  Last violation: {data.get('last_violation') or 'none'}")


def _update_properties(name: str, updates: dict):
    if not updates:
        print("No properties provided to update.")
        return
    data = read_item_data(ITEM_TYPE, name)
    if not data:
        print(f"Commitment '{name}' not found.")
        return
    for key, value in updates.items():
        if key is None:
            continue
        data[str(key).lower()] = value
    write_item_data(ITEM_TYPE, name, data)
    print(f"Commitment '{name}' updated.")

