# CLI Bridge

The CLI bridge lets external agents reply through a shared JSON file.

Paths
- Folder: `<os temp>/ADUC/`
- File: `<os temp>/ADUC/conversation.json`
- Env: `ADUC_CONV_PATH` (set by launchers)

Flow
1) Backend appends a `role: "user"` turn with `status: "pending"`.
2) CLI agent appends a `role: "cli"` turn with `in_reply_to`.
3) UI displays the reply and updates the avatar from the tag.

Rules
- Keep writes atomic (read -> modify -> write).
- Reply text must end with `<avatar: ...>`.

See also: `docs/agents/AGENTS.md` for the full schema.
