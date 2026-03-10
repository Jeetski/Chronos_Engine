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


class TestTrickAchievements(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_achievements"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_achievements_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.achievements", surfaces)
        self.assertIn("widget.achievements.award_primary_button", reg.get("elements", {}))

    def test_set_type_press_and_refresh_achievements(self):
        original_urlopen = server.urlrequest.urlopen

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/achievements" in url:
                return _FakeResponse({
                    "achievements": [
                        {"name": "First Win", "state": "pending", "description": "Win once", "category": "general", "tags": []},
                        {"name": "Champion", "state": "awarded", "description": "Big win", "category": "general", "tags": [], "title": "Champion"},
                    ],
                    "counts": {"total": 2, "awarded": 1, "pending": 1, "archived": 0},
                })
            if "/api/profile" in url:
                return _FakeResponse({"profile": {"title": "Champion", "level": 3, "xp_total": 1200, "xp_into_level": 200, "xp_to_next_level": 500}})
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_set_value("widget.achievements.search_input", "first", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_press_key("widget.achievements.search_input", "Enter", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.achievements.list_container", self.actor)
            self.assertTrue(ok, err)
            self.assertIn("First Win: pending", payload["text"])

            ok, _, err = server._trick_set_value("widget.achievements.title_select", "Champion", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.achievements.level_text", self.actor)
            self.assertTrue(ok, err)
            self.assertEqual(payload["value"], "LVL 3")
        finally:
            server.urlrequest.urlopen = original_urlopen

    def test_update_title_actions_and_visibility(self):
        original_urlopen = server.urlrequest.urlopen
        seen_posts = []

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/achievements" in url:
                return _FakeResponse({
                    "achievements": [
                        {"name": "First Win", "state": "pending", "description": "Win once", "category": "general", "tags": []}
                    ],
                    "counts": {"total": 1, "awarded": 0, "pending": 1, "archived": 0},
                })
            if "/api/profile" in url and hasattr(req, "data") and req.data:
                seen_posts.append(("profile", json.loads(req.data.decode("utf-8"))))
                return _FakeResponse({"ok": True})
            if "/api/profile" in url:
                return _FakeResponse({"profile": {"title": "", "level": 1, "xp_total": 0, "xp_into_level": 0, "xp_to_next_level": 1000}})
            if "/api/achievement/update" in url:
                seen_posts.append(("update", json.loads(req.data.decode("utf-8"))))
                return _FakeResponse({"ok": True})
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_click("widget.achievements.refresh_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.achievements.list_toggle_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.achievements.title_select", "Champion", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.achievements.set_title_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.achievements.award_primary_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.achievements.archive_primary_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original_urlopen

        self.assertEqual(seen_posts[0][0], "profile")
        self.assertEqual(seen_posts[0][1]["title"], "Champion")
        self.assertEqual(seen_posts[1][1]["name"], "First Win")
        self.assertTrue(seen_posts[1][1]["award_now"])
        self.assertTrue(seen_posts[2][1]["archive_now"])

        server._trick_note_surface_action("widget.achievements", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.achievements.status_text", None, self.actor)
        self.assertFalse(matched)

        server._trick_note_surface_action("widget.achievements", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.achievements.status_text", None, self.actor)
        self.assertTrue(matched)


if __name__ == "__main__":
    unittest.main()
