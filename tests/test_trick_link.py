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


class TestTrickLink(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_link"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_link_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.link", surfaces)
        self.assertIn("widget.link.connect_button", reg.get("elements", {}))

    def test_refresh_connect_sync_invite_and_disconnect(self):
        original_urlopen = server.urlrequest.urlopen

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/items?type=canvas_board" in url:
                return _FakeResponse({"ok": True, "items": [{"name": "Ops Board"}]})
            if "/api/link/invite?board=" in url:
                return _FakeResponse({"ok": True, "url": "http://127.0.0.1:7357/link?board=Ops%20Board", "token": "secret"})
            if "http://peer.test/api/link/board?name=" in url:
                return _FakeResponse({"ok": True, "content": {"name": "Ops Board"}})
            if "http://peer.test/api/link/status" in url:
                return _FakeResponse({"ok": True, "link_id": "peer-1"})
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_link_refresh(self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.link.peer_input", "peer.test", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.link.token_input", "secret", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.link.board_select", "Ops Board", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.link.connect_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.link.invite_button", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.link.disconnect_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original_urlopen

        ok, payload, err = server._trick_get_value("widget.link.peer_status_text", self.actor)
        self.assertTrue(ok, err)
        self.assertEqual(payload["text"], "offline")

    def test_visibility(self):
        server._trick_note_surface_action("widget.link", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.link.status_text", None, self.actor)
        self.assertFalse(matched)
        server._trick_note_surface_action("widget.link", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.link.status_text", None, self.actor)
        self.assertTrue(matched)


if __name__ == "__main__":
    unittest.main()
