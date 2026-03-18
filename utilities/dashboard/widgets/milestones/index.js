export function mount(el, context) {
  // Load CSS
  if (!document.getElementById('milestones-css')) {
    const link = document.createElement('link');
    link.id = 'milestones-css';
    link.rel = 'stylesheet';
    link.href = new URL('./milestones.css', import.meta.url).toString();
    document.head.appendChild(link);
  }

  el.className = 'widget milestones-widget';
  try {
    el.dataset.uiId = 'widget.milestones';
    el.dataset.autoheight = 'off';
    el.dataset.minWidth = '520';
    el.dataset.minHeight = '280';
    el.style.minWidth = '520px';
    el.style.minHeight = '280px';
    if (!el.style.width) el.style.width = '560px';
    if (!el.style.height) el.style.height = '320px';
    if ((parseFloat(el.style.width) || 0) < 520) el.style.width = '520px';
    if ((parseFloat(el.style.height) || 0) < 280) el.style.height = '280px';
  } catch { }

  const tpl = `
    <style>
      .ms-content { display:flex; flex-direction:column; gap:10px; min-height:0; }
      .ms-cards { display:flex; gap:10px; flex-wrap:wrap; }
      .ms-card { flex:1 1 160px; border:1px solid var(--border); border-radius:10px; padding:10px; background:#0f141d; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.02); }
      .ms-card h4 { margin:0 0 4px; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-dim); }
      .ms-card-value { font-size:26px; font-weight:800; margin:2px 0; }
      .ms-card-meta { font-size:12px; color:var(--text-dim); }
      .ms-status { min-height:18px; font-size:13px; color:var(--text-dim); }
      .ms-status.error { color:#ef6a6a; }
      .ms-status.success { color:#5bdc82; }
      .ms-list { display:flex; flex-direction:column; gap:10px; flex:1 1 auto; min-height:180px; max-height:420px; overflow:auto; }
      .ms-list-toggle { align-self:flex-start; }
      .ms-list-section[hidden] { display:none !important; }
      .ms-list-section { display:flex; flex-direction:column; gap:10px; flex:1 1 auto; min-height:0; }
      .ms-item { border:1px solid var(--border); border-radius:10px; padding:10px; background:#0f141d; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.02); display:flex; flex-direction:column; gap:6px; }
      .ms-head { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:nowrap; cursor:pointer; }
      .ms-name { font-size:15px; font-weight:700; }
      .ms-pill { padding:2px 10px; border-radius:999px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; }
      .ms-pill.icon {
        width:28px;
        height:28px;
        padding:0;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:15px;
        font-weight:700;
        letter-spacing:0;
        text-transform:none;
        border:1px solid rgba(255,255,255,0.08);
        box-shadow:inset 0 0 0 1px rgba(255,255,255,0.02);
      }
      .ms-pill.pending { background:rgba(201,167,75,0.16); color:#f0c96c; }
      .ms-pill.in-progress { background:rgba(255,190,92,0.18); color:#ffbe5c; }
      .ms-pill.completed { background:rgba(91,220,130,0.18); color:#5bdc82; }
      .ms-progress-bar { height:8px; border-radius:999px; background:#0b0f16; border:1px solid var(--border); overflow:hidden; }
      .ms-progress-fill { height:100%; background:linear-gradient(90deg,#2a5cff,#7aa2f7); }
      .ms-meta { font-size:12px; color:var(--text-dim); }
      .ms-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
      .ms-head-left { display:flex; align-items:center; gap:8px; min-width:0; }
      .ms-expander { font-size:12px; color:var(--text-dim); width:14px; text-align:center; user-select:none; }
      .ms-head-actions { display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
      .ms-detail { display:none; flex-direction:column; gap:6px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.06); margin-top:4px; }
      .ms-item.expanded .ms-detail { display:flex; }
    </style>
    <div class="header" data-ui-id="widget.milestones.header">
      <div class="title" data-ui-id="widget.milestones.title">Milestones</div>
      <div class="controls" style="align-items:center; gap:6px;">
        <button class="icon-btn" id="msRefresh" title="Refresh" aria-label="Refresh" data-ui-id="widget.milestones.refresh_button">↻</button>
        <button class="icon-btn" id="msMin" data-ui-id="widget.milestones.minimize_button">_</button>
        <button class="icon-btn" id="msClose" data-ui-id="widget.milestones.close_button">x</button>
      </div>
    </div>
    <div class="content ms-content" data-ui-id="widget.milestones.panel">
      <div class="ms-cards">
        <div class="ms-card">
          <h4>Total</h4>
          <div class="ms-card-value" id="msTotal" data-ui-id="widget.milestones.total_text">--</div>
          <div class="ms-card-meta">All milestones.</div>
        </div>
        <div class="ms-card">
          <h4>Completed</h4>
          <div class="ms-card-value" id="msCompleted" data-ui-id="widget.milestones.completed_text">--</div>
          <div class="ms-card-meta">Finished milestones.</div>
        </div>
        <div class="ms-card">
          <h4>In Progress</h4>
          <div class="ms-card-value" id="msInProgress" data-ui-id="widget.milestones.in_progress_text">--</div>
          <div class="ms-card-meta">Milestones currently active.</div>
        </div>
      </div>
      <button class="btn ms-list-toggle" id="msListToggle" aria-expanded="false" data-ui-id="widget.milestones.list_toggle_button">Show List Section ▾</button>
      <div id="msListSection" class="ms-list-section" hidden data-ui-id="widget.milestones.list_section">
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <input id="msSearch" class="input" placeholder="Search milestones..." style="flex:1 1 220px; min-width:160px;" data-ui-id="widget.milestones.search_input" />
          <select id="msStatusFilter" class="input" style="flex:0 0 180px;" data-ui-id="widget.milestones.status_filter_select">
            <option value="all">All states</option>
            <option value="pending">Pending</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          <select id="msProjectFilter" class="input" style="flex:0 0 200px;" data-ui-id="widget.milestones.project_filter_select">
            <option value="all">All projects</option>
          </select>
          <select id="msGoalFilter" class="input" style="flex:0 0 220px;" data-ui-id="widget.milestones.goal_filter_select">
            <option value="all">All goals</option>
          </select>
        </div>
        <div class="row" style="gap:8px; align-items:center;">
          <button class="btn btn-primary" id="msPrimaryComplete" title="Complete primary milestone" aria-label="Complete primary milestone" data-ui-id="widget.milestones.complete_primary_button">✓</button>
          <button class="btn btn-secondary" id="msPrimaryReset" data-ui-id="widget.milestones.reset_primary_button">Reset Primary</button>
          <div class="spacer"></div>
        </div>
        <div id="msStatus" class="ms-status" data-ui-id="widget.milestones.status_text"></div>
        <div id="msList" class="ms-list" data-ui-id="widget.milestones.list_container"></div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const btnMin = el.querySelector('#msMin');
  const btnClose = el.querySelector('#msClose');
  const refreshBtn = el.querySelector('#msRefresh');
  const listToggleBtn = el.querySelector('#msListToggle');
  const listSectionEl = el.querySelector('#msListSection');
  const searchEl = el.querySelector('#msSearch');
  const statusSel = el.querySelector('#msStatusFilter');
  const projectSel = el.querySelector('#msProjectFilter');
  const goalSel = el.querySelector('#msGoalFilter');
  const statusLine = el.querySelector('#msStatus');
  const listEl = el.querySelector('#msList');
  const totalEl = el.querySelector('#msTotal');
  const completedEl = el.querySelector('#msCompleted');
  const inProgressEl = el.querySelector('#msInProgress');
  const primaryCompleteBtn = el.querySelector('#msPrimaryComplete');
  const primaryResetBtn = el.querySelector('#msPrimaryReset');

  btnMin.addEventListener('click', () => { el.classList.toggle('minimized'); setStatus(el.classList.contains('minimized') ? 'Minimized.' : ''); });
  btnClose.addEventListener('click', () => { el.style.display = 'none'; try { setStatus('Closed.'); window?.ChronosBus?.emit?.('widget:closed', 'Milestones'); } catch { } });

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

  let milestones = [];
  let counts = { total: 0, completed: 0, in_progress: 0, pending: 0 };
  let loading = false;
  const expanded = new Set();
  let pendingFilter = null;
  let layoutQueued = false;
  let collapsedHeight = 280;

  function measureContainerHeight(container) {
    if (!container) return 0;
    try {
      const cs = getComputedStyle(container);
      const pt = Number.parseFloat(cs.paddingTop || '0') || 0;
      const pb = Number.parseFloat(cs.paddingBottom || '0') || 0;
      const gap = Number.parseFloat(cs.rowGap || cs.gap || '0') || 0;
      const children = Array.from(container.children || []).filter((node) => {
        try { return getComputedStyle(node).display !== 'none'; } catch { return true; }
      });
      let total = pt + pb;
      children.forEach((node, idx) => {
        total += Math.ceil(node.getBoundingClientRect().height || 0);
        if (idx > 0) total += gap;
      });
      return Math.max(0, Math.ceil(total));
    } catch {
      return Math.ceil(container.scrollHeight || 0);
    }
  }

  function measureDesiredListHeight() {
    if (!listEl) return 180;
    try {
      const cs = getComputedStyle(listEl);
      const gap = Number.parseFloat(cs.rowGap || cs.gap || '0') || 0;
      const visibleChildren = Array.from(listEl.children || []).filter((node) => {
        try { return getComputedStyle(node).display !== 'none'; } catch { return true; }
      });
      if (!visibleChildren.length) return 180;
      let total = 0;
      visibleChildren.slice(0, 3).forEach((node, idx) => {
        total += Math.ceil(node.getBoundingClientRect().height || 0);
        if (idx > 0) total += gap;
      });
      return Math.max(180, Math.min(360, total));
    } catch {
      return 220;
    }
  }

  function applyWidgetHeight(targetHeight, targetMinHeight = collapsedHeight) {
    const nextMin = Math.max(220, Math.ceil(targetMinHeight || 0));
    const nextHeight = Math.max(nextMin, Math.ceil(targetHeight || 0));
    collapsedHeight = nextMin;
    el.dataset.minHeight = String(nextMin);
    el.style.minHeight = `${nextMin}px`;
    el.style.height = `${nextHeight}px`;
    try {
      el.__minH = nextMin;
      window.installWidgetResizers?.(el);
    } catch { }
  }

  function syncWidgetHeight() {
    const headerEl = el.querySelector('.header');
    const contentEl = el.querySelector('.content');
    if (!headerEl || !contentEl) return;
    const headerH = Math.ceil(headerEl.getBoundingClientRect().height || 40);
    if (listSectionEl?.hidden) {
      if (listSectionEl) {
        listSectionEl.style.flex = '';
        listSectionEl.style.height = '';
      }
      if (listEl) {
        listEl.style.height = '';
        listEl.style.maxHeight = '420px';
      }
      const target = headerH + measureContainerHeight(contentEl) + 8;
      applyWidgetHeight(target, target);
      return;
    }
    const listHeight = measureDesiredListHeight();
    if (listSectionEl) {
      listSectionEl.style.flex = '0 0 auto';
      listSectionEl.style.height = 'auto';
    }
    if (listEl) {
      listEl.style.height = `${listHeight}px`;
      listEl.style.maxHeight = `${listHeight}px`;
    }
    const target = headerH + measureContainerHeight(contentEl) + 8;
    applyWidgetHeight(target, collapsedHeight);
  }

  function queueWidgetHeightSync() {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        layoutQueued = false;
        syncWidgetHeight();
      });
    });
  }

  function setListOpen(isOpen) {
    if (!listToggleBtn || !listSectionEl) return;
    const open = !!isOpen;
    listSectionEl.hidden = !open;
    listToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    listToggleBtn.textContent = open ? 'Hide List Section ▴' : 'Show List Section ▾';
    queueWidgetHeightSync();
  }

  function setStatus(msg, tone) {
    statusLine.textContent = msg || '';
    statusLine.className = `ms-status${tone ? ' ' + tone : ''}`;
  }

  function norm(v) { return String(v || '').trim().toLowerCase(); }
  function canon(v) {
    return norm(v)
      .replace(/\bproject\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findBestOptionValue(selectEl, value) {
    if (!selectEl || !value) return null;
    const target = String(value).trim();
    const targetNorm = norm(target);
    const targetCanon = canon(target);
    const options = Array.from(selectEl.options || []);
    let hit = options.find(o => norm(o.value) === targetNorm);
    if (hit) return hit.value;
    if (targetCanon) {
      hit = options.find(o => canon(o.value) === targetCanon);
      if (hit) return hit.value;
      hit = options.find(o => {
        const c = canon(o.value);
        return !!c && (c.includes(targetCanon) || targetCanon.includes(c));
      });
      if (hit) return hit.value;
    }
    return null;
  }

  function setSelectOptions(selectEl, values, allLabel) {
    if (!selectEl) return;
    const prev = selectEl.value || 'all';
    selectEl.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = allLabel;
    selectEl.appendChild(allOpt);
    values.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      selectEl.appendChild(opt);
    });
    const keep = Array.from(selectEl.options).some(o => o.value === prev);
    selectEl.value = keep ? prev : 'all';
  }

  function availableProjects() {
    const set = new Set();
    milestones.forEach((m) => {
      const p = String(m?.project || '').trim();
      if (p) set.add(p);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  function availableGoals(projectValue = 'all') {
    const want = norm(projectValue);
    const set = new Set();
    milestones.forEach((m) => {
      const project = String(m?.project || '').trim();
      if (want !== 'all' && norm(project) !== want) return;
      const goal = String(m?.goal || '').trim();
      if (goal) set.add(goal);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  function syncFilterOptions() {
    setSelectOptions(projectSel, availableProjects(), 'All projects');
    setSelectOptions(goalSel, availableGoals(projectSel?.value || 'all'), 'All goals');
  }

  function getFilteredMilestones({ includeSearch = true } = {}) {
    const term = includeSearch ? (searchEl.value || '').trim().toLowerCase() : '';
    const wanted = (statusSel.value || 'all').toLowerCase();
    const wantedProject = projectSel?.value || 'all';
    const wantedGoal = goalSel?.value || 'all';
    return milestones.filter(item => {
      if (wanted !== 'all' && (item.status || '').toLowerCase() !== wanted) return false;
      if (wantedProject !== 'all') {
        const itemProjectNorm = norm(item.project);
        const wantedNorm = norm(wantedProject);
        const itemProjectCanon = canon(item.project);
        const wantedCanon = canon(wantedProject);
        const match = itemProjectNorm === wantedNorm
          || (!!itemProjectCanon && !!wantedCanon && (itemProjectCanon === wantedCanon || itemProjectCanon.includes(wantedCanon) || wantedCanon.includes(itemProjectCanon)));
        if (!match) return false;
      }
      if (wantedGoal !== 'all' && norm(item.goal) !== norm(wantedGoal)) return false;
      if (!term) return true;
      const hay = `${item.name || ''} ${item.goal || ''} ${item.project || ''} ${item.category || ''}`.toLowerCase();
      return hay.includes(term);
    });
  }

  function applyExternalFilter(filter, options = {}) {
    const deferIfMissing = options.deferIfMissing !== false;
    if (!filter || typeof filter !== 'object') return;
    pendingFilter = filter;
    if (projectSel && filter.project && deferIfMissing) {
      const matchedValue = findBestOptionValue(projectSel, filter.project);
      if (!matchedValue) return;
    }
    if (projectSel && filter.project) {
      const matchedValue = findBestOptionValue(projectSel, filter.project);
      if (matchedValue) projectSel.value = matchedValue;
    }
    setSelectOptions(goalSel, availableGoals(projectSel?.value || 'all'), 'All goals');
    if (goalSel && filter.goal && deferIfMissing) {
      const matchedValue = findBestOptionValue(goalSel, filter.goal);
      if (!matchedValue) return;
    }
    if (goalSel && filter.goal) {
      const matchedValue = findBestOptionValue(goalSel, filter.goal);
      if (matchedValue) goalSel.value = matchedValue;
    } else if (goalSel && filter.project && !filter.goal) {
      goalSel.value = 'all';
    }
    pendingFilter = null;
    try {
      const staged = window.__chronosMilestonesFilter;
      if (staged && typeof staged === 'object') {
        const sameProject = norm(staged.project) === norm(filter.project);
        const sameGoal = norm(staged.goal) === norm(filter.goal);
        if (sameProject && sameGoal) window.__chronosMilestonesFilter = null;
      }
    } catch { }
    setListOpen(true);
    renderSummary();
    renderList();
    queueWidgetHeightSync();
  }

  async function refresh(dataOnly = false) {
    if (loading) return;
    loading = true;
    if (!dataOnly) setStatus('Loading milestones...');
    try {
      const resp = await fetch(apiBase() + "/api/milestones");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      milestones = Array.isArray(json?.milestones) ? json.milestones : [];
      counts = json?.counts || { total: milestones.length, completed: 0, in_progress: 0, pending: 0 };
      syncFilterOptions();
      if (pendingFilter) applyExternalFilter(pendingFilter);
      renderSummary();
      renderList();
      if (!dataOnly) setStatus('');
    } catch (err) {
      console.warn('[Milestones] refresh failed', err);
      setStatus('Failed to load milestones.', 'error');
    } finally {
      loading = false;
    }
  }

  function renderSummary() {
    const visible = getFilteredMilestones({ includeSearch: false });
    totalEl.textContent = visible.length.toString();
    completedEl.textContent = visible.filter(m => (m.status || '').toLowerCase() === 'completed').length.toString();
    inProgressEl.textContent = visible.filter(m => (m.status || '').toLowerCase() === 'in-progress').length.toString();
  }

  function renderList() {
    listEl.innerHTML = '';
    const filtered = getFilteredMilestones({ includeSearch: true });
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'ms-card-meta';
      empty.style.padding = '16px';
      empty.style.border = '1px dashed var(--border)';
      empty.style.borderRadius = '8px';
      empty.textContent = milestones.length ? 'No milestones match that filter.' : 'Create milestones via the CLI to see them here.';
      listEl.appendChild(empty);
      queueWidgetHeightSync();
      return;
    }
    filtered.sort((a, b) => {
      const rank = { 'completed': 0, 'in-progress': 1, 'pending': 2 };
      const ar = rank[(a.status || 'pending').toLowerCase()] ?? 2;
      const br = rank[(b.status || 'pending').toLowerCase()] ?? 2;
      if (ar !== br) return ar - br;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'ms-item';
      const itemName = item.name || 'Milestone';
      const key = itemName.toLowerCase();
      const isExpanded = expanded.has(key);
      if (isExpanded) card.classList.add('expanded');
      const head = document.createElement('div');
      head.className = 'ms-head';
      const headLeft = document.createElement('div');
      headLeft.className = 'ms-head-left';
      const expander = document.createElement('div');
      expander.className = 'ms-expander';
      expander.textContent = isExpanded ? '▼' : '▶';
      const name = document.createElement('div');
      name.className = 'ms-name';
      name.textContent = itemName;
      const pill = document.createElement('div');
      const state = (item.status || 'pending').toLowerCase();
      const stateLabel = state.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
      pill.className = `ms-pill ${state}`;
      pill.setAttribute('aria-label', stateLabel);
      pill.title = stateLabel;
      if (state === 'completed') {
        pill.classList.add('icon');
        pill.textContent = '✓';
      } else if (state === 'pending') {
        pill.classList.add('icon');
        pill.textContent = '⌛';
      } else if (state === 'in-progress') {
        pill.classList.add('icon');
        pill.textContent = '◔';
      } else {
        pill.textContent = stateLabel;
      }
      headLeft.append(expander, name);

      const actions = document.createElement('div');
      actions.className = 'ms-head-actions';
      const completeBtn = document.createElement('button');
      completeBtn.className = 'btn btn-primary';
      completeBtn.title = (item.status || '').toLowerCase() === 'completed' ? 'Completed' : 'Mark complete';
      completeBtn.setAttribute('aria-label', (item.status || '').toLowerCase() === 'completed' ? 'Completed' : 'Mark complete');
      completeBtn.textContent = '✓';
      completeBtn.disabled = (item.status || '').toLowerCase() === 'completed';
      completeBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        updateMilestone(itemName, 'complete', completeBtn);
      });
      const resetBtn = document.createElement('button');
      resetBtn.className = 'btn btn-secondary';
      resetBtn.textContent = 'Reset';
      resetBtn.disabled = (item.status || '').toLowerCase() !== 'completed';
      resetBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        updateMilestone(itemName, 'reset', resetBtn);
      });
      actions.append(completeBtn, resetBtn, pill);
      head.append(headLeft, actions);

      const detail = document.createElement('div');
      detail.className = 'ms-detail';

      const meta = document.createElement('div');
      meta.className = 'ms-meta';
      const bits = [];
      if (item.goal) bits.push(`Goal: ${item.goal}`);
      if (item.project) bits.push(`Project: ${item.project}`);
      if (item.due_date) bits.push(`Due: ${item.due_date}`);
      if (item.weight) bits.push(`Weight: ${item.weight}`);
      meta.textContent = bits.join(' | ') || 'No metadata.';

      const progressWrap = document.createElement('div');
      progressWrap.className = 'ms-progress-bar';
      const fill = document.createElement('div');
      fill.className = 'ms-progress-fill';
      fill.style.width = `${Math.min(100, Math.max(0, item.progress_percent || 0))}%`;
      progressWrap.appendChild(fill);
      const progressMeta = document.createElement('div');
      progressMeta.className = 'ms-meta';
      if (item.progress_target) {
        progressMeta.textContent = `Progress: ${item.progress_current || 0}/${item.progress_target}`;
      } else {
        progressMeta.textContent = `Progress: ${(item.progress_percent || 0).toFixed(0)}%`;
      }

      const criteria = document.createElement('div');
      criteria.className = 'ms-meta';
      if (item.criteria) {
        criteria.textContent = `Criteria: ${JSON.stringify(item.criteria)}`;
      }

      detail.append(meta, progressWrap, progressMeta);
      if (item.criteria) detail.appendChild(criteria);
      card.append(head, detail);
      head.addEventListener('click', () => {
        if (card.classList.contains('expanded')) {
          card.classList.remove('expanded');
          expanded.delete(key);
          expander.textContent = '▶';
        } else {
          card.classList.add('expanded');
          expanded.add(key);
          expander.textContent = '▼';
        }
        queueWidgetHeightSync();
      });
      listEl.appendChild(card);
    });
    queueWidgetHeightSync();
  }

  function getPrimaryVisibleMilestone() {
    const filtered = getFilteredMilestones({ includeSearch: true });
    return filtered[0] || null;
  }

  async function updateMilestone(name, action, button) {
    if (!name) return;
    const original = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = 'Updating...';
    }
    setStatus(action === 'complete' ? `Completing '${name}'...` : `Resetting '${name}'...`);
    try {
      const resp = await fetch(apiBase() + "/api/milestone/update", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, action }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `HTTP ${resp.status}`);
      }
      await refresh(true);
      renderSummary();
      renderList();
      setStatus('Milestone updated.', 'success');
    } catch (err) {
      console.warn('[Milestones] update failed', err);
      setStatus(`Update failed: ${err.message || err}`, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = original || 'Update';
      }
    }
  }

  searchEl.addEventListener('input', () => { renderSummary(); renderList(); });
  statusSel.addEventListener('change', () => { renderSummary(); renderList(); });
  projectSel?.addEventListener('change', () => {
    if (!pendingFilter) {
      setSelectOptions(goalSel, availableGoals(projectSel?.value || 'all'), 'All goals');
      goalSel.value = 'all';
    }
    renderSummary();
    renderList();
  });
  goalSel?.addEventListener('change', () => { renderSummary(); renderList(); });
  refreshBtn.addEventListener('click', () => refresh());
  primaryCompleteBtn?.addEventListener('click', () => {
    const item = getPrimaryVisibleMilestone();
    if (!item) return;
    updateMilestone(item.name, 'complete', primaryCompleteBtn);
  });
  primaryResetBtn?.addEventListener('click', () => {
    const item = getPrimaryVisibleMilestone();
    if (!item) return;
    updateMilestone(item.name, 'reset', primaryResetBtn);
  });

  listToggleBtn?.addEventListener('click', () => setListOpen(listSectionEl?.hidden));
  setListOpen(false);
  const bus = context?.bus || window?.ChronosBus;
  const onExternalFilter = (payload) => {
    applyExternalFilter(payload || {});
    try { window?.ChronosBus?.emit?.('widget:show', 'Milestones'); } catch { }
  };
  try {
    const staged = window.__chronosMilestonesFilter;
    if (staged && typeof staged === 'object') pendingFilter = staged;
  } catch { }
  try { bus?.on?.('milestones:filter', onExternalFilter); } catch { }
  refresh();
  queueWidgetHeightSync();

  return {
    refresh: () => refresh(),
    unmount: () => { try { bus?.off?.('milestones:filter', onExternalFilter); } catch { } }
  };
}

