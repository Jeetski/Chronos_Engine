# Console Scheduling And Day Execution

## Overview
Console scheduling controls Kairos day planning, live edits, and execution feedback loops.

## CLI
Core planning commands:
- `today`
- `today reschedule`
- previews: `tomorrow`, `this <weekday>`, `next <weekday>`

Live day editing commands:
- `trim`, `change`, `stretch`, `split`, `merge`, `anchor`, `cut`
- completion/logging: `mark`, `complete`, `did`
- opportunistic flow: `quickwins`

Examples:
```bash
status energy:medium focus:high
today reschedule
change "Deep Work" 10:30
trim "Admin" 10
did "Deep Work" start_time:10:30 end_time:11:20 status:completed
```

Kairos rules to preserve:
1. Buffers are breaks/protection blocks, not completion targets.
2. Anchors constrain movement during conflict resolution.
3. Quick wins are small opportunistic tasks, not replacement for critical blocks.

## Dashboard
- Today widget and scheduling-related views are dashboard control planes for this command set.
- Most schedule mutations are command-backed, even when initiated through UI controls.

## Data and Settings
- Schedule output: `user/schedules/schedule_YYYY-MM-DD.yml`.
- Manual adjustments: `user/schedules/manual_modifications_YYYY-MM-DD.yml`.
- Scheduling settings and priorities live in `user/settings/*.yml`.

## Validation
1. Build a day with `today reschedule`.
2. Apply at least two live edits (`change`, `trim`, etc.).
3. Confirm schedule persistence and sensible conflict handling.

## Related Docs
- `docs/scheduling/kairos_elements_reference.md`
- `docs/scheduling/scheduling_algorithm_overview.md`
- `docs/reference/cli_commands.md`

