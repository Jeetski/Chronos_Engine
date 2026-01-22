import unittest
import os
import shutil
import tempfile
from Modules import ItemManager

class TestItemManager(unittest.TestCase):
    def setUp(self):
        # Create a temp dir for user data to avoid messing with real data
        self.test_dir = tempfile.mkdtemp()
        self.original_user_dir = ItemManager.USER_DIR
        ItemManager.USER_DIR = self.test_dir
        ItemManager.ROOT_DIR = self.test_dir # Mock root to keep it contained
        
        # Create structure
        os.makedirs(os.path.join(self.test_dir, "User", "Tasks"), exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self.test_dir)
        ItemManager.USER_DIR = self.original_user_dir

    def test_write_and_read_item(self):
        data = {"name": "Test Task", "priority": "high", "content": "Keep moving."}
        ItemManager.write_item_data("task", "Test Task", data)
        
        read_back = ItemManager.read_item_data("task", "Test Task")
        self.assertIsNotNone(read_back)
        self.assertEqual(read_back.get("priority"), "high")

    def test_delete_item(self):
        data = {"name": "Delete Me"}
        ItemManager.write_item_data("task", "Delete Me", data)
        self.assertTrue(ItemManager.read_item_data("task", "Delete Me"))
        
        ItemManager.delete_item("task", "Delete Me")
        self.assertIsNone(ItemManager.read_item_data("task", "Delete Me"))

if __name__ == '__main__':
    unittest.main()
