// Shared tool/selection state so the overlay controls and view logic stay in sync
// (note leading BOM retained)
let activeTool = window.__calendarTool ?? 'cursor';
let selectRect = null;
let navDepth = 0;
const DAYLIST_STYLE_ID = 'calendar-daylist-style';

function injectDayListStyles() {
  if (document.getElementById(DAYLIST_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DAYLIST_STYLE_ID;
  style.textContent = `
    .calendar-daylist {
      position: absolute;
      inset: 0;
      display: none;
      padding: 12px;
      gap: 10px;
      flex-direction: column;
      color: var(--chronos-text, var(--text));
    }
    .calendar-daylist-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .calendar-daylist-title {
      font-weight: 700;
      font-size: 15px;
      color: var(--chronos-text, var(--text));
    }
    .calendar-daylist-actions {
      display: inline-flex;
      gap: 8px;
    }
    .calendar-daylist-table {
      flex: 1;
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      background: var(--chronos-surface, rgba(15,17,21,0.85));
      overflow: hidden;
      min-height: 0;
    }
    .calendar-daylist-head {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 10px;
      padding: 10px 18px;
      font-size: 12px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: var(--chronos-text-soft, #9aa4b7);
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .calendar-daylist-tree {
      flex: 1;
      overflow: auto;
      padding: 8px 0;
    }
    .calendar-daylist-row {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 10px;
      padding: 6px 18px;
      align-items: center;
      cursor: pointer;
    }
    .calendar-daylist-row:nth-child(even) {
      background: rgba(255,255,255,0.02);
    }
    .calendar-daylist-row.is-selected {
      background: rgba(122,162,247,0.16);
    }
    .calendar-daylist-time {
      font-family: "IBM Plex Mono", "Cascadia Code", monospace;
      color: var(--calendar-time-color, #a5b1d5);
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
      line-height: 1.2;
    }
    .calendar-daylist-time::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }
    .calendar-daylist-time--past { --calendar-time-color: #ff6b6b; }
    .calendar-daylist-time--present { --calendar-time-color: #6bb7ff; }
    .calendar-daylist-time--future { --calendar-time-color: #6bff95; }
    .calendar-daylist-node {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .calendar-daylist-node-label {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .calendar-daylist-toggle {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.14);
      background: var(--chronos-surface-soft, rgba(20,25,35,0.9));
      color: var(--chronos-text, #e6e8ef);
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
    }
    .calendar-daylist-toggle-spacer {
      width: 24px;
      height: 24px;
    }
    .calendar-daylist-node-name {
      font-weight: 600;
      font-size: 14px;
      color: var(--chronos-text, #e6e8ef);
    }
    .calendar-daylist-node-type {
      font-size: 12px;
      color: var(--chronos-text-muted, #9aa4b7);
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .calendar-daylist-message {
      font-size: 13px;
      color: var(--chronos-text-muted, #9aa4b7);
      min-height: 18px;
    }
    .calendar-daylist-message.error {
      color: var(--chronos-danger, #ef6a6a);
    }
    .calendar-daylist-empty {
      padding: 30px 18px;
      font-size: 14px;
      color: var(--chronos-text-muted, #9aa4b7);
      text-align: center;
    }
  `;
  document.head.appendChild(style);
}

export function mount(el, context) {
  try { el.style.position = 'relative'; } catch {}
  injectDayListStyles();
  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.height = '100%';
  container.style.overflow = 'auto';
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.background = 'repeating-conic-gradient(from 45deg, #0e131c 0% 25%, #0b0f16 0% 50%) 50% / 26px 26px';
  container.appendChild(canvas);
  el.appendChild(container);

  const dayList = document.createElement('div');
  dayList.className = 'calendar-daylist';
  dayList.innerHTML = `
    <div class="calendar-daylist-header">
      <div class="calendar-daylist-title">Day</div>
      <div class="calendar-daylist-actions"></div>
    </div>
    <div class="calendar-daylist-table" aria-live="polite">
      <div class="calendar-daylist-head">
        <span>Time</span>
        <span>Routine</span>
      </div>
      <div class="calendar-daylist-tree" role="tree"></div>
    </div>
    <div class="calendar-daylist-message"></div>
  `;
  container.appendChild(dayList);

  const ctx = canvas.getContext('2d');

  // State
  let viewMode = 'year';
  let selectedMonth = null;
  let selectedYear = new Date().getFullYear();
  let monthRects = [];
  let weekRects = [];
  let selectedWeekStart = null;
  let dayRects = [];
  let dayCellRects = [];
  let selectedDayDate = null;
  let dayDrag = null; // disabled for selection-only mode
  let dayGroups = [];
  let selectedStartMin = null;
  let selectedItem = null; // { text, type, start, end }
  let lastDayKey = null;
  const navStack = [];
  let dayBlocksStore = load('pm_day_blocks', {});
  try { window.dayBlocksStore = dayBlocksStore; } catch {}
  try { context?.bus?.emit('calendar:open', { source: 'calendar' }); } catch {}
  // Default zoom: three "-" clicks from 1.00 => 0.25
  let pxPerMinute = (window.__calendarPxPerMin ?? 0.25); // pixels per minute (0.25 => ~360px total)
  // Ensure global zoom reflects the initial value so +/- controls use the same baseline
  try { if (window.__calendarPxPerMin == null) window.__calendarPxPerMin = pxPerMinute; } catch {}
  let hierarchyLevel = (window.__calendarLevel ?? 0); // 0=routines,1=subroutines,2=microroutines,3=items

  const dayListTitleEl = dayList.querySelector('.calendar-daylist-title');
  const dayListTreeEl = dayList.querySelector('.calendar-daylist-tree');
  const dayListMessageEl = dayList.querySelector('.calendar-daylist-message');
  let dayListRefreshBtn = null;
  let dayListTreeData = [];
  let dayListExpanded = new Set();
  let dayListExpandedInitialized = false;
  let dayListLoading = false;

  // API helpers for /api/today
  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  function parseScheduleYaml(text){
    try {
      if (typeof window !== 'undefined' && typeof window.parseYaml === 'function'){
        const parsed = window.parseYaml(text);
        if (parsed && Array.isArray(parsed.blocks) && parsed.blocks.length){
          return parsed;
        }
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
  function extractTimeParts(value){
    if (!value) return { minutes: null };
    const match = String(value).match(/(\d{1,2}):(\d{2})/);
    if (!match) return { minutes: null };
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return { minutes: null };
    return { minutes: hours * 60 + minutes };
  }
  function normalizeScheduleBlocks(raw){
    if (!Array.isArray(raw)) return [];
    return raw.map((block, idx)=>{
      const startParts = extractTimeParts(block.start ?? block.start_time);
      const endParts = extractTimeParts(block.end ?? block.end_time);
      return {
        start: startParts.minutes,
        end: endParts.minutes,
        text: String(block.text || block.name || `Block ${idx + 1}`),
        type: String(block.type || block.item_type || '').toLowerCase(),
        depth: Number(block.depth ?? 0) || 0,
        is_parallel: /^true$/i.test(String(block.is_parallel || '')),
        order: (block.order != null ? parseInt(block.order, 10) : 0),
      };
    });
  }
  let todayBlocks = null; let todayLoadedAt = 0;
  const completionsCache = new Map(); // key: 'YYYY-MM-DD' -> Set(names)
  async function loadTodayBlocks(force=false){
    if (!force && todayBlocks && (Date.now()-todayLoadedAt) < 3000) return todayBlocks;
    try{
      const resp = await fetch(apiBase()+"/api/today");
      const text = await resp.text();
      const parsed = parseScheduleYaml(text);
      todayBlocks = normalizeScheduleBlocks(parsed.blocks);
      todayLoadedAt = Date.now();
      try { window.__todayBlocks = todayBlocks; } catch {}
    } catch (e){ todayBlocks = []; }
    return todayBlocks;
  }
  try { window.calendarLoadToday = ()=>loadTodayBlocks(true); } catch {}
  async function loadCompletions(day){
    try{
      const key = dayKey(day);
      if (completionsCache.has(key)) return completionsCache.get(key);
      const resp = await fetch(apiBase()+`/api/completions?date=${key}`);
      const text = await resp.text();
      // Parse minimal YAML: completed: [ - name ]
      const lines = String(text||'').replace(/\r\n?/g,'\n').split('\n');
      let inList=false; const names=new Set();
      for (let raw of lines){ const line = raw.replace(/#.*$/,''); if (!line.trim()) continue; if (!inList) { if (/^\s*completed\s*:/i.test(line)) inList=true; continue; }
        const m = line.match(/^\s*-\s*(.+)$/); if (m) names.add(m[1].trim());
      }
      completionsCache.set(key, names); return names;
    }catch{ return new Set(); }
  }
  // (removed duplicate helpers)

  function save(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch{} }
  function load(key, fallback){ try{ const v = localStorage.getItem(key); return v? JSON.parse(v): fallback; }catch{ return fallback; } }

  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
  function expandText(s){ try { if (window.__calendarFxExpand === false) return String(s||''); return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s||'')) : String(s||''); } catch { return String(s||''); } }
  function dateAtMidnight(d){ const n=new Date(d); n.setHours(0,0,0,0); return n; }
  function weekMonday(d){ const n=dateAtMidnight(d); const off=(n.getDay()+6)%7; n.setDate(n.getDate()-off); return n; }
  function sameDay(a,b){ return dateAtMidnight(a).getTime()===dateAtMidnight(b).getTime(); }
  function getCss(varName, fallback){ const v=getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); return v||fallback; }
  function withAlpha(color,a){ if(/^#([0-9a-f]{6})$/i.test(color)){ const r=parseInt(color.slice(1,3),16), g=parseInt(color.slice(3,5),16), b=parseInt(color.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; } return color; }
  function roundRect(ctx,x,y,w,h,r){ const rr=Math.min(r,w/2,h/2); ctx.beginPath(); ctx.moveTo(x+rr,y); ctx.arcTo(x+w,y,x+w,y+h,rr); ctx.arcTo(x+w,y+h,x,y+h,rr); ctx.arcTo(x,y+h,x,y,rr); ctx.arcTo(x,y,x+w,y,rr); ctx.closePath(); }
  function colorForDay(dayDate,today){ if(dayDate<today) return getCss('--danger','#ef6a6a'); if(sameDay(dayDate,today)) return getCss('--accent','#7aa2f7'); return getCss('--ok','#5bdc82'); }
  function minToHM(min){ const h=Math.floor(min/60)%24; const m=min%60; return String(h).padStart(2,'0')+":"+String(m).padStart(2,'0'); }
  function formatDayTitle(day){
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${months[day.getMonth()]} ${day.getDate()}, ${day.getFullYear()}`;
  }
  function setDayListVisible(visible){
    dayList.style.display = visible ? 'flex' : 'none';
    canvas.style.display = visible ? 'none' : 'block';
  }
  function setDayListMessage(text, isError=false){
    if (!dayListMessageEl) return;
    dayListMessageEl.textContent = text || '';
    dayListMessageEl.classList.toggle('error', !!isError);
  }
  function buildTreeFromBlocks(blocks){
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
  function classifyRelativeTime(node, dayDate){
    if (!node || node.startMinutes == null) return null;
    const today = dateAtMidnight(new Date());
    const target = dateAtMidnight(dayDate);
    if (target < today) return 'past';
    if (target > today) return 'future';
    const nowMinutes = (new Date()).getHours() * 60 + (new Date()).getMinutes();
    const endMinutes = node.endMinutes == null ? node.startMinutes : node.endMinutes;
    if (endMinutes < nowMinutes) return 'past';
    if (node.startMinutes <= nowMinutes && nowMinutes <= endMinutes) return 'present';
    return 'future';
  }
  function updateDayListTitle(dayDate){
    if (dayListTitleEl) dayListTitleEl.textContent = formatDayTitle(dayDate);
  }
  function normalizeDayListBlocks(blocks){
    return (blocks || []).map((block, idx) => {
      const startMinutes = typeof block.start === 'number' ? block.start : null;
      const endMinutes = typeof block.end === 'number' ? block.end : null;
      return {
        key: `block-${idx}`,
        text: String(block.text || 'Untitled block'),
        type: String(block.type || 'item'),
        depth: Number(block.depth || 0),
        startMinutes,
        endMinutes,
        start: startMinutes != null ? minToHM(startMinutes) : '',
        end: endMinutes != null ? minToHM(endMinutes) : '',
        is_parallel: !!block.is_parallel,
      };
    });
  }
  function collectExpandableKeys(nodes, prefix){
    const keys = [];
    nodes.forEach((node, idx) => {
      const key = `${prefix}.${idx}`;
      if (node.children && node.children.length){
        keys.push(key);
        keys.push(...collectExpandableKeys(node.children, key));
      }
    });
    return keys;
  }
  function collectRootExpandableKeys(nodes, prefix){
    const keys = [];
    nodes.forEach((node, idx) => {
      if (node.children && node.children.length){
        keys.push(`${prefix}.${idx}`);
      }
    });
    return keys;
  }
  function getNodeByKey(key){
    if (!key) return null;
    const parts = key.split('.').slice(1);
    let nodes = dayListTreeData;
    let node = null;
    for (const part of parts){
      const idx = Number(part);
      if (!Number.isFinite(idx) || !nodes || !nodes[idx]) return null;
      node = nodes[idx];
      nodes = node.children || [];
    }
    return node;
  }
  function renderDayListTree(){
    if (!dayListTreeEl) return;
    dayListTreeEl.innerHTML = '';
    if (!dayListTreeData.length){
      const empty = document.createElement('div');
      empty.className = 'calendar-daylist-empty';
      empty.textContent = dayListLoading ? 'Loading schedule...' : 'No scheduled routines for this day.';
      dayListTreeEl.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    const walk = (nodes, depth, prefix) => {
      nodes.forEach((node, idx) => {
        const key = `${prefix}.${idx}`;
        const row = document.createElement('div');
        row.className = 'calendar-daylist-row';
        row.setAttribute('role', 'treeitem');
        row.setAttribute('aria-level', String(depth + 1));
        row.dataset.nodeKey = key;
        row.dataset.nodeIndex = String(idx);

        if (selectedStartMin != null && node.startMinutes === selectedStartMin){
          row.classList.add('is-selected');
        }

        const time = document.createElement('div');
        time.className = 'calendar-daylist-time';
        time.textContent = node.start && node.end ? `${node.start} - ${node.end}` : (node.start || '');
        const relativeState = classifyRelativeTime(node, selectedDayDate || new Date());
        if (relativeState){
          time.classList.add(`calendar-daylist-time--${relativeState}`);
        }

        const nodeCell = document.createElement('div');
        nodeCell.className = 'calendar-daylist-node';
        nodeCell.style.paddingLeft = `${depth * 16}px`;
        const hasChildren = node.children && node.children.length;
        if (hasChildren){
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'calendar-daylist-toggle';
          toggle.dataset.toggle = key;
          toggle.textContent = dayListExpanded.has(key) ? 'v' : '>';
          toggle.setAttribute('aria-label', 'Toggle children');
          nodeCell.appendChild(toggle);
        } else {
          const spacer = document.createElement('span');
          spacer.className = 'calendar-daylist-toggle-spacer';
          nodeCell.appendChild(spacer);
        }
        const label = document.createElement('div');
        label.className = 'calendar-daylist-node-label';
        const name = document.createElement('span');
        name.className = 'calendar-daylist-node-name';
        const labelText = expandText(node.text || 'Untitled block');
        name.textContent = labelText;
        const type = document.createElement('span');
        type.className = 'calendar-daylist-node-type';
        type.textContent = node.type || 'item';
        label.append(name, type);
        nodeCell.appendChild(label);

        row.append(time, nodeCell);
        fragment.appendChild(row);

        if (hasChildren && dayListExpanded.has(key)){
          walk(node.children, depth + 1, key);
        }
      });
    };
    walk(dayListTreeData, 0, 'root');
    dayListTreeEl.appendChild(fragment);
  }
  async function refreshDayList(force=false){
    if (!selectedDayDate) return;
    const today = dateAtMidnight(new Date());
    const target = dateAtMidnight(selectedDayDate);
    updateDayListTitle(selectedDayDate);
    if (target.getTime() !== today.getTime()){
      dayListTreeData = [];
      dayListExpanded = new Set();
      setDayListMessage('Only today\'s timeline is available right now. Select today to see live data.');
      renderDayListTree();
      return;
    }
    dayListLoading = true;
    setDayListMessage('');
    renderDayListTree();
    try {
      const blocks = await loadTodayBlocks(force);
      const normalized = normalizeDayListBlocks(blocks);
      dayListTreeData = buildTreeFromBlocks(normalized);
      const expandableKeys = new Set(collectExpandableKeys(dayListTreeData, 'root'));
      const rootExpandable = new Set(collectRootExpandableKeys(dayListTreeData, 'root'));
      if (!dayListExpandedInitialized) {
        dayListExpanded = new Set(rootExpandable);
        dayListExpandedInitialized = true;
      } else {
        dayListExpanded = new Set([...dayListExpanded].filter(key => expandableKeys.has(key)));
        rootExpandable.forEach(key => dayListExpanded.add(key));
      }
      if (!dayListTreeData.length){
        setDayListMessage('No routines scheduled yet. Try running "today reschedule" from the console.');
      }
    } catch (err) {
      console.error('[Chronos][Calendar] Failed to load day list', err);
      dayListTreeData = [];
      dayListExpanded = new Set();
      setDayListMessage('Unable to load today\'s schedule. Try again in a moment.', true);
    } finally {
      dayListLoading = false;
      renderDayListTree();
    }
  }
  function expandAllDayList(){
    dayListExpanded = new Set(collectExpandableKeys(dayListTreeData, 'root'));
    renderDayListTree();
  }
  function collapseAllDayList(){
    dayListExpanded = new Set();
    renderDayListTree();
  }
  try {
    window.__calendarExpandAll = expandAllDayList;
    window.__calendarCollapseAll = collapseAllDayList;
    window.__calendarRefreshDayList = () => refreshDayList(true);
  } catch {}
  function syncGlobals(extra = {}){
    try {
      window.__calendarViewMode = viewMode;
      window.__calendarSelectedMonth = selectedMonth;
      window.__calendarSelectedYear = selectedYear;
      window.__calendarSelectedDay = selectedDayDate ? new Date(selectedDayDate) : null;
      window.__calendarSelectedWeekStart = selectedWeekStart ? new Date(selectedWeekStart) : null;
      window.__calendarNavDepth = navDepth = navStack.length;
      Object.assign(window, extra);
    } catch {}
    try { window.__calendarUpdateTitle?.(); } catch {}
  }

  function snapshotState(){
    return {
      mode: viewMode,
      month: selectedMonth,
      year: selectedYear,
      weekStart: selectedWeekStart ? new Date(selectedWeekStart) : null,
      day: selectedDayDate ? new Date(selectedDayDate) : null
    };
  }
  function restoreState(s){
    if (!s) return;
    viewMode = s.mode;
    selectedMonth = s.month;
    selectedYear = s.year ?? selectedYear ?? (new Date()).getFullYear();
    selectedWeekStart = s.weekStart ? new Date(s.weekStart) : null;
    selectedDayDate = s.day ? new Date(s.day) : null;
    syncGlobals();
  }
  function pushState(){ navStack.push(snapshotState()); updateBackBtn(); }
  function popState(){ const v = navStack.pop(); updateBackBtn(); return v; }

  function getScaleFactor(){
    try {
      const root = document.getElementById('scaleRoot');
      if (!root) return 1;
      const tr = getComputedStyle(root).transform;
      if (!tr || tr === 'none') return 1;
      const m = tr.match(/matrix\(([^)]+)\)/);
      if (!m) return 1;
      const parts = m[1].split(',').map(v => parseFloat(v.trim()));
      const a = parts[0];
      const b = parts[1];
      const d = parts[3];
      const scaleX = Number.isFinite(a) ? Math.hypot(a, b || 0) : 1;
      const scaleY = Number.isFinite(d) ? Math.abs(d) : scaleX;
      return scaleX || scaleY || 1;
    } catch { return 1; }
  }

  function resizeCanvas(){
    const dpr=Math.max(1, window.devicePixelRatio||1);
    const rect=canvas.parentElement.getBoundingClientRect();
    const scale = getScaleFactor();
    const baseWidth = Math.max(1, rect.width / scale);
    const baseHeight = Math.max(1, rect.height / scale);
    const pad=14, headerH=36;
    const dayHeight = pad+headerH+pad + Math.floor(24*60*pxPerMinute) + pad;
    const totalH = (viewMode === 'day') ? Math.max(baseHeight, dayHeight) : baseHeight;
    canvas.style.width=baseWidth+'px';
    canvas.style.height= totalH+'px';
    canvas.width=Math.max(1, Math.floor(baseWidth*dpr));
    canvas.height=Math.max(1, Math.floor(totalH*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function drawYearGrid(){ setDayListVisible(false); const now=new Date(); const year=selectedYear||now.getFullYear(); const currentMonth=now.getMonth(); const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const w=canvas.clientWidth,h=canvas.clientHeight; ctx.clearRect(0,0,w,h); ctx.fillStyle='#0b0f16'; ctx.fillRect(0,0,w,h); const cols=4,rows=3,pad=14; const cellW=(w-pad*(cols+1))/cols; const cellH=(h-pad*(rows+1))/rows; ctx.save(); ctx.lineWidth=2; ctx.textBaseline='middle'; ctx.textAlign='center'; ctx.font='600 16px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'; monthRects=[]; for(let i=0;i<12;i++){ const r=Math.floor(i/cols), c=i%cols; const x=pad+c*(cellW+pad), y=pad+r*(cellH+pad); let fill; if(year<now.getFullYear()||(year===now.getFullYear()&&i<currentMonth)) fill=getCss('--danger','#ef6a6a'); else if(year===now.getFullYear()&&i===currentMonth) fill=getCss('--accent','#7aa2f7'); else fill=getCss('--ok','#5bdc82'); ctx.fillStyle=withAlpha(fill,0.18); roundRect(ctx,x,y,cellW,cellH,10); ctx.fill(); ctx.strokeStyle=withAlpha(fill,0.55); roundRect(ctx,x,y,cellW,cellH,10); ctx.stroke(); ctx.fillStyle='#e6e8ef'; ctx.fillText(`${months[i]}`, x+cellW/2, y+cellH/2); monthRects.push({i,x,y,w:cellW,h:cellH}); } ctx.restore(); viewMode='year'; syncGlobals(); notifyDayCleared(); }

  function drawMonthGrid(month=(new Date()).getMonth(), year=(new Date()).getFullYear()){ setDayListVisible(false); selectedMonth=month; selectedYear=year; const w=canvas.clientWidth,h=canvas.clientHeight; ctx.clearRect(0,0,w,h); const pad=14, headerH=36; const gridTop=pad+headerH+pad; const colW=(w-pad*8)/7; const rowH=(h-gridTop-pad*6)/6; ctx.save(); ctx.textBaseline='middle'; ctx.font='600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'; const monthsLong=['January','February','March','April','May','June','July','August','September','October','November','December']; const title=`${monthsLong[month]}`; ctx.fillStyle='#e6e8ef'; ctx.fillText(title, pad, pad+headerH/2); const dows=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; ctx.fillStyle='#a6adbb'; for(let i=0;i<7;i++){ ctx.fillText(dows[i], pad+i*(colW+pad)+colW/2, gridTop-10); } const first=new Date(year,month,1); const start=weekMonday(first); dayCellRects=[]; const today=dateAtMidnight(new Date()); for(let r=0;r<6;r++){ for(let c=0;c<7;c++){ const x=pad+c*(colW+pad); const y=gridTop+r*(rowH+pad); const d=new Date(start); d.setDate(start.getDate()+r*7+c); const inMonth=d.getMonth()===month; const dayColor=colorForDay(d,today); ctx.fillStyle=withAlpha(dayColor, inMonth?0.18:0.06); roundRect(ctx,x,y,colW,rowH,10); ctx.fill(); ctx.strokeStyle=withAlpha(dayColor, inMonth?0.45:0.2); roundRect(ctx,x,y,colW,rowH,10); ctx.stroke(); ctx.fillStyle=inMonth?'#e6e8ef':'#6b7382'; ctx.textAlign='right'; ctx.fillText(String(d.getDate()), x+colW-6, y+14); ctx.textAlign='left'; dayCellRects.push({ x,y,w:colW,h:rowH,date:dateAtMidnight(d) }); } } ctx.restore(); viewMode='month'; syncGlobals(); notifyDayCleared(); }

  function drawWeekGrid(weekStart=selectedWeekStart||weekMonday(new Date())){ setDayListVisible(false); selectedWeekStart=new Date(weekStart); const w=canvas.clientWidth,h=canvas.clientHeight; ctx.clearRect(0,0,w,h); const pad=14, headerH=36; const gridTop=pad+headerH+pad; const cols=7; const cellW=(w-pad*(cols+1))/cols; const cellH=h-gridTop-pad; ctx.save(); ctx.textBaseline='middle'; ctx.textAlign='left'; ctx.font='600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'; const monthsLong=['January','February','March','April','May','June','July','August','September','October','November','December']; const monday=weekMonday(weekStart); const title=`Week of ${monthsLong[monday.getMonth()]} ${monday.getDate()}`; ctx.fillStyle='#e6e8ef'; ctx.fillText(title, pad, pad+headerH/2); const dows=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; const today=dateAtMidnight(new Date()); dayRects=[]; for(let c=0;c<cols;c++){ const x=pad+c*(cellW+pad); const y=gridTop; const dayDate=new Date(monday); dayDate.setDate(monday.getDate()+c); const dayColor=colorForDay(dayDate,today); ctx.fillStyle=withAlpha(dayColor,0.18); roundRect(ctx,x,y,cellW,cellH,10); ctx.fill(); ctx.strokeStyle=withAlpha(dayColor,0.45); roundRect(ctx,x,y,cellW,cellH,10); ctx.stroke(); ctx.textAlign='center'; ctx.fillStyle='#a6adbb'; ctx.fillText(`${dows[c]} ${dayDate.getDate()}`, x+cellW/2, y+14); ctx.textAlign='left'; dayRects.push({ x,y,w:cellW,h:cellH,date:dateAtMidnight(dayDate) }); } ctx.restore(); viewMode='week'; syncGlobals(); notifyDayCleared(); }

  function drawDayGrid(day=dateAtMidnight(new Date()), previewDrag=false){
    selectedDayDate=new Date(day);
    selectedStartMin = null;
    selectedItem = null;
    notifyDaySelected(day);
    setDayListVisible(true);
    updateDayListTitle(selectedDayDate);
    refreshDayList();
    viewMode='day';
    syncGlobals();
  }


  function notifyDaySelected(day){
    try{
      const key = dayKey(day);
      if (key && key === lastDayKey) return;
      lastDayKey = key;
      context?.bus?.emit('calendar:day-selected', { date: new Date(day), key });
      context?.bus?.emit('widget:show', 'Today');
    } catch {}
  }
  function notifyDayCleared(){
    try{
      if (lastDayKey == null) return;
      lastDayKey = null;
      context?.bus?.emit('calendar:day-cleared');
      context?.bus?.emit('calendar:selected', null);
    } catch {}
  }

  function dayKey(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }

  function redrawCurrentView(){ try { if (window.dayBlocksStore) dayBlocksStore = window.dayBlocksStore; } catch {}
    try { pxPerMinute = (window.__calendarPxPerMin ?? pxPerMinute); } catch {}
    try { hierarchyLevel = (window.__calendarLevel ?? hierarchyLevel); } catch {}
    // Recompute canvas height for current zoom
    resizeCanvas();
    if(viewMode==='year') drawYearGrid(); else if(viewMode==='month') drawMonthGrid(selectedMonth ?? (new Date()).getMonth(), selectedYear); else if(viewMode==='week') drawWeekGrid(selectedWeekStart); else if(viewMode==='day') drawDayGrid(selectedDayDate);
  }
  try { window.redraw = redrawCurrentView; } catch {}

  function getPos(e){
    const rect = canvas.getBoundingClientRect();
    const scale = getScaleFactor() || 1;
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }

  function goToYear(){ selectedMonth=null; selectedWeekStart=null; selectedDayDate=null; drawYearGrid(); navStack.length = 0; updateBackBtn(); }
  function goToMonth(month, year){
    pushState();
    selectedMonth=month; selectedYear=year;
    drawMonthGrid(month, year);
    updateBackBtn();
  }
  function goToWeek(weekStart){
    pushState();
    selectedWeekStart=weekStart ? new Date(weekStart) : weekMonday(new Date());
    drawWeekGrid(selectedWeekStart);
    updateBackBtn();
  }
  function goToDay(day){
    pushState();
    selectedDayDate=day ? dateAtMidnight(day) : dateAtMidnight(new Date());
    drawDayGrid(selectedDayDate);
    updateBackBtn();
  }
  function goBack(){
    const prev = popState();
    if (!prev) return;
    // Restore prior snapshot state and redraw
    viewMode = prev.mode || viewMode;
    selectedMonth = prev.month ?? selectedMonth;
    selectedYear = prev.year ?? selectedYear;
    selectedWeekStart = prev.weekStart ?? selectedWeekStart;
    selectedDayDate = prev.day ?? selectedDayDate;
    if(viewMode==='year') drawYearGrid();
    else if(viewMode==='month') drawMonthGrid(selectedMonth ?? (new Date()).getMonth(), selectedYear ?? (new Date()).getFullYear());
    else if(viewMode==='week') drawWeekGrid(selectedWeekStart || weekMonday(selectedDayDate || new Date()));
    else if(viewMode==='day') drawDayGrid(selectedDayDate || new Date());
    updateBackBtn();
  }
  try {
    window.__calendarGoBack = goBack;
    window.__calendarCanGoBack = ()=> navStack.length > 0;
  } catch {}

  const backBtn = document.createElement('button');
  backBtn.className = 'pane-back';
  backBtn.textContent = 'Back';
  backBtn.title = 'Return to previous calendar level';
  backBtn.style.padding = '0 10px';
  backBtn.style.height = '28px';
  backBtn.style.background = 'linear-gradient(180deg, #24324a, #1a2436)';
  backBtn.style.border = '1px solid #2f3b56';
  backBtn.style.color = '#e6e8ef';
  backBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.04)';
  backBtn.style.borderRadius = '7px';
  backBtn.style.display = '';
  backBtn.style.zIndex = '13';
  backBtn.addEventListener('click', (e)=>{ e.stopPropagation(); goBack(); });
  const viewControls = document.createElement('div');
  viewControls.style.position = 'absolute';
  viewControls.style.top = '10px';
  viewControls.style.right = '10px';
  viewControls.style.display = 'flex';
  viewControls.style.gap = '8px';
  viewControls.style.alignItems = 'center';
  viewControls.style.zIndex = '13';

  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'btn calendar-daylist-refresh';
  refreshBtn.textContent = 'Refresh';
  refreshBtn.title = 'Refresh day list';

  const fxWrap = document.createElement('label');
  fxWrap.className = 'hint';
  fxWrap.style.display = 'flex';
  fxWrap.style.alignItems = 'center';
  fxWrap.style.gap = '6px';
  fxWrap.title = 'Expand variables in calendar labels';
  const fx = document.createElement('input');
  fx.type = 'checkbox';
  fx.id = 'calendarFxToggle';
  fx.checked = (window.__calendarFxExpand !== false);
  fxWrap.append(fx, document.createTextNode('fx'));
  fx.addEventListener('change', () => {
    window.__calendarFxExpand = fx.checked;
    renderDayListTree();
  });

  viewControls.append(backBtn, refreshBtn, fxWrap);
  el.appendChild(viewControls);
  dayListRefreshBtn = refreshBtn;
  function updateBackBtn(){
    const hasHistory = navStack.length > 0;
    backBtn.style.display = '';
    // Keep always clickable; just soften when empty
    backBtn.style.opacity = hasHistory ? '1' : '0.6';
    backBtn.style.pointerEvents = 'auto';
    backBtn.style.cursor = 'pointer';
    try { window.__calendarHasHistory = hasHistory; } catch {}
  }

  function handleViewClick(x,y, ev){
    if(viewMode==='year'){
      const hit=monthRects.find(r=> x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h); if(hit){ goToMonth(hit.i, selectedYear);} 
      return;
    }
    if(viewMode==='month'){
      const hitDay=dayCellRects.find(r=> x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h); if(hitDay){ goToDay(hitDay.date); return; }
      const hitW=weekRects.find(r=> x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h); if(hitW){ goToWeek(hitW.monday); }
      return;
    }
    if(viewMode==='week'){
      const hitD=dayRects.find(r=> x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h); if(hitD){ goToDay(hitD.date);} 
      return;
    }
    if(viewMode==='day'){
      return;
    }
  }

  function showGroupPicker(ev, items){
    try { document.getElementById('calendarGroupPicker')?.remove(); } catch {}
    const menu = document.createElement('div');
    menu.id = 'calendarGroupPicker';
    menu.style.position = 'fixed';
    const lx = (ev && ev.clientX) ? ev.clientX : (window.innerWidth/2);
    const ly = (ev && ev.clientY) ? ev.clientY : (window.innerHeight/2);
    menu.style.left = (lx + 6) + 'px';
    menu.style.top = (ly + 6) + 'px';
    menu.style.background = 'rgba(21,25,35,0.95)';
    menu.style.border = '1px solid #222835';
    menu.style.borderRadius = '8px';
    menu.style.padding = '6px 0';
    menu.style.boxShadow = '0 14px 40px rgba(0,0,0,0.35)';
    menu.style.zIndex = '10';
    items.forEach(it => {
      const row = document.createElement('div');
      row.textContent = String(it.text||'');
      row.style.padding = '6px 10px';
      row.style.cursor = 'pointer';
      row.style.color = '#e6e8ef';
      row.addEventListener('mouseenter', ()=> row.style.background = '#0f141d');
      row.addEventListener('mouseleave', ()=> row.style.background = 'transparent');
      row.addEventListener('click', ()=>{
        selectedItem = { text: String(it.text||''), type: String(it.type||''), start: it.start, end: it.end };
        try { if (context && context.bus) context.bus.emit('calendar:selected', selectedItem); } catch {}
        try { document.body.removeChild(menu); } catch {}
        redrawCurrentView();
      });
      menu.appendChild(row);
    });
    function onDoc(e){ if (!menu.contains(e.target)){ try{ document.body.removeChild(menu); document.removeEventListener('mousedown', onDoc); }catch{} } }
    document.addEventListener('mousedown', onDoc);
    document.body.appendChild(menu);
  }

  function handleViewPointerDown(e,x,y){ return false; }
  function handleViewPointerMove(e,x,y){ return; }
  function handleViewPointerUp(e){ return; }

  function onDayListClick(ev){
    const toggle = ev.target?.closest?.('[data-toggle]');
    if (toggle){
      const key = toggle.getAttribute('data-toggle');
      if (!key) return;
      if (dayListExpanded.has(key)) dayListExpanded.delete(key);
      else dayListExpanded.add(key);
      renderDayListTree();
      return;
    }
    const row = ev.target?.closest?.('.calendar-daylist-row');
    if (!row) return;
    const key = row.getAttribute('data-node-key');
    const node = getNodeByKey(key);
    if (!node) return;
    selectedStartMin = node.startMinutes;
    selectedItem = { text: String(node.text || ''), type: String(node.type || ''), start: node.startMinutes, end: node.endMinutes };
    try { context?.bus?.emit('calendar:selected', selectedItem); } catch {}
    renderDayListTree();
  }

  function onPointerDown(e){ const pt=getPos(e); if(handleViewPointerDown(e, pt.x, pt.y)) return; handleViewClick(pt.x, pt.y, e); }
  function onPointerMove(e){ const pt=getPos(e); handleViewPointerMove(e, pt.x, pt.y); }
  function onPointerUp(e){ handleViewPointerUp(e); }
  function onKeyDown(e){
    if(e.key==='Escape'){
      if (navStack.length){ goBack(); return; }
      if(viewMode==='day'){ viewMode='week'; drawWeekGrid(selectedWeekStart || weekMonday(selectedDayDate || new Date())); }
      else if(viewMode==='week'){ viewMode='month'; drawMonthGrid(selectedMonth ?? (new Date()).getMonth(), selectedYear); }
      else if(viewMode==='month'){ viewMode='year'; selectedMonth=null; selectedWeekStart=null; drawYearGrid(); }
      updateBackBtn();
    }
  }

  const debouncedResize = debounce(()=>{ resizeCanvas(); redrawCurrentView(); }, 120);

  // Init
  resizeCanvas();
  drawYearGrid();
  updateBackBtn();
  dayListTreeEl?.addEventListener('click', onDayListClick);
  dayListRefreshBtn?.addEventListener('click', () => refreshDayList(true));
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', debouncedResize);
  try { new ResizeObserver(()=>debouncedResize()).observe(document.getElementById('center')); } catch {}

  return {
    unmount(){
      try { context?.bus?.emit('calendar:close', { source: 'calendar' }); } catch {}
      try { context?.bus?.emit('calendar:day-cleared'); } catch {}
      dayListTreeEl?.removeEventListener('click', onDayListClick);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', debouncedResize);
      try { backBtn.remove(); } catch {}
      try { delete window.__calendarGoBack; delete window.__calendarCanGoBack; } catch {}
    }
  };
}

