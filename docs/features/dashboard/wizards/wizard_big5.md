# Big5 Wizard

## Overview
Personality profile authoring flow that writes and revisits pilot personality artifacts.
Wizards should produce deterministic item/settings outcomes that remain editable through normal CLI and dashboard tools.

## CLI
- Related command patterns: `profile; settings; view note/journal artifacts after save`.
- CLI is the verification and fallback path when wizard UI is unavailable or ambiguous.
- Command syntax reference: `docs/reference/cli_commands.md`.

## Dashboard
- Runtime source: `utilities/dashboard/Wizards/Big5/`
- Primary intent: guided multi-step workflow with reduced setup friction.
- API endpoints used by this wizard:
  - `/api/file/read?path=User/Profile/personality.md`
  - `/api/file/read?path=User/Profile/profile.yml`
  - `/api/file/write`
  - `/api/settings`

## Data and Settings
- Wizard outputs should land in canonical `User/*` item files and/or `User/Settings/*.yml`.
- Generated artifacts must remain fully compatible with manual CLI edits after creation.

## Operational Workflows
1. Complete wizard start-to-finish with realistic sample inputs.
2. Confirm created/updated entities in CLI (`view`, `list`, or `settings` commands).
3. Re-open wizard to validate edit/re-entry behavior (if supported).
4. Verify no duplicate/corrupt items were created on repeated runs.

## Validation
1. Open `Big5` from dashboard wizard registry/menu.
2. Execute one full save/apply path.
3. Verify persisted outputs and expected downstream behavior (today plan, trackers, widgets, etc.).

## Related Docs
- `docs/guides/dashboard.md`
- `docs/reference/dashboard_api.md`
- `docs/guides/settings.md`
- `docs/reference/cli_commands.md`


