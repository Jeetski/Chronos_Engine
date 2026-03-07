# Project Management

## Purpose
Run project execution in Chronos from scope definition to daily delivery: structure project data, maintain stages/state, and continuously convert project intent into scheduled work.

## Hard Scope
- This skill owns project-level planning and execution control.
- It includes project metadata, linked tasks/milestones, cadence, and risk response.
- It does not replace Scheduling skill; it feeds Scheduling with executable project work.

## When To Use
- "Create/manage this project."
- "Break project into tasks and phases."
- "Track project progress and blockers."
- "Re-plan project after delays."
- "Turn project plan into this week/day execution."

## Source of Truth
- Project items: `User/Projects/*.yml`
- Linked tasks/milestones: `User/Tasks/*.yml`, `User/Milestones/*.yml`
- Project/goal rename flows and dashboard views:
  - Project Manager view
  - API rename endpoints mapped to CLI logic

## Project Mental Model
Chronos project operations are four connected layers:
1. Project envelope: objective, scope, target date, state/stage.
2. Work decomposition: milestones + task backlog.
3. Execution queue: next actions pulled into schedules.
4. Feedback loop: progress, blockers, and replanning.

Agents must preserve flow across all four layers. A project is not "managed" if it only has metadata without executable next actions.

## Canonical Data Model

### Project Fields (common)
- `name`
- `status` (`active`, `paused`, `completed`, etc.)
- `state` (planning metadata)
- `stage` (phase marker; flexible text)
- `priority`
- `category`
- `target_date` or `due_date`
- `description`
- optional tags and planning metadata

### Linked Work Items
- Project tasks:
  - use a linking field such as `project:"<Project Name>"` (or project-ref convention used in workspace)
- Project milestones:
  - milestone entries scoped to the project objective

## Command Surface

### Project CRUD + Planning
- `new project "<name>" key:value ...`
- `set project "<name>" key:value ...`
- `append project "<name>" "..."`
- `view project "<name>"`
- `rename project "<old>" "<new>"` (or project rename flow)
- `delete project "<name>"`

### Linked Work Management
- `new task "<name>" project:"<project>" ...`
- `set task "<name>" project:"<project>" ...`
- `list tasks project:"<project>"`
- `new milestone "<name>" ...` and link to project intent
- `list milestones ...` and project-specific filters

### Execution Bridge
- `today`, `today reschedule`
- `add <item> to today` or template workflows
- `track` / review commands for progress checks

## Project Lifecycle Workflow (Agent Standard)

### Phase 1: Define Project Envelope
1. Capture project outcome and boundaries.
2. Set `state`, `stage`, `status`, and timeline (`target_date`).
3. Set priority/category for scoring and filtering.

### Phase 2: Decompose Work
1. Build phase/milestone structure.
2. Build task backlog under project link.
3. Mark dependencies and sequencing constraints.

### Phase 3: Build Execution Queue
1. Select highest-value next actions.
2. Ensure tasks are right-sized for scheduling.
3. Push current actions into daily/weekly plans.

### Phase 4: Run and Adapt
1. Track completed/skipped/blocked work.
2. Update project stage as phase changes.
3. Replan scope/timeline when drift appears.

### Phase 5: Closeout
1. Confirm milestone evidence.
2. Close remaining or archive deferred tasks.
3. Mark project status complete.

## Stage and State Strategy

### Recommended Stage Pattern
- `discovery`
- `planning`
- `execution`
- `stabilization`
- `done`

Use text flexibility as needed, but keep stage names consistent within one project.

### State Usage
- Use `state` for board-like status segmentation (for example `active`, `blocked`, `on_hold`).
- Use `status` for lifecycle state and completion semantics.

## Backlog Hygiene Rules
1. Every active project needs at least one clear next action.
2. Tasks should be schedulable (duration and outcome clear).
3. Remove stale tasks or re-scope quickly.
4. Keep dependencies explicit where ordering matters.

## Failure Playbooks

### Project Is Stuck
Symptoms:
- No movement despite active status.
Actions:
1. Identify blocker task/milestone.
2. Split blocker into smaller tasks.
3. Schedule one unblock action today.

### Scope Creep
Symptoms:
- New work continuously enters, timeline slips.
Actions:
1. Freeze current milestone set.
2. Move non-critical additions to backlog bucket.
3. Recalculate target date and stage.

### No Next Action
Symptoms:
- Project metadata exists, no executable work.
Actions:
1. Create one concrete task.
2. Add duration/priority.
3. Insert into today/template and reschedule.

### Timeline Drift
Symptoms:
- Repeated misses against target date.
Actions:
1. Re-estimate remaining milestone load.
2. Re-prioritize deadline-critical tasks.
3. Update target date explicitly and communicate rationale.

## High-Value Recipes

### Recipe: New Project Bootstrapping
1. `new project "Website Relaunch" priority:high status:active stage:planning target_date:2026-05-01`
2. Create 3-5 milestones aligned to delivery phases.
3. Create initial backlog tasks with `project:"Website Relaunch"`.
4. `list tasks project:"Website Relaunch"`
5. Place top tasks into near-term schedule (`today reschedule` after insertion).

### Recipe: Weekly Project Sync
1. `view project "<name>"`
2. `list tasks project:"<name>"`
3. `list milestones ...` (filtered to project-relevant set)
4. Update `stage`, `state`, `target_date` as needed.
5. Schedule week-front next actions.

### Recipe: Mid-Execution Replan
1. Log reality (`did`/`mark`/`complete`) for current project tasks.
2. Re-order backlog by impact/deadline.
3. Protect critical blocks (`anchor`/essential settings where needed).
4. `today reschedule`.

## Dashboard Interop
- Project Manager view should mirror CLI-managed state/stage/priority/target date.
- Milestones and tasks should remain consistent whether edited from CLI or dashboard.
- Open Milestones from Project Manager for focused milestone operations.

## Explainability Contract For Agents
When running project operations, always report:
1. Project envelope changes (`state`, `stage`, `target_date`, `status`).
2. Work decomposition changes (tasks/milestones added or split).
3. Execution queue change (what is now next).
4. Risk flags and mitigation action.

## Guardrails
- Never keep an active project with zero next actions.
- Avoid simultaneous large scope expansion and aggressive deadlines.
- Do not mark completion until milestone evidence is present.
- Keep naming stable; if renaming project, ensure references stay coherent.
- Prefer incremental replanning over full project resets.

## References
- `Docs/guides/dashboard.md`
- `Docs/reference/cli_commands.md`
- `Docs/reference/item_properties.md`
- `Docs/agents/agents.md`
- `Docs/agents/skills/goal_planning/skill.md`
