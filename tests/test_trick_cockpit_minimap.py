import os
import sys
import unittest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from utilities.dashboard import server
from utilities import registry_builder


class TestTrickCockpitMinimap(unittest.TestCase):
    def setUp(self):
        self.actor = "test_trick_cockpit_minimap"
        self.actor_key = server._trick_actor_key(self.actor)
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def tearDown(self):
        server._TRICK_SESSION_STATE.pop(self.actor_key, None)

    def test_registry_includes_cockpit_minimap(self):
        reg = registry_builder.build_trick_registry(force=True)
        self.assertIn("widget.cockpit_minimap", {row["id"] for row in reg.get("surfaces", [])})

    def test_collapse(self):
        ok, _, err = server._trick_click("widget.cockpit_minimap.collapse_button", self.actor)
        self.assertTrue(ok, err)
        ok, payload, err = server._trick_get_value("widget.cockpit_minimap", self.actor)
        self.assertTrue(ok, err)
        self.assertIn("widget.cockpit_minimap.hint_text", payload["elements"])


if __name__ == "__main__":
    unittest.main()
