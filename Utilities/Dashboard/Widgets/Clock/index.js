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

  function normalize(obj){ const out={}; try{ Object.keys(obj).forEach(k=> out[String(k).toLowerCase()] = obj[k]); }catch{} return out; }

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

  function showAppointmentForm(){
    clearForm();
    const title = document.createElement('input'); title.className='input'; title.placeholder='Appointment title';
    const date = document.createElement('input'); date.className='input'; date.type='date';
    const time = document.createElement('input'); time.className='input'; time.type='time'; time.step='60';
    const duration = document.createElement('input'); duration.className='input'; duration.type='number'; duration.min='0'; duration.placeholder='minutes';
    const location = document.createElement('input'); location.className='input'; location.placeholder='Location (optional)';
    // Prefill from defaults
    try { if (apptDef.name) title.value = apptDef.name; } catch{}
    try { if (apptDef.date) date.value = apptDef.date; else date.value = new Date().toISOString().slice(0,10); } catch{}
    try { if (apptDef.time) time.value = apptDef.time; } catch{}
    try { if (apptDef.duration) duration.value = String(apptDef.duration); } catch{}
    try { if (apptDef.location) location.value = apptDef.location; } catch{}
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
        const resp = await fetch(apiBase()+ '/api/cli', { method:'POST', headers:{ 'Content-Type':'text/yaml' }, body: payload });
        const text = await resp.text();
        alert(resp.ok? 'Appointment created.' : ('Failed: '+text));
      }catch(e){ alert('Failed to reach Chronos dashboard server. Run: dashboard'); }
    });
  }

  function showAlarmForm(){
    clearForm();
    const title = document.createElement('input'); title.className='input'; title.placeholder='Alarm title';
    const time = document.createElement('input'); time.className='input'; time.type='time'; time.step='60';
    const message = document.createElement('input'); message.className='input'; message.placeholder='Message (optional)';
    const enabled = document.createElement('input'); enabled.type='checkbox'; enabled.checked=true;
    // Prefill from defaults
    try { if (alarmDef.name) title.value = alarmDef.name; } catch{}
    try { if (alarmDef.time) time.value = alarmDef.time; } catch{}
    try { if (alarmDef.message) message.value = alarmDef.message; } catch{}
    try { if (typeof alarmDef.enabled === 'boolean') enabled.checked = !!alarmDef.enabled; } catch{}
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
        const resp = await fetch(apiBase()+ '/api/cli', { method:'POST', headers:{ 'Content-Type':'text/yaml' }, body: payload });
        const text = await resp.text();
        alert(resp.ok? 'Alarm created.' : ('Failed: '+text));
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

  // Resizers
  function edgeDrag(startRect, cb){ return (ev)=>{ ev.preventDefault(); function move(e){ cb(e, startRect); } function up(){ window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); } window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); } }
  const re=el.querySelector('.resizer.e'); const rs=el.querySelector('.resizer.s'); const rse=el.querySelector('.resizer.se');
  if(re) re.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.width=Math.max(260, e.clientX - sr.left)+'px'; })(ev); });
  if(rs) rs.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.height=Math.max(160, e.clientY - sr.top)+'px'; })(ev); });
  if(rse) rse.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.width=Math.max(260, e.clientX - sr.left)+'px'; el.style.height=Math.max(160, e.clientY - sr.top)+'px'; })(ev); });

  return {};
}

