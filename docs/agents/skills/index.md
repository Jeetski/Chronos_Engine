# Chronos Skills Index

This index maps common user intents to the skill folder to load first.

## Routing Rules

1. Pick the narrowest skill that fully matches the request.
2. If multiple skills apply, run primary first, then supporting skills.
3. If request includes both planning and live updates:
   - Use `Scheduling` first for plan shape.
   - Use `Day-Execution` second for block-level edits/logging.
4. If request is dashboard-specific, include `Dashboard-Ops` even when a domain skill is primary.
5. If cleanup/reset/backup is requested, include `Data-Hygiene` before destructive actions.
6. If request needs dashboard UI control, load `docs/agents/trick.md` before issuing UI actions.

## Intent -> Skill

| User intent | Primary skill | Supporting skills |
| --- | --- | --- |
| "What is Chronos?", "How is Chronos structured?", "Where should I read first?" | `Chronos-Orientation` | `Agent-Basics` |
| "How do I run Chronos?", "How do launchers/CLI/.chs work?" | `Agent-Basics` | Domain skill as needed |
| "Create/update/delete items", "Organize tasks/habits/notes", "Bulk edits" | `Item-Management` | `Templates`, `Scheduling` |
| "Update my status", "Plan around low energy/high stress", "Status-aware replanning" | `Status-Management` | `Scheduling` |
| "Plan my day", "Reschedule today", "Fix schedule conflicts" | `Scheduling` | `Templates`, `Timer` |
| "I finished/skipped this", "Move this block", "Log what happened" | `Day-Execution` | `Scheduling` |
| "Set goals/milestones", "Plan long-term outcomes" | `Goal-Planning` | `Tracking-And-Review`, `Scheduling` |
| "Plan/track a project", "Break project into tasks" | `Project-Management` | `Goal-Planning`, `Scheduling` |
| "Check commitments/rewards/points", "Run accountability loop" | `Commitments-And-Rewards` | `Tracking-And-Review` |
| "Generate retros/reviews", "Turn trends into actions" | `Reviews-And-Retros` | `Tracking-And-Review`, `Scheduling` |
| "Build a reusable routine/day template" | `Templates` | `Scheduling` |
| "Refactor complex template architecture" | `Template-Authoring-Advanced` | `Templates`, `Scheduling` |
| "Start focus timer", "Run start day", "Stretch/skip timer block" | `Timer` | `Day-Execution` |
| "Show progress", "Run daily/weekly review", "Find quick wins" | `Tracking-And-Review` | `Scheduling` |
| "Dashboard button doesn't match CLI", "Widget/API flow issue" | `Dashboard-Ops` | Domain skill (as needed) |
| "Backup/restore/clear/cache reset" | `Data-Hygiene` | `Dashboard-Ops` |
| "Chronos seems broken", "Scheduler/data mismatch", "Recovery help" | `Troubleshooting-And-Recovery` | `Data-Hygiene`, `Dashboard-Ops` |

## Skill Paths

- `docs/agents/skills/scheduling/skill.md`
- `docs/agents/skills/chronos_orientation/skill.md`
- `docs/agents/skills/agent_basics/skill.md`
- `docs/agents/skills/status_management/skill.md`
- `docs/agents/skills/day_execution/skill.md`
- `docs/agents/skills/templates/skill.md`
- `docs/agents/skills/timer/skill.md`
- `docs/agents/skills/item_management/skill.md`
- `docs/agents/skills/goal_planning/skill.md`
- `docs/agents/skills/project_management/skill.md`
- `docs/agents/skills/commitments_and_rewards/skill.md`
- `docs/agents/skills/reviews_and_retros/skill.md`
- `docs/agents/skills/template_authoring_advanced/skill.md`
- `docs/agents/skills/troubleshooting_and_recovery/skill.md`
- `docs/agents/skills/tracking_and_review/skill.md`
- `docs/agents/skills/dashboard_ops/skill.md`
- `docs/agents/skills/data_hygiene/skill.md`
- `docs/agents/skills/template/skill.md`

## Example Multi-Skill Sequences

1. "My day is chaos, rebuild it and start timer."
- `Scheduling` -> `Timer`

2. "I skipped two blocks, reflow the rest."
- `Day-Execution` -> `Scheduling`

3. "Template this week pattern, then preview tomorrow."
- `Templates` -> `Scheduling`

4. "Dashboard timer widget is wrong; verify API and fix workflow."
- `Dashboard-Ops` -> `Timer`

5. "I want a 90-day goal plan with milestones, then schedule next actions."
- `Goal-Planning` -> `Project-Management` -> `Scheduling`

6. "My energy crashed, replan the rest of today."
- `Status-Management` -> `Scheduling`

7. "Chronos feels broken; fix scheduling and stale dashboards."
- `Troubleshooting-And-Recovery` -> `Data-Hygiene` -> `Dashboard-Ops`
