export function mount(el, context) {
  // Load CSS
  if (!document.getElementById('timer-css')) {
    const link = document.createElement('link');
    link.id = 'timer-css';
    link.rel = 'stylesheet';
    link.href = new URL('./timer.css', import.meta.url).toString();
    link.addEventListener('load', () => {
      try { window.requestAnimationFrame(() => window.requestAnimationFrame(() => ensureTimerFitsContent())); } catch { }
    });
    document.head.appendChild(link);
  }

  el.className = 'widget timer-widget';
  try {
    el.dataset.autoheight = 'off';
    el.dataset.minWidth = '420';
    el.dataset.minHeight = '380';
  } catch { }

  const tpl = `
  <div class="header" id="twHeader">
      <div class="title">Timer</div>
      <div class="controls">
        <button class="icon-btn" id="twMin" title="Minimize">_</button>
        <button class="icon-btn" id="twClose" title="Close">x</button>
      </div>
    </div>
    <div class="content timer-content">
      <div id="twPanel" class="timer-panel">
        <div class="row timer-meta-row">
          <div id="twPhase" class="hint timer-phase">Phase: -</div>
          <div id="twCycle" class="hint">Cycle: 0</div>
          <div id="twStatus" class="hint">Status: idle</div>
        </div>
        <div class="timer-ring-wrap" aria-hidden="true">
          <svg class="timer-ring" viewBox="0 0 120 120" role="presentation">
            <circle class="timer-ring-bg" cx="60" cy="60" r="52"></circle>
            <circle class="timer-ring-progress" id="twRingProgress" cx="60" cy="60" r="52"></circle>
          </svg>
          <div class="timer-ring-center">
            <div class="timer-clock" id="twClock">00:00</div>
            <div class="timer-progress-label" id="twProgressLabel">0% elapsed</div>
          </div>
        </div>
        <div id="twBlockMeta" class="hint"></div>
        <div id="twQueueMeta" class="hint"></div>
      </div>
      <div id="twBanner" style="display:block; border:1px solid rgba(122,162,247,0.4); background:linear-gradient(135deg, rgba(42,92,255,0.15) 0%, rgba(42,92,255,0.08) 100%); border-radius:12px; padding:12px; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);">
        <div id="twBannerText" style="font-weight:600; margin-bottom:8px;">Completed the current block?</div>
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <button class="btn btn-primary" id="twBannerYes">Yes</button>
          <button class="btn" id="twBannerSkipToday">Skip Today</button>
          <button class="btn" id="twBannerSkip">Later</button>
          <button class="btn btn-secondary" id="twBannerRestart">Start Over</button>
          <button class="btn" id="twBannerStretch">Stretch</button>
        </div>
      </div>
      <div class="row" style="gap:8px; align-items:center;">
        <select id="twProfile" class="input" style="max-width:200px;"></select>
        <input id="twCycles" class="input" type="number" min="1" placeholder="cycles" style="max-width:90px;" />
        <label class="hint" style="display:flex; gap:6px; align-items:center;">
          <input id="twAuto" type="checkbox" checked /> Auto-advance
        </label>
      </div>
      <div class="row" style="gap:8px;">
        <input id="twBindType" class="input" placeholder="bind type (optional)" style="max-width:160px;" />
        <input id="twBindName" class="input" placeholder="bind name (optional)" />
      </div>
      <div class="row" style="gap:8px; align-items:center;">
        <button class="btn btn-primary" id="twStart">Start</button>
        <button class="btn" id="twStartDay">Start Day</button>
        <button class="btn" id="twPause">Pause</button>
        <button class="btn btn-secondary" id="twCancel">Cancel</button>
        <div class="spacer"></div>
        <button class="btn" id="twRefresh">Refresh</button>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const MIN_TIMER_WIDTH = 420;
  const MIN_TIMER_HEIGHT = 380;

  const btnMin = el.querySelector('#twMin');
  const btnClose = el.querySelector('#twClose');
  const profSel = el.querySelector('#twProfile');
  const cyclesEl = el.querySelector('#twCycles');
  const autoEl = el.querySelector('#twAuto');
  const bindTypeEl = el.querySelector('#twBindType');
  const bindNameEl = el.querySelector('#twBindName');
  const startBtn = el.querySelector('#twStart');
  const startDayBtn = el.querySelector('#twStartDay');
  const pauseBtn = el.querySelector('#twPause');
  const cancelBtn = el.querySelector('#twCancel');
  const refreshBtn = el.querySelector('#twRefresh');
  const phaseEl = el.querySelector('#twPhase');
  const cycleEl = el.querySelector('#twCycle');
  const statusEl = el.querySelector('#twStatus');
  const clockEl = el.querySelector('#twClock');
  const ringEl = el.querySelector('#twRingProgress');
  const progressLabelEl = el.querySelector('#twProgressLabel');
  const banner = el.querySelector('#twBanner');
  const bannerText = el.querySelector('#twBannerText');
  const bannerYes = el.querySelector('#twBannerYes');
  const bannerSkipToday = el.querySelector('#twBannerSkipToday');
  const bannerSkip = el.querySelector('#twBannerSkip');
  const bannerRestart = el.querySelector('#twBannerRestart');
  const bannerStretch = el.querySelector('#twBannerStretch');
  const blockMetaEl = el.querySelector('#twBlockMeta');
  const queueMetaEl = el.querySelector('#twQueueMeta');

  let profiles = {};
  let pendingConfirmation = null;
  let lastTimerStatus = 'idle';
  let lastPendingConfirmVisible = null;
  let lastBlockSeconds = 0;

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  function ensureTimerFitsContent() {
    try {
      if (!el || el.style.display === 'none' || el.classList.contains('minimized')) return;
      const headerEl = el.querySelector('#twHeader');
      const contentEl = el.querySelector('.content');
      const headerH = Math.ceil(headerEl?.offsetHeight || 40);
      const contentH = Math.ceil(contentEl?.scrollHeight || 0);
      const currentH = Math.ceil(el.offsetHeight || 0);
      const neededH = Math.max(MIN_TIMER_HEIGHT, headerH + contentH + 2);
      if (Math.abs(neededH - currentH) > 1) el.style.height = `${neededH}px`;
      const currentW = Math.ceil(el.offsetWidth || 0);
      if (currentW < MIN_TIMER_WIDTH) el.style.width = `${MIN_TIMER_WIDTH}px`;
    } catch { }
  }
  function queueEnsureTimerFits() {
    try {
      requestAnimationFrame(() => requestAnimationFrame(() => ensureTimerFitsContent()));
    } catch {
      ensureTimerFitsContent();
    }
  }

  function two(n) { return String(n).padStart(2, '0'); }
  function fmt(sec) {
    const num = Number(sec);
    const safe = Number.isFinite(num) ? Math.max(0, Math.floor(num)) : 0;
    const m = Math.floor(safe / 60), s = safe % 60;
    return `${two(m)}:${two(s)}`;
  }
  const RING_RADIUS = 52;
  const RING_CIRC = 2 * Math.PI * RING_RADIUS;
  if (ringEl) {
    ringEl.style.strokeDasharray = `${RING_CIRC}`;
    ringEl.style.strokeDashoffset = `${RING_CIRC}`;
  }
  function setRingProgress(pct) {
    const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
    if (ringEl) {
      const offset = RING_CIRC * (1 - (clamped / 100));
      ringEl.style.strokeDashoffset = `${offset}`;
    }
    if (progressLabelEl) {
      progressLabelEl.textContent = `${Math.round(clamped)}% elapsed`;
    }
  }

  function applyProfileSelection() {
    try {
      const saved = (localStorage.getItem('twProfile') || '');
      if (saved) {
        const opt = Array.from(profSel.options).find(o => o.value === saved);
        if (opt) {
          profSel.value = saved;
          return;
        }
      }
    } catch { }
    if (profSel.options.length) profSel.value = profSel.options[0].value;
  }

  async function loadProfiles() {
    try {
      const selectedBefore = profSel.value || '';
      const r = await fetch(apiBase() + '/api/timer/profiles?_=' + Date.now(), { cache: 'no-store' }); const d = await r.json();
      profiles = d.profiles || {};
      profSel.innerHTML = '';
      const names = Object.keys(profiles);
      names.forEach(n => { const opt = document.createElement('option'); opt.value = n; opt.textContent = n; profSel.appendChild(opt); });
      if (selectedBefore) {
        const opt = Array.from(profSel.options).find(o => o.value === selectedBefore);
        if (opt) profSel.value = selectedBefore;
      }
      if (!profSel.value) applyProfileSelection();
    } catch { }
  }

  async function loadSettings() {
    try {
      const r = await fetch(apiBase() + '/api/timer/settings'); const d = await r.json();
      const s = d.settings || {};
      const defProf = s.default_profile || '';
      const saved = (localStorage.getItem('twProfile') || '');
      if (defProf && !saved) {
        const opt = Array.from(profSel.options).find(o => o.value === defProf);
        if (opt) profSel.value = defProf;
      } else if (saved) {
        const opt = Array.from(profSel.options).find(o => o.value === saved);
        if (opt) profSel.value = saved;
      } else if (profSel.options.length) {
        profSel.value = profSel.options[0].value;
      }
      if (typeof s.auto_advance === 'boolean') autoEl.checked = !!s.auto_advance;
      if (s.bind_default_type && !bindTypeEl.value) bindTypeEl.value = s.bind_default_type;
    } catch { }
  }

  async function reloadProfilesAndRefresh() {
    const current = profSel.value || '';
    await loadProfiles();
    if (current && !profSel.value) {
      const opt = Array.from(profSel.options).find(o => o.value === current);
      if (opt) profSel.value = current;
    }
    if (!profSel.value) await loadSettings();
    if (String(lastTimerStatus || 'idle').toLowerCase() === 'idle') resetDisplayForSelected();
  }

  async function status() {
    try {
      const r = await fetch(apiBase() + '/api/timer/status'); const d = await r.json();
      if (!d || d.ok === false) { return; }
      const st = d.status || {};
      statusEl.textContent = `Status: ${st.status || 'idle'}`;
      phaseEl.textContent = `Phase: ${st.current_phase || '-'}`;
      cycleEl.textContent = `Cycle: ${st.cycle_index || 0}`;
      clockEl.textContent = fmt(st.remaining_seconds || 0);
      const block = st.current_block;
      if (block && blockMetaEl) {
        blockMetaEl.textContent = `Block: ${block.name || 'Block'} (${block.minutes || '?'}m)`;
        blockMetaEl.style.display = '';
        const minutes = Number(block.minutes || 0);
        lastBlockSeconds = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes * 60) : 0;
      } else if (blockMetaEl) {
        blockMetaEl.textContent = '';
        blockMetaEl.style.display = 'none';
        lastBlockSeconds = 0;
      }
      if (queueMetaEl) {
        const sched = st.schedule_state || {};
        const plan = sched.plan || {};
        const total = Number(sched.total_blocks ?? (plan.blocks ? plan.blocks.length : 0));
        const idx = Number(sched.current_index ?? 0);
        if (total > 0) {
          queueMetaEl.textContent = `Schedule: block ${Math.min(total, idx + 1)} of ${total}`;
          queueMetaEl.style.display = '';
        } else {
          queueMetaEl.textContent = '';
          queueMetaEl.style.display = 'none';
        }
      }
      // Progress basis: schedule mode must use current block duration.
      const prof = st.profile || {};
      const mode = String(st.mode || '').toLowerCase();
      let total = 1;
      if (mode === 'schedule' && block && Number(block.minutes) > 0) {
        total = Math.max(1, Math.floor(Number(block.minutes) * 60));
      } else if (st.current_phase === 'focus') {
        total = (prof.focus_minutes || 25) * 60;
      } else if (st.current_phase === 'short_break') {
        total = (prof.short_break_minutes || 5) * 60;
      } else if (st.current_phase === 'long_break') {
        total = (prof.long_break_minutes || 15) * 60;
      }
      const rem = parseInt(st.remaining_seconds || 0, 10); const pct = Math.max(0, Math.min(100, ((total - rem) / total) * 100));
      setRingProgress(Number.isFinite(pct) ? pct : 0);
      if (String(st.status || '').toLowerCase() === 'idle') {
        // show default focus length for current profile
        resetDisplayForSelected();
      }
      updateButtons(st.status);
      pendingConfirmation = st.pending_confirmation || null;
      if (banner && bannerText) {
        const currentBlock = st.current_block || null;
        const hasPending = !!(pendingConfirmation && pendingConfirmation.block);
        const waitingForAnchor = !!st.waiting_for_anchor_start;
        const hasActionTarget = !!currentBlock && !waitingForAnchor;
        if (hasPending) {
          const blk = pendingConfirmation.block;
          bannerText.textContent = `Finished "${blk.name || 'this block'}"?`;
        } else if (waitingForAnchor && currentBlock) {
          const startAt = currentBlock.start ? ` at ${currentBlock.start}` : '';
          bannerText.textContent = `Waiting for anchor "${currentBlock.name || 'block'}"${startAt}`;
        } else if (hasActionTarget) {
          bannerText.textContent = `Block "${currentBlock.name || 'current block'}" actions`;
        } else {
          bannerText.textContent = 'No active schedule block right now.';
        }
        banner.style.display = (hasPending || hasActionTarget || (waitingForAnchor && currentBlock)) ? '' : 'none';
        if (bannerYes) bannerYes.disabled = !hasActionTarget;
        if (bannerSkipToday) bannerSkipToday.disabled = !hasActionTarget;
        if (bannerSkip) bannerSkip.disabled = !hasActionTarget;
        if (bannerRestart) bannerRestart.disabled = !hasActionTarget;
        if (bannerStretch) bannerStretch.disabled = !hasActionTarget;
        if (lastPendingConfirmVisible === null || lastPendingConfirmVisible !== hasPending) {
          queueEnsureTimerFits();
          lastPendingConfirmVisible = hasPending;
        }
      }
      lastTimerStatus = String(st.status || 'idle').toLowerCase();
    } catch { }
  }

  async function start() {
    const payload = {
      profile: profSel.value,
      cycles: (cyclesEl.value ? parseInt(cyclesEl.value, 10) : undefined),
      auto_advance: !!autoEl.checked,
      bind_type: (bindTypeEl.value || undefined),
      bind_name: (bindNameEl.value || undefined)
    };
    try {
      const r = await fetch(apiBase() + '/api/timer/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) { alert('Timer start failed'); }
      await status();
    } catch (e) { alert('Timer start failed'); }
  }

  async function stop() {
    try {
      const r = await fetch(apiBase() + '/api/timer/stop', { method: 'POST' });
      if (!r.ok) { alert('Stop failed'); }
      await status();
    } catch (e) { alert('Stop failed'); }
  }

  btnMin.addEventListener('click', () => el.classList.toggle('minimized'));
  btnClose.addEventListener('click', () => { el.style.display = 'none'; });
  startBtn.addEventListener('click', async () => {
    const s = String(lastTimerStatus || 'idle').toLowerCase();
    if (s === 'running' || s === 'paused') await stop();
    else await start();
  });
  startDayBtn?.addEventListener('click', () => startDayRun());
  pauseBtn.addEventListener('click', async () => {
    const s = String(lastTimerStatus || 'idle').toLowerCase();
    if (s === 'paused') {
      const r = await fetch(apiBase() + '/api/timer/resume', { method: 'POST' });
      if (!r.ok) alert('Resume failed');
    } else {
      const r = await fetch(apiBase() + '/api/timer/pause', { method: 'POST' });
      if (!r.ok) alert('Pause failed');
    }
    await status();
  });
  cancelBtn.addEventListener('click', async () => { const r = await fetch(apiBase() + '/api/timer/cancel', { method: 'POST' }); if (!r.ok) alert('Cancel failed'); await status(); resetDisplayForSelected(); });
  refreshBtn.addEventListener('click', async () => { await reloadProfilesAndRefresh(); await status(); });
  profSel.addEventListener('change', () => { try { localStorage.setItem('twProfile', profSel.value); } catch { } });
  bannerYes?.addEventListener('click', () => confirmBlock('yes'));
  bannerSkipToday?.addEventListener('click', () => confirmBlock('skip'));
  bannerSkip?.addEventListener('click', () => confirmBlock('skip'));
  bannerRestart?.addEventListener('click', () => confirmBlock('start_over'));
  bannerStretch?.addEventListener('click', () => confirmBlock('stretch'));

  function updateButtons(stStatus) {
    const s = String(stStatus || 'idle').toLowerCase();
    const running = s === 'running';
    const paused = s === 'paused';
    lastTimerStatus = s;
    startBtn.textContent = (running || paused) ? 'Stop' : 'Start';
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    pauseBtn.disabled = !(running || paused);
    cancelBtn.disabled = !(running || paused);
  }

  async function startDayRun() {
    if (!startDayBtn || startDayBtn.disabled) return;
    const prev = startDayBtn.textContent;
    startDayBtn.disabled = true;
    startDayBtn.textContent = 'Starting...';
    try {
      if (typeof window.ChronosStartDay === 'function') {
        await window.ChronosStartDay({ source: 'timer-widget', target: 'day' });
      } else {
        const resp = await fetch(apiBase() + '/api/day/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'day' }) });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.ok === false) {
          throw new Error(data.error || data.stderr || `HTTP ${resp.status}`);
        }
      }
      status();
    } catch (err) {
      console.error('[Chronos][Timer] Start day failed', err);
      alert(`Failed to start day: ${err?.message || err}`);
    } finally {
      startDayBtn.textContent = prev;
      startDayBtn.disabled = false;
    }
  }

  function resetDisplayForSelected() {
    const p = profiles[profSel.value] || {};
    const sec = (p.focus_minutes ? Number(p.focus_minutes) : 25) * 60;
    clockEl.textContent = fmt(sec);
    phaseEl.textContent = 'Phase: -';
    statusEl.textContent = 'Status: idle';
    cycleEl.textContent = 'Cycle: 0';
    setRingProgress(0);
  }

  async function confirmBlock(action) {
    if (action === 'start_over') {
      setRingProgress(0);
      if (lastBlockSeconds > 0) clockEl.textContent = fmt(lastBlockSeconds);
    }
    try {
      await fetch(apiBase() + '/api/timer/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      pendingConfirmation = null;
      await status();
    } catch (err) {
      console.error('[Chronos][Timer] confirm failed', err);
      alert('Failed to send confirmation.');
    }
  }

  function showWidget() {
    el.style.display = '';
    queueEnsureTimerFits();
    try { window.ChronosFocusWidget?.(el); } catch { }
  }

  context?.bus?.on?.('timer:show', async () => { showWidget(); await reloadProfilesAndRefresh(); await status(); });
  context?.bus?.on?.('timer:refresh', () => status());

  try { window.addEventListener('resize', queueEnsureTimerFits); } catch { }

  // Bootstrap
  loadProfiles().then(loadSettings).then(() => { status(); queueEnsureTimerFits(); });
  // Poll
  try { clearInterval(window.__twPoll); } catch { }
  window.__twPoll = setInterval(status, 1000);

  // Resizers
  function edgeDrag(startRect, cb) { return (ev) => { ev.preventDefault(); function move(e) { cb(e, startRect); } function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); } window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); } }
  const re = el.querySelector('.resizer.e'); const rs = el.querySelector('.resizer.s'); const rse = el.querySelector('.resizer.se');
  if (re) re.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(MIN_TIMER_WIDTH, e.clientX - sr.left) + 'px'; })(ev); });
  if (rs) rs.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.height = Math.max(MIN_TIMER_HEIGHT, e.clientY - sr.top) + 'px'; })(ev); });
  if (rse) rse.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(MIN_TIMER_WIDTH, e.clientX - sr.left) + 'px'; el.style.height = Math.max(MIN_TIMER_HEIGHT, e.clientY - sr.top) + 'px'; })(ev); });
}

