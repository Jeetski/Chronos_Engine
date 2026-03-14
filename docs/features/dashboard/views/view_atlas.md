# Atlas View

## Overview
Structural graph view for exploring Chronos items and their relationships as a ring-based network centered on a hub or selected node.

## CLI
- Related command patterns: `list`, `view`, `track`, `filter`, `find`.
- Primary syntax reference: `docs/reference/cli_commands.md`.
- Atlas is read-first; use CLI or existing editors for deterministic writes.

## Dashboard
- Runtime source: `utilities/dashboard/views/atlas/`
- Atlas should remain consistent with dashboard API contracts and item semantics.
- API endpoints used by this view:
  - `/api/graph`
  - `/api/editor/open-request`

## Interaction Model
1. Atlas loads the highest-scoring hub node as the default center.
2. Nodes render in concentric rings based on the active lens.
3. `Directness` colors nodes by structural distance from the focused node.
4. `Dependency` colors nodes by dependency-path distance where available.
5. Search accepts plain text or `property:value` queries.
6. Type and status filters narrow the visible graph without turning the view into an editor.

## Inspector
- Shows selected item identity, local metrics, current lens explanation, and parsed key/value YAML fields.
- `Open item` delegates to the editor open-request flow for the backing YAML file when present.

## Validation
1. Open `Atlas` from dashboard navigation.
2. Confirm `/api/graph` loads and a default center is selected.
3. Recenter on several nodes and switch between `Directness` and `Dependency`.
4. Test plain-text search and `property:value` search.
5. Verify inspector updates and editor open requests succeed for real nodes.

## Related Docs
- `docs/guides/dashboard.md`
- `docs/reference/dashboard_api.md`
- `docs/reference/cli_commands.md`
