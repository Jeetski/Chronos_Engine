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

// Global view state for the panel
let globalViewState = {
  currentView: 'overview', // 'overview' | 'detail'
  selectedListId: null,
};

console.log('[Chronos][Panels][Checklist] module evaluating');

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .chk-shell { display:flex; flex-direction:column; height:100%; color:var(--chronos-text); gap:12px; padding: 12px; }
    .chk-header { display:flex; justify-content:space-between; align-items:center; gap:10px; }
    .chk-title { font-size:16px; font-weight:600; }
    .chk-actions { display:flex; gap:8px; align-items:center; }
    .chk-btn { border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--chronos-text); border-radius:8px; padding:6px 10px; cursor:pointer; transition: all 0.15s ease; }
    .chk-btn:hover { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.15); }
    .chk-btn.primary { background:var(--chronos-accent-gradient, linear-gradient(180deg, #3a6aff, #2a50d6)); color:#fff; border-color:rgba(122,162,247,0.4); }
    .chk-btn.primary:hover { filter: brightness(1.1); }
    .chk-btn.danger { background:rgba(255,80,80,0.15); color:#ff6b6b; border-color:rgba(255,80,80,0.3); }
    .chk-btn.danger:hover { background:rgba(255,80,80,0.25); }
    .chk-btn.small { padding: 4px 8px; font-size: 12px; }
    
    /* Overview - Card Grid */
    .chk-overview { flex:1; overflow:auto; display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:12px; align-content: start; }
    .chk-card { padding:14px; border-radius:12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); cursor:pointer; transition: all 0.2s ease; }
    .chk-card:hover { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.15); transform: translateY(-2px); }
    .chk-card-header { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px; }
    .chk-card-title { font-weight:600; font-size:14px; flex:1; word-break:break-word; }
    .chk-card-actions { display:flex; gap:4px; flex-shrink:0; }
    .chk-card-actions .chk-btn { opacity:0.5; }
    .chk-card-actions .chk-btn:hover { opacity:1; }
    .chk-card-delete:hover { background:rgba(255,80,80,0.2); }
    .chk-card-meta { font-size:12px; color:var(--chronos-text-muted); display:flex; gap:8px; align-items:center; margin-bottom:8px; }
    .chk-daily-badge { background:rgba(100,180,255,0.2); color:#7ab8ff; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:500; }
    .chk-progress { height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden; }
    .chk-progress-bar { height:100%; background:linear-gradient(90deg, #3a6aff, #7aa2f7); border-radius:3px; transition:width 0.3s ease; }
    .chk-progress-text { font-size:11px; color:var(--chronos-text-muted); margin-top:4px; }
    
    /* New Checklist Card */
    .chk-card.new { border-style:dashed; display:flex; align-items:center; justify-content:center; min-height:100px; }
    .chk-card.new:hover { border-color:rgba(122,162,247,0.5); }
    .chk-new-icon { font-size:24px; opacity:0.5; }
    
    /* Detail View */
    .chk-detail-header { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
    .chk-back-btn { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:16px; }
    .chk-detail-title { font-size:18px; font-weight:600; flex:1; }
    .chk-detail-title input { background:transparent; border:none; color:var(--chronos-text); font-size:18px; font-weight:600; width:100%; outline:none; }
    .chk-detail-title input:focus { border-bottom:1px solid var(--chronos-accent, #7aa2f7); }
    
    .chk-list { flex:1; overflow:auto; display:flex; flex-direction:column; gap:6px; }
    .chk-row { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border:1px solid rgba(255,255,255,0.06); border-radius:10px; background:rgba(255,255,255,0.02); transition: all 0.15s ease; }
    .chk-row:hover { background:rgba(255,255,255,0.04); }
    .chk-row.done { opacity:0.5; }
    .chk-row.done .chk-item-text { text-decoration: line-through; }
    .chk-row .chk-text { flex:1; }
    .chk-row .chk-meta { display:flex; gap:6px; align-items:center; font-size:11px; color:var(--chronos-text-muted); margin-top:2px; }
    .chk-item-text { font-weight:500; }
    .chk-type-badge { background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:4px; }
    .chk-checkbox { width:18px; height:18px; accent-color: var(--chronos-accent, #7aa2f7); cursor:pointer; }
    
    /* Add Item Row */
    .chk-add-row { display:grid; grid-template-columns: 1fr auto auto; gap:8px; padding:10px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:10px; margin-top:8px; }
    .chk-input, .chk-select { width:100%; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:#0f141d; color:var(--chronos-text); padding:8px 10px; outline:none; }
    .chk-input:focus, .chk-select:focus { border-color:rgba(122,162,247,0.5); }
    
    /* Status */
    .chk-status { min-height:16px; font-size:12px; color:var(--chronos-text-muted); }
    .chk-status[data-tone="error"] { color:#ff6b6b; }
    .chk-status[data-tone="success"] { color:#6bff8b; }
    
    /* Confirmation Modal */
    .chk-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .chk-modal { background:#1a1f2e; border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:20px; max-width:320px; width:90%; }
    .chk-modal-title { font-weight:600; margin-bottom:12px; }
    .chk-modal-text { color:var(--chronos-text-muted); font-size:14px; margin-bottom:16px; }
    .chk-modal-actions { display:flex; gap:8px; justify-content:flex-end; }
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
  try { localStorage.setItem(INSTANCE_STORAGE_KEY, JSON.stringify(loadInstances())); } catch { }
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
    size: { width: 420, height: 520 },
    mount: (root) => mountPanel(root, instance.id, instance.label || 'Checklist'),
  };
}

function mergeFileStateIntoLocal(fileData) {
  if (!fileData?.lists) return;
  fileData.lists.forEach(list => {
    if (!list?.id) return;
    const existing = loadState(list.id);
    existing.label = list.label || existing.label || 'Checklist';
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
      label: 'Checklist',
      items: [],
      completed: {},
      completedDaily: {},
    };
  }
}

function persistStateLocal(panelId, state) {
  try { localStorage.setItem(PANEL_STATE_PREFIX + panelId, JSON.stringify(state)); } catch { }
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
        label: st.label || inst.label || 'Checklist',
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
  if (type.includes('template')) return { ok: true };
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

// Calculate progress for a checklist
function calcProgress(state) {
  const items = state.items || [];
  if (!items.length) return { completed: 0, total: 0, percent: 0 };
  const key = todayKey();
  let completed = 0;
  items.forEach(row => {
    if (row.daily) {
      if (state.completedDaily?.[key]?.has?.(row.id)) completed++;
    } else {
      if (state.completed?.[row.id]) completed++;
    }
  });
  return { completed, total: items.length, percent: Math.round((completed / items.length) * 100) };
}

// Check if checklist has any daily items
function hasDailyItems(state) {
  return (state.items || []).some(row => row.daily);
}

// Show delete confirmation modal as a separate overlay on document.body
function showDeleteConfirmation(label) {
  return new Promise((resolve) => {
    // Remove any existing modal first
    const existing = document.getElementById('chk-delete-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'chk-delete-modal';
    overlay.className = 'chk-modal-overlay';
    overlay.innerHTML = `
      <div class="chk-modal">
        <div class="chk-modal-title">Delete Checklist?</div>
        <div class="chk-modal-text">Are you sure you want to delete "${escapeHtml(label)}"? This cannot be undone.</div>
        <div class="chk-modal-actions">
          <button class="chk-btn" data-cancel>Cancel</button>
          <button class="chk-btn danger" data-confirm>Delete</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector('[data-confirm]')?.addEventListener('click', () => cleanup(true));
    overlay.querySelector('[data-cancel]')?.addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });

    // Focus the cancel button for keyboard accessibility
    overlay.querySelector('[data-cancel]')?.focus();
  });
}

// Show rename prompt modal as a separate overlay on document.body
function showRenamePrompt(currentName) {
  return new Promise((resolve) => {
    // Remove any existing modal first
    const existing = document.getElementById('chk-rename-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'chk-rename-modal';
    overlay.className = 'chk-modal-overlay';
    overlay.innerHTML = `
      <div class="chk-modal">
        <div class="chk-modal-title">Rename Checklist</div>
        <div style="margin-bottom:16px;">
          <input type="text" class="chk-input" data-name-input value="${escapeAttr(currentName)}" placeholder="Checklist name" />
        </div>
        <div class="chk-modal-actions">
          <button class="chk-btn" data-cancel>Cancel</button>
          <button class="chk-btn primary" data-confirm>Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector('[data-name-input]');

    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };

    const submit = () => {
      const value = input?.value?.trim() || '';
      cleanup(value || null);
    };

    overlay.querySelector('[data-confirm]')?.addEventListener('click', submit);
    overlay.querySelector('[data-cancel]')?.addEventListener('click', () => cleanup(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(null);
    });

    // Submit on Enter key
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape') {
        cleanup(null);
      }
    });

    // Focus and select the input
    input?.focus();
    input?.select();
  });
}

function mountPanel(root, panelId, panelLabel) {
  injectStyles();

  // Panel-local view state
  let viewState = {
    currentView: 'overview',
    selectedListId: null,
  };

  let statusEl = null;

  const setStatus = (msg, tone = 'muted') => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.dataset.tone = tone;
  };

  // Get all checklists
  const getAllLists = () => {
    return loadInstances().map(inst => ({
      ...inst,
      state: loadState(inst.id),
    }));
  };

  // --- OVERVIEW VIEW ---
  const renderOverview = () => {
    const lists = getAllLists();

    const cards = lists.map(list => {
      const progress = calcProgress(list.state);
      const hasDaily = hasDailyItems(list.state);
      return `
        <div class="chk-card" data-list-id="${list.id}">
          <div class="chk-card-header">
            <div class="chk-card-title">${escapeHtml(list.state.label || list.label || 'Checklist')}</div>
            <div class="chk-card-actions">
              <button class="chk-btn small" data-rename="${list.id}" title="Rename">✎</button>
              <button class="chk-btn small chk-card-delete" data-delete="${list.id}" title="Delete">×</button>
            </div>
          </div>
          <div class="chk-card-meta">
            ${hasDaily ? '<span class="chk-daily-badge">Daily</span>' : ''}
            <span>${progress.total} item${progress.total !== 1 ? 's' : ''}</span>
          </div>
          <div class="chk-progress">
            <div class="chk-progress-bar" style="width: ${progress.percent}%"></div>
          </div>
          <div class="chk-progress-text">${progress.completed}/${progress.total} completed</div>
        </div>
      `;
    }).join('');

    root.innerHTML = `
      <div class="chk-shell">
        <div class="chk-header">
          <div class="chk-title">Checklists</div>
          <div class="chk-status" data-status></div>
        </div>
        <div class="chk-overview">
          ${cards}
          <div class="chk-card new" data-new-list>
            <span class="chk-new-icon">+ New</span>
          </div>
        </div>
      </div>
    `;

    statusEl = root.querySelector('[data-status]');

    // Card click -> go to detail
    root.querySelectorAll('.chk-card[data-list-id]').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-delete]') || e.target.closest('[data-rename]')) return;
        viewState.selectedListId = card.dataset.listId;
        viewState.currentView = 'detail';
        render();
      });
    });

    // Rename buttons
    root.querySelectorAll('[data-rename]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.rename;
        const list = lists.find(l => l.id === id);
        const currentLabel = list?.state?.label || list?.label || 'Checklist';

        const newName = await showRenamePrompt(currentLabel);
        if (newName && newName !== currentLabel) {
          const state = loadState(id);
          state.label = newName;
          persistState(id, state);
          // Also update instance label
          const instances = loadInstances();
          const inst = instances.find(i => i.id === id);
          if (inst) {
            inst.label = newName;
            persistInstances();
          }
          render();
        }
      });
    });

    // Delete buttons - use async handler with separate confirmation window
    root.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.delete;
        const list = lists.find(l => l.id === id);
        const label = list?.state?.label || list?.label || 'Checklist';

        const confirmed = await showDeleteConfirmation(label);
        if (confirmed) {
          // Remove from instances
          cachedInstances = loadInstances().filter(i => i.id !== id);
          persistInstances();
          // Remove state
          try { localStorage.removeItem(PANEL_STATE_PREFIX + id); } catch { }
          syncFileState();
          render();
        }
      });
    });

    // New list button
    root.querySelector('[data-new-list]')?.addEventListener('click', () => {
      const newId = `${PANEL_BASE_ID}_${cryptoRandom().slice(0, 6)}`;
      const newInst = { id: newId, label: 'New Checklist' };
      ensureInstance(newInst);
      persistInstances();
      const state = loadState(newId);
      state.label = 'New Checklist';
      persistState(newId, state);
      // Go directly to edit the new list
      viewState.selectedListId = newId;
      viewState.currentView = 'detail';
      render();
    });
  };

  // --- DETAIL VIEW ---
  const renderDetail = () => {
    const listId = viewState.selectedListId;
    if (!listId) {
      viewState.currentView = 'overview';
      renderOverview();
      return;
    }

    const state = loadState(listId);
    clearStaleDaily(state);
    const progress = calcProgress(state);

    const isChecked = (row) => {
      if (row.daily) {
        const key = todayKey();
        return Boolean(state.completedDaily[key]?.has?.(row.id));
      }
      return Boolean(state.completed[row.id]);
    };

    const rows = (state.items || []).map(row => {
      const checked = isChecked(row);
      return `
        <div class="chk-row ${checked ? 'done' : ''}" data-row="${row.id}">
          <input type="checkbox" class="chk-checkbox" ${checked ? 'checked' : ''} />
          <div class="chk-text">
            <div class="chk-item-text">${escapeHtml(row.text || row.name || '(untitled)')}</div>
            <div class="chk-meta">
              ${row.type ? `<span class="chk-type-badge">${escapeHtml(row.type)}</span>` : ''}
              ${row.daily ? '<span class="chk-daily-badge">daily</span>' : ''}
            </div>
          </div>
          <button class="chk-btn small" data-remove="${row.id}">×</button>
        </div>
      `;
    }).join('');

    root.innerHTML = `
      <div class="chk-shell">
        <div class="chk-detail-header">
          <button class="chk-btn chk-back-btn" data-back>←</button>
          <div class="chk-detail-title">
            <input type="text" value="${escapeAttr(state.label || 'Checklist')}" data-rename />
          </div>
        </div>
        <div class="chk-progress" style="margin-bottom:8px;">
          <div class="chk-progress-bar" style="width: ${progress.percent}%"></div>
        </div>
        <div class="chk-progress-text" style="margin-bottom:12px;">${progress.completed}/${progress.total} completed</div>
        <div class="chk-status" data-status></div>
        <div class="chk-list">
          ${rows || '<div class="chk-status">No items yet. Add one below!</div>'}
        </div>
        <div class="chk-add-row">
          <input class="chk-input" data-text placeholder="Item text" />
          <select class="chk-select" data-type>
            ${ITEM_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
          <label style="display:flex; gap:4px; align-items:center; font-size:12px; color:var(--chronos-text-muted);">
            <input type="checkbox" data-daily /> Daily
          </label>
          <button class="chk-btn primary" data-add>Add</button>
        </div>
      </div>
    `;

    statusEl = root.querySelector('[data-status]');

    // Back button
    root.querySelector('[data-back]')?.addEventListener('click', () => {
      viewState.currentView = 'overview';
      viewState.selectedListId = null;
      render();
    });

    // Rename
    const renameInput = root.querySelector('[data-rename]');
    renameInput?.addEventListener('change', () => {
      state.label = renameInput.value.trim() || 'Checklist';
      persistState(listId, state);
      // Also update instance label
      const instances = loadInstances();
      const inst = instances.find(i => i.id === listId);
      if (inst) {
        inst.label = state.label;
        persistInstances();
      }
    });

    // Add item
    const textInput = root.querySelector('[data-text]');
    const typeSelect = root.querySelector('[data-type]');
    const dailyToggle = root.querySelector('[data-daily]');

    root.querySelector('[data-add]')?.addEventListener('click', () => {
      const text = (textInput.value || '').trim();
      if (!text) return;
      state.items.push({
        id: cryptoRandom(),
        text,
        type: typeSelect.value || 'task',
        name: '',
        daily: dailyToggle.checked,
      });
      textInput.value = '';
      dailyToggle.checked = false;
      persistState(listId, state);
      render();
    });

    // Toggle/remove items
    root.querySelectorAll('.chk-row').forEach(rowEl => {
      const rowId = rowEl.dataset.row;
      const row = state.items.find(r => r.id === rowId);
      if (!row) return;

      rowEl.querySelector('.chk-checkbox')?.addEventListener('change', async (ev) => {
        const checked = ev.target.checked;
        if (!checked) {
          if (row.daily) {
            const key = todayKey();
            if (state.completedDaily[key]) state.completedDaily[key].delete(row.id);
          } else {
            delete state.completed[row.id];
          }
          persistState(listId, state);
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
        persistState(listId, state);
        render();
        if (!result.ok) {
          setStatus(result.error || 'Failed to complete', 'error');
        } else {
          setStatus('Completed!', 'success');
        }
      });

      rowEl.querySelector('[data-remove]')?.addEventListener('click', () => {
        state.items = state.items.filter(r => r.id !== rowId);
        delete state.completed[rowId];
        Object.values(state.completedDaily || {}).forEach(set => set.delete?.(rowId));
        persistState(listId, state);
        render();
      });
    });
  };

  // Main render dispatcher
  const render = () => {
    if (viewState.currentView === 'detail') {
      renderDetail();
    } else {
      renderOverview();
    }
  };

  render();

  return {
    dispose() { },
  };
}

function cryptoRandom() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function registerPanels(manager) {
  managerRef = manager;
  const instances = loadInstances();
  readFileBacking().then(fileData => {
    mergeFileStateIntoLocal(fileData);
    // Register only the base panel - it will show all checklists in overview
    manager.registerPanel(createDefinition({ id: PANEL_BASE_ID, label: 'Checklists' }));
  }).catch(() => {
    manager.registerPanel(createDefinition({ id: PANEL_BASE_ID, label: 'Checklists' }));
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
    syncFileState();
  },
  remove(id) {
    const instances = loadInstances().filter(i => i.id !== id);
    if (!instances.length) return { ok: false, reason: 'locked' };
    cachedInstances = instances;
    persistInstances();
    syncFileState();
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
    try { window.__cockpitPanelRegister(autoAttach); } catch { }
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

function escapeAttr(str) {
  return String(str ?? '').replace(/["&]/g, (ch) => ch === '"' ? '&quot;' : '&amp;');
}
