export function mount(el, context) {
  // Load CSS
  if (!document.getElementById('debug-console-css')) {
    const link = document.createElement('link');
    link.id = 'debug-console-css';
    link.rel = 'stylesheet';
    link.href = new URL('./debug-console.css', import.meta.url).href;
    document.head.appendChild(link);
  }

  el.className = 'widget debug-console-widget';
  el.dataset.uiId = 'widget.debug_console';

  const tpl = `
    <div class="header" id="debugHeader" data-ui-id="widget.debug_console.header">
      <div class="title" data-ui-id="widget.debug_console.title">Debug Console</div>
      <div class="controls">
        <button class="icon-btn" id="debugMin" title="Minimize" data-ui-id="widget.debug_console.minimize_button">_</button>
        <button class="icon-btn" id="debugClear" title="Clear" data-ui-id="widget.debug_console.clear_button">⌫</button>
        <button class="icon-btn" id="debugClose" title="Close" data-ui-id="widget.debug_console.close_button">x</button>
      </div>
    </div>
    <div class="content" style="gap:8px; display:flex; flex-direction:column; min-height:0;">
      <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap;">
        <label class="hint">Capture:</label>
        <label class="hint"><input type="checkbox" id="capLog" checked /> log</label>
        <label class="hint"><input type="checkbox" id="capInfo" checked /> info</label>
        <label class="hint"><input type="checkbox" id="capWarn" checked /> warn</label>
        <label class="hint"><input type="checkbox" id="capError" checked /> error</label>
        <label class="hint"><input type="checkbox" id="capOnErr" checked /> onerror</label>
        <label class="hint"><input type="checkbox" id="capAduc" checked /> ADUC/Nia</label>
        <label class="hint"><input type="checkbox" id="capTrick" checked /> TRICK</label>
        <div class="spacer"></div>
        <label class="hint">Filter:</label>
        <select id="debugFilter" class="input" style="max-width:170px;" data-ui-id="widget.debug_console.filter_select">
          <option value="all">all</option>
          <option value="aduc_nia">aduc/nia</option>
          <option value="trick">trick</option>
          <option value="server">server</option>
          <option value="error">error</option>
          <option value="warn">warn</option>
          <option value="info">info</option>
          <option value="log">log</option>
          <option value="onerror">onerror</option>
        </select>
        <button class="btn" id="debugRefresh" data-ui-id="widget.debug_console.refresh_button">Refresh</button>
        <button class="btn" id="debugOpenEditor" data-ui-id="widget.debug_console.open_editor_button">Open in Editor</button>
        <button class="btn" id="debugCopy" data-ui-id="widget.debug_console.copy_button">Copy</button>
      </div>
      <pre id="debugOut" data-ui-id="widget.debug_console.output_text" style="flex:1 1 auto; min-height:120px; overflow:auto; background:linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 100%); color:#e6e8ef; border:1px solid rgba(255, 255, 255, 0.08); border-radius:8px; padding:8px; white-space:pre-wrap; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); font-family:var(--font-mono); font-size:12px;">(capturing logs...)</pre>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const header = el.querySelector('#debugHeader');
  const btnMin = el.querySelector('#debugMin');
  const btnClear = el.querySelector('#debugClear');
  const btnClose = el.querySelector('#debugClose');
  const out = el.querySelector('#debugOut');
  const cbLog = el.querySelector('#capLog');
  const cbInfo = el.querySelector('#capInfo');
  const cbWarn = el.querySelector('#capWarn');
  const cbError = el.querySelector('#capError');
  const cbOnErr = el.querySelector('#capOnErr');
  const cbAduc = el.querySelector('#capAduc');
  const cbTrick = el.querySelector('#capTrick');
  const filterSel = el.querySelector('#debugFilter');
  const btnRefresh = el.querySelector('#debugRefresh');
  const btnOpenEditor = el.querySelector('#debugOpenEditor');
  const btnCopy = el.querySelector('#debugCopy');

  // Dragging
  header.addEventListener('pointerdown', (ev) => {
    const startX = ev.clientX;
    const startY = ev.clientY;
    const rect = el.getBoundingClientRect();
    const offX = startX - rect.left;
    const offY = startY - rect.top;
    function onMove(e) {
      el.style.left = Math.max(6, e.clientX - offX) + 'px';
      el.style.top = Math.max(6, e.clientY - offY) + 'px';
      el.style.right = 'auto';
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
  btnMin.addEventListener('click', () => el.classList.toggle('minimized'));
  btnClose.addEventListener('click', () => el.style.display = 'none');

  const entries = [];
  const MAX_ENTRIES = 3000;

  function ts() {
    const d = new Date();
    return d.toISOString().split('T')[1].replace('Z', '');
  }

  function formatArgs(args) {
    return Array.from(args).map((a) => {
      if (a instanceof Error) return a.stack || a.message || String(a);
      if (typeof a === 'object') {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    }).join(' ');
  }

  function detectTags(kind, msg) {
    const s = String(msg || '');
    const lc = s.toLowerCase();
    const tags = new Set();
    const k = String(kind || 'log').toLowerCase();
    tags.add(k);
    if (k === 'server') tags.add('server');
    if (
      /\baduc\b/i.test(s) ||
      /\bnia\b/i.test(s) ||
      lc.includes('/api/aduc') ||
      lc.includes('aduc reply') ||
      lc.includes('chronos mode')
    ) {
      tags.add('aduc_nia');
    }
    if (
      /\btrick\b/i.test(s) ||
      lc.includes('<trick:') ||
      lc.includes('/api/trick') ||
      lc.includes('widget.timer')
    ) {
      tags.add('trick');
    }
    return tags;
  }

  function captureEnabled(kind) {
    const k = String(kind || '').toLowerCase();
    if (k === 'log') return !!cbLog.checked;
    if (k === 'info') return !!cbInfo.checked;
    if (k === 'warn') return !!cbWarn.checked;
    if (k === 'error') return !!cbError.checked;
    if (k === 'onerror' || k === 'unhandledrejection') return !!cbOnErr.checked;
    if (k === 'server') return !!cbLog.checked;
    return true;
  }

  function sourceEnabled(tags) {
    if (tags.has('aduc_nia') && !cbAduc.checked) return false;
    if (tags.has('trick') && !cbTrick.checked) return false;
    return true;
  }

  function includeByFilter(entry) {
    const mode = String(filterSel?.value || 'all').toLowerCase();
    if (mode === 'all') return true;
    if (mode === 'aduc_nia') return entry.tags.has('aduc_nia');
    if (mode === 'trick') return entry.tags.has('trick');
    if (mode === 'server') return entry.tags.has('server');
    return entry.tags.has(mode);
  }

  function renderOutput() {
    const lines = [];
    for (const entry of entries) {
      if (!includeByFilter(entry)) continue;
      lines.push(`[${entry.ts}] ${entry.kind.toUpperCase()} ${entry.msg}`);
    }
    out.textContent = lines.join('\n') + (lines.length ? '\n' : '');
    out.scrollTop = out.scrollHeight;
  }

  function append(kind, args) {
    if (!captureEnabled(kind)) return;
    const msg = formatArgs(args);
    const tags = detectTags(kind, msg);
    if (!sourceEnabled(tags)) return;
    const entry = {
      ts: ts(),
      kind: String(kind || 'log').toLowerCase(),
      msg,
      tags,
    };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    if (includeByFilter(entry)) {
      out.textContent += `[${entry.ts}] ${entry.kind.toUpperCase()} ${entry.msg}\n`;
      out.scrollTop = out.scrollHeight;
    }
  }

  const rerender = () => { renderOutput(); };
  [cbLog, cbInfo, cbWarn, cbError, cbOnErr, cbAduc, cbTrick, filterSel].forEach((node) => {
    try { node?.addEventListener('change', rerender); } catch { }
  });

  btnClear.addEventListener('click', () => {
    entries.length = 0;
    out.textContent = '';
  });
  btnCopy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(out.textContent || ''); } catch { }
  });
  btnOpenEditor?.addEventListener('click', async () => {
  const relPath = 'temp/debug_console_capture.txt';
    const content = String(out.textContent || '').trim() || '(empty debug output)';
    try {
      await fetch('/api/editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: relPath, content }),
      });
      try {
        if (typeof window.ChronosOpenEditorFile === 'function') {
          await window.ChronosOpenEditorFile(relPath, 1);
          return;
        }
      } catch { }
      await fetch('/api/editor/open-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: relPath, line: 1 }),
      });
    } catch { }
  });

  const orig = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  function wrap(kind) {
    return function (...args) {
      try { append(kind, args); } catch { }
      try { return orig[kind](...args); } catch { }
    };
  }
  console.log = wrap('log');
  console.info = wrap('info');
  console.warn = wrap('warn');
  console.error = wrap('error');

  function onWinErr(message, source, lineno, colno, error) {
    append('onerror', [message, `at ${source}:${lineno}:${colno}`, error || '']);
    return false;
  }
  function onRejection(ev) {
    try {
      const reason = ev && (ev.reason || ev);
      append('unhandledrejection', [reason]);
    } catch { }
  }
  window.addEventListener('error', onWinErr);
  window.addEventListener('unhandledrejection', onRejection);

  // Poll backend logs
  let pollTimer = null;
  const SEEN_LOGS = new Set();
  let visibleObserver = null;

  function isVisible() {
    if (!el.isConnected) return false;
    const st = window.getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
  }

  async function pollLogs() {
    if (!el.parentNode) return;
    try {
      const resp = await fetch('/api/logs?limit=20');
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.ok && Array.isArray(data.logs)) {
        for (const line of data.logs) {
          if (SEEN_LOGS.has(line)) continue;
          SEEN_LOGS.add(line);
          if (SEEN_LOGS.size > 200) {
            const it = SEEN_LOGS.values();
            SEEN_LOGS.delete(it.next().value);
          }
          append('server', [String(line || '')]);
        }
      }
    } catch { }
  }

  pollTimer = setInterval(pollLogs, 2500);
  pollLogs();
  btnRefresh?.addEventListener('click', () => { void pollLogs(); });

  // Refresh every time widget is shown/opened again.
  try {
    let prevVisible = isVisible();
    visibleObserver = new MutationObserver(() => {
      const nowVisible = isVisible();
      if (nowVisible && !prevVisible) {
        void pollLogs();
      }
      prevVisible = nowVisible;
    });
    visibleObserver.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
  } catch { }

  // Basic resize handles
  (function enableResize() {
    const east = el.querySelector('.resizer.e');
    const south = el.querySelector('.resizer.s');
    const se = el.querySelector('.resizer.se');
    function maxHeightPx() {
      return Math.max(220, window.innerHeight - 16);
    }
    function drag(dir) {
      return (ev) => {
        ev.preventDefault();
        const startX = ev.clientX;
        const startY = ev.clientY;
        const rect = el.getBoundingClientRect();
        function onMove(e) {
          if (dir.includes('e')) {
            el.style.width = Math.max(280, rect.width + (e.clientX - startX)) + 'px';
          }
          if (dir.includes('s')) {
            const nextH = Math.max(160, rect.height + (e.clientY - startY));
            el.style.height = Math.min(nextH, maxHeightPx()) + 'px';
          }
        }
        function onUp() {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      };
    }
    if (east) east.addEventListener('pointerdown', drag('e'));
    if (south) south.addEventListener('pointerdown', drag('s'));
    if (se) se.addEventListener('pointerdown', drag('es'));
  })();

  return {
    unmount() {
      if (pollTimer) clearInterval(pollTimer);
      try { visibleObserver?.disconnect(); } catch { }
      try {
        console.log = orig.log;
        console.info = orig.info;
        console.warn = orig.warn;
        console.error = orig.error;
      } catch { }
      try {
        window.removeEventListener('error', onWinErr);
        window.removeEventListener('unhandledrejection', onRejection);
      } catch { }
    }
  };
}
