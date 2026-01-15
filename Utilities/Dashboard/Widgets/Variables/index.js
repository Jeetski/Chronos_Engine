export function mount(el, context){
  const css = `
    .vars { display:flex; flex-direction:column; gap:10px; }
    .row { display:flex; gap:8px; align-items:center; }
    .grid { display:flex; flex-direction:column; gap:6px; max-height: 260px; overflow:auto; border:1px solid #222835; border-radius:8px; background:#0f141d; padding:8px; }
    .var { display:flex; gap:8px; align-items:center; }
    .key { width: 40%; }
    .val { width: 60%; }
    .input { background:#0f141d; color:#e6e8ef; border:1px solid #222835; border-radius:6px; padding:6px 8px; }
    .hint { color: var(--text-dim); font-size: 12px; }
  `;
  el.innerHTML = `
    <style>${css}</style>
    <div class="header" id="vHeader">
      <div class="title">Variables</div>
      <div class="controls">
        <button class="icon-btn" id="vMin" title="Minimize">_</button>
        <button class="icon-btn" id="vClose" title="Close">x</button>
      </div>
    </div>
    <div class="content">
      <div class="vars">
        <div class="row">
          <button class="btn" id="vAdd">Add</button>
          <button class="btn btn-primary" id="vSave">Save</button>
          <button class="btn" id="vRefresh">Refresh</button>
          <div class="spacer"></div>
          <span class="hint">These @vars expand in views and (optionally) Terminal args.</span>
        </div>
        <div id="vGrid" class="grid"></div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;

  const btnMin = el.querySelector('#vMin');
  const btnClose = el.querySelector('#vClose');
  const btnAdd = el.querySelector('#vAdd');
  const btnSave = el.querySelector('#vSave');
  const btnRefresh = el.querySelector('#vRefresh');
  const grid = el.querySelector('#vGrid');

  function apiBase(){ const o=window.location.origin; if(!o||o==='null'||o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  async function fetchVars(){ try{ const r=await fetch(apiBase()+"/api/vars"); const j=await r.json(); return j?.vars||{}; }catch{ return {}; } }
  async function postYaml(url, obj){
    const yaml = (o)=>{ const lines=[]; for(const [k,v] of Object.entries(o||{})){
      if(Array.isArray(v)){ lines.push(`${k}:`); v.forEach(it=> lines.push(`  - ${JSON.stringify(it)}`)); }
      else if(typeof v==='object' && v){ lines.push(`${k}:`); for(const [k2,v2] of Object.entries(v)) lines.push(`  ${k2}: ${JSON.stringify(v2)}`); }
      else { lines.push(`${k}: ${JSON.stringify(v)}`); }
    } return lines.join('\n'); };
    return await fetch(url, { method:'POST', headers:{ 'Content-Type':'text/yaml' }, body: yaml(obj) });
  }

  let model = {}; // key -> value
  const rows = new Map(); // key -> { keyEl, valEl, wrap }

  function render(){
    grid.innerHTML = '';
    const keys = Object.keys(model).sort((a,b)=> a.localeCompare(b));
    for (const k of keys){ addRow(k, model[k]); }
  }

  function addRow(k='', v=''){
    const wrap = document.createElement('div'); wrap.className = 'var';
    const keyEl = document.createElement('input'); keyEl.className='input key'; keyEl.value = k; keyEl.placeholder='name';
    const valEl = document.createElement('input'); valEl.className='input val'; valEl.value = v; valEl.placeholder='value';
    const delBtn = document.createElement('button'); delBtn.className='btn'; delBtn.textContent='Delete';
    delBtn.addEventListener('click', ()=>{ wrap.remove(); rows.delete(k); delete model[k]; try{ context?.bus?.emit('vars:changed'); }catch{} });
    keyEl.addEventListener('input', ()=>{ const newKey = keyEl.value.trim(); if (newKey && newKey!==k){ delete model[k]; model[newKey]=valEl.value; rows.delete(k); rows.set(newKey, { keyEl, valEl, wrap }); k=newKey; } });
    valEl.addEventListener('input', ()=>{ if (k) model[k] = valEl.value; });
    wrap.append(keyEl, valEl, delBtn);
    grid.appendChild(wrap);
    rows.set(k, { keyEl, valEl, wrap });
  }

  btnAdd.addEventListener('click', ()=>{ addRow('', ''); });
  btnRefresh.addEventListener('click', async ()=>{ model = await fetchVars(); render(); });
  btnSave.addEventListener('click', async ()=>{
    // Read current DOM rows to compute sets/unsets
    const domRows = Array.from(grid.querySelectorAll('.var'));
    const next = {};
    for (const r of domRows){ const k = r.querySelector('.key').value.trim(); if (!k) continue; next[k] = r.querySelector('.val').value; }
    const to_set = {};
    const to_unset = [];
    // Detect changes and deletions
    const prev = model || {};
    for (const [k,v] of Object.entries(next)){ if (prev[k] !== v) to_set[k] = v; }
    for (const k of Object.keys(prev)){ if (!(k in next)) to_unset.push(k); }
    try {
      if (Object.keys(to_set).length || to_unset.length){
        await postYaml(apiBase()+"/api/vars", { set: to_set, unset: to_unset });
        model = next; // update local
        // Notify others
        try{ context?.bus?.emit('vars:changed'); }catch{}
      }
    } catch (e) { console.error('[Chronos][Vars] save failed:', e); }
  });

  btnMin.addEventListener('click', ()=>{ const c=el.querySelector('.content'); if(!c) return; c.style.display = (c.style.display==='none'?'':'none'); });
  btnClose.addEventListener('click', ()=>{ el.style.display='none'; });

  // Initial load
  (async ()=>{ model = await fetchVars(); render(); })();
}

