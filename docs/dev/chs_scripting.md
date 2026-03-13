# CHS Scripting Guide

Chronos executes `.chs` scripts with one command per line. Lines support quoted arguments, key:value properties, and variable expansion.

## Variables

- Set a variable: `set var name:World`
- Use in any command: `echo Hello @name` or `echo Hello @{name}`
- Current status is mirrored to vars like `@status_energy`, `@status_focus`, `@status_health`
- `@location` is an alias of `@status_place` (for example, `set var location:home`)
- Dotted namespace aliases are supported (for readability): `@status.energy`, `@profile.nickname`, `@timer.profile`
- Setting `status_*` vars writes through to status YAML: `set var status_energy:high`
- `@timer_profile` mirrors timer default profile; set with `set var timer_profile:classic_pomodoro`
- Optional power-user bindings can mirror arbitrary vars to YAML using `user/settings/variable_bindings.yml`
- Escape a literal `@`: use `@@`
- Scope: Variables persist for the duration of the current console session or script execution.
- Inspect and remove:
  - `vars` — lists variables
  - `vars name:foo` — prints a single var
  - `unset var foo` — removes a var

## Properties (key:value)

- Any `key:value` tokens are parsed as properties and passed to commands (e.g., `priority:high`).
- Quote values with spaces: `category:"deep work"`.
- Detection rule: a token is treated as a property only if the key starts with a letter and the key contains letters, digits, or underscores. This avoids mis-parsing Windows paths like `C:\Work\file.txt` as properties.

## Output Redirection

Chronos console supports post-command output redirection:

- `>` overwrite target
- `>>` append target

Targets:
- file path (`today > temp/today.txt`)
- variable (`today > @out`, `today >> @out`)

Expansion rules:
- `@name` and `@{name}` both work when the entire target token is a variable target (`today > @out`).
- File targets allow variable expansion inside the path token.
- When a variable is embedded inside a larger filename/path token, use braces so the suffix is preserved: `today > temp/@{day_name}.txt`
- Avoid bare embedded forms like `temp/@day_name.txt`; Chronos will treat `@day_name.txt` as one variable name.

This is implemented at the console routing layer, so it works for commands without requiring per-command changes.

## Optional YAML Variable Bindings (`variable_bindings.yml`)

For advanced workflows, you can bind variables to nested YAML values so reads and `set var` writes sync automatically.

Path: `user/settings/variable_bindings.yml` (optional; if missing, Chronos behavior is unchanged).

Example:

```yaml
bindings:
  - var: weather.city
    file: user/profile/profile.yml
    path: preferences.weather.city
    mode: readwrite
  - var: goals.active
    file: user/profile/profile.yml
    path: metrics.goals.active
    mode: write
```

Rules:
- `var`: variable name (`status.energy`/aliases still canonicalize the same way).
- `file`: YAML file path relative to project root (or absolute path inside project root).
- `path`: dotted YAML path inside that file (for example `preferences.weather.city`).
- `mode`: `read`, `write`, or `readwrite`.

Safe defaults:
- Invalid bindings are ignored.
- Only `.yml`/`.yaml` targets are allowed.
- Targets outside project root are refused.
- If the bindings file is absent, no additional syncing occurs.

## Conditionals: `if`

Two forms are supported:

- Single-line: `if <left> <op> <right> then <command> [args...] [else <command> ...]`
- Block (.chs):
  ```
  if <left> <op> <right> then
      <command>
  elseif <left> <op> <right> then
      <command>
  else
      <command>
  end
  ```

### Operators and Logic

- Operators: `= != > < >= <= eq ne gt lt ge le matches` (regex)
- Logic: `and or xor nor not !`
- Parentheses for grouping: `( ... )`
- Precedence: `not/!` > `and` > `or/xor/nor`

### Sources

- Status: `status:<key>` reads from `user/current_status.yml`
- Status history snapshots append to `user/logs/status_YYYY-MM-DD.yml`
- Items: `<type>:<name>:<property>` (e.g., `task:"Deep Work":priority`)
- Existence checks:
  - Items: `exists <type>:<name>[:<property>]` (e.g., `exists task:"My Task":due_date`)
  - Filesystem: `exists file:<path>`, `exists dir:<path>` (relative to project root if not absolute)
  - Environment: `exists env:<NAME>`
- Literals and `@vars` are allowed on either side of operators.

### Examples

```
set var who:Alice
create note "IF Note @who" category:work priority:high

if exists note:"IF Note @who" then echo FOUND else echo MISSING
if status:energy eq high and exists env:PATH then echo READY
if @status_energy eq high and exists env:PATH then echo READY
if note:"IF Note @who":priority matches ^h.* then echo STARTS_WITH_H
if ( status:energy eq high and exists note:"IF Note @who" ) or status:emotion ne sad then echo OK

if status:energy eq high then
  echo Outer TRUE
  if exists note:"IF Note @who" then
    echo Nested FOUND
  else
    echo Nested MISSING
  end
else
  echo Outer FALSE
end
```

## Loops

Loops are bounded and available in `.chs` scripts. Each loop exposes `@i` as a
1-based index during iteration.

### `repeat`

```
repeat count:3 then
  echo Pass @i
end
```

### `for`

Iterates items and sets `@<var>` (item name) and `@<var>_type` (item type).

```
for item in tasks status:pending then
  echo @item
end
```

### `while`

Requires a max to prevent infinite loops.

```
while status:energy eq high max:3 then
  echo Still high @i
end
```

## Errors

- Single-line and block `if` report concise parse errors.
- In `.chs` files, errors include the line number for easier debugging.

