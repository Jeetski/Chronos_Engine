# Macros (BEFORE/AFTER Hooks)

Chronos supports opt-in macros that run before or after any CLI command. Macros work the same from the CLI and the Dashboard (the Dashboard invokes the same console pipeline).

## Enable

1) Create `User/Scripts/Macros/macros.yml`
2) Minimal config:

```
enable_macros: true
default_timeout_ms: 15000
before_command: {}
after_command: {}
```

- `enable_macros`: master switch.
- `default_timeout_ms`: per-step timeout.
- `before_command` / `after_command`: maps of commands to lists of steps. Use `"*"` for wildcard.

## Step Types

- `cli`: run one CLI invocation
  - List: `cli: ["echo", "Creating @args0 '@args1'"]`
  - String (shlex split): `cli: "echo Created: @args0 @args1"`
- `chs`: run a `.chs` script via the console pipeline
  - Example: `chs: User/Scripts/Macros/log_mark.chs`
- `setvar`: set a variable in the shared variable store
  - Example: `setvar: { name: last_cmd, value: "@cmd" }`
- `noop`: placeholder, does nothing

## Context & Expansion

All step arguments support variable expansion using `Modules/Variables`:

- Command context:
  - `@cmd`, `@args0`, `@args1`, …
  - Each property is available as `@<prop>` (e.g., `@priority`, `@force`)
- After-hook result context (summary only):
  - `@result_ok` ("true"/"false")

Note: This uses the same expansion rules as the console (supports `@var` and `@{var}`).

## Example `macros.yml`

```
enable_macros: true
default_timeout_ms: 12000

before_command:
  new:
    - setvar: { name: weekday, value: "@{date.weekday}" }
    - cli: ["echo", "Creating @args0 '@args1'"]
after_command:
  delete:
    - cli: ["echo", "Deleted: @args1"]
```

## Safety & Behavior

- Recursion guard: macro sub-invocations set `CHRONOS_SUPPRESS_MACROS=1` to avoid re-triggering macros.
- Bypass per call: pass property `no_macros:true` on any command to skip hooks.
- Timeouts: each step enforces `default_timeout_ms` (applies to `cli` and `chs`).
- Failures: macro failures are logged to console (or ignored); they do not stop the main command in Phase 1.

## Tips

- Use `setvar` in BEFORE to seed context used by subsequent steps or the main command.
- Keep steps small and fast; prefer running `.chs` for multi-step logic.
- Macros run the same way for Dashboard actions because they also go through the console pipeline.

```
# Files
# - Config: User/Scripts/Macros/macros.yml
# - Engine: Modules/MacroEngine.py (invoked by Modules/Console.py)
```

