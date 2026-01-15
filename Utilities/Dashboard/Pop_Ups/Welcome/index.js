const STORAGE_KEY = 'chronos_welcome_popup_v1';

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

async function fetchWelcome() {
  try {
    const resp = await fetch(apiBase() + '/api/profile');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false) return null;
    const welcome = data.profile?.welcome || {};
    const lines = [welcome.line1, welcome.line2, welcome.line3].filter(Boolean);
    const nickname = data.profile?.nickname;
    return { lines, nickname };
  } catch {
    return null;
  }
}

function injectStyles() {
  if (document.getElementById('welcome-popup-style')) return;
  const style = document.createElement('style');
  style.id = 'welcome-popup-style';
  style.textContent = `
    .welcome-popup {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      max-width: 360px;
      color: var(--chronos-text, #cdd5f7);
      font-size: 14px;
    }
    .welcome-card {
      background: rgba(12,16,26,0.94);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      box-shadow: 0 14px 34px rgba(0,0,0,0.45);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .welcome-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .welcome-head strong {
      font-size: 15px;
    }
    .welcome-close {
      background: transparent;
      border: none;
      color: var(--chronos-text, #cdd5f7);
      font-size: 16px;
      cursor: pointer;
    }
    .welcome-body {
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      color: var(--chronos-text, #cdd5f7);
      line-height: 1.5;
    }
    .welcome-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .welcome-actions button {
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.05);
      color: var(--chronos-text, #cdd5f7);
      border-radius: 10px;
      padding: 7px 10px;
      font-weight: 600;
      cursor: pointer;
    }
    .welcome-actions button.primary {
      background: var(--chronos-accent-gradient, linear-gradient(135deg, #7aa2f7, #4de2b6));
      border-color: rgba(255,255,255,0.2);
      color: #0b0f16;
    }
    .welcome-actions button:hover {
      filter: brightness(1.05);
    }
  `;
  document.head.appendChild(style);
}

function buildPopup(payload, actions) {
  const wrap = document.createElement('div');
  wrap.className = 'welcome-popup';
  const exp = (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand : (s)=>s;
  const { lines = [], nickname } = payload || {};
  const titleRaw = nickname ? `Welcome, ${nickname}` : 'Welcome back';
  const title = exp(titleRaw);
  const body = (lines.length ? lines : ['Set your welcome message in User/Profile/profile.yml']).map(line => exp(String(line || '')));
  wrap.innerHTML = `
    <div class="welcome-card">
      <div class="welcome-head">
        <strong>${title}</strong>
        <button class="welcome-close" title="Dismiss">×</button>
      </div>
      <div class="welcome-body">
        ${body.map(line => `<span>${line}</span>`).join('')}
      </div>
      <div class="welcome-actions">
        <button data-action="open-profile" class="primary">Open Profile</button>
        <button data-action="dismiss">Dismiss</button>
      </div>
    </div>
  `;
  wrap.addEventListener('click', (ev) => {
    const close = ev.target?.closest?.('.welcome-close');
    if (close) {
      wrap.remove();
      actions.onDismiss?.();
      return;
    }
    const btn = ev.target?.closest?.('[data-action]');
    if (!btn) return;
    const act = btn.getAttribute('data-action');
    if (act === 'open-profile') actions.onOpenProfile(wrap);
    if (act === 'dismiss') {
      wrap.remove();
      actions.onDismiss?.();
    }
  });
  document.body.appendChild(wrap);
}

async function maybeShowWelcome(done) {
  const data = await fetchWelcome();
  if (!data || ((!data.lines || !data.lines.length) && !data.nickname)) { done?.(); return; }
  injectStyles();
  buildPopup(data, {
    onOpenProfile: async (el) => {
      try {
        await fetch(apiBase() + '/api/open-in-editor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'User/Profile/profile.yml' })
      });
    } catch {}
    el.remove();
    done?.();
  },
  onDismiss: () => {
    done?.();
  }
});
}

function initWelcomePopup() {
  if (typeof document === 'undefined') return;
  const runner = (done)=> setTimeout(()=>maybeShowWelcome(done), 1200);
  if (window.ChronosPopupQueue?.enqueue) window.ChronosPopupQueue.enqueue(runner);
  else runner(()=>{});
}

initWelcomePopup();

export {};
