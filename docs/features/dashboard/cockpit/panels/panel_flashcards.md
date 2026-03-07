# Flashcards Panel

## Overview
Study/review panel for card-like item practice using list/filter sources.
Panels are modular cockpit components and should remain composable in multi-panel layouts.

## CLI
- Related command patterns: `list <type>; review workflows via note/task/quiz-like items`.
- CLI remains the deterministic fallback for any panel-driven mutation.
- Syntax reference: `docs/reference/cli_commands.md`.

## Dashboard
- Runtime source: `utilities/dashboard/panels/flashcards/`
- Mount contract: panel registration and lifecycle through cockpit panel manager.
- API endpoints used by this panel:
  - `/api/items?`

## Data and Settings
- Reads/writes canonical `User/*` state via dashboard APIs.
- Panel-specific settings (if any) should remain compatible with Cockpit persistence model.

## Operational Workflows
1. Add panel to Cockpit and verify initial data load.
2. Execute one read interaction (filter/select/inspect).
3. Execute one write interaction if panel supports updates.
4. Save/reload cockpit layout and verify panel state behavior.

## Validation
1. Open Cockpit and mount `Flashcards` panel.
2. Exercise endpoint-backed interaction(s).
3. Confirm persistence and absence of API/runtime errors.

## Related Docs
- `docs/guides/cockpit.md`
- `docs/guides/dashboard.md`
- `docs/reference/dashboard_api.md`
- `docs/reference/cli_commands.md`




