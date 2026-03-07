# NiaAssistant Widget

## Overview
ADUC/Nia communication surface with familiar/chat/settings controls.
Widgets should keep UI actions aligned with canonical CLI/API behavior and avoid hidden side effects.

## CLI
- Related command patterns: `aduc; profile; assistant memory/settings flows`.
- CLI is the deterministic fallback for any widget action or troubleshooting step.
- Command reference: `docs/reference/cli_commands.md`.

## Dashboard
- Runtime source: `utilities/dashboard/widgets/nia_assistant/`
- Primary role: focused operational UI for this feature domain.
- API endpoints used by this widget:
  - `/api/aduc/chat`
  - `/api/aduc/cli/memory/clear`
  - `/api/aduc/cli/status?familiar=`
  - `/api/aduc/familiars`
  - `/api/aduc/settings`
  - `/api/aduc/start`
  - `/api/aduc/status`
  - `/api/file/write`
  - `/api/nia/profile/avatar`
  - `/api/profile`
  - `/api/profile/avatar`

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




