const SHARED_STYLE_ID = 'chronos-progress-gauge-shared-style';

function ensureSharedStyles() {
  if (document.getElementById(SHARED_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SHARED_STYLE_ID;
  style.textContent = `
    .chronos-progress-gauge {
      --pg-accent: var(--chronos-accent, #7aa2f7);
      --pg-size: 150px;
      --pg-stroke: 10;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      color: var(--chronos-text, #e6e8ef);
      min-width: 0;
    }
    .chronos-progress-gauge[data-tone="warn"] { --pg-accent: #f3a64c; }
    .chronos-progress-gauge[data-tone="danger"] { --pg-accent: #ff7c8d; }
    .chronos-progress-gauge[data-tone="success"] { --pg-accent: #4de2b6; }
    .chronos-progress-gauge-ring-wrap {
      position: relative;
      width: var(--pg-size);
      height: var(--pg-size);
      flex: 0 0 auto;
    }
    .chronos-progress-gauge-ring {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
      display: block;
    }
    .chronos-progress-gauge-ring-bg {
      fill: none;
      stroke: rgba(255,255,255,0.1);
      stroke-width: var(--pg-stroke);
    }
    .chronos-progress-gauge-ring-progress {
      fill: none;
      stroke: var(--pg-accent);
      stroke-width: var(--pg-stroke);
      stroke-linecap: round;
      filter: drop-shadow(0 0 10px color-mix(in srgb, var(--pg-accent) 46%, transparent));
      transition: stroke-dashoffset 280ms ease, stroke 180ms ease;
    }
    .chronos-progress-gauge-center {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 16px;
      pointer-events: none;
    }
    .chronos-progress-gauge-value {
      font-size: clamp(18px, 2vw, 30px);
      font-weight: 800;
      line-height: 1.05;
      letter-spacing: 0.02em;
      text-shadow: 0 3px 10px rgba(0,0,0,0.36);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chronos-progress-gauge-percent {
      margin-top: 4px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--chronos-text-muted, #9aa4b7);
    }
    .chronos-progress-gauge-meta {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;
      text-align: center;
      min-width: 0;
    }
    .chronos-progress-gauge-label {
      font-size: 14px;
      font-weight: 700;
      color: var(--chronos-text, #e6e8ef);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chronos-progress-gauge-subtitle {
      font-size: 12px;
      color: var(--chronos-text-muted, #9aa4b7);
      min-height: 16px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chronos-progress-gauge-badges {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .chronos-progress-gauge-badge {
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.04);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--chronos-text-muted, #9aa4b7);
    }
  `;
  document.head.appendChild(style);
}

export function fallbackApiBase() {
  const origin = window.location?.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

export function todayKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function clamp(value, min = 0, max = 100) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

export function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function readStoredJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStoredJSON(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { }
}

export function defaultGaugeConfig(type = 'countdown') {
  const today = todayKey();
  const target = new Date();
  target.setDate(target.getDate() + 30);
  return {
    id: `gauge_${Math.random().toString(36).slice(2, 8)}`,
    label: 'New Gauge',
    type,
    accent: '',
    countdown_mode: 'remaining',
    start_date: today,
    target_date: todayKey(target),
    current_value: 0,
    target_value: 100,
    item_type: 'goal',
    item_name: '',
    property: 'progress',
    target_property: '',
  };
}

export function normalizeGaugeConfig(config = {}) {
  const base = defaultGaugeConfig(config.type || 'countdown');
  return {
    ...base,
    ...config,
    id: String(config.id || base.id),
    label: String(config.label || base.label),
    type: String(config.type || base.type).trim().toLowerCase(),
    accent: String(config.accent || '').trim(),
    countdown_mode: String(config.countdown_mode || base.countdown_mode).trim().toLowerCase(),
    start_date: String(config.start_date || base.start_date).trim(),
    target_date: String(config.target_date || base.target_date).trim(),
    current_value: safeNumber(config.current_value, base.current_value),
    target_value: Math.max(1, safeNumber(config.target_value, base.target_value)),
    item_type: String(config.item_type || base.item_type).trim().toLowerCase(),
    item_name: String(config.item_name || '').trim(),
    property: String(config.property || base.property).trim(),
    target_property: String(config.target_property || '').trim(),
  };
}

export function formatNumber(value) {
  const num = safeNumber(value, 0);
  const rounded = Math.abs(num) >= 100 ? Math.round(num) : Math.round(num * 10) / 10;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: Number.isInteger(rounded) ? 0 : 1 }).format(rounded);
}

export function formatDays(value) {
  const num = Math.round(safeNumber(value, 0));
  if (num === 0) return 'today';
  if (num === 1) return '1 day';
  if (num === -1) return '1 day late';
  if (num > 0) return `${num} days`;
  return `${Math.abs(num)} days late`;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffDays(a, b) {
  const left = startOfDay(a).getTime();
  const right = startOfDay(b).getTime();
  return Math.round((left - right) / 86400000);
}

export function resolvePropertyPath(source, path) {
  const steps = String(path || '').split('.').map((part) => part.trim()).filter(Boolean);
  let current = source;
  for (const step of steps) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, step)) return undefined;
    current = current[step];
  }
  return current;
}

function parseLooseYamlObject(text) {
  try {
    if (typeof window !== 'undefined' && typeof window.parseYaml === 'function') {
      return window.parseYaml(text);
    }
  } catch { }
  const out = {};
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const stack = [{ indent: -1, value: out }];
  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(/^(\s*)([^:]+):\s*(.*)$/);
    if (!match) continue;
    const indent = match[1].length;
    const key = String(match[2] || '').trim();
    let value = String(match[3] || '').trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;
    if (!value) {
      parent[key] = {};
      stack.push({ indent, value: parent[key] });
      continue;
    }
    if (/^-?\d+(\.\d+)?$/.test(value)) value = Number(value);
    else if (/^(true|false)$/i.test(value)) value = /^true$/i.test(value);
    else value = value.replace(/^['"]|['"]$/g, '');
    parent[key] = value;
  }
  return out;
}

async function fetchJson(url, options) {
  const resp = await fetch(url, options);
  const text = await resp.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.error || data?.stderr || text || `Request failed (${resp.status})`);
  }
  return data;
}

async function fetchItemSnapshot(config, apiBase) {
  if (!config.item_type || !config.item_name) throw new Error('Item type and name are required');
  const url = `${apiBase}/api/item?type=${encodeURIComponent(config.item_type)}&name=${encodeURIComponent(config.item_name)}`;
  const payload = await fetchJson(url);
  if (payload && typeof payload.item === 'object' && payload.item) return payload.item;
  if (payload && typeof payload.content === 'object' && payload.content) return payload.content;
  if (payload && typeof payload.text === 'string' && payload.text.trim()) return parseLooseYamlObject(payload.text);
  if (payload && typeof payload.content === 'string' && payload.content.trim()) return parseLooseYamlObject(payload.content);
  return payload || {};
}

async function resolveCountdownGauge(config) {
  const start = parseDate(config.start_date);
  const target = parseDate(config.target_date);
  if (!target) throw new Error('Target date is required');
  const today = new Date();
  const origin = start || today;
  const total = Math.max(1, diffDays(target, origin));
  const elapsed = diffDays(today, origin);
  const remaining = diffDays(target, today);
  const pct = clamp((elapsed / total) * 100, 0, 100);
  let tone = 'info';
  if (remaining < 0) tone = 'danger';
  else if (remaining <= 3) tone = 'warn';
  const isRemaining = (config.countdown_mode || 'remaining') === 'remaining';
  return {
    percent: pct,
    valueText: isRemaining ? formatDays(remaining) : `${Math.round(pct)}%`,
    percentText: `${Math.round(pct)}% elapsed`,
    subtitle: `Target ${todayKey(target)}`,
    badges: ['Countdown', remaining < 0 ? 'Overdue' : remaining === 0 ? 'Today' : `${Math.max(0, remaining)}d left`],
    tone,
  };
}

async function resolveNumericGauge(config) {
  const current = safeNumber(config.current_value, 0);
  const target = Math.max(1, safeNumber(config.target_value, 100));
  const pct = clamp((current / target) * 100, 0, 100);
  const remaining = target - current;
  let tone = 'info';
  if (pct >= 100) tone = 'success';
  else if (pct >= 75) tone = 'warn';
  return {
    percent: pct,
    valueText: `${formatNumber(current)} / ${formatNumber(target)}`,
    percentText: `${Math.round(pct)}% complete`,
    subtitle: remaining > 0 ? `${formatNumber(remaining)} remaining` : 'Target reached',
    badges: ['Numeric Goal'],
    tone,
  };
}

async function resolveItemNumericGauge(config, apiBase) {
  const snapshot = await fetchItemSnapshot(config, apiBase);
  const propValue = resolvePropertyPath(snapshot, config.property);
  const targetPropValue = config.target_property ? resolvePropertyPath(snapshot, config.target_property) : undefined;
  const current = safeNumber(propValue, Number.NaN);
  const target = Math.max(1, safeNumber(targetPropValue, config.target_value));
  if (!Number.isFinite(current)) throw new Error(`Property "${config.property}" is not numeric`);
  const pct = clamp((current / target) * 100, 0, 100);
  let tone = 'info';
  if (pct >= 100) tone = 'success';
  else if (pct >= 75) tone = 'warn';
  const itemLabel = config.item_name ? `${config.item_type}:${config.item_name}` : config.item_type;
  return {
    percent: pct,
    valueText: `${formatNumber(current)} / ${formatNumber(target)}`,
    percentText: `${Math.round(pct)}% complete`,
    subtitle: itemLabel,
    badges: ['Item Numeric', config.property],
    tone,
  };
}

export async function resolveGaugeState(config, options = {}) {
  const apiBase = options.apiBase || fallbackApiBase();
  const gauge = normalizeGaugeConfig(config);
  let result;
  if (gauge.type === 'countdown') result = await resolveCountdownGauge(gauge);
  else if (gauge.type === 'numeric') result = await resolveNumericGauge(gauge);
  else if (gauge.type === 'item_numeric') result = await resolveItemNumericGauge(gauge, apiBase);
  else throw new Error(`Unknown gauge type "${gauge.type}"`);
  return {
    ...result,
    percent: clamp(result.percent, 0, 100),
    label: gauge.label,
    accent: gauge.accent,
    type: gauge.type,
    config: gauge,
  };
}

export function renderGauge(el, state, options = {}) {
  ensureSharedStyles();
  if (!el) return;
  const size = Math.max(64, safeNumber(options.size, 150));
  const stroke = Math.max(3, safeNumber(options.stroke, 10));
  const radius = Math.max(6, 60 - stroke);
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - (clamp(state?.percent, 0, 100) / 100));
  const badges = Array.isArray(state?.badges) ? state.badges.filter(Boolean) : [];
  el.className = 'chronos-progress-gauge';
  if (state?.accent) el.style.setProperty('--pg-accent', state.accent);
  else el.style.removeProperty('--pg-accent');
  el.style.setProperty('--pg-size', `${size}px`);
  el.style.setProperty('--pg-stroke', `${stroke}`);
  if (state?.tone) el.dataset.tone = state.tone;
  else delete el.dataset.tone;
  el.innerHTML = `
    <div class="chronos-progress-gauge-ring-wrap" aria-hidden="true">
      <svg class="chronos-progress-gauge-ring" viewBox="0 0 120 120" role="presentation">
        <circle class="chronos-progress-gauge-ring-bg" cx="60" cy="60" r="${radius}"></circle>
        <circle class="chronos-progress-gauge-ring-progress" cx="60" cy="60" r="${radius}" style="stroke-dasharray:${circ};stroke-dashoffset:${offset};"></circle>
      </svg>
      <div class="chronos-progress-gauge-center">
        <div class="chronos-progress-gauge-value">${escapeHtml(state?.valueText || '--')}</div>
        <div class="chronos-progress-gauge-percent">${escapeHtml(state?.percentText || '')}</div>
      </div>
    </div>
    <div class="chronos-progress-gauge-meta">
      <div class="chronos-progress-gauge-label">${escapeHtml(state?.label || 'Progress Gauge')}</div>
      <div class="chronos-progress-gauge-subtitle">${escapeHtml(state?.subtitle || '')}</div>
      ${badges.length ? `<div class="chronos-progress-gauge-badges">${badges.map((badge) => `<span class="chronos-progress-gauge-badge">${escapeHtml(badge)}</span>`).join('')}</div>` : ''}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
