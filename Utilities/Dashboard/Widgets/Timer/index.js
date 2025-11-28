export function mount(el){
  const tpl = `
    <div class="header" id="twHeader">
      <div class="title">Timer</div>
      <div class="controls">
        <button class="icon-btn" id="twMin" title="Minimize">_</button>
        <button class="icon-btn" id="twClose" title="Close">x</button>
      </div>
    </div>
    <div class="content" style="gap:10px;">
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
        <button class="btn" id="twPause">Pause</button>
        <button class="btn" id="twResume">Resume</button>
        <button class="btn btn-secondary" id="twStop">Stop</button>
        <button class="btn btn-secondary" id="twCancel">Cancel</button>
        <div class="spacer"></div>
        <button class="btn" id="twRefresh">Refresh</button>
      </div>
      <div id="twPanel" style="padding:10px; border:1px solid var(--border); border-radius:10px; background:#0f141d; display:flex; flex-direction:column; gap:8px;">
        <div class="row" style="gap:10px; align-items:center;">
          <div id="twPhase" class="hint" style="font-weight:700; color:#a6adbb;">Phase: -</div>
          <div id="twCycle" class="hint">Cycle: 0</div>
          <div id="twStatus" class="hint">Status: idle</div>
        </div>
        <div style="font-size:28px; font-weight:800; letter-spacing:1px;" id="twClock">00:00</div>
        <div style="height:10px; background:#0b0f16; border:1px solid var(--border); border-radius:6px; overflow:hidden;">
          <div id="twBar" style="height:100%; width:0%; background:linear-gradient(90deg,#2a5cff,#7aa2f7);"></div>
        </div>
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

  let profiles = {};

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

  function two(n){ return String(n).padStart(2,'0'); }
  function fmt(sec){
    const num = Number(sec);
    const safe = Number.isFinite(num) ? Math.max(0, Math.floor(num)) : 0;
    const m=Math.floor(safe/60), s=safe%60;
    return `${two(m)}:${two(s)}`;
  }

  async function loadProfiles(){
    try {
      const r = await fetch(apiBase()+'/api/timer/profiles'); const d = await r.json();
      profiles = d.profiles || {};
      profSel.innerHTML='';
      const names = Object.keys(profiles);
      names.forEach(n=>{ const opt=document.createElement('option'); opt.value=n; opt.textContent=n; profSel.appendChild(opt); });
      // Defer default selection to settings loader
    } catch {}
  }

  async function loadSettings(){
    try {
      const r = await fetch(apiBase()+'/api/timer/settings'); const d = await r.json();
      const s = d.settings||{};
      const defProf = s.default_profile || '';
      const saved = (localStorage.getItem('twProfile')||'');
      if (defProf && !saved) {
        const opt = Array.from(profSel.options).find(o=> o.value===defProf);
        if (opt) profSel.value = defProf;
      } else if (saved) {
        const opt = Array.from(profSel.options).find(o=> o.value===saved);
        if (opt) profSel.value = saved;
      } else if (profSel.options.length){
        profSel.value = profSel.options[0].value;
      }
      if (typeof s.auto_advance === 'boolean') autoEl.checked = !!s.auto_advance;
      if (s.bind_default_type && !bindTypeEl.value) bindTypeEl.value = s.bind_default_type;
    } catch {}
  }

  async function status(){
    try {
      const r = await fetch(apiBase()+'/api/timer/status'); const d = await r.json();
      if (!d || d.ok===false){ return; }
      const st = d.status||{};
      statusEl.textContent = `Status: ${st.status||'idle'}`;
      phaseEl.textContent = `Phase: ${st.current_phase||'-'}`;
      cycleEl.textContent = `Cycle: ${st.cycle_index||0}`;
      clockEl.textContent = fmt(st.remaining_seconds||0);
      // Progress within current phase based on profile
      const prof = st.profile||{};
      let total = 1;
      if (st.current_phase==='focus') total = (prof.focus_minutes||25)*60;
      else if (st.current_phase==='short_break') total=(prof.short_break_minutes||5)*60;
      else if (st.current_phase==='long_break') total=(prof.long_break_minutes||15)*60;
      const rem = parseInt(st.remaining_seconds||0,10); const pct = Math.max(0, Math.min(100, ((total-rem)/total)*100));
      barEl.style.width = `${Number.isFinite(pct)? pct : 0}%`;
      if (String(st.status||'').toLowerCase()==='idle'){
        // show default focus length for current profile
        resetDisplayForSelected();
      }
      updateButtons(st.status);
    } catch {}
  }

  async function start(){
    const payload = {
      profile: profSel.value,
      cycles: (cyclesEl.value? parseInt(cyclesEl.value,10) : undefined),
      auto_advance: !!autoEl.checked,
      bind_type: (bindTypeEl.value||undefined),
      bind_name: (bindNameEl.value||undefined)
    };
    try {
      const r = await fetch(apiBase()+'/api/timer/start', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) { alert('Timer start failed'); }
      await status();
    } catch (e) { alert('Timer start failed'); }
  }

  btnMin.addEventListener('click', ()=> el.classList.toggle('minimized'));
  btnClose.addEventListener('click', ()=> { el.style.display='none'; });
  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', async ()=>{ const r=await fetch(apiBase()+'/api/timer/pause', { method:'POST' }); if(!r.ok) alert('Pause failed'); await status(); });
  resumeBtn.addEventListener('click', async ()=>{ const r=await fetch(apiBase()+'/api/timer/resume', { method:'POST' }); if(!r.ok) alert('Resume failed'); await status(); });
  stopBtn.addEventListener('click', async ()=>{ const r=await fetch(apiBase()+'/api/timer/stop', { method:'POST' }); if(!r.ok) alert('Stop failed'); await status(); });
  cancelBtn.addEventListener('click', async ()=>{ const r=await fetch(apiBase()+'/api/timer/cancel', { method:'POST' }); if(!r.ok) alert('Cancel failed'); await status(); resetDisplayForSelected(); });
  refreshBtn.addEventListener('click', status);
  profSel.addEventListener('change', ()=>{ try{localStorage.setItem('twProfile', profSel.value);}catch{} });

  function updateButtons(stStatus){
    const s = String(stStatus||'idle').toLowerCase();
    const running = s === 'running';
    const paused = s === 'paused';
    pauseBtn.disabled = !running;
    resumeBtn.disabled = !paused;
    stopBtn.disabled = !(running || paused);
    cancelBtn.disabled = !(running || paused);
  }

  function resetDisplayForSelected(){
    const p = profiles[profSel.value] || {};
    const sec = (p.focus_minutes ? Number(p.focus_minutes) : 25) * 60;
    clockEl.textContent = fmt(sec);
    phaseEl.textContent = 'Phase: -';
    statusEl.textContent = 'Status: idle';
    cycleEl.textContent = 'Cycle: 0';
    barEl.style.width = '0%';
  }

  // Bootstrap
  loadProfiles().then(loadSettings).then(()=> status());
  // Poll
  try { clearInterval(window.__twPoll); } catch {}
  window.__twPoll = setInterval(status, 1000);
}
