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
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status = status

    def read(self):
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class TestTrickItemManager(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_item_manager"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_item_manager_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.item_manager", surfaces)
        self.assertIn("widget.item_manager.save_button", reg.get("elements", {}))

    def test_set_and_get_item_manager_values(self):
        ok, _, err = server._trick_set_value("widget.item_manager.type_select", "note", self.actor)
        self.assertTrue(ok, err)
        ok, _, err = server._trick_set_value("widget.item_manager.search_input", "meeting", self.actor)
        self.assertTrue(ok, err)

        ok, payload, err = server._trick_get_value("widget.item_manager.type_select", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(payload["value"], "note")

        ok, payload, err = server._trick_get_value("widget.item_manager.search_input", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(payload["value"], "meeting")

    def test_refresh_and_load_item_update_surface(self):
        original_urlopen = server.urlrequest.urlopen

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/items?" in url:
                return _FakeResponse({"items": [{"name": "Daily Note", "type": "note", "status": "pending"}]})
            if "/api/item?" in url:
                return _FakeResponse({"content": "name: Daily Note\nstatus: pending\n"})
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            server._trick_set_value("widget.item_manager.type_select", "note", self.actor)
            ok, _, err = server._trick_click("widget.item_manager.refresh_button", self.actor)
            self.assertTrue(ok, err)

            ok, payload, err = server._trick_get_value("widget.item_manager.list_container", self.actor)
            self.assertTrue(ok, err)
            self.assertIn("Daily Note", payload["text"])

            ok, _, err = server._trick_set_value("widget.item_manager.item_name_input", "Daily Note", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_item_manager_load_item(self.actor, "Daily Note")
            self.assertTrue(ok, err)

            ok, payload, err = server._trick_get_value("widget.item_manager.yaml_input", self.actor)
            self.assertTrue(ok, err)
            self.assertIn("status: pending", payload["text"])
        finally:
            server.urlrequest.urlopen = original_urlopen

    def test_save_button_posts_item_payload(self):
        original_urlopen = server.urlrequest.urlopen
        seen = []

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/item" in url and hasattr(req, "data") and req.data:
                seen.append(json.loads(req.data.decode("utf-8")))
                return _FakeResponse({"ok": True})
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            server._trick_set_value("widget.item_manager.type_select", "task", self.actor)
            server._trick_set_value("widget.item_manager.item_name_input", "Deep Work", self.actor)
            server._trick_set_value("widget.item_manager.yaml_input", "name: Deep Work\nstatus: pending\n", self.actor)
            ok, _, err = server._trick_click("widget.item_manager.save_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original_urlopen

        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0]["name"], "Deep Work")
        self.assertEqual(seen[0]["type"], "task")

    def test_open_close_changes_visibility(self):
        server._trick_note_surface_action("widget.item_manager", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.item_manager.status_text", None, self.actor)
        self.assertFalse(matched)

        server._trick_note_surface_action("widget.item_manager", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.item_manager.status_text", None, self.actor)
        self.assertTrue(matched)

    def test_type_copy_and_paste_item_manager(self):
        ok, _, err = server._trick_type_value("widget.item_manager.search_input", "meeting", self.actor)
        self.assertTrue(ok, err)
        ok, payload, err = server._trick_get_value("widget.item_manager.search_input", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(payload["value"], "meeting")

        server._trick_item_manager_session(self.actor)["yaml_input"] = "name: Deep Work\nstatus: pending\n"
        ok, result, err = server._trick_copy_value("widget.item_manager.yaml_input", self.actor)
        self.assertTrue(ok, err)
        self.assertIn("Deep Work", result["clipboard"])

        server._trick_set_value("widget.item_manager.yaml_input", "", self.actor)
        ok, _, err = server._trick_paste_value("widget.item_manager.yaml_input", self.actor)
        self.assertTrue(ok, err)
        ok, payload, err = server._trick_get_value("widget.item_manager.yaml_input", self.actor)
        self.assertTrue(ok, err)
        self.assertIn("Deep Work", payload["value"])

    def test_press_item_manager_keys(self):
        original_urlopen = server.urlrequest.urlopen

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/items?" in url:
                return _FakeResponse({"items": [{"name": "Sprint Review", "type": "task"}]})
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            server._trick_set_value("widget.item_manager.search_input", "sprintx", self.actor)
            ok, _, err = server._trick_press_key("widget.item_manager.search_input", "Backspace", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.item_manager.search_input", self.actor)
            self.assertTrue(ok, err)
            self.assertEqual(payload["value"], "sprint")

            ok, result, err = server._trick_press_key("widget.item_manager.search_input", "Enter", self.actor)
            self.assertTrue(ok, err)
            self.assertEqual(result["count"], 1)

            server._trick_set_value("widget.item_manager.yaml_input", "abc", self.actor)
            ok, _, err = server._trick_press_key("widget.item_manager.yaml_input", "Enter", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.item_manager.yaml_input", self.actor)
            self.assertTrue(ok, err)
            self.assertEqual(payload["value"], "abc\n")
        finally:
            server.urlrequest.urlopen = original_urlopen


if __name__ == "__main__":
    unittest.main()