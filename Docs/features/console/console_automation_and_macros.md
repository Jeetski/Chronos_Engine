# Console Automation And Macros

## Overview
Macros add before/after command hooks for consistent automation behavior around CLI actions.

## CLI
Automation surfaces include:
- command hooks (before/after)
- scripted command chains
- trigger-based workflows invoked by higher-level commands

Operational recommendations:
1. Keep hook actions short and predictable.
2. Avoid recursive or self-triggering command loops.
3. Document macro side effects for operator visibility.

## Dashboard
- Dashboard usually observes automation outcomes rather than defining full macro logic.
- Automation side effects should be visible in affected widgets/logs.

## Data and Settings
- Macro definitions/config behavior are documented in macro dev docs and related settings.
- Automations can affect any item/schedule/status points surface depending on configured actions.

## Validation
1. Enable one before/after hook for a safe command.
2. Run command and confirm hook fired exactly once.
3. Disable hook and verify normal behavior returns.

## Related Docs
- `Docs/dev/macros.md`
- `Docs/dev/chs_scripting.md`
