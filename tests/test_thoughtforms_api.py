import os
import sys

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from thoughtforms import server as Thoughtforms


def test_bootstrap_payload_includes_context_and_nodes(monkeypatch):
    monkeypatch.setattr(
        Thoughtforms,
        "_load_all_items",
        lambda: [
            {"name": "Ship canvas", "type": "task", "status": "active", "tags": ["ui"]},
            {"name": "Modernize Chronos", "type": "goal", "status": "active", "tags": ["future"]},
        ],
    )
    monkeypatch.setattr(
        Thoughtforms,
        "_load_today_blocks",
        lambda: [{"name": "Deep Work", "type": "today_block", "start": "09:00", "end": "10:00"}],
    )
    monkeypatch.setattr(Thoughtforms, "_load_profile", lambda: {"nickname": "David", "theme": "Blue"})
    monkeypatch.setattr(Thoughtforms, "_load_status", lambda: {"energy": "high"})

    payload = Thoughtforms.build_bootstrap_payload()

    assert payload["ok"] is True
    assert payload["context"]["profile"]["nickname"] == "David"
    assert payload["context"]["today"]["blockCount"] == 1
    assert len(payload["nodes"]) == 3


def test_query_payload_returns_matching_items(monkeypatch):
    monkeypatch.setattr(
        Thoughtforms,
        "_load_all_items",
        lambda: [
            {"name": "Focus Block", "type": "task", "content": "Deep focus on architecture", "tags": ["focus"]},
            {"name": "Sleep Cleanup", "type": "project", "content": "Review sleep logs", "tags": ["sleep"]},
        ],
    )
    monkeypatch.setattr(
        Thoughtforms,
        "_load_today_blocks",
        lambda: [{"name": "Morning Plan", "type": "today_block", "start": "08:00", "end": "08:30"}],
    )

    payload = Thoughtforms.build_query_payload("focus")

    assert payload["ok"] is True
    assert payload["nodes"]
    assert payload["nodes"][0]["title"] == "Focus Block"
    assert "focus" in payload["reply"].lower()
