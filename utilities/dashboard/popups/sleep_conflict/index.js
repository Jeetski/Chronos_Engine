function injectStyles() {
  if (document.getElementById('sleep-conflict-popup-style')) return;
  const style = document.createElement('style');
  style.id = 'sleep-conflict-popup-style';
  style.textContent = `
    .sleep-conflict-overlay {
      position: fixed;
      inset: 0;
      z-index: 65000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background: var(--chronos-overlay-gradient, rgba(8, 11, 18, 0.82));
      backdrop-filter: var(--chronos-overlay-blur, blur(5px));
    }
    .sleep-conflict-card {
      width: min(620px, 96vw);
      border-radius: 18px;
      border: 1px solid color-mix(in srgb, var(--chronos-accent, #7aa2f7) 18%, rgba(255,255,255,0.12));
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--chronos-accent, #7aa2f7) 18%, transparent), transparent 34%),
        linear-gradient(160deg, var(--chronos-surface, rgba(14, 19, 31, 0.98)), var(--chronos-surface-soft, rgba(11, 15, 24, 0.98)));
      box-shadow: var(--chronos-shadow, 0 28px 70px rgba(0,0,0,0.5));
      color: var(--chronos-text, #e3ebff);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .sleep-conflict-kicker {
      margin: 0;
      font-size: 12px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--chronos-text-muted, #9fb2d4);
      font-weight: 800;
    }
    .sleep-conflict-title {
      margin: 0;
      font-size: clamp(24px, 3vw, 34px);
      line-height: 1.08;
      font-weight: 800;
    }
    .sleep-conflict-copy {
      margin: 0;
      color: var(--chronos-text-muted, #afc1de);
      font-size: 14px;
      line-height: 1.5;
    }
    .sleep-conflict-block {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      background: var(--chronos-surface-soft, rgba(255,255,255,0.04));
      padding: 12px;
      display: grid;
      gap: 5px;
    }
    .sleep-conflict-block strong {
      color: var(--chronos-text, #f1f6ff);
    }
    .sleep-conflict-actions {
      display: grid;
      gap: 10px;
    }
    .sleep-conflict-btn {
      width: 100%;
      text-align: left;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.12);
      background: color-mix(in srgb, var(--chronos-surface-soft, rgba(255,255,255,0.05)) 94%, transparent);
      color: var(--chronos-text, #e3ebff);
      padding: 12px 14px;
      cursor: pointer;
      font: inherit;
      display: grid;
      gap: 3px;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .sleep-conflict-btn:hover,
    .sleep-conflict-btn:focus-visible {
      outline: none;
      transform: translateY(-1px);
      border-color: color-mix(in srgb, var(--chronos-accent, #7aa2f7) 40%, rgba(255,255,255,0.18));
      background: color-mix(in srgb, var(--chronos-accent-soft, rgba(122,162,247,0.12)) 72%, var(--chronos-surface-soft, rgba(255,255,255,0.05)));
    }
    .sleep-conflict-label {
      font-weight: 700;
      font-size: 14px;
    }
    .sleep-conflict-note {
      font-size: 12px;
      color: var(--chronos-text-muted, #9fb2d4);
    }
  `;
  document.head.appendChild(style);
}

function buttonMeta(policy) {
  switch (policy) {
    case 'woke_early':
      return { label: 'Woke Up Early', note: 'End the current sleep block now and rebuild from this moment.' };
    case 'stay_awake':
      return { label: 'Stay Awake', note: 'Start the day now and treat the rest of sleep as intentionally canceled.' };
    case 'go_back_to_sleep':
      return { label: 'Go Back To Sleep', note: 'Cancel this action and leave the schedule alone.' };
    case 'shift_later':
      return { label: 'Shift Today Later', note: 'Continue now, but treat this as a late-start day.' };
    case 'ignore_today':
      return { label: 'Ignore For Today', note: 'Bypass this sleep block for today only without changing defaults.' };
    case 'edit_sleep':
      return { label: 'Edit Sleep Schedule', note: 'Open Sleep Settings instead of running the command.' };
    default:
      return { label: String(policy || 'Continue'), note: '' };
  }
}

function buildPopup(interrupt, resolve) {
  injectStyles();
  try {
    document.querySelectorAll('.sleep-conflict-overlay').forEach((node) => node.remove());
  } catch { }
  const overlay = document.createElement('div');
  overlay.className = 'sleep-conflict-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Sleep conflict');

  const sleepBlock = interrupt?.sleep_block || {};
  const options = Array.isArray(interrupt?.options) && interrupt.options.length
    ? interrupt.options
    : ['woke_early', 'stay_awake', 'go_back_to_sleep', 'shift_later', 'ignore_today', 'edit_sleep'];

  const buttons = options.map((policy) => {
    const meta = buttonMeta(policy);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sleep-conflict-btn';
    btn.dataset.policy = policy;
    btn.innerHTML = `
      <span class="sleep-conflict-label">${meta.label}</span>
      <span class="sleep-conflict-note">${meta.note}</span>
    `;
    return btn;
  });

  const card = document.createElement('div');
  card.className = 'sleep-conflict-card';
  card.innerHTML = `
    <p class="sleep-conflict-kicker">Sleep Conflict</p>
    <h2 class="sleep-conflict-title">You're inside a scheduled sleep block.</h2>
    <p class="sleep-conflict-copy">${interrupt?.message || 'What is happening?'}</p>
    <div class="sleep-conflict-block">
      <div><strong>Sleep block:</strong> ${sleepBlock?.name || 'Sleep'}</div>
      <div><strong>Window:</strong> ${sleepBlock?.start_time || '??:??'}-${sleepBlock?.end_time || '??:??'}</div>
      <div><strong>Template:</strong> ${sleepBlock?.template_name || 'Unknown template'}</div>
    </div>
  `;

  const actions = document.createElement('div');
  actions.className = 'sleep-conflict-actions';
  buttons.forEach((btn) => actions.appendChild(btn));
  card.appendChild(actions);
  overlay.appendChild(card);

  const close = (policy) => {
    try { document.removeEventListener('keydown', onKeyDown, true); } catch { }
    try { document.body?.removeAttribute('data-sleep-conflict-active'); } catch { }
    try { overlay.remove(); } catch { }
    resolve(policy);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  document.addEventListener('keydown', onKeyDown, true);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  actions.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-policy]');
    if (!button) return;
    close(button.dataset.policy || '');
  });

  try { document.body?.setAttribute('data-sleep-conflict-active', 'true'); } catch { }
  document.body.appendChild(overlay);
  buttons[0]?.focus?.();
}

export function showSleepConflictPopup(interrupt = {}) {
  return new Promise((resolve) => {
    buildPopup(interrupt, (policy) => {
      resolve(policy);
    });
  });
}

try { window.ChronosShowSleepConflictPopup = showSleepConflictPopup; } catch { }
