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
        self.payload = payload
        self.status = status
        self.text = text

    def read(self):
        if self.text is not None:
            return str(self.text).encode("utf-8")
        return json.dumps(self.payload or {}).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class TestTrickStatus(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_status"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_status_surface(self):
        reg = registry_builder.build_trick_registry(force=True)
        surfaces = {row["id"] for row in reg.get("surfaces", [])}
        self.assertIn("widget.status", surfaces)
        self.assertIn("widget.status.update_button", reg.get("elements", {}))

    def test_set_type_copy_and_paste_status_fields(self):
        ok, _, err = server._trick_set_value("widget.status.fields_container", "energy: high\nfocus: deep", self.actor)
        self.assertTrue(ok, err)

        ok, payload, err = server._trick_get_value("widget.status.fields_container", self.actor)
        self.assertTrue(ok, err)
        self.assertIn("energy: high", payload["text"])

        ok, result, err = server._trick_copy_value("widget.status.fields_container", self.actor)
        self.assertTrue(ok, err)
        self.assertIn("focus: deep", result["clipboard"])

        server._trick_set_value("widget.status.fields_container", "", self.actor)
        ok, _, err = server._trick_paste_value("widget.status.fields_container", self.actor)
        self.assertTrue(ok, err)
        ok, payload, err = server._trick_get_value("widget.status.fields_container", self.actor)
        self.assertTrue(ok, err)
        self.assertIn("focus: deep", payload["text"])

        ok, _, err = server._trick_type_value("widget.status.fields_container", "\nemotion: calm", self.actor)
        self.assertTrue(ok, err)
        ok, payload, err = server._trick_get_value("widget.status.fields_container", self.actor)
        self.assertTrue(ok, err)
        self.assertIn("emotion: calm", payload["text"])

    def test_refresh_and_update_status(self):
        original_urlopen = server.urlrequest.urlopen
        seen_posts = []

        def fake_urlopen(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/status/current" in url:
                return _FakeResponse({"status": {"energy": "high", "focus": "deep"}})
            if "/api/status/update" in url:
                seen_posts.append(req.data.decode("utf-8"))
                return _FakeResponse({}, status=200)
            raise AssertionError(f"Unexpected URL: {url}")

        server.urlrequest.urlopen = fake_urlopen
        try:
            ok, _, err = server._trick_status_refresh(self.actor)
            self.assertTrue(ok, err)
            ok, payload, err = server._trick_get_value("widget.status.fields_container", self.actor)
            self.assertTrue(ok, err)
            self.assertIn("energy: high", payload["text"])

            ok, result, err = server._trick_click("widget.status.update_button", self.actor)
            self.assertTrue(ok, err)
            self.assertEqual(len(seen_posts), 1)
            self.assertIn("focus: deep", seen_posts[0])
            self.assertEqual(result["values"]["energy"], "high")
        finally:
            server.urlrequest.urlopen = original_urlopen

    def test_open_close_changes_visibility(self):
        server._trick_note_surface_action("widget.status", "close", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.status.status_text", None, self.actor)
        self.assertFalse(matched)

        server._trick_note_surface_action("widget.status", "open", self.actor)
        matched, _ = server._trick_eval_predicate("visible", "widget.status.status_text", None, self.actor)
        self.assertTrue(matched)


if __name__ == "__main__":
    unittest.main()
