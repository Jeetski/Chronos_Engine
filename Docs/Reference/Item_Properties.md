# Standard Item Properties

This is a practical reference of item properties that Chronos actively uses today.  
It focuses on fields that are **wired into scheduling, completion, filtering, and UI logic**.

General (all item types)
- `name` (string): Human-readable name. Used as the primary identifier in schedules.
- `type` (string): Item type (task, habit, routine, etc.). Determines storage folder and behavior.
- `status` (string): Used across UI and logic; common values: `pending`, `completed`, `skipped`, `partial`.
- `tags` (list or comma string): Used by filters, windows, dashboards.
- `category` (string): Used in importance scoring and filtering.
- `priority` (string): Used in importance scoring via `Priority_Settings.yml`.
- `duration` (string or number): Used for scheduling. Accepts minutes (e.g., `30`) or strings like `45m`, `1h`.
- `sleep` (bool): Canonical sleep marker (`true`/`false`). Prefer this over name/tag heuristics when identifying sleep-related items/anchors.

Scheduling / Templates
- `ideal_start_time` / `ideal_end_time` (HH:MM): Used during schedule build to anchor the ideal time window.
- `start_time` / `end_time` (HH:MM or datetime): Used in schedules and completion logs.
- `reschedule` (bool or string): `false` / `never` makes an item an anchor (won’t move/trim/cut).
- `reschedule_policy` (string): `auto` (default) or `manual` (skip auto-reschedule).
- `flexible` (bool): If false, scheduler won’t shift the item.
- `absorbable` (bool): For timeblocks; if false, timeblock is not trimmable.
- `essential` (bool): Protected from cutting during conflicts.
- `depends_on` (list of names): Dependency tracking for shift propagation.
- `children` / `sequence` / `items` (list): Template children nodes.

Variants / Status-Aware Scheduling
- `status_requirements` (map): Gates template selection and variant matching.
- `variants` (list): Each variant can override fields if its `status_requirements` match.
- `<StatusName>` (legacy keys): Treated like status requirements by the scheduler.

Auto-Injection
- `auto_inject` (bool): Injects item at top of schedule if `status_requirements` match.

Work Windows (template nodes)
- `window` (bool): Marks a template node as a work window.
- `start` / `end` (HH:MM): Window time range.
- `filters` (map): Filter rules used to pull eligible items into the window.

TimeBlocks (template nodes)
- `type: timeblock`
- `subtype: buffer|category|free`
- `duration`: Total block time.  
Note: timeblock subtypes are documented but not fully implemented in scheduling logic yet.

Completion Logging
- `due_date` (YYYY-MM-DD): Used in quick wins and importance scoring.
- `deadline` (YYYY-MM-DD): Used in quick wins and importance scoring.
- `happiness` (string or list): Used in importance scoring via `map_of_happiness.yml`.
- `environment` (string): Placeholder in importance scoring (environment matching is TODO).

Notes
- Properties are case-insensitive when read from YAML, but consistency is recommended.
- Defaults can be set per item type in `User/Settings/<type>_defaults.yml`.
