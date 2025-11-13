export function mount(el){
  el.innerHTML = `
    <div class="header" id="settingsHeader">
      <div class="title">Settings</div>
      <div class="controls">
        <button class="icon-btn" id="settingsMin" title="Minimize">_</button>
        <button class="icon-btn" id="settingsClose" title="Close">x</button>
      </div>
    </div>
    <div class="content" style="display:flex; flex-direction:column; gap:8px;">
      <div class="row" style="gap:8px; align-items:center;">
        <label for="settingsFile" class="hint">File:</label>
        <select id="settingsFile" class="input" style="flex:1 1 auto;"></select>
        <button id="reloadBtn" class="btn btn-secondary">Reload</button>
      </div>
      <textarea id="settingsEditor" class="textarea" placeholder="# YAML settings..." style="min-height: 220px;"></textarea>
      <div class="row" style="gap:8px; align-items:center; justify-content:flex-end;">
        <span id="settingsStatus" class="hint" style="flex:1 1 auto;"></span>
        <button id="saveBtn" class="btn btn-primary">Save</button>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;

  const content = el.querySelector('.content') || el;
  const sel = content.querySelector('#settingsFile');
  const txt = content.querySelector('#settingsEditor');
  const btnSave = content.querySelector('#saveBtn');
  const btnReload = content.querySelector('#reloadBtn');
  const status = content.querySelector('#settingsStatus');

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  function setStatus(msg, ok=true){ if(status){ status.textContent = msg; status.style.color = ok? '#a6adbb' : '#ef6a6a'; } }

  async function listFiles(){
    try{
      const r = await fetch(apiBase() + '/api/settings');
      const data = await r.json();
      if (!data || !Array.isArray(data.files)) throw new Error('Invalid response');
      sel.innerHTML = '';
      for (const f of data.files){ const opt = document.createElement('option'); opt.value = f; opt.textContent = f; sel.appendChild(opt); }
      if (data.files.length){ await loadFile(data.files[0]); }
      setStatus('Loaded settings files.');
    }catch(e){ setStatus('Failed to list settings files.', false); }
  }

  async function loadFile(name){
    try{
      const r = await fetch(apiBase() + '/api/settings?file=' + encodeURIComponent(name));
      const data = await r.json();
      const content = data?.content ?? '';
      txt.value = String(content);
      for (const o of Array.from(sel.options)) { if (o.value === name) sel.value = name; }
      setStatus(`Loaded ${name}`);
    }catch(e){ setStatus('Failed to load file.', false); }
  }

  async function save(){
    const name = sel.value || '';
    if (!name){ setStatus('Select a file first.', false); return; }
    const body = txt.value || '';
    try{
      const resp = await fetch(apiBase() + '/api/settings?file=' + encodeURIComponent(name), {
        method:'POST', headers:{ 'Content-Type':'text/yaml' }, body
      });
      const t = await resp.text();
      if (!resp.ok) { setStatus('Save failed.', false); return; }
      setStatus('Saved.');
    }catch(e){ setStatus('Save failed.', false); }
  }

  btnSave?.addEventListener('click', save);
  btnReload?.addEventListener('click', ()=>{ if(sel.value) loadFile(sel.value); else listFiles(); });
  sel?.addEventListener('change', ()=>{ if (sel.value) loadFile(sel.value); });

  // Header buttons
  el.querySelector('#settingsMin')?.addEventListener('click', ()=> el.classList.toggle('minimized'));
  el.querySelector('#settingsClose')?.addEventListener('click', ()=> el.style.display='none');

  listFiles();
  return {};
}
