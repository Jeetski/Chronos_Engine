const STYLE_ID = 'cockpit-schedule-panel-style';
const PANEL_ID = 'schedule';
const TIME_STATE_COLORS = {
  past: '#ff6b6b',
  present: '#6bb7ff',
  future: '#6bff95',
};

console.log('[Chronos][Panels][Schedule] Module loaded');

function injectStyles(){
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .schedule-panel-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 14px;
      color: var(--chronos-text);
      font-size: 14px;
    }
    .schedule-panel-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }
    .schedule-panel-toolbar .left {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .schedule-day-picker {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--chronos-text-muted);
    }
    .schedule-day-picker input[type="date"] {
      background: var(--chronos-surface-soft);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 6px 10px;
      color: var(--chronos-text);
      font-size: 13px;
    }
    .schedule-panel-refresh {
      background: var(--chronos-accent-gradient);
      border: none;
      color: white;
      border-radius: 10px;
      padding: 8px 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .schedule-panel-refresh:hover {
      filter: brightness(1.1);
    }
    .schedule-panel-start {
      background: linear-gradient(135deg, var(--chronos-success), var(--chronos-accent));
      border: none;
      color: var(--chronos-bg, #0b0f16);
      border-radius: 10px;
      padding: 8px 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .schedule-panel-start[disabled] {
      opacity: 0.6;
      cursor: default;
    }
    .schedule-panel-start:hover:not([disabled]) {
      filter: brightness(1.05);
    }
    .schedule-panel-status {
      font-size: 12px;
      color: var(--chronos-text-muted);
    }
    .schedule-panel-table {
      flex: 1;
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      background: var(--chronos-surface);
      overflow: hidden;
    }
    .schedule-tree-head {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 10px;
      padding: 10px 18px;
      font-size: 12px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: var(--chronos-text-soft);
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .schedule-tree {
      flex: 1;
      overflow: auto;
      padding: 8px 0;
    }
    .schedule-tree-row {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 10px;
      padding: 6px 18px;
      align-items: center;
    }
    .schedule-tree-row:nth-child(even) {
      background: rgba(255,255,255,0.02);
    }
    .schedule-time {
      font-family: "IBM Plex Mono", "Cascadia Code", monospace;
      color: var(--schedule-time-color, #a5b1d5);
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
      line-height: 1.2;
    }
    .schedule-time::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }
    .schedule-time--past {
      --schedule-time-color: #ff6b6b;
    }
    .schedule-time--present {
      --schedule-time-color: #6bb7ff;
    }
    .schedule-time--future {
      --schedule-time-color: #6bff95;
    }
    .schedule-node {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .schedule-node-label {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .schedule-toggle {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.14);
      background: var(--chronos-surface-soft);
      color: var(--chronos-text);
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
    }
    .schedule-toggle-spacer {
      width: 24px;
      height: 24px;
    }
    .schedule-node-name {
      font-weight: 600;
      font-size: 14px;
      color: var(--chronos-text);
    }
    .schedule-node-type {
      font-size: 12px;
      color: var(--chronos-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .schedule-panel-message {
      font-size: 13px;
      color: var(--chronos-text-muted);
      min-height: 18px;
    }
    .schedule-panel-message.error {
      color: var(--chronos-danger);
    }
    .schedule-empty {
      padding: 30px 18px;
      font-size: 14px;
      color: var(--chronos-text-muted);
      text-align: center;
    }
  `;
  document.head.appendChild(style);
}

function apiBase(){
  const origin = window.location?.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

function todayKey(){
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function parseScheduleYaml(text){
  try {
    if (typeof window !== 'undefined' && typeof window.parseYaml === 'function'){
      const parsed = window.parseYaml(text);
      if (parsed && Array.isArray(parsed.blocks) && parsed.blocks.length){
        return parsed;
      }
      // Fall through to manual parse when empty
    }
  } catch {}
  const result = { blocks: [] };
  if (!text) return result;
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let inBlocks = false;
  let current = null;
  const pushCurrent = ()=>{
    if (current){
      result.blocks.push(current);
      current = null;
    }
  };
  const applyLine = (line)=>{
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.+)$/);
    if (!match){
      if (/^\s*-\s*$/.test(line.trim())){
        pushCurrent();
        current = {};
      }
      return;
    }
    const key = match[1];
    const value = match[2].trim();
    const normalized = value === '' ? '' : value;
    if (inBlocks){
      if (!current) current = {};
      current[key] = normalized;
    } else {
      result[key] = normalized;
    }
  };
  for (const rawLine of lines){
    const line = rawLine.replace(/#.*$/, '');
    if (!line.trim()) continue;
    if (!inBlocks){
      if (/^\s*blocks\s*:/i.test(line)){
        inBlocks = true;
        continue;
      }
      applyLine(line);
      continue;
    }
    const dashMatch = line.match(/^\s*-\s*(.*)$/);
    if (dashMatch){
      pushCurrent();
      current = {};
      const remainder = dashMatch[1];
      if (remainder){
        const kv = remainder.match(/^([A-Za-z0-9_]+)\s*:\s*(.+)$/);
        if (kv){
          current[kv[1]] = kv[2].trim();
        }
      }
      continue;
    }
    applyLine(line);
  }
  pushCurrent();
  return result;
}

function normalizeBlocks(raw){
  if (!Array.isArray(raw)) return [];
  return raw.map((block, idx) => {
    const startParts = extractTimeParts(block.start ?? block.start_time);
    const endParts = extractTimeParts(block.end ?? block.end_time);
    return {
      start: startParts.display,
      end: endParts.display,
      startMinutes: startParts.minutes,
      endMinutes: endParts.minutes,
      text: String(block.text || block.name || `Block ${idx + 1}`),
      type: String(block.type || block.item_type || '').toLowerCase(),
      depth: Number(block.depth ?? 0) || 0,
      key: `block-${idx}`,
    };
  });
}

function extractTimeParts(value){
  if (!value) return { display: '', minutes: null };
  const match = String(value).match(/(\d{1,2}):(\d{2})/);
  if (!match) return { display: '', minutes: null };
  const hours = String(match[1]).padStart(2, '0');
  const mins = String(match[2]).padStart(2, '0');
  const hourNum = Number(hours);
  const minuteNum = Number(mins);
  if (Number.isNaN(hourNum) || Number.isNaN(minuteNum)){
    return { display: `${hours}:${mins}`, minutes: null };
  }
  return {
    display: `${hours}:${mins}`,
    minutes: hourNum * 60 + minuteNum,
  };
}

function buildTree(blocks){
  const root = [];
  const stack = [];
  blocks.forEach(block => {
    const node = { ...block, children: [] };
    while (stack.length > block.depth){
      stack.pop();
    }
    if (stack.length === 0){
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack[block.depth] = node;
  });
  return root;
}

function createDefinition(){
  return {
    id: PANEL_ID,
    label: 'Schedule Panel',
    defaultVisible: true,
    defaultPosition: { x: 48, y: 48 },
    size: { width: 420, height: 500 },
    mount: (root) => mountSchedulePanel(root),
  };
}

export function register(manager){
  injectStyles();
  console.log('[Chronos][Panels][Schedule] register()');
  manager.registerPanel(createDefinition());
}

const autoAttach = (manager) => {
  try {
    console.log('[Chronos][Panels][Schedule] autoAttach');
    if (manager && typeof manager.registerPanel === 'function') {
      register(manager);
    }
  } catch (err) {
    console.error('[Chronos][Panels] Failed to register schedule panel', err);
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

function mountSchedulePanel(root){
  injectStyles();
  root.classList.add('schedule-panel-shell');
  root.innerHTML = `
    <div class="schedule-panel-toolbar">
      <div class="left">
        <label class="schedule-day-picker">
          <span>Day</span>
          <input class="schedule-day-input" type="date" />
        </label>
        <button type="button" class="schedule-panel-refresh">Refresh</button>
        <button type="button" class="schedule-panel-start">Start Day</button>
      </div>
      <div class="schedule-panel-status"></div>
    </div>
    <div class="schedule-panel-table" aria-live="polite">
      <div class="schedule-tree-head">
        <span>Time</span>
        <span>Routine</span>
      </div>
      <div class="schedule-tree" role="tree"></div>
    </div>
    <div class="schedule-panel-message"></div>
  `;

  const dateInput = root.querySelector('.schedule-day-input');
  const refreshBtn = root.querySelector('.schedule-panel-refresh');
  const statusEl = root.querySelector('.schedule-panel-status');
  const treeEl = root.querySelector('.schedule-tree');
  const messageEl = root.querySelector('.schedule-panel-message');
  const startBtn = root.querySelector('.schedule-panel-start');

  const today = todayKey();
  if (dateInput) dateInput.value = today;

  let treeData = [];
  let expanded = new Set();
  let loading = false;

  const renderTree = ()=>{
    treeEl.innerHTML = '';
    if (!treeData.length){
      const empty = document.createElement('div');
      empty.className = 'schedule-empty';
      empty.textContent = loading ? 'Loading schedule...' : 'No scheduled routines for this day.';
      treeEl.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    const nowMinutes = minutesSinceMidnight(new Date());
    const walk = (nodes, depth, prefix)=>{
      nodes.forEach((node, idx)=>{
        const key = `${prefix}.${idx}`;
        const row = document.createElement('div');
        row.className = 'schedule-tree-row';
        row.setAttribute('role', 'treeitem');
        row.setAttribute('aria-level', String(depth + 1));

        const time = document.createElement('div');
        time.className = 'schedule-time';
        time.textContent = formatTimeRange(node.start, node.end);
        const relativeState = classifyRelativeTime(node, nowMinutes);
        if (relativeState){
          time.classList.add(`schedule-time--${relativeState}`);
          const color = TIME_STATE_COLORS[relativeState];
          if (color){
            time.style.setProperty('--schedule-time-color', color);
            time.style.color = color;
          }
          time.dataset.timeState = relativeState;
        } else {
          time.style.removeProperty('--schedule-time-color');
          time.style.removeProperty('color');
          time.removeAttribute('data-time-state');
        }

        const nodeCell = document.createElement('div');
        nodeCell.className = 'schedule-node';
        nodeCell.style.paddingLeft = `${depth * 16}px`;
        const hasChildren = node.children && node.children.length;
        if (hasChildren){
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'schedule-toggle';
          toggle.dataset.toggle = key;
          toggle.textContent = expanded.has(key) ? 'v' : '>';
          toggle.setAttribute('aria-label', 'Toggle children');
          nodeCell.appendChild(toggle);
        } else {
          const spacer = document.createElement('span');
          spacer.className = 'schedule-toggle-spacer';
          nodeCell.appendChild(spacer);
        }
        const label = document.createElement('div');
        label.className = 'schedule-node-label';
        const name = document.createElement('span');
        name.className = 'schedule-node-name';
        name.textContent = node.text || 'Untitled block';
        const type = document.createElement('span');
        type.className = 'schedule-node-type';
        type.textContent = node.type || 'item';
        label.append(name, type);
        nodeCell.appendChild(label);

        row.append(time, nodeCell);
        fragment.appendChild(row);

        if (hasChildren && expanded.has(key)){
          walk(node.children, depth + 1, key);
        }
      });
    };
    walk(treeData, 0, 'root');
    treeEl.appendChild(fragment);
  };

  const setMessage = (text, isError=false)=>{
    messageEl.textContent = text || '';
    messageEl.classList.toggle('error', !!isError);
  };

  const setStatus = (text)=>{ statusEl.textContent = text || ''; };

  const updateStartButton = ()=>{
    if (!startBtn) return;
    const isToday = (dateInput?.value || today) === today;
    startBtn.disabled = !isToday;
    startBtn.title = isToday ? 'Run today reschedule + start timer' : 'Start is available only for today';
  };

  const loadSchedule = async ()=>{
    const requestedDay = dateInput?.value || today;
    updateStartButton();
    if (requestedDay !== today){
      treeData = [];
      expanded = new Set();
      renderTree();
      setMessage('Only today\'s timeline is available right now. Select today to see live data.');
      setStatus('');
      return;
    }
    loading = true;
    setStatus('Loading...');
    setMessage('');
    renderTree();
    try {
      const resp = await fetch(apiBase() + '/api/today');
      const text = await resp.text();
      const parsed = parseScheduleYaml(text);
      if (!resp.ok || parsed.ok === false){
        throw new Error(parsed?.error || `Schedule unavailable (HTTP ${resp.status})`);
      }
      const blocks = normalizeBlocks(parsed.blocks);
      treeData = buildTree(blocks);
      expanded = new Set();
      treeData.forEach((_, idx)=> expanded.add(`root.${idx}`));
      if (!treeData.length){
        setMessage('No routines scheduled yet. Try running "today reschedule" from the console.');
      }
      setStatus(`Updated ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      console.error('[Chronos][Cockpit] Failed to load schedule panel', error);
      treeData = [];
      expanded = new Set();
      setMessage('Unable to load today\'s schedule. Try again in a moment.', true);
      setStatus('Error');
    } finally {
      loading = false;
      renderTree();
    }
  };

  const handleToggle = (ev)=>{
    const btn = ev.target?.closest?.('[data-toggle]');
    if (!btn) return;
    const key = btn.getAttribute('data-toggle');
    if (!key) return;
    if (expanded.has(key)) expanded.delete(key);
    else expanded.add(key);
    renderTree();
  };

  treeEl.addEventListener('click', handleToggle);
  refreshBtn?.addEventListener('click', loadSchedule);
  dateInput?.addEventListener('change', ()=>{
    updateStartButton();
    loadSchedule();
  });
  startBtn?.addEventListener('click', async ()=>{
    if (startBtn.disabled) return;
    startBtn.disabled = true;
    const prev = startBtn.textContent;
    startBtn.textContent = 'Starting...';
    setMessage('');
    try {
      if (typeof window.ChronosStartDay === 'function') {
        await window.ChronosStartDay({ source: 'schedule-panel', target: 'day' });
      } else {
        const resp = await fetch(apiBase() + '/api/day/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'day' }) });
        const data = await resp.json().catch(()=> ({}));
        if (!resp.ok || data.ok === false) throw new Error(data.error || data.stderr || `HTTP ${resp.status}`);
      }
      setMessage('Day started. Timer running.');
      setStatus('Started automatically');
      try { window.ChronosBus?.emit?.('timer:show', { source: 'schedule-panel' }); } catch {}
      await loadSchedule();
    } catch (err) {
      console.error('[Chronos][Panels][Schedule] start failed', err);
      setMessage(`Start failed: ${err?.message || err}`, true);
      setStatus('Start failed');
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = prev;
    }
  });

  updateStartButton();
  loadSchedule();

  return {
    dispose(){
      treeEl.removeEventListener('click', handleToggle);
    }
  };
}

function formatTimeRange(start, end){
  if (start && end) return `${start} - ${end}`;
  if (start) return start;
  return '';
}

function parseTimeToMinutes(value){
  if (!value) return null;
  const source = String(value).trim();
  const match = source.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function minutesSinceMidnight(date){
  return date.getHours() * 60 + date.getMinutes();
}

function classifyRelativeTime(node, nowMinutes){
  if (!node || typeof nowMinutes !== 'number') return null;
  const startMinutes = resolveMinutes(node.startMinutes, node.start);
  if (startMinutes == null) return null;
  const endMinutes = resolveMinutes(node.endMinutes, node.end);
  const comparisonEnd = endMinutes == null ? startMinutes : endMinutes;
  if (comparisonEnd < nowMinutes) return 'past';
  if (startMinutes <= nowMinutes && nowMinutes <= comparisonEnd) return 'present';
  if (startMinutes > nowMinutes) return 'future';
  return null;
}

function resolveMinutes(preferred, fallback){
  if (typeof preferred === 'number') return preferred;
  return parseTimeToMinutes(fallback);
}
