# RoutineBuilder View

## Overview
Routine/subroutine/microroutine template editor with nested structure control.

## CLI
- Related command patterns: `template list type:routine; template view routine <name>`.
- Primary syntax reference: `Docs/reference/cli_commands.md`.
- Use CLI for deterministic bulk or scripted operations; use view UI for visual planning/exploration.

## Dashboard
- Runtime source: `Utilities/Dashboard/Views/RoutineBuilder/`
- View behavior should remain consistent with dashboard API contracts.
- API endpoints used by this view:
  - `/api/cli`
  - `/api/file/read?path=`
  - `/api/item`
  - `/api/item/delete`
  - `/api/item/rename`
  - `/api/items`
  - `/api/settings?file=`
  - `/api/template`
  - `/api/template?type=`
  - `/api/template/list?type=`

## Data and Settings
- Reads/writes through APIs into canonical `User/*` YAML/markdown state.
- Settings access (if present) should flow through `User/Settings/*.yml` endpoints.

## Operational Workflows
1. Load view and confirm initial data hydration succeeds.
2. Perform one read workflow (inspect/select/filter/open).
3. Perform one write workflow (create/update/rename/delete if supported).
4. Refresh view and verify persistence and consistency with CLI output.

## Validation
1. Open `RoutineBuilder` view from dashboard navigation.
2. Exercise at least one endpoint-backed interaction.
3. Confirm no console/API errors and persisted state is correct.

## Related Docs
- `Docs/guides/dashboard.md`
- `Docs/reference/dashboard_api.md`
- `Docs/reference/cli_commands.md`
