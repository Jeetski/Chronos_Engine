# bang not
if ! exists note:"Definitely Missing" then echo BANG_NOT_OK
# bang with parens
if ! ( status:energy ne high ) then echo BANG_PAREN_OK
