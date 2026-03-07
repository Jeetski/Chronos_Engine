const STORAGE_KEY = 'chronos_link_widget_v1';
const DEFAULT_POLL_MS = 3000;

function normalizePeerUrl(raw) {
  let value = (raw || '').trim();
  if (!value) return '';
  try {
    const u = new URL(value);
    return u.origin;
  } catch { }
  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    value = `http://${value}`;
  }
  return value.replace(/\/+$/, '');
}

function parseInvite(raw) {
  try {
    const url = new URL(raw);
    const board = url.searchParams.get('board') || '';
    const token = url.searchParams.get('token') || '';
    return { origin: url.origin, board, token };
  } catch {
    return null;
  }
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

export function mount(el) {
  // Load CSS
  if (!document.getElementById('link-css')) {
    const link = document.createElement('link');
    link.id = 'link-css';
    link.rel = 'stylesheet';
    link.href = './Widgets/Link/link.css';
    document.head.appendChild(link);
  }

  el.className = 'widget link-widget';

  el.innerHTML = `
    <style>
      .link-widget { display: flex; flex-direction: column; gap: 10px; }
      .link-widget .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .link-label { width: 70px; font-size: 12px; opacity: 0.8; }
      .link-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .link-status { font-size: 12px; opacity: 0.9; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .link-pill { padding: 2px 6px; border-radius: 10px; background: rgba(255,255,255,0.08); }
      .link-meta { font-size: 12px; opacity: 0.75; }
    </style>
    <div class="header" id="linkHeader">
      <div class="title">Link</div>
      <div class="controls">
        <button class="icon-btn" id="linkMin" title="Minimize">_</button>
        <button class="icon-btn" id="linkClose" title="Close">x</button>
      </div>
    </div>
    <div class="content">
      <div class="link-widget">
        <div class="row">
          <label class="link-label">Peer</label>
          <input class="input" data-peer placeholder="host:port or invite URL" />
        </div>
        <div class="row">
          <label class="link-label">Token</label>
          <input class="input" data-token placeholder="Bearer token" />
        </div>
        <div class="row">
          <label class="link-label">Board</label>
          <select class="input" data-board></select>
        </div>
        <div class="link-actions">
          <button class="btn btn-primary" data-connect>Connect</button>
          <button class="btn" data-sync>Sync Now</button>
          <button class="btn" data-invite>Invite</button>
          <button class="btn ghost" data-disconnect disabled>Disconnect</button>
        </div>
        <div class="link-status">
          <span class="hint">Status</span>
          <span class="link-pill" data-status>offline</span>
          <span class="hint">Peer</span>
          <span class="link-pill" data-peer-status>unknown</span>
        </div>
        <div class="link-meta" data-last-sync>Last sync: never</div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;

  const peerInput = el.querySelector('[data-peer]');
  const tokenInput = el.querySelector('[data-token]');
  const boardSelect = el.querySelector('[data-board]');
  const connectBtn = el.querySelector('[data-connect]');
  const syncBtn = el.querySelector('[data-sync]');
  const inviteBtn = el.querySelector('[data-invite]');
  const disconnectBtn = el.querySelector('[data-disconnect]');
  const statusEl = el.querySelector('[data-status]');
  const peerStatusEl = el.querySelector('[data-peer-status]');
  const lastSyncEl = el.querySelector('[data-last-sync]');
  const header = el.querySelector('#linkHeader');
  const btnMin = el.querySelector('#linkMin');
  const btnClose = el.querySelector('#linkClose');

  let pollTimer = null;
  let isConnected = false;

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setPeerStatus(text) {
    if (peerStatusEl) peerStatusEl.textContent = text;
  }

  function setLastSync(ts) {
    if (!lastSyncEl) return;
    const label = ts ? new Date(ts).toLocaleTimeString() : 'never';
    lastSyncEl.textContent = `Last sync: ${label}`;
  }

  function setConnected(on) {
    isConnected = on;
    if (disconnectBtn) disconnectBtn.disabled = !on;
    if (connectBtn) connectBtn.disabled = on;
    if (!on) {
      setPeerStatus('offline');
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.peer) peerInput.value = state.peer;
      if (state.token) tokenInput.value = state.token;
      if (state.board) boardSelect.value = state.board;
    } catch { }
  }

  function saveState() {
    try {
      const state = {
        peer: peerInput.value.trim(),
        token: tokenInput.value.trim(),
        board: boardSelect.value,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { }
  }

  async function loadBoards() {
    try {
      const data = await fetchJson('/api/items?type=canvas_board', {});
      const items = Array.isArray(data.items) ? data.items : [];
      boardSelect.innerHTML = '';
      items.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = item.name;
        opt.textContent = item.name;
        boardSelect.appendChild(opt);
      });
    } catch (err) {
      console.error('[Link] Failed to load boards', err);
    }
  }

  async function readLocalBoard(name) {
    const data = await fetchJson(`/api/item?type=canvas_board&name=${encodeURIComponent(name)}`, {});
    return data.item || {};
  }

  async function writeLocalBoard(name, content) {
    await fetchJson('/api/item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'canvas_board', name, content }),
    });
  }

  async function readRemoteBoard(peerBase, token, name) {
    const data = await fetchJson(`${peerBase}/api/link/board?name=${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.content || {};
  }

  async function writeRemoteBoard(peerBase, token, name, content) {
    await fetchJson(`${peerBase}/api/link/board`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, content }),
    });
  }

  async function readPeerStatus(peerBase) {
    try {
      const data = await fetchJson(`${peerBase}/api/link/status`, {});
      if (data && data.link_id) {
        setPeerStatus(data.link_id);
      } else {
        setPeerStatus('online');
      }
    } catch {
      setPeerStatus('offline');
    }
  }

  async function syncOnce() {
    const peerRaw = peerInput.value.trim();
    const token = tokenInput.value.trim();
    const board = boardSelect.value;
    if (!peerRaw || !token || !board) return;
    const peerBase = normalizePeerUrl(peerRaw);
    try {
      const local = await readLocalBoard(board);
      const remote = await readRemoteBoard(peerBase, token, board);
      const localRev = Number(local.link_rev || 0);
      const remoteRev = Number(remote.link_rev || 0);
      if (remoteRev > localRev) {
        await writeLocalBoard(board, remote);
        setStatus('pulled');
      } else if (localRev > remoteRev) {
        await writeRemoteBoard(peerBase, token, board, local);
        setStatus('pushed');
      } else {
        setStatus('synced');
      }
      setLastSync(Date.now());
      readPeerStatus(peerBase);
    } catch (err) {
      console.error('[Link] Sync failed', err);
      setStatus('offline');
      setConnected(false);
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }
  }

  async function connect() {
    const raw = peerInput.value.trim();
    const parsed = parseInvite(raw);
    if (parsed) {
      peerInput.value = parsed.origin;
      if (parsed.token) tokenInput.value = parsed.token;
      if (parsed.board) boardSelect.value = parsed.board;
    }
    saveState();
    setConnected(true);
    setStatus('connecting');
    await syncOnce();
    pollTimer = setInterval(syncOnce, DEFAULT_POLL_MS);
  }

  async function invite() {
    const board = boardSelect.value;
    if (!board) return;
    try {
      const data = await fetchJson(`/api/link/invite?board=${encodeURIComponent(board)}`, {});
      if (data && data.url) {
        const message = `Share this Link invite URL:\n${data.url}\n\nToken: ${data.token || ''}`;
        window.prompt('Link Invite', message);
      }
    } catch (err) {
      console.error('[Link] Invite failed', err);
    }
  }

  function disconnect() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    setConnected(false);
    setStatus('offline');
    setLastSync(null);
  }

  connectBtn.addEventListener('click', connect);
  syncBtn.addEventListener('click', syncOnce);
  inviteBtn.addEventListener('click', invite);
  disconnectBtn.addEventListener('click', disconnect);

  boardSelect.addEventListener('change', saveState);
  peerInput.addEventListener('change', saveState);
  tokenInput.addEventListener('change', saveState);

  loadBoards().then(loadState);
  if (header && btnMin && btnClose) {
    header.addEventListener('pointerdown', (ev) => {
      const r = el.getBoundingClientRect();
      const offX = ev.clientX - r.left;
      const offY = ev.clientY - r.top;
      function move(e) {
        el.style.left = Math.max(6, e.clientX - offX) + 'px';
        el.style.top = Math.max(6, e.clientY - offY) + 'px';
        el.style.right = 'auto';
      }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    btnMin.addEventListener('click', () => el.classList.toggle('minimized'));
    btnClose.addEventListener('click', () => { el.style.display = 'none'; });
  }

  function edgeDrag(startRect, cb) {
    return (ev) => {
      ev.preventDefault();
      function move(e) { cb(e, startRect); }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
  }
  const re = el.querySelector('.resizer.e');
  const rs = el.querySelector('.resizer.s');
  const rse = el.querySelector('.resizer.se');
  if (re) re.addEventListener('pointerdown', (ev) => {
    const r = el.getBoundingClientRect();
    edgeDrag(r, (e, sr) => { el.style.width = Math.max(260, e.clientX - sr.left) + 'px'; })(ev);
  });
  if (rs) rs.addEventListener('pointerdown', (ev) => {
    const r = el.getBoundingClientRect();
    edgeDrag(r, (e, sr) => { el.style.height = Math.max(160, e.clientY - sr.top) + 'px'; })(ev);
  });
  if (rse) rse.addEventListener('pointerdown', (ev) => {
    const r = el.getBoundingClientRect();
    edgeDrag(r, (e, sr) => {
      el.style.width = Math.max(260, e.clientX - sr.left) + 'px';
      el.style.height = Math.max(160, e.clientY - sr.top) + 'px';
    })(ev);
  });

  return { unmount: disconnect };
}
