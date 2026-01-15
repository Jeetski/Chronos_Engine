import os
import yaml
from datetime import datetime, timedelta
from Modules.Alarm.main import update_alarm_yaml

# --- Constants ---
ALARMS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'User', 'Alarms'))

# --- Core Functions ---
def run(args, properties):
    """
    Snoozes an alarm by setting its status and status_reset_datetime.
    """
    if not args or "help" in args or "--help" in args:
        print(get_help_message())
        return

    alarm_name = " ".join(args)
    alarm_filepath = os.path.join(ALARMS_DIR, f"{alarm_name}.yml")

    if not os.path.exists(alarm_filepath):
        print(f"❌ Alarm '{alarm_name}' not found.")
        return

    with open(alarm_filepath, 'r') as f:
        alarm_data = yaml.safe_load(f)

    snooze_duration = alarm_data.get('snooze_duration', 10)
    next_trigger_time = datetime.now() + timedelta(minutes=snooze_duration)

    alarm_data['status'] = 'snoozed'
    alarm_data['status_reset_datetime'] = next_trigger_time.strftime('%Y-%m-%d %H:%M:%S')

    update_alarm_yaml(alarm_filepath, alarm_data)
    print(f"✅ Alarm '{alarm_name}' snoozed until {next_trigger_time.strftime('%H:%M')}.")

def get_help_message():
    """
    Returns the help message for the 'snooze' command.
    """
    return """
Usage: snooze <alarm_name>
Description: Snoozes a specified alarm for its configured snooze duration.
Example: snooze "Morning Alarm"
"""
