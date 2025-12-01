export function mount(el, context) {
  console.log('[Chronos][Today] Mounting Today widget');
  el.innerHTML = `
    <div class="header" id="todayHeader">
      <div class="title">Today</div>
      <div class="controls">
        <button class="icon-btn" id="todayMin" title="Minimize">_</button>
        <button class="icon-btn" id="todayClose" title="Close">x</button>
      </div>
    </div>
    <div class="content">
      <div class="row" style="align-items: center; gap: 8px;">
        <label class="hint" style="display:flex; align-items:center; gap:6px;"><input type="checkbox" id="todayFxToggle" checked /> fx</label>
        <span class="hint" id="selSummary">Select an item on the calendarâ€¦</span>
        <div class="spacer"></div>
        <button class="btn btn-secondary" id="todayRefresh">Refresh</button>
        <button class="btn btn-primary" id="todayStartDay">Start Day</button>
        <button class="btn btn-secondary" id="todayReschedule">Reschedule</button>
      </div>
      <div class="row" id="actionsRow" style="display:none; gap:8px; align-items:center; margin-top:8px; flex-wrap: wrap;">
        <div class="row" style="gap:8px; align-items:center;">
          <button class="btn" id="trim5" title="Trim 5 minutes">Trim -5</button>
          <button class="btn" id="trim10" title="Trim 10 minutes">Trim -10</button>
          <input class="input" id="trimCustom" placeholder="min" style="width:72px;" />
          <button class="btn" id="trimGo">Trim</button>
        </div>
        <div class="row" style="gap:8px; align-items:center;">
          <input class="input" id="changeTime" type="time" step="60" style="width:110px;" />
          <button class="btn" id="changeGo">Change</button>
          <button class="btn" id="cutGo">Cut</button>
          <button class="btn" id="markDone">Mark</button>
        </div>
      </div>
      <div class="hint">Click a line in Day view to target it. Use actions to queue edits, then Reschedule to apply.</div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

  function safeParseYaml(text){
    if (typeof window !== 'undefined' && typeof window.parseYaml === 'function') {
      try {
        const parsed = window.parseYaml(text);
        if (parsed && Array.isArray(parsed.blocks) && parsed.blocks.length){
          return parsed;
        }
        // fall through to manual parsing if empty
      } catch {}
    }
    const lines = String(text||'').replace(/\r\n?/g,'\n').split('\n');
    const res = { blocks: [] };
    let inBlocks = false, cur = null;
    for (let raw of lines){
      const line = raw.replace(/#.*$/,'');
      if (!line.trim()) continue;
      if (!inBlocks){ if (/^\s*blocks\s*:/.test(line)) { inBlocks=true; } continue; }
      if (/^\s*-\s*/.test(line)) { if (cur) res.blocks.push(cur); cur={}; continue; }
      const m = line.match(/^\s*(\w+)\s*:\s*(.+)$/); if (m && cur) { cur[m[1]] = m[2].trim(); }
    }
    if (cur) res.blocks.push(cur);
    return res;
  }

  async function fetchToday(){
    console.log('[Chronos][Today] fetchToday()');
    try{
      const r = await fetch(apiBase() + '/api/today');
      const t = await r.text();
      const data = safeParseYaml(t)||{};
      const blocks = Array.isArray(data.blocks) ? data.blocks : [];
      const key = (function(){ const d=new Date(); const y=d.getFullYear(), m=('0'+(d.getMonth()+1)).slice(-2), dd=('0'+d.getDate()).slice(-2); return `${y}-${m}-${dd}`; })();
      const store = (function(){ try{ return JSON.parse(localStorage.getItem('pm_day_blocks'))||{} }catch{ return {} } })();
      function toMin(s){ const m=String(s||'').match(/(\d{1,2}):(\d{2})/); if(!m) return null; return parseInt(m[1],10)*60 + parseInt(m[2],10); }
      store[key] = blocks.map(b=>({ start: toMin(b.start)||0, end: toMin(b.end)||0, text: b.text||'' }));
      try{ localStorage.setItem('pm_day_blocks', JSON.stringify(store)); }catch{}
      try{ window.dayBlocksStore = store; }catch{}
      try{ if (typeof window.redraw==='function') window.redraw(); }catch{}
      console.log('[Chronos][Today] Loaded blocks:', blocks.length);
      alert("Loaded today's schedule.");
    } catch (e) { console.error('[Chronos][Today] fetch error:', e); alert('Failed to load schedule.'); }
  }

  const content = el.querySelector('.content') || el;
  const btnRefresh = content.querySelector('#todayRefresh');
  const btnResched = content.querySelector('#todayReschedule');
  const btnStartDay = content.querySelector('#todayStartDay');
  const selSummary = content.querySelector('#selSummary');
  const actionsRow = content.querySelector('#actionsRow');
  const btnTrim5 = content.querySelector('#trim5');
  const btnTrim10 = content.querySelector('#trim10');
  const inputTrim = content.querySelector('#trimCustom');
  const btnTrimGo = content.querySelector('#trimGo');
  const inputChange = content.querySelector('#changeTime');
  const btnChangeGo = content.querySelector('#changeGo');
  const btnCutGo = content.querySelector('#cutGo');
  const btnMarkDone = content.querySelector('#markDone');

  let selected = null; // { text, type, start, end }
  if (btnRefresh) btnRefresh.addEventListener('click', () => { console.log('[Chronos][Today] Refresh clicked'); fetchToday(); });
  if (btnResched) btnResched.addEventListener('click', async () => {
    console.log('[Chronos][Today] Reschedule clicked');
    try{
      const resp = await fetch(apiBase() + '/api/today/reschedule', { method:'POST', headers:{ 'Content-Type':'text/yaml' }, body: 'reschedule: true' });
      const text = await resp.text();
      console.log('[Chronos][Today] Reschedule response:', text);
    }catch(e){ console.error('[Chronos][Today] Reschedule error:', e); }
    fetchToday();
  });
  if (btnStartDay) btnStartDay.addEventListener('click', () => startDay());

  // Listen for calendar selection
  try {
    context?.bus?.on('calendar:selected', (payload)=>{
      selected = payload || null;
      if (!selected){ selSummary.textContent = 'Select an item on the calendarâ€¦'; actionsRow.style.display='none'; return; }
      const hm = (m)=>{ const h=Math.floor((m||0)/60)%24, n=(m||0)%60; return String(h).padStart(2,'0')+':'+String(n).padStart(2,'0'); };
      selSummary.textContent = `${selected.text} (${hm(selected.start)}-${hm(selected.end||selected.start)})`;
      actionsRow.style.display='';
      try { inputChange.value = hm(selected.start); } catch{}
    });
  } catch {}

  async function runCli(command, args, properties){
    const propLines = Object.entries(properties||{}).map(([k,v])=>`  ${k}: ${String(v)}`).join('\n');
    const body = `command: ${command}\nargs:\n${(args||[]).map(a=>'  - '+String(a)).join('\n')}\n${propLines? 'properties:\n'+propLines+'\n' : ''}`;
    const resp = await fetch(apiBase() + '/api/cli', { method:'POST', headers:{ 'Content-Type':'text/yaml' }, body });
    const text = await resp.text();
  const fxChk = content.querySelector('#todayFxToggle');
  let fxEnabled = (fxChk ? fxChk.checked : true);
  fxChk?.addEventListener('change', ()=>{ fxEnabled = !!fxChk.checked; if (selected){ const hm=(m)=>{ const h=Math.floor((m||0)/60)%24, n=(m||0)%60; return String(h).padStart(2,'0')+':'+String(n).padStart(2,'0')}; const txt = fxEnabled && window.ChronosVars ? window.ChronosVars.expand(String(selected.text||'')) : String(selected.text||''); selSummary.textContent = `${txt} (${hm(selected.start)}-${hm(selected.end||selected.start)})`; } });
  try {
    context?.bus?.on('calendar:selected', (payload)=>{
      selected = payload || null;
      if (!selected){ selSummary.textContent = 'Select an item on the calendar…'; actionsRow.style.display='none'; return; }
      const hm = (m)=>{ const h=Math.floor((m||0)/60)%24, n=(m||0)%60; return String(h).padStart(2,'0')+':'+String(n).padStart(2,'0'); };
      const disp = (fxEnabled && window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(selected.text||'')) : String(selected.text||'');
      selSummary.textContent = `${disp} (${hm(selected.start)}-${hm(selected.end||selected.start)})`;
      actionsRow.style.display='';
      try { inputChange.value = hm(selected.start); } catch{}
    });
  } catch {}
    return { ok: resp.ok, text };
  }

  function ensureSel(){ if (!selected){ alert('Select an item in the calendar first.'); return false; } return true; }

  btnTrim5?.addEventListener('click', async ()=>{ if(!ensureSel()) return; await runCli('trim', [selected.text, '5'], {}); });
  btnTrim10?.addEventListener('click', async ()=>{ if(!ensureSel()) return; await runCli('trim', [selected.text, '10'], {}); });
  btnTrimGo?.addEventListener('click', async ()=>{ if(!ensureSel()) return; const val=parseInt(inputTrim?.value||''); if(!val||val<=0){ alert('Enter minutes'); return; } await runCli('trim', [selected.text, String(val)], {}); });
  btnChangeGo?.addEventListener('click', async ()=>{ if(!ensureSel()) return; const t=inputChange?.value||''; if(!/^\d{2}:\d{2}$/.test(t)){ alert('Enter time HH:MM'); return; } await runCli('change', [selected.text, t], {}); });
  btnCutGo?.addEventListener('click', async ()=>{ if(!ensureSel()) return; await runCli('cut', [selected.text], {}); });
  btnMarkDone?.addEventListener('click', async ()=>{ if(!ensureSel()) return; await runCli('mark', [`${selected.text}:completed`], {}); });

  // Dragging/min/close
  const header = el.querySelector('#todayHeader');
  const btnMin = el.querySelector('#todayMin');
  const btnClose = el.querySelector('#todayClose');
  if (header && btnMin && btnClose) {
    header.addEventListener('pointerdown', (ev)=>{
      const r = el.getBoundingClientRect(); const offX=ev.clientX-r.left, offY=ev.clientY-r.top;
      function move(e){ el.style.left=Math.max(6, e.clientX-offX)+'px'; el.style.top=Math.max(6, e.clientY-offY)+'px'; el.style.right='auto'; }
      function up(){ window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    btnMin.addEventListener('click', ()=> el.classList.toggle('minimized'));
    btnClose.addEventListener('click', ()=> el.style.display='none');
  }

  // Resizers
  function edgeDrag(startRect, cb){ return (ev)=>{ ev.preventDefault(); function move(e){ cb(e, startRect); } function up(){ window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); } window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); } }
  const re=el.querySelector('.resizer.e'); const rs=el.querySelector('.resizer.s'); const rse=el.querySelector('.resizer.se');
  if(re) re.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.width=Math.max(260, e.clientX - sr.left)+'px'; })(ev); });
  if(rs) rs.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.height=Math.max(160, e.clientY - sr.top)+'px'; })(ev); });
  if(rse) rse.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.width=Math.max(260, e.clientX - sr.left)+'px'; el.style.height=Math.max(160, e.clientY - sr.top)+'px'; })(ev); });

  async function startDay(){
    if (!btnStartDay) return;
    if (btnStartDay.disabled) return;
    btnStartDay.disabled = true;
    const prev = btnStartDay.textContent;
    btnStartDay.textContent = 'Starting...';
    try {
      if (typeof window.ChronosStartDay === 'function'){
        await window.ChronosStartDay({ source: 'today-widget', target: 'day' });
      } else {
        const resp = await fetch(apiBase() + '/api/day/start', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ target: 'day' }) });
        const data = await resp.json().catch(()=> ({}));
        if (!resp.ok || data.ok === false) throw new Error(data.error || data.stderr || `HTTP ${resp.status}`);
      }
      fetchToday();
      try { window.ChronosBus?.emit?.('timer:show', { source: 'today-widget' }); } catch {}
    } catch (err) {
      console.error('[Chronos][Today] start failed', err);
      alert(`Failed to start day: ${err?.message || err}`);
    } finally {
      btnStartDay.disabled = false;
      btnStartDay.textContent = prev;
    }
  }

  console.log('[Chronos][Today] Widget ready');
  return {};
}

