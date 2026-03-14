export function mount(el) {
  // Load CSS
  if (!document.getElementById('goal-tracker-css')) {
    const link = document.createElement('link');
    link.id = 'goal-tracker-css';
    link.rel = 'stylesheet';
    link.href = new URL('./goal-tracker.css', import.meta.url).toString();
    document.head.appendChild(link);
  }

  el.className = 'widget goal-tracker-widget';
  try { el.dataset.uiId = 'widget.goal_tracker'; } catch { }
  el.dataset.autoheight = 'off';
  el.dataset.minWidth = '760';
  el.dataset.minHeight = '420';
  el.style.minWidth = '760px';
  el.style.minHeight = '420px';
  if (!Number.isFinite(parseFloat(el.style.width)) || parseFloat(el.style.width) < 760) el.style.width = '820px';
  if (!Number.isFinite(parseFloat(el.style.height)) || parseFloat(el.style.height) < 420) el.style.height = '460px';

  const tpl = `
    <style>
      .goal-tracker-widget { min-width:760px; min-height:420px; }
      .goal-tracker-widget .content { min-height:0; }
      .gt-shell { display:flex; flex-direction:column; gap:10px; flex:1; min-height:0; }
      .gt-toolbar { display:flex; gap:8px; align-items:center; }
      .gt-body { display:flex; gap:10px; align-items:stretch; flex:1; min-height:0; }
      .gt-pane { display:flex; flex-direction:column; min-width:0; min-height:0; border:1px solid var(--border); border-radius:8px; background:rgba(255,255,255,0.02); }
      .gt-pane-header { padding:8px 10px; border-bottom:1px solid var(--border); font-size:11px; letter-spacing:0.05em; text-transform:uppercase; color:var(--muted); }
      .gt-list-pane { flex:0 0 44%; }
      .gt-details-pane { flex:1 1 56%; }
      .gt-scroll { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; }
      .gt-list-scroll { padding:6px; }
      .gt-list-scroll ul { list-style:none; padding:0; margin:0; }
      .gt-details-top { padding:10px; display:flex; flex-direction:column; gap:8px; border-bottom:1px solid var(--border); }
      .gt-milestones-scroll { padding:10px; }
      .gt-goal-item { padding:8px 10px; cursor:pointer; border-radius:8px; }
      .gt-goal-item + .gt-goal-item { margin-top:6px; }
      .gt-milestone-card { border:1px solid var(--border); border-radius:8px; padding:8px; }
      .gt-milestone-card + .gt-milestone-card { margin-top:8px; }
    </style>
    <div class="header" id="gtHeader" data-ui-id="widget.goal_tracker.header">
      <div class="title" data-ui-id="widget.goal_tracker.title">Goals</div>
      <div class="controls">
        <button class="icon-btn" id="gtMin" title="Minimize" data-ui-id="widget.goal_tracker.minimize_button">_</button>
        <button class="icon-btn" id="gtClose" title="Close" data-ui-id="widget.goal_tracker.close_button">x</button>
      </div>
    </div>
    <div class="content" style="gap:10px;" data-ui-id="widget.goal_tracker.panel">
      <div class="gt-shell">
          <div class="gt-toolbar">
            <input id="gtSearch" class="input" placeholder="Search goals..." data-ui-id="widget.goal_tracker.search_input" />
            <button class="btn" id="gtSearchBtn" data-ui-id="widget.goal_tracker.search_button">Search</button>
            <div class="spacer"></div>
            <button class="btn" id="gtRecalc" data-ui-id="widget.goal_tracker.recalc_button">Recalc</button>
            <button class="btn" id="gtRefresh" data-ui-id="widget.goal_tracker.refresh_button">Refresh</button>
          </div>
      <div class="gt-body">
        <div class="gt-pane gt-list-pane" data-ui-id="widget.goal_tracker.list_container">
          <div class="gt-pane-header">Goals</div>
          <div class="gt-scroll gt-list-scroll">
            <ul id="gtList" data-ui-id="widget.goal_tracker.goal_list"></ul>
          </div>
        </div>
        <div class="gt-pane gt-details-pane">
          <div class="gt-pane-header">Milestones</div>
          <div class="gt-details-top">
            <div id="gtTitle" style="font-weight:800; font-size:16px;" data-ui-id="widget.goal_tracker.goal_title_text">Select a goal</div>
            <div style="height:10px; background:#0b0f16; border:1px solid var(--border); border-radius:6px; overflow:hidden;">
              <div id="gtBar" style="height:100%; width:0%; background:linear-gradient(90deg,#12b886,#69db7c);" data-ui-id="widget.goal_tracker.goal_progress_bar"></div>
            </div>
            <div class="row" style="gap:8px; align-items:center;">
              <div class="hint" id="gtMeta" data-ui-id="widget.goal_tracker.goal_meta_text"></div>
              <div class="spacer"></div>
            </div>
            <div class="row" style="gap:8px; align-items:center;">
              <button class="btn" id="gtPrimaryComplete" data-ui-id="widget.goal_tracker.complete_primary_button">Complete Primary</button>
              <button class="btn" id="gtPrimaryFocus" data-ui-id="widget.goal_tracker.focus_primary_button">Focus Primary</button>
            </div>
          </div>
          <div class="gt-scroll gt-milestones-scroll">
            <div id="gtMilestones" data-ui-id="widget.goal_tracker.milestones_container"></div>
          </div>
        </div>
      </div>
      <div class="hint" id="gtStatus" data-ui-id="widget.goal_tracker.status_text">Ready.</div>
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
  const refreshBtn = el.querySelector('#gtRefresh');
  const msEl = el.querySelector('#gtMilestones');
  const statusEl = el.querySelector('#gtStatus');
  const primaryCompleteBtn = el.querySelector('#gtPrimaryComplete');
  const primaryFocusBtn = el.querySelector('#gtPrimaryFocus');

  function setStatus(text) {
    if (statusEl) statusEl.textContent = String(text || 'Ready.');
  }

  function expandText(s) { try { return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s || '')) : String(s || ''); } catch { return String(s || ''); } }

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

  btnMin.addEventListener('click', () => { el.classList.toggle('minimized'); setStatus(el.classList.contains('minimized') ? 'Minimized.' : 'Ready.'); });
  btnClose.addEventListener('click', () => { el.style.display = 'none'; setStatus('Closed.'); try { window?.ChronosBus?.emit?.('widget:closed', 'Goals'); } catch { } });
  searchBtn.addEventListener('click', loadGoals);
  searchEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadGoals(); });
  recalcBtn.addEventListener('click', async () => { setStatus('Recalculating milestones...'); await fetch(apiBase() + '/api/milestone/recalc', { method: 'POST' }); await loadGoals(); if (titleEl.__goal) selectGoal(titleEl.__goal); setStatus('Milestones recalculated.'); });
  refreshBtn.addEventListener('click', async () => { setStatus('Refreshing goals...'); await loadGoals(); if (titleEl.__goal) selectGoal(titleEl.__goal); setStatus('Goals refreshed.'); });
  primaryCompleteBtn?.addEventListener('click', async () => {
    const goalName = titleEl.__goal;
    if (!goalName) return;
    const firstBtn = msEl.querySelector('button');
    if (!firstBtn) return;
    firstBtn.click();
  });
  primaryFocusBtn?.addEventListener('click', async () => {
    const goalName = titleEl.__goal;
    if (!goalName) return;
    const buttons = msEl.querySelectorAll('button');
    if (buttons.length < 2) return;
    buttons[1].click();
  });

  async function loadGoals() {
    setStatus('Loading goals...');
    const resp = await fetch(apiBase() + '/api/goals');
    const data = await resp.json().catch(() => ({}));
    const goals = (data.goals || []).filter(g => {
      const q = (searchEl.value || '').trim().toLowerCase(); if (!q) return true; return (g.name || '').toLowerCase().includes(q);
    });
    listEl.innerHTML = '';
    goals.sort((a, b) => (b.overall || 0) - (a.overall || 0));
    goals.forEach(g => {
      const li = document.createElement('li'); li.className = 'gt-goal-item';
      const row = document.createElement('div'); row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center';
      const name = document.createElement('div'); name.textContent = expandText(g.name); name.style.fontWeight = '700';
      const pct = document.createElement('div'); pct.textContent = `${g.overall || 0}%`; pct.className = 'hint';
      row.append(name, pct);
      const barWrap = document.createElement('div'); barWrap.style.height = '8px'; barWrap.style.background = '#0b0f16'; barWrap.style.border = '1px solid var(--border)'; barWrap.style.borderRadius = '6px'; barWrap.style.overflow = 'hidden'; barWrap.style.marginTop = '6px';
      const bar = document.createElement('div'); bar.style.height = '100%'; bar.style.width = `${g.overall || 0}%`; bar.style.background = 'linear-gradient(90deg,#12b886,#69db7c)'; barWrap.appendChild(bar);
      const meta = document.createElement('div'); meta.className = 'hint'; meta.style.marginTop = '4px';
      const due = g.due_date ? `Due: ${g.due_date}` : ''; const mil = `${g.milestones_completed}/${g.milestones_total}`;
      meta.textContent = `${mil} ${due}`.trim();
      li.append(row, barWrap, meta);
      li.addEventListener('click', () => selectGoal(g.name));
      li.addEventListener('mouseenter', () => li.style.background = 'rgba(255,255,255,0.03)');
      li.addEventListener('mouseleave', () => li.style.background = '');
      listEl.appendChild(li);
    });
    setStatus(`Loaded ${goals.length} goals.`);
  }

  async function selectGoal(name) {
    setStatus(`Loading "${name}"...`);
    const resp = await fetch(apiBase() + `/api/goal?name=${encodeURIComponent(name)}`);
    const data = await resp.json().catch(() => ({}));
    const g = data.goal || {}; if (!g.name) return;
    titleEl.textContent = expandText(g.name); titleEl.__goal = g.name;
    barEl.style.width = `${g.overall || 0}%`;
    const meta = [];
    if (g.priority) meta.push(`Priority: ${g.priority}`);
    if (g.due_date) meta.push(`Due: ${g.due_date}`);
    if (g.status) meta.push(`Status: ${g.status}`);
    metaEl.textContent = meta.join('  •  ');
    msEl.innerHTML = '';
    (g.milestones || []).forEach(m => {
      const box = document.createElement('div'); box.className = 'gt-milestone-card';
      const row = document.createElement('div'); row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center';
      const nameEl = document.createElement('div'); nameEl.textContent = expandText(m.name); nameEl.style.fontWeight = '700';
      const pct = document.createElement('div'); pct.textContent = `${Math.round((m.progress?.percent) || 0)}%`; pct.className = 'hint';
      row.append(nameEl, pct);
      const barWrap = document.createElement('div'); barWrap.style.height = '8px'; barWrap.style.background = '#0b0f16'; barWrap.style.border = '1px solid var(--border)'; barWrap.style.borderRadius = '6px'; barWrap.style.overflow = 'hidden'; barWrap.style.margin = '6px 0';
      const bar = document.createElement('div'); bar.style.height = '100%'; bar.style.width = `${Math.round((m.progress?.percent) || 0)}%`; bar.style.background = 'linear-gradient(90deg,#228be6,#74c0fc)'; barWrap.appendChild(bar);
      const status = document.createElement('div'); status.className = 'hint'; status.textContent = `Status: ${expandText(m.status || 'unknown')}`;
      const crit = document.createElement('div'); crit.className = 'hint'; crit.textContent = expandText(m.criteria || '');
      const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.gap = '6px'; actions.style.marginTop = '6px';
      const btnDone = document.createElement('button'); btnDone.className = 'btn'; btnDone.textContent = 'Mark Complete'; btnDone.addEventListener('click', async () => { setStatus(`Completing milestone "${m.name}"...`); await fetch(apiBase() + '/api/milestone/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: m.name }) }); await selectGoal(g.name); setStatus(`Completed milestone "${m.name}".`); });
      const btnFocus = document.createElement('button'); btnFocus.className = 'btn'; btnFocus.textContent = 'Start Focus'; btnFocus.addEventListener('click', async () => {
        const link = (m.links || [])[0] || ({});
        if (!link.type || !link.name) { alert('No linked item to bind'); return; }
        await fetch(apiBase() + '/api/timer/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: 'classic_pomodoro', bind_type: link.type, bind_name: link.name }) });
        setStatus(`Started focus for "${m.name}".`);
        alert('Timer started');
      });
      actions.append(btnDone, btnFocus);
      box.append(row, barWrap, status, crit, actions);
      msEl.appendChild(box);
    });
    if (!msEl.children.length) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = 'No milestones defined for this goal.';
      msEl.appendChild(empty);
    }
    setStatus(`Loaded "${g.name}".`);
  }

  // apply removed: refresh covers sync

  loadGoals();
}

