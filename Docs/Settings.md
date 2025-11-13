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

## Common Files

- Points — `points_settings.yml`
  - Example:
    ```yaml
    earn:
      task: 10
      routine: 5
      subroutine: 4
      microroutine: 2
      habit: 5
    ```
  - Used by `Utilities/points.py`. Older `Points.yml` is still read if present.

- Defaults — `<item>_defaults.yml`
  - Applied when running `new <type> <name>`.
  - Example (`task_defaults.yml`):
    ```yaml
    default_priority: medium
    default_status: pending
    ```

- Timer — `Timer_Settings.yml` and profiles under `User/Settings/Timer_Profiles.yml`
  - Queried by the dashboard via `/api/timer/settings` and Timer module.

- Theme — `theme_settings.yml` and `User/profile.yml`
  - Console reads profile/theme to set colors and greetings.

## Safety Tips

- Keep YAML valid: use the Settings widget or lint in your editor.
- When renaming files to lowercase, confirm corresponding modules or scripts don’t hardcode the old names (most core modules resolve both).

