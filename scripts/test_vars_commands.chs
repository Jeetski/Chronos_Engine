set var cat:work
set var prio:high
set var who:Alice
create note "Var Note @who" category:@cat priority:@prio
get note "Var Note @who" category variable_name:cat2
echo Resolved category: @cat2
list notes category:@cat then echo created:@name
view note "Var Note @who"
