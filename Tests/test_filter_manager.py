import unittest
from unittest.mock import patch, mock_open
from Modules import FilterManager

class TestFilterManager(unittest.TestCase):
    
    def test_apply_filter_no_filter(self):
        # Mock get_filter to return None
        with patch.object(FilterManager.FilterManager, 'get_filter', return_value=None):
            items = [{"id": 1}, {"id": 2}]
            result = FilterManager.FilterManager.apply_filter(items)
            self.assertEqual(result, items)

    def test_apply_filter_item_type_match(self):
        filter_data = {"item_type": "task", "properties": {}}
        with patch.object(FilterManager.FilterManager, 'get_filter', return_value=filter_data):
            items = [
                {"type": "task", "name": "A"},
                {"type": "note", "name": "B"},
                {"type": "task", "name": "C"}
            ]
            result = FilterManager.FilterManager.apply_filter(items)
            self.assertEqual(len(result), 2)
            self.assertEqual(result[0]["name"], "A")
            self.assertEqual(result[1]["name"], "C")

    def test_apply_filter_property_match(self):
        filter_data = {"item_type": None, "properties": {"priority": "high"}}
        with patch.object(FilterManager.FilterManager, 'get_filter', return_value=filter_data):
            items = [
                {"priority": "high", "name": "A"},
                {"priority": "low", "name": "B"},
                {"priority": "high", "name": "C"}
            ]
            result = FilterManager.FilterManager.apply_filter(items)
            self.assertEqual(len(result), 2)
            self.assertEqual(result[0]["name"], "A")
            self.assertEqual(result[1]["name"], "C")

    def test_apply_filter_mismatch(self):
        filter_data = {"item_type": "task", "properties": {"priority": "high"}}
        with patch.object(FilterManager.FilterManager, 'get_filter', return_value=filter_data):
            items = [
                {"type": "task", "priority": "low", "name": "A"},
                {"type": "note", "priority": "high", "name": "B"},
                {"type": "task", "priority": "high", "name": "C"}
            ]
            result = FilterManager.FilterManager.apply_filter(items)
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]["name"], "C")

if __name__ == '__main__':
    unittest.main()
