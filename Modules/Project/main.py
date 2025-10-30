from Modules.ItemManager import generic_handle_new

# Define the item type for this module
ITEM_TYPE = "project"

def handle_new(name, properties):
    """Create a new project using generic handler."""
    generic_handle_new(ITEM_TYPE, name, properties)
