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
      align-items: center;
    }
    .calendar-daylist-selection {
      font-size: 12px;
      color: var(--chronos-text-muted, #9aa4b7);
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.04);
      display: none;
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
    .calendar-daylist-row.is-primary {
      box-shadow: inset 0 0 0 1px rgba(122,162,247,0.55);
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
    .calendar-daylist-badge {
      margin-left: 8px;
      font-size: 11px;
      line-height: 1;
      padding: 2px 6px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.06);
      color: inherit;
    }
    .calendar-daylist-badge--anchor {
      border-color: rgba(244,198,66,0.55);
      color: #f4c642;
      background: rgba(244,198,66,0.12);
      width: 18px;
      height: 18px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
    }
    .calendar-daylist-badge--window {
      border-color: rgba(107,183,255,0.55);
      color: #6bb7ff;
      background: rgba(107,183,255,0.12);
      width: 18px;
      height: 18px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
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

import { Inspector } from './Inspector.js';

export function mount(el, context) {
  try { el.style.position = 'relative'; } catch { }
  injectDayListStyles();
  const INSPECTOR_WIDTH_KEY = 'calendar_inspector_width_v1';
  const DEFAULT_INSPECTOR_WIDTH = 620;
  const MIN_INSPECTOR_WIDTH = 360;
  const MIN_STAGE_WIDTH = 520;
  const SPLITTER_WIDTH = 8;

  // --- Split View Layout ---
  el.style.display = 'flex';
  el.style.height = '100%';
  el.style.overflow = 'hidden';

  // 1. Stage (Canvas + DayList)
  const stage = document.createElement('div');
  stage.className = 'calendar-stage';
  stage.style.position = 'relative';
  stage.style.flex = '0 0 auto';
  stage.style.height = '100%';
  stage.style.overflow = 'hidden'; // Canvas handles scrolling
  stage.style.minWidth = '0';

  // 2. Inspector Panel
  const inspectorPanel = document.createElement('div');
  inspectorPanel.className = 'calendar-inspector';
  inspectorPanel.style.width = `${DEFAULT_INSPECTOR_WIDTH}px`;
  inspectorPanel.style.flexShrink = '0';
  inspectorPanel.style.background = 'var(--chronos-surface-soft, rgba(15,17,21,0.5))';
  inspectorPanel.style.display = 'flex';
  inspectorPanel.style.flexDirection = 'column';

  const splitter = document.createElement('div');
  splitter.className = 'calendar-splitter';
  splitter.style.width = `${SPLITTER_WIDTH}px`;
  splitter.style.cursor = 'col-resize';
  splitter.style.flex = `0 0 ${SPLITTER_WIDTH}px`;
  splitter.style.position = 'relative';
  splitter.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))';
  splitter.style.borderLeft = '1px solid rgba(255,255,255,0.04)';
  splitter.style.borderRight = '1px solid rgba(255,255,255,0.08)';
  splitter.title = 'Drag to resize Inspector';

  el.appendChild(stage);
  el.appendChild(splitter);
  el.appendChild(inspectorPanel);

  function clampInspectorWidth(rawWidth) {
    const total = Math.max(0, el.clientWidth || 0);
    const maxByStage = Math.max(MIN_INSPECTOR_WIDTH, total - MIN_STAGE_WIDTH - SPLITTER_WIDTH);
    return Math.max(MIN_INSPECTOR_WIDTH, Math.min(maxByStage, Number(rawWidth) || DEFAULT_INSPECTOR_WIDTH));
  }

  function applyInspectorWidth(width, persist = true) {
    const next = clampInspectorWidth(width);
    const total = Math.max(0, el.clientWidth || 0);
    const stageWidth = Math.max(MIN_STAGE_WIDTH, total - next - SPLITTER_WIDTH);
    stage.style.width = `${Math.round(stageWidth)}px`;
    stage.style.flexBasis = `${Math.round(stageWidth)}px`;
    inspectorPanel.style.width = `${Math.round(next)}px`;
    inspectorPanel.style.flexBasis = `${Math.round(next)}px`;
    if (persist) {
      try { localStorage.setItem(INSPECTOR_WIDTH_KEY, String(Math.round(next))); } catch { }
    }
  }

  const persistedInspectorWidth = Number(localStorage.getItem(INSPECTOR_WIDTH_KEY));
  applyInspectorWidth(Number.isFinite(persistedInspectorWidth) ? persistedInspectorWidth : DEFAULT_INSPECTOR_WIDTH, false);

  let splitDrag = null;
  function onSplitterPointerDown(ev) {
    splitDrag = {
      startX: ev.clientX,
      startWidth: inspectorPanel.getBoundingClientRect().width,
    };
    try { document.body.style.cursor = 'col-resize'; } catch { }
    ev.preventDefault();
  }
  function onSplitterPointerMove(ev) {
    if (!splitDrag) return;
    const delta = splitDrag.startX - ev.clientX;
    applyInspectorWidth(splitDrag.startWidth + delta, false);
  }
  function onSplitterPointerUp() {
    if (!splitDrag) return;
    splitDrag = null;
    try { document.body.style.cursor = ''; } catch { }
    const current = Number(inspectorPanel.style.width.replace('px', ''));
    if (Number.isFinite(current)) applyInspectorWidth(current, true);
  }

  splitter.addEventListener('pointerdown', onSplitterPointerDown);
  window.addEventListener('pointermove', onSplitterPointerMove);
  window.addEventListener('pointerup', onSplitterPointerUp);

  // Initialize Inspector
  const inspector = Inspector();
  inspector.mount(inspectorPanel);

  // --- Canvas & DayList Setup (attached to stage) ---
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
  stage.appendChild(container); // Append to STAGE

  // --- Drag & Drop Dropzone ---
  function buildCliBody(command, args = [], properties = {}) {
    const propLines = Object.entries(properties || {})
      .map(([k, v]) => `  ${k}: ${String(v)}`).join('\n');
    return `command: ${command}\nargs:\n${(args || []).map(a => '  - ' + String(a)).join('\n')}\n${propLines ? 'properties:\n' + propLines + '\n' : ''}`;
  }

  async function runCli(command, args = [], properties = {}) {
    try {
      const resp = await fetch(apiBase() + '/api/cli', {
        method: 'POST',
        headers: { 'Content-Type': 'text/yaml' },
        body: buildCliBody(command, args, properties),
      });
      return { ok: resp.ok };
    } catch (err) {
      return { ok: false, error: String(err || 'Request failed') };
    }
  }

  async function maybeAutoReschedule() {
    const autoResched = (localStorage.getItem('calendar_auto_reschedule') || 'true') === 'true';
    if (!autoResched) return;
    try {
      await fetch(apiBase() + '/api/today/reschedule', { method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body: 'reschedule: true' });
    } catch { }
  }

  function resolveDropTimeFromRow(row) {
    if (!row) return null;
    const start = row.dataset?.nodeStart || '';
    return start || null;
  }

  function handleDrop(e) {
    e.preventDefault();
    try { context?.bus?.emit('toast:info', 'Day view is read-only. Use Inspector actions to modify schedule.'); } catch { }
  }

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'none';
  });
  container.addEventListener('drop', handleDrop);

  const dayList = document.createElement('div');
  dayList.className = 'calendar-daylist';
  dayList.innerHTML = `
    <div class="calendar-daylist-header">
      <div class="calendar-daylist-title">Day</div>
      <div class="calendar-daylist-actions">
        <span class="calendar-daylist-selection" id="calendarSelectionCount"></span>
      </div>
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
  let selectedKeys = new Set();
  let selectedItems = [];
  let lastSelectedKey = null;
  let dayListVisibleKeys = [];
  let selectionOrder = [];
  let lastDayKey = null;
  const navStack = [];
  let dayBlocksStore = load('pm_day_blocks', {});
  try { window.dayBlocksStore = dayBlocksStore; } catch { }
  try { context?.bus?.emit('calendar:open', { source: 'calendar' }); } catch { }
  // Default zoom: three "-" clicks from 1.00 => 0.25
  let pxPerMinute = (window.__calendarPxPerMin ?? 0.25); // pixels per minute (0.25 => ~360px total)
  // Ensure global zoom reflects the initial value so +/- controls use the same baseline
  try { if (window.__calendarPxPerMin == null) window.__calendarPxPerMin = pxPerMinute; } catch { }
  let hierarchyLevel = (window.__calendarLevel ?? 0); // 0=routines,1=subroutines,2=microroutines,3=items

  const dayListTitleEl = dayList.querySelector('.calendar-daylist-title');
  const dayListTreeEl = dayList.querySelector('.calendar-daylist-tree');
  const dayListMessageEl = dayList.querySelector('.calendar-daylist-message');
  const dayListSelectionEl = dayList.querySelector('#calendarSelectionCount');
  let dayListRefreshBtn = null;
  let dayListTreeData = [];
  let dayListExpanded = new Set();
  let dayListExpandedInitialized = false;
  let dayListLoading = false;

  // API helpers for /api/today
  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  function parseScheduleYaml(text) {
    try {
      if (typeof window !== 'undefined' && typeof window.parseYaml === 'function') {
        const parsed = window.parseYaml(text);
        if (parsed && Array.isArray(parsed.blocks) && parsed.blocks.length) {
          return parsed;
        }
      }
    } catch { }
    const result = { blocks: [] };
    if (!text) return result;
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    let inBlocks = false;
    let current = null;
    const pushCurrent = () => {
      if (current) {
        result.blocks.push(current);
        current = null;
      }
    };
    const applyLine = (line) => {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.+)$/);
      if (!match) {
        if (/^\s*-\s*$/.test(line.trim())) {
          pushCurrent();
          current = {};
        }
        return;
      }
      const key = match[1];
      const value = match[2].trim();
      const normalized = value === '' ? '' : value;
      if (inBlocks) {
        if (!current) current = {};
        current[key] = normalized;
      } else {
        result[key] = normalized;
      }
    };
    for (const rawLine of lines) {
      const line = rawLine.replace(/#.*$/, '');
      if (!line.trim()) continue;
      if (!inBlocks) {
        if (/^\s*blocks\s*:/i.test(line)) {
          inBlocks = true;
          continue;
        }
        applyLine(line);
        continue;
      }
      const dashMatch = line.match(/^\s*-\s*(.*)$/);
      if (dashMatch) {
        pushCurrent();
        current = {};
        const remainder = dashMatch[1];
        if (remainder) {
          const kv = remainder.match(/^([A-Za-z0-9_]+)\s*:\s*(.+)$/);
          if (kv) {
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
  function extractTimeParts(value) {
    if (!value) return { minutes: null };
    const match = String(value).match(/(\d{1,2}):(\d{2})/);
    if (!match) return { minutes: null };
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return { minutes: null };
    return { minutes: hours * 60 + minutes };
  }
  function normalizeScheduleBlocks(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((block, idx) => {
      const startParts = extractTimeParts(block.start ?? block.start_time);
      const endParts = extractTimeParts(block.end ?? block.end_time);
      const reschedule = String(block.reschedule || '');
      const anchored = /^true$/i.test(String(block.anchored || '')) || reschedule.trim().toLowerCase() === 'never';
      const blockId = String(block.block_id || '');
      const rawType = String(block.type || block.item_type || '').toLowerCase();
      const text = String(block.text || block.name || '');
      const isWindow = /^window::/i.test(blockId)
        || /^true$/i.test(String(block.window || ''))
        || rawType === 'window'
        || /\bwindow\b/i.test(text);
      return {
        start: startParts.minutes,
        end: endParts.minutes,
        text,
        type: rawType,
        depth: Number(block.depth ?? 0) || 0,
        is_parallel: /^true$/i.test(String(block.is_parallel || '')),
        anchored,
        reschedule,
        order: (block.order != null ? parseInt(block.order, 10) : 0),
        isWindow,
      };
    });
  }
  let todayBlocks = null; let todayLoadedAt = 0;
  const completionsCache = new Map(); // key: 'YYYY-MM-DD' -> Set(names)
  async function loadTodayBlocks(force = false) {
    if (!force && todayBlocks && (Date.now() - todayLoadedAt) < 3000) return todayBlocks;
    try {
      const resp = await fetch(apiBase() + "/api/today");
      const text = await resp.text();
      const parsed = parseScheduleYaml(text);
      todayBlocks = normalizeScheduleBlocks(parsed.blocks);
      todayLoadedAt = Date.now();
      try { window.__todayBlocks = todayBlocks; } catch { }
    } catch (e) { todayBlocks = []; }
    return todayBlocks;
  }
  try { window.calendarLoadToday = () => loadTodayBlocks(true); } catch { }
  async function loadCompletions(day) {
    try {
      const key = dayKey(day);
      if (completionsCache.has(key)) return completionsCache.get(key);
      const resp = await fetch(apiBase() + `/api/completions?date=${key}`);
      const text = await resp.text();
      // Parse minimal YAML: completed: [ - name ]
      const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
      let inList = false; const names = new Set();
      for (let raw of lines) {
        const line = raw.replace(/#.*$/, ''); if (!line.trim()) continue; if (!inList) { if (/^\s*completed\s*:/i.test(line)) inList = true; continue; }
        const m = line.match(/^\s*-\s*(.+)$/); if (m) names.add(m[1].trim());
      }
      completionsCache.set(key, names); return names;
    } catch { return new Set(); }
  }
  // (removed duplicate helpers)

  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { } }
  function load(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function expandText(s) { try { if (window.__calendarFxExpand === false) return String(s || ''); return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s || '')) : String(s || ''); } catch { return String(s || ''); } }
  function dateAtMidnight(d) { const n = new Date(d); n.setHours(0, 0, 0, 0); return n; }
  function weekMonday(d) { const n = dateAtMidnight(d); const off = (n.getDay() + 6) % 7; n.setDate(n.getDate() - off); return n; }
  function sameDay(a, b) { return dateAtMidnight(a).getTime() === dateAtMidnight(b).getTime(); }
  function getCss(varName, fallback) { const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); return v || fallback; }
  function withAlpha(color, a) { if (/^#([0-9a-f]{6})$/i.test(color)) { const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})`; } return color; }
  function _hexToRgb(hex) {
    const raw = String(hex || '').trim().replace('#', '');
    if (raw.length !== 6) return null;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    if ([r, g, b].some(n => Number.isNaN(n))) return null;
    return { r, g, b };
  }
  function _lerp(a, b, t) { return a + (b - a) * t; }
  function _lerpColor(aHex, bHex, t) {
    const a = _hexToRgb(aHex); const b = _hexToRgb(bHex);
    if (!a || !b) return aHex;
    const r = Math.round(_lerp(a.r, b.r, t));
    const g = Math.round(_lerp(a.g, b.g, t));
    const bch = Math.round(_lerp(a.b, b.b, t));
    return `rgb(${r},${g},${bch})`;
  }
  function heatmapColor(score) {
    const v = Math.max(0, Math.min(1, Number(score) || 0));
    const stops = [
      { t: 0.0, color: '#ffffff' },
      { t: 0.35, color: '#5aa0ff' },
      { t: 0.5, color: '#ffffff' },
      { t: 0.65, color: '#ffe066' },
      { t: 0.8, color: '#ff9f43' },
      { t: 1.0, color: '#ff4d4f' },
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (v >= a.t && v <= b.t) {
        const local = (v - a.t) / Math.max(0.0001, (b.t - a.t));
        return _lerpColor(a.color, b.color, local);
      }
    }
    return stops[stops.length - 1].color;
  }
  function roundRect(ctx, x, y, w, h, r) {
    const ww = Number(w);
    const hh = Number(h);
    if (!Number.isFinite(ww) || !Number.isFinite(hh) || ww <= 0 || hh <= 0) return;
    const rr = Math.max(0, Math.min(Number(r) || 0, ww / 2, hh / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, rr);
    ctx.arcTo(x + ww, y + hh, x, y + hh, rr);
    ctx.arcTo(x, y + hh, x, y, rr);
    ctx.arcTo(x, y, x + ww, y, rr);
    ctx.closePath();
  }
  function colorForDay(dayDate, today) { if (dayDate < today) return getCss('--danger', '#ef6a6a'); if (sameDay(dayDate, today)) return getCss('--accent', '#7aa2f7'); return getCss('--ok', '#5bdc82'); }
  function minToHM(min) { const h = Math.floor(min / 60) % 24; const m = min % 60; return String(h).padStart(2, '0') + ":" + String(m).padStart(2, '0'); }
  function formatDayTitle(day) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[day.getMonth()]} ${day.getDate()}, ${day.getFullYear()}`;
  }
  function setDayListVisible(visible) {
    dayList.style.display = visible ? 'flex' : 'none';
    canvas.style.display = visible ? 'none' : 'block';
  }
  function setDayListMessage(text, isError = false) {
    if (!dayListMessageEl) return;
    dayListMessageEl.textContent = text || '';
    dayListMessageEl.classList.toggle('error', !!isError);
  }
  function buildTreeFromBlocks(blocks) {
    const root = [];
    const stack = [];
    blocks.forEach(block => {
      const node = { ...block, children: [] };
      while (stack.length > block.depth) {
        stack.pop();
      }
      if (stack.length === 0) {
        root.push(node);
      } else {
        stack[stack.length - 1].children.push(node);
      }
      stack[block.depth] = node;
    });
    return root;
  }
  function classifyRelativeTime(node, dayDate) {
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
  function updateDayListTitle(dayDate) {
    if (dayListTitleEl) dayListTitleEl.textContent = formatDayTitle(dayDate);
  }
  function typeIcon(typeRaw) {
    const t = String(typeRaw || '').trim().toLowerCase();
    if (t === 'task') return '✓';
    if (t === 'habit' || t === 'chore') return '↻';
    return '';
  }
  function normalizeDayListBlocks(blocks) {
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
        anchored: !!block.anchored,
        reschedule: String(block.reschedule || ''),
        isWindow: !!block.isWindow,
      };
    });
  }
  function collectExpandableKeys(nodes, prefix) {
    const keys = [];
    nodes.forEach((node, idx) => {
      const key = `${prefix}.${idx}`;
      if (node.children && node.children.length) {
        keys.push(key);
        keys.push(...collectExpandableKeys(node.children, key));
      }
    });
    return keys;
  }
  function collectRootExpandableKeys(nodes, prefix) {
    const keys = [];
    nodes.forEach((node, idx) => {
      if (node.children && node.children.length) {
        keys.push(`${prefix}.${idx}`);
      }
    });
    return keys;
  }
  function getNodeByKey(key) {
    if (!key) return null;
    const parts = key.split('.').slice(1);
    let nodes = dayListTreeData;
    let node = null;
    for (const part of parts) {
      const idx = Number(part);
      if (!Number.isFinite(idx) || !nodes || !nodes[idx]) return null;
      node = nodes[idx];
      nodes = node.children || [];
    }
    return node;
  }
  function renderDayListTree() {
    if (!dayListTreeEl) return;
    dayListTreeEl.innerHTML = '';
    if (!dayListTreeData.length) {
      const empty = document.createElement('div');
      empty.className = 'calendar-daylist-empty';
      empty.textContent = dayListLoading ? 'Loading schedule...' : 'No scheduled routines for this day.';
      dayListTreeEl.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    dayListVisibleKeys = [];
    const walk = (nodes, depth, prefix) => {
      nodes.forEach((node, idx) => {
        const key = `${prefix}.${idx}`;
        dayListVisibleKeys.push(key);
        const row = document.createElement('div');
        row.className = 'calendar-daylist-row';
        row.setAttribute('role', 'treeitem');
        row.setAttribute('aria-level', String(depth + 1));
        row.dataset.nodeKey = key;
        row.dataset.nodeIndex = String(idx);
        row.dataset.nodeName = String(node.text || '');
        row.dataset.nodeType = String(node.type || '');
        row.dataset.nodeStart = String(node.start || '');
        row.dataset.nodeEnd = String(node.end || '');

        if (selectedKeys.has(key)) {
          row.classList.add('is-selected');
        }
        if (lastSelectedKey === key) {
          row.classList.add('is-primary');
        }
        row.classList.toggle('is-anchored', !!node.anchored);

        const time = document.createElement('div');
        time.className = 'calendar-daylist-time';
        time.textContent = node.start && node.end ? `${node.start} - ${node.end}` : (node.start || '');
        const relativeState = classifyRelativeTime(node, selectedDayDate || new Date());
        if (relativeState) {
          time.classList.add(`calendar-daylist-time--${relativeState}`);
        }
        if (node.anchored) {
          const anchorBadge = document.createElement('span');
          anchorBadge.className = 'calendar-daylist-badge calendar-daylist-badge--anchor';
          anchorBadge.textContent = '⚓';
          anchorBadge.title = 'Anchored';
          anchorBadge.setAttribute('aria-label', 'Anchored');
          time.appendChild(anchorBadge);
        }
        if (node.isWindow) {
          const windowBadge = document.createElement('span');
          windowBadge.className = 'calendar-daylist-badge calendar-daylist-badge--window';
          windowBadge.textContent = '🪟';
          windowBadge.title = 'Window';
          windowBadge.setAttribute('aria-label', 'Window');
          time.appendChild(windowBadge);
        }
        if (selectedKeys.has(key)) {
          const badge = document.createElement('span');
          badge.className = 'calendar-daylist-badge';
          const orderIndex = selectionOrder.indexOf(key);
          badge.textContent = orderIndex >= 0 ? String(orderIndex + 1) : '•';
          time.appendChild(badge);
        }

        const nodeCell = document.createElement('div');
        nodeCell.className = 'calendar-daylist-node';
        nodeCell.style.paddingLeft = `${depth * 16}px`;
        const hasChildren = node.children && node.children.length;
        if (hasChildren) {
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
        const icon = typeIcon(node.type);
        type.textContent = icon ? `${icon} ${node.type || 'item'}` : (node.type || 'item');
        label.append(name, type);
        nodeCell.appendChild(label);

        row.draggable = false;

        row.append(time, nodeCell);
        fragment.appendChild(row);

        if (hasChildren && dayListExpanded.has(key)) {
          walk(node.children, depth + 1, key);
        }
      });
    };
    walk(dayListTreeData, 0, 'root');
    dayListTreeEl.appendChild(fragment);
    updateSelectionCount();
  }

  function updateSelectionCount() {
    if (!dayListSelectionEl) return;
    const count = selectedKeys.size;
    if (!count) {
      dayListSelectionEl.textContent = '';
      dayListSelectionEl.style.display = 'none';
      return;
    }
    dayListSelectionEl.textContent = `Selected: ${count}`;
    dayListSelectionEl.style.display = 'inline-flex';
  }
  async function refreshDayList(force = false) {
    if (!selectedDayDate) return;
    const today = dateAtMidnight(new Date());
    const target = dateAtMidnight(selectedDayDate);
    updateDayListTitle(selectedDayDate);
    if (target.getTime() !== today.getTime()) {
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
      if (!dayListTreeData.length) {
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
  function expandAllDayList() {
    dayListExpanded = new Set(collectExpandableKeys(dayListTreeData, 'root'));
    renderDayListTree();
  }
  function collapseAllDayList() {
    dayListExpanded = new Set();
    renderDayListTree();
  }
  try {
    window.__calendarExpandAll = expandAllDayList;
    window.__calendarCollapseAll = collapseAllDayList;
    window.__calendarRefreshDayList = () => refreshDayList(true);
  } catch { }
  // Main syncGlobals handles inspector updates now.


  function syncGlobals(extra = {}) {
    try {
      window.__calendarViewMode = viewMode;
      window.__calendarSelectedMonth = selectedMonth;
      window.__calendarSelectedYear = selectedYear;
      window.__calendarSelectedDay = selectedDayDate ? new Date(selectedDayDate) : null;
      window.__calendarSelectedWeekStart = selectedWeekStart ? new Date(selectedWeekStart) : null;
      window.__calendarNavDepth = navDepth = navStack.length;
      Object.assign(window, extra);
    } catch { }
    try { window.__calendarUpdateTitle?.(); } catch { }

    // --- Inspector Update ---
    try {
      let scope = 'none';
      let data = {};
      if (viewMode === 'year') {
        scope = 'year';
        data = { year: selectedYear };
      } else if (viewMode === 'month') {
        scope = 'month';
        data = { label: new Date(selectedYear, selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' }) };
      } else if (viewMode === 'week') {
        scope = 'week';
        data = {};
      } else if (viewMode === 'day') {
        scope = 'day';
        const key = selectedDayDate ? dayKey(selectedDayDate) : null;
        data = {
          dateString: selectedDayDate ? new Date(selectedDayDate).toLocaleDateString() : 'Today',
          dateKey: key,
          dateISO: selectedDayDate ? selectedDayDate.toISOString().slice(0, 10) : null,
        };
      }
      inspector.update(scope, data);
    } catch (err) { console.error(err); }
  }


  function snapshotState() {
    return {
      mode: viewMode,
      month: selectedMonth,
      year: selectedYear,
      weekStart: selectedWeekStart ? new Date(selectedWeekStart) : null,
      day: selectedDayDate ? new Date(selectedDayDate) : null
    };
  }
  function restoreState(s) {
    if (!s) return;
    viewMode = s.mode;
    selectedMonth = s.month;
    selectedYear = s.year ?? selectedYear ?? (new Date()).getFullYear();
    selectedWeekStart = s.weekStart ? new Date(s.weekStart) : null;
    selectedDayDate = s.day ? new Date(s.day) : null;
    syncGlobals();
  }
  function pushState() { navStack.push(snapshotState()); updateBackBtn(); }
  function popState() { const v = navStack.pop(); updateBackBtn(); return v; }

  function getScaleFactor() {
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

  function resizeCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.parentElement.getBoundingClientRect();
    const scale = getScaleFactor();
    const baseWidth = Math.max(1, rect.width / scale);
    const baseHeight = Math.max(1, rect.height / scale);
    const pad = 14, headerH = 36;
    const dayHeight = pad + headerH + pad + Math.floor(24 * 60 * pxPerMinute) + pad;
    const totalH = (viewMode === 'day') ? Math.max(baseHeight, dayHeight) : baseHeight;
    canvas.style.width = baseWidth + 'px';
    canvas.style.height = totalH + 'px';
    canvas.width = Math.max(1, Math.floor(baseWidth * dpr));
    canvas.height = Math.max(1, Math.floor(totalH * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  let overlayMode = null;
  let overlayData = {}; // { 'YYYY-MM-DD': score 0..1 }

  try {
    window.__calendarSetOverlay = (mode, data) => {
      overlayMode = mode;
      overlayData = data || {};
      if (viewMode === 'month') drawMonthGrid(selectedMonth, selectedYear);
      // Also support year
      if (viewMode === 'year') drawYearGrid();
    };
  } catch { }

  function drawYearGrid() {
    setDayListVisible(false);
    const now = new Date();
    const year = selectedYear || now.getFullYear();
    const currentMonth = now.getMonth();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b0f16';
    ctx.fillRect(0, 0, w, h);
    const cols = 4, rows = 3, pad = 14;
    const cellW = Math.max(1, (w - pad * (cols + 1)) / cols);
    const cellH = Math.max(1, (h - pad * (rows + 1)) / rows);
    ctx.save();
    ctx.lineWidth = 2;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = '600 16px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    monthRects = [];
    for (let i = 0; i < 12; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const x = pad + c * (cellW + pad), y = pad + r * (cellH + pad);
      let fill;
      if (year < now.getFullYear() || (year === now.getFullYear() && i < currentMonth)) fill = getCss('--danger', '#ef6a6a');
      else if (year === now.getFullYear() && i === currentMonth) fill = getCss('--accent', '#7aa2f7');
      else fill = getCss('--ok', '#5bdc82');
      ctx.fillStyle = withAlpha(fill, 0.18);
      roundRect(ctx, x, y, cellW, cellH, 10);
      ctx.fill();
      ctx.strokeStyle = withAlpha(fill, 0.55);
      roundRect(ctx, x, y, cellW, cellH, 10);
      ctx.stroke();
      ctx.fillStyle = '#e6e8ef';
      ctx.fillText(`${months[i]}`, x + cellW / 2, y + cellH / 2);
      monthRects.push({ i, x, y, w: cellW, h: cellH });
    }
    ctx.restore();
    viewMode = 'year';
    syncGlobals();
    notifyDayCleared();
  }

  function drawMonthGrid(month = (new Date()).getMonth(), year = (new Date()).getFullYear()) {
    setDayListVisible(false);
    selectedMonth = month;
    selectedYear = year;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const pad = 14, headerH = 36;
    const gridTop = pad + headerH + pad;
    const colW = Math.max(1, (w - pad * 8) / 7);
    const rowH = Math.max(1, (h - gridTop - pad * 6) / 6);
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = '600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    const monthsLong = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const title = `${monthsLong[month]}`;
    ctx.fillStyle = '#e6e8ef';
    ctx.fillText(title, pad, pad + headerH / 2);
    const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    ctx.fillStyle = '#a6adbb';
    for (let i = 0; i < 7; i++) {
      ctx.fillText(dows[i], pad + i * (colW + pad) + colW / 2, gridTop - 10);
    }
    const first = new Date(year, month, 1);
    const start = weekMonday(first);
    dayCellRects = [];
    const today = dateAtMidnight(new Date());
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 7; c++) {
        const x = pad + c * (colW + pad);
        const y = gridTop + r * (rowH + pad);
        const d = new Date(start);
        d.setDate(start.getDate() + r * 7 + c);
        const inMonth = d.getMonth() === month;

        const dateKey = d.toISOString().split('T')[0];
        const score = overlayMode ? (overlayData[dateKey] || 0) : null;

        let dayColor = colorForDay(d, today);
        let alpha = inMonth ? 0.18 : 0.06;
        let strokeAlpha = inMonth ? 0.45 : 0.2;

        if (score !== null) {
          // Heatmap Mode: white -> blue -> white -> yellow -> orange -> red
          dayColor = heatmapColor(score);
          alpha = 1.0;
          strokeAlpha = 0.35 + (score * 0.55);
        }

        ctx.fillStyle = withAlpha(dayColor, alpha);
        roundRect(ctx, x, y, colW, rowH, 10);
        ctx.fill();
        ctx.strokeStyle = withAlpha(dayColor, strokeAlpha);
        roundRect(ctx, x, y, colW, rowH, 10);
        ctx.stroke();
        ctx.fillStyle = inMonth ? '#e6e8ef' : '#6b7382';
        ctx.textAlign = 'right';
        ctx.fillText(String(d.getDate()), x + colW - 6, y + 14);
        ctx.textAlign = 'left';

        // Draw score indicator if relevant?
        if (score !== null && score > 0.1) {
          const barH = 4;
          ctx.fillStyle = withAlpha(dayColor, 0.9);
          ctx.fillRect(x + 10, y + rowH - 10, (colW - 20) * score, barH);
        }

        dayCellRects.push({ x, y, w: colW, h: rowH, date: dateAtMidnight(d) });
      }
    }
    ctx.restore();
    viewMode = 'month';
    syncGlobals();
    notifyDayCleared();
  }

  function drawWeekGrid(weekStart = selectedWeekStart || weekMonday(new Date())) { setDayListVisible(false); selectedWeekStart = new Date(weekStart); const w = canvas.clientWidth, h = canvas.clientHeight; ctx.clearRect(0, 0, w, h); const pad = 14, headerH = 36; const gridTop = pad + headerH + pad; const cols = 7; const cellW = Math.max(1, (w - pad * (cols + 1)) / cols); const cellH = Math.max(1, h - gridTop - pad); ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = '600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'; const monthsLong = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']; const monday = weekMonday(weekStart); const title = `Week of ${monthsLong[monday.getMonth()]} ${monday.getDate()}`; ctx.fillStyle = '#e6e8ef'; ctx.fillText(title, pad, pad + headerH / 2); const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; const today = dateAtMidnight(new Date()); dayRects = []; for (let c = 0; c < cols; c++) { const x = pad + c * (cellW + pad); const y = gridTop; const dayDate = new Date(monday); dayDate.setDate(monday.getDate() + c); const dayColor = colorForDay(dayDate, today); ctx.fillStyle = withAlpha(dayColor, 0.18); roundRect(ctx, x, y, cellW, cellH, 10); ctx.fill(); ctx.strokeStyle = withAlpha(dayColor, 0.45); roundRect(ctx, x, y, cellW, cellH, 10); ctx.stroke(); ctx.textAlign = 'center'; ctx.fillStyle = '#a6adbb'; ctx.fillText(`${dows[c]} ${dayDate.getDate()}`, x + cellW / 2, y + 14); ctx.textAlign = 'left'; dayRects.push({ x, y, w: cellW, h: cellH, date: dateAtMidnight(dayDate) }); } ctx.restore(); viewMode = 'week'; syncGlobals(); notifyDayCleared(); }

  function drawDayGrid(day = dateAtMidnight(new Date()), previewDrag = false) {
    selectedDayDate = new Date(day);
    selectedStartMin = null;
    selectedItem = null;
    notifyDaySelected(day);
    setDayListVisible(true);
    updateDayListTitle(selectedDayDate);
    refreshDayList();
    viewMode = 'day';
    syncGlobals();
  }


  function notifyDaySelected(day) {
    try {
      const key = dayKey(day);
      if (key && key === lastDayKey) return;
      lastDayKey = key;
      context?.bus?.emit('calendar:day-selected', { date: new Date(day), key });
      context?.bus?.emit('widget:show', 'Today');
    } catch { }
  }
  function notifyDayCleared() {
    try {
      if (lastDayKey == null) return;
      lastDayKey = null;
      context?.bus?.emit('calendar:day-cleared');
      context?.bus?.emit('calendar:selected', null);
    } catch { }
  }

  function dayKey(d) { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${dd}`; }

  function redrawCurrentView() {
    try { if (window.dayBlocksStore) dayBlocksStore = window.dayBlocksStore; } catch { }
    try { pxPerMinute = (window.__calendarPxPerMin ?? pxPerMinute); } catch { }
    try { hierarchyLevel = (window.__calendarLevel ?? hierarchyLevel); } catch { }
    // Recompute canvas height for current zoom
    resizeCanvas();
    if (viewMode === 'year') drawYearGrid(); else if (viewMode === 'month') drawMonthGrid(selectedMonth ?? (new Date()).getMonth(), selectedYear); else if (viewMode === 'week') drawWeekGrid(selectedWeekStart); else if (viewMode === 'day') drawDayGrid(selectedDayDate);
  }
  try { window.redraw = redrawCurrentView; } catch { }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scale = getScaleFactor() || 1;
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }

  function goToYear() { selectedMonth = null; selectedWeekStart = null; selectedDayDate = null; drawYearGrid(); navStack.length = 0; updateBackBtn(); }
  function goToMonth(month, year) {
    pushState();
    selectedMonth = month; selectedYear = year;
    drawMonthGrid(month, year);
    updateBackBtn();
  }
  function goToWeek(weekStart) {
    pushState();
    selectedWeekStart = weekStart ? new Date(weekStart) : weekMonday(new Date());
    drawWeekGrid(selectedWeekStart);
    updateBackBtn();
  }
  function goToDay(day) {
    pushState();
    selectedDayDate = day ? dateAtMidnight(day) : dateAtMidnight(new Date());
    drawDayGrid(selectedDayDate);
    updateBackBtn();
  }
  function goBack() {
    const prev = popState();
    if (!prev) return;
    // Restore prior snapshot state and redraw
    viewMode = prev.mode || viewMode;
    selectedMonth = prev.month ?? selectedMonth;
    selectedYear = prev.year ?? selectedYear;
    selectedWeekStart = prev.weekStart ?? selectedWeekStart;
    selectedDayDate = prev.day ?? selectedDayDate;
    if (viewMode === 'year') drawYearGrid();
    else if (viewMode === 'month') drawMonthGrid(selectedMonth ?? (new Date()).getMonth(), selectedYear ?? (new Date()).getFullYear());
    else if (viewMode === 'week') drawWeekGrid(selectedWeekStart || weekMonday(selectedDayDate || new Date()));
    else if (viewMode === 'day') drawDayGrid(selectedDayDate || new Date());
    updateBackBtn();
  }
  try {
    window.__calendarGoBack = goBack;
    window.__calendarCanGoBack = () => navStack.length > 0;
  } catch { }

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
  backBtn.addEventListener('click', (e) => { e.stopPropagation(); goBack(); });
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
  function updateBackBtn() {
    const hasHistory = navStack.length > 0;
    backBtn.style.display = '';
    // Keep always clickable; just soften when empty
    backBtn.style.opacity = hasHistory ? '1' : '0.6';
    backBtn.style.pointerEvents = 'auto';
    backBtn.style.cursor = 'pointer';
    try { window.__calendarHasHistory = hasHistory; } catch { }
  }

  function handleViewClick(x, y, ev) {
    if (viewMode === 'year') {
      const hit = monthRects.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h); if (hit) { goToMonth(hit.i, selectedYear); }
      return;
    }
    if (viewMode === 'month') {
      const hitDay = dayCellRects.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h); if (hitDay) { goToDay(hitDay.date); return; }
      const hitW = weekRects.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h); if (hitW) { goToWeek(hitW.monday); }
      return;
    }
    if (viewMode === 'week') {
      const hitD = dayRects.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h); if (hitD) { goToDay(hitD.date); }
      return;
    }
    if (viewMode === 'day') {
      return;
    }
  }

  function showGroupPicker(ev, items) {
    try { document.getElementById('calendarGroupPicker')?.remove(); } catch { }
    const menu = document.createElement('div');
    menu.id = 'calendarGroupPicker';
    menu.style.position = 'fixed';
    const lx = (ev && ev.clientX) ? ev.clientX : (window.innerWidth / 2);
    const ly = (ev && ev.clientY) ? ev.clientY : (window.innerHeight / 2);
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
      row.textContent = String(it.text || '');
      row.style.padding = '6px 10px';
      row.style.cursor = 'pointer';
      row.style.color = '#e6e8ef';
      row.addEventListener('mouseenter', () => row.style.background = '#0f141d');
      row.addEventListener('mouseleave', () => row.style.background = 'transparent');
      row.addEventListener('click', () => {
        selectedItem = { text: String(it.text || ''), type: String(it.type || ''), start: it.start, end: it.end };
        try { if (context && context.bus) context.bus.emit('calendar:selected', selectedItem); } catch { }
        try { document.body.removeChild(menu); } catch { }
        redrawCurrentView();
      });
      menu.appendChild(row);
    });
    function onDoc(e) { if (!menu.contains(e.target)) { try { document.body.removeChild(menu); document.removeEventListener('mousedown', onDoc); } catch { } } }
    document.addEventListener('mousedown', onDoc);
    document.body.appendChild(menu);
  }

  function handleViewPointerDown(e, x, y) { return false; }
  function handleViewPointerMove(e, x, y) { return; }
  function handleViewPointerUp(e) { return; }

  function onDayListClick(ev) {
    const toggle = ev.target?.closest?.('[data-toggle]');
    if (toggle) {
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
    const isShift = !!ev.shiftKey;
    const isToggle = !!(ev.ctrlKey || ev.metaKey);
    const isAlreadySelected = selectedKeys.has(key);
    const isSingleSelected = selectedKeys.size === 1;

    // Toggle off when re-clicking the currently selected item with no modifiers.
    if (!isShift && !isToggle && isAlreadySelected && isSingleSelected) {
      clearDayListSelection();
      return;
    }

    if (isShift && lastSelectedKey && dayListVisibleKeys.length) {
      const a = dayListVisibleKeys.indexOf(lastSelectedKey);
      const b = dayListVisibleKeys.indexOf(key);
      if (a !== -1 && b !== -1) {
        const start = Math.min(a, b);
        const end = Math.max(a, b);
        const range = dayListVisibleKeys.slice(start, end + 1);
        if (isToggle) {
          range.forEach(k => selectedKeys.add(k));
        } else {
          selectedKeys = new Set(range);
        }
        selectionOrder = range.slice();
      }
    } else if (isToggle) {
      if (selectedKeys.has(key)) selectedKeys.delete(key);
      else selectedKeys.add(key);
      if (selectedKeys.has(key)) {
        selectionOrder = selectionOrder.filter(k => k !== key);
        selectionOrder.push(key);
      } else {
        selectionOrder = selectionOrder.filter(k => k !== key);
      }
    } else {
      selectedKeys = new Set([key]);
      selectionOrder = [key];
    }

    lastSelectedKey = key;
    selectedStartMin = node.startMinutes;
    selectedItem = { text: String(node.text || ''), type: String(node.type || ''), start: node.start, end: node.end, anchored: !!node.anchored, id: node.text };
    selectedItems = Array.from(selectedKeys).map(k => getNodeByKey(k)).filter(Boolean).map(n => ({
      text: String(n.text || ''),
      type: String(n.type || ''),
      start: n.start,
      end: n.end,
      anchored: !!n.anchored,
      id: n.text,
    }));

    try { context?.bus?.emit('calendar:selected', selectedItem); } catch { }
    inspector.update('item', { item: selectedItem, items: selectedItems });
    renderDayListTree();
  }

  function getDayListRowFromEvent(ev) {
    const row = ev.target?.closest?.('.calendar-daylist-row');
    if (row) return row;
    try {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      return el?.closest?.('.calendar-daylist-row') || null;
    } catch {
      return null;
    }
  }

  async function handleDayListDrop(ev) {
    ev.preventDefault();
    try { context?.bus?.emit('toast:info', 'Day view is read-only. Use Inspector actions to modify schedule.'); } catch { }
  }

  function handleDayListDragOver(ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'none';
  }

  function clearDayListSelection() {
    selectedKeys = new Set();
    selectedItems = [];
    selectedItem = null;
    selectedStartMin = null;
    lastSelectedKey = null;
    selectionOrder = [];
    try { context?.bus?.emit('calendar:selected', null); } catch { }
    try { syncGlobals(); } catch { }
    renderDayListTree();
  }

  function onPointerDown(e) { const pt = getPos(e); if (handleViewPointerDown(e, pt.x, pt.y)) return; handleViewClick(pt.x, pt.y, e); }
  function onPointerMove(e) { const pt = getPos(e); handleViewPointerMove(e, pt.x, pt.y); }
  function onPointerUp(e) { handleViewPointerUp(e); }
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (selectedKeys.size) {
        clearDayListSelection();
        return;
      }
      if (navStack.length) { goBack(); return; }
      if (viewMode === 'day') { viewMode = 'week'; drawWeekGrid(selectedWeekStart || weekMonday(selectedDayDate || new Date())); }
      else if (viewMode === 'week') { viewMode = 'month'; drawMonthGrid(selectedMonth ?? (new Date()).getMonth(), selectedYear); }
      else if (viewMode === 'month') { viewMode = 'year'; selectedMonth = null; selectedWeekStart = null; drawYearGrid(); }
      updateBackBtn();
    }
    if (e.key === 'm' || e.key === 'M') {
      if (selectedItems.length > 1) {
        try { window.__calendarMergeSelected?.(selectedItems); } catch { }
      }
    }
  }

  const debouncedResize = debounce(() => {
    const current = Number(inspectorPanel.style.width.replace('px', '')) || DEFAULT_INSPECTOR_WIDTH;
    applyInspectorWidth(current, false);
    resizeCanvas();
    redrawCurrentView();
  }, 120);

  // Init
  resizeCanvas();
  drawYearGrid();
  updateBackBtn();
  dayListTreeEl?.addEventListener('click', onDayListClick);
  dayListTreeEl?.addEventListener('dragover', handleDayListDragOver);
  dayListTreeEl?.addEventListener('drop', handleDayListDrop);
  dayListRefreshBtn?.addEventListener('click', () => refreshDayList(true));
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', debouncedResize);
  try { new ResizeObserver(() => debouncedResize()).observe(document.getElementById('center')); } catch { }
  try { window.__calendarClearSelection = clearDayListSelection; } catch { }

  return {
    unmount() {
      try { context?.bus?.emit('calendar:close', { source: 'calendar' }); } catch { }
      try { context?.bus?.emit('calendar:day-cleared'); } catch { }
      dayListTreeEl?.removeEventListener('click', onDayListClick);
      dayListTreeEl?.removeEventListener('dragover', handleDayListDragOver);
      dayListTreeEl?.removeEventListener('drop', handleDayListDrop);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', debouncedResize);
      splitter.removeEventListener('pointerdown', onSplitterPointerDown);
      window.removeEventListener('pointermove', onSplitterPointerMove);
      window.removeEventListener('pointerup', onSplitterPointerUp);
      try { document.body.style.cursor = ''; } catch { }
      try { backBtn.remove(); } catch { }
      try { delete window.__calendarGoBack; delete window.__calendarCanGoBack; } catch { }
    }
  };
}
