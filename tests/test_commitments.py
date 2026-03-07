import unittest
import os
import shutil
import tempfile
from datetime import datetime

from modules import item_manager as ItemManager
from modules.commitment import main as CommitmentModule


class TestCommitments(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.original_user_dir = ItemManager.USER_DIR
        self.original_root_dir = ItemManager.ROOT_DIR
        ItemManager.USER_DIR = self.test_dir
        ItemManager.ROOT_DIR = self.test_dir

        os.makedirs(os.path.join(self.test_dir, "User", "Habits"), exist_ok=True)
        os.makedirs(os.path.join(self.test_dir, "User", "Commitments"), exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self.test_dir)
        ItemManager.USER_DIR = self.original_user_dir
        ItemManager.ROOT_DIR = self.original_root_dir

    def test_frequency_commitment_met(self):
        today = datetime.now().strftime("%Y-%m-%d")
        ItemManager.write_item_data("habit", "Morning Walk", {
            "name": "Morning Walk",
            "type": "habit",
            "completion_dates": [today],
        })

        commitment = {
            "name": "Daily Walk",
            "type": "commitment",
            "rule": {"kind": "frequency", "times": 1, "period": "day"},
            "targets": [{"type": "habit", "name": "Morning Walk"}],
        }
        status = CommitmentModule.get_commitment_status(commitment)
        self.assertTrue(status["met"])
        self.assertFalse(status["violation"])

    def test_frequency_legacy_of_field(self):
        today = datetime.now().strftime("%Y-%m-%d")
        ItemManager.write_item_data("habit", "Legacy Walk", {
            "name": "Legacy Walk",
            "type": "habit",
            "completion_dates": [today],
        })

        commitment = {
            "name": "Legacy Commitment",
            "type": "commitment",
            "frequency": {"times": 1, "period": "day", "of": {"type": "habit", "name": "Legacy Walk"}},
        }
        status = CommitmentModule.get_commitment_status(commitment)
        self.assertTrue(status["met"])

    def test_never_rule_uses_bad_habit_incidents(self):
        today = datetime.now().strftime("%Y-%m-%d")
        ItemManager.write_item_data("habit", "Smoke", {
            "name": "Smoke",
            "type": "habit",
            "polarity": "bad",
            "incident_dates": [today],
            "completion_dates": [],
        })

        commitment = {
            "name": "Never Smoke",
            "type": "commitment",
            "rule": {"kind": "never", "period": "day"},
            "targets": [{"type": "habit", "name": "Smoke"}],
        }
        status = CommitmentModule.get_commitment_status(commitment)
        self.assertTrue(status["violation"])
        self.assertFalse(status["met"])

    def test_trigger_normalization(self):
        commitment = {
            "name": "Trigger Test",
            "type": "commitment",
            "rule": {"kind": "frequency", "times": 1, "period": "day"},
            "targets": [{"type": "habit", "name": "Morning Walk"}],
            "triggers": {
                "on_complete": [{"type": "script", "command": "Scripts/commitments/miss_example.chs"}]
            },
        }
        status = CommitmentModule.get_commitment_status(commitment)
        self.assertIn("on_met", status["triggers"])
        action = status["triggers"]["on_met"][0]
        self.assertEqual(action.get("path"), "Scripts/commitments/miss_example.chs")

    def test_frequency_per_target_counts_met(self):
        today = datetime.now().strftime("%Y-%m-%d")
        ItemManager.write_item_data("habit", "Beat Upload", {
            "name": "Beat Upload",
            "type": "habit",
            "completion_dates": [today],
        })
        ItemManager.write_item_data("habit", "Post on Socials", {
            "name": "Post on Socials",
            "type": "habit",
            "completion_dates": [today] * 10,
        })

        commitment = {
            "name": "Grow Honeycomb Lab",
            "type": "commitment",
            "rule": {"kind": "frequency", "period": "week"},
            "targets": [
                {"type": "habit", "name": "Beat Upload", "count": 1},
                {"type": "habit", "name": "Post on Socials", "count": 10},
            ],
        }
        status = CommitmentModule.get_commitment_status(commitment)
        self.assertTrue(status["met"])
        self.assertEqual(status["required_total"], 11)
        self.assertEqual(status["remaining"], 0)

    def test_frequency_per_target_counts_pending_until_each_target_met(self):
        today = datetime.now().strftime("%Y-%m-%d")
        ItemManager.write_item_data("habit", "Beat Upload", {
            "name": "Beat Upload",
            "type": "habit",
            "completion_dates": [today],
        })
        ItemManager.write_item_data("habit", "Post on Socials", {
            "name": "Post on Socials",
            "type": "habit",
            "completion_dates": [today] * 9,
        })

        commitment = {
            "name": "Grow Honeycomb Lab",
            "type": "commitment",
            "rule": {"kind": "frequency", "period": "week"},
            "targets": [
                {"type": "habit", "name": "Beat Upload", "count": 1},
                {"type": "habit", "name": "Post on Socials", "count": 10},
            ],
        }
        status = CommitmentModule.get_commitment_status(commitment)
        self.assertFalse(status["met"])
        self.assertEqual(status["required_total"], 11)
        self.assertEqual(status["remaining"], 1)

    def test_manual_daily_override_met(self):
        commitment = {
            "name": "Manual Override Met",
            "type": "commitment",
            "rule": {"kind": "frequency", "times": 99, "period": "day"},
            "targets": [{"type": "habit", "name": "Any Habit"}],
            "manual_status_by_date": {datetime.now().strftime("%Y-%m-%d"): "met"},
        }
        status = CommitmentModule.get_commitment_status(commitment)
        self.assertTrue(status["met"])
        self.assertFalse(status["violation"])
        self.assertEqual(status.get("manual_state"), "met")

    def test_manual_daily_override_violation(self):
        commitment = {
            "name": "Manual Override Violation",
            "type": "commitment",
            "rule": {"kind": "frequency", "times": 1, "period": "day"},
            "targets": [{"type": "habit", "name": "Any Habit"}],
            "manual_status_by_date": {datetime.now().strftime("%Y-%m-%d"): "violation"},
        }
        status = CommitmentModule.get_commitment_status(commitment)
        self.assertFalse(status["met"])
        self.assertTrue(status["violation"])
        self.assertEqual(status.get("manual_state"), "violation")


if __name__ == '__main__':
    unittest.main()
