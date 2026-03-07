# HabitTracker Widget

## Overview
Habit completion/incident tracking surface for daily behavior loops.
Widgets should keep UI actions aligned with canonical CLI/API behavior and avoid hidden side effects.

## CLI
- Related command patterns: `list habits; complete habit <name>; mark habit incidents`.
- CLI is the deterministic fallback for any widget action or troubleshooting step.
- Command reference: `Docs/reference/cli_commands.md`.

## Dashboard
- Runtime source: `Utilities/Dashboard/Widgets/HabitTracker/`
- Primary role: focused operational UI for this feature domain.
- API endpoints used by this widget:
  - `/api/habits`
  - `/api/habits/complete`
  - `/api/habits/incident`

## Data and Settings
- Reads/writes canonical `User/*` state through dashboard APIs.
- Settings interactions should remain compatible with `User/Settings/*.yml` contracts.

## Operational Workflows
1. Open widget and verify initial data load/empty-state behavior.
2. Perform one read action (load/list/search/inspect).
3. Perform one write action if supported (create/update/delete/trigger).
4. Refresh and verify state persistence + CLI parity.

## Validation
1. Launch widget from dashboard menu.
2. Exercise at least one endpoint-backed interaction.
3. Confirm no API/runtime errors and expected side effects only.

## Related Docs
- `Docs/guides/dashboard.md`
- `Docs/reference/dashboard_api.md`
- `Docs/reference/cli_commands.md`
