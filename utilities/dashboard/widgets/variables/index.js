export function mount(el, context) {
  if (!document.getElementById('variables-css')) {
    const link = document.createElement('link');
    link.id = 'variables-css';
    link.rel = 'stylesheet';
    link.href = new URL('./variables.css', import.meta.url).toString();
    document.head.appendChild(link);
  }

  el.className = 'widget variables-widget';
  try { el.dataset.uiId = 'widget.variables'; } catch { }

  const css = `
    .vars { display:flex; flex-direction:column; gap:12px; }
    .row { display:flex; gap:8px; align-items:center; }
    .vars-sections { display:flex; flex-direction:column; gap:12px; }
    .vars-section { display:flex; flex-direction:column; gap:8px; border:1px solid #222835; border-radius:10px; background:#0f141d; padding:10px; }
    .section-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .section-title { font-size:13px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#dfe6f3; }
    .section-count { color: var(--text-dim); font-size: 12px; }
    .grid { display:flex; flex-direction:column; gap:8px; max-height: 260px; overflow:auto; }
    .var-card { display:flex; flex-direction:column; gap:8px; border:1px solid #222835; border-radius:8px; background:#121926; padding:8px; }
    .var-main { display:flex; gap:8px; align-items:center; }
    .key { width: 36%; }
    .val { flex:1 1 auto; }
    .var-readonly .val { opacity:0.75; }
    .meta { display:flex; flex-wrap:wrap; gap:6px; font-size:12px; color: var(--text-dim); }
    .badge { display:inline-flex; align-items:center; border:1px solid #2d3950; border-radius:999px; padding:2px 8px; background:#151f2f; color:#dbe8ff; }
    .badge.readonly { border-color:#5a4a2b; background:#2c2416; color:#f3db9f; }
    .badge.source { border-color:#28416b; background:#102038; color:#b8d6ff; }
    .hint { color: var(--text-dim); font-size: 12px; }
    .hint.strong { color:#c9d5ea; }
    .input { background:#0f141d; color:#e6e8ef; border:1px solid #222835; border-radius:6px; padding:6px 8px; }
    .empty { border:1px dashed #253145; border-radius:8px; padding:10px; color: var(--text-dim); font-size:12px; }
    .spacer { flex:1 1 auto; }
  `;

  el.innerHTML = `
    <style>${css}</style>
    <div class="header" id="vHeader" data-ui-id="widget.variables.header">
      <div class="title" data-ui-id="widget.variables.title">Variables</div>
      <div class="controls">
        <button class="icon-btn" id="vRefresh" title="Refresh" aria-label="Refresh" data-ui-id="widget.variables.refresh_button">↻</button>
        <button class="icon-btn" id="vMin" title="Minimize" data-ui-id="widget.variables.minimize_button">_</button>
        <button class="icon-btn" id="vClose" title="Close" data-ui-id="widget.variables.close_button">x</button>
      </div>
    </div>
    <div class="content" data-ui-id="widget.variables.panel">
      <div class="vars">
        <div class="row">
          <button class="btn" id="vAddPersistent" data-ui-id="widget.variables.add_persistent_button">Add Persistent Var</button>
          <button class="btn" id="vAddSession" data-ui-id="widget.variables.add_session_button">Add Session Var</button>
          <button class="btn btn-primary" id="vSave" data-ui-id="widget.variables.save_button">Save</button>
          <div class="spacer"></div>
          <span class="hint strong" data-ui-id="widget.variables.tip_text">Persistent vars write through to Chronos YAML. Session vars die with the runtime.</span>
        </div>
        <div class="vars-sections">
          <section class="vars-section" data-ui-id="widget.variables.persistent_section">
            <div class="section-head">
              <div class="section-title">Persistent Variables</div>
              <div class="section-count" id="vPersistentCount"></div>
            </div>
            <div class="hint">Backed by status, profile, timer settings, or explicit variable bindings.</div>
            <div id="vPersistentGrid" class="grid" data-ui-id="widget.variables.persistent_grid"></div>
          </section>
          <section class="vars-section" data-ui-id="widget.variables.session_section">
            <div class="section-head">
              <div class="section-title">Session Variables</div>
              <div class="section-count" id="vSessionCount"></div>
            </div>
            <div class="hint">Temporary @vars created for the current console/dashboard runtime.</div>
            <div id="vSessionGrid" class="grid" data-ui-id="widget.variables.session_grid"></div>
          </section>
        </div>
        <div class="hint" id="vStatus" data-ui-id="widget.variables.status_text"></div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;

  const btnMin = el.querySelector('#vMin');
  const btnClose = el.querySelector('#vClose');
  const btnAddPersistent = el.querySelector('#vAddPersistent');
  const btnAddSession = el.querySelector('#vAddSession');
  const btnSave = el.querySelector('#vSave');
  const btnRefresh = el.querySelector('#vRefresh');
  const persistentGrid = el.querySelector('#vPersistentGrid');
  const sessionGrid = el.querySelector('#vSessionGrid');
  const persistentCount = el.querySelector('#vPersistentCount');
  const sessionCount = el.querySelector('#vSessionCount');
  const statusEl = el.querySelector('#vStatus');

  function apiBase() {
    const o = window.location.origin;
    if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
    return o;
  }

  async function fetchVars() {
    try {
      const r = await fetch(apiBase() + '/api/vars');
      return await r.json();
    } catch {
      return { ok: false, vars: {}, entries: [] };
    }
  }

  async function postJson(url, obj) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj || {}),
    });
    return await r.json();
  }

  const state = {
    vars: {},
    entries: [],
    session: {},
    persistent: {},
  };

  function setStatus(msg) {
    statusEl.textContent = msg || '';
  }

  function normalizeEntry(entry) {
    const name = String(entry?.name || '').trim();
    const value = entry?.value == null ? '' : String(entry.value);
    return {
      name,
      value,
      hasValue: !!entry?.has_value,
      persistence: String(entry?.persistence || 'session'),
      kind: String(entry?.kind || 'runtime'),
      sourceLabel: String(entry?.source_label || ''),
      sourcePath: entry?.source_path ? String(entry.source_path) : '',
      mode: String(entry?.mode || 'readwrite'),
      canRead: entry?.can_read !== false,
      canWrite: entry?.can_write !== false,
      canDelete: entry?.can_delete !== false,
      aliases: Array.isArray(entry?.aliases) ? entry.aliases.map((x) => String(x || '').trim()).filter(Boolean) : [],
    };
  }

  function applyPayload(payload) {
    const rawVars = payload?.vars && typeof payload.vars === 'object' ? payload.vars : {};
    const rawEntries = Array.isArray(payload?.entries) ? payload.entries : [];
    const entries = rawEntries.map(normalizeEntry).filter((row) => row.name);
    const session = {};
    const persistent = {};
    for (const row of entries) {
      if (row.persistence === 'persistent') persistent[row.name] = row.value;
      else session[row.name] = row.value;
    }
    state.vars = rawVars;
    state.entries = entries;
    state.session = session;
    state.persistent = persistent;
    render();
  }

  function describePersistent(row) {
    const parts = [];
    if (row.kind) parts.push(row.kind.replace(/_/g, ' '));
    if (row.sourcePath) parts.push(row.sourcePath);
    else if (row.sourceLabel) parts.push(row.sourceLabel);
    return parts.join(' · ');
  }

  function createEmpty(container, text) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = text;
    container.appendChild(empty);
  }

  function addPersistentRow(row, options = {}) {
    const isDraft = !!options.isDraft;
    const wrap = document.createElement('div');
    wrap.className = 'var-card' + (row.canWrite ? '' : ' var-readonly');
    wrap.dataset.kind = 'persistent';
    wrap.dataset.name = row.name;
    wrap.dataset.originalValue = row.value;
    wrap.dataset.canWrite = row.canWrite ? '1' : '0';
    wrap.dataset.isDraft = isDraft ? '1' : '0';

    const main = document.createElement('div');
    main.className = 'var-main';

    const keyEl = document.createElement('input');
    keyEl.className = 'input key';
    keyEl.value = row.name;
    keyEl.disabled = !isDraft;
    keyEl.title = row.name;
    keyEl.placeholder = 'persistent name';
    keyEl.dataset.role = 'name';

    const valEl = document.createElement('input');
    valEl.className = 'input val';
    valEl.value = row.value;
    valEl.placeholder = row.canWrite ? 'value' : '(read only)';
    valEl.disabled = !row.canWrite;
    valEl.dataset.role = 'value';

    if (isDraft) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        wrap.remove();
        updateCounts();
      });
      main.append(keyEl, valEl, delBtn);
    } else {
      main.append(keyEl, valEl);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';

    const sourceBadge = document.createElement('span');
    sourceBadge.className = 'badge source';
    sourceBadge.textContent = row.sourceLabel || 'persistent';
    meta.appendChild(sourceBadge);

    const modeBadge = document.createElement('span');
    modeBadge.className = 'badge' + (row.canWrite ? '' : ' readonly');
    modeBadge.textContent = isDraft ? 'new persistent' : row.canWrite ? row.mode : 'read only';
    meta.appendChild(modeBadge);

    if (row.aliases.length) {
      const aliasBadge = document.createElement('span');
      aliasBadge.className = 'badge';
      aliasBadge.textContent = 'aliases: ' + row.aliases.join(', ');
      meta.appendChild(aliasBadge);
    }

    const desc = isDraft
      ? 'Use a persistent-capable name like nickname, timer_profile, status_energy, or a bound var.'
      : describePersistent(row);
    if (desc) {
      const descEl = document.createElement('span');
      descEl.textContent = desc;
      meta.appendChild(descEl);
    }

    wrap.append(main, meta);
    persistentGrid.appendChild(wrap);
  }

  function addSessionRow(name = '', value = '') {
    const wrap = document.createElement('div');
    wrap.className = 'var-card';
    wrap.dataset.kind = 'session';

    const main = document.createElement('div');
    main.className = 'var-main';

    const keyEl = document.createElement('input');
    keyEl.className = 'input key';
    keyEl.value = name;
    keyEl.placeholder = 'name';
    keyEl.dataset.role = 'name';

    const valEl = document.createElement('input');
    valEl.className = 'input val';
    valEl.value = value;
    valEl.placeholder = 'value';
    valEl.dataset.role = 'value';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
      wrap.remove();
      updateCounts();
      try { context?.bus?.emit('vars:changed'); } catch { }
    });

    main.append(keyEl, valEl, delBtn);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'session';
    meta.appendChild(badge);

    wrap.append(main, meta);
    sessionGrid.appendChild(wrap);
  }

  function updateCounts() {
    const persistentRows = persistentGrid.querySelectorAll('.var-card').length;
    const sessionRows = sessionGrid.querySelectorAll('.var-card').length;
    persistentCount.textContent = persistentRows === 1 ? '1 variable' : `${persistentRows} variables`;
    sessionCount.textContent = sessionRows === 1 ? '1 variable' : `${sessionRows} variables`;
  }

  function render() {
    persistentGrid.innerHTML = '';
    sessionGrid.innerHTML = '';

    const persistentEntries = state.entries
      .filter((row) => row.persistence === 'persistent')
      .sort((a, b) => a.name.localeCompare(b.name));
    const sessionEntries = state.entries
      .filter((row) => row.persistence !== 'persistent')
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!persistentEntries.length) createEmpty(persistentGrid, 'No persistent variables are currently visible.');
    else persistentEntries.forEach(addPersistentRow);

    if (!sessionEntries.length) createEmpty(sessionGrid, 'No session variables set.');
    else sessionEntries.forEach((row) => addSessionRow(row.name, row.value));

    updateCounts();
  }

  async function refreshVars(message = 'Refreshed.') {
    const payload = await fetchVars();
    applyPayload(payload);
    if (payload?.ok === false && !Array.isArray(payload?.entries)) {
      setStatus(payload?.error || 'Refresh failed.');
      return;
    }
    setStatus(message);
  }

  function collectSessionRows() {
    const next = {};
    for (const row of sessionGrid.querySelectorAll('.var-card[data-kind="session"]')) {
      const name = row.querySelector('[data-role="name"]')?.value?.trim() || '';
      const value = row.querySelector('[data-role="value"]')?.value ?? '';
      if (!name) continue;
      next[name] = String(value);
    }
    return next;
  }

  function collectPersistentChanges() {
    const updates = {};
    for (const row of persistentGrid.querySelectorAll('.var-card[data-kind="persistent"]')) {
      if (row.dataset.canWrite !== '1') continue;
      const name = row.querySelector('[data-role="name"]')?.value?.trim() || row.dataset.name || '';
      const prev = row.dataset.originalValue ?? '';
      const next = row.querySelector('[data-role="value"]')?.value ?? '';
      if (!name) continue;
      if (row.dataset.isDraft === '1' || String(next) !== String(prev)) updates[name] = String(next);
    }
    return updates;
  }

  btnAddPersistent.addEventListener('click', () => {
    const empty = persistentGrid.querySelector('.empty');
    if (empty) empty.remove();
    addPersistentRow({
      name: '',
      value: '',
      canWrite: true,
      aliases: [],
      kind: 'persistent',
      sourceLabel: 'Persistent',
      sourcePath: '',
      mode: 'readwrite',
    }, { isDraft: true });
    updateCounts();
  });

  btnAddSession.addEventListener('click', () => {
    const empty = sessionGrid.querySelector('.empty');
    if (empty) empty.remove();
    addSessionRow('', '');
    updateCounts();
  });

  btnRefresh.addEventListener('click', async () => {
    await refreshVars('Refreshed.');
  });

  btnSave.addEventListener('click', async () => {
    const nextSession = collectSessionRows();
    const persistentUpdates = collectPersistentChanges();
    const toSet = { ...persistentUpdates };
    const toUnset = [];

    for (const [name, value] of Object.entries(nextSession)) {
      if (state.session[name] !== value) toSet[name] = value;
    }
    for (const name of Object.keys(state.session || {})) {
      if (!(name in nextSession)) toUnset.push(name);
    }

    if (!Object.keys(toSet).length && !toUnset.length) {
      setStatus('No changes to save.');
      return;
    }

    try {
      const payload = await postJson(apiBase() + '/api/vars', {
        set_persistent: persistentUpdates,
        set_session: Object.fromEntries(Object.entries(toSet).filter(([name]) => !(name in persistentUpdates))),
        unset_session: toUnset,
      });
      applyPayload(payload);
      try { context?.bus?.emit('vars:changed'); } catch { }
      if (Array.isArray(payload?.errors) && payload.errors.length) {
        const first = payload.errors[0];
        const name = first?.name ? ` @${first.name}` : '';
        const detail = first?.error ? ` ${first.error}` : '';
        setStatus(`Saved with ${payload.errors.length} issue(s).${name ? ` First:${name}` : ''}${detail}`);
        return;
      }
      setStatus('Saved.');
    } catch (e) {
      console.error('[Chronos][Vars] save failed:', e);
      setStatus('Save failed.');
    }
  });

  btnMin.addEventListener('click', () => {
    const c = el.querySelector('.content');
    if (!c) return;
    c.style.display = (c.style.display === 'none' ? '' : 'none');
    setStatus(c.style.display === 'none' ? 'Minimized.' : '');
  });

  btnClose.addEventListener('click', () => {
    el.style.display = 'none';
    setStatus('Closed.');
  });

  (async () => {
    await refreshVars('Loaded.');
  })();
}
