# Development Conventions

This file defines baseline development conventions for Chronos Engine.

## Naming Convention

- Use `lower_snake_case` for new directories, files, modules, and commands.
- Use lowercase folder names under `user/` for canonical item/data paths.
- Use lowercase command IDs and command filenames.

Examples:
- `user/tasks/`
- `user/schedules/`
- `modules/scheduler/`
- `commands/quickwins.py`

## Path Convention

- Prefer forward-slash canonical paths in docs and code comments: `user/settings/config.yml`.
- Windows-style paths are fine in runtime handling when required, but canonical references should still map to lowercase `user/<dir>` paths.
- Avoid introducing new uppercase path variants (for example `user/Tasks`).

## Scope Boundary

- Chronos Engine conventions apply to this repo’s main engine and docs.
- `Agents Dress Up Committee/` may maintain its own naming conventions unless explicitly standardized.

## Contributions Checklist

Before merging changes:

1. Confirm new file/folder names follow `lower_snake_case`.
2. Confirm all new `user/...` path references use normalized lowercase directory names.
3. Run:
   - `python scripts/check_docs_drift.py`
   - targeted/regression tests as appropriate.

