# Alerts Center Popup

## Overview
Live alerts popup for active ringing alarms and reminders with quick triage actions.
Popups should be concise, actionable, and dismissible without blocking core workflow.

## CLI
- Related command patterns: `snooze <alarm>`, `dismiss <alarm>`, `skip <alarm>`, `edit <type> <name>`, `complete <type> <name>`.
- CLI is the fallback path for actions suggested by popup prompts.
- Command reference: `docs/reference/cli_commands.md`.

## Dashboard
- Runtime source: `utilities/dashboard/popups/alerts_center/`
- Trigger model: polls for ringing alarms/reminders and opens when active alerts exist.
- API endpoints used by this popup:
  - `/api/items?type=alarm|reminder`
  - `/api/item?type=<alarm|reminder>&name=<name>`
  - `/api/cli`
  - `/api/items/setprop`

## Data and Settings
- Reads alarm/reminder YAML-backed items through dashboard APIs.
- Uses local storage snooze key (`chronos_alerts_center_popup_v1`) to reduce repeat prompting.
- Popup enable/disable and appearance behavior should follow dashboard appearance/popups settings.

## Operational Workflows
1. Create an alarm/reminder and set it to ring now.
2. Verify popup surfaces the ringing item with clear metadata.
3. Execute one action (`Snooze`, `Dismiss`, `Skip`, or target action) and verify expected side effect.
4. Dismiss popup and confirm it respects local snooze behavior.

## Validation
1. Trigger `Alerts Center` popup intentionally in test flow.
2. Confirm API calls succeed and error handling is graceful.
3. Confirm popup re-opens only when active ringing alerts exist and snooze window expires.

## Related Docs
- `docs/guides/dashboard.md`
- `docs/reference/dashboard_api.md`
- `docs/reference/cli_commands.md`
