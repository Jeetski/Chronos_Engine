set var target:Alice
if status:energy eq high and exists note:"IF Note @target" then echo BOTH_OK
if note:"IF Note @target":priority matches ^h.* and status:emotion eq happy then echo REGEX_AND
if status:energy eq low or status:emotion eq happy then echo OR_OK
