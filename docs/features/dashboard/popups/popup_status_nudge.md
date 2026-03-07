# StatusNudge Popup

## Overview
Behavioral nudge popup encouraging status updates and adaptive planning actions.
Popups should be concise, actionable, and dismissible without blocking core workflow.

## CLI
- Related command patterns: `status key:value; today reschedule`.
- CLI is the fallback path for actions suggested by popup prompts.
- Command reference: `docs/reference/cli_commands.md`.

## Dashboard
- Runtime source: `utilities/Dashboard/Popups/StatusNudge/`
- Trigger model: popup appears when its startup/runtime conditions are met.
- API endpoints used by this popup:
  - `/api/cli`
  - `/api/status/current`

## Data and Settings
- Reads context via dashboard APIs and may write small interaction/check-in outcomes.
- Popup enable/disable and appearance behavior should follow dashboard appearance/popups settings.

## Operational Workflows
1. Start dashboard in a state where popup criteria are satisfied.
2. Verify popup content is context-aware and action labels are clear.
3. Execute one popup action and verify expected side effect.
4. Dismiss popup and confirm non-blocking continuation of normal workflow.

## Validation
1. Trigger `StatusNudge` popup intentionally in test flow.
2. Confirm API calls succeed and error handling is graceful.
3. Confirm popup does not repeatedly spam in same context cycle unless intended.

## Related Docs
- `docs/guides/dashboard.md`
- `docs/reference/dashboard_api.md`
- `docs/reference/cli_commands.md`

