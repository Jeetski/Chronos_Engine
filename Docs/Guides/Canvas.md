# Canvas Guide (Constellations)

The Canvas view is a realtime, board-style workspace inside the Dashboard. It is powered by YAML-backed `canvas_board` items, so agents can read/write the same board data as humans and keep state synchronized.

## What the Canvas is

- Infinite board with nodes, connections, ink strokes, and media.
- Boards are stored as YAML items under `User/Canvas_Boards/`.
- The Dashboard uses `/api/item` and `/api/items?type=canvas_board` to load/save.

## Data model (stored in YAML)

Each board is a `canvas_board` item with this shape:

```yaml
type: canvas_board
name: My Constellation
viewport:
  panX: 320
  panY: 210
  zoom: 1.05
nodes:
  - id: node_1733512345123_472
    type: task
    title: TASK: Ship v1
    content: Linked item.
    x: 480
    y: 280
    width: 260
    height: 180
    ref:
      type: task
      name: Ship v1
    media: null
connections:
  - from: node_1733512345123_472
    to: node_1733512345999_021
ink:
  - points:
      - [120, 240]
      - [160, 260]
```

Notes:
- `ref` links a node to a Chronos item. The Canvas "Open" button calls `edit <type> <name>`.
- `media` holds image info for media nodes (stored as data URLs today).
- Positions are in world coordinates; the viewport is used to restore pan/zoom.

## Controls (current)

- Tools: Select, Pan, Sticky, Text, Draw, Connect, Media.
- Shift-click toggles multi-select; drag to move group.
- Drag on empty space (Select tool) to box-select.
- Resize handle on nodes; Alt disables snapping; Shift keeps aspect ratio.
- Shortcuts: `V/H/N/T/P/L/M`, `Space` (pan), `Ctrl+A` select all, `Ctrl+C/V` copy/paste, `Ctrl+D` duplicate, arrows nudge.

## How agents should read the Canvas

1) List boards: `GET /api/items?type=canvas_board`.
2) Read a board: `GET /api/item?type=canvas_board&name=<name>`.
3) Interpret `nodes`, `connections`, `ink`, and `media` to reconstruct the board.
4) If you update the board, write the full payload back with:
   - `POST /api/item` and `{ type, name, content: <payload> }`.

## Collaboration intent

The Canvas is designed to be a shared whiteboard between humans and agents. Agents should treat it as a live workspace: read the board before suggesting actions, and write updates when changes are agreed. Future collaboration mode will add multi-user merges and conflict resolution, but the data model will stay YAML-first.

## Link (MVP)

Link is a minimal peer-to-peer canvas sync for a single board.

Behavior
- Polling sync (last-write-wins) between two peers.
- Uses board metadata fields: `link_rev`, `link_updated_at`, `link_updated_by`.
- No cursors, diffs, or chat in MVP.

Sharing
- Use the Canvas Invite button to generate a Link URL + token.
- Use the Link widget to connect to a peer and sync a board.
