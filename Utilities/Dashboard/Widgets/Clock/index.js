export function mount(el) {
  const tpl = `
    <div class="header" id="clockHeader">
      <div class="title">Chronos Clock</div>
      <div class="controls">
        <button class="icon-btn" id="clockMin" title="Minimize">_</button>
        <button class="icon-btn" id="clockClose" title="Close">x</button>
      </div>
    </div>
    <div class="content">
      <div style="display:flex; gap:12px; align-items:center;">
        <canvas id="clockCanvas" width="140" height="140" style="background:#0f141d; border:1px solid #222835; border-radius:50%;"></canvas>
        <div>
          <div class="row" style="gap:8px; margin-bottom:8px;">
            <button class="btn btn-secondary" id="btnSetAppointment">Set Appointment</button>
            <button class="btn btn-secondary" id="btnSetAlarm">Set Alarm</button>
            <button class="btn btn-secondary" id="btnSetReminder">Set Reminder</button>
          </div>
          <div id="formArea"></div>
        </div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const header = el.querySelector('#clockHeader');
  const btnMin = el.querySelector('#clockMin');
  const btnClose = el.querySelector('#clockClose');
  const canvas = el.querySelector('#clockCanvas');
  const formArea = el.querySelector('#formArea');

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  const defaults = ((window.CHRONOS_SETTINGS||{}).defaults)||{};
  const apptDef = normalize(defaults.appointment||{});
  const alarmDef = normalize(defaults.alarm||{});
  const remindDef = normalize(defaults.reminder||{});
  const defaultsCache = {};

  function normalize(obj){
    const out={};
    try{
      Object.keys(obj).forEach(k=>{
        const key = String(k).toLowerCase().replace(/^default_/, '');
        out[key] = obj[k];
      });
    }catch{}
    return out;
  }
  const fetchJson = async (url)=>{ const r = await fetch(url); return await r.json(); };
  async function fetchSettingsFile(file){
    try{
      const j = await fetchJson(apiBase()+`/api/settings?file=${encodeURIComponent(file)}`);
      return j && j.content ? String(j.content) : null;
    }catch{return null;}
  }
  function parseYamlFlat(yaml){
    const lines = String(yaml||'').replace(/\r\n?/g,'\n').split('\n');
    const out = {}; let curKey=null; let inBlock=false;
    for (let raw of lines){
      const line = raw.replace(/#.*$/,''); if (!line.trim()) continue;
      if (inBlock){
        if (/^\s/.test(line)) { out[curKey] = (out[curKey]||'') + (out[curKey]? '\n':'') + line.trim(); continue; }
        inBlock=false; curKey=null;
      }
      const m = line.match(/^\s*([\w\-]+)\s*:\s*(.*)$/);
      if (m){
        const k=m[1]; let v=m[2];
        if (v==='|-' || v==='|') { curKey=k; inBlock=true; out[k]=''; continue; }
        if (/^(true|false)$/i.test(v)) v = (/^true$/i.test(v));
        else if (/^-?\d+$/.test(v)) v = parseInt(v,10);
        out[String(k).toLowerCase().replace(/^default_/, '')]=v;
      }
    }
    return normalize(out);
  }
  async function loadDefaultsFor(type){
    const key = String(type||'').toLowerCase();
    if (defaultsCache[key]) return defaultsCache[key];
    const title = key.split('_').map(s=> s.charAt(0).toUpperCase()+s.slice(1)).join('_');
    const candidates = [
      `${key}_defaults.yml`,
      `${title}_Defaults.yml`,
      `${title}_defaults.yml`,
    ];
    for (const f of candidates){
      const y = await fetchSettingsFile(f);
      if (y){
        try{ const parsed = parseYamlFlat(y) || {}; defaultsCache[key]=parsed; return parsed; }catch{ defaultsCache[key]={}; return {}; }
      }
    }
    defaultsCache[key]={};
    return {};
  }
  async function ensureListener(){
    try{ await fetch(apiBase()+'/api/listener/start', { method:'POST' }); }catch{}
  }

  // Analog clock drawing
  const ctx = canvas.getContext('2d');
  function drawClock(){
    const w=canvas.width, h=canvas.height; const r=Math.min(w,h)/2 - 6; const cx=w/2, cy=h/2;
    ctx.clearRect(0,0,w,h);
    // face
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#0b0f16';
    ctx.strokeStyle = '#2b3343';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0,0,r+4,0,Math.PI*2); ctx.stroke();
    // ticks
    for(let i=0;i<60;i++){
      const ang = i * Math.PI/30;
      const len = (i%5===0) ? 10 : 5;
      ctx.strokeStyle = (i%5===0) ? '#a6adbb' : '#3a4a6a';
      ctx.lineWidth = (i%5===0) ? 2 : 1;
      const x1 = Math.cos(ang)*(r-len), y1 = Math.sin(ang)*(r-len);
      const x2 = Math.cos(ang)*r, y2 = Math.sin(ang)*r;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    }
    const now = new Date();
    const sec = now.getSeconds();
    const min = now.getMinutes() + sec/60;
    const hr = (now.getHours()%12) + min/60;
    // hour hand
    drawHand(hr * Math.PI/6, r*0.5, 4, '#e6e8ef');
    // minute hand
    drawHand(min * Math.PI/30, r*0.75, 3, '#7aa2f7');
    // second hand
    drawHand(sec * Math.PI/30, r*0.85, 1.5, '#ef6a6a');
    // center
    ctx.fillStyle = '#e6e8ef'; ctx.beginPath(); ctx.arc(0,0,2.5,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  function drawHand(angle, length, width, color){
    ctx.save(); ctx.rotate(angle); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(length,0); ctx.stroke(); ctx.restore();
  }
  let rafId=null; function tick(){ drawClock(); rafId = requestAnimationFrame(tick); }
  tick();

  // Interaction: forms
  function clearForm(){ formArea.innerHTML=''; }
  function makeInputRow(label, inner){
    const row=document.createElement('div'); row.className='row'; row.style.gap='8px';
    const lab=document.createElement('label'); lab.className='hint'; lab.style.minWidth='90px'; lab.textContent=label; row.appendChild(lab);
    row.appendChild(inner); return row;
  }

  async function showAppointmentForm(){
    clearForm();
    const title = document.createElement('input'); title.className='input'; title.placeholder='Appointment title';
    const date = document.createElement('input'); date.className='input'; date.type='date';
    const time = document.createElement('input'); time.className='input'; time.type='time'; time.step='60';
    const duration = document.createElement('input'); duration.className='input'; duration.type='number'; duration.min='0'; duration.placeholder='minutes';
    const location = document.createElement('input'); location.className='input'; location.placeholder='Location (optional)';
    // Prefill from defaults (settings override inline defaults)
    try{
      const def = await loadDefaultsFor('appointment');
      const dft = Object.keys(def||{}).length ? def : apptDef;
      if (dft.name || dft.title) title.value = dft.name || dft.title;
      date.value = dft.date || new Date(Date.now()+86400000).toISOString().slice(0,10);
      if (dft.time) time.value = dft.time;
      if (dft.duration) duration.value = String(dft.duration);
      if (dft.location) location.value = dft.location;
    }catch{ try{ date.value = new Date(Date.now()+86400000).toISOString().slice(0,10); }catch{} }
    const create = document.createElement('button'); create.className='btn btn-primary'; create.textContent='Create Appointment';
    const wrap = document.createElement('div');
    wrap.append(
      makeInputRow('Title', title),
      makeInputRow('Date', date),
      makeInputRow('Time', time),
      makeInputRow('Duration', duration),
      makeInputRow('Location', location),
      (function(){ const r=document.createElement('div'); r.className='row'; r.appendChild(create); r.style.justifyContent='flex-end'; return r; })()
    );
    formArea.appendChild(wrap);
    create.addEventListener('click', async ()=>{
      const name = (title.value||'').trim(); if (!name) { alert('Please enter a title'); return; }
      const props = { date: date.value||'', time: time.value||'', duration: duration.value||'', location: location.value||'' };
      Object.keys(props).forEach(k=>{ if(props[k]===null||props[k]===undefined||props[k]==='') delete props[k]; });
      const payload = `command: new\nargs:\n  - appointment\n  - ${escapeY(name)}\nproperties:\n` + Object.entries(props).map(([k,v])=>`  ${k}: ${escapeY(v)}`).join('\n') + '\n';
      try{
        await ensureListener();
        const resp = await fetch(apiBase()+ '/api/cli', { method:'POST', headers:{ 'Content-Type':'text/yaml' }, body: payload });
        const text = await resp.text();
        alert(resp.ok? 'Appointment created.' : ('Failed: '+text));
      }catch(e){ alert('Failed to reach Chronos dashboard server. Run: dashboard'); }
    });
  }

  async function showAlarmForm(){
    clearForm();
    const title = document.createElement('input'); title.className='input'; title.placeholder='Alarm title';
    const time = document.createElement('input'); time.className='input'; time.type='time'; time.step='60';
    const message = document.createElement('input'); message.className='input'; message.placeholder='Message (optional)';
    const enabled = document.createElement('input'); enabled.type='checkbox'; enabled.checked=true;
    // Prefill from defaults (settings override inline defaults)
    try{
      const def = await loadDefaultsFor('alarm');
      const dft = Object.keys(def||{}).length ? def : alarmDef;
      if (dft.name || dft.title) title.value = dft.name || dft.title;
      if (dft.time) time.value = dft.time;
      if (dft.message) message.value = dft.message;
      if (typeof dft.enabled === 'boolean') enabled.checked = !!dft.enabled;
    }catch{}
    const create = document.createElement('button'); create.className='btn btn-primary'; create.textContent='Create Alarm';
    const wrap = document.createElement('div');
    const chkWrap = document.createElement('div'); chkWrap.className='row'; chkWrap.style.gap='8px';
    const chkLabel=document.createElement('label'); chkLabel.className='hint'; chkLabel.style.minWidth='90px'; chkLabel.textContent='Enabled';
    chkWrap.append(chkLabel, enabled);
    wrap.append(
      makeInputRow('Title', title),
      makeInputRow('Time', time),
      makeInputRow('Message', message),
      chkWrap,
      (function(){ const r=document.createElement('div'); r.className='row'; r.appendChild(create); r.style.justifyContent='flex-end'; return r; })()
    );
    formArea.appendChild(wrap);
    create.addEventListener('click', async ()=>{
      const name = (title.value||'').trim(); if (!name) { alert('Please enter a title'); return; }
      if (!time.value) { alert('Please choose a time'); return; }
      const props = { time: time.value, message: message.value||'', enabled: enabled.checked ? 'true' : 'false' };
      Object.keys(props).forEach(k=>{ if(props[k]===null||props[k]===undefined||props[k]==='') delete props[k]; });
      const payload = `command: new\nargs:\n  - alarm\n  - ${escapeY(name)}\nproperties:\n` + Object.entries(props).map(([k,v])=>`  ${k}: ${escapeY(v)}`).join('\n') + '\n';
      try{
        await ensureListener();
        const resp = await fetch(apiBase()+ '/api/cli', { method:'POST', headers:{ 'Content-Type':'text/yaml' }, body: payload });
        const text = await resp.text();
        alert(resp.ok? 'Alarm created.' : ('Failed: '+text));
      }catch(e){ alert('Failed to reach Chronos dashboard server. Run: dashboard'); }
    });
  }

  async function showReminderForm(){
    clearForm();
    const title = document.createElement('input'); title.className='input'; title.placeholder='Reminder title';
    const time = document.createElement('input'); time.className='input'; time.type='time'; time.step='60';
    const date = document.createElement('input'); date.className='input'; date.type='date';
    const message = document.createElement('input'); message.className='input'; message.placeholder='Message (optional)';
    const recurrence = document.createElement('input'); recurrence.className='input'; recurrence.placeholder='Recurrence (e.g. daily, mon, tue)';
    try{
      const def = await loadDefaultsFor('reminder');
      const dft = Object.keys(def||{}).length ? def : remindDef;
      if (dft.name || dft.title) title.value = dft.name || dft.title;
      if (dft.time) time.value = dft.time;
      date.value = dft.date || new Date(Date.now()+86400000).toISOString().slice(0,10);
      if (dft.message) message.value = dft.message;
      if (dft.recurrence) recurrence.value = Array.isArray(dft.recurrence)? dft.recurrence.join(', '): String(dft.recurrence);
    }catch{ try{ date.value = new Date(Date.now()+86400000).toISOString().slice(0,10); }catch{} }
    const create = document.createElement('button'); create.className='btn btn-primary'; create.textContent='Create Reminder';
    const wrap = document.createElement('div');
    wrap.append(
      makeInputRow('Title', title),
      makeInputRow('Date', date),
      makeInputRow('Time', time),
      makeInputRow('Message', message),
      makeInputRow('Recurrence', recurrence),
      (function(){ const r=document.createElement('div'); r.className='row'; r.appendChild(create); r.style.justifyContent='flex-end'; return r; })()
    );
    formArea.appendChild(wrap);
    create.addEventListener('click', async ()=>{
      const name = (title.value||'').trim(); if (!name) { alert('Please enter a title'); return; }
      if (!time.value) { alert('Please choose a time'); return; }
      const props = { time: time.value, date: date.value||'', message: message.value||'' };
      const rec = (recurrence.value||'').trim();
      if (rec) props.recurrence = rec;
      Object.keys(props).forEach(k=>{ if(props[k]===null||props[k]===undefined||props[k]==='') delete props[k]; });
      const payload = `command: new\nargs:\n  - reminder\n  - ${escapeY(name)}\nproperties:\n` + Object.entries(props).map(([k,v])=>`  ${k}: ${escapeY(v)}`).join('\n') + '\n';
      try{
        await ensureListener();
        const resp = await fetch(apiBase()+ '/api/cli', { method:'POST', headers:{ 'Content-Type':'text/yaml' }, body: payload });
        const text = await resp.text();
        alert(resp.ok? 'Reminder created.' : ('Failed: '+text));
      }catch(e){ alert('Failed to reach Chronos dashboard server. Run: dashboard'); }
    });
  }

  function escapeY(v){ const s=String(v==null?'':v); if(/[:\n]/.test(s)) return '"'+s.replace(/"/g,'\\"')+'"'; return s; }

  // Dragging
  header.addEventListener('pointerdown', (ev)=>{
    const r = el.getBoundingClientRect(); const offX=ev.clientX-r.left, offY=ev.clientY-r.top;
    function move(e){ el.style.left=Math.max(6, e.clientX-offX)+'px'; el.style.top=Math.max(6, e.clientY-offY)+'px'; el.style.right='auto'; }
    function up(){ window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  btnMin.addEventListener('click', ()=> el.classList.toggle('minimized'));
  btnClose.addEventListener('click', ()=> el.style.display='none');

  // Buttons
  el.querySelector('#btnSetAppointment').addEventListener('click', showAppointmentForm);
  el.querySelector('#btnSetAlarm').addEventListener('click', showAlarmForm);
  el.querySelector('#btnSetReminder').addEventListener('click', showReminderForm);

  // Resizers
  function edgeDrag(startRect, cb){ return (ev)=>{ ev.preventDefault(); function move(e){ cb(e, startRect); } function up(){ window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); } window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); } }
  const re=el.querySelector('.resizer.e'); const rs=el.querySelector('.resizer.s'); const rse=el.querySelector('.resizer.se');
  if(re) re.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.width=Math.max(260, e.clientX - sr.left)+'px'; })(ev); });
  if(rs) rs.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.height=Math.max(160, e.clientY - sr.top)+'px'; })(ev); });
  if(rse) rse.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.width=Math.max(260, e.clientX - sr.left)+'px'; el.style.height=Math.max(160, e.clientY - sr.top)+'px'; })(ev); });

  return {};
}
