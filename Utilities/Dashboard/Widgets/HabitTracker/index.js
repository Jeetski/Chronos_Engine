export function mount(el, context) {
  const tpl = `

  const fxChk = header.querySelector('#habitFxToggle');
  let fxEnabled = fxChk ? fxChk.checked : true;
  function expandText(s){ try { return (fxEnabled && window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s||'')) : String(s||''); } catch { return String(s||''); } }
  fxChk?.addEventListener('change', ()=>{ fxEnabled = !!fxChk.checked; try{ refresh(); }catch{} });
    <div class="header" id="habitHeader">
      <div class="title">Habits</div>
      <div class="controls">
        <input id="habitSearch" class="input" placeholder="Search habits" style="width:160px;" /> <label class="hint" style="display:flex; align-items:center; gap:6px;"><input type="checkbox" id="habitFxToggle" checked /> fx</label>
        <select id="habitPolarity" class="input" style="width:120px;">
          <option value="all">All</option>
          <option value="good">Good</option>
          <option value="bad">Bad</option>
        </select>
        <button class="icon-btn" id="habitMin" title="Minimize">_</button>
        <button class="icon-btn" id="habitClose" title="Close">x</button>
      </div>
    </div>
    <div class="content" id="habitContent" style="gap:8px;">
      <div class="row" id="habitSummary" style="gap:8px; color:#a6adbb;"></div>
      <div id="habitList" style="display:block; overflow:auto; max-height:360px;"></div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const header = el.querySelector('#habitHeader');
  const btnMin = el.querySelector('#habitMin');
  const btnClose = el.querySelector('#habitClose');
  const searchEl = el.querySelector('#habitSearch');
  const polSel = el.querySelector('#habitPolarity');
  const content = el.querySelector('#habitContent');
  const listEl = el.querySelector('#habitList');
  const summaryEl = el.querySelector('#habitSummary');

  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  const save = (k,v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} };
  const load = (k,f)=>{ try{ const v=localStorage.getItem(k); return v? JSON.parse(v): f; }catch{ return f; } };

  // Dragging
  header.addEventListener('pointerdown', (ev)=>{
    const startX=ev.clientX, startY=ev.clientY; const rect=el.getBoundingClientRect(); const offX=startX-rect.left, offY=startY-rect.top;
    function onMove(e){ el.style.left=Math.max(6, e.clientX-offX)+'px'; el.style.top=Math.max(6, e.clientY-offY)+'px'; el.style.right='auto'; }
    function onUp(){ window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  });
  btnMin.addEventListener('click', ()=> el.classList.toggle('minimized'));
  btnClose.addEventListener('click', ()=> el.style.display='none');

  // Restore filters
  polSel.value = load('habits_polarity','all');
  searchEl.value = load('habits_search','');

  function setSummary(items){
    try{
      const good = items.filter(h=>h.polarity!=='bad');
      const bad = items.filter(h=>h.polarity==='bad');
      const goodDone = good.filter(h=>h.today_status==='done').length;
      const badInc = bad.filter(h=>h.today_status==='incident').length;
      summaryEl.textContent = `Good: ${goodDone}/${good.length} done today â€¢ Bad: ${badInc}/${bad.length} incidents today`;
    }catch{ summaryEl.textContent=''; }
  }

  function rowFor(h){
    const row = document.createElement('div');
    row.className='row'; row.style.justifyContent='space-between'; row.style.alignItems='center'; row.style.borderBottom='1px solid #222835'; row.style.padding='6px 0';
    const left = document.createElement('div'); left.style.display='flex'; left.style.flexDirection='column';
    const name = document.createElement('div'); name.textContent = expandText(h.name); name.style.color='#e6e8ef';
    const meta = document.createElement('div'); meta.className='hint'; meta.textContent = `${h.polarity==='bad'?'bad':'good'}${h.category? ' â€¢ '+h.category:''}${h.priority? ' â€¢ '+h.priority:''}`;
    left.append(name, meta);
    const right = document.createElement('div'); right.style.display='flex'; right.style.gap='6px'; right.style.alignItems='center';
    const streak = document.createElement('span'); streak.className='hint';
    if (h.polarity==='bad') streak.textContent = `clean ${h.clean_current||0}/${h.clean_longest||0}`; else streak.textContent = `streak ${h.streak_current||0}/${h.streak_longest||0}`;
    const status = document.createElement('span'); status.className='hint'; status.style.color = h.today_status==='done'?'#5bdc82': (h.today_status==='incident'?'#ef6a6a':'#a6adbb'); status.textContent = expandText(h.today_status || '');
    const btn = document.createElement('button'); btn.className='btn';
    if (h.polarity==='bad'){ btn.textContent='Incident'; } else { btn.textContent='Done'; }
    btn.addEventListener('click', async ()=>{
      btn.disabled=true; try{
        const ep = (h.polarity==='bad')? '/api/habits/incident' : '/api/habits/complete';
        await fetch(apiBase()+ep, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: h.name }) });
      }catch{} btn.disabled=false; await refresh();
    });
    right.append(streak, status, btn);
    row.append(left, right);
    return row;
  }

  async function fetchHabits(){
    try{
      const resp = await fetch(apiBase()+"/api/habits");
      const text = await resp.text();
      // Parse minimal YAML list: 'habits:' then '- name: ...'
      const lines = String(text||'').replace(/\r\n?/g,'\n').split('\n');
      let inList=false; const out=[]; let cur=null;
      for (let raw of lines){ const line = raw.replace(/#.*$/,''); if (!line.trim()) continue; if (!inList) { if (/^\s*habits\s*:/i.test(line)) inList=true; continue; }
        if (/^\s*-\s*/.test(line)) { if (cur) out.push(cur); cur={}; continue; }
        const m = line.match(/^\s*(\w+)\s*:\s*(.+)$/); if (m && cur) cur[m[1]] = m[2];
      }
      if (cur) out.push(cur); return out.map(h=>({
        name: String(h.name||''),
        polarity: String(h.polarity||'good'),
        category: h.category||'', priority: h.priority||'',
        streak_current: parseInt(h.streak_current||'0',10), streak_longest: parseInt(h.streak_longest||'0',10),
        clean_current: parseInt(h.clean_current||'0',10), clean_longest: parseInt(h.clean_longest||'0',10),
        today_status: h.today_status||null,
      }));
    }catch{return[]}
  }

  async function refresh(){
    const items = await fetchHabits();
    setSummary(items);
    const q = (searchEl.value||'').toLowerCase(); const pol = polSel.value;
    save('habits_search', searchEl.value||''); save('habits_polarity', pol);
    const filtered = items.filter(h=> (pol==='all'||h.polarity===pol) && (q==='' || h.name.toLowerCase().includes(q)) );
    listEl.innerHTML='';
    filtered.forEach(h=> listEl.appendChild(rowFor(h)) );
  }

  searchEl.addEventListener('input', ()=> refresh());
  polSel.addEventListener('change', ()=> refresh());

  (async ()=>{ await refresh(); })();

  return {
    unmount(){ /* TODO: remove listeners if needed */ }
  };
}


