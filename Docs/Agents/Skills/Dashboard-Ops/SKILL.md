# Dashboard Ops

## Purpose
Operate and troubleshoot dashboard workflows and API-backed actions.

## When To Use
- User asks for dashboard-side action parity with CLI.
- User reports dashboard widget/state mismatch.

## Workflow
1. Identify target widget/view flow.
2. Verify API endpoint and payload shape.
3. Compare dashboard action with direct CLI command.
4. Apply fix or provide exact workaround.

## Command Patterns
- `dashboard`
- `register all`
- `listener start`

## API Focus
- `/api/cli`
- `/api/item`
- `/api/template`
- `/api/today`
- `/api/timer/*`

## References
- `Docs/Guides/Dashboard.md`
- `Docs/Reference/Dashboard_API.md`
