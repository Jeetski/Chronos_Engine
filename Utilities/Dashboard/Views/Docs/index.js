const STYLE_ID = 'chronos-docs-view-style';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .docs-shell { display:flex; flex-direction:column; gap:10px; height:100%; color:var(--chronos-text); }
    .docs-toolbar { display:flex; gap:8px; align-items:center; }
    .docs-input { flex:1; background:#0f141d; color:var(--chronos-text); border:1px solid #222835; border-radius:8px; padding:6px 8px; }
    .docs-btn { border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.05); color:var(--chronos-text); border-radius:8px; padding:6px 10px; cursor:pointer; }
    .docs-status { font-size:12px; color:var(--chronos-text-muted); }
    .docs-body { display:flex; gap:10px; min-height:0; flex:1; }
    .docs-left { width: 36%; min-width: 240px; display:flex; flex-direction:column; gap:10px; min-height:0; }
    .docs-section { background: rgba(21,25,35,0.85); border: 1px solid #222835; border-radius: 10px; padding: 10px; display:flex; flex-direction:column; gap:8px; min-height:0; }
    .docs-section-title { font-weight:700; font-size:13px; color:var(--chronos-text); }
    .docs-tree { flex:1; overflow:auto; }
    .docs-tree-item { display:flex; gap:8px; align-items:center; font-size:12px; padding:2px 4px; border-radius:6px; cursor:pointer; }
    .docs-tree-item:hover { background:#0f141d; }
    .docs-tree-label { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .docs-tree-toggle { width:26px; text-align:center; color:var(--chronos-text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
    .docs-results { max-height: 200px; overflow:auto; display:flex; flex-direction:column; gap:6px; }
    .docs-result { border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:6px 8px; background:rgba(12,14,22,0.7); cursor:pointer; }
    .docs-result-title { font-size:12px; font-weight:600; }
    .docs-result-line { font-size:11px; color:var(--chronos-text-muted); }
    .docs-right { flex:1; min-width: 320px; display:flex; flex-direction:column; gap:8px; min-height:0; }
    .docs-reader-header { font-size:12px; color:var(--chronos-text-muted); }
    .docs-reader { flex:1; width:100%; resize:none; border:1px solid #222835; border-radius:10px; padding:10px; background:#0b0f16; color:#e6e8ef; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size:12px; line-height:1.5; }
  `;
  document.head.appendChild(style);
}

function apiBase() {
  const o = window.location?.origin;
  if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
  return o;
}

function buildTree(paths) {
  const root = { name: '', path: '', children: new Map(), file: false };
  for (const raw of paths) {
    const rel = String(raw || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!rel) continue;
    const parts = rel.split('/');
    let node = root;
    let curPath = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      curPath = curPath ? `${curPath}/${part}` : part;
      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          path: curPath,
          children: new Map(),
          file: i === parts.length - 1,
        });
      }
      node = node.children.get(part);
    }
  }
  return root;
}

function sortChildren(node) {
  const entries = Array.from(node.children.values());
  entries.sort((a, b) => {
    if (a.file !== b.file) return a.file ? 1 : -1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return entries;
}

export function mount(el) {
  injectStyles();
  const state = {
    tree: null,
    collapsed: new Set(),
    currentPath: '',
  };

  const root = document.createElement('div');
  root.className = 'docs-shell';
  root.innerHTML = `
    <div class="docs-toolbar">
      <input class="docs-input" data-search placeholder="Search docs..." />
      <button class="docs-btn" data-search-btn>Search</button>
      <button class="docs-btn" data-clear-btn>Clear</button>
      <div class="docs-status" data-status></div>
    </div>
    <div class="docs-body">
      <div class="docs-left">
        <div class="docs-section">
          <div class="docs-section-title">Search Results</div>
          <div class="docs-results" data-results></div>
        </div>
        <div class="docs-section">
          <div class="docs-section-title">Docs</div>
          <div class="docs-tree" data-tree></div>
        </div>
      </div>
      <div class="docs-right">
        <div class="docs-reader-header" data-reader-title>Pick a doc...</div>
        <textarea class="docs-reader" data-reader readonly></textarea>
      </div>
    </div>
  `;
  el.appendChild(root);

  const searchInput = root.querySelector('[data-search]');
  const statusEl = root.querySelector('[data-status]');
  const resultsEl = root.querySelector('[data-results]');
  const treeEl = root.querySelector('[data-tree]');
  const readerEl = root.querySelector('[data-reader]');
  const readerTitleEl = root.querySelector('[data-reader-title]');

  const setStatus = (msg) => {
    if (statusEl) statusEl.textContent = msg || '';
  };

  const renderTree = () => {
    if (!state.tree || !treeEl) return;
    treeEl.innerHTML = '';
    const makeRow = (node, depth) => {
      const row = document.createElement('div');
      row.className = 'docs-tree-item';
      row.style.paddingLeft = `${depth * 12}px`;
      const toggle = document.createElement('span');
      toggle.className = 'docs-tree-toggle';
      if (node.file) {
        toggle.textContent = '   ';
      } else {
        toggle.textContent = state.collapsed.has(node.path) ? '[+]' : '[-]';
      }
      const label = document.createElement('span');
      label.className = 'docs-tree-label';
      label.textContent = node.name;
      row.append(toggle, label);
      row.addEventListener('click', () => {
        if (!node.file) {
          if (state.collapsed.has(node.path)) state.collapsed.delete(node.path);
          else state.collapsed.add(node.path);
          renderTree();
          return;
        }
        openDoc(node.path);
      });
      return row;
    };
    const walk = (node, depth) => {
      for (const child of sortChildren(node)) {
        treeEl.appendChild(makeRow(child, depth));
        if (!child.file && !state.collapsed.has(child.path)) {
          walk(child, depth + 1);
        }
      }
    };
    walk(state.tree, 0);
  };

  const openDoc = async (path, lineNumber) => {
    if (!path) return;
    try {
      const resp = await fetch(`${apiBase()}/api/docs/read?path=${encodeURIComponent(path)}`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
      state.currentPath = data.path || path;
      readerTitleEl.textContent = state.currentPath;
      readerEl.value = data.content || '';
      if (lineNumber && Number.isFinite(lineNumber)) {
        const lines = readerEl.value.split(/\r?\n/);
        const idx = Math.max(1, Math.floor(lineNumber)) - 1;
        let offset = 0;
        for (let i = 0; i < Math.min(idx, lines.length); i++) offset += lines[i].length + 1;
        readerEl.focus();
        readerEl.setSelectionRange(offset, offset);
        const lineHeight = 18;
        readerEl.scrollTop = Math.max(0, idx * lineHeight - readerEl.clientHeight / 3);
      }
    } catch (err) {
      setStatus(err?.message || 'Failed to read doc');
    }
  };

  const renderResults = (items) => {
    resultsEl.innerHTML = '';
    if (!items || !items.length) {
      resultsEl.innerHTML = '<div class="docs-status">No matches.</div>';
      return;
    }
    items.forEach(hit => {
      const card = document.createElement('div');
      card.className = 'docs-result';
      const title = document.createElement('div');
      title.className = 'docs-result-title';
      title.textContent = `${hit.path}:${hit.line}`;
      const line = document.createElement('div');
      line.className = 'docs-result-line';
      line.textContent = hit.text || '';
      card.append(title, line);
      card.addEventListener('click', () => openDoc(hit.path, hit.line));
      resultsEl.appendChild(card);
    });
  };

  const runSearch = async () => {
    const q = (searchInput?.value || '').trim();
    if (!q) {
      renderResults([]);
      setStatus('Enter a search term.');
      return;
    }
    setStatus('Searching...');
    try {
      const resp = await fetch(`${apiBase()}/api/docs/search?q=${encodeURIComponent(q)}&limit=200`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
      renderResults(data.results || []);
      setStatus(`Found ${data.results?.length || 0} match(es).`);
    } catch (err) {
      renderResults([]);
      setStatus(err?.message || 'Search failed.');
    }
  };

  root.querySelector('[data-search-btn]')?.addEventListener('click', runSearch);
  root.querySelector('[data-clear-btn]')?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    renderResults([]);
    setStatus('');
  });
  searchInput?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') runSearch();
  });

  const loadTree = async () => {
    try {
      const resp = await fetch(`${apiBase()}/api/docs/tree`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
      state.tree = buildTree(data.paths || []);
      renderTree();
      setStatus(`Loaded ${data.paths?.length || 0} doc(s).`);
    } catch (err) {
      setStatus(err?.message || 'Failed to load docs.');
    }
  };

  loadTree();
}
