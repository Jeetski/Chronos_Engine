set var target:Alice
if note:"IF Note @target":priority eq high then
    echo Block THEN ran
elseif status:energy eq low then
    echo Block ELSEIF ran
else
    echo Block ELSE ran
end
