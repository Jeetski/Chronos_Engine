set var who:Alice
create note "IF Note @who" category:work priority:high
if exists note:"IF Note @who" then echo FOUND else echo MISSING
if status:energy eq high then echo ENERGY_HIGH else echo ENERGY_LOW
if note:"IF Note @who":priority eq high then echo PRIO_HIGH
if note:"IF Note @who":priority ne low then echo PRIO_NOT_LOW
if note:"IF Note @who":priority gt g then echo LEX_GT
