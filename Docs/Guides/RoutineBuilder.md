# Routine Builder Guide

Routine Builder is a template-composition Dashboard view for creating and editing `routine`, `subroutine`, and `microroutine` templates with drag-and-drop blocks.

## What It Is

- A focused builder for reusable routine templates (not day schedules).
- Uses the same interaction style as Day Builder: palette + timeline + inspector.
- Saves through existing template/item APIs.

## Supported Schedulables

- `routine`
- `subroutine`
- `microroutine` (includes `habit_stack` alias)
- `habit` (includes `chore` alias)
- `task`
- `window`
- `buffer`
- `break`

Notes:
- `buffer` and `break` are treated as scheduler blocks in this view.
- `window` entries support `window_name` and YAML `filters`.

## Main Layout

- Left: **Schedulables palette** (search + type filter dropdown).
- Center: **Template timeline** (drag/drop ordering + controls).
- Right: **Inspector** (template properties + selected-block editor).

## Template Lifecycle

- Choose template type: `routine`, `subroutine`, or `microroutine`.
- Controls:
  - `Load`
  - `Save`
  - `Save As`
  - `New`
  - `Rename`
  - `Delete`
  - `Refresh`
- APIs used:
  - `GET /api/template/list?type=<type>`
  - `GET /api/template?type=<type>&name=<name>`
  - `POST /api/template`
  - `POST /api/item`
  - `POST /api/item/rename`
  - `POST /api/item/delete`

## Block Inspector

For selected blocks:

- Type, name, duration
- Start/end times
- `Pinned Anchor`
- Hierarchy level (`Indent`/`Outdent`)
- Window fields (`window_name`, `window filters`)

## Draft Tools

- `Auto Buffers/Breaks` (reads Buffer/Timer settings)
- `Undo` / `Redo`
- `Snap 5m`
- `Auto Pack`
- `Validate`
- `QA`
- `Clear`
- `Copy JSON`

## Validation Checks

- Invalid `HH:MM` values
- End time earlier than/equal to start time
- Non-positive duration
- Anchors without fixed times
- Overlap between fixed-time blocks

## Current Constraints

- Routine Builder does not apply drafts directly to today.
- It is for routine-template authoring and maintenance.

