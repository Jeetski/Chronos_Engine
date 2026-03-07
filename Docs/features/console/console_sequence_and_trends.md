# Console Sequence And Trends

## Overview
Sequence builds analytics mirrors and trend digests from canonical YAML state for faster querying and behavior insight.

## CLI
Core commands:
- `sequence status`
- `sequence sync <targets>`
- `sequence trends`

Example:
```bash
sequence status
sequence sync core matrix behavior journal trends
sequence trends
```

Use cases:
1. Rebuild stale analytics mirrors.
2. Refresh trends before planning/review sessions.
3. Diagnose data drift between source YAML and derived views.

## Dashboard
- Cockpit/Trends surfaces consume sequence-derived datasets and digest outputs.
- Dashboard performance and insights depend on up-to-date mirrors.

## Data and Settings
- Mirror DBs live under `User/Data/*.db`.
- Digest path: `User/Data/trends.md`.
- Automation marker/state: `User/Data/sequence_automation.yml`.

## Validation
1. Run `sequence status` and capture baseline.
2. Run targeted `sequence sync`.
3. Confirm refreshed mirror timestamps and digest content updates.

## Related Docs
- `Docs/dev/sequence.md`
- `Docs/reference/cli_commands.md`
- `Docs/scheduling/scheduling_algorithm_overview.md`
