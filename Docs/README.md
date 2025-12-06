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
3) Guided onboarding
- Run `onboarding_wizard.bat` (CLI) or from the dashboard Wizards menu choose **Chronos Onboarding Wizard** to customize nickname, categories, statuses, and clone the sample templates/items.
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
- Data mirrors: the `sequence` CLI builds SQLite mirrors in `User/Data/` (core/items, matrix cache, events, memory, trends, and the `trends.md` digest) so dashboards and agents can query without reparsing YAML.

Folders
- `Commands/`: verbs (e.g., `today`, `list`, `new`, `edit`, `status`, `points`, `help`).
- `Modules/`: engine features (ItemManager, Scheduler, Timer, Conditions, etc.).
- `Utilities/`: helper libs and Dashboard code.
- `User/`: your data (items, schedules, settings, logs).
- `User/Inventories`, `User/Inventory_Items`, `User/Tools`: optional gear and capability records that inventories/templates can reference.

Key defaults and conventions
- Item directories: lowercase, underscored, plural (e.g., `User/notes`, `User/goals`).
- Default templates: prefer lowercase `<item>_defaults.yml` in `User/Settings/`.
- Points settings: `User/Settings/points_settings.yml` (backward compatible with `Points.yml`).

## Core Concepts
Items and hierarchy
- Everything is an item (task, routine, subroutine, microroutine, note, goal, milestone, habit, appointment, alarm, reminder, day, week, plan, etc.).
- Items live as single YAML files. Many items can nest other items (the "fractal" structure).

Status-aware scheduling
- Templates and items can include `status_requirements` (or legacy keys matching your custom status types). Chronos loads `User/Settings/Status_Settings.yml`, scores every candidate day template, and automatically selects the one that best fits the pilot’s current status.
- `today reschedule` rebuilds the day with those signals, boosts blocks whose tags match the current state, and automatically re-queues missed-but-important blocks (with a summary of what moved) instead of leaving them stuck in the past.
- Conflicts are resolved; buffers and dependencies are respected. Trimming, cutting, marking, and `did` entries all update the plan.

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

Common commands (all item types now share the same verbs via `handle_command`)
- `help` — list commands and usage.
- `new|create <type> <name> [k:v ...]` — create any item (tasks, commitments, rewards, achievements, goals, milestones, etc.). Defaults merge from `User/Settings/<type>_defaults.yml`.
- `append <type> <name> "text"` / `set <type> <name> prop:value [...]` / `remove <type> <name> prop` — edit YAML content without leaving the CLI.
- `list <type> [filters] [then <command> ...]`, `find <type> keyword [filters]`, `count <type> [filters]` – inspect collections; piped commands automatically receive the current type/name.
- `inventory ...` – manage inventories, inventory items, and tools (list/show/new/add/remove) without remembering every verb.
- `delete [-f] <type> <name>`, `copy`, `rename`, `move type:<new_type>` – manage item files.
- `view|info|track <type> <name>` — display summaries (`track goal`, `track milestone`, `view commitment`, `view reward`, etc.).
- `commitments check` — evaluate frequency/never rules and fire triggers (scripts, rewards, achievements).
- `redeem reward "<name>" [reason:...]` — apply reward cost/cooldown and perform its target action.
- `today`, `today reschedule`, `trim`, `change`, `cut`, `mark <item>:<status>` — modify today’s schedule.
- `did "<block>" [start_time:HH:MM] [end_time:HH:MM] [status:completed|skipped|partial]` — log actuals so completions, dashboards, and reschedules stay aligned.
- `tomorrow [days:n]`, `this <weekday>`, `next <weekday>` — preview upcoming agendas using the same scheduler that powers `today`, handy for planning travel weeks or weekends.
- `status [k:v ...]` — view or set energy/focus/mood/stress values that influence scheduling.
- `timer start <profile> [bind_type:task bind_name:"Name"]`, `timer pause|resume|stop|cancel` — run focus sessions bound to items if desired.
- `points balance|history|add|subtract` — inspect or adjust the points ledger.
- `settings <file_shortcut> key value` — mutate `User/Settings/*.yml` files safely.
- `sequence <subcommand>` — manage data mirrors (`status`, `sync <targets>`, `trends` to refresh the digest).
- Listener & reminders: `listener start|stop`, `dismiss|snooze|skip <alarm>`.
- Templates & variables: `template ...`, `filter ...`, `variables` via dashboard or CLI helper commands.

Variables
- The console seeds `@nickname` from `User/Profile/profile.yml`. Use in scripts/messages.
- Set/read variables programmatically via `Modules/Variables.py` or CLI patterns.

## Dashboard
Server
- Path: `Utilities/Dashboard/server.py` (ThreadingHTTPServer).
- Serves assets and provides JSON/YAML endpoints (see Dashboard API guide).

UI
- `Utilities/Dashboard/dashboard.html` + `app.js` load all views and widgets.
- Views:
  - **Calendar** (year/month/week/day canvas, draggable overlay for zoom/level/tool controls). Selecting a block in Day view targets Today widget actions.
  - **Template Builder** (drag/drop week/day/routine trees with duration badges, nesting inspector, and POST `/api/template` saves).
- **Cockpit** (drag-and-drop canvas for modular panels). Panels like **Schedule** (live agenda tree), **Matrix** (pivot-style grid for Chronos data), and **Status Strip** (color-coded horizontal strip of your current status indicators) can be arranged into a personal flight deck, with more panels on the way.
- Widgets: Today, Item Manager, Variables, Terminal, Habit Tracker, Goal Tracker, Commitments, Rewards, Achievements, Milestones, Notes, Journal, Profile, Review, Timer, Settings, Clock, Status, Debug Console. Each widget lives under `Utilities/Dashboard/Widgets/<Name>/` with a `mount` function.

Selected endpoints (JSON unless noted)
- Health: `GET /health`.
- Today: `GET /api/today`, `POST /api/today/reschedule`.
- CLI Bridge: `POST /api/cli` (`{ command, args: [], properties: {} }`).
- Items: `GET /api/items`, `GET /api/item`, `POST /api/item`, `POST /api/item/copy|rename|delete`, bulk `POST /api/items/delete|setprop|copy|export`.
- Habits & Goals: `GET /api/habits`, `GET /api/goals`, `GET /api/goal?name=...`.
- Commitments & Milestones: `GET /api/commitments`, `GET /api/milestones`, `POST /api/milestone/update`.
- Rewards & Points: `GET /api/points`, `GET /api/rewards`, `POST /api/reward/redeem`.
- Achievements: `GET /api/achievements`, `POST /api/achievement/update`.
- Timer: `GET /api/timer/status|profiles|settings`, `POST /api/timer/start|pause|resume|stop`.
- Variables/Theme/Profile: `GET /api/vars`, `POST /api/vars`, `POST /api/vars/expand`, `GET /api/profile`, `GET /api/theme?name=...`.
- Settings: `GET /api/settings`, `GET /api/settings?file=Name.yml`, `POST /api/settings?file=Name.yml` (raw YAML preserved after validation).

## Profile file path
- Canonical path: `User/Profile/profile.yml`.
- Long-form brief & preferences live next to it:
  - `User/Profile/pilot_brief.md` — free-form priorities, motivations, how you want to use Chronos.
  - `User/Profile/preferences.md` — interaction preferences for the agent (tone, rituals, etc.).

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

## Sequence mirrors & digest
- `sequence status` lists every mirror tracked in `User/Data/databases.yml`.
  - `chronos_core.db` — canonical mirror of YAML items, relations, completions, and schedules.
  - `chronos_matrix.db` — fast analytics cache powering cockpit Matrix panels.
  - `chronos_events.db` — listener log stream plus command/trigger history.
  - `chronos_memory.db` — activity facts (planned vs actual) and status snapshots.
  - `chronos_trends.db` + `trends.md` — digest of completion rates/variance for agents.
- `sequence sync <targets>` rebuilds one or more datasets (`matrix core events memory trends`). Omit the target list to refresh everything.
- `sequence trends` is a shortcut that rebuilds the memory/trends chain and rewrites `User/Data/trends.md`.
- The Listener automatically runs `sequence sync memory trends` shortly after midnight (tracked in `User/Data/sequence_automation.yml`) so dashboards and agents start the day with fresh behavior summaries.

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
