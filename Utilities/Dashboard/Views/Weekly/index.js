const STYLE_ID = 'chronos-weekly-view-style';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .weekly-shell { display:flex; flex-direction:column; gap:12px; height:100%; color:var(--chronos-text); }
    .weekly-header { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .weekly-title { font-size:18px; font-weight:700; margin:0; }
    .weekly-actions { display:flex; gap:8px; align-items:center; }
    .weekly-btn { border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.05); color:var(--chronos-text); border-radius:8px; padding:6px 10px; cursor:pointer; }
    .weekly-grid { flex:1; overflow:auto; display:grid; gap:10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); align-items:start; }
    .weekly-day { border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.03); border-radius:12px; padding:10px; display:flex; flex-direction:column; gap:8px; min-height:160px; }
    .weekly-day h3 { margin:0; font-size:14px; display:flex; justify-content:space-between; align-items:center; }
    .weekly-day small { color:var(--chronos-text-muted); }
    .weekly-block { border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:8px; background:rgba(12,14,22,0.7); display:flex; flex-direction:column; gap:4px; }
    .weekly-block-time { font-weight:700; font-size:13px; }
    .weekly-block-text { font-size:13px; }
    .weekly-block-meta { font-size:11px; color:var(--chronos-text-muted); display:flex; gap:8px; flex-wrap:wrap; }
    .weekly-status { min-height:16px; font-size:12px; color:var(--chronos-text-muted); }
    .weekly-status[data-tone="error"] { color: var(--chronos-danger); }
  `;
  document.head.appendChild(style);
}

function apiBase() {
  const o = window.location?.origin;
  if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
  return o;
}

export function mount(el, context) {
  injectStyles();
  const state = {
    loading: false,
    error: '',
    days: [],
  };

  const root = document.createElement('div');
  root.className = 'weekly-shell';
  root.innerHTML = `
    <div class="weekly-header">
      <div>
        <div class="weekly-title">Weekly Schedule</div>
        <div class="weekly-status" data-status></div>
      </div>
      <div class="weekly-actions">
        <button class="weekly-btn" data-refresh>Refresh</button>
      </div>
    </div>
    <div class="weekly-grid" data-grid></div>
  `;
  el.appendChild(root);

  const statusEl = root.querySelector('[data-status]');
  const gridEl = root.querySelector('[data-grid]');

  const setStatus = (msg, tone = 'muted') => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.dataset.tone = tone;
  };

  const render = () => {
    if (state.loading) {
      gridEl.innerHTML = '<div class="weekly-status">Loading...</div>';
      return;
    }
    if (state.error) {
      gridEl.innerHTML = `<div class="weekly-status" data-tone="error">${escapeHtml(state.error)}</div>`;
      return;
    }
    if (!state.days.length) {
      gridEl.innerHTML = '<div class="weekly-status">No data.</div>';
      return;
    }
    gridEl.innerHTML = state.days.map(day => {
      const blocks = Array.isArray(day.blocks) ? day.blocks : [];
      const rows = blocks.map(b => `
        <div class="weekly-block">
          <div class="weekly-block-time">${escapeHtml(b.start || '')} - ${escapeHtml(b.end || '')}</div>
          <div class="weekly-block-text">${escapeHtml(b.text || '')}</div>
          <div class="weekly-block-meta">
            ${b.type ? `<span>${escapeHtml(b.type)}</span>` : ''}
            ${b.is_parallel ? `<span>parallel</span>` : ''}
          </div>
        </div>
      `).join('');
      return `
        <div class="weekly-day">
          <h3>
            <span>${escapeHtml(day.label || '')}</span>
            <small>${escapeHtml(day.date || '')}</small>
          </h3>
          ${rows || '<div class="weekly-status">No blocks</div>'}
        </div>
      `;
    }).join('');
  };

  const load = async () => {
    state.loading = true;
    state.error = '';
    render();
    try {
      const resp = await fetch(`${apiBase()}/api/week?days=7`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
      state.days = Array.isArray(data.days) ? data.days : [];
      setStatus(`Showing ${state.days.length} day(s)`);
    } catch (err) {
      console.error('[Weekly View] load failed', err);
      state.error = err?.message || 'Failed to load week';
      setStatus(state.error, 'error');
    } finally {
      state.loading = false;
      render();
    }
  };

  root.querySelector('[data-refresh]')?.addEventListener('click', () => load());
  load();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return ch;
    }
  });
}
