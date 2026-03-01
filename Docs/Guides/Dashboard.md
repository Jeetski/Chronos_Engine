# Dashboard Guide

Chronos includes a lightweight local dashboard that complements the CLI and Listener. It provides visual planning, quick editing, and one-click actions powered by the same APIs used by automation agents.

---

## Running the Dashboard

| Method | Steps |
| --- | --- |
| Launcher | Double-click `dashboard_launcher.bat` (or `.sh` on Linux/macOS). |
| From Console | Open the Chronos Console and run `dashboard` (alias `dash`). |

Both start the local HTTP server (`Utilities/Dashboard/server.py`) and open the UI in your default browser.

---

## Views & Widgets

### Views
- **Calendar** - Year/Month/Week/Day canvas with a Day List tree for the selected day. Selecting a block in Day view targets Scheduler actions; selecting a date previews that day (today is actionable). Month overlays load presets from `Presets/Calendar_Overlays/` (including Happiness overlays for scheduled vs completed days).
- **Tracker** - Year-at-a-glance tracker view with 12 month grids and a right inspector for selecting one habit or commitment to track.
  - Future days are gray.
  - Past days with no data are gray with a white `?`.
  - Completed days are green.
  - Not-done days are red for positive behaviors, and green for negative behaviors (bad habits / negative commitments where abstaining is success).
  - Inspector includes a circular year progress ring (`elapsed days / total days`) and searchable source list.
- **Template Builder** - Drag-and-drop editing for week/day/routine/subroutine/microroutine templates plus goal/project/inventory builders. Includes duration badges, inspector panel, nesting rules, and saves via `POST /api/template`.
- **Day Builder** - Scheduling-first day composer with drag/drop schedulables, template lifecycle controls (new/load/save/save as/rename/delete), generated schedule loading (today/date), validation, undo/redo, auto buffers/breaks, and apply-to-today flow. See `Docs/Guides/DayBuilder.md`.
- **Routine Builder** - Template-composition editor for `routine`, `subroutine`, and `microroutine` templates with drag/drop schedulables (routines, subroutines, microroutines/habit stacks, habits/chores, tasks, windows, buffers, breaks), hierarchy editing, validation, and template lifecycle controls. See `Docs/Guides/RoutineBuilder.md`.
- **Cockpit** - A drag-and-drop canvas powered by `Utilities/Dashboard/Views/Cockpit/`. The grid pans/zooms (drag empty space, Ctrl + scroll, or use the floating controls), remembers layout in `chronos_cockpit_panels_v1`, and spawns panels from the dropdown. Shipping panels include **Schedule**, **Matrix**, **Matrix Visuals**, **Status Strip**, **Commitments Snapshot**, **Map of Happiness**, **Lists**, **Deadlines**, and **Data Cards (Deck Mode)**. See `Docs/Guides/Cockpit.md` for panel details and troubleshooting.
  - The Matrix panel loads presets from `Presets/Matrix/` (YAML). It ships with curated defaults there (Status x Type, Task Priority vs Status, Duration by Tag, Points by Category), and you can drop new preset files into that folder.
  - Filter dropdowns auto-populate with your actual item types, template types, and YAML properties, making it easier to build conditions without memorizing field names.
- **Editor** - A full-featured code editor for managing Chronos scripts (`.chs`), YAML settings, and Markdown notes (`User/` directory).
  - **Features**: Syntax Highlighting, Shell Integration (`Run > Run File`), Settings (Theme/Tab Size), and Sidebar File Management.
  - **Shell Integration**: Can execute system commands (like `python`) directly from the integrated Terminal.

### Widgets (mounted via `data-widget="Name"`)
- **Scheduler (Today widget)** - Trim (-5/-10/custom), change start time, cut, mark complete, reschedule. Selecting a Calendar date loads a read-only preview for that day; actions remain today-only. Optional `fx` toggle expands variables in labels.
  - `Generate / Reschedule` now calls CLI bridge (`/api/cli`) and passes Kairos context properties.
  - Quick Toggles include: `buffers`, `timer breaks`, `sprints`, `ignore trends`, optional `timer_profile`, optional `template` override, optional `quickwins` max minutes.
  - Advanced Weights supports any custom property key (free text), passed as `custom_property:<name>` with slider weight via `prioritize:custom_property=<n>`.
  - Toggle state persists in localStorage (`chronos_sched_controls`).
- **Item Manager** - Search/browse by type (defaults include every registered item type). YAML editor, copy/rename/delete, bulk delete/setprop/copy/export.
- **Variables** - Inspect/edit runtime variables shared with the CLI, including `set`/`unset` rows and text expansion.
- **Terminal** - Runs CLI commands via `/api/cli`. Features **autosuggest** (commands/items/props) and **shell execution** (passes unknown commands like `python` or `git` to system shell).
- **Link** - Connect to a peer and sync a shared Canvas board (polling, last-write-wins).
- **Habit Tracker** - Snapshot of habits with polarity, streaks, and today's status.
- **Goal Tracker** - Goal list + detail view, milestone progress, "Start Focus" to bind the Timer, buttons to mark milestones complete.
- **Commitments** - Shows frequency/never rules, progress counts, violation info, and an Evaluate button (calls `commitments check` via `/api/cli`).
  - Widget rows are collapsible: list-first view (name + controls), click to expand details.
  - Supports manual daily check-in overrides (`Met`, `Violated`, `Clear`) via dashboard API.
- **Rewards** - Displays point balance/history, lists rewards with cooldown/cost info, Redeem buttons call `/api/reward/redeem`.
  - Widget rows are collapsible (compact list then expand for full details/actions).
- **Achievements** - Alphabetical list with filters, mark awarded/archived actions via `/api/achievement/update`.
  - Widget rows are collapsible (compact list then expand for full details/actions).
- **Achievements Titles** - Awarded achievements that include a `title` field show up as selectable profile titles in the Achievements widget.
- **Milestones** - Progress bars, filters (pending/in-progress/completed), Mark Complete / Reset buttons hitting `/api/milestone/update`.
  - Widget rows are collapsible (compact list then expand for full details/actions).
- **Inventory Manager** - Browse inventories, linked inventory items, and tools; add/remove items from kits without leaving the dashboard.
- **Notes, Journal, Profile, Review** - Quick editors/viewers for common flows. Review surfaces recent completions; Profile shows nickname/theme.
- **Nia AI Assistant** - Floating glass widget backed by ADUC bridge endpoints.
  - Shows identity rows (avatar + name) for Nia and user.
  - Renders markdown replies in chat bubbles.
  - Displays live thinking state with animated dots and elapsed seconds while waiting for agent replies.
  - `+` action menu currently includes:
    - `Attach a file`
    - `Wizards` (placeholder).
  - Header settings (`⚙`) include:
    - Open `Agent Preferences`, `Preference Settings`, `Pilot Brief`, and `Manage Memories` in Notes widget.
    - `Use memories` toggle (ADUC include-memory setting).
    - `Delete memories` action (clears Nia memory + Nia conversation history in ADUC).
- **Sticky Notes** - A colorful board backed by actual Chronos notes with `sticky:true`. Capture quick thoughts, pick a color, pin favorites, edit inline, and spawn reminders without opening the CLI.
- **Timer** - Start/pause/resume/stop, select profiles, show bound item state.
- **Sleep Settings** - Persistent sleep-anchor manager for day templates (mode presets, segments, day toggles, conflict checks, apply to selected/all/new templates).
- **Settings** - Lists `User/Settings/*.yml`, loads/validates, saves raw YAML to preserve comments.
- **Clock, Status, Debug Console** - Utility widgets for quick reference and event logging. Clock now includes a Manage panel for listing alarms/reminders and creating reminders from task/milestone/goal/project dates.
- **System Admin** - System maintenance and cleanup tools with safety confirmations.
  - **Quick Actions**: Purge logs, schedules, cache, and temp files with one click
  - **Advanced Cleanup**: Granular controls for specific databases (`db:<name>`), registry caches (`registry:<name>`), and archives
  - **Database Dropdown**: Lists all `.db` files with sizes for surgical deletion
  - **Registry Cache**: Clear wizards, themes, commands, or item types registries to force reload from source
  - See `clear` command in [CLI Reference](../Reference/CLI_Commands.md) for details

### Wizards
- **Life Setup Wizard** (`Utilities/Dashboard/Wizards/LifeSetup/index.js`) - Guided flow to create schedule anchors and apply them to day templates.
- **Flow**: Anchors → Configure → Review.
- **Anchors**: Sleep, Meals, Work, School/University, Commute, Exercise, plus custom anchors.
- **Output**: Generates fixed `timeblock` entries (reschedule: never, essential, non-flexible) and applies them to templates.
- **Conflicts**: Detects overlaps among anchors and against existing template blocks; requires resolution before apply. Recheck Conflicts only lights up after changes.
- **Templates**: Default is to create a new day template; can optionally apply to selected or all templates and either override conflicts or create a new template instead. When applying to existing templates, anchors override flexible items.
- **Sleep Hygiene Wizard** (`Utilities/Dashboard/Wizards/SleepSettings/index.js`) - Conversational guided flow that asks sleep pattern/times, captures sleep-hygiene optimizations (meal timing, screen cutoff, caffeine cutoff, blackout), and can create example bedtime microroutines before handing a draft to the Sleep Settings widget.
- **Meals**: Supports 1–3 meal blocks with default labels and custom times.
- **Commute**: Includes an auto-add helper to generate 30-minute before/after commute blocks from work/school anchors.
- **Coaching**: Review step summarizes sleep and exercise totals with gentle, informational nudges when totals are low.
- **Completion**: “Your life skeleton is set. You can now plan freely inside it.”
- **Chore Setup Wizard** (`Utilities/Dashboard/Wizards/ChoreSetup/index.js`) - Separate flow for activating chores and routine maintenance items (kept outside anchors so they remain flexible).
- **Status Mapping Wizard** (`Utilities/Dashboard/Wizards/StatusMapping/index.js`) - Bulk status-tagging workflow for items/templates.
- **Flow**: Status Map -> Scope -> Preview.
- **Status Map**: Loads dimensions/values from `User/Settings/status_settings.yml` (or `Status_Settings.yml`) and related `<status>_settings.yml` files; supports custom values.
- **Scope**: Filter by type/name/category/tag, limit to items missing status tags, and choose merge vs replace behavior.
- **Preview**: Shows coverage stats plus before/after `status_requirements` samples before writing.
- **Apply/Undo**: Writes via dashboard item APIs, optionally mirrors values to legacy top-level status keys, and supports one-session undo of the last batch.


### Rewards, Achievements, Points
- `GET /api/points` - `{ balance, history }`
- `GET /api/rewards`
- `POST /api/reward/redeem`
- `GET /api/achievements`
- `POST /api/achievement/update`

### Timer
- `GET /api/timer/status|profiles|settings`
- `POST /api/timer/start|pause|resume|stop`

### Commitments, Habits, and Tracker
- `GET /api/habits`
- `GET /api/commitments`
- `POST /api/commitments/override` - save a manual daily status (`met`, `violation`, `clear`) for a commitment.
- `GET /api/tracker/sources` - list habits and commitments available in Tracker inspector.
- `GET /api/tracker/year?type=habit|commitment&name=<item>&year=<yyyy>` - yearly day-state payload for Tracker.

### Popups
- Startup popup is loaded first in popup queue.
- Yesterday Check-in popup is hard-ordered second in popup queue.
- Sleep Check-In popup is loaded after Yesterday Check-in (priority-driven).
- Achievement Unlocked popup listens for new profile award-feed events and shows:
  - achievement unlocked details (+points, +XP)
  - current level ring progress
  - Level Up state when a level boundary is crossed
  - confetti burst and quick-open action for Achievements widget
- Topbar `Popups` menu:
  - includes `Disable popups` toggle
  - lists discovered popup modules
  - allows manual popup launch by clicking popup rows
- Yesterday Check-in behavior:
  - Reads yesterday schedule and completion entries.
  - Auto-marks unsaid scheduled items as missed (auto-miss) before user check-in.
  - Lets user confirm/update statuses for scheduled items and add extra entries done yesterday.
  - Supports snooze/remind actions.
- Sleep Check-In behavior:
  - prompts for last-night sleep duration and wake time
  - computes sleep deficit/surplus and recovery target
  - writes the sleep log to yesterday completion entries
- Endpoints:
  - `GET /api/yesterday/checkin`
  - `POST /api/yesterday/checkin`

### ADUC / Nia Bridge Endpoints
- `GET /api/aduc/status` - check ADUC server availability and URL.
- `GET /api/aduc/familiars` - list available ADUC familiars.
- `POST /api/aduc/start` - launch ADUC in dashboard mode if not running.
- `POST /api/aduc/chat` - enqueue familiar chat turn.
- `GET /api/aduc/cli/status?familiar=<id>&turn_id=<id>` - poll reply status/result.
- `GET /api/aduc/settings` - read ADUC prompt behavior settings.
- `POST /api/aduc/settings` - update ADUC prompt behavior settings (e.g., `include_memory`).
- `POST /api/aduc/cli/memory/clear` - clear ADUC conversation history for a familiar.
- `GET /api/nia/profile/avatar` - serve Nia profile picture from ADUC familiar assets for immediate widget rendering.

### Settings
- `GET /api/settings`
- `GET /api/settings?file=Name.yml`
- `POST /api/settings?file=Name.yml` - raw YAML body or `{ file, raw/data }`; validates before writing to preserve formatting.

### Dev Menu - Data Ops
- Added developer reset actions:
  - `Reset Achievements` (all achievements to pending/unawarded; resets achievement progression feed)
  - `Reset XP/Level` (profile achievement progression only)
  - `Reset Points` (points balance reset; ledger reset by default)

---

## Notes & Best Practices

- **Profile path:** `User/Profile/profile.yml` is the canonical location for nickname/preferences (used across CLI and dashboard).
- **CORS/security:** The server is permissive for localhost development only. Do not expose it publicly without adding auth and HTTPS.
- **Response format:** Prefer JSON for machine parsing; YAML responses are used when human readability helps (e.g., `/health`, `/api/today`).
- **State sharing:** The dashboard shares variables, templates, and item store with the CLI; running actions in the UI is equivalent to issuing CLI commands.

---

## Extending the Dashboard

### Auto-Discovery System

Chronos Dashboard uses a **plug-and-play architecture**. All components (Widgets, Views, Panels, Popups, Wizards, Themes) are automatically discovered by scanning the filesystem - no configuration files or code editing required.

**To add a new component:**
1. Create a folder in the appropriate directory
2. Add an `index.js` file with the required export function
3. (Optional) Add a metadata YAML file to customize labels or mark as post-release
4. Refresh the dashboard

| Component | Directory | Required Export | Optional Metadata |
|-----------|-----------|-----------------|-------------------|
| Widget | `Utilities/Dashboard/Widgets/<Name>/` | `mount(el, context)` | `widget.yml` |
| View | `Utilities/Dashboard/Views/<Name>/` | `mount(container, context)` | `view.yml` |
| Panel | `Utilities/Dashboard/Panels/<Name>/` | `register(manager)` | `panel.yml` |
| Popup | `Utilities/Dashboard/Popups/<Name>/` | `mount(el)` | `popup.yml` |
| Wizard | `Utilities/Dashboard/Wizards/<Name>/` | (wizard-specific) | `wizard.yml` |
| Theme | `Utilities/Dashboard/Themes/<name>.css` | N/A (CSS file) | (in CSS comments) |

### Example: Adding a Simple Widget

```bash
# 1. Create widget folder
mkdir "Utilities/Dashboard/Widgets/HelloWorld"

# 2. Create index.js
cat > "Utilities/Dashboard/Widgets/HelloWorld/index.js" <<EOF
export function mount(el, context) {
  el.innerHTML = \`
    <div class="widget-glass">
      <h2>Hello World!</h2>
      <p>My first custom widget</p>
      <button onclick="alert('Clicked!')">Click Me</button>
    </div>
  \`;
}
EOF

# 3. (Optional) Create metadata file
cat > "Utilities/Dashboard/Widgets/HelloWorld/widget.yml" <<EOF
label: "My Hello World Widget"
EOF

# 4. Refresh dashboard → HelloWorld appears in Widgets menu automatically!
```

### Metadata Options

All component types support optional metadata files:

```yaml
label: "Custom Display Name"  # Override auto-generated label
postRelease: true              # Show "later" badge in menu
enabled: true                  # Enable/disable without deleting
```

**Label Auto-Generation:**
- PascalCase folder names are automatically converted to readable labels
- `ProjectManager` → **Project Manager**
- `GoalTracker` → **Goal Tracker**
- `MP3Player` → **MP3 Player**

### Available Registries

All component registries are accessible via API:

```bash
GET /api/registry?name=widgets
GET /api/registry?name=views
GET /api/registry?name=panels
GET /api/registry?name=popups
GET /api/registry?name=wizards
GET /api/registry?name=themes
```

For complete developer documentation on creating components, see the [Extensibility Guide](../Dev/Extensibility.md).
