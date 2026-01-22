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
Opens an item in the default editor (VS Code).
**Usage:** `edit <type> <name>`

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
- `today`: Shows today's schedule (in-progress and upcoming).
- `today reschedule`: Rebuilds the schedule with conflict resolution.
- `today routines|subroutines|microroutines`: Collapses display to that level.

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
Logs time spent on an activity.
**Usage:** `track <task_name> <duration>`

### `timer`
Manages the countdown timer.
**Usage:**
- `timer start <profile> [type:<item_type> name:<item_name>] [cycles:N] [auto_advance:true|false]`
- `timer pause | resume | stop | status`
- `timer confirm yes|no`
- `timer profiles list | view <name> | save <name> [k:v ...] | delete <name>`

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

### `did`
Logs actuals for a schedule block.
**Usage:** `did "Block Name" [start_time:HH:MM] [end_time:HH:MM] [status:completed|skipped|partial] [note:"..."]`

### `miss`
Records a missed occurrence (does not count as completion).
**Usage:** `miss <type> <name>`

### `mark`
Marks an item in the daily schedule with a new status.
**Usage:** `mark <item_name>:<status>`

### `mark_norm`
Marks an item in the daily schedule with a new status (normalized variant).
**Usage:** `mark <item_name>:<status>`

### `change`
Changes the start time of an item in the current day's schedule.
**Usage:** `change <item_name> <new_start_time_HH:MM>`

### `trim`
Reduces the duration of an item in the current day's schedule.
**Usage:** `trim <item_name> <amount_in_minutes>`

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

### `bulk`
Executes a command on multiple items matching a filter.
**Usage:** `bulk <command> [args...] [limit:<n>] [dry:true|false]`
**Example:** `filter task status:pending; bulk delete force:true`
**Example:** `filter all; bulk set tag:legacy dry:false`

### `dashboard`
Bundles settings and launches the Chronos Dashboard in your browser.
**Usage:** `dashboard [host:IP] [port:N]`

### `macro`
Manages automation macros.
**Usage:** `macro list`

### `commitments`
Evaluates all commitments and fires triggers.
**Usage:** `commitments [check]`

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

### `settings`
Quick access to open settings files.
**Usage:** `settings <name>` (e.g., `settings theme`)

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

### `redeem`
Redeems a reward and applies its target.
**Usage:** `redeem reward <name>`
