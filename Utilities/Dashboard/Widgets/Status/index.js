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
  // fx toggle for expanded display of labels (does not affect saves)
  const fxWrap = document.createElement('label'); fxWrap.className='hint'; fxWrap.style.display='flex'; fxWrap.style.alignItems='center'; fxWrap.style.gap='6px'; fxWrap.style.margin='6px 0';
  const fx = document.createElement('input'); fx.type='checkbox'; fx.id='statusFxToggle'; fx.checked = true; fxWrap.append(fx, document.createTextNode('fx'));
  try { fieldsRoot.parentElement.insertBefore(fxWrap, fieldsRoot); } catch {}

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

  const settings = (window.CHRONOS_SETTINGS && window.CHRONOS_SETTINGS.status) || {};
  const types = Array.isArray(settings.types) ? settings.types : [ 'Health','Place','Energy','Mind State','Focus','Emotion','Vibe' ];
  const optionsMap = settings.options || {};
  let currentStatus = normalizeStatusMap(settings.current || {});

  // Render fields
  const fieldRefs = {};
  function slugify(name){ return String(name || '').trim().toLowerCase().replace(/\s+/g, '_'); }
  function normalizeStatusMap(map){
    const out = {};
    Object.entries(map || {}).forEach(([key, value]) => {
      const slug = slugify(key);
      if (slug) out[slug] = value;
    });
    return out;
  }
  async function fetchCurrentStatus(){
    const resp = await fetch(apiBase() + '/api/status/current');
    const data = await resp.json().catch(()=> ({}));
    if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
    return normalizeStatusMap(data.status || data || {});
  }
  function applyCurrentStatus(map){
    const normalized = normalizeStatusMap(map || {});
    currentStatus = { ...currentStatus, ...normalized };
    Object.keys(fieldRefs).forEach(key => {
      const select = fieldRefs[key];
      if (!select) return;
      const rawVal = currentStatus[key];
      if (!rawVal) return;
      const exact = Array.from(select.options).find(o => o.value === rawVal);
      const ci = exact || Array.from(select.options).find(o => o.value.toLowerCase() === String(rawVal).toLowerCase());
      if (ci) select.value = ci.value;
    });
  }
  function expandText(s){ try { return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s||'')) : String(s||''); } catch { return String(s||''); } }
  let fxEnabled = true;
  fx?.addEventListener('change', ()=>{ fxEnabled = !!fx.checked; try { fieldsRoot.querySelectorAll('label.hint').forEach(l=>{ const raw=l.getAttribute('data-raw')||l.textContent||''; l.textContent = fxEnabled ? expandText(raw) : raw; }); } catch{} });

  types.forEach(type => {
    const typeKey = String(type);
    const typeSlug = slugify(typeKey);
    const id = 'status_'+typeSlug;
    const wrap = document.createElement('div');
    wrap.className = 'row';
    wrap.style.gap = '8px';

    const label = document.createElement('label');
    label.className = 'hint';
    label.style.minWidth = '90px';
    label.setAttribute('data-raw', typeKey);
    label.textContent = expandText(typeKey);
    wrap.appendChild(label);

    const select = document.createElement('select');
    select.className = 'input';
    select.id = id;

    const list = Array.isArray(optionsMap[typeKey]) && optionsMap[typeKey].length ? optionsMap[typeKey] : [ 'Excellent','Good','Fair','Poor' ];
    list.forEach(val => { const opt = document.createElement('option'); opt.value = String(val); opt.textContent = fxEnabled ? expandText(String(val)) : String(val); opt.setAttribute('data-raw', String(val)); select.appendChild(opt); });

    // Set current value if present
    const curVal = currentStatus[typeSlug];
    if (curVal) {
      // try exact, then case-insensitive
      const exact = Array.from(select.options).find(o => o.value === curVal);
      const ci = exact || Array.from(select.options).find(o => o.value.toLowerCase() === String(curVal).toLowerCase());
      if (ci) select.value = ci.value;
    }

    wrap.appendChild(select);
    fieldsRoot.appendChild(wrap);
    fieldRefs[typeSlug] = select;
  });
  // Re-expand options when vars change
  try { window?.ChronosVars && context?.bus?.on('vars:changed', ()=>{ try { fieldsRoot.querySelectorAll('label.hint').forEach(l=>{ const raw=l.getAttribute('data-raw')||l.textContent||''; l.textContent = fxEnabled ? expandText(raw) : raw; }); fieldsRoot.querySelectorAll('select option').forEach(o=>{ const raw=o.getAttribute('data-raw')||o.textContent||''; o.textContent = fxEnabled ? expandText(raw) : raw; }); } catch{} }); } catch{}

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
      if (resp.ok) {
        try {
          const latest = await fetchCurrentStatus();
          applyCurrentStatus(latest);
        } catch (e) {
          console.warn('[Chronos][Status] Refresh failed after update:', e);
        }
        alert('Status updated.');
      } else {
        alert('Failed to update status.');
      }
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

  fetchCurrentStatus().then(applyCurrentStatus).catch(()=>{});

  console.log('[Chronos][Status] Widget ready');
  return {};
}
