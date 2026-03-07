# Rename a project and batch-update common project references across items.
# Usage:
# 1) Edit old_project/new_project below
# 2) run scripts/rename_project_with_refs.chs

set var old_project:Old Project Name
set var new_project:New Project Name

rename project "@old_project" "@new_project"

# Core linked item refs
list goals project:@old_project then set goal @name project:@new_project
list milestones project:@old_project then set milestone @name project:@new_project
list tasks project:@old_project then set task @name project:@new_project
list habits project:@old_project then set habit @name project:@new_project
list routines project:@old_project then set routine @name project:@new_project
list subroutines project:@old_project then set subroutine @name project:@new_project
list microroutines project:@old_project then set microroutine @name project:@new_project
list notes project:@old_project then set note @name project:@new_project
list plans project:@old_project then set plan @name project:@new_project
list appointments project:@old_project then set appointment @name project:@new_project
list rituals project:@old_project then set ritual @name project:@new_project

# Resolution link refs (if used)
list goals resolution_ref:@old_project then set goal @name resolution_ref:@new_project
list milestones resolution_ref:@old_project then set milestone @name resolution_ref:@new_project

echo "Project rename batch complete."

