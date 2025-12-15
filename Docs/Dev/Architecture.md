# Chronos Architecture

This guide explains how Chronos fits together so you can extend it confidently.

## Runtime Overview

- CLI Entrypoint — `Modules/Console.py`
  - Adds project paths, sets UTF-8, and loads `Commands/*.py` dynamically.
  - Parses interactive input, CLI args, and `.chs` scripts (supports nested `if/elseif/else/end`).
  - Uses `Modules/Variables.py` for in-memory variables and token expansion (e.g., `@nickname`).
  - Macro hooks: command execution is wrapped with BEFORE/AFTER hooks via `Modules/MacroEngine.py` (enabled by `User/Scripts/Macros/macros.yml`). Dashboard calls also pass through these hooks.

- Item System — `Modules/ItemManager.py`
  - Computes item directories from types (lowercase_underscored_plural) under `User/`.
  - Reads/writes YAML items. Generic handlers for `new`, `append`, `delete`.
  - Default templates resolved from `User/Settings/<item>_defaults.yml` (lowercase preferred) with fallbacks.

- Conditions — `Modules/Conditions.py`
  - Token-based evaluator: parentheses, `and/or/xor/nor`, `exists`, `matches`, numeric and string compares.
  - `exists` supports `file:`, `dir:/folder:`, `env:`, and item existence/properties.

- Scheduler — `Modules/Scheduler.py` + `Commands/Today.py`
  - Builds a day schedule from templates, resolves conflicts, applies buffers.
  - `trim`, `change`, `cut`, `mark` modify current plan; reschedule reconciles edits.

- Listener — `Modules/Listener/Listener.py`
  - Monitors time for alarms/reminders, triggers sounds (pygame.mixer), handles timer ticks.
  - Can execute scripts and target actions (e.g., complete task on trigger).

- Dashboard — `Utilities/Dashboard`
  - Server (`server.py`) serves assets and JSON/YAML APIs (ThreadingHTTPServer over plain HTTP).
  - UI is plain ES modules + a small loader (`core/runtime.js`) to mount views (`Calendar`, `TemplateBuilder`, `Cockpit`) and widgets (Today, Item Manager, Variables, Terminal, Habit Tracker, Goal Tracker, Commitments, Rewards, Achievements, Milestones, Notes, Journal, Profile, Review, Timer, Settings, Clock, Status, Debug).
  - Widgets mount via attributes, e.g., `data-widget="Notes"`, and export `mount(el, context)`. Cockpit panels register via `window.__cockpitPanelRegister` and render inside the drag-and-drop canvas.

## Dashboard Architecture

- Server (`Utilities/Dashboard/server.py`)
  - Based on `ThreadingHTTPServer` + `SimpleHTTPRequestHandler`, serving from `Utilities/Dashboard/`.
  - Endpoints (selected):
    - Health: `GET /health`.
    - Today: `GET /api/today`, `POST /api/today/reschedule`.
    - CLI bridge: `POST /api/cli` — invokes the console pipeline in-process (falls back to subprocess if needed).
    - Profile & Theme: `GET /api/profile`, `GET /api/theme?name=...`.
    - Variables: `GET/POST /api/vars`, `POST /api/vars/expand`.
    - Items: `GET /api/items`, `GET /api/item`, `POST /api/item`, `POST /api/item/copy|rename|delete`, bulk `POST /api/items/delete|setprop|copy|export`, `POST /api/open-in-editor`.
    - Template Builder: `GET /api/template/list`, `GET /api/template`, `POST /api/template`.
    - Habits & Goals: `GET /api/habits`, `GET /api/goals`, `GET /api/goal?name=...`.
    - Commitments & Milestones: `GET /api/commitments`, `GET /api/milestones`, `POST /api/milestone/update`.
    - Rewards & Points: `GET /api/points`, `GET /api/rewards`, `POST /api/reward/redeem`.
    - Achievements: `GET /api/achievements`, `POST /api/achievement/update`.
    - Timer: `GET /api/timer/status|profiles|settings`, `POST /api/timer/start|pause|resume|stop`.
    - Settings: `GET /api/settings`, `GET /api/settings?file=Name.yml`, `POST /api/settings?file=Name.yml` (raw YAML preserved).
  - Security: permissive CORS for local dev; do not expose publicly without adding auth and controls.

- UI runtime (`Utilities/Dashboard/app.js` + widgets/views)
  - Views: Calendar, Template Builder, and the Cockpit canvas (panels under `Utilities/Dashboard/Panels/`).
  - Widgets: Today, Item Manager, Variables, Terminal, Habit Tracker, Goal Tracker, Commitments, Rewards, Achievements, Milestones, Notes, Journal, Profile, Review, Timer, Settings, Clock, Status, Debug Console.
  - Event bus: `mount(el, context)` receives a `context.bus` used by widgets (e.g., emit `vars:changed`, `widget:show`, `calendar:selected`).
  - Terminal: runs CLI via `/api/cli`, supports history, Ctrl+L, optional variable expansion.
  - Item Manager: search/sort/multi-select, YAML editor, copy/rename/delete; bulk delete/set property/copy/export (exports to `/temp/exports_items_*.zip`).

## Data Model

- Items are YAML files with a `name`, `type`, and optional fields.
- Hierarchy allows nested children (routines → subroutines → microroutines → items).
- Schedules store computed blocks for the current day; completions are tracked.

## Settings

- Location: `User/Settings/`
- Conventions:
  - Prefer lowercase filenames, e.g., `points_settings.yml`, `achievement_defaults.yml`, `<item>_defaults.yml`.
  - Timer files keep legacy names (e.g., `Timer_Settings.yml`) — accessible via Dashboard endpoints.
- The Settings widget and `/api/settings` simplify editing.

## Dashboard API (summary)

- CLI: `POST /api/cli` — runs commands in-process; subprocess fallback.
- Variables: `GET/POST /api/vars`, `POST /api/vars/expand`.
- Profile/Theme: `GET /api/profile`, `GET /api/theme?name=...`.
- Items: `GET /api/items`, `GET /api/item`, `POST /api/item*`, bulk ops including `export`.
- Today: `GET /api/today`, `POST /api/today/reschedule`.
- Timer: `GET /api/timer/status|profiles|settings`, `POST /api/timer/start|pause|resume|stop`.
- Settings: `GET/POST /api/settings` and `GET /api/settings?file=...`.

## Extending Chronos

- Add a command
  1. Create `Commands/MyCommand.py` with `run(args, properties)`.
  2. Add `get_help_message()` to integrate with `help`.

- Add an item module
  1. Create `Modules/My_Item/main.py` with `handle_<verb>` or `handle_command`.
  2. Reuse `ItemManager` for common behaviors (`new`, `append`, `delete`).

- Add a widget or view
  1. Create `Utilities/Dashboard/Widgets/<Name>/index.js` exporting `mount(el, context)`.
  2. Add an `<aside class="widget" data-widget="Name">` in `dashboard.html`.
  3. Add server endpoints if needed; prefer JSON responses for easy parsing.
  4. Use `context.bus` to communicate with other widgets (e.g., emit `widget:show`, `vars:changed`).

## Best Practices

- Keep modules small and composable.
- Prefer JSON over YAML for HTTP responses (clients parse easier); YAML is OK for human-readable responses.
- Validate inputs on the server; sanitize paths; avoid blocking I/O in handlers.
- For long-running or external operations, apply timeouts and consider subprocess isolation.
