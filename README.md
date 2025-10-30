﻿# Chronos Engine

An intelligent life management system.

Status: Early development — interfaces and behavior may change.

### Scripting and Variables

Chronos can execute `.chs` scripts (one command per line). Scripts and CLI commands support:

- Key:value properties parsed into command properties (e.g., priority:high).
- Session variables with `@name` or `@{name}` expansion.
  - Set: `set var name:World`
  - Use: `echo Hello @name`
  - Escape: `@@` prints a literal `@`
  - Scope: Variables persist within a single console session or script run.

Conditionals

- Single-line: `if <left> <op> <right> then <command> [args...] [else <command> ...]`
- Block (.chs):
  - `if <left> <op> <right> then` … `[elseif <left> <op> <right> then …]` `[else …]` `end`
- Operators: `= != > < >= <= eq ne gt lt ge le matches` (regex)
- Logic: `and or xor nor not !` with parentheses `( … )`
- Sources:
  - Status: `status:<key>` from `User/current_status.yml`
  - Items: `<type>:<name>:<property>` (e.g., `task:"Deep Work":priority`)
  - Existence: `exists <type>[:<name>[:<property>]]`, `exists file:<path>`, `exists dir:<path>`, `exists env:<NAME>`
  - Literals and `@vars`

Developer: David Cody

## Core Philosophy

Chronos Engine is a system for intelligent life management based on the idea of organizing your life in a fractal manner. It allows you to break down your life into a hierarchy of routines, sub-routines, micro-routines, and tasks, giving you a powerful and flexible way to manage your time and achieve your goals.

## The Building Blocks: Items

The fundamental units of the Chronos Engine are called "items". An item can be anything you want to track or manage, such as:

*   **Goal based:** `commitment`, `goal`, `milestone`
*   **Physical:** `inventory item`, `person`, `place`, `tool`
*   **Templates:** `day`, `week`, `weekend`, `routines`, `subroutines`, `microroutines`, `seasons`
*   **Temporal:** `alarm`, `appointment`, `reminder`, `ritual`
*   **Text:** `dream diary entry`, `journal entry`, `list`, `note`
*   **Others:** `habit`, `plan`, `project`, `task`

All items are stored as simple, human-readable YAML files, making them easy to create, edit, and share.

## The Fractal Structure

Items can reference each other to create a complex and interconnected network of your life. For example, a "morning routine" item could be composed of several "sub-routine" items, such as "hygiene" and "breakfast". Each of these sub-routines could be further broken down into smaller and smaller items, creating a fractal structure that mirrors the complexity of your life.

The engine understands a specific hierarchy for templates: `week` contains `day`, `day` contains `routine`, `routine` contains `subroutine`, and `subroutine` contains `microroutine`. The `add` command enforces this structure.

## The Chronos Engine: Intelligent Management

The "engine" is the heart of the Chronos Engine. It's a sophisticated algorithm that can read and understand your life data and then use it to generate intelligent suggestions and build an optimal schedule for your day.

### User Status

The Chronos Engine is unique in that it takes into account your personal "status" when generating your schedule. Your status is a set of variables that describe your current state, such as:

*   `emotion`
*   `energy`
*   `environment`
*   `focus`
*   `health`
*   `mind state`
*   `vibe`

By tracking your status, the Chronos Engine can adapt your schedule to your current needs and help you make the most of your day.

### The `today` Command

The `today` command is the primary interface for generating and interacting with your daily schedule. It now supports a persistent schedule and manual modifications.

*   **`today` (display only):** If a schedule for today has already been generated and saved (to `User/Schedules/today_schedule.yml`), this command will simply load and display that schedule. It will not re-calculate or re-resolve conflicts.
*   **`today reschedule` (generate and resolve):** This command triggers the full schedule generation and conflict resolution process. It will:
    1.  Load your day template (e.g., `User/Days/Monday.yml`).
    2.  Load any pending manual modifications (from `User/manual_modifications.yml`).
    3.  Apply these manual modifications to the in-memory schedule.
    4.  Run the iterative conflict resolution algorithm (shifting, trimming, cutting based on importance).
    5.  Save the fully resolved schedule to `User/Schedules/today_schedule.yml`.
    6.  Clear the `User/manual_modifications.yml` file.
    7.  Display the final, resolved schedule.

    The scheduling algorithm is highly customizable. You can rank the importance of different properties (e.g., `deadline`, `priority`, `category`) to create a schedule that is perfectly tailored to your own preferences. The algorithm can also dynamically adjust your schedule based on your status, for example by increasing buffer times, removing high-energy tasks when your energy is low, or rescheduling tasks to make room for high-priority items.

## A Multi-Paradigm User Experience

The Chronos Engine is designed to be accessible to everyone, from casual users to power users.

*   **For Casual Users:** An onboarding wizard will guide you through the process of setting up your life management system from scratch. In the future, an AI agent will be able to translate your natural language requests into Chronos Engine commands, making it even easier to manage your life.
*   **For Power Users:** The Chronos Engine is a completely open and extensible platform. You can create your own custom commands, modules, and even turn your life into a game (RPG, RTS, etc.). The possibilities are endless.

## Getting Started

To start the Chronos Engine, navigate to the project root directory in your terminal and run:

```bash
Console_Launcher.bat
```

This will launch the interactive Chronos Engine console.

### Command-Line Usage

You can also run commands directly from your system's command line without entering the interactive console:

```bash
Console_Launcher.bat <command> [args...]
```

### Running Scripts (`.chs` files)

Chronos Engine supports executing `.chs` script files line by line. Create a `.chs` file with Chronos commands, then run it:

```bash
Console_Launcher.bat my_script.chs
```

## Commands

Here's a list of the core commands available in Chronos Engine:

*   **`today [reschedule]`**
    *   Description: Displays today's schedule or re-generates and resolves it.
    *   Example: `today` (displays saved schedule)
    *   Example: `today reschedule` (re-generates and resolves schedule)
*   **`cut <item_name>`**
    *   Description: Records a request to cut (remove) an item from the schedule. Requires `today reschedule` to apply.
    *   Example: `cut "Relax"`
*   **`trim <item_name> <amount_in_minutes>`**
    *   Description: Records a request to trim an item's duration. Requires `today reschedule` to apply.
    *   Example: `trim "Morning Routine" 10`
*   **`change <item_name> <new_start_time_HH:MM>`**
    *   Description: Records a request to change an item's start time. Requires `today reschedule` to apply.
    *   Example: `change "Morning Routine" 08:30`
*   **`new <item_type> <item_name> [property_key:property_value ...]`**
    *   Description: Creates a new item of the specified type with the given name and properties.
    *   Example: `new note MyMeetingNotes category:work priority:high`
*   **`list <item_type> [sort_by:<property_key>] [reverse_sort:True/False] [property_key:property_value ...]`**
    *   Description: Lists items of the specified type, optionally filtered and sorted by a property.
    *   Example: `list note sort_by:priority reverse_sort:True`
*   **`list <item_type> [list_properties...] then <command> [command_args...]`**
    *   Description: Lists items of the specified type, optionally filtered and sorted, and then executes a sub-command for each listed item.
    *   Example: `list tasks status:pending then set status:in-progress`
    *   Example: `list tasks priority:high then delete`
*   **`export <filename> <command> [args...]`**
    *   Description: Executes a command and saves its output to a YAML file in `User/Exports/`.
    *   Example: `export my_tasks.yml list tasks priority:high`
*   **`import <file_path>`**
    *   Description: Imports a list of items from a YAML file. The command will skip items that already exist.
    *   Example: `import User/Exports/my_tasks.yml`
*   **`append <item_type> <item_name> "<text_to_append>" [property_key:property_value ...]`**
    *   Description: Appends text to the content of an existing item.
    *   Example: `append note MyMeetingNotes "- Discuss Q3 results"`
*   **`add <item_to_add> to <target_template> [position:<number>]`**
    *   Description: Adds an item to a template's list of sub-items, intelligently respecting the template hierarchy (e.g., a `microroutine` can be added to a `subroutine`, but not directly to a `day`).
    *   Example: `add "My Microroutine" to "My Subroutine" position:1`
*   **`delete [-f|--force] <item_type> <item_name> [property_key:property_value ...]`**
    *   Description: Deletes an item of the specified type. Use -f or --force to skip confirmation.
    *   Example: `delete note MyOldNote --force`
*   **`view <item_type> <item_name> [property_key:property_value ...]`**
    *   Description: Displays the content and properties of a specific item.
    *   Example: `view note MyMeetingNotes`
*   **`edit <item_type> <item_name> [editor:<editor_name>] [property_key:property_value ...]`**
    *   Description: Opens an item in a text editor for modification.
    *   Example: `edit note MyMeetingNotes editor:nvim`
*   **`get <item_type> <item_name> <property_key> [variable_name:<var_name>] [property_key:property_value ...]`**
    *   Description: Retrieves the value of a specific property from an item.
    *   Example: `get note MyMeetingNotes category variable_name:my_category`
*   **`set <item_type> <item_name> <property_key>:<value> [...]`**
    *   Description: Sets properties of an item.
    *   Example: `set note MyMeetingNotes priority:high category:work`
*   **`set var <variable_name>:<value>`**
    *   Description: Defines a script variable.
    *   Example: `set var my_variable:some_value`
*   **`settings <file_shortcut> <property> <value>`**
    *   Description: Modifies a setting in a specified settings file.
    *   Example: `settings buffer global_dynamic_buffer.buffer_interval_minutes 60`
*   **`rename <item_type> <old_name> <new_name> [properties]`**
    *   Description: Renames an existing item.
    *   Example: `rename note MyOldNote MyNewNote`
*   **`cls`**
    *   Description: Clears the terminal screen.
*   **`cmd <command>`**
    *   Description: Executes a command-line (CMD) command.
    *   Example: `cmd dir`
*   **`copy <item_type> <source_item_name> [new_item_name] [property_key:property_value ...]`**
    *   Description: Creates a duplicate of an existing item, optionally with a new name and modified properties.
    *   Example: `copy note MyMeetingNotes MyMeetingNotes_Copy`
*   **`count <item_type> [property_key:property_value ...]`**
    *   Description: Counts items of a specific type, optionally filtered by properties.
    *   Example: `count note category:work`
*   **`create <item_type> <item_name> [property_key:property_value ...]`**
    *   Description: Creates a new item of the specified type with the given name and properties.
    *   Example: `create note MyMeetingNotes category:work priority:high`
*   **`echo <text_to_print>`**
    *   Description: Prints the provided text to the console.
    *   Example: `echo Hello, World!`
*   **`filter <item_type> [property:value ...]`**
    *   Description: Sets or clears the active filter for Chronos items.
    *   Example: `filter note category:work`
*   **`find <item_type> <keyword> [property_key:property_value ...]`**
    *   Description: Searches for items of the specified type based on a keyword and optional properties.
    *   Example: `find note meeting category:work`
*   **`move <source_item_type> <source_item_name> [new_item_name] [type:<target_item_type>] [name:<new_item_name>] [property_key:property_value ...]`**
    *   Description: Moves an item to a new item type, renames it, or both.
    *   Example: `move note MyOldNote MyNewNote`
*   **`pause [message]`**
    *   Description: Pauses script execution until a key is pressed. Displays an optional message.
    *   Example: `pause`
*   **`powershell <powershell_code>`**
    *   Description: Executes the provided PowerShell code.
    *   Example: `powershell Get-Process | Select-Object -First 3`
*   **`remove <item_type> <item_name> <property_key>`**
    *   Description: Removes a specified property from an item.
    *   Example: `remove note MyMeetingNotes category`
*   **`status [status_type:value]`**
    *   Description: Views or sets user status variables.
    *   Example: `status emotion:happy`

## Architecture

The Chronos Engine has a modular architecture that is designed to be easily extended.

*   **Core Engine (`Modules/Console.py`):** The central entry point, handling command parsing, dispatching, and interactive mode.
*   **Scheduler Module (`Modules/Scheduler.py`):** Provides helper functions for schedule manipulation (e.g., finding items, applying manual modifications) and persistence (loading/saving schedules and manual modification requests).
*   **Item Manager (`Modules/ItemManager.py`):** A core utility providing generic functions for file-system operations (reading/writing YAML, ensuring directories, getting paths), editor selection, and item deletion.
*   **Commands (`commands/` directory):** Each command (e.g., `new.py`, `list.py`, `today.py`, `cut.py`, `trim.py`, `change.py`) acts as a dispatcher. It parses arguments and properties, then uses `ItemManager.py` or `Scheduler.py` to perform its core operations.
*   **Modules (`Modules/` directory):** Each item type (e.g., `Modules/Note/main.py`, `Modules/Task/main.py`) defines item-specific logic, such as default properties, custom display formats, and validation rules.

## Command Reference

The CLI supports the following commands (case-insensitive). See inline help with `help` or `help <command>`:

- add: Adds an item to a templateâ€™s sub-items (respects hierarchy).
- append: Appends text to the content of an item.
- change: Changes an itemâ€™s start time in todayâ€™s schedule.
- cls: Clears the terminal screen.
- cmd: Executes a system command.
- complete: Marks or completes items based on context (when enabled).
- copy: Duplicates an existing item.
- count: Counts items, optionally filtered by properties.
- create | new: Creates a new item with properties.
- cut: Removes an item from todayâ€™s schedule.
- dashboard: Opens the web dashboard utility.
- delete: Deletes an item (supports --force).
- dismiss | skip | snooze: Manages alarms for the current day.
- echo: Prints text to the console.
- edit: Opens an item in an editor.
- export: Exports data when configured.
- filter: Sets or clears the active item filter.
- find: Searches for items.
- get: Retrieves the value of a specific property from an item.
- help: Shows general or command-specific help.
- import: Imports data/items when configured.
- list: Lists items with sorting options.
- mark: Marks an item in todayâ€™s schedule with a status.
- mark_norm: Normalizes marks/status for items where supported.
- miss: Records or lists missed alarms/slots (when available).
- move: Moves/renames an item and/or changes its type.
- pause: Pauses script execution.
- powershell: Executes PowerShell code.
- if: Conditional execution with comparisons, logic, regex, and existence checks.
- vars: Lists current script variables.
- unset: Unsets a script variable.
- settings: Modifies a setting in a settings file.
- status: Views or sets user status variables.
- today [reschedule]: Displays or regenerates todayâ€™s schedule.
- track: Starts/stops tracking utilities where available.
- trim: Reduces an itemâ€™s duration in todayâ€™s schedule.
- view: Displays an itemâ€™s content and properties.

## The Vision

The Chronos Engine is more than just a productivity tool; it's a "life operating system" that gives you the power to understand, manage, and optimize your life in ways you never thought possible. It's a tool for self-discovery, self-improvement, and endless creativity.

## Licensing

- Feast if you build in the open. If you profit while keeping changes closed, you need a Commercial License.

What this means:
- Core: AGPLâ€‘3.0â€‘orâ€‘later. You can use, modify, sell, or host Chronos under AGPL compliance. If you modify or embed the Core and distribute/host it, publish your changes.
- Hobbyists/Students/Researchers/Openâ€‘source devs: Feast. No cost.
- Commercial/Closed use: If you embed the Core in closed software, build inâ€‘process closed plugins, or run Chronosâ€‘based SaaS without publishing source, get a Commercial License (see `COMMERCIAL_LICENSE.md`).
- Marketplace: Paid extensions sold via the official Chronos Marketplace follow `MARKETPLACE_TERMS.md`.

See `LICENSE` (AGPLâ€‘3.0â€‘orâ€‘later) for the core, `Docs/COMMERCIAL_LICENSE.md` for closed/paid use, `Docs/MARKETPLACE_TERMS.md` for paid listings, and `Docs/TRADEMARK_POLICY.md` for brand usage.

Website: https://chronosengine.online

## Themes, Console, and Welcome Message

Chronos supports console themes via the `theme` command and `User/Settings/theme_settings.yml` presets. `User/profile.yml` can set `theme` and explicit `background`/`text` overrides. On Windows, colors apply via the `color` command.

Customize the console's welcome banner with either `User/welcome_message.yml` or a block in `User/profile.yml`. Three lines are supported and variables like `@nickname` are expanded (defaults to `Pilot` if not set).

Examples:

User/welcome_message.yml

```
line1: "⌛ Chronos Engine v1"
line2: "🚀 Welcome, @nickname"
line3: "🌌 You are the navigator of your reality."
```

User/profile.yml

```
nickname: "Pilot"
welcome:
  line1: "⌛ Chronos Engine v1"
  line2: "🚀 Welcome, @nickname"
  line3: "🌌 You are the navigator of your reality."
```

## Trademark

â€œChronos Engineâ€, â€œChronosâ€, and â€œChronos Certifiedâ€ are trademarks. See `Docs/TRADEMARK_POLICY.md`. Donâ€™t imply official status for forks or thirdâ€‘party products.


### Scripting and Variables

Chronos can execute `.chs` scripts (one command per line). Scripts and CLI commands support:

- Key:value properties parsed into command properties (e.g., priority:high).
- Session variables with `@name` or `@{name}` expansion.
  - Set: `set var name:World`
  - Use: `echo Hello @name`
  - Escape: `@@` prints a literal `@`
  - Scope: Variables persist within a single console session or script run.

Conditionals

- Single-line: `if <left> <op> <right> then <command> [args...] [else <command> ...]`
- Block (.chs):
  - `if <left> <op> <right> then` … `[elseif <left> <op> <right> then …]` `[else …]` `end`
- Operators: `= != > < >= <= eq ne gt lt ge le matches` (regex)
- Logic: `and or xor nor not !` with parentheses `( … )`
- Sources:
  - Status: `status:<key>` from `User/current_status.yml`
  - Items: `<type>:<name>:<property>` (e.g., `task:"Deep Work":priority`)
  - Existence: `exists <type>[:<name>[:<property>]]`, `exists file:<path>`, `exists dir:<path>`, `exists env:<NAME>`
  - Literals and `@vars`

