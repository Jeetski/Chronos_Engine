# Dashboard Guide

Chronos includes a lightweight local dashboard that complements the CLI and Listener. It provides visual planning, quick editing, and one-click actions powered by the same APIs used by automation agents.

---

## Running the Dashboard

| Method | Steps |
| --- | --- |
| Launcher | Double-click `dashboard_launcher.bat` (or `.sh` on Linux/macOS). |
| From Console | Open the Chronos Console and run `dashboard`. |

Both start the local HTTP server (`Utilities/Dashboard/server.py`) and open the UI in your default browser.

---

## Views & Widgets

### Views
- **Calendar** – Year/Month/Week/Day canvas with a draggable overlay panel for zoom, hierarchy level (Routines → Items), and tool selection (cursor / select / picker / eraser). Selecting a block in Day view targets Today widget actions.
- **Template Builder** – Drag-and-drop editing for week/day/routine/subroutine/microroutine templates. Includes duration badges, inspector panel, nesting rules, and saves via `POST /api/template`.
- **Cockpit** – A drag-and-drop canvas powered by `Utilities/Dashboard/Views/Cockpit/`. Panels spawn from the “Panels” dropdown, remember their size/position (`chronos_cockpit_panels_v1` in localStorage), and can be rearranged into a personal flight deck. Shipping panels include **Schedule** (`Utilities/Dashboard/Panels/Schedule/`, a live agenda tree), **Matrix** (`Utilities/Dashboard/Panels/Matrix/`, a configurable pivot grid fed by Chronos data), and the new **Status Strip** (`Utilities/Dashboard/Panels/StatusStrip/`, a minimal horizontal ticker that color-codes each status indicator by priority), with more on the way.
  - The Matrix panel now ships with curated presets (Status × Type, Task Priority vs Status, Duration by Tag, Points by Category) so you can load a meaningful pivot immediately before saving your own variations.
  - Filter dropdowns auto-populate with your actual item types, template types, and YAML properties, making it easier to build conditions without memorizing field names.

### Widgets (mounted via `data-widget="Name"`)
- **Today** – Trim (-5/-10/custom), change start time, cut, mark complete, reschedule. Optional `fx` toggle expands variables in labels.
- **Item Manager** – Search/browse by type (defaults include every registered item type). YAML editor, copy/rename/delete, bulk delete/setprop/copy/export.
- **Variables** – Inspect/edit runtime variables shared with the CLI, including `set`/`unset` rows and text expansion.
- **Terminal** – Runs CLI commands via `/api/cli`, supports history, Ctrl+L clear, variable expansion, and theming based on profile preferences.
- **Habit Tracker** – Snapshot of habits with polarity, streaks, and today’s status.
- **Goal Tracker** – Goal list + detail view, milestone progress, “Start Focus” to bind the Timer, buttons to mark milestones complete.
- **Commitments** – Shows frequency/never rules, progress counts, violation info, and an Evaluate button (calls `commitments check` via `/api/cli`).
- **Rewards** – Displays point balance/history, lists rewards with cooldown/cost info, Redeem buttons call `/api/reward/redeem`.
- **Achievements** – Alphabetical list with filters, mark awarded/archived actions via `/api/achievement/update`.
- **Milestones** – Progress bars, filters (pending/in-progress/completed), Mark Complete / Reset buttons hitting `/api/milestone/update`.
- **Inventory Manager** – Browse inventories, linked inventory items, and tools; add/remove items from kits without leaving the dashboard.
- **Notes, Journal, Profile, Review** – Quick editors/viewers for common flows. Review surfaces recent completions; Profile shows nickname/theme.
- **Timer** – Start/pause/resume/stop, select profiles, show bound item state.
- **Settings** – Lists `User/Settings/*.yml`, loads/validates, saves raw YAML to preserve comments.
- **Clock, Status, Debug Console** – Utility widgets for quick reference and event logging.

## Wizards
- **Chronos Onboarding Wizard** – Launch from the Wizards dropdown to mirror the CLI onboarding flow. It updates your nickname/profile, category order (`category_settings.yml`), status dimensions/scales (`status_settings.yml` plus each `<status>_settings.yml`), clones the Weekday Example templates/routines/habits, and lets you spin up the example goal, commitment, reward, and achievement. Each step relies on JSON endpoints such as `/api/settings`, `/api/item/copy`, `/api/preferences`, `/api/status/update`, and `/api/cli`.
- **Goal Planning Wizard** – Multi-step planner that captures the goal vision, success signals, milestones, and writes the YAML via `/api/item`.
- **Project Launch Wizard** – Guides you through the project brief, milestones, and kickoff actions, then writes the project YAML and optional kickoff tasks via `/api/item`.

All widgets live under `Utilities/Dashboard/Widgets/<Name>/index.js` and export `mount(el, context)`.

---

## Template Builder API

- `GET /api/template/list?type=TYPE` → template names.
- `GET /api/template?type=TYPE&name=NAME` → `{ children }` tree.
- `POST /api/template` with `{ type, name, children }` → writes the template’s `children:` section.

---

## HTTP API Reference (selected)

Base URL: `http://127.0.0.1:7357`. JSON responses unless stated.

### Health
- `GET /health` – YAML `{ ok: true, service: 'chronos-dashboard' }`.

### Today / Scheduling
- `GET /api/today` – YAML blocks with start/end/text/type/depth/is_parallel/order.
- `POST /api/today/reschedule` – runs `today reschedule` through the CLI pipeline.

### CLI Bridge
- `POST /api/cli` – `{ command, args: [], properties: {} }`; runs commands in-process (falls back to subprocess).

### Profile, Theme, Variables
- `GET /api/profile` / `GET /api/theme?name=THEME`.
- `GET /api/vars`, `POST /api/vars`, `POST /api/vars/expand`.

### Item Management
- `GET /api/items?type=<type>&q=<substr>&props=key:val,...`
- `GET /api/item?type=<type>&name=<name>`
- `POST /api/item` (accepts full map or `{ type, name, properties|content }`)
- `POST /api/item/copy|rename|delete`
- `POST /api/items/delete|setprop|copy|export`
- `POST /api/open-in-editor`

### Habits, Goals, Milestones, Commitments
- `GET /api/habits`
- `GET /api/goals`, `GET /api/goal?name=...`
- `GET /api/commitments`
- `GET /api/milestones`
- `POST /api/milestone/update` (`{ name, action: 'complete'|'reset' }`)

### Rewards, Achievements, Points
- `GET /api/points` – `{ balance, history }`
- `GET /api/rewards`
- `POST /api/reward/redeem`
- `GET /api/achievements`
- `POST /api/achievement/update`

### Timer
- `GET /api/timer/status|profiles|settings`
- `POST /api/timer/start|pause|resume|stop`

### Settings
- `GET /api/settings`
- `GET /api/settings?file=Name.yml`
- `POST /api/settings?file=Name.yml` – raw YAML body or `{ file, raw/data }`; validates before writing to preserve formatting.

---

## Notes & Best Practices

- **Profile path:** `User/Profile/profile.yml` is the canonical location for nickname/preferences (used across CLI and dashboard).
- **CORS/security:** The server is permissive for localhost development only. Do not expose it publicly without adding auth and HTTPS.
- **Response format:** Prefer JSON for machine parsing; YAML responses are used when human readability helps (e.g., `/health`, `/api/today`).
- **State sharing:** The dashboard shares variables, templates, and item store with the CLI; running actions in the UI is equivalent to issuing CLI commands.
