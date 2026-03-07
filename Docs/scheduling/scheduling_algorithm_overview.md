# Chronos Scheduling Algorithm Overview (Kairos)

Last verified: 2026-03-07  
Primary code: `Commands/today.py`, `Modules/scheduler/kairos.py`, `Modules/scheduler/weekly_generator.py`

## Scope

This document describes the active Chronos scheduler: **Kairos**.

- Active production path: `today`, `today reschedule`
- Diagnostics/preview path: `today kairos ...`, `today kairos week ...`
- Legacy mode exists only as compatibility fallback and is intentionally out of scope here.

Related:
- `Docs/scheduling/kairos_elements_reference.md` (definitions of windows, timeblocks, buffers, anchors, injections, dependencies)

## Active Execution Paths

1. `today`
- Runs Kairos with current context and shows today’s schedule.

2. `today reschedule`
- Rebuilds today from current time and current state.
- Carries manual edits/injections into the rerun context.

3. `today kairos ...`
- Shadow/diagnostic generation using explicit runtime options.

4. `today kairos week [days:N]`
- Rolling horizon skeleton generation via `WeeklyGenerator`.

## Kairos Pipeline

1. Runtime load
- Status context (`status_settings.yml` + current status)
- Scheduling priorities and per-run overrides
- Buffer/timer/quick-wins settings
- Trend reliability from behavior mirror
- Completion logs and recent misses

2. Template and window resolution
- Forced template wins if supplied.
- Otherwise strict selection (day eligibility + place + status, then day + place).
- Collects `window` nodes and template `timeblock` nodes.

3. Candidate gather + hard filter
- Pull executable rows from `chronos_core.db`.
- Remove completed/skipped rows, non-executables, place/status mismatches, pathological durations.

4. Additive scoring
- Weighted contributions from priority/category/environment/due/deadline/happiness/status/trends/custom property.
- Optional missed-work promotion.

5. Timeline construction
- Anchors first (fail-fast on unresolved anchor conflicts).
- Manual injections, auto-injections, window placement.
- Template timeblocks and quick-win gap fill.
- Synthetic buffers/breaks insertion if enabled.

6. Repair + dependency enforcement
- Shift-first overlap repair with optional trim/cut fallback.
- `depends_on` propagation to keep prerequisite ordering.

7. Completion marker rehydration
- Completed entries reinserted as informational markers after planning.

8. Output + observability
- Persist active schedule to `User/Schedules/schedule_YYYY-MM-DD.yml`.
- Emit decision logs to `User/Logs/kairos_decision_log_*`.

## `today reschedule` Semantics

Kairos reschedule behavior is intentionally "live-day aware":
- Uses remaining-day capacity (`start_from_now=true`).
- Promotes recent misses when configured.
- Applies manual modifications and injection records.
- Writes auto-cut outcomes as skipped completion entries for consistency.

## Runtime Controls (Chronos syntax)

- `template:<name|path>`
- `status:key=value,key=value`
- `prioritize:key=value,key=value`
- `custom_property:<property_name>`
- `buffers:true|false`
- `breaks:timer|none`
- `sprints:true|false`
- `timer_profile:<profile_name>`
- `quickwins:N`
- `ignore-trends` or `ignore-trends:true|false`
- `days:N` (weekly mode)

## Key Files

- `Commands/today.py`
- `Modules/scheduler/kairos.py`
- `Modules/scheduler/weekly_generator.py`
- `User/Settings/scheduling_priorities.yml`
- `User/Settings/status_settings.yml`
- `User/Settings/buffer_settings.yml`
- `User/Settings/timer_settings.yml`
- `User/Settings/timer_profiles.yml`
- `User/Settings/quick_wins_settings.yml`
- `User/Data/chronos_core.db`
- `User/Data/chronos_behavior.db`

## Debug Baseline

1. Run: `today kairos ...`
2. Inspect:
- `User/Logs/kairos_decision_log_latest.md`
- `User/Logs/kairos_decision_log_latest.yml`
3. Adjust status/template/anchors/settings.
4. Apply with `today reschedule`.
