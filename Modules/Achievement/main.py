import os
from Modules.ItemManager import generic_handle_new

ITEM_TYPE = "achievement"

def handle_new(name, properties):
    """Create a new achievement using the generic handler."""
    generic_handle_new(ITEM_TYPE, name, properties)

