# Settings and Environment

Settings file
- `<temp>/ADUC/settings.json`

Common keys
- `include_memory`: include recent `memory.json` entries in merged prompts.
- `immersive`: include `docs/lore.md` in merged prompts.
- `nsfw_enabled`, `quiet_hours`, `daily_nsfw_cap`: safety controls.

Env vars
- `ADUC_CONV_PATH`: conversation JSON path.
- `ADUC_PROJECT_PATH`: working directory for agent runs.
- `ADUC_IMMERSIVE=1`: force immersive lore.
- `ADUC_INCLUDE_MEMORY=1`: force memory inclusion.
- `ADUC_CODEX_ARGS`, `ADUC_CODEX_TIMEOUT`: CLI bridge behavior.
