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
      .pm-description { border:1px solid rgba(43,51,67,0.8); border-radius:10px; padding:10px; background:#0f141d; }
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
        <div class="pm-description" id="pmDescription"></div>
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
  const roadmapEl = el.querySelector('#pmRoadmap');
  const linksEl = el.querySelector('#pmLinks');
  const openMilestonesBtn = el.querySelector('#pmOpenMilestones');

  let projects = [];
  let selected = null;
  let detail = null;

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

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
    descEl.textContent = 'Loading project...';
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
      descEl.innerHTML = `<div class="pm-empty">Unable to load project details.</div>`;
    }
  }

  function renderSummary(){
    if (!detail?.project){
      summaryEl.innerHTML = '';
      descEl.innerHTML = '<div class="pm-empty">Select a project to see details.</div>';
      return;
    }
    const proj = detail.project;
    summaryEl.innerHTML = '';
    descEl.textContent = proj.description || 'No description provided.';
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
    try {
      window?.ChronosBus?.emit?.('widget:show','Milestones');
    } catch {}
  });

  await loadProjects();
}
