# Prompt Merge

This describes how ADUC builds the prompt for a familiar before replying.

Direct chat (backend `/chat`)
- `docs/agent.md`
- `docs/personality.md`
- `docs/coding.md` (optional, prefixed with `[Coding Support]`)
- `Current Emotional State: <state.json.emotion>`
- `memory.json` (optional, only if enabled)
- `docs/lore.md` (optional, only if immersive)

CLI bridge (watcher)
- Familiar docs are injected when new or changed; otherwise a cache marker is used.
- Chronos mode adds Chronos protocols and optional external context.
- Cycle state and policy summaries are added to enforce focus/break behavior.

See also: `docs/agents/AGENTS.md` for the external agent contract.
