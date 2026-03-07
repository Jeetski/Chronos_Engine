# Changelog

## 2026-03-02

### Dashboard - Milestones Filtering and Deep-Linking
- Extended milestone payloads to include linked `project` metadata for filtering.
- Milestones widget now supports combined filtering by:
  - project
  - goal
  - state
- Added filter dropdowns in Milestones widget for project + goal selection.
- Project Manager and Goal Planner `Open Milestones` actions now:
  - open/focus Milestones widget
  - apply the current project/goal filter automatically.

### Dashboard - Goal Planner View
- Replaced placeholder Goal Planner with a manager-style goal workspace aligned with Project Manager patterns.
- Goal Planner list now shows goals only (milestones are no longer embedded in the goals list).
- Selecting a goal opens Goal Planner with that goal targeted.

### Dashboard - Project/Goal Editing Improvements
- Project Manager and Goal Planner now support inline editing/saving for:
  - description
  - state
  - stage
  - priority
  - target date
- Project stage/state are currently free-text-compatible in storage (no strict global enum enforcement).

### Dashboard - Widget Sizing Behavior
- Added/standardized smart vertical autoheight behavior for widgets so panels resize to fit visible content.
- Applied guardrails to prevent shrink loops and avoid clipping currently visible elements.
- Today widget retains scheduler-specific sizing behavior while preserving visibility of expanded sections.
- Nia orb/widget was explicitly excluded from global autoheight behavior.

### Dashboard - Nia Widget Reliability and Styling
- Fixed Nia close/reopen flow so closing from `X` does not block reopening from the bottom-right trigger.
- Updated Nia launcher visual to ring-only style (removed extra filled rounded rectangle background).

### Dashboard - Popup Open Actions
- Fixed Welcome popup `Open Profile` action so it reliably opens/focuses the Profile widget.
- Fixed Achievement popup `Open Achievements` action so it reliably opens/focuses the Achievements widget.

### Dashboard + CLI - Editor Routing (`chronos_editor`)
- Added `chronos_editor` special handling in editor-open flows:
  - CLI/dashboard open-in-editor requests can target the in-dashboard Editor view instead of external apps.
  - Server now queues editor-open requests and dashboard app consumes them to open Editor with file context.
- Updated default editor setting to:
  - `User/Settings/config.yml` -> `default_editor: chronos_editor`

### CLI - Dashboard Browser Override
- `dashboard` command now supports optional browser overrides from:
  - `browser:<cmd>` command property
  - `dashboard_browser` in `User/Settings/config.yml`
  - `browser` in `User/Settings/config.yml`
- When unset, dashboard continues opening in the system default browser.

## 2026-02-28

### Dashboard - Day Builder View (Scheduling-Focused) Implemented
- Replaced the Day Builder placeholder with an interactive scheduling editor:
  - drag-and-drop schedulables palette
  - editable day timeline
  - inspector panel for selected block + template metadata
- Supported schedulable families in this view:
  - `task`, `habit` (with `chore` alias), `routine`, `subroutine`, `microroutine` (with `habit_stack` alias), `window`, `timeblock`, `buffer`, `break`
- `buffer`/`break` are treated as scheduler blocks (built-in palette entries), not item ingestion from `/api/items`.

### Day Template Lifecycle Controls
- Added explicit template actions:
  - `New Template`
  - `Load Template`
  - `Save Template`
  - `Save As`
  - `Rename`
  - `Delete`
- Wired to existing template/item endpoints (`/api/template`, `/api/item`, `/api/item/rename`, `/api/item/delete`).

### Schedule Loading + Apply Flow
- Added generated schedule loading:
  - `Load Today`
  - `Load Date Schedule` (from `User/Schedules/schedule_YYYY-MM-DD.yml` via `/api/file/read`)
  - fallback to `/api/today` for current-day load
- Added `Apply Draft To Today`:
  - validates draft
  - saves template
  - runs scheduler via CLI bridge (`today reschedule template:<name>`)

### Scheduling Tooling (Builder UX)
- Added validation/conflict checks:
  - invalid time format
  - end-before-start
  - non-positive duration
  - anchor without fixed time
  - overlap detection for fixed-time blocks
- Added placement helpers:
  - auto-end from start + duration (inspector)
  - `Snap 5m`
  - `Auto Pack` from configurable start time
- Added auto insertion from settings:
  - `Auto Buffers/Breaks` with toggles for buffers and breaks
  - uses `Buffer_Settings.yml`, `Timer_Settings.yml`, `Timer_Profiles.yml`

### Inspector + Data Model Enhancements
- Added `Pinned Anchor` behavior in block inspector.
- Added hierarchy editing:
  - `Hierarchy Level` plus `Indent`/`Outdent`
  - saves nested `children` tree and flattens on load for editing
- Added window-specific inspector fields:
  - `window_name`
  - window filters (YAML map)
- Added timeblock subtype selector:
  - generic/free/category/buffer/break
- Added day template properties panel:
  - category, tags, notes, status requirements, extra props

### Editing Safety + QA Helpers
- Added local `undo` / `redo` history stack.
- Added in-view `QA` status check and clipboard draft export.
- Fixed missing duration inference utility used by palette ingestion.

## 2026-02-26

### Dashboard API - CLI Consolidation and Drift Reduction
- Refactored dashboard write endpoints to route through existing CLI commands instead of direct `ItemManager`/module mutations.
- Updated item lifecycle endpoints to use command pipeline (`new`/`set`/`copy`/`rename`/`delete`):
  - `/api/item`
  - `/api/item/copy`
  - `/api/item/rename`
  - `/api/item/delete`
  - `/api/items/delete`
  - `/api/items/setprop`
  - `/api/items/copy`
- Delete behavior now respects CLI semantics (archive-by-default unless forced), including sticky notes delete endpoint.
- Refactored achievement update flow to command-driven behavior:
  - `/api/achievement/update` now uses `set achievement ...` and `achievements award ...`.
- Refactored milestone update flow to command-driven behavior:
  - `/api/milestone/update` now uses `set milestone ...` / `remove milestone ...`.
- Refactored yesterday check-in save flow to use `did` command writes (with date override) instead of direct completion YAML mutations:
  - `/api/yesterday/checkin`.
- Refactored timer action endpoints to use `timer` CLI command path:
  - `/api/timer/start`, `/pause`, `/resume`, `/stop`, `/cancel`, `/confirm`.
- Refactored template save endpoint to command-driven item updates and achievement event emission via command path:
  - `/api/template` now uses `new`/`set` and `achievements event ...`.
- Removed duplicate early `/api/item*` POST handlers in dashboard server so one canonical write path remains.

### Testing - Dashboard API Smoke Coverage
- Added one-command smoke test script:
  - `tests/smoke_dashboard_api.ps1`
- Script behavior:
  - starts dashboard server on an isolated port
  - validates refactored write endpoints end-to-end
  - checks item CRUD, bulk ops, achievement/milestone update endpoints, yesterday check-in, timer actions, and template save
  - stops server and returns non-zero on failures
- Executed smoke script in-session:
  - `pwsh -NoProfile -ExecutionPolicy Bypass -File tests/smoke_dashboard_api.ps1`
  - result: all checks passed (exit code `0`)

### CLI - Listener Command + Dashboard Integration
- Added new CLI command module:
  - `commands/listener.py`
- New command capabilities:
  - `listener start`
  - `listener stop`
  - `listener status`
- Listener lifecycle now uses a PID file for tracking:
  - `User/Temp/listener.pid`
- Updated dashboard server listener endpoint to use CLI bridge instead of direct process spawning:
  - `POST /api/listener/start` now calls `run_console_command("listener", ["start"])`.
- Verified in-session:
  - CLI `listener status` reports current state.
  - API `POST /api/listener/start` returns successful start via command path.
  - CLI `listener stop` successfully stops listener after test.

### Achievements - Event Evaluator Foundation
- Added evaluator module: `modules/achievement/evaluator.py`.
- Added command wrapper: `commands/achievements.py`.
- Added settings file: `User/Settings/achievements_settings.yml`.
- Added event-driven awarding APIs:
  - `emit_event(event_name, payload)`
  - `award_by_id(...)`, `award_by_name(...)`
  - `evaluate_sync()`
- Added sync-rule evaluation for:
  - habit streak threshold
  - commitment streak threshold
  - first completed milestone
  - due/deadline met on time
- Added event emission hooks in key flows:
  - console startup (`chronos_started`)
  - command execution (`command_executed`)
  - review creation
  - template save/day template + habit stack creation
  - onboarding completion
  - resolutions creation

### Achievements - Starter Catalog and Defaults
- Replaced existing achievements with new starter set (one file per achievement under `User/Achievements/`).
- Set title = name for starter achievements.
- Standardized starter reward payloads to 10 points + 10 XP per achievement.
- Updated defaults in `User/Settings/Achievement_Defaults.yml` to include awarded/status/title fields.

### Profile Progression - XP/Level Wiring
- Achievement awards now update `User/Profile/profile.yml` progression fields:
  - `xp_total`
  - `level`
  - `xp_into_level`
  - `xp_to_next_level`
- Added award event snapshots in profile:
  - `last_achievement_award`
  - `achievement_award_feed` (rolling queue for reliable popup delivery)
- Added level-up metadata in award events:
  - `level_before`, `level_after`, `leveled_up`, `levels_gained`

### Dashboard - Achievements Widget Ring
- Added progression ring display in Achievements widget (dynamic LVL + XP progress).
- Ring now uses profile progression values rather than static placeholder text.

### Dashboard - Achievement Unlocked Popup
- Added popup module:
  - `utilities/dashboard/Popups/AchievementUnlocked/`
  - `popup.yml` metadata included (auto-discovered registry)
- Popup behavior:
  - polls profile award feed
  - shows achievement name/description
  - shows +points and +XP earned
  - shows current level ring progress
  - supports opening Achievements widget directly
  - supports manual launch from Popups menu for preview/testing
- Added confetti burst effect on unlock.
- Added distinct **Level Up** popup state when award crosses a level boundary.
- Tuned confetti timing to a slower, longer fall animation.

### Dashboard - Dev Menu Recovery/Reset Actions
- Added Data Ops actions in Dev menu:
  - `Reset Achievements` -> `achievements reset`
  - `Reset XP/Level` -> `achievements reset-progress`
  - `Reset Points` -> `points reset`

### CLI - Reset Commands
- Added achievement reset command:
  - `achievements reset` (set all achievements to pending/unawarded and reset achievement progression/feed)
- Added achievement progression-only reset command:
  - `achievements reset-progress`
- Added points reset command:
  - `points reset [keep_ledger:true|false]`

## 2026-02-25

### Dashboard - Nia Assistant Widget (ADUC-Backed)
- Added a new floating widget: `Nia AI Assistant` (`utilities/dashboard/Widgets/NiaAssistant/`).
- Nia is available as a floating bottom-right orb and as a standard dashboard widget entry.
- Widget now communicates through dashboard ADUC proxy APIs (no direct browser-to-ADUC coupling).
- Added live waiting indicator while replies are pending:
  - `Thinking.` / `Thinking..` / `Thinking...`
  - elapsed seconds counter (e.g. `(12s)`).
- Added markdown rendering in Nia message bubbles:
  - headings, emphasis, inline/fenced code, lists, blockquotes, links.
- Added message identity rows (ADUC-style) with avatar + name for both Nia and user.
- Nia startup greeting updated to:
  - `Hello <nickname>, I'm Nia. How can I help you today?`
- Nia control-output cleanup in widget:
  - hearts directives are stripped from display replies.

### Dashboard - Nia Widget UX and Settings
- Replaced single paperclip action with a `+` action button.
- Added `+` action menu entries:
  - `Attach a file` (paperclip icon)
  - `Wizards` (magic-wand placeholder).
- Added header gear button (`⚙`) to open Nia settings (left of close button).
- Nia settings now mirror Profile-widget file-edit flow (open in Notes widget):
  - `Edit Agent Preferences`
  - `Edit Preference Settings`
  - `Edit Pilot Brief`
  - `Manage Memories`
- Added `Use memories` toggle in Nia settings (maps to ADUC `include_memory`).
- Added `Delete memories` action:
  - clears Nia memory store and Nia conversation history in ADUC.
- Fixed Nia settings pane visibility bug so settings are closed by default on mount.

### Dashboard - Nia Glass/Visual Coherence
- Updated Nia panel styling to match base dashboard widget glass behavior:
  - `var(--panel)`, `var(--border)`, `var(--shadow)`
  - consistent blur/saturation treatment with other widgets.

### Dashboard Server - ADUC Proxy/Integration Endpoints
- Added ADUC proxy endpoints in `utilities/dashboard/server.py`:
  - `GET /api/aduc/familiars`
  - `GET /api/aduc/cli/status`
  - `POST /api/aduc/chat`
  - `GET /api/aduc/settings`
  - `POST /api/aduc/settings`
  - `POST /api/aduc/cli/memory/clear`
- Added direct dashboard-served Nia profile avatar endpoint:
  - `GET /api/nia/profile/avatar`

### ADUC - New Nia Familiar and Prompt Contract Updates
- Added minimal ADUC familiar: `Agents Dress Up Committee/familiars/nia/` with:
  - neutral copilot role docs
  - minimal avatar/state setup
  - merge config docs (`merge.json`, `chronos-merge.json`).
- Updated Nia familiar docs to enforce direct execution behavior in Chronos mode:
  - execute requested actions immediately
  - avoid promise-only replies without execution
  - explicit schedule/reschedule execution expectations.
- Updated shared ADUC contract (`docs/agents/AGENTS.md`) with global Chronos-mode action execution rules:
  - execute-first responses
  - no promise-only defer replies
  - explicit schedule/reschedule execution guidance.

### ADUC - Windows Window Titles
- Updated ADUC launcher windows to clearly warn users not to close them:
  - `ADUC Server - DO NOT CLOSE THIS WINDOW`
  - `ADUC Watcher - DO NOT CLOSE THIS WINDOW`
- Applied in:
  - `run_aduc_codex.bat`
  - `run_aduc_gemini.bat`
- Added Python-side fallback title setters for direct script runs:
  - `Agents Dress Up Committee/server.py`
  - `Agents Dress Up Committee/tools/cli_bridge_watcher.py`

### Dashboard - Calendar Inspector UX
- Calendar Inspector `Deadlines & Due Dates` sections now default to collapsed in both:
  - Month view
  - Day view
- File: `utilities/dashboard/Views/Calendar/Inspector.js`

### Dashboard - Startup Popup Buttons
- Added new startup popup action button:
  - `Set Up Chronos Engine` (currently inert / no action attached)
- Added startup popup action button:
  - `Set Up Nia AI` (currently inert / no action attached)
- Kept existing `Tour` button as placeholder.
- File: `utilities/dashboard/Popups/Startup/index.js`

### Dashboard - Docs View Markdown Rendering
- Docs view now renders `.md` / `.markdown` files with formatted HTML instead of raw textarea-only output.
- Added lightweight markdown rendering support for:
  - headings
  - paragraphs
  - bullet/numbered lists
  - code blocks and inline code
  - blockquotes
  - horizontal rules
  - links
- Non-markdown files continue to render as preformatted plain text.
- File: `utilities/dashboard/Views/docs/index.js`

### CLI - Prompt Toolkit and Autocomplete Controls
- Added `User/Settings/console_settings.yml` for console runtime behavior:
  - `prompt_toolkit_default`
  - `autocomplete_enabled`
  - `show_startup_banner`
  - `run_startup_sync`
  - `play_startup_sound`
- Added new CLI command:
  - `autocomplete`
  - `autocomplete on|off|toggle|status`
  - Persists to `console_settings.yml`
- File added: `commands/autocomplete.py`

### CLI - Chronos-Syntax Runtime Options (No `--` switches)
- Console runtime now accepts command-style key/value runtime options:
  - `prompt_toolkit:true|false`
  - `autocomplete:true|false`
  - `startup_banner:true|false`
  - `startup_sync:true|false`
  - `startup_sound:true|false`
- Runtime options are parsed before command/script handling.
- File: `modules/console.py`

### CLI - Launcher vs Direct Invocation Behavior Split
- Direct invocation (`python modules/console.py <command>`) now runs quiet by default via settings.
- Launcher invocation still boots full experience by passing explicit runtime options:
  - `prompt_toolkit:true startup_banner:true startup_sync:true startup_sound:true`
- File: `console_launcher.ps1`

### CLI - Non-Interactive IO Stability
- Suppressed pygame support prompt noise in console startup path (`PYGAME_HIDE_SUPPORT_PROMPT=1`).
- Hardened `console_style.print_role` fallback when prompt_toolkit cannot access a real console buffer.
- Fixed recursion in fallback printing path by routing to raw printer.
- Gated post-command theme repaint so one-shot command mode remains clean.
- Files:
  - `modules/console.py`
  - `modules/console_style.py`

### Documentation
- Updated autosuggest docs with new runtime and settings controls.
- Updated settings guide to include console startup behavior keys.
- Updated CLI command reference with `autocomplete` command.
- Files:
  - `docs/dev/autosuggest.md`
  - `docs/guides/settings.md`
  - `docs/reference/cli_commands.md`

## 2026-02-24

### Dashboard - Popups Menu + Manual Popup Launch
- Added a dedicated topbar menu: `Popups`.
- Moved `Disable popups` toggle from Appearance into the `Popups` menu.
- Menustrip ordering is now alphabetical, including `Popups`.
- `Popups` menu now lists discovered popup modules and each row is clickable for manual launch.
- Manual popup launches now force queue enqueue even when popups are globally disabled.
- Renamed popup directory from `utilities/dashboard/Pop_Ups/` to `utilities/dashboard/Popups/` and updated loader/registry/docs paths.

### Dashboard - Popup Reliability and New Sleep Check-In Popup
- Added new popup module:
  - `utilities/dashboard/Popups/SleepCheckin/`
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
  - `utilities/dashboard/Popups/YesterdayCheckin/`
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
  - `utilities/dashboard/Views/Tracker/`
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
  - `commands/shift.py`
  - Usage: `shift <item_name> <minutes> [date:YYYY-MM-DD] [start_time:HH:MM]`
  - Positive minutes shift later; negative minutes shift earlier.
- Wired Calendar Inspector `Shift +15m` action to call `shift` (including date/start-time targeting for selected block(s)).

### CLI - Completion Side-Effects Parity (`mark` vs `complete`)
- Unified post-completion side effects through a shared helper:
  - New file: `utilities/completion_effects.py`
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
  - `modules/scheduler/v1.py`: `apply_manual_modifications(...)` now returns the schedule.
- Fixed stale manual modification warning spam by cleaning `User/Schedules/manual_modifications_2026-02-21.yml`.
- Hardened Kairos day-template selection to better match legacy status behavior:
  - Added strict template pre-filtering in `modules/scheduler/kairos.py`.
  - Selection now prioritizes:
    1. day-eligible + place match + status-requirements match
    2. day-eligible + place match
    3. legacy score-only fallback
- Added Kairos template-match diagnostics in phase notes (`template_match`) to show strict/place-only/fallback selection behavior.
- Prevented stale archived YAML from polluting Kairos candidate DB:
  - `modules/sequence/core_builder.py` now skips `User/Archive` and `User/Backups` when building `chronos_core.db`.
- Added a broad Kairos example content pack across week/day/routine/subroutine/microroutine/task/timeblock templates to expand usable coverage and scheduler stress-testing.

### Kairos Scheduler Activation
- Switched active scheduling path to Kairos for `today` and `today reschedule` in `commands/today.py`.
- Legacy scheduler path is still present and can be forced with `today legacy ...`.
- Added Kairos-to-schedule conversion when writing `User/Schedules/schedule_YYYY-MM-DD.yml` so existing downstream flows keep working.
- Added Kairos anchor conflict fail-fast messaging in active runs with remediation guidance.
- Preserved archive-before-overwrite behavior when regenerating today schedule.

### Dashboard - Scheduler Widget Kairos Quick Toggles
- Updated `utilities/dashboard/Widgets/Today/index.js` reschedule action to call `/api/cli` with `today reschedule` plus Kairos properties.
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
- Added toggle-chip styling in `utilities/dashboard/Widgets/Today/scheduler.css`.

### Tests
- Ran Kairos test suite: `python -m pytest tests/test_kairos.py -q` (6 passed).
- Verified widget script syntax: `node --check utilities/dashboard/Widgets/Today/index.js`.

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
- Added new persistent widget: `utilities/dashboard/Widgets/SleepSettings/`
  - Manages sleep anchors directly in day templates.
  - Supports mono/bi/poly presets, segment editing, day toggles, overlap checks, and apply-to selected/all/new templates.
- Added new guided wizard (renamed): `Sleep Hygiene`
  - File path: `utilities/dashboard/Wizards/SleepSettings/`
  - Conversational setup flow for schedule pattern and timing.
  - Includes sleep optimization prompts (meal buffer, screen cutoff, caffeine cutoff, blackout room).
  - Can create example bedtime microroutines and a bedtime routine pack.
  - Hands draft configuration to the Sleep Settings widget for final editing/apply.
- Added dashboard widget slot for `SleepSettings` in `utilities/dashboard/dashboard.html`.

### Documentation
- Updated dashboard guide entries to reflect:
  - Sleep Settings widget availability.
  - Sleep Hygiene wizard behavior and optimization scope.
- Removed outdated mention that applying sleep anchors deletes `sleep_settings.yml`.

## 2026-02-15

### Dashboard
- Added a new startup popup module at `utilities/dashboard/Popups/Startup/`.
- Updated startup experience to feature the new Chronos logo prominently.
- Startup popup now shows:
  - Large Chronos logo on the left
  - `Chronos Engine` title
  - `Alpha v0.2` subtitle
  - Hyperlink to `https://chronosengine.online`
- Added popup metadata `priority: 1000` in `utilities/dashboard/Popups/Startup/popup.yml`.
- Updated popup loading in `utilities/dashboard/app.js`:
  - Popups are sorted by `priority` (desc), then module name.
  - Popup imports are now sequential (not parallel) so queue order is deterministic.
  - Ensures `Startup` is always first in queue.
- Renamed popup module from `AlphaLaunch` to `Startup`.

### CLI Sounds
- Added new sound engine module: `modules/sound_fx.py`.
- Added new command: `commands/sound.py`.
- Added alias `sounds -> sound` in `modules/console.py`.
- Added settings file: `User/Settings/sound_settings.yml`.
- Wired sound events in CLI (`modules/console.py`):
  - `startup` when CLI starts
  - `done` after `today reschedule`
  - `error` for unknown command / command execution failure / parse failure cases
  - `exit` on `exit`/`quit` and interrupt exits
- Fixed exit sound cut-off by adding blocking playback support in `modules/sound_fx.py` and using `wait=True` for exit paths.

### Launcher
- Removed final "Press any key to continue..." pause from `console_launcher.ps1`.

### Scheduler & Template Selection
- Fixed `today reschedule` crash (`KeyError: 'duration'`) by ensuring window-scheduled items always set `duration` in `modules/scheduler/v1.py`.

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



