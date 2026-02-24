import unittest
import os
import sys
import shutil
import tempfile
import yaml
from unittest.mock import MagicMock, patch

# Ensure project root is in path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from Modules import DataCardManager

class TestDataCards(unittest.TestCase):
    def setUp(self):
        # Create a temp directory
        self.test_dir = tempfile.mkdtemp()
        self.original_user_dir = DataCardManager.USER_DIR
        
        # Override module paths
        DataCardManager.USER_DIR = self.test_dir
        DataCardManager.DATA_CARDS_DIR = os.path.join(self.test_dir, "Data_Cards")

    def tearDown(self):
        # Restore module paths
        DataCardManager.USER_DIR = self.original_user_dir
        shutil.rmtree(self.test_dir)

    def test_series_rules_cards(self):
        # 1. Create Rules
        series = "RPG"
        rules = {"fields": {"name": "text", "class": "enum"}}
        DataCardManager.save_series_rules(series, rules)
        
        # Verify Rules
        loaded_rules = DataCardManager.get_series_rules(series)
        self.assertEqual(loaded_rules["fields"]["class"], "enum")
        
        # 2. Create Card
        card_data = {"name": "Gandalf", "class": "Mage"}
        DataCardManager.save_card(series, "gandalf", card_data)
        
        # Verify Card
        cards = DataCardManager.get_cards(series)
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["name"], "Gandalf")
        
    @patch('Modules.ItemManager.read_item_data')
    def test_import_from_item(self, mock_read):
        # Mock item data return
        mock_read.return_value = {"name": "SecretPlan", "content": "World Domination", "type": "note"}
        
        # 1. Create a Series
        series = "ImportedNotes"
        DataCardManager.save_series_rules(series, {})
        
        # 2. Import (mocking the existence of the source item)
        ok, msg = DataCardManager.import_from_item("note", "SecretPlan", series)
        self.assertTrue(ok, msg)
        
        # 3. Verify Import
        cards = DataCardManager.get_cards(series)
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["name"], "SecretPlan")
        self.assertEqual(cards[0]["content"], "World Domination")
        self.assertEqual(cards[0]["source_item_type"], "note")

if __name__ == '__main__':
    unittest.main()
