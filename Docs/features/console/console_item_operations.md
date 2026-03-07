# Console Item Operations

## Overview
Item operations are the foundation of Chronos. Most entity types share one command grammar through common handlers.

## CLI
Core operations:
- create: `new|create <type> <name> [key:value ...]`
- inspect: `view`, `list`, `find`, `count`
- update: `append`, `set`, `remove`
- lifecycle: `copy`, `rename`, `move`, `delete`

Examples:
```bash
new task "Write outline" due_date:2026-03-08 priority:high
append task "Write outline" "Add section on risks"
set task "Write outline" status:completed
copy task "Write outline" "Write outline v2"
```

Best practices:
1. Use defaults files for repeatable fields (`User/Settings/*_defaults.yml`).
2. Prefer `set`/`append` over manual file edits for consistent formatting.
3. Confirm changes with `view` after critical updates.

## Dashboard
- Item Manager, Notes, Journal, Goal/Milestone widgets map to the same underlying item APIs.
- Mixed CLI + dashboard workflows are safe when both use canonical item commands/APIs.

## Data and Settings
- Primary state: `User/<TypePlural>/*.yml`.
- Defaults: `User/Settings/<type>_defaults.yml`.

## Validation
1. Create an item with properties.
2. Update it with `append` and `set`.
3. Rename/copy/delete in a controlled test case.

## Related Docs
- `Docs/reference/cli_commands.md`
- `Docs/reference/item_properties.md`
