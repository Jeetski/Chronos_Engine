export function mount(el) {
  const tpl = `
    <style>
      .cm-content { display:flex; flex-direction:column; gap:10px; min-height:0; }
      .cm-cards { display:flex; gap:10px; flex-wrap:wrap; }
      .cm-card { flex:1 1 180px; border:1px solid var(--border); border-radius:10px; padding:10px; background:#0f141d; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.02); }
      .cm-card h4 { margin:0 0 4px; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-dim); }
      .cm-card-value { font-size:28px; font-weight:800; margin:4px 0; }
      .cm-card-meta { font-size:12px; color:var(--text-dim); }
      .cm-status { min-height:18px; font-size:13px; color:var(--text-dim); }
      .cm-status.error { color:#ef6a6a; }
      .cm-status.success { color:#5bdc82; }
      .cm-list { display:flex; flex-direction:column; gap:10px; flex:1 1 auto; min-height:0; overflow:auto; }
      .cm-item { border:1px solid var(--border); border-radius:10px; padding:10px; background:#0f141d; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.02); display:flex; flex-direction:column; gap:6px; }
      .cm-head { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
      .cm-name { font-size:15px; font-weight:700; }
      .cm-pill { padding:2px 10px; border-radius:999px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; }
      .cm-pill.pending { background:rgba(122,162,247,0.15); color:#7aa2f7; }
      .cm-pill.met { background:rgba(91,220,130,0.18); color:#5bdc82; }
      .cm-pill.violation { background:rgba(239,106,106,0.18); color:#ef6a6a; }
      .cm-meta { font-size:12px; color:var(--text-dim); }
      .cm-tags { display:flex; flex-wrap:wrap; gap:4px; font-size:11px; }
      .cm-tag { padding:2px 6px; border-radius:999px; border:1px solid rgba(255,255,255,0.08); }
      .cm-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    </style>
    <div class="header">
      <div class="title">Commitments</div>
      <div class="controls" style="align-items:center; gap:6px;">
        <button class="btn" id="cmEvaluate" style="padding:4px 10px;">Evaluate</button>
        <button class="icon-btn" id="cmMin">_</button>
        <button class="icon-btn" id="cmClose">x</button>
      </div>
    </div>
    <div class="content cm-content">
      <div class="cm-cards">
        <div class="cm-card">
          <h4>Total</h4>
          <div class="cm-card-value" id="cmTotal">--</div>
          <div class="cm-card-meta">All defined commitments.</div>
        </div>
        <div class="cm-card">
          <h4>On Track</h4>
          <div class="cm-card-value" id="cmMet">--</div>
          <div class="cm-card-meta">Met this period.</div>
        </div>
        <div class="cm-card">
          <h4>Violations</h4>
          <div class="cm-card-value" id="cmViolations">--</div>
          <div class="cm-card-meta">Forbidden rules triggered today.</div>
        </div>
      </div>
      <div class="row" style="gap:8px; flex-wrap:wrap;">
        <input id="cmSearch" class="input" placeholder="Search commitments..." style="flex:1 1 220px; min-width:160px;" />
        <select id="cmStatusFilter" class="input" style="flex:0 0 180px;">
          <option value="all">All states</option>
          <option value="pending">Pending</option>
          <option value="met">Met</option>
          <option value="violation">Violations</option>
        </select>
        <div class="spacer"></div>
        <button class="btn" id="cmRefresh">Refresh</button>
      </div>
      <div id="cmStatus" class="cm-status"></div>
      <div id="cmList" class="cm-list"></div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const btnMin = el.querySelector('#cmMin');
  const btnClose = el.querySelector('#cmClose');
  const refreshBtn = el.querySelector('#cmRefresh');
  const evaluateBtn = el.querySelector('#cmEvaluate');
  const searchEl = el.querySelector('#cmSearch');
  const statusSel = el.querySelector('#cmStatusFilter');
  const statusLine = el.querySelector('#cmStatus');
  const listEl = el.querySelector('#cmList');
  const totalEl = el.querySelector('#cmTotal');
  const metEl = el.querySelector('#cmMet');
  const violationEl = el.querySelector('#cmViolations');

  btnMin.addEventListener('click', ()=> el.classList.toggle('minimized'));
  btnClose.addEventListener('click', ()=> { el.style.display='none'; try { window?.ChronosBus?.emit?.('widget:closed','Commitments'); } catch {} });

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

  let commitments = [];
  let counts = { total:0, met:0, violations:0, pending:0 };
  let loading = false;

  function setStatus(msg, tone){
    statusLine.textContent = msg || '';
    statusLine.className = `cm-status${tone ? ' '+tone : ''}`;
  }

  async function refresh(dataOnly=false){
    if (loading) return;
    loading = true;
    if (!dataOnly) setStatus('Loading commitments...');
    try{
      const resp = await fetch(apiBase()+"/api/commitments");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      commitments = Array.isArray(json?.commitments) ? json.commitments : [];
      counts = json?.counts || { total: commitments.length, met:0, violations:0, pending:0 };
      renderSummary();
      renderList();
      if (!dataOnly) setStatus('');
    }catch(err){
      console.warn('[Commitments] refresh failed', err);
      setStatus('Failed to load commitments.', 'error');
    }finally{
      loading = false;
    }
  }

  function renderSummary(){
    totalEl.textContent = (counts.total ?? commitments.length).toString();
    metEl.textContent = (counts.met ?? commitments.filter(c=>c.status==='met').length).toString();
    violationEl.textContent = (counts.violations ?? commitments.filter(c=>c.status==='violation').length).toString();
  }

  function renderList(){
    listEl.innerHTML = '';
    const term = (searchEl.value||'').trim().toLowerCase();
    const wanted = (statusSel.value||'all').toLowerCase();
    const filtered = commitments.filter(item=>{
      if (wanted !== 'all' && (item.status||'').toLowerCase() !== wanted) return false;
      if (!term) return true;
      const hay = `${item.name||''} ${item.description||''} ${item.period||''} ${(item.associated||[]).map(a=>a.name||'').join(' ')}`.toLowerCase();
      return hay.includes(term);
    });
    if (!filtered.length){
      const empty=document.createElement('div');
      empty.className='cm-card-meta';
      empty.style.padding='16px';
      empty.style.border='1px dashed var(--border)';
      empty.style.borderRadius='8px';
      empty.textContent = commitments.length ? 'No commitments match that filter.' : 'Define commitments via CLI to see them here.';
      listEl.appendChild(empty);
      return;
    }
    filtered.sort((a,b)=>{
      const rank = { 'violation':0,'pending':1,'met':2 };
      const ar = rank[(a.status||'pending').toLowerCase()] ?? 1;
      const br = rank[(b.status||'pending').toLowerCase()] ?? 1;
      if (ar !== br) return ar - br;
      return String(a.name||'').localeCompare(String(b.name||''), undefined, { sensitivity:'base' });
    });
    filtered.forEach(item=>{
      const card=document.createElement('div');
      card.className='cm-item';
      const head=document.createElement('div');
      head.className='cm-head';
      const name=document.createElement('div');
      name.className='cm-name';
      name.textContent=item.name||'Commitment';
      const pill=document.createElement('div');
      const state=(item.status||'pending').toLowerCase();
      pill.className=`cm-pill ${state}`;
      pill.textContent = state.charAt(0).toUpperCase()+state.slice(1);
      head.append(name,pill);

      const desc=document.createElement('div');
      desc.className='cm-meta';
      desc.textContent=item.description || 'No description.';

      const freq=document.createElement('div');
      freq.className='cm-meta';
      const req = item.times_required || 0;
      const prog = item.progress || 0;
      freq.textContent = req ? `Progress: ${prog}/${req} this ${item.period || 'period'}` : 'Progress: n/a';

      const assoc=document.createElement('div');
      assoc.className='cm-meta';
      const assocNames = (item.associated||[]).map(it=> `${it.type||'?'}:${it.name||''}`).filter(Boolean).join(', ');
      if (assocNames) assoc.textContent = `Associated: ${assocNames}`;

      const forb=document.createElement('div');
      forb.className='cm-meta';
      const forbNames = (item.forbidden||[]).map(it=> `${it.type||'?'}:${it.name||''}`).filter(Boolean).join(', ');
      if (forbNames) forb.textContent = `Forbidden: ${forbNames}`;

      const stamps=document.createElement('div');
      stamps.className='cm-meta';
      const stampBits=[];
      if (item.last_met) stampBits.push(`Last met: ${item.last_met}`);
      if (item.last_violation) stampBits.push(`Last violation: ${item.last_violation}`);
      stamps.textContent = stampBits.join(' | ');

      const actions=document.createElement('div');
      actions.className='cm-actions';
      const evalBtn=document.createElement('button');
      evalBtn.className='btn btn-secondary';
      evalBtn.textContent='Evaluate';
      evalBtn.addEventListener('click', ()=> runEvaluation());
      actions.appendChild(evalBtn);

      card.append(head, desc, freq);
      if (assocNames) card.appendChild(assoc);
      if (forbNames) card.appendChild(forb);
      if (stampBits.length) card.appendChild(stamps);
      card.appendChild(actions);
      listEl.appendChild(card);
    });
  }

  async function runEvaluation(){
    setStatus('Evaluating commitments...');
    try{
      const payload = { command: 'commitments', args: ['check'], properties: {} };
      const resp = await fetch(apiBase()+"/api/cli", {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await resp.text();
      if (!resp.ok){
        throw new Error(text || `HTTP ${resp.status}`);
      }
      await refresh(true);
      renderSummary();
      renderList();
      setStatus('Commitments evaluated.', 'success');
    }catch(err){
      console.warn('[Commitments] evaluate failed', err);
      setStatus(`Evaluation failed: ${err.message || err}`, 'error');
    }
  }

  searchEl.addEventListener('input', ()=> renderList());
  statusSel.addEventListener('change', ()=> renderList());
  refreshBtn.addEventListener('click', ()=> refresh());
  evaluateBtn.addEventListener('click', ()=> runEvaluation());

  refresh();

  return { refresh: ()=> refresh() };
}
