# Gadgets & Dock Guide

Chronos Dashboard includes a bottom dock for quick actions. The dock is populated by **gadgets** (small modules discovered from `utilities/dashboard/gadgets/`).

This guide covers daily use and developer extension points.

---

## What the Dock Is

- A bottom-center action bar (`#chronosDock`) with a reveal hotzone (`#dockHotzone`).
- A host for lightweight gadgets that can run quick actions without opening full widgets.
- Controlled from the topbar **Gadgets** menu (enable/disable per gadget).

---

## Using the Dock

### Reveal Behavior

- Move your pointer near the bottom edge of the window (or over the hotzone) to reveal the dock.
- If the dock is not pinned, it auto-hides after pointer leave.
- The dock remembers pin state in local storage:
  - `chronos_dashboard_dock_docked_v1`

### Pin / Unpin

- Click empty space in the dock shell background to toggle pinned mode.
- Pinned mode keeps the dock visible.

### Enable / Disable Gadgets

- Open topbar: **Gadgets**.
- Click a gadget row to toggle it on/off in the dock.
- Disabled gadget list is stored in local storage:
  - `chronos_dashboard_disabled_gadgets_v1`

---

## Built-In Gadgets

As of March 2026, three gadgets ship by default.

### 1. Timer Gadget

Location: `utilities/dashboard/gadgets/timer/`

Behavior:
- Shows countdown (`MM:SS`) and circular progress ring.
- Polls timer status every second (`GET /api/timer/status`).
- Uses default timer profile from:
  - `GET /api/timer/settings`
  - `GET /api/timer/profiles`
- Supports:
  - Start/Stop (`POST /api/timer/start`, `POST /api/timer/stop`)
  - Pause/Resume (`POST /api/timer/pause`, `POST /api/timer/resume`)
  - Completion confirmation (`POST /api/timer/confirm`)
- Single-click timer pin toggles its mini-menu.
- Double-click timer pin opens/focuses the full Timer widget (`timer:show` bus event).
- When timer confirmation is pending, the gadget forces dock reveal and pinning.

### 2. Reschedule Gadget

Location: `utilities/dashboard/gadgets/reschedule/`

Behavior:
- One-click button to run `today reschedule`.
- Executes through CLI bridge:
  - `POST /api/cli` with `{ command: "today", args: ["reschedule"] }`
- Reloads Calendar today view after success.

### 3. Progress Gauge Gadget

Location: `utilities/dashboard/gadgets/progress_gauge/`

Behavior:
- Shows a compact circular progress ring in the dock.
- Supports:
  - countdown to a target date
  - numeric progress against a target
  - item-backed numeric properties via `GET /api/item`
- Click opens an inline editor/menu.
- Refreshes automatically on a short interval and can be refreshed manually.

---

## Gadget Registry & Discovery

- Server endpoint:
  - `GET /api/registry?name=gadgets`
- Registry builder scans:
  - `utilities/dashboard/gadgets/<Name>/`
- Discovery defaults:
  - `id`: lowercase folder name
  - `label`: folder name split by PascalCase
  - `module`: folder name
  - `enabled`: `true`
  - `order`: `100`
- Optional `gadget.yml` overrides defaults.

Example metadata (`gadget.yml`):

```yaml
label: "Timer"
module: "Timer"
enabled: true
order: 10
```

---

## Creating a Custom Gadget

### Required Structure

```text
utilities/dashboard/gadgets/
  MyGadget/
    index.js
    gadget.yml   # optional
```

### Required Export

`index.js` must export:

```javascript
export function mount(el, context) {
  // render gadget UI into el
}
```

`mount` can optionally return an API object (for example, a `destroy()` function).

### Runtime Context

Gadgets receive runtime context from `core/runtime.js` and `app.js`, including:

- `bus`: shared Chronos event bus (`window.ChronosBus`)
- `apiBase()`: helper for base dashboard URL
- `showToast(message, tone)`: dock toast helper (`info|success|error`)
- `gadget`: registry metadata for the current gadget
- Standard runtime helpers from shared context (`getHelpText`, `createHelpButton`, etc.)

### Minimal Example

```javascript
export function mount(el, context = {}) {
  const apiBase = typeof context.apiBase === 'function' ? context.apiBase : () => '';
  const toast = typeof context.showToast === 'function' ? context.showToast : () => {};

  el.innerHTML = `<button class="dock-pin" type="button">Ping</button>`;
  const btn = el.querySelector('button');

  const onClick = async () => {
    try {
      const r = await fetch(apiBase() + '/health');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast('Dashboard is healthy.', 'success');
    } catch (e) {
      toast(`Health check failed: ${String(e.message || e)}`, 'error');
    }
  };

  btn?.addEventListener('click', onClick);
  return {
    destroy() {
      btn?.removeEventListener('click', onClick);
    },
  };
}
```

---

## Troubleshooting

- Dock does not appear:
  - Move pointer to bottom 26-28px of window.
  - Verify at least one gadget is enabled in the **Gadgets** menu.
- Gadget does not appear:
  - Confirm folder path is `utilities/dashboard/gadgets/<Name>/`.
  - Confirm `index.js` exports `mount`.
  - Check browser dev tools console for import/mount errors.
- Registry looks stale:
  - Hard-refresh dashboard (`Ctrl+Shift+R`).
  - Optionally clear registry cache via admin tools (`clear registry:...`) and reload.





