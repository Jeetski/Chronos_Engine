# Progress Gauge Panel

## Overview
Ring-based progress panel for countdowns, numeric goals, and item-backed numeric progress.
Panels are modular cockpit components and should remain composable in multi-panel layouts.

## CLI
- Related command patterns: `list goal; track goal; view milestone; today`.
- CLI remains the deterministic fallback for inspecting source items or updating tracked values.
- Syntax reference: `docs/reference/cli_commands.md`.

## Dashboard
- Runtime source: `utilities/dashboard/panels/progress_gauge/`
- Mount contract: panel registration and lifecycle through cockpit panel manager.
- API endpoints used by this panel:
  - `/api/item?type=&name=`

## Data and Settings
- Reads/writes canonical `user/*` state via dashboard APIs.
- Panel-specific gauge configurations persist in browser local storage.

## Operational Workflows
1. Add panel to Cockpit and create one or more gauges.
2. Configure a countdown, numeric goal, or item-backed property gauge.
3. Refresh and verify the ring state reflects current values.
4. Reload the dashboard and confirm panel gauge configs persist.

## Validation
1. Open Cockpit and mount `Progress Gauge`.
2. Configure at least one countdown gauge and one numeric gauge.
3. Confirm persistence and absence of API/runtime errors.

## Related Docs
- `docs/guides/cockpit.md`
- `docs/guides/dashboard.md`
- `docs/reference/dashboard_api.md`
- `docs/reference/cli_commands.md`
