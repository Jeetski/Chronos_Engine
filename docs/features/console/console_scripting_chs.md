# Console Scripting CHS

## Overview
CHS scripting enables repeatable automation with variables, conditionals, and loops on top of CLI commands.

## CLI
Core behavior:
- one command per line
- comments with `#`
- supports control flow (`if`, `elseif`, `else`, `end`, loops)

Example script:
```chs
status energy:high focus:good
today reschedule
if exists task:"Deep Work" then
  append note "Daily Log" "Prepared deep work block"
end
```

Script reliability rules:
1. Keep commands explicit and idempotent where possible.
2. Avoid hidden side effects in test scripts.
3. Validate critical scripts on sample data before daily use.

## Dashboard
- Editor/Terminal workflows can run CHS logic through command execution endpoints.
- Dashboard script tooling should remain syntax-compatible with CLI runtime.

## Data and Settings
- Scripts commonly live under `scripts/`.
- Script outcomes mutate normal `User/*` item/schedule/settings state.

## Validation
1. Run a small script with a conditional.
2. Verify expected item/schedule updates.
3. Confirm no unintended writes occurred.

## Related Docs
- `docs/dev/chs_scripting.md`
- `docs/guides/conditions_cookbook.md`

