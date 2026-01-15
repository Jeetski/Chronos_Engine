# Cockpit & Panels Guide

The Cockpit is the dashboard’s drag-and-drop canvas for live panels. It shares state with the CLI and other widgets, so actions are immediate and consistent.

## Layout & Controls

- Open via the dashboard (Panels dropdown). Panels spawn onto the grid and can be dragged/resized.
- Pan by dragging empty space; zoom with Ctrl + scroll or the floating controls.
- State persists in the browser (`chronos_cockpit_panels_v1`), including positions, sizes, and last configs per panel instance.
- Keyboard: Esc clears selection; double-click header focuses the panel.
- Focusing a panel flashes its outline; if it's offscreen, the view recenters it.

## Panels (current)

- **Schedule** - Live agenda tree; respects today's schedule and updates after CLI changes.
- **Matrix** - Pivot-style grid fed by `chronos_matrix.db`; supports presets and filtering.
- **Matrix Visuals** - Visual take on Matrix data (charts/heatmaps where available).
- **Lists** - Ad-hoc `/api/items` queries for pinning "due soon", "blocked", etc.
- **Deadlines** - Read-only list of deadlines and due dates with filters and range controls.
- **Commitments** - Snapshot of rules, violations, on-track counts; evaluate via `/api/cli commitments check`.
- **Map of Happiness** - Reads `User/Settings/map_of_happiness.yml`; shows coverage/satisfaction.
- **Status Strip** - Horizontal ticker of status indicators, color-coded by priority.

## Data Sources

- Panels rely on dashboard APIs (`Utilities/Dashboard/server.py`) which in turn use mirrors from `sequence` where possible (`chronos_matrix.db`, `chronos_core.db`, etc.).
- If data looks stale, run `sequence sync matrix` or `sequence sync` in the CLI, or refresh the browser after a listener-led nightly sync.

## Common Workflows

- Daily ops: keep Schedule and Status Strip visible; use Lists for “today + high priority” pins.
- Planning: Matrix/Matrix Visuals to spot status vs. item type gaps; Commitments to catch misses.
- Wellbeing: Map of Happiness to balance needs; pair with Schedule to slot recovery blocks.

## Troubleshooting

- Missing panels: clear localStorage key `chronos_cockpit_panels_v1` and reload.
- Stale data: run `sequence sync matrix` (or `sequence sync`) then hard-refresh.
- API errors: check console logs in the browser dev tools and `Utilities/Dashboard/server.py` output.

## Extending

- Panels live in `Utilities/Dashboard/Panels/<Name>/` and register via `window.__cockpitPanelRegister` in `Utilities/Dashboard/Views/Cockpit/`.
- For new panels, expose minimal GET/POST endpoints in `server.py` and reuse matrix/core mirrors when possible.
