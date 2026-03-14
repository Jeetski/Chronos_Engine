from datetime import datetime

from modules.scheduler import sleep_gate


def _patch_templates(monkeypatch):
    templates = {
        "thursday.yml": {
            "name": "Thriving Thursday",
            "days": ["thursday"],
            "children": [
                {
                    "name": "Bedtime Anchor",
                    "type": "timeblock",
                    "subtype": "anchor",
                    "category": "sleep",
                    "tags": ["anchor", "sleep", "bedtime"],
                    "start_time": "22:00",
                    "duration": 480,
                    "reschedule": "never",
                    "essential": True,
                }
            ],
        },
        "friday.yml": {
            "name": "Flourishing Friday",
            "days": ["friday"],
            "children": [
                {
                    "name": "Bedtime Anchor",
                    "type": "timeblock",
                    "subtype": "anchor",
                    "category": "sleep",
                    "tags": ["anchor", "sleep", "bedtime"],
                    "start_time": "22:00",
                    "duration": 480,
                    "reschedule": "never",
                    "essential": True,
                }
            ],
        },
    }
    monkeypatch.setattr(sleep_gate, "list_all_day_templates", lambda: list(templates.keys()))
    monkeypatch.setattr(sleep_gate, "read_template", lambda path: templates.get(path))
    monkeypatch.setattr(sleep_gate, "is_template_eligible_for_day", lambda template, day: day in (template.get("days") or []))


def test_detects_active_sleep_block_across_midnight(monkeypatch):
    _patch_templates(monkeypatch)
    block = sleep_gate.get_active_sleep_block(datetime(2026, 3, 13, 3, 0, 0))
    assert block is not None
    assert block["name"] == "Bedtime Anchor"
    assert block["start_time"] == "22:00"
    assert block["end_time"] == "06:00"


def test_no_sleep_block_during_midday(monkeypatch):
    _patch_templates(monkeypatch)
    block = sleep_gate.get_active_sleep_block(datetime(2026, 3, 13, 12, 0, 0))
    assert block is None


def test_today_reschedule_returns_sleep_interrupt_when_inside_sleep(monkeypatch):
    _patch_templates(monkeypatch)
    interrupt = sleep_gate.build_sleep_interrupt("today", ["reschedule"], {}, now=datetime(2026, 3, 13, 3, 0, 0))
    assert interrupt is not None
    assert interrupt["type"] == "sleep_conflict"
    assert interrupt["sleep_block"]["name"] == "Bedtime Anchor"


def test_today_view_without_reschedule_does_not_interrupt(monkeypatch):
    _patch_templates(monkeypatch)
    interrupt = sleep_gate.build_sleep_interrupt("today", [], {}, now=datetime(2026, 3, 13, 3, 0, 0))
    assert interrupt is None
