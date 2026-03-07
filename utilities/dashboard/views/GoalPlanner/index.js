export async function mount(el, context) {
  const tpl = `
    <style>
      .gp-root { display:flex; gap:12px; height:100%; }
      .gp-list { width:28%; background:rgba(21,25,35,0.85); border:1px solid #222835; border-radius:10px; padding:12px; display:flex; flex-direction:column; }
      .gp-detail { flex:1; background:rgba(21,25,35,0.85); border:1px solid #222835; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:14px; overflow:auto; }
      .gp-list-header { display:flex; flex-direction:column; gap:6px; }
      .gp-list-items { flex:1; overflow:auto; display:flex; flex-direction:column; gap:6px; margin-top:8px; }
      .gp-card { border:1px solid rgba(43,51,67,0.8); border-radius:8px; padding:10px; background:#0f141d; cursor:pointer; }
      .gp-card.active { outline:2px solid #7aa2f7; }
      .gp-card h4 { margin:0 0 4px; font-size:15px; }
      .gp-card-meta { font-size:12px; color:#a6adbb; display:flex; gap:6px; flex-wrap:wrap; }
      .gp-pill { padding:2px 8px; border-radius:999px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; }
      .gp-pill.active { background:rgba(91,220,130,0.18); color:#5bdc82; }
      .gp-pill.on_hold { background:rgba(255,190,92,0.18); color:#ffbe5c; }
      .gp-pill.completed { background:rgba(122,162,247,0.18); color:#7aa2f7; }
      .gp-summary { display:grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap:12px; }
      .gp-summary-card { border:1px solid rgba(43,51,67,0.8); border-radius:10px; padding:10px; background:#0f141d; min-height:90px; }
      .gp-summary-card h5 { margin:0; text-transform:uppercase; font-size:11px; letter-spacing:0.08em; color:#a6adbb; }
      .gp-summary-value { font-size:22px; font-weight:700; margin-top:4px; }
      .gp-description { border:1px solid rgba(43,51,67,0.8); border-radius:10px; padding:10px; background:#0f141d; display:flex; flex-direction:column; gap:8px; }
      .gp-description textarea { width:100%; min-height:96px; resize:vertical; }
      .gp-edit-grid { display:grid; grid-template-columns:repeat(2, minmax(180px,1fr)); gap:8px; }
      .gp-edit-grid label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:#a6adbb; }
      .gp-edit-grid input[type="date"] { color-scheme: dark; }
      .gp-desc-actions { display:flex; gap:8px; align-items:center; }
      .gp-desc-status { font-size:12px; color:#a6adbb; }
      .gp-desc-status.error { color:#ef6a6a; }
      .gp-desc-status.success { color:#5bdc82; }
      .gp-roadmap { border:1px solid rgba(43,51,67,0.8); border-radius:10px; padding:10px; background:#0f141d; display:flex; flex-direction:column; gap:10px; }
      .gp-roadmap-title { display:flex; align-items:center; justify-content:space-between; }
      .gp-roadmap-list { display:flex; gap:10px; overflow:auto; }
      .gp-mile { min-width:180px; border:1px solid rgba(122,162,247,0.35); border-radius:10px; padding:10px; background:rgba(15,20,29,0.9); display:flex; flex-direction:column; gap:6px; }
      .gp-mile h6 { margin:0; font-size:14px; }
      .gp-mile-meta { font-size:12px; color:#a6adbb; display:flex; flex-direction:column; gap:2px; }
      .gp-links { border:1px solid rgba(43,51,67,0.8); border-radius:10px; padding:10px; background:#0f141d; display:flex; flex-direction:column; gap:8px; }
      .gp-link-group { border:1px solid rgba(43,51,67,0.5); border-radius:8px; padding:8px; }
      .gp-link-group h6 { margin:0 0 6px; text-transform:uppercase; font-size:11px; letter-spacing:0.08em; color:#a6adbb; }
      .gp-link-item { display:flex; justify-content:space-between; font-size:13px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05); }
      .gp-link-item:last-child { border-bottom:none; }
      .gp-empty { font-size:13px; color:#a6adbb; padding:12px; text-align:center; border:1px dashed rgba(43,51,67,0.8); border-radius:8px; }
    </style>
    <div class="gp-root">
      <aside class="gp-list">
        <div class="gp-list-header">
          <strong>Goals</strong>
          <input id="gpSearch" class="input" placeholder="Search goals..." />
          <select id="gpState" class="input">
            <option value="all">All states</option>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div class="gp-list-items" id="gpList"></div>
      </aside>
      <section class="gp-detail">
        <div class="gp-summary" id="gpSummary"></div>
        <div class="gp-description" id="gpDescription">
          <div class="gp-edit-grid">
            <label>State
              <select id="gpEditState" class="input">
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label>Name
              <input id="gpEditName" class="input" placeholder="Goal name" />
            </label>
            <label>Stage
              <input id="gpEditStage" class="input" placeholder="e.g. Alpha v0.2" />
            </label>
            <label>Priority
              <input id="gpEditPriority" class="input" placeholder="e.g. high" />
            </label>
            <label>Target Date
              <input id="gpEditTargetDate" class="input" type="date" />
            </label>
          </div>
          <label class="hint" for="gpDescriptionInput">Description</label>
          <textarea id="gpDescriptionInput" class="input" placeholder="No description provided."></textarea>
          <div class="gp-desc-actions">
            <button class="btn" id="gpSaveDescription">Save Changes</button>
            <button class="btn" id="gpRenameGoal" disabled>Rename Goal</button>
            <span id="gpDescStatus" class="gp-desc-status"></span>
          </div>
        </div>
        <div class="gp-roadmap">
          <div class="gp-roadmap-title">
            <strong>Roadmap</strong>
            <button class="btn" id="gpOpenMilestones">Open Milestones</button>
          </div>
          <div class="gp-roadmap-list" id="gpRoadmap"></div>
        </div>
        <div class="gp-links" id="gpLinks"></div>
      </section>
    </div>
  `;
  el.innerHTML = tpl;

  const searchEl = el.querySelector('#gpSearch');
  const stateEl = el.querySelector('#gpState');
  const listEl = el.querySelector('#gpList');
  const summaryEl = el.querySelector('#gpSummary');
  const descEl = el.querySelector('#gpDescription');
  const editStateEl = el.querySelector('#gpEditState');
  const editNameEl = el.querySelector('#gpEditName');
  const editStageEl = el.querySelector('#gpEditStage');
  const editPriorityEl = el.querySelector('#gpEditPriority');
  const editTargetDateEl = el.querySelector('#gpEditTargetDate');
  const descInputEl = el.querySelector('#gpDescriptionInput');
  const saveDescBtn = el.querySelector('#gpSaveDescription');
  const renameGoalBtn = el.querySelector('#gpRenameGoal');
  const descStatusEl = el.querySelector('#gpDescStatus');
  const roadmapEl = el.querySelector('#gpRoadmap');
  const linksEl = el.querySelector('#gpLinks');
  const openMilestonesBtn = el.querySelector('#gpOpenMilestones');

  let goals = [];
  let selected = null;
  let detail = null;
  let linked = {};
  let descDirty = false;

  function apiBase() {
    const o = window.location.origin;
    if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
    return o;
  }
  function setDescStatus(msg, tone) {
    if (!descStatusEl) return;
    descStatusEl.textContent = msg || '';
    descStatusEl.className = `gp-desc-status${tone ? ' ' + tone : ''}`;
  }
  function currentFormModel() {
    const goal = detail?.goal || {};
    const source = goals.find((g) => g?.name === goal.name) || {};
    return {
      state: String(goal.status || source.state || source.status || 'planning'),
      stage: String(source.stage || ''),
      priority: String(goal.priority || source.priority || ''),
      target_date: String(goal.due_date || source.target_date || source.due_date || source.due || ''),
      description: String(source.description || source.summary || source.notes || ''),
    };
  }
  function formModelFromInputs() {
    return {
      state: String(editStateEl?.value || 'planning'),
      stage: String(editStageEl?.value || ''),
      priority: String(editPriorityEl?.value || ''),
      target_date: String(editTargetDateEl?.value || ''),
      description: String(descInputEl?.value || ''),
    };
  }
  function syncDirtyState() {
    const current = currentFormModel();
    const next = formModelFromInputs();
    descDirty = JSON.stringify(current) !== JSON.stringify(next);
    saveDescBtn.disabled = !descDirty || !selected;
    if (descDirty) setDescStatus('Unsaved changes.');
    else setDescStatus('');
    syncRenameGoalState();
  }

  function currentGoalName() {
    return String(selected || detail?.goal?.name || '').trim();
  }

  function syncRenameGoalState() {
    if (!renameGoalBtn || !editNameEl) return;
    const oldName = currentGoalName();
    const newName = String(editNameEl.value || '').trim();
    renameGoalBtn.disabled = !(oldName && newName && oldName !== newName);
  }

  function norm(v) { return String(v || '').trim().toLowerCase(); }

  function matchesGoal(item, goalName) {
    const wanted = norm(goalName);
    if (!wanted || !item || typeof item !== 'object') return false;
    if (norm(item.goal) === wanted) return true;
    if (norm(item.goal_name) === wanted) return true;
    const listKeys = ['goals', 'linked_goals', 'goal_links'];
    for (const k of listKeys) {
      const raw = item[k];
      if (Array.isArray(raw) && raw.some(v => norm(v) === wanted)) return true;
      if (typeof raw === 'string' && raw.split(',').map(s => norm(s)).includes(wanted)) return true;
    }
    return false;
  }

  function collectLinkedItems(items, goalName) {
    const out = {};
    const seen = new Set();
    for (const item of (Array.isArray(items) ? items : [])) {
      if (!item || typeof item !== 'object') continue;
      const type = String(item.type || '').toLowerCase();
      if (!type || type === 'goal' || type === 'milestone') continue;
      if (!matchesGoal(item, goalName)) continue;
      const nm = String(item.name || '').trim();
      if (!nm) continue;
      const key = `${type}:${nm.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!out[type]) out[type] = [];
      out[type].push({
        name: nm,
        status: item.status || '',
        priority: item.priority || '',
      });
    }
    Object.keys(out).forEach((k) => {
      out[k].sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
    });
    return out;
  }

  async function loadGoals() {
    try {
      const resp = await fetch(apiBase() + '/api/items?type=goal');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      goals = Array.isArray(json?.items) ? json.items : [];
      renderGoalList();
      if (goals.length && !selected) await selectGoal(goals[0]?.name);
    } catch (err) {
      console.error('[GoalPlanner] loadGoals failed', err);
      listEl.innerHTML = '<div class="gp-empty">Unable to load goals.</div>';
    }
  }

  async function selectGoal(name) {
    if (!name) return;
    selected = name;
    renderGoalList();
    await loadGoalDetail(name);
  }

  function renderGoalList() {
    listEl.innerHTML = '';
    const term = norm(searchEl.value);
    const wanted = norm(stateEl.value || 'all');
    const filtered = goals.filter((g) => {
      const nm = norm(g.name);
      const stateVal = norm(g.state || g.status || '');
      if (term && !nm.includes(term)) return false;
      if (wanted !== 'all' && stateVal !== wanted) return false;
      return true;
    });
    if (!filtered.length) {
      listEl.innerHTML = '<div class="gp-empty">No goals match.</div>';
      return;
    }
    filtered.forEach((g) => {
      const card = document.createElement('div');
      card.className = 'gp-card' + (selected === g.name ? ' active' : '');
      const head = document.createElement('h4');
      head.textContent = g.name || 'Goal';
      const meta = document.createElement('div');
      meta.className = 'gp-card-meta';
      const pill = document.createElement('span');
      const stateVal = String(g.state || g.status || '').toLowerCase() || 'planning';
      pill.className = `gp-pill ${stateVal.replace(' ', '_')}`;
      pill.textContent = stateVal.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      meta.appendChild(pill);
      if (g.stage) {
        const stage = document.createElement('span');
        stage.textContent = `Stage: ${g.stage}`;
        meta.appendChild(stage);
      }
      card.append(head, meta);
      card.addEventListener('click', () => selectGoal(g.name));
      listEl.appendChild(card);
    });
  }

  async function loadGoalDetail(name) {
    summaryEl.innerHTML = '';
    if (descInputEl) descInputEl.value = 'Loading goal...';
    setDescStatus('');
    roadmapEl.innerHTML = '';
    linksEl.innerHTML = '';
    detail = null;
    linked = {};
    try {
      const [goalResp, itemsResp] = await Promise.all([
        fetch(apiBase() + `/api/goal?name=${encodeURIComponent(name)}`),
        fetch(apiBase() + '/api/items'),
      ]);
      if (!goalResp.ok) throw new Error(`HTTP ${goalResp.status}`);
      const goalJson = await goalResp.json();
      const itemsJson = itemsResp.ok ? await itemsResp.json() : {};
      detail = goalJson || {};
      linked = collectLinkedItems(itemsJson?.items || [], name);
      renderSummary();
      renderRoadmap();
      renderLinks();
    } catch (err) {
      console.error('[GoalPlanner] loadGoalDetail failed', err);
      if (descInputEl) descInputEl.value = '';
      setDescStatus('Unable to load goal details.', 'error');
    }
  }

  function renderSummary() {
    const goal = detail?.goal;
    if (!goal) {
      summaryEl.innerHTML = '';
      if (editStateEl) editStateEl.value = 'planning';
      if (editNameEl) editNameEl.value = '';
      if (editStageEl) editStageEl.value = '';
      if (editPriorityEl) editPriorityEl.value = '';
      if (editTargetDateEl) editTargetDateEl.value = '';
      if (descInputEl) descInputEl.value = '';
      syncRenameGoalState();
      return;
    }
    const source = goals.find((g) => g?.name === goal.name) || {};
    summaryEl.innerHTML = '';
    if (editStateEl) editStateEl.value = String(goal.status || source.state || source.status || 'planning');
    if (editNameEl) editNameEl.value = String(goal.name || selected || '');
    if (editStageEl) editStageEl.value = String(source.stage || '');
    if (editPriorityEl) editPriorityEl.value = String(goal.priority || source.priority || '');
    if (editTargetDateEl) editTargetDateEl.value = String(goal.due_date || source.target_date || source.due_date || source.due || '');
    if (descInputEl) {
      descInputEl.value = source.description || source.summary || source.notes || '';
      descDirty = false;
      saveDescBtn.disabled = true;
    }
    setDescStatus('');
    syncRenameGoalState();
    const cards = [
      { label: 'State', value: goal.status || source.state || source.status || 'planning' },
      { label: 'Stage', value: source.stage || 'n/a' },
      { label: 'Priority', value: goal.priority || source.priority || 'n/a' },
      { label: 'Target Date', value: goal.due_date || source.target_date || source.due_date || source.due || 'n/a' },
    ];
    cards.forEach((card) => {
      const div = document.createElement('div');
      div.className = 'gp-summary-card';
      const h = document.createElement('h5');
      h.textContent = card.label;
      const val = document.createElement('div');
      val.className = 'gp-summary-value';
      val.textContent = card.value;
      div.append(h, val);
      summaryEl.appendChild(div);
    });
  }

  function renderRoadmap() {
    roadmapEl.innerHTML = '';
    const milestones = Array.isArray(detail?.goal?.milestones) ? detail.goal.milestones : [];
    if (!milestones.length) {
      roadmapEl.innerHTML = '<div class="gp-empty">No milestones linked to this goal.</div>';
      return;
    }
    milestones.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
    milestones.forEach((ms) => {
      const card = document.createElement('div');
      card.className = 'gp-mile';
      const name = document.createElement('h6');
      name.textContent = ms.name || 'Milestone';
      const meta = document.createElement('div');
      meta.className = 'gp-mile-meta';
      if (ms.completed) meta.innerHTML += `<div>Completed: ${ms.completed}</div>`;
      if (ms.weight) meta.innerHTML += `<div>Weight: ${ms.weight}</div>`;
      meta.innerHTML += `<div>Status: ${ms.status || 'pending'}</div>`;
      if (ms.criteria) meta.innerHTML += `<div>Criteria: ${ms.criteria}</div>`;
      card.append(name, meta);
      roadmapEl.appendChild(card);
    });
  }

  function renderLinks() {
    linksEl.innerHTML = '';
    const types = Object.keys(linked || {});
    if (!types.length) {
      linksEl.innerHTML = '<div class="gp-empty">No linked items yet.</div>';
      return;
    }
    types.forEach((t) => {
      const section = document.createElement('div');
      section.className = 'gp-link-group';
      const title = document.createElement('h6');
      title.textContent = t;
      section.appendChild(title);
      const items = linked[t];
      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'gp-link-item';
        const left = document.createElement('span');
        left.textContent = item.name || t;
        const right = document.createElement('span');
        right.textContent = item.status || item.priority || '';
        row.append(left, right);
        section.appendChild(row);
      });
      linksEl.appendChild(section);
    });
  }

  searchEl.addEventListener('input', renderGoalList);
  stateEl.addEventListener('change', renderGoalList);
  openMilestonesBtn.addEventListener('click', () => {
    const goalName = selected || detail?.goal?.name || '';
    const payload = { goal: goalName || '' };
    try { window.__chronosMilestonesFilter = payload; } catch { }
    try {
      const msEl = document.querySelector('[data-widget="Milestones"]');
      if (msEl) {
        msEl.style.display = '';
        msEl.classList.remove('minimized');
        try { window?.ChronosFocusWidget?.(msEl); } catch { }
      }
    } catch { }
    try {
      window?.ChronosBus?.emit?.('widget:show', 'Milestones');
      window?.ChronosBus?.emit?.('milestones:filter', payload);
    } catch { }
    try {
      context?.bus?.emit?.('widget:show', 'Milestones');
      context?.bus?.emit?.('milestones:filter', payload);
    } catch { }
    setTimeout(() => {
      try { window?.ChronosBus?.emit?.('milestones:filter', payload); } catch { }
      try { context?.bus?.emit?.('milestones:filter', payload); } catch { }
    }, 40);
  });

  descInputEl?.addEventListener('input', syncDirtyState);
  editStateEl?.addEventListener('change', syncDirtyState);
  editNameEl?.addEventListener('input', syncRenameGoalState);
  editStageEl?.addEventListener('input', syncDirtyState);
  editPriorityEl?.addEventListener('input', syncDirtyState);
  editTargetDateEl?.addEventListener('input', syncDirtyState);
  saveDescBtn?.addEventListener('click', async () => {
    const goalName = selected || detail?.goal?.name || '';
    if (!goalName) return;
    const next = formModelFromInputs();
    saveDescBtn.disabled = true;
    setDescStatus('Saving...');
    try {
      const resp = await fetch(apiBase() + '/api/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'goal',
          name: goalName,
          properties: {
            state: next.state,
            status: next.state,
            stage: next.stage,
            priority: next.priority,
            target_date: next.target_date,
            due_date: next.target_date,
            description: next.description,
          },
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setDescStatus('Saved.', 'success');
      await loadGoals();
      await selectGoal(goalName);
    } catch (err) {
      console.error('[GoalPlanner] save description failed', err);
      setDescStatus('Save failed.', 'error');
      saveDescBtn.disabled = false;
    }
  });

  renameGoalBtn?.addEventListener('click', async () => {
    const oldName = currentGoalName();
    const newName = String(editNameEl?.value || '').trim();
    if (!oldName || !newName || oldName === newName) return;
    renameGoalBtn.disabled = true;
    setDescStatus('Renaming goal and updating references...');
    try {
      const resp = await fetch(apiBase() + '/api/goal/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: oldName, new_name: newName }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.ok === false) throw new Error(json?.error || `HTTP ${resp.status}`);
      selected = newName;
      setDescStatus(`Renamed. Updated ${Number(json?.updated_refs || 0)} linked item references.`, 'success');
      await loadGoals();
      await selectGoal(newName);
    } catch (err) {
      console.error('[GoalPlanner] rename goal failed', err);
      setDescStatus(`Rename failed: ${String(err?.message || err)}`, 'error');
      syncRenameGoalState();
    }
  });

  await loadGoals();
}
