import os
import sys
import unittest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from utilities.dashboard import server
from utilities import registry_builder


class TestTrickClock(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_clock"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_clock(self):
        reg = registry_builder.build_trick_registry(force=True)
        self.assertIn("widget.clock", {row["id"] for row in reg.get("surfaces", [])})

    def test_refresh_clock(self):
        ok, _, err = server._trick_click("widget.clock.reminder_button", self.actor)
        self.assertTrue(ok, err)
        ok, payload, err = server._trick_get_value("widget.clock.time_text", self.actor)
        self.assertTrue(ok, err)
        self.assertTrue(payload["text"])


if __name__ == "__main__":
    unittest.main()
