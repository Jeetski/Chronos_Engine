const STYLE_ID = 'cockpit-status-strip-style';
const PANEL_ID = 'status_strip';
const DEFAULT_STATUS_TYPES = ['Place', 'Energy', 'Focus', 'Emotion', 'Mind State', 'Vibe', 'Health'];

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .status-strip-shell {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 100%;
      min-height: 0;
      color: var(--chronos-text, var(--text, #e6e8ef));
      font-size: 12px;
      user-select: none;
    }
    .status-strip-radar-wrap {
      width: min(96%, 290px);
      aspect-ratio: 1 / 1;
      display: grid;
      place-items: center;
      position: relative;
    }
    .status-strip-radar {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .status-strip-radar-ring {
      fill: none;
      stroke: color-mix(in srgb, var(--chronos-border, var(--border, #222835)) 75%, transparent);
      stroke-width: 0.42;
    }
    .status-strip-radar-spoke {
      stroke: color-mix(in srgb, var(--chronos-border, var(--border, #222835)) 55%, transparent);
      stroke-width: 0.36;
    }
    .status-strip-radar-area {
      fill: color-mix(in srgb, var(--chronos-accent, var(--accent, #7aa2f7)) 24%, transparent);
      stroke: none;
    }
    .status-strip-radar-outline {
      fill: none;
      stroke: var(--chronos-accent-strong, var(--chronos-accent, var(--accent, #7aa2f7)));
      stroke-width: 0.9;
      stroke-linejoin: round;
    }
    .status-strip-radar-dot {
      fill: var(--chronos-accent-strong, var(--chronos-accent, var(--accent, #7aa2f7)));
      stroke: color-mix(in srgb, var(--chronos-bg, var(--bg, #0f1115)) 80%, transparent);
      stroke-width: 0.36;
    }
    .status-strip-radar-label {
      fill: var(--chronos-text-muted, var(--text-dim, #a6adbb));
      font-size: 3.15px;
      letter-spacing: 0.2px;
      dominant-baseline: middle;
      paint-order: stroke;
      stroke: color-mix(in srgb, var(--chronos-bg, var(--bg, #0f1115)) 75%, transparent);
      stroke-width: 0.7px;
      pointer-events: none;
    }
    .status-strip-status {
      min-height: 16px;
      color: var(--chronos-text-muted, var(--text-dim, #a6adbb));
    }
    .status-strip-status[data-tone="error"] { color: var(--chronos-danger, #ff99a4); }
    .status-strip-status[data-tone="warn"] { color: var(--chronos-warning, #ffd77a); }
    .status-strip-status[data-tone="success"] { color: var(--chronos-success, #89f7c1); }
    .status-strip-empty {
      color: var(--chronos-text-muted, var(--text-dim, #a6adbb));
      font-style: italic;
      text-align: center;
      padding: 10px 14px;
    }
  `;
  document.head.appendChild(style);
}

function apiBase() {
  const origin = window.location?.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

function slugify(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function statusTypes(liveStatus) {
  const bundle = window.CHRONOS_SETTINGS?.status || {};
  const ordered = Array.isArray(bundle.types) && bundle.types.length
    ? bundle.types.slice()
    : DEFAULT_STATUS_TYPES.slice();
  const inferred = Object.keys(liveStatus || {}).map((key) => key);
  const seen = new Set();
  const list = [];

  function push(label) {
    if (!label) return;
    const id = slugify(label);
    if (!id || seen.has(id)) return;
    seen.add(id);
    list.push({ label, key: id });
  }

  ordered.forEach((entry) => push(typeof entry === 'string' ? entry : entry?.Name || entry?.name));
  inferred.forEach((key) => {
    if (!key) return;
    const label = key.includes('_')
      ? key.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
      : key.charAt(0).toUpperCase() + key.slice(1);
    push(label);
  });

  list.sort((a, b) => {
    if (a.key === 'place') return -1;
    if (b.key === 'place') return 1;
    return 0;
  });
  return list;
}

function toPolarPoint(cx, cy, radius, angle) {
  return { x: cx + (radius * Math.cos(angle)), y: cy + (radius * Math.sin(angle)) };
}

function createDefinition() {
  return {
    id: PANEL_ID,
    label: 'Status Chart',
    menuKey: 'status-strip',
    menuLabel: 'Status Chart',
    menuPrimary: true,
    defaultVisible: true,
    defaultPosition: { x: 60, y: 40 },
    size: { width: 360, height: 330 },
    mount: (root, context) => mountStatusStrip(root, context),
  };
}

export function register(manager) {
  injectStyles();
  manager.registerPanel(createDefinition());
}

const autoAttach = (manager) => {
  try {
    if (manager && typeof manager.registerPanel === 'function') register(manager);
  } catch (err) {
    console.error('[Chronos][Panels][StatusStrip] register failed', err);
  }
};

if (typeof window !== 'undefined') {
  const defs = window.__cockpitPanelDefinitions || [];
  defs.push(autoAttach);
  window.__cockpitPanelDefinitions = defs;
  if (typeof window.__cockpitPanelRegister === 'function') {
    try { window.__cockpitPanelRegister(autoAttach); } catch { }
  }
}

function mountStatusStrip(root, context) {
  injectStyles();
  root.classList.add('status-strip-shell');
  root.innerHTML = `
    <div class="status-strip-radar-wrap" data-radar-wrap>
      <svg class="status-strip-radar" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <g data-grid></g>
        <g data-labels></g>
        <polygon class="status-strip-radar-area" data-area></polygon>
        <polygon class="status-strip-radar-outline" data-outline></polygon>
        <g data-points></g>
      </svg>
      <div class="status-strip-empty" data-empty style="display:none;">No status indicators configured.</div>
    </div>
    <div class="status-strip-status" data-status></div>
  `;

  const gridEl = root.querySelector('[data-grid]');
  const labelsEl = root.querySelector('[data-labels]');
  const pointsEl = root.querySelector('[data-points]');
  const areaEl = root.querySelector('[data-area]');
  const outlineEl = root.querySelector('[data-outline]');
  const emptyEl = root.querySelector('[data-empty]');
  const statusEl = root.querySelector('[data-status]');
  const optionsMap = window.CHRONOS_SETTINGS?.status?.options || {};

  const state = {
    status: normalizeStatus(window.CHRONOS_SETTINGS?.status?.current || {}),
    typeDefs: [],
    optionRankMap: {},
    timer: null,
  };

  function normalizeStatus(map) {
    const out = {};
    Object.entries(map || {}).forEach(([key, value]) => {
      const slug = slugify(key);
      if (slug) out[slug] = value;
    });
    return out;
  }

  function setStatus(message = '', tone = 'info') {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  }

  function formatClock(ts) {
    if (!ts) return '';
    const d = ts instanceof Date ? ts : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function optionsForLabel(label) {
    if (!label) return [];
    if (Array.isArray(optionsMap[label])) return optionsMap[label];
    const target = slugify(label);
    for (const key of Object.keys(optionsMap)) {
      if (slugify(key) === target) {
        const list = optionsMap[key];
        return Array.isArray(list) ? list : [];
      }
    }
    return [];
  }

  function sortOptionsLowToHigh(typeSlug, options) {
    const src = Array.isArray(options) ? options.slice() : [];
    const ranks = state.optionRankMap[typeSlug];
    if (!ranks) return src;
    return src.sort((a, b) => {
      const av = Number(ranks[a]);
      const bv = Number(ranks[b]);
      const aHas = Number.isFinite(av);
      const bHas = Number.isFinite(bv);
      if (!aHas && !bHas) return 0;
      if (!aHas) return 1;
      if (!bHas) return -1;
      return bv - av;
    });
  }

  async function loadValueRanks(typeSlug) {
    try {
      const resp = await fetch(`${apiBase()}/api/settings?file=${encodeURIComponent(`${typeSlug}_settings.yml`)}`);
      const json = await resp.json().catch(() => ({}));
      const data = (json && json.data && typeof json.data === 'object') ? json.data : {};
      const rootNode = Object.values(data)[0];
      if (!rootNode || typeof rootNode !== 'object') return null;
      const ranks = {};
      Object.entries(rootNode).forEach(([label, meta]) => {
        const n = Number(meta && meta.value);
        if (!Number.isNaN(n)) ranks[String(label)] = n;
      });
      return Object.keys(ranks).length ? ranks : null;
    } catch {
      return null;
    }
  }

  function valueIndexFor(def) {
    const raw = state.status[def.key];
    if (!raw) return { normalized: 0, label: '-' };
    const rawOptions = optionsForLabel(def.label);
    if (!rawOptions.length) return { normalized: 0, label: String(raw) };
    const options = sortOptionsLowToHigh(def.key, rawOptions);
    let idx = options.findIndex((opt) => String(opt) === String(raw));
    if (idx === -1) idx = options.findIndex((opt) => slugify(opt) === slugify(raw));
    if (idx < 0) return { normalized: 0, label: String(raw) };
    const denom = Math.max(1, options.length - 1);
    return { normalized: idx / denom, label: String(options[idx]) };
  }

  function renderRadarGrid(nodes, center, maxRadius) {
    if (!gridEl || !labelsEl) return;
    gridEl.innerHTML = '';
    labelsEl.innerHTML = '';
    const ringLevels = 4;
    for (let level = 1; level <= ringLevels; level += 1) {
      const r = (maxRadius * level) / ringLevels;
      const pts = nodes.map((n) => {
        const p = toPolarPoint(center.x, center.y, r, n.angle);
        return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      }).join(' ');
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      ring.setAttribute('class', 'status-strip-radar-ring');
      ring.setAttribute('points', pts);
      gridEl.appendChild(ring);
    }
    nodes.forEach((n) => {
      const spoke = toPolarPoint(center.x, center.y, maxRadius, n.angle);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'status-strip-radar-spoke');
      line.setAttribute('x1', String(center.x));
      line.setAttribute('y1', String(center.y));
      line.setAttribute('x2', spoke.x.toFixed(2));
      line.setAttribute('y2', spoke.y.toFixed(2));
      gridEl.appendChild(line);

      const labelRadius = maxRadius + 6;
      const lp = toPolarPoint(center.x, center.y, labelRadius, n.angle);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('class', 'status-strip-radar-label');
      text.setAttribute('x', lp.x.toFixed(2));
      text.setAttribute('y', lp.y.toFixed(2));
      const cosA = Math.cos(n.angle);
      if (cosA > 0.28) text.setAttribute('text-anchor', 'start');
      else if (cosA < -0.28) text.setAttribute('text-anchor', 'end');
      else text.setAttribute('text-anchor', 'middle');
      text.textContent = n.label;
      labelsEl.appendChild(text);
    });
  }

  function renderRadar() {
    const typeDefs = state.typeDefs || [];
    if (!typeDefs.length) {
      if (emptyEl) emptyEl.style.display = '';
      if (areaEl) areaEl.setAttribute('points', '');
      if (outlineEl) outlineEl.setAttribute('points', '');
      if (pointsEl) pointsEl.innerHTML = '';
      if (gridEl) gridEl.innerHTML = '';
      if (labelsEl) labelsEl.innerHTML = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const count = Math.max(1, typeDefs.length);
    const step = (Math.PI * 2) / count;
    const startAngle = -Math.PI / 2;
    const center = { x: 50, y: 50 };
    const maxRadius = 34;
    const nodes = typeDefs.map((def, idx) => ({
      key: def.key,
      label: def.label,
      angle: startAngle + (idx * step),
    }));
    renderRadarGrid(nodes, center, maxRadius);

    const polar = nodes.map((n) => {
      const v = valueIndexFor({ key: n.key, label: n.label });
      const radius = maxRadius * Math.max(0, Math.min(1, v.normalized));
      const p = toPolarPoint(center.x, center.y, radius, n.angle);
      return { x: p.x, y: p.y, key: n.key, label: n.label, valueLabel: v.label };
    });
    const poly = polar.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    if (areaEl) areaEl.setAttribute('points', poly);
    if (outlineEl) outlineEl.setAttribute('points', poly);
    if (pointsEl) {
      pointsEl.innerHTML = '';
      polar.forEach((p) => {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('class', 'status-strip-radar-dot');
        dot.setAttribute('cx', p.x.toFixed(2));
        dot.setAttribute('cy', p.y.toFixed(2));
        dot.setAttribute('r', '1.25');
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${p.label}: ${p.valueLabel}`;
        dot.appendChild(title);
        pointsEl.appendChild(dot);
      });
    }
  }

  async function fetchStatus() {
    const resp = await fetch(`${apiBase()}/api/status/current`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false) {
      throw new Error((data && (data.error || data.stderr)) || `Status unavailable (HTTP ${resp.status})`);
    }
    return normalizeStatus(data.status || data || {});
  }

  async function syncRanks(defs) {
    await Promise.all((defs || []).map(async (def) => {
      if (state.optionRankMap[def.key]) return;
      const ranks = await loadValueRanks(def.key);
      if (ranks) state.optionRankMap[def.key] = ranks;
    }));
  }

  async function refresh(manual = false) {
    setStatus(manual ? 'Refreshing...' : 'Syncing...', 'info');
    try {
      const statusData = await fetchStatus();
      if (statusData) state.status = { ...state.status, ...statusData };
      state.typeDefs = statusTypes(state.status);
      await syncRanks(state.typeDefs);
      renderRadar();
      const stamp = formatClock(new Date());
      setStatus(stamp ? `Synced ${stamp}` : 'Synced.', 'success');
    } catch (err) {
      console.error('[Chronos][Panels][StatusStrip] refresh failed', err);
      setStatus(err?.message || 'Refresh failed.', 'error');
    }
  }

  function boot() {
    state.typeDefs = statusTypes(state.status);
    renderRadar();
    setStatus('Ready.', 'info');
    refresh(false);
    state.timer = window.setInterval(() => refresh(false), 60000);
  }

  boot();

  return {
    dispose() {
      try { if (state.timer) window.clearInterval(state.timer); } catch { }
    },
  };
}
