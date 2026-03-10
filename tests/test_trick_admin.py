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
    def __init__(self, payload=None):
        self.payload = payload or {}

    def read(self):
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class TestTrickAdmin(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_admin"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_admin(self):
        reg = registry_builder.build_trick_registry(force=True)
        self.assertIn("widget.admin", {row["id"] for row in reg.get("surfaces", [])})

    def test_refresh_and_run_command(self):
        original = server.urlrequest.urlopen
        seen = []

        def fake(req, timeout=10):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "/api/system/databases" in url:
                return _FakeResponse({"ok": True, "databases": [{"name": "main"}]})
            if "/api/system/command" in url:
                seen.append(json.loads(req.data.decode("utf-8"))["command"])
                return _FakeResponse({"ok": True, "stdout": "done"})
            raise AssertionError(url)

        server.urlrequest.urlopen = fake
        try:
            ok, _, err = server._trick_admin_refresh(self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_set_value("widget.admin.db_select", "main", self.actor)
            self.assertTrue(ok, err)
            ok, _, err = server._trick_click("widget.admin.clear_db_button", self.actor)
            self.assertTrue(ok, err)
        finally:
            server.urlrequest.urlopen = original

        self.assertEqual(seen[0], "clear db:main force")


if __name__ == "__main__":
    unittest.main()
