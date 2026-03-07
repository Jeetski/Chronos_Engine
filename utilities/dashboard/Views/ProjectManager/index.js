export async function mount(el, context) {
  const tpl = `
    <style>
      .pm-root { display:flex; gap:12px; height:100%; }
      .pm-list { width:28%; background:rgba(21,25,35,0.85); border:1px solid #222835; border-radius:10px; padding:12px; display:flex; flex-direction:column; }
      .pm-detail { flex:1; background:rgba(21,25,35,0.85); border:1px solid #222835; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:14px; overflow:auto; }
      .pm-list-header { display:flex; flex-direction:column; gap:6px; }
      .pm-list-items { flex:1; overflow:auto; display:flex; flex-direction:column; gap:6px; margin-top:8px; }
      .pm-card { border:1px solid rgba(43,51,67,0.8); border-radius:8px; padding:10px; background:#0f141d; cursor:pointer; }
      .pm-card.active { outline:2px solid #7aa2f7; }
      .pm-card h4 { margin:0 0 4px; font-size:15px; }
      .pm-card-meta { font-size:12px; color:#a6adbb; display:flex; gap:6px; flex-wrap:wrap; }
      .pm-pill { padding:2px 8px; border-radius:999px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; }
      .pm-pill.active { background:rgba(91,220,130,0.18); color:#5bdc82; }
      .pm-pill.on_hold { background:rgba(255,190,92,0.18); color:#ffbe5c; }
      .pm-pill.completed { background:rgba(122,162,247,0.18); color:#7aa2f7; }
      .pm-summary { display:grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap:12px; }
      .pm-summary-card { border:1px solid rgba(43,51,67,0.8); border-radius:10px; padding:10px; background:#0f141d; min-height:90px; }
      .pm-summary-card h5 { margin:0; text-transform:uppercase; font-size:11px; letter-spacing:0.08em; color:#a6adbb; }
      .pm-summary-value { font-size:22px; font-weight:700; margin-top:4px; }
      .pm-description { border:1px solid rgba(43,51,67,0.8); border-radius:10px; padding:10px; background:#0f141d; display:flex; flex-direction:column; gap:8px; }
      .pm-description textarea { width:100%; min-height:96px; resize:vertical; }
      .pm-edit-grid { display:grid; grid-template-columns:repeat(2, minmax(180px,1fr)); gap:8px; }
      .pm-edit-grid label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:#a6adbb; }
      .pm-edit-grid input[type="date"] { color-scheme: dark; }
      .pm-desc-actions { display:flex; gap:8px; align-items:center; }
      .pm-desc-status { font-size:12px; color:#a6adbb; }
      .pm-desc-status.error { color:#ef6a6a; }
      .pm-desc-status.success { color:#5bdc82; }
      .pm-roadmap { border:1px solid rgba(43,51,67,0.8); border-radius:10px; padding:10px; background:#0f141d; display:flex; flex-direction:column; gap:10px; }
      .pm-roadmap-title { display:flex; align-items:center; justify-content:space-between; }
      .pm-roadmap-list { display:flex; gap:10px; overflow:auto; }
      .pm-mile { min-width:180px; border:1px solid rgba(122,162,247,0.35); border-radius:10px; padding:10px; background:rgba(15,20,29,0.9); display:flex; flex-direction:column; gap:6px; }
      .pm-mile h6 { margin:0; font-size:14px; }
      .pm-mile-meta { font-size:12px; color:#a6adbb; display:flex; flex-direction:column; gap:2px; }
      .pm-links { border:1px solid rgba(43,51,67,0.8); border-radius:10px; padding:10px; background:#0f141d; display:flex; flex-direction:column; gap:8px; }
      .pm-link-group { border:1px solid rgba(43,51,67,0.5); border-radius:8px; padding:8px; }
      .pm-link-group h6 { margin:0 0 6px; text-transform:uppercase; font-size:11px; letter-spacing:0.08em; color:#a6adbb; }
      .pm-link-item { display:flex; justify-content:space-between; font-size:13px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05); }
      .pm-link-item:last-child { border-bottom:none; }
      .pm-empty { font-size:13px; color:#a6adbb; padding:12px; text-align:center; border:1px dashed rgba(43,51,67,0.8); border-radius:8px; }
      .pm-toolbar { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
    </style>
    <div class="pm-root">
      <aside class="pm-list">
        <div class="pm-list-header">
          <strong>Projects</strong>
          <input id="pmSearch" class="input" placeholder="Search projects..." />
          <select id="pmState" class="input">
            <option value="all">All states</option>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div class="pm-list-items" id="pmList"></div>
      </aside>
      <section class="pm-detail">
        <div class="pm-summary" id="pmSummary"></div>
        <div class="pm-description" id="pmDescription">
          <div class="pm-edit-grid">
            <label>State
              <select id="pmEditState" class="input">
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label>Name
              <input id="pmEditName" class="input" placeholder="Project name" />
            </label>
            <label>Stage
              <input id="pmEditStage" class="input" placeholder="e.g. Alpha v0.2" />
            </label>
            <label>Priority
              <input id="pmEditPriority" class="input" placeholder="e.g. high" />
            </label>
            <label>Target Date
              <input id="pmEditTargetDate" class="input" type="date" />
            </label>
          </div>
          <label class="hint" for="pmDescriptionInput">Description</label>
          <textarea id="pmDescriptionInput" class="input" placeholder="No description provided."></textarea>
          <div class="pm-desc-actions">
            <button class="btn" id="pmSaveDescription">Save Changes</button>
            <button class="btn" id="pmRenameProject" disabled>Rename Project</button>
            <span id="pmDescStatus" class="pm-desc-status"></span>
          </div>
        </div>
        <div class="pm-roadmap">
          <div class="pm-roadmap-title">
            <strong>Roadmap</strong>
            <button class="btn" id="pmOpenMilestones">Open Milestones</button>
          </div>
          <div class="pm-roadmap-list" id="pmRoadmap"></div>
        </div>
        <div class="pm-links" id="pmLinks"></div>
      </section>
    </div>
  `;
  el.innerHTML = tpl;

  const searchEl = el.querySelector('#pmSearch');
  const stateEl = el.querySelector('#pmState');
  const listEl = el.querySelector('#pmList');
  const summaryEl = el.querySelector('#pmSummary');
  const descEl = el.querySelector('#pmDescription');
  const editStateEl = el.querySelector('#pmEditState');
  const editNameEl = el.querySelector('#pmEditName');
  const editStageEl = el.querySelector('#pmEditStage');
  const editPriorityEl = el.querySelector('#pmEditPriority');
  const editTargetDateEl = el.querySelector('#pmEditTargetDate');
  const descInputEl = el.querySelector('#pmDescriptionInput');
  const saveDescBtn = el.querySelector('#pmSaveDescription');
  const renameProjectBtn = el.querySelector('#pmRenameProject');
  const descStatusEl = el.querySelector('#pmDescStatus');
  const roadmapEl = el.querySelector('#pmRoadmap');
  const linksEl = el.querySelector('#pmLinks');
  const openMilestonesBtn = el.querySelector('#pmOpenMilestones');

  let projects = [];
  let selected = null;
  let detail = null;
  let descDirty = false;

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  function setDescStatus(msg, tone){
    if (!descStatusEl) return;
    descStatusEl.textContent = msg || '';
    descStatusEl.className = `pm-desc-status${tone ? ' ' + tone : ''}`;
  }
  function currentFormModel(){
    const p = detail?.project || {};
    return {
      state: String(p.state || p.status || 'planning'),
      stage: String(p.stage || ''),
      priority: String(p.priority || ''),
      target_date: String(p.target_date || p.due_date || ''),
      description: String(p.description || ''),
    };
  }
  function formModelFromInputs(){
    return {
      state: String(editStateEl?.value || 'planning'),
      stage: String(editStageEl?.value || ''),
      priority: String(editPriorityEl?.value || ''),
      target_date: String(editTargetDateEl?.value || ''),
      description: String(descInputEl?.value || ''),
    };
  }
  function syncDirtyState(){
    const current = currentFormModel();
    const next = formModelFromInputs();
    descDirty = JSON.stringify(current) !== JSON.stringify(next);
    saveDescBtn.disabled = !descDirty || !selected;
    if (descDirty) setDescStatus('Unsaved changes.');
    else setDescStatus('');
    syncRenameState();
  }

  function syncRenameState() {
    if (!renameProjectBtn || !editNameEl) return;
    const oldName = String(selected || detail?.project?.name || '').trim();
    const newName = String(editNameEl.value || '').trim();
    renameProjectBtn.disabled = !(oldName && newName && oldName !== newName);
  }

  async function loadProjects(){
    try{
      const resp = await fetch(apiBase()+`/api/items?type=project`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      projects = Array.isArray(json?.items) ? json.items : [];
      renderProjectList();
      if (projects.length && !selected){
        selectProject(projects[0]?.name);
      }
    }catch(err){
      console.error('[ProjectManager] loadProjects failed', err);
      listEl.innerHTML = '<div class="pm-empty">Unable to load projects.</div>';
    }
  }

  async function selectProject(name){
    if (!name) return;
    selected = name;
    renderProjectList();
    await loadProjectDetail(name);
  }

  function renderProjectList(){
    listEl.innerHTML = '';
    const term = (searchEl.value||'').toLowerCase();
    const wanted = (stateEl.value||'all').toLowerCase();
    const filtered = projects.filter(p => {
      const nm = String(p.name||'').toLowerCase();
      const stateVal = String(p.state || p.status || '').toLowerCase();
      if (term && !nm.includes(term)) return false;
      if (wanted !== 'all' && stateVal !== wanted) return false;
      return true;
    });
    if (!filtered.length){
      listEl.innerHTML = '<div class="pm-empty">No projects match.</div>';
      return;
    }
    filtered.forEach(p => {
      const card = document.createElement('div');
      card.className = 'pm-card' + (selected === p.name ? ' active' : '');
      const head = document.createElement('h4');
      head.textContent = p.name || 'Project';
      const meta = document.createElement('div');
      meta.className = 'pm-card-meta';
      const pill = document.createElement('span');
      const stateVal = String(p.state || p.status || '').toLowerCase() || 'planning';
      pill.className = `pm-pill ${stateVal.replace(' ', '_')}`;
      pill.textContent = stateVal.replace('_',' ').replace(/\b\w/g, c=>c.toUpperCase());
      meta.appendChild(pill);
      if (p.stage){
        const stage = document.createElement('span');
        stage.textContent = `Stage: ${p.stage}`;
        meta.appendChild(stage);
      }
      card.append(head, meta);
      card.addEventListener('click', ()=> selectProject(p.name));
      listEl.appendChild(card);
    });
  }

  async function loadProjectDetail(name){
    summaryEl.innerHTML = '';
    if (descInputEl) descInputEl.value = 'Loading project...';
    setDescStatus('');
    roadmapEl.innerHTML = '';
    linksEl.innerHTML = '';
    detail = null;
    try{
      const resp = await fetch(apiBase()+`/api/project/detail?name=${encodeURIComponent(name)}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      detail = await resp.json();
      renderSummary();
      renderRoadmap();
      renderLinks();
    }catch(err){
      console.error('[ProjectManager] loadProjectDetail failed', err);
      if (descInputEl) descInputEl.value = '';
      setDescStatus('Unable to load project details.', 'error');
    }
  }

  function renderSummary(){
    if (!detail?.project){
      summaryEl.innerHTML = '';
      if (editStateEl) editStateEl.value = 'planning';
      if (editNameEl) editNameEl.value = '';
      if (editStageEl) editStageEl.value = '';
      if (editPriorityEl) editPriorityEl.value = '';
      if (editTargetDateEl) editTargetDateEl.value = '';
      if (descInputEl) descInputEl.value = '';
      syncRenameState();
      return;
    }
    const proj = detail.project;
    summaryEl.innerHTML = '';
    if (editStateEl) editStateEl.value = String(proj.state || proj.status || 'planning');
    if (editNameEl) editNameEl.value = String(proj.name || selected || '');
    if (editStageEl) editStageEl.value = String(proj.stage || '');
    if (editPriorityEl) editPriorityEl.value = String(proj.priority || '');
    if (editTargetDateEl) editTargetDateEl.value = String(proj.target_date || proj.due_date || '');
    if (descInputEl) {
      descInputEl.value = proj.description || '';
      descDirty = false;
      saveDescBtn.disabled = true;
    }
    setDescStatus('');
    syncRenameState();
    const cards = [
      { label: 'State', value: proj.state || proj.status || 'planning' },
      { label: 'Stage', value: proj.stage || 'n/a' },
      { label: 'Owner', value: proj.owner || 'unassigned' },
      { label: 'Target Date', value: proj.target_date || proj.due_date || 'n/a' },
    ];
    cards.forEach(card => {
      const div = document.createElement('div');
      div.className = 'pm-summary-card';
      const h = document.createElement('h5');
      h.textContent = card.label;
      const val = document.createElement('div');
      val.className = 'pm-summary-value';
      val.textContent = card.value;
      div.append(h,val);
      summaryEl.appendChild(div);
    });
  }

  function renderRoadmap(){
    roadmapEl.innerHTML = '';
    const milestones = Array.isArray(detail?.milestones) ? detail.milestones : [];
    if (!milestones.length){
      roadmapEl.innerHTML = '<div class="pm-empty">No milestones linked to this project.</div>';
      return;
    }
    milestones.sort((a,b)=>{
      const ad = a.due_date || a.target_date || '';
      const bd = b.due_date || b.target_date || '';
      return String(ad).localeCompare(String(bd));
    });
    milestones.forEach(ms => {
      const card = document.createElement('div');
      card.className = 'pm-mile';
      const name = document.createElement('h6');
      name.textContent = ms.name || 'Milestone';
      const meta = document.createElement('div');
      meta.className = 'pm-mile-meta';
      if (ms.due_date) meta.innerHTML += `<div>Due: ${ms.due_date}</div>`;
      if (ms.stage) meta.innerHTML += `<div>Stage: ${ms.stage}</div>`;
      meta.innerHTML += `<div>Status: ${ms.status || 'pending'}</div>`;
      card.append(name, meta);
      roadmapEl.appendChild(card);
    });
  }

  function renderLinks(){
    linksEl.innerHTML = '';
    const linked = detail?.linked || {};
    const types = Object.keys(linked);
    if (!types.length){
      linksEl.innerHTML = '<div class="pm-empty">No linked items yet.</div>';
      return;
    }
    types.forEach(t => {
      const section = document.createElement('div');
      section.className = 'pm-link-group';
      const title = document.createElement('h6');
      title.textContent = t;
      section.appendChild(title);
      const items = linked[t];
      items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'pm-link-item';
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

  searchEl.addEventListener('input', renderProjectList);
  stateEl.addEventListener('change', renderProjectList);
  openMilestonesBtn.addEventListener('click', ()=>{
    const projectName = selected || detail?.project?.name || '';
    const payload = { project: projectName || '' };
    try { window.__chronosMilestonesFilter = payload; } catch {}
    try {
      const msEl = document.querySelector('[data-widget="Milestones"]');
      if (msEl) {
        msEl.style.display = '';
        msEl.classList.remove('minimized');
        try { window?.ChronosFocusWidget?.(msEl); } catch {}
      }
    } catch {}
    try {
      window?.ChronosBus?.emit?.('widget:show','Milestones');
      window?.ChronosBus?.emit?.('milestones:filter', payload);
    } catch {}
    try {
      context?.bus?.emit?.('widget:show','Milestones');
      context?.bus?.emit?.('milestones:filter', payload);
    } catch {}
    setTimeout(() => {
      try { window?.ChronosBus?.emit?.('milestones:filter', payload); } catch {}
      try { context?.bus?.emit?.('milestones:filter', payload); } catch {}
    }, 40);
  });

  descInputEl?.addEventListener('input', syncDirtyState);
  editStateEl?.addEventListener('change', syncDirtyState);
  editNameEl?.addEventListener('input', syncRenameState);
  editStageEl?.addEventListener('input', syncDirtyState);
  editPriorityEl?.addEventListener('input', syncDirtyState);
  editTargetDateEl?.addEventListener('input', syncDirtyState);
  saveDescBtn?.addEventListener('click', async () => {
    const projectName = selected || detail?.project?.name || '';
    if (!projectName) return;
    const next = formModelFromInputs();
    saveDescBtn.disabled = true;
    setDescStatus('Saving...');
    try {
      const resp = await fetch(apiBase() + '/api/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'project',
          name: projectName,
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
      await loadProjects();
      await selectProject(projectName);
    } catch (err) {
      console.error('[ProjectManager] save description failed', err);
      setDescStatus('Save failed.', 'error');
      saveDescBtn.disabled = false;
    }
  });

  renameProjectBtn?.addEventListener('click', async () => {
    const oldName = String(selected || detail?.project?.name || '').trim();
    const newName = String(editNameEl?.value || '').trim();
    if (!oldName || !newName || oldName === newName) return;
    renameProjectBtn.disabled = true;
    setDescStatus('Renaming project and updating references...');
    try {
      const resp = await fetch(apiBase() + '/api/project/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: oldName, new_name: newName }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.ok === false) throw new Error(json?.error || `HTTP ${resp.status}`);
      selected = newName;
      setDescStatus(`Renamed. Updated ${Number(json?.updated_refs || 0)} linked item references.`, 'success');
      await loadProjects();
      await selectProject(newName);
    } catch (err) {
      console.error('[ProjectManager] rename project failed', err);
      setDescStatus(`Rename failed: ${String(err?.message || err)}`, 'error');
      syncRenameState();
    }
  });

  await loadProjects();
}
