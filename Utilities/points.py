import os
import yaml
from datetime import datetime
from Modules.ItemManager import ensure_dir, get_user_dir


def _points_dir():
    return os.path.join(get_user_dir(), 'Rewards')


def _points_file():
    return os.path.join(_points_dir(), 'points.yml')


def _load_state():
    ensure_dir(_points_dir())
    p = _points_file()
    if not os.path.exists(p):
        return {'balance': 0, 'ledger': []}
    try:
        with open(p, 'r') as f:
            data = yaml.safe_load(f) or {}
            if 'balance' not in data:
                data['balance'] = 0
            if 'ledger' not in data or not isinstance(data.get('ledger'), list):
                data['ledger'] = []
            return data
    except Exception:
        return {'balance': 0, 'ledger': []}


def _save_state(state):
    ensure_dir(_points_dir())
    with open(_points_file(), 'w') as f:
        yaml.dump(state, f, default_flow_style=False)


def get_balance():
    return int(_load_state().get('balance') or 0)


def get_history(last=None):
    led = _load_state().get('ledger') or []
    if isinstance(last, int) and last > 0:
        return led[-last:]
    return led


def add_points(delta: int, *, reason: str = '', source_item: str | None = None, tags: list | None = None):
    st = _load_state()
    st['balance'] = int(st.get('balance', 0)) + int(delta)
    entry = {
        'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'delta': int(delta),
        'reason': reason or '',
    }
    if source_item:
        entry['source'] = source_item
    if tags:
        entry['tags'] = tags
    st.setdefault('ledger', [])
    st['ledger'].append(entry)
    _save_state(st)
    return int(st['balance'])


def ensure_balance(required: int) -> bool:
    return get_balance() >= int(required)


def _config_file():
    # Prefer new lowercase convention
    p = os.path.join(get_user_dir(), 'Settings', 'points_settings.yml')
    if os.path.exists(p):
        return p
    # Backward compatibility
    return os.path.join(get_user_dir(), 'Settings', 'Points.yml')


def _load_config():
    path = _config_file()
    if not os.path.exists(path):
        return {
            'earn': {
                'task': 10,
                'routine': 5,
                'subroutine': 4,
                'microroutine': 2,
                'habit': 5,
            }
        }
    try:
        with open(path, 'r') as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}


def award_on_complete(item_type: str, item_name: str, *, minutes: int | None = None):
    cfg = _load_config().get('earn') or {}
    base = int(cfg.get(item_type, 0) or 0)
    if base <= 0:
        return None
    # Optional simple minutes multiplier: +1 point per 30 minutes
    bonus = 0
    if isinstance(minutes, int) and minutes > 0:
        bonus = minutes // 30
    total = base + bonus
    add_points(total, reason=f"complete:{item_type}", source_item=item_name)
    return total
