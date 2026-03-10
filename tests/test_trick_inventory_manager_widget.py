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


class TestTrickInventoryManagerWidget(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_inventory_manager_widget"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_inventory_manager_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.inventory_manager", surfaces)
        self.assertIn("widget.inventory_manager.create_button", reg.get("elements", {}))

    def test_refresh_create_and_read_inventory_manager(self):
        original_urlopen = server.urlrequest.urlopen
        seen_posts = []

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/item?type=inventory&name=" in url:
                return _FakeResponse({"item": {"name": "Studio Shelf", "places": ["Office"], "tags": ["gear"], "inventory_items": [], "tools": []}})
            if "/api/items?type=inventory" in url:
                return _FakeResponse({"items": [{"name": "Studio Shelf", "places": ["Office"], "tags": ["gear"]}]})
            if "/api/item" in url:
                seen_posts.append(json.loads(req.data.decode("utf-8")))
                return _FakeResponse({"ok": True})
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_click("widget.inventory_manager.refresh_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.inventory_manager.new_name_input", "Studio Shelf", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.inventory_manager.new_places_input", "Office", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.inventory_manager.new_tags_input", "gear", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.inventory_manager.create_button", self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.inventory_manager.detail_container", self.actor)
            self.assertTrue(ok, err)
            self.assertIn("Studio Shelf", payload["text"])
        finally:
            server.urlrequest.urlopen = original_urlopen

        self.assertEqual(seen_posts[0]["name"], "Studio Shelf")

    def test_visibility(self):
        server._trick_note_surface_action("widget.inventory_manager", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.inventory_manager.status_text", None, self.actor)
        self.assertFalse(matched)
        server._trick_note_surface_action("widget.inventory_manager", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.inventory_manager.status_text", None, self.actor)
        self.assertTrue(matched)


if __name__ == "__main__":
    unittest.main()
