export async function mount(el, context){
  const css = `
    .tb { display:flex; gap:10px; height:100%; }
    .col { background: rgba(21,25,35,0.85); border: 1px solid #222835; border-radius: 8px; padding: 10px; overflow:auto; }
    .col.left{ width: 28%; }
    .col.center{ width: 44%; }
    .col.right{ width: 28%; }
    .row{ display:flex; gap:8px; align-items:center; }
    .list{ display:flex; flex-direction:column; gap:6px; }
    .item{ position:relative; padding:8px; border:1px solid #2b3343; border-radius:6px; background:#0f141d; cursor:pointer; }
    .item.sel{ outline: 2px solid #7aa2f7; }
    .badge { position:absolute; right:8px; top:8px; font-size:11px; color:#a6adbb; background:#101623; border:1px solid #253049; padding:2px 6px; border-radius:6px; }
    .drop-hint-before { box-shadow: inset 0 2px 0 0 #7aa2f7; }
    .drop-hint-after { box-shadow: inset 0 -2px 0 0 #7aa2f7; }
    .drop-hint-into { outline: 2px dashed #7aa2f7; }
    .drop-hint-outdent { box-shadow: inset 4px 0 0 0 #7aa2f7; }
    .btn{ background: linear-gradient(180deg, #1a2130, #151b28); color:#e6e8ef; border:1px solid #222835; border-radius:8px; padding:6px 10px; cursor:pointer; }
    .input, select{ background:#0f141d; color:#e6e8ef; border:1px solid #222835; border-radius:6px; padding:6px 8px; }
    .toast { position: fixed; top: 70px; right: 20px; background: rgba(21,25,35,0.96); color:#e6e8ef; border:1px solid #2b3343; border-radius:8px; padding:8px 12px; z-index: 10000; box-shadow: 0 4px 14px rgba(0,0,0,0.4); font-size: 13px; }
  `;
  const style = document.createElement('style'); style.textContent = css; el.appendChild(style);
  el.innerHTML += `
    <div class="tb">
      <div class="col left">
        <div class="row"><strong>Library</strong><span class="spacer"></span></div>
        <div class="row" style="gap:6px; margin:8px 0;">
          <select id="libType">
            <option value="item">item</option>
            <option value="microroutine">microroutine</option>
            <option value="subroutine">subroutine</option>
            <option value="routine">routine</option>
            <option value="day">day</option>
            <option value="week">week</option>
          </select>
          <input id="libSearch" class="input" placeholder="Search..." style="flex:1"/>
        </div>
        <div class="row" style="gap:6px; margin:-4px 0 8px 0;">
          <select id="libSubtype" style="display:none; width:100%;"></select>
        </div>
        <div id="libList" class="list"></div>
        <div class="row" style="margin-top:8px;">
          <button class="btn" id="btnNew">New Item/Templateâ€¦</button>
        </div>
      </div>
      <div class="col center">
        <div class="row" style="gap:8px; align-items:center; margin-bottom:8px;">
          <strong>Template</strong>
          <select id="tplType">
            <option value="routine">routine</option>
            <option value="subroutine">subroutine</option>
            <option value="microroutine">microroutine</option>
            <option value="day">day</option>
            <option value="week">week</option>
          </select>
          <select id="tplName" style="flex:1"></select>
          <button class="btn" id="btnLoad">Load</button>
          <button class="btn" id="btnSave">Save</button>  <label class="hint" style="display:flex; align-items:center; gap:6px;"><input type="checkbox" id="tplExpandToggle" checked /> fx</label>
        </div>
        <div id="tree" class="list"></div>
      </div>
      <div class="col right">
        <div class="row"><strong>Inspector</strong></div>
        <div class="row" style="margin-top:8px; gap:6px;">
          <label style="width:100px">Type</label><input id="propType" class="input"/>
        </div>
        <div class="row" style="margin-top:6px; gap:6px;">
          <label style="width:100px">Name</label><input id="propName" class="input"/>
        </div>
        <div class="row" style="margin-top:6px; gap:6px;">
          <label style="width:100px">Duration</label><input id="propDuration" class="input" placeholder="minutes or 'parallel'"/>
        </div>
        <div class="row" style="margin-top:6px; gap:6px;">
          <label style="width:100px">Start</label><input id="propStart" class="input" placeholder="HH:MM"/>
        </div>
        <div class="row" style="margin-top:6px; gap:6px;">
          <label style="width:100px">End</label><input id="propEnd" class="input" placeholder="HH:MM"/>
        </div>
        <div class="row" style="margin-top:10px; gap:6px; align-items:flex-start;">
          <label style="width:100px; padding-top:6px;">Depends on</label>
          <select id="propDepends" multiple size="5" style="flex:1; min-height:120px;"></select>
        </div>
        <div class="row" style="margin-top:10px; gap:8px;">
          <button class="btn" id="btnApply">Apply</button>
          <button class="btn" id="btnDel">Delete</button>
          <button class="btn" id="btnUp">â†‘</button>
          <button class="btn" id="btnDown">â†“</button>
        </div>
      </div>
    </div>
  `;

  // Tiny toast helper
  function showToast(msg){
    try {
      const old = document.querySelector('.toast'); if (old) old.remove();
      const t = document.createElement('div'); t.className='toast'; t.textContent = String(msg||'');
      document.body.appendChild(t);
      setTimeout(()=>{ try{ t.remove(); }catch{} }, 1800);
    } catch {}
  }

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  async function fetchJson(url){ const r = await fetch(url); return await r.json(); }
  async function postYaml(url, obj){
    const yaml = (o)=>{
      // naive YAML emitter for simple maps
      const lines=[]; for(const [k,v] of Object.entries(o)){
        if(Array.isArray(v)) { lines.push(`${k}:`); for(const it of v){ lines.push(`  - ${JSON.stringify(it)}`);} }
        else if(typeof v==='object' && v){ lines.push(`${k}:`); for(const [k2,v2] of Object.entries(v)){ lines.push(`  ${k2}: ${JSON.stringify(v2)}`);} }
        else { lines.push(`${k}: ${JSON.stringify(v)}`); }
      } return lines.join('\n'); };
    return await fetch(url, { method:'POST', headers:{ 'Content-Type':'text/yaml' }, body: yaml(obj) });
  }

  const libType = el.querySelector('#libType');
  const libSubtype = el.querySelector('#libSubtype');
  const libSearch = el.querySelector('#libSearch');
  const libList = el.querySelector('#libList');
  const btnNew = el.querySelector('#btnNew');
  try { if (btnNew) btnNew.textContent = 'New Item/Template…'; } catch {}
  const tplType = el.querySelector('#tplType');
  const tplName = el.querySelector('#tplName');
  const btnLoad = el.querySelector('#btnLoad');
  const btnSave = el.querySelector('#btnSave');
  const expandToggle = el.querySelector('#tplExpandToggle');
  const treeEl = el.querySelector('#tree');
  const propType = el.querySelector('#propType');
  const propName = el.querySelector('#propName');
  const propDuration = el.querySelector('#propDuration');
  const propStart = el.querySelector('#propStart');
  const propEnd = el.querySelector('#propEnd');
  const propDepends = el.querySelector('#propDepends');
  const btnApply = el.querySelector('#btnApply');
  const btnDel = el.querySelector('#btnDel');
  const btnUp = el.querySelector('#btnUp');
  const btnDown = el.querySelector('#btnDown');
  // Add indent/outdent buttons near Up/Down
  const indentBtn = document.createElement('button'); indentBtn.className='btn'; indentBtn.textContent='>>'; indentBtn.title='Indent (make child of previous)';
  const outdentBtn = document.createElement('button'); outdentBtn.className='btn'; outdentBtn.textContent='<<'; outdentBtn.title='Outdent (lift to parent)';
  try { btnDown.parentElement.appendChild(indentBtn); btnDown.parentElement.appendChild(outdentBtn); } catch{}
  // Replace propType input with select and insert Mode selector
  try {
    let _propType = el.querySelector('#propType');
    if (_propType && _propType.tagName && _propType.tagName.toLowerCase()==='input'){
      const sel = document.createElement('select'); sel.id='propType'; sel.className='input';
      _propType.parentElement.replaceChild(sel, _propType);
    }
    const _propDuration = el.querySelector('#propDuration');
    const row = _propDuration?.parentElement;
    if (row && !row.querySelector('#propMode')){
      const label = document.createElement('label'); label.style.width='100px'; label.textContent='Mode';
      const sel = document.createElement('select'); sel.id='propMode'; sel.className='input'; sel.style.width='130px';
      const o1=document.createElement('option'); o1.value='sequential'; o1.textContent='Sequential';
      const o2=document.createElement('option'); o2.value='parallel'; o2.textContent='Parallel';
      sel.append(o1,o2);
      const dlab = document.createElement('label'); dlab.style.width='80px'; dlab.style.textAlign='right'; dlab.textContent='Duration';
      row.insertBefore(dlab, _propDuration);
      row.insertBefore(sel, dlab);
      row.insertBefore(label, sel);
      try { _propDuration.placeholder = 'minutes (integer)'; } catch{}
    }
  } catch{}

  let library = [];
  let children = [];
  let selIdx = -1;
  let selPath = '';
  let expandFx = true;
  function maybeExpand(s){ try { if (!expandFx) return String(s||''); return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s||'')) : String(s||''); } catch { return String(s||''); } }
  try { expandToggle?.addEventListener('change', ()=>{ expandFx = !!expandToggle.checked; renderTree(); renderTreeNested?.(); }); } catch {}

  function pathToArray(p){ if(!p) return []; return p.split('.').map(s=> parseInt(s,10)); }
  function getByPath(arr, path){
    const idxs = pathToArray(path);
    let node=null, parentArray=arr, parent=null, parentPath='';
    for(let i=0;i<idxs.length;i++){
      const k = idxs[i]; if(!Array.isArray(parentArray) || k<0 || k>=parentArray.length) return {node:null,parent:null,parentArray:null,index:-1,parentPath:''};
      parent = (i===0? null : node);
      node = parentArray[k];
      if(i<idxs.length-1){ if(!Array.isArray(node.children)) node.children=[]; parentArray=node.children; parentPath = parentPath ? (parentPath+'.'+k) : String(k); }
    }
    return { node, parent, parentArray, index: (idxs.length? idxs[idxs.length-1] : -1), parentPath };
  }
  function removeAtPath(arr, path){ const r=getByPath(arr,path); if(!r.parentArray || r.index<0) return null; return r.parentArray.splice(r.index,1)[0]; }
  function insertAt(arr, parentPath, index, node){ if(!parentPath){ children.splice(index,0,node); return; } const pr=getByPath(arr,parentPath); if(!pr.node) return; if(!Array.isArray(pr.node.children)) pr.node.children=[]; pr.node.children.splice(index,0,node); }
  function ensureChildrenOnTree(arr){ (arr||[]).forEach(n=>{ if(!Array.isArray(n.children)) n.children=[]; ensureChildrenOnTree(n.children); }); }

  // --- Duration preview helpers ---
  function isParallel(node){ return String(node?.duration||'').toLowerCase()==='parallel'; }
  function numDur(node){ const d = node?.duration; return (typeof d==='number' && isFinite(d)) ? d : 0; }
  function effectiveMinutes(node){
    if (!node) return 0;
    const own = numDur(node);
    const kids = Array.isArray(node.children) ? node.children : [];
    if (!kids.length) return own;
    const childTimes = kids.map(effectiveMinutes);
    if (isParallel(node)) return Math.max(own, ...(childTimes.length?childTimes:[0]));
    let sum = own; for (const t of childTimes) sum += t; return sum;
  }
  function computeDurationsMap(){
    const map = new Map();
    const walk = (arr, base)=>{
      (arr||[]).forEach((n,i)=>{
        const p = base? base+'.'+i : String(i);
        map.set(p, effectiveMinutes(n));
        if (Array.isArray(n.children) && n.children.length) walk(n.children, p);
      });
    };
    walk(children, '');
    return map;
  }

  // --- Nesting rules (A): cannot nest a bigger template under a smaller one ---
  function typeRank(t){
    const k = String(t||'').toLowerCase();
    if (k==='week') return 5;
    if (k==='day') return 4;
    if (k==='routine') return 3;
    if (k==='subroutine') return 2;
    if (k==='microroutine') return 1;
    // treat tasks/notes/other leaves as 0
    return 0;
  }
  function canNest(parentType, childType){
    const rp = typeRank(parentType);
    const rc = typeRank(childType);
    // Disallow equal-ranked templates nesting into themselves (for template kinds rank>=1)
    if (rc >= 1 && rp === rc) return false;
    return rp >= rc;
  }
  // Allowed child types for a given parent template type
  function allowedChildTypesFor(parentType){
    const k = String(parentType||'').toLowerCase();
    const leaves = ITEM_TYPES;
    if (k==='week') return ['day','routine','subroutine','microroutine', ...leaves];
    if (k==='day') return ['routine','subroutine','microroutine', ...leaves];
    if (k==='routine') return ['subroutine','microroutine', ...leaves];
    if (k==='subroutine') return ['microroutine', ...leaves];
    if (k==='microroutine') return [...leaves];
    return [...leaves];
  }
  function populateTypeOptions(selectEl, parentType, currentType){
    if (!selectEl) return;
    const opts = allowedChildTypesFor(parentType);
    selectEl.innerHTML='';
    for (const t of opts){ const o=document.createElement('option'); o.value=t; o.textContent=t; selectEl.appendChild(o); }
    if (currentType){ selectEl.value = opts.includes(String(currentType).toLowerCase()) ? String(currentType).toLowerCase() : opts[0]; }
  }
  function getTypeForPath(path){
    if (!path) return String(tplType.value||'');
    const r = getByPath(children, path);
    return String(r?.node?.type||'');
  }
  function getParentTypeForPath(path){
    const parentPath = (path||'').split('.').slice(0,-1).join('.');
    return parentPath ? getTypeForPath(parentPath) : String(tplType.value||'');
  }

  function renderLib(){
    libList.innerHTML = '';
    const q = (libSearch.value||'').toLowerCase();
    const sub = (libSubtype && libSubtype.style.display!=="none") ? (libSubtype.value||'all').toLowerCase() : 'all';
    library
      .filter(it=> !q || String(it.name||'').toLowerCase().includes(q) || String(it.type||'').toLowerCase().includes(q))
      .filter(it=> sub==='all' || String(it.type||'').toLowerCase()===sub)
      .forEach(({name,type}) =>{
      const div = document.createElement('div');
      div.className = 'item';
      function __exp(s){ try { return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s||'')) : String(s||''); } catch { return String(s||''); } }
      const dispName = __exp(name);
      div.textContent = `${dispName} (${type})`;
      try { if (dispName !== String(name)) div.title = String(name); } catch {}
      div.title = 'Click to add to template (or inspect if incompatible)';
      div.addEventListener('click', async ()=>{
        const pt = String(tplType.value||'');
        const ct = String(type||'');
        if (!canNest(pt, ct)) {
          const rp = typeRank(pt), rc = typeRank(ct);
          const reason = (rp===rc && rc>=1) ? 'same kind cannot be nested' : 'parent smaller than child';
          try { showToast(`Cannot add ${ct} under ${pt}: ${reason}.`); } catch {}
          // Show in inspector without adding
          try {
            const j = await fetchJson(apiBase()+`/api/item?type=${encodeURIComponent(ct)}&name=${encodeURIComponent(name)}`);
            if (j && j.item) {
              propType.value = j.item.type || ct;
              propName.value = j.item.name || name;
              propDuration.value = String(j.item.duration ?? '');
              propStart.value = j.item.ideal_start_time || j.item.start_time || '';
              propEnd.value = j.item.ideal_end_time || j.item.end_time || '';
            } else { propType.value = ct; propName.value = name; }
          } catch { propType.value = ct; propName.value = name; }
          return;
        }
        children.push({ name, type: ct, duration: 0 }); selIdx = -1; selPath = String(children.length-1); renderTreeNested();
      });
      libList.appendChild(div);
    });
    // Enable drag from library items into the tree
    try{
      Array.from(libList.querySelectorAll('.item')).forEach(div=>{
        if (div.__dragWired) return; div.__dragWired=true; div.draggable=true;
        const txt=String(div.textContent||''); const m=/(.*) \((.*)\)/.exec(txt)||[]; const nm=(m[1]||'').trim(); const tp=(m[2]||'').trim();
        div.addEventListener('dragstart',(e)=>{ try{ e.dataTransfer.setData('text/chronos-lib', JSON.stringify({name:nm, type:tp})); e.dataTransfer.effectAllowed='copyMove'; }catch{} });
      });
    }catch{}
  }

  function renderTree(){
    treeEl.innerHTML = '';
    children.forEach((ch, i)=>{
      const div = document.createElement('div');
      div.className = 'item' + (i===selIdx ? ' sel' : '');
      const __dn = (function(){ try { return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(ch.name||'')) : String(ch.name||''); } catch { return String(ch.name||''); } })();
      div.innerHTML = `<div><strong>${__dn||''}</strong> <span style=\"opacity:.7\">(${ch.type||''})</span></div>
                       <div style="opacity:.8; font-size:12px;">dur: ${ch.duration ?? ''} start: ${ch.ideal_start_time||''} end: ${ch.ideal_end_time||''}</div>`;
      try { if (__dn !== String(ch.name||'')) div.title = String(ch.name||''); } catch {}
      div.addEventListener('click', ()=>{ selIdx = i; syncInspector(); renderTree(); });

      // Drag & drop reordering (same-level)
      div.draggable = true;
      div.addEventListener('dragstart', (e)=>{
        try { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; } catch{}
        // Visual cue
        div.style.opacity = '0.6';
      });
      div.addEventListener('dragend', ()=>{ div.style.opacity = ''; div.style.outline = ''; });
      div.addEventListener('dragover', (e)=>{ e.preventDefault(); div.style.outline = '1px dashed #7aa2f7'; });
      div.addEventListener('dragleave', ()=>{ div.style.outline = ''; });
      div.addEventListener('drop', (e)=>{
        e.preventDefault(); div.style.outline = ''; div.style.opacity = '';
        let fromIdx = -1; try { fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10); } catch{}
        if (isNaN(fromIdx) || fromIdx<0 || fromIdx>=children.length) return;
        if (fromIdx === i) return;
        // Determine insert position: before/after based on drop Y
        const rect = div.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height/2;
        // Remove source
        const moved = children.splice(fromIdx,1)[0];
        // Compute target index after removal
        let insertAt = i;
        if (!before) insertAt = i; else insertAt = i;
        // If source index was before current target, adjust
        if (fromIdx < i && !before) insertAt = i-0; // dropping after -> same index after removal
        if (fromIdx < i && before) insertAt = i-1;  // dropping before -> one earlier after removal
        if (fromIdx > i && !before) insertAt = i+1; // source after target, drop after -> next slot
        if (fromIdx > i && before) insertAt = i;    // source after target, drop before -> target slot
        insertAt = Math.max(0, Math.min(children.length, insertAt));
        children.splice(insertAt, 0, moved);
        selIdx = insertAt;
        renderTree();
        try { updateTotalDuration(); } catch {}
        syncInspector();
      });
      treeEl.appendChild(div);
    });
  }

  function syncInspector(){
    const ch = selPath ? getByPath(children, selPath).node : (selIdx>=0 ? children[selIdx] : null);
    if (!ch){ try{ propType.value=''; }catch{} try{ propName.value=''; }catch{} try{ if (typeof propMode!== 'undefined' && propMode) propMode.value='sequential'; }catch{} try{ propDuration.value=''; }catch{} try{ propStart.value=''; }catch{} try{ propEnd.value=''; }catch{} return; }
    // Constrain available types based on parent
    try {
      const parentType = selPath ? getParentTypeForPath(selPath) : String(tplType.value||'');
      if (typeof populateTypeOptions === 'function') populateTypeOptions(propType, parentType, ch.type||'');
      else propType.value = ch.type||'';
    } catch { try{ propType.value = ch.type||''; }catch{} }
    try{ propName.value = ch.name||''; }catch{}
    try{
      const isPar = String(ch?.duration||'').toLowerCase()==='parallel';
      if (typeof propMode !== 'undefined' && propMode) propMode.value = isPar ? 'parallel' : 'sequential';
      propDuration.value = isPar ? '' : (typeof ch.duration==='number' ? String(ch.duration) : '');
    }catch{}
    try{ propStart.value = ch.ideal_start_time||''; }catch{}
    try{ propEnd.value = ch.ideal_end_time||''; }catch{}
    // Populate depends_on list from siblings/all nodes
    try {
      propDepends.innerHTML = '';
      const dep = Array.isArray(ch.depends_on) ? ch.depends_on.map(String) : [];
      const stack=[{arr:children, base:''}];
      while(stack.length){ const {arr, base}=stack.pop(); (arr||[]).forEach((node, i)=>{ const p = base? base+'.'+i : String(i); if (p !== selPath){ const o=document.createElement('option'); o.value = node.name||''; o.textContent = `${node.name||''} (${node.type||''})`; if (dep.includes(String(node.name||''))) o.selected=true; propDepends.appendChild(o);} if(Array.isArray(node.children)&&node.children.length){ stack.push({arr:node.children, base:p}); } }); }
    } catch {}
  }

  const ITEM_TYPES = [
    'task','note','goal','habit','appointment','commitment','dream_diary_entry','idea','inventory_item','journal_entry','list','milestone','person','place','plan','project','review','reward','ritual','tool','alarm','reminder'
  ];
  async function loadLib(){
    const sel = String(libType.value||'');
    if (sel === 'item') {
      // Aggregate common leaf item types
      const promises = ITEM_TYPES.map(t=> fetchJson(apiBase()+`/api/items?type=${encodeURIComponent(t)}`).then(j=>({t,items:j?.items||[]})).catch(()=>({t,items:[]})) );
      const groups = await Promise.all(promises);
      const merged = [];
      for (const g of groups){ for (const it of (Array.isArray(g.items)? g.items:[])) { const name = it?.name; if (name) merged.push({ name, type: g.t }); } }
      // Dedupe by (type,name)
      const keyset = new Set(); library = [];
      for (const it of merged){ const k = `${it.type}|${it.name}`.toLowerCase(); if (keyset.has(k)) continue; keyset.add(k); library.push(it); }
      // Build subtype options and show control
      if (libSubtype) {
        const types = Array.from(new Set(library.map(it=> String(it.type||'').toLowerCase()))).sort();
        libSubtype.innerHTML = '';
        const oAll = document.createElement('option'); oAll.value = 'all'; oAll.textContent = 'all item types'; libSubtype.appendChild(oAll);
        types.forEach(t=>{ const o=document.createElement('option'); o.value=t; o.textContent=t; libSubtype.appendChild(o); });
        libSubtype.style.display = '';
      }
    } else {
      const j = await fetchJson(apiBase()+`/api/items?type=${encodeURIComponent(sel)}`);
      const arr = Array.isArray(j?.items) ? j.items : [];
      library = arr.map(it=> ({ name: it?.name, type: sel })).filter(x=> x.name);
      if (libSubtype) libSubtype.style.display = 'none';
    }
    renderLib();
  }

  async function loadNames(){
    const j = await fetchJson(apiBase()+`/api/template/list?type=${encodeURIComponent(tplType.value)}`);
    const arr = Array.isArray(j?.templates) ? j.templates : [];
    tplName.innerHTML = '';
    arr.forEach(n=>{ const o=document.createElement('option'); o.value=o.textContent=n; tplName.appendChild(o); });
  }

  async function loadTemplate(){
    const t = tplType.value, n = tplName.value;
    if(!t||!n) return;
    const j = await fetchJson(apiBase()+`/api/template?type=${encodeURIComponent(t)}&name=${encodeURIComponent(n)}`);
    children = Array.isArray(j?.children) ? j.children : [];
    ensureChildrenOnTree(children);
    selIdx = children.length ? 0 : -1;
    selPath = children.length ? '0' : '';
    syncInspector(); renderTreeNested();
  }

  async function saveTemplate(){
    const t = tplType.value, n = tplName.value;
    if(!t||!n) return;
    await postYaml(apiBase()+`/api/template`, { type:t, name:n, children });
    alert('Template saved.');
  }
  // New/Save As/Delete template helpers
  async function _createNewTemplate(){
    const t = String(tplType.value||'');
    const name = prompt(`New ${t} name:`,'');
    if (!name) return;
    await postYaml(apiBase()+`/api/item`, { type:t, name, properties:{ name, type:t, children: [] } });
    await loadNames();
    tplName.value = name;
    children = [];
    syncInspector(); renderTreeNested();
  }
  async function _saveAsTemplate(){
    const t = String(tplType.value||'');
    const src = String(tplName.value||'');
    const name = prompt(`Save as new ${t} name:`, src ? src+" copy" : '');
    if (!name) return;
    await postYaml(apiBase()+`/api/item/copy`, { type:t, source:src, new_name:name });
    await postYaml(apiBase()+`/api/template`, { type:t, name, children });
    await loadNames(); tplName.value = name; alert('Saved as new template.');
  }
  async function _deleteTemplate(){
    const t = String(tplType.value||'');
    const n = String(tplName.value||'');
    if (!n) return; if (!confirm(`Delete ${t} '${n}'?`)) return;
    await postYaml(apiBase()+`/api/item/delete`, { type:t, name:n });
    await loadNames(); tplName.value = tplName.querySelector('option')?.value || ''; await loadTemplate();
  }

  // Wire events
  libType.addEventListener('change', loadLib);
  if (libSubtype) libSubtype.addEventListener('change', renderLib);
  libSearch.addEventListener('input', renderLib);
  btnNew.addEventListener('click', ()=>{
    // Ask app to show ItemManager widget and pulse it
    try { context?.bus?.emit('widget:show', 'ItemManager'); } catch {}
  });
  tplType.addEventListener('change', loadNames);
  btnLoad.addEventListener('click', loadTemplate);
  btnSave.addEventListener('click', saveTemplate);
  // Normalize Up/Down glyphs and add Duplicate/Undo/Redo buttons
  try { btnUp.textContent='Up'; btnDown.textContent='Down'; } catch {}
  try {
    const row = btnApply.parentElement;
    if (row && !row.querySelector('#btnDup')){
      const btnDup = document.createElement('button'); btnDup.id='btnDup'; btnDup.className='btn'; btnDup.textContent='Duplicate';
      row.insertBefore(btnDup, btnUp);
      btnDup.addEventListener('click', ()=>{ const r = selPath? getByPath(children, selPath) : (selIdx>=0? { parentArray:children, index:selIdx, parentPath:'' } : null); if(!r || !r.parentArray || r.index<0) return; const clone = JSON.parse(JSON.stringify(r.parentArray[r.index])); r.parentArray.splice(r.index+1, 0, clone); selPath = r.parentPath ? (r.parentPath+'.'+String(r.index+1)) : String((selIdx>=0? selIdx+1 : r.index+1)); selIdx=-1; renderTreeNested(); syncInspector(); });
    }
    // Keyboard helpers
    window.addEventListener('keydown', (e)=>{
      if (e.key==='Delete'){ e.preventDefault(); btnDel.click(); }
      else if (e.key==='ArrowUp'){ e.preventDefault(); btnUp.click(); }
      else if (e.key==='ArrowDown'){ e.preventDefault(); btnDown.click(); }
      else if (e.key==='Tab'){ e.preventDefault(); if (e.shiftKey) outdentBtn.click(); else indentBtn.click(); }
    });
  } catch {}
  // Inject toolbar buttons (New/Save As/Delete/Total)
  try {
    const row = btnSave?.parentElement;
    if (row){
      const btnNewTpl = document.createElement('button'); btnNewTpl.className='btn'; btnNewTpl.textContent='New'; btnNewTpl.title='Create new template'; btnNewTpl.addEventListener('click', _createNewTemplate);
      const btnSaveAs = document.createElement('button'); btnSaveAs.className='btn'; btnSaveAs.textContent='Save As'; btnSaveAs.title='Save as new template'; btnSaveAs.addEventListener('click', _saveAsTemplate);
      const btnDeleteTpl = document.createElement('button'); btnDeleteTpl.className='btn'; btnDeleteTpl.textContent='Delete'; btnDeleteTpl.title='Delete current template'; btnDeleteTpl.addEventListener('click', _deleteTemplate);
      const total = document.createElement('span'); total.id='totalDurationLbl'; total.style.marginLeft='auto'; total.style.color='#a6adbb'; total.textContent='Total: 0m';
      row.insertBefore(btnNewTpl, row.firstChild.nextSibling);
      row.insertBefore(btnSaveAs, btnSave.nextSibling);
      row.appendChild(btnDeleteTpl);
      row.appendChild(total);
    }
  } catch {}
  btnApply.addEventListener('click', ()=>{
    const ch = selPath ? getByPath(children, selPath).node : (selIdx>=0 ? children[selIdx] : null); if(!ch) return;
    const newType = String((propType && propType.value) ? propType.value : (ch.type||'')).trim()||ch.type;
    // Enforce nesting rule against current parent
    const parentType = selPath ? getParentTypeForPath(selPath) : String(tplType.value||'');
    if (!canNest(parentType, newType)) { try{ showToast(`Cannot set type '${newType}' under '${parentType}'.`);}catch{} return; }
    ch.type = newType;
    ch.name = (propName?.value||'').trim()||ch.name;
    const mode = (typeof propMode !== 'undefined' && propMode) ? String(propMode.value||'sequential') : 'sequential';
    const dv = String(propDuration?.value||'').trim();
    if (mode==='parallel') ch.duration = 'parallel';
    else if (/^-?\d+$/.test(dv)) ch.duration = parseInt(dv,10); else ch.duration = 0;
    const st = String(propStart?.value||'').trim(); const et = String(propEnd?.value||'').trim();
    if (st && !/^\d{2}:\d{2}$/.test(st)) { showToast('Invalid start time. Use HH:MM.'); return; }
    if (et && !/^\d{2}:\d{2}$/.test(et)) { showToast('Invalid end time. Use HH:MM.'); return; }
    ch.ideal_start_time = st || undefined;
    ch.ideal_end_time = et || undefined;
    // depends_on from selected options
    try {
      const arr = Array.from(propDepends.selectedOptions).map(o=> String(o.value||'')).filter(Boolean);
      ch.depends_on = arr.length ? arr : undefined;
    } catch {}
    renderTreeNested();
  });
  btnDel.addEventListener('click', ()=>{ if(selPath){ removeAtPath(children, selPath); selPath=''; renderTreeNested(); syncInspector(); return;} if(selIdx<0) return; if(!confirm('Delete selected?')) return; children.splice(selIdx,1); selIdx = Math.min(selIdx, children.length-1); renderTreeNested(); syncInspector(); });
  btnUp.addEventListener('click', ()=>{ if(selPath){ const r=getByPath(children, selPath); if(!r.parentArray) return; const i=r.index; if(i>0){ const tmp=r.parentArray[i-1]; r.parentArray[i-1]=r.parentArray[i]; r.parentArray[i]=tmp; selPath = (r.parentPath? r.parentPath+'.':'') + String(i-1); renderTreeNested(); } return;} if(selIdx>0){ const t=children[selIdx-1]; children[selIdx-1]=children[selIdx]; children[selIdx]=t; selIdx--; renderTreeNested(); }});
  btnDown.addEventListener('click', ()=>{ if(selPath){ const r=getByPath(children, selPath); if(!r.parentArray) return; const i=r.index; if(i<r.parentArray.length-1){ const tmp=r.parentArray[i+1]; r.parentArray[i+1]=r.parentArray[i]; r.parentArray[i]=tmp; selPath = (r.parentPath? r.parentPath+'.':'') + String(i+1); renderTreeNested(); } return;} if(selIdx>=0 && selIdx<children.length-1){ const t=children[selIdx+1]; children[selIdx+1]=children[selIdx]; children[selIdx]=t; selIdx++; renderTreeNested(); }});
  indentBtn.addEventListener('click', ()=>{ if(selPath){ const r=getByPath(children, selPath); if(!r.parentArray || r.index<=0) return; const host=r.parentArray[r.index-1]; if (!canNest(host.type, r.node?.type)) { try{ showToast(`Cannot indent: '${r.node?.type||''}' into '${host.type||''}'.`);}catch{} return; } const moved=removeAtPath(children, selPath); if(!moved) return; if(!Array.isArray(host.children)) host.children=[]; host.children.push(moved); selPath = (r.parentPath? r.parentPath+'.':'') + String(r.index-1) + '.' + String(host.children.length-1); renderTreeNested(); syncInspector(); return;} if(selIdx>0){ const host=children[selIdx-1]; const moved=children[selIdx]; if (!canNest(host.type, moved?.type)) { try{ showToast(`Cannot indent: '${moved?.type||''}' into '${host.type||''}'.`);}catch{} return; } children.splice(selIdx,1); if(!Array.isArray(host.children)) host.children=[]; host.children.push(moved); selPath = String(selIdx-1)+'.'+String(host.children.length-1); selIdx=-1; renderTreeNested(); syncInspector(); }});
  outdentBtn.addEventListener('click', ()=>{ if(!selPath) return; const r=getByPath(children, selPath); if(r.parentPath==='') return; const parentInfo = getByPath(children, r.parentPath); const ancestorPath = parentInfo.parentPath; const parentIdx = parentInfo.index; const targetParentType = ancestorPath ? getTypeForPath(ancestorPath) : String(tplType.value||''); if (!canNest(targetParentType, r.node?.type)) { try{ showToast(`Cannot outdent: '${r.node?.type||''}' under '${targetParentType||''}'.`);}catch{} return; } const moved=removeAtPath(children, selPath); if(!moved) return; if(ancestorPath){ const anc = getByPath(children, ancestorPath); if(!anc.parentArray) return; anc.parentArray.splice(parentIdx+1,0,moved); selPath = ancestorPath + '.' + String(parentIdx+1); } else { children.splice(parentIdx+1,0,moved); selPath = String(parentIdx+1); } renderTreeNested(); syncInspector(); });

  // Nested renderer
  function renderTreeNested(){
    treeEl.innerHTML = '';
    const durMap = computeDurationsMap();
    const renderNodes = (arr, basePath, level)=>{
      (arr||[]).forEach((ch, i)=>{
        const path = basePath ? `${basePath}.${i}` : String(i);
        const div = document.createElement('div');
        div.className = 'item' + ((path===selPath) ? ' sel' : '');
        div.style.marginLeft = (level*16)+'px';
        const eff = durMap.get(path) || 0;
        const modeIcon = isParallel(ch) ? '||' : 'sum';
        const __dn2 = (function(){ try { return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(ch.name||'')) : String(ch.name||''); } catch { return String(ch.name||''); } })();
        div.innerHTML = `<div><strong>${__dn2||''}</strong> <span style=\"opacity:.7\">(${ch.type||''})</span></div>
                         <div style=\"opacity:.8; font-size:12px;\">dur: ${ch.duration ?? ''} start: ${ch.ideal_start_time||''} end: ${ch.ideal_end_time||''}</div>
                         <span class=\"badge\" title=\"Computed duration\">${modeIcon} ${eff}m</span>`;
        try { if (__dn2 !== String(ch.name||'')) div.title = String(ch.name||''); } catch {}
        div.addEventListener('click', ()=>{ selPath = path; selIdx=-1; syncInspector(); renderTreeNested(); });

        // Drag & drop with reparenting (indent/outdent)
        div.draggable = true;
        div.addEventListener('dragstart', (e)=>{ try { e.dataTransfer.setData('text/plain', path); e.dataTransfer.effectAllowed='move'; } catch{} div.style.opacity='0.7'; });
        div.addEventListener('dragend', ()=>{ div.style.opacity=''; div.classList.remove('drop-hint-before','drop-hint-after','drop-hint-into','drop-hint-outdent'); });
        div.addEventListener('dragover', (e)=>{
          e.preventDefault();
          const r = div.getBoundingClientRect();
          const y = e.clientY - r.top; const x = e.clientX - r.left;
          const intoZone = (y > r.height*0.3 && y < r.height*0.7) && (x > Math.min(r.width*0.25, 24 + level*16));
          const before = y <= r.height*0.3; const after = y >= r.height*0.7;
          div.classList.remove('drop-hint-before','drop-hint-after','drop-hint-into','drop-hint-outdent');
          if (intoZone) div.classList.add('drop-hint-into');
          else if (before) {
            if (level>0 && x < Math.max(4, level*16 - 8)) div.classList.add('drop-hint-outdent');
            else div.classList.add('drop-hint-before');
          } else if (after) {
            if (level>0 && x < Math.max(4, level*16 - 8)) div.classList.add('drop-hint-outdent');
            else div.classList.add('drop-hint-after');
          }
        });
        div.addEventListener('dragleave', ()=>{ div.classList.remove('drop-hint-before','drop-hint-after','drop-hint-into','drop-hint-outdent'); });
        div.addEventListener('drop', (e)=>{
          e.preventDefault();
          div.classList.remove('drop-hint-before','drop-hint-after','drop-hint-into','drop-hint-outdent');
          let fromPath=''; try { fromPath = e.dataTransfer.getData('text/plain'); } catch{}
          let libPayload=null; try { const s=e.dataTransfer.getData('text/chronos-lib'); if (s) libPayload = JSON.parse(s); } catch{}
          if (!fromPath && !libPayload) return;
          if (fromPath && (path===fromPath || path.startsWith(fromPath+'.'))) return;
          const r = div.getBoundingClientRect();
          const y = e.clientY - r.top; const x = e.clientX - r.left;
          const before = y <= r.height*0.3; const after = y >= r.height*0.7; const into = (y > r.height*0.3 && y < r.height*0.7) && (x > Math.min(r.width*0.25, 24 + level*16));

          let destParentPath = (basePath||''); let destIndex = i;
          if (into) {
            destParentPath = path; destIndex = (Array.isArray(ch.children)? ch.children.length : 0);
          } else if (before) {
            if (level>0 && x < Math.max(4, level*16 - 8)) {
              const info = getByPath(children, path);
              const pinfo = getByPath(children, info.parentPath);
              const ancPath = pinfo.parentPath; const ancIdx = pinfo.index;
              destParentPath = ancPath||''; destIndex = ancIdx;
            } else {
              destParentPath = (basePath||''); destIndex = i;
            }
          } else if (after) {
            if (level>0 && x < Math.max(4, level*16 - 8)) {
              const info = getByPath(children, path);
              const pinfo = getByPath(children, info.parentPath);
              const ancPath = pinfo.parentPath; const ancIdx = pinfo.index;
              destParentPath = ancPath||''; destIndex = ancIdx + 1;
            } else {
              destParentPath = (basePath||''); destIndex = i + 1;
            }
          }

          // Enforce nesting rule: parent type rank >= child type rank
          const srcInfo = fromPath ? getByPath(children, fromPath) : null;
          const movingType = fromPath ? String(srcInfo?.node?.type||'') : String(libPayload?.type||'');
          const parentType = String(getTypeForPath(destParentPath)||'');
          if (!canNest(parentType, movingType)) { try{ const rp=typeRank(parentType), rc=typeRank(movingType); const reason=(rp===rc&&rc>=1)?'same kind cannot be nested':'parent smaller than child'; showToast(`Cannot move ${movingType} under ${parentType}: ${reason}.`);}catch{} return; }

          const destInfo = getByPath(children, destParentPath||'');
          let moved = null;
          if (fromPath) {
            moved = removeAtPath(children, fromPath);
            if (!moved) return;
          } else if (libPayload) {
            moved = { name: String(libPayload.name||''), type: String(libPayload.type||''), duration: 0 };
          }
          const sameParent = (!!srcInfo.parentArray && !!destInfo.node && srcInfo.parentArray === destInfo.node.children) || (!destInfo.node && srcInfo.parentPath==='');
          if (sameParent) {
            const srcIdx = srcInfo.index;
            if (srcIdx < destIndex) destIndex -= 1;
          }
          insertAt(children, destParentPath, Math.max(0, Math.min(destIndex, (destInfo.node? (destInfo.node.children||[]).length : children.length))), moved);
          selPath = '';
          renderTreeNested();
          syncInspector();
        });

        treeEl.appendChild(div);
        if (Array.isArray(ch.children) && ch.children.length){ renderNodes(ch.children, path, level+1); }
      });
    };
    renderNodes(children, '', 0);
    try { if (typeof updateTotalDuration === 'function') updateTotalDuration(); } catch {}
  }

  // Init
  await loadLib();
  await loadNames();
  await loadTemplate();
  return {};
}









