const STYLE_ID = 'chronos-aduc-view-style';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .aduc-shell { display:flex; flex-direction:column; gap:10px; height:100%; color:var(--chronos-text); }
    .aduc-toolbar { display:flex; gap:8px; align-items:center; }
    .aduc-btn { border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.05); color:var(--chronos-text); border-radius:8px; padding:6px 10px; cursor:pointer; }
    .aduc-status { font-size:12px; color:var(--chronos-text-muted); }
    .aduc-frame { flex:1; width:100%; border:1px solid #222835; border-radius:12px; background:#0b0f16; }
  `;
  document.head.appendChild(style);
}

function apiBase() {
  const o = window.location?.origin;
  if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
  return o;
}

export function mount(el) {
  injectStyles();
  const root = document.createElement('div');
  root.className = 'aduc-shell';
  root.innerHTML = `
    <div class="aduc-toolbar">
      <button class="aduc-btn" data-start>Start ADUC</button>
      <button class="aduc-btn" data-reload>Reload</button>
      <button class="aduc-btn" data-open>Open in Browser</button>
      <button class="aduc-btn" data-log>Show Log</button>
      <button class="aduc-btn" data-copy-log>Copy Log</button>
      <div class="aduc-status" data-status></div>
    </div>
    <textarea class="docs-reader" data-log-view readonly style="display:none; height:160px;"></textarea>
    <iframe class="aduc-frame" data-frame title="ADUC"></iframe>
  `;
  el.appendChild(root);

  const statusEl = root.querySelector('[data-status]');
  const frame = root.querySelector('[data-frame]');
  const btnStart = root.querySelector('[data-start]');
  const btnReload = root.querySelector('[data-reload]');
  const btnOpen = root.querySelector('[data-open]');
  const btnLog = root.querySelector('[data-log]');
  const btnCopyLog = root.querySelector('[data-copy-log]');
  const logView = root.querySelector('[data-log-view]');

  let targetUrl = '';
  let pollTimer = null;
  let lastLog = '';

  const setStatus = (msg) => {
    if (statusEl) statusEl.textContent = msg || '';
  };

  const loadFrame = (url) => {
    if (!frame || !url) return;
    frame.src = url;
  };

  const checkStatus = async () => {
    try {
      const resp = await fetch(`${apiBase()}/api/aduc/status`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
      targetUrl = data.url || '';
      if (data.running) {
        setStatus(`Running at ${targetUrl}`);
        loadFrame(targetUrl);
        return true;
      }
      setStatus('ADUC not running.');
      return false;
    } catch (err) {
      setStatus(err?.message || 'ADUC status error.');
      return false;
    }
  };

  const startAduc = async () => {
    try {
      setStatus('Starting ADUC...');
      const resp = await fetch(`${apiBase()}/api/aduc/start`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
      targetUrl = data.url || '';
      lastLog = data.log_path || '';
      return true;
    } catch (err) {
      setStatus(err?.message || 'Failed to start ADUC.');
      return false;
    }
  };

  const beginPolling = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      const ready = await checkStatus();
      if (ready && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 1000);
  };

  btnStart?.addEventListener('click', async () => {
    await startAduc();
    beginPolling();
  });
  btnReload?.addEventListener('click', async () => {
    if (targetUrl) loadFrame(targetUrl);
    else await checkStatus();
  });
  btnOpen?.addEventListener('click', async () => {
    if (!targetUrl) await checkStatus();
    if (targetUrl) window.open(targetUrl, '_blank', 'noopener');
  });
  btnLog?.addEventListener('click', async () => {
    try {
      const resp = await fetch(`${apiBase()}/api/aduc/log`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
      lastLog = data.path || lastLog;
      if (logView) {
        logView.style.display = '';
        logView.value = data.content || '(log is empty)';
        logView.scrollTop = 0;
      }
    } catch (err) {
      alert(err?.message || 'Failed to load log.');
    }
  });
  btnCopyLog?.addEventListener('click', async () => {
    try {
      const resp = await fetch(`${apiBase()}/api/aduc/log`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
      const content = data.content || '';
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        setStatus('Log copied to clipboard.');
      } else if (logView) {
        logView.style.display = '';
        logView.value = content;
        logView.focus();
        logView.select();
        setStatus('Select the log and copy manually.');
      }
    } catch (err) {
      setStatus(err?.message || 'Failed to copy log.');
    }
  });

  (async () => {
    const ready = await checkStatus();
    if (!ready) {
      await startAduc();
      beginPolling();
    }
  })();

  return {
    dispose() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}
