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

- Resolve conflicts & dependencies
  - Use exact item names and keep durations realistic.
  - Add `depends_on: ["Warmup"]` in item YAML to hint order.

Tips for agents
- When a user says “move coffee earlier,” translate to: `change "Have coffee" 07:45` then `today reschedule`.
- When a user says “shorten reading by five,” translate to: `trim "Read 10 min" 5` then `today`.

Preview upcoming days
- Peek at tomorrow: `tomorrow` (or `tomorrow days:3` to jump a few days out). Saves to `User/Schedules/tomorrow_schedule.yml` for quick reference.
- Check the current week: `this friday` to see how the rest of the week unfolds without altering today.
- Plan further out: `next tuesday` (or `next 12th of March`) to simulate the same scheduler logic for the next matching weekday/date.

----------------------------------------

Alarms & Reminders

- Create a daily reminder
  - `new reminder "Stand up" time:15:00 recurrence:[daily] enabled:true`

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

- Find by keyword
  - `find note meeting project:chronos`

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

- Calendar + Today widget
  - Select a block in Day view; use Today to Trim/Change/Cut/Mark; press Reschedule.

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
