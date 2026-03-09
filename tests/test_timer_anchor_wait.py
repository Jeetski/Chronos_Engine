import os
import sys
import unittest
from datetime import datetime, timedelta

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from modules.timer import main as Timer  # noqa: E402


class TestTimerAnchorWait(unittest.TestCase):
    def test_future_anchor_detected_by_reschedule(self):
        future = (datetime.now() + timedelta(minutes=90)).strftime("%H:%M")
        block = {
            "name": "Lunch",
            "schedule_type": "task",
            "reschedule": "never",
            "start": future,
        }
        self.assertTrue(Timer._is_future_anchor_block(block))

    def test_future_anchor_detected_by_window_name(self):
        future = (datetime.now() + timedelta(minutes=90)).strftime("%H:%M")
        block = {
            "name": "Dinner",
            "schedule_type": "task",
            "window_name": "ANCHOR",
            "start": future,
        }
        self.assertTrue(Timer._is_future_anchor_block(block))

    def test_non_anchor_not_waiting(self):
        future = (datetime.now() + timedelta(minutes=90)).strftime("%H:%M")
        block = {
            "name": "Study",
            "schedule_type": "task",
            "reschedule": "auto",
            "start": future,
        }
        self.assertFalse(Timer._is_future_anchor_block(block))


if __name__ == "__main__":
    unittest.main()
