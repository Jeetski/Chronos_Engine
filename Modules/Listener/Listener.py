import sys
import os
import time
from datetime import datetime, timedelta
import yaml
import pygame.mixer # ADDED
import subprocess

# Determine the root directory of the Chronos Engine project
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# Add ROOT_DIR to sys.path to allow absolute imports from project root
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

# Import the Alarm module functions
from Modules.Alarm.main import load_alarms, check_alarms, trigger_alarm, update_alarm_yaml
# Import the Reminder module functions
from Modules.Reminder.main import load_reminders, check_reminders, trigger_reminder
from Modules.Timer import main as Timer

# --- Constants ---
LISTENER_LOG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'User', 'Logs', 'listener.log'))

def log_message(message):
    """
    Lightweight logger: print to console only. Do not write to disk to
    avoid unbounded log growth for long‑running background processes.
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}"
    print(log_entry)


def _quote_arg(s: str) -> str:
    try:
        # Simple Windows-safe quoting for item names with spaces
        return f'"{str(s)}"'
    except Exception:
        return f'"{s}"'


def _run_cli_command(args_str: str):
    """
    Invoke the Chronos Console launcher with a one-line command string.
    Keeps quoting simple and consistent with existing script execution.
    """
    try:
        batch_path = os.path.join(ROOT_DIR, 'console_launcher.bat')
        if not os.path.exists(batch_path):
            # Fallback to capitalized name used historically
            batch_path = os.path.join(ROOT_DIR, 'Console_Launcher.bat')
        command = f'"{batch_path}" {args_str}'
        subprocess.Popen(command, shell=True)
    except Exception as e:
        log_message(f"Warning: failed to run CLI command '{args_str}': {e}")


def _execute_target_action(entity: dict):
    """
    Execute a linked target action when an alarm/reminder triggers.
    Expected schema on the entity (alarm/reminder) YAML:
      target:
        type: <item_type>
        name: <item_name>
        action: complete | open | set_status
        status: <value>              # required if action == set_status
        properties: {k:v, ...}       # optional extra properties passed as key:value
    """
    try:
        target = entity.get('target')
        if not isinstance(target, dict):
            return

        item_type = target.get('type')
        item_name = target.get('name')
        action = (target.get('action') or 'complete').lower()
        extra_props = target.get('properties') if isinstance(target.get('properties'), dict) else {}

        if not item_type or not item_name:
            log_message("DEBUG: target specified but missing 'type' or 'name'. Skipping target action.")
            return

        # Build CLI arguments
        args_str = None
        if action == 'complete':
            # e.g., complete task "Deep Work" minutes:50
            prop_parts = [f"{k}:{v}" for k, v in extra_props.items()]
            args_str = f"complete {item_type} {_quote_arg(item_name)}" + (" " + " ".join(prop_parts) if prop_parts else "")
        elif action == 'open':
            # e.g., edit task "Deep Work"
            prop_parts = [f"{k}:{v}" for k, v in extra_props.items()]
            args_str = f"edit {item_type} {_quote_arg(item_name)}" + (" " + " ".join(prop_parts) if prop_parts else "")
        elif action == 'set_status':
            status_val = target.get('status')
            if not status_val:
                log_message("DEBUG: target.action 'set_status' missing 'status' value. Skipping.")
                return
            # e.g., set task "Deep Work" status:completed
            prop_parts = [f"{k}:{v}" for k, v in extra_props.items()]
            args_str = f"set {item_type} {_quote_arg(item_name)} status:{status_val}" + (" " + " ".join(prop_parts) if prop_parts else "")
        else:
            log_message(f"DEBUG: Unknown target.action '{action}'. Skipping.")
            return

        if args_str:
            log_message(f"DEBUG: Executing target action via CLI: {args_str}")
            _run_cli_command(args_str)
    except Exception as e:
        log_message(f"Warning: Exception while executing target action: {e}")

def reset_alarm_status(alarm_data, filepath):
    """
    Removes the 'status' and 'status_reset_datetime' properties from an alarm's YAML file.
    """
    if 'status' in alarm_data:
        del alarm_data['status']
    if 'status_reset_datetime' in alarm_data:
        del alarm_data['status_reset_datetime']
    update_alarm_yaml(filepath, alarm_data)
    log_message(f"Alarm '{alarm_data.get('name')}' status reset.")

def run_listener():
    """
    Main function to run the background listener for alarms and reminders.
    """
    log_message("Chronos Listener started.")
    print("Chronos Listener running in background. Close this window to stop.")

    # Load alarms and reminders once before the loop
    log_message("DEBUG: Initial loading of alarms and reminders.")
    loaded_alarms_with_paths = load_alarms()
    log_message(f"DEBUG: Loaded {len(loaded_alarms_with_paths)} alarms.")
    loaded_reminders_with_paths = load_reminders()
    log_message(f"DEBUG: Loaded {len(loaded_reminders_with_paths)} reminders.")

    while True:
        current_time = datetime.now()
        
        # --- Process Alarms ---
        
        active_alarms_for_check = []
        for alarm_data, filepath in loaded_alarms_with_paths:
            alarm_name = alarm_data.get('name')
            
            # Check for status reset
            status_reset_datetime_str = alarm_data.get('status_reset_datetime')
            if status_reset_datetime_str:
                try:
                    status_reset_datetime = datetime.strptime(status_reset_datetime_str, '%Y-%m-%d %H:%M:%S')
                    if current_time >= status_reset_datetime:
                        log_message(f"Alarm '{alarm_name}' status_reset_datetime passed. Resetting status.")
                        reset_alarm_status(alarm_data, filepath)
                        if 'status' in alarm_data: del alarm_data['status']
                        if 'status_reset_datetime' in alarm_data: del alarm_data['status_reset_datetime']
                    else:
                        log_message(f"DEBUG: Alarm '{alarm_name}' is suppressed until {status_reset_datetime.strftime('%H:%M:%S')}.")
                        continue # Status is still active, so don't add to active_alarms_for_check yet
                except ValueError:
                    log_message(f"❌ Invalid status_reset_datetime format for alarm '{alarm_name}'. Skipping status check.")
            
            if alarm_data.get('enabled', False):
                active_alarms_for_check.append((alarm_data, filepath))
            else:
                log_message(f"DEBUG: Alarm '{alarm_name}' is disabled.")

        log_message(f"DEBUG: Checking {len(active_alarms_for_check)} active alarms.")
        triggered_alarms = check_alarms(active_alarms_for_check, current_time)
        log_message(f"DEBUG: Found {len(triggered_alarms)} triggered alarms.")

        for alarm, filepath in triggered_alarms:
            alarm_name = alarm.get('name')
            log_message(f"Alarm triggered: {alarm_name}")
            
            # Trigger alarm (plays sound, shows message, and updates status)
            trigger_alarm(alarm, filepath)

            # Check for and execute an associated script
            if 'script' in alarm and alarm['script']:
                script_path = os.path.join(ROOT_DIR, alarm['script'])
                if os.path.exists(script_path):
                    log_message(f"Executing script for alarm '{alarm_name}': {script_path}")
                    # Use the existing CLI runner to execute the script path
                    try:
                        _run_cli_command(_quote_arg(script_path))
                    except Exception as e:
                        log_message(f"Warning: failed to execute script for alarm '{alarm_name}': {e}")
                else:
                    log_message(f"Script not found for alarm '{alarm_name}': {script_path}")

            # Execute linked target action if present
            _execute_target_action(alarm)

        # --- Process Alarms for Status Changes (Snooze/Dismiss from CLI) ---
        # This loop checks if any alarm's status has been updated by a CLI command
        # and stops the sound if it's playing.
        for alarm_data, filepath in loaded_alarms_with_paths:
            if alarm_data.get('status') == 'ringing':
                # Re-read the file to get the latest status
                with open(filepath, 'r') as f:
                    latest_alarm_data = yaml.safe_load(f)
                if latest_alarm_data.get('status') in ['snoozed', 'dismissed']:
                    if pygame.mixer.Channel(0).get_busy():
                        pygame.mixer.Channel(0).stop()
                        log_message(f"DEBUG: Alarm '{alarm_data.get('name')}' status changed to '{latest_alarm_data.get('status')}'. Stopping sound.")
                        # Update the in-memory representation of the alarm
                        alarm_data['status'] = latest_alarm_data.get('status')



        
        # Filter for enabled reminders (no status management needed for reminders)
        active_reminders_for_check = [(r_data, r_path) for r_data, r_path in loaded_reminders_with_paths if r_data.get('enabled', False)]
        log_message(f"DEBUG: Checking {len(active_reminders_for_check)} active reminders.")

        triggered_reminders = check_reminders(active_reminders_for_check, current_time)
        log_message(f"DEBUG: Found {len(triggered_reminders)} triggered reminders.")

        for reminder, filepath in triggered_reminders:
            log_message(f"Reminder triggered: {reminder.get('name')}")
            trigger_reminder(reminder, filepath)

            # Check for and execute an associated script
            if 'script' in reminder and reminder['script']:
                script_path = os.path.join(ROOT_DIR, reminder['script'])
                if os.path.exists(script_path):
                    log_message(f"Executing script for reminder '{reminder.get('name')}': {script_path}")
                    try:
                        _run_cli_command(_quote_arg(script_path))
                    except Exception as e:
                        log_message(f"Warning: failed to execute script for reminder '{reminder.get('name')}': {e}")
                else:
                    log_message(f"Script not found for reminder '{reminder.get('name')}': {script_path}")

            # Execute linked target action if present
            _execute_target_action(reminder)

        # --- Process Reminders for Status Changes (Snooze/Dismiss from CLI) ---
        for reminder_data, filepath in loaded_reminders_with_paths:
            if reminder_data.get('status') == 'ringing':
                with open(filepath, 'r') as f:
                    latest_reminder_data = yaml.safe_load(f)
                if latest_reminder_data.get('status') in ['snoozed', 'dismissed']:
                    if pygame.mixer.Channel(1).get_busy():
                        pygame.mixer.Channel(1).stop()
                        log_message(f"DEBUG: Reminder '{reminder_data.get('name')}' status changed to '{latest_reminder_data.get('status')}'. Stopping sound.")
                        reminder_data['status'] = latest_reminder_data.get('status')


        # Tick Timer Manager (pomodoro/interval timers)
        try:
            Timer.tick()
        except Exception:
            pass

        time.sleep(1) # Check every second

if __name__ == '__main__':
    run_listener()
