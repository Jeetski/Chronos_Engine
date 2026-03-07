# Status Management

## Purpose
Maintain accurate user status context (energy/focus/mood/stress/etc.) and apply it before scheduling decisions.

## When To Use
- User asks to update status signals.
- User says schedule should reflect current state.
- Agent needs status-aware template/priority matching before rescheduling.

## Workflow
1. Read current status.
2. Update only the needed dimensions.
3. Ensure status dimensions and values are defined in settings.
4. Re-run scheduling preview or `today reschedule`.
5. Explain what changed due to status shift.

## Status Settings Files
- `user/Settings/status_settings.yml`
  - Canonical status registry used by scheduling and template matching.
- Per-dimension settings files (examples):
  - `user/Settings/health_settings.yml`
  - `user/Settings/energy_settings.yml`
  - `user/Settings/focus_settings.yml`
  - `user/Settings/emotion_settings.yml`
  - `user/Settings/mind_state_settings.yml`
  - `user/Settings/vibe_settings.yml`

Keep per-dimension files aligned with the dimensions defined in `status_settings.yml`.

## Command Patterns
- `status`
- `status energy:low focus:medium mood:flat stress:high`
- `today reschedule`
- `tomorrow`
- `this friday`

## Tagging Items With `status_requirements`
Use `status_requirements` on schedulable items/templates so Chronos favors them when current status matches.

Example:
```yaml
name: Deep Work Lite
type: task
duration: 45m
status_requirements:
  energy: low
  focus: medium
```

Variant example:
```yaml
name: Study Block
type: task
duration: 60m
variants:
  - name: low-energy-version
    status_requirements:
      energy: low
    duration: 30m
```

Legacy status keys are still recognized, but `status_requirements` is preferred.

## Guardrails
- Set status before major schedule rebuilds.
- Avoid overwriting unrelated status fields unless requested.
- If status is uncertain, ask for a quick confirmation before large planning changes.

## References
- `docs/guides/settings.md`
- `docs/reference/cli_commands.md`
- `docs/reference/item_properties.md`
- `docs/scheduling/scheduling_algorithm_overview.md`

