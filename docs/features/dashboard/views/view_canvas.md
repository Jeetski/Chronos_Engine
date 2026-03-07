# Canvas View

## Overview
Freeform visual planning board with item links, matrix overlays, and collaborative board flows.

## CLI
- Related command patterns: `new canvas_board <name>; view canvas_board <name>; list canvas_board`.
- Primary syntax reference: `docs/reference/cli_commands.md`.
- Use CLI for deterministic bulk or scripted operations; use view UI for visual planning/exploration.

## Dashboard
- Runtime source: `utilities/dashboard/views/canvas/`
- View behavior should remain consistent with dashboard API contracts.
- API endpoints used by this view:
  - `/api/cli`
  - `/api/cockpit/matrix?meta=true`
  - `/api/cockpit/matrix?row=`
  - `/api/cockpit/matrix/presets`
  - `/api/cockpit/matrix/presets?name=`
  - `/api/item`
  - `/api/item?type=`
  - `/api/item/rename`
  - `/api/items?type=`
  - `/api/link/invite?board=`
  - `/api/link/settings`

## Data and Settings
- Reads/writes through APIs into canonical `User/*` YAML/markdown state.
- Settings access (if present) should flow through `User/Settings/*.yml` endpoints.

## Operational Workflows
1. Load view and confirm initial data hydration succeeds.
2. Perform one read workflow (inspect/select/filter/open).
3. Perform one write workflow (create/update/rename/delete if supported).
4. Refresh view and verify persistence and consistency with CLI output.

## Validation
1. Open `Canvas` view from dashboard navigation.
2. Exercise at least one endpoint-backed interaction.
3. Confirm no console/API errors and persisted state is correct.

## Related Docs
- `docs/guides/dashboard.md`
- `docs/reference/dashboard_api.md`
- `docs/reference/cli_commands.md`




