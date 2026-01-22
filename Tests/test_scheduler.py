import unittest
import sys
import os

# Add root to sys.path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

class TestSchedulerSmoke(unittest.TestCase):
    def test_import_scheduler(self):
        """Simple smoke test to ensure Scheduler imports without crashing."""
        try:
            from Modules import Scheduler
            self.assertTrue(True)
        except Exception as e:
            self.fail(f"Failed to import Scheduler: {e}")

if __name__ == '__main__':
    unittest.main()
