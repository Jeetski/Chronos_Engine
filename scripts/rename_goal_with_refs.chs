# Rename a goal and batch-update common goal references across items.
# Usage:
# 1) Edit old_goal/new_goal below
# 2) run scripts/rename_goal_with_refs.chs

set var old_goal:Old Goal Name
set var new_goal:New Goal Name

rename goal "@old_goal" "@new_goal"

# Milestones and common direct refs
list milestones goal:@old_goal then set milestone @name goal:@new_goal
list tasks goal:@old_goal then set task @name goal:@new_goal
list habits goal:@old_goal then set habit @name goal:@new_goal
list commitments goal:@old_goal then set commitment @name goal:@new_goal
list notes goal:@old_goal then set note @name goal:@new_goal

# Alternate key some items use
list tasks goal_name:@old_goal then set task @name goal_name:@new_goal
list habits goal_name:@old_goal then set habit @name goal_name:@new_goal
list commitments goal_name:@old_goal then set commitment @name goal_name:@new_goal

echo "Goal rename batch complete."

