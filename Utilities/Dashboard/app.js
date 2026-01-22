// Simple app bootstrapper with debug logs
import { mountWidget, mountView, launchWizard } from './core/runtime.js';

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


const panelLoaders = [
  () => import(new URL('./Panels/Schedule/index.js?v=' + Date.now(), import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load schedule panel module', err);
  }),
  () => import(new URL('./Panels/Matrix/index.js?v=' + Date.now(), import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load matrix panel module', err);
  }),
  () => import(new URL('./Panels/StatusStrip/index.js?v=' + Date.now(), import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load status strip panel module', err);
  }),
  () => import(new URL('./Panels/Commitments/index.js?v=' + Date.now(), import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load commitments panel module', err);
  }),
  () => import(new URL('./Panels/MapOfHappiness/index.js?v=' + Date.now(), import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load map of happiness panel module', err);
  }),
  () => import(new URL('./Panels/Flashcards/index.js?v=' + Date.now(), import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load flashcards panel module', err);
  }),
  () => import(new URL('./Panels/RandomPicker/index.js?v=' + Date.now(), import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load random picker panel module', err);
  }),
  () => import(new URL('./Panels/Lists/index.js?v=' + Date.now(), import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load lists panel module', err);
  }),
  () => import(new URL('./Panels/Checklist/index.js?v=' + Date.now(), import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load checklist panel module', err);
  }),
  () => import(new URL('./Panels/Deadlines/index.js?v=' + Date.now(), import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load deadlines panel module', err);
  }),
];

const popupLoaders = [
  () => import(new URL('./Pop_Ups/StatusNudge/index.js', import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load status nudge popup', err);
  }),
  () => import(new URL('./Pop_Ups/Welcome/index.js', import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load welcome popup', err);
  }),
  () => import(new URL('./Pop_Ups/DueSoon/index.js', import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load due soon popup', err);
  }),
];

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
  const DEV_VIEWS = new Set(['ADUC', 'Canvas', 'Cockpit']);
  const DEV_WIDGETS = new Set(['Link', 'Variables']);
  const availableViews = [
    { name: 'ADUC', label: 'ADUC' },
    { name: 'Cockpit', label: 'Cockpit' },
    { name: 'Calendar', label: 'Calendar' },
    { name: 'Docs', label: 'Docs' },
    { name: 'Weekly', label: 'Weekly' },
    { name: 'TemplateBuilder', label: 'Template Builder' },
    { name: 'ProjectManager', label: 'Project Manager' },
    { name: 'Canvas', label: 'Canvas' },
    { name: 'Editor', label: 'Editor' },
  ];

  const wizardCatalog = [
    {
      id: 'onboarding',
      module: 'Onboarding',
      label: 'Chronos Onboarding Wizard',
      description: 'Guided setup for nickname, categories, statuses, templates, and rewards.',
      enabled: true,
    },
    {
      id: 'big5',
      module: 'Big5',
      label: 'Big 5 Personality Assessment',
      description: 'Psychometric assessment for Openness, Conscientiousness, Extraversion, Agreeableness, and Neuroticism.',
      enabled: true,
    },
    {
      id: 'goalPlanning',
      module: 'GoalPlanning',
      label: 'Goal Planning Wizard',
      description: 'Guided flow to scope, break down, and schedule ambitious goals.',
      enabled: true,
    },
    {
      id: 'projectLaunch',
      module: 'ProjectLaunch',
      label: 'Project Launch Wizard',
      description: 'Design project milestones and kickoff tasks before writing YAML.',
      enabled: true,
    },
    {
      id: 'brainDump',
      module: 'BrainDump',
      label: 'Brain Dump Wizard',
      description: 'Rapid task capture with horizon buckets and quick refinement.',
      enabled: true,
    },
    {
      id: 'newYearResolutions',
      module: 'NewYearResolutions',
      label: 'New Year\'s Resolutions Wizard',
      description: 'Transform your dreams into actionable resolutions with affirmations for the year ahead.',
      enabled: true,
    },
    {
      id: 'selfAuthoring',
      module: 'SelfAuthoring',
      label: 'Self Authoring Suite',
      description: 'Comprehensive Past/Present/Future reflection exercises to generate goals, habits, and tasks.',
      enabled: true,
    },
    {
      id: 'futureSelfDialogue',
      module: 'FutureSelfDialogue',
      label: 'Future Self Dialogue (Vaknin)',
      description: 'Speak as future-you to past-you, write to future-you, read through past/present/future lenses, save as a journal entry.',
      enabled: true,
    },
    {
      id: 'mapOfHappiness',
      module: 'MapOfHappiness',
      label: 'Map of Happiness Wizard',
      description: 'Capture non-negotiables, cluster into needs, rank, and save map_of_happiness.yml.',
      enabled: true,
    },
  ];
  const themeOptions = [
    {
      id: 'chronos-blue',
      label: 'Chronos Blue',
      file: 'chronos-blue.css',
      description: 'Default indigo cockpit palette.',
      accent: '#7aa2f7',
    },
    {
      id: 'chronos-amber',
      label: 'Amber Drift',
      file: 'chronos-amber.css',
      description: 'Warm sunrise gradients and copper tones.',
      accent: '#f3a64c',
    },
    {
      id: 'chronos-emerald',
      label: 'Emerald Focus',
      file: 'chronos-emerald.css',
      description: 'Green focus mode pulled from the CLI themes.',
      accent: '#4de2b6',
    },
    {
      id: 'chronos-rose',
      label: 'Rose Nebula',
      file: 'chronos-rose.css',
      description: 'Vibrant magenta hues for late-night plotting.',
      accent: '#ff6fb1',
    },

  ];
  const THEME_STORAGE_KEY = 'chronos_dashboard_theme_v1';
  const themeStylesheet = document.getElementById('themeStylesheet');
  const UI_SCALE_STORAGE_KEY = 'chronos_dashboard_ui_scale_v1';
  const UI_SCALE_BASE = 0.6;
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
    const helpBtn = window.ChronosHelp?.create?.(name, { className: 'icon-btn', fallbackLabel: name });
    const close = document.createElement('button');
    close.className = 'pane-close';
    close.textContent = '✕';
    close.title = 'Close view';
    if (helpBtn) tab.append(title, helpBtn, close);
    else tab.append(title, close);
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
      try { delete window.__calendarTitleEl; delete window.__calendarUpdateTitle; } catch { }
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
  document.querySelectorAll('#topbar .menubtn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-menu');
      // Rebuild widgets menu each time it opens so checkmarks reflect current visibility
      if (id === 'widgets') buildWidgetsMenu();
      if (id === 'wizards') buildWizardsMenu();
      if (id === 'panels') buildPanelsMenu();
      if (id === 'appearance') buildAppearanceMenu();
      closeMenus();
      const menu = document.getElementById('menu-' + id);
      if (menu) menu.classList.add('open');
    });
  });
  document.addEventListener('click', closeMenus);

  // Build/rebuild widgets dropdown based on current visibility
  function buildWidgetsMenu() {
    const widgetsMenu = document.getElementById('menu-widgets');
    if (!widgetsMenu) return;
    widgetsMenu.innerHTML = '';
    const entries = widgetEls
      .map(el => {
        const fallback = el.id || el.getAttribute('data-widget') || 'widget';
        const label = el.getAttribute('data-label') || el.getAttribute('data-widget') || fallback;
        const name = el.getAttribute('data-widget') || fallback;
        return { el, label, name };
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    const createItem = ({ el, label }) => {
      const item = document.createElement('div');
      item.className = 'item';
      const check = document.createElement('span');
      check.className = 'check';
      check.textContent = (el.style.display === 'none') ? '' : '✓';
      const span = document.createElement('span');
      span.textContent = label;
      item.append(check, span);
      const name = el.getAttribute('data-widget') || label;
      if (DEV_WIDGETS.has(name)) {
        const badge = document.createElement('span');
        badge.className = 'dev-badge';
        badge.textContent = 'dev';
        badge.title = 'Under development';
        item.appendChild(badge);
      }
      item.addEventListener('click', () => {
        el.style.display = (el.style.display === 'none' ? '' : 'none');
        check.textContent = el.style.display === 'none' ? '' : '✓';
        closeMenus();
        try { if (el.style.display !== 'none') window.ChronosFocusWidget?.(el); } catch { }
      });
      return item;
    };

    const MAX_PER_COLUMN = 10;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < entries.length; i += MAX_PER_COLUMN) {
      const column = document.createElement('div');
      column.className = 'column';
      for (const entry of entries.slice(i, i + MAX_PER_COLUMN)) {
        column.appendChild(createItem(entry));
      }
      frag.appendChild(column);
    }
    widgetsMenu.appendChild(frag);
  }
  // Initial build
  buildWidgetsMenu();
  buildWizardsMenu();
  buildPanelsMenu();
  try {
    await Promise.all(panelLoaders.map(loader => loader()));
    await Promise.all(popupLoaders.map(loader => loader()));
  } catch { }

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
    const MAX_PER_COLUMN = 10;
    const frag = document.createDocumentFragment();
    const createPanelItem = (panel) => {
      const item = document.createElement('div');
      item.className = 'item';
      item.setAttribute('data-panel', panel.primary?.id || panel.key);
      const check = document.createElement('span');
      check.className = 'check';
      check.textContent = panel.visible ? '✓' : '';
      const span = document.createElement('span');
      span.textContent = panel.label || panel.key;
      item.append(check, span);
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
    for (let i = 0; i < panels.length; i += MAX_PER_COLUMN) {
      const column = document.createElement('div');
      column.className = 'column';
      for (const panel of panels.slice(i, i + MAX_PER_COLUMN)) {
        column.appendChild(createPanelItem(panel));
      }
      frag.appendChild(column);
    }
    menu.appendChild(frag);
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
    const MAX_PER_COLUMN = 10;
    const frag = document.createDocumentFragment();
    const createWizardItem = (wizard) => {
      const item = document.createElement('div');
      item.className = 'item wizard-item';
      item.setAttribute('data-wizard', wizard.id);
      if (!wizard.enabled) item.classList.add('disabled');
      const title = document.createElement('div');
      title.className = 'wizard-title';
      title.textContent = wizard.label;
      item.appendChild(title);
      if (wizard.enabled) {
        item.addEventListener('click', () => startWizardFlow(wizard));
      }
      return item;
    };
    const sortedWizards = [...wizardCatalog].sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id), undefined, { sensitivity: 'base' }));
    for (let i = 0; i < sortedWizards.length; i += MAX_PER_COLUMN) {
      const column = document.createElement('div');
      column.className = 'column';
      for (const wizard of sortedWizards.slice(i, i + MAX_PER_COLUMN)) {
        column.appendChild(createWizardItem(wizard));
      }
      frag.appendChild(column);
    }
    menu.appendChild(frag);
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
    scaleRow.append(scaleLabel, slider, scaleValue, resetBtn);
    scaleCol.append(scaleHeader, scaleRow);

    const themeCol = document.createElement('div');
    themeCol.className = 'column';
    const themeHeader = document.createElement('div');
    themeHeader.className = 'titlebar';
    themeHeader.textContent = 'Themes';
    themeCol.appendChild(themeHeader);
    themeOptions.forEach(theme => {
      const item = document.createElement('div');
      item.className = 'item theme-item';
      item.setAttribute('data-theme', theme.id);
      item.innerHTML = `
        <span class="check"></span>
        <span class="theme-title">${theme.label}</span>
        <span class="theme-swatch" style="background:${theme.accent};"></span>
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
  hookWidgetCloseButtons();
  // Also observe visibility changes as a fallback
  try {
    const mo = new MutationObserver(() => buildWidgetsMenu());
    widgetEls.forEach(el => mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] }));
  } catch { }

  // View menu -> open/close panes (up to 3)
  const viewMenu = document.getElementById('menu-view');
  if (viewMenu) {
    viewMenu.innerHTML = '';
    const createViewItem = (v) => {
      const it = document.createElement('div');
      it.className = 'item';
      it.setAttribute('data-name', v.name);
      const check = document.createElement('span');
      check.className = 'check';
      check.textContent = openPanes.some(p => p.name === v.name) ? '✓' : '';
      const span = document.createElement('span');
      span.textContent = v.label;
      it.append(check, span);
      if (DEV_VIEWS.has(v.name)) {
        const badge = document.createElement('span');
        badge.className = 'dev-badge';
        badge.textContent = 'dev';
        badge.title = 'Under development';
        it.appendChild(badge);
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
    const MAX_PER_COLUMN = 10;
    const frag = document.createDocumentFragment();
    const sortedViews = [...availableViews].sort((a, b) => String(a.label || a.name).localeCompare(String(b.label || b.name), undefined, { sensitivity: 'base' }));
    for (let i = 0; i < sortedViews.length; i += MAX_PER_COLUMN) {
      const column = document.createElement('div');
      column.className = 'column';
      for (const view of sortedViews.slice(i, i + MAX_PER_COLUMN)) {
        column.appendChild(createViewItem(view));
      }
      frag.appendChild(column);
    }
    viewMenu.appendChild(frag);
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
});

export { };
