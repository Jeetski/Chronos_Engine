
# Test Safety Features

echo "--- 1. Setup ---"
new note "SafetyTestNote" category:test priority:high

if exists note:"SafetyTestNote" then
    echo "Note created successfully."
else
    echo "ERROR: Note creation failed."
end

echo "--- 2. Archive Test ---"
archive note "SafetyTestNote"

if not exists note:"SafetyTestNote" then
    echo "Note removed from active items."
else
    echo "ERROR: Note still exists in active items."
end

if exists file:"User/Archive/notes/SafetyTestNote.yml" then
    echo "Note found in Archive."
else
    echo "ERROR: Note not found in Archive."
end

echo "--- 3. Undo Delete Test ---"
undo delete note

if exists note:"SafetyTestNote" then
    echo "Undo successful: Note restored."
else
    echo "ERROR: Undo failed: Note not restored."
end

echo "--- 4. Delete Command (Soft) Test ---"
delete note "SafetyTestNote"

if not exists note:"SafetyTestNote" and exists file:"User/Archive/notes/SafetyTestNote.yml" then
    echo "Soft delete successful."
else
    echo "ERROR: Soft delete failed."
end

echo "--- 5. Delete Command (Hard) Test ---"
# First wipe it from archive to be sure
# Actually we can just hard delete and check archive doesn't change or file is gone
# Let's restore it first to test hard delete from active state
undo delete note
delete note "SafetyTestNote" force:true

if not exists note:"SafetyTestNote" and not exists file:"User/Archive/notes/SafetyTestNote.yml" then
    echo "Hard delete successful (not in active, not in archive - assuming archive was clean or overwritten? wait, hard delete shouldn't touch archive if it was already there, but here we restored it first)."
    # Actually, if I restored it, it moved FROM archive TO active. So archive should be empty of it. 
    # Then hard delete removes it from active. So it should be nowhere.
    echo "Verified functionality."
else
    if exists file:"User/Archive/notes/SafetyTestNote.yml" then
        echo "ERROR: File found in archive after hard delete (did it fallback to soft delete?)."
    else
        echo "ERROR: File still exists in active?"
    end
end

echo "--- Safety Tests Complete ---"
