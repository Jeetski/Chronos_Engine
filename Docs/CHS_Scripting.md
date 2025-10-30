# CHS Scripting Guide

Chronos executes `.chs` scripts with one command per line. Lines support quoted arguments, key:value properties, and variable expansion.

## Variables

- Set a variable: `set var name:World`
- Use in any command: `echo Hello @name` or `echo Hello @{name}`
- Escape a literal `@`: use `@@`
- Scope: Variables persist for the duration of the current console session or script execution.
- Inspect and remove:
  - `vars` — lists variables
  - `vars name:foo` — prints a single var
  - `unset var foo` — removes a var

## Properties (key:value)

- Any `key:value` tokens are parsed as properties and passed to commands (e.g., `priority:high`).
- Quote values with spaces: `category:"deep work"`.

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

- Status: `status:<key>` reads from `User/current_status.yml`
- Items: `<type>:<name>:<property>` (e.g., `task:"Deep Work":priority`)
- Existence checks:
  - Items: `exists <type>[:<name>[:<property>]]`
  - Filesystem: `exists file:<path>`, `exists dir:<path>`
  - Environment: `exists env:<NAME>`
- Literals and `@vars` are allowed on either side of operators.

### Examples

```
set var who:Alice
create note "IF Note @who" category:work priority:high

if exists note:"IF Note @who" then echo FOUND else echo MISSING
if status:energy eq high and exists env:PATH then echo READY
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

## Errors

- Single-line and block `if` report concise parse errors.
- In `.chs` files, errors include the line number for easier debugging.

