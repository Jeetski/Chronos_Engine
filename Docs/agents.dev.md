# Chronos Engine: Agent Development Guide  
_Last updated: 2025‑12‑02_

This document is for AI agents (and human developers) extending Chronos: adding commands, wiring new item types, adjusting the CLI, or integrating dashboards/helpers.

---

## 1. System Overview

| Layer | Location | Responsibility |
| --- | --- | --- |
| Console | `Modules/Console.py` | Tokenizing input, property parsing (`key:value`), dispatching into commands, hosting REPL. |
| Commands | `Commands/*.py` | Very thin functions implementing `run(args, properties)`; most delegate to ItemManager or modules. |
| Modules | `Modules/<Type>/main.py` | Item-specific logic (defaults, `handle_command`, triggers). |
| Item Manager | `Modules/ItemManager.py` | Generic item ops: filesystem paths, YAML read/write, default injection, `dispatch_command`. |
| Scheduler | `Modules/Scheduler.py`, `Modules/Today.py` | Building agenda, trimming/shifting blocks, applying buffers, manual overrides. |
| Utilities | `Utilities/*` | Dashboard server, points ledger, duration parser, CLI colorprint helper, etc. |
| User data | `User/` | All pilot-owned files (items, settings, schedules, logs). |

Core principle: keep commands thin. ItemManager and per-item modules handle almost all logic; commands simply validate and call them.

---

## 2. Data Model

- Items live under `User/<TypePlural>/` (e.g., `User/Tasks/My Task.yml`). Filenames are sanitized (lowercase, spaces preserved, `&` → `and`, `:` → `-`). Expect YAML dictionaries.
- Defaults: `User/Settings/<type>_defaults.yml`. ItemManager’s `generic_handle_new` merges these and applies simple placeholders (`{{timestamp}}`, `{{tomorrow}}`).
- Settings: `User/Settings/*.yml` (points, themes, preferences, timer profiles, etc.). Use the `settings` command to mutate them.
- Pilot context: `User/Profile/pilot_brief.md` (long-form priorities/motivations) and `User/Profile/preferences.md` are plain Markdown that agents must read at startup; keep them lightweight and user-owned.
- Schedule: `User/today_schedule.yml`, with manual modifications tracked via `manual_modifications.yml`. Scheduler merges these each `today reschedule` run.
- Data mirrors: the `sequence` command writes SQLite caches under `User/Data/` (`chronos_core.db`, `chronos_matrix.db`, `chronos_events.db`, `chronos_memory.db`, `chronos_trends.db`, plus `trends.md`). Treat YAML as the source of truth but rely on these mirrors for fast analytics/dashboards.

---

## 3. CLI Parsing

1. Input line → `command`, `args`, `properties`.  
   - `key:value` tokens become entries in the `properties` dict (with list support and bool parsing).
   - Quoted text remains intact (`"My Task"`).
2. `Modules/Console.run_command` normalizes the command name (case-insensitive) and loads `Commands/<Command>.py` or prints help.
3. Commands may call `dispatch_command` for cross-type operations; when possible, rely on ItemManager to reduce duplication.

Scripting (`.chs`) is one command per line (with inline comments via `#`). The engine runs scripts exactly as typed; most agents use them for macros and tests.

---

## 4. Adding / Extending Item Types

1. **Create module.** `Modules/<Type>/main.py` with `ITEM_TYPE = "<type>"`. Implement `handle_command(command, item_type, item_name, text_to_append, properties)` when you need custom behavior; otherwise rely solely on generic handlers.
2. **Leverage `generic_handle_*`.** Import from `Modules.ItemManager`: `generic_handle_new`, `generic_handle_append`, `generic_handle_delete`. Call these from your `handle_command` for verbs you don’t override.
3. **Add defaults.** Place `User/Settings/<type>_defaults.yml` for sensible starters.
4. **Register dashboard support (optional).** If you expose data via the dashboard server, add endpoints under `/api/...` in `Utilities/Dashboard/server.py` and create widgets under `Utilities/Dashboard/Widgets/<Name>/`.
5. **Document usage.** Update `Docs/*`, especially `Docs/agents.md` for operator guidance.

Existing bespoke modules (commitments, rewards, achievements, goals, milestones, habits, routines, timer, etc.) illustrate full coverage for `handle_command` so CLI automation works uniformly.

---

## 5. Adding a Command

1. Create `Commands/<Name>.py` with `def run(args, properties)` (and optional `get_help_message`). Keep it thin.
2. Parse arguments carefully and guard against missing inputs; reuse helper modules (ItemManager, Scheduler, Utilities).
3. If the command manipulates items, prefer calling `dispatch_command` or `generic_handle_*` rather than reinventing file IO.
4. Update docs (README/help text) and mention the command in the agent guide as needed.

Always test commands via `.chs` scripts or direct CLI invocations before shipping.

### Schedule preview helpers (`tomorrow` / `this` / `next`)

- Shared plumbing lives in `Commands/_planner.py`. The `load_settings` helper pulls every scheduling-related YAML (priorities, buffers, status files), and `build_preview_for_date` reuses the full `today` pipeline to produce a one-off schedule/ conflict list for any date.  
- The preview commands simply resolve a target date and feed it into that helper:
  - `Commands/Tomorrow.py` saves to `User/Schedules/tomorrow_schedule.yml` and prints the plan (accepts `days:n` to look further ahead).
  - `Commands/This.py` resolves the nearest weekday in the current week (“this Friday”).
  - `Commands/Next.py` jumps to the next weekday or ordinal date (“next Tuesday”, “next 12th of March”).
- When you add more preview-style commands, call `build_preview_for_date` instead of cloning the today pipeline manually.

---

## 6. Scheduler / `today` Algorithm

Conceptual phases (simplified):
1. **Gather items** from Today templates, manual additions, recurring events.
2. **Compute importance** (priority, status, metadata, user energy/focus).
3. **Place ideal schedule** respecting durations, dependencies, buffers.
4. **Detect conflicts** and apply heuristics: trim, move, buffer, cut.
5. **Write schedule** (`User/today_schedule.yml`), log modifications, update `manual_modifications.yml` for later reconciliation.
6. **Listener synchronization** for alarms/reminders and Timer binding if relevant.

Modify `Modules/Scheduler.py` and `Modules/Today.py` when you need new scheduling behavior; run `today reschedule` after code changes to test.

---

## 7. Dashboard & APIs

The dashboard (under `Utilities/Dashboard/`) is a static SPA served by `server.py`. It exposes APIs (all local HTTP) for widgets:

- Items: `/api/items`, `/api/item`, plus bulk operations.
- Points/rewards/achievements/commitments/milestones: `/api/points`, `/api/rewards`, `/api/reward/redeem`, `/api/achievements`, `/api/achievement/update`, `/api/commitments`, `/api/milestones`, `/api/milestone/update`.
- Timer: `/api/timer/*` endpoints map to Timer module functions.
- Widgets live in `Utilities/Dashboard/Widgets/<Name>/`. They import runtime helpers via `Utilities/Dashboard/core/runtime.js` and often call `apiBase()+/api/...` to fetch data.

When adding a widget:
1. Create `Widgets/<Name>/index.js` with a `mount(el, context)` export.
2. Add a matching `<aside data-widget="Name">` in `dashboard.html` and update help text in `core/runtime.js`.
3. Wire any new endpoints in `server.py` (GET for data, POST for mutations).

### Cockpit view & panels

- The new Cockpit canvas (`Utilities/Dashboard/Views/Cockpit/`) manages drag/drop panels. State is persisted via `chronos_cockpit_panels_v1` in `localStorage`; panels register through an exposed `window.__cockpitPanelRegister`.
- Panels live in `Utilities/Dashboard/Panels/<Name>/` and typically export a `register(manager)` function that calls `manager.registerPanel({ id, label, mount, ... })`.
- The inaugural panel is **Schedule**; more panels can hook into the same manager without touching `dashboard.html`.

---

## 8. Testing Hooks

- Write `.chs` scripts under `Scripts/`. Common test suites exist (e.g., `Scripts/test_if_*.chs`, `Scripts/test_vars*.chs`).
- Dashboard-specific tests can be manual (open widget, click actions) or headless via API calls.
- For new modules, start with CLI commands: `new`, `view`, `append`, `set`, `delete`, `list`, and pipeline scenarios (`list <type> ... then ...`).
- Use `Utilities/colorprint` or logging statements (temporarily) for debugging, but remove noisy prints before merging.

---

## 9. Sequence mirrors & automation

- `sequence status` reads `User/Data/databases.yml` and shows the state of every mirror.
- `sequence sync <targets>` rebuilds specific datasets. Targets currently include `matrix`, `core`, `events`, `memory`, `trends`, and `trends_digest` (placeholder). Omit the target list to refresh everything.
- `sequence trends` is a shortcut for rebuilding the memory/trends pipeline and writing `User/Data/trends.md`.
- The Listener imports `Modules.Sequence.automation.maybe_queue_midnight_sync` so it can run `sequence sync memory trends` shortly after midnight (state stored in `User/Data/sequence_automation.yml`). If you change the automation cadence, update that helper and make sure agents know where to look for the digest.
- When you add new analytics, prefer piggybacking on Sequence (store data in `User/Data/*.db` and expose summaries in docs) so agents/dashboards can reuse the same mirrors.

---

## 10. Common Extension Scenarios

1. **New item type.** Clone an existing module (e.g., `Modules/Reward`) as a template. Ensure `handle_command` covers generic verbs.
2. **New dashboard widget.** Add `/api/<resource>` endpoints, create widget, register in HTML/help. Follow the pattern used by Rewards/Achievements/Commitments/Milestones.
3. **Automation rule.** Use commitments to trigger scripts or spawn items. Extend `_perform_action` if you need new trigger types.
4. **CLI enhancement.** Wrap functionality in a command inside `Commands/`. Keep the CLI language consistent (lowercase command names, helpful `get_help_message`).

---

## 11. File Map Reference

- Entry scripts: `console_launcher.bat/.sh`, `listener_launcher.*`, `timer_launcher.*` (if any).
- Commands: `Commands/*.py` (snake_case filenames, capitalized user names `Commands/Add.py` vs `add`? verify pattern when editing).  
- Modules: `Modules/<Type>/main.py` plus shared modules (`Modules/Console.py`, `Modules/Today.py`, `Modules/Scheduler.py`, `Modules/Commitment/main.py`, etc.).
- Utilities: `Utilities/points.py`, `Utilities/tracking.py`, `Utilities/Dashboard/*`, `Utilities/duration_parser.py`.
- User data: `User/` directories for each item type, `User/Settings`, `User/Profile`, `User/Rewards`, etc.
- Docs: `Docs/*.md` for user/agent instructions, `Docs/Architecture.md` for high-level diagrams, `Docs/Dashboard.md` for the SPA.

---

## 12. Conventions & Tips

- Keep modules idempotent; avoid surprise side effects unless triggered by explicit commands.
- Use lowercase type names (e.g., `task`, `goal`, `milestone`). `ItemManager` handles pluralization in paths.
- When working inside `Modules/ItemManager`, guard against missing files and invalid YAML. Always log errors to `debug_delete.txt` or similar during development, but remove persistent noisy logging in production.
- `dispatch_command` first looks for `handle_command`. If absent, it tries `handle_<verb>` functions (legacy modules). Finally it falls back to `generic_handle_*`. Ensure new modules implement `handle_command` for consistency.
- Update docs (`Docs/agents.md`, `Docs/agents.dev.md`, `Docs/Dashboard.md`, etc.) whenever you add features that agents/operators rely on.

---


---

## 13. Reference Library

Consult these documents for deeper technical details:

- `Docs/Architecture.md`: System design, data flow, and core concepts.
- `Docs/Dashboard.md`: Dashboard features and API endpoints (for widget dev).
- `Docs/Settings.md`: Configuration settings reference.
- `Docs/agents.md`: The user-facing agent guide (context for how the engine is used).
- `Docs/CHS_Scripting.md`: Guide to Chronos Scripting (CHS) for automation/testing.

Chronos evolves fast-keep this guide up to date as you add new commands, modules, or dashboard capabilities. Stay modular, rely on ItemManager, and favor explicit APIs for everything you expect agents to automate.
