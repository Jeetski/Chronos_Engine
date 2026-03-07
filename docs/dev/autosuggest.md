# Autosuggest & Autocomplete

Chronos provides context-aware autosuggest in both the CLI and the Dashboard Terminal widget. Suggestions follow each command's expected argument order so you only see options that can actually appear at the current cursor position.

## Where It Runs

- CLI: `modules/console.py` (prompt_toolkit completer + autosuggest).
- Dashboard Terminal: `utilities/dashboard/widgets/terminal/index.js`.
- Data source: registry JSON files under `registry/`.

## Runtime Controls

- Console defaults live in `user/settings/console_settings.yml`:
  - `prompt_toolkit_default: false|true`
  - `autocomplete_enabled: true|false`
- Toggle suggestions from CLI:
  - `autocomplete on`
  - `autocomplete off`
  - `autocomplete` (status)
- One-session runtime override (Chronos syntax, no `--`):
  - `python modules/console.py prompt_toolkit:true`
  - `python modules/console.py prompt_toolkit:true autocomplete:false`

## Registry Inputs

Autosuggest depends on three registries:

- `registry/command_registry.json` (commands, aliases, usage, syntax slots).
- `registry/item_registry.json` (item types + item names).
- `registry/property_registry.json` (property keys + values from settings).

Build or refresh registries with:

```
register commands
register items
register properties
register all
```

## Syntax Slots

Each command has a `syntax` array in `command_registry.json`. Each entry describes a valid pattern:

- `slots`: positional argument order.
- `allow_properties`: whether `key:value` tokens are allowed after the slots.
- `property_keys`: optional allowlist for property keys.

Slot types (examples):

- `item_type`, `item_name`, `item_property`
- `timer_profile`
- `weekday`, `month`, `ordinal`
- `kw:<literal>` (fixed keyword)
- `choice:<a|b|c>` (one of a set)
- `choice*:<a|b|c>` (repeatable choice set)

Example:

```
{
  "slots": ["kw:profiles", "choice:list|view|save|delete"],
  "allow_properties": false
}
```

## How Syntax Is Built

The registry builder uses two inputs:

1) Manual overrides in `utilities/registry_builder.py` (`COMMAND_SYNTAX_OVERRIDES`).
2) Parsed `Usage:` lines from each command's `get_help_message()` (fallback).

If a command's suggestions look wrong, fix the `Usage:` line or add/adjust an override.

## Pipelines

Some commands pivot into another command:

- `list ... then <command ...>`
- `bulk <command ...>`

Autosuggest switches to the nested command once you reach the pipeline point.

## Theme Notes (CLI)

The CLI autosuggest uses prompt_toolkit and inherits Chronos theme colors. If the prompt looks like the default black/white, check the theme in `user/profile/profile.yml` or `user/settings/theme_settings.yml`.






