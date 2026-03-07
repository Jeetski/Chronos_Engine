# Onboarding Wizard

## Overview
First-run setup for profile, categories, statuses, preferences, and starter copies.
Wizards should produce deterministic item/settings outcomes that remain editable through normal CLI and dashboard tools.

## CLI
- Related command patterns: `profile update; settings category/status updates; status command`.
- CLI is the verification and fallback path when wizard UI is unavailable or ambiguous.
- Command syntax reference: `docs/reference/cli_commands.md`.

## Dashboard
- Runtime source: `utilities/dashboard/wizards/onboarding/`
- Primary intent: guided multi-step workflow with reduced setup friction.
- API endpoints used by this wizard:
  - `/api/cli`
  - `/api/item/copy`
  - `/api/preferences`
  - `/api/profile`
  - `/api/settings`
  - `/api/settings?file=`
  - `/api/settings?file=category_settings.yml`
  - `/api/settings?file=status_settings.yml`
  - `/api/status/current`
  - `/api/status/update`

## Data and Settings
- Wizard outputs should land in canonical `user/*` item files and/or `user/Settings/*.yml`.
- Generated artifacts must remain fully compatible with manual CLI edits after creation.

## Operational Workflows
1. Complete wizard start-to-finish with realistic sample inputs.
2. Confirm created/updated entities in CLI (`view`, `list`, or `settings` commands).
3. Re-open wizard to validate edit/re-entry behavior (if supported).
4. Verify no duplicate/corrupt items were created on repeated runs.

## Validation
1. Open `Onboarding` from dashboard wizard registry/menu.
2. Execute one full save/apply path.
3. Verify persisted outputs and expected downstream behavior (today plan, trackers, widgets, etc.).

## Related Docs
- `docs/guides/dashboard.md`
- `docs/reference/dashboard_api.md`
- `docs/guides/settings.md`
- `docs/reference/cli_commands.md`





