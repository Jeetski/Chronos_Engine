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


class TestTrickSettings(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_settings"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_settings_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.settings", surfaces)
        self.assertIn("widget.settings.save_button", reg.get("elements", {}))

    def test_refresh_load_and_save(self):
        original_urlopen = server.urlrequest.urlopen
        saved_bodies = []

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/settings?file=" in url and hasattr(req, "data") and req.data:
                saved_bodies.append(req.data.decode("utf-8"))
                return _FakeResponse({"ok": True})
            if "/api/settings?file=" in url:
                return _FakeResponse({"ok": True, "content": "theme: dusk\nsound: true\n"})
            if url.endswith("/api/settings"):
                return _FakeResponse({"ok": True, "files": ["dashboard.yml", "timer.yml"]})
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_settings_refresh(self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.settings.file_select", "dashboard.yml", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.settings.editor_input", "theme: aurora\n", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.settings.save_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original_urlopen

        self.assertEqual(saved_bodies[0], "theme: aurora\n")

    def test_visibility(self):
        server._trick_note_surface_action("widget.settings", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.settings.status_text", None, self.actor)
        self.assertFalse(matched)
        server._trick_note_surface_action("widget.settings", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.settings.status_text", None, self.actor)
        self.assertTrue(matched)


if __name__ == "__main__":
    unittest.main()
