# Tracking And Review

## Purpose
Track progress quality and produce daily/weekly/monthly feedback loops.

## When To Use
- User asks for progress summaries.
- User wants a review export or quick wins list.

## Workflow
1. Pull current tracking for target items.
2. Generate review period output.
3. Surface next actions with quick wins.

## Command Patterns
- `track task "Deep Work"`
- `quickwins limit:10`
- `review daily`
- `review weekly`
- `review monthly`
- `sequence trends`

## Guardrails
- Separate factual summary from recommendations.
- Prefer current completion data over assumptions.

## References
- `Docs/dev/sequence.md`
- `Docs/features/achievements_progression_system.md`
