# Admin Tools & System Cleanup

Chronos Alpha 4 introduces a comprehensive suite of administrator tools for system maintenance, cache management, and data cleanup. These tools are accessible via the CLI (`clear` command) and the unified **System Admin** widget in the Dashboard.

## Overview

The admin tools provide both broad cleanup operations (logs, schedules, all caches) and granular surgical operations (specific databases, individual registries, temp files). All destructive operations require confirmation unless explicitly forced.

## Features

### 1. Log Management
* **Goal**: Reduce clutter in `User/Logs` and remove old debugging artifacts.
* **CLI**: `clear logs [force]`
* **Widget Action**: "Purge Logs" button
* **Effect**: Deletes all `.log` and `.yml` files in `User/Logs/`. Keeps directory structure intact.
* **Use Case**: Monthly maintenance to free disk space or before sharing the User directory.

### 2. Schedule Cleanup
* **Goal**: Reset schedule history or clear accumulated daily schedule files.
* **CLI**: `clear schedules [force]`
* **Widget Action**: "Purge Schedules" button
* **Effect**: 
  - Deletes all `schedule_*.yml` files in `User/Schedules/`
  - Clears `User/Archive/Schedules/` directory
  - Historical schedule data is permanently removed
* **Use Case**: Starting fresh after major workflow changes or testing schedule algorithms.

### 3. Cache Reset (Full)
* **Goal**: Fix data inconsistencies or "ghost" items by rebuilding all Sequence Mirror databases.
* **CLI**: `clear cache [force]`
* **Widget Action**: "Reset Cache" button
* **Effect**: 
  - Deletes all `.db` files in `User/Data/` (chronos_core, chronos_matrix, chronos_events, etc.)
  - Flushes in-memory caches
  - System automatically rebuilds mirrors on next startup/query
* **Use Case**: Resolving data corruption, orphaned items, or after major data migrations.

### 4. Specific Database Deletion (NEW)
* **Goal**: Surgically remove a single database mirror without full cache reset.
* **CLI**: `clear db:<name> [force]` (e.g., `clear db:chronos_matrix`)
* **Widget Action**: Advanced section → Database dropdown → "Delete DB"
* **Available Databases**:
  - `chronos_core.db` - Primary item sequence mirror
  - `chronos_matrix.db` - Matrix computation cache
  - `chronos_events.db` - Event tracking and history
  - `chronos_behavior.db` - Behavior facts cache
  - `chronos_journal.db` - Journal context cache
  - `chronos_trends.db` - Trends analysis data
* **Effect**: Deletes only the specified `.db` file. System rebuilds that mirror on next access.
* **Use Case**: Matrix display is corrupt but core data is fine → delete only `chronos_matrix.db`.

### 5. Registry Cache Clearing (NEW)
* **Goal**: Force reload of registry definitions from source YAML files without restarting.
* **CLI**: `clear registry:<name> [force]`
* **Widget Action**: Advanced section → Registry dropdown → "Clear Cache"
* **Available Registries**:
  - `wizards` - Wizard definitions from `User/Data/Wizards/`
  - `themes` - Theme registry from settings
  - `commands` - Command metadata cache
  - `item_types` - Item type definitions
* **Effect**: Clears in-memory cache file (if exists). Forces re-read from source on next access.
* **Use Case**: Updated a wizard YAML but changes aren't appearing → clear wizards registry.

### 6. Temporary Files (NEW)
* **Goal**: Clean up temporary files created during operations.
* **CLI**: `clear temp [force]`
* **Widget Action**: "Clear Temp" button (Quick Actions)
* **Effect**: Recursively deletes:
  - `*.tmp` files
  - `*.bak` backup files
  - `~*` editor temp files
  - Files in `User/.cache/`
* **Use Case**: Freeing disk space or cleaning up after failed operations.

### 7. Archives Deletion (NEW)
* **Goal**: Permanently remove all archived items and schedules.
* **CLI**: `clear archives [force]`
* **Widget Action**: Advanced section → "Delete All Archives"
* **Effect**: 
  - Deletes everything in `User/Archive/` (schedules, items, etc.)
  - Recreates empty directory structure
  - Cannot be undone
* **Use Case**: After `undo` operations are no longer needed or before exporting the User directory.

### 8. Nuclear Option: Clear All (NEW)
* **Goal**: Complete system reset (use with extreme caution).
* **CLI**: `clear all`
* **Widget Action**: Not available (CLI only for safety)
* **Effect**: Runs all cleanup operations (logs + schedules + cache + temp + archives)
* **Confirmation**: Requires typing "DELETE EVERYTHING" to proceed
* **Use Case**: Starting completely fresh or before restoring from backup.

## Safety Mechanisms

### Confirmation Prompts
* **CLI Interactive Mode**: Without `force` flag, prompts `(y/n)` before deletion
* **CLI Force Flag**: `clear <target> force` skips confirmation for automation
* **Widget Confirmations**: Each button shows detailed warning dialog with consequences
* **Nuclear Safety**: `clear all` requires typing exact phrase "DELETE EVERYTHING"

### Reversibility
* **Not Reversible**: Logs, schedules, archives (use `backup` command first)
* **Auto-Rebuild**: Databases and registries rebuild automatically from source data
* **Temp Files**: Generally safe to delete (system recreates as needed)

## Dashboard Widget

The **System Admin** widget (Alpha 4+) provides a unified glassmorphic UI for cleanup operations.

### Quick Actions
Four one-click buttons for common operations:
- **Purge Logs** (red/danger) - Confirmation: warns about losing debug history
- **Purge Schedules** (red/danger) - Confirmation: warns about losing historical schedules
- **Reset Cache** (red/danger) - Confirmation: warns about rebuild time
- **Clear Temp** (red/danger) - Confirmation: less severe warning

### Advanced Section
Collapsible `<details>` panel with granular controls:
- **Specific Database**: Dropdown lists all `.db` files with sizes (e.g., "chronos_core.db (304.5 KB)")
- **Registry Cache**: Dropdown for wizards/themes/commands/item_types
- **Delete All Archives**: Single button for archive purge

### Status Box
Terminal-style status display shows command output:
- Success: Green checkmark with truncated output
- Error: Red text with error message
- Real-time: Updates during command execution

### API Integration
- Fetches database list via `GET /api/system/databases`
- Executes commands via `POST /api/system/command`
- Reloads dropdown after database deletion

## Best Practices

1. **Backup First**: Run `backup` before `clear cache` or `clear all`
2. **Test with Force**: Use `clear temp force` in scripts, avoid `force` for destructive ops
3. **Surgical Over Broad**: Prefer `clear db:chronos_matrix` over `clear cache` when possible
4. **Registry vs Restart**: Clearing registries is faster than restarting the server
5. **Monitor Disk**: Use Temp cleanup monthly to prevent clutter

## Command Reference

See [CLI Commands - clear](../Reference/CLI_Commands.md#clear) for full syntax reference.

## See Also
- [Dashboard Guide](../Guides/Dashboard.md) - System Admin widget usage
- [Architecture](../Dev/Architecture.md) - How cleanup affects Sequence Mirrors
- [Backup & Restore](../Reference/CLI_Commands.md#backup) - Data safety commands
