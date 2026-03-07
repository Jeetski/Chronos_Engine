# Chronos CLI Command Reference

This document provides a comprehensive reference for all available CLI commands in the Chronos Engine.

## Core Commands

### `list`
Lists items of a specific type.
**Usage:** `list <type> [filter]`
**Example:**
- `list tasks`
- `list projects status:active`

### `new`
Creates a new item.
**Usage:** `new <type> <name> [properties...]`
**Example:** `new task "Finish Report" due:today priority:high`

### `create`
Creates a new item (alias-style alternative to `new`).
**Usage:** `create <type> <name> [properties...]`

### `add`
Adds an item to a template, intelligently resolving ambiguity.
**Usage:** `add <item_to_add> to <target_template> [position:<number>]`

### `append`
Appends text to the content of an existing item.
**Usage:** `append <type> <name> "<text_to_append>" [property_key:property_value ...]`

### `set`
Sets properties of an item or defines a script variable.
**Usage:** `set <type> <name> <property_key>:<value> [...]`

### `get`
Retrieves the value of a specific property from an item.
**Usage:** `get <type> <name> <property_key> [variable_name:<var_name>] [property_key:property_value ...]`

### `remove`
Removes a specified property from an item.
**Usage:** `remove <type> <name> <property_key>`

### `copy`
Creates a duplicate of an existing item, optionally with a new name and modified properties.
**Usage:** `copy <type> <source_name> [new_name] [property_key:property_value ...]`

### `rename`
Renames an existing item.
**Usage:** `rename <type> <old_name> <new_name> [properties]`

### `move`
Moves an item to a new item type, renames it, or both.
**Usage:** `move <source_type> <source_name> [new_name] [type:<target_type>] [name:<new_name>] [property_key:property_value ...]`

### `count`
Counts items of a specific type, optionally filtered by properties.
**Usage:** `count <type> [property_key:property_value ...]`

### `find`
Searches for items of the specified type based on a keyword and optional properties.
**Usage:** `find <type> <keyword> [property_key:property_value ...]`

### `reminder`
Creates a reminder from an item's deadline or due date.
**Usage:** `reminder from <type> <name> [use:deadline|due_date] [date:YYYY-MM-DD] [time:HH:MM] [message:"..."]`
**Example:** `reminder from task "Ship v1" use:deadline time:09:00`
**Notes:** If no time is provided and the item date has no time, Chronos uses the reminder default time (or 09:00).
**Alias:** `set reminder from <type> <name> ...`

### `alarm`
Creates an alarm from an item's deadline or due date.
**Usage:** `alarm from <type> <name> [use:deadline|due_date] [date:YYYY-MM-DD] [time:HH:MM] [message:"..."]`
**Example:** `alarm from milestone "Finalize docs" use:due_date time:10:00`
**Notes:** If no time is provided and the item date has no time, Chronos uses the alarm default time (or 09:00).
**Alias:** `set alarm from <type> <name> ...`

### `edit`
Opens an item in the configured default editor.
**Usage:** `edit <type> <name>`
**Notes:**
- Reads `default_editor` from `User/Settings/config.yml` (fallback behavior applies if missing).
- Special case: `default_editor: chronos_editor` routes the open request into the dashboard Editor view.

### `delete`
Deletes an item permanently (use `archive` for soft delete).
**Usage:** `delete <type> <name>`

### `view`
Displays the contents of an item in the terminal.
**Usage:** `view <type> <name>`

### `help`
Displays help information for a command.
**Usage:** `help <command>`

## Scheduling & Tracking

### `today`
The central command for daily management.
**Subcommands:**
- `today`: Shows today's schedule (in-progress and upcoming). Uses Kairos active scheduler by default.
- `today reschedule`: Rebuilds the schedule with conflict resolution. Uses Kairos active scheduler by default.
- `today routines|subroutines|microroutines`: Collapses display to that level.
- `today kairos [options]`: Run Kairos shadow schedule generation.
- `today kairos week [days:N] [options]`: Generate rolling weekly skeleton.
- `today legacy [subcommand/options]`: Force legacy scheduler path.

**Kairos options (Chronos syntax):**
- `template:<name|path>`
- `status:key=value,key=value` (example: `status:energy=high,focus=high`)
- `prioritize:key=value,key=value` (example: `prioritize:happiness=9,deadline=5`)
- `custom_property:<property_name>` (example: `custom_property:focus_depth`)
- `buffers:true|false`
- `breaks:timer|none`
- `sprints:true|false`
- `timer_profile:<profile_name>`
- `quickwins:N`
- `ignore-trends` or `ignore-trends:true|false`
- `days:N` (weekly mode)

### `tomorrow`
Previews the schedule for tomorrow (or a specified offset).
**Usage:** `tomorrow [days:<n>]`

### `this`
Previews the nearest occurrence of a weekday in the current week.
**Usage:** `this <weekday>`

### `next`
Previews a future schedule beyond tomorrow.
**Usage:** `next day|<weekday>|<ordinal> [of] <month>`

### `track`
Displays tracking data for a specific item.
**Usage:** `track <item_type> <item_name>`
**Examples:**
- `track task "Deep Work"`
- `track routine "Morning Routine"`

### `quickwins`
Lists small, high-leverage candidates from missed blocks and due/overdue work.
**Usage:** `quickwins [minutes:N] [days:N] [limit:N] [missed:true|false] [overdue:true|false] [due:true|false] [date:YYYY-MM-DD] [format:json]`
**Examples:**
- `quickwins`
- `quickwins minutes:20 limit:8`
- `quickwins date:2026-03-06 missed:true overdue:true due:false`
- `quickwins format:json limit:5`
**Notes:**
- Reads defaults from `User/Settings/quick_wins_settings.yml`.
- Good companion with `today inject "<name>" at HH:MM`.

### `timer`
Manages the countdown timer.
**Usage:**
- `timer start <profile> [type:<item_type> name:<item_name>] [cycles:N] [auto_advance:true|false]`
- `timer pause | resume | stop | status`
- `timer confirm yes|no`
- `timer profiles list | view <name> | save <name> [k:v ...] | delete <name>`
**Notes:**
- In schedule mode (`start day` / `start today`), Chronos treats buffer and break blocks as timer breaks, not completable work items.
- These blocks do not trigger completion prompts, completion logs, or completion-based point awards.

### `start`
Rebuilds today's schedule and starts a timer sequence of the remaining blocks.
**Usage:**
- `start day`
- `start today`

### `status`
Views or sets user status variables.
**Usage:**
- `status`
- `status <indicator>:<value>`

### `complete`
Marks an item as completed.
**Usage:** `complete <type> <name> [minutes:<duration>]`
**Notes:**
- Runs completion side effects: commitment evaluation/triggers, milestone evaluation, and points awarding.
- Prefer this when you want full item-level completion behavior.

### `did`
Logs actuals for a schedule block.
**Usage:** `did "Block Name" [start_time:HH:MM] [end_time:HH:MM] [status:completed|skipped|partial] [note:"..."]`
**Notes:**
- Best for logging what actually happened in the schedule (actual start/end/status).
- A `status:completed` log can award points for the logged block.

### `miss`
Records a missed occurrence (does not count as completion).
**Usage:** `miss <type> <name>`

### `mark`
Marks an item in the daily schedule with a new status.
**Usage:** `mark <item_name>:<status>`
**Notes:**
- `mark ...:completed` now uses the same completion side effects as `complete` (commitments/triggers, milestones, points).
- Non-completion statuses (for example `skipped`, `delayed`) do not run completion points/milestone effects.
- Avoid running both `mark ...:completed` and `complete ...` for the same block unless intentionally recording two events.

### `mark_norm`
Marks an item in the daily schedule with a new status (normalized variant).
**Usage:** `mark <item_name>:<status>`

### `change`
Changes the start time of an item in the current day's schedule.
**Usage:** `change <item_name> <new_start_time_HH:MM>`

### `shift`
Shifts an item's start time by a positive or negative number of minutes.
**Usage:** `shift <item_name> <minutes> [date:YYYY-MM-DD] [start_time:HH:MM]`
**Examples:**
- `shift "Morning Routine" +15`
- `shift "Deep Work" -10 date:2026-02-24 start_time:09:00`
**Notes:**
- Positive minutes move later; negative minutes move earlier.
- `date` lets you target a specific day schedule.
- `start_time` disambiguates when multiple blocks share the same name.

### `trim`
Reduces the duration of an item in the current day's schedule.
**Usage:** `trim <item_name> <amount_in_minutes>`

### `stretch`
Increases the duration of an item in the current day's schedule.
**Usage:** `stretch <item_name> <amount_in_minutes>`
**Examples:**
- `stretch "Deep Work" 15`
- `stretch "Admin Block" 10`

### `split`
Splits a schedule block into N equal parts.
**Usage:** `split <item_name> [count:<n>]`
**Examples:**
- `split "Deep Work"`
- `split "Deep Work" count:3`

### `merge`
Merges two schedule blocks into one.
**Usage:** `merge <item_name> with <other_item_name>`
**Examples:**
- `merge "Email Triage" with "Slack Cleanup"`
- `merge "Deep Work (Part 1)" with "Deep Work (Part 2)"`

### `anchor`
Anchors an item so reschedules do not move or trim it.
**Usage:** `anchor <item_name> [scope:today|item]`
**Examples:**
- `anchor "Deep Work"`
- `anchor "Deep Work" scope:today`
- `anchor "Morning Routine" scope:item type:routine`
**Notes:**
- `scope:today` anchors in today's generated schedule.
- `scope:item` writes `reschedule: never` to the source item.

### `cut`
Removes an item from the current day's schedule.
**Usage:** `cut <item_name>`

### `check`
Runs a data integrity check on your User directory.
**Usage:** `check`

## Reminders & Alarms

### `dismiss`
Dismisses a specified alarm for the remainder of the current day.
**Usage:** `dismiss <alarm_name>`

### `snooze`
Snoozes a specified alarm for its configured snooze duration.
**Usage:** `snooze <alarm_name>`

### `skip`
Skips a specified alarm for the remainder of the current day.
**Usage:** `skip <alarm_name>`

## Advanced Features

### `filter`
Sets the active filter for Chronos items.
**Usage:** `filter <item_type> [property:value ...] | filter all | filter off`
**Examples:**
- `filter task status:pending`
- `filter all`
- `filter type:all`

### `alias`
Creates custom command shortcuts.
**Usage:**
- `alias <name> <command>`: Create an alias.
- `alias list`: List all aliases.
- `alias remove <name>`: Delete an alias.

### `autocomplete`
Controls interactive CLI autocomplete suggestions.
**Usage:**
- `autocomplete`
- `autocomplete on|off`
- `autocomplete toggle`
**Notes:**
- Updates `User/Settings/console_settings.yml` (`autocomplete_enabled`).
- Applies to new interactive sessions.

### `bulk`
Executes a command on multiple items matching a filter.
**Usage:** `bulk <command> [args...] [limit:<n>] [dry:true|false]`
**Example:** `filter task status:pending; bulk delete force:true`
**Example:** `filter all; bulk set tag:legacy dry:false`

### `dashboard`
Bundles settings and launches the Chronos Dashboard in your browser.
**Usage:** `dashboard [host:IP] [port:N] [browser:<cmd>]`
**Notes:**
- Browser resolution order:
  - `browser:<cmd>` argument
  - `dashboard_browser` in `User/Settings/config.yml`
  - `browser` in `User/Settings/config.yml`
  - system default browser (fallback)

### `macro`
Manages automation macros.
**Usage:** `macro list`

### `commitments`
Evaluates all commitments and fires triggers.
**Usage:** `commitments [check]`

**Commitment schema (examples):**
```yaml
name: Daily Walk
type: commitment
rule: { kind: frequency, times: 1, period: day }
targets:
  - { type: habit, name: Morning Walk }
triggers:
  on_met:
    - { type: reward, name: Espresso Treat }
```

```yaml
name: Never Smoke
type: commitment
rule: { kind: never }
targets:
  - { type: habit, name: Smoke }
triggers:
  on_violation:
    - { type: script, path: Scripts/commitments/miss_example.chs }
```

### `review`
Generates periodic reviews (Daily, Weekly, Monthly).
**Usage:**
- `review daily [YYYY-MM-DD]`
- `review weekly [YYYY-WW]`
- `review monthly [YYYY-MM]`
- `review export ...`: Exports the review to Markdown.

### `sequence`
Manages the data mirroring and trends system.
**Usage:**
- `sequence status`: Show registry of SQLite mirrors.
- `sequence sync`: Run the builders to update mirrors.
- `sequence trends`: Generate the trends report.

### `template`
Template helper commands (save/list/load oriented workflows).
**Usage:** `template save day [name:<name>] [weekday:<Weekday>] [overwrite:true|false]`
**Notes:** See `help template` for the full subcommand surface.

### `tree`
Visualizes item hierarchy or directory structure.
**Usage:**
- `tree <type> <name>`
- `tree dir <path>`

## Utilities

### `archive`
Moves an item to `User/Archive`.
**Usage:** `archive <type> <name>`

### `backup`
Creates a zip backup of the User directory.
**Usage:** `backup`

### `restore`
Restores the User directory from a backup zip.
**Usage:** `restore <filename|latest> [force:true]`

### `export`
Exports data to YAML or zips the full User directory.
**Usage:**
- `export all [filename.zip]`
- `export <filename> <command> [args...]`

### `import`
Imports items from YAML or restores a full backup zip.
**Usage:** `import <file_path>`

### `diff`
Shows differences between two items or two files.
**Usage:**
- `diff <type> <name1> <name2>`
- `diff file <path1> <path2>`

### `undo`
Restores the most recently archived item or schedule.
**Usage:**
- `undo delete [type]`
- `undo reschedule`

### `clean`
Removes temporary files.
**Usage:** `clean`

### `clear`
Performs system maintenance by clearing logs, databases, registries, and other system data.
**Usage:** `clear <target> [force]` or `clear <target> force:true`

**Targets:**
- `logs` - Delete all log files from `User/Logs`
- `schedules` - Delete generated schedule files from `User/Schedules`
- `cache` - Delete all database mirrors (all `.db` files in `User/Data`)
- `db:<name>` - Delete a specific database (e.g., `clear db:chronos_core`)
- `registry:<name>` - Clear a specific registry cache (e.g., `clear registry:wizards`)
- `temp` - Delete temporary files (`.tmp`, `.bak`, cache files)
- `archives` - Delete all archived items and schedules
- `all` - Delete everything (requires typing "DELETE EVERYTHING" to confirm)

**Examples:**
```
clear logs                    # Interactive confirmation
clear logs force              # Skip confirmation
clear db:chronos_matrix force # Delete specific database
clear registry:wizards        # Clear wizards registry cache
clear temp force              # Clear temporary files
clear archives                # Delete all archives
```

**Safety:**
- Without `force`, prompts for confirmation
- `clear all` requires typing "DELETE EVERYTHING" for safety
- Individual database deletion allows surgical fixes without full cache reset
- Registry clearing forces reload from YAML sources on next access

**See Also:** [Admin Tools Guide](../Features/Admin_Tools.md)

### `search`
Searches for text content across all items.
**Usage:** `search <query>`

### `docs`
Opens Chronos docs in your default viewer.
**Usage:** `docs [topic]`

### `cmd`
Executes a Windows CMD command.
**Usage:** `cmd <command>`

### `powershell`
Executes PowerShell code.
**Usage:** `powershell <powershell_code>`

### `echo`
Prints text to the console.
**Usage:** `echo <text_to_print>`

### `cls`
Clears the terminal screen.
**Usage:** `cls`

### `inventory`
Manages inventory items.
**Usage:** `inventory list`, `inventory add <name>`, `inventory remove <name>`

### `listener`
Controls the background listener service.
**Usage:** `listener start|stop|status`

### `settings`
Quick access to open settings files.
**Usage:** `settings <name>` (e.g., `settings theme`)

### `register`
Builds command/item/settings/property registries used by autosuggest/tooling.
**Usage:**
- `register commands`
- `register items`
- `register settings`
- `register properties`
- `register all`
- `register full`
**Examples:**
- `register all`
- `register properties`
- `register full`
**Notes:**
- `register settings` is fast.
- `register properties` performs a deeper scan and can take longer.

### `sound`
Configures CLI sound effects and global sound enable/disable.
**Usage:**
- `sound`
- `sound <startup|done|error|exit> [on|off]`
- `sound <on|off>`
- `sound all <on|off>`
**Examples:**
- `sound`
- `sound off`
- `sound startup on`
- `sound done off`
- `sound all on`

### `theme`
Lists, shows, or sets console themes and colors.
**Usage:** `theme <subcommand>`

### `profile`
Shows profile details.
**Usage:** `profile show`

### `aduc`
Launches ADUC in Chronos mode (Pilot Mode).
**Usage:** `aduc`

## Automation & Scripting

### `run`
Executes a Chronos script (.chs).
**Usage:** `run <script_file>`

### `If`
Runs a single-line conditional command.
**Usage:** `if <left> <op> <right> then <command> [args...] [else <command> ...]`

### `repeat`
Runs a command a fixed number of times.
**Usage:** `repeat count:<n> then <command> [args...]`

### `for`
Iterates items and runs a command for each.
**Usage:** `for <var> in <type> [filters] then <command> [args...]`

### `while`
Runs a command while a condition remains true (bounded).
**Usage:** `while <condition> max:<n> then <command> [args...]`

### `vars`
Lists current script variables or a single variable by name.
**Usage:** `vars [name:<varname>]`

### `unset`
Removes a script variable from the current session.
**Usage:** `unset var <name>`

### `pause`
Pauses script execution until a key is pressed.
**Usage:** `pause [message]`

## Rewards & Points

### `points`
Manages the points ledger.
**Usage:**
- `points balance`
- `points add <n> [reason:<text>]`
- `points subtract <n> [reason:<text>]`
- `points history [<last_N>]`
- `points reset [keep_ledger:true|false]`

### `achievements`
Manages achievement awards and progression evaluation.
**Usage:**
- `achievements sync`
- `achievements award <achievement_id_or_name>`
- `achievements event <event_name> [key:value ...]`
- `achievements reset`
- `achievements reset-progress`

### `redeem`
Redeems a reward and applies its target.
**Usage:** `redeem reward <name>`
