# LifeSetup Wizard

## Overview
Holistic setup wizard to establish baseline day structures and starter planning scaffolds.
Wizards should produce deterministic item/settings outcomes that remain editable through normal CLI and dashboard tools.

## CLI
- Related command patterns: `template list/view/apply for day templates; status + scheduling follow-up`.
- CLI is the verification and fallback path when wizard UI is unavailable or ambiguous.
- Command syntax reference: `Docs/Reference/CLI_Commands.md`.

## Dashboard
- Runtime source: `Utilities/Dashboard/Wizards/LifeSetup/`
- Primary intent: guided multi-step workflow with reduced setup friction.
- API endpoints used by this wizard:
  - `/api/item?type=`
  - `/api/template`
  - `/api/template?type=day&name=`
  - `/api/template/list?type=day`

## Data and Settings
- Wizard outputs should land in canonical `User/*` item files and/or `User/Settings/*.yml`.
- Generated artifacts must remain fully compatible with manual CLI edits after creation.

## Operational Workflows
1. Complete wizard start-to-finish with realistic sample inputs.
2. Confirm created/updated entities in CLI (`view`, `list`, or `settings` commands).
3. Re-open wizard to validate edit/re-entry behavior (if supported).
4. Verify no duplicate/corrupt items were created on repeated runs.

## Validation
1. Open `LifeSetup` from dashboard wizard registry/menu.
2. Execute one full save/apply path.
3. Verify persisted outputs and expected downstream behavior (today plan, trackers, widgets, etc.).

## Related Docs
- `Docs/Guides/Dashboard.md`
- `Docs/Reference/Dashboard_API.md`
- `Docs/Guides/Settings.md`
- `Docs/Reference/CLI_Commands.md`
