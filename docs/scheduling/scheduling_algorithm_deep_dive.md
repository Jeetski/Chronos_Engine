# Chronos Scheduling Algorithm Deep Dive (Kairos)

Last verified: 2026-03-07  
Code alignment target: `modules/scheduler/kairos.py` and `commands/today.py`

## 1. Command Routing (`commands/today.py`)

Kairos-relevant modes:

1. `today kairos ...`
- Shadow diagnostics and explicit option testing.

2. `today` / `today reschedule`
- Active Kairos scheduling path.
- Persists active schedule to `schedule_YYYY-MM-DD.yml`.

`today legacy ...` exists for compatibility but is outside this deep dive.

## 2. Runtime Initialization (`KairosScheduler._load_runtime`)

Kairos loads and normalizes:
- Status model and current status values.
- Happiness map and scheduling priority weights.
- Buffer/timer/quick-wins settings.
- Trend reliability map from behavior mirror.
- Completion entries for target date.
- Recent misses for missed-promotion logic.

Important runtime options include:
- `force_template`
- `status_overrides`
- `prioritize`
- `status_match_threshold`
- `custom_property`
- `use_buffers`
- `use_timer_breaks`
- `use_timer_sprints`
- `timer_profile`
- `ignore_trends`
- `start_from_now`
- repair controls (`repair_trim`, `repair_cut`, thresholds)

## 3. Template Selection and Window Extraction

`_resolve_windows` picks planning scaffold:
- Forced template if provided.
- Otherwise strict day template selection (eligibility + place + status, then eligibility + place).

Then recursively collects:
- `window: true` nodes as dynamic placement containers.
- `timeblock` nodes and referenced timeblock templates.

## 4. Candidate Gather (`gather_candidates`)

Source: `User/Data/chronos_core.db` table `items`.

Loaded rows include:
- executable families (`task`, `habit`, `subroutine`, `microroutine`)
- commitment rows for context telemetry (later excluded from execution)

Each row keeps rich payload fields for downstream filter/score decisions.

## 5. Candidate Filter (`filter_candidates`)

Hard gates before scoring:
- drop already completed/skipped rows for target day
- drop observer-only/non-executable/container rows
- reject place mismatches and invalid durations
- enforce status requirement match threshold

Output is the executable, normalized candidate set.

## 6. Scoring (`score_candidates`)

Kairos uses additive weighted scoring.

Score sources:
- priority
- category
- environment/place compatibility
- due/deadline urgency
- happiness mapping
- status alignment
- trend reliability
- optional custom-property boost
- optional missed-promotion boost

Each candidate stores:
- `kairos_score`
- `_score_reasons` (human-readable reason trace)

## 7. Timeline Construction (`construct_schedule`)

Placement order is intentional:

1. Anchors
- Place fixed/anchored blocks first.
- Unresolved anchor overlap invalidates run (`invalid_reason: anchor_conflicts`).

2. Manual injections
- Apply soft/hard injections from modification logs.

3. Auto injections
- Place `auto_inject: true` items in earliest feasible segments.

4. Window placement
- Fill each window with highest-ranked compatible candidates.

5. Template timeblocks
- Integrate category/free/buffer timeblock semantics.

6. Gap fill
- Fill leftover segments with quick-win items when enabled.

7. Synthetic timeblocks
- Insert dynamic/template buffers and timer-profile breaks when configured.

## 8. Repair and Dependency Passes

### 8.1 Overlap Repair (`_repair_timeline_shift`)
- Shift-first strategy.
- Optional trim fallback (`repair_trim`) with minimum duration bound.
- Optional cut fallback (`repair_cut`) with threshold controls.
- Emits structured repair events.

### 8.2 Dependency Propagation (`_propagate_dependency_shifts`)
- Enforces `depends_on` ordering after overlap repair.
- Cascades adjustments through dependency chains.
- Reports unresolved dependency violations.

## 9. Completion Marker Rehydration

After placement and repair, completion entries are reinserted as informational schedule markers so the day view reflects completed history without distorting planning math.

## 10. Active Output Adaptation (`commands/today.py`)

Kairos block output is adapted into the schedule schema consumed by existing dashboard and CLI flows:
- normalized `start_time` / `end_time`
- duration/status fields
- hierarchy/window compatibility shape

## 11. Decision Logs (`KairosScheduler.explain_decisions`)

Each run emits:
- Markdown explainability summary
- YAML payload with `phase_notes` and final blocks

Paths:
- `User/Logs/kairos_decision_log_<timestamp>.md`
- `User/Logs/kairos_decision_log_<timestamp>.yml`
- `User/Logs/kairos_decision_log_latest.md`
- `User/Logs/kairos_decision_log_latest.yml`

## 12. Weekly Skeleton (`modules/scheduler/weekly_generator.py`)

`today kairos week [days:N]`:
- runs Kairos generation per day in horizon
- summarizes validity/template/window/anchor outcomes
- does not overwrite active day schedule

## 13. Practical Debug Flow

1. Run shadow generation: `today kairos ...`
2. Inspect latest decision logs.
3. If invalid:
- resolve anchor/time conflicts first
4. If underfilled:
- inspect window filters, status thresholds, candidate eligibility
5. If over-cut/over-trim:
- tune repair settings, priorities, and anchor/essential properties
6. Re-run active path: `today reschedule`

