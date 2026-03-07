const STORAGE_KEY = 'chronos_alerts_center_popup_v1';
const POLL_MS = 10000;
const OPEN_REFRESH_MS = 4000;
const MANUAL_LAUNCH = String(import.meta?.url || '').includes('manual=1');

let popupEl = null;
let popupDone = null;
let queued = false;
let pollTimer = null;
let refreshTimer = null;
let openInProgress = false;

function apiBase() {
  const o = window.location?.origin;
  if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
  return o;
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveState(next) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next || {})); } catch {}
}

function snooze(ms) {
  const st = loadState();
  st.snoozeUntil = Date.now() + Math.max(60_000, Number(ms) || 0);
  saveState(st);
}

function isSnoozed() {
  const until = Number(loadState().snoozeUntil || 0);
  return until > Date.now();
}

function normalizeText(v) {
  try { return String(v ?? '').trim(); } catch { return ''; }
}

function htmlEscape(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchJson(url, options) {
  const resp = await fetch(url, options);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${resp.status}`);
  return data;
}

async function listItems(type) {
  const data = await fetchJson(`${apiBase()}/api/items?type=${encodeURIComponent(type)}`);
  return Array.isArray(data.items) ? data.items : [];
}

async function readItem(type, name) {
  const data = await fetchJson(
    `${apiBase()}/api/item?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`
  );
  return data.item || {};
}

function summarizeAlert(type, item) {
  const name = normalizeText(item.name) || '(untitled)';
  const status = normalizeText(item.status).toLowerCase();
  const whenDate = normalizeText(item.date);
  const whenTime = normalizeText(item.time);
  const label = type === 'alarm'
    ? normalizeText(item.message)
    : (normalizeText(item.label) || normalizeText(item.message));
  const target = (item && typeof item.target === 'object') ? item.target : null;
  return {
    id: `${type}:${name.toLowerCase()}`,
    type,
    name,
    status,
    whenDate,
    whenTime,
    label,
    target,
  };
}

async function fetchRingingAlerts() {
  const [alarms, reminders] = await Promise.all([
    listItems('alarm').catch(() => []),
    listItems('reminder').catch(() => []),
  ]);
  const ringingAlarms = alarms.filter((row) => normalizeText(row.status).toLowerCase() === 'ringing');
  const ringingReminders = reminders.filter((row) => normalizeText(row.status).toLowerCase() === 'ringing');
  const alarmDetails = await Promise.all(
    ringingAlarms.map((row) => readItem('alarm', row.name).catch(() => ({ name: row.name, status: row.status })))
  );
  const reminderDetails = await Promise.all(
    ringingReminders.map((row) => readItem('reminder', row.name).catch(() => ({ name: row.name, status: row.status })))
  );
  return [
    ...alarmDetails.map((row) => summarizeAlert('alarm', row)),
    ...reminderDetails.map((row) => summarizeAlert('reminder', row)),
  ];
}

async function runCli(command, args = [], properties = {}) {
  return fetchJson(`${apiBase()}/api/cli`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, args, properties }),
  });
}

async function setItemProp(type, name, property, value) {
  return fetchJson(`${apiBase()}/api/items/setprop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, names: [name], property, value }),
  });
}

async function performAction(alert, action) {
  if (!alert || !action) return;
  if (alert.type === 'alarm') {
    if (action === 'snooze') return runCli('snooze', [alert.name], {});
    if (action === 'dismiss') return runCli('dismiss', [alert.name], {});
    if (action === 'skip') return runCli('skip', [alert.name], {});
  }
  if (alert.type === 'reminder') {
    if (action === 'dismiss') return setItemProp('reminder', alert.name, 'status', 'dismissed');
  }
  if (action === 'target-open' && alert.target) {
    const t = normalizeText(alert.target.type);
    const n = normalizeText(alert.target.name);
    if (t && n) return runCli('edit', [t, n], {});
  }
  if (action === 'target-complete' && alert.target) {
    const t = normalizeText(alert.target.type);
    const n = normalizeText(alert.target.name);
    if (t && n) return runCli('complete', [t, n], {});
  }
}

function injectStyles() {
  if (document.getElementById('alerts-center-style')) return;
  const style = document.createElement('style');
  style.id = 'alerts-center-style';
  style.textContent = `
    .alerts-center {
      position: fixed;
      right: 20px;
      bottom: 20px;
      width: min(420px, calc(100vw - 24px));
      z-index: 10020;
      color: var(--chronos-text, #dbe3ff);
    }
    .alerts-center-card {
      border: 1px solid var(--chronos-border-strong, var(--border, rgba(255,255,255,0.12)));
      border-radius: 14px;
      background: color-mix(in srgb, var(--panel, #101826) 88%, #000);
      box-shadow: var(--chronos-shadow, 0 16px 40px rgba(0,0,0,0.5));
      backdrop-filter: blur(10px) saturate(110%);
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      max-height: min(72vh, 680px);
    }
    .alerts-center-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .alerts-center-head strong { font-size: 15px; }
    .alerts-center-head .sub { font-size: 12px; color: var(--chronos-text-muted, var(--text-dim, #9fb0d8)); }
    .alerts-center-close {
      border: 1px solid var(--border, rgba(255,255,255,0.12));
      border-radius: 8px;
      width: 28px;
      height: 28px;
      background: color-mix(in srgb, var(--chronos-surface-soft, rgba(255,255,255,0.05)) 75%, transparent);
      color: var(--chronos-text, var(--text, #dbe3ff));
      font-size: 16px;
      cursor: pointer;
      line-height: 1;
      transition: border-color 120ms ease, transform 80ms ease;
    }
    .alerts-center-close:hover {
      border-color: var(--chronos-accent-strong, var(--accent, #7aa2f7));
    }
    .alerts-center-close:active {
      transform: translateY(1px);
    }
    .alerts-center-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: auto;
      max-height: 56vh;
      padding-right: 2px;
    }
    .alerts-center-item {
      border: 1px solid color-mix(in srgb, var(--chronos-border, var(--border, rgba(255,255,255,0.12))) 72%, transparent);
      border-radius: 10px;
      background: color-mix(in srgb, var(--chronos-surface-soft, rgba(255,255,255,0.04)) 70%, transparent);
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .alerts-center-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .alerts-center-name { font-weight: 700; font-size: 13px; }
    .alerts-center-badge {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.45px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--chronos-border-strong, var(--border, rgba(255,255,255,0.2))) 70%, transparent);
      padding: 2px 7px;
      color: var(--chronos-text-soft, #c8d5ff);
      background: color-mix(in srgb, var(--chronos-surface-soft, rgba(255,255,255,0.04)) 50%, transparent);
    }
    .alerts-center-badge.alarm {
      border-color: color-mix(in srgb, var(--chronos-danger, #ff9aa2) 55%, transparent);
      color: color-mix(in srgb, var(--chronos-danger, #ff9aa2) 78%, #fff);
      background: color-mix(in srgb, var(--chronos-danger-soft, rgba(255,154,162,0.2)) 60%, transparent);
    }
    .alerts-center-badge.reminder {
      border-color: color-mix(in srgb, var(--chronos-accent, #7aa2f7) 55%, transparent);
      color: color-mix(in srgb, var(--chronos-accent, #7aa2f7) 80%, #fff);
      background: color-mix(in srgb, var(--chronos-accent-soft, rgba(122,162,247,0.2)) 65%, transparent);
    }
    .alerts-center-meta { font-size: 12px; color: var(--chronos-text-muted, var(--text-dim, #9fb0d8)); }
    .alerts-center-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .alerts-center-actions .btn,
    .alerts-center-foot .controls .btn {
      font-size: 12px;
      padding: 6px 9px;
      border-radius: 8px;
      font-weight: 600;
    }
    .alerts-center-actions .btn.btn-warn {
      border-color: color-mix(in srgb, var(--chronos-warning, #f4c076) 56%, var(--border, #2b3343));
      background: color-mix(in srgb, var(--chronos-warning-soft, rgba(244,192,118,0.2)) 55%, transparent);
    }
    .alerts-center-actions .btn.btn-danger {
      border-color: color-mix(in srgb, var(--chronos-danger, #ff9aa2) 56%, var(--border, #2b3343));
      background: color-mix(in srgb, var(--chronos-danger-soft, rgba(255,154,162,0.2)) 55%, transparent);
    }
    .alerts-center-foot {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
      border-top: 1px solid color-mix(in srgb, var(--chronos-border, var(--border, rgba(255,255,255,0.12))) 70%, transparent);
      padding-top: 8px;
    }
    .alerts-center-foot .status {
      min-height: 16px;
      color: var(--chronos-text-muted, var(--text-dim, #9fb0d8));
      font-size: 12px;
    }
    .alerts-center-foot .controls {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
  `;
  document.head.appendChild(style);
}

function closePopup(snoozeMs = 0) {
  if (snoozeMs > 0) snooze(snoozeMs);
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (popupEl) {
    try { popupEl.remove(); } catch {}
    popupEl = null;
  }
  if (popupDone) {
    try { popupDone(); } catch {}
    popupDone = null;
  }
}

function renderRows(container, alerts) {
  if (!container) return;
  if (!alerts.length) {
    container.innerHTML = `<div class="alerts-center-meta">No active ringing alerts.</div>`;
    return;
  }
  container.innerHTML = alerts.map((alert) => {
    const whenBits = [alert.whenDate, alert.whenTime].filter(Boolean).join(' ');
    const target = alert.target && alert.target.type && alert.target.name
      ? `${alert.target.type}: ${alert.target.name}`
      : '';
    const actions = [];
    if (alert.type === 'alarm') {
      actions.push(`<button class="btn btn-secondary btn-warn" data-action="snooze" data-id="${htmlEscape(alert.id)}">Snooze</button>`);
      actions.push(`<button class="btn btn-secondary btn-danger" data-action="dismiss" data-id="${htmlEscape(alert.id)}">Dismiss</button>`);
      actions.push(`<button class="btn btn-secondary" data-action="skip" data-id="${htmlEscape(alert.id)}">Skip</button>`);
    } else {
      actions.push(`<button class="btn btn-secondary btn-danger" data-action="dismiss" data-id="${htmlEscape(alert.id)}">Dismiss</button>`);
    }
    if (target) {
      actions.push(`<button class="btn btn-secondary" data-action="target-open" data-id="${htmlEscape(alert.id)}">Open Target</button>`);
      actions.push(`<button class="btn btn-primary" data-action="target-complete" data-id="${htmlEscape(alert.id)}">Complete Target</button>`);
    }
    return `
      <div class="alerts-center-item">
        <div class="alerts-center-row">
          <div class="alerts-center-name">${htmlEscape(alert.name)}</div>
          <span class="alerts-center-badge ${htmlEscape(alert.type)}">${htmlEscape(alert.type)}</span>
        </div>
        ${whenBits ? `<div class="alerts-center-meta">${htmlEscape(whenBits)}</div>` : ''}
        ${alert.label ? `<div class="alerts-center-meta">${htmlEscape(alert.label)}</div>` : ''}
        ${target ? `<div class="alerts-center-meta">Target: ${htmlEscape(target)}</div>` : ''}
        <div class="alerts-center-actions">${actions.join('')}</div>
      </div>
    `;
  }).join('');
}

async function buildOrRefreshPopup(forceShowEmpty = false) {
  if (!popupEl) return;
  const listEl = popupEl.querySelector('[data-role="list"]');
  const statusEl = popupEl.querySelector('[data-role="status"]');
  const countEl = popupEl.querySelector('[data-role="count"]');
  try {
    const alerts = await fetchRingingAlerts();
    popupEl.__alerts = alerts;
    renderRows(listEl, alerts);
    if (countEl) countEl.textContent = `${alerts.length} active`;
    if (!alerts.length && !forceShowEmpty) {
      closePopup(0);
      return;
    }
    if (statusEl) statusEl.textContent = '';
  } catch (err) {
    if (statusEl) statusEl.textContent = `Refresh failed: ${err?.message || err}`;
  }
}

async function openPopup(done, forceShowEmpty = false) {
  if (popupEl || openInProgress) {
    popupDone = done || popupDone;
    return;
  }
  openInProgress = true;
  injectStyles();
  const wrap = document.createElement('div');
  wrap.className = 'alerts-center';
  wrap.innerHTML = `
    <div class="alerts-center-card">
      <div class="alerts-center-head">
        <div>
          <strong>Alerts Center</strong>
          <div class="sub" data-role="count">0 active</div>
        </div>
        <button class="alerts-center-close" title="Close">×</button>
      </div>
      <div class="alerts-center-list" data-role="list"></div>
      <div class="alerts-center-foot">
        <div class="status" data-role="status"></div>
        <div class="controls">
          <button class="btn btn-secondary" data-action="refresh">Refresh</button>
          <button class="btn btn-secondary btn-warn" data-action="snooze-ui">Snooze 5m</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  popupEl = wrap;
  popupDone = done || null;

  wrap.addEventListener('click', async (ev) => {
    const closeBtn = ev.target?.closest?.('.alerts-center-close');
    if (closeBtn) {
      closePopup(5 * 60 * 1000);
      return;
    }
    const btn = ev.target?.closest?.('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const statusEl = wrap.querySelector('[data-role="status"]');
    if (action === 'refresh') {
      if (statusEl) statusEl.textContent = 'Refreshing...';
      await buildOrRefreshPopup(forceShowEmpty);
      return;
    }
    if (action === 'snooze-ui') {
      closePopup(5 * 60 * 1000);
      return;
    }
    const id = normalizeText(btn.getAttribute('data-id'));
    const alert = (wrap.__alerts || []).find((a) => a.id === id);
    if (!alert) return;
    try {
      btn.disabled = true;
      if (statusEl) statusEl.textContent = 'Applying action...';
      await performAction(alert, action);
      await buildOrRefreshPopup(forceShowEmpty);
      if (statusEl) statusEl.textContent = '';
    } catch (err) {
      if (statusEl) statusEl.textContent = `Action failed: ${err?.message || err}`;
      btn.disabled = false;
    }
  });

  await buildOrRefreshPopup(forceShowEmpty);
  if (popupEl) {
    refreshTimer = setInterval(() => {
      buildOrRefreshPopup(forceShowEmpty);
    }, OPEN_REFRESH_MS);
  }
  openInProgress = false;
}

function enqueuePopup(forceShowEmpty = false) {
  if (queued) return;
  queued = true;
  const runner = (done) => {
    queued = false;
    openPopup(done, forceShowEmpty).catch(() => {
      try { done?.(); } catch {}
    });
  };
  if (window.ChronosPopupQueue?.enqueue) window.ChronosPopupQueue.enqueue(runner);
  else runner(() => {});
}

async function pollForAlerts() {
  if (popupEl || openInProgress || queued) return;
  if (!MANUAL_LAUNCH && isSnoozed()) return;
  try {
    const alerts = await fetchRingingAlerts();
    if (!alerts.length) return;
    enqueuePopup(false);
  } catch {
    // Keep polling even if one cycle fails.
  }
}

function initAlertsCenterPopup() {
  if (typeof document === 'undefined') return;
  if (MANUAL_LAUNCH) {
    enqueuePopup(true);
    return;
  }
  pollForAlerts();
  pollTimer = setInterval(pollForAlerts, POLL_MS);
}

initAlertsCenterPopup();

export {};
