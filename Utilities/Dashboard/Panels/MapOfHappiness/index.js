const STYLE_ID = 'cockpit-map-of-happiness-style';
const PANEL_ID = 'map-of-happiness';
const REFRESH_MS = 120000;

console.log('[Chronos][Panels][MapOfHappiness] Module loaded');

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .moh-panel-shell { display: flex; flex-direction: column; height: 100%; gap: 12px; color: var(--chronos-text); }
    .moh-panel-toolbar { display: flex; gap: 10px; align-items: center; justify-content: space-between; }
    .moh-panel-toolbar h3 { margin: 0; font-size: 16px; }
    .moh-panel-actions { display: flex; gap: 8px; align-items: center; }
    .moh-panel-btn { border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.05); color: var(--chronos-text); border-radius: 10px; padding: 6px 10px; font-size: 12px; cursor: pointer; }
    .moh-panel-btn:hover { border-color: rgba(122,162,247,0.35); }
    .moh-panel-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
    .moh-panel-card { border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    .moh-panel-title { font-size: 14px; font-weight: 700; margin: 0; display: flex; gap: 8px; align-items: center; }
    .moh-panel-badge { font-size: 11px; padding: 4px 8px; border-radius: 999px; background: rgba(122,162,247,0.18); color: var(--chronos-accent); border: 1px solid rgba(122,162,247,0.35); }
    .moh-panel-progress { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
    .moh-panel-progress span { display: block; height: 100%; background: linear-gradient(90deg, var(--chronos-accent), #7aa2f7); }
    .moh-panel-meta { font-size: 12px; color: var(--chronos-text-muted); display: flex; gap: 10px; flex-wrap: wrap; }
    .moh-panel-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .moh-panel-chip { padding: 5px 9px; border-radius: 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); font-size: 12px; }
    .moh-panel-status { min-height: 16px; font-size: 12px; color: var(--chronos-text-muted); }
    .moh-panel-status[data-tone="error"] { color: var(--chronos-danger); }
    .moh-panel-empty { padding: 16px; text-align: center; color: var(--chronos-text-muted); font-size: 13px; }
  `;
  document.head.appendChild(style);
}

function apiBase() {
  const o = window.location?.origin;
  if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
  return o;
}

function createDefinition() {
  return {
    id: PANEL_ID,
    label: 'Map of Happiness',
    menuKey: 'map_of_happiness',
    menuLabel: 'Map of Happiness',
    defaultVisible: false,
    defaultPosition: { x: 140, y: 140 },
    size: { width: 420, height: 480 },
    mount: (root) => mountPanel(root),
  };
}

function slugify(text) {
  return (text || '').toString().trim().toLowerCase();
}

async function fetchMap() {
  const resp = await fetch(`${apiBase()}/api/settings?file=map_of_happiness.yml`);
  if (!resp.ok) throw new Error('map_of_happiness.yml not found. Run the wizard first.');
  const data = await resp.json();
  const mapEntries = Array.isArray(data?.data?.map) ? data.data.map : [];
  const metadata = data?.data?.metadata || {};
  return { mapEntries, metadata };
}

async function fetchItems() {
  const resp = await fetch(`${apiBase()}/api/items`);
  if (!resp.ok) throw new Error(`Items load failed (HTTP ${resp.status})`);
  const data = await resp.json().catch(() => ({}));
  return Array.isArray(data?.items) ? data.items : [];
}

function hasHappiness(item, keySet) {
  const raw = item?.happiness;
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw.map(v => slugify(v)).filter(v => keySet.has(v));
  const s = slugify(raw);
  return keySet.has(s) ? [s] : [];
}

function computeCoverage(mapEntries, items) {
  const keySet = new Set(mapEntries.map(m => slugify(m.key)));
  const coverage = {};
  mapEntries.forEach(m => { coverage[slugify(m.key)] = { items: [], entry: m }; });

  items.forEach(item => {
    const tags = hasHappiness(item, keySet);
    tags.forEach(t => {
      if (!coverage[t]) coverage[t] = { items: [], entry: null };
      coverage[t].items.push(item);
    });
  });
  return coverage;
}

function renderPanel(root, state) {
  const { loading, error, mapEntries, metadata, coverage } = state;
  root.innerHTML = `
    <div class="moh-panel-shell">
      <div class="moh-panel-toolbar">
        <h3>Map of Happiness</h3>
        <div class="moh-panel-actions">
          <button class="moh-panel-btn" data-refresh>Refresh</button>
        </div>
      </div>
      <div class="moh-panel-status" data-status>${loading ? 'Loading...' : (error || '')}</div>
      ${!loading && error ? `<div class="moh-panel-empty">${error}</div>` : ''}
      ${!loading && !error ? renderContent(mapEntries, coverage, metadata) : ''}
    </div>
  `;
}

function renderContent(mapEntries, coverage, metadata) {
  if (!mapEntries.length) {
    return `<div class="moh-panel-empty">No needs defined yet. Run the Map of Happiness wizard.</div>`;
  }
  const avg = Math.round(mapEntries.reduce((acc, m) => acc + (Number(m.satisfaction || 0)), 0) / mapEntries.length);
  const totalTagged = Object.values(coverage || {}).reduce((acc, c) => acc + (c?.items?.length || 0), 0);
  const cards = mapEntries
    .slice()
    .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0))
    .map(entry => {
      const key = slugify(entry.key);
      const cov = coverage?.[key]?.items || [];
      const bar = Math.max(0, Math.min(100, Number(entry.satisfaction || 0)));
      const linkedList = Array.isArray(entry.linked_items) ? entry.linked_items : [];
      const essentials = Array.isArray(entry.essentials) ? entry.essentials : [];
      return `
        <div class="moh-panel-card">
          <div class="moh-panel-title">
            <span class="moh-panel-badge">#${entry.priority || '?'}</span>
            ${escapeHtml(entry.label || entry.key || 'Need')}
          </div>
          <div class="moh-panel-meta">
            <span>Key: <code>${escapeHtml(entry.key || '')}</code></span>
            <span>${bar}% satisfied</span>
            <span>${cov.length} tagged item${cov.length === 1 ? '' : 's'}</span>
          </div>
          <div class="moh-panel-progress"><span style="width:${bar}%"></span></div>
          ${essentials.length ? `<div class="moh-panel-list">${essentials.slice(0,4).map(e => `<span class="moh-panel-chip">${escapeHtml(e)}</span>`).join('')}${essentials.length>4?`<span class="moh-panel-chip">+${essentials.length-4}</span>`:''}</div>` : ''}
          ${linkedList.length ? `<div class="moh-panel-meta">Linked: ${linkedList.map(li => `${escapeHtml(li.type||'')}:${escapeHtml(li.name||'')}`).join(', ')}</div>` : ''}
        </div>
      `;
    }).join('');

  return `
    <div class="moh-panel-grid">
      <div class="moh-panel-card">
        <div class="moh-panel-title">Snapshot</div>
        <div class="moh-panel-meta">
          <span>${mapEntries.length} needs</span>
          <span>Avg satisfaction ${avg}%</span>
          <span>${totalTagged} tagged item${totalTagged === 1 ? '' : 's'}</span>
          ${metadata?.captured_at ? `<span>Last: ${escapeHtml(metadata.captured_at)}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="moh-panel-grid">${cards}</div>
  `;
}

function mountPanel(root) {
  injectStyles();
  const state = {
    loading: true,
    error: '',
    mapEntries: [],
    coverage: {},
    metadata: {},
    timer: null,
    offBus: null,
  };

  async function refresh(manual = false) {
    state.loading = true;
    state.error = '';
    renderPanel(root, state);
    try {
      const [map, items] = await Promise.all([fetchMap(), fetchItems()]);
      state.mapEntries = map.mapEntries;
      state.metadata = map.metadata;
      state.coverage = computeCoverage(map.mapEntries, items);
      state.error = '';
    } catch (err) {
      state.error = err?.message || 'Failed to load map.';
      state.mapEntries = [];
      state.coverage = {};
    } finally {
      state.loading = false;
      renderPanel(root, state);
    }
  }

  root.addEventListener('click', (ev) => {
    if (ev.target?.matches?.('[data-refresh]')) {
      refresh(true);
    }
  });

  try {
    if (window.ChronosBus?.on) {
      const handler = () => refresh(true);
      window.ChronosBus.on('wizard:map_of_happiness:created', handler);
      state.offBus = () => window.ChronosBus?.off?.('wizard:map_of_happiness:created', handler);
    }
  } catch {}

  state.timer = window.setInterval(() => refresh(false), REFRESH_MS);
  refresh(false);

  return {
    dispose() {
      try { if (state.timer) window.clearInterval(state.timer); } catch {}
      try { state.offBus?.(); } catch {}
    },
  };
}

export function register(manager) {
  injectStyles();
  manager.registerPanel(createDefinition());
}

const autoAttach = (manager) => {
  try {
    if (manager && typeof manager.registerPanel === 'function') {
      register(manager);
    }
  } catch (err) {
    console.error('[Chronos][Panels][MapOfHappiness] autoAttach failed', err);
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

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return ch;
    }
  });
}
