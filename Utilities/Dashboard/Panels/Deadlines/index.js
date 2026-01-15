const STYLE_ID = 'cockpit-deadlines-panel-style';
const PANEL_ID = 'deadlines';
const ITEM_TYPES = ['task', 'milestone', 'goal', 'project'];

const RANGE_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All' },
];

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'deadline', label: 'Deadlines' },
  { value: 'due_date', label: 'Due dates' },
];

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .deadlines-panel-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 12px;
      color: var(--chronos-text);
    }
    .deadlines-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
    }
    .deadlines-toolbar .left {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .deadlines-toolbar label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--chronos-text-muted);
    }
    .deadlines-toolbar select {
      background: var(--chronos-surface-soft);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 6px 10px;
      color: var(--chronos-text);
      font-size: 13px;
    }
    .deadlines-refresh {
      background: var(--chronos-accent-gradient);
      border: none;
      color: #fff;
      border-radius: 10px;
      padding: 8px 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .deadlines-refresh:hover {
      filter: brightness(1.05);
    }
    .deadlines-status {
      font-size: 12px;
      color: var(--chronos-text-muted);
    }
    .deadlines-table {
      flex: 1;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      background: var(--chronos-surface);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .deadlines-head {
      display: grid;
      grid-template-columns: 1fr 110px;
      gap: 10px;
      padding: 10px 16px;
      font-size: 12px;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--chronos-text-soft);
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .deadlines-list {
      flex: 1;
      overflow: auto;
      padding: 6px 0;
    }
    .deadlines-row {
      display: grid;
      grid-template-columns: 1fr 110px;
      gap: 10px;
      padding: 8px 16px;
      align-items: center;
    }
    .deadlines-row:nth-child(even) {
      background: rgba(255,255,255,0.02);
    }
    .deadlines-title {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .deadlines-name {
      font-weight: 600;
      font-size: 14px;
    }
    .deadlines-meta {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--chronos-text-muted);
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      align-items: center;
    }
    .deadlines-tag {
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.4px;
      background: rgba(255,255,255,0.08);
      color: var(--chronos-text);
    }
    .deadlines-tag.deadline {
      background: rgba(255,120,120,0.2);
      color: #ff9a9a;
    }
    .deadlines-tag.due {
      background: rgba(122,162,247,0.2);
      color: #a8c1ff;
    }
    .deadlines-date {
      text-align: right;
      font-size: 12px;
      color: var(--chronos-text);
    }
    .deadlines-date.overdue {
      color: #ff9a9a;
      font-weight: 600;
    }
    .deadlines-empty {
      padding: 28px 16px;
      text-align: center;
      color: var(--chronos-text-muted);
      font-size: 13px;
    }
  `;
  document.head.appendChild(style);
}

function apiBase() {
  const origin = window.location?.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

function parseDate(value) {
  if (!value) return null;
  const t = new Date(value);
  if (!Number.isNaN(t.getTime())) return t;
  return null;
}

function normalizeDateString(value) {
  if (!value) return '';
  const t = parseDate(value);
  if (!t) return String(value);
  return t.toISOString().slice(0, 10);
}

function daysDiff(targetDate) {
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const tgt = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  return Math.round((tgt - start) / (1000 * 60 * 60 * 24));
}

function buildEntries(items) {
  const entries = [];
  items.forEach(item => {
    if (!item || !item.name) return;
    const deadlineDate = parseDate(item.deadline);
    const dueDate = parseDate(item.due_date);
    if (!deadlineDate && !dueDate) return;
    entries.push({
      ...item,
      __deadlineDate: deadlineDate,
      __dueDate: dueDate,
      __deadlineStr: normalizeDateString(item.deadline),
      __dueStr: normalizeDateString(item.due_date),
    });
  });
  return entries;
}

function filterByRange(entries, horizon) {
  if (horizon === 'all') return entries;
  const days = parseInt(horizon, 10);
  if (!days || days <= 0) return entries;
  const now = new Date();
  const limit = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return entries.filter(entry => {
    const dates = [entry.__deadlineDate, entry.__dueDate].filter(Boolean);
    if (!dates.length) return false;
    return dates.some(date => date < now || date <= limit);
  });
}

function filterByKind(entries, filterValue) {
  if (filterValue === 'deadline') return entries.filter(e => e.__deadlineDate);
  if (filterValue === 'due_date') return entries.filter(e => e.__dueDate);
  return entries;
}

function sortEntries(entries) {
  return entries.sort((a, b) => {
    const now = new Date();
    const aDates = [a.__deadlineDate, a.__dueDate].filter(Boolean);
    const bDates = [b.__deadlineDate, b.__dueDate].filter(Boolean);
    const aOverdue = aDates.some(date => date < now);
    const bOverdue = bDates.some(date => date < now);
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    const aPrimary = pickPrimaryDate(a, now);
    const bPrimary = pickPrimaryDate(b, now);
    if (aPrimary && bPrimary && aPrimary - bPrimary !== 0) return aPrimary - bPrimary;
    if (a.__deadlineDate && !b.__deadlineDate) return -1;
    if (!a.__deadlineDate && b.__deadlineDate) return 1;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  });
}

function pickPrimaryDate(entry, now) {
  const dates = [];
  if (entry.__deadlineDate) dates.push({ kind: 'deadline', date: entry.__deadlineDate });
  if (entry.__dueDate) dates.push({ kind: 'due', date: entry.__dueDate });
  if (!dates.length) return null;
  const overdue = dates.filter(d => d.date < now);
  if (overdue.length) {
    overdue.sort((a, b) => a.date - b.date);
    return overdue[0].date;
  }
  dates.sort((a, b) => a.date - b.date);
  return dates[0].date;
}

async function fetchItems() {
  const base = apiBase();
  let items = [];
  for (const type of ITEM_TYPES) {
    try {
      const resp = await fetch(`${base}/api/items?type=${encodeURIComponent(type)}`);
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok || payload.ok === false) continue;
      if (Array.isArray(payload.items)) {
        items = items.concat(payload.items.map(it => ({ ...it, type })));
      }
    } catch {
      continue;
    }
  }
  return items;
}

function createDefinition() {
  return {
    id: PANEL_ID,
    label: 'Deadlines',
    defaultVisible: false,
    defaultPosition: { x: 120, y: 80 },
    size: { width: 420, height: 520 },
    mount: (root) => mountPanel(root),
  };
}

export function register(manager) {
  injectStyles();
  manager.registerPanel(createDefinition());
}

const autoAttach = (manager) => {
  try {
    if (manager && typeof manager.registerPanel === 'function') {
      register(manager);
    }
  } catch (err) {
    console.error('[Chronos][Panels][Deadlines] autoAttach failed', err);
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

function mountPanel(root) {
  injectStyles();
  root.classList.add('deadlines-panel-shell');
  root.innerHTML = `
    <div class="deadlines-toolbar">
      <div class="left">
        <label>
          <span>Show</span>
          <select data-filter></select>
        </label>
        <label>
          <span>Range</span>
          <select data-range></select>
        </label>
        <button type="button" class="deadlines-refresh">Refresh</button>
      </div>
      <div class="deadlines-status"></div>
    </div>
    <div class="deadlines-table" aria-live="polite">
      <div class="deadlines-head">
        <span>Item</span>
        <span>Date</span>
      </div>
      <div class="deadlines-list"></div>
    </div>
  `;

  const filterSelect = root.querySelector('[data-filter]');
  const rangeSelect = root.querySelector('[data-range]');
  const refreshBtn = root.querySelector('.deadlines-refresh');
  const statusEl = root.querySelector('.deadlines-status');
  const listEl = root.querySelector('.deadlines-list');

  FILTER_OPTIONS.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    filterSelect.appendChild(option);
  });
  RANGE_OPTIONS.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    rangeSelect.appendChild(option);
  });
  filterSelect.value = 'all';
  rangeSelect.value = '14';

  let cachedItems = [];

  const setStatus = (text) => {
    statusEl.textContent = text || '';
  };

  const render = () => {
    listEl.innerHTML = '';
    const filterValue = filterSelect.value || 'all';
    const rangeValue = rangeSelect.value || '14';
    const baseEntries = buildEntries(cachedItems);
    const filtered = filterByKind(filterByRange(baseEntries, rangeValue), filterValue);
    const sorted = sortEntries(filtered);

    if (!sorted.length) {
      const empty = document.createElement('div');
      empty.className = 'deadlines-empty';
      empty.textContent = 'No deadlines or due dates in this range.';
      listEl.appendChild(empty);
      return;
    }

    const now = new Date();
    sorted.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'deadlines-row';

      const title = document.createElement('div');
      title.className = 'deadlines-title';
      const name = document.createElement('div');
      name.className = 'deadlines-name';
      name.textContent = entry.name || '(untitled)';
      const meta = document.createElement('div');
      meta.className = 'deadlines-meta';
      const typeSpan = document.createElement('span');
      typeSpan.textContent = String(entry.type || '').toUpperCase();
      if (entry.__deadlineDate) {
        const tag = document.createElement('span');
        tag.className = 'deadlines-tag deadline';
        tag.textContent = 'DEADLINE';
        meta.appendChild(tag);
      }
      if (entry.__dueDate) {
        const tag = document.createElement('span');
        tag.className = 'deadlines-tag due';
        tag.textContent = 'DUE DATE';
        meta.appendChild(tag);
      }
      meta.prepend(typeSpan);
      title.append(name, meta);

      const date = document.createElement('div');
      date.className = 'deadlines-date';
      const parts = [];
      if (entry.__deadlineDate) {
        const delta = daysDiff(entry.__deadlineDate);
        const label = delta < 0 ? `overdue ${Math.abs(delta)}d` : (delta === 0 ? 'today' : `in ${delta}d`);
        parts.push({ kind: 'deadline', text: `${entry.__deadlineStr} (${label})`, overdue: delta < 0 });
      }
      if (entry.__dueDate) {
        const delta = daysDiff(entry.__dueDate);
        const label = delta < 0 ? `overdue ${Math.abs(delta)}d` : (delta === 0 ? 'today' : `in ${delta}d`);
        parts.push({ kind: 'due', text: `${entry.__dueStr} (${label})`, overdue: delta < 0 });
      }
      const lines = parts.map(part => part.text);
      date.textContent = lines.join(' | ');
      if (parts.some(part => part.overdue)) {
        date.classList.add('overdue');
      }

      row.append(title, date);
      listEl.appendChild(row);
    });
  };

  const refresh = async () => {
    setStatus('Loading...');
    try {
      cachedItems = await fetchItems();
      setStatus(`Updated ${new Date().toLocaleTimeString()}`);
      render();
    } catch (err) {
      console.error('[Chronos][Panels][Deadlines] fetch failed', err);
      setStatus('Failed to load');
      cachedItems = [];
      render();
    }
  };

  filterSelect.addEventListener('change', render);
  rangeSelect.addEventListener('change', render);
  refreshBtn.addEventListener('click', refresh);

  refresh();

  return {
    dispose() {
      filterSelect.removeEventListener('change', render);
      rangeSelect.removeEventListener('change', render);
      refreshBtn.removeEventListener('click', refresh);
    },
  };
}
