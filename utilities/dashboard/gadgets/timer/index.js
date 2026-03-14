const STYLE_ID = 'chronos-dock-gadget-timer-style';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .dock-timer {
      position: relative;
      min-width: 118px;
      height: 40px;
      padding: 0 8px;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--border) 68%, rgba(255, 255, 255, 0.32));
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.07));
      overflow: visible;
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      gap: 6px;
      cursor: pointer;
      transition: border-color 120ms ease, box-shadow 160ms ease, transform 120ms ease;
    }
    .dock-timer:hover {
      border-color: var(--chronos-accent-strong, var(--accent));
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.32);
      transform: translateY(-1px);
    }
    .dock-timer:active {
      transform: translateY(0);
    }
    .dock-timer-ring-wrap {
      position: relative;
      width: 30px;
      height: 30px;
      flex: 0 0 auto;
    }
    .dock-timer-ring {
      width: 30px;
      height: 30px;
      transform: rotate(-90deg);
      display: block;
    }
    .dock-timer-ring-bg {
      fill: none;
      stroke: rgba(255, 255, 255, 0.18);
      stroke-width: 3;
    }
    .dock-timer-ring-progress {
      fill: none;
      stroke: var(--chronos-accent, var(--accent));
      stroke-width: 3;
      stroke-linecap: round;
      transition: stroke-dashoffset 260ms ease;
    }
    .dock-timer-center {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      color: var(--text);
      text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);
      pointer-events: none;
    }
    .dock-timer-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .01em;
      color: var(--text);
      text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);
      white-space: nowrap;
      min-width: 0;
    }
    .dock-timer-menu {
      position: absolute;
      left: 50%;
      bottom: calc(100% + 10px);
      transform: translateX(-50%) translateY(8px);
      min-width: 220px;
      padding: 10px;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--border) 72%, rgba(255, 255, 255, 0.3));
      background: linear-gradient(180deg, rgba(18, 24, 36, 0.94), rgba(11, 16, 26, 0.92));
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.44);
      backdrop-filter: blur(14px) saturate(140%);
      -webkit-backdrop-filter: blur(14px) saturate(140%);
      display: flex;
      flex-direction: column;
      gap: 8px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 140ms ease, transform 180ms ease;
      z-index: 2;
    }
    .dock-timer.menu-docked .dock-timer-menu {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
      pointer-events: auto;
    }
    .dock-timer-meta {
      font-size: 11px;
      color: var(--text-dim);
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dock-timer-btn {
      border: 1px solid color-mix(in srgb, var(--border) 70%, rgba(255, 255, 255, 0.26));
      border-radius: 10px;
      height: 30px;
      padding: 0 10px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      font-size: 12px;
      font-family: var(--font-stack-base, system-ui);
      text-align: left;
      cursor: pointer;
    }
    .dock-timer-btn:hover {
      border-color: var(--chronos-accent-strong, var(--accent));
      background: rgba(122, 162, 247, 0.16);
    }
    .dock-timer-btn:disabled {
      opacity: .5;
      cursor: not-allowed;
    }
    .dock-timer-confirm {
      display: none;
      border: 1px solid rgba(122, 162, 247, 0.42);
      border-radius: 10px;
      padding: 8px;
      background: linear-gradient(135deg, rgba(42,92,255,0.2), rgba(42,92,255,0.08));
      gap: 6px;
      flex-direction: column;
    }
    .dock-timer-confirm.active {
      display: flex;
    }
    .dock-timer-confirm-text {
      font-size: 12px;
      color: var(--text);
      line-height: 1.35;
    }
    .dock-timer-confirm-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .dock-timer-confirm-btn {
      border: 1px solid color-mix(in srgb, var(--border) 68%, rgba(255, 255, 255, 0.3));
      border-radius: 8px;
      height: 28px;
      padding: 0 8px;
      background: rgba(255, 255, 255, 0.1);
      color: var(--text);
      font-size: 11px;
      cursor: pointer;
      text-align: left;
    }
    .dock-timer-confirm-btn:hover {
      border-color: var(--chronos-accent-strong, var(--accent));
      background: rgba(122, 162, 247, 0.2);
    }
    .dock-timer-confirm-btn:disabled {
      opacity: .5;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(style);
}

function fallbackApiBase() {
  const o = window.location.origin;
  if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
  return o;
}

function fmtTimer(sec) {
  const n = Number(sec);
  const safe = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function mount(el, context = {}) {
  ensureStyles();
  const apiBase = typeof context.apiBase === 'function' ? context.apiBase : fallbackApiBase;
  const showToast = typeof context.showToast === 'function'
    ? context.showToast
    : (msg) => { try { console.log('[DockTimer]', msg); } catch { } };
  const bus = context.bus || window.ChronosBus;

  el.innerHTML = `
    <div class="dock-timer" data-dock-pin="timer" tabindex="0" aria-label="Timer dock">
      <div class="dock-timer-ring-wrap" aria-hidden="true">
        <svg class="dock-timer-ring" viewBox="0 0 36 36" role="presentation">
          <circle class="dock-timer-ring-bg" cx="18" cy="18" r="14"></circle>
          <circle class="dock-timer-ring-progress" cx="18" cy="18" r="14" data-dock-timer-ring-progress></circle>
        </svg>
        <div class="dock-timer-center" data-dock-timer-ring-center>0%</div>
      </div>
      <div class="dock-timer-label" data-dock-timer-label>--:--</div>
      <div class="dock-timer-menu" data-dock-timer-menu>
        <div class="dock-timer-meta" data-dock-timer-block>Active block: none</div>
        <button class="dock-timer-btn" type="button" data-dock-timer-startstop>Start</button>
        <button class="dock-timer-btn" type="button" data-dock-timer-pauseresume>Pause</button>
        <button class="dock-timer-btn" type="button" data-dock-timer-skip-today disabled>Skip Today</button>
        <div class="dock-timer-confirm" data-dock-timer-confirm>
          <div class="dock-timer-confirm-text" data-dock-timer-confirm-text>Finished this block?</div>
          <div class="dock-timer-confirm-row">
            <button class="dock-timer-confirm-btn" type="button" data-dock-timer-confirm-yes>Yes</button>
            <button class="dock-timer-confirm-btn" type="button" data-dock-timer-confirm-skip>Later</button>
            <button class="dock-timer-confirm-btn" type="button" data-dock-timer-confirm-restart>Start Over</button>
            <button class="dock-timer-confirm-btn" type="button" data-dock-timer-confirm-stretch>Stretch</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const timerPin = el.querySelector('[data-dock-pin="timer"]');
  const timerRingProgressEl = el.querySelector('[data-dock-timer-ring-progress]');
  const timerRingCenterEl = el.querySelector('[data-dock-timer-ring-center]');
  const timerLabelEl = el.querySelector('[data-dock-timer-label]');
  const timerBlockEl = el.querySelector('[data-dock-timer-block]');
  const timerStartStopBtn = el.querySelector('[data-dock-timer-startstop]');
  const timerPauseResumeBtn = el.querySelector('[data-dock-timer-pauseresume]');
  const timerSkipTodayBtn = el.querySelector('[data-dock-timer-skip-today]');
  const timerConfirmWrap = el.querySelector('[data-dock-timer-confirm]');
  const timerConfirmText = el.querySelector('[data-dock-timer-confirm-text]');
  const confirmYesBtn = el.querySelector('[data-dock-timer-confirm-yes]');
  const confirmSkipBtn = el.querySelector('[data-dock-timer-confirm-skip]');
  const confirmRestartBtn = el.querySelector('[data-dock-timer-confirm-restart]');
  const confirmStretchBtn = el.querySelector('[data-dock-timer-confirm-stretch]');

  const DOCK_RING_RADIUS = 14;
  const DOCK_RING_CIRC = 2 * Math.PI * DOCK_RING_RADIUS;
  if (timerRingProgressEl) {
    timerRingProgressEl.style.strokeDasharray = `${DOCK_RING_CIRC}`;
    timerRingProgressEl.style.strokeDashoffset = `${DOCK_RING_CIRC}`;
  }

  let dockTimerStatus = { status: 'idle' };
  let defaultTimerProfile = '';
  let pollId = null;
  let clickTimer = null;
  let menuDocked = false;
  let refreshRequest = null;

  const setMenuDocked = (next) => {
    menuDocked = !!next;
    if (!timerPin) return;
    timerPin.classList.toggle('menu-docked', menuDocked);
  };

  const updateDockTimerUi = (st = {}) => {
    const status = String(st?.status || 'idle').toLowerCase();
    const waitingForAnchor = !!st?.waiting_for_anchor_start;
    const running = status === 'running';
    const paused = status === 'paused';
    const remaining = Number(st?.remaining_seconds || 0);
    let totalSeconds = 1;
    const profile = st?.profile || {};
    const phase = String(st?.current_phase || '').toLowerCase();
    const mode = String(st?.mode || '').toLowerCase();
    const activeBlock = st?.current_block;
    if (mode === 'schedule' && Number(activeBlock?.minutes) > 0) totalSeconds = Number(activeBlock.minutes) * 60;
    else if (phase === 'focus') totalSeconds = Number(profile?.focus_minutes || 25) * 60;
    else if (phase === 'short_break') totalSeconds = Number(profile?.short_break_minutes || 5) * 60;
    else if (phase === 'long_break') totalSeconds = Number(profile?.long_break_minutes || 15) * 60;
    totalSeconds = Math.max(1, Math.floor(totalSeconds));
    const pct = status === 'idle' ? 0 : Math.max(0, Math.min(100, ((totalSeconds - remaining) / totalSeconds) * 100));

    if (timerRingProgressEl) {
      const offset = DOCK_RING_CIRC * (1 - (pct / 100));
      timerRingProgressEl.style.strokeDashoffset = `${offset}`;
    }
    if (timerRingCenterEl) timerRingCenterEl.textContent = `${Math.round(pct)}%`;
    if (timerLabelEl) timerLabelEl.textContent = status === 'idle' ? '--:--' : fmtTimer(remaining);
    if (timerBlockEl) {
      const blk = st?.current_block;
      const name = String(blk?.name || '').trim();
      const mins = Number(blk?.minutes || 0);
      if (name) {
        const anchorSuffix = waitingForAnchor ? ` (upcoming${blk?.start ? ` ${blk.start}` : ''})` : '';
        timerBlockEl.textContent = `Active block: ${name}${mins > 0 ? ` (${mins}m)` : ''}${anchorSuffix}`;
      }
      else timerBlockEl.textContent = 'Active block: none';
    }
    if (timerSkipTodayBtn) timerSkipTodayBtn.disabled = !st?.current_block || waitingForAnchor;
    const pending = st?.pending_confirmation || null;
    const hasPending = !!(pending && pending.block);
    if (timerConfirmWrap && timerConfirmText) {
      timerConfirmWrap.classList.toggle('active', hasPending);
      if (hasPending) {
        const bname = String(pending.block?.name || 'this block');
        timerConfirmText.textContent = `Finished "${bname}"?`;
        setMenuDocked(true);
        try { window.ChronosDockReveal?.(); } catch { }
        try { window.ChronosDockSetDocked?.(true); } catch { }
      }
    }
    if (timerStartStopBtn) {
      timerStartStopBtn.textContent = (running || paused) ? 'Stop' : 'Start';
      timerStartStopBtn.disabled = false;
    }
    if (timerPauseResumeBtn) {
      timerPauseResumeBtn.textContent = paused ? 'Resume' : 'Pause';
      timerPauseResumeBtn.disabled = status === 'idle';
    }
  };

  const fetchTimerDefaultProfile = async () => {
    try {
      const [settingsResp, profilesResp] = await Promise.all([
        fetch(apiBase() + '/api/timer/settings').then((r) => r.json()).catch(() => ({})),
        fetch(apiBase() + '/api/timer/profiles').then((r) => r.json()).catch(() => ({})),
      ]);
      const settings = settingsResp?.settings || {};
      const profiles = settingsResp?.profiles || profilesResp?.profiles || {};
      const names = Object.keys(profiles || {});
      const preferred = String(settings?.default_profile || '').trim();
      if (preferred && names.includes(preferred)) defaultTimerProfile = preferred;
      else defaultTimerProfile = names[0] || '';
    } catch {
      defaultTimerProfile = '';
    }
  };

  const refreshDockTimerStatus = async () => {
    if (refreshRequest) return refreshRequest;
    refreshRequest = (async () => {
      try {
        const resp = await fetch(apiBase() + '/api/timer/status');
        const payload = await resp.json().catch(() => ({}));
        dockTimerStatus = payload?.status || {};
        updateDockTimerUi(dockTimerStatus);
      } catch {
        dockTimerStatus = { status: 'idle' };
        updateDockTimerUi(dockTimerStatus);
      }
    })();
    try {
      return await refreshRequest;
    } finally {
      refreshRequest = null;
    }
  };

  const runDockTimerAction = async (path, body = null) => {
    const opts = { method: 'POST' };
    if (body) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const resp = await fetch(apiBase() + path, opts);
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || payload?.ok === false) {
      throw new Error(payload?.stderr || payload?.error || 'timer action failed');
    }
    return payload;
  };

  const onStartStop = async () => {
    const status = String(dockTimerStatus?.status || 'idle').toLowerCase();
    const shouldStop = status === 'running' || status === 'paused';
    if (timerStartStopBtn) timerStartStopBtn.disabled = true;
    if (timerPauseResumeBtn) timerPauseResumeBtn.disabled = true;
    try {
      if (shouldStop) {
        await runDockTimerAction('/api/timer/stop');
        showToast('Timer stopped.', 'success');
      } else {
        if (!defaultTimerProfile) await fetchTimerDefaultProfile();
        if (!defaultTimerProfile) throw new Error('No timer profile found');
        await runDockTimerAction('/api/timer/start', { profile: defaultTimerProfile });
        showToast(`Timer started (${defaultTimerProfile}).`, 'success');
      }
      try { bus?.emit?.('timer:refresh'); } catch { }
      await refreshDockTimerStatus();
    } catch (err) {
      showToast(`Timer action failed: ${String(err?.message || err)}`, 'error');
    } finally {
      updateDockTimerUi(dockTimerStatus);
    }
  };

  const onPauseResume = async () => {
    const status = String(dockTimerStatus?.status || 'idle').toLowerCase();
    if (status === 'idle') return;
    const shouldResume = status === 'paused';
    if (timerPauseResumeBtn) timerPauseResumeBtn.disabled = true;
    try {
      await runDockTimerAction(shouldResume ? '/api/timer/resume' : '/api/timer/pause');
      showToast(shouldResume ? 'Timer resumed.' : 'Timer paused.', 'success');
      try { bus?.emit?.('timer:refresh'); } catch { }
      await refreshDockTimerStatus();
    } catch (err) {
      showToast(`Timer action failed: ${String(err?.message || err)}`, 'error');
    } finally {
      updateDockTimerUi(dockTimerStatus);
    }
  };

  const onPinClick = (ev) => {
    const t = ev?.target;
    if (t && (
      t.closest?.('[data-dock-timer-startstop]') ||
      t.closest?.('[data-dock-timer-pauseresume]') ||
      t.closest?.('[data-dock-timer-skip-today]') ||
      t.closest?.('[data-dock-timer-confirm-yes]') ||
      t.closest?.('[data-dock-timer-confirm-skip]') ||
      t.closest?.('[data-dock-timer-confirm-restart]') ||
      t.closest?.('[data-dock-timer-confirm-stretch]')
    )) return;
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      setMenuDocked(!menuDocked);
      clickTimer = null;
    }, 220);
  };

  const onPinDoubleClick = (ev) => {
    const t = ev?.target;
    if (t && (
      t.closest?.('[data-dock-timer-startstop]') ||
      t.closest?.('[data-dock-timer-pauseresume]') ||
      t.closest?.('[data-dock-timer-skip-today]') ||
      t.closest?.('[data-dock-timer-confirm-yes]') ||
      t.closest?.('[data-dock-timer-confirm-skip]') ||
      t.closest?.('[data-dock-timer-confirm-restart]') ||
      t.closest?.('[data-dock-timer-confirm-stretch]')
    )) return;
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    setMenuDocked(false);
    try { bus?.emit?.('timer:show', { source: 'dock' }); } catch { }
  };

  const onDocumentPointerDown = (ev) => {
    if (!menuDocked) return;
    const t = ev?.target;
    if (timerPin && t && timerPin.contains(t)) return;
    setMenuDocked(false);
  };

  const onConfirm = async (action) => {
    if (action === 'start_over') {
      if (timerRingProgressEl) timerRingProgressEl.style.strokeDashoffset = `${DOCK_RING_CIRC}`;
      if (timerRingCenterEl) timerRingCenterEl.textContent = '0%';
      const mins = Number(dockTimerStatus?.current_block?.minutes || 0);
      if (timerLabelEl && mins > 0) timerLabelEl.textContent = fmtTimer(Math.floor(mins * 60));
    }
    try {
      const resp = await fetch(apiBase() + '/api/timer/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok || payload?.ok === false) {
        throw new Error(payload?.stderr || payload?.error || 'confirm failed');
      }
      showToast('Timer check-in saved.', 'success');
      try { bus?.emit?.('timer:refresh'); } catch { }
      await refreshDockTimerStatus();
    } catch (err) {
      showToast(`Timer check-in failed: ${String(err?.message || err)}`, 'error');
    }
  };

  const onConfirmYes = () => onConfirm('yes');
  const onConfirmSkip = () => onConfirm('skip');
  const onConfirmRestart = () => onConfirm('start_over');
  const onConfirmStretch = () => onConfirm('stretch');

  timerStartStopBtn?.addEventListener('click', onStartStop);
  timerPauseResumeBtn?.addEventListener('click', onPauseResume);
  timerSkipTodayBtn?.addEventListener('click', onConfirmSkip);
  confirmYesBtn?.addEventListener('click', onConfirmYes);
  confirmSkipBtn?.addEventListener('click', onConfirmSkip);
  confirmRestartBtn?.addEventListener('click', onConfirmRestart);
  confirmStretchBtn?.addEventListener('click', onConfirmStretch);
  timerPin?.addEventListener('click', onPinClick);
  timerPin?.addEventListener('dblclick', onPinDoubleClick);
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  void fetchTimerDefaultProfile();
  void refreshDockTimerStatus();
  pollId = window.setInterval(() => { void refreshDockTimerStatus(); }, 1000);

  return {
    destroy() {
      try { if (pollId) clearInterval(pollId); } catch { }
      try { if (clickTimer) clearTimeout(clickTimer); } catch { }
      try { timerStartStopBtn?.removeEventListener('click', onStartStop); } catch { }
      try { timerPauseResumeBtn?.removeEventListener('click', onPauseResume); } catch { }
      try { timerSkipTodayBtn?.removeEventListener('click', onConfirmSkip); } catch { }
      try { confirmYesBtn?.removeEventListener('click', onConfirmYes); } catch { }
      try { confirmSkipBtn?.removeEventListener('click', onConfirmSkip); } catch { }
      try { confirmRestartBtn?.removeEventListener('click', onConfirmRestart); } catch { }
      try { confirmStretchBtn?.removeEventListener('click', onConfirmStretch); } catch { }
      try { timerPin?.removeEventListener('click', onPinClick); } catch { }
      try { timerPin?.removeEventListener('dblclick', onPinDoubleClick); } catch { }
      try { document.removeEventListener('pointerdown', onDocumentPointerDown, true); } catch { }
    },
  };
}
