export function mount(el, context) {
  // Load CSS
  if (!document.getElementById('journal-css')) {
    const link = document.createElement('link');
    link.id = 'journal-css';
    link.rel = 'stylesheet';
    link.href = './Widgets/Journal/journal.css';
    document.head.appendChild(link);
  }

  el.className = 'widget journal-widget';

  const css = `
    .jr { display:flex; flex-direction:column; gap:10px; }
    .row { display:flex; gap:8px; align-items:center; }
    .col { display:flex; flex-direction:column; gap:8px; }
    .list { max-height: 220px; overflow:auto; border:1px solid var(--border); border-radius:8px; background:#0f141d; padding:6px; }
    .item { padding:6px 8px; border:1px solid #2b3343; border-radius:6px; margin-bottom:6px; cursor:pointer; background:#101623; }
    .item.sel { outline: 2px solid #7aa2f7; }
    .tags { color: var(--text-dim); font-size:12px; }
    .hint { color: var(--text-dim); font-size: 12px; }
    .spacer { flex:1; }
  `;
  el.innerHTML = `
    <style>${css}</style>
    <div class="header">
      <div class="title">Journal</div>
      <div class="controls">
        <button class="icon-btn" id="jrMin" title="Minimize">_</button>
        <button class="icon-btn" id="jrClose" title="Close">x</button>
      </div>
    </div>
    <div class="content">
      <div class="jr">
        <div class="row">
          <select id="jrType" class="input" style="width:160px;">
            <option value="all">All</option>
            <option value="journal_entry">Journal</option>
            <option value="dream_diary_entry">Dream</option>
          </select>
          <input id="jrSearch" class="input" style="flex:1;" placeholder="Search title or tags"/>
          <button class="btn" id="jrNew">New</button>
          <button class="btn btn-primary" id="jrSave">Save</button>
          <button class="btn" id="jrSticky">To Sticky</button>
          <button class="btn" id="jrDelete">Delete</button>
          <span id="jrStatus" class="hint" style="margin-left:8px;"></span>
        </div>
        <div class="list" id="jrList"></div>
        <div class="col" id="jrEditor">
          <div class="row">
            <label class="hint" style="min-width:80px;">Type</label>
            <select id="edType" class="input" style="width:200px;">
              <option value="journal_entry">Journal</option>
              <option value="dream_diary_entry">Dream</option>
            </select>
            <label class="hint" style="min-width:60px;">Date</label>
            <input id="edDate" class="input" placeholder="YYYY-MM-DD" style="width:150px;"/>
          </div>
          <div class="row">
            <label class="hint" style="min-width:80px;">Title</label>
            <input id="edTitle" class="input" placeholder="Entry title" style="flex:1;"/>
          </div>
          <div class="row">
            <label class="hint" style="min-width:80px;">Tags</label>
            <input id="edTags" class="input" placeholder="tag1, tag2" style="flex:1;"/>
          </div>
          <div class="row" id="dreamRow1" style="display:none;">
            <label class="hint" style="min-width:80px;">Lucid</label>
            <input type="checkbox" id="edLucid" />
            <label class="hint" style="min-width:100px; margin-left:12px;">Dream signs</label>
            <input id="edDreamSigns" class="input" placeholder="comma-separated" style="flex:1;"/>
          </div>
          <div class="row" id="dreamRow2" style="display:none;">
            <label class="hint" style="min-width:80px;">Sleep</label>
            <input id="edSleepStart" class="input" placeholder="start HH:MM" style="width:120px;"/>
            <input id="edSleepEnd" class="input" placeholder="end HH:MM" style="width:120px;"/>
            <label class="hint" style="min-width:60px; margin-left:12px;">Rating</label>
            <input id="edRating" class="input" placeholder="1-5" style="width:80px;"/>
          </div>
          <textarea id="edContent" class="textarea" placeholder="Write your entry..." style="min-height:180px;"></textarea>
        </div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;

  const btnMin = el.querySelector('#jrMin');
  const btnClose = el.querySelector('#jrClose');
  const listEl = el.querySelector('#jrList');
  const typeFilterEl = el.querySelector('#jrType');
  const searchEl = el.querySelector('#jrSearch');
  const statusEl = el.querySelector('#jrStatus');
  const btnNew = el.querySelector('#jrNew');
  const btnSave = el.querySelector('#jrSave');
  const btnSticky = el.querySelector('#jrSticky');
  const btnDelete = el.querySelector('#jrDelete');

  const edType = el.querySelector('#edType');
  const edDate = el.querySelector('#edDate');
  const edTitle = el.querySelector('#edTitle');
  const edTags = el.querySelector('#edTags');
  const edContent = el.querySelector('#edContent');
  const edLucid = el.querySelector('#edLucid');
  const edDreamSigns = el.querySelector('#edDreamSigns');
  const edSleepStart = el.querySelector('#edSleepStart');
  const edSleepEnd = el.querySelector('#edSleepEnd');
  const edRating = el.querySelector('#edRating');
  const dreamRow1 = el.querySelector('#dreamRow1');
  const dreamRow2 = el.querySelector('#dreamRow2');
  // Preview toggle and container
  const previewWrap = document.createElement('div'); previewWrap.className = 'row'; previewWrap.style.gap = '8px'; previewWrap.style.alignItems = 'center';
  const previewLbl = document.createElement('label'); previewLbl.className = 'hint'; previewLbl.style.minWidth = '80px'; previewLbl.textContent = 'Preview';
  const previewChk = document.createElement('input'); previewChk.type = 'checkbox'; previewChk.id = 'jrPreviewToggle';
  const previewChkLbl = document.createElement('label'); previewChkLbl.className = 'hint'; previewChkLbl.style.display = 'flex'; previewChkLbl.style.alignItems = 'center'; previewChkLbl.style.gap = '6px'; previewChkLbl.append(previewChk, document.createTextNode(' Expanded view'));
  previewWrap.append(previewLbl, previewChkLbl);
  const contentParent = edContent && edContent.parentElement ? edContent.parentElement : null;
  if (contentParent) { contentParent.parentElement.insertBefore(previewWrap, contentParent.nextSibling); }
  const previewEl = document.createElement('div'); previewEl.id = 'jrPreview'; previewEl.className = 'textarea'; previewEl.style.display = 'none'; previewEl.style.opacity = '.9'; previewEl.style.background = '#0f141d'; previewEl.style.border = '1px dashed #2b3343'; previewEl.style.minHeight = '100px'; previewEl.setAttribute('data-expand', 'text');
  if (contentParent) { contentParent.parentElement.insertBefore(previewEl, previewWrap.nextSibling); }

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  async function fetchJson(url) { const r = await fetch(url); return await r.json(); }
  async function fetchSettingsFile(file) {
    try { const j = await fetchJson(apiBase() + `/api/settings?file=${encodeURIComponent(file)}`); return j && j.content ? String(j.content) : null; } catch { return null; }
  }
  function parseYamlFlat(yaml) {
    const lines = String(yaml || '').replace(/\r\n?/g, '\n').split('\n');
    const out = {}; let curKey = null, inBlock = false;
    for (let raw of lines) {
      const line = raw.replace(/#.*$/, '');
      if (!line.trim()) continue;
      if (inBlock) {
        if (/^\s{2,}/.test(line)) { out[curKey] = (out[curKey] || '') + (out[curKey] ? '\n' : '') + line.replace(/^\s{2}/, ''); continue; }
        inBlock = false; curKey = null;
      }
      if (/^\s*tags\s*:\s*$/.test(line)) { out.tags = []; curKey = 'tags'; continue; }
      if (/^\s*-\s+/.test(line) && curKey === 'tags') { out.tags.push(line.replace(/^\s*-\s+/, '').trim()); continue; }
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.*)$/);
      if (m) {
        const k = m[1]; let v = m[2];
        if (v === '|-' || v === '|') { curKey = k; inBlock = true; out[k] = ''; continue; }
        // coerce
        if (/^(true|false)$/i.test(v)) v = (/^true$/i.test(v));
        else if (/^-?\d+$/.test(v)) v = parseInt(v, 10);
        out[k] = v;
      }
    }
    return out;
  }
  async function fetchDefaultsFor(type) {
    const lower = String(type || '').toLowerCase();
    const title = lower.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('_');
    const candidates = [
      `${lower}_defaults.yml`,
      `${title}_Defaults.yml`,
      `${title}_defaults.yml`,
    ];
    for (const f of candidates) {
      const y = await fetchSettingsFile(f);
      if (y) { try { return parseYamlFlat(y) || {}; } catch { return {}; } }
    }
    return {};
  }
  async function postYaml(url, obj) {
    const yaml = (o) => {
      const lines = [];
      const writeKV = (k, v) => { lines.push(`${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`); };
      for (const [k, v] of Object.entries(o || {})) {
        if (k === 'properties' && v && typeof v === 'object') {
          lines.push('properties:');
          for (const [k2, v2] of Object.entries(v)) {
            if (Array.isArray(v2)) {
              lines.push(`  ${k2}:`); v2.forEach(it => lines.push(`    - ${JSON.stringify(it)}`));
            } else {
              lines.push(`  ${k2}: ${JSON.stringify(v2)}`);
            }
          }
        } else {
          if (Array.isArray(v)) { lines.push(`${k}:`); v.forEach(it => lines.push(`  - ${JSON.stringify(it)}`)); }
          else if (typeof v === 'object' && v) { lines.push(`${k}:`); for (const [k3, v3] of Object.entries(v)) lines.push(`  ${k3}: ${JSON.stringify(v3)}`); }
          else { writeKV(k, v); }
        }
      }
      return lines.join('\n');
    };
    return await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body: yaml(obj) });
  }

  let items = []; // {type,name,updated?,tags?}
  let current = null; // {type,name}
  let autosaveTimer = null;
  function setStatus(msg) { statusEl.textContent = msg || ''; }

  function toggleDreamFields() {
    const isDream = String(edType.value || '') === 'dream_diary_entry';
    dreamRow1.style.display = isDream ? '' : 'none';
    dreamRow2.style.display = isDream ? '' : 'none';
  }

  function normalizeTags(str) { return String(str || '').split(',').map(s => s.trim()).filter(Boolean); }
  function today() { const d = new Date(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${d.getFullYear()}-${m}-${day}`; }
  function isValidDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

  function renderList() {
    const q = String(searchEl.value || '').toLowerCase();
    const filt = String(typeFilterEl.value || 'all');
    const arr = items
      .filter(it => filt === 'all' || String(it.type || '') === filt)
      .filter(it => !q || String(it.name || '').toLowerCase().includes(q) || String(it.tags || '').toLowerCase().includes(q))
      .sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
    listEl.innerHTML = '';
    arr.forEach(it => {
      const div = document.createElement('div'); div.className = 'item' + (current && current.type === it.type && current.name === it.name ? ' sel' : '');
      const badge = it.type === 'dream_diary_entry' ? 'Dream' : 'Journal';
      const upd = it.updated ? ` · ${it.updated}` : '';
      div.innerHTML = `<strong>${it.name}</strong> <span class="tags">(${badge}${upd})</span>`;
      div.addEventListener('click', () => loadItem(it.type, it.name));
      listEl.appendChild(div);
    });
  }

  function expandText(s) { try { return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s || '')) : String(s || ''); } catch { return String(s || ''); } }
  function updatePreview() {
    try {
      if (!previewChk || !previewEl) return;
      if (!previewChk.checked) { previewEl.style.display = 'none'; return; }
      previewEl.style.display = '';
      const title = expandText(edTitle.value || '');
      const tags = expandText(edTags.value || '');
      const body = expandText(edContent.value || '');
      const head = [title, tags ? ('# ' + tags) : ''].filter(Boolean).join('\n');
      previewEl.textContent = (head ? (head + '\n\n') : '') + body;
      try { previewEl.setAttribute('data-raw', (edTitle.value || '') + '\n\n' + (edContent.value || '')); } catch { }
    } catch { }
  }

  function showStickyNotesWidget() {
    try { context?.bus?.emit('widget:show', 'StickyNotes'); } catch { }
    try { window?.ChronosBus?.emit?.('widget:show', 'StickyNotes'); } catch { }
  }

  function refreshStickyNotes() {
    try { context?.bus?.emit('sticky:refresh'); } catch { }
    try { window?.ChronosBus?.emit?.('sticky:refresh'); } catch { }
  }

  async function sendToStickyNotes() {
    const typeValue = String(edType.value || '');
    const isDream = typeValue === 'dream_diary_entry';
    const typeLabel = isDream ? 'Dream' : 'Journal';
    const title = String(edTitle.value || '').trim();
    const body = String(edContent.value || '').trim();
    const dateVal = isValidDate(edDate.value) ? edDate.value : (edDate.value || today());
    const tags = String(edTags.value || '').trim();

    const lines = [];
    const headerParts = [];
    if (title) headerParts.push(title);
    else headerParts.push(`${typeLabel} Entry`);
    if (dateVal) headerParts.push(dateVal);
    lines.push(headerParts.join(' - '));
    if (tags) lines.push(`Tags: ${tags}`);

    if (isDream) {
      const dreamMeta = [];
      if (edLucid.checked) dreamMeta.push('Lucid: yes');
      if (edDreamSigns.value) dreamMeta.push(`Signs: ${edDreamSigns.value}`);
      const sleepStart = String(edSleepStart.value || '').trim();
      const sleepEnd = String(edSleepEnd.value || '').trim();
      if (sleepStart || sleepEnd) dreamMeta.push(`Sleep: ${sleepStart || '??'}-${sleepEnd || '??'}`);
      if (edRating.value) dreamMeta.push(`Rating: ${edRating.value}`);
      if (dreamMeta.length) lines.push(dreamMeta.join(' | '));
    }
    if (body) {
      lines.push('');
      lines.push(body);
    }

    const content = lines.join('\n').trim();
    if (!content) {
      setStatus('Write something before sending to Sticky Notes.');
      return;
    }
    const name = title || `${typeLabel} ${dateVal || today()}`;
    try {
      setStatus('Sending to Sticky Notes...');
      const resp = await fetch(apiBase() + '/api/sticky-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      setStatus('Sent to Sticky Notes.');
      refreshStickyNotes();
      showStickyNotesWidget();
    } catch (err) {
      setStatus(`Failed to send: ${err?.message || err}`);
    }
  }

  async function refreshList() {
    try {
      const j1 = await fetchJson(apiBase() + `/api/items?type=journal_entry`);
      const j2 = await fetchJson(apiBase() + `/api/items?type=dream_diary_entry`);
      const a1 = Array.isArray(j1?.items) ? j1.items : []; const a2 = Array.isArray(j2?.items) ? j2.items : [];
      items = [...a1.map(x => ({ type: 'journal_entry', name: x.name, updated: x.updated, tags: x.tags })), ...a2.map(x => ({ type: 'dream_diary_entry', name: x.name, updated: x.updated, tags: x.tags }))];
      renderList();
    } catch {
      // no-op
    }
  }

  function fillEditor(data) {
    try { edType.value = data.type || edType.value; } catch { }
    toggleDreamFields();
    edTitle.value = data.name || '';
    edDate.value = data.date || today();
    edTags.value = Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags || '');
    edContent.value = data.content || '';
    // dream fields
    edLucid.checked = !!data.lucid;
    edDreamSigns.value = Array.isArray(data.dream_signs) ? data.dream_signs.join(', ') : (data.dream_signs || '');
    edSleepStart.value = data.sleep_start || '';
    edSleepEnd.value = data.sleep_end || '';
    edRating.value = (data.rating != null ? String(data.rating) : '');
  }

  async function loadItem(type, name) {
    clearTimeout(autosaveTimer); autosaveTimer = null;
    setStatus('Loading...');
    try {
      const d = await fetchJson(apiBase() + `/api/item?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`);
      const data = d?.item || {};
      current = { type, name };
      fillEditor({ type, ...data });
      setStatus('');
      renderList();
    } catch {
      setStatus('Failed to load');
    }
  }

  async function saveNow() {
    if (!current) return;
    const t = String(edType.value || current.type);
    const newName = String(edTitle.value || '').trim();
    if (!newName) { setStatus('Title required'); return; }
    const payload = {
      type: t,
      name: current.name,
      properties: {
        name: newName,
        type: t,
        date: (isValidDate(edDate.value) ? edDate.value : today()),
        tags: normalizeTags(edTags.value),
        content: String(edContent.value || ''),
      }
    };
    if (t === 'dream_diary_entry') {
      payload.properties.lucid = !!edLucid.checked;
      const signs = normalizeTags(edDreamSigns.value);
      if (signs.length) payload.properties.dream_signs = signs; else payload.properties.dream_signs = [];
      if (edSleepStart.value) payload.properties.sleep_start = edSleepStart.value;
      if (edSleepEnd.value) payload.properties.sleep_end = edSleepEnd.value;
      if (edRating.value && /^\d+$/.test(edRating.value)) payload.properties.rating = parseInt(edRating.value, 10);
    }
    try {
      // Rename if needed
      if (newName !== current.name) {
        await postYaml(apiBase() + `/api/item/rename`, { type: current.type, old_name: current.name, new_name: newName });
        current.name = newName; current.type = t;
      }
      // If type changed, copy then delete original
      if (t !== current.type) {
        await postYaml(apiBase() + `/api/item/copy`, { type: t, source: current.name, new_name: newName, properties: payload.properties });
        await postYaml(apiBase() + `/api/item/delete`, { type: current.type, name: current.name });
        current = { type: t, name: newName };
      } else {
        await postYaml(apiBase() + `/api/item`, payload);
      }
      setStatus('Saved');
      refreshList();
    } catch {
      setStatus('Save failed');
    }
  }

  function queueAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveNow, 800);
    setStatus('Saving...');
  }

  function clearEditorForNew(t) {
    edType.value = t; toggleDreamFields();
    edTitle.value = '';
    edDate.value = today();
    edTags.value = '';
    edContent.value = '';
    edLucid.checked = false; edDreamSigns.value = ''; edSleepStart.value = ''; edSleepEnd.value = ''; edRating.value = '';
  }

  // Events
  typeFilterEl.addEventListener('change', renderList);
  searchEl.addEventListener('input', renderList);
  edType.addEventListener('change', () => { toggleDreamFields(); queueAutosave(); });
  ;[edDate, edTitle, edTags, edContent, edDreamSigns, edSleepStart, edSleepEnd, edRating].forEach(inp => inp.addEventListener('input', queueAutosave));
  edLucid.addEventListener('change', queueAutosave);

  btnNew.addEventListener('click', async () => {
    const t = prompt('Type (journal|dream) [journal]:', 'journal');
    const isDream = /^d/i.test(String(t || ''));
    const type = isDream ? 'dream_diary_entry' : 'journal_entry';
    const name = prompt('Title:', 'Untitled');
    if (!name) return;
    try {
      const defs = await fetchDefaultsFor(type);
      const props = Object.assign({}, defs || {});
      props.name = name; props.type = type;
      if (!props.date) props.date = today();
      if (props.tags && typeof props.tags === 'string') props.tags = props.tags.split(',').map(s => s.trim()).filter(Boolean);
      if (type === 'dream_diary_entry' && props.dream_signs && typeof props.dream_signs === 'string') props.dream_signs = props.dream_signs.split(',').map(s => s.trim()).filter(Boolean);
      if (props.content == null) props.content = '';
      current = { type, name };
      fillEditor(props);
      setStatus('Defaults applied - edit then Save');
    } catch { setStatus('Create failed'); }
  });
  btnSave.addEventListener('click', saveNow);
  btnSticky.addEventListener('click', sendToStickyNotes);
  btnDelete.addEventListener('click', async () => {
    if (!current) return;
    if (!confirm(`Delete '${current.name}'?`)) return;
    try { await postYaml(apiBase() + `/api/item/delete`, { type: current.type, name: current.name }); current = null; await refreshList(); setStatus('Deleted'); }
    catch { setStatus('Delete failed'); }
  });

  // Header controls
  btnClose.addEventListener('click', () => { el.style.display = 'none'; try { context?.bus?.emit('widget:closed', 'Journal'); } catch { } });
  btnMin.addEventListener('click', () => { const c = el.querySelector('.content'); if (!c) return; c.style.display = (c.style.display === 'none' ? '' : 'none'); });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); }
    else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); btnNew.click(); }
    else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); try { searchEl.focus(); searchEl.select(); } catch { } }
    else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
      // Duplicate current entry
      if (!current) return;
      e.preventDefault();
      const newName = prompt('Duplicate as:', current.name + ' copy');
      if (!newName) return;
      postYaml(apiBase() + `/api/item/copy`, { type: current.type, source: current.name, new_name: newName })
        .then(() => refreshList())
        .then(() => loadItem(current.type, newName))
        .catch(() => setStatus('Duplicate failed'));
    }
  });

  // Initial load
  refreshList(); toggleDreamFields();
  // Wire preview updates
  try {
    edTitle?.addEventListener('input', updatePreview);
    edTags?.addEventListener('input', updatePreview);
    edContent?.addEventListener('input', updatePreview);
    previewChk?.addEventListener('change', updatePreview);
    context?.bus?.on('vars:changed', () => updatePreview());
  } catch { }
}
