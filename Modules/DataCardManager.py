import os
import yaml
import shutil
import time
from datetime import datetime

# Paths
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
USER_DIR = os.path.join(ROOT_DIR, "User")
DATA_CARDS_DIR = os.path.join(USER_DIR, "Data_Cards")

def _ensure_dir():
    if not os.path.exists(DATA_CARDS_DIR):
        os.makedirs(DATA_CARDS_DIR)

def get_series_list():
    """
    Returns a list of available Data Card series.
    Each series is a subdirectory in User/Data_Cards/.
    """
    _ensure_dir()
    series = []
    for entry in os.scandir(DATA_CARDS_DIR):
        if entry.is_dir():
            series.append(entry.name)
    return sorted(series)

def get_series_rules(series_name):
    """
    Reads the rules.yml (or rules.yaml) for a given series.
    Returns a dict with schema and visualization config.
    """
    series_path = os.path.join(DATA_CARDS_DIR, series_name)
    if not os.path.exists(series_path):
        return {}
    
    rules_path = os.path.join(series_path, "rules.yml")
    if not os.path.exists(rules_path):
        rules_path = os.path.join(series_path, "rules.yaml")
    
    if os.path.exists(rules_path):
        try:
            with open(rules_path, "r", encoding="utf-8") as f:
                return yaml.safe_load(f) or {}
        except Exception:
            return {}
    return {}

def save_series_rules(series_name, rules_data):
    """
    Writes rules.yml for a series. Creates the series directory if needed.
    """
    series_path = os.path.join(DATA_CARDS_DIR, series_name)
    os.makedirs(series_path, exist_ok=True)
    
    rules_path = os.path.join(series_path, "rules.yml")
    with open(rules_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(rules_data, f, sort_keys=False, allow_unicode=True)
    return True

def get_cards(series_name):
    """
    Returns a list of all cards in a series.
    Each card is a YAML file.
    """
    series_path = os.path.join(DATA_CARDS_DIR, series_name)
    if not os.path.exists(series_path):
        return []
    
    cards = []
    for entry in os.scandir(series_path):
        if entry.is_file() and entry.name.lower().endswith((".yml", ".yaml")):
            if entry.name.lower().startswith("rules."):
                continue
            try:
                with open(entry.path, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
                # Ensure ID/Name exists
                if not data.get("id"):
                    data["id"] = os.path.splitext(entry.name)[0]
                cards.append(data)
            except Exception:
                continue
    return cards

def save_card(series_name, card_id, data):
    """
    Saves a card data to YAML.
    """
    series_path = os.path.join(DATA_CARDS_DIR, series_name)
    os.makedirs(series_path, exist_ok=True)
    
    # Sanitize filename
    safe_id = "".join(c for c in card_id if c.isalnum() or c in ("-", "_")).strip()
    if not safe_id:
        safe_id = f"card_{int(time.time())}"
        
    card_path = os.path.join(series_path, f"{safe_id}.yml")
    
    with open(card_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)
    return True

def import_from_item(item_type, item_name, target_series, mapping=None):
    """
    Imports a Chronos Item (from ItemManager) into a Data Card.
    mapping: Optional dict mapping ItemField -> CardField.
    """
    from Modules import ItemManager
    
    item_data = ItemManager.read_item_data(item_type, item_name)
    if not item_data:
        return False, "Item not found"
        
    # Get Series Rules to understand the schema
    rules = get_series_rules(target_series)
    schema = rules.get("fields", {})
    
    new_card = {}
    mapping = mapping or {}
    
    # 1. Direct Copy: If field exists in both, copy it
    for key, value in item_data.items():
        # Check explicit mapping first
        target_key = mapping.get(key, key)
        
        # If target_key matches a field in the schema (or allowed extra), use it
        # For open schemas, we just accept everything.
        new_card[target_key] = value
        
    # 2. Add Metadata
    new_card["source_item_type"] = item_type
    new_card["source_item_name"] = item_name
    new_card["imported_at"] = datetime.utcnow().isoformat()
    
    # 3. Save
    card_id = f"{item_name}_{int(time.time())}"
    save_card(target_series, card_id, new_card)
    
    return True, f"Imported {item_name} to {target_series}"
