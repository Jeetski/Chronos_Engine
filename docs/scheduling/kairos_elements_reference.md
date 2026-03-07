# Kairos Elements Reference

Last verified: 2026-03-07  
Scope: Active Kairos scheduling semantics

## Purpose

This is the canonical glossary for Kairos schedule elements and flags used by Chronos operators and agents.

## Core Elements

### Window
Definition:
- A template node with `window: true` that acts as a dynamic placement container.

Key fields:
- `window: true`
- `start` / `end` (HH:MM)
- `filters` (optional rules for eligible items)

Behavior:
- Kairos fills windows with highest-ranked compatible candidates.
- Window filters can restrict placement by type/category/tags/properties.

### TimeBlock
Definition:
- A fixed template schedule segment represented by `type: timeblock`.

Common fields:
- `type: timeblock`
- `subtype: buffer|category|free|break`
- `duration`
- optional `start_time` / `end_time`

Behavior:
- Timeblocks participate as explicit timeline structure.
- Subtype controls how placement and slack handling behave.

### Buffer (timeblock subtype)
Definition:
- `subtype: buffer` segment used for slack/overflow absorption.

Behavior:
- Reduces conflict cascades when tasks drift.
- May be authored in templates or injected synthetically.

### Break (synthetic or modeled)
Definition:
- A break segment (often scheduler-inserted) used for timer-style pacing.

Behavior:
- Can be inserted by Kairos when timer breaks are enabled.
- In timer schedule mode, break/buffer blocks are treated as non-completable break phases.

### Category Block (timeblock subtype)
Definition:
- `subtype: category` segment with category bias.

Behavior:
- Prioritizes placement of matching-category work in that segment.

### Free Block (timeblock subtype)
Definition:
- `subtype: free` segment representing intentionally unallocated time.

Behavior:
- Can be used for flexible placement and gap management.

### Anchor
Definition:
- A non-movable/non-trimmable block, typically `reschedule: never`.

Behavior:
- Anchors are placed first.
- Unresolved anchor overlap can invalidate schedule generation (`anchor_conflicts`).

### Candidate
Definition:
- An executable item considered for placement after gather/filter.

Typical sources:
- `task`, `habit`, `subroutine`, `microroutine` rows from `chronos_core.db`.

### Injection
Definition:
- Operator-directed insertion into schedule flow (manual modification records).

Modes:
- Soft injection: boost/create candidate preference.
- Hard injection: pin at requested time (may displace overlaps).

### Auto Injection
Definition:
- Item property `auto_inject: true`.

Behavior:
- Candidate is packed into earliest feasible free segment.

### Quick Wins
Definition:
- Short, high-leverage candidate placement used to fill leftover schedule gaps.

Behavior:
- Applied during gap-fill stage after primary placements.
- Targets short tasks that fit remaining segments.
- Can draw from due/overdue/missed context depending runtime/settings.

Typical controls:
- Runtime option: `quickwins:N`
- Settings: `user/Settings/quick_wins_settings.yml`

Operational intent:
- Improve day utilization without destabilizing anchor and high-priority structure.
- Add momentum when large focus blocks cannot fit the remaining free slices.

### Gap
Definition:
- A free timeline segment between already placed schedule blocks.

Behavior:
- Gaps are discovered after primary placement steps.
- Kairos can use gaps for:
  - quick-wins placement
  - synthetic buffer insertion
  - synthetic break insertion (when timer breaks are enabled)

Why gaps may remain unfilled:
- no candidate fits remaining duration
- window/filter/status/place constraints block eligibility
- min-duration constraints exclude available tasks
- anchors/timeblocks leave unusable fragments

Operational value:
- Gap shape reveals schedule quality and remaining flexibility.
- Persistent large gaps usually indicate candidate/filter/template mismatch.

### Dependency
Definition:
- `depends_on` relationship requiring predecessor ordering.

Behavior:
- Enforced in dependency pass after overlap repair.
- May trigger cascading shifts.

### Completion Marker
Definition:
- Informational block synthesized from completion logs after planning.

Behavior:
- Keeps completed work visible without changing core placement decisions.

## Important Flags and Properties

### Scheduling rigidity
- `reschedule: never` -> anchored behavior
- `flexible: false` -> reduced mobility
- `essential: true` -> protected from aggressive cuts

### Placement hints
- `ideal_start_time`, `ideal_end_time`
- `duration`
- `category`, `priority`
- `environment`

### Context matching
- `status_requirements` map (preferred)
- legacy status keys (still recognized)

### Structural
- `children` / `items` (template hierarchy)
- `window: true`
- `type: timeblock`

## Kairos Runtime Controls That Change Element Behavior

- `template:<name|path>` -> template/window source
- `status:key=value,...` -> status match + scoring effects
- `prioritize:key=value,...` -> score weight bias
- `buffers:true|false` -> synthetic/behavioral buffer handling
- `breaks:timer|none` -> timer break insertion
- `sprints:true|false` -> sprint splitting behavior
- `timer_profile:<name>` -> break/focus pacing parameters
- `quickwins:N` -> leftover-gap candidate fill
- `buffers:true|false` -> synthetic buffer insertion into eligible gaps
- `breaks:timer|none` -> timer break insertion into eligible gaps
- `ignore-trends` -> disable trend reliability influence

## Common Misunderstandings

1. "Buffers are normal tasks."
- False. Buffers/breaks are schedule-structure elements, not normal completion targets.

2. "Anchors should be used everywhere."
- False. Over-anchoring increases conflict risk and can invalidate runs.

3. "Windows and timeblocks are the same."
- False. Windows are dynamic candidate containers; timeblocks are explicit schedule segments.

4. "Reschedule ignores manual edits."
- False. `today reschedule` carries manual modifications/injections.

5. "Quick wins are random filler."
- False. They are constrained short candidates selected in a dedicated gap-fill pass.

6. "Any gap means scheduler failure."
- False. Some gaps are intentional or constraint-safe. Treat recurring large/unusable gaps as a tuning signal.

## Example Snippets

Window:
```yaml
name: Deep Work Window
window: true
start: "09:00"
end: "11:00"
filters:
  category: focus
```

Buffer timeblock:
```yaml
name: Overflow Buffer
type: timeblock
subtype: buffer
duration: 20
```

Anchored block:
```yaml
name: School Pickup
type: task
reschedule: never
start_time: "15:30"
duration: 30
```

Status-aware item:
```yaml
name: Low Energy Admin
type: task
duration: 30
status_requirements:
  energy: low
  focus: low
```

## Related Docs

- `docs/scheduling/scheduling_algorithm_overview.md`
- `docs/scheduling/scheduling_algorithm_deep_dive.md`
- `docs/reference/item_properties.md`

