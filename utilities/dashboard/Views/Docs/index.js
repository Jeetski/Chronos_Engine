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
    .docs-tree-item.active { background: rgba(122, 162, 247, 0.2); border: 1px solid rgba(122, 162, 247, 0.45); }
    .docs-tree-label { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .docs-tree-toggle { width:26px; text-align:center; color:var(--chronos-text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
    .docs-results { max-height: 200px; overflow:auto; display:flex; flex-direction:column; gap:6px; }
    .docs-result { border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:6px 8px; background:rgba(12,14,22,0.7); cursor:pointer; }
    .docs-result-title { font-size:12px; font-weight:600; }
    .docs-result-line { font-size:11px; color:var(--chronos-text-muted); }
    .docs-right { flex:1; min-width: 320px; display:flex; flex-direction:column; gap:8px; min-height:0; }
    .docs-reader-header { font-size:12px; color:var(--chronos-text-muted); }
    .docs-reader { flex:1; width:100%; resize:none; border:1px solid #222835; border-radius:10px; padding:10px; background:#0b0f16; color:#e6e8ef; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size:12px; line-height:1.5; display:none; }
    .docs-render {
      flex: 1;
      min-height: 0;
      overflow: auto;
      border: 1px solid #222835;
      border-radius: 10px;
      padding: 14px;
      background: #0b0f16;
      color: #e6e8ef;
      font-size: 13px;
      line-height: 1.6;
    }
    .docs-render pre {
      background: #0a0d13;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 10px;
      overflow: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.5;
    }
    .docs-render code {
      background: rgba(255,255,255,0.08);
      border-radius: 4px;
      padding: 1px 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
    }
    .docs-render pre code { background: transparent; padding: 0; }
    .docs-render h1, .docs-render h2, .docs-render h3, .docs-render h4, .docs-render h5, .docs-render h6 {
      margin: 14px 0 8px;
      line-height: 1.25;
    }
    .docs-render h1 { font-size: 24px; }
    .docs-render h2 { font-size: 20px; }
    .docs-render h3 { font-size: 17px; }
    .docs-render p { margin: 8px 0; }
    .docs-render ul, .docs-render ol { margin: 8px 0 8px 20px; }
    .docs-render blockquote {
      margin: 10px 0;
      padding: 8px 12px;
      border-left: 3px solid rgba(122, 162, 247, 0.8);
      background: rgba(122, 162, 247, 0.08);
      border-radius: 0 8px 8px 0;
    }
    .docs-render hr {
      border: none;
      border-top: 1px solid rgba(255,255,255,0.16);
      margin: 14px 0;
    }
    .docs-render a {
      color: #8ec5ff;
      text-decoration: underline;
    }
    .docs-render a:hover { filter: brightness(1.08); }
    .docs-render .docs-pre {
      white-space: pre-wrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.5;
    }
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

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, (ch) => (
    ch === '&' ? '&amp;'
      : ch === '<' ? '&lt;'
      : ch === '>' ? '&gt;'
      : ch === '"' ? '&quot;'
      : '&#39;'
  ));
}

function formatInlineMarkdown(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return s;
}

function markdownToHtml(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inCode = false;
  let code = [];
  let listType = null;
  let quoteOpen = false;
  let para = [];

  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p>${formatInlineMarkdown(para.join(' '))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (!listType) return;
    out.push(listType === 'ol' ? '</ol>' : '</ul>');
    listType = null;
  };
  const closeQuote = () => {
    if (!quoteOpen) return;
    out.push('</blockquote>');
    quoteOpen = false;
  };

  for (const lineRaw of lines) {
    const line = lineRaw || '';
    const trim = line.trim();

    if (inCode) {
      if (/^```/.test(trim)) {
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        inCode = false;
        code = [];
      } else {
        code.push(line);
      }
      continue;
    }

    if (/^```/.test(trim)) {
      flushPara();
      closeList();
      closeQuote();
      inCode = true;
      code = [];
      continue;
    }

    if (!trim) {
      flushPara();
      closeList();
      closeQuote();
      continue;
    }

    const heading = trim.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushPara();
      closeList();
      closeQuote();
      const level = heading[1].length;
      out.push(`<h${level}>${formatInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(trim) || /^\*\*\*+$/.test(trim)) {
      flushPara();
      closeList();
      closeQuote();
      out.push('<hr/>');
      continue;
    }

    const quote = trim.match(/^>\s?(.*)$/);
    if (quote) {
      flushPara();
      closeList();
      if (!quoteOpen) {
        out.push('<blockquote>');
        quoteOpen = true;
      }
      out.push(`<p>${formatInlineMarkdown(quote[1])}</p>`);
      continue;
    }

    const ol = trim.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      flushPara();
      closeQuote();
      if (listType !== 'ol') {
        closeList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${formatInlineMarkdown(ol[1])}</li>`);
      continue;
    }

    const ul = trim.match(/^[-*]\s+(.+)$/);
    if (ul) {
      flushPara();
      closeQuote();
      if (listType !== 'ul') {
        closeList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${formatInlineMarkdown(ul[1])}</li>`);
      continue;
    }

    closeList();
    closeQuote();
    para.push(trim);
  }

  flushPara();
  closeList();
  closeQuote();

  if (inCode) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  return out.join('\n');
}

function isMarkdownPath(path) {
  return /\.(md|markdown)$/i.test(String(path || ''));
}

export function mount(el) {
  injectStyles();
  const state = {
    tree: null,
    collapsed: new Set(),
    currentPath: '',
    selectedPath: '',
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
        <div class="docs-render" data-render></div>
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
  const renderEl = root.querySelector('[data-render]');
  const readerTitleEl = root.querySelector('[data-reader-title]');

  const setStatus = (msg) => {
    if (statusEl) statusEl.textContent = msg || '';
  };

  const normalizeDocPath = (path) => {
    let p = String(path || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!p) return '';
    if (p.toLowerCase().startsWith('docs/')) p = p.slice(5);
    return p;
  };

  const renderTree = () => {
    if (!state.tree || !treeEl) return;
    treeEl.innerHTML = '';
    const makeRow = (node, depth) => {
      const row = document.createElement('div');
      row.className = 'docs-tree-item';
      if (state.selectedPath && node.path === state.selectedPath) row.classList.add('active');
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
      state.selectedPath = normalizeDocPath(state.currentPath);
      readerTitleEl.textContent = state.currentPath;
      readerEl.value = data.content || '';
      if (renderEl) {
        const content = String(data.content || '');
        if (isMarkdownPath(state.currentPath)) {
          renderEl.innerHTML = markdownToHtml(content);
        } else {
          renderEl.innerHTML = `<pre class="docs-pre">${escapeHtml(content)}</pre>`;
        }
        renderEl.scrollTop = 0;
      }
      renderTree();
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

  const expandToPath = (path) => {
    const rel = normalizeDocPath(path);
    if (!rel) return;
    const parts = rel.split('/').filter(Boolean);
    let cur = '';
    for (let i = 0; i < parts.length - 1; i++) {
      cur = cur ? `${cur}/${parts[i]}` : parts[i];
      state.collapsed.delete(cur);
    }
  };

  const openRequestedDoc = (request) => {
    const path = normalizeDocPath(request?.path || request);
    if (!path) return;
    expandToPath(path);
    state.selectedPath = path;
    renderTree();
    const line = request && Number.isFinite(Number(request.line)) ? Number(request.line) : undefined;
    openDoc(path, line);
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
      try {
        const pending = window.__chronosDocsOpenRequest;
        if (pending?.path) {
          openRequestedDoc(pending);
          try { window.__chronosDocsOpenRequest = null; } catch { }
        }
      } catch { }
    } catch (err) {
      setStatus(err?.message || 'Failed to load docs.');
    }
  };

  let detachDocsOpen = null;
  try {
    detachDocsOpen = window.ChronosBus?.on?.('docs:open', (payload) => openRequestedDoc(payload)) || null;
  } catch { }
  try { window.ChronosDocsOpen = (payload) => openRequestedDoc(payload); } catch { }

  loadTree();

  return {
    openDoc(path, lineNumber) {
      openRequestedDoc({ path, line: lineNumber });
    },
    dispose() {
      try { if (typeof detachDocsOpen === 'function') detachDocsOpen(); } catch { }
      try { if (window.ChronosDocsOpen) delete window.ChronosDocsOpen; } catch { }
    }
  };
}
