# Admin Tools

Admin Tools is Chronos's maintenance feature for cleanup, cache resets, and recovery-oriented housekeeping.

## Overview

The feature provides both broad and surgical cleanup paths.
- Broad: `clear cache`, `clear schedules`, `clear all`
- Surgical: `clear db:<name>`, `clear registry:<name>`, `clear temp`

Primary intent:
- recover from stale cache/mirror issues
- reduce clutter in logs/temp/archive folders
- give operators explicit maintenance controls in both CLI and dashboard

## CLI

Primary command:
- `clear <target> [force]` or `clear <target> force:true`

Supported targets:
- `logs`
- `schedules`
- `cache`
- `db:<name>`
- `registry:<name>`
- `temp`
- `archives`
- `all`

Examples:
```bash
clear logs
clear logs force
clear db:chronos_matrix force
clear registry:wizards
clear temp force
clear archives
clear all
```

Behavior notes:
- Without `force`, destructive actions prompt for confirmation.
- `clear all` requires the explicit phrase `DELETE EVERYTHING`.
- Database clears remove mirror files so they can be rebuilt from source state.
- Registry clears invalidate cached registry metadata so it reloads on next access.

Safety recommendations:
1. Run `backup` before `clear schedules`, `clear archives`, `clear cache`, or `clear all`.
2. Prefer targeted clears before full clears.
3. Use `force` mainly in scripted/automated contexts.

## Dashboard

Primary UI surface:
- System Admin widget

Quick actions:
- Purge Logs
- Purge Schedules
- Reset Cache
- Clear Temp

Advanced actions:
- Delete a selected mirror database
- Clear a selected registry cache
- Delete all archives

Status behavior:
- Widget shows command result messages inline.
- Errors are surfaced immediately for operator follow-up.

Backing API endpoints:
- `GET /api/system/databases`
- `GET /api/system/registries`
- `POST /api/system/command`

Example API payload:
```json
{
  "command": "clear db:chronos_matrix force"
}
```

## Data and Files Affected

Common paths impacted by Admin Tools:
- `User/Logs/`
- `User/Schedules/`
- `User/Archive/`
- `User/Data/*.db`
- `User/.cache/`

Mirror DB names typically include:
- `chronos_core.db`
- `chronos_matrix.db`
- `chronos_events.db`
- `chronos_behavior.db`
- `chronos_journal.db`
- `chronos_trends.db`

## Failure and Recovery

Typical issues:
- stale dashboard values
- orphaned matrix cache data
- old schedule state during testing

Recovery sequence:
1. Try targeted clear (`db:<name>` or `registry:<name>`).
2. Re-run relevant command (`sequence sync <target>` or `today reschedule`).
3. Escalate to `clear cache` only if targeted cleanup is insufficient.

## Related Docs

- `Docs/reference/cli_commands.md` (`clear`, `backup`, `sequence`)
- `Docs/guides/dashboard.md` (System Admin widget)
- `Docs/dev/sequence.md` (mirror rebuild model)
