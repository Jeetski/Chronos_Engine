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

// ---- Global Vars: fetch/cache/expand ----
const Vars = (()=>{
  let cache = {};
  let lastFetch = 0;
  const MIN_INTERVAL = 1000;
  async function refresh(force=false){
    const now = Date.now();
    if (!force && (now - lastFetch) < MIN_INTERVAL) return cache;
    try {
      const r = await fetch((window.location.origin && !window.location.origin.startsWith('file:')? window.location.origin : 'http://127.0.0.1:7357') + '/api/vars');
      const j = await r.json();
      cache = (j && j.vars) || {};
      lastFetch = now;
    } catch {}
    return cache;
  }
  function expand(text){
    try {
      if (!text || typeof text !== 'string') return text;
      // Simple client-side expansion mirroring server fallback logic
      const m = cache || {};
      const sentinel = '\\x00AT\\x00';
      let s = text.replace(/@@/g, sentinel);
      s = s.replace(/@\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_,k)=> String(m[k] ?? ''));
      s = s.replace(/(?<![A-Za-z0-9_])@([A-Za-z_][A-Za-z0-9_]*)/g, (_,k)=> String(m[k] ?? ''));
      return s.replace(new RegExp(sentinel,'g'), '@');
    } catch { return text; }
  }
  bus.on('vars:changed', () => refresh(true));
  try { refresh(true); } catch {}
  try { window.ChronosVars = { refresh, expand, get: ()=> ({...cache}) }; } catch {}
  return { refresh, expand, get: ()=> ({...cache}) };
})();

// Expand helper: apply variable expansion to elements that opt-in via data-expand="text"
function expandIn(root){
  try {
    const expand = (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand : (s)=>s;
    const nodes = (root || document).querySelectorAll('[data-expand="text"]');
    nodes.forEach(node => {
      try {
        const raw = node.getAttribute('data-raw') || node.textContent || '';
        const out = expand(raw);
        node.textContent = out;
        if (out !== raw) node.title = `from ${raw}`;
        node.setAttribute('data-raw', raw);
      } catch {}
    });
  } catch {}
}

// Help text registry for widgets and views
const HELP_TEXT = {
  // Widgets
  Clock: 'Clock: Shows current time.',
  Notes: 'Notes: Create quick notes. Fill Title/Category/Priority/Tags/Content and click Create. Load opens from API or YAML file.',
  Status: 'Status: View and adjust indicators (energy, focus, mood, etc.).',
  Today: 'Today: View and manage today\'s schedule. Select blocks to trim, change time, cut, mark, then reschedule.',
  ItemManager: 'Item Manager: Browse, search, create, rename, delete, and edit items.',
  Timer: 'Timer: Start, pause, resume, stop timers; choose profiles; view status.',
  GoalTracker: 'Goals: View goal summaries and details.',
  HabitTracker: 'Habits: Snapshot of habits, streaks, and today\'s status.',
  DebugConsole: 'Debug: Inspect/debug data and actions.',
  Settings: 'Settings: View and edit YAML files under User/Settings via API.',
  Profile: 'Profile: View/Edit profile (nickname, theme, etc.).',
  Journal: 'Journal: Create/edit Journal or Dream entries. Autosaves; use Type/Date/Tags; Dream fields (lucid, signs, sleep) appear for dream type.',
  Review: 'Review: Generate Daily/Weekly/Monthly reviews, open paths, and export Markdown.',
  Terminal: 'Terminal: Run CLI commands inside the dashboard. Supports greeting, theme, history.',
  Variables: 'Variables: View and edit global @vars used across the dashboard and CLI.',
  // Views
  Calendar: 'Calendar View: Timeline of scheduled blocks. Use zoom/level controls and toolstrip to navigate and manage.',
  TemplateBuilder: 'Template Builder: Build templates via drag & drop. Indent/outdent to nest. Toggle Sequential/Parallel; Save to persist.'
};

function insertHelpIntoWidget(el, name){
  try {
    if (!el || !name) return;
    const header = el.querySelector('.header');
    const controls = header ? header.querySelector('.controls') : null;
    if (!header || !controls) return;
    if (header.querySelector('.help-btn')) return; // avoid duplicates
    const btn = document.createElement('button');
    btn.className = 'icon-btn help-btn';
    btn.textContent = '?';
    btn.title = HELP_TEXT[name] || `${name}: No help available.`;
    // Insert to the left of controls (at its start)
    controls.parentElement.insertBefore(btn, controls);
  } catch {}
}

function insertHelpIntoView(el, name){
  try {
    if (!el || !name) return;
    // Avoid duplicate
    if (el.querySelector('.view-help-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'icon-btn view-help-btn';
    btn.textContent = '?';
    btn.title = HELP_TEXT[name] || `${name}: No help available.`;
    // Position top-right but leave space for any existing overlay controls
    btn.style.position = 'absolute';
    btn.style.top = '10px';
    btn.style.right = '10px';
    btn.style.zIndex = '12';
    el.appendChild(btn);
  } catch {}
}

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
      // Inject help button
      insertHelpIntoWidget(el, name);
      // Apply variable expansion to eligible nodes
      try { expandIn(el); } catch {}
    } else {
      const msg = `Widget '${name}' has no mount()`;
      console.warn(`[Chronos][runtime] ${msg}`);
      el.textContent = msg;
    }
  } catch (e) {
    console.error(`[Chronos][runtime] Failed to load widget '${name}':`, e);
    el.textContent = `Failed to load widget '${name}': ${e}`;
  }
  // Ensure resizers are available for this widget
  try { installWidgetResizers(el); installWidgetDrag(el); ensureInViewport(el); } catch {}
}

export async function mountView(el, name) {
  const id = el.id || '(anon)';
  console.log(`[Chronos][runtime] Mounting view '${name}' into #${id}`);
  try {
    try { el.innerHTML = ''; } catch {}
    const modUrl = new URL(`../Views/${name}/index.js`, import.meta.url);
    const mod = await import(modUrl);
    if (mod && typeof mod.mount === 'function') {
      const api = mod.mount(el, context) || {};
      el.__view = { name, api };
      console.log(`[Chronos][runtime] Mounted view '${name}'`);
      // Inject help button for views
      insertHelpIntoView(el, name);
      // Apply variable expansion to eligible nodes
      try { expandIn(el); } catch {}
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
  // Install resizers on any existing widget
  try { document.querySelectorAll('.widget').forEach(el => { installWidgetResizers(el); installWidgetDrag(el); ensureInViewport(el); }); } catch {}
  try { window.addEventListener('resize', ()=> document.querySelectorAll('.widget').forEach(el => ensureInViewport(el))); } catch {}
  // Listen for vars changes to re-expand displayed text
  try { bus.on('vars:changed', ()=> { try { expandIn(document); } catch {} }); } catch {}
});

// ---- Generic widget resizers (E, S, SE) ----
function installWidgetResizers(el){
  if (!el || !el.classList || !el.classList.contains('widget')) return;
  // Capture initial size as per-widget minimums (only once)
  try {
    if (!el.__minSizeSet) {
      const r0 = el.getBoundingClientRect();
      el.__minW = Math.max(180, Math.floor(r0.width));
      el.__minH = Math.max(140, Math.floor(r0.height));
      el.__minSizeSet = true;
    }
  } catch {}
  // Avoid duplicate resizers
  const hasResizers = el.querySelector('.resizer.e') || el.querySelector('.resizer.s') || el.querySelector('.resizer.se');
  if (!hasResizers) {
    const re = document.createElement('div'); re.className = 'resizer e'; el.appendChild(re);
    const rs = document.createElement('div'); rs.className = 'resizer s'; el.appendChild(rs);
    const rse = document.createElement('div'); rse.className = 'resizer se'; el.appendChild(rse);
  }
  const re = el.querySelector('.resizer.e');
  const rs = el.querySelector('.resizer.s');
  const rse = el.querySelector('.resizer.se');
  function edgeDrag(startRect, cb){
    return (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      function move(e){ cb(e, startRect); }
      function up(){ window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    };
  }
  if (re && !re.__wired){
    re.__wired = true;
    re.addEventListener('pointerdown', (ev)=> edgeDrag(el.getBoundingClientRect(), (e, r)=>{
      const minW = Number(el.__minW || 280);
      el.style.width = Math.max(minW, r.width + (e.clientX - r.right)) + 'px';
    })(ev));
  }
  if (rs && !rs.__wired){
    rs.__wired = true;
    rs.addEventListener('pointerdown', (ev)=> edgeDrag(el.getBoundingClientRect(), (e, r)=>{
      const minH = Number(el.__minH || 160);
      el.style.height = Math.max(minH, r.height + (e.clientY - r.bottom)) + 'px';
    })(ev));
  }
  if (rse && !rse.__wired){
    rse.__wired = true;
    rse.addEventListener('pointerdown', (ev)=> edgeDrag(el.getBoundingClientRect(), (e, r)=>{
      const minW = Number(el.__minW || 280);
      const minH = Number(el.__minH || 160);
      el.style.width = Math.max(minW, r.width + (e.clientX - r.right)) + 'px';
      el.style.height = Math.max(minH, r.height + (e.clientY - r.bottom)) + 'px';
    })(ev));
  }
}

function ensureInViewport(el){
  if (!el || el.style.display==='none') return;
  try {
    const rect = el.getBoundingClientRect();
    const pad = 20;
    let top = rect.top;
    if (rect.bottom > (window.innerHeight - pad)) {
      top = Math.max(48, window.innerHeight - rect.height - pad);
    }
    if (rect.top < 48) {
      top = 48;
    }
    // Only adjust top to avoid conflicting with right-positioned widgets
    el.style.top = Math.round(top) + 'px';
  } catch {}
}

// expose for other scripts
try { window.installWidgetResizers = installWidgetResizers; window.ensureWidgetInView = ensureInViewport; } catch {}

// ---- Generic widget header dragging ----
function installWidgetDrag(el){
  if (!el || !el.classList || !el.classList.contains('widget')) return;
  const header = el.querySelector('.header');
  if (!header || header.__dragWired) return;
  header.__dragWired = true;
  header.addEventListener('pointerdown', (ev)=>{
    // Only left button
    if (ev.button !== 0) return;
    ev.preventDefault(); ev.stopPropagation();
    const rect = el.getBoundingClientRect();
    const offX = ev.clientX - rect.left;
    const offY = ev.clientY - rect.top;
    function move(e){
      el.style.left = Math.round(e.clientX - offX) + 'px';
      el.style.top = Math.round(e.clientY - offY) + 'px';
    }
    function up(){
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // Clamp into view after drop
      try { ensureInViewport(el); } catch {}
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}
