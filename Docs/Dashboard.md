# Dashboard Guide

Chronos ships with a lightweight local dashboard for day planning and item management.

## Running

1) Start the server: `python Utilities/Dashboard/server.py`.
2) Open `Utilities/Dashboard/dashboard.html` in your browser.
3) If opened via `file://`, assets & APIs resolve to `http://127.0.0.1:7357` automatically.

## Views and Widgets

- Calendar (view)
  - Year/Month/Week/Day. Select a block in Day view to target actions.
- Today (widget)
  - Trim −5/−10/custom; Change start time; Cut; Mark completed; Reschedule.
- Notes (widget)
  - Create/manage quick notes via APIs.
- Status (widget)
  - View/set current status indicators (energy, focus, emotion, etc.).
- Timer (widget)
  - Profiles, control start/pause/resume/stop.
- HabitTracker, GoalTracker, ItemManager, DebugConsole.
- Settings (new)
  - Lists `User/Settings/*.yml`, loads content, validates and saves.

## API Endpoints (selected)

Base URL: `http://127.0.0.1:7357`

- Health
  - `GET /health` → YAML `{ ok: true, service: 'chronos-dashboard' }`.

- Today
  - `GET /api/today` → YAML blocks: start/end (HH:MM), text, type, depth, is_parallel, order.
  - `POST /api/today/reschedule` → Triggers `today reschedule`.

- CLI
  - `POST /api/cli` (YAML) → `{ command, args: [], properties: {} }` runs in‑process.

- Items
  - `GET /api/items?type=<type>&q=<substr>&props=key:val,...`
  - `GET /api/item?type=<type>&name=<name>`
  - `POST /api/item` (map or `{ type, name, properties }`)
  - `POST /api/item/copy|rename|delete`
  - bulk: `POST /api/items/delete|setprop|copy|export`

- Goals & Habits
  - `GET /api/goals`, `GET /api/goal?name=<name>`
  - `GET /api/habits`

- Timer
  - `GET /api/timer/status|profiles|settings`
  - `POST /api/timer/start|pause|resume|stop`

- Settings
  - `GET /api/settings` → `{ ok, files: [] }`
  - `GET /api/settings?file=Name.yml` → `{ ok, file, content }`
  - `POST /api/settings?file=Name.yml` with raw YAML body
    - Validates YAML and writes your original text (preserves comments)
    - Alternatives: `{ file, raw }` or `{ file, data }`

## Notes

- CORS is permissive for localhost dev. Do not expose publicly without adding auth.
- Prefer JSON for machine‑readable responses; YAML is used where human‑readability helps.

