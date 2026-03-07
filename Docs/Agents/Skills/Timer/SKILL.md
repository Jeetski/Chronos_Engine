# Timer

## Purpose
Run focus/break cycles and day-queue timing flows.

## When To Use
- User asks to start a focus session or pomodoro profile.
- User asks to run "start day" timer queue.

## Workflow
1. Choose profile and binding (optional).
2. Start timer/session.
3. Confirm/skip/stretch blocks as needed.
4. Report timer state and next block.

## Command Patterns
- `timer start classic_pomodoro type:task name:"Deep Work"`
- `timer pause`
- `timer resume`
- `timer confirm yes`
- `timer confirm stretch 10`
- `start day`

## Guardrails
- In schedule mode, buffer/break blocks are break phases, not completable work.
- Use `timer status` before making corrective actions.

## References
- `Docs/Reference/CLI_Commands.md`
- `Docs/Guides/Gadgets_and_Dock.md`
