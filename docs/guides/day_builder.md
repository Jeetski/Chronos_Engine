# Day Builder Guide

Day Builder is a scheduling-first Dashboard view for composing and iterating on day-template drafts using drag-and-drop blocks.

## What It Is

- A visual day-construction surface for schedulable blocks.
- Focused on building/arranging schedules and day templates.
- Uses existing Chronos APIs and CLI bridge under the hood.

## Supported Block Families

- `task`
- `habit` (includes `chore` alias)
- `routine`
- `subroutine`
- `microroutine` (includes `habit_stack` alias)
- `window`
- `timeblock`
- `buffer` (scheduler block)
- `break` (scheduler block)

Notes:
- `buffer` and `break` are treated as scheduler blocks in this view and are offered as built-ins.

## Main Layout

- Left: **Schedulables palette** (search + type chips).
- Center: **Day timeline** (drop zones + block list + schedule actions).
- Right: **Inspector** (day-template properties + selected-block editor).

## Template Lifecycle

Day template controls are available at top of the center column:

- `New Template`
- `Load Template`
- `Save Template`
- `Save As`
- `Rename`
- `Delete`
- `Refresh`

Template persistence uses:
- `GET /api/template/list?type=day`
- `GET /api/template?type=day&name=<name>`
- `POST /api/template`
- `POST /api/item`
- `POST /api/item/rename`
- `POST /api/item/delete`

## Loading Generated Schedules

- `Load Today` loads current-day generated schedule.
- `Load Date Schedule` loads `user/Schedules/schedule_YYYY-MM-DD.yml`.

If a current-day file lookup fails, Day Builder can fall back to `GET /api/today`.

## Applying a Draft to Today

`Apply Draft To Today` performs:

1. Draft validation
2. Template save
3. CLI bridge call: `today reschedule template:<name>`

This is intended for quickly promoting a draft into today’s active schedule pipeline.

## Block Inspector

For the selected block:

- Type, name, duration
- Start/end times
- `Pinned Anchor`
- Auto-end helper (derive end from start + duration)
- Hierarchy level + indent/outdent

Type-specific fields:

- Window:
  - `window_name`
  - `window filters` (YAML map)
- Timeblock:
  - subtype selector (`generic`, `free`, `category`, `buffer`, `break`)

## Day Template Properties

Template-level metadata editor supports:

- `category`
- `tags` (comma-separated)
- `notes`
- `status_requirements` (YAML map)
- extra top-level properties (YAML map)

## Scheduling Utilities

- `Auto Buffers/Breaks` (with toggles for buffers and breaks)
  - Reads:
    - `user/Settings/Buffer_Settings.yml`
    - `user/Settings/Timer_Settings.yml`
    - `user/Settings/Timer_Profiles.yml`
- `Snap 5m`
- `Auto Pack` from a configurable start time
- `Validate` (time sanity + overlap checks)
- `Undo` / `Redo`
- `QA` quick status check
- `Copy Draft JSON`

## Validation Checks

Current validator flags:

- Invalid `HH:MM` values
- End time earlier than/equal to start time
- Non-positive duration
- Anchors without fixed times
- Overlap between fixed-time blocks

## Current Constraints

- Day Builder is scheduling-focused, not a full execution-action console.
- Explainability overlays (why Kairos selected blocks) are not implemented in this view.


