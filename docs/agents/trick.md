# TRICK Protocol (Tiny Remote Interface Control Kit)
Last verified: 2026-03-08

TRICK is the dashboard UI control protocol for familiars.

## 1) Identifier Schema

Use canonical UI identifiers:

`type.name.element_name`

- `type`: `widget | view | panel | popup | gadget`
- `name`: lower snake_case scope name
- `element_name`: lower snake_case element id

Examples:
- `widget.timer.start_button`
- `view.editor.textbox`

Container-only target (no element):
- `widget.timer`

## 2) DSL Commands (v1)

- `OPEN <type.name>`
  - Ensure a target surface is visible/open.
- `CLOSE <type.name>`
  - Hide/close a target surface.
- `LIST <type.name>`
  - Return available elements for that surface.
- `GET <type.name.element_name>`
  - Read text/value/state from an element.
- `SET <type.name.element_name> <value>`
  - Set an editable element value.
- `CLICK <type.name.element_name>`
  - Trigger a click interaction.
- `WAIT <predicate> [timeout_ms]`
  - Wait for async UI state changes before continuing.

Supported `WAIT` predicates in v1:
- `exists <target>`
- `visible <target>`
- `enabled <target>`
- `value <target> <expected>`
- `text_contains <target> <expected>`
- `gone <target>`

## 3) Behavioral Contract

- Prefer TRICK for dashboard UI actions before fallback paths.
- Treat IDs as stable API contracts; labels are not stable identifiers.
- Always `WAIT` after actions that trigger async updates.
- For destructive actions, ask confirmation first unless user explicitly asked.
- If an action fails, report:
  1. command attempted
  2. failure reason
  3. recovery step

## 4) Pilot Surface (Timer Only)

Current rollout scope is `widget.timer`.

Container:
- `widget.timer`

Elements:
- `widget.timer.title`
- `widget.timer.minimize_button`
- `widget.timer.close_button`
- `widget.timer.phase_text`
- `widget.timer.cycle_text`
- `widget.timer.status_text`
- `widget.timer.clock_text`
- `widget.timer.progress_text`
- `widget.timer.block_text`
- `widget.timer.queue_text`
- `widget.timer.confirmation_banner`
- `widget.timer.confirmation_text`
- `widget.timer.confirm_yes_button`
- `widget.timer.confirm_skip_today_button`
- `widget.timer.confirm_later_button`
- `widget.timer.confirm_start_over_button`
- `widget.timer.confirm_stretch_button`
- `widget.timer.profile_select`
- `widget.timer.cycles_input`
- `widget.timer.auto_advance_checkbox`
- `widget.timer.bind_type_input`
- `widget.timer.bind_name_input`
- `widget.timer.start_button`
- `widget.timer.start_day_button`
- `widget.timer.pause_resume_button`
- `widget.timer.cancel_button`
- `widget.timer.refresh_button`

## 5) Usage Pattern

1. `OPEN widget.timer`
2. `WAIT visible widget.timer 5000`
3. `LIST widget.timer`
4. `GET widget.timer.status_text`
5. `CLICK widget.timer.start_button`
6. `WAIT text_contains widget.timer.status_text running 5000`
7. `CLOSE widget.timer`
