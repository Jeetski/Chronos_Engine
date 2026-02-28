# Scheduler 2.0: The "Kairos" Logic
**Status**: Specification / Final Draft
**Last Updated**: 2026-01-29

> [!NOTE]
> **Truth Sync (2026-02-28):** The DB split goals are implemented, but architecture differs from early phrasing.
> `chronos_behavior.db` and `chronos_journal.db` are produced via Sequence builders + registry wiring
> (modular pipeline), rather than a single one-shot migration stage.

## 1. Core Philosophy
*   **Weekly Microcosm**: The 7-Day Cycle is the unit of balance.
*   **The Weekly Skeleton**: A rolling 7-day outline.
*   **Scoring Sovereignty**: The user tunes the algorithm.
*   **Explainability**: The system must justify its choices.

## 2. The 7 Elements of Kairos
(Anchors, Injections, Windows, Timeblocks, Gaps, Buffers, Breaks) - *See previous sections*.

## 3. The Weighted Scoring Engine
(See previous section).

## 4. Context-Aware Templating
(See previous section).

## 5. Advanced Conflict Resolution
(See previous section).

## 6. The Data Layer (Database Evolution)
To support Kairos scoring, explainability, and context filtering, we are evolving the schema into clear, single-responsibility mirrors.

### A. chronos_core.db (The Mirror)
*   **Role**: Fast structured index of ALL YAML files.
*   **Sync Strategy**:
    *   **Startup**: Full Re-index.
    *   **Reactive**: CLI commands trigger single-row updates.
    *   **Async**: Background "Watcher" runs every 5m to catch manual edits.

### B. chronos_behavior.db (The Facts)
*   **Formerly**: `chronos_memory.db` (split into Behavior + Journal).
*   **Role**: Activity facts (Planned vs Actual), variance, completion rates.
*   **Inputs**: `chronos_core.db` schedules + completion logs.
*   **Used By**: Trends engine + Kairos weighting.

### C. chronos_journal.db (The Context)
*   **Role**: Status snapshots, daily narratives, qualitative context.
*   **Inputs**: `current_status.yml`, journal entries, reviews.
*   **Used By**: Context filtering and explainability.

### D. chronos_trends.db (The Aggregates)
*   **Role**: Long-term rollups and summaries.
*   **Inputs**: `chronos_behavior.db` (optionally `chronos_journal.db`).

### E. chronos_events.db (The Audit)
*   **Role**: Listener logs + command history + conflict logs.
*   **Used By**: Retrospectives and debugging.

### F. chronos_matrix.db (The Cache)
*   **Role**: Dashboard matrix cache (UI performance).

## 7. Construction Algorithm (Final)
1.  **Decompose Goals**.
2.  **Generate Commitments**: (Removed) Commitments are observer-only rules tied to other items; no generated instances.
3.  **Filter**: Bio-Check against `chronos_journal.db`.
4.  **Score**: Weighting Engine.
5.  **Construct**: Anchors -> Windows -> Gaps.
6.  **Log**: Write Decision Log.
