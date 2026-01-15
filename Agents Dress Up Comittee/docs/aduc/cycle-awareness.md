# Cycle Awareness

Cycles control how familiars respond.

Modes
- `focus`: short, practical, on-task responses only.
- `break`: strict no-work, restorative responses only.
- `long_break`: strict no-work, relaxed responses only.

Data sources
- Turn snapshot fields in `conversation.json`:
  - `cycle_mode`, `cycle_length_ms`, `cycle_remaining_ms`, `cycle_started_at`, `cycle_ends_at`
- Optional inline tags in user text:
  - `[mode: break][length_ms: 300000][remaining_ms: 120000]`

Behavior
- Focus: keep replies concise and directly helpful.
- Break/long break: do not suggest tasks, code, or planning.
