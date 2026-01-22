export function mount(el, context) {
  // Load CSS
  if (!document.getElementById('timer-css')) {
    const link = document.createElement('link');
    link.id = 'timer-css';
    link.rel = 'stylesheet';
    link.href = './Widgets/Timer/timer.css';
    document.head.appendChild(link);
  }

  el.className = 'widget timer-widget';

  const tpl = `
  <div class="header" id="twHeader">
      <div class="title">Timer</div>
      <div class="controls">
        <button class="icon-btn" id="twMin" title="Minimize">_</button>
        <button class="icon-btn" id="twClose" title="Close">x</button>
      </div>
    </div>
    <div class="content" style="gap:10px;">
      <div id="twBanner" style="display:none; border:1px solid rgba(122,162,247,0.4); background:linear-gradient(135deg, rgba(42,92,255,0.15) 0%, rgba(42,92,255,0.08) 100%); border-radius:12px; padding:12px; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);">
        <div id="twBannerText" style="font-weight:600; margin-bottom:8px;">Completed the current block?</div>
        <div class="row" style="gap:8px;">
          <button class="btn btn-primary" id="twBannerYes">Yes</button>
          <button class="btn btn-secondary" id="twBannerNo">No</button>
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
        <button class="btn" id="twResume">Resume</button>
        <button class="btn btn-secondary" id="twStop">Stop</button>
        <button class="btn btn-secondary" id="twCancel">Cancel</button>
        <div class="spacer"></div>
        <button class="btn" id="twRefresh">Refresh</button>
      </div>
      <div id="twPanel" style="padding:16px; border:1px solid rgba(255, 255, 255, 0.08); border-radius:12px; background:linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 100%); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); display:flex; flex-direction:column; gap:10px;">
        <div class="row" style="gap:10px; align-items:center;">
          <div id="twPhase" class="hint" style="font-weight:700; color:#a6adbb;">Phase: -</div>
          <div id="twCycle" class="hint">Cycle: 0</div>
          <div id="twStatus" class="hint">Status: idle</div>
        </div>
        <div style="font-size:32px; font-weight:800; letter-spacing:1px; text-shadow:0 2px 8px rgba(0,0,0,0.3);" id="twClock">00:00</div>
        <div style="height:12px; background:rgba(0,0,0,0.3); border:1px solid rgba(255, 255, 255, 0.06); border-radius:8px; overflow:hidden;">
          <div id="twBar" style="height:100%; width:0%; background:linear-gradient(90deg,#2a5cff,#7aa2f7); box-shadow:0 0 10px rgba(122,162,247,0.4);"></div>
        </div>
        <div id="twBlockMeta" class="hint"></div>
        <div id="twQueueMeta" class="hint"></div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

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
  const resumeBtn = el.querySelector('#twResume');
  const stopBtn = el.querySelector('#twStop');
  const cancelBtn = el.querySelector('#twCancel');
  const refreshBtn = el.querySelector('#twRefresh');
  const phaseEl = el.querySelector('#twPhase');
  const cycleEl = el.querySelector('#twCycle');
  const statusEl = el.querySelector('#twStatus');
  const clockEl = el.querySelector('#twClock');
  const barEl = el.querySelector('#twBar');
  const banner = el.querySelector('#twBanner');
  const bannerText = el.querySelector('#twBannerText');
  const bannerYes = el.querySelector('#twBannerYes');
  const bannerNo = el.querySelector('#twBannerNo');
  const blockMetaEl = el.querySelector('#twBlockMeta');
  const queueMetaEl = el.querySelector('#twQueueMeta');

  let profiles = {};
  let pendingConfirmation = null;

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

  function two(n) { return String(n).padStart(2, '0'); }
  function fmt(sec) {
    const num = Number(sec);
    const safe = Number.isFinite(num) ? Math.max(0, Math.floor(num)) : 0;
    const m = Math.floor(safe / 60), s = safe % 60;
    return `${two(m)}:${two(s)}`;
  }

  async function loadProfiles() {
    try {
      const r = await fetch(apiBase() + '/api/timer/profiles'); const d = await r.json();
      profiles = d.profiles || {};
      profSel.innerHTML = '';
      const names = Object.keys(profiles);
      names.forEach(n => { const opt = document.createElement('option'); opt.value = n; opt.textContent = n; profSel.appendChild(opt); });
      // Defer default selection to settings loader
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
      } else if (blockMetaEl) {
        blockMetaEl.textContent = '';
      }
      if (queueMetaEl) {
        const sched = st.schedule_state || {};
        const plan = sched.plan || {};
        const total = Number(sched.total_blocks ?? (plan.blocks ? plan.blocks.length : 0));
        const idx = Number(sched.current_index ?? 0);
        if (total > 0) {
          queueMetaEl.textContent = `Schedule: block ${Math.min(total, idx + 1)} of ${total}`;
        } else {
          queueMetaEl.textContent = '';
        }
      }
      // Progress within current phase based on profile
      const prof = st.profile || {};
      let total = 1;
      if (st.current_phase === 'focus') total = (prof.focus_minutes || 25) * 60;
      else if (st.current_phase === 'short_break') total = (prof.short_break_minutes || 5) * 60;
      else if (st.current_phase === 'long_break') total = (prof.long_break_minutes || 15) * 60;
      const rem = parseInt(st.remaining_seconds || 0, 10); const pct = Math.max(0, Math.min(100, ((total - rem) / total) * 100));
      barEl.style.width = `${Number.isFinite(pct) ? pct : 0}%`;
      if (String(st.status || '').toLowerCase() === 'idle') {
        // show default focus length for current profile
        resetDisplayForSelected();
      }
      updateButtons(st.status);
      pendingConfirmation = st.pending_confirmation || null;
      if (pendingConfirmation && pendingConfirmation.block && banner && bannerText) {
        const blk = pendingConfirmation.block;
        bannerText.textContent = `Finished "${blk.name || 'this block'}"?`;
        banner.style.display = '';
      } else if (banner) {
        banner.style.display = 'none';
      }
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

  btnMin.addEventListener('click', () => el.classList.toggle('minimized'));
  btnClose.addEventListener('click', () => { el.style.display = 'none'; });
  startBtn.addEventListener('click', start);
  startDayBtn?.addEventListener('click', () => startDayRun());
  pauseBtn.addEventListener('click', async () => { const r = await fetch(apiBase() + '/api/timer/pause', { method: 'POST' }); if (!r.ok) alert('Pause failed'); await status(); });
  resumeBtn.addEventListener('click', async () => { const r = await fetch(apiBase() + '/api/timer/resume', { method: 'POST' }); if (!r.ok) alert('Resume failed'); await status(); });
  stopBtn.addEventListener('click', async () => { const r = await fetch(apiBase() + '/api/timer/stop', { method: 'POST' }); if (!r.ok) alert('Stop failed'); await status(); });
  cancelBtn.addEventListener('click', async () => { const r = await fetch(apiBase() + '/api/timer/cancel', { method: 'POST' }); if (!r.ok) alert('Cancel failed'); await status(); resetDisplayForSelected(); });
  refreshBtn.addEventListener('click', status);
  profSel.addEventListener('change', () => { try { localStorage.setItem('twProfile', profSel.value); } catch { } });
  bannerYes?.addEventListener('click', () => confirmBlock(true));
  bannerNo?.addEventListener('click', () => confirmBlock(false));

  function updateButtons(stStatus) {
    const s = String(stStatus || 'idle').toLowerCase();
    const running = s === 'running';
    const paused = s === 'paused';
    pauseBtn.disabled = !running;
    resumeBtn.disabled = !paused;
    stopBtn.disabled = !(running || paused);
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
    barEl.style.width = '0%';
  }

  async function confirmBlock(completed) {
    if (!pendingConfirmation) return;
    try {
      await fetch(apiBase() + '/api/timer/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }) });
      pendingConfirmation = null;
      await status();
    } catch (err) {
      console.error('[Chronos][Timer] confirm failed', err);
      alert('Failed to send confirmation.');
    }
  }

  function showWidget() {
    el.style.display = '';
    try { window.ChronosFocusWidget?.(el); } catch { }
  }

  context?.bus?.on?.('timer:show', () => { showWidget(); status(); });
  context?.bus?.on?.('timer:refresh', () => status());

  // Bootstrap
  loadProfiles().then(loadSettings).then(() => status());
  // Poll
  try { clearInterval(window.__twPoll); } catch { }
  window.__twPoll = setInterval(status, 1000);
}
