export function mount(el){
  const tpl = `
    <style>
      .gt-body { display:flex; gap:10px; align-items:flex-start; }
      .gt-list { width:46%; max-height:260px; overflow:auto; border:1px solid var(--border); border-radius:8px; padding:6px; }
      .gt-details { width:54%; display:flex; flex-direction:column; gap:8px; min-height:220px; }
    </style>
    <div class="header" id="gtHeader">
      <div class="title">Goals</div>
      <div class="controls"> <label class="hint" style="display:flex; align-items:center; gap:6px;"><input type="checkbox" id="goalFxToggle" checked /> fx</label>
        <button class="icon-btn" id="gtMin" title="Minimize">_</button>
        <button class="icon-btn" id="gtClose" title="Close">x</button>
      </div>
    </div>
    <div class="content" style="gap:10px;">
      <div class="row" style="gap:8px; align-items:center;">
        <input id="gtSearch" class="input" placeholder="Search goals..." />
        <button class="btn" id="gtSearchBtn">Search</button>
        <div class="spacer"></div>
        <button class="btn" id="gtRecalc">Recalc</button>
      </div>
      <div class="gt-body">
        <div class="gt-list">
          <ul id="gtList" style="list-style:none; padding:0; margin:0;"></ul>
        </div>
        <div class="gt-details">
          <div id="gtTitle" style="font-weight:800; font-size:16px;">Select a goal</div>
          <div style="height:10px; background:#0b0f16; border:1px solid var(--border); border-radius:6px; overflow:hidden;">
            <div id="gtBar" style="height:100%; width:0%; background:linear-gradient(90deg,#12b886,#69db7c);"></div>
          </div>
          <div class="row" style="gap:8px; align-items:center;">
            <div class="hint" id="gtMeta"></div>
            <div class="spacer"></div>
            <button class="btn" id="gtApply">Apply Template</button>
          </div>
          <div id="gtMilestones"></div>
        </div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const btnMin = el.querySelector('#gtMin');
  const btnClose = el.querySelector('#gtClose');
  const searchEl = el.querySelector('#gtSearch');
  const searchBtn = el.querySelector('#gtSearchBtn');
  const listEl = el.querySelector('#gtList');
  const recalcBtn = el.querySelector('#gtRecalc');
  const titleEl = el.querySelector('#gtTitle');
  const barEl = el.querySelector('#gtBar');
  const metaEl = el.querySelector('#gtMeta');
  const applyBtn = el.querySelector('#gtApply');
  const msEl = el.querySelector('#gtMilestones');
  const fxChk = el.querySelector('#goalFxToggle');

  let fxEnabled = fxChk ? fxChk.checked : true;
  function expandText(s){ try { return (fxEnabled && window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s||'')) : String(s||''); } catch { return String(s||''); } }
  fxChk?.addEventListener('change', ()=>{ fxEnabled = !!fxChk.checked; try{ loadGoals(); }catch{} });

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

  btnMin.addEventListener('click', ()=> el.classList.toggle('minimized'));
  btnClose.addEventListener('click', ()=> { el.style.display='none'; try{ window?.ChronosBus?.emit?.('widget:closed','Goals'); }catch{} });
  searchBtn.addEventListener('click', loadGoals);
  searchEl.addEventListener('keydown', (e)=>{ if (e.key==='Enter') loadGoals(); });
  recalcBtn.addEventListener('click', async ()=>{ await fetch(apiBase()+'/api/milestone/recalc', { method:'POST' }); await loadGoals(); if (titleEl.__goal) selectGoal(titleEl.__goal); });

  async function loadGoals(){
    const resp = await fetch(apiBase()+'/api/goals');
    const data = await resp.json().catch(()=>({}));
    const goals = (data.goals||[]).filter(g => {
      const q=(searchEl.value||'').trim().toLowerCase(); if(!q) return true; return (g.name||'').toLowerCase().includes(q);
    });
    listEl.innerHTML='';
    goals.sort((a,b)=> (b.overall||0)-(a.overall||0));
    goals.forEach(g=>{
      const li=document.createElement('li'); li.style.padding='6px 8px'; li.style.cursor='pointer';
      const row=document.createElement('div'); row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center';
      const name=document.createElement('div'); name.textContent = expandText(g.name); name.style.fontWeight='700';
      const pct=document.createElement('div'); pct.textContent=`${g.overall||0}%`; pct.className='hint';
      row.append(name,pct);
      const barWrap=document.createElement('div'); barWrap.style.height='8px'; barWrap.style.background='#0b0f16'; barWrap.style.border='1px solid var(--border)'; barWrap.style.borderRadius='6px'; barWrap.style.overflow='hidden'; barWrap.style.marginTop='6px';
      const bar=document.createElement('div'); bar.style.height='100%'; bar.style.width=`${g.overall||0}%`; bar.style.background='linear-gradient(90deg,#12b886,#69db7c)'; barWrap.appendChild(bar);
      const meta=document.createElement('div'); meta.className='hint'; meta.style.marginTop='4px';
      const due=g.due_date?`Due: ${g.due_date}`:''; const mil=`${g.milestones_completed}/${g.milestones_total}`;
      meta.textContent = `${mil} ${due}`.trim();
      li.append(row, barWrap, meta);
      li.addEventListener('click', ()=> selectGoal(g.name));
      li.addEventListener('mouseenter', ()=> li.style.background='rgba(255,255,255,0.03)');
      li.addEventListener('mouseleave', ()=> li.style.background='');
      listEl.appendChild(li);
    });
  }

  async function selectGoal(name){
    const resp = await fetch(apiBase()+`/api/goal?name=${encodeURIComponent(name)}`);
    const data = await resp.json().catch(()=>({}));
    const g = data.goal||{}; if (!g.name) return;
    titleEl.textContent = expandText(g.name); titleEl.__goal = g.name;
    barEl.style.width = `${g.overall||0}%`;
    const meta = [];
    if (g.priority) meta.push(`Priority: ${g.priority}`);
    if (g.due_date) meta.push(`Due: ${g.due_date}`);
    if (g.status) meta.push(`Status: ${g.status}`);
    metaEl.textContent = meta.join('  •  ');
    msEl.innerHTML='';
    (g.milestones||[]).forEach(m=>{
      const box=document.createElement('div'); box.style.border='1px solid var(--border)'; box.style.borderRadius='8px'; box.style.padding='8px'; box.style.marginBottom='6px';
      const row=document.createElement('div'); row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center';
      const nameEl=document.createElement('div'); nameEl.textContent = expandText(m.name); nameEl.style.fontWeight='700';
      const pct=document.createElement('div'); pct.textContent=`${Math.round((m.progress?.percent)||0)}%`; pct.className='hint';
      row.append(nameEl,pct);
      const barWrap=document.createElement('div'); barWrap.style.height='8px'; barWrap.style.background='#0b0f16'; barWrap.style.border='1px solid var(--border)'; barWrap.style.borderRadius='6px'; barWrap.style.overflow='hidden'; barWrap.style.margin='6px 0';
      const bar=document.createElement('div'); bar.style.height='100%'; bar.style.width=`${Math.round((m.progress?.percent)||0)}%`; bar.style.background='linear-gradient(90deg,#228be6,#74c0fc)'; barWrap.appendChild(bar);
      const crit=document.createElement('div'); crit.className='hint'; crit.textContent = expandText(m.criteria || '');
      const actions=document.createElement('div'); actions.style.display='flex'; actions.style.gap='6px'; actions.style.marginTop='6px';
      const btnDone=document.createElement('button'); btnDone.className='btn'; btnDone.textContent='Mark Complete'; btnDone.addEventListener('click', async ()=>{ await fetch(apiBase()+'/api/milestone/complete', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ name: m.name }) }); await selectGoal(g.name); });
      const btnFocus=document.createElement('button'); btnFocus.className='btn'; btnFocus.textContent='Start Focus'; btnFocus.addEventListener('click', async ()=>{
        const link = (m.links||[])[0] || ({});
        if (!link.type || !link.name){ alert('No linked item to bind'); return; }
        await fetch(apiBase()+'/api/timer/start', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ profile:'classic_pomodoro', bind_type: link.type, bind_name: link.name }) });
        alert('Timer started');
      });
      actions.append(btnDone, btnFocus);
      box.append(row, barWrap, crit, actions);
      msEl.appendChild(box);
    });
  }

  applyBtn.addEventListener('click', async ()=>{
    const name = titleEl.__goal; if (!name){ alert('Select a goal first'); return; }
    const r = await fetch(apiBase()+'/api/goal/apply', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ name }) });
    if (!r.ok){ alert('Apply failed'); return; }
    await selectGoal(name);
  });

  loadGoals();
}

