# Chronos Agent Skills

This folder holds local Chronos-specific skills for agents.

## Structure

- One folder per skill.
- Each skill folder contains a `SKILL.md`.
- Optional helpers can live in `scripts/`, `references/`, or `assets/` inside each skill folder.

## Initial Skills

- `Chronos-Orientation/` - what Chronos is, architecture basics, and doc/skill routing.
- `Agent-Basics/` - launchers, direct CLI use, arg passing, and `.chs` run flow.
- `Item-Management/` - CRUD, organization, and bulk operations across item types.
- `Status-Management/` - Maintain status context used by status-aware scheduling.
- `Scheduling/` - Build, reschedule, and repair day plans.
- `Day-Execution/` - Run the day live (mark/did/change/trim/cut/shift).
- `Templates/` - Create and evolve day/routine template trees.
- `Timer/` - Start and manage timer flows (`timer`, `start day`).
- `Goal-Planning/` - Define goals, milestones, criteria, and progress tracking.
- `Project-Management/` - Structure project scope into executable tasks and stages.
- `Commitments-And-Rewards/` - Evaluate commitments, redeem rewards, and manage points/achievement loop.
- `Reviews-And-Retros/` - Generate reviews and convert trends into concrete actions.
- `Template-Authoring-Advanced/` - Build/refactor complex template systems and scheduling structures.
- `Troubleshooting-And-Recovery/` - Diagnose and recover from scheduler/data/dashboard issues safely.
- `Tracking-And-Review/` - Track items and run reviews/quickwins.
- `Dashboard-Ops/` - Operate key dashboard/API workflows.
- `Data-Hygiene/` - Backups, restore, clear, and maintenance.

## Naming Guidance

- Use short, explicit names.
- Prefer verb+noun or domain nouns (for example: `Scheduling`, `Timer`, `Dashboard-Ops`).
- Keep naming consistent with Chronos docs and commands.
