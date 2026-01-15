const PANEL_ID = 'random-picker';
const STYLE_ID = 'cockpit-random-picker-style';

function injectStyles(){
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .random-picker-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 12px;
      color: var(--chronos-text);
      font-size: 13px;
    }
    .random-picker-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .random-picker-title {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .random-picker-title strong {
      font-size: 16px;
      font-weight: 700;
      color: var(--chronos-text);
    }
    .random-picker-title span {
      color: var(--chronos-text-muted);
      font-size: 12px;
      letter-spacing: 0.4px;
    }
    .random-picker-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .random-picker-btn {
      border: 1px solid rgba(255,255,255,0.1);
      background: var(--chronos-surface-soft);
      color: var(--chronos-text);
      border-radius: 12px;
      padding: 8px 12px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease;
    }
    .random-picker-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(2, 4, 12, 0.35);
    }
    .random-picker-btn[disabled] {
      opacity: 0.6;
      cursor: default;
      transform: none;
      box-shadow: none;
    }
    .random-picker-btn--primary {
      background: var(--chronos-accent-gradient);
      border-color: rgba(255,255,255,0.18);
    }
    .random-picker-btn--ghost {
      background: transparent;
      border-style: dashed;
    }
    .random-picker-filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 10px;
      padding: 12px;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      background: var(--chronos-surface);
    }
    .random-picker-filters label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: var(--chronos-text-muted);
    }
    .random-picker-filters select,
    .random-picker-filters input {
      background: var(--chronos-surface-soft);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      padding: 7px 10px;
      color: var(--chronos-text);
      font-size: 13px;
    }
    .random-picker-card {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 10px;
      border-radius: 16px;
      padding: 16px;
      background: linear-gradient(135deg, rgba(122,162,247,0.22), rgba(77,226,182,0.12));
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 10px 30px rgba(4, 8, 18, 0.55);
      min-height: 150px;
    }
    .random-picker-card.empty {
      align-items: center;
      justify-content: center;
      text-align: center;
      color: var(--chronos-text-muted);
      background: var(--chronos-surface);
      box-shadow: none;
    }
    .random-picker-name {
      font-size: 18px;
      font-weight: 700;
      color: var(--chronos-text);
      word-break: break-word;
    }
    .random-picker-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 12px;
    }
    .random-picker-pill {
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(0,0,0,0.18);
      border: 1px solid rgba(255,255,255,0.08);
      color: var(--chronos-text);
      letter-spacing: 0.3px;
    }
    .random-picker-notes {
      font-size: 13px;
      color: var(--chronos-text-muted);
      line-height: 1.5;
    }
    .random-picker-status {
      font-size: 12px;
      color: var(--chronos-text-muted);
      min-height: 16px;
    }
    .random-picker-status.error {
      color: var(--chronos-danger);
    }
    .random-picker-controls {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
  `;
  document.head.appendChild(style);
}

function apiBase(){
  const origin = window.location?.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

function createDefinition(){
  return {
    id: PANEL_ID,
    label: 'Random Picker',
    defaultVisible: false,
    defaultPosition: { x: 540, y: 64 },
    size: { width: 360, height: 420 },
    mount: (root) => mountRandomPicker(root),
  };
}

export function register(manager){
  injectStyles();
  manager.registerPanel(createDefinition());
}

const autoAttach = (manager) => {
  try {
    if (manager && typeof manager.registerPanel === 'function'){
      register(manager);
    }
  } catch (error) {
    console.error('[Chronos][Panels][RandomPicker] Failed to register panel', error);
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

function mountRandomPicker(root){
  injectStyles();
  root.classList.add('random-picker-shell');
  root.innerHTML = `
    <div class="random-picker-header">
      <div class="random-picker-title">
        <strong>Random Picker</strong>
        <span>Shuffle tasks when you feel stuck.</span>
      </div>
      <div class="random-picker-actions">
        <button type="button" class="random-picker-btn random-picker-btn--ghost random-picker-refresh">Refresh</button>
        <button type="button" class="random-picker-btn random-picker-btn--primary random-picker-reroll">Reroll</button>
        <button type="button" class="random-picker-btn random-picker-lock">Lock</button>
      </div>
    </div>
    <div class="random-picker-filters">
      <label>
        Priority
        <input class="random-picker-priority" type="text" placeholder="high / medium / low" />
      </label>
      <label>
        Category
        <input class="random-picker-category" type="text" placeholder="work, health, ..." />
      </label>
      <label>
        Status
        <input class="random-picker-status-input" type="text" placeholder="pending / next / open" />
      </label>
      <label>
        Due on/before
        <input class="random-picker-due" type="date" />
      </label>
      <label>
        Search
        <input class="random-picker-search" type="text" placeholder="keyword" />
      </label>
    </div>
    <div class="random-picker-card empty">
      <div class="random-picker-name">No pick yet</div>
      <div class="random-picker-notes">Adjust filters, refresh, then reroll to grab a random item.</div>
    </div>
    <div class="random-picker-controls">
      <button type="button" class="random-picker-btn random-picker-btn--ghost random-picker-clear">Clear Filters</button>
      <div class="random-picker-status"></div>
    </div>
  `;

  const priorityInput = root.querySelector('.random-picker-priority');
  const categoryInput = root.querySelector('.random-picker-category');
  const statusInput = root.querySelector('.random-picker-status-input');
  const dueInput = root.querySelector('.random-picker-due');
  const searchInput = root.querySelector('.random-picker-search');
  const refreshBtn = root.querySelector('.random-picker-refresh');
  const rerollBtn = root.querySelector('.random-picker-reroll');
  const lockBtn = root.querySelector('.random-picker-lock');
  const card = root.querySelector('.random-picker-card');
  const statusEl = root.querySelector('.random-picker-status');
  const clearBtn = root.querySelector('.random-picker-clear');

  const state = {
    priority: '',
    category: '',
    status: '',
    due: '',
    q: '',
  };

  const runtime = {
    items: [],
    pick: null,
    locked: false,
    loading: false,
    error: '',
  };

  const keyFor = (item)=> `${(item.type || 'task').toLowerCase()}::${(item.name || '').toLowerCase()}`;

  const setStatus = (text, isError=false)=>{
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.classList.toggle('error', !!isError);
  };

  const renderLock = ()=>{
    lockBtn.textContent = runtime.locked ? 'Unlock' : 'Lock';
    lockBtn.classList.toggle('random-picker-btn--primary', runtime.locked);
  };

  const renderCard = ()=>{
    if (!card) return;
    if (!runtime.pick){
      card.classList.add('empty');
      card.innerHTML = `
        <div class="random-picker-name">No pick yet</div>
        <div class="random-picker-notes">Adjust filters, refresh, then reroll to grab a random item.</div>
      `;
      return;
    }
    card.classList.remove('empty');
    const p = runtime.pick;
    const pills = [];
    const push = (label, value)=>{
      if (!value && value !== 0) return;
      pills.push(`<span class="random-picker-pill">${label}: ${value}</span>`);
    };
    push('Type', (p.type || 'task').toUpperCase());
    push('Priority', p.priority);
    push('Category', p.category);
    push('Status', p.status);
    push('Due', p.due_date || p.due || p.date);
    card.innerHTML = `
      <div class="random-picker-name">${p.name || '(untitled)'}</div>
      <div class="random-picker-meta">${pills.join(' ')}</div>
      <div class="random-picker-notes">${p.description || p.summary || 'Roll again or lock in this pick.'}</div>
    `;
  };

  const matchesDue = (item)=>{
    if (!state.due) return true;
    const raw = item.due_date || item.due || item.date;
    if (!raw) return false;
    const itemDate = new Date(raw);
    if (Number.isNaN(itemDate.getTime())) return false;
    const filterDate = new Date(state.due);
    return itemDate.getTime() <= filterDate.getTime();
  };

  const applyFilters = (items)=>{
    return items.filter(item => {
      if (state.priority && String(item.priority || '').toLowerCase() !== state.priority.toLowerCase()) return false;
      if (state.category && String(item.category || '').toLowerCase() !== state.category.toLowerCase()) return false;
      if (state.status && String(item.status || '').toLowerCase() !== state.status.toLowerCase()) return false;
      if (state.q){
        const needle = state.q.toLowerCase();
        const hay = `${item.name || ''} ${item.description || ''} ${item.summary || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return matchesDue(item);
    });
  };

  const pickRandom = ()=>{
    const pool = runtime.items;
    if (!pool.length) {
      runtime.pick = null;
      renderCard();
      return;
    }
    const currentKey = runtime.pick ? keyFor(runtime.pick) : null;
    const available = currentKey ? pool.filter(item => keyFor(item) !== currentKey) : pool;
    const source = available.length ? available : pool;
    const choice = source[Math.floor(Math.random() * source.length)];
    runtime.pick = choice;
    renderCard();
  };

  const loadItems = async ()=>{
    runtime.loading = true;
    runtime.error = '';
    setStatus('Loading...');
    rerollBtn.disabled = true;
    refreshBtn.disabled = true;
    try {
      const params = new URLSearchParams();
      params.set('type', 'task');
      if (state.q) params.set('q', state.q);
      const propParts = [];
      if (state.priority) propParts.push(`priority:${encodeURIComponent(state.priority)}`);
      if (state.category) propParts.push(`category:${encodeURIComponent(state.category)}`);
      if (state.status) propParts.push(`status:${encodeURIComponent(state.status)}`);
      if (propParts.length) params.set('props', propParts.join(','));

      const resp = await fetch(`${apiBase()}/api/items?${params.toString()}`);
      const payload = await resp.json().catch(()=> ({}));
      if (!resp.ok || payload.ok === false) {
        throw new Error(payload.error || payload.stderr || `HTTP ${resp.status}`);
      }
      const rawItems = Array.isArray(payload.items) ? payload.items : [];
      runtime.items = applyFilters(rawItems);
      if (!runtime.items.length){
        runtime.pick = null;
        renderCard();
        setStatus('No items matched the filters.');
        return;
      }
      if (runtime.locked && runtime.pick){
        const match = runtime.items.find(item => keyFor(item) === keyFor(runtime.pick));
        if (match){
          runtime.pick = match;
          renderCard();
          setStatus(`Locked on "${match.name}". ${runtime.items.length} candidate(s) available.`);
          return;
        }
      }
      pickRandom();
      setStatus(`Picked 1 of ${runtime.items.length} candidate(s).`);
    } catch (error) {
      console.error('[Chronos][Panels][RandomPicker] loadItems failed', error);
      runtime.error = error?.message || 'Failed to load items';
      runtime.items = [];
      runtime.pick = null;
      renderCard();
      setStatus(runtime.error, true);
    } finally {
      runtime.loading = false;
      rerollBtn.disabled = runtime.locked || !runtime.items.length;
      refreshBtn.disabled = false;
      renderLock();
    }
  };

  const updateState = ()=>{
    state.priority = (priorityInput.value || '').trim();
    state.category = (categoryInput.value || '').trim();
    state.status = (statusInput.value || '').trim();
    state.due = dueInput.value || '';
    state.q = (searchInput.value || '').trim();
  };

  priorityInput.addEventListener('input', ()=>{ updateState(); });
  categoryInput.addEventListener('input', ()=>{ updateState(); });
  statusInput.addEventListener('input', ()=>{ updateState(); });
  dueInput.addEventListener('change', ()=>{ updateState(); });
  searchInput.addEventListener('input', ()=>{ updateState(); });

  refreshBtn.addEventListener('click', ()=>{ updateState(); loadItems(); });
  rerollBtn.addEventListener('click', ()=>{
    if (runtime.locked) return;
    if (!runtime.items.length){
      setStatus('No items to reroll. Refresh first.');
      return;
    }
    pickRandom();
    setStatus(`Rerolled from ${runtime.items.length} candidate(s).`);
  });
  lockBtn.addEventListener('click', ()=>{
    runtime.locked = !runtime.locked;
    renderLock();
    rerollBtn.disabled = runtime.locked || !runtime.items.length;
    setStatus(runtime.locked ? 'Locked current pick.' : 'Unlocked. You can reroll again.');
  });
  clearBtn.addEventListener('click', ()=>{
    priorityInput.value = '';
    categoryInput.value = '';
    statusInput.value = '';
    dueInput.value = '';
    searchInput.value = '';
    updateState();
    loadItems();
  });

  renderCard();
  renderLock();
  setStatus('Loading items...');
  loadItems();

  return {
    dispose(){
      // No persistent listeners to clean up beyond DOM removal.
    }
  };
}
