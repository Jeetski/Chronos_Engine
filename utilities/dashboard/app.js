// Simple app bootstrapper with debug logs
import { mountWidget, mountView, launchWizard, mountGadget } from './core/runtime.js';
try { window.__CHRONOS_APP_MANAGED_MOUNTS = true; } catch { }
const POPUPS_ENABLED_STORAGE_KEY = 'chronos_dashboard_popups_enabled_v1';
const SHOW_POST_RELEASE_STORAGE_KEY = 'chronos_dashboard_show_post_release_v1';
const SHOW_BADGES_STORAGE_KEY = 'chronos_dashboard_show_badges_v1';
const DISABLED_GADGETS_STORAGE_KEY = 'chronos_dashboard_disabled_gadgets_v1';
const DOCK_DOCKED_STORAGE_KEY = 'chronos_dashboard_dock_docked_v1';
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
const DEV_VIEWS = new Set(['atlas', 'calendar', 'cockpit', 'project manager', 'template builder', 'weekly']);
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
const URGENT_PANELS = new Set(['status chart', 'status strip', 'schedule panel', 'matrix', 'matrix visuals']);
const URGENT_GADGETS = new Set(['timer', 'reschedule']);
const DEV_GADGETS = new Set(['progress gauge', 'progress_gauge']);

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

function getGadgetKey(gadget) {
  return String(gadget?.id || gadget?.module || '').trim();
}

function getDisabledGadgets() {
  try {
    const raw = localStorage.getItem(DISABLED_GADGETS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((v) => String(v || '').trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function setDisabledGadgets(disabledKeys) {
  try {
    const values = Array.from(disabledKeys || [])
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    localStorage.setItem(DISABLED_GADGETS_STORAGE_KEY, JSON.stringify(values));
  } catch { }
}

function isDockPinned() {
  try {
    if (typeof window !== 'undefined' && typeof window.ChronosDockIsDocked === 'function') {
      return !!window.ChronosDockIsDocked();
    }
  } catch { }
  try {
    return localStorage.getItem(DOCK_DOCKED_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function setDockPinned(next) {
  const pinned = !!next;
  try { localStorage.setItem(DOCK_DOCKED_STORAGE_KEY, pinned ? 'true' : 'false'); } catch { }
  try {
    if (typeof window !== 'undefined' && typeof window.ChronosDockSetDocked === 'function') {
      window.ChronosDockSetDocked(pinned);
    }
  } catch { }
  return pinned;
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

function setupDockReveal(gadgets = []) {
  const dock = document.getElementById('chronosDock');
  const hotzone = document.getElementById('dockHotzone');
  const dockShell = document.getElementById('chronosDockShell');
  if (!dock || !hotzone || !dockShell) return;

  const showDockToast = (text, tone = 'info', ms = 2000) => {
    const toast = document.createElement('div');
    toast.textContent = String(text || '');
    toast.style.position = 'fixed';
    toast.style.bottom = '76px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.padding = '9px 14px';
    toast.style.borderRadius = '10px';
    toast.style.zIndex = '1001';
    toast.style.border = '1px solid #444c63';
    toast.style.background = '#2b3040';
    toast.style.color = '#e6e8ef';
    if (tone === 'success') {
      toast.style.border = '1px solid rgba(91,220,130,.55)';
      toast.style.background = 'rgba(24,54,38,.95)';
    } else if (tone === 'error') {
      toast.style.border = '1px solid rgba(255,120,120,.55)';
      toast.style.background = 'rgba(62,30,36,.95)';
    }
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), ms);
  };

  if (!dock.dataset.revealBound) {
    let hideTimer = null;
    let isVisible = false;
    let isHoveringDock = false;
    let isDocked = true;
    const BOTTOM_TRIGGER_PX = 26;

    isDocked = isDockPinned();
    dock.dataset.docked = isDocked ? 'true' : 'false';

    const clearHideTimer = () => {
      if (!hideTimer) return;
      clearTimeout(hideTimer);
      hideTimer = null;
    };

    const showDock = () => {
      clearHideTimer();
      if (isVisible) return;
      isVisible = true;
      dock.classList.add('is-visible');
    };

    const hideDock = (delay = 220) => {
      if (isDocked) {
        showDock();
        return;
      }
      clearHideTimer();
      hideTimer = setTimeout(() => {
        if (isHoveringDock) return;
        isVisible = false;
        dock.classList.remove('is-visible');
        hideTimer = null;
      }, delay);
    };

    const setDocked = (next) => {
      isDocked = !!next;
      dock.dataset.docked = isDocked ? 'true' : 'false';
      try { localStorage.setItem(DOCK_DOCKED_STORAGE_KEY, isDocked ? 'true' : 'false'); } catch { }
      if (isDocked) showDock();
      else hideDock(0);
    };

    try {
      window.ChronosDockReveal = () => showDock();
      window.ChronosDockSetDocked = (next) => setDocked(!!next);
      window.ChronosDockIsDocked = () => isDocked;
    } catch { }

    if (isDocked) showDock();

    hotzone.addEventListener('mouseenter', showDock);
    dock.addEventListener('mouseenter', () => {
      isHoveringDock = true;
      showDock();
    });
    dock.addEventListener('mouseleave', () => {
      isHoveringDock = false;
      hideDock(120);
    });

    window.addEventListener('pointermove', (ev) => {
      if (ev.clientY >= (window.innerHeight - BOTTOM_TRIGGER_PX)) {
        showDock();
        return;
      }
      if (!isHoveringDock) hideDock(240);
    }, { passive: true });

    window.addEventListener('blur', () => hideDock(0));
    document.addEventListener('mouseleave', () => hideDock(0));
    dockShell.addEventListener('click', (ev) => {
      if (ev.target !== dockShell) return;
      setDocked(!isDocked);
    });
    dock.dataset.revealBound = '1';
  }

  dockShell.innerHTML = '';
  const disabled = getDisabledGadgets();
  const items = Array.isArray(gadgets)
    ? gadgets.filter((g) => g && g.enabled !== false && !disabled.has(getGadgetKey(g)))
    : [];
  items
    .sort((a, b) => {
      const ao = Number(a.order ?? 100);
      const bo = Number(b.order ?? 100);
      if (ao !== bo) return ao - bo;
      return String(a.label || a.module || '').localeCompare(String(b.label || b.module || ''), undefined, { sensitivity: 'base' });
    })
    .forEach((gadget) => {
      const host = document.createElement('div');
      host.className = 'dock-gadget';
      host.dataset.gadget = String(gadget.id || gadget.module || '');
      dockShell.appendChild(host);
      mountGadget(host, gadget.module, {
        apiBase,
        showToast: showDockToast,
        bus: window.ChronosBus,
        gadget,
      });
    });
}

async function startChronosDay(options = {}) {
  const target = options.target || 'day';
  const source = options.source || 'dashboard';
  const result = await requestWithSleepInterrupt('/api/day/start', { target });
  const data = result?.data || {};
  if (result?.canceled) {
    const reason = result?.choice === 'edit_sleep' ? 'Sleep settings opened.' : 'Start canceled.';
    return { ok: false, canceled: true, reason };
  }
  if (!result?.response?.ok || data.ok === false) {
    const msg = data.error || data.stderr || `Start failed (HTTP ${result?.response?.status || 'unknown'})`;
    throw new Error(msg);
  }
  try { window.ChronosBus?.emit?.('timer:show', { source }); } catch { }
  try { window.ChronosBus?.emit?.('timer:refresh'); } catch { }
  try { window.calendarLoadToday?.(true); } catch { }
  return data;
}

try { window.ChronosStartDay = startChronosDay; } catch { }
try { window.ChronosRunCliCommand = runCliCommandWithSleepInterrupt; } catch { }

async function postJson(path, payload) {
  const resp = await fetch(apiBase() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await resp.json().catch(() => ({}));
  return { response: resp, data };
}

async function ensureSleepConflictPopup() {
  // Sleep conflict is a required command interrupt, not an ambient popup.
  // It must work even when normal popups are globally disabled.
  if (typeof window !== 'undefined' && typeof window.ChronosShowSleepConflictPopup === 'function') {
    return window.ChronosShowSleepConflictPopup;
  }
  try {
    window.__chronosForcePopupQueue = true;
    await import(new URL(`./popups/sleep_conflict/index.js?v=${Date.now()}&manual=1`, import.meta.url));
  } finally {
    window.__chronosForcePopupQueue = false;
  }
  if (typeof window !== 'undefined' && typeof window.ChronosShowSleepConflictPopup === 'function') {
    return window.ChronosShowSleepConflictPopup;
  }
  throw new Error('Sleep conflict popup failed to load');
}

async function resolveSleepInterrupt(interrupt) {
  const showPopup = await ensureSleepConflictPopup();
  const choice = await showPopup(interrupt || {});
  if (choice === 'edit_sleep') {
    try { window.ChronosBus?.emit?.('widget:show', 'SleepSettings'); } catch { }
  }
  return choice;
}

async function requestWithSleepInterrupt(path, payload, attempt = 0) {
  const result = await postJson(path, payload);
  const interrupt = result?.data?.interrupt;
  if (result?.response?.status !== 409 || interrupt?.type !== 'sleep_conflict') {
    return result;
  }
  if (attempt >= 3) {
    throw new Error('Sleep conflict resolution exceeded retry limit');
  }
  const choice = await resolveSleepInterrupt(interrupt);
  if (!choice || choice === 'go_back_to_sleep' || choice === 'edit_sleep') {
    return { ...result, canceled: true, choice };
  }
  const nextPayload = { ...(payload || {}) };
  if (path === '/api/cli') {
    nextPayload.properties = { ...(nextPayload.properties || {}), sleep_policy: choice };
  } else {
    nextPayload.sleep_policy = choice;
  }
  return requestWithSleepInterrupt(path, nextPayload, attempt + 1);
}

async function runCliCommandWithSleepInterrupt({ command, args = [], properties = {} } = {}) {
  return requestWithSleepInterrupt('/api/cli', { command, args, properties });
}


// Panel loaders will be built dynamically from registry

// Popup loaders will be built dynamically from registry

ready(async () => {
  console.log('[Chronos][app] Booting dashboard app');
  let bootOverlay = null;
  let bootMessage = null;
  let bootFailed = false;
  const ensureBootOverlay = () => {
    if (bootOverlay) return;
    try {
      bootOverlay = document.createElement('div');
      bootOverlay.style.position = 'fixed';
      bootOverlay.style.top = '34px';
      bootOverlay.style.left = '12px';
      bootOverlay.style.zIndex = '30000';
      bootOverlay.style.maxWidth = '560px';
      bootOverlay.style.padding = '8px 12px';
      bootOverlay.style.borderRadius = '10px';
      bootOverlay.style.border = '1px solid rgba(122,162,247,0.35)';
      bootOverlay.style.background = 'rgba(10,14,22,0.9)';
      bootOverlay.style.color = '#dbe7ff';
      bootOverlay.style.font = '12px/1.35 Consolas, Menlo, monospace';
      bootOverlay.style.whiteSpace = 'pre-wrap';
      bootOverlay.style.pointerEvents = 'none';
      bootOverlay.style.boxShadow = '0 14px 40px rgba(0,0,0,0.35)';
      bootMessage = document.createElement('div');
      bootOverlay.appendChild(bootMessage);
      document.body.appendChild(bootOverlay);
    } catch { }
  };
  const bootStep = (message) => {
    console.log(`[Chronos][boot] ${message}`);
    if (bootFailed) return;
    ensureBootOverlay();
    if (bootMessage) bootMessage.textContent = String(message || '');
  };
  const bootFail = (message, error) => {
    bootFailed = true;
    console.error(`[Chronos][boot] ${message}`, error);
    ensureBootOverlay();
    if (bootOverlay) {
      bootOverlay.style.borderColor = 'rgba(255,120,120,0.55)';
      bootOverlay.style.color = '#ffd5d5';
    }
    if (bootMessage) {
      bootMessage.textContent = `${message}\n${String(error?.stack || error || '')}`.trim();
    }
  };
  const bootDone = () => {
    if (bootFailed) return;
    try { bootOverlay?.remove(); } catch { }
  };

  // Ensure logo loads when opened via file:// by pointing to API base
  try {
    const logo = document.getElementById('chronosLogo');
    if (logo) {
      const want = apiBase() + '/assets/images/logo_no_background.png';
      if (!logo.src || logo.src.startsWith('file:') || logo.src.endsWith('/assets/images/logo_no_background.png')) {
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
  let gadgetCatalog = [];
  const THEME_STORAGE_KEY = 'chronos_dashboard_theme_v1';
  const themeStylesheet = document.getElementById('themeStylesheet');
  const UI_SCALE_STORAGE_KEY = 'chronos_dashboard_ui_scale_v1';
  // Rebased scale curve: 100% now matches the previous 140% visual size.
  const UI_SCALE_BASE = 0.84;
  const UI_SCALE_MIN = 60;
  const UI_SCALE_MAX = 140;
  const DASHBOARD_SETTINGS = window.CHRONOS_SETTINGS || {};
  const DEFAULT_SHORTCUT_BINDINGS = Object.freeze({
    reopen_last_closed: 'Ctrl+Shift+Space',
    open_nia: 'Ctrl+/',
    shortcut_help: '?',
    close_focused_surface: 'Escape',
    focus_next_surface: 'Ctrl',
    focus_previous_surface: 'Ctrl+.',
    quick_slots: {
      '0': 'view.calendar',
      '1': 'widget.today',
      '2': 'widget.terminal',
      '3': 'widget.notes',
      '4': 'widget.status',
      '5': 'widget.timer',
      '6': 'widget.item_manager',
      '7': 'view.weekly',
      '8': 'view.cockpit',
      '9': 'widget.review',
    },
  });
  const SHORTCUT_ACTION_ORDER = [
    'reopen_last_closed',
    'open_nia',
    'shortcut_help',
    'close_focused_surface',
    'focus_next_surface',
    'focus_previous_surface',
  ];
  const SHORTCUT_ACTIONS_ALLOWED_IN_EDITORS = new Set([
    'shortcut_help',
    'open_nia',
    'focus_next_surface',
    'focus_previous_surface',
  ]);

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
    const desiredHref = `./themes/${theme.file}`;
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
  const closedSurfaceHistory = [];
  let focusedSurface = null;
  let shortcutBindings = {
    reopen_last_closed: DEFAULT_SHORTCUT_BINDINGS.reopen_last_closed,
    open_nia: DEFAULT_SHORTCUT_BINDINGS.open_nia,
    shortcut_help: DEFAULT_SHORTCUT_BINDINGS.shortcut_help,
    close_focused_surface: DEFAULT_SHORTCUT_BINDINGS.close_focused_surface,
    focus_next_surface: DEFAULT_SHORTCUT_BINDINGS.focus_next_surface,
    focus_previous_surface: DEFAULT_SHORTCUT_BINDINGS.focus_previous_surface,
    quick_slots: { ...DEFAULT_SHORTCUT_BINDINGS.quick_slots },
  };

  function ensureViewShell() {
    if (!viewRoot) return;
    if (viewPanes && viewEmpty) return;
    viewRoot.innerHTML = '';
    viewPanes = document.createElement('div');
    viewPanes.className = 'view-panes';
    viewEmpty = document.createElement('div');
    viewEmpty.className = 'view-empty';
    viewRoot.append(viewPanes, viewEmpty);
    renderEmptyStateContents();
  }
  ensureViewShell();

  function updateEmptyState() {
    if (!viewEmpty) return;
    viewEmpty.style.display = openPanes.length ? 'none' : '';
    if (!openPanes.length) renderEmptyStateContents();
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
    pane.dataset.viewName = name;
    const tab = document.createElement('div');
    tab.className = 'pane-tab';
    const title = document.createElement('span');
    title.className = 'pane-title';
    title.textContent = label || name;
    let calendarBackBtn = null;
    let calendarRefreshBtn = null;
    const isCalendarPane = String(name || label || '').trim().toLowerCase() === 'calendar'
      || String(label || '').trim().toLowerCase() === 'calendar';
    if (isCalendarPane) {
      calendarBackBtn = document.createElement('button');
      calendarBackBtn.type = 'button';
      calendarBackBtn.className = 'pane-back';
      calendarBackBtn.textContent = '←';
      calendarBackBtn.title = 'Return to previous calendar level';
      calendarBackBtn.setAttribute('aria-label', 'Back');
      calendarBackBtn.style.padding = '0';
      calendarBackBtn.style.width = '28px';
      calendarBackBtn.style.height = '28px';
      calendarBackBtn.style.marginLeft = '8px';
      calendarBackBtn.style.fontSize = '16px';
      calendarBackBtn.style.lineHeight = '1';

      calendarRefreshBtn = document.createElement('button');
      calendarRefreshBtn.type = 'button';
      calendarRefreshBtn.className = 'pane-back';
      calendarRefreshBtn.textContent = '↻';
      calendarRefreshBtn.title = 'Refresh day list';
      calendarRefreshBtn.setAttribute('aria-label', 'Refresh');
      calendarRefreshBtn.style.padding = '0';
      calendarRefreshBtn.style.width = '28px';
      calendarRefreshBtn.style.height = '28px';
      calendarRefreshBtn.style.fontSize = '16px';
      calendarRefreshBtn.style.lineHeight = '1';
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
      if (isCalendarPane) {
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
      setFocusedSurface({ type: 'view', name, label: label || name });
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
    window.ChronosOpenEditorFile = async (path, line) => {
      const req = {
        path: String(path || '').replace(/\\/g, '/'),
        line: Number.isFinite(Number(line)) ? Number(line) : undefined,
      };
      if (!req.path) return;
      try { window.__chronosEditorOpenRequest = req; } catch { }
      await openPane('Editor', 'Editor');
      try { window.ChronosBus?.emit?.('editor:open', req); } catch { }
      try {
        setTimeout(() => {
          try { window.ChronosBus?.emit?.('editor:open', req); } catch { }
        }, 120);
      } catch { }
    };
    window.ChronosOpenSettingsFile = async (path) => {
      const req = {
        path: String(path || '').replace(/\\/g, '/'),
      };
      req.file = req.path.split('/').pop();
      if (!req.file) return;
      try { window.__chronosSettingsOpenRequest = req; } catch { }
      try { window.ChronosBus?.emit?.('widget:show', 'Settings'); } catch { }
      try { window.ChronosBus?.emit?.('settings:open', req); } catch { }
      try {
        setTimeout(() => {
          try { window.ChronosBus?.emit?.('settings:open', req); } catch { }
        }, 120);
      } catch { }
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
    rememberClosedSurface({ type: 'view', name: pane.name, label: pane.label || pane.name });
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
  bootStep(`Mounting ${widgetEls.length} widgets`);
  for (const el of widgetEls) {
    const name = el.getAttribute('data-widget');
    try { await mountWidget(el, name); } catch (e) { console.error('[Chronos][app] Widget mount error:', name, e); }
  }
  bootStep('Widgets mounted');

  function setFocusedSurface(surface) {
    if (!surface || !surface.type || !surface.name) return;
    focusedSurface = { type: surface.type, name: surface.name };
  }

  function rememberClosedSurface(surface) {
    if (!surface || !surface.type || !surface.name) return;
    const normalized = {
      type: String(surface.type).toLowerCase(),
      name: String(surface.name).trim(),
      label: String(surface.label || '').trim(),
    };
    if (!normalized.name) return;
    const top = closedSurfaceHistory[closedSurfaceHistory.length - 1];
    if (top && top.type === normalized.type && normalizeActionToken(top.name) === normalizeActionToken(normalized.name)) return;
    closedSurfaceHistory.push(normalized);
    if (closedSurfaceHistory.length > 24) closedSurfaceHistory.shift();
  }

  function isWidgetVisibleByElement(el) {
    return !!el && el.style.display !== 'none';
  }

  function setWidgetVisibility(el, visible, { recordHistory = true, focus = true } = {}) {
    if (!el) return false;
    const wasVisible = isWidgetVisibleByElement(el);
    if (visible) {
      el.style.display = '';
      el.classList.remove('minimized');
      if (focus) {
        try { window.ChronosFocusWidget?.(el); } catch { }
        setFocusedSurface({ type: 'widget', name: el.getAttribute('data-widget') || el.id || '', label: el.getAttribute('data-label') || '' });
      }
    } else {
      if (recordHistory && wasVisible) {
        rememberClosedSurface({ type: 'widget', name: el.getAttribute('data-widget') || el.id || '', label: el.getAttribute('data-label') || '' });
      }
      el.style.display = 'none';
    }
    return true;
  }

  function toggleWidgetVisibility(el) {
    if (!el) return false;
    return setWidgetVisibility(el, !isWidgetVisibleByElement(el));
  }

  function minimizeWidgetElement(el) {
    if (!el || !isWidgetVisibleByElement(el)) return false;
    el.classList.toggle('minimized');
    if (!el.classList.contains('minimized')) {
      try { window.ChronosFocusWidget?.(el); } catch { }
    }
    setFocusedSurface({ type: 'widget', name: el.getAttribute('data-widget') || el.id || '', label: el.getAttribute('data-label') || '' });
    return true;
  }

  function openWidgetByName(name) {
    const el = findWidgetElementByName(name);
    return setWidgetVisibility(el, true);
  }

  function closeWidgetByName(name) {
    const el = findWidgetElementByName(name);
    return setWidgetVisibility(el, false);
  }

  function getSurfaceElements() {
    const out = [];
    widgetEls.forEach((el) => {
      if (!isWidgetVisibleByElement(el)) return;
      out.push({
        type: 'widget',
        name: el.getAttribute('data-widget') || el.id || '',
        label: el.getAttribute('data-label') || el.getAttribute('data-widget') || '',
        element: el,
      });
    });
    openPanes.forEach((pane) => {
      out.push({
        type: 'view',
        name: pane.name,
        label: pane.label || pane.name,
        element: pane.pane,
      });
    });
    return out;
  }

  function getCurrentFocusedSurface() {
    const active = document.activeElement;
    const surfaceNode = active?.closest?.('.widget, .view-pane');
    if (surfaceNode?.classList?.contains('widget')) {
      return {
        type: 'widget',
        name: surfaceNode.getAttribute('data-widget') || surfaceNode.id || '',
        element: surfaceNode,
      };
    }
    if (surfaceNode?.classList?.contains('view-pane')) {
      const pane = openPanes.find((entry) => entry.pane === surfaceNode);
      if (pane) return { type: 'view', name: pane.name, element: pane.pane };
    }
    if (focusedSurface?.type === 'widget') {
      const widget = findWidgetElementByName(focusedSurface.name);
      if (widget && isWidgetVisibleByElement(widget)) {
        return { type: 'widget', name: widget.getAttribute('data-widget') || widget.id || '', element: widget };
      }
    }
    if (focusedSurface?.type === 'view') {
      const pane = openPanes.find((entry) => normalizeActionToken(entry.name) === normalizeActionToken(focusedSurface.name));
      if (pane) return { type: 'view', name: pane.name, element: pane.pane };
    }
    const surfaces = getSurfaceElements();
    return surfaces.length ? surfaces[surfaces.length - 1] : null;
  }

  function isEditableTarget(target) {
    if (!target) return false;
    return !!target.closest('input, textarea, select, [contenteditable="true"], .cm-editor, .monaco-editor');
  }

  function renderShortcutOverlayText() {
    return getShortcutSummaryGroups()
      .map((group) => {
        const lines = [group.title];
        group.items.forEach((item) => lines.push(`  ${item.combo}  ${item.label}`));
        return lines.join('\n');
      })
      .join('\n\n');
  }

  function showShortcutHelpOverlay() {
    showTextOverlay('Dashboard Shortcuts', renderShortcutOverlayText());
  }

  let editorOpenPollBusy = false;
  async function consumeEditorOpenRequest() {
    if (editorOpenPollBusy) return;
    editorOpenPollBusy = true;
    try {
      const r = await fetch(apiBase() + '/api/editor/open-request');
      if (!r.ok) return;
      const j = await r.json().catch(() => ({}));
      const req = j?.request;
      if (!req || !req.path) return;
      await window.ChronosOpenEditorFile?.(req.path, req.line);
    } catch { }
    finally {
      editorOpenPollBusy = false;
    }
  }
  try {
    window.setTimeout(() => { void consumeEditorOpenRequest(); }, 450);
    window.setInterval(() => { void consumeEditorOpenRequest(); }, 1500);
  } catch { }

  let docsOpenPollBusy = false;
  async function consumeDocsOpenRequest() {
    if (docsOpenPollBusy) return;
    docsOpenPollBusy = true;
    try {
      const r = await fetch(apiBase() + '/api/docs/open-request');
      if (!r.ok) return;
      const j = await r.json().catch(() => ({}));
      const req = j?.request;
      if (!req) return;
      await window.ChronosOpenDoc?.(req.path, req.line);
    } catch { }
    finally {
      docsOpenPollBusy = false;
    }
  }
  try {
    window.setTimeout(() => { void consumeDocsOpenRequest(); }, 500);
    window.setInterval(() => { void consumeDocsOpenRequest(); }, 1500);
  } catch { }

  function _trickWidgetCandidates(req) {
    const out = [];
    const add = (v) => {
      const s = String(v || '').trim();
      if (!s) return;
      if (!out.some(x => x.toLowerCase() === s.toLowerCase())) out.push(s);
    };
    add(req?.module);
    add(req?.label);
    add(req?.name);
    const surface = String(req?.surface || '').trim().toLowerCase();
    const parts = surface.split('.');
    if (parts.length >= 2) add(parts[1]);
    const toPascal = (v) => String(v || '')
      .trim()
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map(tok => tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase())
      .join('');
    const seed = [...out];
    for (const v of seed) add(toPascal(v));
    return out;
  }

  function _findWidgetByTrick(req) {
    const candidates = _trickWidgetCandidates(req).map(v => v.toLowerCase());
    if (!candidates.length) return null;
    const widgets = Array.from(document.querySelectorAll('[data-widget]'));
    for (const el of widgets) {
      const name = String(el.getAttribute('data-widget') || '').trim().toLowerCase();
      const label = String(el.getAttribute('data-label') || '').trim().toLowerCase();
      if (candidates.includes(name) || candidates.includes(label)) return el;
    }
    return null;
  }

  function normalizeActionToken(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  function normalizeShortcutCombo(raw) {
    const source = String(raw || '').trim();
    if (!source) return '';
    const explicit = source.replace(/\s+/g, '');
    if (explicit === '?') return '?';
    const parts = source
      .split('+')
      .map((part) => String(part || '').trim())
      .filter(Boolean);
    if (!parts.length) return '';
    const modifiers = [];
    let key = '';
    parts.forEach((part) => {
      const rawPart = String(part || '').trim();
      if (!rawPart) return;
      if (rawPart === '/') { key = '/'; return; }
      if (rawPart === '?') { key = '?'; return; }
      if (rawPart === '.') { key = '.'; return; }
      if (rawPart === ',') { key = ','; return; }
      const token = normalizeActionToken(part);
      if (!token) return;
      if (token === 'control' || token === 'ctrl') modifiers.push('Ctrl');
      else if (token === 'alt' || token === 'option') modifiers.push('Alt');
      else if (token === 'shift') modifiers.push('Shift');
      else if (token === 'meta' || token === 'cmd' || token === 'command' || token === 'super' || token === 'win') modifiers.push('Meta');
      else if (token === 'escape' || token === 'esc') key = 'Escape';
      else if (token === 'space' || token === 'spacebar') key = 'Space';
      else if (token === 'period') key = '.';
      else if (token === 'comma') key = ',';
      else if (token === 'slash') key = '/';
      else if (token === 'question') key = '?';
      else if (/^digit[0-9]$/.test(token)) key = token.slice(-1);
      else if (/^key[a-z]$/.test(token)) key = token.slice(-1).toUpperCase();
      else if (token.length === 1) key = /[a-z]/.test(token) ? token.toUpperCase() : token;
      else key = part.length <= 1 ? part : part.charAt(0).toUpperCase() + part.slice(1);
    });
    const ordered = ['Ctrl', 'Alt', 'Shift', 'Meta'].filter((mod) => modifiers.includes(mod));
    return [...ordered, key].filter(Boolean).join('+');
  }

  function eventToShortcutCombo(ev) {
    if (!ev.ctrlKey && !ev.altKey && !ev.metaKey && String(ev.key || '') === '?') return '?';
    const modifiers = [];
    if (ev.ctrlKey) modifiers.push('Ctrl');
    if (ev.altKey) modifiers.push('Alt');
    if (ev.shiftKey) modifiers.push('Shift');
    if (ev.metaKey) modifiers.push('Meta');
    let key = String(ev.key || '');
    if (key === ' ') key = 'Space';
    else if (key.length === 1) key = /[a-z]/i.test(key) ? key.toUpperCase() : key;
    else if (key === 'Esc') key = 'Escape';
    return normalizeShortcutCombo([...modifiers, key].join('+'));
  }

  function readShortcutBindings() {
    const configured = DASHBOARD_SETTINGS.dashboard_key_bindings;
    const source = (configured && typeof configured === 'object' && configured.bindings && typeof configured.bindings === 'object')
      ? configured.bindings
      : {};
    const next = {
      quick_slots: { ...DEFAULT_SHORTCUT_BINDINGS.quick_slots },
    };
    SHORTCUT_ACTION_ORDER.forEach((action) => {
      const configuredValue = source[action];
      next[action] = normalizeShortcutCombo(configuredValue || DEFAULT_SHORTCUT_BINDINGS[action] || '');
    });
    const configuredSlots = (source.quick_slots && typeof source.quick_slots === 'object') ? source.quick_slots : {};
    Object.keys(DEFAULT_SHORTCUT_BINDINGS.quick_slots).forEach((slot) => {
      const candidate = configuredSlots[slot];
      next.quick_slots[slot] = String(candidate || DEFAULT_SHORTCUT_BINDINGS.quick_slots[slot] || '').trim();
    });
    return next;
  }

  shortcutBindings = readShortcutBindings();
  try {
    if (!openPanes.length) renderEmptyStateContents();
  } catch { }

  function prettifyTargetLabel(raw) {
    const source = String(raw || '').trim();
    if (!source) return 'Unknown';
    return source
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map((part) => {
        const lower = String(part || '').toLowerCase();
        if (!lower) return '';
        if (['mp3', 'api', 'ai', 'ui', 'ux'].includes(lower)) return lower.toUpperCase();
        if (lower === 'nia') return 'Nia';
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(' ');
  }

  function findWidgetElementByName(name) {
    const wanted = normalizeActionToken(name);
    if (!wanted) return null;
    const widgets = Array.from(document.querySelectorAll('[data-widget]'));
    return widgets.find((el) => normalizeActionToken(el.getAttribute('data-widget') || el.id || '') === wanted) || null;
  }

  function findViewByName(name) {
    const wanted = normalizeActionToken(name);
    if (!wanted) return null;
    return availableViews.find((view) => normalizeActionToken(view?.name || view?.label || '') === wanted) || null;
  }

  function getTargetLabel(target) {
    const raw = String(target || '').trim();
    if (!raw) return 'Unknown';
    const [kind, name] = raw.split('.', 2);
    const token = normalizeActionToken(name);
    if (String(kind || '').toLowerCase() === 'widget') {
      const el = findWidgetElementByName(token);
      return el?.getAttribute('data-label') || el?.getAttribute('data-widget') || prettifyTargetLabel(name);
    }
    if (String(kind || '').toLowerCase() === 'view') {
      const view = findViewByName(token);
      return view?.label || view?.name || prettifyTargetLabel(name);
    }
    return prettifyTargetLabel(raw);
  }

  function getShortcutSummaryGroups() {
    const primary = [
      { label: 'Reopen last closed surface', combo: shortcutBindings.reopen_last_closed },
      { label: 'Open Nia', combo: shortcutBindings.open_nia },
      { label: 'Show shortcut help', combo: shortcutBindings.shortcut_help },
      { label: 'Close focused surface', combo: shortcutBindings.close_focused_surface },
      { label: 'Focus next surface', combo: shortcutBindings.focus_next_surface },
      { label: 'Focus previous surface', combo: shortcutBindings.focus_previous_surface },
    ].filter((item) => item.combo);
    const quickSlots = Object.keys(shortcutBindings.quick_slots || {})
      .sort((a, b) => Number(a) - Number(b))
      .map((slot) => {
        const target = shortcutBindings.quick_slots[slot];
        return {
          label: getTargetLabel(target),
          combo: normalizeShortcutCombo(`Ctrl+${slot}`),
        };
      })
      .filter((item) => item.combo && item.label);
    return [
      { title: 'Workspace', items: primary },
      { title: 'Quick Slots', items: quickSlots },
    ].filter((group) => group.items.length);
  }

  function renderEmptyStateContents() {
    if (!viewEmpty) return;
    const sheet = document.createElement('div');
    sheet.className = 'view-empty-sheet';

    const title = document.createElement('h2');
    title.className = 'view-empty-title';
    title.textContent = 'No view open';
    const subtitle = document.createElement('p');
    subtitle.className = 'view-empty-subtitle';
    subtitle.textContent = 'Use the Views menu or jump straight to a surface with your configured dashboard shortcuts.';
    sheet.append(title, subtitle);

    const grid = document.createElement('div');
    grid.className = 'view-empty-grid';
    getShortcutSummaryGroups().forEach((group) => {
      const section = document.createElement('section');
      section.className = 'view-empty-section';
      const heading = document.createElement('h3');
      heading.className = 'view-empty-section-title';
      heading.textContent = group.title;
      const list = document.createElement('ul');
      list.className = 'shortcut-list';
      group.items.forEach((item) => {
        const row = document.createElement('li');
        row.className = 'shortcut-item';
        const label = document.createElement('span');
        label.className = 'shortcut-item-label';
        label.textContent = item.label;
        const kbd = document.createElement('kbd');
        kbd.className = 'shortcut-kbd';
        kbd.textContent = item.combo;
        row.append(label, kbd);
        list.appendChild(row);
      });
      section.append(heading, list);
      grid.appendChild(section);
    });
    sheet.appendChild(grid);

    const actions = document.createElement('div');
    actions.className = 'view-empty-actions';

    const editBindingsBtn = document.createElement('button');
    editBindingsBtn.type = 'button';
    editBindingsBtn.className = 'btn btn-primary';
    editBindingsBtn.textContent = 'Edit Key Bindings';
    editBindingsBtn.addEventListener('click', () => {
      try {
        void window.ChronosOpenSettingsFile?.('user/settings/dashboard_key_bindings.yml');
      } catch { }
    });
    actions.appendChild(editBindingsBtn);
    sheet.appendChild(actions);

    const note = document.createElement('div');
    note.className = 'shortcut-empty-note';
    note.textContent = 'Edit user/settings/dashboard_key_bindings.yml to remap shortcuts and quick slots.';
    sheet.appendChild(note);

    viewEmpty.replaceChildren(sheet);
  }

  let trickHighlightState = null;

  function ensureTrickHighlightStyles() {
    if (document.getElementById('chronos-trick-highlight-style')) return;
    const style = document.createElement('style');
    style.id = 'chronos-trick-highlight-style';
    style.textContent = `
      .chronos-trick-highlight-layer {
        position: fixed;
        inset: 0;
        z-index: 25000;
        pointer-events: none;
      }
      .chronos-trick-highlight-ring {
        position: fixed;
        border-radius: 18px;
        border: 2px solid rgba(122, 162, 247, 0.98);
        box-shadow: 0 0 0 9999px rgba(4, 7, 12, 0.68), 0 0 0 1px rgba(255,255,255,0.2) inset, 0 0 36px rgba(122,162,247,0.35);
        pointer-events: none;
        animation: chronos-trick-highlight-ring 1.8s ease-in-out infinite;
      }
      .chronos-trick-highlight-layer[data-mode="pulse"] .chronos-trick-highlight-ring {
        box-shadow: 0 0 0 1px rgba(255,255,255,0.2) inset, 0 0 28px rgba(122,162,247,0.38);
      }
      .chronos-trick-highlight-label {
        position: fixed;
        max-width: min(360px, calc(100vw - 32px));
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(122, 162, 247, 0.32);
        background: rgba(9, 13, 20, 0.94);
        color: #e6ecff;
        font: 12px/1.4 var(--font-stack-mono, Consolas, monospace);
        box-shadow: 0 18px 40px rgba(0,0,0,0.35);
        pointer-events: none;
      }
      .chronos-trick-highlight-target {
        position: relative !important;
        z-index: 25001 !important;
        animation: chronos-trick-highlight-target 1.8s ease-in-out infinite;
      }
      @keyframes chronos-trick-highlight-ring {
        0% { transform: scale(0.985); opacity: 0.92; }
        35% { transform: scale(1.01); opacity: 1; }
        100% { transform: scale(0.99); opacity: 0.96; }
      }
      @keyframes chronos-trick-highlight-target {
        0% { filter: brightness(1); }
        28% { filter: brightness(1.22); }
        100% { filter: brightness(1.05); }
      }
    `;
    document.head.appendChild(style);
  }

  function clearTrickHighlight() {
    if (!trickHighlightState) return;
    try { clearTimeout(trickHighlightState.timer); } catch { }
    try { clearInterval(trickHighlightState.interval); } catch { }
    try { window.removeEventListener('resize', trickHighlightState.onResize, true); } catch { }
    try { window.removeEventListener('scroll', trickHighlightState.onResize, true); } catch { }
    try { trickHighlightState.target?.classList?.remove('chronos-trick-highlight-target'); } catch { }
    try { trickHighlightState.layer?.remove(); } catch { }
    trickHighlightState = null;
  }

  function findTrickElement(target) {
    const id = String(target || '').trim().toLowerCase();
    if (!id) return null;
    try {
      const direct = document.querySelector(`[data-ui-id="${id.replace(/"/g, '\\"')}"]`);
      if (direct) return direct;
    } catch { }
    const surface = ".".join(id.split(".").slice(0, 2));
    if (surface && surface !== id) {
      const widget = _findWidgetByTrick({ surface });
      if (widget) return widget;
    }
    return _findWidgetByTrick({ surface: id }) || null;
  }

  function placeTrickHighlight(target, layer, ring, labelEl, message) {
    if (!target || !layer || !ring) return false;
    const rect = target.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return false;
    const pad = 10;
    ring.style.left = `${Math.max(6, rect.left - pad)}px`;
    ring.style.top = `${Math.max(6, rect.top - pad)}px`;
    ring.style.width = `${Math.max(16, rect.width + (pad * 2))}px`;
    ring.style.height = `${Math.max(16, rect.height + (pad * 2))}px`;
    if (labelEl) {
      labelEl.textContent = String(message || '').trim();
      const top = rect.bottom + 14;
      const fitsBelow = top + 48 < window.innerHeight;
      labelEl.style.left = `${Math.min(window.innerWidth - 24, Math.max(12, rect.left))}px`;
      labelEl.style.top = fitsBelow ? `${top}px` : `${Math.max(12, rect.top - 56)}px`;
    }
    return true;
  }

  async function applyTrickHighlightRequest(req) {
    ensureTrickHighlightStyles();
    clearTrickHighlight();
    const surfaceTarget = String(req?.surface || '').trim();
    if (surfaceTarget) {
      try { await openSurfaceFromTarget(surfaceTarget); } catch { }
    }
    const target = findTrickElement(req?.target || req?.surface);
    if (!target) return false;
    const mode = String(req?.mode || 'spotlight').trim().toLowerCase() === 'pulse' ? 'pulse' : 'spotlight';
    const layer = document.createElement('div');
    layer.className = 'chronos-trick-highlight-layer';
    layer.dataset.mode = mode;
    const ring = document.createElement('div');
    ring.className = 'chronos-trick-highlight-ring';
    const label = String(req?.message || '').trim() ? document.createElement('div') : null;
    if (label) label.className = 'chronos-trick-highlight-label';
    layer.appendChild(ring);
    if (label) layer.appendChild(label);
    document.body.appendChild(layer);
    target.classList.add('chronos-trick-highlight-target');
    const update = () => placeTrickHighlight(target, layer, ring, label, req?.message);
    update();
    const onResize = () => { update(); };
    window.addEventListener('resize', onResize, true);
    window.addEventListener('scroll', onResize, true);
    const interval = window.setInterval(update, 140);
    let timer = null;
    const duration = Math.max(0, Number(req?.duration_ms) || 0);
    if (duration > 0) {
      timer = window.setTimeout(() => clearTrickHighlight(), duration);
    }
    trickHighlightState = { layer, ring, label, target, onResize, interval, timer };
    return true;
  }

  async function applyTrickUiRequest(req) {
    if (!req) return false;
    const action = String(req.action || 'open').trim().toLowerCase();
    if (action === 'highlight') return applyTrickHighlightRequest(req);
    if (String(req.type || '').toLowerCase() !== 'widget') return false;
    const el = _findWidgetByTrick(req);
    if (!el) return false;
    if (action === 'close') {
      clearTrickHighlight();
      return setWidgetVisibility(el, false);
    }
    if (action === 'open') return setWidgetVisibility(el, true);
    return false;
  }

  let trickOpenPollBusy = false;
  let trickOpenSeenId = 0;
  async function consumeTrickOpenRequest() {
    if (trickOpenPollBusy) return;
    trickOpenPollBusy = true;
    try {
      const r = await fetch(apiBase() + `/api/trick/open-request?since=${encodeURIComponent(String(trickOpenSeenId || 0))}`);
      if (!r.ok) return;
      const j = await r.json().catch(() => ({}));
      const req = j?.request;
      if (!req) return;
      const applied = await applyTrickUiRequest(req);
      const rid = Number(req?.id || 0);
      if (Number.isFinite(rid) && rid > 0) trickOpenSeenId = rid;
      if (!applied) return;
    } catch { }
    finally {
      trickOpenPollBusy = false;
    }
  }
  try {
    window.setTimeout(() => { void consumeTrickOpenRequest(); }, 600);
    window.setInterval(() => { void consumeTrickOpenRequest(); }, 1000);
  } catch { }

  async function openSurfaceFromTarget(target) {
    const raw = String(target || '').trim();
    if (!raw) return false;
    const [kind, name] = raw.split('.', 2);
    const wanted = normalizeActionToken(name);
    if (String(kind || '').toLowerCase() === 'widget') {
      return openWidgetByName(wanted);
    }
    if (String(kind || '').toLowerCase() === 'view') {
      const view = findViewByName(wanted);
      if (view?.name) {
        await openPane(view.name, view.label || view.name);
        return true;
      }
      const fallbackLabel = prettifyTargetLabel(name);
      const fallbackName = fallbackLabel.replace(/\s+/g, '');
      if (!fallbackName) return false;
      await openPane(fallbackName, fallbackLabel);
      return true;
    }
    return false;
  }

  async function reopenLastClosedSurface() {
    const surface = closedSurfaceHistory.pop();
    if (!surface) return false;
    return openSurfaceFromTarget(`${surface.type}.${surface.name}`);
  }

  function closeFocusedSurface() {
    const surface = getCurrentFocusedSurface();
    if (!surface) return false;
    if (surface.type === 'widget') return closeWidgetByName(surface.name);
    if (surface.type === 'view') {
      closePane(surface.name);
      return true;
    }
    return false;
  }

  function focusSurfaceByIndex(index) {
    const surfaces = getSurfaceElements();
    if (!surfaces.length) return false;
    const bounded = ((index % surfaces.length) + surfaces.length) % surfaces.length;
    const surface = surfaces[bounded];
    if (!surface) return false;
    try {
      const active = document.activeElement;
      if (active && active !== document.body && isEditableTarget(active)) {
        active.blur?.();
      }
    } catch { }
    if (surface.type === 'widget') {
      try { window.ChronosFocusWidget?.(surface.element); } catch { }
    } else {
      try { surface.element?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); } catch { }
      try { surface.element?.classList?.add('active'); setTimeout(() => surface.element?.classList?.remove('active'), 180); } catch { }
    }
    setFocusedSurface(surface);
    return true;
  }

  function cycleSurfaceFocus(direction = 1) {
    const surfaces = getSurfaceElements();
    if (!surfaces.length) return false;
    const current = getCurrentFocusedSurface();
    const currentIndex = current
      ? surfaces.findIndex((surface) => surface.type === current.type && normalizeActionToken(surface.name) === normalizeActionToken(current.name))
      : -1;
    const start = currentIndex >= 0 ? currentIndex : 0;
    return focusSurfaceByIndex(start + (direction >= 0 ? 1 : -1));
  }

  async function runShortcutAction(action) {
    if (action === 'reopen_last_closed') return reopenLastClosedSurface();
    if (action === 'open_nia') {
      openWidgetByName('NiaAssistant');
      try { window.ChronosBus?.emit?.('nia:open-chat'); } catch { }
      try {
        setTimeout(() => {
          try { window.ChronosBus?.emit?.('nia:open-chat'); } catch { }
        }, 120);
      } catch { }
      return true;
    }
    if (action === 'shortcut_help') {
      showShortcutHelpOverlay();
      return true;
    }
    if (action === 'close_focused_surface') {
      if (trickHighlightState) {
        clearTrickHighlight();
        return true;
      }
      const closeTopDismissibleOverlay = () => {
        const overlays = Array.from(document.querySelectorAll(
          '.alpha-launch-overlay, .chronos-wizard-overlay, [data-wizard-overlay], .wizard-overlay, .chronos-overlay'
        )).filter((el) => el && el.isConnected);
        const overlay = overlays[overlays.length - 1];
        if (!overlay) return false;
        const closeBtn = overlay.querySelector(
          '[data-guide-action="close"], [data-action="close"], .wizard-close, button.close, button[aria-label="Close"], button[title*="Close" i]'
        );
        if (closeBtn && typeof closeBtn.click === 'function') {
          closeBtn.click();
        } else {
          overlay.remove();
        }
        return true;
      };
      if (closeTopDismissibleOverlay()) {
        return true;
      }
      const openMenus = Array.from(document.querySelectorAll('#topbar .dropdown.open'));
      if (openMenus.length) {
        closeMenus();
        return true;
      }
      return closeFocusedSurface();
    }
    if (action === 'focus_next_surface') return cycleSurfaceFocus(1);
    if (action === 'focus_previous_surface') return cycleSurfaceFocus(-1);
    return false;
  }

  function installShortcutHandler() {
    let pendingModifierOnlyAction = null;

    function clearPendingModifierOnlyAction() {
      pendingModifierOnlyAction = null;
    }

    function isModifierOnlyCombo(combo) {
      return combo === 'Ctrl' || combo === 'Alt' || combo === 'Shift' || combo === 'Meta';
    }

    document.addEventListener('keydown', (ev) => {
      const combo = eventToShortcutCombo(ev);
      if (!combo) return;
      const editable = isEditableTarget(ev.target);
      if (pendingModifierOnlyAction) {
        if (combo !== pendingModifierOnlyAction.combo || ev.key !== pendingModifierOnlyAction.key) {
          pendingModifierOnlyAction.cancelled = true;
        }
      }
      const slotMatch = combo.match(/^Ctrl\+([0-9])$/);
      if (slotMatch) {
        clearPendingModifierOnlyAction();
        ev.preventDefault();
        ev.stopPropagation();
        void openSurfaceFromTarget(shortcutBindings.quick_slots?.[slotMatch[1]]);
        return;
      }
      const action = SHORTCUT_ACTION_ORDER.find((name) => shortcutBindings[name] === combo);
      if (!action) return;
      if (editable && !SHORTCUT_ACTIONS_ALLOWED_IN_EDITORS.has(action)) return;
      if (isModifierOnlyCombo(combo)) {
        if (ev.repeat) return;
        pendingModifierOnlyAction = {
          action,
          combo,
          key: ev.key,
          cancelled: false,
        };
        return;
      }
      clearPendingModifierOnlyAction();
      ev.preventDefault();
      ev.stopPropagation();
      void runShortcutAction(action);
    }, true);

    document.addEventListener('keyup', (ev) => {
      const pending = pendingModifierOnlyAction;
      if (!pending) return;
      const combo = eventToShortcutCombo(ev);
      if (ev.key !== pending.key && combo !== pending.combo) return;
      clearPendingModifierOnlyAction();
      if (pending.cancelled) return;
      ev.preventDefault();
      ev.stopPropagation();
      void runShortcutAction(pending.action);
    }, true);

    window.addEventListener('blur', clearPendingModifierOnlyAction);
  }

  document.addEventListener('pointerdown', (ev) => {
    const target = ev.target;
    const widget = target?.closest?.('.widget');
    if (widget) {
      setFocusedSurface({ type: 'widget', name: widget.getAttribute('data-widget') || widget.id || '', label: widget.getAttribute('data-label') || '' });
      return;
    }
    const pane = target?.closest?.('.view-pane');
    if (!pane) return;
    const entry = openPanes.find((item) => item.pane === pane);
    if (entry) setFocusedSurface({ type: 'view', name: entry.name, label: entry.label || entry.name });
  }, true);

  document.addEventListener('focusin', (ev) => {
    const target = ev.target;
    const widget = target?.closest?.('.widget');
    if (widget) {
      setFocusedSurface({ type: 'widget', name: widget.getAttribute('data-widget') || widget.id || '', label: widget.getAttribute('data-label') || '' });
      return;
    }
    const pane = target?.closest?.('.view-pane');
    if (!pane) return;
    const entry = openPanes.find((item) => item.pane === pane);
    if (entry) setFocusedSurface({ type: 'view', name: entry.name, label: entry.label || entry.name });
  }, true);

  installShortcutHandler();

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
      if (id === 'gadgets') buildGadgetsMenu();
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
  bootStep('Topbar handlers bound');

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
        toggleWidgetVisibility(el);
        check.textContent = isWidgetVisibleByElement(el) ? '✓' : '';
        closeMenus();
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
  try {
    buildWidgetsMenu();
    bootStep('Widget menu built');
  } catch (e) {
    bootFail('Widget menu build failed', e);
  }

  function buildGadgetsMenu() {
    const gadgetsMenu = document.getElementById('menu-gadgets');
    if (!gadgetsMenu) return;
    gadgetsMenu.innerHTML = '';
    const dockPinned = isDockPinned();

    const disabled = getDisabledGadgets();
    const entries = [...gadgetCatalog]
      .filter((g) => g && g.enabled !== false && getGadgetKey(g))
      .sort((a, b) => {
        const ao = Number(a.order ?? 100);
        const bo = Number(b.order ?? 100);
        if (ao !== bo) return ao - bo;
        const al = String(a.label || a.module || a.id || '');
        const bl = String(b.label || b.module || b.id || '');
        return al.localeCompare(bl, undefined, { sensitivity: 'base' });
      });

    const createItem = (gadget) => {
      const key = getGadgetKey(gadget);
      const label = String(gadget.label || gadget.module || key || 'Unnamed Gadget');
      const item = document.createElement('div');
      item.className = 'item';
      item.setAttribute('data-search', `${label} ${key}`);
      const check = document.createElement('span');
      check.className = 'check';
      check.textContent = disabled.has(key) ? '' : '✓';
      const span = document.createElement('span');
      span.textContent = label;
      item.append(check, span);
      if (areBadgesVisible()) {
        const normalized = String(label || key).trim().toLowerCase();
        const normalizedKey = String(key || '').trim().toLowerCase();
        if (URGENT_GADGETS.has(normalized) || URGENT_GADGETS.has(normalizedKey)) {
          const badge = document.createElement('span');
          badge.className = 'urgent-badge';
          badge.textContent = 'urgent';
          badge.title = 'Urgent gadget';
          item.appendChild(badge);
        } else if (DEV_GADGETS.has(normalized) || DEV_GADGETS.has(normalizedKey)) {
          const badge = document.createElement('span');
          badge.className = 'dev-badge';
          badge.textContent = 'dev';
          badge.title = 'Development feature';
          item.appendChild(badge);
        }
      }
      item.addEventListener('click', () => {
        if (disabled.has(key)) disabled.delete(key);
        else disabled.add(key);
        setDisabledGadgets(disabled);
        check.textContent = disabled.has(key) ? '' : '✓';
        setupDockReveal(gadgetCatalog);
      });
      return item;
    };

    const frag = document.createDocumentFragment();
    const dockColumn = document.createElement('div');
    dockColumn.className = 'column';
    const dockItem = document.createElement('div');
    dockItem.className = 'item';
    dockItem.setAttribute('data-search', 'pin gadget dock unpin gadget dock dock gadgets');
    const dockCheck = document.createElement('span');
    dockCheck.className = 'check';
    dockCheck.textContent = dockPinned ? '✓' : '';
    const dockLabel = document.createElement('span');
    dockLabel.textContent = 'Pin gadget dock';
    dockItem.append(dockCheck, dockLabel);
    dockItem.addEventListener('click', () => {
      const next = !isDockPinned();
      setDockPinned(next);
      dockCheck.textContent = next ? '✓' : '';
      setupDockReveal(gadgetCatalog);
    });
    dockColumn.appendChild(dockItem);
    frag.appendChild(dockColumn);

    const chunks = chunkForSearchLayout(entries, 9, 10);
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'item disabled';
      empty.textContent = 'No gadgets discovered.';
      dockColumn.appendChild(empty);
    }
    for (const group of chunks) {
      const column = document.createElement('div');
      column.className = 'column';
      for (const gadget of group) {
        column.appendChild(createItem(gadget));
      }
      frag.appendChild(column);
    }
    gadgetsMenu.appendChild(frag);
    attachDropdownSearch(gadgetsMenu, 'Search gadgets...');
  }

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
    fetch(apiBase() + '/api/registry?name=popups').then(r => r.json()).then(d => d.registry?.popups || []),
    fetch(apiBase() + '/api/registry?name=gadgets').then(r => r.json()).then(d => d.registry?.gadgets || []),
  ]).then(([wizards, themes, views, panels, popups, gadgets]) => {
    try {
      console.log('[Chronos][app] Registries loaded:', { wizards: wizards.length, themes: themes.length, views: views.length, panels: panels.length, popups: popups.length, gadgets: gadgets.length });
      bootStep(`Registries loaded: views=${views.length}, panels=${panels.length}, popups=${popups.length}`);

      wizardCatalog = wizards;
      themeOptions = themes.filter(t => t.id !== 'theme-base'); // Exclude Theme Base
      popupCatalog = Array.isArray(popups) ? popups : [];
      gadgetCatalog = Array.isArray(gadgets) ? gadgets : [];
      availableViews = (views || []).filter(v => {
        const enabled = v?.enabled;
        if (enabled === false) return false;
        const name = String(v?.name || '').trim().toLowerCase();
        return name !== 'templatebuilder';
      });

      if (!themeOptions.length) {
        themeOptions.push({ id: 'chronos-blue', label: 'Chronos Blue', file: 'chronos-blue.css', accent: '#7aa2f7' });
      }

      try { buildWizardsMenu(); } catch (e) { bootFail('Wizard menu build failed', e); }
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        applyTheme(stored, { persist: false });
      } catch (e) {
        bootFail('Theme apply failed', e);
      }
      try { buildViewsMenu(); } catch (e) { bootFail('View menu build failed', e); }
      try { buildPopupsMenu(); } catch (e) { bootFail('Popup menu build failed', e); }
      try { buildGadgetsMenu(); } catch (e) { bootFail('Gadget menu build failed', e); }
      try { setupDockReveal(gadgetCatalog); } catch (e) { bootFail('Dock setup failed', e); }
      try { renderEmptyStateContents(); } catch (e) { bootFail('Empty state render failed', e); }

      const panelLoaders = (panels || [])
        .filter(p => p.enabled !== false)
        .map(p => () => import(new URL(`./panels/${p.module}/index.js?v=${Date.now()}`, import.meta.url))
          .catch(err => console.error(`[Chronos][app] Failed to load ${p.module} panel`, err)));

      const popupLoaders = (arePopupsEnabled() ? (popups || []) : [])
        .filter(p => p.enabled !== false)
        .sort((a, b) => {
          const ma = String(a?.module || a?.id || '');
          const mb = String(b?.module || b?.id || '');
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
        .map(p => () => import(new URL(`./popups/${p.module}/index.js?v=${Date.now()}`, import.meta.url))
          .catch(err => console.error(`[Chronos][app] Failed to load ${p.module} popup`, err)));

      try { buildPanelsMenu(); } catch (e) { bootFail('Panel menu build failed', e); }

      console.log('[Chronos][app] Loading panels and popups...', { panelCount: panelLoaders.length, popupCount: popupLoaders.length });
      Promise.all(panelLoaders.map(loader => loader()))
        .then(async () => {
          for (const loader of popupLoaders) {
            await loader();
          }
        })
        .then(() => console.log('[Chronos][app] All components loaded'))
        .catch(err => console.error('[Chronos][app] Error loading components:', err));
    } catch (e) {
      bootFail('Registry bootstrap failed', e);
    }
  }).catch(err => {
    bootFail('Failed to load registries', err);
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
      await import(new URL(`./popups/${moduleName}/index.js?v=${Date.now()}&manual=1`, import.meta.url));
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
      const el = findWidgetElementByName(name);
      return toggleWidgetVisibility(el);
    };

    const isWidgetVisible = (name) => {
      const el = findWidgetElementByName(name);
      return isWidgetVisibleByElement(el);
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
      const spaced = raw
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
      return spaced
        .split(' ')
        .map((w) => {
          const lw = String(w || '').toLowerCase();
          if (!lw) return '';
          if (['ai', 'api', 'cli', 'aduc', 'mp3', 'ui', 'ux'].includes(lw)) return lw.toUpperCase();
          if (lw === 'nia') return 'Nia';
          if (lw === 'big5') return 'Big 5';
          return lw.charAt(0).toUpperCase() + lw.slice(1);
        })
        .join(' ');
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
  try {
    hookWidgetCloseButtons();
  } catch (e) {
    bootFail('Widget close hook failed', e);
  }
  // Also observe visibility changes as a fallback
  try {
    const widgetVisibilityState = new Map(widgetEls.map((el) => [el, isWidgetVisibleByElement(el)]));
    const mo = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        const el = mutation.target;
        if (!widgetVisibilityState.has(el)) return;
        const wasVisible = widgetVisibilityState.get(el);
        const visible = isWidgetVisibleByElement(el);
        if (wasVisible && !visible) {
          rememberClosedSurface({ type: 'widget', name: el.getAttribute('data-widget') || el.id || '', label: el.getAttribute('data-label') || '' });
        }
        widgetVisibilityState.set(el, visible);
      });
      buildWidgetsMenu();
    });
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
  bootStep('Restoring default view');
  const saved = loadViewState();
  if (saved && saved.length) {
    for (const v of saved.slice(0, MAX_PANES)) {
      try { await openPane(v.name, v.label); } catch (e) { bootFail(`Failed opening saved view '${v?.name || ''}'`, e); }
    }
  }
  if (!openPanes.length) {
    try { await openPane('Calendar', 'Calendar'); } catch (e) { bootFail('Failed opening default Calendar view', e); }
  }
  rebuildPaneResizers();
  setupDockReveal(gadgetCatalog);
  bootStep('Dashboard app ready');
  bootDone();

  console.log('[Chronos][app] Dashboard app ready');
  // Listen for widget:show to reveal/pulse a widget (e.g., ItemManager)
  try {
    (window.__chronosBus = context?.bus)?.on('widget:show', (name) => {
      void openWidgetByName(name);
    });
  } catch { }
});

window.addEventListener('resize', () => {
  try { applyPaneSizes(); } catch { }
  try { positionOpenDropdowns(); } catch { }
});

export { };

