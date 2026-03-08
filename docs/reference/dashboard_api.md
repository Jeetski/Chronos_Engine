# Dashboard API Reference

Last verified: 2026-03-06  
Source of truth: `utilities/dashboard/server.py` (`do_GET` / `do_POST` route checks)

This reference lists currently implemented dashboard endpoints. Chronos Dashboard is local-first and intended for localhost usage.

## Health & Runtime

### GET
- `/health`

## CLI / Shell Bridge

### POST
- `/api/cli`
- `/api/shell/exec`
- `/api/day/start`

## Registry / Theme / Docs

### GET
- `/api/registry`
- `/api/theme`
- `/api/console/theme`
- `/api/docs/tree`
- `/api/docs/read`
- `/api/docs/search`

## Profile / Preferences

### GET
- `/api/profile`
- `/api/profile/avatar`
- `/api/preferences`
- `/api/nia/profile/avatar`

### POST
- `/api/profile`
- `/api/profile/avatar`
- `/api/preferences`
- `/api/project/rename`
- `/api/goal/rename`

## Items / Templates / Files

### GET
- `/api/items`
- `/api/item`
- `/api/template`
- `/api/template/list`
- `/api/file/read`
- `/api/editor`
- `/api/editor/open-request`
- `/api/sticky-notes`

### POST
- `/api/item`
- `/api/item/copy`
- `/api/item/rename`
- `/api/item/delete`
- `/api/items/delete`
- `/api/items/setprop`
- `/api/items/copy`
- `/api/items/export`
- `/api/template`
- `/api/file/read`
- `/api/file/write`
- `/api/file/rename`
- `/api/file/delete`
- `/api/open-in-editor`
- `/api/new/note`
- `/api/editor`
- `/api/editor/open-request`
- `/api/sticky-notes`
- `/api/sticky-notes/update`
- `/api/sticky-notes/delete`
- `/api/sticky-notes/reminder`

## Schedule / Status / Completion

### GET
- `/api/today`
- `/api/week`
- `/api/completions`
- `/api/yesterday/checkin`
- `/api/status/current`
- `/api/calendar/overlays`
- `/api/calendar/happiness`
- `/api/trends/metrics`

### POST
- `/api/today/reschedule`
- `/api/yesterday/checkin`
- `/api/status/update`
- `/api/calendar/overlays`
- `/api/calendar/overlays/delete`

## Timer / Listener / Alerts

### GET
- `/api/timer/status`
- `/api/timer/profiles`
- `/api/timer/settings`

### POST
- `/api/timer/start`
- `/api/timer/pause`
- `/api/timer/resume`
- `/api/timer/stop`
- `/api/timer/cancel`
- `/api/timer/confirm`
- `/api/listener/start`

## Domain Data (Habits, Goals, Rewards, Achievements, Commitments)

### GET
- `/api/habits`
- `/api/goals`
- `/api/goal`
- `/api/milestones`
- `/api/commitments`
- `/api/points`
- `/api/rewards`
- `/api/achievements`
- `/api/tracker/sources`
- `/api/tracker/year`
- `/api/review`
- `/api/project/detail`

### POST
- `/api/milestone/update`
- `/api/commitments/override`
- `/api/reward/redeem`
- `/api/achievement/update`

## Cockpit / Matrix

### GET
- `/api/cockpit/matrix`
- `/api/cockpit/matrix/presets`

### POST
- `/api/cockpit/matrix/presets`
- `/api/cockpit/matrix/presets/delete`

## ADUC / Nia Bridge

### GET
- `/api/aduc/status`
- `/api/aduc/start`
- `/api/aduc/log`
- `/api/aduc/familiars`
- `/api/aduc/cli/status`
- `/api/aduc/settings`

### POST
- `/api/aduc/chat`
- `/api/aduc/settings`
- `/api/aduc/cli/memory/clear`

## TRICK (Tiny Remote Interface Control Kit)

### GET
- `/api/trick/registry`

### POST
- `/api/trick`

## Link / Collaboration

### GET
- `/api/link/settings`
- `/api/link/invite`
- `/api/link/status`
- `/api/link/board`

### POST
- `/api/link/board`

## Data Cards

### POST
- `/api/datacards/*` (series/rules/cards/import/visualize subpaths)

## Media / Logs / System

### GET
- `/api/media/mp3`
- `/api/media/playlists`
- `/api/logs`
- `/media/mp3/*`
- `/api/settings`
- `/api/vars`

### POST
- `/api/media/mp3/upload`
- `/api/media/mp3/delete`
- `/api/media/playlists/save`
- `/api/media/playlists/delete`
- `/api/logs`
- `/api/system/command`
- `/api/system/databases`
- `/api/system/registries`
- `/api/settings`
- `/api/vars`
- `/api/vars/expand`

## Notes

- `server.py` contains legacy/duplicate route checks for some paths; this list reflects available implemented routes, not uniqueness in source.
- Some GET/POST pairs intentionally share a path (for example `/api/profile`, `/api/settings`, `/api/item`, `/api/template`).
- The server is permissive for local development; do not expose without authentication and transport hardening.

## Request/Response Examples

Examples use `http://127.0.0.1:8000` as the dashboard base URL.

### `POST /api/cli`

Request:
```json
{
  "command": "today",
  "args": ["reschedule"],
  "properties": {
    "status": "energy=high,focus=high",
    "quickwins": 3
  }
}
```

Success response:
```json
{
  "ok": true,
  "stdout": "...",
  "stderr": ""
}
```

Validation error response:
```yaml
ok: false
error: Missing 'command'
```

### `GET /api/item?type=task&name=Deep%20Work`

Success response:
```json
{
  "ok": true,
  "content": "name: Deep Work\nstatus: pending\n...",
  "item": {
    "name": "Deep Work",
    "status": "pending"
  }
}
```

Not found response:
```json
{
  "ok": false,
  "error": "Item not found"
}
```

### `POST /api/item`

Request:
```json
{
  "type": "task",
  "name": "Deep Work",
  "properties": {
    "duration": "60m",
    "priority": "high",
    "status": "pending"
  }
}
```

Success response:
```yaml
ok: true
stdout: "..."
stderr: ""
```

### `GET /api/template?type=day&name=Weekday`

Success response:
```json
{
  "ok": true,
  "type": "day",
  "name": "Weekday",
  "template": {
    "name": "Weekday"
  },
  "children": [
    {
      "name": "Morning Routine",
      "type": "routine"
    }
  ]
}
```

### `POST /api/template`

Request:
```json
{
  "type": "day",
  "name": "Weekday",
  "children": [
    {
      "name": "Deep Work",
      "type": "task",
      "duration": 90
    }
  ]
}
```

Success response:
```json
{
  "ok": true
}
```

### `GET /api/today`

Success response:
```yaml
ok: true
blocks:
  - start: "09:00"
    end: "10:30"
    text: "Deep Work"
    type: "task"
    anchored: false
```

No schedule response:
```yaml
ok: false
error: schedule file not found
```

### Timer endpoints

`GET /api/timer/status` success:
```json
{
  "ok": true,
  "status": {}
}
```

`POST /api/timer/start` request:
```json
{
  "profile": "classic_pomodoro",
  "bind_type": "task",
  "bind_name": "Deep Work",
  "cycles": 2,
  "auto_advance": true
}
```

`POST /api/timer/start` success:
```json
{
  "ok": true,
  "status": {},
  "stdout": "...",
  "stderr": ""
}
```

`POST /api/timer/confirm` request (complete):
```json
{
  "action": "yes"
}
```

`POST /api/timer/confirm` request (stretch):
```json
{
  "action": "stretch",
  "stretch_minutes": 10
}
```

Shared timer error shape:
```json
{
  "ok": false,
  "error": "Timer start error: ..."
}
```

### `POST /api/trick`

Supported commands: `OPEN`, `CLOSE`, `LIST`, `GET`, `SET`, `CLICK`, `WAIT`.

Request:
```json
{
  "command": "CLICK",
  "target": "widget.timer.start_button",
  "actor": "nia"
}
```

Success response:
```json
{
  "ok": true,
  "command": "CLICK",
  "target": "widget.timer.start_button",
  "result": {
    "status": {
      "status": "running"
    }
  }
}
```


