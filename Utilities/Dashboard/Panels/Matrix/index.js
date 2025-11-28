const STYLE_ID = 'cockpit-matrix-panel-style';
const PANEL_BASE_ID = 'matrix';
const PANEL_STATE_PREFIX = 'chronos_matrix_panel_state_';
const INSTANCE_STORAGE_KEY = 'chronos_matrix_instances_v1';
const DEFAULT_ROWS = ['item_type'];
const DEFAULT_COLS = ['item_status'];
const DEFAULT_METRIC = 'count';
const DEFAULT_SORT = 'label-asc';
const SORT_OPTIONS = [
  { id: 'label-asc', label: 'Label A-Z' },
  { id: 'label-desc', label: 'Label Z-A' },
  { id: 'metric-desc', label: 'Metric High-Low' },
  { id: 'metric-asc', label: 'Metric Low-High' },
];
const FILTER_PLACEHOLDER_KEY = 'property (e.g., priority)';
const FILTER_PLACEHOLDER_VALUE = 'value (e.g., high)';

let managerRef = null;
let cachedInstances = null;

function apiBase(){
  const origin = window.location.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

function injectStyles(){
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .matrix-panel-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 10px;
      color: #dfe5ff;
      font-size: 14px;
    }
    .matrix-panel-toolbar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      align-items: start;
    }
    .matrix-panel-toolbar label,
    .matrix-panel-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
      letter-spacing: 0.4px;
      color: #98a5ce;
      text-transform: uppercase;
    }
    .matrix-panel-toolbar select,
    .matrix-panel-toolbar input {
      background: rgba(18,24,37,0.92);
      border: 1px solid rgba(90,97,130,0.9);
      border-radius: 8px;
      padding: 6px 10px;
      color: #f1f4ff;
      font-size: 13px;
    }
    .matrix-panel-actions .title {
      font-size: 11px;
      letter-spacing: 0.6px;
    }
    .matrix-panel-button-group,
    .matrix-panel-presets {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .matrix-panel-toolbar button,
    .matrix-panel-actions button {
      background: linear-gradient(135deg, #5d8dff, #8373ff);
      border: none;
      border-radius: 10px;
      color: #fff;
      padding: 8px 12px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.1s ease;
      font-size: 13px;
    }
    .matrix-panel-toolbar button:hover,
    .matrix-panel-actions button:hover {
      transform: translateY(-1px);
    }
    .matrix-panel-mini-btn {
      align-self: flex-start;
      background: rgba(53,64,98,0.9) !important;
      border-radius: 8px;
      padding: 4px 10px !important;
      font-size: 11px !important;
    }
    .matrix-panel-dimension-list,
    .matrix-panel-filter-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .matrix-panel-dimension-entry,
    .matrix-panel-filter-entry {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .matrix-panel-dimension-entry input,
    .matrix-panel-filter-entry input {
      flex: 1;
    }
    .matrix-panel-dimension-entry button,
    .matrix-panel-filter-entry button {
      background: rgba(120,86,108,0.9);
      border: none;
      color: #fff;
      border-radius: 8px;
      width: 28px;
      height: 28px;
      font-weight: 700;
      cursor: pointer;
      line-height: 1;
    }
    .matrix-panel-filters {
      border: 1px solid rgba(58,68,96,0.8);
      border-radius: 12px;
      padding: 10px 12px;
      background: rgba(8,11,18,0.9);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .matrix-panel-filter-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      letter-spacing: 0.5px;
      color: #8fa0cd;
      text-transform: uppercase;
    }
    .matrix-panel-status {
      font-size: 12px;
      color: #8c9dc2;
    }
    .matrix-panel-body {
      flex: 1;
      border: 1px solid rgba(60,70,96,0.8);
      border-radius: 16px;
      background: rgba(9,12,21,0.9);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .matrix-panel-message {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      color: #9aa5c7;
      padding: 16px;
      text-align: center;
    }
    .matrix-panel-table-wrapper {
      overflow: auto;
      flex: 1;
    }
    table.matrix-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 360px;
    }
    table.matrix-table th,
    table.matrix-table td {
      border: 1px solid rgba(60,70,96,0.5);
      padding: 8px 10px;
      font-size: 13px;
    }
    table.matrix-table th {
      background: rgba(18,24,37,0.95);
      font-weight: 600;
      text-align: left;
      color: #f5f6ff;
      position: sticky;
      top: 0;
      z-index: 2;
    }
    table.matrix-table td {
      color: #e6ebff;
      min-width: 120px;
    }
    table.matrix-table td[data-empty="true"] {
      color: #6e779a;
    }
  `;
  document.head.appendChild(style);
}

function formatMinutes(total){
  if (!Number.isFinite(total)) return '--';
  const minutes = Math.max(0, Math.round(total));
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours && remaining){
    return `${hours}h ${remaining}m`;
  }
  if (hours) return `${hours}h`;
  return `${remaining}m`;
}

function readStoredJSON(key){
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[Chronos][Matrix] Failed to parse stored value', err);
    return null;
  }
}

function writeStoredJSON(key, value){
  try {
    if (value === null){
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (err) {
    console.warn('[Chronos][Matrix] Failed to persist value', err);
  }
}

function panelFiltersToObject(filters){
  const out = {};
  (filters || []).forEach(entry => {
    if (!entry) return;
    const key = (entry.key || '').trim();
    const value = (entry.value || '').trim();
    if (!key || !value) return;
    out[key] = value;
  });
  return out;
}

function filtersFromObject(obj){
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj).map(([key, value]) => ({ key, value }));
}

function sanitizeSequence(sequence, fallback){
  const cleaned = (sequence || []).map(entry => (entry || '').trim()).filter(Boolean);
  return cleaned.length ? cleaned : [...fallback];
}

function mountMatrixPanel(root, panelId){
  injectStyles();
  root.innerHTML = `
    <div class="matrix-panel-shell">
      <div class="matrix-panel-toolbar">
        <label>Rows
          <div class="matrix-panel-dimension-list" data-field="rows"></div>
          <button type="button" class="matrix-panel-mini-btn" data-action="add-row">Add Row</button>
        </label>
        <label>Columns
          <div class="matrix-panel-dimension-list" data-field="cols"></div>
          <button type="button" class="matrix-panel-mini-btn" data-action="add-col">Add Column</button>
        </label>
        <label>Metric
          <select data-field="metric"></select>
        </label>
        <label>Row Sort
          <select data-field="row-sort"></select>
        </label>
        <label>Column Sort
          <select data-field="col-sort"></select>
        </label>
        <div class="matrix-panel-actions">
          <span class="title">Actions</span>
          <div class="matrix-panel-button-group">
            <button type="button" data-action="refresh">Refresh</button>
            <button type="button" data-action="new-panel">New Panel</button>
            <button type="button" data-action="remove-panel">Remove Panel</button>
            <button type="button" data-action="save-preset">Save Preset</button>
          </div>
          <div class="matrix-panel-presets">
            <select data-field="preset"></select>
            <button type="button" data-action="load-preset">Load</button>
            <button type="button" data-action="delete-preset">Delete</button>
          </div>
        </div>
      </div>
      <div class="matrix-panel-filters">
        <div class="matrix-panel-filter-header">
          <span>Filters</span>
          <button type="button" class="matrix-panel-mini-btn" data-action="add-filter">Add Filter</button>
        </div>
        <div class="matrix-panel-filter-list" data-field="filters"></div>
      </div>
      <div class="matrix-panel-status"></div>
      <div class="matrix-panel-body">
        <div class="matrix-panel-table-wrapper"></div>
        <div class="matrix-panel-message">Loading matrix...</div>
      </div>
    </div>
  `;

  const rowsContainer = root.querySelector('[data-field="rows"]');
  const colsContainer = root.querySelector('[data-field="cols"]');
  const metricSelect = root.querySelector('select[data-field="metric"]');
  const rowSortSelect = root.querySelector('select[data-field="row-sort"]');
  const colSortSelect = root.querySelector('select[data-field="col-sort"]');
  const presetSelect = root.querySelector('select[data-field="preset"]');
  const refreshBtn = root.querySelector('button[data-action="refresh"]');
  const savePresetBtn = root.querySelector('button[data-action="save-preset"]');
  const loadPresetBtn = root.querySelector('button[data-action="load-preset"]');
  const deletePresetBtn = root.querySelector('button[data-action="delete-preset"]');
  const addRowBtn = root.querySelector('button[data-action="add-row"]');
  const addColBtn = root.querySelector('button[data-action="add-col"]');
  const addFilterBtn = root.querySelector('button[data-action="add-filter"]');
  const newPanelBtn = root.querySelector('button[data-action="new-panel"]');
  const removePanelBtn = root.querySelector('button[data-action="remove-panel"]');
  const filterList = root.querySelector('[data-field="filters"]');
  const statusEl = root.querySelector('.matrix-panel-status');
  const tableWrapper = root.querySelector('.matrix-panel-table-wrapper');
  const messageEl = root.querySelector('.matrix-panel-message');
  const dimensionInputId = `matrix-dims-${Math.random().toString(36).slice(2)}`;
  const dimensionDatalist = document.createElement('datalist');
  dimensionDatalist.id = dimensionInputId;
  root.appendChild(dimensionDatalist);
  const filterKeyInputId = `matrix-filter-keys-${Math.random().toString(36).slice(2)}`;
  const filterKeyDatalist = document.createElement('datalist');
  filterKeyDatalist.id = filterKeyInputId;
  root.appendChild(filterKeyDatalist);
  const filterValueListPrefix = `matrix-filter-values-${Math.random().toString(36).slice(2)}`;

  const panelKey = panelId || PANEL_BASE_ID;
  const stored = ensurePanelState(panelKey) || {};
  const state = {
    panelId: panelKey,
    rows: sanitizeSequence(stored.rows || DEFAULT_ROWS, DEFAULT_ROWS),
    cols: sanitizeSequence(stored.cols || DEFAULT_COLS, DEFAULT_COLS),
    metric: stored.metric || DEFAULT_METRIC,
    rowSort: stored.rowSort || DEFAULT_SORT,
    colSort: stored.colSort || DEFAULT_SORT,
    filters: Array.isArray(stored.filters) ? stored.filters : filtersFromObject(stored.filterMap),
    dims: [],
    metrics: [],
    presets: [],
    activePreset: stored.preset || '',
    payload: null,
    loading: false,
    error: null,
    updatedAt: null,
    properties: [],
    propertyValues: {},
    itemTypes: [],
    templateTypes: [],
  };

  const canonicalKey = (value)=>{
    if (value === null || value === undefined) return '';
    return String(value).trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ');
  };

  const formatLabel = (value)=>{
    if (!value) return '';
    return value.split(' ').map(part => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ');
  };

  const persistState = ()=>{
    storePanelState(panelKey, {
      rows: state.rows,
      cols: state.cols,
      metric: state.metric,
      rowSort: state.rowSort,
      colSort: state.colSort,
      filters: state.filters,
      preset: state.activePreset,
    });
  };

  const updateDimensionDatalist = ()=>{
    dimensionDatalist.innerHTML = '';
    (state.dims || []).forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.id;
      option.label = opt.label;
      dimensionDatalist.appendChild(option);
    });
  };

  const updateFilterKeyDatalist = ()=>{
    filterKeyDatalist.innerHTML = '';
    const seen = new Set();
    const pushOption = (value, label)=>{
      const normalized = canonicalKey(value);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      const option = document.createElement('option');
      option.value = normalized;
      option.label = label || formatLabel(normalized);
      filterKeyDatalist.appendChild(option);
    };
    pushOption('type', 'Item Type');
    pushOption('item_type', 'Item Type');
    pushOption('template_type', 'Template Type');
    (state.properties || []).forEach(key=>{
      pushOption(key, `Property: ${formatLabel(key)}`);
    });
  };

  const valueOptionsForKey = (key)=>{
    const normalized = canonicalKey(key);
    if (!normalized) return [];
    if (normalized === 'type' || normalized === 'item type' || normalized === 'item_type'){
      return state.itemTypes || [];
    }
    if (normalized.includes('template')){
      return state.templateTypes || [];
    }
    const propertyValues = state.propertyValues || {};
    return propertyValues[normalized] || [];
  };

  const ensureValueDatalist = (index, key)=>{
    const listId = `${filterValueListPrefix}-${index}`;
    let datalist = root.querySelector(`#${listId}`);
    if (!datalist){
      datalist = document.createElement('datalist');
      datalist.id = listId;
      root.appendChild(datalist);
    }
    datalist.innerHTML = '';
    valueOptionsForKey(key).forEach(entry=>{
      const option = document.createElement('option');
      option.value = entry;
      option.label = formatLabel(entry);
      datalist.appendChild(option);
    });
    return listId;
  };

  const renderMetricOptions = ()=>{
    metricSelect.innerHTML = '';
    (state.metrics || []).forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.id;
      option.textContent = opt.label;
      metricSelect.appendChild(option);
    });
    if (!state.metrics.length){
      const fallback = document.createElement('option');
      fallback.value = state.metric;
      fallback.textContent = state.metric;
      metricSelect.appendChild(fallback);
    }
    metricSelect.value = state.metrics.some(opt => opt.id === state.metric)
      ? state.metric
      : (state.metrics[0]?.id || DEFAULT_METRIC);
    state.metric = metricSelect.value;
  };

  const renderSortOptions = ()=>{
    const fill = (select, current)=>{
      select.innerHTML = '';
      SORT_OPTIONS.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.id;
        option.textContent = opt.label;
        select.appendChild(option);
      });
      select.value = SORT_OPTIONS.some(opt => opt.id === current) ? current : DEFAULT_SORT;
    };
    fill(rowSortSelect, state.rowSort);
    fill(colSortSelect, state.colSort);
  };

  const createDimensionEntry = (type, value, index)=>{
    const wrapper = document.createElement('div');
    wrapper.className = 'matrix-panel-dimension-entry';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = 'e.g., priority';
    input.dataset.type = type;
    input.dataset.index = String(index);
    input.setAttribute('list', dimensionInputId);
    input.addEventListener('change', ()=>{
      const next = type === 'row' ? [...state.rows] : [...state.cols];
      next[index] = input.value;
      if (type === 'row') state.rows = sanitizeSequence(next, DEFAULT_ROWS);
      else state.cols = sanitizeSequence(next, DEFAULT_COLS);
      state.activePreset = '';
      persistState();
      renderDimensionLists();
      fetchMatrix();
    });
    wrapper.appendChild(input);
    const collection = type === 'row' ? state.rows : state.cols;
    if (collection.length > 1){
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'x';
      removeBtn.addEventListener('click', ()=>{
        const next = [...collection];
        next.splice(index, 1);
        if (type === 'row') state.rows = sanitizeSequence(next, DEFAULT_ROWS);
        else state.cols = sanitizeSequence(next, DEFAULT_COLS);
        state.activePreset = '';
        persistState();
        renderDimensionLists();
        fetchMatrix();
      });
      wrapper.appendChild(removeBtn);
    }
    return wrapper;
  };

  const renderDimensionLists = ()=>{
    const render = (container, values, type)=>{
      container.innerHTML = '';
      values.forEach((value, index)=>{
        container.appendChild(createDimensionEntry(type, value, index));
      });
    };
    render(rowsContainer, state.rows, 'row');
    render(colsContainer, state.cols, 'col');
  };

  const renderFilterList = ()=>{
    filterList.innerHTML = '';
    root.querySelectorAll(`datalist[id^="${filterValueListPrefix}-"]`).forEach(node => node.remove());
    if (!state.filters.length){
      const empty = document.createElement('div');
      empty.className = 'matrix-panel-filter-entry';
      const span = document.createElement('span');
      span.style.color = '#7c85a8';
      span.textContent = 'No filters applied';
      empty.appendChild(span);
      filterList.appendChild(empty);
      return;
    }
    state.filters.forEach((entry, index)=>{
      const row = document.createElement('div');
      row.className = 'matrix-panel-filter-entry';
      const keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.placeholder = FILTER_PLACEHOLDER_KEY;
      keyInput.value = entry?.key || '';
      keyInput.dataset.index = String(index);
      keyInput.setAttribute('list', filterKeyInputId);
      keyInput.addEventListener('change', ()=>{
        state.filters[index].key = keyInput.value;
        state.activePreset = '';
        persistState();
        renderFilterList();
        fetchMatrix();
      });
      const valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.placeholder = FILTER_PLACEHOLDER_VALUE;
      valueInput.value = entry?.value || '';
      valueInput.dataset.index = String(index);
      const valueListId = ensureValueDatalist(index, entry?.key);
      valueInput.setAttribute('list', valueListId);
      valueInput.addEventListener('change', ()=>{
        state.filters[index].value = valueInput.value;
        state.activePreset = '';
        persistState();
        fetchMatrix();
      });
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'x';
      removeBtn.addEventListener('click', ()=>{
        state.filters.splice(index, 1);
        state.activePreset = '';
        persistState();
        renderFilterList();
        fetchMatrix();
      });
      row.append(keyInput, valueInput, removeBtn);
      filterList.appendChild(row);
    });
  };

  const updatePresetSelect = ()=>{
    presetSelect.innerHTML = '';
    const baseOption = document.createElement('option');
    baseOption.value = '';
    baseOption.textContent = 'Select a preset';
    presetSelect.appendChild(baseOption);
    (state.presets || []).forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.name;
      option.textContent = preset.label || preset.name;
      presetSelect.appendChild(option);
    });
    if (state.activePreset){
      presetSelect.value = state.presets.some(p => p.name === state.activePreset) ? state.activePreset : '';
    } else {
      presetSelect.value = '';
    }
  };

  const filterMap = ()=> panelFiltersToObject(state.filters);

  const setStatus = ()=>{
    if (state.loading){
      statusEl.textContent = 'Loading...';
      return;
    }
    if (state.error){
      statusEl.textContent = 'Error';
      return;
    }
    const bits = [];
    if (state.updatedAt){
      bits.push(`Updated ${state.updatedAt.toLocaleTimeString()}`);
    }
    if (state.activePreset){
      bits.push(`Preset: ${state.activePreset}`);
    }
    statusEl.textContent = bits.join(' | ');
  };

  const formatValue = (cell)=>{
    if (!cell) return '--';
    if (state.metric === 'duration') return formatMinutes(Number(cell.value) || 0);
    if (state.metric === 'points'){
      const num = Number(cell.value) || 0;
      return `${num % 1 === 0 ? num : num.toFixed(1)} pts`;
    }
    if (typeof cell.value === 'number') return cell.value.toLocaleString();
    if (typeof cell.value === 'string' && cell.value.trim()) return cell.value;
    return '--';
  };

  const renderTable = ()=>{
    tableWrapper.innerHTML = '';
    if (state.loading){
      messageEl.textContent = 'Loading matrix...';
      messageEl.style.display = 'flex';
      return;
    }
    if (state.error){
      messageEl.textContent = state.error;
      messageEl.style.display = 'flex';
      return;
    }
    const rows = state.payload?.rows || [];
    const cols = state.payload?.cols || [];
    if (!rows.length || !cols.length){
      messageEl.textContent = 'No data for this configuration yet.';
      messageEl.style.display = 'flex';
      return;
    }
    messageEl.style.display = 'none';
    const table = document.createElement('table');
    table.className = 'matrix-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.appendChild(document.createElement('th'));
    cols.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    const cells = state.payload?.cells || {};
    rows.forEach(row => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = row.label;
      tr.appendChild(th);
      cols.forEach(col => {
        const td = document.createElement('td');
        const cell = cells[`${row.id}|${col.id}`];
        td.textContent = formatValue(cell);
        if (!cell || !cell.value) td.dataset.empty = 'true';
        if (cell?.items?.length){
          td.title = cell.items.slice(0, 8).join('\\n');
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrapper.appendChild(table);
  };

  const buildParams = ()=>{
    const params = new URLSearchParams({
      row: JSON.stringify(state.rows),
      col: JSON.stringify(state.cols),
      metric: state.metric,
      row_sort: state.rowSort,
      col_sort: state.colSort,
    });
    const filters = filterMap();
    if (Object.keys(filters).length){
      params.set('filters', JSON.stringify(filters));
    }
    return params;
  };

  const fetchMatrix = async ()=>{
    state.loading = true;
    state.error = null;
    setStatus();
    renderTable();
    try {
      const params = buildParams();
      const resp = await fetch(`${apiBase()}/api/cockpit/matrix?${params.toString()}`);
      const payload = await resp.json();
      if (!resp.ok || payload.ok === false){
        throw new Error(payload.error || `Matrix unavailable (HTTP ${resp.status})`);
      }
      state.payload = payload;
      state.dims = payload.available_dimensions || state.dims;
      state.metrics = payload.available_metrics || state.metrics;
      state.properties = Array.isArray(payload.properties) ? payload.properties : state.properties;
      state.propertyValues = payload.property_values || state.propertyValues;
      state.itemTypes = Array.isArray(payload.item_types) ? payload.item_types : state.itemTypes;
      state.templateTypes = Array.isArray(payload.template_types) ? payload.template_types : state.templateTypes;
      if (Array.isArray(payload.meta?.row_dimensions)){
        state.rows = sanitizeSequence(payload.meta.row_dimensions, DEFAULT_ROWS);
      }
      if (Array.isArray(payload.meta?.col_dimensions)){
        state.cols = sanitizeSequence(payload.meta.col_dimensions, DEFAULT_COLS);
      }
      if (payload.meta?.row_sort){
        state.rowSort = payload.meta.row_sort;
      }
      if (payload.meta?.col_sort){
        state.colSort = payload.meta.col_sort;
      }
      state.updatedAt = new Date();
      updateDimensionDatalist();
      renderMetricOptions();
      renderSortOptions();
      updateFilterKeyDatalist();
      renderDimensionLists();
      renderFilterList();
      persistState();
    } catch (error) {
      console.error('[Chronos][Cockpit] Matrix panel failed', error);
      state.error = error?.message || 'Unable to load matrix data.';
      state.payload = null;
    } finally {
      state.loading = false;
      setStatus();
      renderTable();
    }
  };

  const fetchMetadata = ()=>{
    return fetch(`${apiBase()}/api/cockpit/matrix?meta=true`)
      .then(resp => resp.json())
      .then(payload => {
        if (payload?.available_dimensions){
          state.dims = payload.available_dimensions;
        }
        if (payload?.available_metrics){
          state.metrics = payload.available_metrics;
        }
        if (Array.isArray(payload?.properties)){
          state.properties = payload.properties;
        }
        if (payload?.property_values){
          state.propertyValues = payload.property_values;
        }
        if (Array.isArray(payload?.item_types)){
          state.itemTypes = payload.item_types;
        }
        if (Array.isArray(payload?.template_types)){
          state.templateTypes = payload.template_types;
        }
        updateDimensionDatalist();
        updateFilterKeyDatalist();
        renderMetricOptions();
      })
      .catch(()=>{});
  };

  const fetchPresets = ()=>{
    return fetch(`${apiBase()}/api/cockpit/matrix/presets`)
      .then(resp => resp.json())
      .then(payload => {
        if (payload?.ok){
          state.presets = payload.presets || [];
          updatePresetSelect();
        }
      })
      .catch(()=>{});
  };

  const applyPreset = (preset)=>{
    if (!preset) return;
    state.rows = sanitizeSequence(preset.rows || preset.row_dimensions || DEFAULT_ROWS, DEFAULT_ROWS);
    state.cols = sanitizeSequence(preset.cols || preset.col_dimensions || DEFAULT_COLS, DEFAULT_COLS);
    state.metric = preset.metric || DEFAULT_METRIC;
    state.rowSort = preset.row_sort || DEFAULT_SORT;
    state.colSort = preset.col_sort || DEFAULT_SORT;
    state.filters = filtersFromObject(preset.filters || preset.filter_map || {});
    state.activePreset = preset.name || preset.label || '';
    renderDimensionLists();
    renderSortOptions();
    renderMetricOptions();
    renderFilterList();
    updatePresetSelect();
    persistState();
    fetchMatrix();
  };

  const loadPresetByName = async (name)=>{
    if (!name) return;
    try {
      const resp = await fetch(`${apiBase()}/api/cockpit/matrix/presets?name=${encodeURIComponent(name)}`);
      const payload = await resp.json();
      if (!resp.ok || payload.ok === false){
        throw new Error(payload.error || 'Preset unavailable');
      }
      applyPreset(payload.preset);
    } catch (error) {
      console.error('[Chronos][Cockpit] Failed to load preset', error);
      state.error = error?.message || 'Unable to load preset.';
      setStatus();
    }
  };

  const savePreset = async ()=>{
    const initialName = state.activePreset || '';
    const label = window.prompt('Preset name', initialName) || '';
    if (!label.trim()) return;
    const payload = {
      name: label.trim(),
      label: label.trim(),
      rows: state.rows,
      cols: state.cols,
      metric: state.metric,
      filters: filterMap(),
      row_sort: state.rowSort,
      col_sort: state.colSort,
    };
    try {
      const resp = await fetch(`${apiBase()}/api/cockpit/matrix/presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await resp.json();
      if (!resp.ok || body.ok === false){
        throw new Error(body.error || 'Unable to save preset');
      }
      state.activePreset = payload.name;
      await fetchPresets();
      updatePresetSelect();
      persistState();
      setStatus();
    } catch (error) {
      console.error('[Chronos][Cockpit] Failed to save preset', error);
      state.error = error?.message || 'Unable to save preset.';
      setStatus();
    }
  };

  const deletePreset = async ()=>{
    const name = presetSelect.value;
    if (!name) return;
    if (!window.confirm(`Delete preset "${name}"?`)) return;
    try {
      const resp = await fetch(`${apiBase()}/api/cockpit/matrix/presets/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const body = await resp.json();
      if (!resp.ok || body.ok === false){
        throw new Error(body.error || 'Unable to delete preset');
      }
      if (state.activePreset === name){
        state.activePreset = '';
      }
      await fetchPresets();
      updatePresetSelect();
      persistState();
      setStatus();
    } catch (error) {
      console.error('[Chronos][Cockpit] Failed to delete preset', error);
      state.error = error?.message || 'Unable to delete preset.';
      setStatus();
    }
  };

  const handleMetricChange = ()=>{
    state.metric = metricSelect.value;
    state.activePreset = '';
    persistState();
    fetchMatrix();
  };

  const handleRowSortChange = ()=>{
    state.rowSort = rowSortSelect.value;
    state.activePreset = '';
    persistState();
    fetchMatrix();
  };

  const handleColSortChange = ()=>{
    state.colSort = colSortSelect.value;
    state.activePreset = '';
    persistState();
    fetchMatrix();
  };

  metricSelect.addEventListener('change', handleMetricChange);
  rowSortSelect.addEventListener('change', handleRowSortChange);
  colSortSelect.addEventListener('change', handleColSortChange);
  refreshBtn.addEventListener('click', fetchMatrix);
  savePresetBtn.addEventListener('click', savePreset);
  loadPresetBtn.addEventListener('click', ()=> loadPresetByName(presetSelect.value));
  deletePresetBtn.addEventListener('click', deletePreset);
  addRowBtn.addEventListener('click', ()=>{
    const suggestion = state.dims.find(opt => !state.rows.includes(opt.id));
    state.rows = sanitizeSequence([...state.rows, suggestion?.id || state.rows[state.rows.length - 1] || DEFAULT_ROWS[0]], DEFAULT_ROWS);
    state.activePreset = '';
    persistState();
    renderDimensionLists();
    fetchMatrix();
  });
  addColBtn.addEventListener('click', ()=>{
    const suggestion = state.dims.find(opt => !state.cols.includes(opt.id));
    state.cols = sanitizeSequence([...state.cols, suggestion?.id || state.cols[state.cols.length - 1] || DEFAULT_COLS[0]], DEFAULT_COLS);
    state.activePreset = '';
    persistState();
    renderDimensionLists();
    fetchMatrix();
  });
  addFilterBtn.addEventListener('click', ()=>{
    state.filters.push({ key: '', value: '' });
    state.activePreset = '';
    persistState();
    renderFilterList();
  });
  newPanelBtn.addEventListener('click', ()=>{
    try { window.MatrixPanelService?.create?.(); } catch (error) { console.error('[Chronos][Matrix] Unable to create panel', error); }
  });
  removePanelBtn.addEventListener('click', ()=>{
    const service = window.MatrixPanelService;
    if (!service?.remove){
      console.warn('[Chronos][Matrix] Remove service unavailable');
      return;
    }
    const result = service.remove(panelKey);
    if (result?.ok === false && result.reason === 'locked'){
      window.alert('At least one Matrix panel must remain.');
    }
  });

  Promise.all([fetchMetadata(), fetchPresets()])
    .finally(()=>{
      renderDimensionLists();
      renderFilterList();
      renderMetricOptions();
      renderSortOptions();
      updatePresetSelect();
      setStatus();
      fetchMatrix();
    });

  return {
    dispose(){
      metricSelect.removeEventListener('change', handleMetricChange);
      rowSortSelect.removeEventListener('change', handleRowSortChange);
      colSortSelect.removeEventListener('change', handleColSortChange);
      refreshBtn.removeEventListener('click', fetchMatrix);
      savePresetBtn.removeEventListener('click', savePreset);
      loadPresetBtn.removeEventListener('click', ()=> loadPresetByName(presetSelect.value));
      deletePresetBtn.removeEventListener('click', deletePreset);
      addRowBtn.removeEventListener('click', ()=>{});
      addColBtn.removeEventListener('click', ()=>{});
      addFilterBtn.removeEventListener('click', ()=>{});
      newPanelBtn.removeEventListener('click', ()=>{});
      removePanelBtn.removeEventListener('click', ()=>{});
    }
  };
}

export function register(manager){
  registerPanels(manager);
}

const autoAttach = (manager) => {
  try {
    if (manager && typeof manager.registerPanel === 'function') {
      registerPanels(manager);
    }
  } catch (err) {
    console.error('[Chronos][Panels] Failed to register matrix panel', err);
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
function loadInstanceRecords(){
  if (cachedInstances) return cachedInstances;
  const stored = readStoredJSON(INSTANCE_STORAGE_KEY);
  if (Array.isArray(stored) && stored.length){
    cachedInstances = stored;
  } else {
    cachedInstances = [{ id: PANEL_BASE_ID, label: 'Matrix' }];
    writeStoredJSON(INSTANCE_STORAGE_KEY, cachedInstances);
  }
  return cachedInstances;
}

function persistInstances(){
  if (!cachedInstances) return;
  writeStoredJSON(INSTANCE_STORAGE_KEY, cachedInstances);
}

function panelStateKey(panelId){
  return `${PANEL_STATE_PREFIX}${panelId || PANEL_BASE_ID}`;
}

function ensurePanelState(panelId){
  const saved = readStoredJSON(panelStateKey(panelId));
  if (!saved) return null;
  return saved;
}

function storePanelState(panelId, data){
  writeStoredJSON(panelStateKey(panelId), data);
}

function generateInstanceId(){
  return `${PANEL_BASE_ID}-${Math.random().toString(36).slice(2, 8)}`;
}

function nextInstanceLabel(){
  const existing = loadInstanceRecords();
  const base = 'Matrix';
  let counter = existing.length + 1;
  let candidate = `${base} ${counter}`;
  const labels = new Set(existing.map(inst => (inst.label || '').toLowerCase()));
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
  const idx = instances.findIndex(inst => inst.id === id);
  if (idx === -1) return false;
  instances.splice(idx, 1);
  persistInstances();
  return true;
}

function renameInstanceRecord(id, label){
  const instances = loadInstanceRecords();
  const target = instances.find(inst => inst.id === id);
  if (!target) return false;
  target.label = label && label.trim() ? label.trim() : target.label;
  persistInstances();
  return true;
}

function createDefinition(instance){
  return {
    id: instance.id,
    label: instance.label || 'Matrix',
    defaultVisible: false,
    defaultPosition: { x: 120, y: 80 },
    size: { width: 640, height: 480 },
    mount: (el)=> mountMatrixPanel(el, instance.id),
  };
}

function ensureService(){
  window.MatrixPanelService = {
    list: ()=> [...loadInstanceRecords()],
    create: (label)=>{
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
    remove: (id)=>{
      if (!id) return { ok: false, reason: 'missing' };
      const removed = removeInstanceRecord(id);
      if (!removed) return { ok: false, reason: 'locked' };
      try { managerRef?.remove?.(id); } catch {}
      storePanelState(id, null);
      return { ok: true };
    },
    rename: (id, label)=> renameInstanceRecord(id, label),
  };
}

function registerPanels(manager){
  injectStyles();
  managerRef = manager;
  const instances = loadInstanceRecords();
  instances.forEach(instance => {
    manager.registerPanel(createDefinition(instance));
  });
  ensureService();
}
