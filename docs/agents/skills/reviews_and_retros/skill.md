# Reviews And Retros

## Purpose
Generate and interpret daily/weekly/monthly reviews and turn insights into concrete follow-up actions.

## When To Use
- User asks for a recap/reflection.
- User asks for weekly/monthly performance view.
- Agent needs to convert trends into next-step recommendations.

## Workflow
1. Refresh data if needed (`sequence sync behavior journal trends`).
2. Run review command for requested period.
3. Extract wins, misses, and bottlenecks.
4. Propose 1-3 concrete follow-up actions.

## Command Patterns
- `review daily`
- `review weekly`
- `review monthly`
- `review export ...`
- `sequence trends`

## Guardrails
- Distinguish observed facts from recommendations.
- Avoid overfitting recommendations to one noisy day.
- Prefer actions that are schedulable and measurable.

## References
- `docs/dev/sequence.md`
- `docs/reference/cli_commands.md`
