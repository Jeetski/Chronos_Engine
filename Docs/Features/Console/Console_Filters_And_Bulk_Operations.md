# Console Filters And Bulk Operations

## Overview
Filtering and bulk execution let operators inspect and mutate collections efficiently without manual one-by-one edits.

## CLI
Core commands:
- `filter <type> ...`
- `find <type> <query> ...`
- `count <type> ...`
- `bulk <command> [dry:false]`

Example flow:
```bash
filter task status:pending priority:low
count task
bulk set priority:medium dry:false
```

Safety rules:
1. Dry-run first when available.
2. Narrow filters before destructive bulk operations.
3. Verify with `count`/`list` before and after.

## Dashboard
- Item-oriented widgets can emulate filter/bulk behavior through collection APIs.
- CLI remains the clearest high-control surface for mass operations.

## Data and Settings
- Bulk writes affect many YAML item files; use backups for large refactors.

## Validation
1. Run filter + count baseline.
2. Execute safe bulk update.
3. Confirm expected count/state changes only.

## Related Docs
- `Docs/Reference/CLI_Commands.md`
- `Docs/Agents/Skills/Item-Management/SKILL.md`
