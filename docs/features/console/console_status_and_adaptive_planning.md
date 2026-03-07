# Console Status And Adaptive Planning

## Overview
Status is an input signal for adaptive planning. It changes how templates and blocks are selected/prioritized.

## CLI
Core commands:
- read current status: `status`
- update status values: `status key:value ...`

Example:
```bash
status energy:low focus:medium mood:calm stress:high
today reschedule
```

Operational pattern:
1. Set current status honestly.
2. Rebuild day with `today reschedule`.
3. Use quick wins and trims when energy is constrained.

## Dashboard
- Status widget and status mapping wizard drive the same model from UI.
- Dashboard status updates should remain compatible with CLI key:value updates.

## Data and Settings
- Global status taxonomy: `User/Settings/status_settings.yml`.
- Per-status definitions: `User/Settings/*_settings.yml`.
- Items/templates can declare `status_requirements:` fields.

## Validation
1. Update status in CLI.
2. Trigger `today reschedule`.
3. Verify output reflects status-aligned priorities/template behavior.

## Related Docs
- `docs/guides/settings.md`
- `docs/reference/cli_commands.md`
- `docs/agents/skills/status_management/skill.md`
