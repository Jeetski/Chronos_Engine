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


class TestTrickStickyNotes(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_sticky_notes"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_sticky_notes(self):
        reg = registry_builder.build_trick_registry(force=True)
        self.assertIn("widget.sticky_notes", {row["id"] for row in reg.get("surfaces", [])})

    def test_refresh_and_create(self):
        original = server.urlrequest.urlopen

        def fake(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/sticky-notes" in url and hasattr(req, "data") and req.data:
                return _FakeResponse({"ok": True})
            if "/api/sticky-notes" in url:
                return _FakeResponse({"ok": True, "notes": [{"name": "Note A"}]})
            raise AssertionError(url)

        server.urlrequest.urlopen = fake
        try:
            ok, _, err = server._trick_click("widget.sticky_notes.refresh_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.sticky_notes.new_content_input", "hello", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.sticky_notes.create_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original


if __name__ == "__main__":
    unittest.main()
