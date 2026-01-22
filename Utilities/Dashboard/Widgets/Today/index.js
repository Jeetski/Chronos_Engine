export function mount(el, context) {
    console.log('[Chronos][Today] Mounting Today widget');

    // Load CSS
    if (!document.getElementById('scheduler-css')) {
        const link = document.createElement('link');
        link.id = 'scheduler-css';
        link.rel = 'stylesheet';
        link.href = './Widgets/Today/scheduler.css';
        document.head.appendChild(link);
    }

    el.className = 'widget scheduler-widget';
    el.innerHTML = `
    <div class="header" id="todayHeader">
      <div class="title">Scheduler</div>
      <div class="controls">
        <button class="icon-btn" id="todayMin" title="Minimize">−</button>
        <button class="icon-btn" id="todayClose" title="Close">×</button>
      </div>
    </div>
    <div class="content">
      <!-- Quick Actions Bar -->
      <div class="scheduler-actions-bar">
        <button class="btn-large btn-start-day" id="todayStartDay">🚀 Start Day</button>
        <button class="btn-large btn-refresh" id="todayRefresh">↻ Refresh</button>
        <button class="btn-large btn-reschedule" id="todayReschedule">📅 Reschedule</button>
      </div>

      <!-- Block Info Card -->
      <div class="scheduler-block-card empty" id="blockInfoCard">
        <div class="block-card-header">
          <div class="block-card-title" id="blockTitle">No block selected</div>
          <div class="block-status-badge pending" id="blockStatus">select</div>
        </div>
        <div class="block-card-details" id="blockDetails">
          <div class="block-detail-item">
            <span class="block-detail-icon">🕐</span>
            <span id="blockTime">--:-- to --:--</span>
          </div>
          <div class="block-detail-item">
            <span class="block-detail-icon">⏱️</span>
            <span id="blockDuration">-- min</span>
          </div>
        </div>
        <input class="scheduler-input" id="selectedItemInput" list="todayItemList" placeholder="Search or select block" style="margin-top:10px;" />
        <datalist id="todayItemList"></datalist>
      </div>

      <!-- Scheduling Controls -->
      <details class="scheduler-section" id="schedControls">
        <summary>⚙️ Scheduling Controls</summary>
        <div class="scheduler-section-content">
          <div class="action-group">
            <div class="action-group-title">Priority Weights (1-10)</div>
            <div class="priority-sliders-grid">
              <div class="slider-row">
                <label for="sliderEnvironment">Environment</label>
                <input type="range" id="sliderEnvironment" min="1" max="10" value="7" />
                <span class="slider-value" id="valEnvironment">7</span>
              </div>
              <div class="slider-row">
                <label for="sliderCategory">Category</label>
                <input type="range" id="sliderCategory" min="1" max="10" value="6" />
                <span class="slider-value" id="valCategory">6</span>
              </div>
              <div class="slider-row">
                <label for="sliderHappiness">Happiness</label>
                <input type="range" id="sliderHappiness" min="1" max="10" value="5" />
                <span class="slider-value" id="valHappiness">5</span>
              </div>
              <div class="slider-row">
                <label for="sliderDueDate">Due Date</label>
                <input type="range" id="sliderDueDate" min="1" max="10" value="4" />
                <span class="slider-value" id="valDueDate">4</span>
              </div>
              <div class="slider-row">
                <label for="sliderDeadline">Deadline</label>
                <input type="range" id="sliderDeadline" min="1" max="10" value="5" />
                <span class="slider-value" id="valDeadline">5</span>
              </div>
              <div class="slider-row">
                <label for="sliderStatus">Status Align</label>
                <input type="range" id="sliderStatus" min="1" max="10" value="3" />
                <span class="slider-value" id="valStatus">3</span>
              </div>
              <div class="slider-row">
                <label for="sliderPriority">Priority Prop</label>
                <input type="range" id="sliderPriority" min="1" max="10" value="2" />
                <span class="slider-value" id="valPriority">2</span>
              </div>
              <div class="slider-row">
                <label for="sliderTemplate">Template</label>
                <input type="range" id="sliderTemplate" min="1" max="10" value="1" />
                <span class="slider-value" id="valTemplate">1</span>
              </div>
            </div>
          </div>
          <div class="action-group" style="padding-top:8px; border-top:1px solid var(--border);">
            <div class="action-group-title">Quick Toggles</div>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px;">
              <input type="checkbox" id="toggleCutting" />
              Allow Item Cutting (Phase 3e)
            </label>
          </div>
        </div>
      </details>

      <!-- Actions Panel -->
      <details class="scheduler-section" id="actionControls">
        <summary>⚡ Actions</summary>
        <div class="scheduler-section-content">
          <div class="action-group">
            <div class="action-group-title">Quick Status</div>
            <div class="button-row">
              <button class="scheduler-btn btn-success" id="markDone">✓ Done (Today)</button>
              <button class="scheduler-btn" id="markSkipped">⊘ Skipped</button>
              <button class="scheduler-btn btn-warning" id="markDelayed">⏰ Delayed</button>
            </div>
          </div>
          
          <div class="action-group">
            <div class="action-group-title">Schedule Edits</div>
            <div class="button-row">
              <button class="scheduler-btn" id="trim5" title="Trim 5 minutes">Trim -5</button>
              <button class="scheduler-btn" id="trim10" title="Trim 10 minutes">Trim -10</button>
              <input class="scheduler-input" id="trimCustom" placeholder="min" style="width:72px;" />
              <button class="scheduler-btn" id="trimGo">Trim</button>
            </div>
            <div class="button-row">
              <input class="scheduler-input" id="changeTime" type="time" step="60" style="width:110px;" />
              <button class="scheduler-btn" id="changeGo">Change Time</button>
              <button class="scheduler-btn btn-danger" id="cutGo">✂️ Cut</button>
            </div>
          </div>
          
          <div class="action-group">
            <div class="action-group-title">Actuals (Did)</div>
            <div class="button-row">
              <input class="scheduler-input" id="didStart" type="time" step="60" style="width:110px;" placeholder="Start" />
              <input class="scheduler-input" id="didEnd" type="time" step="60" style="width:110px;" placeholder="End" />
              <select class="scheduler-input" id="didStatus" style="width:130px;">
                <option value="completed">completed</option>
                <option value="partial">partial</option>
                <option value="skipped">skipped</option>
              </select>
            </div>
            <div class="button-row">
              <input class="scheduler-input" id="didNote" placeholder="note" style="min-width:140px; flex:1;" />
              <button class="scheduler-btn btn-success" id="didGo">✓ Did</button>
            </div>
          </div>
          
          <div class="action-group">
            <div class="action-group-title">Item State</div>
            <div class="button-row">
              <button class="scheduler-btn btn-success" id="completeItem">✓ Complete (Item)</button>
            </div>
          </div>
        </div>
      </details>

      <!-- Calendar Context (hidden by default) -->
      <div id="calendarContext" style="display:none; flex-direction:column; gap:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="scheduler-hint" id="calendarDayLabel">Calendar day selected.</span>
          <span class="scheduler-hint" id="calendarDayNote"></span>
        </div>
        <div class="scheduler-hint" id="selSummary">Select a block in the calendar.</div>
      </div>

      <!-- Status Bar -->
      <div class="scheduler-status-bar">
        <label class="scheduler-toggle">
          <input type="checkbox" id="todayFxToggle" checked />
          fx
        </label>
        <span class="scheduler-hint" id="selHint">Select a day in Calendar to preview the schedule.</span>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;


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
      return {
        start: startParts.minutes,
        end: endParts.minutes,
        text: block.text || block.name || `Block ${idx + 1}`,
        type: block.type || block.item_type || '',
      };
    });
  }

  async function fetchToday({ silent = true } = {}) {
    console.log('[Chronos][Today] fetchToday()');
    try {
      const r = await fetch(apiBase() + '/api/today');
      const t = await r.text();
      const data = parseScheduleYaml(t) || {};
      const blocks = Array.isArray(data.blocks) ? data.blocks : [];
      const blockRecords = normalizeScheduleBlocks(blocks);
      updateItemList(blockRecords);

      const key = (function () { const d = new Date(); const y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), dd = ('0' + d.getDate()).slice(-2); return `${y}-${m}-${dd}`; })();
      const store = (function () { try { return JSON.parse(localStorage.getItem('pm_day_blocks')) || {} } catch { return {} } })();
      store[key] = blocks.map(b => {
        const startParts = extractTimeParts(b.start);
        const endParts = extractTimeParts(b.end);
        return { start: startParts.minutes || 0, end: endParts.minutes || 0, text: b.text || '' };
      });
      try { localStorage.setItem('pm_day_blocks', JSON.stringify(store)); } catch { }
      try { window.dayBlocksStore = store; } catch { }
      try { if (typeof window.redraw === 'function') window.redraw(); } catch { }
      console.log('[Chronos][Today] Loaded blocks:', blocks.length);
      if (!silent) alert("Loaded today's schedule.");
    } catch (e) {
      console.error('[Chronos][Today] fetch error:', e);
      if (!silent) alert('Failed to load schedule.');
    }
  }

  // NEW: Initialize & Persist Scheduling Controls
  const sliders = {
    environment: el.querySelector('#sliderEnvironment'),
    category: el.querySelector('#sliderCategory'),
    happiness: el.querySelector('#sliderHappiness'),
    dueDate: el.querySelector('#sliderDueDate'),
    deadline: el.querySelector('#sliderDeadline'),
    status: el.querySelector('#sliderStatus'),
    priority: el.querySelector('#sliderPriority'),
    template: el.querySelector('#sliderTemplate'),
  };
  const vals = {
    environment: el.querySelector('#valEnvironment'),
    category: el.querySelector('#valCategory'),
    happiness: el.querySelector('#valHappiness'),
    dueDate: el.querySelector('#valDueDate'),
    deadline: el.querySelector('#valDeadline'),
    status: el.querySelector('#valStatus'),
    priority: el.querySelector('#valPriority'),
    template: el.querySelector('#valTemplate'),
  };
  const toggleCutting = el.querySelector('#toggleCutting');

  const priorityNameMap = {
    "Environment": "environment",
    "Category": "category",
    "Happiness": "happiness",
    "Due Date": "dueDate",
    "Deadline": "deadline",
    "Status Alignment": "status",
    "Priority Property": "priority",
    "Template Membership": "template",
  };
  const sliderNameMap = Object.fromEntries(Object.entries(priorityNameMap).map(([name, key]) => [key, name]));
  let schedulingPrioritiesRaw = null;
  let schedulingPrioritiesData = null;
  let saveTimer = null;

  function setSliderValue(key, value) {
    const slider = sliders[key];
    if (!slider || value === undefined || value === null) return;
    slider.value = String(value);
    if (vals[key]) vals[key].textContent = slider.value;
  }

  function syncSliderLabels() {
    for (const [key, slider] of Object.entries(sliders)) {
      if (!slider) continue;
      if (vals[key]) vals[key].textContent = slider.value;
    }
  }

  function getControlSnapshot() {
    return {
      environment: sliders.environment?.value,
      category: sliders.category?.value,
      happiness: sliders.happiness?.value,
      dueDate: sliders.dueDate?.value,
      deadline: sliders.deadline?.value,
      status: sliders.status?.value,
      priority: sliders.priority?.value,
      template: sliders.template?.value,
      allowCutting: toggleCutting?.checked,
    };
  }

  function saveLocalControls() {
    try {
      localStorage.setItem('chronos_sched_controls', JSON.stringify(getControlSnapshot()));
    } catch { }
  }

  function loadLocalControls() {
    try {
      const saved = JSON.parse(localStorage.getItem('chronos_sched_controls') || '{}');
      if (saved.environment) sliders.environment.value = saved.environment;
      if (saved.category) sliders.category.value = saved.category;
      if (saved.happiness) sliders.happiness.value = saved.happiness;
      if (saved.dueDate) sliders.dueDate.value = saved.dueDate;
      if (saved.deadline) sliders.deadline.value = saved.deadline;
      if (saved.status) sliders.status.value = saved.status;
      if (saved.priority) sliders.priority.value = saved.priority;
      if (saved.template) sliders.template.value = saved.template;
      if (saved.allowCutting !== undefined) toggleCutting.checked = saved.allowCutting;
      syncSliderLabels();
    } catch { }
  }

  async function loadSchedulingPriorities() {
    try {
      const resp = await fetch(apiBase() + '/api/settings?file=Scheduling_Priorities.yml');
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) return;
      schedulingPrioritiesRaw = typeof data.content === 'string' ? data.content : null;
      schedulingPrioritiesData = (data.data && typeof data.data === 'object') ? data.data : null;
      const factors = schedulingPrioritiesData?.Scheduling_Priorities;
      if (Array.isArray(factors)) {
        factors.forEach(entry => {
          const name = String(entry?.Name || '').trim();
          const key = priorityNameMap[name];
          if (!key) return;
          const rank = entry?.Rank;
          if (rank !== undefined && rank !== null) setSliderValue(key, rank);
        });
        saveLocalControls();
      }
    } catch { }
  }

  function buildSchedulingPrioritiesRaw() {
    if (!schedulingPrioritiesRaw) return null;
    const snapshot = getControlSnapshot();
    const targetRanks = {};
    for (const [key, name] of Object.entries(sliderNameMap)) {
      if (snapshot[key] !== undefined && snapshot[key] !== null) {
        targetRanks[name] = snapshot[key];
      }
    }
    const newline = schedulingPrioritiesRaw.includes('\r\n') ? '\r\n' : '\n';
    const lines = schedulingPrioritiesRaw.split(/\r\n|\n/);
    let currentName = null;
    const updated = lines.map(line => {
      const nameMatch = line.match(/^\s*-\s*Name:\s*(.+)\s*$/);
      if (nameMatch) {
        currentName = nameMatch[1].trim();
        return line;
      }
      const rankMatch = line.match(/^(\s*Rank:\s*)(\d+)(\s*)$/);
      if (rankMatch && currentName && targetRanks[currentName] !== undefined) {
        return `${rankMatch[1]}${targetRanks[currentName]}${rankMatch[3] || ''}`;
      }
      return line;
    });
    return updated.join(newline);
  }

  function buildSchedulingPrioritiesData() {
    const snapshot = getControlSnapshot();
    const payload = schedulingPrioritiesData && typeof schedulingPrioritiesData === 'object'
      ? JSON.parse(JSON.stringify(schedulingPrioritiesData))
      : { Scheduling_Priorities: [] };
    const list = Array.isArray(payload.Scheduling_Priorities) ? payload.Scheduling_Priorities : [];
    const lookup = {};
    list.forEach(entry => {
      if (entry && entry.Name) lookup[String(entry.Name).trim()] = entry;
    });
    for (const [key, name] of Object.entries(sliderNameMap)) {
      if (!lookup[name]) continue;
      lookup[name].Rank = Number(snapshot[key] || lookup[name].Rank || 0);
    }
    payload.Scheduling_Priorities = list;
    return payload;
  }

  async function saveSchedulingPriorities() {
    try {
      const raw = buildSchedulingPrioritiesRaw();
      let body = raw;
      let headers = { 'Content-Type': 'text/yaml' };
      if (!raw) {
        const data = buildSchedulingPrioritiesData();
        body = JSON.stringify({ file: 'Scheduling_Priorities.yml', data });
        headers = { 'Content-Type': 'application/json' };
      }
      const resp = await fetch(apiBase() + '/api/settings?file=Scheduling_Priorities.yml', {
        method: 'POST',
        headers,
        body,
      });
      await resp.text().catch(() => '');
    } catch { }
  }

  function queueSettingsSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveSchedulingPriorities();
    }, 500);
  }

  loadLocalControls();
  loadSchedulingPriorities();

  for (const [key, slider] of Object.entries(sliders)) {
    if (!slider) continue;
    slider.addEventListener('input', () => {
      if (vals[key]) vals[key].textContent = slider.value;
      saveLocalControls();
      queueSettingsSave();
    });
  }
  toggleCutting?.addEventListener('change', () => saveLocalControls());

  const content = el.querySelector('.content') || el;
  const btnRefresh = content.querySelector('#todayRefresh');
  const btnResched = content.querySelector('#todayReschedule');
  const btnStartDay = content.querySelector('#todayStartDay');
  const selSummary = content.querySelector('#selSummary');
  const selHint = content.querySelector('#selHint');
  const calendarContext = content.querySelector('#calendarContext');
  const calendarDayLabel = content.querySelector('#calendarDayLabel');
  const calendarDayNote = content.querySelector('#calendarDayNote');
  const selectedItemInput = content.querySelector('#selectedItemInput');
  const todayItemList = content.querySelector('#todayItemList');
  const btnTrim5 = content.querySelector('#trim5');
  const btnTrim10 = content.querySelector('#trim10');
  const inputTrim = content.querySelector('#trimCustom');
  const btnTrimGo = content.querySelector('#trimGo');
  const inputChange = content.querySelector('#changeTime');
  const btnChangeGo = content.querySelector('#changeGo');
  const btnCutGo = content.querySelector('#cutGo');
  const btnMarkDone = content.querySelector('#markDone');
  const btnMarkSkipped = content.querySelector('#markSkipped');
  const btnMarkDelayed = content.querySelector('#markDelayed');
  const btnCompleteItem = content.querySelector('#completeItem');
  const inputDidStart = content.querySelector('#didStart');
  const inputDidEnd = content.querySelector('#didEnd');
  const selectDidStatus = content.querySelector('#didStatus');
  const inputDidNote = content.querySelector('#didNote');
  const btnDidGo = content.querySelector('#didGo');

  let selected = null;
  let todayBlocks = [];
  let calendarOpen = false;
  let calendarDaySelected = false;
  let calendarDayIsToday = false;
  let calendarDayKey = null;
  let calendarDayDate = null;
  let lastPreviewKey = null;

  if (btnRefresh) btnRefresh.addEventListener('click', () => {
    console.log('[Chronos][Today] Refresh clicked');
    refreshScheduleForTarget({ force: true });
  });
  if (btnResched) btnResched.addEventListener('click', async () => {
    console.log('[Chronos][Today] Reschedule clicked');
    try {
      const resp = await fetch(apiBase() + '/api/today/reschedule', { method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body: 'reschedule: true' });
      const text = await resp.text();
      console.log('[Chronos][Today] Reschedule response:', text);
    } catch (e) { console.error('[Chronos][Today] Reschedule error:', e); }
    fetchToday({ silent: true });
  });
  if (btnStartDay) btnStartDay.addEventListener('click', () => startDay());

  const fxChk = content.querySelector('#todayFxToggle');
  let fxEnabled = (fxChk ? fxChk.checked : true);
  fxChk?.addEventListener('change', () => {
    fxEnabled = !!fxChk.checked;
    refreshSelectionSummary();
  });

  function pulseWidget() {
    try {
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
      setTimeout(() => el.classList.remove('pulse'), 1000);
    } catch { }
  }

  function isTodayKey(key) {
    if (!key) return false;
    const d = new Date();
    const y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), dd = ('0' + d.getDate()).slice(-2);
    return key === `${y}-${m}-${dd}`;
  }

  function dayKeyFromDate(date) {
    if (!date) return null;
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function dateAtMidnight(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function daysBetween(a, b) {
    const aa = dateAtMidnight(a).getTime();
    const bb = dateAtMidnight(b).getTime();
    return Math.round((bb - aa) / (24 * 60 * 60 * 1000));
  }

  function updateCalendarContextVisibility() {
    const show = calendarOpen && calendarDaySelected;
    if (calendarContext) calendarContext.style.display = show ? 'flex' : 'none';
    const canAct = calendarDayIsToday;
    if (show) {
      if (calendarDayLabel) {
        calendarDayLabel.textContent = calendarDayDate
          ? `Calendar Day: ${calendarDayDate.toDateString()}`
          : 'Calendar Day: (unknown)';
      }
      if (calendarDayNote) {
        calendarDayNote.textContent = canAct ? '' : 'Actions are available for today only.';
      }
      setActionsEnabled(canAct);
    }
    const allowTodayActions = calendarDaySelected ? calendarDayIsToday : true;
    if (btnResched) btnResched.disabled = !allowTodayActions;
    if (btnStartDay) btnStartDay.disabled = !allowTodayActions;
  }

  function setActionsEnabled(enabled) {
    const controls = [
      selectedItemInput, btnTrim5, btnTrim10, inputTrim, btnTrimGo,
      inputChange, btnChangeGo, btnCutGo, btnMarkDone, btnMarkSkipped,
      btnMarkDelayed, btnCompleteItem, inputDidStart, inputDidEnd,
      selectDidStatus, inputDidNote, btnDidGo
    ];
    controls.forEach(ctrl => { if (ctrl) ctrl.disabled = !enabled; });
  }

  function hm(m) {
    const h = Math.floor((m || 0) / 60) % 24;
    const n = (m || 0) % 60;
    return String(h).padStart(2, '0') + ':' + String(n).padStart(2, '0');
  }

  function refreshSelectionSummary() {
    if (!selected) {
      if (selSummary) selSummary.textContent = 'Select a block in the calendar.';
      return;
    }
    const disp = (fxEnabled && window.ChronosVars && window.ChronosVars.expand)
      ? window.ChronosVars.expand(String(selected.text || ''))
      : String(selected.text || '');
    if (selSummary) selSummary.textContent = `${disp} (${hm(selected.start)}-${hm(selected.end || selected.start)})`;
  }

  function setSelected(item) {
    selected = item || null;
    if (!selected) {
      if (selectedItemInput) selectedItemInput.value = '';
      if (selSummary) selSummary.textContent = 'Select a block in the calendar.';
      return;
    }
    if (selectedItemInput) selectedItemInput.value = String(selected.text || '');
    refreshSelectionSummary();
    try { inputChange.value = hm(selected.start); } catch { }
  }

  function updateItemList(blocks) {
    todayBlocks = blocks || [];
    if (!todayItemList) return;
    todayItemList.innerHTML = '';
    todayBlocks.forEach(b => {
      const opt = document.createElement('option');
      opt.value = String(b.text || '');
      opt.label = b.start != null ? hm(b.start) : '';
      todayItemList.appendChild(opt);
    });
  }

  function findBlockByText(text) {
    if (!text) return null;
    const raw = String(text);
    const matches = todayBlocks.filter(b => String(b.text || '') === raw);
    if (!matches.length) return null;
    matches.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    const pick = matches[0];
    return { text: pick.text, type: pick.type, start: pick.start, end: pick.end };
  }

  selectedItemInput?.addEventListener('change', () => {
    const match = findBlockByText(selectedItemInput.value);
    if (match) setSelected(match);
  });
  selectedItemInput?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      const match = findBlockByText(selectedItemInput.value);
      if (match) setSelected(match);
    }
  });

  async function runCliPreview(command, args) {
    const body = `command: ${command}\nargs:\n${(args || []).map(a => '  - ' + String(a)).join('\n')}\n`;
    const resp = await fetch(apiBase() + '/api/cli', { method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body });
    const text = await resp.text();
    return { ok: resp.ok, text };
  }

  async function fetchSchedulePreview(date) {
    if (!date) return { ok: false, blocks: [] };
    const today = new Date();
    if (dateAtMidnight(date).getTime() < dateAtMidnight(today).getTime()) {
      return { ok: false, blocks: [], error: 'Past dates are not previewable yet.' };
    }
    const delta = daysBetween(today, date);
    if (delta <= 0) {
      return { ok: true, blocks: null };
    }
    const args = delta > 1 ? [`days:${delta}`] : [];
    const result = await runCliPreview('tomorrow', args);
    if (!result.ok) {
      return { ok: false, blocks: [], error: 'Preview unavailable.' };
    }
    const parsed = parseScheduleYaml(result.text || '');
    const blocks = normalizeScheduleBlocks(parsed.blocks);
    return { ok: true, blocks };
  }

  async function refreshScheduleForTarget({ force = false } = {}) {
    const targetDate = (calendarDaySelected && calendarDayDate) ? calendarDayDate : null;
    const targetKey = targetDate ? dayKeyFromDate(targetDate) : dayKeyFromDate(new Date());
    if (!force && targetKey && targetKey === lastPreviewKey) return;
    lastPreviewKey = targetKey;
    if (!targetDate || calendarDayIsToday) {
      await fetchToday({ silent: true });
      if (selHint) selHint.textContent = 'Select a day in Calendar to preview the schedule.';
      return;
    }
    const preview = await fetchSchedulePreview(targetDate);
    if (!preview.ok) {
      updateItemList([]);
      setSelected(null);
      if (selHint) selHint.textContent = preview.error || 'Preview unavailable for this day.';
      return;
    }
    if (Array.isArray(preview.blocks)) {
      updateItemList(preview.blocks);
      setSelected(null);
      if (selHint) selHint.textContent = `Previewing ${targetDate.toDateString()} (read-only).`;
    }
  }

  try {
    context?.bus?.on('calendar:open', () => {
      calendarOpen = true;
      updateCalendarContextVisibility();
    });
    context?.bus?.on('calendar:close', () => {
      calendarOpen = false;
      calendarDaySelected = false;
      calendarDayIsToday = false;
      calendarDayKey = null;
      calendarDayDate = null;
      setSelected(null);
      updateCalendarContextVisibility();
      refreshScheduleForTarget({ force: true });
    });
    context?.bus?.on('calendar:day-selected', (payload) => {
      const nextKey = payload?.key || null;
      if (calendarDayKey && nextKey && nextKey !== calendarDayKey) setSelected(null);
      calendarDaySelected = true;
      calendarDayKey = nextKey;
      calendarDayDate = payload?.date ? new Date(payload.date) : null;
      calendarDayIsToday = isTodayKey(calendarDayKey);
      updateCalendarContextVisibility();
      refreshScheduleForTarget({ force: true });
      if (calendarDaySelected && calendarOpen) pulseWidget();
    });
    context?.bus?.on('calendar:day-cleared', () => {
      calendarDaySelected = false;
      calendarDayIsToday = false;
      calendarDayKey = null;
      calendarDayDate = null;
      setSelected(null);
      updateCalendarContextVisibility();
      refreshScheduleForTarget({ force: true });
    });
    context?.bus?.on('calendar:selected', (payload) => {
      if (!payload) { setSelected(null); return; }
      setSelected(payload || null);
    });
  } catch { }

  async function runCli(command, args, properties) {
    const propLines = Object.entries(properties || {}).map(([k, v]) => `  ${k}: ${String(v)}`).join('\n');
    const body = `command: ${command}\nargs:\n${(args || []).map(a => '  - ' + String(a)).join('\n')}\n${propLines ? 'properties:\n' + propLines + '\n' : ''}`;
    const resp = await fetch(apiBase() + '/api/cli', { method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body });
    const text = await resp.text();
    return { ok: resp.ok, text };
  }

  function ensureSel() {
    if (!calendarDayIsToday) { alert('Actions are available for today only.'); return false; }
    if (!selected) { alert('Select an item in the calendar first.'); return false; }
    return true;
  }

  btnTrim5?.addEventListener('click', async () => { if (!ensureSel()) return; await runCli('trim', [selected.text, '5'], {}); });
  btnTrim10?.addEventListener('click', async () => { if (!ensureSel()) return; await runCli('trim', [selected.text, '10'], {}); });
  btnTrimGo?.addEventListener('click', async () => { if (!ensureSel()) return; const val = parseInt(inputTrim?.value || ''); if (!val || val <= 0) { alert('Enter minutes'); return; } await runCli('trim', [selected.text, String(val)], {}); });
  btnChangeGo?.addEventListener('click', async () => { if (!ensureSel()) return; const t = inputChange?.value || ''; if (!/^\d{2}:\d{2}$/.test(t)) { alert('Enter time HH:MM'); return; } await runCli('change', [selected.text, t], {}); });
  btnCutGo?.addEventListener('click', async () => { if (!ensureSel()) return; await runCli('cut', [selected.text], {}); });
  btnMarkDone?.addEventListener('click', async () => { if (!ensureSel()) return; await runCli('mark', [`${selected.text}:completed`], {}); });
  btnMarkSkipped?.addEventListener('click', async () => { if (!ensureSel()) return; await runCli('mark', [`${selected.text}:skipped`], {}); });
  btnMarkDelayed?.addEventListener('click', async () => { if (!ensureSel()) return; await runCli('mark', [`${selected.text}:delayed`], {}); });
  btnCompleteItem?.addEventListener('click', async () => {
    if (!ensureSel()) return;
    if (!selected.type) { alert('Selected item type is unknown.'); return; }
    await runCli('complete', [selected.type, selected.text], {});
  });
  btnDidGo?.addEventListener('click', async () => {
    if (!ensureSel()) return;
    const props = {};
    const st = inputDidStart?.value || '';
    const en = inputDidEnd?.value || '';
    const status = selectDidStatus?.value || '';
    const note = inputDidNote?.value || '';
    if (st) props.start_time = st;
    if (en) props.end_time = en;
    if (status) props.status = status;
    if (note) props.note = note;
    await runCli('did', [selected.text], props);
  });

  // Dragging/min/close
  const header = el.querySelector('#todayHeader');
  const btnMin = el.querySelector('#todayMin');
  const btnClose = el.querySelector('#todayClose');
  if (header && btnMin && btnClose) {
    header.addEventListener('pointerdown', (ev) => {
      const r = el.getBoundingClientRect(); const offX = ev.clientX - r.left, offY = ev.clientY - r.top;
      function move(e) { el.style.left = Math.max(6, e.clientX - offX) + 'px'; el.style.top = Math.max(6, e.clientY - offY) + 'px'; el.style.right = 'auto'; }
      function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    btnMin.addEventListener('click', () => el.classList.toggle('minimized'));
    btnClose.addEventListener('click', () => el.style.display = 'none');
  }

  // Resizers
  function edgeDrag(startRect, cb) { return (ev) => { ev.preventDefault(); function move(e) { cb(e, startRect); } function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); } window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); } }
  const re = el.querySelector('.resizer.e'); const rs = el.querySelector('.resizer.s'); const rse = el.querySelector('.resizer.se');
  if (re) re.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(260, e.clientX - sr.left) + 'px'; })(ev); });
  if (rs) rs.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.height = Math.max(160, e.clientY - sr.top) + 'px'; })(ev); });
  if (rse) rse.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(260, e.clientX - sr.left) + 'px'; el.style.height = Math.max(160, e.clientY - sr.top) + 'px'; })(ev); });

  async function startDay() {
    if (!btnStartDay) return;
    if (btnStartDay.disabled) return;
    btnStartDay.disabled = true;
    const prev = btnStartDay.textContent;
    btnStartDay.textContent = 'Starting...';
    try {
      if (typeof window.ChronosStartDay === 'function') {
        await window.ChronosStartDay({ source: 'today-widget', target: 'day' });
      } else {
        const resp = await fetch(apiBase() + '/api/day/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'day' }) });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.ok === false) throw new Error(data.error || data.stderr || `HTTP ${resp.status}`);
      }
      fetchToday({ silent: true });
      try { window.ChronosBus?.emit?.('timer:show', { source: 'today-widget' }); } catch { }
    } catch (err) {
      console.error('[Chronos][Today] start failed', err);
      alert(`Failed to start day: ${err?.message || err}`);
    } finally {
      btnStartDay.disabled = false;
      btnStartDay.textContent = prev;
    }
  }

  refreshScheduleForTarget({ force: true });
  console.log('[Chronos][Today] Widget ready');
  return {};
}
