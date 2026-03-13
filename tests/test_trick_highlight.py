import unittest

from utilities import registry_builder
from utilities.dashboard import server


class TestTrickHighlight(unittest.TestCase):
    def setUp(self):
        server._TRICK_OPEN_REQUESTS.clear()

    def test_registry_exposes_highlight_for_elements(self):
        reg = registry_builder.build_trick_registry(force=True)
        row = reg.get("elements", {}).get("widget.today.reschedule_button") or {}
        self.assertIn("highlight", row.get("actions", []))
        self.assertTrue(server._trick_element_allowed("widget.today.reschedule_button", "highlight"))

    def test_parse_highlight_request(self):
        req = server._trick_parse_request({
            "input": "HIGHLIGHT widget.today.reschedule_button pulse 1500 Click here",
            "actor": "nia",
        })
        self.assertEqual(req["command"], "HIGHLIGHT")
        self.assertEqual(req["target"], "widget.today.reschedule_button")
        self.assertEqual(req["mode"], "pulse")
        self.assertEqual(req["duration_ms"], 1500)
        self.assertEqual(req["message"], "Click here")

    def test_highlight_request_queue_payload(self):
        req = server._trick_highlight_request_push(
            "widget.today.reschedule_button",
            actor="nia",
            mode="spotlight",
            duration_ms=2400,
            message="Generate the schedule here.",
        )
        self.assertIsInstance(req, dict)
        self.assertEqual(req["action"], "highlight")
        self.assertEqual(req["surface"], "widget.today")
        self.assertEqual(req["target"], "widget.today.reschedule_button")
        self.assertEqual(req["mode"], "spotlight")
        self.assertEqual(req["duration_ms"], 2400)
        self.assertEqual(req["message"], "Generate the schedule here.")
        self.assertEqual(server._trick_open_request_latest()["id"], req["id"])


if __name__ == "__main__":
    unittest.main()
