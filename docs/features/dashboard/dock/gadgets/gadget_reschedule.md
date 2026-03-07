# Reschedule Gadget

## Overview
Reschedule gadget is a dock quick-action control for rebuilding today's schedule without opening full scheduling views/widgets.
It is intended for fast corrective replanning during the day.

## CLI
- Related command pattern: `today reschedule`.
- Equivalent manual workflow: run `today reschedule` in console or terminal widget and inspect output.
- Command reference: `docs/reference/cli_commands.md`.

## Dashboard
- Runtime source: `utilities/Dashboard/Gadgets/Reschedule/`
- Dock behavior: single-tap action from the gadgets strip.
- API endpoints used by this gadget:
  - `/api/cli`

## Data and Settings
- Rebuilds today schedule output in `User/Schedules/*` through normal scheduling pipeline.
- Outcome is affected by current status/settings/template state at invocation time.

## Operational Workflows
1. Set or confirm current status context.
2. Trigger Reschedule gadget from dock.
3. Validate updated today plan in Today widget/Calendar/CLI.
4. Apply follow-up edits (`trim`, `change`, `anchor`) if needed.

## Validation
1. Open dock and execute gadget once with known baseline schedule.
2. Confirm schedule file/output changes as expected.
3. Confirm repeated invocation remains stable (no duplicate side effects).

## Related Docs
- `docs/guides/gadgets_and_dock.md`
- `docs/scheduling/scheduling_algorithm_overview.md`
- `docs/reference/dashboard_api.md`
- `docs/reference/cli_commands.md`

