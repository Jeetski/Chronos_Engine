# Timer Gadget

## Overview
Timer gadget provides compact dock controls for start/pause/resume/stop/confirm timer flows.
It is optimized for quick interaction while staying in non-timer views.

## CLI
- Related command patterns: `timer start <profile>`, `timer pause`, `timer resume`, `timer stop`, `timer cancel`.
- Gadget actions should map to the same timer semantics as CLI and timer widget.
- Command reference: `docs/reference/cli_commands.md`.

## Dashboard
- Runtime source: `utilities/dashboard/gadgets/Timer/`
- Dock behavior: compact timer state + controls from dock surface.
- API endpoints used by this gadget:
  - `/api/timer/settings`
  - `/api/timer/profiles`
  - `/api/timer/status`
  - `/api/timer/start`
  - `/api/timer/pause`
  - `/api/timer/resume`
  - `/api/timer/stop`
  - `/api/timer/confirm`

## Data and Settings
- Reads timer configuration (profiles/settings) before action execution.
- Writes runtime timer state through timer endpoints shared with Timer widget/CLI.

## Operational Workflows
1. Open dock and verify gadget reflects current timer state.
2. Start timer from default profile shortcut.
3. Pause/resume once and confirm state transitions.
4. Stop/confirm cycle and verify completion behavior is correct.

## Validation
1. Execute full start -> pause -> resume -> stop flow via gadget.
2. Compare state with Timer widget/CLI status for consistency.
3. Confirm break/buffer semantics remain non-completable in downstream logic.

## Related Docs
- `docs/guides/gadgets_and_dock.md`
- `docs/features/dashboard/widgets/widget_timer.md`
- `docs/reference/dashboard_api.md`
- `docs/reference/cli_commands.md`



