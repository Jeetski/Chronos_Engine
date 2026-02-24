# Chronos Architecture

This guide explains how Chronos fits together so you can extend it confidently.

## Runtime Overview

- CLI Entrypoint — `Modules/Console.py`
  - Adds project paths, sets UTF-8, and loads `Commands/*.py` dynamically.
  - Parses interactive input, CLI args, and `.chs` scripts (supports nested `if/elseif/else/end` and loop blocks).
  - Uses `Modules/Variables.py` for in-memory variables and token expansion (e.g., `@nickname`).
  - Macro hooks: command execution is wrapped with BEFORE/AFTER hooks via `Modules/MacroEngine.py` (enabled by `User/Scripts/Macros/macros.yml`). Dashboard calls also pass through these hooks.
  - Autosuggest and autocomplete are registry-driven; see `Docs/Dev/Autosuggest.md` for the slot model and refresh workflow.

### 2. Item System (`Modules/ItemManager.py`)
Items are the atoms of Chronos. They are stored as YAML files in the `User/` directory.
- **Polymorphic**: Any item can have `tasks`, `subroutines`, `inventory_items`, or `milestones`.
- **Fractal**: Items can nest indefinitely. The `Scheduler` creates a flattened view for execution but preserves the hierarchy for planning.
- **Defaults**: Each item type has a `_defaults.yml` (e.g., `task_defaults.yml`) that defines its initial state.

### 3. The Scheduler
- **Core Logic**: `Commands/Today.py` implements the full scheduling pipeline (template selection, initial build, importance scoring, and conflict resolution). I agree, "Today" is a great name for the command that builds your day.
- **Helper Library**: `Modules/Scheduler.py` provides shared utilities (I/O, formatting, manual modification persistence) used by the command.
- **Algorithm**:
    - **Phase 1: Expansion**: Recursively reads templates and all child items.
    - **Phase 2: Ideal Layout**: Places items at their preferred times.
    - **Phase 3: Conflict Resolution**: A sophisticated constraint solver loop (Phase 3f) that resolves overlaps by shifting, trimming, or cutting based on importance.
    - **Manual Modifications**: Persists user overrides (trim/cut/change) in `User/Schedules/manual_modifications_YYYY-MM-DD.yml`.

### 4. Conditions Engine (`Modules/Conditions.py`)
A recursive descent parser that evaluates logic strings in scripts and triggers.
- **Grammar**: Supports `( ... )`, `AND`, `OR`, `XOR`, `NOT`.
- **Operators**: `==`, `!=`, `>`, `<`, `matches` (Regex).
- **Targets**: Can check file existence (`exists file:...`), environment variables (`exists env:...`), or item properties (`task:MyTask:status == completed`).

### 5. Sequence System (`Modules/Sequence`)
The "Long-Term Memory" of Chronos.
- **Mirroring**: Mirrors the YAML data into SQLite databases (`chronos_behavior.db`, `chronos_journal.db`) for performant querying.
- **Trends**: Analyzes history to build `chronos_trends.db` and generates a `trends.md` digest.
- **Automation**: Runs automatically via `automation.py` hook during the nightly rollover.
- **Cleanup Integration**: The `clear` command provides surgical control over Sequence Mirrors:
  - `clear cache` - Deletes all `.db` files, forcing full rebuild
  - `clear db:<name>` - Deletes specific mirror (e.g., `chronos_matrix.db`), auto-rebuilds on next access
  - `clear registry:<name>` - Clears in-memory registry caches (wizards, themes, etc.) to force YAML reload
  - See [Admin Tools](../Features/Admin_Tools.md) for full cleanup reference

- Listener — `Modules/Listener/Listener.py`
  - Monitors time for alarms/reminders, triggers sounds (pygame.mixer), handles timer ticks.
  - Can execute scripts and target actions (e.g., complete task on trigger).

- Dashboard — `Utilities/Dashboard`
  - Server (`server.py`) serves assets and JSON/YAML APIs (ThreadingHTTPServer over plain HTTP).
  - UI is plain ES modules + a small loader (`core/runtime.js`) to mount views (`Calendar`, `TemplateBuilder`, `Cockpit`) and widgets (Scheduler/Today widget, Item Manager, Variables, Terminal, Habit Tracker, Goal Tracker, Commitments, Rewards, Achievements, Milestones, Notes, Journal, Profile, Review, Timer, Settings, Clock, Status, Debug).
  - Widgets mount via attributes, e.g., `data-widget="Notes"`, and export `mount(el, context)`. Cockpit panels register via `window.__cockpitPanelRegister` and render inside the drag-and-drop canvas.

## Dashboard Architecture

The Dashboard is a hybrid Desktop/Web application.

### Backend (`Utilities/Dashboard/server.py`)
A `ThreadingHTTPServer` that acts as the bridge between the browser and the file system.
- **API**: Provides JSON endpoints (`/api/profile`, `/api/cockpit/matrix`, `/api/media/mp3`) to read/write system state.
- **Streaming**: Streams MP3s from `User/Media` for the music player.
- **Bundler**: The `dashboard` CLI command pre-bundles static settings into `generated/settings_bundle.js` for fast startup.

### Frontend (`Utilities/Dashboard/app.js`)
A generic Vanilla JS Single Page Application (SPA).
- **Module Loader**: Dynamically imports "Panels" (views) and "Wizards" to keep the initial bundle small.
- **View System**: Manages a tiling window interface (`view-panes`) where users can open multiple tools side-by-side.
- **Widgets**: Persistence-aware widgets (Notes, Timer, Status) that float over the UI.
- **Theming**: Supports hot-swappable CSS themes (Blue, Amber, Emerald, Rose).
  - Endpoints (selected):
    - Health: `GET /health`.
    - Today API: `GET /api/today`, `POST /api/today/reschedule`.
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
  - Widgets: Scheduler (Today widget), Item Manager, Variables, Terminal, Habit Tracker, Goal Tracker, Commitments, Rewards, Achievements, Milestones, Notes, Journal, Profile, Review, Timer, Settings, Clock, Status, Debug Console.
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
- Today API: `GET /api/today`, `POST /api/today/reschedule`.
- Timer: `GET /api/timer/status|profiles|settings`, `POST /api/timer/start|pause|resume|stop`.
- Settings: `GET/POST /api/settings` and `GET /api/settings?file=...`.

## Extending Chronos

- Add a command
  1. Create `Commands/MyCommand.py` with `run(args, properties)`.
  2. Add `get_help_message()` to integrate with `help`.

- Add an item module
  1. Create `Modules/My_Item/main.py` with `handle_<verb>` or `handle_command`.
  2. Reuse `ItemManager` for common behaviors (`new`, `append`, `delete`).

- Add a widget, view, panel, or popup
  1. Create folder in `Utilities/Dashboard/Widgets/<Name>/` (or Views/Panels/Popups)
  2. Create `index.js` with appropriate export function (`mount()` for widgets/views, `register()` for panels)
  3. (Optional) Add metadata YAML file for custom labels or post-release badges
  4. Refresh dashboard - component auto-discovered and added to menu
  5. Add server endpoints if needed; prefer JSON responses for easy parsing

- Add a Wizard or Theme
  - Wizards: Create folder in `Utilities/Dashboard/Wizards/<Name>/` with `index.js`
  - Themes: Drop CSS file into `Utilities/Dashboard/Themes/`
  - Component auto-discovered on server restart
  - See `Docs/Dev/Extensibility.md` for the full specification

## Best Practices

- Keep modules small and composable.
- Prefer JSON over YAML for HTTP responses (clients parse easier); YAML is OK for human-readable responses.
- Validate inputs on the server; sanitize paths; avoid blocking I/O in handlers.
- For long-running or external operations, apply timeouts and consider subprocess isolation.
