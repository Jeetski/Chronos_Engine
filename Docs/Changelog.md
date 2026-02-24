# Changelog

## 2026-02-24

### Dashboard - Popups Menu + Manual Popup Launch
- Added a dedicated topbar menu: `Popups`.
- Moved `Disable popups` toggle from Appearance into the `Popups` menu.
- Menustrip ordering is now alphabetical, including `Popups`.
- `Popups` menu now lists discovered popup modules and each row is clickable for manual launch.
- Manual popup launches now force queue enqueue even when popups are globally disabled.
- Renamed popup directory from `Utilities/Dashboard/Pop_Ups/` to `Utilities/Dashboard/Popups/` and updated loader/registry/docs paths.

### Dashboard - Popup Reliability and New Sleep Check-In Popup
- Added new popup module:
  - `Utilities/Dashboard/Popups/SleepCheckin/`
  - `popup.yml` priority: `850`
- Startup queue behavior now effectively runs:
  1. `Startup`
  2. `YesterdayCheckin`
  3. `SleepCheckin`
  4. remaining popups by rank/priority/name
- `SleepCheckin` behavior:
  - asks for last-night sleep duration, wake time, target hours
  - computes sleep deficit/surplus and a gentle recovery target
  - writes sleep log to yesterday completion entry (`actual_start`/`actual_end`)
- Fixed manual-launch behavior for popups that normally auto-skip:
  - `DueSoon` now opens from menu even when no due items (shows empty state)
  - `YesterdayCheckin` now opens from menu even when snoozed/acknowledged/no rows
- Hardened `SleepCheckin` data fetch so partial API failures no longer suppress popup display.

### Dashboard - Tracker Sleep Analysis
- Extended tracker APIs and inspector to support sleep analytics for tracked items marked `sleep: true`:
  - target/night
  - average + total logged sleep
  - deficit/surplus
  - short nights and below-target counts
  - rolling 7d/30d averages
- Added `sleep: true` to active sleep habits:
  - `User/Habits/sleep.yml`
  - `User/Habits/bedtime.yml`

### Dashboard - Terminal Theme and Behavior
- Terminal widget now uses active **console theme** palette (not dashboard theme) via:
  - `GET /api/console/theme`
- Preserved glassmorphic transparency while applying console-theme tinting.
- Added local terminal handling for `cls`/`clear` so it clears widget output immediately.

### CLI/Theme System - Console Theme Alignment
- Updated `theme` command to read console theme source:
  - `User/Settings/console_theme_settings.yml`
  - legacy fallback: `theme_settings.yml`
- Fixed `theme list` messaging and theme source mismatch.
- Refactored console style resolution:
  - active palette now resolves from profile-selected console theme + console theme settings
  - added cache reset hooks to keep runtime theme changes in sync across CLI/dashboard endpoints

### Dashboard - Debug Console Widget
- Added `Refresh` button in Debug Console (left of `Copy`).
- Debug Console now refreshes backend logs automatically each time the widget is opened/shown.

### Dashboard - Wizard Label
- Added explicit metadata for Big 5 wizard so it appears as `Big 5` in Wizards dropdown instead of `Big5`.

### Dashboard - Commitments/Habits Tracking and Yesterday Check-in
- Commitments updated to support richer target structures for frequency commitments (per-target counts), enabling weekly goals like:
  - `Grow Honeycomb Lab`: `Beat Upload x1/week`, `Post on Socials x10/week`.
- Added/updated negative habit associations used by commitments:
  - `Porn`
  - `Binge watching YouTube`
  - `Drinking`
- Commitments widget daily check-in flow strengthened with explicit override actions:
  - mark as `Met`
  - mark as `Violated`
  - clear manual daily status
- Commitment-related UI normalized to compact list-first interaction:
  - Commitments widget rows collapse/expand on click (summary first, details on demand).

### Dashboard - Collapsible List UX Pass
- Applied the same list-first collapsible row pattern to:
  - Achievements widget
  - Milestones widget
  - Rewards widget

### Dashboard - Yesterday Check-in Popup + Auto-Miss
- Added popup module:
  - `Utilities/Dashboard/Popups/YesterdayCheckin/`
- Added endpoints:
  - `GET /api/yesterday/checkin`
  - `POST /api/yesterday/checkin`
- New behavior:
  - Pulls yesterday’s scheduled items and completion entries.
  - Applies **auto-miss** for scheduled-yesterday items that were not logged.
  - Presents check-in UI to confirm/correct scheduled items and add additional items done yesterday.
  - Supports reminder/snooze options and popup deferral.
- Popup queue ordering updated so Yesterday Check-in is always second:
  1. `Startup`
  2. `YesterdayCheckin`
  3. remaining popups by priority/name
- Extended check-in schedulables list to include commitment-linked items (including legacy commitment field shapes) so commitment-relevant items are selectable directly in popup.

### Dashboard - New Tracker View
- Added new view module:
  - `Utilities/Dashboard/Views/Tracker/`
- Added tracker APIs:
  - `GET /api/tracker/sources`
  - `GET /api/tracker/year?type=habit|commitment&name=<item>&year=<yyyy>`
- Tracker view features:
  - Full-year calendar (12 months) for a selected habit or commitment.
  - Future days shown as gray.
  - Past days with no data shown as gray with white `?`.
  - Done / not-done coloring for tracked behavior.
  - Negative behavior context (bad habits / negative commitments) flips abstinence success to green.
  - Right inspector with searchable tracked-source list.
  - Circular year-progress ring at top of inspector.

### CLI - Shift Command + Calendar Wiring
- Added `shift` command:
  - `Commands/shift.py`
  - Usage: `shift <item_name> <minutes> [date:YYYY-MM-DD] [start_time:HH:MM]`
  - Positive minutes shift later; negative minutes shift earlier.
- Wired Calendar Inspector `Shift +15m` action to call `shift` (including date/start-time targeting for selected block(s)).

### CLI - Completion Side-Effects Parity (`mark` vs `complete`)
- Unified post-completion side effects through a shared helper:
  - New file: `Utilities/completion_effects.py`
- `mark "<item>":completed` and `complete <type> "<name>"` now use the same completion pipeline for:
  - commitment evaluation (and downstream triggers/scripts),
  - milestone evaluation,
  - points awarding.
- `mark` behavior remains status-aware:
  - only `mark ...:completed` counts as completion for points/milestones,
  - non-completion statuses (e.g., `skipped`, `delayed`) do not award completion points.

## 2026-02-21

### Kairos - Status/Template Parity and Stability Fixes
- Fixed `today reschedule` crash caused by manual modification application returning `None` in active Kairos path.
  - `Modules/Scheduler/v1.py`: `apply_manual_modifications(...)` now returns the schedule.
- Fixed stale manual modification warning spam by cleaning `User/Schedules/manual_modifications_2026-02-21.yml`.
- Hardened Kairos day-template selection to better match legacy status behavior:
  - Added strict template pre-filtering in `Modules/Scheduler/Kairos.py`.
  - Selection now prioritizes:
    1. day-eligible + place match + status-requirements match
    2. day-eligible + place match
    3. legacy score-only fallback
- Added Kairos template-match diagnostics in phase notes (`template_match`) to show strict/place-only/fallback selection behavior.
- Prevented stale archived YAML from polluting Kairos candidate DB:
  - `Modules/Sequence/core_builder.py` now skips `User/Archive` and `User/Backups` when building `chronos_core.db`.
- Added a broad Kairos example content pack across week/day/routine/subroutine/microroutine/task/timeblock templates to expand usable coverage and scheduler stress-testing.

### Kairos Scheduler Activation
- Switched active scheduling path to Kairos for `today` and `today reschedule` in `Commands/Today.py`.
- Legacy scheduler path is still present and can be forced with `today legacy ...`.
- Added Kairos-to-schedule conversion when writing `User/Schedules/schedule_YYYY-MM-DD.yml` so existing downstream flows keep working.
- Added Kairos anchor conflict fail-fast messaging in active runs with remediation guidance.
- Preserved archive-before-overwrite behavior when regenerating today schedule.

### Dashboard - Scheduler Widget Kairos Quick Toggles
- Updated `Utilities/Dashboard/Widgets/Today/index.js` reschedule action to call `/api/cli` with `today reschedule` plus Kairos properties.
- Added persistent quick toggles in Scheduler widget:
  - `buffers`
  - `breaks` (timer/none)
  - `sprints`
  - `ignore-trends`
  - optional `timer_profile`
  - optional `template` override
  - optional `quickwins` max minutes
- Added `custom_property:<property_name>` Kairos context support and custom-property scoring weight (`prioritize:custom_property=<n>`).
- Scheduler widget Custom Property field now accepts any property key (free text) and forwards it to Kairos during reschedule.
- Controls are stored in localStorage under `chronos_sched_controls` and applied on each Generate/Reschedule click.
- Added toggle-chip styling in `Utilities/Dashboard/Widgets/Today/scheduler.css`.

### Tests
- Ran Kairos test suite: `python -m pytest tests/test_kairos.py -q` (6 passed).
- Verified widget script syntax: `node --check Utilities/Dashboard/Widgets/Today/index.js`.

### Versioning
- Standardized visible release labeling to `Alpha v0.2` across docs, console title/banner, and dashboard startup subtitle.

### Dashboard - Appearance & Popup Controls
- Enhanced the Appearance dropdown theme list:
  - Added a per-theme recolored Chronos logo glyph (accent-tinted) beside each theme entry.
  - Kept accent swatches for quick visual comparison.
- Added `Disable popups` toggle in the Appearance dropdown.
  - Stored in localStorage (`chronos_dashboard_popups_enabled_v1`).
  - Popup queue now ignores enqueue calls when disabled.
  - Popup module loading is skipped when disabled.
- Added cache-busting query params for popup module imports to avoid stale popup JS after updates.

### Dashboard - Startup Popup & Docs Integration
- Startup popup now includes an `Open in Docs` action near the changelog panel.
- Added dashboard-side helpers for view/doc opening:
  - `window.ChronosOpenView(name, label)`
  - `window.ChronosOpenDoc(path, line)`
- Docs view now supports direct open requests and visual file selection/highlight for requested docs.
- Fixed duplicate dashboard mount behavior by preventing `core/runtime.js` legacy auto-mount when `app.js` manages mounts (eliminates duplicate widget/view mounts and related race conditions).

### Sleep System Refactor
- Removed legacy `sleep_settings.yml` flow from Life Setup wizard behavior.
- Deleted obsolete file: `User/Settings/sleep_settings.yml`.
- Added new persistent widget: `Utilities/Dashboard/Widgets/SleepSettings/`
  - Manages sleep anchors directly in day templates.
  - Supports mono/bi/poly presets, segment editing, day toggles, overlap checks, and apply-to selected/all/new templates.
- Added new guided wizard (renamed): `Sleep Hygiene`
  - File path: `Utilities/Dashboard/Wizards/SleepSettings/`
  - Conversational setup flow for schedule pattern and timing.
  - Includes sleep optimization prompts (meal buffer, screen cutoff, caffeine cutoff, blackout room).
  - Can create example bedtime microroutines and a bedtime routine pack.
  - Hands draft configuration to the Sleep Settings widget for final editing/apply.
- Added dashboard widget slot for `SleepSettings` in `Utilities/Dashboard/dashboard.html`.

### Documentation
- Updated dashboard guide entries to reflect:
  - Sleep Settings widget availability.
  - Sleep Hygiene wizard behavior and optimization scope.
- Removed outdated mention that applying sleep anchors deletes `sleep_settings.yml`.

## 2026-02-15

### Dashboard
- Added a new startup popup module at `Utilities/Dashboard/Popups/Startup/`.
- Updated startup experience to feature the new Chronos logo prominently.
- Startup popup now shows:
  - Large Chronos logo on the left
  - `Chronos Engine` title
  - `Alpha v0.2` subtitle
  - Hyperlink to `https://chronosengine.online`
- Added popup metadata `priority: 1000` in `Utilities/Dashboard/Popups/Startup/popup.yml`.
- Updated popup loading in `Utilities/Dashboard/app.js`:
  - Popups are sorted by `priority` (desc), then module name.
  - Popup imports are now sequential (not parallel) so queue order is deterministic.
  - Ensures `Startup` is always first in queue.
- Renamed popup module from `AlphaLaunch` to `Startup`.

### CLI Sounds
- Added new sound engine module: `Modules/SoundFX.py`.
- Added new command: `Commands/sound.py`.
- Added alias `sounds -> sound` in `Modules/Console.py`.
- Added settings file: `User/Settings/sound_settings.yml`.
- Wired sound events in CLI (`Modules/Console.py`):
  - `startup` when CLI starts
  - `done` after `today reschedule`
  - `error` for unknown command / command execution failure / parse failure cases
  - `exit` on `exit`/`quit` and interrupt exits
- Fixed exit sound cut-off by adding blocking playback support in `Modules/SoundFX.py` and using `wait=True` for exit paths.

### Launcher
- Removed final "Press any key to continue..." pause from `console_launcher.ps1`.

### Scheduler & Template Selection
- Fixed `today reschedule` crash (`KeyError: 'duration'`) by ensuring window-scheduled items always set `duration` in `Modules/Scheduler/v1.py`.

### Day Templates / Place Status
- Updated travel templates to explicitly require travel context:
  - `User/Days/travel_day_example.yml` -> `place: travel`, `status_requirements.place: [travel]`
  - `User/Days/travel_reset_day_example.yml` -> `place: travel`, `status_requirements.place: [travel]`
- Added normalized `place` coverage across `*_example.yml` day templates:
  - `User/Days/deep_work_day_kairos_example.yml` -> `at_work`
  - `User/Days/recovery_and_reset_day_example.yml` -> `at_home`
  - `User/Days/sick_day_example.yml` -> `at_home`
  - `User/Days/weekday_builder_example.yml` -> `at_school`
  - `User/Days/weekday_example.yml` -> `at_home`
- Expanded `User/Settings/place_settings.yml` to include additional place options and ranking updates (including `At School` and `Travel`).
