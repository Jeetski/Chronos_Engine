import sys
import os
import yaml
from Modules.ItemManager import get_item_path, read_item_data, write_item_data

# --- Template Hierarchy Levels ---
TEMPLATE_LEVELS = {
    "week": 0,
    "day": 1,
    "routine": 2,
    "subroutine": 3,
    "microroutine": 4,
    "task": 5,
    "note": 5,
    "appointment": 5,
    "reminder": 5,
    "commitment": 5,
    "goal": 5,
    "milestone": 5,
    "project": 5,
    "plan": 5,
    "habit": 5,
    "ritual": 5,
    "journal_entry": 5,
    "dream_diary_entry": 5,
}

def is_valid_addition(child_type, parent_type):
    """Checks if a child item type can be added to a parent item type based on their hierarchy levels."""
    child_level = TEMPLATE_LEVELS.get(child_type)
    parent_level = TEMPLATE_LEVELS.get(parent_type)

    if child_level is None:
        print(f"Warning: Unknown child type '{child_type}'. Cannot add.")
        return False
    if parent_level is None:
        print(f"Warning: Unknown parent type '{parent_type}'. Cannot add.")
        return False

    # A child can be added to a parent if its level is numerically greater (i.e., 'smaller' in hierarchy)
    return child_level > parent_level

# --- Core Logic ---
def run(args, properties):
    """
    Handles the 'add' command with intelligent, context-aware search to resolve ambiguity.
    """
    if "to" not in args or len(args) < 3:
        print(get_help_message())
        return

    try:
        to_index = args.index("to")
        item_to_add_name = " ".join(args[:to_index]).lower()
        target_template_name = " ".join(args[to_index+1:]).lower()
    except ValueError:
        print(get_help_message())
        return

    possible_children = find_all_matching_items(item_to_add_name)
    possible_targets = find_all_matching_items(target_template_name)

    if not possible_children:
        print(f"❌ Item '{item_to_add_name}' not found.")
        return
    if not possible_targets:
        print(f"❌ Template '{target_template_name}' not found.")
        return

    valid_targets = []
    for target_data, target_type in possible_targets:
        for child_data, child_type in possible_children:
            if is_valid_addition(child_type, target_type):
                if (target_data, target_type) not in valid_targets:
                    valid_targets.append((target_data, target_type))

    if len(valid_targets) == 0:
        child_types = list(set([c_type for c_data, c_type in possible_children]))
        target_types = list(set([t_type for t_data, t_type in possible_targets]))
        print(f"❌ Invalid addition: No valid rule to add item(s) of type {child_types} to template(s) of type {target_types}.")
        return

    if len(valid_targets) > 1:
        ambiguous_types = [t_type for t_data, t_type in valid_targets]
        print(f"❌ Ambiguous target: Found multiple valid templates named '{target_template_name}' of types: {ambiguous_types}. Please rename one.")
        return

    target_data, target_type = valid_targets[0]
    child_data, child_type = possible_children[0] # Assuming non-ambiguous child for now

    # Use a generic 'children' list for all sub-items
    if 'children' not in target_data:
        target_data['children'] = []

    children = target_data.get('children', [])

    # Check if the item is already in the children list
    if any(c.get('name') == item_to_add_name and c.get('type') == child_type for c in children):
        print(f"✅ Item '{item_to_add_name}' of type '{child_type}' is already in the '{target_type}' named '{target_template_name}'.")
        return

    child_item_entry = {'name': item_to_add_name, 'type': child_type}

    position = properties.get('position')
    if position is not None:
        try:
            pos_index = int(position) - 1
            children.insert(pos_index, child_item_entry)
        except (ValueError, IndexError):
            print(f"❌ Invalid position '{position}'. Appending to the end.")
            children.append(child_item_entry)
    else:
        children.append(child_item_entry)

    target_data['children'] = children

    try:
        write_item_data(target_type, target_template_name, target_data)
        print(f"✅ Added '{item_to_add_name}' of type '{child_type}' to the '{target_type}' named '{target_template_name}'.")
    except Exception as e:
        print(f"❌ Failed to add '{item_to_add_name}' to '{target_template_name}': {e}")

# --- Helper Functions ---

def _depluralize(word):
    """A simple de-pluralizer for English words."""
    if not word:
        return ""
    if word.lower() == 'people':
        return 'person'
    # Handle words ending in 'ies'
    if word.endswith('ies'):
        return word[:-3] + 'y'
    # Handle words ending in 's' (general case)
    if word.endswith('s') and not word.endswith('ss'): # Avoid de-pluralizing words like 'boss'
        return word[:-1]
    return word

def find_all_matching_items(item_name):
    """
    Finds all items with a given name across all User subdirectories.
    """
    found_items = []
    user_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'User'))

    for dir_name in os.listdir(user_dir):
        if not os.path.isdir(os.path.join(user_dir, dir_name)):
            continue

        # De-pluralize and convert to snake_case to get the item_type
        singular_words = [_depluralize(word) for word in dir_name.split('_')]
        item_type = '_'.join(singular_words).lower()

        if not item_type:
            continue

        data = read_item_data(item_type, item_name)
        if data:
            true_type = data.get('type', item_type)
            found_items.append((data, true_type))

    return found_items

def get_help_message():
    """Returns the help message for the 'add' command."""
    return '''
Usage: add <item_to_add> to <target_template> [position:<number>]
Description: Adds an item to a template, intelligently resolving ambiguity.
Example: add "My Subroutine" to "My Routine" position:1
'''