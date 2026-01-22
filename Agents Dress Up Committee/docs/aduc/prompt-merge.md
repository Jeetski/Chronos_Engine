# Prompt Merge

This describes how ADUC builds the prompt for a familiar before replying.

## Declarative merge maps (per-familiar)

Each familiar can ship a `merge.json` and an optional `chronos-merge.json` in
`familiars/<name>/docs/` to document the exact merge order and sources. These
files are intended to be the single source of truth for prompt composition so
the merge plan can evolve without code changes.

Current status: documentation only. The watcher still uses hardcoded merge
logic, but the merge maps mirror the current behavior and are ready to drive
future refactors.

Files:
- `familiars/<name>/docs/merge.json`
- `familiars/<name>/docs/chronos-merge.json`

Conventions used in `merge.json`:
- `first_prompt.static_files`: files injected on the first prompt (large merge).
- `first_prompt.dynamic_blocks`: runtime-only blocks (state, policies, etc.).
- `per_message.static_files`: files injected on every turn after the first.
- `per_message.dynamic_blocks`: runtime-only blocks on every turn.
- `optional`: conditional blocks keyed by settings or env vars.

Conventions used in `chronos-merge.json`:
- `enabled_by`: activation signals (e.g., `ADUC_EXTERNAL_CONTEXT_FILE`).
- `static_files`: Chronos-only static docs.
- `dynamic_blocks`: dynamic Chronos blocks (e.g., external context).
- `chronos_docs_watch`: the Chronos docs list used for update notes.

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
