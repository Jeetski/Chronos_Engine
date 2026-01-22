const STYLE_ID = 'chronos-weekly-view-style';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .weekly-shell { display:flex; flex-direction:column; gap:12px; height:100%; color:var(--chronos-text); }
    .weekly-header { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-shrink:0; }
    .weekly-title { font-size:18px; font-weight:700; margin:0; }
    .weekly-actions { display:flex; gap:8px; align-items:center; }
    .weekly-btn { border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.05); color:var(--chronos-text); border-radius:8px; padding:6px 10px; cursor:pointer; }
    .weekly-grid { flex:1; overflow:auto; display:flex; gap:12px; align-items:stretch; padding-bottom:12px; }
    .weekly-day { 
      flex: 0 0 300px;
      width: 300px;
      min-width: 200px; 
      border:1px solid rgba(255,255,255,0.08); 
      background:rgba(255,255,255,0.03); 
      border-radius:12px; 
      display:flex; 
      flex-direction:column; 
      overflow:hidden;
      position: relative; /* Context for resizer */
    }
    .weekly-resizer {
      position: absolute;
      top: 0; bottom: 0; right: 0;
      width: 6px;
      cursor: col-resize;
      z-index: 10;
    }
    .weekly-resizer:hover { background: rgba(255,255,255,0.1); }

    .weekly-day-header {
      padding: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      background: rgba(255,255,255,0.02);
    }
    .weekly-day-header h3 { margin:0; font-size:15px; font-weight:700; display:flex; justify-content:space-between; align-items:baseline; }
    .weekly-day-header small { font-size: 13px; font-weight:400; color:var(--chronos-text-muted); }
    
    .weekly-tree { flex:1; overflow-y:auto; overflow-x:hidden; padding: 0; }
    
    /* Calendar-style Tree Rows */
    .weekly-row {
      display: grid;
      grid-template-columns: 85px 1fr;
      gap: 8px;
      padding: 6px 10px;
      align-items: flex-start;
      border-bottom: 1px solid rgba(255,255,255,0.02);
    }
    .weekly-row:hover { background: rgba(255,255,255,0.02); }
    
    .weekly-time {
      font-family: "IBM Plex Mono", "Cascadia Code", monospace;
      color: var(--chronos-text-muted);
      font-size: 12px;
      display: flex;
      flex-direction: column;
      line-height: 1.3;
      margin-top: 2px;
    }
    .weekly-time span:first-child { font-weight: 600; color: var(--chronos-text-soft, #a5b1d5); }
    
    .weekly-node { display: flex; flex-direction: column; gap: 2px; }
    .weekly-node-main { display: flex; align-items: flex-start; gap: 6px; }
    
    .weekly-toggle {
      width: 18px; height: 18px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.05);
      color: var(--chronos-text-muted);
      font-size: 10px; cursor: pointer;
      flex-shrink: 0; margin-top: 2px;
    }
    .weekly-toggle:hover { background: rgba(255,255,255,0.1); color: var(--chronos-text); }
    
    .weekly-content { flex: 1; min-width: 0; }
    .weekly-text { font-size: 13px; font-weight: 500; color: var(--chronos-text); line-height: 1.3; }
    .weekly-type { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--chronos-text-muted); margin-top: 1px; }
    
    .weekly-children { border-left: 1px solid rgba(255,255,255,0.1); margin-left: 9px; padding-left: 8px; margin-top: 4px; display: none; }
    .weekly-children.expanded { display: block; }

    .weekly-empty { padding: 20px; text-align: center; color: var(--chronos-text-muted); font-size: 13px; font-style: italic; }
    .weekly-status { color: var(--chronos-text-muted); font-size: 13px; }
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

  // Helper: Expand vars
  function expandText(s) {
    try {
      return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s || '')) : String(s || '');
    } catch { return String(s || ''); }
  }

  // Helper: Time util
  function minToHM(min) {
    if (min == null) return '';
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  // Tree Logic
  function buildTree(blocks) {
    const root = [];
    const stack = [];
    (blocks || []).forEach(block => {
      // Logic from Calendar view to nest based on 'depth'
      const node = { ...block, children: [] };
      const depth = Number(block.depth) || 0;

      while (stack.length > depth) stack.pop();

      if (stack.length === 0) {
        root.push(node);
      } else {
        stack[stack.length - 1].children.push(node);
      }
      stack[depth] = node;
    });
    return root;
  }

  function renderTreeNodes(container, nodes) {
    if (!nodes.length) return;

    nodes.forEach(node => {
      const row = document.createElement('div');
      row.className = 'weekly-row';

      // Time Column (Start - End)
      const timeCol = document.createElement('div');
      timeCol.className = 'weekly-time';
      const startStr = node.start != null ? minToHM(node.start) : '';
      const endStr = node.end != null ? minToHM(node.end) : '';
      if (startStr) timeCol.innerHTML = `<span>${startStr}</span><span>${endStr}</span>`;

      // Content Column
      const nodeCol = document.createElement('div');
      nodeCol.className = 'weekly-node';

      const main = document.createElement('div');
      main.className = 'weekly-node-main';

      const hasChildren = node.children && node.children.length > 0;

      if (hasChildren) {
        const toggle = document.createElement('div');
        toggle.className = 'weekly-toggle';
        toggle.textContent = '>'; // Default collapsed? Or maybe expanded by default?
        // Let's default to expanded for week view to see content easily, or matching calendar logic
        // We'll mimic collapsed by default for deep trees, but maybe depth 0 open?
        // Let's make them clickable.

        main.appendChild(toggle);

        // Children interaction
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const childrenContainer = nodeCol.querySelector('.weekly-children');
          const isExpanded = childrenContainer.classList.contains('expanded');
          if (isExpanded) {
            childrenContainer.classList.remove('expanded');
            toggle.textContent = '>';
          } else {
            childrenContainer.classList.add('expanded');
            toggle.textContent = 'v';
          }
        });



      } else {
        // Spacer for alignment if needed, or just let text flow
      }

      const content = document.createElement('div');
      content.className = 'weekly-content';

      const textDiv = document.createElement('div');
      textDiv.className = 'weekly-text';
      textDiv.textContent = expandText(node.text || 'Untitled');

      const typeDiv = document.createElement('div');
      typeDiv.className = 'weekly-type';
      typeDiv.textContent = node.type || 'Item';

      content.appendChild(textDiv);
      content.appendChild(typeDiv);
      main.appendChild(content);
      nodeCol.appendChild(main);

      // Render Children Container
      if (hasChildren) {
        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'weekly-children'; // Hidden by default unless class 'expanded' added
        renderTreeNodes(childrenDiv, node.children);
        nodeCol.appendChild(childrenDiv);
      }

      row.appendChild(timeCol);
      row.appendChild(nodeCol);

      container.appendChild(row);
    });
  }

  const render = () => {
    gridEl.innerHTML = '';

    if (state.loading) {
      gridEl.innerHTML = '<div class="weekly-status" style="margin:20px;">Loading schedule...</div>';
      return;
    }
    if (state.error) {
      gridEl.innerHTML = `<div class="weekly-status" data-tone="error" style="margin:20px;">${escapeHtml(state.error)}</div>`;
      return;
    }
    if (!state.days.length) {
      gridEl.innerHTML = '<div class="weekly-status" style="margin:20px;">No schedule data available.</div>';
      return;
    }

    state.days.forEach(day => {
      const dayCol = document.createElement('div');
      dayCol.className = 'weekly-day';

      // Header
      const head = document.createElement('div');
      head.className = 'weekly-day-header';
      head.innerHTML = `
        <h3>
          ${escapeHtml(day.label || '')}
          <small>${escapeHtml(day.date || '')}</small>
        </h3>
      `;
      dayCol.appendChild(head);

      // Tree Container
      const treeContainer = document.createElement('div');
      treeContainer.className = 'weekly-tree';

      const blocks = normalizeScheduleBlocks(Array.isArray(day.blocks) ? day.blocks : []);
      if (blocks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'weekly-empty';
        empty.textContent = 'No routines.';
        treeContainer.appendChild(empty);
      } else {
        const treeRoots = buildTree(blocks);
        renderTreeNodes(treeContainer, treeRoots);
      }

      dayCol.appendChild(treeContainer);

      // Resizer
      const resizer = document.createElement('div');
      resizer.className = 'weekly-resizer';
      dayCol.appendChild(resizer);

      // Resize Logic
      resizer.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const startX = ev.clientX;
        const startW = dayCol.getBoundingClientRect().width;

        const onMove = (e) => {
          const dx = e.clientX - startX;
          const newW = Math.max(200, startW + dx);
          dayCol.style.width = `${newW}px`;
          dayCol.style.flexBasis = `${newW}px`;
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });

      gridEl.appendChild(dayCol);
    });
  };

  // Logic Helpers
  function extractTimeParts(value) {
    if (!value) return null;
    const match = String(value).match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours == null || minutes == null) return null;
    return hours * 60 + minutes;
  }

  function normalizeScheduleBlocks(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((block, idx) => {
      const startMinutes = extractTimeParts(block.start ?? block.start_time);
      const endMinutes = extractTimeParts(block.end ?? block.end_time);
      return {
        id: `block-${idx}`,
        text: String(block.text || block.name || `Block ${idx + 1}`),
        type: String(block.type || block.item_type || ''),
        start: startMinutes,
        end: endMinutes,
        depth: Number(block.depth || 0),
        is_parallel: !!block.is_parallel
      };
    });
  }

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

  // Initial load
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
