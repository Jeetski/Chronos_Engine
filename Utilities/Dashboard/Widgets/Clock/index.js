export function mount(el) {
  // Load CSS
  if (!document.getElementById('clock-css')) {
    const link = document.createElement('link');
    link.id = 'clock-css';
    link.rel = 'stylesheet';
    link.href = './Widgets/Clock/clock.css';
    document.head.appendChild(link);
  }

  el.className = 'widget clock-widget';

  const tpl = `
    <style>
      .clock-shell { display:flex; gap:16px; align-items:center; flex-wrap:wrap; justify-content:center; }
      .clock-face {
        position: relative;
        width: 190px;
        aspect-ratio: 1 / 1;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, rgba(122,162,247,0.25), rgba(8,12,18,0.9) 55%, #070a10 100%);
        border: 1px solid rgba(90,110,150,0.45);
        box-shadow: inset 0 0 18px rgba(8,12,20,0.85), 0 10px 30px rgba(0,0,0,0.35);
        display:flex;
        align-items:center;
        justify-content:center;
        margin: 0 auto;
      }
      .clock-canvas { width: 100%; height: 100%; display:block; margin: 0 auto; }
      .clock-digital {
        min-width: 180px;
        padding: 12px 16px;
        border-radius: 14px;
        background: linear-gradient(160deg, rgba(18,24,36,0.95), rgba(8,10,16,0.95));
        border: 1px solid rgba(50,62,90,0.7);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03);
        font-family: "Space Grotesk", "IBM Plex Sans", "Segoe UI", sans-serif;
        color: #e9eefb;
      }
      .clock-time {
        font-size: 28px;
        font-weight: 700;
        letter-spacing: 1px;
        font-family: "IBM Plex Mono", "JetBrains Mono", "Consolas", monospace;
      }
      .clock-date {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 1.2px;
        color: rgba(210,220,245,0.7);
        margin-top: 4px;
      }
      .clock-toggle {
        display:inline-flex;
        border-radius: 999px;
        border: 1px solid rgba(60,72,100,0.8);
        background: rgba(8,12,18,0.8);
        overflow: hidden;
      }
      .clock-toggle button {
        border: none;
        background: transparent;
        color: rgba(220,230,255,0.7);
        padding: 6px 12px;
        cursor: pointer;
        font-size: 12px;
        letter-spacing: 0.4px;
      }
      .clock-toggle button.active {
        background: linear-gradient(160deg, rgba(90,120,190,0.35), rgba(30,40,70,0.9));
        color: #f2f6ff;
      }
    </style>
    <div class="header" id="clockHeader">
      <div class="title">Chronos Clock</div>
      <div class="controls">
        <button class="icon-btn" id="clockMin" title="Minimize">_</button>
        <button class="icon-btn" id="clockClose" title="Close">x</button>
      </div>
    </div>
    <div class="content">
      <div class="row" style="gap:8px; align-items:center; margin-bottom:8px;">
        <div class="clock-toggle" id="clockToggle">
          <button type="button" data-mode="analog" class="active">Analog</button>
          <button type="button" data-mode="digital">Digital</button>
        </div>
        <span class="hint">Switch view</span>
      </div>
      <div class="clock-shell">
        <div class="clock-face" id="clockFace">
          <canvas id="clockCanvas" class="clock-canvas" width="190" height="190"></canvas>
        </div>
        <div>
          <div class="clock-digital" id="clockDigital" style="display:none;">
            <div class="clock-time" id="clockTime">00:00</div>
            <div class="clock-date" id="clockDate">---</div>
          </div>
          <div class="row" style="gap:8px; margin:10px 0 8px; flex-wrap:wrap;">
            <button class="btn btn-secondary" id="btnSetAppointment">Set Appointment</button>
            <button class="btn btn-secondary" id="btnSetAlarm">Set Alarm</button>
            <button class="btn btn-secondary" id="btnSetReminder">Set Reminder</button>
            <button class="btn btn-secondary" id="btnManageAlerts">Manage</button>
          </div>
          <div id="formArea"></div>
        </div>
      </div>
      <div id="managePanel" style="margin-top:14px; padding-top:12px; border-top:1px solid #222835; display:none;">
        <div class="row" style="gap:8px; align-items:center; margin-bottom:10px;">
          <div class="hint">Manage alerts</div>
          <div class="spacer"></div>
          <button class="btn btn-secondary" id="alertsRefresh">Refresh</button>
        </div>
        <div style="margin-bottom:12px;">
          <div class="hint" style="margin-bottom:6px;">Reminders</div>
          <div id="reminderList"></div>
        </div>
        <div style="margin-bottom:12px;">
          <div class="hint" style="margin-bottom:6px;">Alarms</div>
          <div id="alarmList"></div>
        </div>
        <div style="margin-top:10px;">
          <div class="hint" style="margin-bottom:8px;">Create reminder from item</div>
          <div class="row" style="gap:8px; flex-wrap:wrap; margin-bottom:6px;">
            <select class="input" id="itemReminderType"></select>
            <select class="input" id="itemReminderName" style="min-width:220px;"></select>
            <button class="btn btn-secondary" id="itemReminderRefresh">Refresh</button>
          </div>
          <div class="row" style="gap:8px; flex-wrap:wrap; margin-bottom:6px;">
            <select class="input" id="itemReminderDateKind" style="min-width:140px;"></select>
            <input class="input" id="itemReminderDate" type="date" />
            <input class="input" id="itemReminderTime" type="time" step="60" />
          </div>
          <div class="row" style="gap:8px; flex-wrap:wrap;">
            <input class="input" id="itemReminderMessage" placeholder="Message (optional)" style="min-width:240px;" />
            <button class="btn btn-primary" id="itemReminderCreate">Create Reminder</button>
          </div>
        </div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const header = el.querySelector('#clockHeader');
  const btnMin = el.querySelector('#clockMin');
  const btnClose = el.querySelector('#clockClose');
  const canvas = el.querySelector('#clockCanvas');
  const clockFace = el.querySelector('#clockFace');
  const clockToggle = el.querySelector('#clockToggle');
  const digitalPanel = el.querySelector('#clockDigital');
  const clockTime = el.querySelector('#clockTime');
  const clockDate = el.querySelector('#clockDate');
  const formArea = el.querySelector('#formArea');
  const manageBtn = el.querySelector('#btnManageAlerts');
  const managePanel = el.querySelector('#managePanel');
  const alertsRefreshBtn = el.querySelector('#alertsRefresh');
  const reminderList = el.querySelector('#reminderList');
  const alarmList = el.querySelector('#alarmList');
  const itemTypeSelect = el.querySelector('#itemReminderType');
  const itemNameSelect = el.querySelector('#itemReminderName');
  const itemDateKindSelect = el.querySelector('#itemReminderDateKind');
  const itemDateInput = el.querySelector('#itemReminderDate');
  const itemTimeInput = el.querySelector('#itemReminderTime');
  const itemMessageInput = el.querySelector('#itemReminderMessage');
  const itemRefreshBtn = el.querySelector('#itemReminderRefresh');
  const itemCreateBtn = el.querySelector('#itemReminderCreate');

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  const defaults = ((window.CHRONOS_SETTINGS || {}).defaults) || {};
  const apptDef = normalize(defaults.appointment || {});
  const alarmDef = normalize(defaults.alarm || {});
  const remindDef = normalize(defaults.reminder || {});
  const defaultsCache = {};

  function normalize(obj) {
    const out = {};
    try {
      Object.keys(obj).forEach(k => {
        const key = String(k).toLowerCase().replace(/^default_/, '');
        out[key] = obj[k];
      });
    } catch { }
    return out;
  }
  const fetchJson = async (url) => { const r = await fetch(url); return await r.json(); };
  async function fetchSettingsFile(file) {
    try {
      const j = await fetchJson(apiBase() + `/api/settings?file=${encodeURIComponent(file)}`);
      return j && j.content ? String(j.content) : null;
    } catch { return null; }
  }
  function parseYamlFlat(yaml) {
    const lines = String(yaml || '').replace(/\r\n?/g, '\n').split('\n');
    const out = {}; let curKey = null; let inBlock = false;
    for (let raw of lines) {
      const line = raw.replace(/#.*$/, ''); if (!line.trim()) continue;
      if (inBlock) {
        if (/^\s/.test(line)) { out[curKey] = (out[curKey] || '') + (out[curKey] ? '\n' : '') + line.trim(); continue; }
        inBlock = false; curKey = null;
      }
      const m = line.match(/^\s*([\w\-]+)\s*:\s*(.*)$/);
      if (m) {
        const k = m[1]; let v = m[2];
        if (v === '|-' || v === '|') { curKey = k; inBlock = true; out[k] = ''; continue; }
        if (/^(true|false)$/i.test(v)) v = (/^true$/i.test(v));
        else if (/^-?\d+$/.test(v)) v = parseInt(v, 10);
        out[String(k).toLowerCase().replace(/^default_/, '')] = v;
      }
    }
    return normalize(out);
  }
  async function loadDefaultsFor(type) {
    const key = String(type || '').toLowerCase();
    if (defaultsCache[key]) return defaultsCache[key];
    const title = key.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('_');
    const candidates = [
      `${key}_defaults.yml`,
      `${title}_Defaults.yml`,
      `${title}_defaults.yml`,
    ];
    for (const f of candidates) {
      const y = await fetchSettingsFile(f);
      if (y) {
        try { const parsed = parseYamlFlat(y) || {}; defaultsCache[key] = parsed; return parsed; } catch { defaultsCache[key] = {}; return {}; }
      }
    }
    defaultsCache[key] = {};
    return {};
  }
  async function ensureListener() {
    try { await fetch(apiBase() + '/api/listener/start', { method: 'POST' }); } catch { }
  }

  // Clock mode
  const MODE_KEY = 'chronos_clock_mode';
  let mode = 'analog';
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'analog' || saved === 'digital') mode = saved;
  } catch { }

  function setMode(next) {
    mode = next;
    try { localStorage.setItem(MODE_KEY, mode); } catch { }
    clockToggle?.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    if (mode === 'digital') {
      if (clockFace) clockFace.style.display = 'none';
      if (digitalPanel) digitalPanel.style.display = '';
    } else {
      if (clockFace) clockFace.style.display = '';
      if (digitalPanel) digitalPanel.style.display = 'none';
    }
  }

  clockToggle?.addEventListener('click', (ev) => {
    const btn = ev.target?.closest?.('button');
    const next = btn?.dataset?.mode;
    if (next) setMode(next);
  });

  // Analog clock drawing
  const ctx = canvas.getContext('2d');
  let lastSecond = null;
  let canvasSize = 190;
  let canvasRatio = window.devicePixelRatio || 1;
  function resizeCanvas() {
    if (!clockFace) return;
    const sizeW = clockFace.clientWidth || clockFace.getBoundingClientRect().width;
    const sizeH = clockFace.clientHeight || clockFace.getBoundingClientRect().height;
    const size = Math.floor(Math.min(sizeW, sizeH));
    canvasRatio = window.devicePixelRatio || 1;
    canvasSize = Math.max(120, size);
    canvas.width = Math.floor(canvasSize * canvasRatio);
    canvas.height = Math.floor(canvasSize * canvasRatio);
    canvas.style.width = `${canvasSize}px`;
    canvas.style.height = `${canvasSize}px`;
    ctx.setTransform(canvasRatio, 0, 0, canvasRatio, 0, 0);
  }
  try {
    const ro = new ResizeObserver(() => resizeCanvas());
    if (clockFace) ro.observe(clockFace);
  } catch { }

  function drawClock() {
    const w = canvasSize || (canvas.width / canvasRatio) || canvas.clientWidth || canvas.width;
    const h = canvasSize || (canvas.height / canvasRatio) || canvas.clientHeight || canvas.height;
    const r = Math.min(w, h) / 2 - 6;
    const cx = w / 2;
    const cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    // face
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#0b0f16';
    ctx.strokeStyle = '#2b3343';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r + 4, 0, Math.PI * 2); ctx.stroke();
    // ticks
    for (let i = 0; i < 60; i++) {
      const ang = i * Math.PI / 30;
      const len = (i % 5 === 0) ? 10 : 5;
      ctx.strokeStyle = (i % 5 === 0) ? '#a6adbb' : '#3a4a6a';
      ctx.lineWidth = (i % 5 === 0) ? 2 : 1;
      const x1 = Math.cos(ang) * (r - len), y1 = Math.sin(ang) * (r - len);
      const x2 = Math.cos(ang) * r, y2 = Math.sin(ang) * r;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    const now = new Date();
    const sec = now.getSeconds();
    const min = now.getMinutes() + sec / 60;
    const hr = (now.getHours() % 12) + min / 60;
    // hour hand
    drawHand(hr * Math.PI / 6, r * 0.5, 4, '#e6e8ef');
    // minute hand
    drawHand(min * Math.PI / 30, r * 0.75, 3, '#7aa2f7');
    // second hand
    drawHand(sec * Math.PI / 30, r * 0.85, 1.5, '#ef6a6a');
    // center
    ctx.fillStyle = '#e6e8ef'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawHand(angle, length, width, color) {
    ctx.save(); ctx.rotate(angle); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(length, 0); ctx.stroke(); ctx.restore();
  }
  function renderDigital(now) {
    if (!clockTime || !clockDate) return;
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    clockTime.textContent = `${hh}:${mm}:${ss}`;
    clockDate.textContent = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  }

  let rafId = null; function tick() {
    const now = new Date();
    if (mode === 'analog') drawClock();
    if (lastSecond !== now.getSeconds()) {
      lastSecond = now.getSeconds();
      renderDigital(now);
    }
    rafId = requestAnimationFrame(tick);
  }
  resizeCanvas();
  setMode(mode);
  tick();

  // Interaction: forms
  function clearForm() { formArea.innerHTML = ''; }
  function makeInputRow(label, inner) {
    const row = document.createElement('div'); row.className = 'row'; row.style.gap = '8px';
    const lab = document.createElement('label'); lab.className = 'hint'; lab.style.minWidth = '90px'; lab.textContent = label; row.appendChild(lab);
    row.appendChild(inner); return row;
  }

  async function showAppointmentForm() {
    clearForm();
    const title = document.createElement('input'); title.className = 'input'; title.placeholder = 'Appointment title';
    const date = document.createElement('input'); date.className = 'input'; date.type = 'date';
    const time = document.createElement('input'); time.className = 'input'; time.type = 'time'; time.step = '60';
    const duration = document.createElement('input'); duration.className = 'input'; duration.type = 'number'; duration.min = '0'; duration.placeholder = 'minutes';
    const location = document.createElement('input'); location.className = 'input'; location.placeholder = 'Location (optional)';
    // Prefill from defaults (settings override inline defaults)
    try {
      const def = await loadDefaultsFor('appointment');
      const dft = Object.keys(def || {}).length ? def : apptDef;
      if (dft.name || dft.title) title.value = dft.name || dft.title;
      date.value = dft.date || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      if (dft.time) time.value = dft.time;
      if (dft.duration) duration.value = String(dft.duration);
      if (dft.location) location.value = dft.location;
    } catch { try { date.value = new Date(Date.now() + 86400000).toISOString().slice(0, 10); } catch { } }
    const create = document.createElement('button'); create.className = 'btn btn-primary'; create.textContent = 'Create Appointment';
    const wrap = document.createElement('div');
    wrap.append(
      makeInputRow('Title', title),
      makeInputRow('Date', date),
      makeInputRow('Time', time),
      makeInputRow('Duration', duration),
      makeInputRow('Location', location),
      (function () { const r = document.createElement('div'); r.className = 'row'; r.appendChild(create); r.style.justifyContent = 'flex-end'; return r; })()
    );
    formArea.appendChild(wrap);
    create.addEventListener('click', async () => {
      const name = (title.value || '').trim(); if (!name) { alert('Please enter a title'); return; }
      const props = { date: date.value || '', time: time.value || '', duration: duration.value || '', location: location.value || '' };
      Object.keys(props).forEach(k => { if (props[k] === null || props[k] === undefined || props[k] === '') delete props[k]; });
      const payload = `command: new\nargs:\n  - appointment\n  - ${escapeY(name)}\nproperties:\n` + Object.entries(props).map(([k, v]) => `  ${k}: ${escapeY(v)}`).join('\n') + '\n';
      try {
        await ensureListener();
        const resp = await fetch(apiBase() + '/api/cli', { method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body: payload });
        const text = await resp.text();
        alert(resp.ok ? 'Appointment created.' : ('Failed: ' + text));
      } catch (e) { alert('Failed to reach Chronos dashboard server. Run: dashboard'); }
    });
  }

  async function showAlarmForm() {
    clearForm();
    const title = document.createElement('input'); title.className = 'input'; title.placeholder = 'Alarm title';
    const time = document.createElement('input'); time.className = 'input'; time.type = 'time'; time.step = '60';
    const message = document.createElement('input'); message.className = 'input'; message.placeholder = 'Message (optional)';
    const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = true;
    // Prefill from defaults (settings override inline defaults)
    try {
      const def = await loadDefaultsFor('alarm');
      const dft = Object.keys(def || {}).length ? def : alarmDef;
      if (dft.name || dft.title) title.value = dft.name || dft.title;
      if (dft.time) time.value = dft.time;
      if (dft.message) message.value = dft.message;
      if (typeof dft.enabled === 'boolean') enabled.checked = !!dft.enabled;
    } catch { }
    const create = document.createElement('button'); create.className = 'btn btn-primary'; create.textContent = 'Create Alarm';
    const wrap = document.createElement('div');
    const chkWrap = document.createElement('div'); chkWrap.className = 'row'; chkWrap.style.gap = '8px';
    const chkLabel = document.createElement('label'); chkLabel.className = 'hint'; chkLabel.style.minWidth = '90px'; chkLabel.textContent = 'Enabled';
    chkWrap.append(chkLabel, enabled);
    wrap.append(
      makeInputRow('Title', title),
      makeInputRow('Time', time),
      makeInputRow('Message', message),
      chkWrap,
      (function () { const r = document.createElement('div'); r.className = 'row'; r.appendChild(create); r.style.justifyContent = 'flex-end'; return r; })()
    );
    formArea.appendChild(wrap);
    create.addEventListener('click', async () => {
      const name = (title.value || '').trim(); if (!name) { alert('Please enter a title'); return; }
      if (!time.value) { alert('Please choose a time'); return; }
      const props = { time: time.value, message: message.value || '', enabled: enabled.checked ? 'true' : 'false' };
      Object.keys(props).forEach(k => { if (props[k] === null || props[k] === undefined || props[k] === '') delete props[k]; });
      const payload = `command: new\nargs:\n  - alarm\n  - ${escapeY(name)}\nproperties:\n` + Object.entries(props).map(([k, v]) => `  ${k}: ${escapeY(v)}`).join('\n') + '\n';
      try {
        await ensureListener();
        const resp = await fetch(apiBase() + '/api/cli', { method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body: payload });
        const text = await resp.text();
        alert(resp.ok ? 'Alarm created.' : ('Failed: ' + text));
      } catch (e) { alert('Failed to reach Chronos dashboard server. Run: dashboard'); }
    });
  }

  async function showReminderForm() {
    clearForm();
    const title = document.createElement('input'); title.className = 'input'; title.placeholder = 'Reminder title';
    const time = document.createElement('input'); time.className = 'input'; time.type = 'time'; time.step = '60';
    const date = document.createElement('input'); date.className = 'input'; date.type = 'date';
    const message = document.createElement('input'); message.className = 'input'; message.placeholder = 'Message (optional)';
    const recurrence = document.createElement('input'); recurrence.className = 'input'; recurrence.placeholder = 'Recurrence (e.g. daily, mon, tue)';
    try {
      const def = await loadDefaultsFor('reminder');
      const dft = Object.keys(def || {}).length ? def : remindDef;
      if (dft.name || dft.title) title.value = dft.name || dft.title;
      if (dft.time) time.value = dft.time;
      date.value = dft.date || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      if (dft.message) message.value = dft.message;
      if (dft.recurrence) recurrence.value = Array.isArray(dft.recurrence) ? dft.recurrence.join(', ') : String(dft.recurrence);
    } catch { try { date.value = new Date(Date.now() + 86400000).toISOString().slice(0, 10); } catch { } }
    const create = document.createElement('button'); create.className = 'btn btn-primary'; create.textContent = 'Create Reminder';
    const wrap = document.createElement('div');
    wrap.append(
      makeInputRow('Title', title),
      makeInputRow('Date', date),
      makeInputRow('Time', time),
      makeInputRow('Message', message),
      makeInputRow('Recurrence', recurrence),
      (function () { const r = document.createElement('div'); r.className = 'row'; r.appendChild(create); r.style.justifyContent = 'flex-end'; return r; })()
    );
    formArea.appendChild(wrap);
    create.addEventListener('click', async () => {
      const name = (title.value || '').trim(); if (!name) { alert('Please enter a title'); return; }
      if (!time.value) { alert('Please choose a time'); return; }
      const props = { time: time.value, date: date.value || '', label: message.value || '' };
      const rec = (recurrence.value || '').trim();
      if (rec) props.recurrence = rec;
      Object.keys(props).forEach(k => { if (props[k] === null || props[k] === undefined || props[k] === '') delete props[k]; });
      const payload = `command: new\nargs:\n  - reminder\n  - ${escapeY(name)}\nproperties:\n` + Object.entries(props).map(([k, v]) => `  ${k}: ${escapeY(v)}`).join('\n') + '\n';
      try {
        await ensureListener();
        const resp = await fetch(apiBase() + '/api/cli', { method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body: payload });
        const text = await resp.text();
        alert(resp.ok ? 'Reminder created.' : ('Failed: ' + text));
      } catch (e) { alert('Failed to reach Chronos dashboard server. Run: dashboard'); }
    });
  }

  function escapeY(v) { const s = String(v == null ? '' : v); if (/[:\n]/.test(s)) return '"' + s.replace(/"/g, '\\"') + '"'; return s; }
  function toTitleCase(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  }
  function parseDateParts(raw) {
    if (!raw) return { date: '', time: '' };
    const text = String(raw).trim();
    const isoMatch = text.match(/(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
    if (isoMatch) {
      return { date: isoMatch[1], time: isoMatch[2] || '' };
    }
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return { date: parsed.toISOString().slice(0, 10), time: '' };
    }
    return { date: '', time: '' };
  }
  function normalizeBool(value, fallback = true) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value).trim().toLowerCase();
    if (!text) return fallback;
    return !['false', '0', 'no', 'off'].includes(text);
  }

  // Dragging
  header.addEventListener('pointerdown', (ev) => {
    const r = el.getBoundingClientRect(); const offX = ev.clientX - r.left, offY = ev.clientY - r.top;
    function move(e) { el.style.left = Math.max(6, e.clientX - offX) + 'px'; el.style.top = Math.max(6, e.clientY - offY) + 'px'; el.style.right = 'auto'; }
    function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  btnMin.addEventListener('click', () => el.classList.toggle('minimized'));
  btnClose.addEventListener('click', () => el.style.display = 'none');

  // Buttons
  el.querySelector('#btnSetAppointment').addEventListener('click', showAppointmentForm);
  el.querySelector('#btnSetAlarm').addEventListener('click', showAlarmForm);
  el.querySelector('#btnSetReminder').addEventListener('click', showReminderForm);
  manageBtn.addEventListener('click', () => {
    const isOpen = managePanel.style.display !== 'none';
    managePanel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) loadAlerts();
  });

  // Reminder-from-item flow
  const itemTypes = ['task', 'milestone', 'goal', 'project'];
  const itemsCache = new Map();

  function setItemStatus(text) {
    if (itemCreateBtn) itemCreateBtn.textContent = text || 'Create Reminder';
  }

  async function fetchItemsByType(type) {
    const resp = await fetch(apiBase() + `/api/items?type=${encodeURIComponent(type)}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
    const items = Array.isArray(data.items) ? data.items : [];
    return items.filter(item => item && (item.deadline || item.due_date));
  }

  function clearItemOptions() {
    itemNameSelect.innerHTML = '';
    itemDateKindSelect.innerHTML = '';
  }

  function populateItemDates(item) {
    itemDateKindSelect.innerHTML = '';
    const options = [];
    if (item.deadline) {
      options.push({ value: 'deadline', label: 'Deadline', raw: item.deadline });
    }
    if (item.due_date) {
      options.push({ value: 'due_date', label: 'Due date', raw: item.due_date });
    }
    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      option.dataset.raw = opt.raw;
      itemDateKindSelect.appendChild(option);
    });
    if (!options.length) {
      itemDateKindSelect.appendChild(new Option('No date', ''));
      itemDateInput.value = '';
      return;
    }
    const first = options[0];
    itemDateKindSelect.value = first.value;
    const parts = parseDateParts(first.raw);
    itemDateInput.value = parts.date;
    if (parts.time && !itemTimeInput.value) itemTimeInput.value = parts.time;
  }

  function populateItemsSelect(type, items) {
    clearItemOptions();
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Select item';
    itemNameSelect.appendChild(option);
    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.name || '';
      opt.textContent = item.name || '(untitled)';
      itemNameSelect.appendChild(opt);
    });
  }

  async function loadItemsForType() {
    const type = itemTypeSelect.value;
    if (!type) return;
    clearItemOptions();
    const loading = document.createElement('option');
    loading.value = '';
    loading.textContent = 'Loading...';
    itemNameSelect.appendChild(loading);
    try {
      const items = await fetchItemsByType(type);
      itemsCache.set(type, items);
      populateItemsSelect(type, items);
    } catch (err) {
      console.error('[Clock] Failed to load items', err);
      populateItemsSelect(type, []);
      itemNameSelect.value = '';
    }
  }

  function getSelectedItem() {
    const type = itemTypeSelect.value;
    const items = itemsCache.get(type) || [];
    return items.find(item => item.name === itemNameSelect.value) || null;
  }

  async function createReminderFromItem() {
    const item = getSelectedItem();
    if (!item) { alert('Select an item first.'); return; }
    const kind = itemDateKindSelect.value || (item.deadline ? 'deadline' : 'due_date');
    const date = (itemDateInput.value || '').trim();
    let time = (itemTimeInput.value || '').trim();
    if (!date) { alert('Choose a date.'); return; }
    if (!time) {
      time = String(remindDef.time || '09:00');
      itemTimeInput.value = time;
    }
    const suffix = kind === 'deadline' ? 'deadline reminder' : 'due reminder';
    const name = `${item.name} ${suffix}`;
    const message = (itemMessageInput.value || '').trim();
    const props = { date, time };
    if (message) props.label = message;
    const payload = `command: new\nargs:\n  - reminder\n  - ${escapeY(name)}\nproperties:\n` + Object.entries(props).map(([k, v]) => `  ${k}: ${escapeY(v)}`).join('\n') + '\n';
    try {
      setItemStatus('Creating...');
      await ensureListener();
      const resp = await fetch(apiBase() + '/api/cli', { method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body: payload });
      const text = await resp.text();
      alert(resp.ok ? 'Reminder created.' : ('Failed: ' + text));
    } catch (e) {
      alert('Failed to reach Chronos dashboard server. Run: dashboard');
    } finally {
      setItemStatus('Create Reminder');
    }
  }

  itemTypes.forEach(type => {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = toTitleCase(type);
    itemTypeSelect.appendChild(opt);
  });
  itemTypeSelect.value = 'task';
  if (remindDef.time) itemTimeInput.value = remindDef.time;
  loadItemsForType();

  itemTypeSelect.addEventListener('change', loadItemsForType);
  itemRefreshBtn.addEventListener('click', loadItemsForType);
  itemNameSelect.addEventListener('change', () => {
    const item = getSelectedItem();
    if (!item) return;
    populateItemDates(item);
    if (!itemMessageInput.value) {
      const label = itemDateKindSelect.value === 'deadline' ? 'Deadline' : 'Due date';
      itemMessageInput.value = `${label}: ${item.name}`;
    }
  });
  itemDateKindSelect.addEventListener('change', () => {
    const item = getSelectedItem();
    if (!item) return;
    const kind = itemDateKindSelect.value;
    const raw = kind === 'deadline' ? item.deadline : item.due_date;
    const parts = parseDateParts(raw);
    itemDateInput.value = parts.date;
    if (parts.time && !itemTimeInput.value) itemTimeInput.value = parts.time;
  });
  itemCreateBtn.addEventListener('click', createReminderFromItem);

  async function fetchAlertItems(type) {
    const resp = await fetch(apiBase() + `/api/items?type=${encodeURIComponent(type)}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
    return Array.isArray(data.items) ? data.items : [];
  }

  function formatAlertWhen(item) {
    const date = item.date ? String(item.date) : '';
    const time = item.time ? String(item.time) : '';
    if (date && time) return `${date} ${time}`;
    if (date) return date;
    if (time) return time;
    return '';
  }

  function renderAlertList(listEl, items, type) {
    listEl.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = 'No entries found.';
      listEl.appendChild(empty);
      return;
    }
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.gap = '8px';
      row.style.alignItems = 'center';
      row.style.marginBottom = '6px';
      const label = document.createElement('div');
      label.style.flex = '1';
      label.textContent = `${item.name || '(untitled)'} ${formatAlertWhen(item) ? '· ' + formatAlertWhen(item) : ''}`;
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = normalizeBool(item.enabled, true);
      const del = document.createElement('button');
      del.className = 'btn btn-secondary';
      del.textContent = 'Delete';

      toggle.addEventListener('change', async () => {
        try {
          await fetch(apiBase() + '/api/items/setprop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, names: [item.name], property: 'enabled', value: toggle.checked }),
          });
        } catch (e) {
          toggle.checked = !toggle.checked;
          alert('Failed to update enabled status.');
        }
      });

      del.addEventListener('click', async () => {
        if (!window.confirm(`Delete ${type} "${item.name}"?`)) return;
        try {
          const resp = await fetch(apiBase() + '/api/item/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, name: item.name }),
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
          await loadAlerts();
        } catch (e) {
          alert('Failed to delete alert.');
        }
      });

      row.append(label, toggle, del);
      listEl.appendChild(row);
    });
  }

  async function loadAlerts() {
    try {
      const [reminders, alarms] = await Promise.all([
        fetchAlertItems('reminder'),
        fetchAlertItems('alarm'),
      ]);
      const sortFn = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
      renderAlertList(reminderList, reminders.sort(sortFn), 'reminder');
      renderAlertList(alarmList, alarms.sort(sortFn), 'alarm');
    } catch (e) {
      reminderList.innerHTML = '<div class="hint">Failed to load reminders.</div>';
      alarmList.innerHTML = '<div class="hint">Failed to load alarms.</div>';
    }
  }

  alertsRefreshBtn?.addEventListener('click', loadAlerts);

  // Resizers
  function edgeDrag(startRect, cb) { return (ev) => { ev.preventDefault(); function move(e) { cb(e, startRect); } function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); } window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); } }
  const re = el.querySelector('.resizer.e'); const rs = el.querySelector('.resizer.s'); const rse = el.querySelector('.resizer.se');
  if (re) re.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(260, e.clientX - sr.left) + 'px'; })(ev); });
  if (rs) rs.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.height = Math.max(160, e.clientY - sr.top) + 'px'; })(ev); });
  if (rse) rse.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(260, e.clientX - sr.left) + 'px'; el.style.height = Math.max(160, e.clientY - sr.top) + 'px'; })(ev); });

  return {};
}
