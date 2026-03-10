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


class TestTrickVariables(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_variables"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_variables_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.variables", surfaces)
        self.assertIn("widget.variables.save_button", reg.get("elements", {}))

    def test_set_save_and_refresh_variables(self):
        original_urlopen = server.urlrequest.urlopen
        seen_posts = []

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/vars" in url and hasattr(req, "data") and req.data:
                seen_posts.append(json.loads(req.data.decode("utf-8")))
                return _FakeResponse({"ok": True, "vars": {"artist": "Nia", "mood": "focused"}})
            if "/api/vars" in url:
                return _FakeResponse({"ok": True, "vars": {"artist": "Nia"}})
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_set_value("widget.variables.grid_container", "artist=Nia\nmood=focused", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.variables.save_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.variables.refresh_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original_urlopen

        self.assertEqual(seen_posts[0]["set"]["artist"], "Nia")
        self.assertEqual(seen_posts[0]["set"]["mood"], "focused")

    def test_visibility(self):
        server._trick_note_surface_action("widget.variables", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.variables.status_text", None, self.actor)
        self.assertFalse(matched)
        server._trick_note_surface_action("widget.variables", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.variables.status_text", None, self.actor)
        self.assertTrue(matched)


if __name__ == "__main__":
    unittest.main()
