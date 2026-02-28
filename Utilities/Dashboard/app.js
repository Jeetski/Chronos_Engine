// Simple app bootstrapper with debug logs
import { mountWidget, mountView, launchWizard } from './core/runtime.js';
try { window.__CHRONOS_APP_MANAGED_MOUNTS = true; } catch { }
const POPUPS_ENABLED_STORAGE_KEY = 'chronos_dashboard_popups_enabled_v1';
const SHOW_POST_RELEASE_STORAGE_KEY = 'chronos_dashboard_show_post_release_v1';
const SHOW_BADGES_STORAGE_KEY = 'chronos_dashboard_show_badges_v1';
const POST_RELEASE_WIDGETS = ['InventoryManager', 'Link', 'MP3Player', 'ResolutionTracker'];
const PRIORITY_WIDGETS = new Set(['Terminal', 'Review', 'Rewards']);
const URGENT_WIDGETS = new Set([
  'GoalTracker',
  'HabitTracker',
  'ItemManager',
  'Milestones',
  'NiaAssistant',
  'Settings',
  'SleepSettings',
  'Status',
  'Timer',
  'Today',
]);
const DEV_WIDGETS = new Set([
  'Achievements',
  'Commitments',
  'GoalTracker',
  'HabitTracker',
  'ItemManager',
  'Journal',
  'Milestones',
  'Notes',
  'Rewards',
  'Review',
  'Settings',
  'SleepSettings',
  'Status',
  'Terminal',
  'Timer',
  'Today',
  'Trends',
  'Variables',
]);
const GOOD_ENOUGH_WIDGETS = new Set(['Admin', 'Clock', 'DebugConsole', 'Profile', 'StickyNotes']);
const POST_RELEASE_WIZARDS = new Set(['Big5', 'SelfAuthoring', 'MapOfHappiness', 'FutureSelfDialogue']);
const PRIORITY_WIZARDS = new Set(['brain dump', 'braindump', 'chore setup', 'choresetup']);
const URGENT_WIZARDS = new Set([
  'onboarding',
  'goal planning',
  'goalplanning',
  'life setup',
  'lifesetup',
  'sleep hygiene',
  'sleepsettings',
]);
const DEV_VIEWS = new Set(['calendar', 'cockpit', 'project manager', 'template builder', 'weekly']);
const PRIORITY_VIEWS = new Set([
  'cockpit',
  'tracker',
  'goal planner',
  'goalplanner',
  'day builder',
  'daybuilder',
  'routine builder',
  'routinebuilder',
  'week builder',
  'weekbuilder',
]);
const URGENT_VIEWS = new Set(['calendar', 'weekly']);
const GOOD_ENOUGH_VIEWS = new Set(['docs', 'editor']);
const POST_RELEASE_PANELS = new Set(['map of happiness', 'flashcards']);
const PRIORITY_PANELS = new Set(['commitments', 'commitments snapshot']);
const URGENT_PANELS = new Set(['status strip', 'schedule panel', 'matrix', 'matrix visuals']);

function arePopupsEnabled() {
  try {
    const raw = localStorage.getItem(POPUPS_ENABLED_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== 'false';
  } catch {
    return true;
  }
}

function setPopupsEnabled(enabled) {
  try { localStorage.setItem(POPUPS_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false'); } catch { }
}

function arePostReleaseItemsVisible() {
  try {
    const raw = localStorage.getItem(SHOW_POST_RELEASE_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== 'false';
  } catch {
    return true;
  }
}

function setPostReleaseItemsVisible(enabled) {
  try { localStorage.setItem(SHOW_POST_RELEASE_STORAGE_KEY, enabled ? 'true' : 'false'); } catch { }
}

function areBadgesVisible() {
  try {
    const raw = localStorage.getItem(SHOW_BADGES_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== 'false';
  } catch {
    return true;
  }
}

function setBadgesVisible(enabled) {
  try { localStorage.setItem(SHOW_BADGES_STORAGE_KEY, enabled ? 'true' : 'false'); } catch { }
}

function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

if (typeof window !== 'undefined' && !window.__cockpitPanelDefinitions) {
  window.__cockpitPanelDefinitions = [];
}

// Simple popup queue so multiple popups do not overlap
if (typeof window !== 'undefined' && !window.ChronosPopupQueue) {
  const queue = [];
  let active = false;
  const run = async () => {
    if (active) return;
    const next = queue.shift();
    if (!next) return;
    active = true;
    try {
      await next(() => {
        active = false;
        run();
      });
    } catch {
      active = false;
      run();
    }
  };
  window.ChronosPopupQueue = {
    enqueue(fn) {
      if (typeof fn === 'function') {
        const force = !!window.__chronosForcePopupQueue;
        if (!arePopupsEnabled() && !force) return;
        queue.push(fn);
        run();
      }
    },
  };
}

function apiBase() {
  const o = window.location.origin;
  if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
  return o;
}

async function startChronosDay(options = {}) {
  const target = options.target || 'day';
  const source = options.source || 'dashboard';
  const body = JSON.stringify({ target });
  const resp = await fetch(apiBase() + '/api/day/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.ok === false) {
    const msg = data.error || data.stderr || `Start failed (HTTP ${resp.status})`;
    throw new Error(msg);
  }
  try { window.ChronosBus?.emit?.('timer:show', { source }); } catch { }
  try { window.ChronosBus?.emit?.('timer:refresh'); } catch { }
  try { window.calendarLoadToday?.(true); } catch { }
  return data;
}

try { window.ChronosStartDay = startChronosDay; } catch { }


// Panel loaders will be built dynamically from registry

// Popup loaders will be built dynamically from registry

ready(async () => {
  console.log('[Chronos][app] Booting dashboard app');

  // Ensure logo loads when opened via file:// by pointing to API base
  try {
    const logo = document.getElementById('chronosLogo');
    if (logo) {
      const want = apiBase() + '/assets/Logo_No_Background.png';
      if (!logo.src || logo.src.startsWith('file:') || logo.src.endsWith('/assets/Logo_No_Background.png')) {
        logo.src = want;
      }
      logo.addEventListener('error', () => { logo.src = want; });
    }
  } catch { }

  const viewRoot = document.getElementById('view');
  // DEV flags and available views will come from registries
  let availableViews = [];

  let wizardCatalog = [];
  let themeOptions = [];
  let popupCatalog = [];
  const THEME_STORAGE_KEY = 'chronos_dashboard_theme_v1';
  const themeStylesheet = document.getElementById('themeStylesheet');
  const UI_SCALE_STORAGE_KEY = 'chronos_dashboard_ui_scale_v1';
  // Rebased scale curve: 100% now matches the previous 140% visual size.
  const UI_SCALE_BASE = 0.84;
  const UI_SCALE_MIN = 60;
  const UI_SCALE_MAX = 140;

  function resolveTheme(themeId) {
    if (!themeOptions.length) return null;
    if (!themeId) return themeOptions[0];
    return themeOptions.find(t => t.id === themeId) || themeOptions[0];
  }

  function refreshThemeMenuChecks(activeId) {
    const menu = document.getElementById('menu-appearance');
    if (!menu) return;
    const current = activeId || themeStylesheet?.dataset.themeId || themeOptions[0]?.id;
    menu.querySelectorAll('.theme-item').forEach(item => {
      const id = item.getAttribute('data-theme');
      const check = item.querySelector('.check');
      if (check) check.textContent = id === current ? '✓' : '';
    });
  }

  function applyTheme(themeId, opts = {}) {
    const { persist = true } = opts;
    const theme = resolveTheme(themeId);
    if (!theme || !themeStylesheet) return theme;
    const desiredHref = `./Themes/${theme.file}`;
    if (themeStylesheet.getAttribute('href') !== desiredHref) {
      themeStylesheet.setAttribute('href', desiredHref);
    }
    themeStylesheet.dataset.themeId = theme.id;
    try { document.body?.setAttribute('data-theme', theme.id); } catch { }
    if (persist) {
      try { localStorage.setItem(THEME_STORAGE_KEY, theme.id); } catch { }
    }
    refreshThemeMenuChecks(theme.id);
    return theme;
  }

  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    applyTheme(storedTheme, { persist: false });
  } catch {
    applyTheme(themeOptions[0]?.id, { persist: false });
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function getStoredScalePct() {
    try {
      const raw = localStorage.getItem(UI_SCALE_STORAGE_KEY);
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed)) return clamp(parsed, UI_SCALE_MIN, UI_SCALE_MAX);
    } catch { }
    return 100;
  }
  function applyUiScale(pct, opts = {}) {
    const { persist = true } = opts;
    const safePct = clamp(Number(pct) || 100, UI_SCALE_MIN, UI_SCALE_MAX);
    const scale = UI_SCALE_BASE * (safePct / 100);
    const scaleRoot = document.getElementById('scaleRoot');
    if (scaleRoot) {
      scaleRoot.style.transform = `scale(${scale})`;
      scaleRoot.style.width = `${(100 / scale).toFixed(4)}%`;
      scaleRoot.style.height = `${(100 / scale).toFixed(4)}%`;
    } else {
      try { document.documentElement.style.zoom = String(scale); } catch { }
      try { document.body.style.zoom = String(scale); } catch { }
    }
    if (persist) {
      try { localStorage.setItem(UI_SCALE_STORAGE_KEY, String(safePct)); } catch { }
    }
    return safePct;
  }
  applyUiScale(getStoredScalePct(), { persist: false });
  const openPanes = [];
  const MAX_PANES = 3;
  let viewPanes = null;
  let viewEmpty = null;
  const VIEW_STATE_KEY = 'chronos_view_state_v1';
  const MIN_PANE_PX = 220;

  function ensureViewShell() {
    if (!viewRoot) return;
    if (viewPanes && viewEmpty) return;
    viewRoot.innerHTML = '';
    viewPanes = document.createElement('div');
    viewPanes.className = 'view-panes';
    viewEmpty = document.createElement('div');
    viewEmpty.className = 'view-empty';
    viewEmpty.textContent = 'Open a view from the Views menu';
    viewRoot.append(viewPanes, viewEmpty);
  }
  ensureViewShell();

  function updateEmptyState() {
    if (!viewEmpty) return;
    viewEmpty.style.display = openPanes.length ? 'none' : '';
  }

  function persistViewState() {
    try {
      const payload = { open: openPanes.map(p => ({ name: p.name, label: p.label })) };
      localStorage.setItem(VIEW_STATE_KEY, JSON.stringify(payload));
    } catch { }
  }

  function loadViewState() {
    try {
      const raw = localStorage.getItem(VIEW_STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.open)) return parsed.open;
    } catch { }
    return null;
  }

  function refreshViewMenuChecks() {
    const viewMenu = document.getElementById('menu-view');
    if (!viewMenu) return;
    viewMenu.querySelectorAll('.item').forEach(it => {
      const name = it.getAttribute('data-name');
      const check = it.querySelector('.check');
      if (check) check.textContent = openPanes.some(v => v.name === name) ? '✓' : '';
    });
  }

  function getPaneElements() {
    if (!viewPanes) return [];
    return Array.from(viewPanes.querySelectorAll('.view-pane'));
  }

  function normalizePaneSizes() {
    const panes = getPaneElements();
    if (!panes.length) return;
    let total = 0;
    const missing = [];
    panes.forEach(p => {
      const v = parseFloat(p.dataset.size);
      if (v > 0) total += v;
      else missing.push(p);
    });
    if (missing.length) {
      const remaining = Math.max(0, 1 - total);
      const share = remaining > 0 ? (remaining / missing.length) : (1 / panes.length);
      missing.forEach(p => { p.dataset.size = share; total += share; });
    }
    if (!(total > 0)) {
      const equal = 1 / panes.length;
      panes.forEach(p => p.dataset.size = equal);
      total = 1;
    }
    panes.forEach(p => {
      const frac = parseFloat(p.dataset.size) || (1 / panes.length);
      p.dataset.size = (frac / total).toFixed(4);
    });
  }

  function applyPaneSizes() {
    const panes = getPaneElements();
    if (!panes.length) return;
    panes.forEach(p => {
      const frac = parseFloat(p.dataset.size);
      const size = frac > 0 ? frac : (1 / panes.length);
      p.style.flexGrow = size;
      p.style.flexShrink = 1;
      p.style.flexBasis = '0';
    });
  }

  function beginPaneResize(ev, leftPane, rightPane) {
    if (!viewPanes) return;
    ev.preventDefault();
    ev.stopPropagation();
    const totalWidth = Math.max(1, viewPanes.getBoundingClientRect().width);
    const leftSize = parseFloat(leftPane.dataset.size) || 0.5;
    const rightSize = parseFloat(rightPane.dataset.size) || 0.5;
    const totalSize = leftSize + rightSize;
    const minFrac = Math.min(0.45, Math.max(0.08, MIN_PANE_PX / totalWidth));
    const startX = ev.clientX;
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    function onMove(e) {
      const deltaFrac = (e.clientX - startX) / totalWidth;
      let nextLeft = clamp(leftSize + deltaFrac, minFrac, totalSize - minFrac);
      let nextRight = totalSize - nextLeft;
      leftPane.dataset.size = nextLeft;
      rightPane.dataset.size = nextRight;
      applyPaneSizes();
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      normalizePaneSizes();
      applyPaneSizes();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function rebuildPaneResizers() {
    if (!viewPanes) return;
    const panes = getPaneElements();
    viewPanes.querySelectorAll('.pane-resizer').forEach(r => r.remove());
    if (!panes.length) return;
    normalizePaneSizes();
    applyPaneSizes();
    panes.forEach((pane, idx) => {
      if (idx === panes.length - 1) return;
      const handle = document.createElement('div');
      handle.className = 'pane-resizer';
      handle.title = 'Drag to resize panes';
      handle.addEventListener('pointerdown', (ev) => beginPaneResize(ev, pane, panes[idx + 1]));
      pane.appendChild(handle);
    });
  }

  async function openPane(name, label) {
    if (!viewPanes) return;
    const existing = openPanes.find(v => v.name === name);
    if (existing) {
      existing.pane.classList.add('active');
      setTimeout(() => existing.pane.classList.remove('active'), 180);
      return;
    }
    if (openPanes.length >= MAX_PANES) {
      console.warn('[Chronos][app] Max view panes reached');
      return;
    }
    const pane = document.createElement('div');
    pane.className = 'view-pane';
    const tab = document.createElement('div');
    tab.className = 'pane-tab';
    const title = document.createElement('span');
    title.className = 'pane-title';
    title.textContent = label || name;
    let calendarBackBtn = null;
    let calendarRefreshBtn = null;
    if (name === 'Calendar') {
      calendarBackBtn = document.createElement('button');
      calendarBackBtn.type = 'button';
      calendarBackBtn.className = 'pane-back';
      calendarBackBtn.textContent = 'Back';
      calendarBackBtn.title = 'Return to previous calendar level';
      calendarBackBtn.style.padding = '0 10px';
      calendarBackBtn.style.height = '28px';
      calendarBackBtn.style.marginLeft = '8px';

      calendarRefreshBtn = document.createElement('button');
      calendarRefreshBtn.type = 'button';
      calendarRefreshBtn.className = 'pane-back';
      calendarRefreshBtn.textContent = 'Refresh';
      calendarRefreshBtn.title = 'Refresh day list';
      calendarRefreshBtn.style.padding = '0 10px';
      calendarRefreshBtn.style.height = '28px';
    }
    const helpBtn = window.ChronosHelp?.create?.(name, { className: 'icon-btn', fallbackLabel: name });
    const close = document.createElement('button');
    close.className = 'pane-close';
    close.textContent = '✕';
    close.title = 'Close view';
    if (helpBtn) {
      if (calendarBackBtn && calendarRefreshBtn) tab.append(title, calendarBackBtn, calendarRefreshBtn, helpBtn, close);
      else tab.append(title, helpBtn, close);
    } else {
      if (calendarBackBtn && calendarRefreshBtn) tab.append(title, calendarBackBtn, calendarRefreshBtn, close);
      else tab.append(title, close);
    }
    const content = document.createElement('div');
    content.className = 'pane-content';
    const viewport = document.createElement('div');
    viewport.className = 'pane-scroll';
    content.appendChild(viewport);
    pane.append(tab, content);
    viewPanes.appendChild(pane);
    close.addEventListener('click', (e) => { e.stopPropagation(); closePane(name); });
    try {
      await mountView(viewport, name);
      if (name === 'Calendar') {
        try {
          window.__calendarTitleEl = title;
          window.__calendarHeaderBackBtn = calendarBackBtn || null;
          window.__calendarHeaderRefreshBtn = calendarRefreshBtn || null;
          window.__calendarSetBackState = (enabled) => {
            try {
              const hasHistory = !!enabled;
              if (calendarBackBtn) {
                calendarBackBtn.disabled = !hasHistory;
                calendarBackBtn.setAttribute('aria-disabled', hasHistory ? 'false' : 'true');
              }
            } catch { }
          };
          if (calendarBackBtn) {
            calendarBackBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              try { window.__calendarGoBack?.(); } catch { }
            });
          }
          if (calendarRefreshBtn) {
            calendarRefreshBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              try { window.__calendarRefreshDayList?.(); } catch { }
            });
          }
          window.__calendarUpdateTitle = () => {
            try {
              const base = label || name;
              const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
              const mode = window.__calendarViewMode || 'year';
              const day = window.__calendarSelectedDay ? new Date(window.__calendarSelectedDay) : null;
              const weekStart = window.__calendarSelectedWeekStart ? new Date(window.__calendarSelectedWeekStart) : null;
              const year = day?.getFullYear()
                || weekStart?.getFullYear()
                || window.__calendarSelectedYear
                || (new Date()).getFullYear();
              let text = `${base} · ${year}`;
              if (mode === 'month') {
                const m = window.__calendarSelectedMonth;
                const monthName = Number.isFinite(m) ? months[m] : null;
                if (monthName) text += ` · ${monthName}`;
              } else if (mode === 'week') {
                const d = weekStart;
                if (d) text += ` · Week of ${months[d.getMonth()]} ${d.getDate()}`;
              } else if (mode === 'day') {
                const d = day;
                if (d) {
                  const dows = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                  const dow = dows[d.getDay()] || '';
                  text += ` · ${dow}, ${months[d.getMonth()]} ${d.getDate()}`;
                }
              }
              title.textContent = text;
            } catch {
              title.textContent = label || name;
            }
          };
          window.__calendarUpdateTitle();
          try {
            const hasHistory = !!window.__calendarCanGoBack?.();
            window.__calendarSetBackState?.(hasHistory);
          } catch { }
        } catch { }
        try {
          const todayWidget = document.querySelector('[data-widget="Today"]');
          if (todayWidget) {
            todayWidget.style.display = '';
            window.ChronosFocusWidget?.(todayWidget);
          }
        } catch { }
      }
      openPanes.push({ name, label: label || name, pane, content, viewport });
      window.__currentView = name;
      try { window.ChronosBus?.emit?.('view:changed', { current: name, open: openPanes.map(p => p.name) }); } catch { }
      updateEmptyState();
      refreshViewMenuChecks();
      persistViewState();
      rebuildPaneResizers();
    } catch (e) {
      console.error('[Chronos][app] View mount error:', e);
      pane.remove();
    }
  }

  try {
    window.ChronosOpenView = async (name, label) => {
      if (!name) return;
      await openPane(String(name), label || String(name));
    };
    window.ChronosOpenDoc = async (path, line) => {
      const req = { path: String(path || ''), line: Number.isFinite(Number(line)) ? Number(line) : undefined };
      try { window.__chronosDocsOpenRequest = req; } catch { }
      await openPane('Docs', 'Docs');
      try {
        const docsPane = openPanes.find(p => p.name === 'Docs');
        const api = docsPane?.viewport?.__view?.api;
        if (api && typeof api.openDoc === 'function') {
          api.openDoc(req.path, req.line);
        }
      } catch { }
      try { if (typeof window.ChronosDocsOpen === 'function') window.ChronosDocsOpen(req); } catch { }
      try { window.ChronosBus?.emit?.('docs:open', req); } catch { }
      try {
        setTimeout(() => {
          try { if (typeof window.ChronosDocsOpen === 'function') window.ChronosDocsOpen(req); } catch { }
        }, 120);
      } catch { }
    };
  } catch { }

  function closePane(name) {
    const idx = openPanes.findIndex(v => v.name === name);
    if (idx === -1) return;
    const pane = openPanes[idx];
    try {
      const viewApi = pane.viewport?.__view?.api;
      if (viewApi && typeof viewApi.dispose === 'function') {
        viewApi.dispose();
      }
    } catch { }
    if (name === 'Calendar') {
      try {
        delete window.__calendarTitleEl;
        delete window.__calendarUpdateTitle;
        delete window.__calendarHeaderBackBtn;
        delete window.__calendarHeaderRefreshBtn;
        delete window.__calendarSetBackState;
      } catch { }
    }
    try { pane.pane.remove(); } catch { }
    openPanes.splice(idx, 1);
    window.__currentView = openPanes.length ? openPanes[openPanes.length - 1].name : null;
    try { window.ChronosBus?.emit?.('view:changed', { current: window.__currentView, open: openPanes.map(p => p.name) }); } catch { }
    updateEmptyState();
    refreshViewMenuChecks();
    persistViewState();
    rebuildPaneResizers();
  }

  // Mount widgets found by data-widget attribute
  const widgetEls = Array.from(document.querySelectorAll('[data-widget]'));
  console.log(`[Chronos][app] Found ${widgetEls.length} widget container(s)`);
  for (const el of widgetEls) {
    const name = el.getAttribute('data-widget');
    try { await mountWidget(el, name); } catch (e) { console.error('[Chronos][app] Widget mount error:', name, e); }
  }

  // Simple topbar menus
  function closeMenus() { document.querySelectorAll('#topbar .dropdown').forEach(d => d.classList.remove('open')); }
  function positionDropdownInViewport(dropdown) {
    if (!dropdown) return;
    const margin = 8;
    try {
      dropdown.style.left = '0';
      dropdown.style.right = 'auto';
      const rect = dropdown.getBoundingClientRect();
      let shift = 0;
      if (rect.right > window.innerWidth - margin) shift -= (rect.right - (window.innerWidth - margin));
      if (rect.left + shift < margin) shift += (margin - (rect.left + shift));
      dropdown.style.left = `${Math.round(shift)}px`;
    } catch { }
  }
  function positionOpenDropdowns() {
    try {
      document.querySelectorAll('#topbar .dropdown.open').forEach((d) => positionDropdownInViewport(d));
    } catch { }
  }
  function attachDropdownSearch(menu, placeholder = 'Search...') {
    if (!menu) return;
    const old = menu.querySelector('.menu-search-wrap');
    if (old) old.remove();

    const wrap = document.createElement('div');
    wrap.className = 'menu-search-wrap';
    wrap.style.padding = '2px 0 6px 0';

    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = placeholder;
    input.className = 'menu-search-input';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';
    input.style.padding = '6px 8px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid var(--border)';
    input.style.background = 'rgba(12, 16, 24, 0.9)';
    input.style.color = 'var(--text)';

    wrap.addEventListener('click', (ev) => ev.stopPropagation());
    input.addEventListener('click', (ev) => ev.stopPropagation());

    const applyFilter = () => {
      const q = String(input.value || '').trim().toLowerCase();
      const items = menu.querySelectorAll('.item[data-search]');
      items.forEach((item) => {
        const hay = String(item.getAttribute('data-search') || '').toLowerCase();
        item.style.display = (!q || hay.includes(q)) ? '' : 'none';
      });
    };
    input.addEventListener('input', applyFilter);

    wrap.appendChild(input);
    const firstColumn = menu.querySelector('.column');
    if (firstColumn) firstColumn.prepend(wrap);
    else menu.prepend(wrap);
  }
  function chunkForSearchLayout(entries, firstColumnCap = 9, otherColumnCap = 10) {
    const list = Array.isArray(entries) ? entries : [];
    if (!list.length) return [];
    const chunks = [];
    const firstCap = Math.max(1, Number(firstColumnCap) || 9);
    const otherCap = Math.max(1, Number(otherColumnCap) || 10);
    let idx = 0;
    chunks.push(list.slice(idx, idx + firstCap));
    idx += firstCap;
    while (idx < list.length) {
      chunks.push(list.slice(idx, idx + otherCap));
      idx += otherCap;
    }
    return chunks;
  }
  document.querySelectorAll('#topbar .menubtn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-menu');
      // Rebuild widgets menu each time it opens so checkmarks reflect current visibility
      if (id === 'widgets') buildWidgetsMenu();
      if (id === 'wizards') buildWizardsMenu();
      if (id === 'panels') buildPanelsMenu();
      if (id === 'appearance') buildAppearanceMenu();
      if (id === 'popups') buildPopupsMenu();
      if (id === 'dev') buildDevMenu();
      closeMenus();
      const menu = document.getElementById('menu-' + id);
      if (menu) {
        menu.classList.add('open');
        positionDropdownInViewport(menu);
      }
    });
  });
  document.addEventListener('click', closeMenus);

  // Build/rebuild widgets dropdown based on current visibility
  function buildWidgetsMenu() {
    const widgetsMenu = document.getElementById('menu-widgets');
    if (!widgetsMenu) return;
    widgetsMenu.innerHTML = '';
    const showPostRelease = arePostReleaseItemsVisible();
    const entries = widgetEls
      .map(el => {
        const fallback = el.id || el.getAttribute('data-widget') || 'widget';
        const label = el.getAttribute('data-label') || el.getAttribute('data-widget') || fallback;
        const name = el.getAttribute('data-widget') || fallback;
        const postRelease = POST_RELEASE_WIDGETS.includes(name);
        return { el, label, name, postRelease };
      })
      .filter(entry => showPostRelease || !entry.postRelease)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    const createItem = ({ el, label, name }) => {
      const item = document.createElement('div');
      item.className = 'item';
      item.setAttribute('data-search', `${label} ${name}`);
      const check = document.createElement('span');
      check.className = 'check';
      check.textContent = (el.style.display === 'none') ? '' : '✓';
      const span = document.createElement('span');
      span.textContent = label;
      item.append(check, span);
      if (areBadgesVisible()) {
        if (URGENT_WIDGETS.has(name)) {
          const badge = document.createElement('span');
          badge.className = 'urgent-badge';
          badge.textContent = 'urgent';
          badge.title = 'Urgent widget';
          item.appendChild(badge);
        } else if (PRIORITY_WIDGETS.has(name)) {
          const badge = document.createElement('span');
          badge.className = 'priority-badge';
          badge.textContent = 'priority';
          badge.title = 'Priority widget';
          item.appendChild(badge);
        } else if (POST_RELEASE_WIDGETS.includes(name)) {
          const badge = document.createElement('span');
          badge.className = 'post-release-badge';
          badge.textContent = 'later';
          badge.title = 'Post-release feature';
          item.appendChild(badge);
        } else if (GOOD_ENOUGH_WIDGETS.has(name)) {
          const badge = document.createElement('span');
          badge.className = 'good-enough-badge';
          badge.textContent = 'good enough';
          badge.title = 'Stable enough for now';
          item.appendChild(badge);
        } else if (DEV_WIDGETS.has(name)) {
          const badge = document.createElement('span');
          badge.className = 'dev-badge';
          badge.textContent = 'dev';
          badge.title = 'Development feature';
          item.appendChild(badge);
        }
      }
      item.addEventListener('click', () => {
        el.style.display = (el.style.display === 'none' ? '' : 'none');
        check.textContent = el.style.display === 'none' ? '' : '✓';
        closeMenus();
        try { if (el.style.display !== 'none') window.ChronosFocusWidget?.(el); } catch { }
      });
      return item;
    };

    const frag = document.createDocumentFragment();
    const chunks = chunkForSearchLayout(entries, 9, 10);
    for (const group of chunks) {
      const column = document.createElement('div');
      column.className = 'column';
      for (const entry of group) {
        column.appendChild(createItem(entry));
      }
      frag.appendChild(column);
    }
    widgetsMenu.appendChild(frag);
    attachDropdownSearch(widgetsMenu, 'Search widgets...');
  }
  // Initial build
  buildWidgetsMenu();

  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exp = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
    const value = n / Math.pow(1024, exp);
    return `${value.toFixed(value >= 10 || exp === 0 ? 0 : 1)} ${units[exp]}`;
  }

  async function postJson(path, payload) {
    const r = await fetch(apiBase() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    let data = null;
    try { data = await r.json(); } catch { }
    return { ok: r.ok, status: r.status, data };
  }

  async function runSystemCommand(command) {
    return postJson('/api/system/command', { command });
  }

  function showTextOverlay(title, body, { tone = 'normal' } = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'chronos-overlay';
    const shell = document.createElement('div');
    shell.className = 'chronos-shell';
    shell.style.width = 'min(980px, 92vw)';
    shell.style.maxHeight = '84vh';
    shell.style.overflow = 'hidden';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.alignItems = 'center';
    head.style.justifyContent = 'space-between';
    head.style.gap = '12px';

    const titleEl = document.createElement('h2');
    titleEl.textContent = title;
    titleEl.style.margin = '0';
    if (tone === 'error') titleEl.style.color = '#ff8080';

    const close = document.createElement('button');
    close.className = 'chronos-btn';
    close.textContent = 'Close';
    close.addEventListener('click', () => overlay.remove());
    head.append(titleEl, close);

    const pre = document.createElement('pre');
    pre.style.marginTop = '12px';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.overflow = 'auto';
    pre.style.maxHeight = '68vh';
    pre.style.padding = '12px';
    pre.style.border = '1px solid var(--line)';
    pre.style.borderRadius = '10px';
    pre.style.background = 'rgba(0,0,0,0.2)';
    pre.textContent = body || '(no output)';

    shell.append(head, pre);
    overlay.appendChild(shell);
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  async function runDevCommandAction(label, command) {
    const started = performance.now();
    const res = await runSystemCommand(command);
    const ms = Math.round(performance.now() - started);
    const data = res.data || {};
    const out = (data.stdout || '').trim();
    const err = (data.stderr || '').trim();
    const text = [
      `${label}`,
      `Command: ${command}`,
      `HTTP: ${res.status}`,
      `Elapsed: ${ms} ms`,
      '',
      out ? `STDOUT:\n${out}` : 'STDOUT:\n(none)',
      '',
      err ? `STDERR:\n${err}` : 'STDERR:\n(none)',
    ].join('\n');
    showTextOverlay(label, text, { tone: (res.ok && data.ok) ? 'normal' : 'error' });
  }

  async function runHealthProbe() {
    const started = performance.now();
    const r = await fetch(apiBase() + '/health');
    const txt = await r.text();
    const elapsed = Math.round(performance.now() - started);
    const lines = [
      `API Health Probe`,
      `Status: ${r.status}`,
      `Elapsed: ${elapsed} ms`,
      '',
      txt.trim() || '(empty)',
    ];
    showTextOverlay('API Health Probe', lines.join('\n'), { tone: r.ok ? 'normal' : 'error' });
  }

  function collectRuntimeSnapshot() {
    const visibleWidgets = widgetEls.filter(el => el.style.display !== 'none').length;
    const hiddenWidgets = widgetEls.length - visibleWidgets;
    let storageBytes = 0;
    let storageKeys = 0;
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i) || '';
        const v = localStorage.getItem(k) || '';
        storageBytes += (k.length + v.length) * 2;
        storageKeys += 1;
      }
    } catch { }
    const navMem = (performance && performance.memory) ? performance.memory : null;
    return {
      now: new Date().toISOString(),
      viewsOpen: openPanes.map(p => p.name),
      widgetsTotal: widgetEls.length,
      widgetsVisible: visibleWidgets,
      widgetsHidden: hiddenWidgets,
      localStorageKeys: storageKeys,
      localStorageBytes: storageBytes,
      localStorageHuman: formatBytes(storageBytes),
      jsHeap: navMem ? {
        used: navMem.usedJSHeapSize,
        total: navMem.totalJSHeapSize,
        limit: navMem.jsHeapSizeLimit,
      } : null,
    };
  }

  async function gatherStatsForNerds() {
    const stats = {
      capturedAt: new Date().toISOString(),
      runtime: collectRuntimeSnapshot(),
      mirrors: null,
      health: null,
      apiLatency: [],
      scheduler: null,
      commandSignals: null,
      integrity: null,
    };

    const healthStart = performance.now();
    try {
      const h = await fetch(apiBase() + '/health');
      const text = await h.text();
      stats.health = {
        ok: h.ok,
        status: h.status,
        latencyMs: Math.round(performance.now() - healthStart),
        payload: text.trim(),
      };
    } catch (e) {
      stats.health = { ok: false, status: 0, latencyMs: null, payload: String(e || 'health failed') };
    }

    try {
      const t0 = performance.now();
      const r = await fetch(apiBase() + '/api/system/databases');
      const j = await r.json();
      const dbs = Array.isArray(j?.databases) ? j.databases : [];
      const nowMs = Date.now();
      const stale24h = dbs.filter(d => {
        if (!d?.modified) return true;
        const ts = Date.parse(d.modified);
        if (!Number.isFinite(ts)) return true;
        return (nowMs - ts) > (24 * 60 * 60 * 1000);
      }).length;
      const totalSize = dbs.reduce((sum, d) => sum + (Number(d?.size) || 0), 0);
      stats.mirrors = {
        ok: r.ok && !!j?.ok,
        latencyMs: Math.round(performance.now() - t0),
        count: dbs.length,
        stale24h,
        totalSize,
        totalSizeHuman: formatBytes(totalSize),
        rows: dbs.map(d => ({
          name: d?.name || d?.label || 'unknown',
          modified: d?.modified || null,
          size: Number(d?.size) || 0,
        })),
      };
    } catch (e) {
      stats.mirrors = { ok: false, error: String(e || 'mirror probe failed') };
    }

    const probes = [
      '/api/registry?name=widgets',
      '/api/items?type=task',
      '/api/timer/status',
      '/api/today',
      '/api/logs?limit=20',
    ];
    for (const path of probes) {
      const started = performance.now();
      try {
        const r = await fetch(apiBase() + path);
        await r.text();
        stats.apiLatency.push({ path, ok: r.ok, status: r.status, ms: Math.round(performance.now() - started) });
      } catch (e) {
        stats.apiLatency.push({ path, ok: false, status: 0, ms: null, error: String(e || 'request failed') });
      }
    }

    try {
      const [todayResp, timerResp, seqResp] = await Promise.all([
        fetch(apiBase() + '/api/today').then(async (r) => ({ ok: r.ok, status: r.status, text: await r.text() })).catch((e) => ({ ok: false, status: 0, text: String(e || '') })),
        fetch(apiBase() + '/api/timer/status').then((r) => r.json()).catch(() => null),
        runSystemCommand('sequence status'),
      ]);
      const todayText = String(todayResp?.text || '');
      const blockCount = (todayText.match(/^\s*-\s+name\s*:/gm) || []).length;
      const completedMentions = (todayText.match(/status:\s*completed/gi) || []).length;
      stats.scheduler = {
        todayOk: !!todayResp?.ok,
        todayStatus: todayResp?.status || 0,
        blocksApprox: blockCount,
        completedMentionsApprox: completedMentions,
        timer: timerResp || null,
        sequenceStatusStdout: seqResp?.data?.stdout || '',
        sequenceStatusStderr: seqResp?.data?.stderr || '',
      };
    } catch (e) {
      stats.scheduler = { ok: false, error: String(e || 'scheduler probe failed') };
    }

    try {
      const commands = ['count task', 'count habit', 'count goal', 'count milestone', 'count reminder', 'count alarm'];
      const rows = [];
      for (const cmd of commands) {
        const res = await runSystemCommand(cmd);
        const out = String(res?.data?.stdout || '').trim();
        const m = out.match(/-?\d+/);
        rows.push({
          command: cmd,
          ok: !!res?.ok && !!res?.data?.ok,
          value: m ? Number(m[0]) : null,
          stdout: out,
        });
      }
      stats.commandSignals = { rows };
    } catch (e) {
      stats.commandSignals = { error: String(e || 'command stats failed') };
    }

    try {
      const started = performance.now();
      const r = await fetch(apiBase() + '/api/logs?limit=250');
      const j = await r.json();
      const logs = Array.isArray(j?.logs) ? j.logs : [];
      const errors = logs.filter(line => /error|exception|traceback/i.test(String(line))).length;
      stats.integrity = {
        ok: r.ok && !!j?.ok,
        latencyMs: Math.round(performance.now() - started),
        logsSampled: logs.length,
        errorLikeLines: errors,
      };
    } catch (e) {
      stats.integrity = { ok: false, error: String(e || 'log probe failed') };
    }

    return stats;
  }

  function renderStatsForNerds(stats) {
    const lines = [];
    lines.push('Stats for Nerds');
    lines.push(`Captured: ${stats.capturedAt}`);
    lines.push('');

    const rt = stats.runtime || {};
    lines.push('[Runtime]');
    lines.push(`Views open: ${(rt.viewsOpen || []).join(', ') || '(none)'}`);
    lines.push(`Widgets: ${rt.widgetsVisible || 0}/${rt.widgetsTotal || 0} visible`);
    lines.push(`localStorage: ${rt.localStorageKeys || 0} keys, ${rt.localStorageHuman || '0 B'}`);
    if (rt.jsHeap) {
      lines.push(`JS heap: used ${formatBytes(rt.jsHeap.used)} / total ${formatBytes(rt.jsHeap.total)} (limit ${formatBytes(rt.jsHeap.limit)})`);
    } else {
      lines.push('JS heap: unavailable (browser does not expose performance.memory)');
    }
    lines.push('');

    lines.push('[Health]');
    lines.push(`OK: ${stats.health?.ok ? 'yes' : 'no'} | status: ${stats.health?.status ?? 'n/a'} | latency: ${stats.health?.latencyMs ?? 'n/a'} ms`);
    if (stats.health?.payload) lines.push(`Payload: ${stats.health.payload.replace(/\s+/g, ' ').trim()}`);
    lines.push('');

    lines.push('[Mirrors]');
    lines.push(`Databases: ${stats.mirrors?.count ?? 'n/a'} | stale>24h: ${stats.mirrors?.stale24h ?? 'n/a'} | size: ${stats.mirrors?.totalSizeHuman ?? 'n/a'}`);
    const mirrorRows = Array.isArray(stats.mirrors?.rows) ? stats.mirrors.rows.slice(0, 12) : [];
    mirrorRows.forEach((row) => {
      lines.push(`- ${row.name}: ${formatBytes(row.size)} | modified ${row.modified || 'unknown'}`);
    });
    lines.push('');

    lines.push('[API Latency]');
    (stats.apiLatency || []).forEach((p) => {
      lines.push(`- ${p.path}: ${p.ok ? 'ok' : 'fail'} status=${p.status} latency=${p.ms ?? 'n/a'} ms`);
    });
    lines.push('');

    lines.push('[Scheduler]');
    lines.push(`today blocks (approx): ${stats.scheduler?.blocksApprox ?? 'n/a'} | completed markers: ${stats.scheduler?.completedMentionsApprox ?? 'n/a'}`);
    const timer = stats.scheduler?.timer;
    if (timer && typeof timer === 'object') {
      const state = timer?.status || timer?.state || timer?.mode || 'unknown';
      lines.push(`timer state: ${state}`);
    } else {
      lines.push('timer state: unavailable');
    }
    const seqOut = String(stats.scheduler?.sequenceStatusStdout || '').trim();
    if (seqOut) {
      lines.push('sequence status:');
      lines.push(seqOut);
    }
    lines.push('');

    lines.push('[Command Signals]');
    const cmdRows = stats.commandSignals?.rows || [];
    cmdRows.forEach((row) => {
      lines.push(`- ${row.command}: ${row.value ?? 'n/a'} (${row.ok ? 'ok' : 'fail'})`);
    });
    lines.push('');

    lines.push('[Integrity]');
    lines.push(`log lines sampled: ${stats.integrity?.logsSampled ?? 'n/a'} | error-like lines: ${stats.integrity?.errorLikeLines ?? 'n/a'}`);

    return lines.join('\n');
  }

  async function openStatsForNerds() {
    showTextOverlay('Stats for Nerds', 'Collecting diagnostics...');
    const overlays = Array.from(document.querySelectorAll('.chronos-overlay'));
    const current = overlays[overlays.length - 1];
    if (!current) return;
    const pre = current.querySelector('pre');
    try {
      const stats = await gatherStatsForNerds();
      if (pre) pre.textContent = renderStatsForNerds(stats);
    } catch (e) {
      if (pre) pre.textContent = `Failed to build stats report.\n${String(e || '')}`;
    }
  }

  // Dynamic Registries - fetch all component registries
  Promise.all([
    fetch(apiBase() + '/api/registry?name=wizards').then(r => r.json()).then(d => d.registry?.wizards || []),
    fetch(apiBase() + '/api/registry?name=themes').then(r => r.json()).then(d => d.registry?.themes || []),
    fetch(apiBase() + '/api/registry?name=views').then(r => r.json()).then(d => d.registry?.views || []),
    fetch(apiBase() + '/api/registry?name=panels').then(r => r.json()).then(d => d.registry?.panels || []),
    fetch(apiBase() + '/api/registry?name=popups').then(r => r.json()).then(d => d.registry?.popups || [])
  ]).then(([wizards, themes, views, panels, popups]) => {
    console.log('[Chronos][app] Registries loaded:', { wizards: wizards.length, themes: themes.length, views: views.length, panels: panels.length, popups: popups.length });

    wizardCatalog = wizards;
    themeOptions = themes.filter(t => t.id !== 'theme-base'); // Exclude Theme Base
    popupCatalog = Array.isArray(popups) ? popups : [];
    availableViews = (views || []).filter(v => {
      const enabled = v?.enabled;
      if (enabled === false) return false;
      const name = String(v?.name || '').trim().toLowerCase();
      return name !== 'templatebuilder';
    });

    // Default Fallback if none
    if (!themeOptions.length) {
      themeOptions.push({ id: 'chronos-blue', label: 'Chronos Blue', file: 'chronos-blue.css', accent: '#7aa2f7' });
    }

    buildWizardsMenu();

    // Update theme menu if it exists (not implemented in this file but good to be ready)
    // Re-apply stored theme if needed since options are now loaded
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    applyTheme(stored, { persist: false });

    // Build views menu now that registry is loaded
    buildViewsMenu();
    buildPopupsMenu();

    // Build panel loaders dynamically from registry
    const panelLoaders = (panels || [])
      .filter(p => p.enabled !== false)
      .map(p => () => import(new URL(`./Panels/${p.module}/index.js?v=${Date.now()}`, import.meta.url))
        .catch(err => console.error(`[Chronos][app] Failed to load ${p.module} panel`, err)));

    // Build popup loaders dynamically from registry (priority first, then module name)
    const popupLoaders = (arePopupsEnabled() ? (popups || []) : [])
      .filter(p => p.enabled !== false)
      .sort((a, b) => {
        const ma = String(a?.module || a?.id || '');
        const mb = String(b?.module || b?.id || '');
        // Hard-order critical startup sequence:
        // 1) Startup
        // 2) YesterdayCheckin
        const rank = (m) => {
          if (m === 'Startup') return 0;
          if (m === 'YesterdayCheckin') return 1;
          return 2;
        };
        const ra = rank(ma);
        const rb = rank(mb);
        if (ra !== rb) return ra - rb;
        if (ra < 2) return ma.localeCompare(mb);

        const pa = Number(a?.priority || 0);
        const pb = Number(b?.priority || 0);
        if (pa !== pb) return pb - pa;
        return ma.localeCompare(mb);
      })
      .map(p => () => import(new URL(`./Popups/${p.module}/index.js?v=${Date.now()}`, import.meta.url))
        .catch(err => console.error(`[Chronos][app] Failed to load ${p.module} popup`, err)));

    // Load panels and popups
    buildPanelsMenu();

    console.log('[Chronos][app] Loading panels and popups...', { panelCount: panelLoaders.length, popupCount: popupLoaders.length });

    // Load panels in parallel, then popups in strict sequence (priority order)
    Promise.all(panelLoaders.map(loader => loader()))
      .then(async () => {
        for (const loader of popupLoaders) {
          await loader();
        }
      })
      .then(() => console.log('[Chronos][app] All components loaded'))
      .catch(err => console.error('[Chronos][app] Error loading components:', err));
  }).catch(err => {
    console.error('[Chronos][app] Failed to load registries:', err);
  });

  function buildPanelsMenu() {
    const menu = document.getElementById('menu-panels');
    if (!menu) return;
    menu.innerHTML = '';
    const manager = window.CockpitPanels;
    if (!manager || typeof manager.list !== 'function') {
      const empty = document.createElement('div');
      empty.className = 'item disabled';
      empty.textContent = 'Open the Cockpit view to manage panels.';
      menu.appendChild(empty);
      return;
    }
    const rawPanels = manager.list?.() || [];
    if (!rawPanels.length) {
      const empty = document.createElement('div');
      empty.className = 'item disabled';
      empty.textContent = 'No panels registered.';
      menu.appendChild(empty);
      return;
    }
    const grouped = new Map();
    rawPanels.forEach(panel => {
      const key = panel.menuKey || panel.id;
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          label: panel.menuLabel || panel.label || key,
          entries: [],
          primary: null,
        });
      }
      const bucket = grouped.get(key);
      bucket.entries.push(panel);
      if (!bucket.primary || panel.menuPrimary || panel.id === key) {
        bucket.primary = panel;
      }
    });
    const panels = Array.from(grouped.values()).map(group => ({
      key: group.key,
      label: group.label,
      entries: group.entries,
      primary: group.primary || group.entries[0],
      visible: group.entries.some(p => p.visible),
    })).sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key), undefined, { sensitivity: 'base' }));
    const frag = document.createDocumentFragment();
    const createPanelItem = (panel) => {
      const item = document.createElement('div');
      item.className = 'item';
      item.setAttribute('data-search', `${panel.label || panel.key} ${panel.key || ''}`);
      item.setAttribute('data-panel', panel.primary?.id || panel.key);
      const check = document.createElement('span');
      check.className = 'check';
      check.textContent = panel.visible ? '✓' : '';
      const span = document.createElement('span');
      span.textContent = panel.label || panel.key;
      item.append(check, span);
      if (areBadgesVisible()) {
        const normalize = (value) => String(value || '').trim().toLowerCase();
        const panelLabel = normalize(panel.label || panel.key);
        const panelKey = normalize(panel.key);
        const isUrgent = URGENT_PANELS.has(panelLabel) || URGENT_PANELS.has(panelKey);
        const isPriority = PRIORITY_PANELS.has(panelLabel) || PRIORITY_PANELS.has(panelKey);
        const isLater = POST_RELEASE_PANELS.has(panelLabel) || POST_RELEASE_PANELS.has(panelKey);
        const badge = document.createElement('span');
        if (isUrgent) {
          badge.className = 'urgent-badge';
          badge.textContent = 'urgent';
          badge.title = 'Urgent panel';
        } else if (isPriority) {
          badge.className = 'priority-badge';
          badge.textContent = 'priority';
          badge.title = 'Priority panel';
        } else if (isLater) {
          badge.className = 'post-release-badge';
          badge.textContent = 'later';
          badge.title = 'Post-release feature';
        } else {
          badge.className = 'dev-badge';
          badge.textContent = 'dev';
          badge.title = 'Development feature';
        }
        item.appendChild(badge);
      }
      item.addEventListener('click', () => {
        const entries = panel.entries || [];
        if (!entries.length) {
          try { manager.toggle?.(panel.primary?.id || panel.key); } catch { }
        } else if (entries.length === 1) {
          try { manager.toggle?.(entries[0].id); } catch { }
        } else {
          const anyVisible = entries.some(entry => entry.visible);
          if (anyVisible) {
            entries.forEach(entry => {
              try { manager.setVisible?.(entry.id, false); } catch { }
            });
          } else {
            const target = panel.primary || entries[0];
            try { manager.setVisible?.(target.id, true); } catch { }
          }
        }
        setTimeout(buildPanelsMenu, 0);
      });
      return item;
    };
    const chunks = chunkForSearchLayout(panels, 9, 10);
    for (const group of chunks) {
      const column = document.createElement('div');
      column.className = 'column';
      for (const panel of group) {
        column.appendChild(createPanelItem(panel));
      }
      frag.appendChild(column);
    }
    menu.appendChild(frag);
    attachDropdownSearch(menu, 'Search panels...');
  }

  document.addEventListener('chronos:cockpit-panels', () => {
    try { console.log('[Chronos][app] Panels event', window.CockpitPanels?.list?.()); } catch { }
    buildPanelsMenu();
  });

  async function startWizardFlow(wizard) {
    if (!wizard) return;
    const moduleName = wizard.module || wizard.id;
    if (!moduleName) {
      console.warn('[Chronos][app] Wizard missing module name', wizard);
      return;
    }
    closeMenus();
    try {
      await launchWizard(moduleName, { wizard });
    } catch (err) {
      console.error('[Chronos][app] Wizard launch failed', moduleName, err);
      try {
        const toast = document.createElement('div');
        toast.textContent = `Unable to launch ${wizard.label || moduleName}`;
        toast.style.position = 'fixed';
        toast.style.bottom = '24px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.padding = '10px 16px';
        toast.style.background = '#2b3040';
        toast.style.border = '1px solid #444c63';
        toast.style.borderRadius = '8px';
        toast.style.zIndex = '999';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2200);
      } catch { }
    }
  }

  // Wizard dropdown catalog (placeholder for future multi-step flows)
  function buildWizardsMenu() {
    const menu = document.getElementById('menu-wizards');
    if (!menu) return;
    menu.innerHTML = '';
    if (!wizardCatalog.length) {
      const empty = document.createElement('div');
      empty.className = 'item disabled';
      empty.textContent = 'No wizards available yet';
      menu.appendChild(empty);
      return;
    }
    const showPostRelease = arePostReleaseItemsVisible();
    const normalize = (value) => String(value || '').trim().toLowerCase();
    const isPostReleaseWizard = (wizard) => {
      const wizardRawKey = String(wizard?.module || wizard?.id || '').trim();
      const wizardKey = normalize(wizardRawKey);
      const wizardLabel = normalize(wizard?.label);
      return Boolean(wizard?.postRelease)
        || POST_RELEASE_WIZARDS.has(wizardRawKey)
        || POST_RELEASE_WIZARDS.has(wizardKey)
        || POST_RELEASE_WIZARDS.has(wizardLabel);
    };
    const frag = document.createDocumentFragment();
    const createWizardItem = (wizard) => {
      const item = document.createElement('div');
      item.className = 'item wizard-item';
      item.setAttribute('data-search', `${wizard.label || wizard.id || ''} ${wizard.module || ''}`);
      item.setAttribute('data-wizard', wizard.id);
      if (!wizard.enabled) item.classList.add('disabled');
      const title = document.createElement('div');
      title.className = 'wizard-title';
      title.textContent = wizard.label;
      item.appendChild(title);
      const wizardRawKey = String(wizard.module || wizard.id || '').trim();
      const wizardKey = normalize(wizardRawKey);
      const wizardLabel = normalize(wizard.label);
      const isUrgentWizard = URGENT_WIZARDS.has(wizardKey) || URGENT_WIZARDS.has(wizardLabel);
      const isPriorityWizard = PRIORITY_WIZARDS.has(wizardKey) || PRIORITY_WIZARDS.has(wizardLabel);
      const postRelease = isPostReleaseWizard(wizard);
      if (areBadgesVisible()) {
        if (isUrgentWizard) {
          const badge = document.createElement('span');
          badge.className = 'urgent-badge';
          badge.textContent = 'urgent';
          badge.title = 'Urgent wizard';
          item.appendChild(badge);
        } else if (isPriorityWizard) {
          const badge = document.createElement('span');
          badge.className = 'priority-badge';
          badge.textContent = 'priority';
          badge.title = 'Priority wizard';
          item.appendChild(badge);
        } else if (postRelease) {
          const badge = document.createElement('span');
          badge.className = 'post-release-badge';
          badge.textContent = 'later';
          badge.title = 'Post-release feature';
          item.appendChild(badge);
        } else {
          const badge = document.createElement('span');
          badge.className = 'dev-badge';
          badge.textContent = 'dev';
          badge.title = 'Development feature';
          item.appendChild(badge);
        }
      }
      if (wizard.enabled) {
        item.addEventListener('click', () => startWizardFlow(wizard));
      }
      return item;
    };
    const sortedWizards = [...wizardCatalog]
      .filter(wizard => showPostRelease || !isPostReleaseWizard(wizard))
      .sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id), undefined, { sensitivity: 'base' }));
    const chunks = chunkForSearchLayout(sortedWizards, 9, 10);
    for (const group of chunks) {
      const column = document.createElement('div');
      column.className = 'column';
      for (const wizard of group) {
        column.appendChild(createWizardItem(wizard));
      }
      frag.appendChild(column);
    }
    menu.appendChild(frag);
    attachDropdownSearch(menu, 'Search wizards...');
  }

  async function launchPopupFromMenu(popup) {
    const moduleName = String(popup?.module || popup?.id || '').trim();
    if (!moduleName) return;
    try {
      window.__chronosForcePopupQueue = true;
      await import(new URL(`./Popups/${moduleName}/index.js?v=${Date.now()}&manual=1`, import.meta.url));
      closeMenus();
    } catch (err) {
      console.error('[Chronos][app] Popup launch failed', moduleName, err);
      try {
        const toast = document.createElement('div');
        toast.textContent = `Unable to launch popup ${moduleName}`;
        toast.style.position = 'fixed';
        toast.style.bottom = '24px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.padding = '10px 16px';
        toast.style.background = '#2b3040';
        toast.style.border = '1px solid #444c63';
        toast.style.borderRadius = '8px';
        toast.style.zIndex = '999';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2200);
      } catch { }
    } finally {
      window.__chronosForcePopupQueue = false;
    }
  }

  function buildDevMenu() {
    const menu = document.getElementById('menu-dev');
    if (!menu) return;
    menu.innerHTML = '';

    const mkColumn = (title) => {
      const col = document.createElement('div');
      col.className = 'column';
      const head = document.createElement('div');
      head.className = 'titlebar';
      head.textContent = title;
      col.appendChild(head);
      return col;
    };

    const mkAction = (label, onClick, { check = '', disabled = false, badge = '' } = {}) => {
      const item = document.createElement('div');
      item.className = disabled ? 'item disabled' : 'item';
      const checkEl = document.createElement('span');
      checkEl.className = 'check';
      checkEl.textContent = check;
      const textEl = document.createElement('span');
      textEl.textContent = label;
      item.append(checkEl, textEl);
      if (badge === 'later') {
        const el = document.createElement('span');
        el.className = 'post-release-badge';
        el.textContent = 'later';
        el.title = 'Post-release feature';
        item.appendChild(el);
      } else if (badge === 'dev') {
        const el = document.createElement('span');
        el.className = 'dev-badge';
        el.textContent = 'dev';
        el.title = 'Development feature';
        item.appendChild(el);
      } else if (badge === 'good-enough') {
        const el = document.createElement('span');
        el.className = 'good-enough-badge';
        el.textContent = 'good enough';
        el.title = 'Stable enough for now';
        item.appendChild(el);
      }
      if (!disabled && typeof onClick === 'function') {
        item.addEventListener('click', () => {
          try { onClick(); } finally { closeMenus(); }
        });
      }
      return item;
    };

    const mkToggle = (label, checked, onChange) => {
      const row = document.createElement('div');
      row.className = 'item';
      row.style.cursor = 'pointer';
      const checkEl = document.createElement('span');
      checkEl.className = 'check';
      checkEl.textContent = checked ? '✓' : '';
      const text = document.createElement('span');
      text.textContent = label;
      row.append(checkEl, text);
      row.addEventListener('click', () => {
        const next = !checked;
        try { onChange(next); } catch { }
        checkEl.textContent = next ? '✓' : '';
      });
      return row;
    };

    const toggleWidgetByName = (name) => {
      const el = document.querySelector(`[data-widget="${name}"]`);
      if (!el) return false;
      el.style.display = el.style.display === 'none' ? '' : 'none';
      if (el.style.display !== 'none') {
        try { window.ChronosFocusWidget?.(el); } catch { }
      }
      return true;
    };

    const isWidgetVisible = (name) => {
      const el = document.querySelector(`[data-widget="${name}"]`);
      return !!el && el.style.display !== 'none';
    };

    const isViewOpen = (name) => openPanes.some(p => p.name === name);
    const hasView = (name) => availableViews.some(v => v.name === name);
    const openView = async (name, label) => {
      try {
        if (isViewOpen(name)) closePane(name);
        else await openPane(name, label || name);
      } catch { }
    };

    const workspaceCol = mkColumn('Workspace');
    workspaceCol.append(
      mkAction('Docs View', () => { void openView('Docs', 'Docs'); }, {
        check: isViewOpen('Docs') ? '✓' : '',
        disabled: !hasView('Docs'),
      }),
      mkAction('Editor View', () => { void openView('Editor', 'Editor'); }, {
        check: isViewOpen('Editor') ? '✓' : '',
        disabled: !hasView('Editor'),
      }),
      mkAction('Debug Console Widget', () => toggleWidgetByName('DebugConsole'), {
        check: isWidgetVisible('DebugConsole') ? '✓' : '',
      }),
      mkAction('Terminal Widget', () => toggleWidgetByName('Terminal'), {
        check: isWidgetVisible('Terminal') ? '✓' : '',
      }),
      mkAction('Reload Dashboard', () => window.location.reload())
    );

    const diagnosticsCol = mkColumn('Diagnostics');
    diagnosticsCol.append(
      mkAction('Stats for Nerds', () => { void openStatsForNerds(); }, { badge: 'dev' }),
      mkAction('API Health Probe', () => { void runHealthProbe(); }),
      mkAction('Runtime Snapshot', () => {
        const snap = collectRuntimeSnapshot();
        showTextOverlay('Runtime Snapshot', JSON.stringify(snap, null, 2));
      })
    );

    const dataOpsCol = mkColumn('Data Ops');
    dataOpsCol.append(
      mkAction('Rebuild Registries (All)', () => { void runDevCommandAction('Rebuild Registries (All)', 'register all'); }),
      mkAction('Rebuild Registry: Commands', () => { void runDevCommandAction('Rebuild Registry: Commands', 'register commands'); }),
      mkAction('Rebuild Registry: Items', () => { void runDevCommandAction('Rebuild Registry: Items', 'register items'); }),
      mkAction('Rebuild Registry: Properties', () => { void runDevCommandAction('Rebuild Registry: Properties', 'register properties'); }),
      mkAction('Sequence Status', () => { void runDevCommandAction('Sequence Status', 'sequence status'); }),
      mkAction('Sequence Sync (All)', () => { void runDevCommandAction('Sequence Sync (All)', 'sequence sync'); }),
      mkAction('Sequence Trends', () => { void runDevCommandAction('Sequence Trends', 'sequence trends'); }),
      mkAction('Reset Achievements', () => { void runDevCommandAction('Reset Achievements', 'achievements reset'); }),
      mkAction('Reset XP/Level', () => { void runDevCommandAction('Reset XP/Level', 'achievements reset-progress'); }),
      mkAction('Reset Points', () => { void runDevCommandAction('Reset Points', 'points reset'); })
    );

    const showPostRelease = arePostReleaseItemsVisible();
    const togglesCol = mkColumn('Display');
    togglesCol.append(
      mkToggle('Show Later Items', showPostRelease, (enabled) => {
        setPostReleaseItemsVisible(enabled);
        buildWidgetsMenu();
        buildViewsMenu();
        buildWizardsMenu();
      }),
      mkToggle('Show Badges', areBadgesVisible(), (enabled) => {
        setBadgesVisible(enabled);
        buildWidgetsMenu();
        buildViewsMenu();
        buildWizardsMenu();
      })
    );

    menu.append(workspaceCol, diagnosticsCol, dataOpsCol, togglesCol);
  }

  // Keep menu in sync when widgets close themselves
  function hookWidgetCloseButtons() {
    ['notesClose', 'statusClose', 'todayClose'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => setTimeout(buildWidgetsMenu, 0));
    });
  }

  function buildAppearanceMenu() {
    const menu = document.getElementById('menu-appearance');
    if (!menu) return;
    menu.innerHTML = '';

    const scaleCol = document.createElement('div');
    scaleCol.className = 'column';
    const scaleHeader = document.createElement('div');
    scaleHeader.className = 'titlebar';
    scaleHeader.textContent = 'Appearance';
    const scaleRow = document.createElement('div');
    scaleRow.style.display = 'flex';
    scaleRow.style.flexDirection = 'column';
    scaleRow.style.gap = '8px';
    scaleRow.style.padding = '6px 4px';
    const scaleLabel = document.createElement('div');
    scaleLabel.style.fontWeight = '600';
    scaleLabel.textContent = 'Scale';
    const scaleValue = document.createElement('div');
    scaleValue.className = 'hint';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(UI_SCALE_MIN);
    slider.max = String(UI_SCALE_MAX);
    slider.step = '5';
    const currentPct = getStoredScalePct();
    slider.value = String(currentPct);
    scaleValue.textContent = `${currentPct}%`;
    slider.addEventListener('input', () => {
      const next = applyUiScale(slider.value);
      scaleValue.textContent = `${next}%`;
    });
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn';
    resetBtn.style.padding = '4px 8px';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
      const next = applyUiScale(100);
      slider.value = String(next);
      scaleValue.textContent = `${next}%`;
    });
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'btn';
    fullscreenBtn.style.padding = '4px 8px';
    fullscreenBtn.style.marginTop = '8px';
    const syncFullscreenButton = () => {
      fullscreenBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Enter Fullscreen';
    };
    syncFullscreenButton();
    fullscreenBtn.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch (err) {
        console.warn('[Chronos][app] Fullscreen toggle failed', err);
      } finally {
        syncFullscreenButton();
      }
    });
    scaleRow.append(scaleLabel, slider, scaleValue, resetBtn, fullscreenBtn);
    scaleCol.append(scaleHeader, scaleRow);

    const themeCol = document.createElement('div');
    themeCol.className = 'column';
    const themeHeader = document.createElement('div');
    themeHeader.className = 'titlebar';
    themeHeader.textContent = 'Themes';
    themeCol.appendChild(themeHeader);
    const accentByThemeId = {
      'chronos-blue': '#7aa2f7',
      'chronos-amber': '#f3a64c',
      'chronos-emerald': '#4de2b6',
      'chronos-rose': '#ff6fb1',
    };
    themeOptions.forEach(theme => {
      const item = document.createElement('div');
      item.className = 'item theme-item';
      item.setAttribute('data-theme', theme.id);
      const accent = String(theme.accent || accentByThemeId[theme.id] || '#7aa2f7');
      item.innerHTML = `
        <span class="check"></span>
        <span class="theme-main">
          <span class="theme-logo" style="--theme-accent:${accent};"></span>
          <span class="theme-title">${theme.label}</span>
        </span>
        <span class="theme-swatch" style="background:${accent};"></span>
      `;
      item.addEventListener('click', () => {
        applyTheme(theme.id);
        closeMenus();
      });
      themeCol.appendChild(item);
    });
    menu.append(scaleCol, themeCol);
    refreshThemeMenuChecks(themeStylesheet?.dataset.themeId);
  }

  function buildPopupsMenu() {
    const menu = document.getElementById('menu-popups');
    if (!menu) return;
    menu.innerHTML = '';

    const col = document.createElement('div');
    col.className = 'column';

    const header = document.createElement('div');
    header.className = 'titlebar';
    header.textContent = 'Popups';
    col.appendChild(header);

    const toggleWrap = document.createElement('div');
    toggleWrap.className = 'item';
    toggleWrap.style.cursor = 'pointer';
    const toggleCheck = document.createElement('span');
    toggleCheck.className = 'check';
    const popupsDisabled = !arePopupsEnabled();
    toggleCheck.textContent = popupsDisabled ? '✓' : '';
    const text = document.createElement('span');
    text.textContent = 'Disable popups';
    toggleWrap.append(toggleCheck, text);
    toggleWrap.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setPopupsEnabled(popupsDisabled);
      toggleCheck.textContent = popupsDisabled ? '' : '✓';
    });
    col.appendChild(toggleWrap);

    const listHeader = document.createElement('div');
    listHeader.className = 'titlebar';
    listHeader.textContent = 'Available';
    col.appendChild(listHeader);

    const formatLabel = (popup) => {
      const raw = String(popup?.label || popup?.module || popup?.id || '').trim();
      if (!raw) return 'Unknown';
      return raw.replace(/([a-z])([A-Z])/g, '$1 $2');
    };
    const normalize = (value) => String(value || '').trim().toLowerCase();

    const items = [...popupCatalog]
      .sort((a, b) => String(a?.module || a?.id || '').localeCompare(String(b?.module || b?.id || ''), undefined, { sensitivity: 'base' }));
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'item disabled';
      empty.textContent = 'No popups discovered.';
      col.appendChild(empty);
    } else {
      items.forEach((popup) => {
        const item = document.createElement('div');
        item.className = 'item';
        item.style.cursor = 'pointer';
        const label = document.createElement('span');
        label.textContent = formatLabel(popup);
        item.setAttribute('data-search', `${label.textContent} ${popup?.module || popup?.id || ''}`);
        item.append(label);
        if (areBadgesVisible()) {
          const popupKey = normalize(popup?.module || popup?.id || '');
          const popupLabel = normalize(popup?.label || '');
          if (popupKey === 'startup' || popupLabel === 'startup') {
            const badge = document.createElement('span');
            badge.className = 'urgent-badge';
            badge.textContent = 'urgent';
            badge.title = 'Urgent popup';
            item.appendChild(badge);
          } else {
            const badge = document.createElement('span');
            badge.className = 'good-enough-badge';
            badge.textContent = 'good enough';
            badge.title = 'Stable enough for now';
            item.appendChild(badge);
          }
        }
        item.addEventListener('click', () => {
          void launchPopupFromMenu(popup);
        });
        col.appendChild(item);
      });
    }

    menu.appendChild(col);
    attachDropdownSearch(menu, 'Search popups...');
  }
  hookWidgetCloseButtons();
  // Also observe visibility changes as a fallback
  try {
    const mo = new MutationObserver(() => buildWidgetsMenu());
    widgetEls.forEach(el => mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] }));
  } catch { }

  // View menu -> open/close panes (up to 3)
  function buildViewsMenu() {
    const viewMenu = document.getElementById('menu-view');
    if (!viewMenu) return;

    viewMenu.innerHTML = '';
    const showPostRelease = arePostReleaseItemsVisible();
    const normalize = (value) => String(value || '').trim().toLowerCase();
    const createViewItem = (v) => {
      const it = document.createElement('div');
      it.className = 'item';
      it.setAttribute('data-search', `${v.label || v.name} ${v.name || ''}`);
      it.setAttribute('data-name', v.name);
      const check = document.createElement('span');
      check.className = 'check';
      check.textContent = openPanes.some(p => p.name === v.name) ? '✓' : '';
      const span = document.createElement('span');
      span.textContent = v.label || v.name;
      it.append(check, span);
      const viewName = normalize(v.name);
      const viewLabel = normalize(v.label || v.name);
      const isUrgentView = URGENT_VIEWS.has(viewName) || URGENT_VIEWS.has(viewLabel);
      const isPriorityView = PRIORITY_VIEWS.has(viewName) || PRIORITY_VIEWS.has(viewLabel);
      const isDevView = DEV_VIEWS.has(viewName) || DEV_VIEWS.has(viewLabel);
      const isGoodEnoughView = GOOD_ENOUGH_VIEWS.has(viewName) || GOOD_ENOUGH_VIEWS.has(viewLabel);

      // Add post-release badge if marked
      if (areBadgesVisible()) {
        if (isUrgentView) {
          const badge = document.createElement('span');
          badge.className = 'urgent-badge';
          badge.textContent = 'urgent';
          badge.title = 'Urgent view';
          it.appendChild(badge);
        } else if (isPriorityView) {
          const badge = document.createElement('span');
          badge.className = 'priority-badge';
          badge.textContent = 'priority';
          badge.title = 'Priority view';
          it.appendChild(badge);
        } else if (v.postRelease) {
          const badge = document.createElement('span');
          badge.className = 'post-release-badge';
          badge.textContent = 'later';
          badge.title = 'Post-release feature';
          it.appendChild(badge);
        } else if (isGoodEnoughView) {
          const badge = document.createElement('span');
          badge.className = 'good-enough-badge';
          badge.textContent = 'good enough';
          badge.title = 'Stable enough for now';
          it.appendChild(badge);
        } else if (isDevView) {
          const badge = document.createElement('span');
          badge.className = 'dev-badge';
          badge.textContent = 'dev';
          badge.title = 'Development feature';
          it.appendChild(badge);
        }
      }
      it.addEventListener('click', async () => {
        closeMenus();
        const isOpen = openPanes.some(p => p.name === v.name);
        if (isOpen) {
          closePane(v.name);
        } else {
          await openPane(v.name, v.label);
        }
      });
      return it;
    };
    const frag = document.createDocumentFragment();
    const sortedViews = [...availableViews]
      .filter(v => showPostRelease || !v.postRelease)
      .sort((a, b) => String(a.label || a.name).localeCompare(String(b.label || b.name), undefined, { sensitivity: 'base' }));
    const chunks = chunkForSearchLayout(sortedViews, 9, 10);
    for (const group of chunks) {
      const column = document.createElement('div');
      column.className = 'column';
      for (const view of group) {
        column.appendChild(createViewItem(view));
      }
      frag.appendChild(column);
    }
    viewMenu.appendChild(frag);
    attachDropdownSearch(viewMenu, 'Search views...');
  }

  // Restore last view layout (fallback to default Calendar)
  const saved = loadViewState();
  if (saved && saved.length) {
    for (const v of saved.slice(0, MAX_PANES)) {
      try { await openPane(v.name, v.label); } catch { }
    }
  }
  if (!openPanes.length) {
    try { await openPane('Calendar', 'Calendar'); } catch { }
  }
  rebuildPaneResizers();

  console.log('[Chronos][app] Dashboard app ready');
  // Listen for widget:show to reveal/pulse a widget (e.g., ItemManager)
  try {
    (window.__chronosBus = context?.bus)?.on('widget:show', (name) => {
      const el = document.querySelector(`[data-widget="${name}"]`);
      if (!el) return;
      el.style.display = '';
      try { window.ChronosFocusWidget?.(el); } catch { }
    });
  } catch { }
});

window.addEventListener('resize', () => {
  try { applyPaneSizes(); } catch { }
  try { positionOpenDropdowns(); } catch { }
});

export { };

