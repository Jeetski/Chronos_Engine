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
      if (set) for (const fn of Array.from(set)) try { fn(data); } catch { }
    }
  };
}

const bus = createBus();
const context = { bus, getHelpText: getHelpTip, createHelpButton, attachHelpButton };
try { window.ChronosBus = bus; } catch { }
try { window.ChronosHelp = { get: getHelpTip, create: createHelpButton, attach: attachHelpButton }; } catch { }
let widgetZCounter = 10;
const WIZARD_BASE_STYLE_ID = 'chronos-wizard-base-style';

function injectWizardBaseStyles() {
  if (document.getElementById(WIZARD_BASE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = WIZARD_BASE_STYLE_ID;
  style.textContent = `
    .chronos-wizard-overlay {
      position: fixed;
      inset: 0;
      z-index: 1200;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--chronos-overlay-gradient, rgba(8,10,16,0.85));
      backdrop-filter: var(--chronos-overlay-blur, blur(10px));
      padding: clamp(16px, 3vw, 32px);
    }
    .chronos-wizard-shell {
      width: min(1000px, 96vw);
      max-height: 94vh;
      background: linear-gradient(180deg, var(--chronos-surface-strong, rgba(15,19,30,0.98)), rgba(8,10,16,0.95));
      border: 1px solid rgba(122,162,247,0.22);
      border-radius: 22px;
      box-shadow: 0 30px 90px rgba(0,0,0,0.65);
      color: var(--chronos-text, #e6e8ef);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: clamp(18px, 3vw, 28px);
      position: relative;
    }
    .chronos-wizard-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .chronos-wizard-stepper {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .chronos-wizard-body {
      flex: 1 1 auto;
      overflow: auto;
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 20px;
      background: rgba(7,9,15,0.65);
      min-height: 0;
    }
    .chronos-wizard-footer {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    .chronos-wizard-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .chronos-wizard-actions button {
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      padding: 10px 18px;
      font-size: 15px;
      background: rgba(10,13,22,0.9);
      color: inherit;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .chronos-wizard-actions button.primary {
      background: var(--chronos-accent-gradient, linear-gradient(135deg, #6b8cff, #7aa2f7));
      border-color: rgba(122,162,247,0.6);
      color: #fff;
      box-shadow: var(--chronos-accent-glow, 0 10px 24px rgba(74,98,255,0.45));
    }
    .chronos-wizard-actions button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    .chronos-wizard-status {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
      color: var(--chronos-text-muted, #9aa4b7);
    }
  `;
  document.head.appendChild(style);
}

try { injectWizardBaseStyles(); } catch { }

// ---- Global Vars: fetch/cache/expand ----
const Vars = (() => {
  let cache = {};
  let lastFetch = 0;
  const MIN_INTERVAL = 1000;
  async function refresh(force = false) {
    const now = Date.now();
    if (!force && (now - lastFetch) < MIN_INTERVAL) return cache;
    try {
      const r = await fetch((window.location.origin && !window.location.origin.startsWith('file:') ? window.location.origin : 'http://127.0.0.1:7357') + '/api/vars');
      const j = await r.json();
      cache = (j && j.vars) || {};
      lastFetch = now;
    } catch { }
    return cache;
  }
  function expand(text) {
    try {
      if (!text || typeof text !== 'string') return text;
      // Simple client-side expansion mirroring server fallback logic
      const m = cache || {};
      const sentinel = '\\x00AT\\x00';
      let s = text.replace(/@@/g, sentinel);
      s = s.replace(/@\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k) => String(m[k] ?? ''));
      s = s.replace(/(?<![A-Za-z0-9_])@([A-Za-z_][A-Za-z0-9_]*)/g, (_, k) => String(m[k] ?? ''));
      return s.replace(new RegExp(sentinel, 'g'), '@');
    } catch { return text; }
  }
  bus.on('vars:changed', () => refresh(true));
  try { refresh(true); } catch { }
  try { window.ChronosVars = { refresh, expand, get: () => ({ ...cache }) }; } catch { }
  return { refresh, expand, get: () => ({ ...cache }) };
})();

// Expand helper: apply variable expansion to elements that opt-in via data-expand="text"
function expandIn(root) {
  try {
    const expand = (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand : (s) => s;
    const nodes = (root || document).querySelectorAll('[data-expand="text"]');
    nodes.forEach(node => {
      try {
        const raw = node.getAttribute('data-raw') || node.textContent || '';
        const out = expand(raw);
        node.textContent = out;
        if (out !== raw) node.title = `from ${raw}`;
        node.setAttribute('data-raw', raw);
      } catch { }
    });
  } catch { }
}

// Help text registry for widgets and views
const HELP_TEXT = {
  // Widgets
  Clock: 'Clock: Shows current time.',
  Notes: 'Notes: Create quick notes. Fill Title/Category/Priority/Tags/Content and click Create. Load opens from API or YAML file.',
  StickyNotes: 'Sticky Notes: Capture Chronos note items tagged sticky, set colors, pin favorites, and spin up reminders from the dashboard.',
  Status: 'Status: View and adjust indicators (energy, focus, mood, etc.).',
  Today: 'Scheduler: Preview schedules by day and manage today\'s blocks. Select blocks to trim, change time, cut, mark, then reschedule.',
  ItemManager: 'Item Manager: Browse, search, create, rename, delete, and edit items.',
  InventoryManager: 'Inventory Manager: Inspect inventories, linked items, and tools; add/remove or copy kits without memorizing commands.',
  Timer: 'Timer: Start, pause, resume, stop timers; choose profiles; view status.',
  GoalTracker: 'Goals: View goal summaries and details.',
  Commitments: 'Commitments: Monitor frequency goals, forbidden rules, and trigger status.',
  Milestones: 'Milestones: Track milestone progress, mark completions, and review criteria.',
  HabitTracker: 'Habits: Snapshot of habits, streaks, and today\'s status.',
  DebugConsole: 'Debug: Inspect/debug data and actions.',
  Achievements: 'Achievements: Review milestones you\'ve unlocked and mark awards/archives.',
  Rewards: 'Rewards: Review point balance/history and redeem reward items.',
  MP3Player: 'MP3 Player: Spin up playlists from User/Media/MP3, shuffle or repeat tracks, and manage uploads without leaving the dashboard.',
  Settings: 'Settings: View and edit YAML files under User/Settings via API.',
  Profile: 'Profile: View/Edit profile (nickname, theme, etc.).',
  Journal: 'Journal: Create/edit Journal or Dream entries. Autosaves; use Type/Date/Tags; Dream fields (lucid, signs, sleep) appear for dream type.',
  Review: 'Review: Generate Daily/Weekly/Monthly reviews, open paths, and export Markdown.',
  Terminal: 'Terminal: Run CLI commands inside the dashboard. Supports greeting, theme, history.',
  Variables: 'Variables: View and edit global @vars used across the dashboard and CLI.',
  ResolutionTracker: 'Resolutions: Track yearly resolutions and link them to Chronos items.',
  Link: 'Link: Connect to a peer and sync a shared Canvas board (polling, last-write-wins).',
  Trends: 'Trends: View performance metrics including habits, goals, focus time, quality, and adherence stats.',
  // Views
  Calendar: 'Calendar View: Timeline of scheduled blocks. Use zoom/level controls and toolstrip to navigate and manage.',
  TemplateBuilder: 'Template Builder: Build templates via drag & drop. Indent/outdent to nest. Toggle Sequential/Parallel; Save to persist.',
  Cockpit: 'Cockpit View: Drag modular panels onto the canvas, move/resize them, and curate your personal flight deck via the Panels menu.',
  ProjectManager: 'Project Manager: Filter/search projects on the left and review summaries, milestones, and linked items in the detail pane.',
  Weekly: 'Weekly View: Scan the next 7 days at a glance, sourced from schedule previews.',
  Docs: 'Docs View: Browse the Docs tree, search content, and read files without leaving the dashboard.',
  ADUC: 'ADUC View: Launches ADUC (Chronos mode) and embeds it in a dashboard iframe.',
  // Panels
  schedule: 'Schedule Panel: Mirrors today\'s agenda, lets you refresh/reschedule, jump dates, and kick off the Chronos day timer.',
  matrix: 'Matrix Panel: Interactive pivot grid for Chronos data. Choose rows/cols/values/filters, save presets, and spawn additional panels.',
  'matrix-visuals': 'Matrix Visuals Panel: Render charts/heatmaps from Matrix presets to spot trends at a glance.',
  status_strip: 'Status Strip Panel: Compact strip that color-codes your current status indicators for cockpit situational awareness.',
  checklist: 'Checklist Panel: Manage checklists with quick add/remove and detail views.',
  commitments: 'Commitments Panel: Snapshot of commitment rules, progress, and evaluation status.',
  deadlines: 'Deadlines Panel: Read-only list of upcoming deadlines and due dates with filters.',
  flashcards: 'Flashcards Panel: Review study cards and track progress.',
  lists: 'Lists Panel: Pin and run saved list queries as cockpit panels.',
  'map-of-happiness': 'Map of Happiness Panel: Summarizes needs coverage from map_of_happiness.yml.',
  'random-picker': 'Random Picker Panel: Pull a random item from saved pools.',
  Checklist: 'Checklist Panel: Manage checklists with quick add/remove and detail views.',
  Commitments: 'Commitments Panel: Snapshot of commitment rules, progress, and evaluation status.',
  Deadlines: 'Deadlines Panel: Read-only list of upcoming deadlines and due dates with filters.',
  Flashcards: 'Flashcards Panel: Review study cards and track progress.',
  Lists: 'Lists Panel: Pin and run saved list queries as cockpit panels.',
  MapOfHappiness: 'Map of Happiness Panel: Summarizes needs coverage from map_of_happiness.yml.',
  Matrix: 'Matrix Panel: Interactive pivot grid for Chronos data.',
  MatrixVisuals: 'Matrix Visuals Panel: Charts and heatmaps sourced from Matrix presets.',
  RandomPicker: 'Random Picker Panel: Pull a random item from saved pools.',
  Schedule: 'Schedule Panel: Mirrors today\'s agenda inside the cockpit.',
  StatusStrip: 'Status Strip Panel: Live status indicators in a compact strip.',
  // Wizards
  Onboarding: 'Chronos Onboarding Wizard: Guided flow to set nickname, categories, statuses, templates, and starter goals/rewards.',
  GoalPlanning: 'Goal Planning Wizard: Capture intent, milestones, and supporting work to spin up a rich goal file.',
  ProjectLaunch: 'Project Launch Wizard: Draft a project brief, milestones, and kickoff actions before writing YAML.',
  BrainDump: 'Brain Dump Wizard: Rapid task capture, horizon buckets, and light refinement.'
};

function getHelpTip(name, fallback) {
  const key = (name || '').toString().trim();
  const fallbackKey = (fallback || '').toString().trim();
  if (key && HELP_TEXT[key]) return HELP_TEXT[key];
  if (fallbackKey && HELP_TEXT[fallbackKey]) return HELP_TEXT[fallbackKey];
  const label = fallbackKey || key || 'Component';
  return `${label}: No help available.`;
}

function createHelpButton(name, options = {}) {
  try {
    const btn = document.createElement(options.element || 'button');
    btn.type = 'button';
    btn.className = options.className || 'icon-btn help-btn';
    btn.textContent = options.text || '?';
    const tip = options.tooltip || getHelpTip(name, options.fallbackLabel || name);
    btn.title = tip || '';
    btn.setAttribute('aria-label', tip);
    if (typeof options.onClick === 'function') {
      btn.addEventListener('click', options.onClick);
    }
    return btn;
  } catch {
    return null;
  }
}

function attachHelpButton(target, name, options = {}) {
  if (!target) return null;
  const btn = createHelpButton(name, options);
  if (!btn) return null;
  if (options.position === 'prepend') target.prepend(btn);
  else target.appendChild(btn);
  return btn;
}

// ---- Widget state persistence ----
const WSTATE_KEY = 'chronos_widget_state_v1';
function _readStateMap() {
  try { const raw = localStorage.getItem(WSTATE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function _writeStateMap(map) {
  try { localStorage.setItem(WSTATE_KEY, JSON.stringify(map)); } catch { }
}
function widgetKey(el) {
  return (el?.id) || el?.getAttribute?.('data-widget') || null;
}
function saveWidgetState(el) {
  const key = widgetKey(el); if (!key) return;
  const map = _readStateMap();
  map[key] = {
    left: el.style?.left || null,
    top: el.style?.top || null,
    width: el.style?.width || null,
    height: el.style?.height || null,
    display: el.style?.display || '',
    minimized: el.classList?.contains('minimized') || false,
  };
  _writeStateMap(map);
}
function restoreWidgetState(el) {
  const key = widgetKey(el); if (!key) return false;
  const map = _readStateMap();
  const st = map[key];
  if (st) {
    if (st.left) el.style.left = st.left;
    if (st.top) el.style.top = st.top;
    if (st.width) el.style.width = st.width;
    if (st.height) el.style.height = st.height;
    if (st.display !== undefined) el.style.display = st.display;
    if (st.minimized) el.classList.add('minimized'); else el.classList.remove('minimized');
    return true;
  }
  return false;
}
function centerWidget(el) {
  try {
    const r = el.getBoundingClientRect();
    const left = Math.max(6, Math.round((window.innerWidth - r.width) / 2));
    const top = Math.max(48, Math.round((window.innerHeight - r.height) / 2));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  } catch { }
}
function persistOnChanges(el) {
  try {
    const mo = new MutationObserver(() => saveWidgetState(el));
    mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    el.__stateObserver = mo;
  } catch { }
}
window.addEventListener('beforeunload', () => {
  try { document.querySelectorAll('.widget').forEach(saveWidgetState); } catch { }
});

function insertHelpIntoWidget(el, name) {
  try {
    if (!el || !name) return;
    const header = el.querySelector('.header');
    const controls = header ? header.querySelector('.controls') : null;
    if (!header) return;
    if (header.querySelector('.help-btn')) return; // avoid duplicates
    const btn = createHelpButton(name, { className: 'icon-btn help-btn', fallbackLabel: name });
    if (!btn) return;
    if (controls) {
      const closeBtn = Array.from(controls.querySelectorAll('button')).find(b => {
        const title = (b.getAttribute('title') || '').toLowerCase();
        const text = (b.textContent || '').trim().toLowerCase();
        return title.includes('close') || text === 'x';
      });
      if (closeBtn && closeBtn.parentElement === controls) controls.insertBefore(btn, closeBtn);
      else controls.prepend(btn);
    } else {
      header.appendChild(btn);
    }
  } catch { }
}

function insertHelpIntoView(el, name) {
  return;
}

function removeWidgetMinimizeButtons(el) {
  try {
    const candidates = el.querySelectorAll('button, [role="button"]');
    candidates.forEach(btn => {
      const title = (btn.getAttribute('title') || '').toLowerCase();
      const action = (btn.getAttribute('data-action') || '').toLowerCase();
      const text = (btn.textContent || '').trim();
      const id = (btn.getAttribute('id') || '');
      const idLooksMin = /min$/i.test(id);
      if (title.includes('minimize') || action === 'minimize' || idLooksMin) {
        btn.remove();
      } else if (text === '_' && title === '') {
        btn.remove();
      }
    });
  } catch { }
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
      // Remove minimize buttons and inject help button
      removeWidgetMinimizeButtons(el);
      insertHelpIntoWidget(el, name);
      // Apply variable expansion to eligible nodes
      try { expandIn(el); } catch { }
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
  try {
    restoreWidgetState(el) || centerWidget(el);
    installWidgetResizers(el);
    installWidgetDrag(el);
    installWidgetFocus(el);
    persistOnChanges(el);
    saveWidgetState(el);
  } catch { }
}

export async function mountView(el, name) {
  const id = el.id || '(anon)';
  console.log(`[Chronos][runtime] Mounting view '${name}' into #${id}`);
  try {
    try { el.innerHTML = ''; } catch { }
    const modUrl = new URL(`../Views/${name}/index.js`, import.meta.url);
    const mod = await import(modUrl);
    if (mod && typeof mod.mount === 'function') {
      const api = mod.mount(el, context) || {};
      el.__view = { name, api };
      console.log(`[Chronos][runtime] Mounted view '${name}'`);
      // Inject help button for views
      insertHelpIntoView(el, name);
      // Apply variable expansion to eligible nodes
      try { expandIn(el); } catch { }
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

export async function launchWizard(name, options = {}) {
  console.log(`[Chronos][runtime] Launching wizard '${name}'`);
  try {
    const modUrl = new URL(`../Wizards/${name}/index.js`, import.meta.url);
    const mod = await import(modUrl);
    if (mod && typeof mod.launch === 'function') {
      return await mod.launch({ ...context }, options);
    }
    console.warn(`[Chronos][runtime] Wizard '${name}' has no launch() export`);
  } catch (e) {
    console.error(`[Chronos][runtime] Failed to launch wizard '${name}':`, e);
    throw e;
  }
  return null;
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
  try { document.querySelectorAll('.widget').forEach(el => { restoreWidgetState(el) || centerWidget(el); installWidgetResizers(el); installWidgetDrag(el); installWidgetFocus(el); persistOnChanges(el); saveWidgetState(el); }); } catch { }
  // Listen for vars changes to re-expand displayed text
  try { bus.on('vars:changed', () => { try { expandIn(document); } catch { } }); } catch { }
});

// ---- Generic widget resizers (E, S, SE) ----
function installWidgetResizers(el) {
  if (!el || !el.classList || !el.classList.contains('widget')) return;
  // Capture initial size as per-widget minimums (only once)
  try {
    if (!el.__minSizeSet) {
      const header = el.querySelector('.header');
      const headerW = header ? Math.ceil(header.scrollWidth) : 0;
      const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
      const dataMinW = Number(el.dataset?.minWidth || 0);
      const dataMinH = Number(el.dataset?.minHeight || 0);
      const baseMinW = Math.max(160, headerW + 12, dataMinW || 0);
      const baseMinH = Math.max(80, headerH + 20, dataMinH || 0);
      el.__minW = baseMinW;
      el.__minH = baseMinH;
      el.__minSizeSet = true;
    }
  } catch { }
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
  function edgeDrag(cb) {
    return (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const startX = ev.clientX;
      const startY = ev.clientY;
      const startW = el.offsetWidth || 0;
      const startH = el.offsetHeight || 0;
      const scale = toScaleRootCoords(ev.clientX, ev.clientY).scale || 1;
      function move(e) {
        const dx = (e.clientX - startX) / scale;
        const dy = (e.clientY - startY) / scale;
        cb(dx, dy, startW, startH);
      }
      function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); try { saveWidgetState(el); } catch { } }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    };
  }
  if (re && !re.__wired) {
    re.__wired = true;
    re.addEventListener('pointerdown', (ev) => edgeDrag((dx, dy, startW) => {
      const minW = Number(el.__minW || 280);
      el.style.width = Math.max(minW, startW + dx) + 'px';
    })(ev));
  }
  if (rs && !rs.__wired) {
    rs.__wired = true;
    rs.addEventListener('pointerdown', (ev) => edgeDrag((dx, dy, startW, startH) => {
      const minH = Number(el.__minH || 160);
      el.style.height = Math.max(minH, startH + dy) + 'px';
    })(ev));
  }
  if (rse && !rse.__wired) {
    rse.__wired = true;
    rse.addEventListener('pointerdown', (ev) => edgeDrag((dx, dy, startW, startH) => {
      const minW = Number(el.__minW || 280);
      const minH = Number(el.__minH || 160);
      el.style.width = Math.max(minW, startW + dx) + 'px';
      el.style.height = Math.max(minH, startH + dy) + 'px';
    })(ev));
  }
}

function ensureInViewport(el) {
  if (!el || el.style.display === 'none') return;
  try {
    const rect = el.getBoundingClientRect();
    const pad = 20;
    let top = rect.top;
    let left = rect.left;
    if (rect.bottom > (window.innerHeight - pad)) {
      top = Math.max(48, window.innerHeight - rect.height - pad);
    }
    if (rect.top < 48) {
      top = 48;
    }
    if (rect.right > (window.innerWidth - pad)) {
      left = Math.max(6, window.innerWidth - rect.width - pad);
    }
    if (rect.left < 6) {
      left = 6;
    }
    el.style.top = Math.round(top) + 'px';
    el.style.left = Math.round(left) + 'px';
  } catch { }
}

function isOffscreen(el) {
  if (!el || el.style.display === 'none') return false;
  try {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return (centerX < 0 || centerX > vw || centerY < 0 || centerY > vh);
  } catch { }
  return false;
}

function flashFocus(el) {
  if (!el) return;
  try {
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
    window.setTimeout(() => { try { el.classList.remove('pulse'); } catch { } }, 900);
  } catch { }
}

function focusWidget(el) {
  if (!el || !el.classList || !el.classList.contains('widget')) return;
  if (isOffscreen(el)) centerWidget(el);
  try {
    widgetZCounter = Math.max(widgetZCounter + 1, (Number(el.style.zIndex) || 0) + 1);
    el.style.zIndex = String(widgetZCounter);
  } catch { }
  flashFocus(el);
  saveWidgetState(el);
}

function getScaleRoot() {
  return document.getElementById('scaleRoot');
}

function getScaleFactor(rootEl) {
  try {
    const root = rootEl || getScaleRoot();
    if (!root) return 1;
    const tr = getComputedStyle(root).transform;
    if (!tr || tr === 'none') return 1;
    const m = tr.match(/matrix\(([^)]+)\)/);
    if (!m) return 1;
    const parts = m[1].split(',').map(v => parseFloat(v.trim()));
    const a = parts[0];
    const b = parts[1];
    const d = parts[3];
    const scaleX = Number.isFinite(a) ? Math.hypot(a, b || 0) : 1;
    const scaleY = Number.isFinite(d) ? Math.abs(d) : scaleX;
    return scaleX || scaleY || 1;
  } catch {
    return 1;
  }
}

function toScaleRootCoords(clientX, clientY) {
  const root = getScaleRoot();
  if (!root) return { x: clientX, y: clientY, scale: 1, rect: null };
  const rect = root.getBoundingClientRect();
  const scale = getScaleFactor(root);
  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top) / scale,
    scale,
    rect,
  };
}

// expose for other scripts
try {
  window.installWidgetResizers = installWidgetResizers;
  window.ensureWidgetInView = focusWidget;
  window.ChronosLaunchWizard = launchWizard;
  window.ChronosFocusWidget = focusWidget;
} catch { }

// ---- Generic widget header dragging ----
function isInteractiveTarget(target) {
  if (!target) return false;
  const selector = [
    'input',
    'textarea',
    'select',
    'button',
    'a',
    'label',
    '[contenteditable="true"]',
    '[data-no-drag]',
    '.no-drag',
    '.controls',
    '.resizer',
  ].join(',');
  return !!target.closest(selector);
}

function installWidgetDrag(el) {
  if (!el || !el.classList || !el.classList.contains('widget')) return;
  if (el.__dragWired) return;
  el.__dragWired = true;
  el.addEventListener('pointerdown', (ev) => {
    // Only left button
    if (ev.button !== 0) return;
    if (isInteractiveTarget(ev.target)) return;
    ev.preventDefault(); ev.stopPropagation();
    const root = getScaleRoot();
    const rootRect = root ? root.getBoundingClientRect() : { left: 0, top: 0 };
    const scale = getScaleFactor(root) || 1;
    const rect = el.getBoundingClientRect();
    const rectLeft = (rect.left - rootRect.left) / scale;
    const rectTop = (rect.top - rootRect.top) / scale;
    const startPos = toScaleRootCoords(ev.clientX, ev.clientY);
    const offX = startPos.x - rectLeft;
    const offY = startPos.y - rectTop;
    if (el.style.right) el.style.right = 'auto';
    if (el.style.bottom) el.style.bottom = 'auto';
    function move(e) {
      const pos = toScaleRootCoords(e.clientX, e.clientY);
      el.style.left = Math.round(pos.x - offX) + 'px';
      el.style.top = Math.round(pos.y - offY) + 'px';
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try { saveWidgetState(el); } catch { }
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function installWidgetFocus(el) {
  if (!el || !el.classList || !el.classList.contains('widget')) return;
  if (el.__focusWired) return;
  el.__focusWired = true;
  el.addEventListener('pointerdown', () => {
    try { focusWidget(el); } catch { }
  });
}
