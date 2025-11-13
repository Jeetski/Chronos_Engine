# Chronos Architecture

This guide explains how Chronos is put together so you can extend it confidently.

## Runtime Overview

- CLI Entrypoint — `Modules/Console.py`
  - Adds project paths, sets UTF‑8, and loads `Commands/*.py` dynamically.
  - Parses interactive input, CLI args, and `.chs` scripts (with nested `if/elseif/else/end`).
  - Uses `Modules/Variables.py` for in‑memory variables and token expansion (e.g., `@nickname`).

- Item System — `Modules/ItemManager.py`
  - Computes item directories from types (lowercase_underscored_plural) under `User/`.
  - Read/write YAML items. Generic handlers for `new`, `append`, `delete`.
  - Default templates resolved from `User/Settings/<item>_defaults.yml` (lowercase preferred), with fallbacks.

- Conditions — `Modules/Conditions.py`
  - Token‑based parser: parentheses, `and/or/xor/nor`, `exists`, `matches`, numeric and string compares.
  - `exists` supports `file:`, `dir:/folder:`, `env:`, and item existence/properties.

- Scheduler — `Modules/Scheduler.py` + `Commands/Today.py`
  - Builds a day schedule from templates, resolves conflicts, applies buffers.
  - `trim`, `change`, `cut`, `mark` modify current plan; reschedule reconciles edits.

- Listener — `Modules/Listener/Listener.py`
  - Monitors time for alarms/reminders, triggers sounds (pygame.mixer), handles timer ticks.
  - Can execute scripts and target actions (e.g., complete task on trigger).

- Dashboard — `Utilities/Dashboard`
  - Server (`server.py`) serves assets and JSON/YAML APIs.
  - UI is plain ES modules + minimal runtime (`core/runtime.js`).
  - Widgets mount via attributes, e.g., `data-widget="Notes"`.

## Data Model

- Items are YAML files with a `name` and `type` and optional fields.
- Hierarchy allows nested children (routines → subroutines → microroutines → items).
- Schedules store computed blocks for the current day; completions are tracked.

## Settings

- Location: `User/Settings/`
- Conventions:
  - Prefer lowercase filenames, e.g., `points_settings.yml`, `achievement_defaults.yml`, `<item>_defaults.yml`.
  - Timer files keep legacy names (e.g., `Timer_Settings.yml`) — see Dashboard API for read access.
- The Settings widget and `/api/settings` simplify editing.

## Dashboard API (summary)

- CLI proxy — `POST /api/cli` -> runs commands inside the process.
- Items — `GET /api/items`, `GET /api/item`, `POST /api/item*` for CRUD and bulk.
- Today — `GET /api/today`, `POST /api/today/reschedule`.
- Timer — status, profiles, settings endpoints.
- Goals/Habits — summarized views for widgets.
- Settings — `GET/POST /api/settings` for settings files.

## Extending Chronos

Add a command
1. Create `Commands/MyCommand.py` with `run(args, properties)`.
2. Add `get_help_message()` to integrate with `help`.

Add an item module
1. Create `Modules/My_Item/main.py` with `handle_<verb>` or `handle_command`.
2. Reuse `ItemManager` for common behaviors (`new`, `append`, `delete`).

Add a widget or view
1. Create `Utilities/Dashboard/Widgets/<Name>/index.js` exporting `mount(el, context)`.
2. Add an `<aside class="widget" data-widget="Name">` in `dashboard.html`.
3. Add server endpoints if needed; return JSON for ease of parsing.

Best practices
- Keep modules small and composable.
- Prefer JSON over YAML for HTTP responses (clients parse easier), YAML OK for human endpoints.
- Validate inputs on the server; sanitize paths; avoid blocking I/O in handlers.

