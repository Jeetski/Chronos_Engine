import { markdownToHtml } from '../../core/markdown.js';

const WHAT_IS_CHRONOS_STEPS = [
  { title: 'What Is Chronos?', path: 'guides/what_is_chronos/01_what_chronos_is.md' },
  { title: 'Why Chronos Exists', path: 'guides/what_is_chronos/02_why_chronos_exists.md' },
  { title: 'How Chronos Is Structured', path: 'guides/what_is_chronos/03_hierarchy.md' },
  { title: 'What It Looks Like In Real Life', path: 'guides/what_is_chronos/04_structure_in_practice.md' },
  { title: 'Why It Matters', path: 'guides/what_is_chronos/05_why_it_matters.md' },
  { title: 'How To Begin', path: 'guides/what_is_chronos/06_how_to_begin.md' },
];

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
      background: color-mix(in srgb, var(--chronos-bg, #0b0f16) 72%, transparent);
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
      border: 1px solid var(--chronos-border, rgba(255, 255, 255, 0.14));
      background:
        linear-gradient(
          145deg,
          color-mix(in srgb, var(--chronos-surface, rgba(11, 16, 26, 0.97)) 92%, transparent),
          color-mix(in srgb, var(--chronos-surface-soft, rgba(18, 26, 42, 0.95)) 96%, transparent)
        );
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.48);
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
      color: var(--chronos-accent-strong, #8ec5ff);
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
    .alpha-guide-card {
      width: min(1040px, 96vw);
      height: min(760px, 92vh);
      max-height: 92vh;
      border-radius: 24px;
      border: 1px solid var(--chronos-border, rgba(255, 255, 255, 0.14));
      background:
        linear-gradient(
          145deg,
          color-mix(in srgb, var(--chronos-surface, rgba(11, 16, 26, 0.98)) 92%, transparent),
          color-mix(in srgb, var(--chronos-surface-soft, rgba(18, 26, 42, 0.96)) 96%, transparent)
        );
      box-shadow: 0 26px 72px rgba(0, 0, 0, 0.48);
      color: var(--chronos-text, #e2ecff);
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      overflow: hidden;
    }
    .alpha-guide-rail {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
      padding: 24px 20px;
      border-right: 1px solid var(--chronos-border, rgba(255, 255, 255, 0.08));
      background:
        radial-gradient(circle at top, color-mix(in srgb, var(--chronos-accent, #7aa2f7) 16%, transparent), transparent 34%),
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--chronos-surface-soft, rgba(255, 255, 255, 0.05)) 88%, transparent),
          color-mix(in srgb, var(--chronos-surface, rgba(255, 255, 255, 0.02)) 82%, transparent)
        );
    }
    .alpha-guide-kicker {
      margin: 0;
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--chronos-text-muted, #b4c2dd);
      font-weight: 800;
    }
    .alpha-guide-title {
      margin: 0;
      font-size: 26px;
      line-height: 1.1;
      font-weight: 800;
    }
    .alpha-guide-subtitle {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      color: var(--chronos-text-muted, #b4c2dd);
    }
    .alpha-guide-progress {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 4px;
    }
    .alpha-guide-progress-bar {
      position: relative;
      height: 8px;
      border-radius: 999px;
      overflow: hidden;
      background: color-mix(in srgb, var(--chronos-surface-soft, rgba(255, 255, 255, 0.08)) 92%, transparent);
    }
    .alpha-guide-progress-fill {
      position: absolute;
      inset: 0 auto 0 0;
      width: 0%;
      border-radius: inherit;
      background: var(--chronos-accent-gradient, linear-gradient(135deg, #7aa2f7, #4de2b6));
    }
    .alpha-guide-progress-text {
      font-size: 12px;
      color: var(--chronos-text-muted, #b4c2dd);
      font-weight: 700;
    }
    .alpha-guide-steps {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 0;
      overflow: auto;
      padding-right: 2px;
    }
    .alpha-guide-step {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 10px 12px;
      background: color-mix(in srgb, var(--chronos-surface-soft, rgba(255, 255, 255, 0.03)) 92%, transparent);
      color: inherit;
      cursor: pointer;
      text-align: left;
    }
    .alpha-guide-step:hover { background: color-mix(in srgb, var(--chronos-surface-soft, rgba(255, 255, 255, 0.06)) 98%, transparent); }
    .alpha-guide-step.is-active {
      border-color: color-mix(in srgb, var(--chronos-accent, #7aa2f7) 46%, var(--chronos-border, rgba(255,255,255,0.14)));
      background: color-mix(in srgb, var(--chronos-accent-soft, rgba(122, 162, 247, 0.12)) 92%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--chronos-accent, #7aa2f7) 16%, transparent);
    }
    .alpha-guide-step-num {
      flex: 0 0 auto;
      width: 26px;
      height: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: color-mix(in srgb, var(--chronos-surface-soft, rgba(255, 255, 255, 0.08)) 92%, transparent);
      color: var(--chronos-text, #f5f9ff);
      font-size: 12px;
      font-weight: 800;
    }
    .alpha-guide-step.is-active .alpha-guide-step-num {
      background: var(--chronos-accent-gradient, linear-gradient(135deg, #7aa2f7, #4de2b6));
      color: var(--chronos-bg, #091019);
    }
    .alpha-guide-step-label {
      font-size: 13px;
      line-height: 1.35;
      font-weight: 700;
      color: var(--chronos-text, #edf4ff);
    }
    .alpha-guide-main {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    .alpha-guide-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 22px 24px 0 24px;
    }
    .alpha-guide-header-copy {
      min-width: 0;
    }
    .alpha-guide-header-copy h3 {
      margin: 0;
      font-size: 30px;
      line-height: 1.1;
      font-weight: 800;
    }
    .alpha-guide-header-copy p {
      margin: 6px 0 0 0;
      color: var(--chronos-text-muted, #b4c2dd);
      font-size: 13px;
    }
    .alpha-guide-body {
      min-height: 0;
      overflow-x: hidden;
      overflow-y: scroll;
      scrollbar-gutter: stable;
      padding: 18px 24px 12px 24px;
      font-size: 15px;
      line-height: 1.65;
      color: var(--chronos-text, #dfe8f9);
      background: color-mix(in srgb, var(--chronos-surface, transparent) 22%, transparent);
    }
    .alpha-guide-body h1,
    .alpha-guide-body h2,
    .alpha-guide-body h3,
    .alpha-guide-body h4,
    .alpha-guide-body h5,
    .alpha-guide-body h6 {
      margin: 0 0 12px 0;
      line-height: 1.2;
      color: var(--chronos-text, #f4f8ff);
    }
    .alpha-guide-body p,
    .alpha-guide-body ul,
    .alpha-guide-body ol,
    .alpha-guide-body blockquote,
    .alpha-guide-body pre,
    .alpha-guide-body hr {
      margin: 0 0 14px 0;
    }
    .alpha-guide-body ul,
    .alpha-guide-body ol {
      padding-left: 22px;
    }
    .alpha-guide-body li + li {
      margin-top: 6px;
    }
    .alpha-guide-body img {
      display: block;
      max-width: min(100%, 760px);
      width: auto;
      height: auto;
      margin: 18px auto;
      border-radius: 18px;
      border: 1px solid var(--chronos-border, rgba(255, 255, 255, 0.1));
      box-shadow: 0 22px 48px rgba(0, 0, 0, 0.28);
      background: color-mix(in srgb, var(--chronos-surface-soft, rgba(255, 255, 255, 0.03)) 92%, transparent);
    }
    .alpha-guide-main[data-guide-step-key="03_hierarchy"] .alpha-guide-body img {
      max-width: min(100%, 460px);
      max-height: 320px;
    }
    .alpha-guide-body code {
      padding: 1px 5px;
      border-radius: 6px;
      background: color-mix(in srgb, var(--chronos-surface-soft, rgba(255, 255, 255, 0.08)) 95%, transparent);
      font-family: Consolas, "Courier New", monospace;
      font-size: 13px;
    }
    .alpha-guide-body pre {
      overflow: auto;
      padding: 12px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--chronos-bg, #0b0f16) 84%, transparent);
      border: 1px solid var(--chronos-border, rgba(255, 255, 255, 0.08));
    }
    .alpha-guide-body pre code {
      padding: 0;
      background: transparent;
    }
    .alpha-guide-body blockquote {
      padding-left: 14px;
      border-left: 3px solid color-mix(in srgb, var(--chronos-accent-strong, #8ec5ff) 45%, transparent);
      color: var(--chronos-text-muted, #b4c2dd);
    }
    .alpha-guide-body a {
      color: var(--chronos-accent-strong, #8ec5ff);
    }
    .alpha-guide-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 24px 22px 24px;
    }
    .alpha-guide-footer-left,
    .alpha-guide-footer-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .alpha-guide-status {
      font-size: 12px;
      color: var(--chronos-text-muted, #b4c2dd);
      min-height: 18px;
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
      border: 1px solid var(--chronos-border, rgba(255, 255, 255, 0.18));
      background: color-mix(in srgb, var(--chronos-surface-soft, rgba(255, 255, 255, 0.06)) 92%, transparent);
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
      overflow: auto;
      border-radius: 10px;
      border: 1px solid var(--chronos-border, rgba(255, 255, 255, 0.14));
      background: color-mix(in srgb, var(--chronos-surface-soft, rgba(255, 255, 255, 0.04)) 92%, transparent);
      color: var(--chronos-text, #e2ecff);
      font-size: 13px;
      line-height: 1.5;
      padding: 10px;
      white-space: normal;
    }
    .alpha-launch-changelog:focus {
      outline: 1px solid color-mix(in srgb, var(--chronos-accent-strong, #8ec5ff) 65%, transparent);
      outline-offset: 0;
    }
    .alpha-launch-changelog p,
    .alpha-launch-changelog ul,
    .alpha-launch-changelog ol,
    .alpha-launch-changelog blockquote,
    .alpha-launch-changelog pre,
    .alpha-launch-changelog hr,
    .alpha-launch-changelog h1,
    .alpha-launch-changelog h2,
    .alpha-launch-changelog h3,
    .alpha-launch-changelog h4,
    .alpha-launch-changelog h5,
    .alpha-launch-changelog h6 {
      margin: 0 0 10px 0;
    }
    .alpha-launch-changelog ul,
    .alpha-launch-changelog ol {
      padding-left: 20px;
    }
    .alpha-launch-changelog li + li {
      margin-top: 4px;
    }
    .alpha-launch-changelog code {
      padding: 1px 5px;
      border-radius: 6px;
      background: color-mix(in srgb, var(--chronos-surface-soft, rgba(255, 255, 255, 0.08)) 95%, transparent);
      font-family: Consolas, "Courier New", monospace;
      font-size: 12px;
    }
    .alpha-launch-changelog pre {
      overflow: auto;
      padding: 10px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--chronos-bg, #0b0f16) 84%, transparent);
      border: 1px solid var(--chronos-border, rgba(255, 255, 255, 0.08));
    }
    .alpha-launch-changelog pre code {
      padding: 0;
      background: transparent;
      border-radius: 0;
    }
    .alpha-launch-changelog blockquote {
      padding-left: 12px;
      border-left: 3px solid color-mix(in srgb, var(--chronos-accent-strong, #8ec5ff) 45%, transparent);
      color: var(--chronos-text-muted, #b4c2dd);
    }
    .alpha-launch-changelog a {
      color: var(--chronos-accent-strong, #8ec5ff);
    }
    .alpha-launch-changelog hr {
      border: none;
      height: 1px;
      background: var(--chronos-border, rgba(255, 255, 255, 0.12));
    }
    .alpha-launch-btn {
      border: 1px solid var(--chronos-border, rgba(255, 255, 255, 0.18));
      background: color-mix(in srgb, var(--chronos-surface-soft, rgba(255, 255, 255, 0.06)) 92%, transparent);
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
      background: color-mix(in srgb, var(--chronos-surface-soft, rgba(255, 255, 255, 0.04)) 92%, transparent);
    }
    .alpha-launch-btn.primary {
      background: var(--chronos-accent-gradient, linear-gradient(135deg, #7aa2f7, #4de2b6));
      color: var(--chronos-bg, #0b0f16);
      border-color: color-mix(in srgb, var(--chronos-accent, #7aa2f7) 48%, var(--chronos-border, rgba(255,255,255,0.22)));
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
      .alpha-guide-card {
        grid-template-columns: 1fr;
        height: min(820px, 94vh);
        max-height: 94vh;
      }
      .alpha-guide-rail {
        border-right: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        max-height: 34vh;
      }
      .alpha-guide-header,
      .alpha-guide-footer {
        padding-left: 18px;
        padding-right: 18px;
      }
      .alpha-guide-body {
        padding-left: 18px;
        padding-right: 18px;
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

function openDocPath(path) {
  try {
    if (typeof window.ChronosOpenDoc === 'function') {
      window.ChronosOpenDoc(path);
    } else if (typeof window.ChronosOpenView === 'function') {
      window.__chronosDocsOpenRequest = { path };
      window.ChronosOpenView('Docs', 'Docs');
    }
  } catch { }
}

function buildWhatIsChronosGuide(overlay, done, cleanup) {
  overlay.innerHTML = `
    <div class="alpha-guide-card" role="dialog" aria-modal="true" aria-label="What is Chronos guide">
      <aside class="alpha-guide-rail">
        <p class="alpha-guide-kicker">Guide</p>
        <h2 class="alpha-guide-title">What is Chronos?</h2>
        <p class="alpha-guide-subtitle">A short walkthrough of the Chronos idea, structure, and philosophy for brand new users.</p>
        <div class="alpha-guide-progress">
          <div class="alpha-guide-progress-bar"><div class="alpha-guide-progress-fill" data-guide-progress-fill></div></div>
          <div class="alpha-guide-progress-text" data-guide-progress-text>Step 1 of ${WHAT_IS_CHRONOS_STEPS.length}</div>
        </div>
        <div class="alpha-guide-steps" data-guide-steps></div>
      </aside>
      <section class="alpha-guide-main">
        <div class="alpha-guide-header">
          <div class="alpha-guide-header-copy">
            <h3 data-guide-title>What is Chronos?</h3>
            <p>Take it one step at a time.</p>
          </div>
          <button type="button" class="alpha-launch-btn secondary" data-guide-action="close">Close</button>
        </div>
        <div class="alpha-guide-body" data-guide-body>Loading guide...</div>
        <div class="alpha-guide-footer">
          <div class="alpha-guide-footer-left">
            <button type="button" class="alpha-launch-btn secondary" data-guide-action="back">Back</button>
            <button type="button" class="alpha-launch-btn secondary" data-guide-action="next">Next</button>
          </div>
          <div class="alpha-guide-footer-right">
            <div class="alpha-guide-status" data-guide-status></div>
            <button type="button" class="alpha-launch-btn secondary" data-guide-action="open-docs">Open Full Guide</button>
            <button type="button" class="alpha-launch-btn primary" data-guide-action="setup">Set Up Chronos Engine</button>
          </div>
        </div>
      </section>
    </div>
  `;

  const state = {
    index: 0,
    cache: new Map(),
  };

  const stepsEl = overlay.querySelector('[data-guide-steps]');
  const titleEl = overlay.querySelector('[data-guide-title]');
  const bodyEl = overlay.querySelector('[data-guide-body]');
  const statusEl = overlay.querySelector('[data-guide-status]');
  const progressTextEl = overlay.querySelector('[data-guide-progress-text]');
  const progressFillEl = overlay.querySelector('[data-guide-progress-fill]');
  const backBtn = overlay.querySelector('[data-guide-action="back"]');
  const nextBtn = overlay.querySelector('[data-guide-action="next"]');
  const setupBtn = overlay.querySelector('[data-guide-action="setup"]');
  const mainEl = overlay.querySelector('.alpha-guide-main');

  const stepButtons = WHAT_IS_CHRONOS_STEPS.map((step, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'alpha-guide-step';
    btn.innerHTML = `
      <span class="alpha-guide-step-num">${idx + 1}</span>
      <span class="alpha-guide-step-label">${step.title}</span>
    `;
    btn.addEventListener('click', () => {
      state.index = idx;
      void renderStep();
    });
    stepsEl.appendChild(btn);
    return btn;
  });

  async function loadStep(step) {
    if (state.cache.has(step.path)) return state.cache.get(step.path);
    const request = fetch(`${apiBase()}/api/docs/read?path=${encodeURIComponent(step.path)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data || data.ok === false) {
          throw new Error(data?.error || 'Could not load guide step.');
        }
        return String(data.content || '').trim();
      });
    state.cache.set(step.path, request);
    return request;
  }

  async function renderStep() {
    const step = WHAT_IS_CHRONOS_STEPS[state.index];
    titleEl.textContent = step.title;
    mainEl.dataset.guideStepKey = step.path.split('/').pop().replace(/\.md$/i, '');
    progressTextEl.textContent = `Step ${state.index + 1} of ${WHAT_IS_CHRONOS_STEPS.length}`;
    progressFillEl.style.width = `${((state.index + 1) / WHAT_IS_CHRONOS_STEPS.length) * 100}%`;
    backBtn.disabled = state.index === 0;
    nextBtn.textContent = state.index === WHAT_IS_CHRONOS_STEPS.length - 1 ? 'Finish' : 'Next';
    nextBtn.dataset.mode = state.index === WHAT_IS_CHRONOS_STEPS.length - 1 ? 'finish' : 'next';
    setupBtn.textContent = state.index === WHAT_IS_CHRONOS_STEPS.length - 1 ? 'Start Setup' : 'Set Up Chronos Engine';
    stepButtons.forEach((btn, idx) => btn.classList.toggle('is-active', idx === state.index));
    statusEl.textContent = '';
    bodyEl.innerHTML = '<p>Loading guide...</p>';
    try {
      const content = await loadStep(step);
      bodyEl.innerHTML = markdownToHtml(content);
      bodyEl.scrollTop = 0;
    } catch (error) {
      bodyEl.innerHTML = '<p>Could not load this guide step.</p>';
      statusEl.textContent = String(error?.message || error || 'Could not load this guide step.');
    }
  }

  overlay.addEventListener('click', (ev) => {
    const action = ev.target?.closest?.('[data-guide-action]')?.getAttribute('data-guide-action');
    if (!action) return;
    if (action === 'close') {
      closePopup(overlay, done, cleanup);
      return;
    }
    if (action === 'open-docs') {
      openDocPath('guides/what_is_chronos/index.md');
      closePopup(overlay, done, cleanup);
      return;
    }
    if (action === 'setup') {
      try {
        if (typeof window.ChronosLaunchWizard === 'function') {
          void window.ChronosLaunchWizard('Onboarding');
        }
      } catch { }
      closePopup(overlay, done, cleanup);
      return;
    }
    if (action === 'back') {
      if (state.index > 0) {
        state.index -= 1;
        void renderStep();
      }
      return;
    }
    if (action === 'next') {
      if (state.index < WHAT_IS_CHRONOS_STEPS.length - 1) {
        state.index += 1;
        void renderStep();
      } else {
        openDocPath('guides/what_is_chronos/index.md');
        closePopup(overlay, done, cleanup);
      }
    }
  });

  void renderStep();
}

function buildPopup(done) {
  const overlay = document.createElement('div');
  overlay.className = 'alpha-launch-overlay';
  const logoSrc = `${apiBase()}/assets/images/logo_no_background.png`;
  const hiveLogoSrc = `${apiBase()}/assets/images/hivemind_studio_icon.ico`;
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
          <div class="alpha-launch-changelog" tabindex="0">Loading changelog...</div>
        </div>
        <div class="alpha-launch-actions">
          <p class="alpha-launch-actions-label">Don't know where to start?</p>
          <div class="alpha-launch-actions-main">
            <button type="button" class="alpha-launch-btn secondary" data-action="what-is-chronos">1. What is Chronos?</button>
            <button type="button" class="alpha-launch-btn secondary" data-action="setup-chronos">2. Set Up Chronos Engine</button>
            <button type="button" class="alpha-launch-btn secondary" data-action="setup-nia">3. Set Up Nia AI</button>
            <button type="button" class="alpha-launch-btn secondary" data-action="tour" title="Coming soon">4. Guided Tour</button>
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
    const whatIsChronosBtn = ev.target?.closest?.('[data-action="what-is-chronos"]');
    if (whatIsChronosBtn) {
      buildWhatIsChronosGuide(overlay, done, cleanup);
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
          changelogEl.textContent = 'Could not load changelog.';
          return;
        }
        const content = String(data.content || '').trim();
        changelogEl.innerHTML = content ? markdownToHtml(content) : '<p>Changelog is empty.</p>';
      })
      .catch(() => {
        changelogEl.textContent = 'Could not load changelog.';
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
