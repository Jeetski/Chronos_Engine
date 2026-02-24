
const OVERLAY_TAG = 'chronos-life-setup';
let stylesInjected = false;
let contextRef = null;

const DAY_LIST = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const ANCHORS = [
  { id: 'sleep', label: 'Sleep', default: true },
  { id: 'meals', label: 'Meals', default: true },
  { id: 'work', label: 'Work', default: false },
  { id: 'school', label: 'School / University', default: false },
  { id: 'commute', label: 'Commute', default: false },
  { id: 'exercise', label: 'Exercise', default: false },
];

const EXERCISE_WEEKLY_MINUTES = 150;

function apiBase() {
  const origin = window.location.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

async function apiRequest(path, { method = 'GET', body } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const resp = await fetch(apiBase() + path, opts);
  const text = await resp.text();
  let data = text;
  try { data = JSON.parse(text); } catch {}
  if (!resp.ok || (data && data.ok === false)) {
    const err = (data && (data.error || data.stderr)) || text || `HTTP ${resp.status}`;
    throw new Error(err);
  }
  return data;
}

function injectStyles() {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.textContent = `
    .life-setup-overlay {
      position: fixed;
      inset: 0;
      background: var(--chronos-overlay-gradient);
      z-index: 1200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: clamp(16px,3vw,32px);
      backdrop-filter: var(--chronos-overlay-blur);
    }
    .life-setup-shell {
      width: min(1100px, 96vw);
      max-height: 94vh;
      background: linear-gradient(140deg, var(--chronos-surface-strong), rgba(3,5,12,0.98));
      border: 1px solid rgba(122,162,247,0.25);
      border-radius: 24px;
      box-shadow: 0 30px 90px rgba(0,0,0,0.65);
      display: flex;
      flex-direction: column;
      color: var(--chronos-text);
      padding: clamp(20px, 3vw, 32px);
      gap: 16px;
      position: relative;
      overflow: hidden;
    }
    .life-setup-header h1 {
      margin: 0 0 6px;
      font-size: clamp(22px, 3vw, 30px);
    }
    .life-setup-header p {
      margin: 0;
      color: var(--chronos-text-muted);
    }
    .life-setup-steps {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .life-setup-step {
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid rgba(122,162,247,0.35);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--chronos-text-soft);
      background: rgba(10,14,26,0.5);
    }
    .life-setup-step.active {
      color: #fff;
      border-color: rgba(143,168,255,0.75);
      background: rgba(40,55,90,0.7);
    }
    .life-setup-body {
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
      padding-right: 4px;
      max-height: 58vh;
    }
    .life-setup-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
    }
    .life-card {
      background: rgba(7,12,20,0.7);
      border: 1px solid var(--chronos-border-strong);
      border-radius: 16px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .life-card h3 {
      margin: 0;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--chronos-text-soft);
    }
    .life-fixed-label {
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--chronos-text-muted);
      opacity: 0.85;
    }
    .life-row {
      display: grid;
      grid-template-columns: 1.4fr 1fr 1fr;
      gap: 8px;
      align-items: center;
    }
    .life-row .input, .life-row select {
      width: 100%;
    }
    .life-days {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .life-day {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid rgba(122,162,247,0.2);
      cursor: pointer;
      background: rgba(7,12,20,0.6);
    }
    .life-day input {
      accent-color: #8fa8ff;
    }
    .life-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .life-actions button {
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 12px;
      padding: 10px 18px;
      background: rgba(12,14,24,0.9);
      color: inherit;
      cursor: pointer;
      font-size: 14px;
    }
    .life-actions button.primary {
      background: var(--chronos-accent-gradient);
      border-color: rgba(143,168,255,0.45);
      color: #fff;
      box-shadow: var(--chronos-accent-glow);
    }
    .life-setup-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .life-status {
      flex: 1;
      min-height: 20px;
      color: var(--chronos-text-soft);
      background: rgba(21,28,46,0.85);
      border-radius: 12px;
      border: 1px solid rgba(41,55,92,0.8);
      padding: 10px 14px;
      font-size: 13px;
    }
    .life-note {
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid rgba(120,160,255,0.3);
      background: rgba(20,28,44,0.7);
      font-size: 13px;
      color: var(--chronos-text);
    }
    .life-warning {
      border-color: rgba(255,179,71,0.5);
      background: rgba(60,40,12,0.6);
      color: #ffd08a;
    }
    .life-danger {
      border-color: rgba(255,100,100,0.6);
      background: rgba(70,20,20,0.6);
      color: #ffb5b5;
    }
    .life-conflicts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 10px;
    }
    .life-conflicts ul {
      margin: 0;
      padding-left: 16px;
      font-size: 12px;
      color: var(--chronos-text-muted);
    }
    .life-divider {
      height: 1px;
      background: rgba(122,162,247,0.2);
      margin: 8px 0;
    }
    .life-inline {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .life-inline label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--chronos-text-soft);
    }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}
function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function markConflictsDirty() {
  state.conflictsDirty = true;
}

function parseTimeToMinutes(value) {
  if (!value) return null;
  const parts = String(value).split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return (h * 60) + m;
}

function parseDuration(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const text = String(value).trim().toLowerCase();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return parseInt(text, 10);
  let total = 0;
  const hMatch = text.match(/(\d+(?:\.\d+)?)\s*h/);
  if (hMatch) total += Math.round(parseFloat(hMatch[1]) * 60);
  const mMatch = text.match(/(\d+(?:\.\d+)?)\s*m/);
  if (mMatch) total += Math.round(parseFloat(mMatch[1]));
  return total;
}

function computeDurationMinutes(start, end) {
  const s = parseTimeToMinutes(start);
  const e = parseTimeToMinutes(end);
  if (s === null || e === null) return null;
  let minutes = e - s;
  if (minutes <= 0) minutes += 1440;
  return minutes;
}

function normalizeDays(days) {
  if (!Array.isArray(days)) return [];
  return days.map(d => String(d).toLowerCase().slice(0, 3));
}

function formatMinutes(mins) {
  if (mins === null || mins === undefined) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function defaultDays() {
  return DAY_LIST.map(d => d.key);
}

function nextMealLabel(existing) {
  const cycle = ['Breakfast', 'Lunch', 'Dinner'];
  const count = existing.length % cycle.length;
  return cycle[count];
}
function defaultSleepBlocks(mode, splits) {
  if (mode === 'biphasic') {
    return [
      { label: 'Core Sleep', start: '22:30', end: '06:00', days: defaultDays() },
      { label: 'Second Sleep', start: '14:00', end: '15:00', days: defaultDays() },
    ];
  }
  if (mode === 'polyphasic') {
    const count = Math.max(3, Math.min(6, parseInt(splits || 3, 10) || 3));
    return Array.from({ length: count }).map((_, i) => ({
      label: `Sleep ${i + 1}`,
      start: '',
      end: '',
      days: defaultDays(),
    }));
  }
  return [
    { label: 'Core Sleep', start: '22:00', end: '06:00', days: defaultDays() },
  ];
}

function defaultMealBlocks() {
  return [
    { label: 'Breakfast', start: '08:00', end: '08:30', days: defaultDays() },
    { label: 'Lunch', start: '12:30', end: '13:00', days: defaultDays() },
    { label: 'Dinner', start: '18:30', end: '19:00', days: defaultDays() },
  ];
}

const state = {
  step: 0,
  selected: new Set(ANCHORS.filter(a => a.default).map(a => a.id)),
  sleepMode: 'monophasic',
  sleepSplits: 3,
  customAnchors: [],
  blocks: {
    sleep: defaultSleepBlocks('monophasic'),
    meals: defaultMealBlocks(),
    work: [],
    school: [],
    commute: [],
    exercise: [],
  },
  templates: {
    mode: 'new',
    name: 'Life Skeleton',
    conflictMode: 'new',
    available: [],
    selected: new Set(),
  },
  conflicts: {
    internal: [],
    template: [],
  },
  conflictsDirty: true,
  conflictsCheckedAt: null
};

function getAnchorLabel(anchorId) {
  const base = ANCHORS.find(a => a.id === anchorId);
  if (base) return base.label;
  const custom = state.customAnchors.find(a => a.id === anchorId);
  return custom ? custom.label : anchorId;
}

function listAllAnchors() {
  return [...ANCHORS, ...state.customAnchors];
}

const ANCHOR_SUBTITLES = {
  sleep: 'recovery & rhythm',
  meals: 'metabolic anchors',
  work: 'cognitive load',
  school: 'cognitive load',
  commute: 'transition buffer',
  exercise: 'stress & adaptation',
};

function renderDaysSelector(days = [], onChange) {
  const wrap = createEl('div', 'life-days');
  const normalized = new Set(normalizeDays(days));
  DAY_LIST.forEach(day => {
    const label = createEl('label', 'life-day');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = day.key;
    input.checked = normalized.has(day.key);
    if (onChange) input.addEventListener('change', onChange);
    const text = document.createElement('span');
    text.textContent = day.label;
    label.append(input, text);
    wrap.appendChild(label);
  });
  const allLabel = createEl('label', 'life-day');
  const allInput = document.createElement('input');
  allInput.type = 'checkbox';
  allInput.checked = normalized.size === 7;
  allInput.addEventListener('change', () => {
    wrap.querySelectorAll('input[type="checkbox"]').forEach(box => {
      box.checked = allInput.checked;
    });
    if (onChange) onChange();
  });
  allLabel.append(allInput, document.createTextNode('All'));
  wrap.appendChild(allLabel);
  return wrap;
}

function readDaysFromSelector(selector) {
  const days = [];
  selector.querySelectorAll('input[type="checkbox"]').forEach(box => {
    if (box.checked && box.value) days.push(box.value);
  });
  return normalizeDays(days);
}
function createBlockRow(anchorId, block) {
  const row = createEl('div', 'life-card');
  row.dataset.anchor = anchorId;

  const main = createEl('div', 'life-row');
  const labelInput = document.createElement('input');
  labelInput.className = 'input';
  labelInput.placeholder = 'Label';
  labelInput.value = block.label || '';
  labelInput.addEventListener('input', markConflictsDirty);

  const start = document.createElement('input');
  start.type = 'time';
  start.className = 'input';
  start.value = block.start || '';
  start.addEventListener('input', markConflictsDirty);

  const end = document.createElement('input');
  end.type = 'time';
  end.className = 'input';
  end.value = block.end || '';
  end.addEventListener('input', markConflictsDirty);

  main.append(labelInput, start, end);

  const fixedLabel = createEl('div', 'life-fixed-label', 'Fixed anchor block');
  const daysWrap = renderDaysSelector(block.days || defaultDays(), markConflictsDirty);

  const remove = createEl('button');
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    row.remove();
    markConflictsDirty();
  });

  row.append(fixedLabel, main, daysWrap, remove);

  row._getPayload = () => ({
    label: labelInput.value.trim(),
    start: start.value,
    end: end.value,
    days: readDaysFromSelector(daysWrap),
  });

  return row;
}

function collectBlocks(container) {
  const blocks = [];
  container.querySelectorAll('.life-card').forEach(card => {
    if (typeof card._getPayload === 'function') {
      blocks.push(card._getPayload());
    }
  });
  return blocks;
}

function ensureAnchorBlocks(anchorId) {
  if (anchorId === 'sleep' && (!state.blocks.sleep || !state.blocks.sleep.length)) {
    state.blocks.sleep = defaultSleepBlocks(state.sleepMode, state.sleepSplits);
  }
  if (anchorId === 'meals' && (!state.blocks.meals || !state.blocks.meals.length)) {
    state.blocks.meals = defaultMealBlocks();
  }
}

function buildAnchorCard(anchorId, label) {
  ensureAnchorBlocks(anchorId);
  const card = createEl('div', 'life-card');
  const header = createEl('h3', null, label);
  card.appendChild(header);

  if (anchorId === 'commute') {
    const tip = createEl('div', 'life-note');
    tip.textContent = 'Tip: Start with 30 minutes before and/or after work or school, then adjust.';
    card.appendChild(tip);

    const autoRow = createEl('div', 'life-inline');
    const preview = createEl('div', 'life-fixed-label', 'Adds 30 minutes before and after each Work/School block');
    const autoBtn = createEl('button');
    autoBtn.textContent = 'Auto-add from Work/School (30m)';
    autoBtn.addEventListener('click', () => {
      const sources = [...(state.blocks.work || []), ...(state.blocks.school || [])];
      sources.forEach(source => {
        const start = source.start;
        const end = source.end;
        if (!start || !end) return;
        const startMinutes = parseTimeToMinutes(start);
        const endMinutes = parseTimeToMinutes(end);
        if (startMinutes === null || endMinutes === null) return;
        const beforeStart = Math.max(0, startMinutes - 30);
        const afterStart = endMinutes;
        const beforeBlock = {
          label: `Commute (before ${source.label || 'Work'})`,
          start: `${String(Math.floor(beforeStart / 60)).padStart(2, '0')}:${String(beforeStart % 60).padStart(2, '0')}`,
          end: start,
          days: source.days || defaultDays(),
        };
        const afterEndMinutes = Math.min(1440, endMinutes + 30);
        const afterBlock = {
          label: `Commute (after ${source.label || 'Work'})`,
          start: end,
          end: `${String(Math.floor(afterEndMinutes / 60)).padStart(2, '0')}:${String(afterEndMinutes % 60).padStart(2, '0')}`,
          days: source.days || defaultDays(),
        };
        const beforeRow = createBlockRow('commute', beforeBlock);
        const afterRow = createBlockRow('commute', afterBlock);
        list.append(beforeRow, afterRow);
      });
      markConflictsDirty();
    });
    autoRow.append(preview, autoBtn);
    card.appendChild(autoRow);
  }

  if (anchorId === 'sleep') {
    const modeRow = createEl('div', 'life-inline');
    const modeLabel = createEl('label');
    modeLabel.textContent = 'Sleep mode:';
    const modeSelect = document.createElement('select');
    ['monophasic', 'biphasic', 'polyphasic'].forEach(val => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      modeSelect.appendChild(opt);
    });
    modeSelect.value = state.sleepMode;

    const splitsInput = document.createElement('input');
    splitsInput.type = 'number';
    splitsInput.min = '3';
    splitsInput.max = '6';
    splitsInput.value = state.sleepSplits;
    splitsInput.style.width = '80px';

    const splitsWrap = createEl('label');
    splitsWrap.textContent = 'Splits:';
    splitsWrap.appendChild(splitsInput);

    const applyMode = createEl('button');
    applyMode.textContent = 'Apply Mode';
    applyMode.addEventListener('click', () => {
      state.sleepMode = modeSelect.value;
      state.sleepSplits = splitsInput.value;
      state.blocks.sleep = defaultSleepBlocks(state.sleepMode, state.sleepSplits);
      markConflictsDirty();
      render();
    });

    modeRow.append(modeLabel, modeSelect, splitsWrap, applyMode);
    card.appendChild(modeRow);

    if (state.sleepMode === 'polyphasic') {
      const helper = createEl('div', 'life-fixed-label', 'You can still adjust times freely later.');
      card.appendChild(helper);
    }
  }

  const list = createEl('div', 'life-setup-grid');
  const blocks = state.blocks[anchorId] || [];
  blocks.forEach(block => {
    const row = createBlockRow(anchorId, block);
    list.appendChild(row);
  });
  card.appendChild(list);

  const actions = createEl('div', 'life-actions');
  const addBtn = createEl('button');
  addBtn.textContent = anchorId === 'meals' ? 'Add Meal' : 'Add Block';
  addBtn.addEventListener('click', () => {
    if (anchorId === 'meals' && list.children.length >= 3) {
      return;
    }
    const existing = collectBlocks(list);
    const defaults = {
      label: anchorId === 'meals' ? nextMealLabel(existing) : '',
      start: '',
      end: '',
      days: defaultDays(),
    };
    if (existing.length) {
      const last = existing[existing.length - 1];
      if (last.end) defaults.start = last.end;
      if (last.days && last.days.length) defaults.days = last.days;
    }
    const row = createBlockRow(anchorId, defaults);
    list.appendChild(row);
    markConflictsDirty();
  });
  actions.appendChild(addBtn);

  if (anchorId === 'sleep') {
    const addSleepIn = createEl('button');
    addSleepIn.textContent = 'Add Sleep-In';
    addSleepIn.addEventListener('click', () => {
      const existing = collectBlocks(list);
      const defaults = { label: 'Sleep In', start: '', end: '', days: ['sat', 'sun'] };
      if (existing.length) {
        const last = existing[existing.length - 1];
        if (last.end) defaults.start = last.end;
        if (last.days && last.days.length) defaults.days = last.days;
      }
      const row = createBlockRow('sleep', defaults);
      list.appendChild(row);
      markConflictsDirty();
    });
    const addNap = createEl('button');
    addNap.textContent = 'Add sleep segment';
    addNap.addEventListener('click', () => {
      const existing = collectBlocks(list);
      const defaults = { label: 'Sleep Segment', start: '', end: '', days: defaultDays() };
      if (existing.length) {
        const last = existing[existing.length - 1];
        if (last.end) defaults.start = last.end;
        if (last.days && last.days.length) defaults.days = last.days;
      }
      const row = createBlockRow('sleep', defaults);
      list.appendChild(row);
      markConflictsDirty();
    });
    actions.append(addSleepIn, addNap);
  }

  card.appendChild(actions);
  return { card, list };
}

function collectStepData(stepEl) {
  if (state.step !== 1) return;
  const containers = stepEl.querySelectorAll('[data-anchor-container]');
  containers.forEach(container => {
    const anchorId = container.dataset.anchorContainer;
    state.blocks[anchorId] = collectBlocks(container);
  });
}

function computeAnchorConflicts(blocks) {
  const conflicts = [];
  const dayMap = {};

  blocks.forEach(block => {
    const days = normalizeDays(block.days || []);
    const start = parseTimeToMinutes(block.start);
    const duration = computeDurationMinutes(block.start, block.end);
    if (start === null || duration === null) return;
    days.forEach(day => {
      if (!dayMap[day]) dayMap[day] = [];
      dayMap[day].push({ ...block, start, end: start + duration, day });
    });
  });

  Object.values(dayMap).forEach(entries => {
    const sorted = entries.sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        if (sorted[j].start < sorted[i].end && sorted[j].end > sorted[i].start) {
          conflicts.push(`${sorted[i].label || 'Unnamed'} overlaps ${sorted[j].label || 'Unnamed'} on ${sorted[i].day.toUpperCase()}.`);
        }
      }
    }
  });

  return conflicts;
}

function flattenAnchorBlocks() {
  const blocks = [];
  Object.entries(state.blocks).forEach(([anchorId, list]) => {
    if (!state.selected.has(anchorId)) return;
    (list || []).forEach(block => {
      blocks.push({ ...block, anchorId });
    });
  });
  return blocks;
}

function summarizeSleep(blocks) {
  const dayTotals = {};
  blocks.forEach(block => {
    if (block.anchorId !== 'sleep') return;
    const duration = computeDurationMinutes(block.start, block.end);
    if (duration === null) return;
    normalizeDays(block.days || []).forEach(day => {
      dayTotals[day] = (dayTotals[day] || 0) + duration;
    });
  });
  const totals = Object.values(dayTotals);
  const avg = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
  const min = totals.length ? Math.min(...totals) : 0;
  return { avg, min, dayTotals };
}

function summarizeExercise(blocks) {
  let weekly = 0;
  blocks.forEach(block => {
    if (block.anchorId !== 'exercise') return;
    const duration = computeDurationMinutes(block.start, block.end);
    if (duration === null) return;
    weekly += duration * normalizeDays(block.days || []).length;
  });
  return weekly;
}

function buildAnchorEntries(blocks) {
  const entries = [];
  const nameCounts = {};
  blocks.forEach(block => {
    if (!block.start || !block.end) return;
    const duration = computeDurationMinutes(block.start, block.end);
    if (duration === null) return;
    let name = block.label || block.anchorId;
    name = name.replace(/\s+/g, ' ').trim();
    const key = name.toLowerCase();
    nameCounts[key] = (nameCounts[key] || 0) + 1;
    if (nameCounts[key] > 1) {
      name = `${name} (${nameCounts[key]})`;
    }
    entries.push({
      name,
      type: 'timeblock',
      start_time: block.start,
      end_time: block.end,
      duration,
      reschedule: 'never',
      flexible: false,
      absorbable: false,
      essential: true,
      tags: ['anchor', block.anchorId],
      category: block.anchorId,
      description: `${block.anchorId} anchor created by Life Setup wizard.`,
    });
  });
  return entries;
}

function sortEntriesWithTimes(entries, existing) {
  const merged = [...existing, ...entries];
  return merged
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const aTime = parseTimeToMinutes(a.entry.start_time || a.entry.ideal_start_time);
      const bTime = parseTimeToMinutes(b.entry.start_time || b.entry.ideal_start_time);
      if (aTime === null && bTime === null) return a.index - b.index;
      if (aTime === null) return 1;
      if (bTime === null) return -1;
      return aTime - bTime;
    })
    .map(item => item.entry);
}
async function loadTemplates() {
  if (state.templates.available.length) return;
  try {
    const data = await apiRequest('/api/template/list?type=day');
    if (data && Array.isArray(data.templates)) {
      state.templates.available = data.templates;
    }
  } catch (err) {
    console.warn('[Chronos][LifeSetup] Failed to load templates', err);
  }
}

async function fetchTemplate(name) {
  const data = await apiRequest(`/api/template?type=day&name=${encodeURIComponent(name)}`);
  return data;
}

async function fetchItem(type, name) {
  const data = await apiRequest(`/api/item?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`);
  return data;
}

function getItemTimeRange(entry, itemData) {
  const source = itemData || entry || {};
  const start = source.start_time || source.ideal_start_time;
  const end = source.end_time || source.ideal_end_time;
  let duration = parseDuration(source.duration);
  if (start && end) {
    const computed = computeDurationMinutes(start, end);
    if (computed !== null) duration = computed;
  }
  if (!start || !duration) return null;
  const startMinutes = parseTimeToMinutes(start);
  if (startMinutes === null) return null;
  return { start: startMinutes, end: startMinutes + duration };
}

async function computeTemplateConflicts(anchorBlocks, templates) {
  const conflicts = [];
  const cache = {};
  for (const templateName of templates) {
    const templateData = await fetchTemplate(templateName);
    const children = templateData.children || [];
    cache[templateName] = [];
    for (const child of children) {
      if (!child || typeof child !== 'object') continue;
      let itemData = null;
      if (child.type && child.name) {
        try {
          itemData = await fetchItem(child.type, child.name);
        } catch {}
      }
      const range = getItemTimeRange(child, itemData || child);
      if (!range) continue;
      cache[templateName].push({ entry: child, range });
    }

    const anchorRanges = anchorBlocks
      .filter(block => block.start && block.end)
      .map(block => ({
        label: block.label || block.anchorId,
        range: getItemTimeRange({ start_time: block.start, end_time: block.end }, null),
      }))
      .filter(Boolean);

    cache[templateName].forEach(existing => {
      anchorRanges.forEach(anchor => {
        if (!existing.range || !anchor.range) return;
        if (anchor.range.start < existing.range.end && anchor.range.end > existing.range.start) {
          conflicts.push(`${templateName}: '${anchor.label}' overlaps '${existing.entry.name || 'item'}'.`);
        }
      });
    });
  }
  state.templateCache = cache;
  return conflicts;
}

async function applyTemplates(anchorEntries) {
  const mode = state.templates.mode;
  const conflictMode = state.templates.conflictMode;
  const targetTemplates = [];

  if (mode === 'new' || (state.conflicts.template.length && conflictMode === 'new')) {
    const name = state.templates.name || 'Life Skeleton';
    const payload = {
      type: 'day',
      name,
      children: sortEntriesWithTimes(anchorEntries, []),
    };
    await apiRequest('/api/template', { method: 'POST', body: payload });
    return;
  }

  if (mode === 'all') {
    targetTemplates.push(...state.templates.available);
  } else {
    targetTemplates.push(...state.templates.selected);
  }

  for (const templateName of targetTemplates) {
    const templateData = await fetchTemplate(templateName);
    const existing = Array.isArray(templateData.children) ? templateData.children.slice() : [];

    let cleaned = existing.filter(entry => {
      if (!entry || typeof entry !== 'object') return false;
      const name = String(entry.name || '').toLowerCase();
      const isDuplicate = anchorEntries.some(anchor => String(anchor.name || '').toLowerCase() === name);
      if (isDuplicate) return false;
      if (state.conflicts.template.length && conflictMode === 'override') {
        const range = getItemTimeRange(entry, entry);
        if (!range) return true;
        const overlaps = anchorEntries.some(anchor => {
          const arange = getItemTimeRange(anchor, anchor);
          if (!arange) return false;
          return arange.start < range.end && arange.end > range.start;
        });
        return !overlaps;
      }
      return true;
    });

    const merged = sortEntriesWithTimes(anchorEntries, cleaned);
    await apiRequest('/api/template', { method: 'POST', body: { type: 'day', name: templateName, children: merged } });
  }
}
function render() {
  const overlay = document.querySelector(`[data-wizard-overlay="${OVERLAY_TAG}"]`);
  if (!overlay) return;
  overlay.innerHTML = '';

  const shell = createEl('div', 'life-setup-shell chronos-wizard-shell');
  const header = createEl('div', 'life-setup-header');
  header.innerHTML = `
    <h1>Life Setup Wizard</h1>
    <p>We’ll define the fixed anchors your days are built around.</p>
  `;

  const steps = createEl('div', 'life-setup-steps');
  ['Anchors', 'Configure', 'Review'].forEach((label, idx) => {
    const step = createEl('div', `life-setup-step${state.step === idx ? ' active' : ''}`, label);
    steps.appendChild(step);
  });

  const body = createEl('div', 'life-setup-body');

  if (state.step === 0) {
    const grid = createEl('div', 'life-setup-grid');
    listAllAnchors().forEach(anchor => {
      const card = createEl('label', 'life-card');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.selected.has(anchor.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.selected.add(anchor.id);
        else state.selected.delete(anchor.id);
        markConflictsDirty();
      });
      const title = createEl('div', null, anchor.label);
      title.style.fontWeight = '600';
      const subtitle = ANCHOR_SUBTITLES[anchor.id];
      if (subtitle) {
        const hint = createEl('small', 'life-fixed-label', `${anchor.label} — ${subtitle}`);
        hint.style.textTransform = 'none';
        hint.style.letterSpacing = '0.02em';
        card.append(checkbox, title, hint);
      } else {
        card.append(checkbox, title);
      }
      grid.appendChild(card);
    });
    body.appendChild(grid);

    const customCard = createEl('div', 'life-card');
    customCard.appendChild(createEl('h3', null, 'Custom Anchors'));
    const customRow = createEl('div', 'life-inline');
    const customInput = document.createElement('input');
    customInput.className = 'input';
    customInput.placeholder = 'Something that happens at the same time most days and should not be rescheduled.';
    const customBtn = createEl('button');
    customBtn.textContent = 'Add';
    customBtn.addEventListener('click', () => {
      const label = String(customInput.value || '').trim();
      if (!label) return;
      const id = `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
      if (!state.customAnchors.find(a => a.id === id)) {
        state.customAnchors.push({ id, label, default: false });
        state.blocks[id] = [];
        state.selected.add(id);
        markConflictsDirty();
      }
      customInput.value = '';
      render();
    });
    customRow.append(customInput, customBtn);
    customCard.appendChild(customRow);

    if (state.customAnchors.length) {
      const list = createEl('div', 'life-setup-grid');
      state.customAnchors.forEach(anchor => {
        const item = createEl('div', 'life-card');
        const title = createEl('div', null, anchor.label);
        title.style.fontWeight = '600';
        const remove = createEl('button');
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => {
          state.customAnchors = state.customAnchors.filter(a => a.id !== anchor.id);
          state.selected.delete(anchor.id);
          delete state.blocks[anchor.id];
          markConflictsDirty();
          render();
        });
        item.append(title, remove);
        list.appendChild(item);
      });
      customCard.appendChild(list);
    }

    body.appendChild(customCard);
  }

  if (state.step === 1) {
    const sections = createEl('div', 'life-setup-grid');
    state.selected.forEach(anchorId => {
      const label = getAnchorLabel(anchorId);
      const { card } = buildAnchorCard(anchorId, label);
      card.dataset.anchorContainer = anchorId;
      sections.appendChild(card);
    });
    body.appendChild(sections);
  }
  if (state.step === 2) {
    const anchorBlocks = flattenAnchorBlocks();

    const sleepSummary = summarizeSleep(anchorBlocks);
    const exerciseWeekly = summarizeExercise(anchorBlocks);

    const summary = createEl('div', 'life-card');
    summary.appendChild(createEl('h3', null, 'Summary'));
    summary.appendChild(createEl('div', null, `Sleep average: ${formatMinutes(sleepSummary.avg)} (min ${formatMinutes(sleepSummary.min)})`));
    summary.appendChild(createEl('div', null, `Exercise weekly total: ${formatMinutes(exerciseWeekly)}`));
    if (state.selected.has('exercise')) {
      summary.appendChild(createEl('div', 'life-fixed-label', 'WHO guideline: ~150 min/week'));
    }

    if (sleepSummary.avg && sleepSummary.avg < 480) {
      const warn = createEl('div', 'life-note life-warning');
      warn.textContent = 'This averages below 8 hours per night. Many people function better with more.';
      summary.appendChild(warn);
    }
    if (sleepSummary.avg && sleepSummary.avg < 420) {
      const danger = createEl('div', 'life-note life-danger');
      danger.textContent = 'This is below typical recovery needs and may cause cumulative fatigue.';
      summary.appendChild(danger);
    }
    if (state.selected.has('exercise') && exerciseWeekly < EXERCISE_WEEKLY_MINUTES) {
      const warn = createEl('div', 'life-note life-warning');
      warn.textContent = 'Your weekly exercise is below 150 minutes. Consider adding some movement on most days.';
      summary.appendChild(warn);
    }

    body.appendChild(summary);

    const templateCard = createEl('div', 'life-card');
    templateCard.appendChild(createEl('h3', null, 'Apply Anchors'));

    const modeRow = createEl('div', 'life-inline');
    const modes = [
      { id: 'new', label: 'Create new template (recommended)' },
      { id: 'selected', label: 'Apply to selected templates' },
      { id: 'all', label: 'Apply to all templates' },
    ];
    modes.forEach(mode => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'template-mode';
      input.value = mode.id;
      input.checked = state.templates.mode === mode.id;
      input.addEventListener('change', () => {
        state.templates.mode = mode.id;
        markConflictsDirty();
        render();
      });
      label.append(input, document.createTextNode(mode.label));
      modeRow.appendChild(label);
    });
    templateCard.appendChild(modeRow);

    if (state.templates.mode === 'new') {
      const nameRow = createEl('div', 'life-row');
      const nameLabel = createEl('div', null, 'Template name');
      const nameInput = document.createElement('input');
      nameInput.className = 'input';
      nameInput.value = state.templates.name;
      nameInput.addEventListener('input', () => { state.templates.name = nameInput.value; });
      nameRow.append(nameLabel, nameInput, document.createElement('div'));
      templateCard.appendChild(nameRow);
    }

    if (state.templates.mode === 'selected' || state.templates.mode === 'all') {
      const list = createEl('div', 'life-card');
      list.style.background = 'rgba(10,14,26,0.6)';
      list.appendChild(createEl('div', null, 'Templates'));
      const templateList = createEl('div', 'life-inline');
      if (state.templates.mode === 'selected') {
        state.templates.available.forEach(name => {
          const label = document.createElement('label');
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = state.templates.selected.has(name);
          input.addEventListener('change', () => {
            if (input.checked) state.templates.selected.add(name);
            else state.templates.selected.delete(name);
            markConflictsDirty();
            render();
          });
          label.append(input, document.createTextNode(name));
          templateList.appendChild(label);
        });
      } else {
        templateList.textContent = `All templates (${state.templates.available.length}) will be updated.`;
      }
      list.appendChild(templateList);
      templateCard.appendChild(list);
      templateCard.appendChild(createEl('div', 'life-fixed-label', 'Anchors always override flexible items.'));
    }

    if (state.conflicts.template.length && (state.templates.mode === 'selected' || state.templates.mode === 'all')) {
      const conflictMode = createEl('div', 'life-inline');
      const overrideLabel = document.createElement('label');
      const overrideInput = document.createElement('input');
      overrideInput.type = 'radio';
      overrideInput.name = 'conflict-mode';
      overrideInput.value = 'override';
      overrideInput.checked = state.templates.conflictMode === 'override';
      overrideInput.addEventListener('change', () => { state.templates.conflictMode = 'override'; });
      overrideLabel.append(overrideInput, document.createTextNode('Override conflicting blocks'));

      const newLabel = document.createElement('label');
      const newInput = document.createElement('input');
      newInput.type = 'radio';
      newInput.name = 'conflict-mode';
      newInput.value = 'new';
      newInput.checked = state.templates.conflictMode === 'new';
      newInput.addEventListener('change', () => { state.templates.conflictMode = 'new'; });
      newLabel.append(newInput, document.createTextNode('Create a new template instead'));

      conflictMode.append(overrideLabel, newLabel);
      templateCard.appendChild(conflictMode);
    }

    body.appendChild(templateCard);

    const conflictsCard = createEl('div', 'life-card');
    conflictsCard.appendChild(createEl('h3', null, 'Conflicts'));

    const refreshBtn = createEl('button');
    refreshBtn.textContent = 'Recheck Conflicts';
    refreshBtn.disabled = !state.conflictsDirty;
    refreshBtn.addEventListener('click', async () => {
      state.conflicts.internal = computeAnchorConflicts(flattenAnchorBlocks());
      if (state.templates.mode === 'selected' || state.templates.mode === 'all') {
        const templates = state.templates.mode === 'all'
          ? state.templates.available
          : Array.from(state.templates.selected);
        state.conflicts.template = await computeTemplateConflicts(flattenAnchorBlocks(), templates);
      } else {
        state.conflicts.template = [];
      }
      state.conflictsDirty = false;
      state.conflictsCheckedAt = new Date();
      render();
    });
    conflictsCard.appendChild(refreshBtn);
    if (state.conflictsCheckedAt) {
      const stamp = state.conflictsCheckedAt;
      const time = `${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}`;
      conflictsCard.appendChild(createEl('div', 'life-fixed-label', `Last checked: ${time}`));
    }

    const internalConflicts = state.conflicts.internal;
    const templateConflicts = state.conflicts.template;

    const conflictGrid = createEl('div', 'life-conflicts');
    const internalBox = createEl('div', 'life-note');
    internalBox.textContent = internalConflicts.length ? 'Anchor overlaps detected.' : 'No anchor overlaps detected.';
    if (internalConflicts.length) {
      const list = createEl('ul');
      internalConflicts.forEach(item => {
        const li = createEl('li', null, item);
        list.appendChild(li);
      });
      internalBox.appendChild(list);
    }

    const templateBox = createEl('div', 'life-note');
    templateBox.textContent = templateConflicts.length ? 'Template time conflicts detected.' : 'No template time conflicts detected.';
    if (templateConflicts.length) {
      const list = createEl('ul');
      templateConflicts.forEach(item => {
        const li = createEl('li', null, item);
        list.appendChild(li);
      });
      templateBox.appendChild(list);
    }

    conflictGrid.append(internalBox, templateBox);
    conflictsCard.appendChild(conflictGrid);
    body.appendChild(conflictsCard);
  }
  const statusLine = createEl('div', 'life-status');
  statusLine.textContent = 'Ready.';

  const actions = createEl('div', 'life-actions');
  const backBtn = createEl('button');
  backBtn.textContent = 'Back';
  backBtn.disabled = state.step === 0;
  backBtn.addEventListener('click', () => {
    state.step = Math.max(0, state.step - 1);
    render();
  });

  const nextBtn = createEl('button');
  nextBtn.className = 'primary';
  nextBtn.textContent = state.step === 2 ? 'Apply Anchors' : 'Next';

  nextBtn.addEventListener('click', async () => {
    if (state.step === 0) {
      if (!state.selected.size) {
        statusLine.textContent = 'Select at least one anchor.';
        return;
      }
      state.step = 1;
      render();
      return;
    }

    if (state.step === 1) {
      collectStepData(body);
      state.conflicts.internal = computeAnchorConflicts(flattenAnchorBlocks());
      await loadTemplates();
      if (state.templates.mode === 'selected' || state.templates.mode === 'all') {
        const templates = state.templates.mode === 'all'
          ? state.templates.available
          : Array.from(state.templates.selected);
        state.conflicts.template = await computeTemplateConflicts(flattenAnchorBlocks(), templates);
      } else {
        state.conflicts.template = [];
      }
      state.conflictsDirty = false;
      state.conflictsCheckedAt = new Date();
      state.step = 2;
      render();
      return;
    }

    if (state.step === 2) {
      const anchorBlocks = flattenAnchorBlocks();
      const missing = anchorBlocks.filter(block => block.start === '' || block.end === '');
      if (missing.length) {
        statusLine.textContent = 'Please fill in start/end times for all anchors.';
        return;
      }
      if (state.selected.has('meals') && (!state.blocks.meals || state.blocks.meals.length < 1)) {
        statusLine.textContent = 'Add at least one meal block.';
        return;
      }
      if (state.conflicts.internal.length) {
        statusLine.textContent = 'Some anchors overlap. Anchors must not compete.';
        return;
      }
      if ((state.templates.mode === 'selected') && !state.templates.selected.size) {
        statusLine.textContent = 'Select at least one template to update.';
        return;
      }

      try {
        statusLine.textContent = 'Applying anchors...';
        const anchorEntries = buildAnchorEntries(anchorBlocks);
        await applyTemplates(anchorEntries);
        setTimeout(() => {
          statusLine.textContent = 'Your life skeleton is set. You can now plan freely inside it.';
          setTimeout(() => {
            const current = document.querySelector(`[data-wizard-overlay="${OVERLAY_TAG}"]`);
            if (current) current.remove();
          }, 1200);
        }, 0);
      } catch (err) {
        console.error(err);
        statusLine.textContent = `Apply failed: ${err.message}`;
      }
    }
  });

  actions.append(backBtn, nextBtn);

  const footer = createEl('div', 'life-setup-footer');
  footer.append(statusLine, actions);

  const helpBtn = contextRef?.createHelpButton?.('LifeSetup', {
    className: 'wizard-help-btn icon-btn help-btn',
    fallbackLabel: 'Life Setup Wizard'
  });
  if (helpBtn) shell.appendChild(helpBtn);

  shell.append(header, steps, body, footer);
  overlay.appendChild(shell);
}

export async function launch(context, options = {}) {
  contextRef = context;
  injectStyles();
  await loadTemplates();

  const overlay = document.createElement('div');
  overlay.className = 'life-setup-overlay chronos-wizard-overlay';
  overlay.dataset.wizardOverlay = OVERLAY_TAG;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); }, { once: true });

  render();
}
