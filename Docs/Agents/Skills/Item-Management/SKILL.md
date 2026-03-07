# Item Management

## Purpose
Create, update, organize, and bulk-manage Chronos items safely across types.

## When To Use
- User asks to add/edit/delete tasks, habits, notes, routines, goals, etc.
- User asks to rename/move/copy items between types.
- User asks for filtered/bulk operations.

## Workflow
1. Identify item type and exact item name(s).
2. Read current state (`view`, `get`, `list/find/count`) before mutation.
3. Apply minimal CRUD updates (`new`, `set`, `append`, `remove`, `rename`, `move`, `delete`).
4. Use `filter` + `bulk` for multi-item actions with dry-run first.

## Command Patterns
- `new task "Deep Work Block" duration:60m priority:high`
- `set task "Deep Work Block" status:pending category:focus`
- `append note "Daily Log" "Finished drafting chapter 2."`
- `rename task "Deep Work Block" "Deep Work Session"`
- `move task "Read Paper" type:project_task`
- `filter task status:pending`
- `bulk set priority:medium`
- `bulk delete dry:true`

## Guardrails
- Confirm type/name before delete/move actions.
- Prefer `bulk ... dry:true` before executing destructive changes.
- Keep item metadata consistent with `Item_Properties` reference.

## References
- `Docs/Reference/CLI_Commands.md`
- `Docs/Reference/Item_Properties.md`
- `Docs/Agents/agents.md`
