# Troubleshooting And Recovery

## Purpose
Diagnose and recover from Chronos operational failures: scheduling anomalies, stale data, dashboard/CLI mismatch, and state corruption patterns.

## When To Use
- User reports "Chronos is wrong/broken/stuck."
- Scheduler output is invalid or inconsistent.
- Dashboard and CLI show different states.

## Workflow
1. Reproduce issue with minimal commands.
2. Identify failing layer (data, scheduler, dashboard, listener, script).
3. Apply least-destructive recovery action first.
4. Verify state integrity and summarize fix.

## Common Recovery Actions
- `today kairos ...` + decision log inspection
- `today reschedule`
- `sequence sync ...`
- `register all`
- targeted cleanup (`clear db:<name>`, `clear registry:<name>`)
- backup/restore when required

## Guardrails
- Snapshot/backup before major recovery operations.
- Prefer targeted recovery over global resets.
- Record what was changed and why.

## References
- `Docs/features/admin_tools.md`
- `Docs/dev/sequence.md`
- `Docs/reference/cli_commands.md`
- `Docs/scheduling/scheduling_algorithm_deep_dive.md`
