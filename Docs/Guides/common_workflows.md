# Common Workflows

This guide shows practical, repeatable ways to use Chronos — for humans at the keyboard and agents automating on your behalf. It pairs short "why" notes with concrete commands and YAML examples.

Who this is for
- Users who want a clear path to get things done.
- Agents that translate natural language into precise Chronos commands.

Conventions
- Text in backticks is a command you can run in the Chronos console.
- Filenames refer to `User/…` unless stated otherwise.
- Replace angle‑bracket placeholders with your values.

----------------------------------------

Capture & Organize

- Quick task
  - Create: `new task "Buy milk" priority:medium`
  - View: `view task "Buy milk"`
  - Edit in editor: `edit task "Buy milk" editor:notepad.exe`

- Quick note
  - Create: `new note "Idea: Morning pages"`
  - Append: `append note "Idea: Morning pages" "Try 3 pages after coffee."`

- Project and tasks
  - Create project shell: `new project "Home Gym"`
  - Add tasks: `new task "Order dumbbells" project:"Home Gym"`
               `new task "Assemble rack" project:"Home Gym"`
  - List just project tasks: `list task project:"Home Gym"`

- Use defaults
  - Put defaults in `User/Settings/task_defaults.yml` (lowercase preferred):
    ```yaml
    default_priority: medium
    default_status: pending
    ```
  - New tasks inherit defaults: `new task "Stretch 10 min"`

----------------------------------------

Templates, Routines, Subroutines

- Morning routine from template
  - New routine: `new routine "Morning"`
  - Add items to routine template: `add "Have coffee" to "Morning"`
                                   `add "Read 10 min" to "Morning"`
  - Open for fine-tuning: `edit routine "Morning"`

- Nesting: subroutines & microroutines
  - Subroutine: `new subroutine "Warmup"`
  - Append to routine: `add "Warmup" to "Morning"`
  - Add children to subroutine: `add "Stretch 5 min" to "Warmup"`

- Clone a template
  - Copy: `copy routine "Morning" "Morning (travel)"`
  - Rename inside: `rename routine "Morning (travel)" "Morning Travel"`

----------------------------------------

Habit Stacks (ordered habits as microroutines)

- What they are
  - A Habit Stack is an ordered bundle of habits (like a microroutine but habits-only) you can drop into routines/subroutines/day templates.
  - Use a small marker on the container so agents/dashboards can explain it: `habit_stack: true`, plus optional `cue:` (anchor) and `followed_by:` (what happens next).

- Example YAML (save as a microroutine)
  ```yaml
  name: Morning Prime (Habit Stack)
  type: microroutine
  habit_stack: true
  cue: coffee
  followed_by: Deep Work
  tags: [habit_stack, morning]
  children:
    - type: habit
      name: Hydrate
    - type: habit
      name: Stretch 5 min
    - type: habit
      name: Plan day
  ```

- Use it
  - Add to another template: `add "Morning Prime (Habit Stack)" to routine "Morning"` or to a day template in the Template Builder.
  - Schedule behavior stays the same: each habit is its own block; the stack just preserves order and intent.
  - Tracking is per habit; if you want a single “stack complete” signal, add a helper habit and include it as the last child.

----------------------------------------

Plan the Day

- Seed your status
  - Energy/focus/emotion impact scheduling: `status energy:high focus:good emotion:calm`
  - Tip: set these as you start your day; change as needed.

- Build or refresh today’s plan
  - Generate: `today reschedule`
  - Show: `today`

- Tweak the schedule
  - Trim duration: `trim "Have coffee" 5`
  - Change start time: `change "Read 10 min" 09:20`
  - Cut from today: `cut "Assemble rack"`
  - Mark completed: `mark "Have coffee":completed`
- Log completions & actuals
  - Capture what really happened: `did "Morning Meditation" start_time:07:30 end_time:07:55 status:completed note:"Felt great"`
  - Today now shows `upcoming/in progress/missed/completed/skipped/partial` next to each block, and `today reschedule` re-queues missed-but-still-important work automatically.
  - Daily completion entries live in `User/Schedules/completions/YYYY-MM-DD.yml` under `entries:` (used by `did`, `mark`, and `complete`).

- Resolve conflicts & dependencies
  - Use exact item names and keep durations realistic.
  - Add `depends_on: ["Warmup"]` in item YAML to hint order.

Tips for agents
- When a user says “move coffee earlier,” translate to: `change "Have coffee" 07:45` then `today reschedule`.
- When a user says “shorten reading by five,” translate to: `trim "Read 10 min" 5` then `today`.

Preview upcoming days
- Peek at tomorrow: `tomorrow` (or `tomorrow days:3` to jump a few days out). Saves to `User/Schedules/schedule_YYYY-MM-DD.yml` for quick reference.
- Check the current week: `this friday` to see how the rest of the week unfolds without altering today.
- Plan further out: `next tuesday` (or `next 12th of March`) to simulate the same scheduler logic for the next matching weekday/date.

----------------------------------------

Alarms & Reminders

- Create a daily reminder
  - `new reminder "Stand up" time:15:00 recurrence:[daily] enabled:true`

- Deadline vs due date
  - `due_date` = target completion date (soft)
  - `deadline` = hard stop / must-be-done-by
  - Example: `set task "Ship v1" deadline:2026-02-01 due_date:2026-01-15`

- Create an alarm with target action
  - `new alarm "Deep Work" time:09:00 enabled:true`
  - Edit alarm YAML to add:
    ```yaml
    target:
      type: task
      name: Deep Work
      action: open   # or complete | set_status
      properties:
        editor: code.exe
    ```

- Snooze/dismiss (when ringing)
  - `snooze "Deep Work"`
  - `dismiss "Deep Work"`

- Create alerts from item dates
  - Reminder from deadline: `reminder from task "Ship v1" use:deadline time:09:00`
  - Alarm from due date: `alarm from milestone "Finalize docs" use:due_date time:10:00`
  - Alias form: `set reminder from task "Ship v1" use:deadline time:09:00`

----------------------------------------

Goals & Milestones

- Create a goal
  - `new goal "Publish v1" priority:high due_date:2026-02-01`

- Add milestones
  - `new milestone "Docs complete" goal:"Publish v1" weight:2`
  - `new milestone "Dashboard polish" goal:"Publish v1" weight:1`
  - Criteria examples (edit YAML):
    - Count achievements of an item type:
      ```yaml
      criteria:
        count:
          of: { type: note, name: devlog }
          times: 10
          period: all
      ```
    - Checklist:
      ```yaml
      criteria:
        checklist:
          require: all
          items:
            - "Write landing page"
            - "Record demo"
      ```

- Track progress
  - Use Dashboard → Goals widget to view computed overall % and status counts.
  - Update milestone `progress.percent` in YAML or via an action you define.

----------------------------------------

Habits

- Create habit
  - `new habit "Morning walk" category:health priority:high`

- Track daily
  - Mark completion dates (edit YAML):
    ```yaml
    completion_dates:
      - 2025-01-03
      - 2025-01-04
    ```
  - Bad habits use `incident_dates` instead.

- Review
  - Dashboard → Habits widget shows streaks, today status, and trends.

----------------------------------------

Reviews (Daily/Weekly)

- Daily
  - Run: `today` and mark/cut/trim as needed.
  - Capture lessons learned in a `note` or `journal_entry`.

- Weekly
  - Use `User/Reviews/weekly/<YYYY-WW>.yml` as a template (existing examples in repo).
  - Command helper (if present): `review weekly` then `edit` the generated file.
  - Actions: archive completed tasks, adjust goals, refresh templates.

----------------------------------------

Points & Rewards

- Check and adjust
  - `points balance`
  - `points add 10 reason:"helped teammate"`
  - `points subtract 5 reason:"late start"`

- Configure earning
  - Edit `User/Settings/points_settings.yml`:
    ```yaml
    earn:
      task: 10
      routine: 5
      habit: 5
    ```
  - Some completion flows can add points automatically when you use your `complete` command patterns.

----------------------------------------

Search & Filters

- Filter by properties
  - `filter task priority:high`
  - `list task` (now shows filtered results)
  - `filter off` to clear
  - All items/templates: `filter all`

- Find by keyword
  - `find note meeting project:chronos`

----------------------------------------

Bulk Operations

- Add/update a property across many items
  - Preview: `filter task status:pending` then `bulk set priority:high`
  - Execute: `bulk set priority:high dry:false`
- Apply to all items/templates
  - Preview: `filter all` then `bulk set tag:legacy`
  - Execute: `bulk set tag:legacy dry:false`
- Clean up a property in bulk
  - Preview: `filter habit tag:stale` then `bulk remove tag`
  - Execute: `bulk remove tag dry:false`
- Safety tips
  - Use `limit:<n>` to test on a small batch first.
  - Use `dry:true` (default) to preview before running.

----------------------------------------

Templates & Scheduling

- Build a day template
  - Start with a routine: `new routine "Weekday Core"`
  - Add children: `add "Morning Prime" to routine "Weekday Core"`
  - Use in the Template Builder (Dashboard) or link in your day templates.
- Create a custom day template
  - `new day "Monday Default" tags:[weekday, focus]`
  - Add blocks/routines inside the YAML (or via Template Builder).
- Reschedule based on current status
  - `status energy:low focus:medium`
  - `today reschedule`
  - `today` to review changes.
- Protect buffers
  - Add a buffer item (e.g., `new timeblock "Buffer 15"` duration:15)
  - Place it between high-focus tasks in your routine/day template.

----------------------------------------

Listener & Timer

- Start/stop listener
  - `listener start`
  - `listener stop`
- Build a focus session
  - `timer start deep_work type:task name:"Write v1 spec"`
  - `timer pause` / `timer resume` / `timer stop`
- Create a reminder that runs a script
  - `new reminder "Hydrate" time:15:00 enabled:true`
  - Add `script: "Scripts/hydrate.chs"` in the reminder YAML.
- Dismiss a ringing alarm
  - `dismiss "Deep Work"`
  - `snooze "Deep Work"`

----------------------------------------

Reviews & Reflections

- Daily review
  - `review daily`
  - `edit review "<today>"` (or open the generated file in `User/Reviews/`).
- Weekly review
  - `review weekly`
  - Archive completed items and adjust templates.
- Export a review
  - `review export weekly format:md`

----------------------------------------

Sequence & Analytics

- Refresh mirrors after big changes
  - `sequence sync` (all mirrors)
  - `sequence sync core matrix` (targeted)
- Update trends digest
  - `sequence trends`
- Inspect mirror status
  - `sequence status`

----------------------------------------

Dashboard & API

- Run the dashboard
  - `dashboard` (alias `dash`)
- Use the CLI Bridge from the dashboard
  - Run commands through the Terminal widget or `/api/cli`.
- Theme switching
  - Pick a theme in the dashboard theme picker (see `Utilities/Dashboard/Themes/`).

----------------------------------------

Variables, Aliases, and Macros

- Create an alias
  - `alias focus "status energy:high focus:good; today reschedule"`
  - `alias list`
- Use variables in scripts
  - `set var project "Chronos"`
  - Reference `@project` in `.chs` scripts.
- Macros (BEFORE/AFTER)
  - Use `Macros.md` to define global hooks for command workflows.

----------------------------------------

Inventory & Tools

- Track gear
  - `inventory list`
  - `inventory add "Camera Bag"`
  - `inventory remove "Camera Bag"`
- Add tools to inventories
  - `new tool "Focus Music" place:office tags:[audio,focus]`
  - `inventory add "Focus Music" to "Desk"`

----------------------------------------

Goals, Rewards, Achievements

- Progress via actions
  - `complete goal "Publish v1"`
  - `redeem reward "Movie Night" reason:"Shipped a feature"`
- Milestone updates
  - `set milestone "Docs complete" progress.percent:50`

----------------------------------------

Maintenance & Backups

- Integrity check
  - `check`
- Quick backup
  - `backup`
- Clean temp files
  - `clean`

----------------------------------------

Scripts (Automation)

- Run a script file
  - Put a `.chs` file anywhere (e.g., `Scripts/morning.chs`), then run:
    - `"Scripts/morning.chs"`

- Script example
  ```chs
  # Seed day
  status energy:high focus:good
  today reschedule

  # If I have a deep work block, add prep
  if exists task:Deep Work then
    append note Prep "Outline goals for the block"
  end
  ```

- Variables
  - Use `@nickname` (from `User/Profile/profile.yml`) in messages.
  - Set inside scripts with `set var <name> <value>` or via specific command outputs.

----------------------------------------

Dashboard Essentials

- Calendar + Scheduler (Today widget)
  - Select a block in Day view; use Scheduler to Trim/Change/Cut/Mark (today only); press Reschedule.

- Settings widget
  - Browse and edit `User/Settings/*.yml` with YAML validation and preserved formatting.

- Items/Notes/Timer/Status/Goals/Habits widgets
  - Use for quick ops; for heavy lifts, combine with CLI.

----------------------------------------

Agent Patterns (translation hints)

- “Add X to Y” → `add "<X>" to "<Y>"`
- “Create a Z called N with P=V” → `new <z> "<n>" <p>:<v>`
- “Make it start at 9:30” → `change "<item>" 09:30` then `today reschedule`
- “Shorten it by 10” → `trim "<item>" 10` then `today`
- “Complete this” → `mark "<item>":completed` (or your `complete` flow)
- “Set mood to calm and focus to high” → `status emotion:calm focus:high`

Keep outputs friendly, confirm actions, and offer next steps (e.g., suggest `today reschedule` after edits).

----------------------------------------

Troubleshooting

- Mojibake/odd characters in console
  - Use the launchers; they force UTF‑8. Avoid pasting non‑Unicode glyphs.

- Settings edits not applying
  - Confirm file names are lowercase (e.g., `task_defaults.yml`), or rely on resolver fallbacks.

- Dashboard not loading assets
  - Ensure `server.py` is running and browser points to `http://127.0.0.1:7357` for assets/API.

----------------------------------------

Next Steps
- Explore `Docs/Dev/Architecture.md` to extend commands and modules.
- Review `Docs/Guides/Dashboard.md` for APIs and widget ideas.
- Add your own templates and scripts to shape Chronos to your workflow.
