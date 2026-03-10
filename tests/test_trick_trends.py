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
    def __init__(self, payload=None):
        self.payload = payload or {}

    def read(self):
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class TestTrickTrends(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_trends"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_trends(self):
        reg = registry_builder.build_trick_registry(force=True)
        self.assertIn("widget.trends", {row["id"] for row in reg.get("surfaces", [])})

    def test_refresh_trends(self):
        original = server.urlrequest.urlopen

        def fake(req, timeout=10):
            return _FakeResponse({"ok": True, "metrics": {"habit_stats": {"habits_with_current_streak": 3}, "timer_stats": {"focus_minutes": 90}}})

        server.urlrequest.urlopen = fake
        try:
            ok, _, err = server._trick_click("widget.trends.refresh_button", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.trends.metrics_container", self.actor)
            self.assertTrue(ok, err)
            self.assertIn("Habits", payload["text"])
        finally:
            server.urlrequest.urlopen = original


if __name__ == "__main__":
    unittest.main()
