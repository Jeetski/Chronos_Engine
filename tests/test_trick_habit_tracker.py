import json
import os
import sys
import unittest


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from utilities.dashboard import server
from utilities import registry_builder


class _FakeYamlResponse:
    def __init__(self, text, status=200):
        self.text = text
        self.status = status

    def read(self):
        return self.text.encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeJsonResponse:
    def __init__(self, payload=None, status=200):
        self.payload = payload or {}
        self.status = status

    def read(self):
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class TestTrickHabitTracker(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_habit_tracker"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_habit_tracker_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.habit_tracker", surfaces)
        self.assertIn("widget.habit_tracker.done_primary_button", reg.get("elements", {}))

    def test_set_type_press_and_refresh_habits(self):
        original_urlopen = server.urlrequest.urlopen
        yaml_text = """
ok: true
habits:
  -
    name: Walk
    polarity: good
    category: health
    priority: high
    streak_current: 3
    streak_longest: 10
    clean_current: 0
    clean_longest: 0
    today_status: done
  -
    name: Sugar
    polarity: bad
    category: health
    priority: medium
    streak_current: 0
    streak_longest: 0
    clean_current: 4
    clean_longest: 9
    today_status: incident
"""

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/habits" in url:
                return _FakeYamlResponse(yaml_text)
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_set_value("widget.habit_tracker.search_input", "Walk", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_press_key("widget.habit_tracker.search_input", "Enter", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.habit_tracker.list_container", self.actor)
            self.assertTrue(ok, err)
            self.assertIn("Walk: done", payload["text"])

            ok, _, err = server._trick_set_value("widget.habit_tracker.polarity_select", "bad", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.habit_tracker.polarity_select", self.actor)
            self.assertTrue(ok, err)
            self.assertEqual(payload["value"], "bad")
        finally:
            server.urlrequest.urlopen = original_urlopen

    def test_primary_actions_and_visibility(self):
        original_urlopen = server.urlrequest.urlopen
        seen_posts = []
        yaml_text = """
ok: true
habits:
  -
    name: Walk
    polarity: good
    category: health
    priority: high
    streak_current: 3
    streak_longest: 10
    clean_current: 0
    clean_longest: 0
    today_status:
"""

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/habits/complete" in url:
                seen_posts.append(("complete", json.loads(req.data.decode("utf-8"))))
                return _FakeJsonResponse({"ok": True, "name": "Walk", "action": "complete"})
            if "/api/habits/incident" in url:
                seen_posts.append(("incident", json.loads(req.data.decode("utf-8"))))
                return _FakeJsonResponse({"ok": True, "name": "Walk", "action": "incident"})
            if "/api/habits" in url:
                return _FakeYamlResponse(yaml_text)
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_click("widget.habit_tracker.refresh_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.habit_tracker.done_primary_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.habit_tracker.incident_primary_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original_urlopen

        self.assertEqual(seen_posts[0][0], "complete")
        self.assertEqual(seen_posts[0][1]["name"], "Walk")
        self.assertEqual(seen_posts[1][0], "incident")

        server._trick_note_surface_action("widget.habit_tracker", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.habit_tracker.status_text", None, self.actor)
        self.assertFalse(matched)

        server._trick_note_surface_action("widget.habit_tracker", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.habit_tracker.status_text", None, self.actor)
        self.assertTrue(matched)


if __name__ == "__main__":
    unittest.main()
