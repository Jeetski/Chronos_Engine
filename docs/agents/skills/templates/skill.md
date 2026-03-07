# Templates

## Purpose
Create and maintain reusable day/routine/subroutine/microroutine structures.

## When To Use
- User wants repeatable weekly/day structure.
- User asks to add/remove nested template items.

## Workflow
1. Inspect existing template or tree.
2. Add/move/remove nested items.
3. Validate ordering and durations.
4. Preview with `tomorrow`/`this`/`next` when useful.

## Command Patterns
- `template save day name:"Weekday Focus"`
- `add task "Deep Work" to day "Weekday Focus" position:2`
- `tree day "Weekday Focus"`
- `tomorrow`

## Guardrails
- Keep templates small and composable.
- Prefer editing template source over repeated one-off day edits.

## References
- `docs/guides/day_builder.md`
- `docs/guides/routine_builder.md`
- `docs/reference/item_properties.md`
