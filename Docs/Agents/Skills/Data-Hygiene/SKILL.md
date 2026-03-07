# Data Hygiene

## Purpose
Keep user data healthy with backups, restore paths, and safe cleanup.

## When To Use
- User asks to clean up logs/caches/temp data.
- User asks for backup/restore.
- Data looks stale or corrupted.

## Workflow
1. Prefer reversible actions first (backup/archive).
2. Run targeted cleanup, not blanket deletion.
3. Rebuild registries/mirrors when needed.
4. Validate system health.

## Command Patterns
- `backup`
- `restore latest`
- `clear logs`
- `clear db:chronos_core force`
- `clean`
- `register all`
- `sequence sync`

## Guardrails
- Warn before destructive scope (`clear all`).
- Confirm backup availability before major cleanup.

## References
- `Docs/Features/Admin_Tools.md`
- `Docs/Reference/CLI_Commands.md`
