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


class TestTrickMilestones(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_milestones"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_milestones_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.milestones", surfaces)
        self.assertIn("widget.milestones.complete_primary_button", reg.get("elements", {}))

    def test_set_type_press_and_refresh_milestones(self):
        original_urlopen = server.urlrequest.urlopen

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/milestones" in url:
                return _FakeResponse({
                    "milestones": [
                        {"name": "Docs done", "status": "pending", "project": "Atlas", "goal": "Ship v1"},
                        {"name": "Launch prep", "status": "completed", "project": "Atlas", "goal": "Ship v1"},
                    ]
                })
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_set_value("widget.milestones.search_input", "Docs", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_press_key("widget.milestones.search_input", "Enter", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.milestones.list_container", self.actor)
            self.assertTrue(ok, err)
            self.assertIn("Docs done: pending", payload["text"])

            ok, _, err = server._trick_set_value("widget.milestones.status_filter_select", "pending", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.milestones.status_filter_select", self.actor)
            self.assertTrue(ok, err)
            self.assertEqual(payload["value"], "pending")
        finally:
            server.urlrequest.urlopen = original_urlopen

    def test_primary_actions_and_visibility(self):
        original_urlopen = server.urlrequest.urlopen
        seen_posts = []

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/milestones" in url:
                return _FakeResponse({
                    "milestones": [
                        {"name": "Docs done", "status": "pending", "project": "Atlas", "goal": "Ship v1"}
                    ]
                })
            if "/api/milestone/update" in url:
                seen_posts.append(json.loads(req.data.decode("utf-8")))
                return _FakeResponse({"ok": True})
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_click("widget.milestones.refresh_button", self.actor)
            self.assertTrue(ok, err)

            ok, _, err = server._trick_click("widget.milestones.list_toggle_button", self.actor)
            self.assertTrue(ok, err)

            ok, _, err = server._trick_click("widget.milestones.complete_primary_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.milestones.reset_primary_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original_urlopen

        self.assertEqual(seen_posts[0]["name"], "Docs done")
        self.assertEqual(seen_posts[0]["action"], "complete")
        self.assertEqual(seen_posts[1]["action"], "reset")

        server._trick_note_surface_action("widget.milestones", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.milestones.status_text", None, self.actor)
        self.assertFalse(matched)

        server._trick_note_surface_action("widget.milestones", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.milestones.status_text", None, self.actor)
        self.assertTrue(matched)


if __name__ == "__main__":
    unittest.main()
