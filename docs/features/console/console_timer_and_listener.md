# Console Timer And Listener

## Overview
Timer and listener features provide execution pacing, cycle control, and background event handling.

## CLI
Timer commands:
- `timer start <profile> [bind_type:<type> bind_name:"<name>"]`
- `timer pause`, `timer resume`, `timer stop`, `timer cancel`

Listener commands:
- `listener start`
- `listener stop`

Example:
```bash
timer start classic_pomodoro bind_type:task bind_name:"Deep Work"
timer pause
timer resume
timer stop
```

Behavior rule:
- break/buffer-like schedule blocks are breaks and should not be treated as completable work items by timer workflows.

## Dashboard
- Timer widget, Clock widget, and listener-related controls call timer/listener APIs.
- UI and CLI timer state should stay in sync.

## Data and Settings
- Timer profiles/settings are in `user/Settings` files referenced by timer APIs/commands.
- Listener state and logs are stored under runtime/user data/log locations.

## Validation
1. Start timer with and without binding.
2. Pause/resume and verify elapsed/cycle behavior.
3. Confirm stop/cancel semantics and resulting item state.

## Related Docs
- `docs/reference/cli_commands.md`
- `docs/reference/dashboard_api.md`
- `docs/agents/skills/timer/skill.md`

