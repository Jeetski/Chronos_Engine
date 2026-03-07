# Chronos Orientation

## Purpose
Give agents a fast, accurate understanding of what Chronos is, how it is structured, and how to route into the right docs/skills before taking action.

## When To Use
- User asks "what is Chronos?" or "how does Chronos work?"
- Agent needs initial orientation in a new session.
- Agent needs doc-routing before domain execution.

## Scope
- Conceptual model and documentation navigation.
- Not for detailed execution workflows (use domain skills after orientation).

## Core Explanation (Agent Version)
Chronos is a YAML-first life management engine with:
- CLI command runtime (`modules/console.py`, `commands/*.py`)
- item-based data model under `User/`
- Kairos scheduler (`today`, `today reschedule`)
- listener (alarms/reminders/timer)
- local dashboard with API endpoints
- sequence mirrors and trends for analytics context

## Orientation Workflow
1. Open `docs/readme.md` for high-level architecture and entry points.
2. Open `docs/index.md` for doc map.
3. Open `docs/agents/skills/index.md` for intent-to-skill routing.
4. Select primary domain skill and continue there.

## Quick Doc Routing
- "How to run commands/scripts" -> `Agent-Basics`
- "Plan/reschedule day" -> `Scheduling`
- "Manage items" -> `Item-Management`
- "Update status context" -> `Status-Management`
- "Goals/milestones" -> `Goal-Planning`
- "Projects/backlog/stages" -> `Project-Management`
- "Progress/review/trends" -> `Tracking-And-Review`

## Guardrails
- Do not preload the entire docs tree.
- Load only the docs required by current user intent.
- If behavior is uncertain, prefer code-aligned references over old summaries.

## References
- `docs/readme.md`
- `docs/index.md`
- `docs/agents/skills/index.md`
- `docs/agents/agents.md`

