# Chronos Engine Documentation

Chronos is a YAML-first life management engine with a scriptable CLI, background listener (alarms, reminders, timer), and a lightweight local dashboard. This document is your map: install, run, extend.

Links
- License: ../LICENSE.md
- Commercial License: COMMERCIAL_LICENSE.md
- Marketplace Terms: MARKETPLACE_TERMS.md
- Trademark Policy: TRADEMARK_POLICY.md
- Agent Guide: agents.md
- Agent Dev Guide: agents.dev.md
- Common Workflows: common_workflows.md

Scripting & Automation Docs
- CHS Scripting Guide: CHS_Scripting.md
- Conditions Cookbook: Conditions_Cookbook.md
- Macros (BEFORE/AFTER): Macros.md

## Quickstart
1) Prerequisites
- Windows 10/11 (primary development and test platform), Python 3.10+ (installer can fetch via winget), Git optional.
- Linux/macOS: Python 3.10+, Git; support via `install_dependencies.sh` and the `.sh` launchers is currently experimental.
2) Install
- Double-click `install_dependencies.bat`. It will:
  - Locate Python (or install via winget if missing).
  - Create `.venv` and install requirements.
3) Launch CLI
- Run `console_launcher.bat` (or `python Modules/Console.py`).
- Type `help` to see available commands.
4) Start Background Listener
- Run `listener_launcher.bat` to enable alarms, reminders, and timer ticks.
5) Dashboard
- Option A: double-click `dashboard_launcher.bat`.
- Option B: from the Console, run: `dashboard`.
  - Both start the server and open the dashboard automatically.

Tips
- Console uses UTF-8 and supports emojis. If you see odd characters, ensure the terminal is UTF-8.

## What's Inside
High level
- CLI runtime: `Modules/Console.py` dynamically loads commands (`Commands/*.py`) and item modules (`Modules/*/main.py`).
- Data model: YAML items under `User/` (tasks, routines, notes, goals, habits, etc.).
- Listener: `Modules/Listener/Listener.py` runs alarms, reminders, and timer lifecycle.
- Dashboard: `Utilities/Dashboard` server + vanilla JS widgets/views.

Folders
- `Commands/`: verbs (e.g., `today`, `list`, `new`, `edit`, `status`, `points`, `help`).
- `Modules/`: engine features (ItemManager, Scheduler, Timer, Conditions, etc.).
- `Utilities/`: helper libs and Dashboard code.
- `User/`: your data (items, schedules, settings, logs).

Key defaults and conventions
- Item directories: lowercase, underscored, plural (e.g., `User/notes`, `User/goals`).
- Default templates: prefer lowercase `<item>_defaults.yml` in `User/Settings/`.
- Points settings: `User/Settings/points_settings.yml` (backward compatible with `Points.yml`).

## Core Concepts
Items and hierarchy
- Everything is an item (task, routine, subroutine, microroutine, note, goal, milestone, habit, appointment, alarm, reminder, day, week, plan, etc.).
- Items live as single YAML files. Many items can nest other items (the "fractal" structure).

Status-aware scheduling
- `today reschedule` builds a schedule from templates and current status (energy, focus, emotion, etc.).
- Conflicts are resolved; buffers and dependencies are respected. Trimming, cutting, and marking update the plan.

Scripts and conditions
- `.chs` scripts can run CLI commands with variables and conditionals (`if/elseif/else/end`).
- Conditions support `and/or/xor/nor`, parentheses, numeric/string compares, regex `matches`, and `exists` for files/dirs/env and items.

Listener services
- Alarms/reminders run continuously; play sounds (pygame) and can trigger actions or scripts.
- Timer supports profiles and cycles, exposed via dashboard APIs.

## CLI Overview
Entry points
- Windows: run `console_launcher.bat` or `console_launcher.ps1`.
- Direct: `python Modules/Console.py <command ...>`

Common commands
- `help` — list all commands and usage.
- `new <type> <name> [k:v ...]` — create new items (defaults apply from settings).
- `edit <type> <name> [editor:...]` — open item file in your editor.
- `list <type> [sort_by:prop] [reverse_sort:true]` — list items.
- `find <type> <keyword> [k:v ...]` — search items.
- `set <type> <name> prop:value [...]` — set properties on an item.
- `append <type> <name> "text"` — append content.
- `delete [-f] <type> <name>` — delete with confirmation unless forced.
- `today` / `today reschedule` — display or regenerate today’s schedule.
- `trim <item> <minutes>` — reduce a scheduled item’s duration.
- `change <item> <HH:MM>` — change an item’s start time (today).
- `mark <item>:<status>` — mark status in today’s schedule (e.g., completed).
- `status [k:v]` — view/set status variables (energy, focus, etc.).
- `points balance|add|subtract|history` — view or change points and history.

Variables
- The console seeds `@nickname` from `User/Profile/profile.yml`. Use in scripts/messages.
- Set/read variables programmatically via `Modules/Variables.py` or CLI patterns.

## Dashboard
Server
- Path: `Utilities/Dashboard/server.py` (ThreadingHTTPServer).
- Serves assets and provides JSON/YAML endpoints (see Dashboard API guide).

UI
- `Utilities/Dashboard/dashboard.html` + `app.js` load views & widgets.
- Current widgets: Clock, Notes, Status, Timer, Goals, Item Manager, Journal, Profile, Review, Settings.

Selected endpoints
- `GET /health` — basic server health YAML.
- `GET /api/today` — YAML blocks for calendar (start/end/text/type/depth/is_parallel/order).
- `POST /api/today/reschedule` — triggers `today reschedule` via CLI pipeline.
- `POST /api/cli` — run CLI commands via YAML payload: `{ command, args: [], properties: {} }`.
- `GET /api/items?type=<type>&q=<substr>&props=key:val,...` — list items (filtered).
- `GET /api/item?type=<type>&name=<name>` — fetch full item YAML (JSON response).
- `POST /api/item` — create/update item from payload map or named `properties`.
- `POST /api/item/copy|rename|delete` — basic item management.
- `POST /api/items/delete|setprop|copy|export` — bulk operations.
- `GET /api/habits` — habit snapshot with streaks and today status.
- `GET /api/goals` / `GET /api/goal?name=...` — goal summaries and details.
- Timer: `GET /api/timer/status|profiles|settings`, `POST /api/timer/start|pause|resume|stop`.
- Settings:
  - `GET /api/settings` -> `{ ok, files: [] }` from `User/Settings/`.
  - `GET /api/settings?file=Name.yml` -> `{ ok, file, content }`.
  - `POST /api/settings?file=Name.yml` (Content-Type: text/yaml body) -> writes file (validates YAML, preserves formatting).

## Profile file path
- Canonical path: `User/Profile/profile.yml`.

## Listener target actions
Alarms and reminders can execute linked actions when they trigger. In the item YAML:

```
target:
  type: task
  name: "Deep Work"
  action: complete        # complete | open | set_status
  status: completed       # required when action == set_status
  properties: { minutes: 50 }
```

This builds a console command (e.g., `complete task "Deep Work" minutes:50`) and runs it when the alarm/reminder triggers.

## Development Notes
Coding style
- Commands are small, single-purpose modules providing `run(args, properties)` and optional `get_help_message()`.
- Item modules provide `handle_<verb>` or a generic `handle_command`.
- Keep changes focused and prefer using ItemManager utilities.

Testing & validation
- Run the CLI for focused testing (`help`, then run the target command).
- For dashboard interactions, confirm endpoints in the browser dev tools (Network tab).

Emojis & encoding
- The console sets UTF-8 on launch and supports emojis in output.
- If you add glyphs in JS/HTML, prefer plain Unicode characters over custom font ligatures.

## Changelog Highlights
Recent improvements
- Virtualenv installer (`install_dependencies.bat`) to isolate dependencies.
- Settings widget + API for editing `User/Settings/*.yml` from the dashboard.
- Points config standardized to `points_settings.yml` (backward compatible).
- Item defaults resolver supports lowercase `<item>_defaults.yml` first.
- Listener uses project-relative launcher; reduces hardcoded paths.

---
If you need a guided tour for a specific workflow (projects, habits, reviews), see CHS_Scripting.md and Conditions_Cookbook.md.
