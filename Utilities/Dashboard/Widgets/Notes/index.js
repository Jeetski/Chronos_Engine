export function mount(el) {
  const tpl = `
    <div class="header" id="notesHeader">
      <div class="title">Notes</div>
      <div class="controls">
        <button class="icon-btn" id="notesMin" title="Minimize">_</button>
        <button class="icon-btn" id="notesClose" title="Close">x</button>
      </div>
    </div>
    <div class="content">
      <div class="row" style="align-items:flex-start; gap:8px;">
        <label class="hint" style="min-width:70px;">Title</label>
        <input id="noteTitle" class="input" placeholder="Note title" />
      </div>
      <div class="row" style="gap:8px;">
        <label class="hint" style="min-width:70px;">Category</label>
        <select id="noteCategory" class="input"></select>
      </div>
      <div class="row" style="gap:8px;">
        <label class="hint" style="min-width:70px;">Priority</label>
        <select id="notePriority" class="input"></select>
      </div>
      <div class="row" style="gap:8px;">
        <label class="hint" style="min-width:70px;">Tags</label>
        <input id="noteTags" class="input" placeholder="tag1, tag2" />
      </div>
      <textarea class="textarea" id="noteContent" placeholder="Write note content..."></textarea>
      <div class="row">
        <span class="hint">Create saves to User/Notes via API. Load can open a YAML file.</span>
        <div class="spacer"></div>
        <button class="btn btn-secondary" id="notesLoad">Load</button>
        <button class="btn btn-primary" id="notesCreate">Create</button>
      <input type="file" id="notesFile" accept=".yml,.yaml" style="display:none;" />
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const header = el.querySelector('#notesHeader');
  const btnMin = el.querySelector('#notesMin');
  const btnClose = el.querySelector('#notesClose');
  const titleEl = el.querySelector('#noteTitle');
  const categoryEl = el.querySelector('#noteCategory');
  const priorityEl = el.querySelector('#notePriority');
  const tagsEl = el.querySelector('#noteTags');
  const contentEl = el.querySelector('#noteContent');
  const loadBtn = el.querySelector('#notesLoad');
  const createBtn = el.querySelector('#notesCreate');
  const fileInput = el.querySelector('#notesFile');

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  function sanitizeNameForPath(name){ return String(name||'').toLowerCase().replace(/&/g,'and').replace(/:/g,'-').trim(); }

  // Minimal YAML parse (flat keys + tags list + content scalar)
  function parseYaml(yaml){
    const lines = String(yaml||'').replace(/\r\n?/g,'\n').split('\n');
    const out = {}; let curKey=null, inBlock=false;
    for (let raw of lines){
      const line = raw.replace(/#.*$/,'');
      if (!line.trim()) continue;
      if (inBlock){
        if (/^\s{2,}/.test(line)) { out[curKey] = (out[curKey]||'') + (out[curKey]?'\n':'') + line.replace(/^\s{2}/,''); continue; }
        inBlock = false; curKey=null;
      }
      if (/^\s*tags\s*:\s*$/.test(line)) { out.tags=[]; curKey='tags'; continue; }
      if (/^\s*-\s+/.test(line) && curKey==='tags') { out.tags.push(line.replace(/^\s*-\s+/,'').trim()); continue; }
      const m = line.match(/^\s*(\w+)\s*:\s*(.*)$/);
      if (m){
        const k=m[1]; const v=m[2];
        if (v==='|-' || v==='|') { curKey=k; inBlock=true; out[k]=''; continue; }
        out[k]=v;
      }
    }
    return out;
  }

  // Populate from settings bundle
  (function populate(){
    const s = window.CHRONOS_SETTINGS || {};
    try {
      priorityEl.innerHTML='';
      (s.priorities||['low','medium','high']).map(p=>String(p).toLowerCase()).forEach(p=>{ const opt=document.createElement('option'); opt.value=p; opt.textContent=p; priorityEl.appendChild(opt); });
    } catch{}
    try {
      const cats = s.categories||['work','personal'];
      categoryEl.innerHTML='';
      cats.forEach(c=>{ const opt=document.createElement('option'); opt.value=c; opt.textContent=c; categoryEl.appendChild(opt); });
    } catch{}
    try {
      const rawDef = (s.defaults||{}).note || {};
      const def = Object.keys(rawDef).reduce((acc,k)=>{ acc[String(k).toLowerCase()] = rawDef[k]; return acc; }, {});
      if (def.name) titleEl.value = def.name;
      if (def.category) {
        if (![...categoryEl.options].some(o=>o.value.toLowerCase()===String(def.category).toLowerCase())){
          const opt=document.createElement('option'); opt.value=def.category; opt.textContent=def.category; categoryEl.appendChild(opt);
        }
        categoryEl.value = def.category;
      }
      if (def.priority) priorityEl.value = String(def.priority).toLowerCase();
      if (Array.isArray(def.tags)) tagsEl.value = def.tags.join(', ');
      if (def.content) contentEl.value = def.content;
    } catch{}
  })();

  // Dragging
  header.addEventListener('pointerdown', (ev)=>{
    const startX=ev.clientX, startY=ev.clientY; const rect=el.getBoundingClientRect(); const offX=startX-rect.left, offY=startY-rect.top;
    function onMove(e){ el.style.left=Math.max(6, e.clientX-offX)+'px'; el.style.top=Math.max(6, e.clientY-offY)+'px'; el.style.right='auto'; }
    function onUp(){ window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  });
  btnMin.addEventListener('click', ()=> el.classList.toggle('minimized'));
  btnClose.addEventListener('click', ()=> el.style.display='none');

  // Create note via API
  createBtn.addEventListener('click', async ()=>{
    const name = (titleEl.value||'').trim();
    if (!name) { alert('Please enter a note title.'); return; }
    const category = (categoryEl.value||'').trim();
    const priority = (priorityEl.value||'').trim();
    const tags = (tagsEl.value||'').split(',').map(s=>s.trim()).filter(Boolean);
    const content = contentEl.value||'';

    function toYaml(obj){
      const lines=[];
      function emitKV(k,v){
        if (k==='content') {
          const hasNewline = String(v).includes('\n');
          if (hasNewline) { lines.push(`${k}: |-`); String(v).split('\n').forEach(line=>lines.push(`  ${line}`)); }
          else { lines.push(`${k}: ${String(v)}`); }
          return;
        }
        lines.push(`${k}: ${String(v)}`);
      }
      Object.keys(obj).forEach(k=>{
        if (k==='tags' && Array.isArray(obj[k])){ lines.push('tags:'); obj[k].forEach(t=>lines.push(`  - ${t}`)); }
        else if (obj[k]!==undefined && obj[k]!==null && obj[k]!=='' ){ emitKV(k, obj[k]); }
      });
      return lines.join('\n');
    }

    const payloadYml = toYaml({ name, category, priority, tags, content });
    try {
      const resp = await fetch(apiBase() + '/api/new/note', { method:'POST', headers:{ 'Content-Type':'text/yaml' }, body: payloadYml });
      const text = await resp.text();
      // Try to parse server YAML; fallback to status
      let ok = resp.ok, msg = text;
      try { const d = parseYaml(text)||{}; ok = !!d.ok; msg = d.stdout||d.error||text; } catch {}
      alert((ok? 'Created note: ' : 'Failed: ') + msg);
    } catch (e) {
      alert('Failed to reach Chronos dashboard server. Run: dashboard');
    }
  });

  // Load note: by file or by name
  async function tryFetchNoteByName(name){
    // Attempt via CLI get for known fields (requires server)
    async function cliGet(prop){
      const body = `command: get\nargs:\n  - note\n  - ${name}\n  - ${prop}\n`;
      try{ const r = await fetch(apiBase() + '/api/cli', { method:'POST', headers:{ 'Content-Type':'text/yaml' }, body }); const t = await r.text(); return t; }catch{ return ''; }
    }
    function parseGetOut(t){ const m = String(t||'').match(/:\s([^\n]+)$/m); return m? m[1].trim() : ''; }
    const loaded = {};
    loaded.name = name;
    const cat = parseGetOut(await cliGet('category')); if (cat) loaded.category = cat;
    const pri = parseGetOut(await cliGet('priority')); if (pri) loaded.priority = pri.toLowerCase();
    const tagsS = parseGetOut(await cliGet('tags'));
    if (tagsS) loaded.tags = tagsS.split(',').map(s=>s.trim()).filter(Boolean);
    const contentS = parseGetOut(await cliGet('content')); if (contentS) loaded.content = contentS;
    if (!cat && !pri && !tagsS && !contentS) return false;
    fillFromObj(loaded); return true;
  }

  function fillFromObj(obj){
    if(obj.name) titleEl.value=obj.name;
    if(obj.category){ const cat=String(obj.category); if (![...categoryEl.options].some(o=>o.value.toLowerCase()===cat.toLowerCase())){ const opt=document.createElement('option'); opt.value=cat; opt.textContent=cat; categoryEl.appendChild(opt);} categoryEl.value=cat; }
    if(obj.priority) priorityEl.value=String(obj.priority).toLowerCase();
    if(Array.isArray(obj.tags)) tagsEl.value = obj.tags.join(', ');
    if(obj.content!=null) contentEl.value = String(obj.content);
  }

  loadBtn.addEventListener('click', async ()=>{
    const name = prompt('Enter note name to load (or Cancel to choose a file)');
    if(name && name.trim()){
      const ok = await tryFetchNoteByName(name.trim());
      if(!ok){ alert('Could not load via API. Choose a YAML file instead.'); fileInput.click(); }
    } else {
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', async ()=>{
    const f=fileInput.files&&fileInput.files[0]; if(!f) return; const text=await f.text(); const data=parseYaml(text)||{}; fillFromObj(data); fileInput.value='';
  });

  // Resizers
  function edgeDrag(startRect, cb){ return (ev)=>{ ev.preventDefault(); function move(e){ cb(e, startRect); } function up(){ window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); } window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); } }
  const re=el.querySelector('.resizer.e'); const rs=el.querySelector('.resizer.s'); const rse=el.querySelector('.resizer.se');
  if(re) re.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.width=Math.max(260, e.clientX - sr.left)+'px'; })(ev); });
  if(rs) rs.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.height=Math.max(160, e.clientY - sr.top)+'px'; })(ev); });
  if(rse) rse.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.width=Math.max(260, e.clientX - sr.left)+'px'; el.style.height=Math.max(160, e.clientY - sr.top)+'px'; })(ev); });

  console.log('[Chronos][Notes] Widget ready');
  return { fillFromObj };
}
