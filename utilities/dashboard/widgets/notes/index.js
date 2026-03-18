export function mount(el, context) {
  // Load CSS
  if (!document.getElementById('notes-css')) {
    const link = document.createElement('link');
    link.id = 'notes-css';
    link.rel = 'stylesheet';
    link.href = new URL('./notes.css', import.meta.url).toString();
    document.head.appendChild(link);
  }

  el.className = 'widget notes-widget';
  try { el.dataset.uiId = 'widget.notes'; } catch { }
  const TEXT_SIZE_STORAGE_KEY = 'chronos_notes_text_size_v1';

  const tpl = `
    <style>
      .notes-shell { display:flex; flex-direction:column; gap:12px; flex:1; min-height:0; }
      .notes-card {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(18, 23, 33, 0.52) 0%, rgba(10, 14, 21, 0.34) 100%);
        padding: 10px 12px;
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.18), inset 0 0 0 1px rgba(255,255,255,0.04);
        backdrop-filter: blur(14px) saturate(125%);
        -webkit-backdrop-filter: blur(14px) saturate(125%);
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
        background: linear-gradient(180deg, rgba(14, 19, 28, 0.48) 0%, rgba(9, 13, 20, 0.28) 100%);
        border: 1px dashed rgba(255, 255, 255, 0.14);
        min-height: 160px;
        backdrop-filter: blur(12px) saturate(120%);
        -webkit-backdrop-filter: blur(12px) saturate(120%);
      }
      .notes-footer { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .notes-actions { margin-left:auto; display:flex; gap:8px; }
      .notes-widget .input,
      .notes-widget .textarea,
      .notes-widget select {
        background: linear-gradient(180deg, rgba(13, 18, 26, 0.42) 0%, rgba(9, 12, 18, 0.22) 100%);
        border-color: rgba(255, 255, 255, 0.12);
        backdrop-filter: blur(12px) saturate(120%);
        -webkit-backdrop-filter: blur(12px) saturate(120%);
      }
      .notes-widget .input:focus,
      .notes-widget .textarea:focus,
      .notes-widget select:focus {
        background: linear-gradient(180deg, rgba(18, 24, 36, 0.5) 0%, rgba(11, 15, 23, 0.3) 100%);
      }
      .notes-widget select {
        background: #0f141d;
        color: var(--text);
        border-color: var(--border);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      .notes-widget select:focus {
        background: #111824;
        border-color: #3a4a6a;
      }
      .notes-widget select option {
        background: #0f141d;
        color: var(--text);
      }
      .notes-widget .icon-btn.primary {
        color: var(--chronos-accent, #7aa2f7);
        border-color: color-mix(in srgb, var(--chronos-accent, #7aa2f7) 35%, var(--border, #2b3343));
        background: color-mix(in srgb, var(--chronos-accent, #7aa2f7) 12%, transparent);
      }
    </style>
    <div class="header" id="notesHeader" data-ui-id="widget.notes.header">
      <div class="title" data-ui-id="widget.notes.title">Notes</div>
      <div class="controls">
        <button class="icon-btn" id="notesMin" title="Minimize" data-ui-id="widget.notes.minimize_button">_</button>
        <button class="icon-btn" id="notesClose" title="Close" data-ui-id="widget.notes.close_button">x</button>
      </div>
    </div>
    <div class="content widget-content-glass" data-ui-id="widget.notes.panel">
      <div class="notes-shell">
        <div class="notes-card notes-details">
          <div class="notes-card-title">Details</div>
          <div class="notes-grid">
            <div class="notes-row notes-row-wide">
              <label class="notes-label">Title</label>
              <input id="noteTitle" class="input" placeholder="Note title" style="flex:2; min-width:220px;" data-ui-id="widget.notes.title_input" />
              <label class="notes-label">Format</label>
              <select id="noteFormat" class="input" style="width:160px;" data-ui-id="widget.notes.format_select">
                <option value="note">Note (.yml via CLI)</option>
                <option value="markdown">Markdown (.md)</option>
                <option value="yaml">Raw YAML (.yml)</option>
              </select>
              <label class="notes-label" style="min-width:42px;">Text</label>
              <select id="notesTextSize" class="input" style="width:110px;" data-ui-id="widget.notes.text_size_select">
                <option value="11">11px</option>
                <option value="12">12px</option>
                <option value="13">13px</option>
                <option value="14">14px</option>
                <option value="15">15px</option>
                <option value="16">16px</option>
                <option value="17">17px</option>
                <option value="18">18px</option>
                <option value="20">20px</option>
                <option value="22">22px</option>
                <option value="24">24px</option>
                <option value="28">28px</option>
                <option value="32">32px</option>
              </select>
              <label class="notes-toggle"><input type="checkbox" id="notesPreviewToggle" data-ui-id="widget.notes.preview_checkbox" /> Preview</label>
              <label class="notes-toggle"><input type="checkbox" id="notesExpandedToggle" data-ui-id="widget.notes.expanded_checkbox" /> Expanded view</label>
              <label class="notes-toggle"><input type="checkbox" id="notesReadOnlyToggle" data-ui-id="widget.notes.readonly_checkbox" /> Read only</label>
            </div>
            <div class="notes-row">
              <label class="notes-label">Category</label>
              <select id="noteCategory" class="input" style="min-width:140px; flex:1;" data-ui-id="widget.notes.category_select"></select>
              <label class="notes-label">Priority</label>
              <select id="notePriority" class="input" style="min-width:120px; flex:1;" data-ui-id="widget.notes.priority_select"></select>
              <label class="notes-label">Tags</label>
              <input id="noteTags" class="input" placeholder="tag1, tag2" style="flex:2; min-width:180px;" data-ui-id="widget.notes.tags_input" />
            </div>
            <div class="notes-row">
              <div id="notePathHint" class="hint" style="flex:1;" data-ui-id="widget.notes.path_hint_text"></div>
            </div>
          </div>
        </div>
        <div class="notes-card notes-editor">
          <div class="notes-card-title">Content</div>
          <textarea class="textarea" id="noteContent" placeholder="Write note content..." data-ui-id="widget.notes.content_input"></textarea>
          <div id="notePreview" class="textarea notes-preview" data-expand="text" data-ui-id="widget.notes.preview_text"></div>
        </div>
        <div class="notes-card notes-footer">
          <span class="hint" data-ui-id="widget.notes.tip_text">Create saves to user/notes (or provided path). Load can open YAML/Markdown files.</span>
          <div class="notes-actions">
            <button class="icon-btn" id="notesLoad" title="Load note" aria-label="Load note" data-ui-id="widget.notes.load_button">↥</button>
            <button class="icon-btn" id="notesToSticky" title="Send to Sticky Notes" aria-label="Send to Sticky Notes" data-ui-id="widget.notes.to_sticky_button">📌</button>
            <button class="icon-btn primary" id="notesCreate" title="Create or save note" aria-label="Create or save note" data-ui-id="widget.notes.create_button">💾</button>
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
  const expandedChk = el.querySelector('#notesExpandedToggle');
  const readOnlyChk = el.querySelector('#notesReadOnlyToggle');
  const textSizeEl = el.querySelector('#notesTextSize');
  const formatEl = el.querySelector('#noteFormat');
  const pathHint = el.querySelector('#notePathHint');
  const loadBtn = el.querySelector('#notesLoad');
  const stickyBtn = el.querySelector('#notesToSticky');
  const createBtn = el.querySelector('#notesCreate');
  const fileInput = el.querySelector('#notesFile');
  let statusEl = el.querySelector('#notesStatus');
  let currentPath = null;
  function isReadOnly() { return !!readOnlyChk?.checked; }

  function applyReadOnlyState() {
    const disabled = isReadOnly();
    [titleEl, categoryEl, priorityEl, tagsEl, contentEl, formatEl].forEach((field) => {
      if (!field) return;
      try {
        field.disabled = disabled;
        if ('readOnly' in field) field.readOnly = disabled;
      } catch { }
    });
    [stickyBtn, createBtn].forEach((btn) => {
      if (!btn) return;
      try { btn.disabled = disabled; } catch { }
    });
    try { el.dataset.readonly = disabled ? 'true' : 'false'; } catch { }
  }

  function syncExpandedView() {
    try {
      const toggle = window?.ChronosToggleWidgetMaximized;
      if (typeof toggle === 'function') toggle(el, !!expandedChk?.checked);
    } catch { }
  }

  function applyTextSize(size, { persist = true } = {}) {
    const parsed = parseInt(String(size || '15').trim(), 10);
    const numeric = Number.isFinite(parsed) ? Math.max(11, Math.min(32, parsed)) : 15;
    const fontSize = `${numeric}px`;
    try {
      textSizeEl.value = String(numeric);
      contentEl.style.fontSize = fontSize;
      contentEl.style.lineHeight = '1.55';
      previewEl.style.fontSize = fontSize;
      previewEl.style.lineHeight = '1.55';
      if (persist) localStorage.setItem(TEXT_SIZE_STORAGE_KEY, textSizeEl.value);
    } catch { }
  }

  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'notesStatus';
    statusEl.className = 'hint';
    statusEl.setAttribute('data-ui-id', 'widget.notes.status_text');
    createBtn?.closest('.notes-footer')?.appendChild(statusEl);
  }

  try { if (!el.style.width) el.style.width = '680px'; } catch { }

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  function sanitizeNameForPath(name) { return String(name || '').toLowerCase().replace(/&/g, 'and').replace(/:/g, '-').trim(); }
  function setPathHint(path) { if (pathHint) pathHint.textContent = path ? `Path: ${path}` : ''; }
  function setStatus(msg) { if (statusEl) statusEl.textContent = msg || ''; }

  // Minimal YAML parse (flat keys + tags list + content scalar)
  function parseYaml(yaml) {
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
      const m = line.match(/^\s*(\w+)\s*:\s*(.*)$/);
      if (m) {
        const k = m[1]; const v = m[2];
        if (v === '|-' || v === '|') { curKey = k; inBlock = true; out[k] = ''; continue; }
        out[k] = v;
      }
    }
    return out;
  }

  // Populate from settings bundle
  (function populate() {
    const s = window.CHRONOS_SETTINGS || {};
    try {
      priorityEl.innerHTML = '';
      (s.priorities || ['low', 'medium', 'high']).map(p => String(p).toLowerCase()).forEach(p => { const opt = document.createElement('option'); opt.value = p; opt.textContent = p; priorityEl.appendChild(opt); });
    } catch { }
    try {
      const cats = s.categories || ['work', 'personal'];
      categoryEl.innerHTML = '';
      cats.forEach(c => { const opt = document.createElement('option'); opt.value = c; opt.textContent = c; categoryEl.appendChild(opt); });
    } catch { }
    try {
      const rawDef = (s.defaults || {}).note || {};
      const def = Object.keys(rawDef).reduce((acc, k) => { acc[String(k).toLowerCase()] = rawDef[k]; return acc; }, {});
      if (def.name) titleEl.value = def.name;
      if (def.category) {
        if (![...categoryEl.options].some(o => o.value.toLowerCase() === String(def.category).toLowerCase())) {
          const opt = document.createElement('option'); opt.value = def.category; opt.textContent = def.category; categoryEl.appendChild(opt);
        }
        categoryEl.value = def.category;
      }
      if (def.priority) priorityEl.value = String(def.priority).toLowerCase();
      if (Array.isArray(def.tags)) tagsEl.value = def.tags.join(', ');
      if (def.content) contentEl.value = def.content;
    } catch { }
  })();

  // Dragging
  header.addEventListener('pointerdown', (ev) => {
    const startX = ev.clientX, startY = ev.clientY; const rect = el.getBoundingClientRect(); const offX = startX - rect.left, offY = startY - rect.top;
    function onMove(e) { el.style.left = Math.max(6, e.clientX - offX) + 'px'; el.style.top = Math.max(6, e.clientY - offY) + 'px'; el.style.right = 'auto'; }
    function onUp() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  });
  btnMin.addEventListener('click', () => { el.classList.toggle('minimized'); setStatus(el.classList.contains('minimized') ? 'Minimized.' : ''); });
  btnClose.addEventListener('click', () => { el.style.display = 'none'; setStatus('Closed.'); });

  // Create note via API
  createBtn.addEventListener('click', async () => {
    if (isReadOnly()) return;
    const name = (titleEl.value || '').trim();
    if (!name) { alert('Please enter a note title.'); return; }
    const category = (categoryEl.value || '').trim();
    const priority = (priorityEl.value || '').trim();
    const tags = (tagsEl.value || '').split(',').map(s => s.trim()).filter(Boolean);
    const content = contentEl.value || '';

    function toYaml(obj) {
      const lines = [];
      function emitKV(k, v) {
        if (k === 'content') {
          const hasNewline = String(v).includes('\n');
          if (hasNewline) { lines.push(`${k}: |-`); String(v).split('\n').forEach(line => lines.push(`  ${line}`)); }
          else { lines.push(`${k}: ${String(v)}`); }
          return;
        }
        lines.push(`${k}: ${String(v)}`);
      }
      Object.keys(obj).forEach(k => {
        if (k === 'tags' && Array.isArray(obj[k])) { lines.push('tags:'); obj[k].forEach(t => lines.push(`  - ${t}`)); }
        else if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') { emitKV(k, obj[k]); }
      });
      return lines.join('\n');
    }

    const fmt = (formatEl?.value) || 'note';

    const asYaml = toYaml({ name, category, priority, tags, content });
    // Build markdown with frontmatter for metadata
    const asMarkdown = (() => {
      const fm = [];
      fm.push('---');
      fm.push(`name: ${name}`);
      if (category) fm.push(`category: ${category}`);
      if (priority) fm.push(`priority: ${priority}`);
      if (tags.length) fm.push(`tags: [${tags.map(t => `\"${t}\"`).join(', ')}]`);
      fm.push('---');
      return `${fm.join('\\n')}\\n\\n${content}`;
    })();

    try {
      if (fmt === 'note') {
        const resp = await fetch(apiBase() + '/api/new/note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, category, priority, tags, content }) });
        const text = await resp.text();
        let ok = resp.ok, msg = text;
        try { const d = parseYaml(text) || {}; ok = !!d.ok; msg = d.stdout || d.error || text; } catch { }
        setStatus((ok ? 'Created note.' : 'Create failed.'));
        currentPath = null; setPathHint('');
      } else {
        const ext = fmt === 'markdown' ? '.md' : '.yml';
        const fname = sanitizeNameForPath(name) || 'untitled';
        const target = currentPath || `user/notes/${fname}${ext}`;
        const body = {
          path: target,
          content: fmt === 'markdown' ? asMarkdown : asYaml,
        };
        const resp = await fetch(apiBase() + '/api/file/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const ok = resp.ok;
        const msg = await resp.text();
        setStatus(ok ? 'Saved.' : 'Save failed.');
        if (ok) { currentPath = target; setPathHint(target); }
      }
    } catch (e) {
      setStatus('Server unavailable.');
    }
  });

  function showStickyNotesWidget() {
    try { context?.bus?.emit('widget:show', 'StickyNotes'); } catch { }
    try { window?.ChronosBus?.emit?.('widget:show', 'StickyNotes'); } catch { }
  }

  function refreshStickyNotes() {
    try { context?.bus?.emit('sticky:refresh'); } catch { }
    try { window?.ChronosBus?.emit?.('sticky:refresh'); } catch { }
  }

  async function sendToStickyNotes() {
    if (isReadOnly()) return;
    const title = (titleEl.value || '').trim();
    const body = String(contentEl.value || '').trim();
    const category = (categoryEl.value || '').trim();
    const priority = (priorityEl.value || '').trim();
    const tags = (tagsEl.value || '').trim();

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
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      refreshStickyNotes();
      showStickyNotesWidget();
      setStatus('Sent to Sticky Notes.');
    } catch (err) {
      setStatus('Sticky export failed.');
    }
  }

  stickyBtn?.addEventListener('click', sendToStickyNotes);

  // Load note: by file or by name
  async function tryFetchNoteByName(name) {
    // Attempt via CLI get for known fields (requires server)
    async function cliGet(prop) {
      const body = `command: get\nargs:\n  - note\n  - ${name}\n  - ${prop}\n`;
      try { const r = await fetch(apiBase() + '/api/cli', { method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body }); const t = await r.text(); return t; } catch { return ''; }
    }
    function parseGetOut(t) { const m = String(t || '').match(/:\s([^\n]+)$/m); return m ? m[1].trim() : ''; }
    const loaded = {};
    loaded.name = name;
    const cat = parseGetOut(await cliGet('category')); if (cat) loaded.category = cat;
    const pri = parseGetOut(await cliGet('priority')); if (pri) loaded.priority = pri.toLowerCase();
    const tagsS = parseGetOut(await cliGet('tags'));
    if (tagsS) loaded.tags = tagsS.split(',').map(s => s.trim()).filter(Boolean);
    const contentS = parseGetOut(await cliGet('content')); if (contentS) loaded.content = contentS;
    if (!cat && !pri && !tagsS && !contentS) return false;
    fillFromObj(loaded); return true;
  }

  function fillFromObj(obj) {
    if (obj.name) titleEl.value = obj.name;
    if (obj.category) { const cat = String(obj.category); if (![...categoryEl.options].some(o => o.value.toLowerCase() === cat.toLowerCase())) { const opt = document.createElement('option'); opt.value = cat; opt.textContent = cat; categoryEl.appendChild(opt); } categoryEl.value = cat; }
    if (obj.priority) priorityEl.value = String(obj.priority).toLowerCase();
    if (Array.isArray(obj.tags)) tagsEl.value = obj.tags.join(', ');
    if (obj.content != null) contentEl.value = String(obj.content);
    updatePreview();
  }

  loadBtn.addEventListener('click', async () => {
    const name = prompt('Enter note name to load (or Cancel to choose a file)');
    if (name && name.trim()) {
      const ok = await tryFetchNoteByName(name.trim());
      if (!ok) { alert('Could not load via API. Choose a YAML file instead.'); fileInput.click(); }
    } else {
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0]; if (!f) return;
    const text = await f.text();
    if (/\.(md|markdown)$/i.test(f.name)) {
      // Try to strip frontmatter; otherwise just load content
      const m = text.match(/^---\\s*\\n([\\s\\S]*?)\\n---\\s*\\n([\\s\\S]*)$/);
      if (m) {
        try {
          const meta = parseYaml(m[1]) || {};
          fillFromObj({ name: titleEl.value || meta.name || f.name.replace(/\\.(md|markdown)$/i, ''), category: meta.category, priority: meta.priority, tags: meta.tags, content: m[2] });
        } catch { fillFromObj({ name: f.name.replace(/\\.(md|markdown)$/i, ''), content: m[2] }); }
      } else {
        fillFromObj({ name: f.name.replace(/\\.(md|markdown)$/i, ''), content: text });
      }
      formatEl.value = 'markdown';
      currentPath = null; setPathHint('');
    } else {
      const data = parseYaml(text) || {};
      fillFromObj(data);
      formatEl.value = 'note';
      currentPath = null; setPathHint('');
    }
    fileInput.value = '';
  });

  // Resizers
  function edgeDrag(startRect, cb) { return (ev) => { ev.preventDefault(); function move(e) { cb(e, startRect); } function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); } window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); } }
  const re = el.querySelector('.resizer.e'); const rs = el.querySelector('.resizer.s'); const rse = el.querySelector('.resizer.se');
  if (re) re.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(260, e.clientX - sr.left) + 'px'; })(ev); });
  if (rs) rs.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.height = Math.max(160, e.clientY - sr.top) + 'px'; })(ev); });
  if (rse) rse.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(260, e.clientX - sr.left) + 'px'; el.style.height = Math.max(160, e.clientY - sr.top) + 'px'; })(ev); });

  function expandText(s) {
    try {
      return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s || '')) : String(s || '');
    } catch { return String(s || ''); }
  }
  function updatePreview() {
    try {
      if (!previewChk || !previewEl) return;
      if (!previewChk.checked) { previewEl.style.display = 'none'; return; }
      previewEl.style.display = '';
      // Show expanded content; optionally include expanded title on first line
      const title = expandText(titleEl.value || '');
      const body = expandText(contentEl.value || '');
      previewEl.textContent = (title ? (title + '\n\n') : '') + body;
      // Also mark for general expansion helper
      try { previewEl.setAttribute('data-raw', (titleEl.value || '') + '\n\n' + (contentEl.value || '')); } catch { }
    } catch { }
  }
  previewChk?.addEventListener('change', updatePreview);
  contentEl?.addEventListener('input', updatePreview);
  titleEl?.addEventListener('input', updatePreview);
  textSizeEl?.addEventListener('change', () => applyTextSize(textSizeEl.value));
  expandedChk?.addEventListener('change', syncExpandedView);
  readOnlyChk?.addEventListener('change', applyReadOnlyState);
  // Re-expand on vars change
  try { context?.bus?.on('vars:changed', () => updatePreview()); } catch { }
  try {
    context?.bus?.on('notes:openFile', async (payload) => {
      const path = payload?.path;
      const fmt = (payload?.format) || 'markdown';
      const title = payload?.title;
      if (!path) return;
      try {
        const resp = await fetch(apiBase() + '/api/file/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
        const txt = await resp.text();
        contentEl.value = txt;
        titleEl.value = title || path.split(/[\\/]/).pop().replace(/\\.[^.]+$/, '');
        formatEl.value = fmt || 'markdown';
        currentPath = path;
        setPathHint(path);
        updatePreview();
      } catch { }
    });
  } catch { }
  // Bus hookup to open files in Notes
  try {
    const onOpenFile = async (payload) => {
      const path = payload?.path;
      const fmt = (payload?.format) || 'markdown';
      const title = payload?.title;
      if (!path) return;
      try {
        const resp = await fetch(apiBase() + '/api/file/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
        let dataTxt = '';
        try {
          const obj = await resp.json();
          if (obj && obj.content !== undefined) dataTxt = obj.content;
        } catch {
          dataTxt = await resp.text();
        }
        contentEl.value = dataTxt || '';
        titleEl.value = title || path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
        formatEl.value = fmt || 'markdown';
        currentPath = path;
        setPathHint(path);
        updatePreview();
      } catch { }
      // show the widget
      try { context?.bus?.emit('widget:show', 'Notes'); } catch { }
      try { window?.ChronosBus?.emit?.('widget:show', 'Notes'); } catch { }
    };
    context?.bus?.on('notes:openFile', onOpenFile);
    window?.ChronosBus?.on?.('notes:openFile', onOpenFile);
  } catch { }

  // Ensure preview reflects initial state and any programmatic fills
  try {
    requestAnimationFrame(() => {
      if (expandedChk) expandedChk.checked = el?.dataset?.maximized === 'true';
      applyTextSize(localStorage.getItem(TEXT_SIZE_STORAGE_KEY) || '15', { persist: false });
      applyReadOnlyState();
      updatePreview();
    });
  } catch { }
  updatePreview();

  console.log('[Chronos][Notes] Widget ready');
  return { fillFromObj };
}

