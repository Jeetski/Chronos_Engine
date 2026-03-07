export function mount(el, context = {}) {
  el.className = 'widget sleep-settings-widget';

  if (!document.getElementById('sleep-settings-widget-style')) {
    const style = document.createElement('style');
    style.id = 'sleep-settings-widget-style';
    style.textContent = `
      .sleep-widget-shell { display:flex; flex-direction:column; height:100%; min-height:240px; color:var(--chronos-text); }
      .sleep-widget-header { display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid var(--chronos-border); background:var(--chronos-surface-soft); }
      .sleep-widget-title { font-weight:700; letter-spacing:0.02em; }
      .sleep-widget-controls { display:flex; gap:6px; }
      .sleep-widget-content { padding:10px; display:flex; flex-direction:column; gap:10px; overflow:auto; }
      .sleep-row { display:grid; grid-template-columns: 1.4fr 1fr 1fr auto; gap:8px; align-items:center; }
      .sleep-card { border:1px solid var(--chronos-border); border-radius:10px; background:var(--chronos-surface-soft); padding:10px; display:flex; flex-direction:column; gap:8px; }
      .sleep-input { width:100%; border-radius:8px; border:1px solid var(--chronos-border); background:rgba(8,12,22,0.8); color:var(--chronos-text); padding:7px 9px; }
      .sleep-days { display:flex; flex-wrap:wrap; gap:6px; }
      .sleep-day { display:inline-flex; align-items:center; gap:4px; border:1px solid rgba(255,255,255,0.12); border-radius:999px; padding:3px 8px; font-size:12px; }
      .sleep-inline { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
      .sleep-btn { border:1px solid var(--chronos-border); border-radius:8px; padding:7px 10px; background:rgba(255,255,255,0.05); color:var(--chronos-text); cursor:pointer; }
      .sleep-btn.primary { background:var(--chronos-accent-gradient); color:#fff; border-color:rgba(122,162,247,0.45); }
      .sleep-status { min-height:18px; font-size:12px; color:var(--chronos-text-muted); }
      .sleep-status.err { color:#ffb5b5; }
      .sleep-clock-wrap { display:grid; grid-template-columns: 180px 1fr; gap:10px; align-items:center; }
      .sleep-clock { width:180px; height:180px; display:block; }
      .sleep-clock-meta { display:flex; flex-direction:column; gap:6px; min-width:0; }
      .sleep-clock-total { font-size:13px; color:var(--chronos-text); font-weight:600; }
      .sleep-clock-advisory { font-size:12px; padding:6px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.12); }
      .sleep-clock-advisory.ok { color:#9fe3bd; background:rgba(77,226,182,0.12); border-color:rgba(77,226,182,0.35); }
      .sleep-clock-advisory.warn { color:#ffd59a; background:rgba(243,166,76,0.12); border-color:rgba(243,166,76,0.35); }
      .sleep-clock-advisory.err { color:#ffb5b5; background:rgba(255,111,111,0.12); border-color:rgba(255,111,111,0.35); }
      .sleep-clock-legend { display:flex; flex-direction:column; gap:4px; max-height:170px; overflow:auto; }
      .sleep-clock-item { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--chronos-text-muted); }
      .sleep-clock-dot { width:9px; height:9px; border-radius:50%; flex:0 0 9px; }
      .sleep-clock-empty { font-size:12px; color:var(--chronos-text-muted); }
    `;
    document.head.appendChild(style);
  }

  const DAYS = [
    { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
    { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
  ];
  const DAY_NEXT = { mon: 'tue', tue: 'wed', wed: 'thu', thu: 'fri', fri: 'sat', sat: 'sun', sun: 'mon' };

  const state = {
    mode: 'monophasic',
    splits: 3,
    blocks: [],
    templates: { mode: 'selected', name: 'Sleep Skeleton', available: [], selected: new Set() },
  };

  function apiBase() {
    const o = window.location?.origin;
    if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
    return o;
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
    try { data = JSON.parse(text); } catch { }
    if (!resp.ok || (data && data.ok === false)) {
      const err = (data && (data.error || data.stderr)) || text || `HTTP ${resp.status}`;
      throw new Error(err);
    }
    return data;
  }

  function createEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function normalizeDays(days) {
    if (!Array.isArray(days)) return [];
    return days.map(d => String(d || '').toLowerCase().slice(0, 3)).filter(Boolean);
  }

  function defaultDays() { return DAYS.map(d => d.key); }

  function parseTimeToMinutes(value) {
    if (!value) return null;
    const parts = String(value).split(':');
    if (parts.length < 2) return null;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  }

  function computeDurationMinutes(start, end) {
    const s = parseTimeToMinutes(start);
    const e = parseTimeToMinutes(end);
    if (s === null || e === null) return null;
    let mins = e - s;
    if (mins <= 0) mins += 1440;
    return mins;
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
    return [{ label: 'Core Sleep', start: '22:00', end: '06:00', days: defaultDays() }];
  }

  function renderDaysSelector(days = []) {
    const wrap = createEl('div', 'sleep-days');
    const selected = new Set(normalizeDays(days));
    DAYS.forEach(day => {
      const label = createEl('label', 'sleep-day');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = day.key;
      input.checked = selected.has(day.key);
      label.append(input, document.createTextNode(day.label));
      wrap.appendChild(label);
    });
    return wrap;
  }

  function readDays(selector) {
    const out = [];
    selector.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.checked && input.value) out.push(input.value);
    });
    return normalizeDays(out);
  }

  function collectBlocks(container) {
    const blocks = [];
    container.querySelectorAll('[data-sleep-row]').forEach(row => {
      if (typeof row._payload === 'function') blocks.push(row._payload());
    });
    return blocks;
  }

  function polarToCartesian(cx, cy, radius, angleDeg) {
    const radians = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(radians),
      y: cy + radius * Math.sin(radians),
    };
  }

  function createSectorPath(cx, cy, radius, startMinute, endMinute) {
    const startAngle = (startMinute / 1440) * 360;
    const endAngle = (endMinute / 1440) * 360;
    const start = polarToCartesian(cx, cy, radius, startAngle);
    const end = polarToCartesian(cx, cy, radius, endAngle);
    const largeArc = (endMinute - startMinute) > 720 ? 1 : 0;
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
  }

  function rangesForBlock(block) {
    const s = parseTimeToMinutes(block.start);
    const e = parseTimeToMinutes(block.end);
    if (s === null || e === null) return [];
    if (e > s) return [{ start: s, end: e }];
    return [{ start: s, end: 1440 }, { start: 0, end: e }];
  }

  function formatMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  function computeDailyTotals(blocks) {
    const totals = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
    (blocks || []).forEach(block => {
      const duration = computeDurationMinutes(block.start, block.end);
      if (!duration) return;
      const days = normalizeDays(block.days || []);
      days.forEach(day => {
        if (Object.prototype.hasOwnProperty.call(totals, day)) totals[day] += duration;
      });
    });
    return totals;
  }

  function sleepAdvisory(blocks) {
    // Adult guidance baseline: ~7-9h nightly; stronger warning below 7h.
    const totals = computeDailyTotals(blocks);
    const values = Object.values(totals).filter(v => Number.isFinite(v));
    if (!values.length) return { level: 'warn', text: 'Set day selections to evaluate sleep guidance.' };
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const short7 = Object.entries(totals).filter(([, v]) => v < 420).map(([d]) => d.toUpperCase());
    const short8 = Object.entries(totals).filter(([, v]) => v >= 420 && v < 480).map(([d]) => d.toUpperCase());

    if (min < 420 || avg < 420) {
      const days = short7.length ? ` (${short7.join(', ')})` : '';
      return { level: 'err', text: `Warning: below 7h on some days${days}. Avg ${formatMinutes(Math.round(avg))}/night.` };
    }
    if (min < 480 || avg < 480) {
      const days = short8.length ? ` (${short8.join(', ')})` : '';
      return { level: 'warn', text: `Caution: below 8h on some days${days}. Avg ${formatMinutes(Math.round(avg))}/night.` };
    }
    return { level: 'ok', text: `On target: ${formatMinutes(Math.round(avg))}/night average (adult range 7-9h).` };
  }

  function renderClockPie(host, blocks) {
    if (!host) return;
    const palette = ['#7aa2f7', '#4de2b6', '#f3a64c', '#ff8f8f', '#9b8cff', '#6bd5ff', '#8fdc5b', '#ffb86b'];
    const valid = (blocks || []).filter(b => b && b.start && b.end);
    const segments = [];
    valid.forEach((block, idx) => {
      const color = palette[idx % palette.length];
      const duration = computeDurationMinutes(block.start, block.end) || 0;
      const label = String(block.label || 'Sleep Segment').trim() || 'Sleep Segment';
      rangesForBlock(block).forEach(range => segments.push({ ...range, color, label, duration }));
    });
    segments.sort((a, b) => a.start - b.start);
    const total = valid.reduce((acc, b) => acc + (computeDurationMinutes(b.start, b.end) || 0), 0);
    const advisory = sleepAdvisory(valid);

    if (!segments.length) {
      host.innerHTML = `<div class="sleep-clock-empty">Add start/end times to visualize your sleep clock.</div>`;
      return;
    }

    const cx = 90;
    const cy = 90;
    const radius = 78;
    const hourMarks = Array.from({ length: 24 }).map((_, h) => {
      const angle = (h / 24) * 360;
      const o = polarToCartesian(cx, cy, radius + (h % 6 === 0 ? 1 : 0), angle);
      const i = polarToCartesian(cx, cy, radius - (h % 6 === 0 ? 8 : 5), angle);
      const op = h % 6 === 0 ? 0.55 : 0.22;
      return `<line x1="${o.x}" y1="${o.y}" x2="${i.x}" y2="${i.y}" stroke="rgba(255,255,255,${op})" stroke-width="1" />`;
    }).join('');

    const wedges = segments.map(seg => `<path d="${createSectorPath(cx, cy, radius, seg.start, seg.end)}" fill="${seg.color}" fill-opacity="0.78"></path>`).join('');
    const legend = valid.map((block, idx) => {
      const color = palette[idx % palette.length];
      const duration = computeDurationMinutes(block.start, block.end) || 0;
      const label = String(block.label || 'Sleep Segment').trim() || 'Sleep Segment';
      return `<div class="sleep-clock-item"><span class="sleep-clock-dot" style="background:${color};"></span><span>${label} (${block.start}-${block.end}) • ${formatMinutes(duration)}</span></div>`;
    }).join('');

    host.innerHTML = `
      <div class="sleep-clock-wrap">
        <svg class="sleep-clock" viewBox="0 0 180 180" role="img" aria-label="Sleep clock pie chart">
          <circle cx="${cx}" cy="${cy}" r="${radius}" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.10)" stroke-width="1.2"></circle>
          ${wedges}
          <circle cx="${cx}" cy="${cy}" r="27" fill="rgba(9,12,18,0.92)" stroke="rgba(255,255,255,0.12)" stroke-width="1"></circle>
          ${hourMarks}
          <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="var(--chronos-text,#e6e8ef)" font-size="11" font-weight="700">${formatMinutes(total)}</text>
          <text x="${cx}" y="${cy + 11}" text-anchor="middle" fill="var(--chronos-text-muted,#9aa4b7)" font-size="9">Total</text>
        </svg>
        <div class="sleep-clock-meta">
          <div class="sleep-clock-total">Sleep total: ${formatMinutes(total)}</div>
          <div class="sleep-clock-advisory ${advisory.level}">${advisory.text}</div>
          <div class="sleep-clock-legend">${legend}</div>
        </div>
      </div>
    `;
  }

  function createBlockRow(block, onChange) {
    const row = createEl('div', 'sleep-card');
    row.dataset.sleepRow = '1';

    const top = createEl('div', 'sleep-row');
    const labelInput = document.createElement('input');
    labelInput.className = 'sleep-input';
    labelInput.placeholder = 'Label';
    labelInput.value = block.label || '';

    const startInput = document.createElement('input');
    startInput.className = 'sleep-input';
    startInput.type = 'time';
    startInput.value = block.start || '';

    const endInput = document.createElement('input');
    endInput.className = 'sleep-input';
    endInput.type = 'time';
    endInput.value = block.end || '';

    const removeBtn = createEl('button', 'sleep-btn', 'Remove');
    removeBtn.addEventListener('click', () => {
      row.remove();
      if (typeof onChange === 'function') onChange();
    });

    top.append(labelInput, startInput, endInput, removeBtn);
    const daysWrap = renderDaysSelector(block.days || defaultDays());
    row.append(top, daysWrap);
    [labelInput, startInput, endInput].forEach(input => input.addEventListener('input', () => { if (typeof onChange === 'function') onChange(); }));
    daysWrap.querySelectorAll('input[type="checkbox"]').forEach(input => input.addEventListener('change', () => { if (typeof onChange === 'function') onChange(); }));

    row._payload = () => ({
      label: String(labelInput.value || '').trim(),
      start: startInput.value || '',
      end: endInput.value || '',
      days: readDays(daysWrap),
    });

    return row;
  }

  function findConflicts(blocks) {
    const byDay = {};
    function push(day, start, end, label) {
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push({ start, end, label });
    }
    blocks.forEach(block => {
      const s = parseTimeToMinutes(block.start);
      const e = parseTimeToMinutes(block.end);
      if (s === null || e === null) return;
      const days = normalizeDays(block.days || []);
      if (!days.length) return;
      days.forEach(day => {
        if (e > s) push(day, s, e, block.label || 'Sleep Segment');
        else {
          push(day, s, 1440, block.label || 'Sleep Segment');
          push(DAY_NEXT[day], 0, e, block.label || 'Sleep Segment');
        }
      });
    });

    const conflicts = [];
    Object.entries(byDay).forEach(([day, ranges]) => {
      const sorted = ranges.sort((a, b) => a.start - b.start);
      for (let i = 0; i < sorted.length; i += 1) {
        for (let j = i + 1; j < sorted.length; j += 1) {
          if (sorted[j].start < sorted[i].end && sorted[j].end > sorted[i].start) {
            conflicts.push(`${sorted[i].label} overlaps ${sorted[j].label} on ${day.toUpperCase()}.`);
          }
        }
      }
    });
    return conflicts;
  }

  function buildSleepEntries(blocks) {
    const names = {};
    const entries = [];
    blocks.forEach(block => {
      if (!block.start || !block.end) return;
      const duration = computeDurationMinutes(block.start, block.end);
      if (duration === null) return;
      let name = (block.label || 'Sleep Segment').replace(/\s+/g, ' ').trim();
      const key = name.toLowerCase();
      names[key] = (names[key] || 0) + 1;
      if (names[key] > 1) name = `${name} (${names[key]})`;
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
        tags: ['anchor', 'sleep'],
        category: 'sleep',
        sleep: true,
        description: 'sleep anchor created by Sleep Settings widget.',
      });
    });
    return entries;
  }

  function parseStart(entry) {
    return parseTimeToMinutes(entry.start_time || entry.ideal_start_time);
  }

  function sortEntriesWithTimes(entries, existing) {
    const merged = [...existing, ...entries];
    return merged
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const at = parseStart(a.entry);
        const bt = parseStart(b.entry);
        if (at === null && bt === null) return a.index - b.index;
        if (at === null) return 1;
        if (bt === null) return -1;
        return at - bt;
      })
      .map(item => item.entry);
  }

  function isSleepAnchor(entry) {
    if (!entry || typeof entry !== 'object') return false;
    const type = String(entry.type || '').toLowerCase();
    const category = String(entry.category || '').toLowerCase();
    const desc = String(entry.description || '').toLowerCase();
    const tags = Array.isArray(entry.tags) ? entry.tags.map(t => String(t || '').toLowerCase()) : [];
    const sleepFlag = !!entry.sleep;
    if (sleepFlag) return true;
    if (tags.includes('anchor') && tags.includes('sleep')) return true;
    if (type === 'timeblock' && category === 'sleep') return true;
    if (desc.includes('sleep anchor created by')) return true;
    return false;
  }

  async function loadTemplates() {
    const data = await apiRequest('/api/template/list?type=day');
    state.templates.available = Array.isArray(data.templates) ? data.templates : [];
    if (!state.templates.selected.size && state.templates.available.length) {
      state.templates.selected.add(state.templates.available[0]);
    }
  }

  async function applySleep(entries) {
    if (state.templates.mode === 'new') {
      await apiRequest('/api/template', {
        method: 'POST',
        body: { type: 'day', name: state.templates.name || 'Sleep Skeleton', children: entries },
      });
      return;
    }

    const targets = state.templates.mode === 'all' ? [...state.templates.available] : [...state.templates.selected];
    for (const name of targets) {
      const template = await apiRequest(`/api/template?type=day&name=${encodeURIComponent(name)}`);
      const existing = Array.isArray(template.children) ? template.children : [];
      const cleaned = existing.filter(entry => !isSleepAnchor(entry));
      const merged = sortEntriesWithTimes(entries, cleaned);
      await apiRequest('/api/template', { method: 'POST', body: { type: 'day', name, children: merged } });
    }
  }

  function setStatus(msg, isErr = false) {
    const line = el.querySelector('[data-sleep-status]');
    if (!line) return;
    line.textContent = msg || '';
    line.className = isErr ? 'sleep-status err' : 'sleep-status';
  }

  function render() {
    el.innerHTML = `
      <div class="sleep-widget-shell">
        <div class="sleep-widget-header header" id="sleepWidgetHeader">
          <div class="sleep-widget-title title">Sleep Settings</div>
          <div class="sleep-widget-controls controls">
            <button class="icon-btn" id="sleepMin" title="Minimize">_</button>
            <button class="icon-btn" id="sleepClose" title="Close">x</button>
          </div>
        </div>
        <div class="sleep-widget-content content" id="sleepWidgetContent"></div>
        <div class="resizer e"></div>
        <div class="resizer s"></div>
        <div class="resizer se"></div>
      </div>
    `;

    const content = el.querySelector('#sleepWidgetContent');

    const modeCard = createEl('div', 'sleep-card');
    const modeInline = createEl('div', 'sleep-inline');
    const modeSelect = document.createElement('select');
    modeSelect.className = 'sleep-input';
    ['monophasic', 'biphasic', 'polyphasic'].forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      modeSelect.appendChild(opt);
    });
    modeSelect.value = state.mode;
    const splitsInput = document.createElement('input');
    splitsInput.className = 'sleep-input';
    splitsInput.type = 'number';
    splitsInput.min = '3';
    splitsInput.max = '6';
    splitsInput.value = String(state.splits);
    splitsInput.style.maxWidth = '90px';
    const applyMode = createEl('button', 'sleep-btn', 'Apply Mode Preset');
    applyMode.addEventListener('click', () => {
      state.mode = modeSelect.value;
      state.splits = splitsInput.value;
      state.blocks = defaultSleepBlocks(state.mode, state.splits);
      render();
    });
    modeInline.append(createEl('span', null, 'Mode:'), modeSelect, createEl('span', null, 'Splits:'), splitsInput, applyMode);
    modeCard.appendChild(modeInline);

    const blocksWrap = createEl('div');
    const chartHost = createEl('div');
    const refreshChart = () => renderClockPie(chartHost, collectBlocks(blocksWrap));
    state.blocks.forEach(block => blocksWrap.appendChild(createBlockRow(block, refreshChart)));
    modeCard.appendChild(blocksWrap);
    modeCard.appendChild(chartHost);

    const addInline = createEl('div', 'sleep-inline');
    const addSeg = createEl('button', 'sleep-btn', 'Add Sleep Segment');
    addSeg.addEventListener('click', () => {
      blocksWrap.appendChild(createBlockRow({ label: 'Sleep Segment', start: '', end: '', days: defaultDays() }, refreshChart));
      refreshChart();
    });
    const addIn = createEl('button', 'sleep-btn', 'Add Sleep-In');
    addIn.addEventListener('click', () => {
      blocksWrap.appendChild(createBlockRow({ label: 'Sleep In', start: '', end: '', days: ['sat', 'sun'] }, refreshChart));
      refreshChart();
    });
    addInline.append(addSeg, addIn);
    modeCard.appendChild(addInline);
    refreshChart();

    const applyCard = createEl('div', 'sleep-card');
    const applyModes = createEl('div', 'sleep-inline');
    [
      { id: 'selected', label: 'Selected templates' },
      { id: 'all', label: 'All day templates' },
      { id: 'new', label: 'Create new template' },
    ].forEach(m => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'sleep-template-mode';
      input.value = m.id;
      input.checked = state.templates.mode === m.id;
      input.addEventListener('change', () => { state.templates.mode = m.id; render(); });
      label.append(input, document.createTextNode(` ${m.label}`));
      applyModes.appendChild(label);
    });
    applyCard.appendChild(applyModes);

    if (state.templates.mode === 'new') {
      const nameInput = document.createElement('input');
      nameInput.className = 'sleep-input';
      nameInput.placeholder = 'Template name';
      nameInput.value = state.templates.name;
      nameInput.addEventListener('input', () => { state.templates.name = nameInput.value; });
      applyCard.appendChild(nameInput);
    } else if (state.templates.mode === 'selected') {
      const list = createEl('div', 'sleep-inline');
      state.templates.available.forEach(name => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = state.templates.selected.has(name);
        input.addEventListener('change', () => {
          if (input.checked) state.templates.selected.add(name);
          else state.templates.selected.delete(name);
        });
        label.append(input, document.createTextNode(` ${name}`));
        list.appendChild(label);
      });
      applyCard.appendChild(list);
    }

    const applyInline = createEl('div', 'sleep-inline');
    const applyBtn = createEl('button', 'sleep-btn primary', 'Apply Sleep Anchors');
    applyBtn.addEventListener('click', async () => {
      try {
        const blocks = collectBlocks(blocksWrap);
        if (!blocks.length) return setStatus('Add at least one sleep block.', true);
        if (blocks.some(b => !b.start || !b.end)) return setStatus('Fill in start/end for all blocks.', true);
        const conflicts = findConflicts(blocks);
        if (conflicts.length) return setStatus(conflicts[0], true);
        if (state.templates.mode === 'selected' && !state.templates.selected.size) return setStatus('Select at least one template.', true);

        state.blocks = blocks;
        setStatus('Applying sleep anchors...');
        await applySleep(buildSleepEntries(blocks));
        setStatus('Sleep anchors applied.');
      } catch (err) {
        setStatus(`Apply failed: ${err.message}`, true);
      }
    });
    applyInline.append(applyBtn);

    content.append(modeCard, applyCard, createEl('div', 'sleep-status', ''), applyInline);
    content.querySelector('.sleep-status').setAttribute('data-sleep-status', '1');

    el.querySelector('#sleepMin')?.addEventListener('click', () => el.classList.toggle('minimized'));
    el.querySelector('#sleepClose')?.addEventListener('click', () => { el.style.display = 'none'; });
  }

  (async () => {
    try {
      await loadTemplates();
      state.blocks = defaultSleepBlocks(state.mode, state.splits);
      render();
      try {
        const pref = window.__chronosSleepWizardDraft;
        if (pref && pref.mode) {
          state.mode = pref.mode;
          state.splits = pref.splits || 3;
          if (pref.blocks && Array.isArray(pref.blocks) && pref.blocks.length) state.blocks = pref.blocks;
          render();
        }
      } catch { }
    } catch (err) {
      render();
      setStatus(`Failed to load templates: ${err.message}`, true);
    }
  })();

  return {};
}
