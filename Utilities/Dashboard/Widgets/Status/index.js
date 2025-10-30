export function mount(el) {
  const tpl = `
    <div class="header" id="statusHeader">
      <div class="title">Status Station</div>
      <div class="controls">
        <button class="icon-btn" id="statusMin" title="Minimize">_</button>
        <button class="icon-btn" id="statusClose" title="Close">x</button>
      </div>
    </div>
    <div class="content">
      <div id="statusFields"></div>
      <div class="row">
        <div class="spacer"></div>
        <button class="btn btn-primary" id="statusUpdate">Update</button>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const header = el.querySelector('#statusHeader');
  const btnMin = el.querySelector('#statusMin');
  const btnClose = el.querySelector('#statusClose');
  const fieldsRoot = el.querySelector('#statusFields');
  const btnUpdate = el.querySelector('#statusUpdate');

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

  const settings = (window.CHRONOS_SETTINGS && window.CHRONOS_SETTINGS.status) || {};
  const types = Array.isArray(settings.types) ? settings.types : [ 'Health','Place','Energy','Mind State','Focus','Emotion','Vibe' ];
  const optionsMap = settings.options || {};
  const current = (settings.current || {});

  // Render fields
  const fieldRefs = {};
  types.forEach(type => {
    const typeKey = String(type);
    const id = 'status_'+typeKey.toLowerCase().replace(/\s+/g,'_');
    const wrap = document.createElement('div');
    wrap.className = 'row';
    wrap.style.gap = '8px';

    const label = document.createElement('label');
    label.className = 'hint';
    label.style.minWidth = '90px';
    label.textContent = typeKey;
    wrap.appendChild(label);

    const select = document.createElement('select');
    select.className = 'input';
    select.id = id;

    const list = Array.isArray(optionsMap[typeKey]) && optionsMap[typeKey].length ? optionsMap[typeKey] : [ 'Excellent','Good','Fair','Poor' ];
    list.forEach(val => { const opt = document.createElement('option'); opt.value = String(val); opt.textContent = String(val); select.appendChild(opt); });

    // Set current value if present
    const curKey = typeKey.toLowerCase();
    const curVal = current[curKey];
    if (curVal) {
      // try exact, then case-insensitive
      const exact = Array.from(select.options).find(o => o.value === curVal);
      const ci = exact || Array.from(select.options).find(o => o.value.toLowerCase() === String(curVal).toLowerCase());
      if (ci) select.value = ci.value;
    }

    wrap.appendChild(select);
    fieldsRoot.appendChild(wrap);
    fieldRefs[curKey] = select;
  });

  // Dragging
  header.addEventListener('pointerdown', (ev)=>{
    const startX=ev.clientX, startY=ev.clientY; const rect=el.getBoundingClientRect(); const offX=startX-rect.left, offY=startY-rect.top;
    function onMove(e){ el.style.left=Math.max(6, e.clientX-offX)+'px'; el.style.top=Math.max(6, e.clientY-offY)+'px'; el.style.right='auto'; }
    function onUp(){ window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  });
  btnMin.addEventListener('click', ()=> el.classList.toggle('minimized'));
  btnClose.addEventListener('click', ()=> el.style.display='none');

  // Update handler
  btnUpdate.addEventListener('click', async ()=>{
    // Build YAML map of indicator:value (lowercase indicator keys)
    const lines = [];
    Object.keys(fieldRefs).forEach(k => { const v = fieldRefs[k].value; if (v) lines.push(`${k}: ${v}`); });
    const payload = lines.join('\n');
    try {
      const resp = await fetch(apiBase() + '/api/status/update', { method:'POST', headers:{ 'Content-Type':'text/yaml' }, body: payload });
      const text = await resp.text();
      console.log('[Chronos][Status] Update response:', text);
      alert(resp.ok ? 'Status updated.' : 'Failed to update status.');
    } catch (e) {
      console.error('[Chronos][Status] Update error:', e);
      alert('Failed to reach Chronos dashboard server. Run: dashboard');
    }
  });

  // Resizers
  function edgeDrag(startRect, cb){ return (ev)=>{ ev.preventDefault(); function move(e){ cb(e, startRect); } function up(){ window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); } window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); } }
  const re=el.querySelector('.resizer.e'); const rs=el.querySelector('.resizer.s'); const rse=el.querySelector('.resizer.se');
  if(re) re.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.width=Math.max(260, e.clientX - sr.left)+'px'; })(ev); });
  if(rs) rs.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.height=Math.max(160, e.clientY - sr.top)+'px'; })(ev); });
  if(rse) rse.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.width=Math.max(260, e.clientX - sr.left)+'px'; el.style.height=Math.max(160, e.clientY - sr.top)+'px'; })(ev); });

  console.log('[Chronos][Status] Widget ready');
  return {};
}

