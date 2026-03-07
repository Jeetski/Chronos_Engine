# MapOfHappiness Panel

## Overview
Panel view of happiness mapping configuration and related item context.
Panels are modular cockpit components and should remain composable in multi-panel layouts.

## CLI
- Related command patterns: `settings map_of_happiness.yml; set item happiness mapping fields`.
- CLI remains the deterministic fallback for any panel-driven mutation.
- Syntax reference: `Docs/reference/cli_commands.md`.

## Dashboard
- Runtime source: `Utilities/Dashboard/Panels/MapOfHappiness/`
- Mount contract: panel registration and lifecycle through cockpit panel manager.
- API endpoints used by this panel:
  - `/api/items`
  - `/api/settings?file=map_of_happiness.yml`

## Data and Settings
- Reads/writes canonical `User/*` state via dashboard APIs.
- Panel-specific settings (if any) should remain compatible with Cockpit persistence model.

## Operational Workflows
1. Add panel to Cockpit and verify initial data load.
2. Execute one read interaction (filter/select/inspect).
3. Execute one write interaction if panel supports updates.
4. Save/reload cockpit layout and verify panel state behavior.

## Validation
1. Open Cockpit and mount `MapOfHappiness` panel.
2. Exercise endpoint-backed interaction(s).
3. Confirm persistence and absence of API/runtime errors.

## Related Docs
- `Docs/guides/cockpit.md`
- `Docs/guides/dashboard.md`
- `Docs/reference/dashboard_api.md`
- `Docs/reference/cli_commands.md`
