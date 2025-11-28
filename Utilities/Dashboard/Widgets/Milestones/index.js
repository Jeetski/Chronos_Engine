export function mount(el) {
  const tpl = `
    <style>
      .ms-content { display:flex; flex-direction:column; gap:10px; }
      .ms-cards { display:flex; gap:10px; flex-wrap:wrap; }
      .ms-card { flex:1 1 160px; border:1px solid var(--border); border-radius:10px; padding:10px; background:#0f141d; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.02); }
      .ms-card h4 { margin:0 0 4px; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-dim); }
      .ms-card-value { font-size:26px; font-weight:800; margin:2px 0; }
      .ms-card-meta { font-size:12px; color:var(--text-dim); }
      .ms-status { min-height:18px; font-size:13px; color:var(--text-dim); }
      .ms-status.error { color:#ef6a6a; }
      .ms-status.success { color:#5bdc82; }
      .ms-list { display:flex; flex-direction:column; gap:10px; max-height:420px; overflow:auto; }
      .ms-item { border:1px solid var(--border); border-radius:10px; padding:10px; background:#0f141d; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.02); display:flex; flex-direction:column; gap:6px; }
      .ms-head { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
      .ms-name { font-size:15px; font-weight:700; }
      .ms-pill { padding:2px 10px; border-radius:999px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; }
      .ms-pill.pending { background:rgba(122,162,247,0.15); color:#7aa2f7; }
      .ms-pill.in-progress { background:rgba(255,190,92,0.18); color:#ffbe5c; }
      .ms-pill.completed { background:rgba(91,220,130,0.18); color:#5bdc82; }
      .ms-progress-bar { height:8px; border-radius:999px; background:#0b0f16; border:1px solid var(--border); overflow:hidden; }
      .ms-progress-fill { height:100%; background:linear-gradient(90deg,#2a5cff,#7aa2f7); }
      .ms-meta { font-size:12px; color:var(--text-dim); }
      .ms-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    </style>
    <div class="header">
      <div class="title">Milestones</div>
      <div class="controls" style="align-items:center; gap:6px;">
        <button class="icon-btn" id="msMin">_</button>
        <button class="icon-btn" id="msClose">x</button>
      </div>
    </div>
    <div class="content ms-content">
      <div class="ms-cards">
        <div class="ms-card">
          <h4>Total</h4>
          <div class="ms-card-value" id="msTotal">--</div>
          <div class="ms-card-meta">All milestones.</div>
        </div>
        <div class="ms-card">
          <h4>Completed</h4>
          <div class="ms-card-value" id="msCompleted">--</div>
          <div class="ms-card-meta">Finished milestones.</div>
        </div>
        <div class="ms-card">
          <h4>In Progress</h4>
          <div class="ms-card-value" id="msInProgress">--</div>
          <div class="ms-card-meta">Milestones currently active.</div>
        </div>
      </div>
      <div class="row" style="gap:8px; flex-wrap:wrap;">
        <input id="msSearch" class="input" placeholder="Search milestones..." style="flex:1 1 220px; min-width:160px;" />
        <select id="msStatusFilter" class="input" style="flex:0 0 180px;">
          <option value="all">All states</option>
          <option value="pending">Pending</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <div class="spacer"></div>
        <button class="btn" id="msRefresh">Refresh</button>
      </div>
      <div id="msStatus" class="ms-status"></div>
      <div id="msList" class="ms-list"></div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const btnMin = el.querySelector('#msMin');
  const btnClose = el.querySelector('#msClose');
  const refreshBtn = el.querySelector('#msRefresh');
  const searchEl = el.querySelector('#msSearch');
  const statusSel = el.querySelector('#msStatusFilter');
  const statusLine = el.querySelector('#msStatus');
  const listEl = el.querySelector('#msList');
  const totalEl = el.querySelector('#msTotal');
  const completedEl = el.querySelector('#msCompleted');
  const inProgressEl = el.querySelector('#msInProgress');

  btnMin.addEventListener('click', ()=> el.classList.toggle('minimized'));
  btnClose.addEventListener('click', ()=> { el.style.display='none'; try { window?.ChronosBus?.emit?.('widget:closed','Milestones'); } catch {} });

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

  let milestones = [];
  let counts = { total:0, completed:0, in_progress:0, pending:0 };
  let loading = false;

  function setStatus(msg, tone){
    statusLine.textContent = msg || '';
    statusLine.className = `ms-status${tone ? ' '+tone : ''}`;
  }

  async function refresh(dataOnly=false){
    if (loading) return;
    loading = true;
    if (!dataOnly) setStatus('Loading milestones...');
    try{
      const resp = await fetch(apiBase()+"/api/milestones");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      milestones = Array.isArray(json?.milestones) ? json.milestones : [];
      counts = json?.counts || { total: milestones.length, completed:0, in_progress:0, pending:0 };
      renderSummary();
      renderList();
      if (!dataOnly) setStatus('');
    }catch(err){
      console.warn('[Milestones] refresh failed', err);
      setStatus('Failed to load milestones.', 'error');
    }finally{
      loading = false;
    }
  }

  function renderSummary(){
    totalEl.textContent = (counts.total ?? milestones.length).toString();
    completedEl.textContent = (counts.completed ?? milestones.filter(m=>m.status==='completed').length).toString();
    inProgressEl.textContent = (counts.in_progress ?? milestones.filter(m=>m.status==='in-progress').length).toString();
  }

  function renderList(){
    listEl.innerHTML = '';
    const term = (searchEl.value||'').trim().toLowerCase();
    const wanted = (statusSel.value||'all').toLowerCase();
    const filtered = milestones.filter(item=>{
      if (wanted !== 'all' && (item.status||'').toLowerCase() !== wanted) return false;
      if (!term) return true;
      const hay = `${item.name||''} ${item.goal||''} ${item.category||''}`.toLowerCase();
      return hay.includes(term);
    });
    if (!filtered.length){
      const empty=document.createElement('div');
      empty.className='ms-card-meta';
      empty.style.padding='16px';
      empty.style.border='1px dashed var(--border)';
      empty.style.borderRadius='8px';
      empty.textContent = milestones.length ? 'No milestones match that filter.' : 'Create milestones via the CLI to see them here.';
      listEl.appendChild(empty);
      return;
    }
    filtered.sort((a,b)=>{
      const rank={'completed':0,'in-progress':1,'pending':2};
      const ar=rank[(a.status||'pending').toLowerCase()] ?? 2;
      const br=rank[(b.status||'pending').toLowerCase()] ?? 2;
      if (ar !== br) return ar - br;
      return String(a.name||'').localeCompare(String(b.name||''), undefined, { sensitivity:'base' });
    });
    filtered.forEach(item=>{
      const card=document.createElement('div');
      card.className='ms-item';
      const head=document.createElement('div');
      head.className='ms-head';
      const name=document.createElement('div');
      name.className='ms-name';
      name.textContent = item.name || 'Milestone';
      const pill=document.createElement('div');
      pill.className=`ms-pill ${(item.status||'pending').toLowerCase()}`;
      pill.textContent = (item.status||'pending').replace('-', ' ').replace(/\b\w/g, c=>c.toUpperCase());
      head.append(name,pill);

      const meta=document.createElement('div');
      meta.className='ms-meta';
      const bits=[];
      if (item.goal) bits.push(`Goal: ${item.goal}`);
      if (item.due_date) bits.push(`Due: ${item.due_date}`);
      if (item.weight) bits.push(`Weight: ${item.weight}`);
      meta.textContent = bits.join(' | ') || 'No metadata.';

      const progressWrap=document.createElement('div');
      progressWrap.className='ms-progress-bar';
      const fill=document.createElement('div');
      fill.className='ms-progress-fill';
      fill.style.width = `${Math.min(100, Math.max(0, item.progress_percent||0))}%`;
      progressWrap.appendChild(fill);
      const progressMeta=document.createElement('div');
      progressMeta.className='ms-meta';
      if (item.progress_target){
        progressMeta.textContent = `Progress: ${item.progress_current||0}/${item.progress_target}`;
      } else {
        progressMeta.textContent = `Progress: ${(item.progress_percent||0).toFixed(0)}%`;
      }

      const criteria=document.createElement('div');
      criteria.className='ms-meta';
      if (item.criteria){
        criteria.textContent = `Criteria: ${JSON.stringify(item.criteria)}`;
      }

      const actions=document.createElement('div');
      actions.className='ms-actions';
      const completeBtn=document.createElement('button');
      completeBtn.className='btn btn-primary';
      completeBtn.textContent = (item.status||'').toLowerCase()==='completed' ? 'Completed' : 'Mark Complete';
      completeBtn.disabled = (item.status||'').toLowerCase()==='completed';
      completeBtn.addEventListener('click', ()=> updateMilestone(item.name, 'complete', completeBtn));
      const resetBtn=document.createElement('button');
      resetBtn.className='btn btn-secondary';
      resetBtn.textContent='Reset';
      resetBtn.disabled = (item.status||'').toLowerCase()!=='completed';
      resetBtn.addEventListener('click', ()=> updateMilestone(item.name, 'reset', resetBtn));
      actions.append(completeBtn, resetBtn);

      card.append(head, meta, progressWrap, progressMeta);
      if (item.criteria) card.appendChild(criteria);
      card.appendChild(actions);
      listEl.appendChild(card);
    });
  }

  async function updateMilestone(name, action, button){
    if (!name) return;
    const original = button?.textContent;
    if (button){
      button.disabled = true;
      button.textContent = 'Updating...';
    }
    setStatus(action==='complete' ? `Completing '${name}'...` : `Resetting '${name}'...`);
    try{
      const resp = await fetch(apiBase()+"/api/milestone/update", {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ name, action }),
      });
      if (!resp.ok){
        const text = await resp.text();
        throw new Error(text || `HTTP ${resp.status}`);
      }
      await refresh(true);
      renderSummary();
      renderList();
      setStatus('Milestone updated.', 'success');
    }catch(err){
      console.warn('[Milestones] update failed', err);
      setStatus(`Update failed: ${err.message || err}`, 'error');
    }finally{
      if (button){
        button.disabled = false;
        button.textContent = original || 'Update';
      }
    }
  }

  searchEl.addEventListener('input', ()=> renderList());
  statusSel.addEventListener('change', ()=> renderList());
  refreshBtn.addEventListener('click', ()=> refresh());

  refresh();

  return { refresh: ()=> refresh() };
}
