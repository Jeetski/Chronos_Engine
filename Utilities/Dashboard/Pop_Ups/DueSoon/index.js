// Bump key to avoid stale snoozes; change when logic updates
const STORAGE_KEY = 'chronos_due_soon_popup_v2';
const LOOKAHEAD_DAYS = 3;

function apiBase() {
  const o = window.location?.origin;
  if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
  return o;
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveState(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data || {})); } catch {}
}

function snooze(ms) {
  const st = loadState();
  st.snoozeUntil = Date.now() + ms;
  saveState(st);
}

function isSnoozed() {
  const st = loadState();
  if (!st.snoozeUntil) return false;
  return Date.now() < st.snoozeUntil;
}

function markShownToday() {
  const st = loadState();
  st.lastShown = new Date().toISOString().slice(0, 10);
  saveState(st);
}

function shownToday() {
  const st = loadState();
  const today = new Date().toISOString().slice(0, 10);
  return st.lastShown === today;
}

async function fetchItems(types) {
  const base = apiBase();
  let items = [];
  for (const type of types) {
    try {
      const resp = await fetch(`${base}/api/items?type=${encodeURIComponent(type)}`);
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok || payload.ok === false) continue;
      if (Array.isArray(payload.items)) {
        items = items.concat(payload.items.map(it => ({ ...it, type })));
      }
    } catch { /* ignore */ }
  }
  return items;
}

function parseDate(d) {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t;
}

function daysDiff(targetDate) {
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const tgt = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  return Math.round((tgt - start) / (1000 * 60 * 60 * 24));
}

function filterDueSoon(items) {
  const now = new Date();
  const futureLimit = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  return items
    .map(it => {
      const dueRaw = it.due_date || it.due || it.date;
      const date = parseDate(dueRaw);
      return { ...it, due: dueRaw, __date: date };
    })
    .filter(it => {
      if (!it.__date) return false;
      const status = String(it.status || '').toLowerCase();
      if (['done', 'completed', 'complete'].includes(status)) return false;
      return it.__date <= futureLimit;
    })
    .sort((a, b) => {
      // Overdue first, then ascending due date
      const nowDate = new Date();
      const diffA = a.__date - nowDate;
      const diffB = b.__date - nowDate;
      const aOverdue = diffA < 0;
      const bOverdue = diffB < 0;
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      return a.__date - b.__date;
    });
}

function injectStyles() {
  if (document.getElementById('due-soon-style')) return;
  const style = document.createElement('style');
  style.id = 'due-soon-style';
  style.textContent = `
    .due-soon-popup {
      position: fixed;
      top: 20px;
      left: 20px;
      z-index: 9999;
      max-width: 360px;
      color: var(--chronos-text, #cdd5f7);
      font-size: 13px;
    }
    .due-soon-card {
      background: rgba(12,16,26,0.94);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      box-shadow: 0 14px 34px rgba(0,0,0,0.45);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .due-soon-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .due-soon-head strong {
      font-size: 15px;
    }
    .due-soon-close {
      background: transparent;
      border: none;
      color: var(--chronos-text, #cdd5f7);
      font-size: 16px;
      cursor: pointer;
    }
    .due-soon-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 320px;
      overflow: auto;
    }
    .due-soon-item {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
    }
    .due-soon-item span {
      display: block;
    }
    .due-soon-name {
      font-weight: 600;
    }
    .due-soon-meta {
      color: var(--chronos-text-muted, #9aa6c0);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .due-soon-due {
      font-size: 12px;
      color: var(--chronos-text, #cdd5f7);
    }
    .due-soon-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .due-soon-actions button {
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.05);
      color: var(--chronos-text, #cdd5f7);
      border-radius: 10px;
      padding: 7px 10px;
      font-weight: 600;
      cursor: pointer;
    }
    .due-soon-actions button.primary {
      background: var(--chronos-accent-gradient, linear-gradient(135deg, #7aa2f7, #4de2b6));
      border-color: rgba(255,255,255,0.2);
      color: #0b0f16;
    }
    .due-soon-actions button:hover {
      filter: brightness(1.05);
    }
  `;
  document.head.appendChild(style);
}

function buildPopup(items, actions, done) {
  const wrap = document.createElement('div');
  wrap.className = 'due-soon-popup';
  const listHtml = items.map(it => {
    const d = it.__date;
    const ddiff = daysDiff(d);
    const dueLabel = ddiff < 0 ? `Overdue by ${Math.abs(ddiff)}d` : (ddiff === 0 ? 'Due today' : `Due in ${ddiff}d`);
    const dateStr = d.toISOString().slice(0, 10);
    return `
      <li class="due-soon-item">
        <span>
          <span class="due-soon-name">${it.name || '(untitled)'}</span>
          <span class="due-soon-meta">${(it.type || '').toUpperCase()}</span>
        </span>
        <span class="due-soon-due">${dateStr} (${dueLabel})</span>
      </li>
    `;
  }).join('');
  wrap.innerHTML = `
    <div class="due-soon-card">
      <div class="due-soon-head">
        <strong>Due soon</strong>
        <button class="due-soon-close" title="Dismiss">×</button>
      </div>
      <ul class="due-soon-list">
        ${listHtml}
      </ul>
      <div class="due-soon-actions">
        <button data-action="snooze" data-value="14400000">Snooze 4h</button>
        <button data-action="snooze-day">Snooze day</button>
      </div>
    </div>
  `;
  wrap.addEventListener('click', (ev) => {
    const close = ev.target?.closest?.('.due-soon-close');
    if (close) {
      markShownToday();
      wrap.remove();
      done?.();
      return;
    }
    const btn = ev.target?.closest?.('[data-action]');
    if (!btn) return;
    const act = btn.getAttribute('data-action');
    const val = btn.getAttribute('data-value');
    if (act === 'snooze') {
      const ms = parseInt(val || '0', 10) || (4 * 60 * 60 * 1000);
      snooze(ms);
      wrap.remove();
      done?.();
    }
    if (act === 'snooze-day') {
      snooze(24 * 60 * 60 * 1000);
      wrap.remove();
      done?.();
    }
  });
  document.body.appendChild(wrap);
}

async function maybeShowDueSoon(done) {
  if (isSnoozed()) { done?.(); return; }
  const items = await fetchItems(['task', 'goal', 'milestone', 'project', 'appointment']);
  const dueSoon = filterDueSoon(items);
  if (!dueSoon.length) { done?.(); return; }
  injectStyles();
  buildPopup(dueSoon, {}, done);
}

function initDueSoonPopup() {
  if (typeof document === 'undefined') return;
  const runner = (done)=> setTimeout(()=>maybeShowDueSoon(done), 1800);
  if (window.ChronosPopupQueue?.enqueue) window.ChronosPopupQueue.enqueue(runner);
  else runner(()=>{});
}

initDueSoonPopup();

export {};
