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
        <button class="btn-large btn-refresh" id="todayRefresh">↻ Refresh</button>
        <button class="btn-large btn-reschedule" id="todayReschedule">📅 Generate / Reschedule</button>
      </div>

      <!-- Scheduling Controls -->
      <details class="scheduler-section" id="schedControls">
        <summary>⚙️ Scheduling Controls</summary>
        <div class="scheduler-section-content">
          <details class="scheduler-subsection" open>
            <summary>Priority Weights (1-10)</summary>
            <div class="action-group">
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
          </details>
          <details class="scheduler-subsection">
            <summary>Advanced Weights</summary>
            <div class="action-group">
              <div class="slider-row">
                <label for="sliderCustomProperty">Custom Property</label>
                <input class="scheduler-input" id="customPropertyKey" placeholder="Property key (e.g. energy, focus_depth)" style="min-width:160px;" />
                <input type="range" id="sliderCustomProperty" min="1" max="10" value="5" />
                <span class="slider-value" id="valCustomProperty">5</span>
              </div>
              <div class="slider-row">
                <label for="sliderBalance">Weekly Balance</label>
                <input type="range" id="sliderBalance" min="1" max="10" value="5" />
                <span class="slider-value" id="valBalance">5</span>
              </div>
            </div>
          </details>
          <details class="scheduler-subsection">
            <summary>Enforcers</summary>
            <div class="action-group">
              <div class="button-row">
                <select class="scheduler-input" id="enforcerEnvironmentScope" style="min-width:110px;">
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="slot">Slot</option>
                </select>
                <input class="scheduler-input" id="enforcerEnvironment" placeholder="Environment (e.g. library)" style="flex:1;" />
              </div>
              <div class="button-row">
                <input class="scheduler-input" id="enforcerTemplateDay" type="date" style="min-width:150px;" />
                <input class="scheduler-input" id="enforcerTemplate" placeholder="Template name" style="flex:1;" />
              </div>
              <div class="button-row">
                <select class="scheduler-input" id="scheduleState" style="min-width:140px;">
                  <option value="draft">Draft schedule</option>
                  <option value="committed">Committed schedule</option>
                </select>
                <span class="scheduler-hint">Use draft before committing schedule changes.</span>
              </div>
            </div>
          </details>
          <details class="scheduler-subsection">
            <summary>Quick Toggles</summary>
            <div class="action-group">
              <div class="button-row">
                <label class="scheduler-check">
                  <input type="checkbox" id="toggleKairosBuffers" checked />
                  Buffers
                </label>
                <label class="scheduler-check">
                  <input type="checkbox" id="toggleKairosTimerBreaks" />
                  Timer Breaks
                </label>
                <label class="scheduler-check">
                  <input type="checkbox" id="toggleKairosSprints" />
                  Sprints
                </label>
                <label class="scheduler-check">
                  <input type="checkbox" id="toggleKairosIgnoreTrends" />
                  Ignore Trends
                </label>
                <label class="scheduler-check">
                  <input type="checkbox" id="toggleCutting" />
                  Allow Item Cutting
                </label>
              </div>
              <div class="button-row">
                <input class="scheduler-input" id="kairosTimerProfile" placeholder="Timer profile (optional)" style="min-width:180px; flex:1;" />
                <input class="scheduler-input" id="kairosTemplateOverride" placeholder="Template override (optional)" style="min-width:180px; flex:1;" />
              </div>
              <div class="button-row">
                <input class="scheduler-input" id="kairosQuickWins" type="number" min="0" max="240" step="5" placeholder="Quick wins max minutes (optional)" style="min-width:220px;" />
              </div>
            </div>
          </details>
        </div>
      </details>

      <!-- Calendar Context (hidden by default) -->
      <div id="calendarContext" style="display:none; flex-direction:column; gap:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="scheduler-hint" id="calendarDayLabel">Calendar day selected.</span>
          <span class="scheduler-hint" id="calendarDayNote"></span>
        </div>
        <div class="scheduler-hint">Scheduler controls apply to this day.</div>
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
    customProperty: el.querySelector('#sliderCustomProperty'),
    balance: el.querySelector('#sliderBalance'),
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
    customProperty: el.querySelector('#valCustomProperty'),
    balance: el.querySelector('#valBalance'),
  };
  const toggleCutting = el.querySelector('#toggleCutting');
  const toggleKairosBuffers = el.querySelector('#toggleKairosBuffers');
  const toggleKairosTimerBreaks = el.querySelector('#toggleKairosTimerBreaks');
  const toggleKairosSprints = el.querySelector('#toggleKairosSprints');
  const toggleKairosIgnoreTrends = el.querySelector('#toggleKairosIgnoreTrends');
  const kairosTimerProfile = el.querySelector('#kairosTimerProfile');
  const kairosTemplateOverride = el.querySelector('#kairosTemplateOverride');
  const kairosQuickWins = el.querySelector('#kairosQuickWins');
  const customPropertyKey = el.querySelector('#customPropertyKey');
  const enforcerEnvironmentScope = el.querySelector('#enforcerEnvironmentScope');
  const enforcerEnvironment = el.querySelector('#enforcerEnvironment');
  const enforcerTemplateDay = el.querySelector('#enforcerTemplateDay');
  const enforcerTemplate = el.querySelector('#enforcerTemplate');
  const scheduleState = el.querySelector('#scheduleState');

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
      customProperty: sliders.customProperty?.value,
      balance: sliders.balance?.value,
      customPropertyKey: customPropertyKey?.value,
      enforcerEnvironmentScope: enforcerEnvironmentScope?.value,
      enforcerEnvironment: enforcerEnvironment?.value,
      enforcerTemplateDay: enforcerTemplateDay?.value,
      enforcerTemplate: enforcerTemplate?.value,
      scheduleState: scheduleState?.value,
      allowCutting: toggleCutting?.checked,
      kairosBuffers: toggleKairosBuffers?.checked,
      kairosTimerBreaks: toggleKairosTimerBreaks?.checked,
      kairosSprints: toggleKairosSprints?.checked,
      kairosIgnoreTrends: toggleKairosIgnoreTrends?.checked,
      kairosTimerProfile: kairosTimerProfile?.value,
      kairosTemplateOverride: kairosTemplateOverride?.value,
      kairosQuickWins: kairosQuickWins?.value,
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
      if (saved.customProperty) sliders.customProperty.value = saved.customProperty;
      if (saved.balance) sliders.balance.value = saved.balance;
      if (saved.customPropertyKey && customPropertyKey) customPropertyKey.value = saved.customPropertyKey;
      if (saved.enforcerEnvironmentScope && enforcerEnvironmentScope) enforcerEnvironmentScope.value = saved.enforcerEnvironmentScope;
      if (saved.enforcerEnvironment !== undefined && enforcerEnvironment) enforcerEnvironment.value = saved.enforcerEnvironment;
      if (saved.enforcerTemplateDay !== undefined && enforcerTemplateDay) enforcerTemplateDay.value = saved.enforcerTemplateDay;
      if (saved.enforcerTemplate !== undefined && enforcerTemplate) enforcerTemplate.value = saved.enforcerTemplate;
      if (saved.scheduleState && scheduleState) scheduleState.value = saved.scheduleState;
      if (saved.allowCutting !== undefined) toggleCutting.checked = saved.allowCutting;
      if (saved.kairosBuffers !== undefined && toggleKairosBuffers) toggleKairosBuffers.checked = !!saved.kairosBuffers;
      if (saved.kairosTimerBreaks !== undefined && toggleKairosTimerBreaks) toggleKairosTimerBreaks.checked = !!saved.kairosTimerBreaks;
      if (saved.kairosSprints !== undefined && toggleKairosSprints) toggleKairosSprints.checked = !!saved.kairosSprints;
      if (saved.kairosIgnoreTrends !== undefined && toggleKairosIgnoreTrends) toggleKairosIgnoreTrends.checked = !!saved.kairosIgnoreTrends;
      if (saved.kairosTimerProfile !== undefined && kairosTimerProfile) kairosTimerProfile.value = saved.kairosTimerProfile;
      if (saved.kairosTemplateOverride !== undefined && kairosTemplateOverride) kairosTemplateOverride.value = saved.kairosTemplateOverride;
      if (saved.kairosQuickWins !== undefined && kairosQuickWins) kairosQuickWins.value = saved.kairosQuickWins;
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
  toggleKairosBuffers?.addEventListener('change', () => saveLocalControls());
  toggleKairosTimerBreaks?.addEventListener('change', () => saveLocalControls());
  toggleKairosSprints?.addEventListener('change', () => saveLocalControls());
  toggleKairosIgnoreTrends?.addEventListener('change', () => saveLocalControls());
  kairosTimerProfile?.addEventListener('input', () => saveLocalControls());
  kairosTemplateOverride?.addEventListener('input', () => saveLocalControls());
  kairosQuickWins?.addEventListener('input', () => saveLocalControls());
  customPropertyKey?.addEventListener('change', () => saveLocalControls());
  enforcerEnvironmentScope?.addEventListener('change', () => saveLocalControls());
  enforcerEnvironment?.addEventListener('input', () => saveLocalControls());
  enforcerTemplateDay?.addEventListener('change', () => saveLocalControls());
  enforcerTemplate?.addEventListener('input', () => saveLocalControls());
  scheduleState?.addEventListener('change', () => saveLocalControls());

  const content = el.querySelector('.content') || el;
  const btnRefresh = content.querySelector('#todayRefresh');
  const btnResched = content.querySelector('#todayReschedule');
  const selHint = content.querySelector('#selHint');
  const calendarContext = content.querySelector('#calendarContext');
  const calendarDayLabel = content.querySelector('#calendarDayLabel');
  const calendarDayNote = content.querySelector('#calendarDayNote');

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
    const props = {};
    if (toggleKairosBuffers) props.buffers = !!toggleKairosBuffers.checked;
    if (toggleKairosTimerBreaks) props.breaks = toggleKairosTimerBreaks.checked ? 'timer' : 'none';
    if (toggleKairosSprints) props.sprints = !!toggleKairosSprints.checked;
    if (toggleKairosIgnoreTrends) props['ignore-trends'] = !!toggleKairosIgnoreTrends.checked;
    const customPropKey = String(customPropertyKey?.value || '').trim();
    if (customPropKey) {
      props.custom_property = customPropKey;
      const customWeight = Number.parseInt(String(sliders.customProperty?.value || '0'), 10);
      if (!Number.isNaN(customWeight) && customWeight > 0) {
        props.prioritize = `custom_property=${customWeight}`;
      }
    }
    if (kairosTimerProfile && String(kairosTimerProfile.value || '').trim()) {
      props.timer_profile = String(kairosTimerProfile.value).trim();
    }
    if (kairosTemplateOverride && String(kairosTemplateOverride.value || '').trim()) {
      props.template = String(kairosTemplateOverride.value).trim();
    }
    if (kairosQuickWins && String(kairosQuickWins.value || '').trim()) {
      const qwm = Number.parseInt(String(kairosQuickWins.value).trim(), 10);
      if (!Number.isNaN(qwm) && qwm >= 0) props.quickwins = qwm;
    }
    try {
      const resp = await fetch(apiBase() + '/api/cli', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'today',
          args: ['reschedule'],
          properties: props,
        }),
      });
      const payload = await resp.json().catch(() => ({}));
      console.log('[Chronos][Today] Reschedule response:', payload);
      if (!resp.ok) throw new Error(payload?.stderr || payload?.error || 'Reschedule failed');
    } catch (e) { console.error('[Chronos][Today] Reschedule error:', e); }
    fetchToday({ silent: true });
  });

  const fxChk = content.querySelector('#todayFxToggle');
  fxChk?.addEventListener('change', () => { });

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
    }
    const allowTodayActions = calendarDaySelected ? calendarDayIsToday : true;
    if (btnResched) btnResched.disabled = !allowTodayActions;
  }

  function hm(m) {
    const h = Math.floor((m || 0) / 60) % 24;
    const n = (m || 0) % 60;
    return String(h).padStart(2, '0') + ':' + String(n).padStart(2, '0');
  }


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
      if (selHint) selHint.textContent = preview.error || 'Preview unavailable for this day.';
      return;
    }
    if (Array.isArray(preview.blocks)) {
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
      updateCalendarContextVisibility();
      refreshScheduleForTarget({ force: true });
    });
    context?.bus?.on('calendar:day-selected', (payload) => {
      const nextKey = payload?.key || null;
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
      updateCalendarContextVisibility();
      refreshScheduleForTarget({ force: true });
    });
  } catch { }

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

  refreshScheduleForTarget({ force: true });
  console.log('[Chronos][Today] Widget ready');
  return {};
}
