export function mount(el) {
  // Load CSS
  if (!document.getElementById('item-manager-css')) {
    const link = document.createElement('link');
    link.id = 'item-manager-css';
    link.rel = 'stylesheet';
    link.href = new URL('./item-manager.css', import.meta.url).toString();
    document.head.appendChild(link);
  }

  el.className = 'widget item-manager-widget';

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
      .im-yaml-editor { position:relative; flex:1 1 0; min-height:120px; border:1px solid var(--border); border-radius:10px; background:#0f141d; overflow:auto; }
      .im-yaml-highlight, .im-yaml-input {
        margin:0; border:0; outline:none; width:100%; min-height:100%;
        font-family: var(--chronos-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
        font-size:13px; line-height:1.45; padding:10px 12px; white-space:pre; tab-size:2;
      }
      .im-yaml-highlight { position:absolute; top:0; left:0; pointer-events:none; color:#d4d4d4; z-index:1; }
      .im-yaml-input {
        position:absolute; top:0; left:0; resize:none; z-index:2; background:transparent;
        color:transparent; caret-color:var(--text, #e6e8ef); overflow:hidden;
      }
      /* Token colors copied from Editor view for parity */
      .tok-comment { color:#6a9955; font-style:italic; }
      .tok-key { color:#569cd6; font-weight:bold; }
      .tok-val { color:#ce9178; }
      .tok-cmd { color:#c586c0; font-weight:bold; }
      .tok-arg { color:#9cdcfe; }
      .tok-flag { color:#d7ba7d; }
      .tok-keyword { color:#c586c0; font-weight:bold; }
      .tok-op { color:#d4d4d4; }
      .tok-num { color:#b5cea8; }
      .tok-str { color:#ce9178; }
      .tok-var { color:#9cdcfe; }
      .tok-prop { color:#4ec9b0; }
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
        <input id="imBulkProp" class="input" list="imPropKeys" placeholder="property:value (e.g. status:pending)" style="flex:1 1 260px; min-width:220px;" />
        <datalist id="imPropKeys"></datalist>
        <button class="btn" id="imBulkSet" style="flex:0 0 auto;">Set Property</button>
        <button class="btn btn-secondary" id="imBulkDelete" style="flex:0 0 auto;">Delete Selected</button>
        <button class="btn btn-primary" id="imNew" style="flex:0 0 auto;">New</button>
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
          <div class="im-yaml-editor" id="imYamlEditor">
            <pre id="imYamlHighlight" class="im-yaml-highlight" aria-hidden="true"></pre>
            <textarea id="imYaml" class="textarea im-yaml-input" placeholder="YAML properties..." spellcheck="false"></textarea>
          </div>
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
  const bulkPropEl = el.querySelector('#imBulkProp');
  const propKeysEl = el.querySelector('#imPropKeys');
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
  const yamlEditorEl = el.querySelector('#imYamlEditor');
  const yamlHighlightEl = el.querySelector('#imYamlHighlight');

  // Minimize/Close (match other widgets)
  btnMin.addEventListener('click', () => { el.classList.toggle('minimized'); });
  btnClose.addEventListener('click', () => { el.style.display = 'none'; try { window?.ChronosBus?.emit?.('widget:closed', 'ItemManager'); } catch { } });

  function expandText(s) { try { return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s || '')) : String(s || ''); } catch { return String(s || ''); } }
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeHighlightHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function highlightYamlCode(code) {
    let html = escapeHighlightHtml(code);
    html = html.replace(/^(\s*)(#.*)$/gm, '$1<span class="tok-comment">$2</span>');
    html = html.replace(/^(\s*)([\w\-\d_]+)(:)/gm, '$1<span class="tok-key">$2</span>$3');
    html = html.replace(/(:\s*)(["'].*?["'])/g, '$1<span class="tok-val">$2</span>');
    return html;
  }
  function renderYamlHighlight() {
    if (!yamlHighlightEl || !yamlEl) return;
    yamlHighlightEl.innerHTML = highlightYamlCode(yamlEl.value || '') + '\n';
  }
  function syncYamlScroll() {
    if (!yamlHighlightEl || !yamlEl) return;
    yamlHighlightEl.style.transform = `translate(${-yamlEl.scrollLeft}px, ${-yamlEl.scrollTop}px)`;
  }
  async function fetchJsonChecked(url, options, fallbackError = 'Request failed') {
    const resp = await fetch(url, options);
    const text = await resp.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!resp.ok || data?.ok === false) {
      const msg = data?.error || data?.message || text || `${fallbackError} (${resp.status})`;
      throw new Error(String(msg));
    }
    return { resp, data, text };
  }
  yamlEl?.addEventListener('input', renderYamlHighlight);
  yamlEl?.addEventListener('scroll', syncYamlScroll);
  yamlEditorEl?.addEventListener('click', () => { try { yamlEl?.focus(); } catch { } });

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  const saveLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
  const loadLocal = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };
  const defaultsCache = {};
  let propertyRegistry = { keys_by_type: {}, defaults_keys_by_type: {}, properties: {} };

  const fetchJson = async (url) => { const r = await fetch(url); return await r.json(); };
  const fetchSettingsFile = async (file) => {
    try {
      const j = await fetchJson(apiBase() + `/api/settings?file=${encodeURIComponent(file)}`);
      return j && j.content ? String(j.content) : null;
    } catch { return null; }
  };
  function parseYamlFlat(yaml) {
    const lines = String(yaml || '').replace(/\r\n?/g, '\n').split('\n');
    const out = {}; let curKey = null, inBlock = false;
    for (let raw of lines) {
      const line = raw.replace(/#.*$/, ''); if (!line.trim()) continue;
      if (inBlock) {
        if (/^\s/.test(line)) { out[curKey] = (out[curKey] || '') + (out[curKey] ? '\n' : '') + line.trim(); continue; }
        inBlock = false; curKey = null;
      }
      const m = line.match(/^\s*([\w\-]+)\s*:\s*(.*)$/);
      if (m) {
        const k = m[1]; let v = m[2];
        if (v === '|-' || v === '|') { curKey = k; inBlock = true; out[k] = ''; continue; }
        if (/^(true|false)$/i.test(v)) v = (/^true$/i.test(v));
        else if (/^-?\d+$/.test(v)) v = parseInt(v, 10);
        out[k] = v;
      }
    }
    return out;
  }
  async function fetchDefaultsFor(type) {
    const key = String(type || 'task').toLowerCase();
    if (defaultsCache[key]) return defaultsCache[key];
    const lower = key;
    const title = lower.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('_');
    const candidates = [
      `${lower}_defaults.yml`,
      `${title}_Defaults.yml`,
      `${title}_defaults.yml`,
    ];
    for (const f of candidates) {
      const y = await fetchSettingsFile(f);
      if (y) {
        try {
          const raw = parseYamlFlat(y) || {};
          const now = new Date();
          const placeholders = {
            '{{timestamp}}': `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`,
            '{{tomorrow}}': (() => { const t = new Date(now.getTime() + 86400000); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })(),
          };
          const norm = {};
          Object.entries(raw).forEach(([k, v]) => {
            let val = v;
            if (typeof val === 'string') {
              Object.entries(placeholders).forEach(([ph, repl]) => { val = val.replaceAll(ph, repl); });
            }
            const kk = String(k || '').toLowerCase().replace(/^default_/, '');
            norm[kk] = val;
          });
          defaultsCache[key] = norm;
          return norm;
        } catch { return {}; }
      }
    }
    defaultsCache[key] = {};
    return {};
  }

  // Types: prefer server; fall back to defaults
  const DEFAULT_TYPES = ['task', 'note', 'habit', 'project', 'routine', 'journal_entry', 'dream_diary_entry', 'appointment', 'alarm', 'reminder', 'reward', 'commitment'];
  function renderTypes(types) {
    const uniq = Array.from(new Set(types.concat(DEFAULT_TYPES)));
    typeSel.innerHTML = '';
    uniq.forEach(t => { const opt = document.createElement('option'); opt.value = t; opt.textContent = t; typeSel.appendChild(opt); });
    const stored = loadLocal('im_type', 'task');
    typeSel.value = uniq.includes(stored) ? stored : uniq[0];
  }
  async function fetchTypes() {
    try {
      const resp = await fetch(apiBase() + "/api/items?type=task");
      const text = await resp.text();
      try {
        const data = JSON.parse(text);
        if (data && data.items && Array.isArray(data.items)) {
          const inferred = Array.from(new Set(data.items.map(i => i.type).filter(Boolean)));
          if (inferred.length) { renderTypes(inferred); return; }
        }
      } catch { }
    } catch { }
    renderTypes([]);
  }

  // Sorting
  let sortKey = 'updated';
  let sortDir = 'desc';
  el.querySelectorAll('.im-list-header span[data-key]').forEach(span => {
    span.addEventListener('click', () => {
      const key = span.getAttribute('data-key') || 'name';
      if (sortKey === key) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; } else { sortKey = key; sortDir = 'asc'; }
      refresh();
    });
  });

  async function fetchItems() {
    const type = typeSel.value || 'task';
    const q = searchEl.value || '';
    saveLocal('im_type', type); saveLocal('im_search', q);
    console.log('[ItemManager] fetchItems type=', type, 'q=', q);
    try {
      const resp = await fetch(apiBase() + `/api/items?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`);
      const data = await resp.json();
      console.log('[ItemManager] fetchItems response:', data);
      if (data && data.items && Array.isArray(data.items)) {
        console.log('[ItemManager] fetchItems found', data.items.length, 'items');
        return data.items.map(it => ({
          name: expandText(it.name || ''),
          rawName: it.name || '',
          priority: it.priority || '',
          status: it.status || '',
          category: it.category || '',
          updated: it.updated || '',
        }));
      }
    } catch (err) { console.error('[ItemManager] fetchItems error:', err); }
    return [];
  }

  function renderItems(items) {
    items.sort((a, b) => {
      const av = (a[sortKey] || '').toString().toLowerCase();
      const bv = (b[sortKey] || '').toString().toLowerCase();
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    countEl.textContent = `${items.length} items`;
    listEl.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.style.padding = '8px 6px';
      empty.textContent = 'No items found. Try another type or search.';
      listEl.appendChild(empty);
      return;
    }
    items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'im-row';
      row.innerHTML = `
        <label><input type="checkbox" /></label>
        <div class="name">${escapeHtml(it.name)}</div>
        <div class="meta">${escapeHtml(it.priority || '')}</div>
        <div class="meta">${escapeHtml(it.status || '')}</div>
        <div class="meta">${escapeHtml(it.category || '')}</div>
        <div class="meta">${escapeHtml(it.updated || '')}</div>
      `;
      row.dataset.name = it.rawName;
      row.addEventListener('click', (ev) => { if (ev.target.tagName.toLowerCase() !== 'input') loadItem(it.rawName); });
      listEl.appendChild(row);
    });
  }

  function toYaml(val, indent = 0) {
    const pad = '  '.repeat(indent);
    if (val === null || val === undefined) return 'null';
    if (Array.isArray(val)) {
      if (!val.length) return '[]';
      return val.map(v => {
        if (typeof v === 'object' && v !== null) {
          const sub = toYaml(v, indent + 1);
          return `${pad}- ${sub.includes('\n') ? `\n${sub}` : sub.trim()}`;
        }
        return `${pad}- ${scalar(v)}`;
      }).join('\n');
    }
    if (typeof val === 'object') {
      const entries = Object.entries(val);
      if (!entries.length) return '{}';
      return entries.map(([k, v]) => {
        const key = `${pad}${k}:`;
        if (typeof v === 'object' && v !== null) {
          const sub = toYaml(v, indent + 1);
          return `${key}${sub.includes('\n') ? `\n${sub}` : ` ${sub.trim()}`}`;
        }
        return `${key} ${scalar(v)}`;
      }).join('\n');
    }
    return scalar(val);
    function scalar(v) {
      if (typeof v === 'string') {
        if (v.includes('\n')) {
          const lines = v.split('\n').map(l => `${pad}  ${l}`).join('\n');
          return `|\n${lines}`;
        }
        return v;
      }
      if (typeof v === 'boolean' || typeof v === 'number') return String(v);
      return String(v || '');
    }
  }

  async function refresh() {
    const items = await fetchItems();
    renderItems(items);
  }

  async function loadItem(name) {
    nameEl.value = name;
    try {
      const resp = await fetch(apiBase() + `/api/item?type=${encodeURIComponent(typeSel.value || 'task')}&name=${encodeURIComponent(name)}`);
      const text = await resp.text();
      try {
        const json = JSON.parse(text);
        if (json && (json.content || json.item)) {
          const raw = json.content || json.item;
          yamlEl.value = (typeof raw === 'string') ? raw : toYaml(raw);
          renderYamlHighlight();
          syncYamlScroll();
          return;
        }
        if (json && json.text) {
          yamlEl.value = json.text;
          renderYamlHighlight();
          syncYamlScroll();
          return;
        }
      } catch { }
      // If server returned YAML/flat data, keep raw
      yamlEl.value = text || '';
      renderYamlHighlight();
      syncYamlScroll();
    } catch {
      yamlEl.value = '';
      renderYamlHighlight();
      syncYamlScroll();
    }
  }

  async function saveItem() {
    console.log('[ItemManager] saveItem called');
    const name = nameEl.value.trim();
    if (!name) { alert('Name required'); return; }
    try {
      const type = typeSel.value || 'task';
      const payload = { type, name, content: yamlEl.value };
      console.log('[ItemManager] Saving:', payload);
      const resp = await fetch(apiBase() + `/api/item`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      console.log('[ItemManager] Save response:', resp.status);
      const data = await resp.json().catch(() => ({}));
      console.log('[ItemManager] Save result:', data);
      if (!resp.ok || data.ok === false) {
        alert(`Save failed: ${data.error || resp.status}`);
        return;
      }
      // Show success feedback
      alert(`✅ Saved "${name}" successfully!`);
      refresh();
    } catch (err) {
      console.error('[ItemManager] Save error:', err);
      alert('Save failed: ' + (err?.message || 'Unknown error'));
    }
  }

  async function copyItem() {
    const src = nameEl.value.trim();
    if (!src) { alert('Load an item first.'); return; }
    const dest = prompt('Copy as:', `${src} copy`);
    if (!dest) return;
    try {
      await fetchJsonChecked(
        apiBase() + `/api/item/copy`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: typeSel.value || 'task', source: src, new_name: dest }) },
        'Copy failed'
      );
      await refresh(); await loadItem(dest);
    } catch (err) { alert('Copy failed: ' + (err?.message || 'Unknown error')); }
  }

  function collectPropertyKeysForType(type) {
    const out = new Set();
    const t = String(type || '').toLowerCase();
    const byType = propertyRegistry?.keys_by_type || {};
    const byDefaults = propertyRegistry?.defaults_keys_by_type || {};
    const propsMap = propertyRegistry?.properties || {};

    const addAll = (arr) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((k) => { if (k != null && String(k).trim()) out.add(String(k).trim()); });
    };

    addAll(byType[t]);
    addAll(byDefaults[t]);
    Object.values(byDefaults).forEach(addAll);
    Object.keys(propsMap || {}).forEach((k) => { if (k != null && String(k).trim()) out.add(String(k).trim()); });
    return Array.from(out).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  function renderPropertySuggestions() {
    if (!propKeysEl) return;
    const keys = collectPropertyKeysForType(typeSel?.value || 'task');
    propKeysEl.innerHTML = '';
    keys.forEach((k) => {
      const opt = document.createElement('option');
      opt.value = k;
      propKeysEl.appendChild(opt);
    });
  }

  async function fetchPropertyRegistry() {
    try {
      const resp = await fetch(apiBase() + '/api/registry?name=property');
      if (!resp.ok) return;
      const json = await resp.json().catch(() => ({}));
      const reg = json?.registry || {};
      propertyRegistry = {
        keys_by_type: reg?.keys_by_type || {},
        defaults_keys_by_type: reg?.defaults_keys_by_type || {},
        properties: reg?.properties || {},
      };
      renderPropertySuggestions();
    } catch { }
  }

  async function renameItem() {
    const src = nameEl.value.trim();
    if (!src) { alert('Load an item first.'); return; }
    const dest = prompt('Rename to:', src);
    if (!dest || dest === src) return;
    try {
      await fetchJsonChecked(
        apiBase() + `/api/item/rename`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: typeSel.value || 'task', old_name: src, new_name: dest }) },
        'Rename failed'
      );
      nameEl.value = dest;
      await refresh(); await loadItem(dest);
    } catch (err) { alert('Rename failed: ' + (err?.message || 'Unknown error')); }
  }

  async function deleteItem(name) {
    await fetchJsonChecked(
      apiBase() + `/api/item/delete`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: typeSel.value || 'task', name }) },
      'Delete failed'
    );
  }

  async function deleteSelected() {
    const rows = Array.from(listEl.querySelectorAll('.im-row'));
    const selected = rows.filter(r => r.querySelector('input[type=checkbox]')?.checked).map(r => r.dataset.name).filter(Boolean);
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} items?`)) return;
    try {
      for (const name of selected) { await deleteItem(name); }
      refresh();
    } catch (err) {
      alert('Delete failed: ' + (err?.message || 'Unknown error'));
    }
  }

  async function bulkSetProp() {
    const rows = Array.from(listEl.querySelectorAll('.im-row'));
    const selected = rows.filter(r => r.querySelector('input[type=checkbox]')?.checked).map(r => r.dataset.name).filter(Boolean);
    if (!selected.length) { alert('Select at least one item.'); return; }
    const kv = String(bulkPropEl?.value || '').trim() || prompt('Set property (key:value)', 'status:pending') || '';
    if (!kv || !kv.includes(':')) return;
    const [k, ...rest] = kv.split(':'); const v = rest.join(':').trim();
    try {
      await fetchJsonChecked(
        apiBase() + `/api/items/setprop`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: typeSel.value || 'task', names: selected, property: k.trim(), value: v }) },
        'Set property failed'
      );
      if (bulkPropEl) bulkPropEl.value = kv;
      refresh();
    } catch (err) { alert('Set property failed: ' + (err?.message || 'Unknown error')); }
  }

  async function exportItems() {
    try {
      const resp = await fetch(apiBase() + `/api/items/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: typeSel.value || 'task' }) });
      const text = await resp.text();
      alert(`Export result: ${text}`);
    } catch { alert('Export failed'); }
  }

  async function prepNewWithDefaults() {
    const type = typeSel.value || 'task';
    const defs = await fetchDefaultsFor(type);
    const base = Object.assign({ type, name: '', duration: 0 }, defs || {});
    // Only include type if absent in defaults to avoid double-listing
    if (!base.type) base.type = type;
    if (base.name === undefined) base.name = '';
    yamlEl.value = toYaml(base);
    nameEl.value = '';
    nameEl.focus();
    renderYamlHighlight();
    syncYamlScroll();
  }

  // Events
  newBtn.addEventListener('click', () => { prepNewWithDefaults(); });
  saveBtn.addEventListener('click', saveItem);
  copyBtn.addEventListener('click', copyItem);
  renameBtn.addEventListener('click', renameItem);
  deleteBtn.addEventListener('click', async () => { if (!nameEl.value.trim()) return; if (!confirm('Delete this item?')) return; await deleteItem(nameEl.value.trim()); refresh(); });
  searchBtn.addEventListener('click', refresh);
  searchEl.addEventListener('keypress', (e) => { if (e.key === 'Enter') refresh(); });
  refreshBtn.addEventListener('click', refresh);
  bulkDeleteBtn.addEventListener('click', deleteSelected);
  bulkSetBtn.addEventListener('click', bulkSetProp);
  bulkPropEl?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); bulkSetProp(); } });
  exportBtn.addEventListener('click', exportItems);
  selectAll.addEventListener('change', () => { listEl.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = selectAll.checked); });
  typeSel.addEventListener('change', () => { renderPropertySuggestions(); refresh(); });

  // Init
  fetchTypes().then(() => { searchEl.value = loadLocal('im_search', ''); refresh(); renderPropertySuggestions(); });
  fetchPropertyRegistry();
  renderYamlHighlight();
  syncYamlScroll();

  return { refresh };
}

