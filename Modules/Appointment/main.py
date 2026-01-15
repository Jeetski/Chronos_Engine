from Modules.ItemManager import generic_handle_new

# Define the item type for this module
ITEM_TYPE = "appointment"

def handle_new(name, properties):
    """Create a new appointment using generic handler."""
    generic_handle_new(ITEM_TYPE, name, properties)
