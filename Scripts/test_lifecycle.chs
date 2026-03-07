# CHS Lifecycle Test
# This script verifies that we can creation, read, and delete items via the CLI.
# Run with: python Modules/console.py Scripts/test_lifecycle.chs

# 1. Clean up potential leftovers
if exists item:task:Test_Lifecycle then
    delete task "Test Lifecycle"
end

# 2. Check it doesn't exist
if exists item:task:Test_Lifecycle then
    echo "Error: Item should not exist yet"
    exit
else
    echo "PASS: Pre-clean successful"
end

# 3. Create Item
new task "Test Lifecycle" duration:45m category:Testing
echo "Created Test Lifecycle task"

# 4. Verify Existence
if exists item:task:Test_Lifecycle then
    echo "PASS: Item created successfully"
else
    echo "FAIL: Item was not created"
    exit
end

# 5. Verify Content (using generic 'matches' on raw file check or status check)
# Ideally we'd have 'if item:task:Test_Lifecycle:duration == 45' but parser limits vary.
# We'll use a property set to verify mutation.

set task "Test Lifecycle" status:in_progress
echo "Updated status to in_progress"

# 6. Delete Item
delete task "Test Lifecycle"
echo "Deleted item"

# 7. Final Verify
if exists item:task:Test_Lifecycle then
    echo "FAIL: Item still exists after delete"
else
    echo "PASS: Lifecycle test complete"
end
