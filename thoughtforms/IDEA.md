# Thoughtforms

Working concept document for the `thoughtforms` prototype.

This file is intentionally a living spec. It should keep both:
- raw notes from the ongoing conversation
- progressively cleaner product thinking

## Current Raw Idea

The product is basically a canvas in a browser.

The user can:
- chat with an AI agent
- see live things happening on the screen
- have content appear visually as the AI works
- paste in whiteboard-style content
- work in a way that feels closer to tools like Miro or ClickUp than a normal chatbot

## Working Vision

Thoughtforms is a browser-based spatial thinking canvas where conversation and visual structure happen in the same place.

Instead of:
- a chat app on one side
- a separate whiteboard or doc on the other side

The core idea is:
- you talk to the AI inside the canvas
- the AI can create, place, connect, and update visible objects on the canvas
- the canvas becomes the shared thinking surface between the user and the agent

## Direction Shift

Thoughtforms is not just a one-off prototype.

It may become part of a longer migration path for Chronos:
- Python remains the backend and engine layer
- browser UI becomes the long-term primary surface
- new frontend work should move toward TypeScript
- Chronos should slowly modernize without forcing a full rewrite right now

This is explicitly a gradual migration, not a same-day rewrite.

## Early Product Pillars

### 1. Spatial conversation

Chat is not separate from the workspace. The conversation should influence the canvas directly.

### 2. Live visible reasoning

The user should see things appear, move, organize, or evolve on the screen while the AI is helping.

### 3. Paste-first creativity

The user should be able to paste ideas, notes, links, or whiteboard-like fragments into the canvas and have them become workable objects.

### 4. Whiteboard feel

The experience should feel closer to a creative visual workspace than to a static document editor.

### 5. Reuse Chronos instead of replacing it

Thoughtforms should reuse as much Chronos logic and data as possible instead of creating an entirely separate system.

### 6. Modular architecture

The system should be organized so the engine, agent skills, DSL, API, and frontend canvas can evolve independently.

## First Known Capabilities

Potentially needed:
- infinite or large pan-and-zoom canvas
- draggable objects
- AI chat panel or embedded chat surface
- AI-generated objects appearing on the canvas
- support for pasted text blocks and loose notes
- support for grouping / clustering / connecting ideas

## Architectural Assumptions

Current working assumptions:
- Python is the backend and engine
- JavaScript / TypeScript is the frontend
- existing Chronos API and dashboard infrastructure should be reused
- Thoughtforms should probably begin life as a new dashboard view

This implies:
- avoid designing Thoughtforms as a standalone frontend app first
- avoid rewriting Chronos engine logic into frontend code
- prefer adding API-backed browser features incrementally

## Agent Skill Structure

The project should support agent-specific instruction documents.

Requested structure direction:
- `docs/agents/skills/<skillname>/*.md`

Purpose:
- these files serve as instructions for AI agents
- Thoughtforms-specific skills can live alongside or within the broader Chronos agent skill system

Open detail:
- whether to stay compatible with the current single-file convention (`skill.md`) or move to multi-file skill folders with supporting docs

## DSL Direction

Thoughtforms should have a DSL for canvas operations available through the CLI.

Rough idea:
- there is a whiteboard language
- it can be executed or interpreted through Chronos CLI flows
- it describes actions that can happen on the whiteboard / canvas

Examples of what the DSL may eventually express:
- create nodes
- move nodes
- connect nodes
- group items
- paste/import content
- invoke agent actions on a selected region or object set

This should likely integrate with existing Chronos command patterns instead of becoming an isolated scripting island.

## Dashboard Integration Direction

Thoughtforms should probably be implemented as:
- a new dashboard view

Why this fits:
- Chronos already has a dashboard runtime
- Chronos already has an API layer
- Chronos already has a plugin/view/widget mental model
- this keeps the first implementation close to the current product instead of fragmenting it

## Frontend Modernization Direction

Long-term modernization ideas mentioned:
- migrate new frontend work toward TypeScript
- gradually evolve the dashboard into a more browser-native product
- potentially adopt a more modern UI architecture later
- make alpha-gate stricter and cleaner as part of modernization

Important constraint:
- modernization should be gradual
- do not attempt a full React/Next/RSC rewrite immediately
- preserve working Chronos behavior while replacing surfaces incrementally

## Migration Principle

Preferred migration order:
1. keep Python as the source of truth for engine behavior
2. build new browser-facing surfaces on top of the existing API
3. introduce TypeScript for new frontend modules
4. only rewrite old frontend modules when there is a clear product reason
5. defer any full framework migration until Thoughtforms and dashboard patterns are stable

## Open Questions

These need clarification as the idea develops:
- What are the primary object types on the canvas?
- Is the chat always visible, or does it live as an object on the canvas?
- What does "live things" mean in concrete UI terms?
- Should pasted content stay raw, or auto-convert into cards/nodes?
- Is this more for brainstorming, planning, worldbuilding, research, or all of the above?
- What is the minimum first prototype that proves the idea?
- What should the first Thoughtforms DSL commands be?
- How much of the current dashboard should be reused directly versus wrapped and replaced?
- When TypeScript starts, do we compile just the new view or begin introducing a shared frontend toolchain?
- What should alpha-gate look like in a browser-first future Chronos?

## Notes From Conversation

### 2026-03-31

Initial framing from user:
- "It's basically a canvas."
- "Imagine a canvas in a browser where you chat with the AI agent."
- "See live kind of things, and stuff appears on the screen."
- "You can also paste stuff like whiteboards like Miro.com or ClickUp.com stuff."

Additional direction from user:
- make it modular with appropriate folders
- use agent skill docs under `docs/agents/skills/...`
- introduce a DSL for whiteboard actions through the CLI
- reuse a lot of Chronos
- likely make it a new dashboard view
- start migrating toward TypeScript
- keep Python as backend/engine and JS/TS as frontend
- slowly migrate Chronos toward a browser-based product over time
- modernize the UI and possibly adopt stricter alpha-gate behavior later

## Prototype Direction

Not decided yet.

Likely next step:
1. keep capturing the idea in detail
2. identify the core interaction loop
3. define the smallest prototype worth building
