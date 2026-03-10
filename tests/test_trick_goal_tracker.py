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


class TestTrickGoalTracker(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_goal_tracker"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_goal_tracker_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.goal_tracker", surfaces)
        self.assertIn("widget.goal_tracker.complete_primary_button", reg.get("elements", {}))

    def test_set_type_and_press_search(self):
        original_urlopen = server.urlrequest.urlopen

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/goals" in url:
                return _FakeResponse({"goals": [{"name": "Ship v1", "overall": 45}]})
            if "/api/goal?" in url:
                return _FakeResponse({"goal": {"name": "Ship v1", "overall": 45, "milestones": []}})
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_type_value("widget.goal_tracker.search_input", "Ship", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_press_key("widget.goal_tracker.search_input", "Enter", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.goal_tracker.goal_title_text", self.actor)
            self.assertTrue(ok, err)
            self.assertEqual(payload["value"], "Ship v1")
        finally:
            server.urlrequest.urlopen = original_urlopen

    def test_select_goal_and_primary_actions(self):
        original_urlopen = server.urlrequest.urlopen
        seen_posts = []

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/goals" in url:
                return _FakeResponse({"goals": [{"name": "Ship v1", "overall": 45}]})
            if "/api/goal?" in url:
                return _FakeResponse({"goal": {
                    "name": "Ship v1",
                    "overall": 45,
                    "priority": "high",
                    "milestones": [
                        {"name": "Docs done", "status": "pending", "progress": {"percent": 20}, "links": [{"type": "task", "name": "Write docs"}]}
                    ],
                }})
            if "/api/milestone/complete" in url:
                seen_posts.append(("complete", json.loads(req.data.decode("utf-8"))))
                return _FakeResponse({"ok": True})
            if "/api/timer/start" in url:
                seen_posts.append(("focus", json.loads(req.data.decode("utf-8"))))
                return _FakeResponse({"ok": True})
            if "/api/milestone/recalc" in url:
                seen_posts.append(("recalc", {}))
                return _FakeResponse({"ok": True})
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_goal_tracker_refresh(self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.goal_tracker.goal_title_text", "Ship v1", self.actor)
            self.assertTrue(ok, err)

            ok, _, err = server._trick_click("widget.goal_tracker.complete_primary_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.goal_tracker.focus_primary_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.goal_tracker.recalc_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original_urlopen

        self.assertEqual(seen_posts[0][0], "complete")
        self.assertEqual(seen_posts[0][1]["name"], "Docs done")
        self.assertEqual(seen_posts[1][0], "focus")
        self.assertEqual(seen_posts[1][1]["bind_name"], "Write docs")
        self.assertEqual(seen_posts[2][0], "recalc")

    def test_copy_and_visibility(self):
        server._trick_goal_tracker_session(self.actor)["goal_meta_text"] = "Priority: high"
        ok, result, err = server._trick_copy_value("widget.goal_tracker.goal_meta_text", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(result["clipboard"], "Priority: high")

        server._trick_note_surface_action("widget.goal_tracker", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.goal_tracker.status_text", None, self.actor)
        self.assertFalse(matched)

        server._trick_note_surface_action("widget.goal_tracker", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.goal_tracker.status_text", None, self.actor)
        self.assertTrue(matched)


if __name__ == "__main__":
    unittest.main()
