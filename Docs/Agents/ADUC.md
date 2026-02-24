# ADUC (Agents Dress Up Committee)

ADUC is a local, visual interface for "Familiars"—AI personas that can assist you with your day. It is included in the Chronos Engine repository as a standalone tool that integrates deeply with the Chronos workflow.

## What is it?

ADUC (`Agents Dress Up Committee/`) allows you to chat with AI agents that have:
- **Visual Avatars**: Images that change state based on emotion (e.g., Focus, Happy, Thinking).
- **Persistent Memory**: Opt-in memory files for tracking context.
- **Cycle Awareness**: They know if you are in a "Focus" or "Break" cycle and adjust their tone accordingly.

## Integration with Chronos

While ADUC can act as a general-purpose chat UI, it is designed to be the "Face" of the Chronos Engine when running in **Pilot Mode**.

### 1. The `aduc` Command
Running `aduc` from the Chronos CLI (or `ADUC_launcher.bat` from Windows) launches the application in a special mode. 

It automatically:
- Sets environment variables pointing to your Chronos User data.
- Injects the **Chronos Agent Guide** (`Docs/Agents/agents.md`) into the Familiar's prompt.
- Injects your **Pilot Brief** (`User/Profile/pilot_brief.md`) and **Preferences**.

This turns a generic AI assistant into "Nia" (or your preferred pilot), capable of running CLI commands and managing your schedule via the CLI Bridge.

### 2. The CLI Bridge
ADUC writes user messages to a shared `conversation.json` file. 
- You run your AI agent (e.g. using a `codex` script or similar) to "watch" this file.
- The agent reads the conversation, executes Chronos commands if requested (e.g., "Reschedule my day"), and writes the logical response back to ADUC.
- ADUC displays the response and updates the avatar.

## Documentation

Comprehensive documentation for configuring, extending, and running ADUC is located in its own directory:

- **Quick Start**: [README.md](../../Agents%20Dress%20Up%20Committee/README.md)
- **Agent Integration**: [AGENTS.md](../../Agents%20Dress%20Up%20Committee/docs/agents/AGENTS.md)
- **Full Docs**: [Agents Dress Up Committee/docs/](../../Agents%20Dress%20Up%20Committee/docs/index.md)
