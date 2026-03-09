import sys
import os
import yaml
from modules.item_manager import read_item_data, write_item_data
from modules import variables as Variables
from modules import status_utils
from modules.scheduler import status_current_path

# --- Global Variables for Scripting ---
# This dictionary stores variables set by the 'set var' command.
# In a more robust system, this would be managed by the Console or a dedicated scripting engine
GLOBAL_VARS = {}
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PROFILE_PATH = os.path.join(ROOT_DIR, "user", "profile", "profile.yml")
TIMER_SETTINGS_PATH = os.path.join(ROOT_DIR, "user", "settings", "timer_settings.yml")
TIMER_PROFILES_PATH = os.path.join(ROOT_DIR, "user", "settings", "timer_profiles.yml")

def _sync_status_var_to_yaml(var_name: str, var_value: str):
    """
    Persist `status_*` variable assignments to current_status.yml and keep
    runtime mirrored vars in sync.
    """
    raw_name = str(var_name or "").strip()
    if not raw_name.lower().startswith("status_"):
        return None, None

    indicator = status_utils.status_slug(raw_name[len("status_"):])
    if not indicator:
        return "Invalid status variable name.", None
    normalized_value, err = status_utils.canonicalize_status_value(indicator, var_value)
    if err:
        return err, None

    path = status_current_path()
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                current = yaml.safe_load(f) or {}
        else:
            current = {}
        if not isinstance(current, dict):
            current = {}
    except Exception:
        current = {}

    current[indicator] = normalized_value
    try:
        with open(path, "w", encoding="utf-8") as f:
            yaml.dump(current, f, default_flow_style=False)
    except Exception as e:
        return f"Failed to write status file: {e}", None

    try:
        Variables.sync_status_vars(current)
    except Exception:
        pass
    return None, str(normalized_value)


def _sync_nickname_var_to_profile(var_name: str, var_value: str):
    """
    Persist nickname variable assignment to profile.yml and keep runtime var
    aligned with profile source-of-truth.
    """
    raw_name = str(var_name or "").strip().lower()
    if raw_name != "nickname":
        return None, None

    nickname = str(var_value or "").strip()
    if not nickname:
        return "Nickname cannot be empty.", None

    profile = {}
    try:
        if os.path.exists(PROFILE_PATH):
            with open(PROFILE_PATH, "r", encoding="utf-8") as f:
                profile = yaml.safe_load(f) or {}
        if not isinstance(profile, dict):
            profile = {}
    except Exception:
        profile = {}

    profile["nickname"] = nickname
    try:
        os.makedirs(os.path.dirname(PROFILE_PATH), exist_ok=True)
        with open(PROFILE_PATH, "w", encoding="utf-8") as f:
            yaml.dump(profile, f, default_flow_style=False, sort_keys=False)
    except Exception as e:
        return f"Failed to write profile nickname: {e}", None

    return None, nickname


def _sync_timer_profile_var_to_settings(var_name: str, var_value: str):
    """
    Persist timer_profile variable assignment to timer_settings.yml.
    Validates profile exists in timer_profiles.yml when available.
    """
    raw_name = str(var_name or "").strip().lower()
    if raw_name != "timer_profile":
        return None, None

    profile_name = str(var_value or "").strip()
    if not profile_name:
        return "Timer profile cannot be empty.", None

    profiles = {}
    try:
        if os.path.exists(TIMER_PROFILES_PATH):
            with open(TIMER_PROFILES_PATH, "r", encoding="utf-8") as f:
                profiles = yaml.safe_load(f) or {}
        if not isinstance(profiles, dict):
            profiles = {}
    except Exception:
        profiles = {}

    if profiles and profile_name not in profiles:
        # Case-insensitive convenience for profile selection.
        lower_map = {str(k).lower(): str(k) for k in profiles.keys()}
        match = lower_map.get(profile_name.lower())
        if not match:
            return f"Unknown timer profile '{profile_name}'.", None
        profile_name = match

    settings = {}
    try:
        if os.path.exists(TIMER_SETTINGS_PATH):
            with open(TIMER_SETTINGS_PATH, "r", encoding="utf-8") as f:
                settings = yaml.safe_load(f) or {}
        if not isinstance(settings, dict):
            settings = {}
    except Exception:
        settings = {}

    settings["default_profile"] = profile_name
    try:
        os.makedirs(os.path.dirname(TIMER_SETTINGS_PATH), exist_ok=True)
        with open(TIMER_SETTINGS_PATH, "w", encoding="utf-8") as f:
            yaml.dump(settings, f, default_flow_style=False, sort_keys=False)
    except Exception as e:
        return f"Failed to write timer settings: {e}", None

    return None, profile_name


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

    # --- Handle 'set reminder|alarm from ...' alias ---
    if first_arg in {"reminder", "alarm"} and len(args) > 1 and args[1].lower() == "from":
        try:
            if first_arg == "reminder":
                from commands import reminder as _reminder
                _reminder.run(args[1:], properties)
            else:
                from commands import alarm as _alarm
                _alarm.run(args[1:], properties)
        except Exception as e:
            print(f"? Failed to run {first_arg} from: {e}")
        return

    # --- Handle 'set var' sub-command ---
    if first_arg == "var":
        if len(args) < 2:
            print("Usage: set var <variable_name>:<value>")
            return

        var_assignment = args[1]
        if ':' in var_assignment:
            raw_var_name, var_value = var_assignment.split(':', 1)
            var_name = Variables.canonical_var_name(raw_var_name)
            err, normalized_status_value = _sync_status_var_to_yaml(var_name, var_value)
            if err:
                print(f"❌ {err}")
                return
            normalized_nickname_value = None
            normalized_timer_profile_value = None
            if normalized_status_value is None:
                nick_err, normalized_nickname_value = _sync_nickname_var_to_profile(var_name, var_value)
                if nick_err:
                    print(f"❌ {nick_err}")
                    return
            if normalized_status_value is None and normalized_nickname_value is None:
                timer_err, normalized_timer_profile_value = _sync_timer_profile_var_to_settings(var_name, var_value)
                if timer_err:
                    print(f"❌ {timer_err}")
                    return
            final_value = (
                normalized_status_value
                if normalized_status_value is not None
                else normalized_nickname_value
                if normalized_nickname_value is not None
                else normalized_timer_profile_value
                if normalized_timer_profile_value is not None
                else var_value
            )
            Variables.set_var(var_name, final_value)
            if str(raw_var_name).strip() != str(var_name).strip():
                print(f"✅. Variable '{raw_var_name}' (alias of '{var_name}') set to '{final_value}'.")
            else:
                print(f"✅. Variable '{var_name}' set to '{final_value}'.")
            if str(var_name).strip().lower().startswith("status_"):
                print("↳ Synced to current_status.yml")
            elif str(var_name).strip().lower() == "nickname":
                print("↳ Synced to profile.yml")
            elif str(var_name).strip().lower() == "timer_profile":
                print("↳ Synced to timer_settings.yml")
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

        prev_status = str(data.get('status') or '').lower()
        # Persist remaining property updates
        data.update(item_properties_to_set)
        new_status = str(data.get('status') or '').lower()
        if new_status == 'completed' and prev_status != 'completed' and not data.get('points_awarded'):
            try:
                from utilities import points as Points
                Points.award_on_complete('goal', item_name, minutes=None)
                data['points_awarded'] = True
            except Exception:
                pass
        write_item_data(item_type, item_name, data)
        print(f"✅. Properties of {item_type} '{item_name}' updated.")

        if do_apply:
            _apply_goal_template(item_name)
            # Evaluate milestones immediately (best-effort)
            try:
                from modules.milestone import main as MilestoneModule  # type: ignore
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
Example: set var status_energy:high   # updates var and current_status.yml
Example: set var location:home        # alias of status_place; updates current_status.yml
Example: set var nickname:Alice       # updates var and user/profile/profile.yml
Example: set var timer_profile:classic_pomodoro  # updates var and user/settings/timer_settings.yml

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


