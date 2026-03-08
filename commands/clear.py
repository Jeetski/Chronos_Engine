
import os
import shutil
import glob
from modules import console

def run(args, properties):
    """
    Clears system data like logs, generated schedules, and caches.
    Usage: clear [logs|schedules|cache|db:<name>|registry:<name>|temp|archives|all] [--force]
    """
    
    if not args:
        print("Usage: clear [logs|schedules|cache|db:<name>|registry:<name>|temp|archives|all] [--force]")
        print("\nTargets:")
        print("  logs              - Delete all log files")
        print("  schedules         - Delete generated schedule files")
        print("  cache             - Delete all database mirrors")
        print("  db:<name>         - Delete specific database (e.g., db:chronos_core)")
        print("  registry:<name>   - Clear specific registry cache (e.g., registry:wizards)")
        print("  temp              - Delete temporary files")
        print("  archives          - Delete archived schedules and items")
        print("  all               - Delete everything (requires double confirmation)")
        return

    target = args[0].lower()
    force = "force" in args or properties.get("force", False)
    
    # Helper paths
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    user_dir = os.path.join(root_dir, "user")
    
    # Parse target type
    is_specific_db = target.startswith("db:")
    is_specific_registry = target.startswith("registry:")
    
    # Confirm unless forced
    if not force:
        if target == "all":
            print("⚠️  WARNING: This will delete ALL logs, schedules, caches, and databases!")
            print("This action cannot be undone and will require system rebuild.")
            print("\nType 'DELETE EVERYTHING' to confirm:")
            choice = input().strip()
            if choice != "DELETE EVERYTHING":
                print("Action cancelled.")
                return
        else:
            desc = get_target_description(target)
            print(f"⚠️  Are you sure you want to clear {desc}? This cannot be undone. (y/n)")
            choice = input().strip().lower()
            if choice != 'y':
                print("Action cancelled.")
                return

    # Track what was deleted
    deleted_count = 0
    
    # --- Specific Database ---
    if is_specific_db:
        db_name = target[3:]  # Remove "db:" prefix
        deleted_count = clear_specific_database(user_dir, db_name)
        
    # --- Specific Registry ---
    elif is_specific_registry:
        registry_name = target[9:]  # Remove "registry:" prefix
        deleted_count = clear_specific_registry(root_dir, registry_name)
        
    # --- Temporary Files ---
    elif target == "temp":
        deleted_count = clear_temp_files(user_dir)
        
    # --- Archives ---
    elif target == "archives":
        deleted_count = clear_archives(user_dir)
        
    # --- Broad Targets ---
    else:
        clear_logs = target in ["logs", "all"]
        clear_schedules = target in ["schedules", "all"]
        clear_cache = target in ["cache", "all"]
        
        if not any([clear_logs, clear_schedules, clear_cache]):
            print(f"Unknown target: {target}")
            return

        # --- Clear Logs ---
        if clear_logs:
            deleted_count += clear_all_logs(user_dir)

        # --- Clear Schedules ---
        if clear_schedules:
            deleted_count += clear_all_schedules(user_dir)

        # --- Clear Cache (All DBs) ---
        if clear_cache:
            deleted_count += clear_all_databases(user_dir)

    print(f"\n✅ Cleanup complete. Removed {deleted_count} items.")


def get_target_description(target):
    """Returns a human-readable description of the target."""
    if target.startswith("db:"):
        return f"database '{target[3:]}'"
    elif target.startswith("registry:"):
        return f"{target[9:]} registry cache"
    elif target == "temp":
        return "temporary files"
    elif target == "archives":
        return "all archived items and schedules"
    elif target == "logs":
        return "all log files"
    elif target == "schedules":
        return "all generated schedules"
    elif target == "cache":
        return "all database mirrors"
    else:
        return target


def clear_all_logs(user_dir):
    """Clears all log files."""
    log_dir = os.path.join(user_dir, "logs")
    count = 0
    
    if os.path.exists(log_dir):
        files = glob.glob(os.path.join(log_dir, "*.yml")) + glob.glob(os.path.join(log_dir, "*.log"))
        for f in files:
            try:
                os.remove(f)
                count += 1
            except Exception as e:
                print(f"Failed to delete {os.path.basename(f)}: {e}")
        print(f"  Cleared {count} log files.")
    else:
        print("  No logs directory found.")
    
    return count


def clear_all_schedules(user_dir):
    """Clears generated schedule files."""
    sched_dir = os.path.join(user_dir, "schedules")
    count = 0
    
    if os.path.exists(sched_dir):
        files = glob.glob(os.path.join(sched_dir, "schedule_*.yml"))
        for f in files:
            try:
                os.remove(f)
                count += 1
            except Exception as e:
                print(f"Failed to delete {os.path.basename(f)}: {e}")
        print(f"  Cleared {count} schedule files.")
        
        # Also clear schedule archives
        archive_dir = os.path.join(user_dir, "archive", "schedules")
        if os.path.exists(archive_dir):
            try:
                shutil.rmtree(archive_dir)
                os.makedirs(archive_dir)
                print("  Cleared Schedule Archives.")
            except Exception as e:
                print(f"Failed to clear archives: {e}")
    
    return count


def clear_all_databases(user_dir):
    """Clears all database mirrors."""
    data_dir = os.path.join(user_dir, "data")
    count = 0
    
    if os.path.exists(data_dir):
        files = glob.glob(os.path.join(data_dir, "*.db"))
        for f in files:
            try:
                os.remove(f)
                count += 1
            except Exception as e:
                print(f"Failed to delete {os.path.basename(f)}: {e}")
        print(f"  Cleared {count} database mirrors.")
    
    return count


def clear_specific_database(user_dir, db_name):
    """Clears a specific database file."""
    data_dir = os.path.join(user_dir, "data")
    
    # Ensure .db extension
    if not db_name.endswith('.db'):
        db_name = db_name + '.db'
    
    db_path = os.path.join(data_dir, db_name)
    
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
            print(f"  Deleted database: {db_name}")
            return 1
        except Exception as e:
            print(f"Failed to delete {db_name}: {e}")
            return 0
    else:
        print(f"  Database not found: {db_name}")
        return 0


def clear_specific_registry(root_dir, registry_name):
    """Clears a specific registry cache."""
    # Registry caches are typically stored in memory and loaded from YAML
    # We'll clear the cached data by touching a marker file or clearing temp cache
    
    cache_dir = os.path.join(root_dir, "user", ".cache")
    os.makedirs(cache_dir, exist_ok=True)
    
    registry_cache_file = os.path.join(cache_dir, f"registry_{registry_name}.cache")
    
    if os.path.exists(registry_cache_file):
        try:
            os.remove(registry_cache_file)
            print(f"  Cleared {registry_name} registry cache.")
            return 1
        except Exception as e:
            print(f"Failed to clear {registry_name} cache: {e}")
            return 0
    else:
        print(f"  No cache found for registry: {registry_name}")
        print(f"  (Registry will reload from source on next access)")
        return 0


def clear_temp_files(user_dir):
    """Clears temporary files."""
    temp_patterns = [
        os.path.join(user_dir, "**", "*.tmp"),
        os.path.join(user_dir, "**", "*.bak"),
        os.path.join(user_dir, "**", "~*"),
        os.path.join(user_dir, ".cache", "**", "*"),
    ]
    
    count = 0
    for pattern in temp_patterns:
        files = glob.glob(pattern, recursive=True)
        for f in files:
            if os.path.isfile(f):
                try:
                    os.remove(f)
                    count += 1
                except Exception as e:
                    print(f"Failed to delete {os.path.basename(f)}: {e}")
    
    print(f"  Cleared {count} temporary files.")
    return count


def clear_archives(user_dir):
    """Clears archived items and schedules."""
    archive_dir = os.path.join(user_dir, "archive")
    count = 0
    
    if os.path.exists(archive_dir):
        # Count files before deletion
        for root, dirs, files in os.walk(archive_dir):
            count += len(files)
        
        try:
            shutil.rmtree(archive_dir)
            os.makedirs(archive_dir)
            # Recreate subdirectories
            os.makedirs(os.path.join(archive_dir, "schedules"), exist_ok=True)
            print(f"  Cleared {count} archived items.")
        except Exception as e:
            print(f"Failed to clear archives: {e}")
            return 0
    else:
        print("  No archive directory found.")
    
    return count


def get_help_message():
    return """
Usage: clear [logs|schedules|cache|db:<name>|registry:<name>|temp|archives|all] [force:true]
Description: Delete logs, generated schedules, cache databases, temp files, or archives.
Examples:
  clear logs
  clear db:chronos_core
  clear registry:wizards
  clear all force:true
"""

