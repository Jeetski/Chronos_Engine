# Goal Planning

## Purpose
Run the full goal lifecycle in Chronos: define outcomes, decompose into milestones, wire measurable criteria, track progress, and keep plans execution-ready.

## Hard Scope
- This skill owns goal and milestone strategy and structure.
- Use Chronos items and commands only (goal + milestone + related task/routine links).
- Do not rely on vague motivational framing; require measurable definitions and next actions.

## When To Use
- "Help me plan a goal."
- "Break this goal into milestones."
- "How do I track progress?"
- "I need a 30/60/90 day goal plan."
- "This goal is stalled, fix it."

## Source of Truth
- Goal items: `User/Goals/*.yml`
- Milestone items: `User/Milestones/*.yml`
- Goal/milestone command layer: `Commands/` + `modules/goal/` + `modules/milestone/`
- Progress views:
  - CLI: `track goal ...`, `track milestone ...`
  - Dashboard: Goal Planner + Milestones widget/API

## Goal Planning Mental Model
Chronos goal planning is a hierarchy:
1. Goal: outcome definition and planning envelope.
2. Milestones: measurable checkpoints that prove movement.
3. Execution items: tasks/routines/habits mapped to the current milestone.
4. Scheduling: daily placement of execution items (`today`/`today reschedule`).

Agents should never stop at writing goal text. Always produce at least one measurable milestone and one near-term executable action.

## Canonical Data Model

### Goal-Level Fields (common)
- `name`
- `status` (`pending`, `in_progress`, `completed`, `paused`, etc.)
- `priority`
- `category`
- `due_date` or `target_date`
- `state` / `stage` (dashboard planning metadata)
- `description` or notes content

### Milestone-Level Fields (common)
- `name`
- `goal` (parent goal name)
- `status`
- `weight` (contribution to goal progress)
- `criteria` (`count` or `checklist`)
- `target_count` (for count criteria)
- checklist fields (for checklist criteria)
- completion markers (`completed`, `completed_at`, or equivalent)

## Command Surface

### Goal CRUD + Tracking
- `new goal "<name>" key:value ...`
- `set goal "<name>" key:value ...`
- `append goal "<name>" "..."`
- `view goal "<name>"`
- `track goal "<name>"`
- `delete goal "<name>"`

### Milestone CRUD + Tracking
- `new milestone "<name>" goal:"<goal>" criteria:count|checklist weight:N ...`
- `set milestone "<name>" key:value ...`
- `append milestone "<name>" "..."`
- `view milestone "<name>"`
- `track milestone "<name>"`
- `delete milestone "<name>"`

### Support Commands
- `list goals ...`, `list milestones ...`
- `find goals <keyword>`, `find milestones <keyword>`
- `count goals ...`, `count milestones ...`

## Planning Workflow (Agent Standard)

### Phase 1: Outcome Definition
1. Capture goal outcome in one sentence.
2. Define horizon (`due_date`/`target_date`).
3. Set priority/category and baseline status.

### Phase 2: Milestone Decomposition
1. Create 3-7 milestones for medium/large goals.
2. Assign `weight` so total roughly reflects importance (commonly ~100 total).
3. Pick criteria:
   - `count` for numeric thresholds.
   - `checklist` for finite deliverables.

### Phase 3: Evidence Wiring
1. Ensure each milestone has observable completion evidence.
2. Link execution items (tasks/habits/routines) to active milestone.
3. Define one immediate next action.

### Phase 4: Execution Bridge
1. Add next actions to today/template as appropriate.
2. Run scheduling flow (`today` / `today reschedule`).
3. Track progress regularly (`track goal`, `track milestone`).

### Phase 5: Review + Adaptation
1. Detect stalled milestones.
2. Split oversized milestones or reduce ambiguity.
3. Rebalance weights/scope when reality changed.

## Criteria Design Rules

### `count` Criteria (preferred when possible)
Use for:
- sessions completed
- chapters drafted
- modules shipped
- interviews done

Rules:
- Define exact unit.
- Set clear target count.
- Keep increments observable from existing logs where possible.

### `checklist` Criteria
Use for:
- fixed deliverables with clear done/not-done state.

Rules:
- Checklist items should be atomic.
- Avoid "fuzzy" checklist lines (for example "make it better").

## Quality Bar (Goal Acceptance)
A goal is acceptable only if all are true:
1. Outcome is concrete.
2. Timeline exists.
3. At least one measurable milestone exists.
4. At least one immediate next action exists.
5. Progress can be observed via `track`.

## Failure Playbooks

### Goal Is Vague
Symptoms:
- No measurable definition, no timeline.
Actions:
1. Rewrite outcome.
2. Add timeline.
3. Convert vague milestones into count/checklist criteria.

### Too Many Milestones / Too Much Scope
Symptoms:
- Goal not actionable, stalled, overwhelming.
Actions:
1. Reduce milestone count.
2. Focus on current phase only.
3. Move extras to backlog note/milestone.

### Milestone Never Advances
Symptoms:
- Repeatedly pending, no measurable updates.
Actions:
1. Check criteria realism.
2. Split milestone into smaller checkpoints.
3. Create one recurring execution block.

### Premature Completion
Symptoms:
- Goal marked done but evidence incomplete.
Actions:
1. Re-open status.
2. Reconcile milestone states.
3. Require objective completion evidence.

## High-Value Recipes

### Recipe: 90-Day Goal Skeleton
1. `new goal "Launch Portfolio v2" priority:high target_date:2026-06-30 status:in_progress`
2. `new milestone "Core pages complete" goal:"Launch Portfolio v2" criteria:checklist weight:35`
3. `new milestone "Case studies published" goal:"Launch Portfolio v2" criteria:count target_count:3 weight:40`
4. `new milestone "Analytics + QA pass" goal:"Launch Portfolio v2" criteria:checklist weight:25`
5. `track goal "Launch Portfolio v2"`

### Recipe: Stalled Goal Recovery
1. `track goal "<goal>"`
2. Identify stalled milestone.
3. `set milestone "<name>" ...` (split scope / update criteria)
4. Create one immediate execution task.
5. `today reschedule`

### Recipe: Weekly Goal Check-In
1. `list goals status:in_progress`
2. `track goal "<each>"`
3. Update statuses and target dates as needed.
4. Schedule next milestone actions for current week.

## Dashboard Interop
- Goal Planner view is suitable for metadata/state/stage editing.
- Milestones widget supports filtering and completion/reset actions.
- API-backed operations should remain consistent with CLI command semantics.

## Explainability Contract For Agents
When running this skill, report:
1. What was created/updated (goal + milestones).
2. Why structure was chosen (criteria, weights, timeline).
3. What is currently active.
4. What immediate action is scheduled next.

## Guardrails
- No goal without measurable progress path.
- Do not mark goal complete if milestone evidence is incomplete.
- Keep milestone names specific and testable.
- Avoid rewriting user intent; preserve outcome while improving structure.
- If uncertain on timeline, prefer explicit assumption + confirmation.

## References
- `docs/agents/agents.md`
- `docs/reference/cli_commands.md`
- `docs/reference/item_properties.md`
- `docs/guides/dashboard.md`
- `docs/features/achievements_progression_system.md`
