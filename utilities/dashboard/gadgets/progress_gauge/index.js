import {
  defaultGaugeConfig,
  fallbackApiBase,
  normalizeGaugeConfig,
  readStoredJSON,
  renderGauge,
  resolveGaugeState,
  writeStoredJSON,
} from '../../lib/progress_gauge.js';

const STYLE_ID = 'chronos-dock-progress-gauge-style';
const STORAGE_KEY = 'chronos_dock_progress_gauge_v1';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .dock-progress-gauge {
      position: relative;
      min-width: 118px;
      height: 40px;
      padding: 0 8px;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--border) 68%, rgba(255,255,255,0.3));
      background: linear-gradient(180deg, rgba(255,255,255,0.2), rgba(255,255,255,0.07));
      overflow: visible;
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      gap: 6px;
      cursor: pointer;
      transition: border-color 120ms ease, box-shadow 160ms ease, transform 120ms ease;
    }
    .dock-progress-gauge:hover {
      transform: translateY(-1px);
      border-color: var(--chronos-accent-strong, var(--accent));
      box-shadow: 0 12px 24px rgba(0,0,0,0.3);
    }
    .dock-progress-gauge-visual {
      flex: 0 0 auto;
      width: 30px;
      height: 30px;
    }
    .dock-progress-gauge .chronos-progress-gauge {
      gap: 0;
    }
    .dock-progress-gauge .chronos-progress-gauge-ring-wrap {
      width: 30px;
      height: 30px;
    }
    .dock-progress-gauge .chronos-progress-gauge-ring {
      width: 30px;
      height: 30px;
      transform: rotate(-90deg);
      display: block;
    }
    .dock-progress-gauge .chronos-progress-gauge-ring-bg {
      fill: none;
      stroke: rgba(255, 255, 255, 0.18);
      stroke-width: 3;
    }
    .dock-progress-gauge .chronos-progress-gauge-ring-progress {
      fill: none;
      stroke: var(--pg-accent, var(--chronos-accent, var(--accent)));
      stroke-width: 3;
      stroke-linecap: round;
      filter: none;
      transition: stroke-dashoffset 260ms ease;
    }
    .dock-progress-gauge .chronos-progress-gauge-meta {
      display: none;
    }
    .dock-progress-gauge .chronos-progress-gauge-center {
      padding: 0;
    }
    .dock-progress-gauge .chronos-progress-gauge-value {
      font-size: 10px;
      font-weight: 700;
      max-width: 30px;
    }
    .dock-progress-gauge .chronos-progress-gauge-percent {
      display: none;
    }
    .dock-progress-gauge-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .01em;
      color: var(--text);
      text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);
      white-space: nowrap;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 110px;
    }
    .dock-progress-gauge-menu {
      position: absolute;
      left: 50%;
      bottom: calc(100% + 10px);
      transform: translateX(-50%) translateY(8px);
      width: 260px;
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--border) 72%, rgba(255,255,255,0.3));
      background: linear-gradient(180deg, rgba(16,22,34,0.96), rgba(8,12,20,0.94));
      box-shadow: 0 20px 40px rgba(0,0,0,0.42);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 140ms ease, transform 180ms ease;
      z-index: 3;
    }
    .dock-progress-gauge.menu-open .dock-progress-gauge-menu {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(-50%) translateY(0);
    }
    .dock-progress-gauge-menu-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .dock-progress-gauge-menu-head strong {
      font-size: 12px;
      color: var(--text);
    }
    .dock-progress-gauge-menu-status {
      font-size: 11px;
      color: var(--text-dim);
      min-height: 14px;
    }
    .dock-progress-gauge-menu-status.error {
      color: #ff93a6;
    }
    .dock-progress-gauge-fields {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .dock-progress-gauge-fields label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-dim);
      min-width: 0;
    }
    .dock-progress-gauge-fields label.full {
      grid-column: 1 / -1;
    }
    .dock-progress-gauge-fields input,
    .dock-progress-gauge-fields select {
      width: 100%;
      min-width: 0;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.07);
      color: var(--text);
      padding: 7px 9px;
      font-size: 12px;
    }
    .dock-progress-gauge-fields input[type="color"] {
      min-height: 36px;
      padding: 4px;
    }
    .dock-progress-gauge-fields input[type="date"] {
      color-scheme: dark;
    }
    .dock-progress-gauge-menu-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .dock-progress-gauge-btn {
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.08);
      color: var(--text);
      padding: 7px 10px;
      font-size: 12px;
      cursor: pointer;
    }
    .dock-progress-gauge-btn--primary {
      border: none;
      background: var(--chronos-accent-gradient);
      color: #fff;
    }
  `;
  document.head.appendChild(style);
}

function loadConfig() {
  return normalizeGaugeConfig(readStoredJSON(STORAGE_KEY, defaultGaugeConfig('countdown')));
}

function saveConfig(config) {
  writeStoredJSON(STORAGE_KEY, normalizeGaugeConfig(config));
}

function normalizeColor(value) {
  const raw = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : '#7aa2f7';
}

export function mount(el, context = {}) {
  ensureStyles();
  const apiBase = typeof context.apiBase === 'function' ? context.apiBase() : fallbackApiBase();
  const showToast = typeof context.showToast === 'function' ? context.showToast : () => {};
  let config = loadConfig();
  let refreshTimer = null;

  el.innerHTML = `
    <div class="dock-progress-gauge" tabindex="0" aria-label="Progress Gauge dock gadget">
      <div class="dock-progress-gauge-visual" data-visual></div>
      <div class="dock-progress-gauge-label" data-label></div>
      <div class="dock-progress-gauge-menu" data-menu>
        <div class="dock-progress-gauge-menu-head">
          <strong>Progress Gauge</strong>
          <span class="dock-progress-gauge-menu-status" data-status></span>
        </div>
        <div class="dock-progress-gauge-fields">
          <label class="full">Label
            <input type="text" data-field="label" />
          </label>
          <label>Type
            <select data-field="type">
              <option value="countdown">Countdown</option>
              <option value="numeric">Numeric Goal</option>
              <option value="item_numeric">Item Numeric</option>
            </select>
          </label>
          <label>Accent
            <input type="color" data-field="accent" />
          </label>
          <label data-block="countdown">Start Date
            <input type="date" data-field="start_date" />
          </label>
          <label data-block="countdown">Target Date
            <input type="date" data-field="target_date" />
          </label>
          <label data-block="countdown">Center
            <select data-field="countdown_mode">
              <option value="remaining">Time Remaining</option>
              <option value="percent">Percent</option>
            </select>
          </label>
          <label data-block="numeric">Current
            <input type="number" step="any" data-field="current_value" />
          </label>
          <label data-block="numeric">Target
            <input type="number" min="1" step="any" data-field="target_value" />
          </label>
          <label data-block="item_numeric">Item Type
            <input type="text" data-field="item_type" />
          </label>
          <label data-block="item_numeric">Item Name
            <input type="text" data-field="item_name" />
          </label>
          <label data-block="item_numeric">Property
            <input type="text" data-field="property" />
          </label>
          <label data-block="item_numeric">Target Property
            <input type="text" data-field="target_property" />
          </label>
          <label data-block="item_numeric">Fallback Target
            <input type="number" min="1" step="any" data-field="target_value" />
          </label>
        </div>
        <div class="dock-progress-gauge-menu-actions">
          <button type="button" class="dock-progress-gauge-btn" data-action="refresh">Refresh</button>
          <button type="button" class="dock-progress-gauge-btn dock-progress-gauge-btn--primary" data-action="close">Close</button>
        </div>
      </div>
    </div>
  `;

  const shell = el.querySelector('.dock-progress-gauge');
  const visualEl = el.querySelector('[data-visual]');
  const labelEl = el.querySelector('[data-label]');
  const statusEl = el.querySelector('[data-status]');
  const refreshBtn = el.querySelector('[data-action="refresh"]');
  const closeBtn = el.querySelector('[data-action="close"]');

  const setStatus = (text, isError = false) => {
    statusEl.textContent = text || '';
    statusEl.classList.toggle('error', !!isError);
  };

  const syncFields = () => {
    shell.querySelectorAll('[data-field]').forEach((input) => {
      const field = input.getAttribute('data-field');
      if (!field) return;
      if (input.type === 'color') input.value = normalizeColor(config[field]);
      else input.value = config[field] ?? '';
    });
    shell.querySelectorAll('[data-block]').forEach((node) => {
      const mode = node.getAttribute('data-block');
      node.style.display = mode === config.type ? '' : 'none';
    });
  };

  const persistConfig = () => {
    config = normalizeGaugeConfig(config);
    saveConfig(config);
    syncFields();
  };

  const refresh = async () => {
    try {
      const state = await resolveGaugeState(config, { apiBase });
      renderGauge(visualEl, {
        ...state,
        valueText: `${Math.round(Number(state?.percent || 0))}%`,
        percentText: '',
      }, { size: 30, stroke: 3 });
      labelEl.textContent = compactRightLabel(state);
      setStatus(`Updated ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      renderGauge(visualEl, {
        label: config.label,
        valueText: '--%',
        percentText: 'Unavailable',
        subtitle: 'Check configuration',
        badges: [],
        percent: 0,
        tone: 'danger',
        accent: config.accent,
      }, { size: 30, stroke: 3 });
      labelEl.textContent = config.label || 'Progress Gauge';
      setStatus(error?.message || 'Unable to resolve gauge', true);
    }
  };

  const toggleMenu = (next) => {
    shell.classList.toggle('menu-open', typeof next === 'boolean' ? next : !shell.classList.contains('menu-open'));
  };

  const onDocumentPointerDown = (event) => {
    if (!shell.classList.contains('menu-open')) return;
    if (shell.contains(event.target)) return;
    toggleMenu(false);
  };

  shell.addEventListener('click', (event) => {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget && !event.target.closest('[data-field]')) toggleMenu();
  });

  document.addEventListener('pointerdown', onDocumentPointerDown, true);

  shell.querySelectorAll('[data-field]').forEach((input) => {
    const field = input.getAttribute('data-field');
    if (!field) return;
    const handler = (event) => {
      const value = event.target.type === 'number' ? Number(event.target.value) : event.target.value;
      config[field] = value;
      persistConfig();
      void refresh();
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  });

  refreshBtn?.addEventListener('click', async (event) => {
    event.stopPropagation();
    await refresh();
    showToast('Progress Gauge refreshed.', 'success');
  });
  closeBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleMenu(false);
  });

  syncFields();
  void refresh();
  refreshTimer = window.setInterval(() => { void refresh(); }, 60000);

  return {
    destroy() {
      try { if (refreshTimer) clearInterval(refreshTimer); } catch { }
      try { document.removeEventListener('pointerdown', onDocumentPointerDown, true); } catch { }
    },
  };
}

function compactRightLabel(state) {
  const value = String(state?.valueText || '').trim();
  const subtitle = String(state?.subtitle || '').trim();
  const label = String(state?.label || 'Progress Gauge').trim();
  if (value && value !== `${Math.round(Number(state?.percent || 0))}%`) return value;
  if (subtitle) return subtitle;
  return label;
}
