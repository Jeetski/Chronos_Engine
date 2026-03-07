# Achievements Progression System

Achievements tracks unlockable milestones and ties each unlock to both points and profile XP/level progression.

## Overview

Core model:
- Achievement definitions are YAML items under `User/Achievements/`.
- Unlocks update achievement state and progression state.
- Progression state is persisted in `User/Profile/profile.yml`.

Award results:
- points are granted to the points ledger
- XP is granted to progression fields
- dashboard popup/feed receives unlock events

## CLI

Primary command group:
- `achievements sync`
- `achievements award <achievement_id_or_name>`
- `achievements event <event_name> [key:value ...]`
- `achievements reset`
- `achievements reset-progress`

Related command:
- `points reset [keep_ledger:true|false]`

Examples:
```bash
achievements sync
achievements event task_completed type:task name:"Deep Work"
achievements award "First 10 Completions"
achievements reset-progress
```

Reset semantics:
- `achievements reset` clears awarded state and progression fields.
- `achievements reset-progress` clears only progression fields/feed in profile.
- `points reset` affects wallet/ledger and is adjacent but separate from achievement definitions.

## Dashboard

Primary UI surfaces:
- Achievements widget
- AchievementUnlocked popup
- Dev/Data Ops controls

Widget behavior:
- Reads achievement items and progression profile fields.
- Displays progression ring using current XP/level values.
- Allows achievement state updates via API.

Popup behavior:
- Consumes `achievement_award_feed`.
- Shows unlock details and level-up context.
- Can deep-link/open the Achievements widget for follow-up.

Dev/Data Ops actions typically include:
- Reset Achievements
- Reset XP/Level
- Reset Points

Backing API endpoints:
- `GET /api/achievements`
- `POST /api/achievement/update`
- `GET /api/points`

Example update payload:
```json
{
  "name": "First 10 Completions",
  "status": "awarded"
}
```

## Data Model and Settings

Key settings and defaults:
- `User/Settings/achievements_settings.yml`
- `User/Settings/Achievement_Defaults.yml`

Progression fields in `User/Profile/profile.yml`:
- `xp_total`
- `level`
- `xp_into_level`
- `xp_to_next_level`
- `last_achievement_award`
- `achievement_award_feed`

The `achievement_award_feed` field acts as a rolling unlock queue for dashboard delivery.

## Evaluation and Triggering

Primary evaluator path:
- `Modules/achievement/evaluator.py`

Award pipeline:
1. Trigger source invokes evaluator (`sync`, `event`, or direct award command).
2. Evaluator checks that the achievement is not already awarded.
3. Evaluator writes awarded metadata on the achievement item.
4. Evaluator grants points.
5. Evaluator recalculates progression fields.
6. Evaluator appends an unlock snapshot to feed.

Trigger modes:
- `event`: event name plus optional `when` filters
- `sync`: rule/evaluator scans for criteria satisfaction

## Troubleshooting

If unlock popups are missing:
1. Verify achievement item state is `awarded`.
2. Verify profile has `last_achievement_award` and feed entries.
3. Refresh dashboard and re-check `GET /api/achievements`.

If XP/level looks incorrect:
1. Inspect `User/Profile/profile.yml` progression fields.
2. Run `achievements sync`.
3. If still inconsistent in test environments, use `achievements reset-progress` and re-run sync.

## Related Docs

- `Docs/Reference/CLI_Commands.md` (`achievements`, `points`)
- `Docs/Reference/Dashboard_API.md` (`/api/achievements`, `/api/achievement/update`, `/api/points`)
- `Docs/Guides/Dashboard.md` (Achievements widget behavior)
