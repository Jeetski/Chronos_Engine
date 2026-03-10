export function mount(el, context) {
  if (!document.getElementById('habit-tracker-css')) {
    const link = document.createElement('link');
    link.id = 'habit-tracker-css';
    link.rel = 'stylesheet';
    link.href = new URL('./habit-tracker.css', import.meta.url).toString();
    document.head.appendChild(link);
  }

  el.className = 'widget habit-tracker-widget';
  try { el.dataset.uiId = 'widget.habit_tracker'; } catch { }

  const tpl = `
    <div class="header" id="habitHeader" data-ui-id="widget.habit_tracker.header">
      <div class="title" data-ui-id="widget.habit_tracker.title">Habits</div>
      <div class="controls">
        <input id="habitSearch" class="input" placeholder="Search habits" style="width:160px;" data-ui-id="widget.habit_tracker.search_input" />
        <select id="habitPolarity" class="input" style="width:120px;" data-ui-id="widget.habit_tracker.polarity_select">
          <option value="all">All</option>
          <option value="good">Good</option>
          <option value="bad">Bad</option>
        </select>
        <button class="icon-btn" id="habitRefresh" title="Refresh" data-ui-id="widget.habit_tracker.refresh_button">R</button>
        <button class="icon-btn" id="habitMin" title="Minimize" data-ui-id="widget.habit_tracker.minimize_button">_</button>
        <button class="icon-btn" id="habitClose" title="Close" data-ui-id="widget.habit_tracker.close_button">x</button>
      </div>
    </div>
    <div class="content" id="habitContent" style="gap:8px;" data-ui-id="widget.habit_tracker.panel">
      <div class="row" style="gap:8px; align-items:center;">
        <button class="btn btn-primary" id="habitPrimaryDone" data-ui-id="widget.habit_tracker.done_primary_button">Done Primary</button>
        <button class="btn btn-secondary" id="habitPrimaryIncident" data-ui-id="widget.habit_tracker.incident_primary_button">Incident Primary</button>
        <div class="spacer"></div>
      </div>
      <div class="row" id="habitSummary" style="gap:8px; color:#a6adbb;" data-ui-id="widget.habit_tracker.summary_text"></div>
      <div id="habitStatus" class="hint" data-ui-id="widget.habit_tracker.status_text"></div>
      <div id="habitList" style="display:block; overflow:auto; max-height:360px;" data-ui-id="widget.habit_tracker.list_container"></div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const header = el.querySelector('#habitHeader');
  const btnMin = el.querySelector('#habitMin');
  const btnClose = el.querySelector('#habitClose');
  const btnRefresh = el.querySelector('#habitRefresh');
  const btnPrimaryDone = el.querySelector('#habitPrimaryDone');
  const btnPrimaryIncident = el.querySelector('#habitPrimaryIncident');
  const searchEl = el.querySelector('#habitSearch');
  const polSel = el.querySelector('#habitPolarity');
  const listEl = el.querySelector('#habitList');
  const summaryEl = el.querySelector('#habitSummary');
  const statusEl = el.querySelector('#habitStatus');

  function expandText(s) {
    try { return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s || '')) : String(s || ''); }
    catch { return String(s || ''); }
  }
  try { context?.bus?.on('vars:changed', () => refresh()); } catch { }

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
  const load = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };

  function setStatus(msg, tone) {
    statusEl.textContent = msg || '';
    statusEl.style.color = tone === 'error' ? '#ef6a6a' : (tone === 'success' ? '#5bdc82' : '#a6adbb');
  }

  header.addEventListener('pointerdown', (ev) => {
    const startX = ev.clientX, startY = ev.clientY;
    const rect = el.getBoundingClientRect();
    const offX = startX - rect.left, offY = startY - rect.top;
    function onMove(e) { el.style.left = Math.max(6, e.clientX - offX) + 'px'; el.style.top = Math.max(6, e.clientY - offY) + 'px'; el.style.right = 'auto'; }
    function onUp() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
  btnMin.addEventListener('click', () => { el.classList.toggle('minimized'); setStatus(el.classList.contains('minimized') ? 'Minimized.' : ''); });
  btnClose.addEventListener('click', () => { el.style.display = 'none'; setStatus('Closed.'); });

  polSel.value = load('habits_polarity', 'all');
  searchEl.value = load('habits_search', '');

  function setSummary(items) {
    try {
      const good = items.filter(h => h.polarity !== 'bad');
      const bad = items.filter(h => h.polarity === 'bad');
      const goodDone = good.filter(h => h.today_status === 'done').length;
      const badInc = bad.filter(h => h.today_status === 'incident').length;
      summaryEl.textContent = `Good: ${goodDone}/${good.length} done today | Bad: ${badInc}/${bad.length} incidents today`;
    } catch {
      summaryEl.textContent = '';
    }
  }

  function rowFor(h) {
    const row = document.createElement('div');
    row.className = 'row';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.borderBottom = '1px solid #222835';
    row.style.padding = '6px 0';
    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';
    const name = document.createElement('div');
    name.textContent = expandText(h.name);
    name.style.color = '#e6e8ef';
    const meta = document.createElement('div');
    meta.className = 'hint';
    meta.textContent = `${h.polarity === 'bad' ? 'bad' : 'good'}${h.category ? ' | ' + h.category : ''}${h.priority ? ' | ' + h.priority : ''}`;
    left.append(name, meta);
    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '6px';
    right.style.alignItems = 'center';
    const streak = document.createElement('span');
    streak.className = 'hint';
    streak.textContent = h.polarity === 'bad'
      ? `clean ${h.clean_current || 0}/${h.clean_longest || 0}`
      : `streak ${h.streak_current || 0}/${h.streak_longest || 0}`;
    const status = document.createElement('span');
    status.className = 'hint';
    status.style.color = h.today_status === 'done' ? '#5bdc82' : (h.today_status === 'incident' ? '#ef6a6a' : '#a6adbb');
    status.textContent = expandText(h.today_status || '');
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = h.polarity === 'bad' ? 'Incident' : 'Done';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const ep = h.polarity === 'bad' ? '/api/habits/incident' : '/api/habits/complete';
        setStatus(h.polarity === 'bad' ? 'Recording incident...' : 'Recording completion...');
        await fetch(apiBase() + ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: h.name }),
        });
        setStatus('Habit updated.', 'success');
      } catch {
        setStatus('Habit update failed.', 'error');
      }
      btn.disabled = false;
      await refresh();
    });
    right.append(streak, status, btn);
    row.append(left, right);
    return row;
  }

  async function fetchHabits() {
    try {
      const resp = await fetch(apiBase() + '/api/habits');
      const text = await resp.text();
      const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
      let inList = false;
      const out = [];
      let cur = null;
      for (const raw of lines) {
        const line = raw.replace(/#.*$/, '');
        if (!line.trim()) continue;
        if (!inList) {
          if (/^\s*habits\s*:/i.test(line)) inList = true;
          continue;
        }
        if (/^\s*-\s*/.test(line)) {
          if (cur) out.push(cur);
          cur = {};
          continue;
        }
        const m = line.match(/^\s*(\w+)\s*:\s*(.+)$/);
        if (m && cur) cur[m[1]] = m[2];
      }
      if (cur) out.push(cur);
      return out.map(h => ({
        name: String(h.name || ''),
        polarity: String(h.polarity || 'good'),
        category: h.category || '',
        priority: h.priority || '',
        streak_current: parseInt(h.streak_current || '0', 10),
        streak_longest: parseInt(h.streak_longest || '0', 10),
        clean_current: parseInt(h.clean_current || '0', 10),
        clean_longest: parseInt(h.clean_longest || '0', 10),
        today_status: h.today_status || null,
      }));
    } catch {
      return [];
    }
  }

  function filterItems(items) {
    const q = (searchEl.value || '').toLowerCase();
    const pol = polSel.value;
    return items.filter(h => (pol === 'all' || h.polarity === pol) && (q === '' || h.name.toLowerCase().includes(q)));
  }

  async function refresh() {
    const items = await fetchHabits();
    setSummary(items);
    save('habits_search', searchEl.value || '');
    save('habits_polarity', polSel.value);
    const filtered = filterItems(items);
    listEl.innerHTML = '';
    filtered.forEach(h => listEl.appendChild(rowFor(h)));
  }

  async function runPrimary(action) {
    const items = await fetchHabits();
    const habit = filterItems(items)[0] || null;
    if (!habit) return;
    const ep = action === 'incident' ? '/api/habits/incident' : '/api/habits/complete';
    setStatus(action === 'incident' ? 'Recording incident...' : 'Recording completion...');
    try {
      await fetch(apiBase() + ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: habit.name }),
      });
      setStatus('Habit updated.', 'success');
    } catch {
      setStatus('Habit update failed.', 'error');
    }
    await refresh();
  }

  searchEl.addEventListener('input', () => refresh());
  polSel.addEventListener('change', () => refresh());
  btnRefresh.addEventListener('click', () => refresh());
  btnPrimaryDone.addEventListener('click', () => runPrimary('done'));
  btnPrimaryIncident.addEventListener('click', () => runPrimary('incident'));

  (async () => { await refresh(); })();

  return {
    unmount() {}
  };
}
