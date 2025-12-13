// Simple app bootstrapper with debug logs
import { mountWidget, mountView, launchWizard } from './core/runtime.js';

function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

if (typeof window !== 'undefined' && !window.__cockpitPanelDefinitions) {
  window.__cockpitPanelDefinitions = [];
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
  () => import(new URL('./Panels/Schedule/index.js', import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load schedule panel module', err);
  }),
  () => import(new URL('./Panels/Matrix/index.js', import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load matrix panel module', err);
  }),
  () => import(new URL('./Panels/StatusStrip/index.js', import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load status strip panel module', err);
  }),
  () => import(new URL('./Panels/Commitments/index.js', import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load commitments panel module', err);
  }),
  () => import(new URL('./Panels/Lists/index.js', import.meta.url)).catch(err => {
    console.error('[Chronos][app] Failed to load lists panel module', err);
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
  const availableViews = [
    { name: 'Cockpit', label: 'Cockpit' },
    { name: 'Calendar', label: 'Calendar' },
    { name: 'TemplateBuilder', label: 'Template Builder' },
    { name: 'ProjectManager', label: 'Project Manager' },
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

  function resolveTheme(themeId) {
    if (!themeOptions.length) return null;
    if (!themeId) return themeOptions[0];
    return themeOptions.find(t => t.id === themeId) || themeOptions[0];
  }

  function refreshThemeMenuChecks(activeId) {
    const menu = document.getElementById('menu-themes');
    if (!menu) return;
    const current = activeId || themeStylesheet?.dataset.themeId || themeOptions[0]?.id;
    menu.querySelectorAll('.item').forEach(item => {
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

  function removeCalendarControls() {
    const panel = document.getElementById('calendarControls');
    if (panel) {
      if (panel.__calendarClamp) {
        try { window.removeEventListener('resize', panel.__calendarClamp); } catch { }
        try { delete panel.__calendarClamp; } catch { }
      }
      panel.remove();
    }
    try { delete window.__calendarRefreshBack; } catch { }
  }

  function ensureCalendarControls(host) {
    try {
      if (!host) return;
      const existing = document.getElementById('calendarControls');
      if (existing) {
        if (existing.parentElement === host) return;
        existing.remove();
      }
      const panel = document.createElement('div');
      panel.id = 'calendarControls';
      panel.style.position = 'absolute';
      panel.style.top = '10px';
      panel.style.left = '10px';
      panel.style.right = '';
      panel.style.display = 'flex';
      panel.style.gap = '6px';
      panel.style.zIndex = '12';
      panel.style.background = 'rgba(21,25,35,0.65)'; // semi-transparent
      panel.style.border = '1px solid #222835';
      panel.style.borderRadius = '8px';
      panel.style.padding = '6px';
      panel.style.backdropFilter = 'blur(2px)';
      panel.style.cursor = 'grab';
      panel.style.userSelect = 'none';
      const mkBtn = (label) => { const b = document.createElement('button'); b.textContent = label; b.className = 'btn'; b.style.padding = '4px 8px'; return b; };
      const mkIconBtn = (glyph, title) => { const b = document.createElement('button'); b.className = 'btn'; b.style.padding = '4px 8px'; b.textContent = glyph; if (title) b.title = title; return b; };
      const lbl = document.createElement('span'); lbl.style.color = '#a6adbb'; lbl.style.padding = '4px 6px';
      function updateLevel() { const map = ['Routines', 'Subroutines', 'Microroutines', 'Items']; lbl.textContent = map[Math.max(0, Math.min(3, (window.__calendarLevel ?? 0)))] || 'Items'; }
      const zoomMinus = mkIconBtn('-', 'Zoom out');
      const zoomPlus = mkIconBtn('+', 'Zoom in');
      const levelMinus = mkIconBtn('Lv-', 'Level up');
      const levelPlus = mkIconBtn('Lv+', 'Level down');
      const backBtn = mkIconBtn('Back', 'Back');
      zoomMinus.addEventListener('click', () => { window.__calendarPxPerMin = Math.max(0.25, (window.__calendarPxPerMin ?? 1) - 0.25); window.redraw?.(); });
      zoomPlus.addEventListener('click', () => { window.__calendarPxPerMin = Math.min(4, (window.__calendarPxPerMin ?? 1) + 0.25); window.redraw?.(); });
      levelMinus.addEventListener('click', () => { window.__calendarLevel = Math.max(0, (window.__calendarLevel ?? 0) - 1); updateLevel(); window.redraw?.(); });
      levelPlus.addEventListener('click', () => { window.__calendarLevel = Math.min(3, (window.__calendarLevel ?? 0) + 1); updateLevel(); window.redraw?.(); });
      function refreshBack(force) {
        try {
          const can = typeof force === 'boolean'
            ? force
            : (window.__calendarHasHistory ?? (window.__calendarCanGoBack ? window.__calendarCanGoBack() : false));
          backBtn.style.opacity = can ? '' : '0.6';
          backBtn.style.pointerEvents = 'auto'; // always clickable; goBack will no-op if empty
        } catch { }
      }
      try { window.__calendarRefreshBack = refreshBack; } catch { }
      backBtn.addEventListener('click', () => { window.__calendarGoBack?.(); refreshBack(); });
      backBtn.addEventListener('mouseenter', refreshBack);
      refreshBack();
      updateLevel();
      // Toolstrip
      const toolCursor = mkIconBtn('Cursor', 'Cursor');
      const toolSelect = mkIconBtn('Select', 'Select');
      const toolPicker = mkIconBtn('Pick', 'Picker');
      const toolEraser = mkIconBtn('Erase', 'Eraser');
      function setTool(t) {
        window.__calendarTool = t;
        [toolCursor, toolSelect, toolPicker, toolEraser].forEach(b => b.classList.remove('btn-primary'));
        if (t === 'cursor') toolCursor.classList.add('btn-primary');
        if (t === 'select') toolSelect.classList.add('btn-primary');
        if (t === 'picker') toolPicker.classList.add('btn-primary');
        if (t === 'eraser') toolEraser.classList.add('btn-primary');
      }
      toolCursor.addEventListener('click', () => { setTool('cursor'); window.redraw?.(); });
      toolSelect.addEventListener('click', () => { setTool('select'); window.redraw?.(); });
      toolPicker.addEventListener('click', () => { setTool('picker'); window.redraw?.(); });
      toolEraser.addEventListener('click', () => { setTool('eraser'); window.redraw?.(); });
      setTool(window.__calendarTool ?? 'cursor');
      panel.append(backBtn, zoomMinus, zoomPlus, levelMinus, levelPlus, lbl, toolCursor, toolSelect, toolPicker, toolEraser);
      // Hover feedback for transparency
      panel.addEventListener('mouseenter', () => { panel.style.background = 'rgba(21,25,35,0.85)'; });
      panel.addEventListener('mouseleave', () => { panel.style.background = 'rgba(21,25,35,0.65)'; });

      // Make panel draggable (relative to its host container)
      (function makeDraggable(box, parent) {
        function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
        function loadPos() { try { return JSON.parse(localStorage.getItem('calendarControlsPos') || '{}'); } catch { return {}; } }
        function savePos(left, top) { try { localStorage.setItem('calendarControlsPos', JSON.stringify({ left, top })); } catch { } }
        function clampToBounds() {
          try {
            if (!parent) return;
            const parentRect = parent.getBoundingClientRect();
            if (!parentRect || !parentRect.width || !parentRect.height) return;
            const rect = box.getBoundingClientRect();
            const width = rect.width || box.offsetWidth || 0;
            const height = rect.height || box.offsetHeight || 0;
            let left = parseFloat(box.style.left || '10');
            let top = parseFloat(box.style.top || '10');
            if (!Number.isFinite(left)) left = 10;
            if (!Number.isFinite(top)) top = 10;
            const maxLeft = Math.max(4, parentRect.width - width - 4);
            const maxTop = Math.max(0, parentRect.height - height - 4);
            box.style.left = Math.round(clamp(left, 4, maxLeft)) + 'px';
            box.style.top = Math.round(clamp(top, 0, maxTop)) + 'px';
          } catch { }
        }
        // Restore saved position if available
        try {
          const pos = loadPos();
          if (typeof pos.left === 'number' && typeof pos.top === 'number') {
            box.style.left = pos.left + 'px';
            box.style.top = pos.top + 'px';
          }
        } catch { }
        setTimeout(clampToBounds, 0);
        const onResize = () => clampToBounds();
        window.addEventListener('resize', onResize);
        try { box.__calendarClamp = onResize; } catch { }
        box.addEventListener('pointerdown', (ev) => {
          if (ev.button !== 0) return; // left only
          ev.preventDefault(); ev.stopPropagation();
          box.style.cursor = 'grabbing';
          const rect = box.getBoundingClientRect();
          const parentRect = parent?.getBoundingClientRect();
          const offX = ev.clientX - rect.left;
          const offY = ev.clientY - rect.top;
          function move(e) {
            const baseLeft = parentRect ? parentRect.left : 0;
            const baseTop = parentRect ? parentRect.top : 0;
            const boundsW = parentRect ? parentRect.width : window.innerWidth;
            const boundsH = parentRect ? parentRect.height : window.innerHeight;
            const nx = clamp(e.clientX - offX - baseLeft, 4, boundsW - rect.width - 4);
            const ny = clamp(e.clientY - offY - baseTop, 0, boundsH - rect.height - 4);
            box.style.left = Math.round(nx) + 'px';
            box.style.top = Math.round(ny) + 'px';
          }
          function up() {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            box.style.cursor = 'grab';
            // Persist position
            try { const l = parseInt(box.style.left || '10'); const t = parseInt(box.style.top || '10'); savePos(l, t); } catch { }
            clampToBounds();
          }
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        });
      })(panel, host);

      // fx toggle for variable expansion in calendar labels
      const fxWrap = document.createElement('label'); fxWrap.className = 'hint'; fxWrap.style.display = 'flex'; fxWrap.style.alignItems = 'center'; fxWrap.style.gap = '6px';
      const fx = document.createElement('input'); fx.type = 'checkbox'; fx.id = 'calendarFxToggle'; fx.checked = (window.__calendarFxExpand !== false);
      fxWrap.append(fx, document.createTextNode('fx'));
      panel.appendChild(fxWrap);
      fx.addEventListener('change', () => { window.__calendarFxExpand = fx.checked; try { window.redraw?.(); } catch { } });

      host.appendChild(panel);
    } catch (e) { console.warn('[Chronos][app] Could not build calendar controls:', e); }
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
    const close = document.createElement('button');
    close.className = 'pane-close';
    close.textContent = '✕';
    close.title = 'Close view';
    tab.append(title, close);
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
      if (name === 'Calendar') ensureCalendarControls(viewport);
      openPanes.push({ name, label: label || name, pane, content, viewport });
      window.__currentView = name;
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
    if (name === 'Calendar') removeCalendarControls();
    try { pane.pane.remove(); } catch { }
    openPanes.splice(idx, 1);
    window.__currentView = openPanes.length ? openPanes[openPanes.length - 1].name : null;
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
      if (id === 'themes') buildThemesMenu();
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
        return { el, label };
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
      item.addEventListener('click', () => {
        el.style.display = (el.style.display === 'none' ? '' : 'none');
        check.textContent = el.style.display === 'none' ? '' : '✓';
        closeMenus();
        try { if (el.style.display !== 'none') window.ensureWidgetInView?.(el); } catch { }
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
    }));
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
      if (wizard.description) {
        const desc = document.createElement('div');
        desc.className = 'wizard-desc';
        desc.textContent = wizard.description;
        item.appendChild(desc);
      }
      if (wizard.enabled) {
        item.addEventListener('click', () => startWizardFlow(wizard));
      }
      return item;
    };
    for (let i = 0; i < wizardCatalog.length; i += MAX_PER_COLUMN) {
      const column = document.createElement('div');
      column.className = 'column';
      for (const wizard of wizardCatalog.slice(i, i + MAX_PER_COLUMN)) {
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

  function buildThemesMenu() {
    const themesMenu = document.getElementById('menu-themes');
    if (!themesMenu) return;
    themesMenu.innerHTML = '';
    themeOptions.forEach(theme => {
      const item = document.createElement('div');
      item.className = 'item theme-item';
      item.setAttribute('data-theme', theme.id);
      item.innerHTML = `
        <span class="check"></span>
        <div class="theme-info">
          <div class="theme-title">${theme.label}</div>
          <div class="theme-desc">${theme.description}</div>
        </div>
        <span class="theme-swatch" style="background:${theme.accent};"></span>
      `;
      item.addEventListener('click', () => {
        applyTheme(theme.id);
        closeMenus();
      });
      themesMenu.appendChild(item);
    });
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
    for (let i = 0; i < availableViews.length; i += MAX_PER_COLUMN) {
      const column = document.createElement('div');
      column.className = 'column';
      for (const view of availableViews.slice(i, i + MAX_PER_COLUMN)) {
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
      try { window.ensureWidgetInView?.(el); } catch { }
      // Pulse
      el.style.boxShadow = '0 0 0 2px #7aa2f7, var(--shadow)';
      setTimeout(() => { el.style.boxShadow = 'var(--shadow)'; }, 900);
    });
  } catch { }
});

window.addEventListener('resize', () => {
  try { applyPaneSizes(); } catch { }
});

export { };
