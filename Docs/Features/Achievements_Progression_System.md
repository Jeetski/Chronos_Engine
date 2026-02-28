# Achievements Progression System

This document summarizes the current achievements + progression behavior in Chronos.

## Overview
- Achievements are item files under `User/Achievements/` (one YAML per achievement).
- Awarding achievements grants both:
  - points (Rewards wallet)
  - XP (profile progression)
- Progression is stored in `User/Profile/profile.yml`.

## Core Modules
- Evaluator: `Modules/Achievement/evaluator.py`
- Command: `Commands/achievements.py`
- Settings: `User/Settings/achievements_settings.yml`
- Defaults: `User/Settings/Achievement_Defaults.yml`

## Progression Fields in Profile
- `xp_total`
- `level`
- `xp_into_level`
- `xp_to_next_level`
- `last_achievement_award`
- `achievement_award_feed`

`achievement_award_feed` is a rolling queue used by dashboard popup delivery to avoid missing unlock events.

## Level Curve
- Configured via `achievements_settings.yml`:
  - `leveling.max_level`
  - `leveling.base_xp_to_level_2`
  - `leveling.growth`
- Curve is exponential per level step.
- Level is capped by `max_level`.

## Award Flow
1. Event/sync/command calls evaluator.
2. Evaluator confirms achievement is not already awarded.
3. Evaluator writes awarded state into achievement item.
4. Evaluator grants points via `Utilities.points.add_points`.
5. Evaluator recalculates XP/level and writes profile progression.
6. Evaluator appends event snapshot into `achievement_award_feed`.

## Trigger Modes
- `event` trigger:
  - matched via event name + optional `when` filters.
- `sync` trigger:
  - rule-based checks for streak/milestone/deadline style achievements.

## Dashboard UI
- Achievements widget ring uses profile progression values.
- `AchievementUnlocked` popup:
  - reads award feed from profile
  - displays unlock details and progression ring
  - opens Achievements widget CTA
  - confetti effect
  - dedicated Level Up state when levels increase

## Reset Commands
- `achievements reset`
  - resets all achievements to pending/unawarded
  - clears awarded metadata
  - resets achievement progression fields/feed
- `achievements reset-progress`
  - resets only achievement progression fields/feed in profile
- `points reset [keep_ledger:true|false]`
  - resets points balance (ledger reset by default)

## Dashboard Dev Actions
Dev > Data Ops includes:
- `Reset Achievements`
- `Reset XP/Level`
- `Reset Points`

