export function mount(el) {
  // Load CSS
  if (!document.getElementById('achievements-css')) {
    const link = document.createElement('link');
    link.id = 'achievements-css';
    link.rel = 'stylesheet';
    link.href = './Widgets/Achievements/achievements.css';
    document.head.appendChild(link);
  }

  el.className = 'widget achievements-widget';

  const tpl = `
    <style>
      .ac-content { display:flex; flex-direction:column; gap:10px; }
      .ac-cards { display:flex; gap:10px; flex-wrap:wrap; }
      .ac-card { flex:1 1 180px; border:1px solid var(--border); border-radius:10px; padding:10px; background:#0f141d; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.02); }
      .ac-card h4 { margin:0 0 4px; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-dim); }
      .ac-card-value { font-size:28px; font-weight:800; margin:2px 0 4px; }
      .ac-card-meta { font-size:12px; color:var(--text-dim); }
      .ac-level-card { flex:0 0 120px; display:flex; align-items:center; justify-content:center; }
      .ac-level-wrap { display:flex; flex-direction:column; align-items:center; gap:6px; }
      .ac-level-ring {
        --p: 18;
        --ring-size: 84px;
        width: var(--ring-size);
        height: var(--ring-size);
        border-radius: 50%;
        background: conic-gradient(var(--chronos-accent, #7aa2f7) calc(var(--p) * 1%), rgba(255,255,255,0.12) 0);
        display: grid;
        place-items: center;
      }
      .ac-level-ring-center {
        width: calc(var(--ring-size) - 16px);
        height: calc(var(--ring-size) - 16px);
        border-radius: 50%;
        background: rgba(12,16,23,0.95);
        border: 1px solid rgba(255,255,255,0.08);
        display: grid;
        place-items: center;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.3px;
        color: var(--text);
      }
      .ac-level-meta { font-size:11px; color:var(--text-dim); text-align:center; line-height:1.2; }
      .ac-status { min-height:18px; font-size:13px; color:var(--text-dim); }
      .ac-status.error { color:#ef6a6a; }
      .ac-status.success { color:#5bdc82; }
      .ac-list { display:flex; flex-direction:column; gap:10px; max-height:360px; overflow:auto; }
      .ac-item { border:1px solid var(--border); border-radius:10px; padding:10px; background:#0f141d; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.02); display:flex; flex-direction:column; gap:6px; }
      .ac-item.archived { opacity:0.6; }
      .ac-head { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:nowrap; cursor:pointer; }
      .ac-name { font-size:15px; font-weight:700; }
      .ac-pill { padding:2px 10px; border-radius:999px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; }
      .ac-pill.pending { background:rgba(122,162,247,0.15); color:#7aa2f7; }
      .ac-pill.awarded { background:rgba(91,220,130,0.18); color:#5bdc82; }
      .ac-pill.archived { background:rgba(239,106,106,0.18); color:#ef6a6a; }
      .ac-meta { font-size:12px; color:var(--text-dim); }
      .ac-tags { display:flex; flex-wrap:wrap; gap:4px; font-size:11px; }
      .ac-tag { padding:2px 6px; border-radius:999px; border:1px solid rgba(255,255,255,0.08); }
      .ac-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
      .ac-head-left { display:flex; align-items:center; gap:8px; min-width:0; }
      .ac-expander { font-size:12px; color:var(--text-dim); width:14px; text-align:center; user-select:none; }
      .ac-head-actions { display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
      .ac-detail { display:none; flex-direction:column; gap:6px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.06); margin-top:4px; }
      .ac-item.expanded .ac-detail { display:flex; }
    </style>
    <div class="header">
      <div class="title">Achievements</div>
      <div class="controls" style="align-items:center; gap:6px;">
        <label class="hint" style="display:flex; align-items:center; gap:4px;">
          <input type="checkbox" id="acFxToggle" checked /> fx
        </label>
        <button class="icon-btn" id="acMin">_</button>
        <button class="icon-btn" id="acClose">x</button>
      </div>
    </div>
    <div class="content ac-content">
      <div class="ac-cards">
        <div class="ac-card">
          <h4>Total</h4>
          <div class="ac-card-value" id="acTotal">--</div>
          <div class="ac-card-meta">All achievements tracked.</div>
        </div>
        <div class="ac-card">
          <h4>Awarded</h4>
          <div class="ac-card-value" id="acAwarded">--</div>
          <div class="ac-card-meta">Unlocked achievements.</div>
        </div>
        <div class="ac-card">
          <h4>Pending</h4>
          <div class="ac-card-value" id="acPending">--</div>
          <div class="ac-card-meta">Still waiting to celebrate.</div>
        </div>
        <div class="ac-card ac-level-card" aria-label="Level progress">
          <div class="ac-level-wrap">
            <div class="ac-level-ring" id="acLevelRing">
              <div class="ac-level-ring-center" id="acLevelText">LVL 1</div>
            </div>
            <div class="ac-level-meta" id="acLevelMeta">0 / 1000 XP</div>
          </div>
        </div>
      </div>
      <div class="row" style="gap:8px; flex-wrap:wrap; align-items:center;">
        <input id="acSearch" class="input" placeholder="Search achievements..." style="flex:1 1 220px; min-width:160px;" />
        <select id="acStatusFilter" class="input" style="flex:0 0 180px;">
          <option value="all">All states</option>
          <option value="pending">Pending</option>
          <option value="awarded">Awarded</option>
          <option value="archived">Archived</option>
        </select>
        <select id="acTitleSelect" class="input" style="flex:0 0 200px;">
          <option value="">Select title...</option>
        </select>
        <button class="btn" id="acSetTitle">Set Title</button>
        <div class="spacer"></div>
        <button class="btn" id="acRefresh">Refresh</button>
      </div>
      <div id="acStatusLine" class="ac-status"></div>
      <div id="acList" class="ac-list"></div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;

  el.innerHTML = tpl;

  const btnMin = el.querySelector('#acMin');
  const btnClose = el.querySelector('#acClose');
  const fxToggle = el.querySelector('#acFxToggle');
  const searchEl = el.querySelector('#acSearch');
  const statusSel = el.querySelector('#acStatusFilter');
  const refreshBtn = el.querySelector('#acRefresh');
  const titleSelect = el.querySelector('#acTitleSelect');
  const setTitleBtn = el.querySelector('#acSetTitle');
  const statusLine = el.querySelector('#acStatusLine');
  const listEl = el.querySelector('#acList');
  const totalEl = el.querySelector('#acTotal');
  const awardedEl = el.querySelector('#acAwarded');
  const pendingEl = el.querySelector('#acPending');
  const levelRingEl = el.querySelector('#acLevelRing');
  const levelTextEl = el.querySelector('#acLevelText');
  const levelMetaEl = el.querySelector('#acLevelMeta');

  btnMin.addEventListener('click', () => el.classList.toggle('minimized'));
  btnClose.addEventListener('click', () => { el.style.display = 'none'; try { window?.ChronosBus?.emit?.('widget:closed', 'Achievements'); } catch { } });

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

  let fxEnabled = fxToggle ? fxToggle.checked : true;
  function expandText(s) {
    try {
      if (!fxEnabled) return String(s || '');
      return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s || '')) : String(s || '');
    } catch {
      return String(s || '');
    }
  }
  fxToggle?.addEventListener('change', () => { fxEnabled = !!fxToggle.checked; renderList(); });

  let achievements = [];
  let currentTitle = '';
  let profileProgress = { level: 1, xpTotal: 0, xpIntoLevel: 0, xpToNextLevel: 1000 };
  let counts = { total: 0, awarded: 0, pending: 0 };
  let loading = false;
  const expanded = new Set();

  function setStatus(msg, tone) {
    statusLine.textContent = msg || '';
    statusLine.className = `ac-status${tone ? ' ' + tone : ''}`;
  }

  async function refresh(dataOnly = false) {
    if (loading) return;
    loading = true;
    if (!dataOnly) setStatus('Loading achievements...');
    try {
      const resp = await fetch(apiBase() + "/api/achievements");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      achievements = Array.isArray(json?.achievements) ? json.achievements : [];
      counts = json?.counts || { total: achievements.length, awarded: 0, pending: 0 };
      await loadProfileTitle();
      renderTitleOptions();
      renderSummary();
      renderList();
      if (!dataOnly) setStatus('');
    } catch (err) {
      console.warn('[Achievements] refresh failed', err);
      setStatus('Failed to load achievements.', 'error');
    } finally {
      loading = false;
    }
  }

  async function loadProfileTitle() {
    try {
      const resp = await fetch(apiBase() + "/api/profile");
      if (!resp.ok) return;
      const json = await resp.json();
      currentTitle = json?.profile?.title || '';
      const profile = json?.profile || {};
      const level = Number.parseInt(String(profile.level ?? ''), 10);
      const xpTotal = Number.parseInt(String(profile.xp_total ?? ''), 10);
      const xpInto = Number.parseInt(String(profile.xp_into_level ?? ''), 10);
      const xpToNext = Number.parseInt(String(profile.xp_to_next_level ?? ''), 10);
      profileProgress = {
        level: Number.isFinite(level) && level > 0 ? level : 1,
        xpTotal: Number.isFinite(xpTotal) && xpTotal >= 0 ? xpTotal : 0,
        xpIntoLevel: Number.isFinite(xpInto) && xpInto >= 0 ? xpInto : 0,
        xpToNextLevel: Number.isFinite(xpToNext) && xpToNext >= 0 ? xpToNext : 1000,
      };
    } catch { }
  }

  function renderTitleOptions() {
    if (!titleSelect) return;
    const awarded = achievements.filter(a => (a.state || '').toLowerCase() === 'awarded' && a.title);
    const titles = Array.from(new Set(awarded.map(a => String(a.title)).filter(Boolean)));
    titleSelect.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = titles.length ? 'Select title...' : 'No awarded titles yet';
    titleSelect.appendChild(blank);
    titles.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (t === currentTitle) opt.selected = true;
      titleSelect.appendChild(opt);
    });
  }

  function renderSummary() {
    totalEl.textContent = (counts?.total ?? achievements.length).toString();
    awardedEl.textContent = (counts?.awarded ?? achievements.filter(a => a.state === 'awarded').length).toString();
    pendingEl.textContent = (counts?.pending ?? achievements.filter(a => a.state !== 'awarded' && a.state !== 'archived').length).toString();
    renderLevelRing();
  }

  function renderLevelRing() {
    if (!levelRingEl || !levelTextEl || !levelMetaEl) return;
    const level = Number.parseInt(String(profileProgress.level || 1), 10) || 1;
    const xpInto = Math.max(0, Number.parseInt(String(profileProgress.xpIntoLevel || 0), 10) || 0);
    const xpToNext = Math.max(0, Number.parseInt(String(profileProgress.xpToNextLevel || 0), 10) || 0);
    const pct = xpToNext > 0 ? Math.max(0, Math.min(100, Math.round((xpInto / xpToNext) * 100))) : 100;
    levelRingEl.style.setProperty('--p', String(pct));
    levelTextEl.textContent = `LVL ${level}`;
    if (xpToNext <= 0) {
      levelMetaEl.textContent = `MAX • ${profileProgress.xpTotal || 0} XP`;
    } else {
      levelMetaEl.textContent = `${xpInto} / ${xpToNext} XP`;
    }
  }

  function renderList() {
    listEl.innerHTML = '';
    const term = (searchEl.value || '').trim().toLowerCase();
    const wanted = (statusSel.value || 'all').toLowerCase();
    const filtered = achievements.filter(item => {
      if (wanted !== 'all' && (item.state || item.status || '').toLowerCase() !== wanted) return false;
      if (!term) return true;
      const hay = `${item.name || ''} ${item.description || ''} ${item.category || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(term);
    });
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'ac-card-meta';
      empty.style.padding = '16px';
      empty.style.border = '1px dashed var(--border)';
      empty.style.borderRadius = '8px';
      empty.textContent = achievements.length ? 'No achievements match that filter.' : 'Create achievements via the console or commitments to see them here.';
      listEl.appendChild(empty);
      return;
    }
    filtered.sort((a, b) => {
      const stateRank = { 'awarded': 0, 'pending': 1, 'archived': 2 };
      const ar = stateRank[(a.state || 'pending').toLowerCase()] ?? 1;
      const br = stateRank[(b.state || 'pending').toLowerCase()] ?? 1;
      if (ar !== br) return ar - br;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'ac-item';
      const itemName = item.name || 'Achievement';
      const key = itemName.toLowerCase();
      const isExpanded = expanded.has(key);
      if (isExpanded) card.classList.add('expanded');
      const state = (item.state || item.status || 'pending').toLowerCase();
      if (state === 'archived') card.classList.add('archived');
      const head = document.createElement('div');
      head.className = 'ac-head';
      const headLeft = document.createElement('div');
      headLeft.className = 'ac-head-left';
      const expander = document.createElement('div');
      expander.className = 'ac-expander';
      expander.textContent = isExpanded ? '▼' : '▶';
      const name = document.createElement('div');
      name.className = 'ac-name';
      name.textContent = expandText(itemName);
      const pill = document.createElement('div');
      pill.className = `ac-pill ${state}`;
      pill.textContent = state.charAt(0).toUpperCase() + state.slice(1);
      headLeft.append(expander, name);

      const actions = document.createElement('div');
      actions.className = 'ac-head-actions';
      const awardBtn = document.createElement('button');
      awardBtn.className = 'btn btn-primary';
      awardBtn.textContent = state === 'awarded' ? 'Awarded' : 'Mark Awarded';
      awardBtn.disabled = state === 'awarded';
      awardBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        updateAchievement(item, 'award', awardBtn);
      });
      const archiveBtn = document.createElement('button');
      archiveBtn.className = 'btn btn-secondary';
      archiveBtn.textContent = state === 'archived' ? 'Archived' : 'Archive';
      archiveBtn.disabled = state === 'archived';
      archiveBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        updateAchievement(item, 'archive', archiveBtn);
      });
      actions.append(awardBtn, archiveBtn, pill);
      head.append(headLeft, actions);

      const detail = document.createElement('div');
      detail.className = 'ac-detail';
      const desc = document.createElement('div');
      desc.className = 'ac-meta';
      desc.textContent = expandText(item.description || 'No description.');
      const meta = document.createElement('div');
      meta.className = 'ac-meta';
      const bits = [];
      if (item.category) bits.push(`Category: ${item.category}`);
      if (item.priority) bits.push(`Priority: ${item.priority}`);
      if (item.points) bits.push(`Points: ${item.points}`);
      if (item.awarded_at) bits.push(`Awarded: ${item.awarded_at}`);
      meta.textContent = bits.join(' | ');
      const tagsWrap = document.createElement('div');
      tagsWrap.className = 'ac-tags';
      (item.tags || []).forEach(tag => {
        const chip = document.createElement('div');
        chip.className = 'ac-tag';
        chip.textContent = expandText(tag);
        tagsWrap.appendChild(chip);
      });

      detail.append(desc, meta);
      if (tagsWrap.childElementCount) detail.appendChild(tagsWrap);
      card.append(head, detail);
      head.addEventListener('click', () => {
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

  async function updateAchievement(item, action, button) {
    if (!item?.name) return;
    const original = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = action === 'award' ? 'Updating...' : 'Archiving...';
    }
    setStatus(action === 'award' ? `Marking '${item.name}' as awarded...` : `Archiving '${item.name}'...`);
    try {
      const payload = { name: item.name };
      if (action === 'award') payload.award_now = true;
      if (action === 'archive') payload.archive_now = true;
      const resp = await fetch(apiBase() + "/api/achievement/update", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || `HTTP ${resp.status}`);
      }
      await refresh(true);
      renderSummary();
      renderList();
      setStatus(action === 'award' ? 'Achievement marked as awarded.' : 'Achievement archived.', 'success');
    } catch (err) {
      console.warn('[Achievements] update failed', err);
      setStatus(`Update failed: ${err.message || err}`, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = original || button.textContent;
      }
    }
  }

  searchEl.addEventListener('input', () => renderList());
  statusSel.addEventListener('change', () => renderList());
  refreshBtn.addEventListener('click', () => refresh());
  setTitleBtn?.addEventListener('click', async () => {
    const selected = titleSelect?.value || '';
    if (!selected) return;
    setStatus('Updating title...');
    try {
      const resp = await fetch(apiBase() + "/api/profile", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: selected }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      currentTitle = selected;
      setStatus('Title updated.', 'success');
    } catch (err) {
      console.warn('[Achievements] title update failed', err);
      setStatus('Failed to update title.', 'error');
    }
  });

  refresh();

  return {
    refresh: () => refresh()
  };
}
