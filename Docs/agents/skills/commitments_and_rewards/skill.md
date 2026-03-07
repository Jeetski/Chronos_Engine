# Commitments And Rewards

## Purpose
Operate the accountability/economy loop: commitments evaluation, reward redemption, achievements updates, and points-aware behavior.

## When To Use
- User asks to check commitments.
- User asks about rewards/points/achievement progress.
- Agent needs to trigger or verify commitment outcomes.

## Workflow
1. Inspect current commitments/rewards/points state.
2. Run commitment evaluation.
3. Apply reward/achievement actions as needed.
4. Report what fired and why.

## Command Patterns
- `commitments check`
- `view commitment "<name>"`
- `list commitments`
- `points balance`
- `redeem reward "<name>"`
- `view achievement "<name>"`

## Guardrails
- Explain point costs and cooldown effects before redeeming.
- Treat commitments as observer/evaluator rules, not direct executable tasks.
- Avoid duplicate reward or completion effects for same event.

## References
- `Docs/agents/skills/index.md`
- `Docs/reference/cli_commands.md`
- `Docs/features/achievements_progression_system.md`
