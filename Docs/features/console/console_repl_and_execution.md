# Console REPL And Execution

## Overview
The REPL is the primary operator surface for interactive Chronos control.
It handles command submission, dispatch, output, and script execution in a single runtime loop.

## CLI
Primary launch paths:
- `console_launcher.bat` (Windows launcher)
- `python Modules/console.py` (direct invocation)

Execution flow:
1. Read line input.
2. Parse into command/args/properties.
3. Dispatch to `Commands/<Name>.py`.
4. Print result/error and wait for next command.

Operational patterns:
```bash
help
list task status:pending
today reschedule
```

Failure contract:
- report command attempted
- report error text
- suggest recovery command

## Dashboard
- `Terminal` widget mirrors REPL-style operation via `/api/cli`.
- Most widgets are specialized REPL clients that emit structured command/API calls.

## Data and Settings
- REPL reads and writes across `User/` through command handlers.
- Launch behavior depends on project environment and installed dependencies.

## Validation
1. Launch REPL and run `help`.
2. Execute one read command and one write command.
3. Execute a failing command and verify error surfacing is usable.

## Related Docs
- `Docs/reference/cli_commands.md`
- `Docs/features/dashboard/widgets/widget_terminal.md`
