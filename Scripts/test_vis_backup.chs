
# Test Visualization & Backup

echo "--- Setup ---"
new note "DiffA" content:"Line 1\nLine 2"
new note "DiffB" content:"Line 1\nLine 2 Modified"

echo "--- Tree Test ---"
tree note DiffA
tree dir User/Settings

echo "--- Diff Test ---"
diff note DiffA DiffB

echo "--- Backup & Restore Test ---"
# 1. Create a unique item to verify restore
new note "RestoreTarget"
if exists note:"RestoreTarget" then
    echo "RestoreTarget created."
else
    echo "ERROR: RestoreTarget creation failed."
end

# 2. Backup
backup "test_verification_backup"

# 3. Delete the item
delete note "RestoreTarget" force:true
if not exists note:"RestoreTarget" then
    echo "RestoreTarget deleted."
else
    echo "ERROR: RestoreTarget delete failed."
end

# 4. Restore
restore "test_verification_backup.zip" force:true

# 5. Verify return
if exists note:"RestoreTarget" then
    echo "Restore successful: RestoreTarget is back."
else
    echo "ERROR: Restore failed."
end

echo "--- Cleanup ---"
delete note DiffA force:true
delete note DiffB force:true
delete note RestoreTarget force:true

echo "--- Done ---"
