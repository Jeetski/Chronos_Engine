# ProjectManager View

## Overview
Project portfolio view for listing projects, drilling detail, and lifecycle updates.

## CLI
- Related command patterns: `new project <name>; view project <name>; list project`.
- Primary syntax reference: `docs/reference/cli_commands.md`.
- Use CLI for deterministic bulk or scripted operations; use view UI for visual planning/exploration.

## Dashboard
- Runtime source: `utilities/dashboard/views/project_manager/`
- View behavior should remain consistent with dashboard API contracts.
- API endpoints used by this view:
  - `/api/item`
  - `/api/items?type=project`
  - `/api/project/detail?name=`
  - `/api/project/rename`

## Data and Settings
- Reads/writes through APIs into canonical `user/*` YAML/markdown state.
- Settings access (if present) should flow through `user/settings/*.yml` endpoints.

## Operational Workflows
1. Load view and confirm initial data hydration succeeds.
2. Perform one read workflow (inspect/select/filter/open).
3. Perform one write workflow (create/update/rename/delete if supported).
4. Refresh view and verify persistence and consistency with CLI output.

## Validation
1. Open `ProjectManager` view from dashboard navigation.
2. Exercise at least one endpoint-backed interaction.
3. Confirm no console/API errors and persisted state is correct.

## Related Docs
- `docs/guides/dashboard.md`
- `docs/reference/dashboard_api.md`
- `docs/reference/cli_commands.md`





