# Cockpit Matrix Panel - Design Outline

The Matrix panel is a cockpit view that lets pilots juxtapose two dimensions of Chronos data (rows vs. columns) and inspect the intersections. Think of it as a Chronos-aware pivot table: you pick what each axis represents (e.g., item type vs. status, project vs. weekday), choose what the cells should display (counts, total minutes, lists), and the panel fills in the grid by reading the existing YAML datasets.

## Goals

- Provide a flexible inspection surface inside the Cockpit so users can see cross-cutting patterns without chaining multiple CLI commands.
- Make repetition-friendly dashboards (habit streak boards, template coverage grids, etc.) possible without bespoke widgets.
- Keep it extensible: new dimensions/metrics should drop in without reworking the panel.

## UX / Panel Anatomy

1. **Config bar** (top of the panel)
   - Row dimension dropdown.
   - Column dimension dropdown.
   - Metric selector (what the cell displays).
   - Optional filters (item type, status, date range) and a refresh button.
2. **Grid canvas**
   - Sticky headers with human-friendly labels.
   - Cells display the metric value, formatted appropriately (count, minutes, percentage, etc.).
   - Hover shows a tooltip with sample items; click can deep-link (open Item Manager filtered to that intersection or copy data).
3. **States**
   - Loading indicator while fetching matrix data.
   - Empty message when no items match the current config.
   - Error banner if the API call fails.

## Dimensions (first pass)

| ID | Label | Description |
| --- | --- | --- |
| `item_type` | Item Type | Tasks, routines, goals, etc. (derived from directories under `User/`). |
| `status_tag` | Status Requirement | Parsed from `status_requirements` / legacy keys (`focus`, `energy`, etc.). |
| `item_status` | Item Status | Values like pending/completed/skipped pulled from YAML. |
| `priority` | Priority | Uses labels defined in `Priority_Settings.yml`. |
| `project` | Project | Task `project:` property or parent routine. |
| `template` | Day Template | Names from `User/Days/*.yml`. |
| `routine` | Routine | Routine names or instances present in the schedule. |
| `weekday` | Weekday | Monday-Sunday, based on scheduled items/completions. |
| `date` | Date | Rolling N-day window, tied to completion logs. |
| `habit` | Habit | Habit names (useful vs. dates). |
| `commitment` | Commitment | For mapping commitments across time or item types. |

(Architecture allows additional dimensions later: tags, point range, timer profile, etc.)

## Metrics

| Metric ID | Description | Notes |
| --- | --- | --- |
| `count` | Number of items matching the row/column intersection. | Default metric. |
| `duration` | Total scheduled/declared minutes. | Sum `duration` fields or schedule blocks. |
| `points` | Sum of `points` field (rewards/achievements). | Useful for gamification audits. |
| `list` | Render a short list of item names. | Expand via tooltip on hover. |
| `completion_rate` | % completed vs. scheduled. | Requires schedule + completion data. |
| `streak` | Habit streak length. | Works when rows or cols are habits/dates. |

Each metric defines:
- Supported dimensions.
- Aggregation logic (e.g., sum durations, compute percentage).
- Formatting (integer, minutes, percentage, textual list).

## API Shape

Endpoint: `GET /api/cockpit/matrix`

Query params:
- `row=<dimension>`
- `col=<dimension>`
- `metric=<metric>`
- `filters=<urlencoded JSON or key:value pairs>`
- `range=<ISO date range>` (optional)

Response:
```
{
  "rows": [ { "id": "task", "label": "Tasks" }, ... ],
  "cols": [ { "id": "pending", "label": "Pending" }, ... ],
  "cells": {
    "task|pending": {
      "value": 12,
      "items": ["Daily Planning", "Inbox Sweep"],
      "meta": { "unit": "count" }
    },
    "task|completed": { "value": 8 }
  },
  "meta": {
    "metric": "count",
    "filters": { "priority": "high" }
  }
}
```

Implementation notes:
- Build a dimension registry on the server: each entry exposes `id`, `label`, `enumerate()` method, and optional helpers (e.g., `deriveKey(item)`).
- Matrix service loads relevant YAML (using ItemManager where possible), groups by row/column keys, and computes the metric.
- Cache responses temporarily for identical configs to keep cockpit snappy.

## Panel Implementation

File: `Utilities/Dashboard/Panels/Matrix/index.js`

1. Register with Cockpit manager:
```
manager.registerPanel({
  id: 'matrix',
  label: 'Matrix',
  defaultVisible: false,
  size: { width: 540, height: 420 },
  mount: (el, context) => { ... },
});
```
2. Render config controls (row/col/metric/filter).
3. Fetch `/api/cockpit/matrix` using the chosen config; show loading state.
4. Render a table/virtualized grid with sticky headers and tooltip/click behaviors.
5. Offer quick actions: copy cell data, open Item Manager filtered for the intersection (`POST /api/item` or `POST /api/cli`).
6. Persist the last config per panel instance so cockpit state survives reloads.

## Future Enhancements

- Saved presets (-Status vs. Item Type-, -Habits vs. Weekdays-).
- Heatmap coloring or conditional formatting per metric.
- Export to CSV / copy entire grid.
- Inline actions (e.g., create a new task in the selected row/column intersection).
- Multi-metric view per cell (count + minutes as stacked info).

---
This spec provides enough detail to implement the Matrix panel: define dimensions/metrics, add the API endpoint, then build the cockpit UI that consumes it.
