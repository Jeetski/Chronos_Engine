# Chronos Engine - Complete Documentation Summary

## Overview

**Chronos Engine** is a comprehensive, YAML-first life management system with a modular architecture built for humans and AI agents. It combines a powerful CLI, a local dashboard, background services (Listener & Timer), and sophisticated scheduling algorithms to help users live intentionally through status-aware, template-driven daily planning.

**Current Status**: Alpha v0.2 (active through 2026-03 changelog updates)

---

## 📜 Core Philosophy

### The Weekly Cycle: Dedication, Not Sacrifice

Chronos rejects the traditional "balance" approach that dilutes every day. Instead, it embraces a **weekly cycle** where each day is **dedicated** to a core facet of life:

- One day for focused creation
- Another for wild adventure
- A third for deep connection
- Another for quiet restoration

**Result**: A complete life in miniature every week, where every aspect gets its spotlight without compromise.

---

## 🏗️ Architecture

### System Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Console** | `modules/console.py` | CLI entry point, command dispatch, REPL, scripting |
| **Commands** | `commands/*.py` | Thin command implementations (`run(args, properties)`) |
| **Modules** | `modules/*/main.py` | Item-specific logic, defaults, event handlers |
| **ItemManager** | `modules/item_manager.py` | Generic CRUD operations for all item types |
| **Scheduler** | `commands/today.py` + `modules/scheduler.py` | Daily agenda builder with conflict resolution |
| **Listener** | `modules/listener/` | Background service for alarms, reminders, timer |
| **Dashboard** | `utilities/dashboard/` | Local HTTP server + vanilla JS SPA |
| **Sequence** | `modules/sequence/` | SQLite mirrors + analytics (`trends.md`) |
| **User Data** | `user/` | All YAML items, settings, templates, logs |

### Data Model

- **Everything is an item**: Tasks, routines, notes, goals, habits, commitments, rewards, achievements
- **Fractal hierarchy**: Items nest infinitely (week → day → routine → subroutine → microroutine → task)
- **YAML-first**: Human-readable files, preserves formatting
- **SQLite mirrors**: Fast analytics via `sequence` command (`chronos_core.db`, `chronos_matrix.db`, etc.)

---

## 🎯 Core Features

### 1. Status-Aware Scheduling

**The Killer Feature**: Templates and items include `status_requirements` that match against your current state (energy, focus, mood, stress).

**How it works**:
- `user/settings/status_settings.yml` defines status dimensions (legacy `Status_Settings.yml` still supported)
- Templates are scored based on alignment with current status
- The best-fit template is automatically selected for today
- Items matching your status get importance boosts
- `today reschedule` auto-requeues missed-but-important work

**Example workflow**:
```bash
status energy:low focus:medium emotion:calm
today reschedule
```

### 2. Sophisticated Scheduling Algorithm

**Pipeline** (10 phases):
1. Template selection (status alignment scoring)
2. Build "impossible ideal" schedule
3. Apply manual edits (trim/cut/change)
4. Calculate importance (8-factor subtractive model)
5. Promote missed items (+20 boost)
6. Inject status-triggered items
7. **Conflict resolution loop** (shift, trim, cut)
8. Fill work windows (flexible items)
9. Insert buffers
10. Save and display

**Importance Factors** (subtractive scoring from 100):
1. Environment (can you do it?) - weight 7
2. Category (life priorities) - weight 6
3. Happiness (Map alignment) - weight 5
4. Due Date - weight 4
5. Deadline - weight 5
6. Status Alignment - weight 3
7. Priority Property - weight 2
8. Template Membership - weight 1

### 3. Comprehensive Dashboard

**Views**:
- **Calendar**: Year/Month/Week/Day canvas with interactive Day List
- **Template Builder**: Drag-and-drop for week/day/routine templates
- **Cockpit**: Modular panel canvas (Schedule, Matrix, Status Strip, Commitments, etc.)
- **Editor**: Integrated code editor for `.chs` scripts, YAML, Markdown
- **Canvas**: Infinite whiteboard for visual planning (YAML-backed `canvas_board` items)

**30+ Widgets**:
- Scheduler (Today widget), Item Manager, Terminal, Variables
- Habit Tracker, Goal Tracker, Commitments, Rewards, Achievements, Milestones
- Timer, Settings, Clock, Status, Debug Console, System Admin
- Sleep Settings widget for direct sleep-anchor management across day templates
- Notes, Journal, Profile, Review, Inventory Manager, Sticky Notes

**Dock + Gadgets**:
- Bottom revealable dock with quick-action gadgets.
- Gadgets are toggleable from topbar **Gadgets** menu.
- Built-ins include Timer (countdown/actions) and Reschedule (`today reschedule`) shortcuts.

**Key APIs**:
- `/api/cli` - Run commands from dashboard
- `/api/items`, `/api/item` - CRUD operations
- `/api/today`, `/api/today/reschedule` - Schedule management
- `/api/timer/*`, `/api/points`, `/api/rewards`, `/api/achievements`
- `/api/settings`, `/api/theme`, `/api/vars`
- `/api/registry?name=gadgets` - Dock gadget registry

### 4. CHS Scripting Language

**Features**:
- Variables: `@nickname`, `@status_energy`, `@status_focus`, `@location` (alias `@status_place`), `@timer_profile`, `@var`, `@{var}`
- Dotted aliases are supported: `@status.energy`, `@profile.nickname`, `@timer.profile`
- Conditionals: `if/elseif/else/end` (block and single-line)
- Loops: `repeat`, `for`, `while` (bounded)
- Operators: `== != > < >= <= matches` (regex)
- Logic: `and or xor nor not !`
- Sources: `status:energy`, `task:Name:priority`, `exists file:...`

**Example**:
```chs
# Seed day
status energy:high focus:good
today reschedule

# Conditional work
if exists task:Deep Work then
  append note Prep "Outline goals for deep work"
end
```

### 5. Macros (BEFORE/AFTER Hooks)

Opt-in automation that runs before/after any command.

**Step types**: `cli`, `chs`, `setvar`, `noop`

**Context variables**: `@cmd`, `@args0`, `@args1`, `@priority`, `@result_ok`

**Example**:
```yaml
enable_macros: true
before_command:
  new:
    - cli: ["echo", "Creating @args0 '@args1'"]
after_command:
  delete:
    - cli: ["echo", "Deleted: @args1"]
```

### 6. Sequence System (Long-Term Memory)

SQLite mirrors for fast analytics:

**Databases**:
- `chronos_core.db` - YAML items, relations, completions
- `chronos_matrix.db` - Analytics cache for Matrix panels
- `chronos_events.db` - Listener logs + command history
- `chronos_behavior.db` - Planned vs actual activity, variance, completion rates
- `chronos_journal.db` - Status snapshots + narratives for context
- `chronos_trends.db` - Derived trends
- `trends.md` - Human-readable digest for agents

**Commands**:
- `sequence status` - Show mirror registry
- `sequence sync [targets]` - Rebuild mirrors
- `sequence trends` - Rebuild behavior/trends + digest

**Automation**: Listener runs `sequence sync behavior journal trends` nightly

### 7. Gamification & Motivation

**Points System**:
- `points.yml` ledger
- Earned on completion (tasks, habits, goals, milestones)
- Tracked via `utilities/points.py`

**Rewards**:
- Cost + cooldown enforcement
- Target actions (open item, complete, set status)
- CLI: `redeem reward "Movie Night" reason:shipped_feature`

**Achievements**:
- Progress tracking (criteria: count, checklist)
- Title system for profile
- Mark awarded/archived via dashboard or CLI

**Commitments**:
- Frequency rules (3x per week)
- Never rules (no video games on weekdays)
- Triggers: scripts, rewards, achievements
- `commitments check` evaluates and fires triggers
- Commitments are promises that observe target items (tasks/habits); they are not executed directly.

**Goals & Milestones**:
- Hierarchical progress tracking
- Weighted milestones contribute to goal %
- Criteria: count items, checklist, custom scripts

### 8. Extensibility

**CLI Plugin System**:
- Config: `user/plugins/plugins.yml`
- Load path: `user/plugins/<plugin_id>/plugin.py`
- Contract: `register(context)` returning `commands`/`aliases`/optional `help`
- Failure isolation: one broken plugin does not block CLI boot
- Built-in management command: `plugins` (alias: `plugin`)

**Dashboard Auto-Discovery System**:
- All dashboard components are plug-and-play (drop folder -> auto-discovered)
- No dashboard configuration files or code editing required
- **Wizards**: `utilities/dashboard/wizards/<Name>/`
- **Themes**: `utilities/dashboard/themes/<name>.css`
- **Widgets**: `utilities/dashboard/widgets/<Name>/`
- **Views**: `utilities/dashboard/views/<Name>/`
- **Panels**: `utilities/dashboard/panels/<Name>/`
- **Popups**: `utilities/dashboard/popups/<Name>/`
- **Gadgets**: `utilities/dashboard/gadgets/<Name>/`

**APIs**:
- `GET /api/registry?name=wizards|themes|widgets|views|panels|popups|gadgets`
- `GET /api/registry?name=commands|items|properties` (legacy)
- Dashboard auto-discovers and lists all extensions

**Adding Components**:
1. **Command**: Create `commands/name.py` with `run(args, properties)`
2. **CLI Plugin Command**: Add plugin entry in `user/plugins/plugins.yml`, then implement `user/plugins/<id>/plugin.py`
3. **Item Type**: Create `modules/type/main.py` with `handle_command`
4. **Widget/View/Panel/Popup/Gadget**: Create folder in appropriate directory with `index.js`
5. **Wizard**: Create folder in `Wizards/` with `index.js`
6. **Theme**: Drop CSS file into `Themes/`
7. Refresh dashboard - component appears automatically

See `docs/dev/extensibility.md` for complete documentation.

### 9. ADUC Integration

**ADUC** (Agents Dress Up Committee): Visual interface for AI "Familiars"

**Features**:
- Visual avatars with emotion states
- Persistent memory
- Cycle awareness (Focus/Break)
- CLI Bridge for command execution

**Chronos Mode**:
- Launch via `aduc` command or `ADUC_launcher.bat`
- Auto-injects Agent Guide, Pilot Brief, Preferences
- Turns generic AI into "Nia" (Chronos pilot)

### Sleep Workflow (Wizard + Widget)

- **Sleep Hygiene Wizard**: Conversational setup for sleep pattern/timing plus optimization defaults (meal timing, screen cutoff, caffeine cutoff, blackout room).
- **Sleep Settings Widget**: Persistent editor for sleep anchor blocks (mono/bi/poly presets, segment/day editing, overlap checks, apply-to selected/all/new templates).
- **Example Bedtime Pack**: Wizard can generate example bedtime microroutines and a bedtime routine scaffold.

---

## 📋 Common Workflows

### Daily Flow
```bash
# Morning
status energy:high focus:good emotion:calm
today reschedule
timer start deep_work bind_type:task bind_name:"Write v1 spec"

# Log actuals
did "Morning Meditation" start_time:07:30 end_time:07:55 status:completed

# Adjust on the fly
change "Deep Work" 10:00
trim "Meeting" 15
cut "Optional Call"
```

### Template Management
```bash
# Build routine
new routine "Morning Core"
add "Coffee" to "Morning Core"
add "Meditation" to "Morning Core"

# Use in day template
add "Morning Core" to day "Monday Default"
```

### Goals & Milestones
```bash
new goal "Ship v1" priority:high due_date:2026-02-01
new milestone "Docs complete" goal:"Ship v1" weight:2
track goal "Ship v1"
```

### Bulk Operations
```bash
filter task status:pending
bulk set priority:high dry:false
```

---

## 🛠️ CLI Command Categories

### Core CRUD
`new`, `create`, `append`, `set`, `get`, `remove`, `copy`, `rename`, `move`, `delete`, `edit`, `view`, `list`, `find`, `count`

### Scheduling
`today`, `tomorrow`, `this`, `next`, `change`, `shift`, `trim`, `stretch`, `split`, `merge`, `anchor`, `cut`, `mark`, `did`, `complete`, `timer`, `start`, `status`, `quickwins`

### Items
Universal verbs work for: tasks, notes, projects, routines, subroutines, microroutines, goals, milestones, habits, commitments, rewards, achievements, alarms, reminders, appointments

### Automation
`if`, `repeat`, `for`, `while`, `run`, `alias`, `macro`, `vars`, `unset`

### Advanced
`filter`, `bulk`, `sequence`, `dashboard`, `template`, `commitments`, `redeem`, `points`, `review`, `tree`, `register`

### Utilities
`backup`, `restore`, `export`, `import`, `diff`, `undo`, `clean`, `clear`, `search`, `docs`, `inventory`, `settings`, `theme`, `profile`, `aduc`, `listener`, `sound`

---

## 🎨 Dashboard Architecture

### Frontend
- Vanilla JS SPA (`app.js`)
- ES modules
- Event bus for widget communication
- View system (tiling windows)
- Hot-swappable themes (Blue, Amber, Emerald, Rose)

### Backend
- `ThreadingHTTPServer` (Python)
- JSON/YAML endpoints
- Streams MP3s from `user/media`
- Settings bundler for fast startup

### Cockpit Panels
- Drag/drop canvas with pan/zoom
- State persisted in `chronos_cockpit_panels_v1`
- Current panels: Schedule, Matrix, Matrix Visuals, Lists, Deadlines, Commitments, Map of Happiness, Status Strip, Data Cards

---

## 📊 Configuration Files

### Core Settings
- `user/settings/*_defaults.yml` - Item type defaults
- `scheduling_settings.yml`, `scheduling_priorities.yml`
- `status_settings.yml`, `energy_settings.yml`, etc.
- `category_settings.yml`, `priority_settings.yml`
- `points_settings.yml`, `level_settings.yml`
- `buffer_settings.yml`, `map_of_happiness.yml`

### Profile
- `user/profile/profile.yml` - Nickname, preferences
- `user/profile/pilot_brief.md` - Priorities, motivations
- `user/profile/preferences.md` - Agent interaction preferences
- `user/profile/personality.yml` - Big 5 psychometric traits

### Data Mirrors
- `user/data/databases.yml` - Mirror registry
- `user/data/sequence_automation.yml` - Nightly sync state
- `user/data/trends.md` - Behavior digest for agents

---

## 🤖 Agent Integration

### For Operators (agents.md)
**Prime Directives**:
1. Be Nia: friendly, upbeat, lightly sci-fi
2. Always load pilot brief + preferences + digest
3. Explain every action
4. Stay proactive
5. Fail gracefully

**Mental Model**:
- Everything is an item
- Fractal hierarchy
- Status-aware scheduling
- Canvas awareness

**Toolbox**: Universal item verbs, scheduling commands, rewards/achievements, goals/milestones

### For Developers (Skills + Dev Docs)
**Extension Scenarios**:
1. New item type -> use `docs/dev/architecture.md` + `modules/item_manager.py` patterns
2. New widget/view/panel/popup -> use `docs/dev/extensibility.md`
3. Scheduling behavior -> use Kairos docs in `docs/scheduling/*`
4. Agent-facing workflows -> add/update `docs/agents/skills/*`

**Conventions**:
- Keep commands thin and move reusable logic into modules/utilities
- Keep behavior deterministic/idempotent where possible
- Guard against missing files/YAML
- Update references + skills whenever command/API behavior changes

---

## 🧹 Admin Tools

### Clear Command
```bash
clear logs [force]              # Delete all logs
clear schedules [force]         # Delete schedule history
clear cache [force]             # Delete all .db files
clear db:chronos_matrix [force] # Delete specific database
clear registry:wizards [force]  # Clear specific registry
clear temp [force]              # Delete temp files
clear archives [force]          # Delete all archives
clear all                       # Nuclear option (requires typing "DELETE EVERYTHING")
```

### System Admin Widget
**Quick Actions**: Purge logs, schedules, cache, temp
**Advanced**: Specific database/registry selection, archive deletion
**Safety**: Confirmation dialogs, status display

---

## 📦 File Structure

```
Chronos Engine/
├── commands/           # CLI verbs
├── modules/            # Engine features + item types
│   ├── Console.py
│   ├── ItemManager.py
│   ├── Scheduler.py
│   ├── Sequence/
│   └── */main.py
├── utilities/
│   ├── Dashboard/
│   │   ├── server.py
│   │   ├── Widgets/
│   │   ├── Panels/
│   │   ├── Views/
│   │   └── Themes/
│   └── points.py
├── user/               # Your data
│   ├── Tasks/, Notes/, Goals/, Habits/, etc.
│   ├── Settings/
│   ├── Profile/
│   ├── Schedules/
│   ├── Data/          # SQLite mirrors
│   └── Archive/
├── docs/              # This comprehensive documentation
└── Agents Dress Up Committee/  # ADUC visual interface
```

---

## 🚀 Getting Started

### Install
```bash
# Windows
install_dependencies.bat
onboarding_wizard.bat

# Linux/macOS
./install_dependencies.sh
```

### Launch
```bash
# CLI
console_launcher.bat

# Listener (background service)
listener_launcher.bat

# Dashboard
dashboard_launcher.bat
# OR from console:
dashboard
```

### First Steps
1. Run onboarding wizard to set nickname, categories, statuses
2. Set your status: `status energy:high focus:good`
3. Build your day: `today reschedule`
4. Open dashboard: `dashboard`

---

## 📚 Documentation Index

### Must-Read
- **README.md**: Product overview, quickstart, feature map
- **Philosophy.md**: Core principles, weekly cycle worldview
- **Agents/agents.md**: Agent operator guide (180+ lines)

### Guides
- Dashboard, Canvas, Cockpit, Settings
- Common Workflows (460+ lines of recipes)
- Conditions Cookbook

### Development
- Architecture, CHS Scripting, Macros, Sequence
- DataCards, Extensibility, Autosuggest
- Agent routing + skills (`docs/agents/agents.md`, `docs/agents/skills/index.md`)

### Scheduling
- Algorithm Overview (importance scoring, conflict resolution)
- Kairos Elements Reference (windows, timeblocks, buffers, anchors, quick wins, gaps)

### Reference
- CLI Commands (400+ lines, complete command reference)
- Item Properties (standard fields)
- Admin Tools

---

## 🎯 Key Innovations

1. **Status-Aware Scheduling**: Templates adapt to your human state
2. **Fractal Templates**: Infinite nesting for any workflow
3. **Reschedule Intelligence**: Auto-requeues missed work with boosts
4. **Unified Item System**: Same verbs for all item types
5. **Canvas Collaboration**: YAML-backed whiteboard for humans + agents
6. **Cockpit Modularity**: Drag-and-drop mission control panels
7. **Sequence Mirrors**: Fast analytics without reparsing YAML
8. **CHS Scripting**: Purpose-built automation language
9. **Macro Hooks**: BEFORE/AFTER command interception
10. **Dynamic Registries**: Drop-in wizards, themes, data cards

---

## 🔮 Future Vision

**From Docs**:
- Multi-user Canvas collaboration with conflict resolution
- Network graphs for Data Card visualizations
- Mobile app integration
- Advanced environment matching for importance scoring
- Timeline view for projects
- Advanced filtering UI in dashboard

**Philosophy**:
Chronos aspires to be the operating system for living a deeply lived life—where every day is dedicated, every week is complete, and every instrument in your personal orchestra gets its moment to play a soaring solo.

---

## 📝 Release Notes Summary

**Alpha v0.2** (Jan 2026):
- Centralized logging (`logs/engine.log`)
- Live Debug Console in dashboard
- Test suite foundation
- Debug hygiene (debug/ directory)
- Graceful error handling
- `/api/logs` endpoint

---

## 💡 Pro Tips

1. **Always update status before rescheduling**: `status energy:low` → `today reschedule`
2. **Use templates for repetition**: Copy & modify rather than creating from scratch
3. **Log actuals with `did`**: Feeds reschedule intelligence + trend analysis
4. **Preview future days**: `tomorrow`, `this friday`, `next tuesday`
5. **Leverage filters + bulk**: `filter task status:pending` → `bulk set priority:high`
6. **Backup before experiments**: `backup` command creates safety net
7. **Clear specific databases**: `clear db:chronos_matrix` over `clear cache`
8. **Read trends.md**: Agent-friendly digest of your behavior patterns
9. **Use Cockpit for daily ops**: Schedule + Status Strip + Lists panels
10. **Canvas for planning**: Visual whiteboard shared with agents

---

## 🏆 Standout Features for Power Users

### For Planners
- Template Builder with drag-and-drop nesting
- Status-aware template selection
- Work windows for flexible scheduling
- Buffer insertion rules

### For Automators
- CHS scripts with conditionals + loops
- Macro hooks (BEFORE/AFTER)
- Bulk operations with dry-run
- Commitment triggers

### For Analysts
- Sequence mirrors (SQLite)
- Matrix panels with presets
- Trends digest auto-generation
- Debug console + logging

### For Gamers
- Points + rewards economy
- Achievement tracking with titles
- Commitment evaluation
- Milestone progress bars

### For Collaborators
- Canvas boards (YAML-backed)
- Link widget (peer-to-peer sync)
- ADUC integration (AI familiars)
- Dashboard API for agents

---

## 📞 Quick Reference

| What | Command/Location |
|------|------------------|
| **Show today** | `today` |
| **Rebuild schedule** | `today reschedule` |
| **Set status** | `status energy:high focus:good` |
| **Preview tomorrow** | `tomorrow` |
| **Create task** | `new task "Name" priority:high` |
| **Log completion** | `did "Block" status:completed` |
| **Adjust schedule** | `change "Item" 10:00`, `trim "Item" 15`, `cut "Item"` |
| **Start timer** | `timer start deep_work` |
| **Check commitments** | `commitments check` |
| **Redeem reward** | `redeem reward "Movie Night"` |
| **Track goal** | `track goal "Ship v1"` |
| **Refresh trends** | `sequence trends` |
| **Launch dashboard** | `dashboard` |
| **Open ADUC** | `aduc` |
| **Backup** | `backup` |
| **Documentation** | `docs/index.md` |

---

**Chronos Engine**: Your life, your templates, your status, your schedule. Live intentionally.












