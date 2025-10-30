import os
import yaml
from datetime import datetime, timedelta # Added timedelta for consistency, though not used yet
import time # Added time for consistency
import pygame.mixer # Added for sound
import tkinter as tk
from tkinter import messagebox

# --- Constants ---
REMINDERS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'User', 'Reminders'))
REMINDER_SOUNDS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'Sounds'))

# Initialize pygame mixer (only once)
try:
    pygame.mixer.init()
except Exception as e:
    print(f"❌ Could not initialize pygame mixer for reminders: {e}")

# --- Core Reminder Functions ---

def load_reminders():
    """
    Loads all reminder configurations from the User/Reminders directory.
    Returns a list of tuples: (reminder_data, filepath).
    """
    if not os.path.exists(REMINDERS_DIR):
        os.makedirs(REMINDERS_DIR)
        return []

    reminders = []
    for filename in os.listdir(REMINDERS_DIR):
        if filename.endswith('.yml') or filename.endswith('.yaml'):
            filepath = os.path.join(REMINDERS_DIR, filename)
            with open(filepath, 'r') as f:
                try:
                    reminder_data = yaml.safe_load(f)
                    reminders.append((reminder_data, filepath))
                except yaml.YAMLError as e:
                    print(f"❌ Error loading reminder file {filename}: {e}")
    return reminders

def check_reminders(reminders_with_paths, current_time):
    """
    Checks if any reminders should be triggered at the current time.
    Accepts a list of tuples (reminder_data, filepath).
    Returns a list of tuples (triggered_reminder_data, triggered_reminder_filepath).
    """
    triggered_reminders = []
    day_of_week = current_time.strftime('%A')

    for reminder, filepath in reminders_with_paths:
        # Check if reminder has been handled
        current_status = reminder.get('status')
        if current_status in ['ringing', 'snoozed', 'dismissed']:
            continue

        # Check if reminder is already ringing
        if reminder.get('status') == 'ringing':
            continue

        reminder_time_str = reminder.get('time')
        if not reminder_time_str:
            continue

        try:
            reminder_time = datetime.strptime(reminder_time_str, '%H:%M').time()
        except ValueError:
            print(f"❌ Invalid time format for reminder '{reminder.get('name')}'. Use HH:MM.")
            continue

        # Check recurrence
        recurrence = reminder.get('recurrence', [])
        is_today = False
        if 'daily' in recurrence or day_of_week in recurrence:
            is_today = True

        if is_today and current_time.hour == reminder_time.hour and current_time.minute == reminder_time.minute:
            triggered_reminders.append((reminder, filepath))

    return triggered_reminders

def trigger_reminder(reminder, filepath):
    """
    Handles the logic for a triggered reminder: displays its name and label, plays sound, and updates status.
    """
    reminder['status'] = 'ringing'
    update_reminder_yaml(filepath, reminder)

    reminder_name = reminder.get('name', 'Unnamed Reminder')
    reminder_label = reminder.get('label', 'Reminder triggered!')

    # Play sound on a dedicated channel
    try:
        reminder_sound_filename = reminder.get('sound')
        if not reminder_sound_filename:
            settings_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'User', 'Settings'))
            reminder_defaults_path = os.path.join(settings_dir, "Reminder_Defaults.yml")
            if os.path.exists(reminder_defaults_path):
                with open(reminder_defaults_path, 'r') as f:
                    defaults = yaml.safe_load(f)
                    reminder_sound_filename = defaults.get('default_sound')

        if reminder_sound_filename:
            full_sound_path = os.path.join(REMINDER_SOUNDS_DIR, reminder_sound_filename)
            if os.path.exists(full_sound_path):
                reminder_sound = pygame.mixer.Sound(full_sound_path)
                channel = pygame.mixer.Channel(1) # Use channel 1 for reminders
                if not channel.get_busy():
                    channel.play(reminder_sound, loops=-1)
            else:
                print(f"   (Reminder sound file not found at {full_sound_path})")
        else:
            print("   (No sound specified for reminder and no default found)")
    except Exception as e:
        print(f"   Could not play sound: {e}")

    # Display message using a pop-up window
    root = tk.Tk()
    root.withdraw() # Hide the main window
    messagebox.showinfo(f"🔔 Chronos Reminder: {reminder_name} 🔔", reminder_label)
    root.destroy() # Destroy the Tkinter window after message is shown

def update_reminder_yaml(filepath, reminder_data):
    """
    Writes the given reminder data back to its YAML file.
    """
    with open(filepath, 'w') as f:
        yaml.dump(reminder_data, f, default_flow_style=False, sort_keys=False)