const STORAGE_KEY = 'chronos_yesterday_checkin_popup_v1';
const STATUS_OPTIONS = ['completed', 'partial', 'skipped', 'missed'];
const TYPE_OPTIONS = ['habit', 'task', 'routine', 'subroutine', 'microroutine', 'window', 'timeblock'];
const MANUAL_LAUNCH = String(import.meta?.url || '').includes('manual=1');

function apiBase() {
  const o = window.location?.origin;
  if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
  return o;
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state || {})); } catch {}
}

function snooze(ms) {
  const st = loadState();
  st.snoozeUntil = Date.now() + Math.max(60_000, Number(ms) || 0);
  saveState(st);
}

function isSnoozed() {
  const st = loadState();
  return Number(st.snoozeUntil || 0) > Date.now();
}

function markAcknowledged(dateKey) {
  const st = loadState();
  st.ackDate = String(dateKey || '');
  st.snoozeUntil = 0;
  saveState(st);
}

function isAcknowledged(dateKey) {
  const st = loadState();
  return String(st.ackDate || '') === String(dateKey || '');
}

async function fetchCheckin() {
  const resp = await fetch(`${apiBase()}/api/yesterday/checkin`);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.ok === false) throw new Error(data?.error || `HTTP ${resp.status}`);
  return data;
}

function injectStyles() {
  if (document.getElementById('ycheck-style')) return;
  const style = document.createElement('style');
  style.id = 'ycheck-style';
  style.textContent = `
    .ycheck-overlay {
      position: fixed;
      inset: 0;
      z-index: 10001;
      background: rgba(7, 10, 18, 0.72);
      backdrop-filter: blur(3px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
    }
    .ycheck-card {
      width: min(980px, 96vw);
      max-height: 88vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 14px;
      background: rgba(13, 18, 31, 0.98);
      color: var(--chronos-text, #d9e4ff);
      box-shadow: 0 20px 50px rgba(0,0,0,0.55);
      padding: 14px;
    }
    .ycheck-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .ycheck-title { margin: 0; font-size: 19px; font-weight: 800; }
    .ycheck-meta { color: var(--chronos-text-muted, #9db0cf); font-size: 12px; }
    .ycheck-list {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      overflow: auto;
      max-height: 38vh;
    }
    .ycheck-row {
      display: grid;
      grid-template-columns: minmax(260px, 2fr) 120px 140px;
      gap: 8px;
      align-items: center;
      padding: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .ycheck-row:last-child { border-bottom: none; }
    .ycheck-name { font-weight: 700; }
    .ycheck-sub { font-size: 11px; color: var(--chronos-text-muted, #9db0cf); }
    .ycheck-select, .ycheck-input {
      width: 100%;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.12);
      color: var(--chronos-text, #d9e4ff);
      border-radius: 8px;
      padding: 6px 8px;
      font-size: 12px;
      box-sizing: border-box;
    }
    .ycheck-select {
      color-scheme: dark;
      background-color: rgba(18, 24, 40, 0.96);
    }
    .ycheck-select option,
    .ycheck-select optgroup {
      background: #121828;
      color: var(--chronos-text, #d9e4ff);
    }
    .ycheck-select:focus,
    .ycheck-input:focus {
      outline: none;
      border-color: rgba(122, 162, 247, 0.6);
      box-shadow: 0 0 0 2px rgba(122, 162, 247, 0.18);
    }
    .ycheck-section-title { margin: 2px 0 0; font-size: 13px; color: var(--chronos-text-muted, #9db0cf); }
    .ycheck-additional {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 24vh;
      overflow: auto;
    }
    .ycheck-extra {
      display: grid;
      grid-template-columns: 140px minmax(200px, 1fr) 120px auto;
      gap: 8px;
      align-items: center;
    }
    .ycheck-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
      align-items: center;
    }
    .ycheck-btn {
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.05);
      color: var(--chronos-text, #d9e4ff);
      border-radius: 10px;
      padding: 8px 11px;
      font-weight: 700;
      cursor: pointer;
    }
    .ycheck-btn.primary {
      background: var(--chronos-accent-gradient, linear-gradient(135deg,#7aa2f7,#4de2b6));
      color: #0b0f16;
      border-color: rgba(255,255,255,0.2);
    }
    .ycheck-btn:hover { filter: brightness(1.06); }
    .ycheck-status { min-height: 18px; font-size: 12px; color: var(--chronos-text-muted, #9db0cf); }
    .ycheck-status.error { color: #ff8b8b; }
    .ycheck-status.success { color: #89f0b0; }
  `;
  document.head.appendChild(style);
}

function optionList(values, selected) {
  return values.map(v => `<option value="${v}" ${String(selected || '').toLowerCase() === v ? 'selected' : ''}>${v}</option>`).join('');
}

function closePopup(overlay, done) {
  try { overlay.remove(); } catch {}
  done?.();
}

function buildPopup(payload, done) {
  const overlay = document.createElement('div');
  overlay.className = 'ycheck-overlay';
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const schedulables = Array.isArray(payload?.schedulables) ? payload.schedulables : [];
  const dateKey = String(payload?.date || '');

  const datalistId = `ycheck-schedulables-${Date.now()}`;
  const rowHtml = rows.map(r => {
    const status = String(r?.status || 'missed').toLowerCase();
    const start = String(r?.scheduled_start || '--:--');
    const end = String(r?.scheduled_end || '--:--');
    const type = String(r?.type || 'task');
    const auto = r?.auto_missed ? 'auto-missed' : 'logged';
    return `
      <div class="ycheck-row" data-key="${String(r?.key || '')}">
        <div>
          <div class="ycheck-name">${String(r?.name || 'Untitled')}</div>
          <div class="ycheck-sub">${type} | ${start}-${end} | ${auto}</div>
        </div>
        <div class="ycheck-sub">${start}-${end}</div>
        <select class="ycheck-select" data-field="status">
          ${optionList(STATUS_OPTIONS, status)}
        </select>
      </div>
    `;
  }).join('');

  const schedOptions = schedulables
    .map(r => `<option value="${String(r?.name || '')}" label="${String(r?.type || '')}"></option>`)
    .join('');

  overlay.innerHTML = `
    <div class="ycheck-card" role="dialog" aria-modal="true" aria-label="Yesterday check-in">
      <div class="ycheck-head">
        <div>
          <h2 class="ycheck-title">Yesterday Check-in</h2>
          <div class="ycheck-meta">${dateKey} | Auto-miss already applied. Change any you actually did.</div>
        </div>
      </div>
      <div class="ycheck-section-title">Scheduled yesterday</div>
      <div class="ycheck-list" id="ycheckRows">${rowHtml || '<div class="ycheck-row"><div class="ycheck-sub">No scheduled blocks found.</div></div>'}</div>

      <div class="ycheck-section-title">Additional things you did</div>
      <datalist id="${datalistId}">${schedOptions}</datalist>
      <div class="ycheck-additional" id="ycheckAdditional"></div>
      <div>
        <button class="ycheck-btn" data-action="add-extra">+ Add additional</button>
      </div>

      <div class="ycheck-status" id="ycheckStatus"></div>
      <div class="ycheck-actions">
        <button class="ycheck-btn" data-action="snooze" data-ms="900000">Remind in 15m</button>
        <button class="ycheck-btn" data-action="snooze" data-ms="3600000">Remind in 60m</button>
        <button class="ycheck-btn" data-action="dismiss">Dismiss (keep misses)</button>
        <button class="ycheck-btn primary" data-action="apply">Apply check-in</button>
      </div>
    </div>
  `;

  const statusEl = overlay.querySelector('#ycheckStatus');
  const additionalEl = overlay.querySelector('#ycheckAdditional');

  function setStatus(msg, tone) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = `ycheck-status${tone ? ' ' + tone : ''}`;
  }

  function addExtraRow(seed = {}) {
    const row = document.createElement('div');
    row.className = 'ycheck-extra';
    row.innerHTML = `
      <select class="ycheck-select" data-field="type">${optionList(TYPE_OPTIONS, String(seed.type || 'task').toLowerCase())}</select>
      <input class="ycheck-input" data-field="name" list="${datalistId}" placeholder="Name" value="${String(seed.name || '')}" />
      <select class="ycheck-select" data-field="status">${optionList(STATUS_OPTIONS, String(seed.status || 'completed').toLowerCase())}</select>
      <button class="ycheck-btn" data-action="remove-extra">Remove</button>
    `;
    row.querySelector('[data-action="remove-extra"]')?.addEventListener('click', () => row.remove());
    additionalEl?.appendChild(row);
  }

  addExtraRow();

  overlay.addEventListener('click', async (ev) => {
    const btn = ev.target?.closest?.('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'add-extra') {
      addExtraRow();
      return;
    }

    if (action === 'dismiss') {
      markAcknowledged(dateKey);
      closePopup(overlay, done);
      return;
    }

    if (action === 'snooze') {
      const ms = parseInt(btn.getAttribute('data-ms') || '0', 10) || 900_000;
      snooze(ms);
      closePopup(overlay, done);
      return;
    }

    if (action === 'apply') {
      try {
        setStatus('Saving yesterday check-in...');
        const updates = Array.from(overlay.querySelectorAll('.ycheck-row[data-key]')).map(row => ({
          key: String(row.getAttribute('data-key') || ''),
          status: String(row.querySelector('[data-field="status"]')?.value || 'missed').toLowerCase(),
        }));
        const additional = Array.from(overlay.querySelectorAll('.ycheck-extra')).map(row => ({
          type: String(row.querySelector('[data-field="type"]')?.value || 'task').toLowerCase(),
          name: String(row.querySelector('[data-field="name"]')?.value || '').trim(),
          status: String(row.querySelector('[data-field="status"]')?.value || 'completed').toLowerCase(),
        })).filter(r => r.name);

        const resp = await fetch(`${apiBase()}/api/yesterday/checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: dateKey, updates, additional }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.ok === false) throw new Error(data?.error || `HTTP ${resp.status}`);
        setStatus('Saved.', 'success');
        markAcknowledged(dateKey);
        window.setTimeout(() => closePopup(overlay, done), 200);
      } catch (err) {
        setStatus(`Save failed: ${err?.message || err}`, 'error');
      }
    }
  });

  document.body.appendChild(overlay);
}

async function maybeShow(done) {
  if (!MANUAL_LAUNCH && isSnoozed()) { done?.(); return; }
  let payload = null;
  try {
    payload = await fetchCheckin();
  } catch (err) {
    if (!MANUAL_LAUNCH) throw err;
  }
  if (!payload || !Array.isArray(payload.rows)) {
    if (!MANUAL_LAUNCH) { done?.(); return; }
    const y = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yk = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    payload = { date: yk, rows: [], schedulables: [] };
  }
  const hasSched = payload.rows.length > 0;
  const hasChoices = Array.isArray(payload.schedulables) && payload.schedulables.length > 0;
  if (!MANUAL_LAUNCH && !hasSched && !hasChoices) { done?.(); return; }
  if (!MANUAL_LAUNCH && isAcknowledged(payload.date)) { done?.(); return; }
  injectStyles();
  buildPopup(payload, done);
}

function initYesterdayCheckinPopup() {
  if (typeof document === 'undefined') return;
  const runner = (done) => setTimeout(() => {
    maybeShow(done).catch((err) => {
      try { console.error('[Chronos][Popups][YesterdayCheckin] failed', err); } catch {}
      done?.();
    });
  }, 2200);
  if (window.ChronosPopupQueue?.enqueue) window.ChronosPopupQueue.enqueue(runner);
  else runner(() => {});
}

initYesterdayCheckinPopup();

export {};
