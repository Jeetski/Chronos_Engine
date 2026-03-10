import {
  defaultGaugeConfig,
  normalizeGaugeConfig,
  readStoredJSON,
  renderGauge,
  resolveGaugeState,
  writeStoredJSON,
  fallbackApiBase,
} from '../../lib/progress_gauge.js';

const PANEL_ID = 'progress-gauge';
const STYLE_ID = 'cockpit-progress-gauge-panel-style';
const PANEL_STATE_PREFIX = 'chronos_progress_gauge_panel_state_';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .progress-gauge-panel-shell {
      display: flex;
      flex-direction: column;
      gap: 12px;
      height: 100%;
      color: var(--chronos-text);
      min-height: 0;
    }
    .progress-gauge-panel-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    .progress-gauge-panel-title {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .progress-gauge-panel-title strong {
      font-size: 15px;
      font-weight: 700;
      color: var(--chronos-text);
    }
    .progress-gauge-panel-title span {
      font-size: 12px;
      color: var(--chronos-text-muted);
    }
    .progress-gauge-panel-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .progress-gauge-btn {
      border-radius: 10px;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid rgba(255,255,255,0.12);
      color: var(--chronos-text);
      background: rgba(255,255,255,0.06);
      transition: transform 120ms ease, box-shadow 140ms ease;
    }
    .progress-gauge-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 18px rgba(2,4,12,0.34);
    }
    .progress-gauge-btn--primary {
      border: none;
      background: var(--chronos-accent-gradient);
      color: #fff;
    }
    .progress-gauge-panel-status {
      font-size: 12px;
      color: var(--chronos-text-muted);
      min-height: 16px;
    }
    .progress-gauge-panel-status.error {
      color: var(--chronos-danger);
    }
    .progress-gauge-grid {
      flex: 1;
      min-height: 0;
      overflow: auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
      align-content: start;
      padding-right: 2px;
    }
    .progress-gauge-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.08);
      background:
        radial-gradient(circle at top, rgba(122,162,247,0.13), transparent 52%),
        linear-gradient(180deg, rgba(12,16,26,0.96), rgba(8,11,18,0.92));
      padding: 14px;
      box-shadow: 0 18px 36px rgba(0,0,0,0.3);
      min-height: 0;
    }
    .progress-gauge-card-head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: flex-start;
    }
    .progress-gauge-card-meta {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }
    .progress-gauge-card-meta strong {
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--chronos-text-muted);
    }
    .progress-gauge-card-meta span {
      font-size: 12px;
      color: var(--chronos-text-soft, var(--chronos-text-muted));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .progress-gauge-card-remove {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.06);
      color: var(--chronos-text);
      cursor: pointer;
      flex: 0 0 auto;
    }
    .progress-gauge-card-remove:hover {
      background: rgba(255,120,141,0.14);
      color: #ff90a3;
    }
    .progress-gauge-card-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
      justify-items: center;
    }
    .progress-gauge-card-editor {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      width: 100%;
    }
    .progress-gauge-card-editor label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--chronos-text-muted);
      min-width: 0;
    }
    .progress-gauge-card-editor label.full {
      grid-column: 1 / -1;
    }
    .progress-gauge-card-editor input,
    .progress-gauge-card-editor select {
      width: 100%;
      min-width: 0;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.06);
      color: var(--chronos-text);
      padding: 8px 10px;
      font-size: 13px;
    }
    .progress-gauge-card-editor input[type="color"] {
      min-height: 40px;
      padding: 4px;
    }
    .progress-gauge-card-editor input[type="date"] {
      color-scheme: dark;
    }
    .progress-gauge-card-error {
      width: 100%;
      text-align: center;
      font-size: 12px;
      color: #ff9aac;
      min-height: 16px;
    }
    .progress-gauge-panel-empty {
      border-radius: 18px;
      border: 1px dashed rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.03);
      min-height: 220px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: var(--chronos-text-muted);
      padding: 20px;
    }
  `;
  document.head.appendChild(style);
}

function panelStateKey(panelId) {
  return `${PANEL_STATE_PREFIX}${panelId || PANEL_ID}`;
}

function loadPanelState(panelId) {
  const stored = readStoredJSON(panelStateKey(panelId), null);
  if (!stored || !Array.isArray(stored.gauges) || !stored.gauges.length) {
    return { gauges: [defaultGaugeConfig('countdown')] };
  }
  return { gauges: stored.gauges.map((entry) => normalizeGaugeConfig(entry)) };
}

function storePanelState(panelId, state) {
  writeStoredJSON(panelStateKey(panelId), {
    gauges: (state.gauges || []).map((entry) => normalizeGaugeConfig(entry)),
  });
}

function createDefinition() {
  return {
    id: PANEL_ID,
    label: 'Progress Gauge',
    defaultVisible: false,
    defaultPosition: { x: 620, y: 80 },
    size: { width: 640, height: 520 },
    mount: (root) => mountPanel(root, PANEL_ID),
  };
}

export function register(manager) {
  injectStyles();
  manager.registerPanel(createDefinition());
}

const autoAttach = (manager) => {
  try {
    if (manager && typeof manager.registerPanel === 'function') register(manager);
  } catch (error) {
    console.error('[Chronos][Panels][ProgressGauge] register failed', error);
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

function mountPanel(root, panelId) {
  injectStyles();
  root.classList.add('progress-gauge-panel-shell');
  root.innerHTML = `
    <div class="progress-gauge-panel-toolbar">
      <div class="progress-gauge-panel-title">
        <strong>Progress Gauge</strong>
        <span>Ring gauges for countdowns and numeric targets.</span>
      </div>
      <div class="progress-gauge-panel-actions">
        <button type="button" class="progress-gauge-btn progress-gauge-btn--primary" data-action="add">Add Gauge</button>
        <button type="button" class="progress-gauge-btn" data-action="refresh">Refresh</button>
      </div>
    </div>
    <div class="progress-gauge-panel-status"></div>
    <div class="progress-gauge-grid"></div>
  `;

  const gridEl = root.querySelector('.progress-gauge-grid');
  const statusEl = root.querySelector('.progress-gauge-panel-status');
  const addBtn = root.querySelector('[data-action="add"]');
  const refreshBtn = root.querySelector('[data-action="refresh"]');
  const state = loadPanelState(panelId);
  let refreshToken = 0;
  let refreshTimer = null;

  const setStatus = (text, isError = false) => {
    statusEl.textContent = text || '';
    statusEl.classList.toggle('error', !!isError);
  };

  const persist = () => storePanelState(panelId, state);

  const updateGauge = (gaugeId, key, value) => {
    const target = state.gauges.find((entry) => entry.id === gaugeId);
    if (!target) return;
    target[key] = value;
    Object.assign(target, normalizeGaugeConfig(target));
    persist();
    void renderAll();
  };

  const removeGauge = (gaugeId) => {
    state.gauges = state.gauges.filter((entry) => entry.id !== gaugeId);
    if (!state.gauges.length) state.gauges = [defaultGaugeConfig('countdown')];
    persist();
    void renderAll();
  };

  const addGauge = () => {
    state.gauges.push(defaultGaugeConfig('countdown'));
    persist();
    void renderAll();
  };

  const bindEditor = (cardEl, gauge) => {
    cardEl.querySelectorAll('[data-field]').forEach((input) => {
      const field = input.getAttribute('data-field');
      if (!field) return;
      const handler = (event) => {
        const value = event.target.type === 'number' ? Number(event.target.value) : event.target.value;
        updateGauge(gauge.id, field, value);
      };
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
    });
    cardEl.querySelector('[data-remove]')?.addEventListener('click', () => removeGauge(gauge.id));
  };

  const renderCard = async (gauge) => {
    const card = document.createElement('section');
    card.className = 'progress-gauge-card';
    const kindLabel = gauge.type === 'item_numeric' ? 'Item Numeric' : gauge.type === 'numeric' ? 'Numeric Goal' : 'Countdown';
    card.innerHTML = `
      <div class="progress-gauge-card-head">
        <div class="progress-gauge-card-meta">
          <strong>${kindLabel}</strong>
          <span>${escapeAttr(gauge.label || 'Progress Gauge')}</span>
        </div>
        <button type="button" class="progress-gauge-card-remove" data-remove title="Remove gauge">x</button>
      </div>
      <div class="progress-gauge-card-body">
        <div data-gauge-visual></div>
        <div class="progress-gauge-card-error" data-gauge-error></div>
        <div class="progress-gauge-card-editor">
          <label class="full">Label
            <input type="text" value="${escapeAttr(gauge.label)}" data-field="label" />
          </label>
          <label>Type
            <select data-field="type">
              <option value="countdown"${gauge.type === 'countdown' ? ' selected' : ''}>Countdown</option>
              <option value="numeric"${gauge.type === 'numeric' ? ' selected' : ''}>Numeric Goal</option>
              <option value="item_numeric"${gauge.type === 'item_numeric' ? ' selected' : ''}>Item Numeric</option>
            </select>
          </label>
          <label>Accent
            <input type="color" value="${normalizeColor(gauge.accent)}" data-field="accent" />
          </label>
          <label data-block="countdown">Start Date
            <input type="date" value="${escapeAttr(gauge.start_date)}" data-field="start_date" />
          </label>
          <label data-block="countdown">Target Date
            <input type="date" value="${escapeAttr(gauge.target_date)}" data-field="target_date" />
          </label>
          <label data-block="countdown">Center Text
            <select data-field="countdown_mode">
              <option value="remaining"${gauge.countdown_mode === 'remaining' ? ' selected' : ''}>Time Remaining</option>
              <option value="percent"${gauge.countdown_mode === 'percent' ? ' selected' : ''}>Percent</option>
            </select>
          </label>
          <label data-block="numeric">Current
            <input type="number" step="any" value="${escapeAttr(gauge.current_value)}" data-field="current_value" />
          </label>
          <label data-block="numeric">Target
            <input type="number" step="any" min="1" value="${escapeAttr(gauge.target_value)}" data-field="target_value" />
          </label>
          <label data-block="item_numeric">Item Type
            <input type="text" value="${escapeAttr(gauge.item_type)}" data-field="item_type" />
          </label>
          <label data-block="item_numeric">Item Name
            <input type="text" value="${escapeAttr(gauge.item_name)}" data-field="item_name" />
          </label>
          <label data-block="item_numeric">Property
            <input type="text" value="${escapeAttr(gauge.property)}" data-field="property" />
          </label>
          <label data-block="item_numeric">Target Property
            <input type="text" value="${escapeAttr(gauge.target_property)}" data-field="target_property" placeholder="optional" />
          </label>
          <label data-block="item_numeric">Fallback Target
            <input type="number" step="any" min="1" value="${escapeAttr(gauge.target_value)}" data-field="target_value" />
          </label>
        </div>
      </div>
    `;

    card.querySelectorAll('[data-block]').forEach((node) => {
      const mode = node.getAttribute('data-block');
      node.style.display = mode === gauge.type ? '' : 'none';
    });

    bindEditor(card, gauge);
    const gaugeVisualEl = card.querySelector('[data-gauge-visual]');
    const gaugeErrorEl = card.querySelector('[data-gauge-error]');
    try {
      const resolved = await resolveGaugeState(gauge, { apiBase: fallbackApiBase() });
      renderGauge(gaugeVisualEl, resolved, { size: 144, stroke: 9 });
      gaugeErrorEl.textContent = '';
    } catch (error) {
      renderGauge(gaugeVisualEl, {
        label: gauge.label || 'Progress Gauge',
        valueText: '--',
        percentText: 'Unavailable',
        subtitle: gauge.type === 'item_numeric' ? `${gauge.item_type}:${gauge.item_name || '?'}` : 'Check configuration',
        badges: [kindLabel],
        percent: 0,
        tone: 'danger',
        accent: gauge.accent,
      }, { size: 144, stroke: 9 });
      gaugeErrorEl.textContent = error?.message || 'Unable to resolve gauge';
    }
    return card;
  };

  async function renderAll() {
    const token = ++refreshToken;
    gridEl.innerHTML = '';
    setStatus('Refreshing gauges...');
    if (!state.gauges.length) {
      const empty = document.createElement('div');
      empty.className = 'progress-gauge-panel-empty';
      empty.textContent = 'No gauges configured yet.';
      gridEl.appendChild(empty);
      setStatus('');
      return;
    }
    const cards = await Promise.all(state.gauges.map((entry) => renderCard(normalizeGaugeConfig(entry))));
    if (token !== refreshToken) return;
    cards.forEach((card) => gridEl.appendChild(card));
    setStatus(`Updated ${new Date().toLocaleTimeString()}`);
  }

  addBtn?.addEventListener('click', addGauge);
  refreshBtn?.addEventListener('click', () => void renderAll());

  void renderAll();
  refreshTimer = window.setInterval(() => { void renderAll(); }, 60000);

  return {
    dispose() {
      try { if (refreshTimer) window.clearInterval(refreshTimer); } catch { }
    },
  };
}

function normalizeColor(value) {
  const raw = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : '#7aa2f7';
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
