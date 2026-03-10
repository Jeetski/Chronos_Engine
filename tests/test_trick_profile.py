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


class TestTrickProfile(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_profile"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_profile_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.profile", surfaces)
        self.assertIn("widget.profile.save_button", reg.get("elements", {}))

    def test_refresh_save_and_open_related_files(self):
        original_urlopen = server.urlrequest.urlopen
        original_editor = server._editor_open_request_write
        seen_posts = []
        seen_paths = []

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/profile" in url and hasattr(req, "data") and req.data:
                seen_posts.append(json.loads(req.data.decode("utf-8")))
                return _FakeResponse({"ok": True})
            if "/api/profile" in url:
                return _FakeResponse({"ok": True, "profile": {"nickname": "David", "title": "Captain", "welcome": {"line1": "Hi"}, "exit": {"line1": "Bye"}, "avatar_path": "user/profile/avatar.png"}})
            if "/api/achievements" in url:
                return _FakeResponse({"ok": True, "achievements": [{"state": "awarded", "title": "Captain"}]})
            raise AssertionError(f"Unexpected URL: {url}")

        def fake_editor(path_value, line_value=None):
            seen_paths.append(path_value)
            return True

        server.urlrequest.urlopen = fake_urlopen
        server._editor_open_request_write = fake_editor
        try:
            ok, _, err = server._trick_profile_refresh(self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.profile.nickname_input", "Commander", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.profile.save_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.profile.edit_preferences_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original_urlopen
            server._editor_open_request_write = original_editor

        self.assertEqual(seen_posts[0]["nickname"], "Commander")
        self.assertEqual(seen_paths[0], "user/profile/preferences.md")

    def test_visibility(self):
        server._trick_note_surface_action("widget.profile", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.profile.status_text", None, self.actor)
        self.assertFalse(matched)
        server._trick_note_surface_action("widget.profile", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.profile.status_text", None, self.actor)
        self.assertTrue(matched)


if __name__ == "__main__":
    unittest.main()
