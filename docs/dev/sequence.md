# Sequence Mirrors & Data Pipeline

Chronos ships a `sequence` CLI that builds fast mirrors of your YAML data. This guide explains what gets produced, where it lives, and when to run it.

## Mirrors

- `user/data/chronos_core.db` — canonical mirror of YAML items, relations, completions, schedules.
- `user/data/chronos_matrix.db` — analytics cache that powers Matrix panels/queries.
- `user/data/chronos_events.db` — listener log stream plus command/trigger history.
- `user/data/chronos_behavior.db` — planned vs. actual activity facts + variance.
- `user/data/chronos_journal.db` — status snapshots + narratives.
- `user/data/chronos_trends.db` — derived trends store.
- `user/data/trends.md` — human-readable digest of completion rates/variance for agents.
- `user/data/databases.yml` — registry of known mirrors and their state.
- `user/data/sequence_automation.yml` — listener automation state for nightly syncs.
  - Deprecated: `chronos_memory.db` (replaced by behavior + journal).

## Commands

- `sequence status` — list every mirror in `databases.yml` and whether it’s current.
- `sequence sync <targets>` — rebuild specific mirrors. Targets: `core`, `matrix`, `events`, `behavior`, `journal`, `trends`. Omit to refresh everything.
- `sequence trends` — shortcut: rebuilds behavior/trends and rewrites `trends.md`.

## When to run

- After significant item edits/imports (bulk YAML changes) to keep dashboards/agents in sync.
- Before citing behavior stats from `trends.md` if the listener hasn’t run its nightly job.
- After upgrading Chronos modules that change the data model.

## Automation

The Listener calls `sequence sync behavior journal trends` shortly after midnight (tracked in `user/data/sequence_automation.yml`) so the dashboard starts each day with fresh summaries. If you disable the listener, schedule `sequence trends` yourself.

## Consumers

- Dashboard panels/widgets (Matrix, Commitments, Schedule overlays) pull from mirrors for speed.
- Agents should prefer mirrors for analytics-heavy queries instead of reparsing YAML.

## Tips

- YAML remains the source of truth; mirrors are rebuildable. If a DB corrupts, delete it and rerun `sequence sync`.
- Keep `user/data` under source control ignore rules to avoid noisy diffs.


