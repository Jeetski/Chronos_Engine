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
    def __init__(self, payload=None, status=200, text=None):
        self.payload = payload or {}
        self.status = status
        self.text = text

    def read(self):
        if self.text is not None:
            return str(self.text).encode("utf-8")
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class TestTrickCommitments(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_commitments"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_commitments_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.commitments", surfaces)
        self.assertIn("widget.commitments.evaluate_button", reg.get("elements", {}))

    def test_set_type_press_and_refresh_commitments(self):
        original_urlopen = server.urlrequest.urlopen

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/commitments" in url:
                return _FakeResponse({
                    "commitments": [
                        {"name": "No sugar", "status": "pending", "description": "Avoid candy", "period": "day", "targets": []},
                        {"name": "Morning walk", "status": "met", "description": "Walk daily", "period": "day", "targets": []},
                    ]
                })
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_set_value("widget.commitments.search_input", "sugar", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_press_key("widget.commitments.search_input", "Enter", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.commitments.list_container", self.actor)
            self.assertTrue(ok, err)
            self.assertIn("No sugar: pending", payload["text"])

            ok, _, err = server._trick_set_value("widget.commitments.search_input", "", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.commitments.status_filter_select", "met", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.commitments.met_text", self.actor)
            self.assertTrue(ok, err)
            self.assertEqual(payload["value"], 1)
        finally:
            server.urlrequest.urlopen = original_urlopen

    def test_evaluate_override_and_visibility(self):
        original_urlopen = server.urlrequest.urlopen
        seen_posts = []

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/commitments/override" in url:
                seen_posts.append(("override", json.loads(req.data.decode("utf-8"))))
                return _FakeResponse({"ok": True})
            if "/api/commitments" in url:
                return _FakeResponse({
                    "commitments": [
                        {"name": "No sugar", "status": "pending", "description": "Avoid candy", "period": "day", "targets": []}
                    ]
                })
            if "/api/cli" in url:
                seen_posts.append(("evaluate", json.loads(req.data.decode("utf-8"))))
                return _FakeResponse({}, text="checked")
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_click("widget.commitments.refresh_button", self.actor)
            self.assertTrue(ok, err)

            ok, _, err = server._trick_click("widget.commitments.list_toggle_button", self.actor)
            self.assertTrue(ok, err)

            ok, _, err = server._trick_click("widget.commitments.met_primary_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.commitments.violation_primary_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.commitments.clear_primary_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.commitments.evaluate_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original_urlopen

        self.assertEqual(seen_posts[0][0], "override")
        self.assertEqual(seen_posts[0][1]["name"], "No sugar")
        self.assertEqual(seen_posts[0][1]["state"], "met")
        self.assertEqual(seen_posts[1][1]["state"], "violation")
        self.assertEqual(seen_posts[2][1]["state"], "clear")
        self.assertEqual(seen_posts[3][0], "evaluate")
        self.assertEqual(seen_posts[3][1]["command"], "commitments")

        server._trick_note_surface_action("widget.commitments", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.commitments.status_text", None, self.actor)
        self.assertFalse(matched)

        server._trick_note_surface_action("widget.commitments", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.commitments.status_text", None, self.actor)
        self.assertTrue(matched)


if __name__ == "__main__":
    unittest.main()
