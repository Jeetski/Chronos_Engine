const STYLE_ID = 'cockpit-commitments-panel-style';
const PANEL_ID = 'commitments';
const STATUS_ORDER = { violation: 0, pending: 1, met: 2 };
const STATUS_COLORS = {
  violation: '#ff6b6b',
  pending: '#f7b955',
  met: '#5bdc82',
};
const MAX_ITEMS = 5;

console.log('[Chronos][Panels][Commitments] Module loaded');

function injectStyles(){
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .commitments-panel-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      color: var(--chronos-text);
      font-size: 13px;
      gap: 12px;
    }
    .commitments-panel-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: stretch;
    }
    .commitments-panel-count {
      flex: 1 1 120px;
      background: var(--chronos-surface);
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.05);
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .commitments-panel-count span {
      font-size: 12px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: var(--chronos-text-muted);
    }
    .commitments-panel-count strong {
      font-size: 26px;
      font-weight: 700;
      color: var(--chronos-text);
      line-height: 1.2;
    }
    .commitments-panel-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-left: auto;
    }
    .commitments-panel-actions button {
      border: none;
      border-radius: 999px;
      background: var(--chronos-accent-gradient);
      color: var(--chronos-bg, #0b0f16);
      padding: 8px 16px;
      font-weight: 600;
      cursor: pointer;
    }
    .commitments-panel-actions button:hover:not([disabled]) {
      filter: brightness(1.08);
    }
    .commitments-panel-actions button[disabled] {
      opacity: 0.6;
      cursor: default;
    }
    .commitments-panel-list {
      flex: 1;
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: 16px;
      background: var(--chronos-surface);
      padding: 10px;
      overflow: auto;
    }
    .commitments-panel-item {
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.05);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--chronos-surface-soft);
    }
    .commitments-panel-item + .commitments-panel-item {
      margin-top: 8px;
    }
    .commitments-panel-item-head {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .commitments-panel-head-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;
    }
    .commitments-panel-expander {
      width: 14px;
      text-align: center;
      font-size: 11px;
      color: var(--chronos-text-muted);
      user-select: none;
    }
    .commitments-panel-item-name {
      font-size: 15px;
      font-weight: 600;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .commitments-panel-badge {
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.05);
    }
    .commitments-panel-badge[data-state="violation"] {
      color: #ff9fa6;
      border-color: rgba(255,107,107,0.4);
      background: rgba(255,107,107,0.08);
    }
    .commitments-panel-badge[data-state="pending"] {
      color: #ffd27a;
      border-color: rgba(255,210,122,0.4);
      background: rgba(255,210,122,0.08);
    }
    .commitments-panel-badge[data-state="met"] {
      color: #8ef7c2;
      border-color: rgba(91,220,130,0.4);
      background: rgba(91,220,130,0.08);
    }
    .commitments-panel-head-actions {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .commitments-panel-head-actions button {
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.04);
      color: var(--chronos-text);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 11px;
      cursor: pointer;
    }
    .commitments-panel-head-actions button:hover {
      filter: brightness(1.1);
    }
    .commitments-panel-progress {
      font-size: 12px;
      color: var(--chronos-text-muted);
    }
    .commitments-panel-trace {
      font-size: 11px;
      color: var(--chronos-text-soft);
    }
    .commitments-panel-empty {
      padding: 24px;
      text-align: center;
      color: var(--chronos-text-muted);
    }
    .commitments-panel-status {
      min-height: 16px;
      font-size: 12px;
      color: var(--chronos-text-muted);
    }
    .commitments-panel-status[data-tone="error"] {
      color: var(--chronos-danger);
    }
    .commitments-panel-status[data-tone="success"] {
      color: var(--chronos-success);
    }
    .commitments-panel-detail {
      display: none;
      flex-direction: column;
      gap: 6px;
      padding-top: 6px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .commitments-panel-item.expanded .commitments-panel-detail {
      display: flex;
    }
  `;
  document.head.appendChild(style);
}

function apiBase(){
  const origin = window.location?.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

function createDefinition(){
  return {
    id: PANEL_ID,
    label: 'Commitments Snapshot',
    menuKey: 'commitments',
    menuLabel: 'Commitments',
    defaultVisible: false,
    defaultPosition: { x: 120, y: 120 },
    size: { width: 360, height: 420 },
    mount: (root) => mountCommitmentsPanel(root),
  };
}

export function register(manager){
  injectStyles();
  manager.registerPanel(createDefinition());
}

const autoAttach = (manager) => {
  try {
    if (manager && typeof manager.registerPanel === 'function') {
      register(manager);
    }
  } catch (err) {
    console.error('[Chronos][Panels][Commitments] autoAttach failed', err);
  }
};

if (typeof window !== 'undefined') {
  const defs = window.__cockpitPanelDefinitions || [];
  defs.push(autoAttach);
  window.__cockpitPanelDefinitions = defs;
  if (typeof window.__cockpitPanelRegister === 'function') {
    try { window.__cockpitPanelRegister(autoAttach); } catch {}
  }
}

function normalizeItems(list){
  if (!Array.isArray(list)) return [];
  return list.map(entry => ({
    name: entry.name || 'Commitment',
    description: entry.description || '',
    status: String(entry.status || 'pending').toLowerCase(),
    period: entry.period || '',
    ruleKind: entry.rule_kind || '',
    progress: Number(entry.progress ?? 0),
    required: Number(entry.required_total ?? entry.times_required ?? 0),
    remaining: Number(entry.remaining ?? 0),
    targetProgress: Array.isArray(entry.target_progress) ? entry.target_progress : [],
    targets: Array.isArray(entry.targets) ? entry.targets : [],
    manualToday: String(entry.manual_today || '').toLowerCase(),
    needsCheckin: !!entry.needs_checkin,
    lastMet: entry.last_met || '',
    lastViolation: entry.last_violation || '',
  }));
}

function sortCommitments(a, b){
  const rankA = STATUS_ORDER[a.status] ?? 1;
  const rankB = STATUS_ORDER[b.status] ?? 1;
  if (rankA !== rankB) return rankA - rankB;
  return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
}

function mountCommitmentsPanel(root){
  injectStyles();
  root.classList.add('commitments-panel-shell');
  root.innerHTML = `
    <div class="commitments-panel-toolbar">
      <div class="commitments-panel-count" data-count="total">
        <span>Total</span>
        <strong>--</strong>
      </div>
      <div class="commitments-panel-count" data-count="met">
        <span>On Track</span>
        <strong>--</strong>
      </div>
      <div class="commitments-panel-count" data-count="violations">
        <span>Violations</span>
        <strong>--</strong>
      </div>
      <div class="commitments-panel-actions">
        <button type="button" data-action="refresh">Refresh</button>
      </div>
    </div>
    <div class="commitments-panel-list" aria-live="polite"></div>
    <div class="commitments-panel-status"></div>
  `;

  const listEl = root.querySelector('.commitments-panel-list');
  const statusEl = root.querySelector('.commitments-panel-status');
  const refreshBtn = root.querySelector('button[data-action="refresh"]');
  const countEls = {
    total: root.querySelector('[data-count="total"] strong'),
    met: root.querySelector('[data-count="met"] strong'),
    violations: root.querySelector('[data-count="violations"] strong'),
  };

  const state = {
    items: [],
    counts: { total: 0, met: 0, violations: 0 },
    timer: null,
    loading: false,
    expanded: new Set(),
  };

  function setStatus(message = '', tone = 'info'){
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  }

  function renderCounts(){
    if (countEls.total) countEls.total.textContent = (state.counts.total ?? state.items.length ?? 0).toString();
    if (countEls.met) countEls.met.textContent = (state.counts.met ?? state.items.filter(it => it.status === 'met').length ?? 0).toString();
    if (countEls.violations) countEls.violations.textContent = (state.counts.violations ?? state.items.filter(it => it.status === 'violation').length ?? 0).toString();
  }

function formatProgress(item){
  if (!item.required) {
    if (item.ruleKind) return `Rule: ${item.ruleKind} (${item.period || 'period'})`;
    return 'Progress: n/a';
  }
  return `Progress: ${item.progress}/${item.required} this ${item.period || 'period'}`;
}

  function renderList(){
    listEl.innerHTML = '';
    if (!state.items.length){
      const empty = document.createElement('div');
      empty.className = 'commitments-panel-empty';
      empty.textContent = state.loading ? 'Loading commitments…' : 'No commitments defined yet.';
      listEl.appendChild(empty);
      return;
    }
    const top = state.items.slice().sort(sortCommitments).slice(0, MAX_ITEMS);
    top.forEach(item => {
      const nameKey = String(item.name || '').toLowerCase();
      const isExpanded = state.expanded.has(nameKey);
      const card = document.createElement('div');
      card.className = 'commitments-panel-item';
      if (isExpanded) card.classList.add('expanded');
      const head = document.createElement('div');
      head.className = 'commitments-panel-item-head';
      const headLeft = document.createElement('div');
      headLeft.className = 'commitments-panel-head-left';
      const expander = document.createElement('div');
      expander.className = 'commitments-panel-expander';
      expander.textContent = isExpanded ? '▼' : '▶';
      const name = document.createElement('div');
      name.className = 'commitments-panel-item-name';
      name.textContent = item.name;
      const badge = document.createElement('div');
      badge.className = 'commitments-panel-badge';
      badge.dataset.state = item.status;
      badge.textContent = item.status.charAt(0).toUpperCase() + item.status.slice(1);
      if (STATUS_COLORS[item.status]){
        badge.style.setProperty('--accent', STATUS_COLORS[item.status]);
      }
      headLeft.append(expander, name);

      const headActions = document.createElement('div');
      headActions.className = 'commitments-panel-head-actions';
      const metBtn = document.createElement('button');
      metBtn.type = 'button';
      metBtn.textContent = 'Met';
      metBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await setDailyOverride(item.name, 'met');
      });
      headActions.appendChild(metBtn);

      const vioBtn = document.createElement('button');
      vioBtn.type = 'button';
      vioBtn.textContent = 'Violated';
      vioBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await setDailyOverride(item.name, 'violation');
      });
      headActions.appendChild(vioBtn);

      if (item.manualToday) {
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          await setDailyOverride(item.name, 'clear');
        });
        headActions.appendChild(clearBtn);
      }

      headActions.appendChild(badge);
      head.append(headLeft, headActions);

      const detail = document.createElement('div');
      detail.className = 'commitments-panel-detail';

      const desc = document.createElement('div');
      desc.className = 'commitments-panel-progress';
      desc.textContent = item.description || formatProgress(item);

      const progress = document.createElement('div');
      progress.className = 'commitments-panel-progress';
      progress.textContent = item.description ? formatProgress(item) : '';

      const targets = document.createElement('div');
      targets.className = 'commitments-panel-progress';
      const targetNames = (item.targets || []).map(it => `${it.type || '?'}:${it.name || ''}`).filter(Boolean).join(', ');
      if (targetNames) targets.textContent = `Targets: ${targetNames}`;

      const traceBits = [];
      if (item.lastViolation) traceBits.push(`Last violation ${item.lastViolation}`);
      if (item.lastMet) traceBits.push(`Last met ${item.lastMet}`);
      const trace = document.createElement('div');
      trace.className = 'commitments-panel-trace';
      trace.textContent = traceBits.join(' • ');

      if (Array.isArray(item.targetProgress) && item.targetProgress.length) {
        const tp = document.createElement('div');
        tp.className = 'commitments-panel-progress';
        tp.textContent = `Target progress: ${item.targetProgress.map(t => `${t.name || ''} ${Number(t.progress || 0)}/${Number(t.required || 0)}`).join(' | ')}`;
        detail.appendChild(tp);
      }

      const checkin = document.createElement('div');
      checkin.className = 'commitments-panel-progress';
      if (item.manualToday === 'met' || item.manualToday === 'violation') {
        checkin.textContent = `Today check-in: ${item.manualToday}`;
      } else if (item.needsCheckin) {
        checkin.textContent = 'Daily check-in pending.';
      } else {
        checkin.textContent = 'Daily check-in optional.';
      }

      card.append(head);
      detail.append(desc);
      if (item.description) detail.append(progress);
      if (targetNames) detail.append(targets);
      detail.append(checkin);
      if (trace.textContent) detail.append(trace);
      card.append(detail);
      head.addEventListener('click', () => {
        if (card.classList.contains('expanded')) {
          card.classList.remove('expanded');
          expander.textContent = '▶';
          state.expanded.delete(nameKey);
        } else {
          card.classList.add('expanded');
          expander.textContent = '▼';
          state.expanded.add(nameKey);
        }
      });
      listEl.appendChild(card);
    });
  }

  async function setDailyOverride(name, status){
    setStatus('Saving check-in…');
    try {
      const resp = await fetch(`${apiBase()}/api/commitments/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, state: status }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) {
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }
      await refresh(false);
      setStatus('Check-in saved.', 'success');
    } catch (err) {
      console.error('[Chronos][Panels][Commitments] check-in failed', err);
      setStatus(err?.message || 'Failed to save check-in.', 'error');
    }
  }

  async function fetchCommitments(){
    const resp = await fetch(`${apiBase()}/api/commitments`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false){
      throw new Error(data?.error || data?.stderr || `HTTP ${resp.status}`);
    }
    const counts = data?.counts || {};
    const items = normalizeItems(data?.commitments);
    return { counts, items };
  }

  async function refresh(manual = false){
    if (state.loading) return;
    state.loading = true;
    refreshBtn.disabled = true;
    setStatus(manual ? 'Refreshing…' : 'Syncing…');
    renderList();
    try {
      const { counts, items } = await fetchCommitments();
      state.counts = {
        total: counts.total ?? items.length,
        met: counts.met ?? 0,
        violations: counts.violations ?? 0,
      };
      state.items = items;
      renderCounts();
      renderList();
      setStatus(manual ? 'Updated.' : 'Synced.', 'success');
    } catch (err) {
      console.error('[Chronos][Panels][Commitments] refresh failed', err);
      state.items = [];
      renderCounts();
      renderList();
      setStatus(err?.message || 'Failed to load commitments.', 'error');
    } finally {
      state.loading = false;
      refreshBtn.disabled = false;
    }
  }

  refreshBtn?.addEventListener('click', () => refresh(true));
  state.timer = window.setInterval(() => refresh(false), 120000);
  refresh(false);

  return {
    dispose(){
      try { if (state.timer) window.clearInterval(state.timer); } catch {}
    }
  };
}
