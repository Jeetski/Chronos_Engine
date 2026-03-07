# Scheduling (Kairos Only)

## Purpose
Operate Chronos scheduling end-to-end using Kairos only: build plans, repair conflicts, adapt to live-day drift, and explain outcomes with evidence.

## Hard Scope
- Use Kairos paths only.
- Do not route to legacy scheduler (`today legacy ...`) unless the user explicitly requests legacy mode.
- Assume user intent is operational scheduling, not generic item CRUD.

## When To Use
- "Plan/reschedule my day."
- "Why did this block move/get cut?"
- "I missed blocks, rebuild from now."
- "Preview tomorrow/this/next with current status."
- "Fix anchors/dependencies/conflicts."

## Source of Truth
- Scheduler entrypoint: `commands/today.py`
- Scheduler engine: `modules/scheduler/kairos.py`
- Weekly skeleton: `modules/scheduler/weekly_generator.py`
- Active schedule output: `user/schedules/schedule_YYYY-MM-DD.yml`
- Manual modifications: `user/schedules/manual_modifications_YYYY-MM-DD.yml`
- Completion logs: `user/schedules/completions/YYYY-MM-DD.yml`
- Decision logs:
  - `user/logs/kairos_decision_log_latest.md`
  - `user/logs/kairos_decision_log_latest.yml`

## Kairos Mental Model
Kairos is a constrained optimizer with deterministic phases:
1. Load runtime context (status, priorities, settings, trends, completions).
2. Resolve template/windows/timeblocks.
3. Gather executable candidates.
4. Hard-filter candidates.
5. Score candidates (additive weighted model).
6. Construct timeline (anchors -> injections -> windows -> timeblocks -> gap fill -> synthetic blocks).
7. Repair overlaps + enforce dependencies.
8. Rehydrate completion markers.
9. Persist schedule + emit explainability logs.

Agents should reason in that order when diagnosing outcomes.

## Core Commands (Kairos)
- `today`
- `today reschedule`
- `today kairos [options]`
- `today kairos week [days:N] [options]`
- `tomorrow [days:N]`
- `this <weekday>`
- `next <weekday|day|ordinal>`

## Kairos Runtime Options (Chronos Syntax)
- `template:<name|path>`
- `status:key=value,key=value`
- `prioritize:key=value,key=value`
- `custom_property:<prop>`
- `buffers:true|false`
- `breaks:timer|none`
- `sprints:true|false`
- `timer_profile:<name>`
- `quickwins:N`
- `ignore-trends` or `ignore-trends:true|false`
- `days:N` (weekly mode)

## Scheduling Input Levers

### 1) Status Context
- Update status before significant replans:
  - `status energy:low focus:medium ...`
- Status controls template match quality and item score boosts.

### 2) Template + Windows
- Day template selection priority:
  1. day eligibility + place + status match
  2. day eligibility + place
  3. fallback selector
- `window: true` nodes are placement containers.
- `timeblock` nodes can be `buffer`, `category`, `free`.

### 3) Item Properties That Affect Scheduling
- Anchoring/immutability:
  - `reschedule: never`
  - `flexible: false`
  - `essential: true`
- Timing and duration:
  - `ideal_start_time`, `ideal_end_time`, `duration`
- Dependencies:
  - `depends_on: [...]`
- Status-aware gating:
  - `status_requirements: { ... }`
- Injection behavior:
  - `auto_inject: true`

### 4) Scoring Inputs
- Priority/category/environment/due/deadline/happiness/status/trends/custom property.
- Per-run bias:
  - `prioritize:happiness=9,deadline=5`
- Feature toggles:
  - `ignore-trends`
  - `custom_property:<prop>`

## Operational Modes

### A) Normal Build
1. `status ...` (if needed)
2. `today`
3. If output is stale/misaligned: `today reschedule`

### B) Midday Recovery
1. Log reality first (`did`, `mark`, `complete`, `cut`, `trim`, `change`, `shift`)
2. Update status if user state changed
3. `today reschedule` (Kairos will favor remaining-day capacity)

### C) Future Preview
1. Set status for expected future state (optional)
2. `tomorrow` / `this` / `next`
3. Use preview to adjust templates/anchors before execution day

### D) Diagnostics-First
1. `today kairos ...` (shadow)
2. Inspect `kairos_decision_log_latest.md`
3. Apply targeted fixes
4. Re-run active `today reschedule`

## Safe Intervention Ladder
Use smallest-force intervention first:
1. Status correction (`status ...`)
2. Local schedule edits (`change`, `trim`, `shift`, `cut`)
3. Anchoring critical block (`anchor ... scope:today` or `scope:item`)
4. Reschedule (`today reschedule`)
5. Template/window/property corrections

Avoid jumping straight to template rewrites when a local edit solves the issue.

## Conflict Playbooks

### Anchor Conflict (invalid schedule)
Symptoms:
- Decision log shows `invalid_reason: anchor_conflicts`.
Actions:
1. Identify overlapping anchored blocks (`reschedule: never` / anchor timeblocks).
2. Adjust one anchor start/duration (`change`, `trim`, item property edit).
3. Re-run `today reschedule`.

### Underfilled Day
Symptoms:
- Large gaps, few planned items, many unscheduled candidates.
Actions:
1. Check window filters and status thresholds.
2. Validate candidate durations and place/status compatibility.
3. Increase short-task fill via `quickwins:N` and/or reduce constraints.
4. Re-run.

### Excessive Cuts/Trims
Symptoms:
- Important work repeatedly cut by repair pass.
Actions:
1. Protect critical blocks (`essential:true`, `reschedule:never` where justified).
2. Reduce day load (durations, non-essential blocks).
3. Increase usable slack (buffers/timeblocks).
4. Re-run and inspect repair events.

### Dependency Violations
Symptoms:
- Child/dependent block scheduled before prerequisite.
Actions:
1. Validate `depends_on` names are correct.
2. Ensure prerequisite blocks have enough feasible placement room.
3. Re-run and inspect dependency repair notes.

## Manual Overrides and Day Control
- Time and duration controls:
  - `change <item> HH:MM`
  - `shift <item> +/-minutes`
  - `trim <item> minutes`
  - `stretch <item> minutes`
- Structural controls:
  - `split <item> [count:N]`
  - `merge <item> with <other>`
  - `cut <item>`
  - `anchor <item> [scope:today|item]`
- Logging reality:
  - `did "Block" start_time:... end_time:... status:...`
  - `mark <item>:completed|skipped|partial|...`

Rule:
- Log reality first, then reschedule.

## Buffers, Breaks, and Timer Alignment
- Kairos may insert synthetic `buffer`/`break` timeblocks.
- In timer schedule mode, break/buffer blocks are treated as break phases (non-completable).
- Do not treat buffer/break blocks as normal completion targets.

## Explainability Contract For Agents
When reporting scheduling actions, always include:
1. What was changed (commands/options used).
2. Why (status/constraint/conflict rationale).
3. What moved/cut/anchored.
4. What user should do next (if any).

Good summary format:
- "Updated status to `energy:low, focus:medium` and ran `today reschedule`."
- "Kairos shifted two low-priority tasks, preserved anchored meeting, and inserted a 15m buffer."
- "Next recommended action: start `Deep Work Lite` block now."

## High-Value Recipes

### Recipe: Overwhelmed Midday
1. `status energy:low focus:low stress:high`
2. `did "Morning Block" status:partial`
3. `today reschedule`

### Recipe: Protect Hard Commitments
1. `anchor "Doctor Appointment" scope:today`
2. `anchor "School Pickup" scope:item type:task`
3. `today reschedule`

### Recipe: Deadline Bias
1. `today kairos prioritize:deadline=9,due_date=8,status_alignment=6`
2. Validate plan via decision log.
3. `today reschedule` with same intent if approved.

### Recipe: Energy-Adapted Tomorrow Preview
1. `status energy:medium focus:high`
2. `tomorrow`
3. If needed: tune template/status requirements and preview again.

## Guardrails
- Never use legacy scheduler path unless explicitly requested.
- Avoid destructive structural edits before validating with preview/shadow run.
- Keep anchoring selective; over-anchoring increases conflict risk.
- Do not claim scheduler reasoning without checking decision logs in ambiguous cases.
- Use explicit dates when editing non-today schedules.

## References
- `docs/scheduling/scheduling_algorithm_overview.md`
- `docs/scheduling/scheduling_algorithm_deep_dive.md`
- `docs/reference/cli_commands.md`
- `docs/reference/item_properties.md`
- `docs/agents/agents.md`


