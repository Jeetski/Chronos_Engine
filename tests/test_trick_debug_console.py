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


class TestTrickDebugConsole(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_debug_console"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_debug_console(self):
        reg = registry_builder.build_trick_registry(force=True)
        self.assertIn("widget.debug_console", {row["id"] for row in reg.get("surfaces", [])})

    def test_refresh_clear_and_copy(self):
        original = server.urlrequest.urlopen

        def fake(req, timeout=10):
            return _FakeResponse({"ok": True, "logs": ["line a", "line b"]})

        server.urlrequest.urlopen = fake
        try:
            ok, _, err = server._trick_click("widget.debug_console.refresh_button", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.debug_console.output_text", self.actor)
            self.assertTrue(ok, err)
            self.assertIn("line a", payload["text"])
            ok, _, err = server._trick_click("widget.debug_console.copy_button", self.actor)
            self.assertTrue(ok, err)
            self.assertIn("line a", server._trick_session(self.actor)["clipboard"])
            ok, _, err = server._trick_click("widget.debug_console.clear_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original


if __name__ == "__main__":
    unittest.main()
