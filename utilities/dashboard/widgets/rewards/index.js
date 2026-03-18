export function mount(el, context) {
  // Load CSS
  if (!document.getElementById('rewards-css')) {
    const link = document.createElement('link');
    link.id = 'rewards-css';
    link.rel = 'stylesheet';
    link.href = new URL('./rewards.css', import.meta.url).toString();
    document.head.appendChild(link);
  }

  el.className = 'widget rewards-widget';
  try { el.dataset.uiId = 'widget.rewards'; } catch { }

  const tpl = `
    <style>
      .rw-content { display:flex; flex-direction:column; gap:10px; min-height:0; }
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
      .rw-list { display:flex; flex-direction:column; gap:10px; min-height:120px; max-height:clamp(220px, 45vh, 420px); overflow:auto; }
      .rw-reward { border:1px solid var(--border); border-radius:10px; padding:10px; background:#0f141d; display:flex; flex-direction:column; gap:6px; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.02); }
      .rw-reward.disabled { opacity:0.65; }
      .rw-reward-head { display:flex; align-items:center; justify-content:space-between; flex-wrap:nowrap; gap:6px; cursor:pointer; }
      .rw-name { font-size:15px; font-weight:700; }
      .rw-cost { font-weight:700; color:#f6c177; }
      .rw-tags { display:flex; flex-wrap:wrap; gap:4px; font-size:11px; }
      .rw-tag { padding:2px 6px; border:1px solid rgba(255,255,255,0.08); border-radius:999px; }
      .rw-status { min-height:18px; font-size:13px; color:var(--text-dim); }
      .rw-status.error { color:#ef6a6a; }
      .rw-status.success { color:#5bdc82; }
      .rw-actions { display:flex; gap:8px; align-items:center; justify-content:flex-end; flex-wrap:wrap; }
      .rw-list-toggle { align-self:flex-start; }
      .rw-list-section[hidden] { display:none !important; }
      .rw-list-section { display:flex; flex-direction:column; gap:10px; }
      .rw-empty { border:1px dashed var(--border); border-radius:10px; padding:20px; text-align:center; color:var(--text-dim); }
      .rw-head-left { display:flex; align-items:center; gap:8px; min-width:0; }
      .rw-expander { font-size:12px; color:var(--text-dim); width:14px; text-align:center; user-select:none; }
      .rw-head-actions { display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
      .rw-detail { display:none; flex-direction:column; gap:6px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.06); margin-top:4px; }
      .rw-reward.expanded .rw-detail { display:flex; }
    </style>
    <div class="header" data-ui-id="widget.rewards.header">
      <div class="title" data-ui-id="widget.rewards.title">Rewards</div>
      <div class="controls" style="align-items:center; gap:6px;">
        <button class="icon-btn" id="rwRefresh" title="Refresh" aria-label="Refresh" data-ui-id="widget.rewards.refresh_button">↻</button>
        <button class="icon-btn" id="rwMin" title="Minimize" data-ui-id="widget.rewards.minimize_button">_</button>
        <button class="icon-btn" id="rwClose" title="Close" data-ui-id="widget.rewards.close_button">x</button>
      </div>
    </div>
    <div class="content rw-content" data-ui-id="widget.rewards.panel">
      <div class="rw-summary">
        <div class="rw-card">
          <h4>Balance</h4>
          <div id="rwBalance" class="rw-balance-value" data-ui-id="widget.rewards.balance_text">--</div>
          <div class="rw-meta">Total Chronos points available.</div>
        </div>
        <div class="rw-card">
          <h4>Recent Activity</h4>
          <div id="rwLedger" class="rw-ledger" data-ui-id="widget.rewards.ledger_container"></div>
        </div>
      </div>
      <button class="btn rw-list-toggle" id="rwListToggle" aria-expanded="false" data-ui-id="widget.rewards.list_toggle_button">Show List Section ▾</button>
      <div id="rwListSection" class="rw-list-section" hidden data-ui-id="widget.rewards.list_section">
        <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap;">
          <input id="rwSearch" class="input" placeholder="Search rewards..." style="flex:1 1 240px; min-width:160px;" data-ui-id="widget.rewards.search_input" />
          <label class="hint" style="display:flex; align-items:center; gap:6px;">
            <input type="checkbox" id="rwReadyOnly" data-ui-id="widget.rewards.ready_only_checkbox" /> Ready only
          </label>
        </div>
        <div class="row" style="gap:8px; align-items:center;">
          <button class="btn btn-primary" id="rwRedeemPrimary" data-ui-id="widget.rewards.redeem_primary_button">Redeem Primary</button>
          <div class="spacer"></div>
        </div>
        <div id="rwStatus" class="rw-status" data-ui-id="widget.rewards.status_text"></div>
        <div id="rwList" class="rw-list" data-ui-id="widget.rewards.list_container"></div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const btnMin = el.querySelector('#rwMin');
  const btnClose = el.querySelector('#rwClose');
  const listToggleBtn = el.querySelector('#rwListToggle');
  const listSectionEl = el.querySelector('#rwListSection');
  const searchEl = el.querySelector('#rwSearch');
  const readyChk = el.querySelector('#rwReadyOnly');
  const refreshBtn = el.querySelector('#rwRefresh');
  const statusEl = el.querySelector('#rwStatus');
  const listEl = el.querySelector('#rwList');
  const balanceEl = el.querySelector('#rwBalance');
  const ledgerEl = el.querySelector('#rwLedger');
  const redeemPrimaryBtn = el.querySelector('#rwRedeemPrimary');

  btnMin.addEventListener('click', () => { el.classList.toggle('minimized'); setStatus(el.classList.contains('minimized') ? 'Minimized.' : ''); });
  btnClose.addEventListener('click', () => { el.style.display = 'none'; try { setStatus('Closed.'); window?.ChronosBus?.emit?.('widget:closed', 'Rewards'); } catch { } });

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  function expandText(s) {
    try {
      return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s || '')) : String(s || '');
    } catch {
      return String(s || '');
    }
  }

  let rewards = [];
  let balance = 0;
  let history = [];
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
    statusEl.textContent = msg || '';
    statusEl.className = `rw-status${tone ? ' ' + tone : ''}`;
  }

  async function fetchJson(url) {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    return await resp.json();
  }

  async function refreshAll(options = {}) {
    const silent = !!options.silent;
    if (loading) return;
    loading = true;
    if (!silent) setStatus('Loading rewards...');
    try {
      const [pointsData, rewardsData] = await Promise.all([
        fetchJson(apiBase() + "/api/points?limit=6").catch(() => ({})),
        fetchJson(apiBase() + "/api/rewards").catch(() => ({}))
      ]);
      balance = Number(pointsData?.balance ?? 0) || 0;
      history = Array.isArray(pointsData?.history) ? pointsData.history : [];
      rewards = Array.isArray(rewardsData?.rewards) ? rewardsData.rewards : [];
      renderBalance();
      renderRewards();
      if (!silent) setStatus('');
    } catch (e) {
      console.warn('[Rewards] refresh error', e);
      setStatus('Failed to load rewards.', 'error');
    } finally {
      loading = false;
    }
  }

  function renderBalance() {
    balanceEl.textContent = balance.toLocaleString();
    ledgerEl.innerHTML = '';
    const recent = history.slice(-5).reverse();
    if (!recent.length) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = 'No point activity yet.';
      ledgerEl.appendChild(empty);
      return;
    }
    recent.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'rw-ledger-row';
      const delta = document.createElement('span');
      delta.className = 'rw-delta ' + ((entry.delta || 0) >= 0 ? 'pos' : 'neg');
      delta.textContent = `${(entry.delta || 0) >= 0 ? '+' : ''}${entry.delta || 0}`;
      const meta = document.createElement('div');
      meta.className = 'rw-meta';
      const reason = entry.reason || entry.source || '';
      const when = entry.date || '';
      meta.textContent = `${reason}${when ? ' | ' + when : ''}`;
      row.append(delta, meta);
      ledgerEl.appendChild(row);
    });
  }

  function renderRewards() {
    listEl.innerHTML = '';
    const term = (searchEl.value || '').trim().toLowerCase();
    const readyOnly = !!readyChk?.checked;
    const filtered = rewards.filter(r => {
      if (readyOnly && !r.available) return false;
      if (!term) return true;
      const hay = `${r.name || ''} ${r.category || ''} ${r.description || ''}`.toLowerCase();
      return hay.includes(term);
    });
    const sorted = filtered.slice().sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      const ap = a.cost_points || 0;
      const bp = b.cost_points || 0;
      if (ap !== bp) return ap - bp;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
    if (!sorted.length) {
      const empty = document.createElement('div');
      empty.className = 'rw-empty';
      empty.textContent = rewards.length ? 'No rewards match that filter.' : 'Create reward items via the console to see them here.';
      listEl.appendChild(empty);
      return;
    }
    sorted.forEach(item => {
      const card = document.createElement('div');
      const itemName = item.name || '';
      const key = itemName.toLowerCase();
      const isExpanded = expanded.has(key);
      card.className = 'rw-reward' + (item.available ? '' : ' disabled');
      if (isExpanded) card.classList.add('expanded');
      const head = document.createElement('div');
      head.className = 'rw-reward-head';
      const headLeft = document.createElement('div');
      headLeft.className = 'rw-head-left';
      const expander = document.createElement('div');
      expander.className = 'rw-expander';
      expander.textContent = isExpanded ? '▼' : '▶';
      const name = document.createElement('div');
      name.className = 'rw-name';
      name.textContent = expandText(itemName);
      const cost = document.createElement('div');
      cost.className = 'rw-cost';
      cost.textContent = `${item.cost_points || 0} pts`;

      const headActions = document.createElement('div');
      headActions.className = 'rw-head-actions';
      const redeemBtn = document.createElement('button');
      redeemBtn.className = 'btn btn-primary';
      redeemBtn.textContent = 'Redeem';
      const needsPoints = (item.cost_points || 0) > balance;
      const disable = !item.available || needsPoints;
      redeemBtn.disabled = disable;
      redeemBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        redeemReward(item, redeemBtn);
      });
      headActions.append(redeemBtn, cost);
      headLeft.append(expander, name);
      head.append(headLeft, headActions);

      const detail = document.createElement('div');
      detail.className = 'rw-detail';
      const desc = document.createElement('div');
      desc.className = 'rw-meta';
      desc.textContent = expandText(item.description || 'No description.');
      const meta = document.createElement('div');
      meta.className = 'rw-meta';
      const bits = [];
      if (item.category) bits.push(`Category: ${item.category}`);
      if (item.priority) bits.push(`Priority: ${item.priority}`);
      if (item.redemptions !== undefined) {
        const cap = item.max_redemptions ? `${item.redemptions || 0}/${item.max_redemptions}` : `${item.redemptions || 0}`;
        bits.push(`Redemptions: ${cap}`);
      }
      meta.textContent = bits.join(' | ');
      const tagWrap = document.createElement('div');
      tagWrap.className = 'rw-tags';
      const tags = Array.isArray(item.tags) ? item.tags : (typeof item.tags === 'string' ? item.tags.split(',') : []);
      tags.map(t => String(t || '').trim()).filter(Boolean).slice(0, 4).forEach(tag => {
        const chip = document.createElement('div');
        chip.className = 'rw-tag';
        chip.textContent = expandText(tag);
        tagWrap.appendChild(chip);
      });
      const statusLine = document.createElement('div');
      statusLine.className = 'rw-meta';
      let statusText = 'Ready to redeem';
      if (!item.limit_ready) statusText = 'Max redemptions reached';
      else if (!item.cooldown_ready && item.cooldown_remaining_minutes) {
        statusText = `Cooldown ${item.cooldown_remaining_minutes}m`;
      }
      if (needsPoints) statusText += ` - need ${(item.cost_points || 0) - balance} more pts`;
      statusLine.textContent = statusText;

      detail.append(desc, meta);
      if (tagWrap.children.length) detail.appendChild(tagWrap);
      detail.append(statusLine);
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

  function getPrimaryVisibleReward() {
    const term = (searchEl.value || '').trim().toLowerCase();
    const readyOnly = !!readyChk?.checked;
    const filtered = rewards.filter(r => {
      if (readyOnly && !r.available) return false;
      if (!term) return true;
      const hay = `${r.name || ''} ${r.category || ''} ${r.description || ''}`.toLowerCase();
      return hay.includes(term);
    });
    return filtered.slice().sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      const ap = a.cost_points || 0;
      const bp = b.cost_points || 0;
      if (ap !== bp) return ap - bp;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    })[0] || null;
  }

  async function redeemReward(item, btn) {
    if (!item?.name) return;
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Redeeming...';
    setStatus(`Redeeming "${item.name}"...`);
    try {
      const resp = await fetch(apiBase() + "/api/reward/redeem", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: item.name })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) {
        const err = data?.stderr || data?.error || 'Redeem failed';
        throw new Error(err);
      }
      await refreshAll({ silent: true });
      const msg = (data && data.stdout) ? data.stdout : `Redeemed ${item.name}.`;
      setStatus(msg, 'success');
    } catch (e) {
      console.warn('[Rewards] redeem error', e);
      setStatus(String(e.message || e), 'error');
    } finally {
      btn.textContent = orig;
      btn.disabled = false;
    }
  }

  searchEl.addEventListener('input', () => renderRewards());
  readyChk?.addEventListener('change', () => renderRewards());
  refreshBtn.addEventListener('click', () => refreshAll());
  redeemPrimaryBtn?.addEventListener('click', () => {
    const item = getPrimaryVisibleReward();
    if (!item) return;
    redeemReward(item, redeemPrimaryBtn);
  });

  listToggleBtn?.addEventListener('click', () => setListOpen(listSectionEl?.hidden));
  setListOpen(false);
  refreshAll();

  return {
    refresh: () => refreshAll()
  };
}

