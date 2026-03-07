# Day Execution

## Purpose
Operate the current day in real time: log actuals, adjust blocks, and keep schedule truthful.

## When To Use
- User says "I finished/skipped this."
- User asks to move or edit a block during the day.
- User wants to log what actually happened.

## Workflow
1. Inspect today's agenda (`today`).
2. Record outcomes (`did`, `mark`, `complete`).
3. Apply live edits (`change`, `shift`, `trim`, `stretch`, `split`, `merge`, `cut`).
4. Re-run `today reschedule` only if drift is high.

## Command Patterns
- `did "Deep Work" start_time:09:10 end_time:09:55 status:completed`
- `mark "Email":skipped`
- `complete task "Invoice Followup"`
- `shift "Gym" +20`
- `split "Deep Work" count:2`

## Guardrails
- Prefer `did` for block-level reality logging.
- Avoid duplicate completion actions for same block.

## References
- `docs/reference/cli_commands.md`
- `docs/guides/common_workflows.md`
