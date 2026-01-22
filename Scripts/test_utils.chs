
# Test Engine Utils

echo "--- 1. Testing Run Command ---"
# Create a temporary script to run
# We run a real script
run Scripts/test_echo.chs

echo "--- 2. Testing Alias Command ---"
alias testecho "echo Hello Alias"
alias list
testecho
alias remove testecho

echo "--- 3. Testing Check Command ---"
check

echo "--- 4. Testing Macro Command ---"
macro list
macro disable
macro enable

echo "--- Done ---"
