function apiBase() {
  const o = window.location?.origin;
  if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
  return o;
}

function injectStyles() {
  if (document.getElementById('startup-popup-style')) return;
  const style = document.createElement('style');
  style.id = 'startup-popup-style';
  style.textContent = `
    .alpha-launch-overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(6, 9, 14, 0.72);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .alpha-launch-card {
      width: min(860px, 94vw);
      min-height: 320px;
      border-radius: 22px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: linear-gradient(145deg, rgba(11, 16, 26, 0.97), rgba(18, 26, 42, 0.95));
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
      color: var(--chronos-text, #e2ecff);
      display: grid;
      grid-template-columns: minmax(220px, 330px) 1fr;
      gap: 26px;
      align-items: center;
      padding: 28px;
    }
    .alpha-launch-logo {
      width: 100%;
      max-width: 300px;
      justify-self: center;
      display: block;
      filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.45));
    }
    .alpha-launch-copy {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: flex-start;
    }
    .alpha-launch-title {
      margin: 0;
      font-size: clamp(28px, 3vw, 42px);
      line-height: 1.1;
      letter-spacing: 0.3px;
      font-weight: 800;
    }
    .alpha-launch-subtitle {
      margin: 0;
      font-size: clamp(17px, 1.7vw, 21px);
      color: var(--chronos-text-muted, #b4c2dd);
      font-weight: 600;
    }
    .alpha-launch-link {
      margin-top: 2px;
      color: #8ec5ff;
      text-decoration: underline;
      font-weight: 700;
      font-size: 16px;
    }
    .alpha-launch-credit {
      margin-top: 6px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--chronos-text-muted, #b4c2dd);
      font-size: 12px;
      font-weight: 600;
    }
    .alpha-launch-credit-logo {
      width: 32px;
      height: 32px;
      object-fit: contain;
      display: block;
      opacity: 0.95;
      filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.35));
    }
    .alpha-launch-actions {
      margin-top: 14px;
      display: grid;
      gap: 10px;
      width: 100%;
    }
    .alpha-launch-actions-label {
      margin: 0 0 2px 0;
      font-size: 13px;
      font-weight: 700;
      color: var(--chronos-text-muted, #b4c2dd);
    }
    .alpha-launch-actions-main {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .alpha-launch-actions-enter {
      display: flex;
      justify-content: flex-end;
      width: 100%;
    }
    .alpha-launch-whatsnew {
      margin-top: 12px;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .alpha-launch-whatsnew-header {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .alpha-launch-whatsnew-label {
      margin: 0;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      color: var(--chronos-text-muted, #b4c2dd);
    }
    .alpha-launch-docs-btn {
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.06);
      color: var(--chronos-text, #e2ecff);
      border-radius: 8px;
      padding: 5px 9px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }
    .alpha-launch-docs-btn:hover {
      filter: brightness(1.08);
    }
    .alpha-launch-changelog {
      width: 100%;
      height: 200px;
      resize: none;
      overflow: auto;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.04);
      color: var(--chronos-text, #e2ecff);
      font-size: 12px;
      line-height: 1.4;
      padding: 10px;
      font-family: Consolas, "Courier New", monospace;
      white-space: pre;
    }
    .alpha-launch-changelog:focus {
      outline: 1px solid rgba(142, 197, 255, 0.65);
      outline-offset: 0;
    }
    .alpha-launch-btn {
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.06);
      color: var(--chronos-text, #e2ecff);
      border-radius: 11px;
      padding: 10px 14px;
      font-weight: 700;
      cursor: pointer;
    }
    .alpha-launch-btn:hover {
      filter: brightness(1.08);
    }
    .alpha-launch-btn.secondary {
      background: rgba(255, 255, 255, 0.04);
    }
    .alpha-launch-btn.primary {
      background: var(--chronos-accent-gradient, linear-gradient(135deg, #7aa2f7, #4de2b6));
      color: #0b0f16;
      border-color: rgba(255, 255, 255, 0.22);
    }
    @media (max-width: 720px) {
      .alpha-launch-card {
        grid-template-columns: 1fr;
        text-align: center;
      }
      .alpha-launch-copy {
        align-items: center;
      }
      .alpha-launch-actions {
        justify-content: center;
      }
      .alpha-launch-whatsnew {
        text-align: left;
      }
    }
  `;
  document.head.appendChild(style);
}

function closePopup(el, done, cleanup) {
  cleanup?.();
  el.remove();
  done?.();
}

function buildPopup(done) {
  const overlay = document.createElement('div');
  overlay.className = 'alpha-launch-overlay';
  const logoSrc = `${apiBase()}/assets/Logo_No_Background.png`;
  const hiveLogoSrc = `${apiBase()}/assets/Hivemind_Studio_Icon.ico`;
  overlay.innerHTML = `
    <div class="alpha-launch-card" role="dialog" aria-modal="true" aria-label="Chronos Engine Alpha">
      <img class="alpha-launch-logo" src="${logoSrc}" alt="Chronos Engine Logo" />
      <div class="alpha-launch-copy">
        <h2 class="alpha-launch-title">Chronos Engine</h2>
        <p class="alpha-launch-subtitle">Alpha v0.2</p>
        <a class="alpha-launch-link" href="https://chronosengine.online" target="_blank" rel="noopener noreferrer">chronosengine.online</a>
        <div class="alpha-launch-credit">
          <img class="alpha-launch-credit-logo" src="${hiveLogoSrc}" alt="Hivemind Studio Logo" />
          <span>Developed by Hivemind Studio</span>
        </div>
        <div class="alpha-launch-whatsnew">
          <div class="alpha-launch-whatsnew-header">
            <p class="alpha-launch-whatsnew-label">What's New</p>
            <button type="button" class="alpha-launch-docs-btn" data-action="open-docs">Open in Docs</button>
          </div>
          <textarea class="alpha-launch-changelog" readonly>Loading changelog...</textarea>
        </div>
        <div class="alpha-launch-actions">
          <p class="alpha-launch-actions-label">Don't know where to start?</p>
          <div class="alpha-launch-actions-main">
            <button type="button" class="alpha-launch-btn secondary" data-action="setup-chronos">Set Up Chronos Engine</button>
            <button type="button" class="alpha-launch-btn secondary" data-action="setup-nia">Set Up Nia AI</button>
            <button type="button" class="alpha-launch-btn secondary" data-action="tour" title="Coming soon">Tour</button>
          </div>
          <div class="alpha-launch-actions-enter">
            <button type="button" class="alpha-launch-btn primary" data-action="continue">Enter</button>
          </div>
        </div>
      </div>
    </div>
  `;

  let onEsc = null;
  const cleanup = () => {
    if (onEsc) document.removeEventListener('keydown', onEsc);
    onEsc = null;
  };

  overlay.addEventListener('click', (ev) => {
    const docsBtn = ev.target?.closest?.('[data-action="open-docs"]');
    if (docsBtn) {
      try {
        if (typeof window.ChronosOpenDoc === 'function') {
          window.ChronosOpenDoc('Changelog.md');
        } else if (typeof window.ChronosOpenView === 'function') {
          window.__chronosDocsOpenRequest = { path: 'Changelog.md' };
          window.ChronosOpenView('Docs', 'Docs');
        }
      } catch { }
      closePopup(overlay, done, cleanup);
      return;
    }
    const setupChronosBtn = ev.target?.closest?.('[data-action="setup-chronos"]');
    if (setupChronosBtn) {
      try {
        if (typeof window.ChronosLaunchWizard === 'function') {
          void window.ChronosLaunchWizard('Onboarding');
        }
      } catch { }
      closePopup(overlay, done, cleanup);
      return;
    }
    const setupNiaBtn = ev.target?.closest?.('[data-action="setup-nia"]');
    if (setupNiaBtn) {
      try {
        window.ChronosBus?.emit?.('widget:show', 'NiaAssistant');
        window.setTimeout(() => {
          try { window.ChronosBus?.emit?.('nia:open-settings'); } catch { }
        }, 60);
      } catch { }
      closePopup(overlay, done, cleanup);
      return;
    }
    const btn = ev.target?.closest?.('[data-action="continue"]');
    if (btn) closePopup(overlay, done, cleanup);
  });

  onEsc = (ev) => {
    if (ev.key === 'Escape') {
      closePopup(overlay, done, cleanup);
    }
  };
  document.addEventListener('keydown', onEsc);

  document.body.appendChild(overlay);

  const changelogEl = overlay.querySelector('.alpha-launch-changelog');
  if (changelogEl) {
    fetch(`${apiBase()}/api/docs/read?path=${encodeURIComponent('Changelog.md')}`)
      .then(r => r.json())
      .then(data => {
        if (!data || data.ok === false) {
          changelogEl.value = "Could not load changelog.";
          return;
        }
        changelogEl.value = String(data.content || "").trim() || "Changelog is empty.";
      })
      .catch(() => {
        changelogEl.value = "Could not load changelog.";
      });
  }
}

function initStartupPopup() {
  if (typeof document === 'undefined') return;
  const runner = (done) => setTimeout(() => {
    injectStyles();
    buildPopup(done);
  }, 250);
  if (window.ChronosPopupQueue?.enqueue) window.ChronosPopupQueue.enqueue(runner);
  else runner(() => {});
}

initStartupPopup();

export {};
