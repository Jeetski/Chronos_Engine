import os
import yaml
from datetime import datetime, timedelta, date
from Modules.ItemManager import get_user_dir, get_item_dir, list_all_items


def run(args, properties):
    """
    review daily [YYYY-MM-DD]
    review weekly [YYYY-WW]
    review monthly [YYYY-MM]
    review export <daily|weekly|monthly> <period>
    review open <daily|weekly|monthly> <period>
    """
    if not args or args[0].lower() in {'-h', '--help', 'help'}:
        print(get_help_message())
        return

    sub = args[0].lower()
    if sub == 'daily':
        target = args[1] if len(args) > 1 else datetime.now().strftime('%Y-%m-%d')
        start, end = _period_bounds('daily', target)
        data, path = _generate_review('daily', start, end)
        _save_review('daily', start, data)
        _print_summary('daily', data, path)
        return
    if sub == 'weekly':
        target = args[1] if len(args) > 1 else _current_year_week()
        start, end = _period_bounds('weekly', target)
        data, path = _generate_review('weekly', start, end)
        _save_review('weekly', start, data)
        _print_summary('weekly', data, path)
        return
    if sub == 'monthly':
        target = args[1] if len(args) > 1 else datetime.now().strftime('%Y-%m')
        start, end = _period_bounds('monthly', target)
        data, path = _generate_review('monthly', start, end)
        _save_review('monthly', start, data)
        _print_summary('monthly', data, path)
        return
    if sub == 'export' and len(args) >= 3:
        period_type = args[1].lower()
        target = args[2]
        start, end = _period_bounds(period_type, target)
        review_path = _review_path(period_type, start)
        if not os.path.exists(review_path):
            # Generate if missing
            data, _ = _generate_review(period_type, start, end)
            _save_review(period_type, start, data)
        _export_markdown(period_type, start)
        return
    if sub == 'open' and len(args) >= 3:
        period_type = args[1].lower()
        target = args[2]
        start, _ = _period_bounds(period_type, target)
        print(_review_path(period_type, start))
        return

    print(get_help_message())


def get_help_message():
    return """
Usage:
  review daily [YYYY-MM-DD]
  review weekly [YYYY-WW]
  review monthly [YYYY-MM]
  review export <daily|weekly|monthly> <period>
  review open <daily|weekly|monthly> <period>
"""


# --- Review generation helpers ---

def _user_path(*parts):
    return os.path.join(get_user_dir(), *parts)


def _review_path(period_type: str, start_dt: datetime) -> str:
    if period_type == 'daily':
        name = start_dt.strftime('%Y-%m-%d') + '.yml'
        return _user_path('Reviews', 'daily', name)
    if period_type == 'weekly':
        year, week, _ = start_dt.isocalendar()
        name = f"{year}-{week:02d}.yml"
        return _user_path('Reviews', 'weekly', name)
    if period_type == 'monthly':
        name = start_dt.strftime('%Y-%m') + '.yml'
        return _user_path('Reviews', 'monthly', name)
    raise ValueError('unknown period_type')


def _period_bounds(period_type: str, target: str):
    now = datetime.now()
    if period_type == 'daily':
        try:
            d = datetime.strptime(target, '%Y-%m-%d')
        except Exception:
            d = now
        start = d.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1) - timedelta(seconds=1)
        return start, end
    if period_type == 'weekly':
        # target: YYYY-WW
        try:
            y, w = target.split('-')
            y = int(y); w = int(w)
            # ISO week: Monday = 1
            start = _iso_week_start(y, w)
        except Exception:
            start = _iso_week_start(*_current_year_week_tuple())
        end = start + timedelta(days=7) - timedelta(seconds=1)
        return start, end
    if period_type == 'monthly':
        try:
            d = datetime.strptime(target, '%Y-%m')
        except Exception:
            d = now
        start = d.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # Next month start minus 1 sec
        if start.month == 12:
            nm = start.replace(year=start.year+1, month=1)
        else:
            nm = start.replace(month=start.month+1)
        end = nm - timedelta(seconds=1)
        return start, end
    raise ValueError('unknown period_type')


def _current_year_week():
    y, w, _ = _current_year_week_tuple()
    return f"{y}-{w:02d}"


def _current_year_week_tuple():
    today = datetime.now().date()
    y, w, _ = today.isocalendar()
    return y, w, today.isocalendar()[2]


def _iso_week_start(year: int, week: int) -> datetime:
    # ISO week start (Monday)
    fourth_jan = date(year, 1, 4)
    delta = timedelta(days=fourth_jan.isoweekday()-1)
    year_start = datetime.combine(fourth_jan - delta, datetime.min.time())
    start = year_start + timedelta(weeks=week-1)
    return start


def _generate_review(period_type: str, start: datetime, end: datetime):
    template = _load_review_template()
    data = {
        'period': {'type': period_type, 'start': start.strftime('%Y-%m-%d'), 'end': end.strftime('%Y-%m-%d')},
        'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'sections': {}
    }

    if template.get('include', {}).get('tasks', True):
        data['sections']['tasks'] = _summary_tasks(start, end)
    if template.get('include', {}).get('points', True):
        data['sections']['points'] = _summary_points(start, end)
    if template.get('include', {}).get('goals', True):
        data['sections']['goals'] = _summary_goals_milestones(start, end)
    if template.get('include', {}).get('habits', True):
        data['sections']['habits'] = _summary_habits(start, end)
    if period_type == 'daily' and template.get('include', {}).get('schedule', True):
        data['sections']['schedule'] = _summary_schedule_today()

    path = _review_path(period_type, start)
    return data, path


def _save_review(period_type: str, start: datetime, data: dict):
    path = _review_path(period_type, start)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True)


def _load_review_template():
    path = _user_path('Settings', 'Review_Templates.yml')
    if not os.path.exists(path):
        return {'include': {'tasks': True, 'points': True, 'goals': True, 'habits': True, 'schedule': True}}
    try:
        with open(path, 'r') as f:
            cfg = yaml.safe_load(f) or {}
            incl = cfg.get('include') or {}
            return {'include': incl}
    except Exception:
        return {'include': {'tasks': True, 'points': True, 'goals': True, 'habits': True, 'schedule': True}}


def _summary_tasks(start: datetime, end: datetime):
    # Count completions by type using completion_dates / last_completed
    types = ['task', 'routine', 'subroutine', 'microroutine', 'appointment', 'commitment', 'ritual']
    completed = {}
    created = {}
    for t in types:
        items = list_all_items(t)
        c = 0
        for it in items:
            if not isinstance(it, dict):
                continue
            # completion_dates preferred
            cds = it.get('completion_dates') or []
            for ds in cds:
                try:
                    dt = datetime.strptime(str(ds), '%Y-%m-%d')
                    if start <= dt <= end:
                        c += 1
                except Exception:
                    continue
            # fallback last_completed
            lc = it.get('last_completed')
            if lc:
                try:
                    dt = datetime.strptime(str(lc), '%Y-%m-%d')
                    if start <= dt <= end:
                        c += 1
                except Exception:
                    pass
        completed[t] = c

                # created count: prefer YAML date fields (created/date), fallback to ctime/mtime
        created_count = 0
        item_dir = get_item_dir(t)
        if os.path.exists(item_dir):
            for fname in os.listdir(item_dir):
                if not fname.lower().endswith('.yml'):
                    continue
                fpath = os.path.join(item_dir, fname)
                counted = False
                try:
                    with open(fpath, 'r', encoding='utf-8') as fh:
                        y = yaml.safe_load(fh) or {}
                    for key in ('created', 'date', 'created_at'):
                        val = y.get(key)
                        if not val:
                            continue
                        dt = None
                        try:
                            dt = datetime.strptime(str(val), '%Y-%m-%d')
                        except Exception:
                            try:
                                dt = datetime.strptime(str(val), '%Y-%m-%d %H:%M:%S')
                            except Exception:
                                dt = None
                        if dt and (start <= dt <= end):
                            created_count += 1
                            counted = True
                            break
                except Exception:
                    pass
                if counted:
                    continue
                try:
                    ct = datetime.fromtimestamp(os.path.getctime(fpath))
                except Exception:
                    ct = None
                try:
                    mt = datetime.fromtimestamp(os.path.getmtime(fpath))
                except Exception:
                    mt = None
                dt = ct or mt
                if dt and (start <= dt <= end):
                    created_count += 1
        created[t] = created_count

    return {'completed': completed, 'created': created}


def _summary_points(start: datetime, end: datetime):
    try:
        from Utilities import points as Points
        hist = Points.get_history()
        earned = 0
        spent = 0
        tx = []
        for entry in hist:
            try:
                dt = datetime.strptime(str(entry.get('date')), '%Y-%m-%d %H:%M:%S')
            except Exception:
                continue
            if not (start <= dt <= end):
                continue
            d = int(entry.get('delta') or 0)
            if d >= 0:
                earned += d
            else:
                spent += (-d)
            tx.append({'date': entry.get('date'), 'delta': d, 'reason': entry.get('reason')})
        return {'earned': earned, 'spent': spent, 'net': earned - spent, 'transactions': tx}
    except Exception:
        return {'earned': 0, 'spent': 0, 'net': 0, 'transactions': []}


def _summary_goals_milestones(start: datetime, end: datetime):
    completed = []
    active = 0
    try:
        ms = list_all_items('milestone')
        for m in ms:
            if not isinstance(m, dict):
                continue
            st = str(m.get('status', 'pending')).lower()
            if st == 'completed':
                cts = m.get('completed')
                if cts:
                    try:
                        dt = datetime.strptime(str(cts), '%Y-%m-%d %H:%M:%S')
                        if start <= dt <= end:
                            completed.append({'goal': m.get('goal'), 'milestone': m.get('name')})
                    except Exception:
                        pass
            elif st in ('pending', 'in-progress'):
                active += 1
    except Exception:
        pass
    return {'milestones_completed': completed, 'active_milestones': active}


def _summary_habits(start: datetime, end: datetime):
    try:
        habits = list_all_items('habit')
    except Exception:
        habits = []
    completions = 0
    incidents = 0
    top_streaks = []
    for h in habits:
        if not isinstance(h, dict):
            continue
        cds = h.get('completion_dates') or []
        for ds in cds:
            try:
                dt = datetime.strptime(str(ds), '%Y-%m-%d')
                if start <= dt <= end:
                    completions += 1
            except Exception:
                continue
        inc = h.get('incident_dates') or []
        for ds in inc:
            try:
                dt = datetime.strptime(str(ds), '%Y-%m-%d')
                if start <= dt <= end:
                    incidents += 1
            except Exception:
                continue
        try:
            top_streaks.append({'name': h.get('name'), 'current_streak': int(h.get('current_streak') or 0)})
        except Exception:
            pass
    top_streaks.sort(key=lambda x: x.get('current_streak', 0), reverse=True)
    top_streaks = top_streaks[:5]
    return {'completions': completions, 'incidents': incidents, 'top_streaks': top_streaks}


def _summary_schedule_today():
    path = _user_path('Schedules', 'today_schedule.yml')
    if not os.path.exists(path):
        return {'planned_minutes_total': 0, 'by_type': {}}
    try:
        with open(path, 'r') as f:
            sched = yaml.safe_load(f) or []
        total = 0
        by_type = {}
        def visit(items):
            nonlocal total, by_type
            for it in items:
                if it.get('is_buffer'):
                    continue
                dur = int(it.get('duration') or 0)
                tp = it.get('type') or 'unknown'
                total += dur
                by_type[tp] = by_type.get(tp, 0) + dur
                if it.get('children'):
                    visit(it.get('children'))
        if isinstance(sched, list):
            visit(sched)
        return {'planned_minutes_total': total, 'by_type': by_type}
    except Exception:
        return {'planned_minutes_total': 0, 'by_type': {}}


def _print_summary(kind: str, data: dict, path: str):
    print(f"Generated {kind} review -> {path}")


def _export_markdown(period_type: str, start: datetime):
    # Load YAML
    ypath = _review_path(period_type, start)
    try:
        with open(ypath, 'r') as f:
            data = yaml.safe_load(f) or {}
    except Exception:
        print('Export failed: could not load review YAML')
        return
    # Render basic markdown
    lines = []
    p = data.get('period', {})
    lines.append(f"# {period_type.capitalize()} Review ({p.get('start')} -> {p.get('end')})")
    secs = data.get('sections', {})
    if 'tasks' in secs:
        t = secs['tasks']
        lines.append('## Tasks')
        lines.append(f"Completed: {t.get('completed')}")
        lines.append(f"Created: {t.get('created')}")
    if 'points' in secs:
        s = secs['points']
        lines.append('## Points')
        lines.append(f"Earned: {s.get('earned')}  Spent: {s.get('spent')}  Net: {s.get('net')}")
    if 'goals' in secs:
        g = secs['goals']
        lines.append('## Goals & Milestones')
        lines.append(f"Milestones completed: {len(g.get('milestones_completed', []))}")
    if 'habits' in secs:
        h = secs['habits']
        lines.append('## Habits')
        lines.append(f"Completions: {h.get('completions')}  Incidents: {h.get('incidents')}")
    if 'schedule' in secs:
        sc = secs['schedule']
        lines.append('## Schedule')
        lines.append(f"Planned minutes: {sc.get('planned_minutes_total')}")

    out_dir = _user_path('Exports', 'Reports')
    os.makedirs(out_dir, exist_ok=True)
    fname = None
    if period_type == 'daily':
        fname = data.get('period', {}).get('start') + '.md'
    elif period_type == 'weekly':
        weekly_path = _review_path('weekly', start)
        fname = os.path.splitext(os.path.basename(weekly_path))[0] + '.md'
        #
    else:
        fname = start.strftime('%Y-%m') + '.md'
    mpath = os.path.join(out_dir, fname)
    with open(mpath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f"Exported markdown -> {mpath}")




