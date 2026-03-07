# Commitments Panel

## Overview
Commitment monitoring panel with evaluation and override interactions.
Panels are modular cockpit components and should remain composable in multi-panel layouts.

## CLI
- Related command patterns: `commitments check; view commitment <name>; list commitments`.
- CLI remains the deterministic fallback for any panel-driven mutation.
- Syntax reference: `Docs/Reference/CLI_Commands.md`.

## Dashboard
- Runtime source: `Utilities/Dashboard/Panels/Commitments/`
- Mount contract: panel registration and lifecycle through cockpit panel manager.
- API endpoints used by this panel:
  - `/api/commitments`
  - `/api/commitments/override`

## Data and Settings
- Reads/writes canonical `User/*` state via dashboard APIs.
- Panel-specific settings (if any) should remain compatible with Cockpit persistence model.

## Operational Workflows
1. Add panel to Cockpit and verify initial data load.
2. Execute one read interaction (filter/select/inspect).
3. Execute one write interaction if panel supports updates.
4. Save/reload cockpit layout and verify panel state behavior.

## Validation
1. Open Cockpit and mount `Commitments` panel.
2. Exercise endpoint-backed interaction(s).
3. Confirm persistence and absence of API/runtime errors.

## Related Docs
- `Docs/Guides/Cockpit.md`
- `Docs/Guides/Dashboard.md`
- `Docs/Reference/Dashboard_API.md`
- `Docs/Reference/CLI_Commands.md`
