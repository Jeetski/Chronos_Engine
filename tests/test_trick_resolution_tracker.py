import json
import os
import sys
import unittest


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from utilities.dashboard import server
from utilities import registry_builder


class _FakeResponse:
    def __init__(self, payload=None, status=200):
        self.payload = payload or {}
        self.status = status

    def read(self):
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class TestTrickResolutionTracker(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_resolution_tracker"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_resolution_tracker_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.resolution_tracker", surfaces)
        self.assertIn("widget.resolution_tracker.refresh_button", reg.get("elements", {}))

    def test_refresh_and_read_resolution_tracker(self):
        original_urlopen = server.urlrequest.urlopen

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/items" in url:
                return _FakeResponse({
                    "items": [
                        {"type": "project", "name": "Studio", "resolution": {"year": 2026, "affirmation": "Ship with discipline"}},
                        {"type": "task", "name": "Launch page", "project": "Studio", "complete": True},
                    ]
                })
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_click("widget.resolution_tracker.refresh_button", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.resolution_tracker.list_container", self.actor)
            self.assertTrue(ok, err)
            self.assertIn("Ship with discipline", payload["text"])
        finally:
            server.urlrequest.urlopen = original_urlopen

    def test_visibility(self):
        server._trick_note_surface_action("widget.resolution_tracker", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.resolution_tracker.status_text", None, self.actor)
        self.assertFalse(matched)
        server._trick_note_surface_action("widget.resolution_tracker", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.resolution_tracker.status_text", None, self.actor)
        self.assertTrue(matched)


if __name__ == "__main__":
    unittest.main()
