# Chronos Scheduling Algorithm Overview

## Overview

The `today` command builds and resolves a daily schedule from templates and live data. The high-level flow is:
1. Select the best day template
2. Build an "impossible ideal" schedule
3. Apply manual edits (trim/cut/change)
4. Score importance
5. Promote missed items (reschedule only)
6. Inject status-triggered items
7. Capacity check + conflict resolution loop
8. Fill work windows (flexible items)
9. Insert buffers
10. Save and display

---

## Template Selection

Templates are loaded from `User/Days/` and scored by status alignment:
- Templates with `days: [...]` are eligible only on those days.
- Templates with `status_requirements` and no `days` are eligible any day.
- Templates with neither must match the weekday filename (e.g., `Monday.yml`).
- The best score wins; a forced template can override selection.

---

## Initial Schedule Build

The engine lays out the template tree into a full schedule:
- Resolves inline items if no external item file exists.
- Applies status variants before scheduling.
- Honors `ideal_start_time` / `ideal_end_time` when present.
- Records conflicts if a duration exceeds an ideal end time.

---

## Importance Calculation (Subtractive Model)

```
Base Score: 100
For each factor: subtract penalty
Final Score: 0-100 (higher = more important)
```

Factors and weights are defined in `User/Settings/Scheduling_Priorities.yml`.

| Order | Factor | Weight | Description |
|-------|--------|--------|-------------|
| 1 | Environment | 7 | Can you do it? (place, tools) |
| 2 | Category | 6 | Life priorities |
| 3 | Happiness | 5 | Map of Happiness alignment |
| 4 | Due Date | 4 | Due date urgency (skipped if deadline exists) |
| 5 | Deadline | 5 | Hard deadline urgency |
| 6 | Status Alignment | 3 | Energy/focus match |
| 7 | Priority Property | 2 | Item importance |
| 8 | Template Membership | 1 | Structure bonus |

Notes
- If an item has both `deadline` and `due_date`, only the deadline is scored.
- Status alignment pulls rank values from `<Status>_Settings.yml` when available.

---

## Rescheduling (today reschedule)

When `today reschedule` runs:
- Missed leaf items (ended before now, not completed/skipped) are re-queued.
- Items with `reschedule_policy: manual` are ignored.
- Re-queued items get a +20 importance boost.
- The reschedule threshold is set by `rescheduling.importance_threshold` (default 30).

---

## Conflict Resolution Loop

The loop repeats until conflicts stop improving:
- **3c Prioritized Shifting**: shift the less important, non-anchor item after the more important one.
- **3d Trimming**: trim less important, trimmable items down to a 5-minute minimum.
- **3e Cutting**: remove least important items unless they are `essential` or anchors.
  - Cutting only runs when `conflict_resolution.allow_cutting` is true.

Conflicts are only overlaps between non-ancestor items (ideal end-time conflicts are reported earlier).

---

## Work Windows (Flexible Scheduling)

Templates can define window nodes (`window: true`) inside the day sequence.
Windows pull in unscheduled items (no start_time) that match the window filters and fit the time range.

---

## Buffer Insertion

Buffers are inserted after resolution using `User/Settings/Buffer_Settings.yml`:
- Template buffers for routines/subroutines/microroutines.
- Optional dynamic buffers every N minutes.

---

## Configuration Files

| File | Purpose |
|------|---------|
| `scheduling_defaults.yml` | Shipped defaults |
| `scheduling_settings.yml` | User overrides |
| `Scheduling_Priorities.yml` | Factor weights |
| `Category_Settings.yml` | Category ranks |
| `Priority_Settings.yml` | Priority ranks |
| `Status_Settings.yml` | Status types + ranks |
| `map_of_happiness.yml` | Happiness needs |
| `Buffer_Settings.yml` | Buffer rules |
