const PANEL_BASE_ID = 'lists';
const PANEL_STATE_PREFIX = 'chronos_lists_panel_state_';
const INSTANCE_STORAGE_KEY = 'chronos_lists_panel_instances_v1';
const STYLE_ID = 'cockpit-lists-panel-style';
const ITEM_TYPES = [
  'task',
  'project',
  'routine',
  'subroutine',
  'microroutine',
  'goal',
  'milestone',
  'habit',
  'commitment',
  'reward',
  'achievement',
  'reminder',
  'alarm',
  'note',
  'plan',
  'appointment',
  'journal_entry',
  'review',
  'inventory',
  'inventory_item',
  'tool',
];
const DEFAULT_TYPE = 'task';
const MAX_ITEMS = 200;

let managerRef = null;
let cachedInstances = null;

console.log('[Chronos][Panels][Lists] module evaluating');

function injectStyles(){
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .lists-panel-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      color: var(--chronos-text);
      font-size: 13px;
      gap: 12px;
    }
    .lists-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .lists-panel-title {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
      color: var(--chronos-text);
    }
    .lists-panel-subtitle {
      margin: 2px 0 0 0;
      font-size: 12px;
      color: var(--chronos-text-muted);
    }
    .lists-panel-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .lists-panel-add,
    .lists-panel-remove {
      border: none;
      border-radius: 999px;
      padding: 8px 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    .lists-panel-add {
      background: var(--chronos-accent-gradient);
      color: var(--chronos-text);
    }
    .lists-panel-add:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(79, 113, 255, 0.35);
    }
    .lists-panel-remove {
      background: rgba(255, 255, 255, 0.06);
      color: var(--chronos-text);
      border: 1px solid rgba(255,255,255,0.12);
    }
    .lists-panel-remove:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 10px rgba(8, 10, 16, 0.4);
    }
    .lists-panel-cards {
      flex: 1;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .lists-card {
      background: var(--chronos-surface);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 16px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-shadow: 0 6px 24px rgba(2, 4, 12, 0.45);
    }
    .lists-card-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }
    .lists-card-heading {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .lists-card-heading span:first-child {
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 1.4px;
      color: var(--chronos-text-muted);
    }
    .lists-card-heading strong {
      font-size: 15px;
      color: var(--chronos-text);
    }
    .lists-card-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .lists-card-refresh {
      border: none;
      background: rgba(100,255,210,0.15);
      color: var(--chronos-success);
      font-weight: 600;
      border-radius: 10px;
      padding: 6px 12px;
      cursor: pointer;
    }
    .lists-card-controls {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }
    .lists-card-controls label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: var(--chronos-text-muted);
    }
    .lists-card-controls select,
    .lists-card-controls input {
      background: var(--chronos-surface-soft);
      border: 1px solid rgba(255,255,255,0.12);
      color: var(--chronos-text);
      border-radius: 10px;
      padding: 7px 10px;
      font-size: 13px;
    }
    .lists-card-controls button {
      align-self: flex-end;
      border: 1px dashed rgba(255,255,255,0.2);
      background: transparent;
      color: var(--chronos-text-muted);
      border-radius: 12px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 12px;
    }
    .lists-card-filters {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .lists-filter-row {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 8px;
      align-items: center;
    }
    .lists-filter-row input {
      background: var(--chronos-surface-soft);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      padding: 6px 10px;
      color: var(--chronos-text);
    }
    .lists-filter-remove {
      border: none;
      background: var(--chronos-danger-soft);
      color: var(--chronos-danger);
      border-radius: 10px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
    }
    .lists-filter-empty {
      font-size: 12px;
      color: var(--chronos-text-muted);
      padding: 4px 0;
    }
    .lists-card-status {
      font-size: 12px;
      color: var(--chronos-text-muted);
    }
    .lists-card-status.error {
      color: var(--chronos-danger);
    }
    .lists-card-results {
      min-height: 90px;
      border: 1px solid rgba(67, 79, 122, 0.6);
      border-radius: 12px;
      padding: 10px;
      background: rgba(5, 8, 16, 0.95);
      overflow: auto;
      max-height: 260px;
    }
    .lists-results-empty {
      text-align: center;
      color: var(--chronos-text-muted);
      font-size: 13px;
      padding: 20px 10px;
    }
    .lists-item {
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      padding: 8px 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .lists-item:last-child {
      border-bottom: none;
    }
    .lists-item-name {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-weight: 600;
      color: var(--chronos-text);
    }
    .lists-item-name span:last-child {
      font-size: 11px;
      letter-spacing: 1.1px;
      color: var(--chronos-text-muted);
      text-transform: uppercase;
    }
    .lists-item-meta {
      font-size: 12px;
      color: var(--chronos-text-muted);
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .lists-item-meta span {
      background: rgba(255, 255, 255, 0.03);
      padding: 2px 8px;
      border-radius: 999px;
      line-height: 1.6;
    }
  `;
  document.head.appendChild(style);
}

function apiBase(){
  const origin = window.location?.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

function readStoredJSON(key){
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn('[Chronos][Panels][Lists] Failed to read stored value', error);
    return null;
  }
}

function writeStoredJSON(key, value){
  try {
    if (value === null || value === undefined){
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    console.warn('[Chronos][Panels][Lists] Failed to persist value', error);
  }
}

function panelStateKey(panelId){
  return `${PANEL_STATE_PREFIX}${panelId || PANEL_BASE_ID}`;
}

function loadPanelState(panelId){
  return readStoredJSON(panelStateKey(panelId));
}

function storePanelState(panelId, data){
  writeStoredJSON(panelStateKey(panelId), data);
}

function clearPanelState(panelId){
  writeStoredJSON(panelStateKey(panelId), null);
}

function loadInstanceRecords(){
  if (cachedInstances) return cachedInstances;
  const stored = readStoredJSON(INSTANCE_STORAGE_KEY);
  if (Array.isArray(stored) && stored.length){
    cachedInstances = stored;
  } else {
    cachedInstances = [{ id: PANEL_BASE_ID, label: 'Lists' }];
    persistInstances();
  }
  return cachedInstances;
}

function persistInstances(){
  if (!cachedInstances) return;
  writeStoredJSON(INSTANCE_STORAGE_KEY, cachedInstances);
}

function generateInstanceId(){
  return `${PANEL_BASE_ID}-${Math.random().toString(36).slice(2, 8)}`;
}

function nextInstanceLabel(){
  const instances = loadInstanceRecords();
  const labels = new Set(instances.map(inst => (inst.label || '').toLowerCase()));
  const base = 'Lists';
  let counter = instances.length + 1;
  let candidate = `${base} ${counter}`;
  while (labels.has(candidate.toLowerCase())){
    counter += 1;
    candidate = `${base} ${counter}`;
  }
  return candidate;
}

function createInstanceRecord(label){
  const instances = loadInstanceRecords();
  const record = {
    id: generateInstanceId(),
    label: label && label.trim() ? label.trim() : nextInstanceLabel(),
  };
  instances.push(record);
  persistInstances();
  return record;
}

function removeInstanceRecord(id){
  const instances = loadInstanceRecords();
  if (instances.length <= 1) return false;
  const idx = instances.findIndex(entry => entry.id === id);
  if (idx === -1) return false;
  instances.splice(idx, 1);
  persistInstances();
  return true;
}

function createDefinition(instance){
  const isBase = instance.id === PANEL_BASE_ID;
  return {
    id: instance.id,
    label: instance.label || 'Lists',
    defaultVisible: false,
    defaultPosition: { x: 360, y: 48 },
    size: { width: 440, height: 520 },
    mount: (root) => mountListsPanel(root, instance),
    menuKey: PANEL_BASE_ID,
    menuLabel: 'Lists',
    menuPrimary: isBase,
  };
}

function ensureService(){
  window.ListsPanelService = {
    list: () => [...loadInstanceRecords()],
    create: (label) => {
      const record = createInstanceRecord(label);
      if (managerRef && typeof managerRef.register === 'function'){
        managerRef.register(createDefinition(record));
        try { managerRef.setVisible?.(record.id, true); } catch {}
      } else if (managerRef && typeof managerRef.registerPanel === 'function'){
        managerRef.registerPanel(createDefinition(record));
        try { managerRef.setVisible?.(record.id, true); } catch {}
      }
      return record;
    },
    remove: (id) => {
      if (!id) return { ok: false, reason: 'missing' };
      const removed = removeInstanceRecord(id);
      if (!removed) return { ok: false, reason: 'locked' };
      try { managerRef?.remove?.(id); } catch {}
      clearPanelState(id);
      return { ok: true };
    },
  };
}

function registerPanels(manager){
  injectStyles();
  managerRef = manager;
  const instances = loadInstanceRecords();
  instances.forEach(instance => manager.registerPanel(createDefinition(instance)));
  ensureService();
}

export function register(manager){
  registerPanels(manager);
}

const autoAttach = (manager) => {
  try {
    if (manager && typeof manager.registerPanel === 'function'){
      registerPanels(manager);
    }
  } catch (error) {
    console.error('[Chronos][Panels][Lists] Failed to register panel', error);
  }
};

if (typeof window !== 'undefined') {
  const defs = window.__cockpitPanelDefinitions || [];
  defs.push(autoAttach);
  window.__cockpitPanelDefinitions = defs;
  if (typeof window.__cockpitPanelRegister === 'function') {
    try { window.__cockpitPanelRegister(autoAttach); } catch {}
  }
}

function mountListsPanel(root, instance){
  injectStyles();
  const panelId = instance?.id || PANEL_BASE_ID;
  const panelLabel = instance?.label || 'Lists';
  let filterCounter = 1;

  const savedState = loadPanelState(panelId) || {};
  const state = {
    type: ITEM_TYPES.includes((savedState.type || '').toLowerCase())
      ? (savedState.type || '').toLowerCase()
      : DEFAULT_TYPE,
    q: savedState.q || '',
    filters: [],
  };
  const savedFilters = Array.isArray(savedState.filters) ? savedState.filters : [];
  state.filters = savedFilters.map(entry => ({
    id: `filter-${filterCounter++}`,
    key: entry?.key || '',
    value: entry?.value || '',
  }));

  const runtime = {
    items: [],
    loading: false,
    error: '',
    lastUpdated: null,
    truncated: false,
    timer: null,
  };

  root.classList.add('lists-panel-shell');
  root.innerHTML = `
    <div class="lists-panel-header">
      <div>
        <p class="lists-panel-title">${panelLabel}</p>
        <p class="lists-panel-subtitle">Pin CLI-style list queries as independent panels.</p>
      </div>
      <div class="lists-panel-actions">
        <button type="button" class="lists-panel-add" title="Open another Lists panel">+ Panel</button>
        <button type="button" class="lists-panel-remove" title="Remove this Lists panel">Remove</button>
      </div>
    </div>
    <div class="lists-panel-cards">
      <section class="lists-card">
        <header class="lists-card-header">
          <div class="lists-card-heading">
            <span>Listing</span>
            <strong class="lists-card-heading-label"></strong>
          </div>
          <div class="lists-card-actions">
            <button type="button" class="lists-card-refresh">Refresh</button>
          </div>
        </header>
        <div class="lists-card-controls">
          <label>
            Type
            <select class="lists-card-select"></select>
          </label>
          <label>
            Search
            <input class="lists-card-q" type="text" placeholder="name or content..." />
          </label>
          <button type="button" class="lists-card-add-filter">Add Filter</button>
        </div>
        <div class="lists-card-filters"></div>
        <div class="lists-card-status"></div>
        <div class="lists-card-results"></div>
      </section>
    </div>
  `;

  const newPanelBtn = root.querySelector('.lists-panel-add');
  const removePanelBtn = root.querySelector('.lists-panel-remove');
  const cardHeadingLabel = root.querySelector('.lists-card-heading-label');
  const typeSelect = root.querySelector('.lists-card-select');
  const searchInput = root.querySelector('.lists-card-q');
  const addFilterBtn = root.querySelector('.lists-card-add-filter');
  const filtersRoot = root.querySelector('.lists-card-filters');
  const statusEl = root.querySelector('.lists-card-status');
  const resultsRoot = root.querySelector('.lists-card-results');
  const refreshBtn = root.querySelector('.lists-card-refresh');

  ITEM_TYPES.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type.replace(/_/g, ' ');
    typeSelect.appendChild(option);
  });

  typeSelect.value = state.type || DEFAULT_TYPE;
  searchInput.value = state.q || '';

  const persistState = ()=>{
    storePanelState(panelId, {
      type: state.type,
      q: state.q,
      filters: state.filters.map(entry => ({ key: entry.key, value: entry.value })),
    });
  };

  const updateHeading = ()=>{
    if (cardHeadingLabel){
      cardHeadingLabel.textContent = state.type || 'Choose type';
    }
  };

  const describeStatus = ()=>{
    if (runtime.loading) return 'Loading...';
    if (runtime.error) return runtime.error;
    if (runtime.lastUpdated){
      const ts = runtime.lastUpdated.toLocaleTimeString();
      if (runtime.truncated){
        return `Showing first ${runtime.items.length} items • Updated ${ts}`;
      }
      return `Updated ${ts} • ${runtime.items.length} item${runtime.items.length === 1 ? '' : 's'}`;
    }
    return 'Select a type, optionally search or add filters, then refresh.';
  };

  const renderStatus = ()=>{
    if (!statusEl) return;
    statusEl.textContent = describeStatus();
    statusEl.classList.toggle('error', !!runtime.error);
  };

  const renderResults = ()=>{
    if (!resultsRoot) return;
    resultsRoot.innerHTML = '';
    if (runtime.loading){
      const loading = document.createElement('div');
      loading.className = 'lists-results-empty';
      loading.textContent = 'Loading items...';
      resultsRoot.appendChild(loading);
      return;
    }
    if (runtime.error){
      const err = document.createElement('div');
      err.className = 'lists-results-empty';
      err.textContent = runtime.error;
      resultsRoot.appendChild(err);
      return;
    }
    if (!runtime.items.length){
      const empty = document.createElement('div');
      empty.className = 'lists-results-empty';
      empty.textContent = `No ${state.type || 'items'} matched the criteria.`;
      resultsRoot.appendChild(empty);
      return;
    }
    runtime.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'lists-item';
      const title = document.createElement('div');
      title.className = 'lists-item-name';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = item.name || '(untitled)';
      const typeSpan = document.createElement('span');
      typeSpan.textContent = (item.type || state.type || '').toUpperCase();
      title.append(nameSpan, typeSpan);
      row.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'lists-item-meta';
      const addPart = (label, value) => {
        if (!value && value !== 0) return;
        const span = document.createElement('span');
        span.textContent = `${label}: ${value}`;
        meta.appendChild(span);
      };
      addPart('Status', item.status);
      addPart('Priority', item.priority);
      addPart('Category', item.category);
      addPart('Stage', item.stage);
      addPart('Owner', item.owner);
      addPart('Updated', item.updated);

      const reserved = new Set(['name', 'type', 'category', 'priority', 'status', 'stage', 'owner', 'updated', 'inventory_items', 'tools']);
      let extrasShown = 0;
      Object.entries(item).forEach(([key, value]) => {
        if (reserved.has(key)) return;
        if (value == null || value === '') return;
        if (typeof value === 'object') return;
        if (extrasShown >= 2) return;
        addPart(key, value);
        extrasShown += 1;
      });
      if (meta.childNodes.length){
        row.appendChild(meta);
      }
      resultsRoot.appendChild(row);
    });
  };

  const createFilter = (initial = {}) => ({
    id: `filter-${filterCounter++}`,
    key: initial.key || '',
    value: initial.value || '',
  });

  const renderFilters = ()=>{
    if (!filtersRoot) return;
    filtersRoot.innerHTML = '';
    if (!state.filters.length){
      const hint = document.createElement('div');
      hint.className = 'lists-filter-empty';
      hint.textContent = 'No filters applied.';
      filtersRoot.appendChild(hint);
      return;
    }
    state.filters.forEach(filter => {
      const row = document.createElement('div');
      row.className = 'lists-filter-row';
      row.innerHTML = `
        <input type="text" class="lists-filter-key" placeholder="property (e.g., status)" />
        <input type="text" class="lists-filter-value" placeholder="value" />
        <button type="button" class="lists-filter-remove">Remove</button>
      `;
      const keyInput = row.querySelector('.lists-filter-key');
      const valInput = row.querySelector('.lists-filter-value');
      keyInput.value = filter.key || '';
      valInput.value = filter.value || '';
      keyInput.addEventListener('input', (ev)=>{
        filter.key = ev.target.value;
        persistState();
        scheduleListFetch(500);
      });
      valInput.addEventListener('input', (ev)=>{
        filter.value = ev.target.value;
        persistState();
        scheduleListFetch(500);
      });
      row.querySelector('.lists-filter-remove')?.addEventListener('click', ()=>{
        state.filters = state.filters.filter(entry => entry.id !== filter.id);
        persistState();
        renderFilters();
        scheduleListFetch(300);
      });
      filtersRoot.appendChild(row);
    });
  };

  const scheduleListFetch = (delay = 250)=>{
    if (runtime.timer){
      clearTimeout(runtime.timer);
    }
    runtime.timer = window.setTimeout(()=>{
      runtime.timer = null;
      loadListItems();
    }, delay);
  };

  const loadListItems = async ()=>{
    if (!state.type){
      runtime.error = 'Select an item type to load results.';
      runtime.items = [];
      runtime.loading = false;
      renderStatus();
      renderResults();
      return;
    }
    runtime.loading = true;
    runtime.error = '';
    renderStatus();
    renderResults();
    try {
      const params = new URLSearchParams();
      params.set('type', state.type);
      if (state.q){
        params.set('q', state.q);
      }
      const propParts = [];
      state.filters.forEach(filter => {
        const key = (filter.key || '').trim();
        const value = (filter.value || '').trim();
        if (!key || !value) return;
        propParts.push(`${encodeURIComponent(key.toLowerCase())}:${encodeURIComponent(value)}`);
      });
      if (propParts.length){
        params.set('props', propParts.join(','));
      }
      const resp = await fetch(`${apiBase()}/api/items?${params.toString()}`);
      const payload = await resp.json().catch(()=> ({}));
      if (!resp.ok || payload.ok === false){
        throw new Error(payload.error || payload.stderr || `HTTP ${resp.status}`);
      }
      const items = Array.isArray(payload.items) ? payload.items : [];
      runtime.items = items.slice(0, MAX_ITEMS);
      runtime.truncated = items.length > runtime.items.length;
      runtime.lastUpdated = new Date();
      runtime.error = '';
    } catch (error) {
      console.error('[Chronos][Panels][Lists] loadListItems failed', error);
      runtime.items = [];
      runtime.truncated = false;
      runtime.error = error?.message || 'Failed to load items';
    } finally {
      runtime.loading = false;
      renderStatus();
      renderResults();
    }
  };

  typeSelect.addEventListener('change', (ev)=>{
    state.type = ev.target.value || DEFAULT_TYPE;
    updateHeading();
    persistState();
    scheduleListFetch(150);
  });

  searchInput.addEventListener('input', (ev)=>{
    state.q = ev.target.value || '';
    persistState();
    scheduleListFetch(400);
  });

  addFilterBtn?.addEventListener('click', ()=>{
    state.filters.push(createFilter());
    persistState();
    renderFilters();
  });

  refreshBtn?.addEventListener('click', loadListItems);

  newPanelBtn?.addEventListener('click', ()=>{
    try { window.ListsPanelService?.create?.(); }
    catch (error) { console.error('[Chronos][Panels][Lists] Unable to spawn panel', error); }
  });

  removePanelBtn?.addEventListener('click', ()=>{
    const service = window.ListsPanelService;
    if (!service?.remove){
      console.warn('[Chronos][Panels][Lists] Remove service unavailable');
      return;
    }
    const result = service.remove(panelId);
    if (result?.ok === false && result.reason === 'locked'){
      window.alert('At least one Lists panel must remain.');
    }
  });

  updateHeading();
  renderFilters();
  renderStatus();
  renderResults();
  scheduleListFetch(100);

  return {
    dispose(){
      if (runtime.timer){
        clearTimeout(runtime.timer);
        runtime.timer = null;
      }
    }
  };
}
