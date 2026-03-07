# not operator
if not exists note:"Definitely Missing" then echo NOT_OK
# unmatched parenthesis should warn once
if ( status:energy eq high then echo BAD
