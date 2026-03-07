# Template Authoring Advanced

## Purpose
Design and refactor advanced reusable template systems (week/day/routine/subroutine/microroutine) with windows, timeblocks, status-aware variants, and maintainable hierarchy.

## When To Use
- User requests complex template architecture.
- Existing templates are hard to maintain or conflict-prone.
- Agent needs advanced scheduling structure changes beyond simple template edits.

## Workflow
1. Inspect current template tree and constraints.
2. Define target structure (windows, timeblocks, nested routines).
3. Apply incremental template updates.
4. Validate with `tomorrow` / `this` / `next`.
5. Iterate until stable.

## Command Patterns
- `template ...`
- `add <item> to <template> position:N`
- `tree <type> <name>`
- `tomorrow`
- `today kairos ...` (for diagnostics)

## Guardrails
- Avoid massive one-shot rewrites; use staged refactors.
- Keep windows/timeblocks intentional and documented.
- Validate status_requirements and dependency fields after major edits.

## References
- `Docs/Guides/DayBuilder.md`
- `Docs/Guides/RoutineBuilder.md`
- `Docs/Scheduling/Kairos_Elements_Reference.md`
- `Docs/Reference/Item_Properties.md`
