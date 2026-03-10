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
    def __init__(self, payload=None, text=None, status=200):
        self.payload = payload
        self.text = text
        self.status = status

    def read(self):
        if self.text is not None:
            return str(self.text).encode("utf-8")
        return json.dumps(self.payload or {}).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class TestTrickNotes(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_notes"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_notes_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.notes", surfaces)
        self.assertIn("widget.notes.create_button", reg.get("elements", {}))

    def test_set_create_and_sticky_notes(self):
        original_urlopen = server.urlrequest.urlopen
        seen_posts = []

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/new/note" in url:
                seen_posts.append(("create", json.loads(req.data.decode("utf-8"))))
                return _FakeResponse({"ok": True})
            if "/api/sticky-notes" in url:
                seen_posts.append(("sticky", json.loads(req.data.decode("utf-8"))))
                return _FakeResponse({"ok": True})
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_set_value("widget.notes.title_input", "Idea", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.notes.content_input", "Ship the widget", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.notes.create_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.notes.to_sticky_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original_urlopen

        self.assertEqual(seen_posts[0][0], "create")
        self.assertEqual(seen_posts[0][1]["name"], "Idea")
        self.assertEqual(seen_posts[1][0], "sticky")

    def test_load_and_visibility(self):
        original_urlopen = server.urlrequest.urlopen

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/file/read" in url:
                return _FakeResponse({"content": "Loaded body"})
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            server._trick_notes_session(self.actor)["path_hint_text"] = "Path: user/notes/idea.md"
            ok, _, err = server._trick_click("widget.notes.load_button", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.notes.content_input", self.actor)
            self.assertTrue(ok, err)
            self.assertEqual(payload["value"], "Loaded body")
        finally:
            server.urlrequest.urlopen = original_urlopen

        server._trick_note_surface_action("widget.notes", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.notes.status_text", None, self.actor)
        self.assertFalse(matched)
        server._trick_note_surface_action("widget.notes", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.notes.status_text", None, self.actor)
        self.assertTrue(matched)


if __name__ == "__main__":
    unittest.main()
