# ADUC View

## Overview
Unified familiar interaction surface for ADUC status, startup, and live log visibility.

## CLI
- Related command patterns: `aduc; profile; dashboard`.
- Primary syntax reference: `Docs/Reference/CLI_Commands.md`.
- Use CLI for deterministic bulk or scripted operations; use view UI for visual planning/exploration.

## Dashboard
- Runtime source: `Utilities/Dashboard/Views/ADUC/`
- View behavior should remain consistent with dashboard API contracts.
- API endpoints used by this view:
  - `/api/aduc/log`
  - `/api/aduc/start`
  - `/api/aduc/status`

## Data and Settings
- Reads/writes through APIs into canonical `User/*` YAML/markdown state.
- Settings access (if present) should flow through `User/Settings/*.yml` endpoints.

## Operational Workflows
1. Load view and confirm initial data hydration succeeds.
2. Perform one read workflow (inspect/select/filter/open).
3. Perform one write workflow (create/update/rename/delete if supported).
4. Refresh view and verify persistence and consistency with CLI output.

## Validation
1. Open `ADUC` view from dashboard navigation.
2. Exercise at least one endpoint-backed interaction.
3. Confirm no console/API errors and persisted state is correct.

## Related Docs
- `Docs/Guides/Dashboard.md`
- `Docs/Reference/Dashboard_API.md`
- `Docs/Reference/CLI_Commands.md`
