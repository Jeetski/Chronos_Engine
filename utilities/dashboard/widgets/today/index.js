export function mount(el, context) {
    console.log('[Chronos][Today] Mounting Today widget');
    try { el.dataset.autoheight = 'off'; } catch { }

    // Load CSS
    if (!document.getElementById('scheduler-css')) {
        const link = document.createElement('link');
        link.id = 'scheduler-css';
        link.rel = 'stylesheet';
        link.href = './widgets/Today/scheduler.css';
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
                  <input type="checkbox" id="toggleKairosBuffers" checked title="Insert buffers between work blocks based on your buffer rules." />
                  Buffers
                </label>
                <label class="scheduler-check">
                  <input type="checkbox" id="toggleKairosTimerBreaks" title="Use timer-profile break logic instead of plain break handling." />
                  Timer Breaks
                </label>
                <label class="scheduler-check">
                  <input type="checkbox" id="toggleKairosSprints" title="Enable sprint-style clustering for focused execution blocks." />
                  Sprints
                </label>
                <label class="scheduler-check">
                  <input type="checkbox" id="toggleKairosIgnoreTrends" title="Ignore historical trend bias when scoring candidates." />
                  Ignore Trends
                </label>
                <label class="scheduler-check">
                  <input type="checkbox" id="toggleKairosRepairTrim" checked title="Allow repair phase to trim items before stronger conflict actions." />
                  Repair Trim
                </label>
                <label class="scheduler-check">
                  <input type="checkbox" id="toggleCutting" title="Allow repair phase to cut low-priority items if conflicts remain." />
                  Repair Cut
                </label>
              </div>
              <div class="button-row">
                <input class="scheduler-input" id="kairosTimerProfile" placeholder="Timer profile (optional)" style="min-width:180px; flex:1;" />
                <input class="scheduler-input" id="kairosTemplateOverride" placeholder="Template override (optional)" style="min-width:180px; flex:1;" />
              </div>
              <div class="button-row">
                <input class="scheduler-input" id="kairosQuickWins" type="number" min="0" max="240" step="5" placeholder="Quick wins max minutes (optional)" style="min-width:220px;" />
                <input class="scheduler-input" id="kairosRepairMinDuration" type="number" min="1" max="180" step="1" placeholder="Repair min duration (minutes)" style="min-width:220px;" />
              </div>
              <div class="button-row">
                <input class="scheduler-input" id="kairosRepairCutThreshold" type="number" min="0" max="1" step="0.05" placeholder="Repair cut threshold (0.0 - 1.0)" style="min-width:240px;" />
                <input class="scheduler-input" id="kairosStatusThreshold" type="number" min="0" max="1" step="0.05" placeholder="Status match threshold (0.0 - 1.0)" style="min-width:240px;" />
              </div>
              <div class="button-row">
                <span class="scheduler-hint" style="min-width:120px;">Kairos Presets</span>
                <button type="button" class="scheduler-btn" id="kairosPresetSafe" title="Trim on, cut off, min duration 20m, cut threshold 0.85.">Safe</button>
                <button type="button" class="scheduler-btn" id="kairosPresetBalanced" title="Trim on, cut on, min duration 12m, cut threshold 0.60.">Balanced</button>
                <button type="button" class="scheduler-btn" id="kairosPresetAggressive" title="Trim on, cut on, min duration 8m, cut threshold 0.40.">Aggressive</button>
              </div>
              <div class="button-row">
                <span class="scheduler-hint" id="kairosPresetHint">Safe: trim on, cut off, min 20m, threshold 0.85. Balanced: trim on, cut on, min 12m, threshold 0.60. Aggressive: trim on, cut on, min 8m, threshold 0.40.</span>
              </div>
              <div class="button-row" style="align-items:flex-start; flex-direction:column; width:100%;">
                <div class="button-row" style="width:100%; justify-content:space-between;">
                  <span class="scheduler-hint">Window Filter Overrides</span>
                  <button type="button" class="scheduler-btn" id="addKairosWindowFilterRow" title="Add another window filter override row.">+ Add Override</button>
                </div>
                <div id="kairosWindowFilterRows" style="display:flex; flex-direction:column; gap:8px; width:100%;"></div>
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
  const toggleKairosRepairTrim = el.querySelector('#toggleKairosRepairTrim');
  const kairosTimerProfile = el.querySelector('#kairosTimerProfile');
  const kairosTemplateOverride = el.querySelector('#kairosTemplateOverride');
  const kairosQuickWins = el.querySelector('#kairosQuickWins');
  const kairosRepairMinDuration = el.querySelector('#kairosRepairMinDuration');
  const kairosRepairCutThreshold = el.querySelector('#kairosRepairCutThreshold');
  const kairosStatusThreshold = el.querySelector('#kairosStatusThreshold');
  const kairosPresetSafe = el.querySelector('#kairosPresetSafe');
  const kairosPresetBalanced = el.querySelector('#kairosPresetBalanced');
  const kairosPresetAggressive = el.querySelector('#kairosPresetAggressive');
  const kairosPresetButtons = [kairosPresetSafe, kairosPresetBalanced, kairosPresetAggressive].filter(Boolean);
  const kairosWindowFilterRows = el.querySelector('#kairosWindowFilterRows');
  const addKairosWindowFilterRow = el.querySelector('#addKairosWindowFilterRow');
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

  function collectWindowFilterOverrides() {
    if (!kairosWindowFilterRows) return [];
    const rows = Array.from(kairosWindowFilterRows.querySelectorAll('.window-filter-row'));
    const out = [];
    for (const row of rows) {
      const name = String(row.querySelector('.window-filter-name')?.value || '').trim();
      const key = String(row.querySelector('.window-filter-key')?.value || '').trim();
      const value = String(row.querySelector('.window-filter-value')?.value || '').trim();
      if (!key || !value) continue;
      out.push({ window: name || '', key, value });
    }
    return out;
  }

  function addWindowFilterRow(initial = {}) {
    if (!kairosWindowFilterRows) return;
    const row = document.createElement('div');
    row.className = 'button-row window-filter-row';
    row.innerHTML = `
      <input class="scheduler-input window-filter-name" placeholder="Window name (optional, blank = all windows)" style="min-width:220px; flex:1;" />
      <input class="scheduler-input window-filter-key" placeholder="Filter key override (e.g. energy_mode)" style="min-width:220px; flex:1;" />
      <input class="scheduler-input window-filter-value" placeholder="Filter value override (CSV allowed)" style="min-width:220px; flex:1;" />
      <button type="button" class="scheduler-btn window-filter-remove" title="Remove this override row.">Remove</button>
    `;
    const nameInput = row.querySelector('.window-filter-name');
    const keyInput = row.querySelector('.window-filter-key');
    const valueInput = row.querySelector('.window-filter-value');
    const removeBtn = row.querySelector('.window-filter-remove');
    if (nameInput) nameInput.value = String(initial.window || '').trim();
    if (keyInput) keyInput.value = String(initial.key || '').trim();
    if (valueInput) valueInput.value = String(initial.value || '').trim();
    const onChange = () => saveLocalControls();
    nameInput?.addEventListener('input', onChange);
    keyInput?.addEventListener('input', onChange);
    valueInput?.addEventListener('input', onChange);
    removeBtn?.addEventListener('click', () => {
      row.remove();
      if (!kairosWindowFilterRows.querySelector('.window-filter-row')) addWindowFilterRow({});
      saveLocalControls();
    });
    kairosWindowFilterRows.appendChild(row);
  }

  function setWindowFilterOverrides(rows) {
    if (!kairosWindowFilterRows) return;
    kairosWindowFilterRows.innerHTML = '';
    const source = Array.isArray(rows) ? rows : [];
    if (!source.length) {
      addWindowFilterRow({});
      return;
    }
    for (const row of source) {
      if (!row || typeof row !== 'object') continue;
      addWindowFilterRow(row);
    }
    if (!kairosWindowFilterRows.querySelector('.window-filter-row')) addWindowFilterRow({});
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
      kairosRepairTrim: toggleKairosRepairTrim?.checked,
      kairosTimerProfile: kairosTimerProfile?.value,
      kairosTemplateOverride: kairosTemplateOverride?.value,
      kairosQuickWins: kairosQuickWins?.value,
      kairosRepairMinDuration: kairosRepairMinDuration?.value,
      kairosRepairCutThreshold: kairosRepairCutThreshold?.value,
      kairosStatusThreshold: kairosStatusThreshold?.value,
      kairosWindowFilterOverrides: collectWindowFilterOverrides(),
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
      if (saved.kairosRepairTrim !== undefined && toggleKairosRepairTrim) toggleKairosRepairTrim.checked = !!saved.kairosRepairTrim;
      if (saved.kairosTimerProfile !== undefined && kairosTimerProfile) kairosTimerProfile.value = saved.kairosTimerProfile;
      if (saved.kairosTemplateOverride !== undefined && kairosTemplateOverride) kairosTemplateOverride.value = saved.kairosTemplateOverride;
      if (saved.kairosQuickWins !== undefined && kairosQuickWins) kairosQuickWins.value = saved.kairosQuickWins;
      if (saved.kairosRepairMinDuration !== undefined && kairosRepairMinDuration) kairosRepairMinDuration.value = saved.kairosRepairMinDuration;
      if (saved.kairosRepairCutThreshold !== undefined && kairosRepairCutThreshold) kairosRepairCutThreshold.value = saved.kairosRepairCutThreshold;
      if (saved.kairosStatusThreshold !== undefined && kairosStatusThreshold) kairosStatusThreshold.value = saved.kairosStatusThreshold;
      if (Array.isArray(saved.kairosWindowFilterOverrides)) {
        setWindowFilterOverrides(saved.kairosWindowFilterOverrides);
      } else {
        const migrated = [];
        const mKey = String(saved.kairosWindowFilterKey || '').trim();
        const mValue = String(saved.kairosWindowFilterValue || '').trim();
        const mName = String(saved.kairosWindowFilterName || '').trim();
        if (mKey && mValue) migrated.push({ window: mName, key: mKey, value: mValue });
        setWindowFilterOverrides(migrated);
      }
      syncSliderLabels();
    } catch { }
  }

  const KAIROS_REPAIR_PRESETS = {
    safe: { trim: true, cut: false, minDuration: 20, cutThreshold: 0.85 },
    balanced: { trim: true, cut: true, minDuration: 12, cutThreshold: 0.60 },
    aggressive: { trim: true, cut: true, minDuration: 8, cutThreshold: 0.40 },
  };

  function setKairosPresetActive(name) {
    kairosPresetButtons.forEach(btn => btn.classList.remove('is-active'));
    const button =
      name === 'safe' ? kairosPresetSafe :
        name === 'balanced' ? kairosPresetBalanced :
          name === 'aggressive' ? kairosPresetAggressive : null;
    button?.classList.add('is-active');
  }

  function detectKairosPreset() {
    const trim = !!toggleKairosRepairTrim?.checked;
    const cut = !!toggleCutting?.checked;
    const minDuration = Number.parseInt(String(kairosRepairMinDuration?.value || ''), 10);
    const cutThreshold = Number.parseFloat(String(kairosRepairCutThreshold?.value || ''));
    if (!trim || Number.isNaN(minDuration) || Number.isNaN(cutThreshold)) return null;
    for (const [name, cfg] of Object.entries(KAIROS_REPAIR_PRESETS)) {
      if (cfg.trim !== trim) continue;
      if (cfg.cut !== cut) continue;
      if (cfg.minDuration !== minDuration) continue;
      if (Math.abs(cfg.cutThreshold - cutThreshold) < 0.001) return name;
    }
    return null;
  }

  function applyKairosRepairPreset(name) {
    const cfg = KAIROS_REPAIR_PRESETS[name];
    if (!cfg) return;
    if (toggleKairosRepairTrim) toggleKairosRepairTrim.checked = !!cfg.trim;
    if (toggleCutting) toggleCutting.checked = !!cfg.cut;
    if (kairosRepairMinDuration) kairosRepairMinDuration.value = String(cfg.minDuration);
    if (kairosRepairCutThreshold) kairosRepairCutThreshold.value = String(cfg.cutThreshold);
    saveLocalControls();
    setKairosPresetActive(name);
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
  if (kairosWindowFilterRows && !kairosWindowFilterRows.querySelector('.window-filter-row')) {
    setWindowFilterOverrides([]);
  }
  loadSchedulingPriorities();

  for (const [key, slider] of Object.entries(sliders)) {
    if (!slider) continue;
    slider.addEventListener('input', () => {
      if (vals[key]) vals[key].textContent = slider.value;
      saveLocalControls();
      queueSettingsSave();
    });
  }
  toggleCutting?.addEventListener('change', () => {
    saveLocalControls();
    setKairosPresetActive(detectKairosPreset());
  });
  toggleKairosBuffers?.addEventListener('change', () => saveLocalControls());
  toggleKairosTimerBreaks?.addEventListener('change', () => saveLocalControls());
  toggleKairosSprints?.addEventListener('change', () => saveLocalControls());
  toggleKairosIgnoreTrends?.addEventListener('change', () => saveLocalControls());
  toggleKairosRepairTrim?.addEventListener('change', () => {
    saveLocalControls();
    setKairosPresetActive(detectKairosPreset());
  });
  kairosTimerProfile?.addEventListener('input', () => saveLocalControls());
  kairosTemplateOverride?.addEventListener('input', () => saveLocalControls());
  kairosQuickWins?.addEventListener('input', () => saveLocalControls());
  kairosRepairMinDuration?.addEventListener('input', () => {
    saveLocalControls();
    setKairosPresetActive(detectKairosPreset());
  });
  kairosRepairCutThreshold?.addEventListener('input', () => {
    saveLocalControls();
    setKairosPresetActive(detectKairosPreset());
  });
  kairosStatusThreshold?.addEventListener('input', () => saveLocalControls());
  addKairosWindowFilterRow?.addEventListener('click', () => {
    addWindowFilterRow({});
    saveLocalControls();
  });
  customPropertyKey?.addEventListener('change', () => saveLocalControls());
  enforcerEnvironmentScope?.addEventListener('change', () => saveLocalControls());
  enforcerEnvironment?.addEventListener('input', () => saveLocalControls());
  enforcerTemplateDay?.addEventListener('change', () => saveLocalControls());
  enforcerTemplate?.addEventListener('input', () => saveLocalControls());
  scheduleState?.addEventListener('change', () => saveLocalControls());
  kairosPresetSafe?.addEventListener('click', () => applyKairosRepairPreset('safe'));
  kairosPresetBalanced?.addEventListener('click', () => applyKairosRepairPreset('balanced'));
  kairosPresetAggressive?.addEventListener('click', () => applyKairosRepairPreset('aggressive'));
  setKairosPresetActive(detectKairosPreset());

  const content = el.querySelector('.content') || el;
  const btnRefresh = content.querySelector('#todayRefresh');
  const btnResched = content.querySelector('#todayReschedule');
  const selHint = content.querySelector('#selHint');
  const calendarContext = content.querySelector('#calendarContext');
  const calendarDayLabel = content.querySelector('#calendarDayLabel');
  const calendarDayNote = content.querySelector('#calendarDayNote');
  const headerEl = el.querySelector('#todayHeader');

  let autoFitRaf = null;
  let lastAutoFitHeight = 0;
  let isApplyingAutoFit = false;
  function measureContentNaturalHeight(contentEl) {
    try {
      const cs = getComputedStyle(contentEl);
      const pt = Number.parseFloat(cs.paddingTop || '0') || 0;
      const pb = Number.parseFloat(cs.paddingBottom || '0') || 0;
      const gap = Number.parseFloat(cs.rowGap || cs.gap || '0') || 0;
      const children = Array.from(contentEl.children || []).filter((node) => {
        try { return getComputedStyle(node).display !== 'none'; } catch { return true; }
      });
      let total = pt + pb;
      children.forEach((node, idx) => {
        total += Math.ceil(node.getBoundingClientRect().height || 0);
        if (idx > 0) total += gap;
      });
      return Math.max(0, Math.ceil(total));
    } catch {
      return Math.ceil(contentEl?.scrollHeight || 0);
    }
  }
  function autoFitHeight() {
    try {
      if (!el || el.style.display === 'none') return;
      if (el.classList.contains('minimized')) return;
      if (isApplyingAutoFit) return;
      const contentEl = el.querySelector('.content');
      if (!contentEl) return;
      const headerH = Math.ceil(headerEl?.getBoundingClientRect?.().height || 40);
      const contentH = measureContentNaturalHeight(contentEl);
      const openSectionCount = contentEl.querySelectorAll('details[open]').length;
      const minHeight = openSectionCount <= 1 ? 170 : 220;
      const maxHeight = Math.max(minHeight, Math.floor((window.innerHeight || 900) * 0.9));
      const desired = headerH + contentH + 8;
      const clamped = Math.max(minHeight, Math.min(maxHeight, desired));
      if (Math.abs(clamped - lastAutoFitHeight) < 6) return;
      isApplyingAutoFit = true;
      el.style.height = `${clamped}px`;
      lastAutoFitHeight = clamped;
      // Safety: never leave the widget smaller than its visible content.
      const overflow = Math.ceil((contentEl.scrollHeight || 0) - (contentEl.clientHeight || 0));
      if (overflow > 2) {
        const currentH = Math.ceil(el.getBoundingClientRect().height || clamped);
        const needed = currentH + overflow + 8;
        const safeHeight = Math.max(currentH, needed, minHeight);
        if (safeHeight > currentH + 1) {
          el.style.height = `${safeHeight}px`;
          lastAutoFitHeight = safeHeight;
        }
      }
      isApplyingAutoFit = false;
    } catch { }
  }
  function queueAutoFitHeight() {
    try {
      if (autoFitRaf) cancelAnimationFrame(autoFitRaf);
      autoFitRaf = requestAnimationFrame(() => {
        autoFitRaf = requestAnimationFrame(() => {
          autoFitRaf = null;
          autoFitHeight();
        });
      });
    } catch {
      autoFitHeight();
    }
  }
  try {
    content.addEventListener('toggle', () => queueAutoFitHeight(), true);
  } catch { }
  try {
    content.querySelectorAll('details').forEach((d) => d.addEventListener('toggle', () => queueAutoFitHeight()));
  } catch { }
  // Avoid ResizeObserver here: observing geometry while changing height causes oscillation loops.
  try {
    const mo = new MutationObserver(() => queueAutoFitHeight());
    mo.observe(content, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'style', 'class', 'hidden'] });
  } catch { }
  try {
    window.addEventListener('resize', () => queueAutoFitHeight());
  } catch { }

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
    const targetDate = (calendarDaySelected && calendarDayDate) ? new Date(calendarDayDate) : new Date();
    const props = {};
    if (toggleKairosBuffers) props.buffers = !!toggleKairosBuffers.checked;
    if (toggleKairosTimerBreaks) props.breaks = toggleKairosTimerBreaks.checked ? 'timer' : 'none';
    if (toggleKairosSprints) props.sprints = !!toggleKairosSprints.checked;
    if (toggleKairosIgnoreTrends) props['ignore-trends'] = !!toggleKairosIgnoreTrends.checked;
    if (toggleKairosRepairTrim) props['repair-trim'] = !!toggleKairosRepairTrim.checked;
    if (toggleCutting) props['repair-cut'] = !!toggleCutting.checked;
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
    if (kairosRepairMinDuration && String(kairosRepairMinDuration.value || '').trim()) {
      const minDuration = Number.parseInt(String(kairosRepairMinDuration.value).trim(), 10);
      if (!Number.isNaN(minDuration) && minDuration >= 1) props['repair-min-duration'] = minDuration;
    }
    if (kairosRepairCutThreshold && String(kairosRepairCutThreshold.value || '').trim()) {
      const cutThreshold = Number.parseFloat(String(kairosRepairCutThreshold.value).trim());
      if (!Number.isNaN(cutThreshold)) props['repair-cut-threshold'] = cutThreshold;
    }
    if (kairosStatusThreshold && String(kairosStatusThreshold.value || '').trim()) {
      const statusThresholdRaw = Number.parseFloat(String(kairosStatusThreshold.value).trim());
      if (!Number.isNaN(statusThresholdRaw)) {
        const statusThreshold = Math.max(0, Math.min(1, statusThresholdRaw));
        props['status-threshold'] = statusThreshold;
      }
    }
    const windowFilterOverrides = collectWindowFilterOverrides();
    if (windowFilterOverrides.length) {
      props.window_filter_overrides = windowFilterOverrides;
    }
    let generated = false;
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
      generated = true;
    } catch (e) { console.error('[Chronos][Today] Reschedule error:', e); }
    if (generated) {
      await openCalendarOnDate(targetDate);
    }
    fetchToday({ silent: true });
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
    }
    const allowTodayActions = calendarDaySelected ? calendarDayIsToday : true;
    if (btnResched) btnResched.disabled = !allowTodayActions;
    queueAutoFitHeight();
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

  async function openCalendarOnDate(date) {
    const target = date ? new Date(date) : new Date();
    try {
      await window.ChronosOpenView?.('Calendar', 'Calendar');
    } catch { }
    try {
      if (typeof window.__calendarGoToDay === 'function') {
        window.__calendarGoToDay(target, { pushHistory: false });
      } else if (typeof window.calendarLoadToday === 'function') {
        window.calendarLoadToday(true);
      }
    } catch { }
    try { window.__calendarRefreshDayList?.(); } catch { }
    try {
      setTimeout(() => {
        try { window.__calendarRefreshDayList?.(); } catch { }
      }, 120);
    } catch { }
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
  const header = headerEl;
  const btnMin = el.querySelector('#todayMin');
  const btnClose = el.querySelector('#todayClose');
  if (header && btnMin && btnClose) {
    header.addEventListener('pointerdown', (ev) => {
      const r = el.getBoundingClientRect(); const offX = ev.clientX - r.left, offY = ev.clientY - r.top;
      function move(e) { el.style.left = Math.max(6, e.clientX - offX) + 'px'; el.style.top = Math.max(6, e.clientY - offY) + 'px'; el.style.right = 'auto'; }
      function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    btnMin.addEventListener('click', () => {
      el.classList.toggle('minimized');
      if (!el.classList.contains('minimized')) queueAutoFitHeight();
    });
    btnClose.addEventListener('click', () => el.style.display = 'none');
  }

  // Resizers
  function edgeDrag(startRect, cb) { return (ev) => { ev.preventDefault(); function move(e) { cb(e, startRect); } function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); } window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); } }
  const re = el.querySelector('.resizer.e'); const rs = el.querySelector('.resizer.s'); const rse = el.querySelector('.resizer.se');
  if (re) re.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(260, e.clientX - sr.left) + 'px'; })(ev); });
  if (rs) rs.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.height = Math.max(160, e.clientY - sr.top) + 'px'; })(ev); });
  if (rse) rse.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(260, e.clientX - sr.left) + 'px'; el.style.height = Math.max(160, e.clientY - sr.top) + 'px'; })(ev); });

  refreshScheduleForTarget({ force: true });
  queueAutoFitHeight();
  console.log('[Chronos][Today] Widget ready');
  return {};
}
