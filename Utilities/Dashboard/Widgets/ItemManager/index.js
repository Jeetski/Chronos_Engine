export function mount(el) {
  const tpl = `
    <style>
      .im-content { display:flex; flex-direction:column; gap:8px; height:100%; min-height:0; }
      .im-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .im-toolbar .spacer { flex:1 1 100%; height:0; }
      .im-body { display:flex; flex:1 1 0; gap:8px; min-height:260px; height:100%; width:100%; overflow:hidden; }
      .im-list-pane { flex:1 1 45%; min-width:240px; min-height:0; display:flex; flex-direction:column; border:1px solid var(--border); border-radius:8px; padding:6px; background:#0f141d; overflow:hidden; }
      .im-list-header { display:grid; grid-template-columns: 26px repeat(5, 1fr); gap:6px; align-items:center; padding:4px 6px; border-bottom:1px solid #222835; color:var(--text); }
      .im-list-header span { cursor:pointer; font-weight:600; font-size:12px; }
      .im-rows { flex:1 1 0; min-height:0; overflow:auto; display:flex; flex-direction:column; gap:4px; }
      .im-row { display:grid; grid-template-columns: 26px repeat(5, 1fr); gap:6px; align-items:center; padding:6px; border:1px solid #222835; border-radius:6px; background:#101623; color:var(--text); }
      .im-row .name { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .im-row .meta { color:var(--text-dim); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .im-right { flex:1 1 55%; min-width:260px; min-height:0; display:flex; flex-direction:column; gap:6px; overflow:hidden; }
      .im-yaml { flex:1 1 0; min-height:120px; resize:none; }
    </style>
    <div class="header" id="imHeader">
      <div class="title">Item Manager</div>
      <div class="controls">
        <button class="icon-btn" id="imMin" title="Minimize">_</button>
        <button class="icon-btn" id="imClose" title="Close">x</button>
      </div>
    </div>
    <div class="content im-content" id="imContent">
      <div class="row im-toolbar">
        <select id="imType" class="input" style="max-width:180px; flex:0 0 auto;"></select>
        <input id="imSearch" class="input" placeholder="Search name or content..." style="flex:1 1 260px; min-width:200px;" />
        <button class="btn" id="imSearchBtn" style="flex:0 0 auto;">Search</button>
        <button class="btn" id="imRefresh" style="flex:0 0 auto;">Refresh</button>
        <div class="spacer"></div>
        <button class="btn" id="imExport" style="flex:0 0 auto;">Export</button>
        <button class="btn" id="imBulkSet" style="flex:0 0 auto;">Set Property</button>
        <button class="btn btn-secondary" id="imBulkDelete" style="flex:0 0 auto;">Delete Selected</button>
        <button class="btn btn-primary" id="imNew" style="flex:0 0 auto;">New</button>
        <label class="hint" style="display:flex; align-items:center; gap:6px;"><input type="checkbox" id="imFxToggle" checked /> fx</label>
      </div>
      <div class="im-body" id="imSplit">
        <div id="imListPane" class="im-list-pane">
          <div id="imCount" class="hint" style="margin-bottom:6px; color:var(--text-dim);"></div>
          <div class="im-list-header">
            <label><input type="checkbox" id="imSelectAll" /></label>
            <span data-key="name">Name</span>
            <span data-key="priority">Priority</span>
            <span data-key="status">Status</span>
            <span data-key="category">Category</span>
            <span data-key="updated">Updated</span>
          </div>
          <div class="im-rows" id="imList"></div>
        </div>
        <div id="imRightPane" class="im-right">
          <div class="row" style="gap:6px;">
            <input id="imItemName" class="input" placeholder="Item name" />
          </div>
          <textarea id="imYaml" class="textarea im-yaml" placeholder="YAML properties..."></textarea>
          <div class="row" style="gap:8px;">
            <button class="btn" id="imSave">Save</button>
            <button class="btn" id="imCopy">Copy</button>
            <button class="btn" id="imRename">Rename</button>
            <button class="btn btn-secondary" id="imDelete">Delete</button>
          </div>
        </div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const header = el.querySelector('#imHeader');
  const btnMin = el.querySelector('#imMin');
  const btnClose = el.querySelector('#imClose');
  const typeSel = el.querySelector('#imType');
  const searchEl = el.querySelector('#imSearch');
  const refreshBtn = el.querySelector('#imRefresh');
  const searchBtn = el.querySelector('#imSearchBtn');
  const contentEl = el.querySelector('#imContent');
  const listEl = el.querySelector('#imList');
  const countEl = el.querySelector('#imCount');
  const nameEl = el.querySelector('#imItemName');
  const yamlEl = el.querySelector('#imYaml');
  const saveBtn = el.querySelector('#imSave');
  const newBtn = el.querySelector('#imNew');
  const bulkDeleteBtn = el.querySelector('#imBulkDelete');
  const bulkSetBtn = el.querySelector('#imBulkSet');
  const exportBtn = el.querySelector('#imExport');
  const selectAll = el.querySelector('#imSelectAll');
  const copyBtn = el.querySelector('#imCopy');
  const renameBtn = el.querySelector('#imRename');
  const deleteBtn = el.querySelector('#imDelete');
  const fxChk = el.querySelector('#imFxToggle');

  // Minimize/Close (match other widgets)
  btnMin.addEventListener('click', ()=>{ el.classList.toggle('minimized'); });
  btnClose.addEventListener('click', ()=>{ el.style.display='none'; try{ window?.ChronosBus?.emit?.('widget:closed','ItemManager'); }catch{} });

  let fxEnabled = fxChk ? fxChk.checked : true;
  function expandText(s){ try { return (fxEnabled && window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s||'')) : String(s||''); } catch { return String(s||''); } }
  fxChk?.addEventListener('change', ()=>{ fxEnabled = !!fxChk.checked; try{ refresh(); }catch{} });

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  const saveLocal = (k,v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} };
  const loadLocal = (k,f)=>{ try{ const v=localStorage.getItem(k); return v? JSON.parse(v): f; }catch{ return f; } };
  const defaultsCache = {};

  const fetchJson = async (url)=>{ const r = await fetch(url); return await r.json(); };
  const fetchSettingsFile = async (file)=>{
    try {
      const j = await fetchJson(apiBase()+`/api/settings?file=${encodeURIComponent(file)}`);
      return j && j.content ? String(j.content) : null;
    } catch { return null; }
  };
  function parseYamlFlat(yaml){
    const lines = String(yaml||'').replace(/\r\n?/g,'\n').split('\n');
    const out = {}; let curKey=null, inBlock=false;
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
        out[k]=v;
      }
    }
    return out;
  }
  async function fetchDefaultsFor(type){
    const key = String(type||'task').toLowerCase();
    if (defaultsCache[key]) return defaultsCache[key];
    const lower = key;
    const title = lower.split('_').map(s=> s.charAt(0).toUpperCase()+s.slice(1)).join('_');
    const candidates = [
      `${lower}_defaults.yml`,
      `${title}_Defaults.yml`,
      `${title}_defaults.yml`,
    ];
    for (const f of candidates){
      const y = await fetchSettingsFile(f);
      if (y){
        try{
          const raw = parseYamlFlat(y) || {};
          const now = new Date();
          const placeholders = {
            '{{timestamp}}': `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`,
            '{{tomorrow}}': (()=>{ const t=new Date(now.getTime()+86400000); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; })(),
          };
          const norm = {};
          Object.entries(raw).forEach(([k,v])=>{
            let val = v;
            if (typeof val === 'string'){
              Object.entries(placeholders).forEach(([ph,repl])=>{ val = val.replaceAll(ph,repl); });
            }
            const kk = String(k||'').toLowerCase().replace(/^default_/, '');
            norm[kk] = val;
          });
          defaultsCache[key] = norm;
          return norm;
        }catch{ return {}; }
      }
    }
    defaultsCache[key] = {};
    return {};
  }

  // Types: prefer server; fall back to defaults
  const DEFAULT_TYPES = ['task','note','habit','project','routine','journal_entry','dream_diary_entry','appointment','alarm','reminder','reward','commitment'];
  function renderTypes(types){
    const uniq = Array.from(new Set(types.concat(DEFAULT_TYPES)));
    typeSel.innerHTML = '';
    uniq.forEach(t=>{ const opt=document.createElement('option'); opt.value=t; opt.textContent=t; typeSel.appendChild(opt); });
    const stored = loadLocal('im_type', 'task');
    typeSel.value = uniq.includes(stored) ? stored : uniq[0];
  }
  async function fetchTypes(){
    try{
      const resp = await fetch(apiBase()+"/api/items?type=task");
      const text = await resp.text();
      try{
        const data = JSON.parse(text);
        if (data && data.items && Array.isArray(data.items)) {
          const inferred = Array.from(new Set(data.items.map(i=>i.type).filter(Boolean)));
          if (inferred.length){ renderTypes(inferred); return; }
        }
      }catch{}
    }catch{}
    renderTypes([]);
  }

  // Sorting
  let sortKey = 'updated';
  let sortDir = 'desc';
  el.querySelectorAll('.im-list-header span[data-key]').forEach(span=>{
    span.addEventListener('click', ()=>{
      const key = span.getAttribute('data-key') || 'name';
      if (sortKey === key){ sortDir = sortDir === 'asc' ? 'desc' : 'asc'; } else { sortKey = key; sortDir = 'asc'; }
      refresh();
    });
  });

  async function fetchItems(){
    const type = typeSel.value || 'task';
    const q = searchEl.value||'';
    saveLocal('im_type', type); saveLocal('im_search', q);
    try{
      const resp = await fetch(apiBase()+`/api/items?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`);
      const data = await resp.json();
      if (data && data.items && Array.isArray(data.items)){
        return data.items.map(it=>({
          name: expandText(it.name||''),
          rawName: it.name||'',
          priority: it.priority||'',
          status: it.status||'',
          category: it.category||'',
          updated: it.updated||'',
        }));
      }
    }catch{}
    return [];
  }

  function renderItems(items){
    items.sort((a,b)=>{
      const av = (a[sortKey]||'').toString().toLowerCase();
      const bv = (b[sortKey]||'').toString().toLowerCase();
      if (av===bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sortDir==='asc' ? cmp : -cmp;
    });
    countEl.textContent = `${items.length} items`;
    listEl.innerHTML='';
    if (!items.length){
      const tr=document.createElement('tr');
      const td=document.createElement('td');
      td.colSpan = 6;
      td.className='hint';
      td.textContent = 'No items found. Try another type or search.';
      tr.appendChild(td);
      listEl.appendChild(tr);
      return;
    }
    items.forEach(it=>{
      const row=document.createElement('div');
      row.className='im-row';
      row.innerHTML = `
        <label><input type="checkbox" /></label>
        <div class="name">${it.name}</div>
        <div class="meta">${it.priority||''}</div>
        <div class="meta">${it.status||''}</div>
        <div class="meta">${it.category||''}</div>
        <div class="meta">${it.updated||''}</div>
      `;
      row.dataset.name = it.rawName;
      row.addEventListener('click', (ev)=>{ if (ev.target.tagName.toLowerCase() !== 'input') loadItem(it.rawName); });
      listEl.appendChild(row);
    });
  }

  function toYaml(val, indent=0){
    const pad = '  '.repeat(indent);
    if (val === null || val === undefined) return 'null';
    if (Array.isArray(val)){
      if (!val.length) return '[]';
      return val.map(v=>{
        if (typeof v === 'object' && v !== null){
          const sub = toYaml(v, indent+1);
          return `${pad}- ${sub.includes('\n')? `\n${sub}` : sub.trim()}`;
        }
        return `${pad}- ${scalar(v)}`;
      }).join('\n');
    }
    if (typeof val === 'object'){
      const entries = Object.entries(val);
      if (!entries.length) return '{}';
      return entries.map(([k,v])=>{
        const key = `${pad}${k}:`;
        if (typeof v === 'object' && v !== null){
          const sub = toYaml(v, indent+1);
          return `${key}${sub.includes('\n')? `\n${sub}` : ` ${sub.trim()}`}`;
        }
        return `${key} ${scalar(v)}`;
      }).join('\n');
    }
    return scalar(val);
    function scalar(v){
      if (typeof v === 'string'){
        if (v.includes('\n')){
          const lines = v.split('\n').map(l=> `${pad}  ${l}`).join('\n');
          return `|\n${lines}`;
        }
        return v;
      }
      if (typeof v === 'boolean' || typeof v === 'number') return String(v);
      return String(v || '');
    }
  }

  async function refresh(){
    const items = await fetchItems();
    renderItems(items);
  }

  async function loadItem(name){
    nameEl.value = name;
    try{
      const resp = await fetch(apiBase()+`/api/item?type=${encodeURIComponent(typeSel.value||'task')}&name=${encodeURIComponent(name)}`);
      const text = await resp.text();
      try{
        const json = JSON.parse(text);
        if (json && (json.content || json.item)) {
          const raw = json.content || json.item;
          yamlEl.value = (typeof raw === 'string') ? raw : toYaml(raw);
          return;
        }
        if (json && json.text) { yamlEl.value = json.text; return; }
      }catch{}
      // If server returned YAML/flat data, keep raw
      yamlEl.value = text || '';
    }catch{ yamlEl.value=''; }
  }

  async function saveItem(){
    const name = nameEl.value.trim();
    if (!name){ alert('Name required'); return; }
    try{
      const type = typeSel.value||'task';
      const payload = { type, name, content: yamlEl.value };
      await fetch(apiBase()+`/api/item`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      refresh();
    }catch{ alert('Save failed'); }
  }

  async function copyItem(){
    const src = nameEl.value.trim();
    if (!src) { alert('Load an item first.'); return; }
    const dest = prompt('Copy as:', `${src} copy`);
    if (!dest) return;
    try{
      await fetch(apiBase()+`/api/item/copy`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type: typeSel.value||'task', source: src, new_name: dest }) });
      await refresh(); await loadItem(dest);
    }catch{ alert('Copy failed'); }
  }

  async function renameItem(){
    const src = nameEl.value.trim();
    if (!src) { alert('Load an item first.'); return; }
    const dest = prompt('Rename to:', src);
    if (!dest || dest===src) return;
    try{
      await fetch(apiBase()+`/api/item/rename`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type: typeSel.value||'task', old_name: src, new_name: dest }) });
      nameEl.value = dest;
      await refresh(); await loadItem(dest);
    }catch{ alert('Rename failed'); }
  }

  async function deleteItem(name){
    try{ await fetch(apiBase()+`/api/item/delete`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type: typeSel.value||'task', name }) }); }catch{}
  }

  async function deleteSelected(){
    const rows = Array.from(listEl.querySelectorAll('.im-row'));
    const selected = rows.filter(r=> r.querySelector('input[type=checkbox]')?.checked).map(r=> r.dataset.name).filter(Boolean);
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} items?`)) return;
    for (const name of selected){ await deleteItem(name); }
    refresh();
  }

  async function bulkSetProp(){
    const rows = Array.from(listEl.querySelectorAll('tr'));
    const selected = rows.filter(r=> r.querySelector('input[type=checkbox]')?.checked).map(r=> r.dataset.name).filter(Boolean);
    if (!selected.length) { alert('Select at least one item.'); return; }
    const kv = prompt('Set property (key:value)', 'status:pending');
    if (!kv || !kv.includes(':')) return;
    const [k,...rest] = kv.split(':'); const v = rest.join(':').trim();
    try{
      await fetch(apiBase()+`/api/items/setprop`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type: typeSel.value||'task', names: selected, property: k.trim(), value: v }) });
      refresh();
    }catch{ alert('Set property failed'); }
  }

  async function exportItems(){
    try{
      const resp = await fetch(apiBase()+`/api/items/export`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type: typeSel.value||'task' }) });
      const text = await resp.text();
      alert(`Export result: ${text}`);
    }catch{ alert('Export failed'); }
  }

  async function prepNewWithDefaults(){
    const type = typeSel.value || 'task';
    const defs = await fetchDefaultsFor(type);
    const base = Object.assign({ type, name: '', duration: 0 }, defs||{});
    // Only include type if absent in defaults to avoid double-listing
    if (!base.type) base.type = type;
    if (base.name === undefined) base.name = '';
    yamlEl.value = toYaml(base);
    nameEl.value = '';
    nameEl.focus();
  }

  // Events
  newBtn.addEventListener('click', ()=>{ prepNewWithDefaults(); });
  saveBtn.addEventListener('click', saveItem);
  copyBtn.addEventListener('click', copyItem);
  renameBtn.addEventListener('click', renameItem);
  deleteBtn.addEventListener('click', async ()=>{ if (!nameEl.value.trim()) return; if (!confirm('Delete this item?')) return; await deleteItem(nameEl.value.trim()); refresh(); });
  searchBtn.addEventListener('click', refresh);
  searchEl.addEventListener('keypress', (e)=>{ if(e.key==='Enter') refresh(); });
  refreshBtn.addEventListener('click', refresh);
  bulkDeleteBtn.addEventListener('click', deleteSelected);
  bulkSetBtn.addEventListener('click', bulkSetProp);
  exportBtn.addEventListener('click', exportItems);
  selectAll.addEventListener('change', ()=>{ listEl.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = selectAll.checked); });
  typeSel.addEventListener('change', refresh);

  // Init
  fetchTypes().then(()=>{ searchEl.value = loadLocal('im_search',''); refresh(); });

  return { refresh };
}
