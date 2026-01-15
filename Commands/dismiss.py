import pygame.mixer
import os
import yaml
from datetime import datetime, timedelta
from Modules.Alarm.main import update_alarm_yaml

# --- Constants ---
ALARMS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'User', 'Alarms'))

# --- Core Functions ---
def run(args, properties):
    """
    Dismisses an alarm for the remainder of the current day.
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

    end_of_day = datetime.now().replace(hour=23, minute=59, second=59)

    alarm_data['status'] = 'dismissed'
    alarm_data['status_reset_datetime'] = end_of_day.strftime('%Y-%m-%d %H:%M:%S')

    update_alarm_yaml(alarm_filepath, alarm_data)
    # Stop the alarm sound on channel 0
    pygame.mixer.Channel(0).stop()
    print(f"✅ Alarm '{alarm_name}' dismissed until end of day ({end_of_day.strftime('%H:%M')}).")

def get_help_message():
    """
    Returns the help message for the 'dismiss' command.
    """
    return """
Usage: dismiss <alarm_name>
Description: Dismisses a specified alarm for the remainder of the current day.
Example: dismiss "Morning Alarm"
"""
