# Settings Guide

Chronos settings live under `User/Settings/`. They configure defaults, points, timer, themes, and more.

## Naming Conventions

- Prefer lowercase filenames:
  - `points_settings.yml`
  - `achievement_defaults.yml`
  - `<item>_defaults.yml` (e.g., `task_defaults.yml`, `routine_defaults.yml`)
- TitleCase files are still supported for backward compatibility (e.g., `Timer_Settings.yml`).

## Editing Settings

- In the dashboard, open the Settings widget.
  - Pick a file, edit YAML, click Save. The server validates YAML and writes your original text, preserving comments.
- Or edit files directly on disk.

## Configuration Reference

### 1. Scheduler Defaults (`User/Settings/*_defaults.yml`)
Each item type has a corresponding defaults file. These properties are applied when you run `new <type>`.
- **Common keys**: `priority`, `category`, `duration`, `cost` (energy/focus).
- **Files**: `task_defaults.yml`, `goal_defaults.yml`, `routine_defaults.yml`, etc.
  - Optional item fields like `deadline` are supported but not set by default.

### 2. Scoring & Priorities
- **`scheduling_priorities.yml`**: Defines the weighted formula `Today.py` uses to score tasks.
  - Controls how much `Due Date`, `Priority`, `Category`, and `Status Alignment` contribute to the importance score.
- **`priority_settings.yml`**: Defines values for `high`, `medium`, `low` (e.g., High = 100 points).
- **`category_settings.yml`**: Defines your life categories (Work, Health, Deep Work) and their base weight.

### 3. Status System (`User/Settings/status_settings.yml`)
Defines the dimensions of your human state (Energy, Focus, Mood). 
- **Sub-files**: `<dimension>_settings.yml` (e.g., `energy_settings.yml`) define the valid levels (Low, Medium, High) and their impact on scheduling.
- **Impact**: If `Energy` is `Low`, the scheduler penalizes high-energy tasks.

### 4. Interface & Themes
- **`theme_settings.yml`**: Controls CLI colors and prompts.
- **`User/Profile/preferences_settings.yml`**: Controls Agent/System verbosity and behavior.
- **`User/Profile/profile.yml`**: The "User Object" (Nickname, preferences).

### 5. Economy & Gamification
- **`points_settings.yml`**: How many points each item type yields.
- **`level_settings.yml`**: XP curves for leveling up.


## Safety Tips

- Keep YAML valid: use the Settings widget or lint in your editor.
- When renaming files to lowercase, confirm corresponding modules or scripts don’t hardcode the old names (most core modules resolve both).
