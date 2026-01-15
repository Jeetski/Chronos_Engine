# Chronos Scheduling Algorithm (Deep Dive)

This document is a detailed, code-aligned walkthrough of the `today` command pipeline.

## Core Philosophy
- **Constraint-Based**: Fits items into a 24-hour container.
- **Importance-Driven**: Higher-importance items survive conflicts; lower-importance items are shifted, trimmed, or cut.
- **Dynamic**: Adapts to user status, variants, and live signals.

## 1. Smart Template Selection
The engine selects a day template (`User/Days/*.yml`) based on:
1.  **Eligibility**
    - If `days: [...]` is present, the template is only eligible on those days.
    - If `status_requirements` exists and `days` is missing, the template is eligible any day.
    - If both are missing, the filename must match the weekday (e.g., `Monday.yml`).
2.  **Scoring**
    - Status alignment score is computed from status ranks.
    - Bonuses: +5 for day-specific filenames, +10 for positive status match.
3.  **Selection**
    - Highest score wins; explicit `forced_template` can override.

## 2. Build the Initial Schedule
The template is expanded into a full schedule tree:
- **Inline items**: If an item file is missing, the template node becomes the item.
- **Variants**: If `variants` exist, the first matching `status_requirements` variant replaces the item properties (including children).
- **Start/end times**:
  - `ideal_start_time` sets the initial start; otherwise the schedule flows forward.
  - `ideal_end_time` can override computed end time and logs a conflict if exceeded.
- **Parallel items**: `duration: parallel` marks items as parallel and zero-duration containers.

Manual edits (trim/cut/change) stored in `User/Schedules/manual_modifications_YYYY-MM-DD.yml` are applied here and then cleared.

## 3. Importance Calculation (Subtractive Model)
Every item starts at 100. Each factor subtracts a weighted penalty.

Key inputs:
- `Scheduling_Priorities.yml` (factor ranks)
- `Priority_Settings.yml` (priority rank values)
- `Category_Settings.yml` (category rank values)
- `Status_Settings.yml` + `User/Profile/Current_Status.yml`
- `map_of_happiness.yml`

Deadline vs due date:
- `deadline` is scored with a higher weight than `due_date`.
- If both exist, only the deadline is scored to avoid double counting.

## 4. Rescheduling Missed Items (today reschedule only)
Missed items are re-queued if:
- They ended before now.
- They are not completed or skipped.
- They do not set `reschedule_policy: manual`.

Re-queued items are moved after "now" and get a +20 importance boost.
The reschedule threshold is controlled by `rescheduling.importance_threshold` (default 30).

## 5. Triggered Injections
Items with `auto_inject: true` and matching `status_requirements` are injected at the top of the schedule.
Injected items respect variants and are chained in insertion order.

## 6. Capacity Check
Total scheduled duration is checked against 24 hours (1,440 minutes).
If over, a capacity conflict is logged and sent into the conflict loop.

## 7. Conflict Resolution Loop
The loop repeats until conflicts stop improving:

### 7a. Prioritized Shifting
- Shifts the less important item to start after the more important one.
- Anchors (`reschedule: false|never`) and non-flexible items do not shift.

### 7b. Trimming
- Trims the less important item down to a 5-minute minimum.
- Anchors and non-trimmable timeblocks are skipped.

### 7c. Cutting
- Cuts the least important item unless it is `essential` or an anchor.
- Cutting only runs when `conflict_resolution.allow_cutting` is true.

Conflicts are overlap-based; ideal-end-time conflicts are only recorded during initial build.

## 8. Work Windows (Flexible Scheduling)
Work windows are template nodes with `window: true` in the main sequence.
Each window:
- Defines a time range (`start`/`end`) and filter rules.
- Pulls in unscheduled items (no start_time) that match the filters.
- Places items into the first available gap inside the window.

## 9. Buffer Insertion
Buffers are inserted after resolution via `User/Settings/Buffer_Settings.yml`:
- Template buffers for routines/subroutines/microroutines.
- Dynamic buffers every N minutes when enabled.

## 10. Display Modes
- `today` shows only in-progress and upcoming items (parents kept if any child is relevant).
- `today reschedule` shows the reconstructed plan plus re-queued items.

## Work Windows vs. Time Blocks

| Feature | Time Block (Fixed Item) | Work Window (Dynamic Container) |
| :--- | :--- | :--- |
| **Definition** | A specific activity scheduled at a fixed time. | A reserved period for a *category* of work. |
| **Example** | `Meeting at 10:00 (60m)` | `Deep Work 09:00-12:00` |
| **Content** | Static (defined in template). | Dynamic (filled from the backlog based on filters). |
| **Flexibility** | Rigid. Forces other items to move. | Flexible. Adapts to what tasks are available. |
| **Use Case** | Appointments, routines, deadlines. | Focus time, "office hours", creative blocks. |

Summary:
- Use **time blocks** for fixed, non-negotiable activities.
- Use **work windows** to reserve space for a *type* of work without specifying the exact item.
