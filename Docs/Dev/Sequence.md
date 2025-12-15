# Sequence Mirrors & Data Pipeline

Chronos ships a `sequence` CLI that builds fast mirrors of your YAML data. This guide explains what gets produced, where it lives, and when to run it.

## Mirrors

- `User/Data/chronos_core.db` — canonical mirror of YAML items, relations, completions, schedules.
- `User/Data/chronos_matrix.db` — analytics cache that powers Matrix panels/queries.
- `User/Data/chronos_events.db` — listener log stream plus command/trigger history.
- `User/Data/chronos_memory.db` — planned vs. actual activity facts and status snapshots.
- `User/Data/chronos_trends.db` — derived trends store.
- `User/Data/trends.md` — human-readable digest of completion rates/variance for agents.
- `User/Data/databases.yml` — registry of known mirrors and their state.
- `User/Data/sequence_automation.yml` — listener automation state for nightly syncs.

## Commands

- `sequence status` — list every mirror in `databases.yml` and whether it’s current.
- `sequence sync <targets>` — rebuild specific mirrors. Targets: `core`, `matrix`, `events`, `memory`, `trends`. Omit to refresh everything.
- `sequence trends` — shortcut: rebuilds memory/trends and rewrites `trends.md`.

## When to run

- After significant item edits/imports (bulk YAML changes) to keep dashboards/agents in sync.
- Before citing behavior stats from `trends.md` if the listener hasn’t run its nightly job.
- After upgrading Chronos modules that change the data model.

## Automation

The Listener calls `sequence sync memory trends` shortly after midnight (tracked in `User/Data/sequence_automation.yml`) so the dashboard starts each day with fresh summaries. If you disable the listener, schedule `sequence trends` yourself.

## Consumers

- Dashboard panels/widgets (Matrix, Commitments, Schedule overlays) pull from mirrors for speed.
- Agents should prefer mirrors for analytics-heavy queries instead of reparsing YAML.

## Tips

- YAML remains the source of truth; mirrors are rebuildable. If a DB corrupts, delete it and rerun `sequence sync`.
- Keep `User/Data` under source control ignore rules to avoid noisy diffs.
