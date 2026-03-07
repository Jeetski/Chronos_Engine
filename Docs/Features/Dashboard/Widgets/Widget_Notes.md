# Notes Widget

## Overview
Note creation/editing and sticky integration workflow surface.
Widgets should keep UI actions aligned with canonical CLI/API behavior and avoid hidden side effects.

## CLI
- Related command patterns: `new note <name>; append note <name>; view note <name>`.
- CLI is the deterministic fallback for any widget action or troubleshooting step.
- Command reference: `Docs/Reference/CLI_Commands.md`.

## Dashboard
- Runtime source: `Utilities/Dashboard/Widgets/Notes/`
- Primary role: focused operational UI for this feature domain.
- API endpoints used by this widget:
  - `/api/cli`
  - `/api/file/read`
  - `/api/file/write`
  - `/api/new/note`
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
- `Docs/Guides/Dashboard.md`
- `Docs/Reference/Dashboard_API.md`
- `Docs/Reference/CLI_Commands.md`
