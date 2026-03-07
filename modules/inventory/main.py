"""
Inventory module placeholder.

Having a module per item type keeps ItemManager happy if we later want to add
custom handlers (view/pack/etc.). For now we just declare the type constant so
generic handlers know this module exists.
"""

ITEM_TYPE = "inventory"

def handle_command(command_name, item_type, item_name, text, properties):
    """
    Stub handler so future inventory-specific verbs can slot in without errors.
    At the moment we fall back to generic behavior, so just print a friendly
    note when an unsupported command is routed here.
    """
    print(f"Inventory module has no custom handler for '{command_name}'.")
