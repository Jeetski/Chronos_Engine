import sys
from Modules.ItemManager import read_item_data, write_item_data
from Modules import Variables

# --- Global Variables for Scripting ---
# This dictionary stores variables set by the 'set var' command.
# In a more robust system, this would be managed by the Console or a dedicated scripting engine
GLOBAL_VARS = {}


def run(args, properties):
    """
    Handles the 'set' command, which can either set properties of an item
    or define a global script variable.
    """
    # Validate command arguments
    if len(args) < 1:
        print(get_help_message())
        return

    first_arg = args[0].lower()

    # --- Handle 'set var' sub-command ---
    if first_arg == "var":
        if len(args) < 2:
            print("Usage: set var <variable_name>:<value>")
            return

        var_assignment = args[1]
        if ':' in var_assignment:
            var_name, var_value = var_assignment.split(':', 1)
            Variables.set_var(var_name, var_value)
            print(f"✅. Variable '{var_name}' set to '{var_value}'.")
        else:
            print(f"❌ Invalid variable assignment: {var_assignment}. Expected format: <variable_name>:<value>")
        return

    # --- Handle 'set <item_type>' command ---
    # Validate arguments for item property setting
    if len(args) < 2:  # Need at least item_type and item_name
        print("Usage: set <item_type> <item_name> <property_key>:<value> [...]")
        return

    # Extract item type and name, handling pluralization
    item_type_raw = first_arg
    if item_type_raw.endswith('s'):
        item_type = item_type_raw[:-1]
    else:
        item_type = item_type_raw
    # Collect multi-word item name until a property token (key:value) or flag appears
    name_parts = []
    for part in args[1:]:
        if (':' in part and part.count(':') >= 1) or part.startswith('--'):
            break
        name_parts.append(part)
    item_name = ' '.join(name_parts) if name_parts else args[1]

    # The properties to set are already in the 'properties' dictionary
    item_properties_to_set = dict(properties) if properties else {}

    # Ensure there are properties to set
    if not item_properties_to_set:
        print("❌ No properties specified to set.")
        return

    # Read item data
    data = read_item_data(item_type, item_name)
    if not data:
        print(f"❌ {item_type.capitalize()} '{item_name}' does not exist.")
        return

    # Goal-specific actions: template and apply
    if item_type == 'goal':
        # Handle template flag (do not persist raw 'template' key)
        if item_properties_to_set.get('template') is True:
            data['is_template'] = True
            item_properties_to_set.pop('template', None)

        # Handle apply:true to instantiate milestones
        do_apply = bool(item_properties_to_set.get('apply') is True)
        if 'apply' in item_properties_to_set:
            item_properties_to_set.pop('apply', None)

        # Persist remaining property updates
        data.update(item_properties_to_set)
        write_item_data(item_type, item_name, data)
        print(f"✅. Properties of {item_type} '{item_name}' updated.")

        if do_apply:
            _apply_goal_template(item_name)
            # Evaluate milestones immediately (best-effort)
            try:
                from Modules.Milestone import main as MilestoneModule  # type: ignore
                MilestoneModule.evaluate_and_update_milestones()
            except Exception:
                pass
        return

    if item_type == 'project':
        if item_properties_to_set.get('template') is True:
            data['is_template'] = True
            item_properties_to_set.pop('template', None)

        do_apply = bool(item_properties_to_set.get('apply') is True)
        if 'apply' in item_properties_to_set:
            item_properties_to_set.pop('apply', None)

        data.update(item_properties_to_set)
        write_item_data(item_type, item_name, data)
        print(f"ƒo.. Properties of {item_type} '{item_name}' updated.")

        if do_apply:
            _apply_project_template(item_name)
        return

    # Default path for other item types
    data.update(item_properties_to_set)
    write_item_data(item_type, item_name, data)
    print(f"✅. Properties of {item_type} '{item_name}' updated.")


def get_help_message():
    return """
Usage: set <item_type> <item_name> <property_key>:<value> [...]
       set var <variable_name>:<value>
Description: Sets properties of an item or defines a script variable.
Example: set note MyMeetingNotes priority:high category:work
Example: set var my_variable:some_value

Special (goals):
  set goal "<name>" template:true      # mark goal as a template
  set goal "<name>" apply:true         # instantiate milestones from template

Special (projects):
  set project "<name>" template:true   # treat project file as template
  set project "<name>" apply:true      # instantiate linked items/milestones
"""


# --- Helpers for Goals ---
def _apply_goal_template(goal_name: str):
    data = read_item_data('goal', goal_name)
    if not data:
        print(f"❌ Goal '{goal_name}' not found.")
        return
    milestones = data.get('milestones') or []
    if not isinstance(milestones, list) or not milestones:
        print(f"❌ Goal '{goal_name}' has no milestones to apply.")
        return

    created_count = 0
    for idx, m in enumerate(milestones):
        if not isinstance(m, dict):
            continue
        m_name = m.get('name') or f"{goal_name} Milestone {idx+1}"
        # Avoid overwrite: read if exists
        existing = read_item_data('milestone', m_name)
        if existing and existing.get('goal') == goal_name:
            continue
        if existing and existing.get('goal') != goal_name:
            m_name = f"{m_name} ({goal_name})"
        inst = {
            'name': m_name,
            'type': 'milestone',
            'goal': goal_name,
            'from_template_id': m.get('id') or idx,
            'criteria': m.get('criteria') or {},
            'links': m.get('links') or [],
            'weight': m.get('weight') or 1,
            'status': 'pending',
            'progress': {'current': 0, 'target': 0, 'percent': 0},
            'on_complete': m.get('on_complete') or [],
        }
        # Add timestamp for traceability
        try:
            from datetime import datetime
            inst['created'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        except Exception:
            pass
        write_item_data('milestone', m_name, inst)
        created_count += 1

    print(f"✅. Applied goal template '{goal_name}': created {created_count} milestone(s).")



def _apply_project_template(project_name: str):
    data = read_item_data('project', project_name)
    if not data:
        print(f"??O Project '{project_name}' not found.")
        return
    nodes = data.get('children') or []
    if not isinstance(nodes, list) or not nodes:
        print(f"??O Project '{project_name}' has no template children.")
        return

    stats = {'created': 0, 'linked': 0, 'warnings': 0}

    def _tag_item(existing: dict | None, item_type: str, item_name: str, node: dict):
        payload = existing.copy() if isinstance(existing, dict) else {}
        payload.setdefault('name', item_name)
        payload.setdefault('type', item_type)
        payload['project'] = project_name
        notes = node.get('notes')
        if notes:
            payload.setdefault('description', notes)
        if item_type == 'milestone':
            payload.setdefault('status', 'pending')
            payload.setdefault('progress', {'current': 0, 'target': 0, 'percent': 0})
            if node.get('stage'):
                payload['stage'] = node.get('stage')
            if node.get('due'):
                payload['due_date'] = node.get('due')
        write_item_data(item_type, item_name, payload)

    def _create_item(item_type: str, item_name: str, node: dict):
        payload = {
            'name': item_name,
            'type': item_type,
            'project': project_name,
        }
        if node.get('notes'):
            payload['description'] = node.get('notes')
        if item_type == 'task':
            payload.setdefault('status', 'pending')
        if item_type == 'milestone':
            payload.setdefault('status', 'pending')
            payload.setdefault('progress', {'current': 0, 'target': 0, 'percent': 0})
            if node.get('stage'):
                payload['stage'] = node.get('stage')
            if node.get('due'):
                payload['due_date'] = node.get('due')
        write_item_data(item_type, item_name, payload)
        stats['created'] += 1

    def _ensure_node(node: dict):
        item_type = str(node.get('type') or '').strip().lower()
        item_name = str(node.get('name') or '').strip()
        if not item_type or not item_name:
            return
        existing = read_item_data(item_type, item_name)
        link_existing = bool(node.get('link_existing'))
        if link_existing:
            if not existing:
                print(f"??O Cannot link '{item_name}' ({item_type}): item not found.")
                stats['warnings'] += 1
                return
            _tag_item(existing, item_type, item_name, node)
            stats['linked'] += 1
        else:
            if existing:
                _tag_item(existing, item_type, item_name, node)
                stats['linked'] += 1
            else:
                _create_item(item_type, item_name, node)

        for child in node.get('children') or []:
            if isinstance(child, dict):
                _ensure_node(child)

    for child in nodes:
        if isinstance(child, dict):
            _ensure_node(child)

    print(f"?.. Applied project template '{project_name}': created {stats['created']} item(s), linked {stats['linked']} existing.")
