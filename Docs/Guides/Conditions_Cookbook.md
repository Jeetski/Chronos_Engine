# Conditions Cookbook

Practical `if` patterns for Chronos scripts.

## Basics

- Status gates:
  - `if status:energy lt 30 then echo LOW_ENERGY`
  - `if status:focus ge 70 then echo FOCUSED`

- Variables and items:
  - `set var target:Alice`
  - `if note:"Daily Log @target":category eq work then echo WORK_LOG`

## Existence Checks

- Item exists:
  - `if exists task:Morning_Run then echo CONSISTENCY`

- Property exists:
  - `if exists task:Morning_Run:duration then echo TIMED`

- Any of type exists:
  - `if exists task then echo THERE_IS_WORK`

- Filesystem and environment:
  - `if exists file:README.md then echo HAVE_README`
  - `if exists dir:User/Notes then echo NOTES_DIR_PRESENT`
  - `if exists env:PATH then echo HAS_PATH`

## Regex Matching

- Priority starts with h:
  - `if task:"Deep Work":priority matches ^h.* then echo HIGH`

- Notes containing keyword:
  - `if note:"Idea 2025":name matches 2025 then echo TAGGED_2025`

## Combining Logic

- Parentheses and precedence:
  - `if ( status:energy gt 50 and status:focus gt 50 ) or status:emotion eq happy then echo GREEN_LIGHT`

- XOR and NOR:
  - `if status:energy eq high xor status:emotion eq sad then echo MIXED_STATE`
  - `if status:energy eq high nor status:emotion eq happy then echo NOT_READY else echo READY`

- Negation:
  - `if not exists note:"Reflection" then echo CREATE_REFLECTION`
  - `if ! ( status:focus lt 30 ) then echo FOCUS_OK`

## Tips

- Quote names with spaces: `task:"Deep Work"`
- Use `@{var}` for clarity when adjacent to letters/digits.
- Prefer block `if` for multiple commands; single-line is great for one-offs.

