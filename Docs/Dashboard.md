# Dashboard Guide

Chronos includes a lightweight local dashboard for planning, reviewing, and managing items. It complements the CLI and Listener by providing visual views, quick editing, and one-click actions.

## Running

Option A (one-click)
- Double-click `dashboard_launcher.bat`.

Option B (from the Console)
- Open the Chronos Console and run: `dashboard`.

Notes
- Both options start the local server and open the dashboard automatically.

## Views and Widgets

- Calendar (view)
  - Year / Month / Week / Day. Select a block in Day view to target actions.
  - Overlay controls: zoom in/out, level (Routines / Subroutines / Microroutines / Items), and tool selection (cursor / select / picker / eraser). The panel is draggable, semi-transparent, and its position persists.

- Today (widget)
  - Trim -5/-10/custom, change start time, cut, mark complete, reschedule. Optional "fx" toggle expands variables in labels.

- Item Manager (widget)
  - Browse/search by type; sort columns; multi-select with checkboxes. Create/update via a YAML editor. Copy, rename, delete. Bulk operations: delete, set property, copy, export (returns a temporary .zip link).

- Variables (widget)
  - Inspect and edit runtime variables shared with the CLI. Add/remove rows; save via the Variables API.

- Terminal (widget)
  - Run CLI commands via the API. History up/down; Ctrl+L clears; optional argument expansion using Variables. Greeting/goodbye lines pull from profile; theme colors can apply.

- Habit Tracker, Goal Tracker (widgets)
  - Habits: snapshot with today’s good/bad counts. Goals: list/details; "Start Focus" binds the Timer to a goal/milestone; mark milestone complete.

- Notes, Journal, Profile, Review (widgets)
  - Quick access UIs for common flows. Profile shows nickname/theme. Review surfaces recent completions and summaries.

- Timer (widget)
  - Start/pause/resume/stop, profile selection, and status.

- Settings (widget)
  - Lists `User/Settings/*.yml`, loads content, validates and saves. Posts raw YAML to preserve comments/formatting.

## Template Builder

Design and edit reusable templates (week, day, routine, subroutine, microroutine) with drag-and-drop.

- Open: Dashboard View menu -> Template Builder
- Library:
  - Dropdown includes: item (leaf types like task/note/etc.), microroutine, subroutine, routine, day, week.
  - A subtype filter appears when "item" is selected to narrow by leaf type.
- Editing:
  - Select template type (routine/subroutine/microroutine/day/week) and name, then Load.
  - Drag items to reorder. Drop into an item to make a child; drop before/after to reorder at the same level; drop near the left edge to outdent.
  - Inspector lets you edit type, name, duration (number or "parallel"), ideal start/end time, and depends_on.
  - Duration badges show the computed effective time for each node (Sigma for sequential, parallel for grouped items).
- Nesting rules:
  - Hierarchy: week > day > routine > subroutine > microroutine > item (task/note/etc.).
  - Cannot nest a larger template under a smaller one (e.g., routine into subroutine is not allowed). Same-kind self-nesting is disallowed (e.g., routine in routine).
- Save: writes `children:` to the template’s YAML via `POST /api/template`.

APIs used
- `GET /api/template/list?type=TYPE` -> names
- `GET /api/template?type=TYPE&name=NAME` -> `{ children }`
- `POST /api/template` with YAML body `{ type, name, children }`

## API Endpoints (selected)

Base URL: `http://127.0.0.1:7357`

- Health
  - `GET /health` -> YAML `{ ok: true, service: 'chronos-dashboard' }`.

- Today
  - `GET /api/today` -> YAML blocks: start/end (HH:MM), text, type, depth, is_parallel, order.
  - `POST /api/today/reschedule` -> triggers `today reschedule`.

- CLI
  - `POST /api/cli` (YAML) -> `{ command, args: [], properties: {} }` runs in-process (falls back to subprocess if needed).

- Profile & Theme
  - `GET /api/profile` -> `{ ok, profile }` (reads `User/Profile/profile.yml`; see note below).
  - `GET /api/theme?name=THEME` -> `{ ok, background_hex, text_hex, theme }` from `User/Settings/theme_settings.yml`.

- Variables
  - `GET /api/vars` -> `{ ok, vars }` (merged dashboard/console variable store).
  - `POST /api/vars` (YAML) -> `{ set: {k:v}, unset: [k,...] }` updates variables.
  - `POST /api/vars/expand` (YAML) -> `{ text: "Hello @nickname" }` returns `{ ok, text }` with expansion.

- Items
  - `GET /api/items?type=<type>&q=<substr>&props=key:val,...`
  - `GET /api/item?type=<type>&name=<name>`
  - `POST /api/item` (map or `{ type, name, properties }`)
  - `POST /api/item/copy|rename|delete`
  - Bulk: `POST /api/items/delete|setprop|copy|export` (export returns `{ ok, zip: '/temp/exports_items_*.zip' }`).
  - Editor (when supported locally): `POST /api/open-in-editor` opens a file in your configured editor.

- Goals & Habits
  - `GET /api/goals`, `GET /api/goal?name=<name>`
  - `GET /api/habits`

- Timer
  - `GET /api/timer/status|profiles|settings`
  - `POST /api/timer/start|pause|resume|stop`

- Settings
  - `GET /api/settings` -> `{ ok, files: [] }`
  - `GET /api/settings?file=Name.yml` -> `{ ok, file, content }`
  - `POST /api/settings?file=Name.yml` with raw YAML body
    - Validates YAML and writes your original text (preserves comments)
    - Alternatives: `{ file, raw }` or `{ file, data }`

## Notes

- Profile path: Canonical path is `User/Profile/profile.yml` for both CLI and Dashboard.
- CORS is permissive for localhost development; do not expose publicly without adding auth.
- Prefer JSON for machine-readable responses; YAML is used where human-readability helps.
