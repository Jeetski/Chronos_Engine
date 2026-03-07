# Console Command Parsing

## Overview
Command parsing is the contract between free-form user input and deterministic command execution.
Chronos parsing behavior determines how names, properties, and quoted text become `args` and `properties` for command handlers.

## CLI
- Input model: `command arg1 arg2 key:value ...`
- Property model: tokens shaped like `key:value` are parsed into properties.
- Quoted segments are preserved as single arguments (for example: `"Deep Work Block"`).
- Command names are normalized for dispatch (case-insensitive behavior at runtime).

Example patterns:
```bash
new task "Deep Work Block" duration:50 priority:high
set task "Deep Work Block" status:in_progress
list task status:pending then complete task
```

Parsing guardrails:
1. Quote names with spaces.
2. Prefer explicit key:value properties instead of positional ambiguity.
3. Keep one command per line in scripts for predictable behavior.

## Dashboard
- Dashboard command bridges (`POST /api/cli`) route into the same parser contract.
- Widget command generation should follow the same quoting/property rules used by manual CLI usage.

## Data and Settings
- Parsing itself is stateless, but parsed commands mutate `User/*` state.
- Property conventions must remain compatible with item schemas and settings YAML.

## Validation
1. Run a quoted-name command and confirm the full name is preserved.
2. Run a command with multiple properties and verify each property is set correctly.
3. Execute the same command via dashboard terminal bridge and compare output.

## Related Docs
- `docs/reference/cli_commands.md`
- `docs/dev/chs_scripting.md`
