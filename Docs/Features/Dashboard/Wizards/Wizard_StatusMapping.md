# StatusMapping Wizard

## Overview
Wizard for mapping status taxonomy to item behavior and status-aware planning data.
Wizards should produce deterministic item/settings outcomes that remain editable through normal CLI and dashboard tools.

## CLI
- Related command patterns: `settings status files + item updates with status_requirements`.
- CLI is the verification and fallback path when wizard UI is unavailable or ambiguous.
- Command syntax reference: `Docs/Reference/CLI_Commands.md`.

## Dashboard
- Runtime source: `Utilities/Dashboard/Wizards/StatusMapping/`
- Primary intent: guided multi-step workflow with reduced setup friction.
- API endpoints used by this wizard:
  - `/api/item`
  - `/api/items`
  - `/api/settings?file=`

## Data and Settings
- Wizard outputs should land in canonical `User/*` item files and/or `User/Settings/*.yml`.
- Generated artifacts must remain fully compatible with manual CLI edits after creation.

## Operational Workflows
1. Complete wizard start-to-finish with realistic sample inputs.
2. Confirm created/updated entities in CLI (`view`, `list`, or `settings` commands).
3. Re-open wizard to validate edit/re-entry behavior (if supported).
4. Verify no duplicate/corrupt items were created on repeated runs.

## Validation
1. Open `StatusMapping` from dashboard wizard registry/menu.
2. Execute one full save/apply path.
3. Verify persisted outputs and expected downstream behavior (today plan, trackers, widgets, etc.).

## Related Docs
- `Docs/Guides/Dashboard.md`
- `Docs/Reference/Dashboard_API.md`
- `Docs/Guides/Settings.md`
- `Docs/Reference/CLI_Commands.md`
