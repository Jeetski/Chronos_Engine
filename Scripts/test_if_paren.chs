set var target:Alice
if ( status:energy eq high and exists note:"IF Note @target" ) or status:emotion ne sad then echo PAREN_OK
if ( status:energy eq low or ( status:emotion eq happy and exists note:"IF Note @target" ) ) then echo PAREN_COMPLEX
