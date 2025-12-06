import os
from datetime import datetime

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
AUTOMATION_STATE_PATH = os.path.join(ROOT_DIR, "User", "Data", "sequence_automation.yml")

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

_LAST_SYNC_DATE = None


def _load_state():
    global _LAST_SYNC_DATE
    if _LAST_SYNC_DATE is not None or yaml is None:
        return
    if not os.path.exists(AUTOMATION_STATE_PATH):
        _LAST_SYNC_DATE = None
        return
    try:
        with open(AUTOMATION_STATE_PATH, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
            _LAST_SYNC_DATE = data.get("last_midnight_sync")
    except Exception:
        _LAST_SYNC_DATE = None


def _save_state(date_str: str):
    global _LAST_SYNC_DATE
    _LAST_SYNC_DATE = date_str
    if yaml is None:
        return
    os.makedirs(os.path.dirname(AUTOMATION_STATE_PATH), exist_ok=True)
    with open(AUTOMATION_STATE_PATH, "w", encoding="utf-8") as fh:
        yaml.safe_dump({"last_midnight_sync": date_str}, fh)


def maybe_queue_midnight_sync(now: datetime, run_cli_command) -> None:
    """
    Called by the listener loop to trigger `sequence sync memory trends`
    shortly after midnight. Ensures it runs at most once per calendar day.
    """
    _load_state()
    date_str = now.strftime("%Y-%m-%d")
    if _LAST_SYNC_DATE == date_str:
        return
    if now.hour == 0 and now.minute < 10:
        try:
            run_cli_command('sequence sync memory trends')
            _save_state(date_str)
        except Exception:
            pass
