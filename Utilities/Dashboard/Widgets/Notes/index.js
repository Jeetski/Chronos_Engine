export function mount(el, context) {
  const tpl = `
    <style>
      .notes-shell { display:flex; flex-direction:column; gap:12px; flex:1; min-height:0; }
      .notes-card {
        border: 1px solid var(--border);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(21,25,35,0.92), rgba(13,16,23,0.92));
        padding: 10px 12px;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
      }
      .notes-card-title {
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--text-dim);
        margin-bottom: 6px;
      }
      .notes-grid { display:flex; flex-direction:column; gap:8px; }
      .notes-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .notes-label {
        min-width: 62px;
        color: var(--text-dim);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .notes-toggle { display:flex; align-items:center; gap:6px; color: var(--text-dim); font-size:12px; }
      .notes-editor { flex:1; min-height:0; display:flex; flex-direction:column; gap:10px; }
      .notes-editor .textarea { flex:1; min-height: 260px; }
      .notes-preview {
        display: none;
        opacity: 0.92;
        background: rgba(15, 20, 29, 0.65);
        border: 1px dashed var(--border);
        min-height: 160px;
      }
      .notes-footer { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .notes-actions { margin-left:auto; display:flex; gap:8px; }
    </style>
    <div class="header" id="notesHeader">
      <div class="title">Notes</div>
      <div class="controls">
        <button class="icon-btn" id="notesMin" title="Minimize">_</button>
        <button class="icon-btn" id="notesClose" title="Close">x</button>
      </div>
    </div>
    <div class="content">
      <div class="notes-shell">
        <div class="notes-card notes-details">
          <div class="notes-card-title">Details</div>
          <div class="notes-grid">
            <div class="notes-row notes-row-wide">
              <label class="notes-label">Title</label>
              <input id="noteTitle" class="input" placeholder="Note title" style="flex:2; min-width:220px;" />
              <label class="notes-label">Format</label>
              <select id="noteFormat" class="input" style="width:160px;">
                <option value="note">Note (.yml via CLI)</option>
                <option value="markdown">Markdown (.md)</option>
                <option value="yaml">Raw YAML (.yml)</option>
              </select>
              <label class="notes-toggle"><input type="checkbox" id="notesPreviewToggle" /> Preview</label>
            </div>
            <div class="notes-row">
              <label class="notes-label">Category</label>
              <select id="noteCategory" class="input" style="min-width:140px; flex:1;"></select>
              <label class="notes-label">Priority</label>
              <select id="notePriority" class="input" style="min-width:120px; flex:1;"></select>
              <label class="notes-label">Tags</label>
              <input id="noteTags" class="input" placeholder="tag1, tag2" style="flex:2; min-width:180px;" />
            </div>
            <div class="notes-row">
              <div id="notePathHint" class="hint" style="flex:1;"></div>
            </div>
          </div>
        </div>
        <div class="notes-card notes-editor">
          <div class="notes-card-title">Content</div>
          <textarea class="textarea" id="noteContent" placeholder="Write note content..."></textarea>
          <div id="notePreview" class="textarea notes-preview" data-expand="text"></div>
        </div>
        <div class="notes-card notes-footer">
          <span class="hint">Create saves to User/Notes (or provided path). Load can open YAML/Markdown files.</span>
          <div class="notes-actions">
            <button class="btn btn-secondary" id="notesLoad">Load</button>
            <button class="btn" id="notesToSticky">To Sticky</button>
            <button class="btn btn-primary" id="notesCreate">Create</button>
          </div>
          <input type="file" id="notesFile" accept=".yml,.yaml,.md,.markdown" style="display:none;" />
        </div>
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
  const previewEl = el.querySelector('#notePreview');
  const previewChk = el.querySelector('#notesPreviewToggle');
  const formatEl = el.querySelector('#noteFormat');
  const pathHint = el.querySelector('#notePathHint');
  const loadBtn = el.querySelector('#notesLoad');
  const stickyBtn = el.querySelector('#notesToSticky');
  const createBtn = el.querySelector('#notesCreate');
  const fileInput = el.querySelector('#notesFile');
  let currentPath = null;

  try { if (!el.style.width) el.style.width = '680px'; } catch {}

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  function sanitizeNameForPath(name){ return String(name||'').toLowerCase().replace(/&/g,'and').replace(/:/g,'-').trim(); }
  function setPathHint(path){ if(pathHint) pathHint.textContent = path ? `Path: ${path}` : ''; }

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

    const fmt = (formatEl?.value)||'note';

    const asYaml = toYaml({ name, category, priority, tags, content });
    // Build markdown with frontmatter for metadata
    const asMarkdown = (()=> {
      const fm = [];
      fm.push('---');
      fm.push(`name: ${name}`);
      if (category) fm.push(`category: ${category}`);
      if (priority) fm.push(`priority: ${priority}`);
      if (tags.length) fm.push(`tags: [${tags.map(t=>`\"${t}\"`).join(', ')}]`);
      fm.push('---');
      return `${fm.join('\\n')}\\n\\n${content}`;
    })();

    try {
      if (fmt === 'note') {
        const resp = await fetch(apiBase() + '/api/new/note', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ name, category, priority, tags, content }) });
        const text = await resp.text();
        let ok = resp.ok, msg = text;
        try { const d = parseYaml(text)||{}; ok = !!d.ok; msg = d.stdout||d.error||text; } catch {}
        alert((ok? 'Created note: ' : 'Failed: ') + msg);
        currentPath = null; setPathHint('');
      } else {
        const ext = fmt === 'markdown' ? '.md' : '.yml';
        const fname = sanitizeNameForPath(name) || 'untitled';
        const target = currentPath || `User/notes/${fname}${ext}`;
        const body = {
          path: target,
          content: fmt === 'markdown' ? asMarkdown : asYaml,
        };
        const resp = await fetch(apiBase() + '/api/file/write', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
        const ok = resp.ok;
        const msg = await resp.text();
        alert((ok? 'Saved: ' : 'Failed: ') + msg);
        if (ok) { currentPath = target; setPathHint(target); }
      }
    } catch (e) {
      alert('Failed to reach Chronos dashboard server. Run: dashboard');
    }
  });

  function showStickyNotesWidget(){
    try { context?.bus?.emit('widget:show','StickyNotes'); } catch {}
    try { window?.ChronosBus?.emit?.('widget:show','StickyNotes'); } catch {}
  }

  function refreshStickyNotes(){
    try { context?.bus?.emit('sticky:refresh'); } catch {}
    try { window?.ChronosBus?.emit?.('sticky:refresh'); } catch {}
  }

  async function sendToStickyNotes(){
    const title = (titleEl.value||'').trim();
    const body = String(contentEl.value||'').trim();
    const category = (categoryEl.value||'').trim();
    const priority = (priorityEl.value||'').trim();
    const tags = (tagsEl.value||'').trim();

    const meta = [];
    if (category) meta.push(`Category: ${category}`);
    if (priority) meta.push(`Priority: ${priority}`);
    if (tags) meta.push(`Tags: ${tags}`);

    const parts = [];
    if (meta.length) parts.push(meta.join(' | '));
    if (body) parts.push(body);

    let content = parts.join('\n\n').trim();
    if (!content && title) content = title;
    if (!content) { alert('Write something before sending to Sticky Notes.'); return; }

    try {
      const resp = await fetch(apiBase() + '/api/sticky-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: title, content }),
      });
      const data = await resp.json().catch(()=> ({}));
      if (!resp.ok || data.ok === false){
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      refreshStickyNotes();
      showStickyNotesWidget();
      alert('Sent to Sticky Notes.');
    } catch (err) {
      alert(`Failed to send to Sticky Notes: ${err?.message || err}`);
    }
  }

  stickyBtn?.addEventListener('click', sendToStickyNotes);

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
    updatePreview();
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
    const f=fileInput.files&&fileInput.files[0]; if(!f) return;
    const text=await f.text();
    if (/\.(md|markdown)$/i.test(f.name)){
      // Try to strip frontmatter; otherwise just load content
      const m = text.match(/^---\\s*\\n([\\s\\S]*?)\\n---\\s*\\n([\\s\\S]*)$/);
      if (m){
        try{
          const meta = parseYaml(m[1])||{};
          fillFromObj({ name: titleEl.value||meta.name||f.name.replace(/\\.(md|markdown)$/i,''), category: meta.category, priority: meta.priority, tags: meta.tags, content: m[2] });
        }catch{ fillFromObj({ name: f.name.replace(/\\.(md|markdown)$/i,''), content: m[2] }); }
      } else {
        fillFromObj({ name: f.name.replace(/\\.(md|markdown)$/i,''), content:text });
      }
      formatEl.value = 'markdown';
      currentPath = null; setPathHint('');
    } else {
      const data=parseYaml(text)||{};
      fillFromObj(data);
      formatEl.value = 'note';
      currentPath = null; setPathHint('');
    }
    fileInput.value='';
  });

  // Resizers
  function edgeDrag(startRect, cb){ return (ev)=>{ ev.preventDefault(); function move(e){ cb(e, startRect); } function up(){ window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); } window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); } }
  const re=el.querySelector('.resizer.e'); const rs=el.querySelector('.resizer.s'); const rse=el.querySelector('.resizer.se');
  if(re) re.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.width=Math.max(260, e.clientX - sr.left)+'px'; })(ev); });
  if(rs) rs.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.height=Math.max(160, e.clientY - sr.top)+'px'; })(ev); });
  if(rse) rse.addEventListener('pointerdown', (ev)=>{ const r=el.getBoundingClientRect(); edgeDrag(r, (e,sr)=>{ el.style.width=Math.max(260, e.clientX - sr.left)+'px'; el.style.height=Math.max(160, e.clientY - sr.top)+'px'; })(ev); });

  function expandText(s){
    try {
      return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s||'')) : String(s||'');
    } catch { return String(s||''); }
  }
  function updatePreview(){
    try {
      if (!previewChk || !previewEl) return;
      if (!previewChk.checked){ previewEl.style.display='none'; return; }
      previewEl.style.display = '';
      // Show expanded content; optionally include expanded title on first line
      const title = expandText(titleEl.value||'');
      const body = expandText(contentEl.value||'');
      previewEl.textContent = (title ? (title + '\n\n') : '') + body;
      // Also mark for general expansion helper
      try { previewEl.setAttribute('data-raw', (titleEl.value||'') + '\n\n' + (contentEl.value||'')); } catch {}
    } catch {}
  }
  previewChk?.addEventListener('change', updatePreview);
  contentEl?.addEventListener('input', updatePreview);
  titleEl?.addEventListener('input', updatePreview);
  // Re-expand on vars change
  try { context?.bus?.on('vars:changed', ()=> updatePreview()); } catch {}
  try {
    context?.bus?.on('notes:openFile', async (payload)=>{
      const path = payload?.path;
      const fmt = (payload?.format)||'markdown';
      const title = payload?.title;
      if (!path) return;
      try{
        const resp = await fetch(apiBase() + '/api/file/read', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ path }) });
        const txt = await resp.text();
        contentEl.value = txt;
        titleEl.value = title || path.split(/[\\/]/).pop().replace(/\\.[^.]+$/,'');
        formatEl.value = fmt || 'markdown';
        currentPath = path;
        setPathHint(path);
        updatePreview();
      }catch{}
    });
  } catch {}
  // Bus hookup to open files in Notes
  try {
    const onOpenFile = async (payload)=>{
      const path = payload?.path;
      const fmt = (payload?.format)||'markdown';
      const title = payload?.title;
      if (!path) return;
      try{
        const resp = await fetch(apiBase() + '/api/file/read', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ path }) });
        let dataTxt = '';
        try {
          const obj = await resp.json();
          if (obj && obj.content !== undefined) dataTxt = obj.content;
        } catch {
          dataTxt = await resp.text();
        }
        contentEl.value = dataTxt || '';
        titleEl.value = title || path.split(/[\\/]/).pop().replace(/\.[^.]+$/,'');
        formatEl.value = fmt || 'markdown';
        currentPath = path;
        setPathHint(path);
        updatePreview();
      }catch{}
      // show the widget
      try { context?.bus?.emit('widget:show','Notes'); } catch {}
      try { window?.ChronosBus?.emit?.('widget:show','Notes'); } catch {}
    };
    context?.bus?.on('notes:openFile', onOpenFile);
    window?.ChronosBus?.on?.('notes:openFile', onOpenFile);
  } catch {}

  // Ensure preview reflects initial state and any programmatic fills
  updatePreview();

  console.log('[Chronos][Notes] Widget ready');
  return { fillFromObj };
}
