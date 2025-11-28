export function mount(el) {
  const tpl = `
    <style>
      .rw-content { display:flex; flex-direction:column; gap:10px; }
      .rw-summary { display:flex; flex-wrap:wrap; gap:10px; }
      .rw-card { flex:1 1 220px; border:1px solid var(--border); border-radius:10px; padding:10px; background:#0f141d; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.02); }
      .rw-card h4 { margin:0 0 4px; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-dim); }
      .rw-balance-value { font-size:30px; font-weight:800; color:var(--accent); margin:4px 0 6px; }
      .rw-ledger { max-height:140px; overflow:auto; display:flex; flex-direction:column; gap:4px; }
      .rw-ledger-row { display:flex; justify-content:space-between; gap:8px; padding:4px 6px; border:1px solid rgba(255,255,255,0.04); border-radius:6px; background:rgba(255,255,255,0.02); }
      .rw-delta { font-weight:700; min-width:46px; }
      .rw-delta.pos { color:#5bdc82; }
      .rw-delta.neg { color:#ef6a6a; }
      .rw-meta { font-size:12px; color:var(--text-dim); }
      .rw-list { display:flex; flex-direction:column; gap:10px; min-height:120px; overflow:auto; }
      .rw-reward { border:1px solid var(--border); border-radius:10px; padding:10px; background:#0f141d; display:flex; flex-direction:column; gap:6px; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.02); }
      .rw-reward.disabled { opacity:0.65; }
      .rw-reward-head { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px; }
      .rw-name { font-size:15px; font-weight:700; }
      .rw-cost { font-weight:700; color:#f6c177; }
      .rw-tags { display:flex; flex-wrap:wrap; gap:4px; font-size:11px; }
      .rw-tag { padding:2px 6px; border:1px solid rgba(255,255,255,0.08); border-radius:999px; }
      .rw-status { min-height:18px; font-size:13px; color:var(--text-dim); }
      .rw-status.error { color:#ef6a6a; }
      .rw-status.success { color:#5bdc82; }
      .rw-actions { display:flex; gap:8px; align-items:center; justify-content:flex-end; flex-wrap:wrap; }
      .rw-empty { border:1px dashed var(--border); border-radius:10px; padding:20px; text-align:center; color:var(--text-dim); }
    </style>
    <div class="header">
      <div class="title">Rewards</div>
      <div class="controls" style="align-items:center; gap:6px;">
        <label class="hint" style="display:flex; align-items:center; gap:4px;">
          <input type="checkbox" id="rwFxToggle" checked /> fx
        </label>
        <button class="icon-btn" id="rwMin" title="Minimize">_</button>
        <button class="icon-btn" id="rwClose" title="Close">x</button>
      </div>
    </div>
    <div class="content rw-content">
      <div class="rw-summary">
        <div class="rw-card">
          <h4>Balance</h4>
          <div id="rwBalance" class="rw-balance-value">--</div>
          <div class="rw-meta">Total Chronos points available.</div>
        </div>
        <div class="rw-card">
          <h4>Recent Activity</h4>
          <div id="rwLedger" class="rw-ledger"></div>
        </div>
      </div>
      <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap;">
        <input id="rwSearch" class="input" placeholder="Search rewards..." style="flex:1 1 240px; min-width:160px;" />
        <label class="hint" style="display:flex; align-items:center; gap:6px;">
          <input type="checkbox" id="rwReadyOnly" /> Ready only
        </label>
        <div class="spacer"></div>
        <button class="btn" id="rwRefresh">Refresh</button>
      </div>
      <div id="rwStatus" class="rw-status"></div>
      <div id="rwList" class="rw-list"></div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const btnMin = el.querySelector('#rwMin');
  const btnClose = el.querySelector('#rwClose');
  const fxToggle = el.querySelector('#rwFxToggle');
  const searchEl = el.querySelector('#rwSearch');
  const readyChk = el.querySelector('#rwReadyOnly');
  const refreshBtn = el.querySelector('#rwRefresh');
  const statusEl = el.querySelector('#rwStatus');
  const listEl = el.querySelector('#rwList');
  const balanceEl = el.querySelector('#rwBalance');
  const ledgerEl = el.querySelector('#rwLedger');

  btnMin.addEventListener('click', () => el.classList.toggle('minimized'));
  btnClose.addEventListener('click', () => { el.style.display = 'none'; try { window?.ChronosBus?.emit?.('widget:closed','Rewards'); } catch {} });

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  let fxEnabled = fxToggle ? fxToggle.checked : true;
  function expandText(s){
    try{
      if (!fxEnabled) return String(s||'');
      return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s||'')) : String(s||'');
    }catch{
      return String(s||'');
    }
  }
  fxToggle?.addEventListener('change', ()=>{ fxEnabled = !!fxToggle.checked; renderRewards(); });

  let rewards = [];
  let balance = 0;
  let history = [];
  let loading = false;

  function setStatus(msg, tone){
    statusEl.textContent = msg || '';
    statusEl.className = `rw-status${tone ? ' '+tone : ''}`;
  }

  async function fetchJson(url){
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    return await resp.json();
  }

  async function refreshAll(options={}){
    const silent = !!options.silent;
    if (loading) return;
    loading = true;
    if (!silent) setStatus('Loading rewards...');
    try{
      const [pointsData, rewardsData] = await Promise.all([
        fetchJson(apiBase()+"/api/points?limit=6").catch(()=>({})),
        fetchJson(apiBase()+"/api/rewards").catch(()=>({}))
      ]);
      balance = Number(pointsData?.balance ?? 0) || 0;
      history = Array.isArray(pointsData?.history) ? pointsData.history : [];
      rewards = Array.isArray(rewardsData?.rewards) ? rewardsData.rewards : [];
      renderBalance();
      renderRewards();
      if (!silent) setStatus('');
    }catch(e){
      console.warn('[Rewards] refresh error', e);
      setStatus('Failed to load rewards.', 'error');
    }finally{
      loading = false;
    }
  }

  function renderBalance(){
    balanceEl.textContent = balance.toLocaleString();
    ledgerEl.innerHTML = '';
    const recent = history.slice(-5).reverse();
    if (!recent.length){
      const empty=document.createElement('div');
      empty.className='hint';
      empty.textContent='No point activity yet.';
      ledgerEl.appendChild(empty);
      return;
    }
    recent.forEach(entry=>{
      const row=document.createElement('div');
      row.className='rw-ledger-row';
      const delta=document.createElement('span');
      delta.className='rw-delta ' + ((entry.delta||0)>=0 ? 'pos':'neg');
      delta.textContent = `${(entry.delta||0)>=0?'+':''}${entry.delta||0}`;
      const meta=document.createElement('div');
      meta.className='rw-meta';
      const reason = entry.reason || entry.source || '';
      const when = entry.date || '';
      meta.textContent = `${reason}${when ? ' | '+when : ''}`;
      row.append(delta, meta);
      ledgerEl.appendChild(row);
    });
  }

  function renderRewards(){
    listEl.innerHTML = '';
    const term = (searchEl.value||'').trim().toLowerCase();
    const readyOnly = !!readyChk?.checked;
    const filtered = rewards.filter(r=>{
      if (readyOnly && !r.available) return false;
      if (!term) return true;
      const hay = `${r.name||''} ${r.category||''} ${r.description||''}`.toLowerCase();
      return hay.includes(term);
    });
    const sorted = filtered.slice().sort((a,b)=>{
      if (a.available !== b.available) return a.available ? -1 : 1;
      const ap = a.cost_points || 0;
      const bp = b.cost_points || 0;
      if (ap !== bp) return ap - bp;
      return String(a.name||'').localeCompare(String(b.name||''), undefined, { sensitivity:'base' });
    });
    if (!sorted.length){
      const empty=document.createElement('div');
      empty.className='rw-empty';
      empty.textContent = rewards.length ? 'No rewards match that filter.' : 'Create reward items via the console to see them here.';
      listEl.appendChild(empty);
      return;
    }
    sorted.forEach(item=>{
      const card=document.createElement('div');
      card.className='rw-reward' + (item.available ? '' : ' disabled');
      const head=document.createElement('div');
      head.className='rw-reward-head';
      const name=document.createElement('div');
      name.className='rw-name';
      name.textContent = expandText(item.name || '');
      const cost=document.createElement('div');
      cost.className='rw-cost';
      cost.textContent = `${item.cost_points||0} pts`;
      head.append(name,cost);
      const desc=document.createElement('div');
      desc.className='rw-meta';
      desc.textContent = expandText(item.description || 'No description.');
      const meta=document.createElement('div');
      meta.className='rw-meta';
      const bits=[];
      if (item.category) bits.push(`Category: ${item.category}`);
      if (item.priority) bits.push(`Priority: ${item.priority}`);
      if (item.redemptions !== undefined){
        const cap = item.max_redemptions ? `${item.redemptions||0}/${item.max_redemptions}` : `${item.redemptions||0}`;
        bits.push(`Redemptions: ${cap}`);
      }
      meta.textContent = bits.join(' | ');
      const tagWrap=document.createElement('div');
      tagWrap.className='rw-tags';
      const tags = Array.isArray(item.tags) ? item.tags : (typeof item.tags === 'string' ? item.tags.split(',') : []);
      tags.map(t=>String(t||'').trim()).filter(Boolean).slice(0,4).forEach(tag=>{
        const chip=document.createElement('div');
        chip.className='rw-tag';
        chip.textContent=expandText(tag);
        tagWrap.appendChild(chip);
      });
      const statusLine=document.createElement('div');
      statusLine.className='rw-meta';
      let statusText='Ready to redeem';
      if (!item.limit_ready) statusText='Max redemptions reached';
      else if (!item.cooldown_ready && item.cooldown_remaining_minutes){
        statusText=`Cooldown ${item.cooldown_remaining_minutes}m`;
      }
      const needsPoints = (item.cost_points||0) > balance;
      if (needsPoints) statusText += ` - need ${(item.cost_points||0)-balance} more pts`;
      statusLine.textContent = statusText;
      const actions=document.createElement('div');
      actions.className='rw-actions';
      const redeemBtn=document.createElement('button');
      redeemBtn.className='btn btn-primary';
      redeemBtn.textContent='Redeem';
      const disable = !item.available || needsPoints;
      redeemBtn.disabled = disable;
      redeemBtn.addEventListener('click', ()=> redeemReward(item, redeemBtn));
      actions.appendChild(redeemBtn);
      card.append(head, desc, meta);
      if (tagWrap.children.length) card.appendChild(tagWrap);
      card.append(statusLine, actions);
      listEl.appendChild(card);
    });
  }

  async function redeemReward(item, btn){
    if (!item?.name) return;
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Redeeming...';
    setStatus(`Redeeming "${item.name}"...`);
    try{
      const resp = await fetch(apiBase()+"/api/reward/redeem", {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ name: item.name })
      });
      const data = await resp.json().catch(()=>({}));
      if (!resp.ok || data.ok === False){
        const err = data?.stderr || data?.error || 'Redeem failed';
        throw new Error(err);
      }
      await refreshAll({ silent:true });
      const msg = (data && data.stdout) ? data.stdout : `Redeemed ${item.name}.`;
      setStatus(msg, 'success');
    }catch(e){
      console.warn('[Rewards] redeem error', e);
      setStatus(String(e.message || e), 'error');
    }finally{
      btn.textContent = orig;
      btn.disabled = false;
    }
  }

  searchEl.addEventListener('input', ()=> renderRewards());
  readyChk?.addEventListener('change', ()=> renderRewards());
  refreshBtn.addEventListener('click', ()=> refreshAll());

  refreshAll();

  return {
    refresh: ()=> refreshAll()
  };
}
