const PANEL_ID = 'random-picker';
const STYLE_ID = 'cockpit-random-picker-style';
const ITEM_TYPES = [
  'task', 'goal', 'project', 'milestone', 'commitment', 'reward', 'habit',
  'routine', 'subroutine', 'microroutine', 'timeblock', 'window',
  'day', 'week', 'month', 'note', 'appointment', 'reminder', 'alarm', 'ritual',
];
const TEMPLATE_TYPES = ['goal', 'project', 'day', 'week', 'month', 'routine', 'subroutine', 'microroutine', 'window', 'timeblock'];

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function normalizeCurrentStatus(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.entries(raw).forEach(([key, value]) => {
    const k = slugify(key);
    const v = String(value || '').trim().toLowerCase();
    if (k && v) out[k] = v;
  });
  return out;
}

function normalizeStatusRequirements(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  Object.entries(raw).forEach(([key, value]) => {
    const k = slugify(key);
    const vals = asArray(value)
      .flatMap((entry) => String(entry || '').split(','))
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    if (k && vals.length) out[k] = Array.from(new Set(vals));
  });
  return out;
}

function normalizeOption(value) {
  return String(value || '').trim().toLowerCase();
}

function rankDistance(statusKey, currentValue, requiredValue, rankMaps) {
  const currentNorm = normalizeOption(currentValue);
  const requiredNorm = normalizeOption(requiredValue);
  if (!currentNorm || !requiredNorm) return Number.POSITIVE_INFINITY;
  if (currentNorm === requiredNorm) return 0;
  const byStatus = rankMaps?.[statusKey];
  if (!byStatus || typeof byStatus !== 'object') return Number.POSITIVE_INFINITY;
  const currentRank = Number(byStatus[currentNorm]);
  const requiredRank = Number(byStatus[requiredNorm]);
  if (!Number.isFinite(currentRank) || !Number.isFinite(requiredRank)) return Number.POSITIVE_INFINITY;
  return Math.abs(currentRank - requiredRank);
}

function extractLegacyStatusRequirements(item, knownKeys) {
  const out = {};
  if (!item || typeof item !== 'object' || Array.isArray(item)) return out;
  (knownKeys || []).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(item, key)) return;
    const vals = asArray(item[key])
      .flatMap((entry) => String(entry || '').split(','))
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    if (vals.length) out[key] = Array.from(new Set(vals));
  });
  return out;
}

function scoreByDistance(statusKey, distance, rankMaps = {}) {
  if (!Number.isFinite(distance)) return 0;
  if (distance <= 0) return 100;
  const byStatus = rankMaps?.[statusKey];
  const values = byStatus && typeof byStatus === 'object'
    ? Object.values(byStatus).map((v) => Number(v)).filter((n) => Number.isFinite(n))
    : [];
  const minRank = values.length ? Math.min(...values) : 1;
  const maxRank = values.length ? Math.max(...values) : 4;
  const span = Math.max(1, maxRank - minRank);
  const normalized = Math.max(0, 1 - (distance / span));
  return Math.round(normalized * 100);
}

function evaluateStatusRequirementMatch(item, currentStatus, rankMaps = {}, indicatorWeights = {}) {
  const knownKeys = Object.keys(currentStatus || {});
  const direct = normalizeStatusRequirements(item?.status_requirements);
  const legacy = extractLegacyStatusRequirements(item, knownKeys);
  const req = { ...legacy, ...direct };
  const keys = Object.keys(req);
  if (!keys.length) return { hasRequirements: false, matched: true, req, missing: [], fitPercent: 100, comparableWeight: 0 };
  const missing = [];
  const skipped = [];
  let weightedSum = 0;
  let totalWeight = 0;
  let matched = true;
  keys.forEach((key) => {
    const active = String(currentStatus?.[key] || '').trim().toLowerCase();
    if (!active) {
      skipped.push(key);
      return;
    }
    const allowed = req[key] || [];
    let keyScore = 0;
    if (active && allowed.length) {
      keyScore = allowed.reduce((best, candidate) => {
        const d = rankDistance(key, active, candidate, rankMaps);
        const s = scoreByDistance(key, d, rankMaps);
        return s > best ? s : best;
      }, 0);
    }
    const w = Number(indicatorWeights?.[key]);
    const weight = Number.isFinite(w) && w > 0 ? w : 1;
    weightedSum += keyScore * weight;
    totalWeight += weight;
    const keyMatch = keyScore >= 100;
    if (!keyMatch) {
      matched = false;
      missing.push(key);
    }
  });
  const fitPercent = totalWeight > 0
    ? Math.round(weightedSum / totalWeight)
    : 100;
  return { hasRequirements: true, matched, req, missing, skipped, fitPercent, comparableWeight: totalWeight };
}

function injectStyles(){
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .random-picker-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 8px;
      color: var(--chronos-text);
      font-size: 12px;
    }
    .random-picker-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .random-picker-title {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .random-picker-title strong {
      font-size: 14px;
      font-weight: 700;
      color: var(--chronos-text);
    }
    .random-picker-title span {
      color: var(--chronos-text-muted);
      font-size: 11px;
      letter-spacing: 0.4px;
    }
    .random-picker-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .random-picker-btn {
      border: 1px solid rgba(255,255,255,0.1);
      background: var(--chronos-surface-soft);
      color: var(--chronos-text);
      border-radius: 10px;
      padding: 6px 10px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease;
      font-size: 12px;
    }
    .random-picker-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(2, 4, 12, 0.35);
    }
    .random-picker-btn[disabled] {
      opacity: 0.6;
      cursor: default;
      transform: none;
      box-shadow: none;
    }
    .random-picker-btn--primary {
      background: var(--chronos-accent-gradient);
      border-color: rgba(255,255,255,0.18);
    }
    .random-picker-btn--ghost {
      background: transparent;
      border-style: dashed;
    }
    .random-picker-filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 8px;
      padding: 8px;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      background: var(--chronos-surface);
    }
    .random-picker-filters label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: var(--chronos-text-muted);
    }
    .random-picker-filters select,
    .random-picker-filters input {
      background: var(--chronos-surface-soft);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      padding: 6px 8px;
      color: var(--chronos-text);
      font-size: 12px;
    }
    .random-picker-filters input[type="date"] {
      color-scheme: dark;
      background: color-mix(in srgb, var(--chronos-surface-soft) 88%, #0a0f1a 12%);
    }
    .random-picker-filters input[type="date"]::-webkit-calendar-picker-indicator {
      filter: invert(0.86) saturate(0.5);
      opacity: 0.9;
      cursor: pointer;
    }
    .random-picker-card {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-radius: 12px;
      padding: 10px;
      background: linear-gradient(135deg, rgba(122,162,247,0.22), rgba(77,226,182,0.12));
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 10px 30px rgba(4, 8, 18, 0.55);
      min-height: 0;
    }
    .random-picker-card.is-spinning {
      filter: saturate(1.08);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--chronos-accent, #7aa2f7) 45%, transparent), 0 12px 30px rgba(4, 8, 18, 0.58);
    }
    .random-picker-card.empty {
      align-items: center;
      justify-content: center;
      text-align: center;
      color: var(--chronos-text-muted);
      background: var(--chronos-surface);
      box-shadow: none;
    }
    .random-picker-name {
      font-size: 14px;
      font-weight: 700;
      color: var(--chronos-text);
      word-break: break-word;
    }
    .random-picker-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .random-picker-fit {
      flex: 0 0 auto;
      min-width: 92px;
      text-align: center;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.14);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.2px;
      background: rgba(0,0,0,0.24);
      color: #d9dfed;
    }
    .random-picker-fit.fit-green {
      color: #0b2516;
      background: rgba(120, 255, 175, 0.9);
      border-color: rgba(120, 255, 175, 0.95);
    }
    .random-picker-fit.fit-yellow {
      color: #2b2204;
      background: rgba(255, 224, 122, 0.92);
      border-color: rgba(255, 224, 122, 0.95);
    }
    .random-picker-fit.fit-orange {
      color: #2f1602;
      background: rgba(255, 176, 110, 0.94);
      border-color: rgba(255, 176, 110, 0.95);
    }
    .random-picker-fit.fit-red {
      color: #2c0608;
      background: rgba(255, 126, 138, 0.92);
      border-color: rgba(255, 126, 138, 0.95);
    }
    .random-picker-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 11px;
    }
    .random-picker-pill {
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(0,0,0,0.18);
      border: 1px solid rgba(255,255,255,0.08);
      color: var(--chronos-text);
      letter-spacing: 0.3px;
    }
    .random-picker-notes {
      font-size: 11px;
      color: var(--chronos-text-muted);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .random-picker-status {
      font-size: 12px;
      color: var(--chronos-text-muted);
      min-height: 16px;
    }
    .random-picker-status.error {
      color: var(--chronos-danger);
    }
    .random-picker-controls {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
    }
  `;
  document.head.appendChild(style);
}

function apiBase(){
  const origin = window.location?.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

async function fetchCurrentStatus() {
  const resp = await fetch(`${apiBase()}/api/status/current`);
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || payload.ok === false) {
    throw new Error(payload?.error || payload?.stderr || `Status unavailable (HTTP ${resp.status})`);
  }
  return normalizeCurrentStatus(payload.status || payload || {});
}

async function loadSettingsOptions(fileName) {
  try {
    const resp = await fetch(`${apiBase()}/api/settings?file=${encodeURIComponent(fileName)}`);
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || payload.ok === false) return [];
    const data = (payload && typeof payload.data === 'object' && payload.data) ? payload.data : {};
    const root = (data && typeof data === 'object')
      ? (Object.values(data).find((v) => v && typeof v === 'object' && !Array.isArray(v)) || data)
      : {};
    if (!root || typeof root !== 'object' || Array.isArray(root)) return [];
    return Object.keys(root).map((k) => String(k || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function loadStatusValueRankMaps() {
  const out = {};
  const indicatorWeights = {};
  try {
    const resp = await fetch(`${apiBase()}/api/settings?file=${encodeURIComponent('status_settings.yml')}`);
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || payload.ok === false) return { rankMaps: out, indicatorWeights };
    const rows = Array.isArray(payload?.data?.Status_Settings) ? payload.data.Status_Settings : [];
    const numericRanks = rows
      .map((row) => Number(row?.Rank))
      .filter((n) => Number.isFinite(n));
    const maxRank = numericRanks.length ? Math.max(...numericRanks) : rows.length;
    const keys = rows
      .map((row) => {
        const key = slugify(row?.Name || row?.name || '');
        const rank = Number(row?.Rank);
        if (key) {
          const weight = Number.isFinite(rank) ? Math.max(1, (maxRank - rank + 1)) : 1;
          indicatorWeights[key] = weight;
        }
        return key;
      })
      .filter(Boolean);
    await Promise.all(keys.map(async (key) => {
      try {
        const r = await fetch(`${apiBase()}/api/settings?file=${encodeURIComponent(`${key}_settings.yml`)}`);
        const p = await r.json().catch(() => ({}));
        if (!r.ok || p.ok === false) return;
        const data = (p && typeof p.data === 'object' && p.data) ? p.data : {};
        const root = (data && typeof data === 'object')
          ? (Object.values(data).find((v) => v && typeof v === 'object' && !Array.isArray(v)) || data)
          : {};
        if (!root || typeof root !== 'object' || Array.isArray(root)) return;
        const ranks = {};
        Object.entries(root).forEach(([label, meta]) => {
          const n = Number(meta && meta.value);
          if (!Number.isNaN(n)) ranks[normalizeOption(label)] = n;
        });
        if (Object.keys(ranks).length) out[key] = ranks;
      } catch { }
    }));
  } catch { }
  return { rankMaps: out, indicatorWeights };
}

function fillDataList(listEl, values) {
  if (!listEl) return;
  listEl.innerHTML = '';
  const seen = new Set();
  (values || []).forEach((raw) => {
    const value = String(raw || '').trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    const opt = document.createElement('option');
    opt.value = value;
    listEl.appendChild(opt);
  });
}

function fillSelectOptions(selectEl, values, anyLabel = 'Any') {
  if (!selectEl) return;
  const current = String(selectEl.value || '').trim();
  selectEl.innerHTML = '';
  const anyOpt = document.createElement('option');
  anyOpt.value = '';
  anyOpt.textContent = anyLabel;
  selectEl.appendChild(anyOpt);
  const seen = new Set();
  (values || []).forEach((raw) => {
    const value = String(raw || '').trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    selectEl.appendChild(opt);
  });
  if (current) {
    const hasCurrent = Array.from(selectEl.options).some((opt) => String(opt.value || '').toLowerCase() === current.toLowerCase());
    if (!hasCurrent) {
      const opt = document.createElement('option');
      opt.value = current;
      opt.textContent = current;
      selectEl.appendChild(opt);
    }
    selectEl.value = current;
  }
}

function createDefinition(){
  return {
    id: PANEL_ID,
    label: 'Random Picker',
    defaultVisible: false,
    defaultPosition: { x: 540, y: 64 },
    size: { width: 330, height: 360 },
    mount: (root) => mountRandomPicker(root),
  };
}

export function register(manager){
  injectStyles();
  manager.registerPanel(createDefinition());
}

const autoAttach = (manager) => {
  try {
    if (manager && typeof manager.registerPanel === 'function'){
      register(manager);
    }
  } catch (error) {
    console.error('[Chronos][Panels][RandomPicker] Failed to register panel', error);
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

function mountRandomPicker(root){
  injectStyles();
  root.classList.add('random-picker-shell');
  root.innerHTML = `
    <div class="random-picker-header">
      <div class="random-picker-title">
        <strong>Random Picker</strong>
        <span>Shuffle tasks when you feel stuck.</span>
      </div>
      <div class="random-picker-actions">
        <button type="button" class="random-picker-btn random-picker-btn--ghost random-picker-refresh">Refresh</button>
        <button type="button" class="random-picker-btn random-picker-btn--primary random-picker-reroll">Reroll</button>
        <button type="button" class="random-picker-btn random-picker-lock">Lock</button>
      </div>
    </div>
    <div class="random-picker-filters">
      <label>
        Item Type
        <select class="random-picker-type">
          <option value="">Any</option>
          ${ITEM_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}
        </select>
      </label>
      <label>
        Priority
        <select class="random-picker-priority">
          <option value="">Any</option>
        </select>
      </label>
      <label>
        Category
        <select class="random-picker-category">
          <option value="">Any</option>
        </select>
      </label>
      <label>
        Status
        <input class="random-picker-status-input" type="text" placeholder="pending / next / open" />
      </label>
      <label>
        Status Requirements
        <select class="random-picker-status-req-mode">
          <option value="match" selected>Match Current</option>
          <option value="mismatch">Mismatch Current</option>
          <option value="any">Any</option>
        </select>
      </label>
      <label>
        Due on/before
        <input class="random-picker-due" type="date" />
      </label>
      <label>
        Template
        <input class="random-picker-template" type="text" list="random-picker-template-list" placeholder="day / week / routine / name..." />
      </label>
      <label>
        Search
        <input class="random-picker-search" type="text" placeholder="keyword" />
      </label>
    </div>
    <div class="random-picker-card empty">
      <div class="random-picker-name">No pick yet</div>
      <div class="random-picker-notes">Adjust filters, refresh, then reroll to grab a random item.</div>
    </div>
    <div class="random-picker-controls">
      <button type="button" class="random-picker-btn random-picker-btn--ghost random-picker-clear">Clear Filters</button>
      <div class="random-picker-status"></div>
    </div>
    <datalist id="random-picker-template-list"></datalist>
  `;

  const typeSelect = root.querySelector('.random-picker-type');
  const priorityInput = root.querySelector('.random-picker-priority');
  const categoryInput = root.querySelector('.random-picker-category');
  const statusInput = root.querySelector('.random-picker-status-input');
  const statusReqModeSelect = root.querySelector('.random-picker-status-req-mode');
  const dueInput = root.querySelector('.random-picker-due');
  const templateInput = root.querySelector('.random-picker-template');
  const searchInput = root.querySelector('.random-picker-search');
  const templateList = root.querySelector('#random-picker-template-list');
  const refreshBtn = root.querySelector('.random-picker-refresh');
  const rerollBtn = root.querySelector('.random-picker-reroll');
  const lockBtn = root.querySelector('.random-picker-lock');
  const card = root.querySelector('.random-picker-card');
  const statusEl = root.querySelector('.random-picker-status');
  const clearBtn = root.querySelector('.random-picker-clear');

  const state = {
    type: '',
    priority: '',
    category: '',
    status: '',
    statusReqMode: 'match',
    due: '',
    template: '',
    q: '',
  };

  const runtime = {
    items: [],
    pick: null,
    locked: false,
    loading: false,
    spinning: false,
    spinHandle: null,
    spinToken: 0,
    error: '',
    currentStatus: {},
    statusReady: false,
    statusRankMaps: {},
    statusIndicatorWeights: {},
  };

  const keyFor = (item)=> `${(item.type || 'task').toLowerCase()}::${(item.name || '').toLowerCase()}`;

  const setStatus = (text, isError=false)=>{
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.classList.toggle('error', !!isError);
  };

  const renderLock = ()=>{
    lockBtn.textContent = runtime.locked ? 'Unlock' : 'Lock';
    lockBtn.classList.toggle('random-picker-btn--primary', runtime.locked);
  };

  const renderCard = ()=>{
    if (!card) return;
    if (!runtime.pick){
      card.classList.add('empty');
      card.innerHTML = `
        <div class="random-picker-name">No pick yet</div>
        <div class="random-picker-notes">Adjust filters, refresh, then reroll to grab a random item.</div>
      `;
      card.classList.remove('is-spinning');
      return;
    }
    card.classList.remove('empty');
    const p = runtime.pick;
    const pills = [];
    const push = (label, value)=>{
      if (!value && value !== 0) return;
      pills.push(`<span class="random-picker-pill">${label}: ${value}</span>`);
    };
    push('Type', (p.type || 'task').toUpperCase());
    push('Priority', p.priority);
    push('Category', p.category);
    push('Status', p.status);
    push('Template', p.template || p.template_name || p.template_type);
    push('Due', p.due_date || p.deadline || p.due || p.date);
    const showFit = state.statusReqMode === 'match';
    const statusFit = p?.__statusFit || evaluateStatusRequirementMatch(p, runtime.currentStatus, runtime.statusRankMaps, runtime.statusIndicatorWeights);
    const fitPct = Number(statusFit?.fitPercent ?? 100);
    const fitClass = fitPct >= 75 ? 'fit-green' : (fitPct >= 50 ? 'fit-yellow' : (fitPct >= 25 ? 'fit-orange' : 'fit-red'));
    if (showFit && statusFit.hasRequirements) {
      push('Req Fit', `${fitPct}%`);
    }
    const fitBadge = showFit
      ? `<div class="random-picker-fit ${fitClass}" title="Status requirements fit">${fitPct}% fit</div>`
      : '';
    card.innerHTML = `
      <div class="random-picker-head">
        <div class="random-picker-name">${p.name || '(untitled)'}</div>
        ${fitBadge}
      </div>
      <div class="random-picker-meta">${pills.join(' ')}</div>
      <div class="random-picker-notes">${p.description || p.summary || 'Roll again or lock in this pick.'}</div>
    `;
  };

  const setPick = (item)=>{
    runtime.pick = item || null;
    renderCard();
  };

  const stopSpin = ()=>{
    runtime.spinToken += 1;
    runtime.spinning = false;
    if (runtime.spinHandle) {
      try { window.clearInterval(runtime.spinHandle); } catch {}
      runtime.spinHandle = null;
    }
    card?.classList.remove('is-spinning');
  };

  const matchesDue = (item)=>{
    if (!state.due) return true;
    const raw = item.due_date || item.deadline || item.due || item.date;
    if (!raw) return false;
    const itemDate = new Date(raw);
    if (Number.isNaN(itemDate.getTime())) return false;
    const filterDate = new Date(state.due);
    return itemDate.getTime() <= filterDate.getTime();
  };

  const applyFilters = (items)=>{
    return items.filter(item => {
      if (state.type && String(item.type || '').toLowerCase() !== state.type.toLowerCase()) return false;
      if (state.priority && String(item.priority || '').toLowerCase() !== state.priority.toLowerCase()) return false;
      if (state.category && String(item.category || '').toLowerCase() !== state.category.toLowerCase()) return false;
      if (state.status && String(item.status || '').toLowerCase() !== state.status.toLowerCase()) return false;
      const statusFit = evaluateStatusRequirementMatch(item, runtime.currentStatus, runtime.statusRankMaps, runtime.statusIndicatorWeights);
      item.__statusFit = statusFit;
      if (state.statusReqMode === 'mismatch') {
        if (!statusFit.hasRequirements) return false;
        if (statusFit.comparableWeight <= 0) return false;
        if (statusFit.fitPercent >= 100) return false;
      }
      if (state.template) {
        const needle = state.template.toLowerCase();
        const templateHay = [
          item.template,
          item.template_name,
          item.template_type,
          item.template_id,
          item.template_membership,
        ].map((v) => String(v || '').toLowerCase()).join(' ');
        if (!templateHay.includes(needle)) return false;
      }
      if (state.q){
        const needle = state.q.toLowerCase();
        const hay = `${item.name || ''} ${item.description || ''} ${item.summary || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return matchesDue(item);
    });
  };

  const pickRandom = ()=>{
    const pool = runtime.items;
    if (!pool.length) {
      setPick(null);
      return null;
    }
    const currentKey = runtime.pick ? keyFor(runtime.pick) : null;
    const available = currentKey ? pool.filter(item => keyFor(item) !== currentKey) : pool;
    const source = available.length ? available : pool;
    const choice = source[Math.floor(Math.random() * source.length)];
    return choice;
  };

  const spinToPick = async (target)=>{
    if (!target || !runtime.items.length) {
      setPick(target || null);
      return;
    }
    stopSpin();
    const token = ++runtime.spinToken;
    runtime.spinning = true;
    card?.classList.add('is-spinning');
    const durationMs = 900;
    const stepMs = 70;
    const minSteps = 9;
    let elapsed = 0;
    let steps = 0;
    await new Promise((resolve) => {
      runtime.spinHandle = window.setInterval(() => {
        if (token !== runtime.spinToken) {
          try { window.clearInterval(runtime.spinHandle); } catch {}
          runtime.spinHandle = null;
          resolve();
          return;
        }
        const preview = runtime.items[Math.floor(Math.random() * runtime.items.length)];
        setPick(preview);
        elapsed += stepMs;
        steps += 1;
        if (elapsed >= durationMs && steps >= minSteps) {
          try { window.clearInterval(runtime.spinHandle); } catch {}
          runtime.spinHandle = null;
          setPick(target);
          runtime.spinning = false;
          card?.classList.remove('is-spinning');
          resolve();
        }
      }, stepMs);
    });
  };

  const loadItems = async ()=>{
    runtime.loading = true;
    runtime.error = '';
    setStatus('Loading...');
    rerollBtn.disabled = true;
    refreshBtn.disabled = true;
    try {
      const reqModeNeedsStatus = state.statusReqMode !== 'any';
      try {
        const [currentStatus, statusModel] = await Promise.all([
          fetchCurrentStatus(),
          loadStatusValueRankMaps(),
        ]);
        runtime.currentStatus = currentStatus;
        runtime.statusRankMaps = statusModel?.rankMaps || {};
        runtime.statusIndicatorWeights = statusModel?.indicatorWeights || {};
        runtime.statusReady = true;
      } catch (statusError) {
        runtime.currentStatus = {};
        runtime.statusRankMaps = {};
        runtime.statusIndicatorWeights = {};
        runtime.statusReady = false;
        if (reqModeNeedsStatus) {
          throw new Error(statusError?.message || 'Status unavailable; cannot verify requirement filters.');
        }
      }
      const propParts = [];
      if (state.priority) propParts.push(`priority:${encodeURIComponent(state.priority)}`);
      if (state.category) propParts.push(`category:${encodeURIComponent(state.category)}`);
      if (state.status) propParts.push(`status:${encodeURIComponent(state.status)}`);
      const typesToLoad = state.type ? [state.type] : ITEM_TYPES;
      const fetches = typesToLoad.map(async (type) => {
        const params = new URLSearchParams();
        params.set('type', type);
        if (state.q) params.set('q', state.q);
        if (propParts.length) params.set('props', propParts.join(','));
        const resp = await fetch(`${apiBase()}/api/items?${params.toString()}`);
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok || payload.ok === false) return [];
        const items = Array.isArray(payload.items) ? payload.items : [];
        return items.map((item) => ({
          ...item,
          type: item?.type || type,
        }));
      });
      const chunks = await Promise.all(fetches);
      const rawItems = chunks.flat();
      const dedup = new Map();
      rawItems.forEach((item) => {
        dedup.set(keyFor(item), item);
      });
      const filtered = applyFilters(Array.from(dedup.values()));
      let pool = filtered;
      if (state.statusReqMode === 'match') {
        const best = filtered.reduce((max, item) => Math.max(max, Number(item?.__statusFit?.fitPercent ?? 0)), -1);
        pool = filtered.filter((item) => Number(item?.__statusFit?.fitPercent ?? 0) === best);
      } else if (state.statusReqMode === 'mismatch') {
        const worst = filtered.reduce((min, item) => Math.min(min, Number(item?.__statusFit?.fitPercent ?? 100)), 101);
        pool = filtered.filter((item) => Number(item?.__statusFit?.fitPercent ?? 100) === worst);
      }
      runtime.items = pool;
      if (!runtime.items.length){
        runtime.pick = null;
        renderCard();
        setStatus('No items matched the filters/status requirements.');
        return;
      }
      if (runtime.locked && runtime.pick){
        const match = runtime.items.find(item => keyFor(item) === keyFor(runtime.pick));
        if (match){
          runtime.pick = match;
          renderCard();
          setStatus(`Locked on "${match.name}". ${runtime.items.length} candidate(s) available.`);
          return;
        }
      }
      const selected = pickRandom();
      setPick(selected);
      if (state.statusReqMode === 'match') {
        const fitPct = Number(selected?.__statusFit?.fitPercent ?? 100);
        setStatus(`Picked 1 of ${runtime.items.length} best-fit candidate(s). Status fit ${fitPct}%.`);
      } else if (state.statusReqMode === 'mismatch') {
        setStatus(`Picked 1 of ${runtime.items.length} mismatch candidate(s).`);
      } else {
        setStatus(`Picked 1 of ${runtime.items.length} candidate(s).`);
      }
    } catch (error) {
      console.error('[Chronos][Panels][RandomPicker] loadItems failed', error);
      runtime.error = error?.message || 'Failed to load items';
      runtime.items = [];
      runtime.pick = null;
      renderCard();
      setStatus(runtime.error, true);
    } finally {
      runtime.loading = false;
      rerollBtn.disabled = runtime.locked || runtime.spinning;
      refreshBtn.disabled = false;
      renderLock();
    }
  };

  const loadFilterSuggestionLists = async () => {
    const [priorityOptions, categoryOptions] = await Promise.all([
      loadSettingsOptions('priority_settings.yml'),
      loadSettingsOptions('category_settings.yml'),
    ]);
    fillSelectOptions(priorityInput, priorityOptions, 'Any');
    fillSelectOptions(categoryInput, categoryOptions, 'Any');
    fillDataList(templateList, TEMPLATE_TYPES);
  };

  const updateState = ()=>{
    state.type = (typeSelect.value || '').trim().toLowerCase();
    state.priority = (priorityInput.value || '').trim();
    state.category = (categoryInput.value || '').trim();
    state.status = (statusInput.value || '').trim();
    state.statusReqMode = (statusReqModeSelect.value || 'match').trim().toLowerCase();
    state.due = dueInput.value || '';
    state.template = (templateInput.value || '').trim();
    state.q = (searchInput.value || '').trim();
  };

  typeSelect.addEventListener('change', ()=>{ updateState(); });
  priorityInput.addEventListener('change', ()=>{ updateState(); });
  categoryInput.addEventListener('change', ()=>{ updateState(); });
  statusInput.addEventListener('input', ()=>{ updateState(); });
  statusReqModeSelect.addEventListener('change', ()=>{ updateState(); void loadItems(); });
  dueInput.addEventListener('change', ()=>{ updateState(); });
  dueInput.addEventListener('focus', () => {
    try { if (typeof dueInput.showPicker === 'function') dueInput.showPicker(); } catch { }
  });
  dueInput.addEventListener('click', () => {
    try { if (typeof dueInput.showPicker === 'function') dueInput.showPicker(); } catch { }
  });
  templateInput.addEventListener('input', ()=>{ updateState(); });
  searchInput.addEventListener('input', ()=>{ updateState(); });

  refreshBtn.addEventListener('click', ()=>{ updateState(); loadItems(); });
  rerollBtn.addEventListener('click', async ()=>{
    updateState();
    if (runtime.locked) return;
    if (runtime.loading) {
      setStatus('Still loading items...');
      return;
    }
    runtime.items = applyFilters(Array.isArray(runtime.items) ? runtime.items : []);
    if (state.statusReqMode === 'match') {
      const best = runtime.items.reduce((max, item) => Math.max(max, Number(item?.__statusFit?.fitPercent ?? 0)), -1);
      runtime.items = runtime.items.filter((item) => Number(item?.__statusFit?.fitPercent ?? 0) === best);
    } else if (state.statusReqMode === 'mismatch') {
      const worst = runtime.items.reduce((min, item) => Math.min(min, Number(item?.__statusFit?.fitPercent ?? 100)), 101);
      runtime.items = runtime.items.filter((item) => Number(item?.__statusFit?.fitPercent ?? 100) === worst);
    }
    if (!runtime.items.length){
      setStatus('No cached candidates for current filters. Reloading...');
      await loadItems();
      if (!runtime.items.length) return;
    }
    const selected = pickRandom();
    setStatus('Shuffling...');
    rerollBtn.disabled = true;
    refreshBtn.disabled = true;
    await spinToPick(selected);
    refreshBtn.disabled = false;
    rerollBtn.disabled = runtime.locked || runtime.loading || runtime.spinning;
    setStatus(`Rerolled from ${runtime.items.length} candidate(s).`);
  });
  lockBtn.addEventListener('click', ()=>{
    runtime.locked = !runtime.locked;
    renderLock();
    rerollBtn.disabled = runtime.locked || runtime.loading || runtime.spinning;
    setStatus(runtime.locked ? 'Locked current pick.' : 'Unlocked. You can reroll again.');
  });
  clearBtn.addEventListener('click', ()=>{
    typeSelect.value = '';
    priorityInput.value = '';
    categoryInput.value = '';
    statusInput.value = '';
    statusReqModeSelect.value = 'match';
    dueInput.value = '';
    templateInput.value = '';
    searchInput.value = '';
    updateState();
    loadItems();
  });

  renderCard();
  renderLock();
  setStatus('Loading items...');
  loadFilterSuggestionLists();
  loadItems();

  return {
    dispose(){
      stopSpin();
    }
  };
}
