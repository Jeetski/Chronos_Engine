export async function mount(el, context) {
  const tpl = `
    <div class="header" id="resolutionHeader">
      <div class="title">Resolutions</div>
      <div class="controls">
        <button class="icon-btn" id="resolutionMin" title="Minimize">_</button>
        <button class="icon-btn" id="resolutionClose" title="Close">x</button>
      </div>
    </div>
    <div class="content" id="resolutionContent" style="gap:12px; display:flex; flex-direction:column; max-height:400px; overflow:hidden;">
      <div class="resolution-tracker-header">
        <div class="resolution-tracker-stats" id="resolutionStats"></div>
      </div>
      <div id="resolutionList" style="flex:1; overflow-y:auto; overflow-x:hidden; display:flex; flex-direction:column; gap:12px; padding-right:4px;"></div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;

  el.innerHTML = tpl;

  const header = el.querySelector('#resolutionHeader');
  const btnMin = el.querySelector('#resolutionMin');
  const btnClose = el.querySelector('#resolutionClose');
  const statsEl = el.querySelector('#resolutionStats');
  const listEl = el.querySelector('#resolutionList');

  function apiBase() {
    const origin = window.location.origin;
    if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
    return origin;
  }

  async function apiRequest(path, { method = 'GET', body } = {}) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
    }
    const resp = await fetch(apiBase() + path, opts);
    const text = await resp.text();
    let data = text;
    try { data = JSON.parse(text); } catch { }
    if (!resp.ok || (data && data.ok === false)) {
      const err = (data && (data.error || data.stderr)) || text || `HTTP ${resp.status}`;
      throw new Error(err);
    }
    return data;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  injectStyles();

  // Widget controls
  header.addEventListener('pointerdown', (ev) => {
    const startX = ev.clientX, startY = ev.clientY;
    const rect = el.getBoundingClientRect();
    const offX = startX - rect.left, offY = startY - rect.top;
    function onMove(e) {
      el.style.left = Math.max(6, e.clientX - offX) + 'px';
      el.style.top = Math.max(6, e.clientY - offY) + 'px';
      el.style.right = 'auto';
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  btnMin.addEventListener('click', () => el.classList.toggle('minimized'));
  btnClose.addEventListener('click', () => {
    el.style.display = 'none';
    try {
      window?.ChronosBus?.emit?.('widget:closed', 'Resolutions');
    } catch { }
  });

  await render();

  async function render() {
    const items = await loadResolutionItems();

    if (!items.length) {
      renderEmpty(listEl);
      statsEl.innerHTML = '';
      return;
    }

    const currentYear = new Date().getFullYear();
    const yearItems = items.filter(item => {
      const resYear = item.resolution?.year;
      return !resYear || resYear === currentYear || resYear === currentYear + 1;
    });

    const totalProgress = yearItems.length > 0
      ? Math.round(yearItems.reduce((sum, item) => sum + calculateProgress(item).percent, 0) / yearItems.length)
      : 0;

    statsEl.innerHTML = `
      <div style="display:flex; gap:16px; font-size:13px; color:var(--text-dim);">
        <div style="display:flex; align-items:center; gap:6px;">
          <span>${yearItems.length}</span> <span>total</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <strong style="color:var(--chronos-accent, var(--accent)); font-weight:600;">${totalProgress}%</strong> <span>overall</span>
        </div>
      </div>
    `;

    listEl.innerHTML = '';
    const grouped = groupItems(yearItems);

    Object.entries(grouped).forEach(([category, categoryItems]) => {
      const groupEl = document.createElement('div');
      groupEl.style.marginBottom = '8px';

      const header = document.createElement('div');
      header.style.fontSize = '14px';
      header.style.fontWeight = '600';
      header.style.color = '#a8b0c0';
      header.style.marginBottom = '8px';
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.gap = '8px';
      header.innerHTML = `<span style="font-size:18px;">⭐</span><span>${escapeHtml(category)} (${categoryItems.length})</span>`;
      groupEl.appendChild(header);

      categoryItems.forEach(item => {
        groupEl.appendChild(renderResolutionCard(item));
      });

      listEl.appendChild(groupEl);
    });
  }

  function calculateProgress(item) {
    const type = item.type || 'task';

    if (type === 'goal') {
      const milestones = item.milestones || [];
      if (!milestones.length) return { percent: 0, label: 'No milestones', badge: null };
      const completed = milestones.filter(m => m.status === 'complete' || m.complete).length;
      const percent = Math.round((completed / milestones.length) * 100);
      const badge = getBadge(percent);
      return { percent, label: `${completed}/${milestones.length} milestones`, badge };
    }

    if (type === 'habit') {
      const currentStreak = item.current_streak || 0;
      const targetStreak = item.target_streak || 30;
      const percent = Math.min(100, Math.round((currentStreak / targetStreak) * 100));
      const badge = getBadge(percent);

      if (item.polarity === 'bad') {
        const cleanStreak = item.clean_current_streak || 0;
        return { percent, label: `${cleanStreak} day clean streak`, badge };
      }

      return { percent, label: `${currentStreak} day streak`, badge };
    }

    if (type === 'commitment') {
      const successRate = item.success_rate || 0;
      const percent = Math.round(successRate);
      const badge = getBadge(percent);
      return { percent, label: `${percent}% success rate`, badge };
    }

    if (type === 'task') {
      const complete = item.status === 'complete' || item.complete;
      return { percent: complete ? 100 : 0, label: complete ? 'Complete' : 'Not done', badge: complete ? '⭐' : null };
    }

    if (type === 'project') {
      const tasks = item.tasks || [];
      if (!tasks.length) return { percent: 0, label: 'No tasks', badge: null };
      const done = tasks.filter(t => t.complete || t.status === 'complete').length;
      const percent = Math.round((done / tasks.length) * 100);
      const badge = getBadge(percent);
      return { percent, label: `${done}/${tasks.length} tasks`, badge };
    }

    if (type === 'routine') {
      return { percent: 100, label: 'Active routine', badge: null };
    }

    return { percent: 0, label: 'Unknown type', badge: null };
  }

  function getBadge(percent) {
    if (percent >= 100) return '⭐';
    if (percent >= 75) return '🥇';
    if (percent >= 50) return '🥈';
    if (percent >= 25) return '🥉';
    return null;
  }

  function getTypeIcon(type) {
    const icons = {
      goal: '🎯',
      habit: '🔄',
      commitment: '🤝',
      task: '✓',
      project: '📁',
      routine: '⏰',
    };
    return icons[type] || '📌';
  }

  function getItemName(item) {
    return item.name || item.Name || item.title || 'Unnamed Item';
  }

  function groupItems(items) {
    const groups = {};

    items.forEach(item => {
      const category = item.category || item.Category || 'Uncategorized';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(item);
    });

    const sorted = {};
    Object.keys(groups).sort().forEach(key => {
      sorted[key] = groups[key];
    });

    return sorted;
  }

  function renderResolutionCard(item) {
    const resolution = item.resolution || {};
    const affirmation = resolution.affirmation || 'No affirmation';
    const rawText = resolution.raw_text || '';
    const type = item.type || 'task';
    const name = getItemName(item);
    const icon = getTypeIcon(type);
    const progress = calculateProgress(item);

    const card = document.createElement('div');
    card.className = 'resolution-card';
    card.dataset.itemType = type;
    card.dataset.itemName = name;

    let badgeHtml = '';
    if (progress.badge) {
      badgeHtml = `<span class="resolution-badge-milestone">${progress.badge}</span>`;
    }

    card.innerHTML = `
      <div class="resolution-affirmation">${escapeHtml(affirmation)}</div>
      ${rawText ? `<div class="resolution-rawtext">"${escapeHtml(rawText)}"</div>` : ''}
      <div class="resolution-meta">
        <span class="resolution-badge type-${type}">${icon} ${type}</span>
        <span class="resolution-badge">${escapeHtml(name)}</span>
      </div>
      <div class="resolution-progress">
        <div class="resolution-progress-bar">
          <div class="resolution-progress-fill" style="width: ${progress.percent}%"></div>
        </div>
        <div class="resolution-progress-label">
          <span>${progress.label}</span>
          <span>${progress.percent}% ${badgeHtml}</span>
        </div>
      </div>
    `;

    return card;
  }

  async function loadResolutionItems() {
    try {
      const data = await apiRequest('/api/items');
      const allItems = data.items || [];
      const resolutionItems = allItems.filter(item => item.resolution);
      return resolutionItems;
    } catch (err) {
      console.error('[ResolutionTracker] Failed to load items:', err);
      return [];
    }
  }

  function renderEmpty(container) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:var(--text-dim);">
        <h3 style="margin:0 0 8px 0; font-size:18px; color:var(--text);">No Resolutions Yet</h3>
        <p style="margin:0; font-size:14px;">Create your first resolutions using the New Year's Resolutions Wizard.</p>
        <p style="margin-top:12px; color:var(--text-dim); font-size:14px;">Open <strong>Wizards → New Year's Resolutions Wizard</strong> to get started.</p>
      </div>
    `;
  }

  function injectStyles() {
    if (document.querySelector('[data-resolution-tracker-styles]')) return;
    const style = document.createElement('style');
    style.dataset.resolutionTrackerStyles = 'true';
    style.textContent = `
      .resolution-card {
        background: linear-gradient(135deg, var(--chronos-accent-soft, rgba(122,162,247,0.18)), rgba(0,0,0,0));
        border: 1px solid var(--chronos-accent-soft, rgba(122,162,247,0.22));
        border-radius: 12px;
        padding: 14px 16px;
        transition: all 200ms ease;
        margin-bottom: 10px;
      }
      .resolution-card:hover {
        border-color: var(--chronos-accent, var(--accent));
        background: linear-gradient(135deg, var(--chronos-accent-soft, rgba(122,162,247,0.24)), rgba(0,0,0,0));
      }
      .resolution-affirmation {
        font-family: Georgia, serif;
        font-size: 18px;
        font-weight: 700;
        color: var(--chronos-accent, var(--accent));
        margin-bottom: 6px;
        font-style: italic;
      }
      .resolution-rawtext {
        font-size: 13px;
        color: var(--text-dim);
        font-style: italic;
        margin-bottom: 12px;
      }
      .resolution-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }
      .resolution-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        border: 1px solid rgba(255,255,255,0.15);
      }
      .resolution-badge.type-goal {
        background: rgba(122,162,247,0.15);
        border-color: rgba(122,162,247,0.3);
        color: #7aa2f7;
      }
      .resolution-badge.type-habit {
        background: rgba(187,154,247,0.15);
        border-color: rgba(187,154,247,0.3);
        color: #bb9af7;
      }
      .resolution-badge.type-commitment {
        background: rgba(158,206,106,0.15);
        border-color: rgba(158,206,106,0.3);
        color: #9ece6a;
      }
      .resolution-badge.type-task {
        background: rgba(224,175,104,0.15);
        border-color: rgba(224,175,104,0.3);
        color: #e0af68;
      }
      .resolution-badge.type-project {
        background: rgba(115,218,202,0.15);
        border-color: rgba(115,218,202,0.3);
        color: #73daca;
      }
      .resolution-badge.type-routine {
        background: rgba(247,118,142,0.15);
        border-color: rgba(247,118,142,0.3);
        color: #f7768e;
      }
      .resolution-progress {
        margin-top: 8px;
      }
      .resolution-progress-bar {
        height: 8px;
        background: rgba(255,255,255,0.08);
        border-radius: 999px;
        overflow: hidden;
        position: relative;
      }
      .resolution-progress-fill {
        height: 100%;
        background: var(--chronos-accent-gradient, var(--accent));
        border-radius: 999px;
        transition: width 300ms ease;
      }
      .resolution-progress-label {
        font-size: 12px;
        color: var(--text-dim);
        margin-top: 4px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .resolution-badge-milestone {
        font-size: 16px;
        margin-left: 4px;
      }
      #resolutionList::-webkit-scrollbar {
        width: 8px;
      }
      #resolutionList::-webkit-scrollbar-thumb {
        background: var(--chronos-accent-soft, rgba(122,162,247,0.3));
        border-radius: 999px;
      }
      #resolutionList::-webkit-scrollbar-track {
        background: rgba(255,255,255,0.03);
        border-radius: 999px;
      }
    `;
    document.head.appendChild(style);
  }

  return {
    unmount() {
      // Cleanup if needed
    }
  };
}
