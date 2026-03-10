export function mount(el) {
  // Load CSS
  if (!document.getElementById('commitments-css')) {
    const link = document.createElement('link');
    link.id = 'commitments-css';
    link.rel = 'stylesheet';
    link.href = new URL('./commitments.css', import.meta.url).toString();
    document.head.appendChild(link);
  }

  el.className = 'widget commitments-widget';
  try { el.dataset.uiId = 'widget.commitments'; } catch { }

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
      .cm-list-toggle { align-self:flex-start; }
      .cm-list-section[hidden] { display:none !important; }
      .cm-list-section { display:flex; flex-direction:column; gap:10px; }
      .cm-item { border:1px solid var(--border); border-radius:10px; padding:10px; background:#0f141d; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.02); display:flex; flex-direction:column; gap:6px; }
      .cm-head { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:nowrap; cursor:pointer; }
      .cm-name { font-size:15px; font-weight:700; }
      .cm-pill { padding:2px 10px; border-radius:999px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; }
      .cm-pill.pending { background:rgba(122,162,247,0.15); color:#7aa2f7; }
      .cm-pill.met { background:rgba(91,220,130,0.18); color:#5bdc82; }
      .cm-pill.violation { background:rgba(239,106,106,0.18); color:#ef6a6a; }
      .cm-meta { font-size:12px; color:var(--text-dim); }
      .cm-tags { display:flex; flex-wrap:wrap; gap:4px; font-size:11px; }
      .cm-tag { padding:2px 6px; border-radius:999px; border:1px solid rgba(255,255,255,0.08); }
      .cm-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
      .cm-checkin { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
      .cm-checkin-note { font-size:12px; color:var(--text-dim); }
      .cm-head-left { display:flex; align-items:center; gap:8px; min-width:0; }
      .cm-expander { font-size:12px; color:var(--text-dim); width:14px; text-align:center; user-select:none; }
      .cm-head-actions { display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
      .cm-detail { display:none; flex-direction:column; gap:6px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.06); margin-top:4px; }
      .cm-item.expanded .cm-detail { display:flex; }
    </style>
    <div class="header" data-ui-id="widget.commitments.header">
      <div class="title" data-ui-id="widget.commitments.title">Commitments</div>
      <div class="controls" style="align-items:center; gap:6px;">
        <button class="btn" id="cmEvaluate" style="padding:4px 10px;" data-ui-id="widget.commitments.evaluate_button">Evaluate</button>
        <button class="icon-btn" id="cmMin" data-ui-id="widget.commitments.minimize_button">_</button>
        <button class="icon-btn" id="cmClose" data-ui-id="widget.commitments.close_button">x</button>
      </div>
    </div>
    <div class="content cm-content" data-ui-id="widget.commitments.panel">
      <div class="cm-cards">
        <div class="cm-card">
          <h4>Total</h4>
          <div class="cm-card-value" id="cmTotal" data-ui-id="widget.commitments.total_text">--</div>
          <div class="cm-card-meta">All defined commitments.</div>
        </div>
        <div class="cm-card">
          <h4>On Track</h4>
          <div class="cm-card-value" id="cmMet" data-ui-id="widget.commitments.met_text">--</div>
          <div class="cm-card-meta">Met this period.</div>
        </div>
        <div class="cm-card">
          <h4>Violations</h4>
          <div class="cm-card-value" id="cmViolations" data-ui-id="widget.commitments.violations_text">--</div>
          <div class="cm-card-meta">Forbidden rules triggered today.</div>
        </div>
      </div>
      <button class="btn cm-list-toggle" id="cmListToggle" aria-expanded="false" data-ui-id="widget.commitments.list_toggle_button">Show List Section ▾</button>
      <div id="cmListSection" class="cm-list-section" hidden data-ui-id="widget.commitments.list_section">
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <input id="cmSearch" class="input" placeholder="Search commitments..." style="flex:1 1 220px; min-width:160px;" data-ui-id="widget.commitments.search_input" />
          <select id="cmStatusFilter" class="input" style="flex:0 0 180px;" data-ui-id="widget.commitments.status_filter_select">
            <option value="all">All states</option>
            <option value="pending">Pending</option>
            <option value="met">Met</option>
            <option value="violation">Violations</option>
          </select>
          <div class="spacer"></div>
          <button class="btn" id="cmRefresh" data-ui-id="widget.commitments.refresh_button">Refresh</button>
        </div>
        <div class="row" style="gap:8px; align-items:center;">
          <button class="btn btn-secondary" id="cmPrimaryMet" data-ui-id="widget.commitments.met_primary_button">Mark Primary Met</button>
          <button class="btn btn-secondary" id="cmPrimaryViolation" data-ui-id="widget.commitments.violation_primary_button">Mark Primary Violated</button>
          <button class="btn btn-secondary" id="cmPrimaryClear" data-ui-id="widget.commitments.clear_primary_button">Clear Primary</button>
          <div class="spacer"></div>
        </div>
        <div id="cmStatus" class="cm-status" data-ui-id="widget.commitments.status_text"></div>
        <div id="cmList" class="cm-list" data-ui-id="widget.commitments.list_container"></div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const btnMin = el.querySelector('#cmMin');
  const btnClose = el.querySelector('#cmClose');
  const refreshBtn = el.querySelector('#cmRefresh');
  const listToggleBtn = el.querySelector('#cmListToggle');
  const listSectionEl = el.querySelector('#cmListSection');
  const evaluateBtn = el.querySelector('#cmEvaluate');
  const searchEl = el.querySelector('#cmSearch');
  const statusSel = el.querySelector('#cmStatusFilter');
  const statusLine = el.querySelector('#cmStatus');
  const listEl = el.querySelector('#cmList');
  const totalEl = el.querySelector('#cmTotal');
  const metEl = el.querySelector('#cmMet');
  const violationEl = el.querySelector('#cmViolations');
  const primaryMetBtn = el.querySelector('#cmPrimaryMet');
  const primaryViolationBtn = el.querySelector('#cmPrimaryViolation');
  const primaryClearBtn = el.querySelector('#cmPrimaryClear');

  btnMin.addEventListener('click', () => { el.classList.toggle('minimized'); setStatus(el.classList.contains('minimized') ? 'Minimized.' : ''); });
  btnClose.addEventListener('click', () => { el.style.display = 'none'; try { setStatus('Closed.'); window?.ChronosBus?.emit?.('widget:closed', 'Commitments'); } catch { } });

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

  let commitments = [];
  let counts = { total: 0, met: 0, violations: 0, pending: 0 };
  let loading = false;
  const expanded = new Set();

  function setListOpen(isOpen) {
    if (!listToggleBtn || !listSectionEl) return;
    const open = !!isOpen;
    listSectionEl.hidden = !open;
    listToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    listToggleBtn.textContent = open ? 'Hide List Section ▴' : 'Show List Section ▾';
  }

  function setStatus(msg, tone) {
    statusLine.textContent = msg || '';
    statusLine.className = `cm-status${tone ? ' ' + tone : ''}`;
  }

  async function refresh(dataOnly = false) {
    if (loading) return;
    loading = true;
    if (!dataOnly) setStatus('Loading commitments...');
    try {
      const resp = await fetch(apiBase() + "/api/commitments");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      commitments = Array.isArray(json?.commitments) ? json.commitments : [];
      counts = json?.counts || { total: commitments.length, met: 0, violations: 0, pending: 0 };
      renderSummary();
      renderList();
      if (!dataOnly) setStatus('');
    } catch (err) {
      console.warn('[Commitments] refresh failed', err);
      setStatus('Failed to load commitments.', 'error');
    } finally {
      loading = false;
    }
  }

  function renderSummary() {
    totalEl.textContent = (counts.total ?? commitments.length).toString();
    metEl.textContent = (counts.met ?? commitments.filter(c => c.status === 'met').length).toString();
    violationEl.textContent = (counts.violations ?? commitments.filter(c => c.status === 'violation').length).toString();
  }

  function renderList() {
    listEl.innerHTML = '';
    const term = (searchEl.value || '').trim().toLowerCase();
    const wanted = (statusSel.value || 'all').toLowerCase();
    const filtered = commitments.filter(item => {
      if (wanted !== 'all' && (item.status || '').toLowerCase() !== wanted) return false;
      if (!term) return true;
      const hay = `${item.name || ''} ${item.description || ''} ${item.period || ''} ${(item.targets || []).map(a => a.name || '').join(' ')}`.toLowerCase();
      return hay.includes(term);
    });
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'cm-card-meta';
      empty.style.padding = '16px';
      empty.style.border = '1px dashed var(--border)';
      empty.style.borderRadius = '8px';
      empty.textContent = commitments.length ? 'No commitments match that filter.' : 'Define commitments via CLI to see them here.';
      listEl.appendChild(empty);
      return;
    }
    filtered.sort((a, b) => {
      const rank = { 'violation': 0, 'pending': 1, 'met': 2 };
      const ar = rank[(a.status || 'pending').toLowerCase()] ?? 1;
      const br = rank[(b.status || 'pending').toLowerCase()] ?? 1;
      if (ar !== br) return ar - br;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'cm-item';
      const itemName = item.name || 'Commitment';
      const isExpanded = expanded.has(itemName.toLowerCase());
      if (isExpanded) card.classList.add('expanded');

      const head = document.createElement('div');
      head.className = 'cm-head';
      const headLeft = document.createElement('div');
      headLeft.className = 'cm-head-left';
      const expander = document.createElement('div');
      expander.className = 'cm-expander';
      expander.textContent = isExpanded ? '▼' : '▶';
      const name = document.createElement('div');
      name.className = 'cm-name';
      name.textContent = itemName;
      const pill = document.createElement('div');
      const state = (item.status || 'pending').toLowerCase();
      pill.className = `cm-pill ${state}`;
      pill.textContent = state.charAt(0).toUpperCase() + state.slice(1);
      headLeft.append(expander, name);
      const headActions = document.createElement('div');
      headActions.className = 'cm-head-actions';

      const markMet = document.createElement('button');
      markMet.className = 'btn btn-secondary';
      markMet.textContent = 'Met';
      markMet.addEventListener('click', (ev) => {
        ev.stopPropagation();
        setDailyOverride(itemName, 'met');
      });
      headActions.appendChild(markMet);

      const markViolation = document.createElement('button');
      markViolation.className = 'btn btn-secondary';
      markViolation.textContent = 'Violated';
      markViolation.addEventListener('click', (ev) => {
        ev.stopPropagation();
        setDailyOverride(itemName, 'violation');
      });
      headActions.appendChild(markViolation);

      if (item.manual_today) {
        const clear = document.createElement('button');
        clear.className = 'btn btn-secondary';
        clear.textContent = 'Clear';
        clear.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setDailyOverride(itemName, 'clear');
        });
        headActions.appendChild(clear);
      }

      headActions.appendChild(pill);
      head.append(headLeft, headActions);

      const desc = document.createElement('div');
      desc.className = 'cm-meta';
      desc.textContent = item.description || 'No description.';

      const freq = document.createElement('div');
      freq.className = 'cm-meta';
      const req = item.times_required || 0;
      const reqTotal = item.required_total || req;
      const prog = item.progress || 0;
      if (reqTotal) {
        freq.textContent = `Progress: ${prog}/${reqTotal} this ${item.period || 'period'}`;
      } else if (item.rule_kind) {
        freq.textContent = `Rule: ${item.rule_kind} (${item.period || 'period'})`;
      } else {
        freq.textContent = 'Progress: n/a';
      }

      const detail = document.createElement('div');
      detail.className = 'cm-detail';

      if (Array.isArray(item.target_progress) && item.target_progress.length) {
        const lines = item.target_progress
          .map(tp => `${tp.name || ''} ${Number(tp.progress || 0)}/${Number(tp.required || 0)}`)
          .filter(Boolean);
        if (lines.length) {
          const targetDetail = document.createElement('div');
          targetDetail.className = 'cm-meta';
          targetDetail.textContent = `Target progress: ${lines.join(' | ')}`;
          detail.appendChild(targetDetail);
        }
      }

      const targets = document.createElement('div');
      targets.className = 'cm-meta';
      const targetNames = (item.targets || []).map(it => `${it.type || '?'}:${it.name || ''}`).filter(Boolean).join(', ');
      if (targetNames) targets.textContent = `Targets: ${targetNames}`;

      const stamps = document.createElement('div');
      stamps.className = 'cm-meta';
      const stampBits = [];
      if (item.last_met) stampBits.push(`Last met: ${item.last_met}`);
      if (item.last_violation) stampBits.push(`Last violation: ${item.last_violation}`);
      stamps.textContent = stampBits.join(' | ');

      const checkin = document.createElement('div');
      checkin.className = 'cm-checkin';
      const note = document.createElement('div');
      note.className = 'cm-checkin-note';
      if (item.manual_today === 'met' || item.manual_today === 'violation') {
        note.textContent = `Today check-in: ${item.manual_today}`;
      } else if (item.needs_checkin) {
        note.textContent = 'Daily check-in: did you meet or break this today?';
      } else {
        note.textContent = 'Daily check-in: optional';
      }
      checkin.appendChild(note);

      const actions = document.createElement('div');
      actions.className = 'cm-actions';
      const evalBtn = document.createElement('button');
      evalBtn.className = 'btn btn-secondary';
      evalBtn.textContent = 'Evaluate';
      evalBtn.addEventListener('click', () => runEvaluation());
      actions.appendChild(evalBtn);

      detail.append(desc, freq);
      if (targetNames) detail.appendChild(targets);
      if (stampBits.length) detail.appendChild(stamps);
      detail.appendChild(checkin);
      detail.appendChild(actions);
      card.append(head, detail);

      head.addEventListener('click', () => {
        const key = itemName.toLowerCase();
        if (card.classList.contains('expanded')) {
          card.classList.remove('expanded');
          expanded.delete(key);
          expander.textContent = '▶';
        } else {
          card.classList.add('expanded');
          expanded.add(key);
          expander.textContent = '▼';
        }
      });
      listEl.appendChild(card);
    });
  }

  function getPrimaryVisibleCommitment() {
    const term = (searchEl.value || '').trim().toLowerCase();
    const wanted = (statusSel.value || 'all').toLowerCase();
    const filtered = commitments.filter(item => {
      if (wanted !== 'all' && (item.status || '').toLowerCase() !== wanted) return false;
      if (!term) return true;
      const hay = `${item.name || ''} ${item.description || ''} ${item.period || ''} ${(item.targets || []).map(a => a.name || '').join(' ')}`.toLowerCase();
      return hay.includes(term);
    });
    filtered.sort((a, b) => {
      const rank = { 'violation': 0, 'pending': 1, 'met': 2 };
      const ar = rank[(a.status || 'pending').toLowerCase()] ?? 1;
      const br = rank[(b.status || 'pending').toLowerCase()] ?? 1;
      if (ar !== br) return ar - br;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
    return filtered[0] || null;
  }

  async function setDailyOverride(name, state) {
    setStatus('Saving daily check-in...');
    try {
      const resp = await fetch(apiBase() + "/api/commitments/override", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, state }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json.ok === false) throw new Error(json?.error || `HTTP ${resp.status}`);
      await refresh(true);
      setStatus('Daily check-in saved.', 'success');
    } catch (err) {
      console.warn('[Commitments] daily check-in failed', err);
      setStatus(`Check-in failed: ${err.message || err}`, 'error');
    }
  }

  async function runEvaluation() {
    setStatus('Evaluating commitments...');
    try {
      const payload = { command: 'commitments', args: ['check'], properties: {} };
      const resp = await fetch(apiBase() + "/api/cli", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(text || `HTTP ${resp.status}`);
      }
      await refresh(true);
      renderSummary();
      renderList();
      setStatus('Commitments evaluated.', 'success');
    } catch (err) {
      console.warn('[Commitments] evaluate failed', err);
      setStatus(`Evaluation failed: ${err.message || err}`, 'error');
    }
  }

  searchEl.addEventListener('input', () => renderList());
  statusSel.addEventListener('change', () => renderList());
  refreshBtn.addEventListener('click', () => refresh());
  listToggleBtn?.addEventListener('click', () => setListOpen(listSectionEl?.hidden));
  evaluateBtn.addEventListener('click', () => runEvaluation());
  primaryMetBtn?.addEventListener('click', () => {
    const item = getPrimaryVisibleCommitment();
    if (!item) return;
    setDailyOverride(item.name, 'met');
  });
  primaryViolationBtn?.addEventListener('click', () => {
    const item = getPrimaryVisibleCommitment();
    if (!item) return;
    setDailyOverride(item.name, 'violation');
  });
  primaryClearBtn?.addEventListener('click', () => {
    const item = getPrimaryVisibleCommitment();
    if (!item) return;
    setDailyOverride(item.name, 'clear');
  });

  setListOpen(false);
  refresh();

  return { refresh: () => refresh() };
}

