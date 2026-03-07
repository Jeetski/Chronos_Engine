# Journal Widget

## Overview
Journal and dream entry management with create/edit/copy/delete flows.
Widgets should keep UI actions aligned with canonical CLI/API behavior and avoid hidden side effects.

## CLI
- Related command patterns: `new journal_entry <name>; append journal_entry <name>; list journal_entry`.
- CLI is the deterministic fallback for any widget action or troubleshooting step.
- Command reference: `docs/reference/cli_commands.md`.

## Dashboard
- Runtime source: `utilities/dashboard/Widgets/Journal/`
- Primary role: focused operational UI for this feature domain.
- API endpoints used by this widget:
  - `/api/item`
  - `/api/item?type=`
  - `/api/item/copy`
  - `/api/item/delete`
  - `/api/item/rename`
  - `/api/items?type=dream_diary_entry`
  - `/api/items?type=journal_entry`
  - `/api/settings?file=`
  - `/api/sticky-notes`

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
- `docs/guides/dashboard.md`
- `docs/reference/dashboard_api.md`
- `docs/reference/cli_commands.md`


