
import os
import yaml
import calendar
from datetime import datetime, timedelta
from Modules.ItemManager import get_item_path, get_user_dir

# Define the item type for this module
ITEM_TYPE = "habit"

def get_habit_settings():
    """
    Loads habit settings from User/Settings/Habit_Settings.yml.
    """
    settings_path = os.path.join(get_user_dir(), "Settings", "Habit_Settings.yml")
    if os.path.exists(settings_path):
        with open(settings_path, 'r') as f:
            return yaml.safe_load(f)
    return {}

def get_default_properties():
    """
    Returns the default properties for a new habit from the settings file.
    """
    settings = get_habit_settings()
    return settings.get("default_properties", {})

def handle_command(command, item_type, item_name, arguments, properties):
    """
    Handles habit-specific commands.
    """
    if command == "new":
        # Get default properties and merge with any provided properties
        default_properties = get_default_properties()
        final_properties = {**default_properties, **properties}
        final_properties['duration'] = final_properties.get('duration', 0) # Set default duration
        # Ensure creation_date present
        if not final_properties.get('creation_date'):
            final_properties['creation_date'] = datetime.now().strftime("%Y-%m-%d")
        # Ensure bad-habit fields exist for future tracking
        final_properties.setdefault('incident_dates', [])
        final_properties.setdefault('last_incident', None)
        final_properties.setdefault('clean_current_streak', 0)
        final_properties.setdefault('clean_longest_streak', 0)
        
        # Get the path for the new habit
        item_path = get_item_path(item_type, item_name)
        
        # Create the habit file with the final properties
        with open(item_path, 'w') as f:
            yaml.dump(final_properties, f, default_flow_style=False)
        
        print(f"Habit '{item_name}' created successfully.")

    elif command == "track":
        item_path = get_item_path(item_type, item_name)
        if not os.path.exists(item_path):
            print(f"Habit '{item_name}' not found.")
            return

        with open(item_path, 'r') as f:
            habit_data = yaml.safe_load(f)

        print(f"--- Tracking Data for Habit: {item_name} ---")
        polarity = str(habit_data.get('polarity', 'good')).lower()
        if polarity == 'bad':
            # Compute clean streak based on last_incident
            li = habit_data.get('last_incident')
            if li:
                try:
                    last_incident_dt = datetime.strptime(str(li), "%Y-%m-%d").date()
                    today_dt = datetime.now().date()
                    clean = max(0, (today_dt - last_incident_dt).days - 0)  # days since incident
                except Exception:
                    clean = int(habit_data.get('clean_current_streak', 0))
            else:
                # If never had incident, clean streak since creation date if present
                cr = habit_data.get('creation_date')
                if cr:
                    try:
                        cd = datetime.strptime(str(cr), "%Y-%m-%d").date()
                        clean = max(0, (datetime.now().date() - cd).days)
                    except Exception:
                        clean = int(habit_data.get('clean_current_streak', 0))
                else:
                    clean = int(habit_data.get('clean_current_streak', 0))
            print(f"  Polarity: bad (avoid)
  Clean Streak (days without incident): {clean}
  Longest Clean Streak: {int(habit_data.get('clean_longest_streak', 0))}")
            li_out = habit_data.get('last_incident') or 'N/A'
            print(f"  Last Incident: {li_out}")
        else:
            print(f"  Polarity: good (do)")
            print(f"  Current Streak: {habit_data.get('current_streak', 0)}")
            print(f"  Longest Streak: {habit_data.get('longest_streak', 0)}")
        
        completion_dates = habit_data.get('completion_dates', [])
        if completion_dates:
            print("\n  Completion Calendar:")
            now = datetime.now()
            year = now.year
            month = now.month
            cal = calendar.monthcalendar(year, month)
            
            print("  Mon Tue Wed Thu Fri Sat Sun")
            for week in cal:
                week_str = ""
                for day in week:
                    if day == 0:
                        week_str += "    "
                    else:
                        date_str = f"{year}-{month:02d}-{day:02d}"
                        if date_str in completion_dates:
                            # For bad habits, show incidents distinctively
                            if polarity == 'bad' and date_str in (habit_data.get('incident_dates') or []):
                                week_str += " ✖ "
                            else:
                                week_str += " ✅ "
                        else:
                            week_str += f" {day:2d} "
                print(week_str)
        else:
            print("\n  No completion history found.")

    elif command == "complete":
        item_path = get_item_path(item_type, item_name)
        if not os.path.exists(item_path):
            print(f"Habit '{item_name}' not found.")
            return

        with open(item_path, 'r') as f:
            habit_data = yaml.safe_load(f)

        today = datetime.now().strftime("%Y-%m-%d")
        last_completed = habit_data.get('last_completed')
        if last_completed == today:
            print(f"Habit '{item_name}' has already been completed today.")
            return

        # Determine polarity (good vs bad)
        polarity = str(habit_data.get('polarity', 'good')).lower()

        # Always log date in completion_dates so global systems (e.g., commitments) can see it
        completion_dates = habit_data.get('completion_dates', []) or []
        if today not in completion_dates:
            completion_dates.append(today)
        habit_data['completion_dates'] = completion_dates
        habit_data['last_completed'] = today

        if polarity == 'bad':
            # For bad habits, treat 'complete' as an incident and avoid congratulatory streaks
            incidents = habit_data.get('incident_dates', []) or []
            if today not in incidents:
                incidents.append(today)
            habit_data['incident_dates'] = incidents
            # Update clean streak metrics: the clean streak just ended today
            prev_last = habit_data.get('last_incident')
            if prev_last:
                try:
                    prev_dt = datetime.strptime(str(prev_last), "%Y-%m-%d").date()
                    today_dt = datetime.strptime(today, "%Y-%m-%d").date()
                    just_ended = max(0, (today_dt - prev_dt).days)
                    if just_ended > int(habit_data.get('clean_longest_streak', 0)):
                        habit_data['clean_longest_streak'] = just_ended
                except Exception:
                    pass
            habit_data['last_incident'] = today
            habit_data['clean_current_streak'] = 0
            # Do not update positive streaks for bad habits
        else:
            # Update positive streaks for good habits
            yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
            if last_completed == yesterday:
                habit_data['current_streak'] = int(habit_data.get('current_streak', 0)) + 1
            else:
                habit_data['current_streak'] = 1
            if int(habit_data.get('current_streak', 0)) > int(habit_data.get('longest_streak', 0)):
                habit_data['longest_streak'] = habit_data['current_streak']

        with open(item_path, 'w') as f:
            yaml.dump(habit_data, f, default_flow_style=False)

        if polarity == 'bad':
            print(f"Recorded incident for bad habit '{item_name}' today.")
        else:
            print(f"Habit '{item_name}' marked as complete for today!")
            print(f"Current streak: {habit_data.get('current_streak', 0)}")

    else:
        print(f"Unknown command for habit: {command}")
