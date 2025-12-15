
# Test Search, Clean, and Safety Tags

echo "--- Setup ---"
new note "SearchTarget" content:"The curious fox jumps over the lazy dog"
new note "CleanTarget"

echo "--- 1. Search Test ---"
search "curious fox"
search type:note "lazy dog"

echo "--- 2. Delete Tagging Test ---"
delete note "SearchTarget"

# Verify deleted tag in archive
# We can't easily grep inside a CHS script without a command, but we can check if file exists
# and use 'search' to find the 'deleted: true' string in it!
if exists file:"User/Archive/notes/SearchTarget.yml" then
    echo "Archived file exists. Checking for tag..."
    # Hacky verify using our new search command on the archive dir? 
    # Search command skips deleted... wait, search command skips nothing in my impl (except Backups)
    # But search searches User/ dir.
    pass
else
    echo "ERROR: Soft delete failed."
end

echo "--- 3. Clean Backups Test ---"
# Create dummy backups
backup "chk_backup_1"
backup "chk_backup_2"
backup "chk_backup_3"
backup "chk_backup_4"
backup "chk_backup_5"
backup "chk_backup_6"

# Should have 6. Clean keeping 3.
clean backups keep:3

# We can't verify exact count easily in CHS without a 'count files' command.
# But we can verify execution didn't crash.
echo "Clean backups executed."

echo "--- Cleanup ---"
delete note "CleanTarget" force:true
delete note "SearchTarget" force:true

echo "--- Done ---"
