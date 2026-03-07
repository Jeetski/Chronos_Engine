set var target:Alice
if status:energy eq high then
    echo Outer TRUE
    if exists note:"IF Note @target" then
        echo Nested FOUND
    else
        echo Nested MISSING
    end
else
    echo Outer FALSE
end
