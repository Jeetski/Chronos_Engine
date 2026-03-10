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


class TestTrickRewards(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_rewards"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_rewards_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.rewards", surfaces)
        self.assertIn("widget.rewards.redeem_primary_button", reg.get("elements", {}))

    def test_set_type_press_and_refresh_rewards(self):
        original_urlopen = server.urlrequest.urlopen

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/points" in url:
                return _FakeResponse({"balance": 40, "history": [{"delta": 5, "reason": "bonus", "date": "2026-03-10"}]})
            if "/api/rewards" in url:
                return _FakeResponse({
                    "rewards": [
                        {"name": "Tea", "cost_points": 10, "available": True, "category": "break", "description": "Tea break"},
                        {"name": "Game", "cost_points": 50, "available": False, "category": "fun", "description": "Short game"},
                    ]
                })
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_set_value("widget.rewards.search_input", "tea", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_press_key("widget.rewards.search_input", "Enter", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.rewards.list_container", self.actor)
            self.assertTrue(ok, err)
            self.assertIn("Tea: 10 pts (ready)", payload["text"])

            ok, _, err = server._trick_set_value("widget.rewards.ready_only_checkbox", True, self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.rewards.ready_only_checkbox", self.actor)
            self.assertTrue(ok, err)
            self.assertTrue(payload["value"])
        finally:
            server.urlrequest.urlopen = original_urlopen

    def test_redeem_and_visibility(self):
        original_urlopen = server.urlrequest.urlopen
        seen_posts = []

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/points" in url:
                return _FakeResponse({"balance": 40, "history": [{"delta": 5, "reason": "bonus", "date": "2026-03-10"}]})
            if "/api/rewards" in url:
                return _FakeResponse({
                    "rewards": [
                        {"name": "Tea", "cost_points": 10, "available": True, "category": "break", "description": "Tea break"}
                    ]
                })
            if "/api/reward/redeem" in url:
                seen_posts.append(json.loads(req.data.decode("utf-8")))
                return _FakeResponse({"ok": True, "stdout": "Redeemed Tea.", "balance": 30})
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_click("widget.rewards.refresh_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.rewards.list_toggle_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.rewards.redeem_primary_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original_urlopen

        self.assertEqual(seen_posts[0]["name"], "Tea")

        server._trick_note_surface_action("widget.rewards", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.rewards.status_text", None, self.actor)
        self.assertFalse(matched)

        server._trick_note_surface_action("widget.rewards", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.rewards.status_text", None, self.actor)
        self.assertTrue(matched)


if __name__ == "__main__":
    unittest.main()
