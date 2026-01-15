# Directory Structure

Repo root (key paths)
- `server.py`: Flask backend.
- `ADUC.html`: minimal UI shell.
- `static/`: UI assets (JS/CSS).
- `tools/`: CLI bridge watcher and helpers.
- `docs/`: modular documentation.
- `familiars/<name>/`: per-familiar state and assets.

Familiar folder layout
- `meta.json`: identity, UI traits, allowed emotions.
- `state.json`: current emotion, hearts, avatar, location.
- `profile.json`: user profile and consent flags.
- `memory.json`: opt-in memory store (only write on explicit request).
- `skills.yml`: model/tool preferences (optional).
- `avatar/`: avatar images and `avatars.md` catalogs.
- `docs/`: all persona docs (agent, personality, lore, etc.).

Familiar docs layout (`familiars/<name>/docs/`)
- `agent.md`: functional role.
- `personality.md`: tone and boundaries.
- `coding.md`: optional coding playbook.
- `greet.md`: optional first-run greeting.
- `lore.md`: immersive background (optional).
- `preferences.md`: user preferences for behavior.
- `memories.md`: permanent facts about the user.
- `chronos.md`: Chronos pilot protocol (optional).
- `affection.md`: familiar-specific hearts rules (optional).
- `outfits.md`: outfit registry and avatar references (optional).
- `locations.md`: available backgrounds (optional).
- `backgrounds.md`: background catalog for the server (optional).
