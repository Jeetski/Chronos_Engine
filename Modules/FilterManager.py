import os
import yaml

# Determine the root directory of the Chronos Engine project
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FILTER_STATE_PATH = os.path.join(ROOT_DIR, "User", "Settings", "active_filter.yml")

class FilterManager:

    @classmethod
    def _read_filter_state(cls):
        if os.path.exists(FILTER_STATE_PATH):
            with open(FILTER_STATE_PATH, 'r') as f:
                return yaml.safe_load(f)
        return None

    @classmethod
    def _write_filter_state(cls, filter_state):
        os.makedirs(os.path.dirname(FILTER_STATE_PATH), exist_ok=True)
        with open(FILTER_STATE_PATH, 'w') as f:
            yaml.dump(filter_state, f)

    @classmethod
    def set_filter(cls, item_type=None, properties=None):
        """
        Sets the active filter.
        :param item_type: The type of item to filter (e.g., 'task', 'microroutine').
        :param properties: A dictionary of property:value pairs to filter by.
        """
        filter_state = {
            "item_type": item_type,
            "properties": {k.lower(): v.lower() for k, v in properties.items()} if properties is not None else {}
        }
        cls._write_filter_state(filter_state)
        print(f"✅ Filter set: Item Type='{item_type if item_type else 'Any'}', Properties={properties}")

    @classmethod
    def get_filter(cls):
        """
        Returns the active filter.
        :return: A dictionary containing 'item_type' and 'properties', or None if no filter is active.
        """
        return cls._read_filter_state()

    @classmethod
    def clear_filter(cls):
        """
        Clears the active filter.
        """
        if os.path.exists(FILTER_STATE_PATH):
            os.remove(FILTER_STATE_PATH)
        print("✅ Filter cleared.")

    @classmethod
    def is_filter_active(cls):
        """
        Checks if a filter is currently active.
        """
        return cls._read_filter_state() is not None

    @classmethod
    def apply_filter(cls, items):
        """
        Applies the active filter to a list of items.
        :param items: A list of item dictionaries.
        :return: A new list containing only the items that match the active filter.
        """
        active_filter = cls.get_filter()
        if not active_filter:
            return items

        filtered_items = []
        for item in items:
            match = True
            # Filter by item_type
            if active_filter["item_type"] and item.get("type") != active_filter["item_type"]:
                match = False
            
            # Filter by properties
            if match:
                for prop_key, prop_value in active_filter["properties"].items():
                    item_value = item.get(prop_key.lower())
                    if item_value is None or str(item_value).lower() != prop_value:
                        match = False
                        break
            
            if match:
                filtered_items.append(item)
        return filtered_items
