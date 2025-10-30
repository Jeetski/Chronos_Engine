// Minimal runtime to mount views and widgets as vanilla ES modules

function createBus() {
  const listeners = new Map();
  return {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
    emit(event, data) {
      const set = listeners.get(event);
      if (set) for (const fn of Array.from(set)) try { fn(data); } catch {}
    }
  };
}

const bus = createBus();
const context = { bus };

export async function mountWidget(el, name) {
  const id = el.id || '(anon)';
  console.log(`[Chronos][runtime] Mounting widget '${name}' into #${id}`);
  try {
    const modUrl = new URL(`../Widgets/${name}/index.js`, import.meta.url);
    const mod = await import(modUrl);
    if (mod && typeof mod.mount === 'function') {
      const api = mod.mount(el, context) || {};
      el.__widget = { name, api };
      console.log(`[Chronos][runtime] Mounted widget '${name}'`);
    } else {
      const msg = `Widget '${name}' has no mount()`;
      console.warn(`[Chronos][runtime] ${msg}`);
      el.textContent = msg;
    }
  } catch (e) {
    console.error(`[Chronos][runtime] Failed to load widget '${name}':`, e);
    el.textContent = `Failed to load widget '${name}': ${e}`;
  }
}

export async function mountView(el, name) {
  const id = el.id || '(anon)';
  console.log(`[Chronos][runtime] Mounting view '${name}' into #${id}`);
  try {
    const modUrl = new URL(`../Views/${name}/index.js`, import.meta.url);
    const mod = await import(modUrl);
    if (mod && typeof mod.mount === 'function') {
      const api = mod.mount(el, context) || {};
      el.__view = { name, api };
      console.log(`[Chronos][runtime] Mounted view '${name}'`);
    } else {
      const msg = `View '${name}' has no mount()`;
      console.warn(`[Chronos][runtime] ${msg}`);
      el.textContent = msg;
    }
  } catch (e) {
    console.error(`[Chronos][runtime] Failed to load view '${name}':`, e);
    el.textContent = `Failed to load view '${name}': ${e}`;
  }
}

function ready(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
  else fn();
}

ready(() => {
  // Mount widgets
  document.querySelectorAll('[data-widget]').forEach(el => {
    const name = el.getAttribute('data-widget');
    mountWidget(el, name);
  });
  // Mount views
  document.querySelectorAll('[data-view]').forEach(el => {
    const name = el.getAttribute('data-view');
    mountView(el, name);
  });
  // Floating panel collapse toggles (optional)
  const collapseLeftBtn = document.getElementById('collapseLeft');
  const collapseRightBtn = document.getElementById('collapseRight');
  if (collapseLeftBtn) collapseLeftBtn.addEventListener('click', () => document.getElementById('left')?.classList.toggle('collapsed'));
  if (collapseRightBtn) collapseRightBtn.addEventListener('click', () => document.getElementById('right')?.classList.toggle('collapsed'));
});
