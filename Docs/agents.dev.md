# Chronos Engine: Agent Development Guide

Technical overview of the Chronos Engine for AI agents involved in development and extension work.

## Architecture
- Core Engine (`Modules/Console.py`): command parsing, dispatch, interactive mode.
- Item Manager (`Modules/ItemManager.py`): filesystem ops, YAML IO, editor logic.
- Commands (`Commands/`): thin dispatchers using ItemManager/Scheduler.
- Modules (`Modules/<Type>/main.py`): item-specific logic and defaults.

## Data Model
- Items stored as YAML under `User/<Type>s`.
- Defaults in `User/Settings/*_defaults.yml`.
- Settings for priorities/status in `User/Settings`.

## Parsing
- Inputs split into command, args, and `key:value` properties.

## Scripting
- `.chs` files: one command per line, `#` for comments.

## Adding a New Item Type
1) Create `Modules/Project/main.py` and set `ITEM_TYPE = "project"`.
2) Implement handlers and use ItemManager.
3) Add defaults in `User/Settings/Project_Defaults.yml`.

## Adding a New Command
1) Create `Commands/report.py`.
2) Implement `run(args, properties)`.
3) Use ItemManager/Scheduler utilities.

## `today` Algorithm (phases)
- Build ideal schedule, detect conflicts, compute importance, shift/trim/cut, then buffer.

