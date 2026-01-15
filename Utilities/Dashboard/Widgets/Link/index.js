const STORAGE_KEY = 'chronos_link_widget_v1';
const DEFAULT_POLL_MS = 3000;

function normalizePeerUrl(raw) {
  let value = (raw || '').trim();
  if (!value) return '';
  try {
    const u = new URL(value);
    return u.origin;
  } catch {}
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
  el.innerHTML = `
    <style>
      .link-widget { display: flex; flex-direction: column; gap: 10px; }
      .link-row { display: flex; gap: 8px; align-items: center; }
      .link-row label { width: 70px; font-size: 12px; opacity: 0.8; }
      .link-row input, .link-row select { flex: 1; }
      .link-actions { display: flex; gap: 8px; }
      .link-status { font-size: 12px; opacity: 0.9; }
      .link-status span { padding: 2px 6px; border-radius: 10px; background: rgba(255,255,255,0.08); }
    </style>
    <div class="widget-header">
      <h3>Link</h3>
    </div>
    <div class="widget-body link-widget">
      <div class="link-row">
        <label>Peer</label>
        <input class="input" data-peer placeholder="host:port or invite URL" />
      </div>
      <div class="link-row">
        <label>Token</label>
        <input class="input" data-token placeholder="Bearer token" />
      </div>
      <div class="link-row">
        <label>Board</label>
        <select class="input" data-board></select>
      </div>
      <div class="link-actions">
        <button class="btn btn-primary" data-connect>Connect</button>
        <button class="btn" data-sync>Sync Now</button>
        <button class="btn ghost" data-disconnect disabled>Disconnect</button>
      </div>
      <div class="link-status">Status: <span data-status>offline</span></div>
    </div>
  `;

  const peerInput = el.querySelector('[data-peer]');
  const tokenInput = el.querySelector('[data-token]');
  const boardSelect = el.querySelector('[data-board]');
  const connectBtn = el.querySelector('[data-connect]');
  const syncBtn = el.querySelector('[data-sync]');
  const disconnectBtn = el.querySelector('[data-disconnect]');
  const statusEl = el.querySelector('[data-status]');

  let pollTimer = null;
  let isConnected = false;

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setConnected(on) {
    isConnected = on;
    if (disconnectBtn) disconnectBtn.disabled = !on;
    if (connectBtn) connectBtn.disabled = on;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.peer) peerInput.value = state.peer;
      if (state.token) tokenInput.value = state.token;
      if (state.board) boardSelect.value = state.board;
    } catch {}
  }

  function saveState() {
    try {
      const state = {
        peer: peerInput.value.trim(),
        token: tokenInput.value.trim(),
        board: boardSelect.value,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
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

  function disconnect() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    setConnected(false);
    setStatus('offline');
  }

  connectBtn.addEventListener('click', connect);
  syncBtn.addEventListener('click', syncOnce);
  disconnectBtn.addEventListener('click', disconnect);

  boardSelect.addEventListener('change', saveState);
  peerInput.addEventListener('change', saveState);
  tokenInput.addEventListener('change', saveState);

  loadBoards().then(loadState);
  return { unmount: disconnect };
}
