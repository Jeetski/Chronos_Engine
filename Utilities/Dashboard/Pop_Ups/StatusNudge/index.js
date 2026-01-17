// Bump key to avoid stale snoozes; change when logic updates
const STORAGE_KEY = 'chronos_status_nudge_v2';
const STALE_HOURS_DEFAULT = 4;

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

async function fetchStatus() {
  try {
    const resp = await fetch(apiBase() + '/api/status/current');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false) return null;
    return data.status || {};
  } catch {
    return null;
  }
}

function hoursSince(ts) {
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return null;
  const diffMs = Date.now() - dt.getTime();
  return diffMs / (1000 * 60 * 60);
}

function injectStyles() {
  if (document.getElementById('status-nudge-style')) return;
  const style = document.createElement('style');
  style.id = 'status-nudge-style';
  style.textContent = `
    .status-nudge {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      max-width: 320px;
      color: var(--chronos-text, #cdd5f7);
    }
    .status-nudge-card {
      background: rgba(15,20,32,0.95);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.45);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .status-nudge-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .status-nudge-header strong {
      font-size: 15px;
    }
    .status-nudge-close {
      background: transparent;
      border: none;
      color: var(--chronos-text, #cdd5f7);
      font-size: 16px;
      cursor: pointer;
    }
    .status-nudge-text {
      margin: 0;
      font-size: 13px;
      color: var(--chronos-text-muted, #9aa6c0);
      line-height: 1.4;
    }
    .status-nudge-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .status-nudge-actions button {
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.05);
      color: var(--chronos-text, #cdd5f7);
      border-radius: 10px;
      padding: 7px 10px;
      font-weight: 600;
      cursor: pointer;
    }
    .status-nudge-actions button.primary {
      background: var(--chronos-accent-gradient, linear-gradient(135deg, #7aa2f7, #4de2b6));
      border-color: rgba(255,255,255,0.2);
      color: #0b0f16;
    }
    .status-nudge-actions button:hover {
      filter: brightness(1.05);
    }
  `;
  document.head.appendChild(style);
}

function buildPopup(actions, done) {
  const wrap = document.createElement('div');
  wrap.className = 'status-nudge';
  wrap.innerHTML = `
    <div class="status-nudge-card">
      <div class="status-nudge-header">
        <strong>Status check</strong>
        <button class="status-nudge-close" title="Dismiss">×</button>
      </div>
      <p class="status-nudge-text">It’s been a while since your last status update. Refresh now?</p>
      <div class="status-nudge-actions">
        <button data-action="preset" data-value="energy:high focus:good">High / Focus</button>
        <button data-action="preset" data-value="energy:medium focus:steady">Medium / Steady</button>
        <button data-action="preset" data-value="energy:low focus:calm">Low / Recovery</button>
        <button data-action="reschedule" class="primary">Reschedule</button>
        <button data-action="snooze" data-value="7200000">Snooze 2h</button>
      </div>
    </div>
  `;
  wrap.addEventListener('click', (ev) => {
    if (ev.target?.classList?.contains('status-nudge-close')) {
      wrap.remove();
      snooze(2 * 60 * 60 * 1000); // default snooze on dismiss
      done?.();
      return;
    }
    const btn = ev.target?.closest?.('[data-action]');
    if (!btn) return;
    const act = btn.getAttribute('data-action');
    const val = btn.getAttribute('data-value');
    if (act === 'preset' && val) actions.onPreset(val, wrap);
    if (act === 'reschedule') actions.onReschedule(wrap);
    if (act === 'snooze') {
      const ms = parseInt(val || '0', 10) || (2 * 60 * 60 * 1000);
      snooze(ms);
      wrap.remove();
      done?.();
    }
  });
  document.body.appendChild(wrap);
}

async function maybePrompt(done) {
  const data = await fetchStatus();
  if (!data) {
    // If no status data, still prompt once to encourage setup
    injectStyles();
    buildPopup({
      onPreset: async (preset, el) => {
        try {
          await fetch(apiBase() + '/api/cli', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'status', args: preset.split(' '), properties: {} })
          });
          snooze(2 * 60 * 60 * 1000);
          el.remove();
          done?.();
        } catch {
          el.remove();
          done?.();
        }
      },
      onReschedule: async (el) => {
        const btn = el.querySelector('[data-action="reschedule"]');
        if (btn) {
          btn.textContent = 'Rescheduling...';
          btn.disabled = true;
        }
        try {
          await fetch(apiBase() + '/api/cli', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'today', args: ['reschedule'], properties: {} })
          });
          snooze(2 * 60 * 60 * 1000);
          el.remove();
          done?.();
        } catch {
          el.remove();
          done?.();
        }
      }
    }, done);
    return;
  }
  const ts = data.updated_at || data.last_updated || data.timestamp;
  const hours = ts ? hoursSince(ts) : null;
  if (hours != null && hours < STALE_HOURS_DEFAULT) { done?.(); return; }
  injectStyles();
  buildPopup({
    onPreset: async (preset, el) => {
      try {
        await fetch(apiBase() + '/api/cli', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'status', args: preset.split(' '), properties: {} })
        });
        snooze(2 * 60 * 60 * 1000);
        el.remove();
        done?.();
      } catch {
        el.remove();
        done?.();
      }
    },
      onReschedule: async (el) => {
        const btn = el.querySelector('[data-action="reschedule"]');
        if (btn) {
          btn.textContent = 'Rescheduling...';
          btn.disabled = true;
        }
        try {
          await fetch(apiBase() + '/api/cli', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'today', args: ['reschedule'], properties: {} })
          });
        snooze(2 * 60 * 60 * 1000);
        el.remove();
        done?.();
      } catch {
        el.remove();
        done?.();
      }
    }
  }, done);
}

function initStatusNudge() {
  if (typeof document === 'undefined') return;
  const runner = (done)=> setTimeout(()=>maybePrompt(done), 3000);
  if (window.ChronosPopupQueue?.enqueue) window.ChronosPopupQueue.enqueue(runner);
  else runner(()=>{});
}

initStatusNudge();

export {};
