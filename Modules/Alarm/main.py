import os
import yaml
from datetime import datetime, timedelta
import time
# Note: The 'pygame' library is required for sound playback.
# You can install it by running: pip install pygame
import pygame.mixer
import tkinter as tk
from tkinter import messagebox

# --- Constants ---
ALARMS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'User', 'Alarms'))
ALARM_SOUNDS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'Sounds'))

# Initialize pygame mixer (only once)
try:
    pygame.mixer.init()
except Exception as e:
    print(f"❌ Could not initialize pygame mixer: {e}")

# --- Core Alarm Functions ---

def load_alarms():
    """
    Loads all enabled alarm configurations from the User/Alarms directory.
    Returns a list of tuples: (alarm_data, filepath).
    """
    if not os.path.exists(ALARMS_DIR):
        os.makedirs(ALARMS_DIR)
        return []

    alarms = []
    for filename in os.listdir(ALARMS_DIR):
        if filename.endswith('.yml') or filename.endswith('.yaml'):
            filepath = os.path.join(ALARMS_DIR, filename)
            with open(filepath, 'r') as f:
                try:
                    alarm_data = yaml.safe_load(f)
                    # Always return alarm_data and filepath, let the caller filter by 'enabled'
                    # or other statuses. This allows the listener to reset statuses.
                    alarms.append((alarm_data, filepath))
                except yaml.YAMLError as e:
                    print(f"❌ Error loading alarm file {filename}: {e}")
    return alarms

def check_alarms(alarms_with_paths, current_time):
    """
    Checks if any alarms should be triggered at the current time.
    Accepts a list of tuples (alarm_data, filepath).
    Returns a list of tuples (triggered_alarm_data, triggered_alarm_filepath).
    """
    triggered_alarms = []
    day_of_week = current_time.strftime('%A')

    for alarm, filepath in alarms_with_paths:
        alarm_name = alarm.get('name') # Get name for debug
        alarm_time_str = alarm.get('time')
        if not alarm_time_str:
            print(f"DEBUG (Alarm.main): Alarm '{alarm_name}' has no time string. Skipping.")
            continue

        try:
            alarm_time = datetime.strptime(alarm_time_str, '%H:%M').time()
        except ValueError:
            print(f"❌ Invalid time format for alarm '{alarm.get('name')}'. Use HH:MM.")
            continue

        # Check if alarm is already ringing or has been handled
        current_status = alarm.get('status')
        if current_status in ['ringing', 'snoozed', 'dismissed']:
            continue

        # Check recurrence
        recurrence = alarm.get('recurrence', [])
        is_today = False
        if 'daily' in recurrence or day_of_week in recurrence:
            is_today = True
        # Add more complex recurrence logic here if needed (e.g., one-time alarms)

        # Create a datetime object for the alarm time on the current day
        alarm_datetime_today = current_time.replace(hour=alarm_time.hour, minute=alarm_time.minute, second=0, microsecond=0)

        print(f"DEBUG (Alarm.main): Checking '{alarm_name}':\n"
              f"  alarm_time_str: {alarm_time_str}\n"
              f"  alarm_time: {alarm_time}\n"
              f"  day_of_week: {day_of_week}\n"
              f"  recurrence: {recurrence}\n"
              f"  is_today: {is_today}\n"
              f"  alarm_datetime_today: {alarm_datetime_today}\n"
              f"  current_time: {current_time}\n"
              f"  Condition: {is_today and current_time >= alarm_datetime_today and current_time < (alarm_datetime_today + timedelta(minutes=1))}")

        # Check if current time is within the minute of the alarm time
        if is_today and current_time >= alarm_datetime_today and current_time < (alarm_datetime_today + timedelta(minutes=1)):
            triggered_alarms.append((alarm, filepath))

    return triggered_alarms

def trigger_alarm(alarm, filepath):
    """
    Handles the logic for a triggered alarm: plays sound, shows a message, and updates status.
    """
    alarm['status'] = 'ringing'
    update_alarm_yaml(filepath, alarm)

    alarm_name = alarm.get('name', 'Unnamed Alarm')
    alarm_message = alarm.get('message', 'Alarm triggered!')

    # Play sound on a dedicated channel
    try:
        alarm_sound_filename = alarm.get('sound')
        if not alarm_sound_filename:
            settings_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'User', 'Settings'))
            alarm_defaults_path = os.path.join(settings_dir, "Alarm_Defaults.yml")
            if os.path.exists(alarm_defaults_path):
                with open(alarm_defaults_path, 'r') as f:
                    defaults = yaml.safe_load(f)
                    alarm_sound_filename = defaults.get('default_sound')

        if alarm_sound_filename:
            full_sound_path = os.path.join(ALARM_SOUNDS_DIR, alarm_sound_filename)
            if os.path.exists(full_sound_path):
                alarm_sound = pygame.mixer.Sound(full_sound_path)
                channel = pygame.mixer.Channel(0) # Use channel 0 for alarms
                if not channel.get_busy():
                    channel.play(alarm_sound, loops=-1)
            else:
                print(f"   (Alarm sound file not found at {full_sound_path})")
        else:
            print("   (No sound specified for alarm and no default found)")
    except Exception as e:
        print(f"   Could not play sound: {e}")

    # Display message using a pop-up window
    root = tk.Tk()
    root.withdraw() # Hide the main window
    messagebox.showinfo(f"🚨 Chronos Alarm: {alarm_name} 🚨", alarm_message)
    root.destroy() # Destroy the Tkinter window after message is shown
    
    # No user interaction here; the Listener will handle status updates via commands
    return 'triggered'

def update_alarm_yaml(filepath, alarm_data):
    """
    Writes the given alarm data back to its YAML file.
    """
    with open(filepath, 'w') as f:
        yaml.dump(alarm_data, f, default_flow_style=False, sort_keys=False)

# --- Example Usage (for testing) ---
if __name__ == '__main__':
    # This part is for direct testing of the module
    print("Running alarm module test...")
    
    # Create a dummy alarm for testing
    test_alarm = {
        'name': 'Test Alarm',
        'type': 'alarm',
        'time': datetime.now().strftime('%H:%M'),
        'recurrence': ['daily'],
        'message': 'This is a test of the alarm system.',
        'snooze_duration': 1,
        'enabled': True
    }
    
    # Check if the alarm triggers
    triggered = check_alarms([test_alarm], datetime.now())
    
    if triggered:
        trigger_alarm(triggered[0])
    else:
        print("No alarms to trigger right now.")