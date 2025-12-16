const PANEL_BASE_ID = 'checklist';
const PANEL_STATE_PREFIX = 'chronos_checklist_panel_state_';
const INSTANCE_STORAGE_KEY = 'chronos_checklist_panel_instances_v1';
const FILE_BACKING = 'checklists.yml';
const STYLE_ID = 'cockpit-checklist-style';
const ITEM_TYPES = [
  'task', 'project', 'routine', 'subroutine', 'microroutine',
  'habit', 'goal', 'milestone', 'commitment', 'reward', 'achievement',
  'reminder', 'alarm', 'appointment', 'plan', 'day', 'week',
  'list', 'journal_entry', 'note', 'review', 'inventory', 'inventory_item', 'tool',
  'day_template', 'week_template', 'routine_template', 'subroutine_template', 'microroutine_template', 'goal_template', 'project_template',
  'custom'
];

let managerRef = null;
let cachedInstances = null;
let syncingFile = false;

console.log('[Chronos][Panels][Checklist] module evaluating');

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .chk-shell { display:flex; flex-direction:column; height:100%; color:var(--chronos-text); gap:12px; }
    .chk-header { display:flex; justify-content:space-between; align-items:center; gap:10px; }
    .chk-title { font-size:16px; font-weight:600; }
    .chk-actions { display:flex; gap:8px; align-items:center; }
    .chk-btn { border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--chronos-text); border-radius:8px; padding:6px 10px; cursor:pointer; }
    .chk-btn.primary { background:var(--chronos-accent-gradient); color:#0b0f1d; border-color:rgba(122,162,247,0.4); }
    .chk-list { flex:1; overflow:auto; display:flex; flex-direction:column; gap:8px; }
    .chk-row { display:flex; align-items:flex-start; gap:8px; padding:10px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.03); }
    .chk-row.done { opacity:0.6; }
    .chk-row .chk-text { flex:1; }
    .chk-row .chk-meta { display:flex; gap:8px; align-items:center; font-size:12px; color:var(--chronos-text-muted); }
    .chk-row .chk-name { font-weight:600; }
    .chk-row small { color:var(--chronos-text-muted); }
    .chk-inputs { display:grid; grid-template-columns: 1.2fr 1fr auto; gap:8px; align-items:center; }
    .chk-input, .chk-select { width:100%; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:#0f141d; color:var(--chronos-text); padding:8px 10px; }
    .chk-checkbox { width:18px; height:18px; }
    .chk-status { min-height:16px; font-size:12px; color:var(--chronos-text-muted); }
    .chk-status[data-tone="error"] { color:var(--chronos-danger); }
    .chk-status[data-tone="success"] { color:var(--chronos-success); }
  `;
  document.head.appendChild(style);
}

function apiBase() {
  const o = window.location?.origin;
  if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
  return o;
}

async function readFileBacking() {
  try {
    const resp = await fetch(`${apiBase()}/api/settings?file=${encodeURIComponent(FILE_BACKING)}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json().catch(() => ({}));
    if (!data?.data?.lists) throw new Error('missing lists');
    return data.data;
  } catch (err) {
    console.warn('[Checklist] no remote file yet', err?.message || err);
    return { lists: [] };
  }
}

async function writeFileBacking(payload) {
  try {
    const yaml = buildYaml(payload);
    const resp = await fetch(`${apiBase()}/api/settings?file=${encodeURIComponent(FILE_BACKING)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: yaml,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return true;
  } catch (err) {
    console.warn('[Checklist] failed to write backing file', err);
    return false;
  }
}

function buildYaml(data, indent = 0) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(data)) {
    if (!data.length) return pad + '[]';
    return data.map(item => `${pad}-\n${buildYaml(item, indent + 1)}`).join('\n');
  }
  if (typeof data === 'object' && data !== null) {
    return Object.entries(data).map(([k, v]) => {
      if (v === undefined || v === null) return '';
      if (Array.isArray(v) && !v.length) return '';
      if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) return '';
      if (Array.isArray(v) || typeof v === 'object') {
        return `${pad}${k}:\n${buildYaml(v, indent + 1)}`;
      }
      return `${pad}${k}: ${formatPrimitive(v)}`;
    }).filter(Boolean).join('\n');
  }
  return pad + formatPrimitive(data);
}

function formatPrimitive(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v ?? '');
  if (!s.length) return "''";
  if (/^[A-Za-z0-9._-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadInstances() {
  if (cachedInstances) return cachedInstances;
  try {
    const raw = localStorage.getItem(INSTANCE_STORAGE_KEY);
    if (!raw) throw new Error('no instances');
    cachedInstances = JSON.parse(raw);
  } catch {
    cachedInstances = [{ id: PANEL_BASE_ID, label: 'Checklist' }];
  }
  return cachedInstances;
}

function persistInstances() {
  try { localStorage.setItem(INSTANCE_STORAGE_KEY, JSON.stringify(loadInstances())); } catch {}
}

function ensureInstance(instance) {
  const instances = loadInstances();
  if (!instances.find(i => i.id === instance.id)) {
    instances.push(instance);
    persistInstances();
  }
}

function createDefinition(instance) {
  ensureInstance(instance);
  return {
    id: instance.id,
    label: instance.label || 'Checklist',
    menuKey: PANEL_BASE_ID,
    menuLabel: 'Checklist',
    defaultVisible: false,
    size: { width: 380, height: 460 },
    mount: (root) => mountPanel(root, instance.id, instance.label || 'Checklist'),
  };
}

function mergeFileStateIntoLocal(fileData) {
  if (!fileData?.lists) return;
  fileData.lists.forEach(list => {
    if (!list?.id) return;
    const existing = loadState(list.id);
    existing.items = Array.isArray(list.items) ? list.items : existing.items;
    existing.completed = list.completed || existing.completed || {};
    const cd = {};
    if (list.completed_daily) {
      Object.entries(list.completed_daily).forEach(([k, arr]) => {
        cd[k] = new Set(Array.isArray(arr) ? arr : []);
      });
    }
    existing.completedDaily = cd;
    persistStateLocal(list.id, existing);
  });
}

function loadState(panelId) {
  try {
    const raw = localStorage.getItem(PANEL_STATE_PREFIX + panelId);
    if (!raw) throw new Error('no state');
    const parsed = JSON.parse(raw);
    parsed.completedDaily = parsed.completedDaily || {};
    parsed.items = Array.isArray(parsed.items) ? parsed.items : [];
    return parsed;
  } catch {
    return {
      items: [],
      completed: {},
      completedDaily: {},
    };
  }
}

function persistStateLocal(panelId, state) {
  try { localStorage.setItem(PANEL_STATE_PREFIX + panelId, JSON.stringify(state)); } catch {}
}

function persistState(panelId, state) {
  persistStateLocal(panelId, state);
  syncFileState();
}

function clearStaleDaily(state) {
  const key = todayKey();
  const keep = {};
  if (state.completedDaily && state.completedDaily[key]) {
    keep[key] = state.completedDaily[key];
  }
  state.completedDaily = keep;
}

async function syncFileState() {
  if (syncingFile) return;
  syncingFile = true;
  try {
    const instances = loadInstances();
    const lists = instances.map(inst => {
      const st = loadState(inst.id);
      return {
        id: inst.id,
        label: inst.label || 'Checklist',
        items: (st.items || []).map(row => ({
          id: row.id,
          text: row.text,
          type: row.type,
          name: row.name,
          daily: !!row.daily,
        })),
        completed: st.completed || {},
        completed_daily: Object.fromEntries(Object.entries(st.completedDaily || {}).map(([k, v]) => [k, Array.from(v?.values ? v.values() : v)])),
      };
    });
    await writeFileBacking({ lists });
  } catch (err) {
    console.warn('[Checklist] sync file failed', err);
  } finally {
    syncingFile = false;
  }
}

async function runCompletion(row) {
  if (!row.type || !row.name) return { ok: true };
  const type = row.type;
  const name = row.name;
  // Treat templates as no-op
  if (type.includes('template')) return { ok: true };
  // Type-specific actions
  if (type === 'habit') {
    const today = todayKey();
    const props = { completion_dates: [today] };
    try {
      const resp = await fetch(`${apiBase()}/api/cli`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'append', args: [type, name, ''], properties: props }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) throw new Error(data.error || data.stderr || `HTTP ${resp.status}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || 'Failed to mark habit' };
    }
  }
  if (type === 'reminder' || type === 'alarm') {
    try {
      const resp = await fetch(`${apiBase()}/api/cli`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'dismiss', args: [name], properties: {} }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) throw new Error(data.error || data.stderr || `HTTP ${resp.status}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || 'Failed to dismiss' };
    }
  }
  const cmd = ['set', type, name];
  const properties = { status: 'completed' };
  try {
    const resp = await fetch(`${apiBase()}/api/cli`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd[0], args: cmd.slice(1), properties }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false) throw new Error(data.error || data.stderr || `HTTP ${resp.status}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'Failed to mark complete' };
  }
}

function mountPanel(root, panelId, panelLabel) {
  injectStyles();
  const state = loadState(panelId);
  clearStaleDaily(state);
  let statusEl = null;

  const setStatus = (msg, tone = 'muted') => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.dataset.tone = tone;
  };

  const save = () => persistState(panelId, state);

  const addRow = () => {
    const row = { id: cryptoRandom(), text: '', type: 'task', name: '', daily: false };
    state.items.push(row);
    save();
    render();
  };

  const removeRow = (id) => {
    state.items = state.items.filter(r => r.id !== id);
    delete state.completed[id];
    Object.values(state.completedDaily || {}).forEach(set => set.delete?.(id));
    save();
    render();
  };

  const toggleRow = async (row, checked) => {
    if (!checked) {
      if (row.daily) {
        const key = todayKey();
        if (!state.completedDaily[key]) state.completedDaily[key] = new Set();
        state.completedDaily[key].delete(row.id);
      } else {
        delete state.completed[row.id];
      }
      save();
      render();
      return;
    }
    setStatus('Completing...', 'muted');
    const result = await runCompletion(row);
    if (row.daily) {
      const key = todayKey();
      if (!state.completedDaily[key]) state.completedDaily[key] = new Set();
      state.completedDaily[key].add(row.id);
    } else {
      state.completed[row.id] = true;
    }
    save();
    render();
    if (!result.ok) {
      setStatus(result.error || 'Failed to complete', 'error');
    } else {
      setStatus('Completed', 'success');
    }
  };

  const isChecked = (row) => {
    if (row.daily) {
      const key = todayKey();
      return Boolean(state.completedDaily[key]?.has?.(row.id));
    }
    return Boolean(state.completed[row.id]);
  };

  const render = () => {
    const rows = state.items.map(row => {
      const checked = isChecked(row);
      return `
        <div class="chk-row ${checked ? 'done' : ''}" data-row="${row.id}">
          <input type="checkbox" class="chk-checkbox" ${checked ? 'checked' : ''} />
          <div class="chk-text">
            <div class="chk-name">${escapeHtml(row.text || row.name || '(untitled)')}</div>
            <div class="chk-meta">
              ${row.type ? `<span>${escapeHtml(row.type)}</span>` : ''}
              ${row.name ? `<span>${escapeHtml(row.name)}</span>` : ''}
              ${row.daily ? '<span>daily</span>' : ''}
            </div>
          </div>
          <button class="chk-btn" data-remove="${row.id}">Remove</button>
        </div>
      `;
    }).join('');

    root.innerHTML = `
      <div class="chk-shell">
        <div class="chk-header">
          <div>
            <div class="chk-title">${escapeHtml(panelLabel || 'Checklist')}</div>
            <div class="chk-status" data-status></div>
          </div>
          <div class="chk-actions">
            <button class="chk-btn" data-new>New Row</button>
            <button class="chk-btn" data-new-panel>New Panel</button>
          </div>
        </div>
        <div class="chk-inputs">
          <input class="chk-input" data-text placeholder="Label or notes" />
          <select class="chk-select" data-type>
            ${ITEM_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
          <div style="display:flex; gap:6px; align-items:center;">
            <input class="chk-input" data-name placeholder="Item/template name (optional)" list="chk-suggestions-${panelId}" />
            <datalist id="chk-suggestions-${panelId}"></datalist>
          </div>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <label style="display:flex; gap:6px; align-items:center; font-size:12px; color:var(--chronos-text-muted);">
            <input type="checkbox" data-daily />
            Daily reset
          </label>
          <button class="chk-btn primary" data-add>Attach</button>
        </div>
        <div class="chk-list">
          ${rows || '<div class="chk-status">No checklist items yet.</div>'}
        </div>
      </div>
    `;

    statusEl = root.querySelector('[data-status]');
    setStatus('');

    const textInput = root.querySelector('[data-text]');
    const typeSelect = root.querySelector('[data-type]');
    const nameInput = root.querySelector('[data-name]');
    const dailyToggle = root.querySelector('[data-daily]');
    const datalist = root.querySelector(`#chk-suggestions-${panelId}`);

    root.querySelector('[data-add]')?.addEventListener('click', () => {
      const text = (textInput.value || '').trim();
      const type = typeSelect.value || 'task';
      const name = (nameInput.value || '').trim();
      const daily = dailyToggle.checked;
      state.items.push({
        id: cryptoRandom(),
        text,
        type,
        name,
        daily,
      });
      textInput.value = '';
      nameInput.value = '';
      dailyToggle.checked = false;
      save();
      render();
    });

    let suggestTimer = null;
    const loadSuggestions = async (type, q='') => {
      if (!datalist) return;
      try {
        const params = new URLSearchParams({ type });
        if (q) params.set('q', q);
        const resp = await fetch(`${apiBase()}/api/items?${params.toString()}`);
        const data = await resp.json().catch(() => ({}));
        const items = Array.isArray(data?.items) ? data.items : [];
        datalist.innerHTML = items.slice(0, 50).map(i => `<option value="${escapeAttr(i.name || '')}">${escapeAttr(i.name || '')}</option>`).join('');
      } catch (err) {
        console.warn('[Checklist] suggestions failed', err);
      }
    };

    typeSelect?.addEventListener('change', () => {
      if (suggestTimer) clearTimeout(suggestTimer);
      suggestTimer = setTimeout(() => loadSuggestions(typeSelect.value || 'task', nameInput.value || ''), 150);
    });
    nameInput?.addEventListener('input', () => {
      if (suggestTimer) clearTimeout(suggestTimer);
      suggestTimer = setTimeout(() => loadSuggestions(typeSelect.value || 'task', nameInput.value || ''), 200);
    });

    root.querySelector('[data-new]')?.addEventListener('click', addRow);
    root.querySelector('[data-new-panel]')?.addEventListener('click', () => {
      try { window.ChecklistPanelService?.create?.(); } catch (err) { console.error(err); }
    });

    root.querySelectorAll('.chk-row').forEach(rowEl => {
      const rowId = rowEl.dataset.row;
      const row = state.items.find(r => r.id === rowId);
      if (!row) return;
      rowEl.querySelector('.chk-checkbox')?.addEventListener('change', (ev) => toggleRow(row, ev.target.checked));
      rowEl.querySelector('[data-remove]')?.addEventListener('click', () => removeRow(rowId));
    });
  };

  render();

  return {
    dispose() {},
  };
}

function cryptoRandom() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function registerPanels(manager) {
  managerRef = manager;
  const instances = loadInstances();
  // Attempt to merge file-backed lists into local before registering
  readFileBacking().then(fileData => {
    mergeFileStateIntoLocal(fileData);
    instances.forEach(instance => manager.registerPanel(createDefinition(instance)));
  }).catch(() => {
    instances.forEach(instance => manager.registerPanel(createDefinition(instance)));
  });
}

window.ChecklistPanelService = {
  create(label = 'Checklist') {
    const instance = {
      id: `${PANEL_BASE_ID}_${cryptoRandom().slice(0, 6)}`,
      label,
    };
    ensureInstance(instance);
    persistInstances();
    if (managerRef && typeof managerRef.registerPanel === 'function') {
      managerRef.registerPanel(createDefinition(instance));
    }
  },
  remove(id) {
    const instances = loadInstances().filter(i => i.id !== id);
    if (!instances.length) return { ok: false, reason: 'locked' };
    cachedInstances = instances;
    persistInstances();
    return { ok: true };
  },
};

export function register(manager) {
  injectStyles();
  registerPanels(manager);
}

const autoAttach = (manager) => {
  try {
    if (manager && typeof manager.registerPanel === 'function') {
      register(manager);
    }
  } catch (err) {
    console.error('[Chronos][Panels][Checklist] autoAttach failed', err);
  }
};

if (typeof window !== 'undefined') {
  const defs = window.__cockpitPanelDefinitions || [];
  defs.push(autoAttach);
  window.__cockpitPanelDefinitions = defs;
  if (typeof window.__cockpitPanelRegister === 'function') {
    try { window.__cockpitPanelRegister(autoAttach); } catch {}
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return ch;
    }
  });
}
