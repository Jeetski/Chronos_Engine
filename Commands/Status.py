import yaml
import os
from datetime import datetime
from Modules.Scheduler import status_current_path, status_history_path_for_date
from Modules import status_utils

def run(args, properties):
    status_file_path = status_current_path()

    if any(arg in ['--help', '-h'] for arg in args) or any(prop in ['help', 'h'] for prop in properties):
        print(get_help_message())
        return

    if not properties:
        # If no properties are provided, display current status
        try:
            if os.path.exists(status_file_path):
                with open(status_file_path, 'r') as f:
                    current_status = yaml.safe_load(f)
                    if current_status:
                        print("Current Status:")
                        for key, value in current_status.items():
                            print(f"  {key}: {value}")
                    else:
                        print("No status set yet.")
            else:
                print("No status file found. No status set yet.")
        except yaml.YAMLError as e:
            print(f"❌ Error processing YAML file: {e}")
        except Exception as e:
            print(f"❌ An unexpected error occurred: {e}")
        return

    # If properties are provided, update status
    if len(properties) != 1:
        print("❌ Usage: status <indicator>:<value>")
        print("       Example: status emotion:happy")
        return

    indicator = list(properties.keys())[0]
    value = properties[indicator]
    indicator_key = status_utils.status_slug(indicator)
    if not indicator_key:
        print("? Error: Invalid status indicator.")
        return
    normalized_value, err = status_utils.canonicalize_status_value(indicator_key, value)
    if err:
        print(f"? {err}")
        return

    try:
        # Read existing status
        if os.path.exists(status_file_path):
            with open(status_file_path, 'r') as f:
                current_status = yaml.safe_load(f)
                if current_status is None:
                    current_status = {}
        else:
            current_status = {}

        # Update status
        current_status[indicator_key] = normalized_value

        # Write updated status
        with open(status_file_path, 'w') as f:
            yaml.dump(current_status, f, default_flow_style=False)

        # Append to dated status history
        history_path = status_history_path_for_date(datetime.now())
        os.makedirs(os.path.dirname(history_path), exist_ok=True)
        history = {}
        if os.path.exists(history_path):
            try:
                with open(history_path, 'r') as f:
                    history = yaml.safe_load(f) or {}
            except Exception:
                history = {}
        if not isinstance(history, dict):
            history = {}
        entries = history.get("entries")
        if not isinstance(entries, list):
            entries = []
        entries.append({
            "at": datetime.now().strftime("%H:%M:%S"),
            "status": dict(current_status),
        })
        history["date"] = datetime.now().strftime("%Y-%m-%d")
        history["entries"] = entries
        with open(history_path, 'w') as f:
            yaml.dump(history, f, default_flow_style=False)

        print(f"✅ Status updated: {indicator_key} set to {normalized_value}")

    except FileNotFoundError:
        print(f"❌ Error: Status file not found at {status_file_path}")
    except yaml.YAMLError as e:
        print(f"❌ Error processing YAML file: {e}")
    except Exception as e:
        print(f"❌ An unexpected error occurred: {e}")

def get_help_message():
    return "Views or sets user status variables.\n\nUsage: status <indicator>:<value>\n       status (to view current status)\n\nExamples:\n  status emotion:happy\n  status energy:low"

if __name__ == '__main__':
    # This block is for testing the command directly
    # In a real scenario, args and properties would come from the CLI
    # Example: python status.py emotion:happy
    import sys
    # Simple parsing for direct testing
    test_properties = {}
    if len(sys.argv) > 1:
        parts = sys.argv[1].split(':', 1)
        if len(parts) == 2:
            test_properties[parts[0]] = parts[1]
    run([], test_properties)
