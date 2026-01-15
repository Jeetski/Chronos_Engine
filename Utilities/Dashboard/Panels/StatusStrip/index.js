const STYLE_ID = 'cockpit-status-strip-style';
const PANEL_ID = 'status_strip';
const DEFAULT_STATUS_TYPES = ['Place', 'Energy', 'Focus', 'Emotion', 'Mind State', 'Vibe', 'Health'];
const STATUS_COLORS = {
  place: '#f2b84b',
  energy: '#5dcf9b',
  focus: '#7aa2f7',
  emotion: '#ff9aae',
  mind_state: '#b490ff',
  vibe: '#ffa94d',
  health: '#5ad2ff',
};
const PRIORITY_RAMP = ['#23d160', '#ffd866', '#ff8c42', '#ff5f5f'];

function injectStyles(){
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .status-strip-shell {
      display: flex;
      flex-direction: column;
      gap: 6px;
      height: 100%;
      color: #f4f5fb;
      font-size: 13px;
    }
    .status-strip-row {
      display: flex;
      align-items: center;
      gap: 16px;
      min-height: 50px;
    }
    .status-strip-items {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      flex: 1 1 auto;
      overflow: hidden;
    }
    .status-chip {
      flex: 0 0 auto;
      min-width: 118px;
      padding: 4px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(15,18,30,0.85);
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 4px;
      position: relative;
    }
    .status-chip::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: linear-gradient(120deg, var(--accent, #23d160), rgba(10,12,20,0));
      opacity: 0.28;
      pointer-events: none;
    }
    .status-chip::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
      pointer-events: none;
    }
    .status-chip .meta {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: rgba(255,255,255,0.65);
    }
    .status-chip .value {
      font-size: 15px;
      font-weight: 600;
      color: #f6fbff;
    }
    .status-strip-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: stretch;
    }
    .status-strip-btn {
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 999px;
      padding: 5px 16px;
      background: rgba(23,32,48,0.92);
      color: #dbe6ff;
      cursor: pointer;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .status-strip-btn:hover {
      border-color: rgba(255,255,255,0.45);
      color: #ffffff;
    }
    .status-strip-status {
      font-size: 12px;
      color: #8fa0c1;
      min-height: 16px;
    }
    .status-strip-status[data-tone="error"] { color: #ff99a4; }
    .status-strip-status[data-tone="warn"] { color: #ffd77a; }
    .status-strip-status[data-tone="success"] { color: #89f7c1; }
    .status-strip-empty {
      color: rgba(255,255,255,0.55);
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
}

function apiBase(){
  const origin = window.location?.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

function slugify(name){
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function statusTypes(liveStatus){
  const bundle = window.CHRONOS_SETTINGS?.status || {};
  const ordered = Array.isArray(bundle.types) && bundle.types.length
    ? bundle.types.slice()
    : DEFAULT_STATUS_TYPES.slice();
  const inferred = Object.keys(liveStatus || {}).map(key => key);
  const seen = new Set();
  const list = [];

  function push(label){
    if (!label) return;
    const id = slugify(label);
    if (!id || seen.has(id)) return;
    seen.add(id);
    list.push({ label, key: id });
  }

  ordered.forEach(entry => push(typeof entry === 'string' ? entry : entry?.Name || entry?.name));
  inferred.forEach(key => {
    if (!key) return;
    const label = key.includes('_')
      ? key.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
      : key.charAt(0).toUpperCase() + key.slice(1);
    push(label);
  });

  // Guarantee place appears first if configured later
  list.sort((a, b) => {
    if (a.key === 'place') return -1;
    if (b.key === 'place') return 1;
    return 0;
  });
  return list;
}

function colorForIndex(idx, total){
  if (total <= 1) return PRIORITY_RAMP[0];
  const ratio = total <= 1 ? 0 : idx / (total - 1);
  if (ratio <= 0.25) return PRIORITY_RAMP[0];
  if (ratio <= 0.5) return PRIORITY_RAMP[1];
  if (ratio <= 0.75) return PRIORITY_RAMP[2];
  return PRIORITY_RAMP[3];
}

function createDefinition(){
  return {
    id: PANEL_ID,
    label: 'Status Strip',
    menuKey: 'status-strip',
    menuLabel: 'Status Strip',
    menuPrimary: true,
    defaultVisible: true,
    defaultPosition: { x: 60, y: 40 },
    size: { width: 900, height: 90 },
    mount: (root, context) => mountStatusStrip(root, context),
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
  } catch (err) {
    console.error('[Chronos][Panels][StatusStrip] register failed', err);
  }
};

if (typeof window !== 'undefined'){
  const defs = window.__cockpitPanelDefinitions || [];
  defs.push(autoAttach);
  window.__cockpitPanelDefinitions = defs;
  if (typeof window.__cockpitPanelRegister === 'function'){
    try { window.__cockpitPanelRegister(autoAttach); } catch {}
  }
}

function mountStatusStrip(root, context){
  injectStyles();
  root.classList.add('status-strip-shell');
  root.innerHTML = `
    <div class="status-strip-row">
      <div class="status-strip-items" data-grid></div>
      <div class="status-strip-actions">
        <button type="button" class="status-strip-btn" data-action="refresh">Refresh</button>
        <button type="button" class="status-strip-btn" data-action="open-status">Update Status</button>
      </div>
    </div>
    <div class="status-strip-status" data-status></div>
  `;

  const refreshBtn = root.querySelector('button[data-action="refresh"]');
  const updateBtn = root.querySelector('button[data-action="open-status"]');
  const gridEl = root.querySelector('[data-grid]');
  const statusEl = root.querySelector('[data-status]');
  const optionsMap = window.CHRONOS_SETTINGS?.status?.options || {};

  const state = {
    status: normalizeStatus(window.CHRONOS_SETTINGS?.status?.current || {}),
    typeDefs: [],
    lastUpdated: null,
    timer: null,
  };

  function normalizeStatus(map){
    const out = {};
    Object.entries(map || {}).forEach(([key, value]) => {
      const slug = slugify(key);
      if (slug) out[slug] = value;
    });
    return out;
  }

  function setStatus(message = '', tone = 'info'){
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  }

  function formatClock(ts){
    if (!ts) return '';
    const d = ts instanceof Date ? ts : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function renderGrid(){
    if (!gridEl) return;
    if (!state.typeDefs.length){
      gridEl.innerHTML = '<div class="status-strip-empty">No status indicators configured.</div>';
      return;
    }
    function optionsForLabel(label){
      if (!label) return [];
      if (Array.isArray(optionsMap[label])) return optionsMap[label];
      const target = slugify(label);
      for (const key of Object.keys(optionsMap)){
        if (slugify(key) === target){
          const list = optionsMap[key];
          return Array.isArray(list) ? list : [];
        }
      }
      return [];
    }
    function displayValue(def, raw){
      if (!raw) return '-';
      const options = optionsForLabel(def.label);
      if (!options.length) return raw;
      const rawNorm = slugify(raw);
      const direct = options.find(opt => String(opt) === String(raw));
      if (direct) return direct;
      const match = options.find(opt => slugify(opt) === rawNorm);
      return match || raw;
    }
    gridEl.innerHTML = state.typeDefs.map((def, idx) => {
      const value = displayValue(def, state.status[def.key]);
      const accent = STATUS_COLORS[def.key] || colorForIndex(idx, state.typeDefs.length);
      return `
        <div class="status-chip" style="--accent:${accent}">
          <span class="meta">${def.label}</span>
          <span class="value">${value}</span>
        </div>
      `;
    }).join('');
  }

  async function fetchStatus(){
    const resp = await fetch(`${apiBase()}/api/status/current`);
    const data = await resp.json().catch(()=> ({}));
    if (!resp.ok || data.ok === false){
      throw new Error((data && (data.error || data.stderr)) || `Status unavailable (HTTP ${resp.status})`);
    }
    return normalizeStatus(data.status || data || {});
  }

  async function refresh(manual = false){
    setStatus(manual ? 'Refreshing…' : 'Syncing…', 'info');
    try {
      const statusData = await fetchStatus();
      if (statusData) state.status = { ...state.status, ...statusData };
      state.typeDefs = statusTypes(state.status);
      renderGrid();
      state.lastUpdated = new Date();
      const stamp = formatClock(state.lastUpdated);
      setStatus(stamp ? `Synced · ${stamp}` : 'Synced.', 'success');
    } catch (err) {
      console.error('[Chronos][Panels][StatusStrip] refresh failed', err);
      setStatus(err?.message || 'Refresh failed.', 'error');
    }
  }

  function boot(){
    state.typeDefs = statusTypes(state.status);
    renderGrid();
    setStatus('Ready.', 'info');
    refresh(false);
    state.timer = window.setInterval(()=> refresh(false), 60000);
  }

  refreshBtn?.addEventListener('click', ()=> refresh(true));
  updateBtn?.addEventListener('click', ()=> {
    try { context?.bus?.emit?.('widget:show', 'Status'); } catch {}
    try { window.ChronosBus?.emit?.('widget:show', 'Status'); } catch {}
  });
  boot();

  return {
    dispose(){
      try { if (state.timer) window.clearInterval(state.timer); } catch {}
    }
  };
}
