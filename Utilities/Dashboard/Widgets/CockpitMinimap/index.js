const STYLE_ID = 'cockpit-minimap-widget-style';

function injectStyles(){
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .cockpit-minimap-widget .content {
      padding: 10px;
    }
    .cockpit-mini-shell {
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: 100%;
    }
    .cockpit-mini-track {
      position: relative;
      flex: 1;
      background: rgba(5,8,14,0.75);
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.08);
      overflow: hidden;
      cursor: grab;
      min-height: 120px;
    }
    .cockpit-mini-track:active {
      cursor: grabbing;
    }
    .cockpit-mini-panel {
      position: absolute;
      border-radius: 4px;
      background: rgba(122,162,247,0.45);
      border: 1px solid rgba(122,162,247,0.8);
      box-shadow: 0 0 0 1px rgba(12,16,24,0.4);
      pointer-events: none;
      min-width: 3px;
      min-height: 3px;
    }
    .cockpit-mini-viewport {
      position: absolute;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.75);
      background: rgba(255,255,255,0.08);
      box-shadow: 0 0 0 1px rgba(5,8,16,0.6);
      pointer-events: none;
      min-width: 6px;
      min-height: 6px;
    }
    .cockpit-mini-hint {
      font-size: 12px;
      color: var(--text-dim);
      text-align: center;
      padding: 6px 8px;
      border-radius: 10px;
      border: 1px dashed rgba(255,255,255,0.08);
      background: rgba(9,12,18,0.6);
    }
  `;
  document.head.appendChild(style);
}

function clamp(v, min, max){
  return Math.max(min, Math.min(max, v));
}

export function mount(el, context){
  injectStyles();
  el.classList.add('cockpit-minimap-widget');
  try {
    el.dataset.minWidth = '220';
    el.dataset.minHeight = '180';
  } catch {}
  if (!el.style.width) el.style.width = '240px';
  if (!el.style.height) el.style.height = '220px';

  el.innerHTML = `
    <div class="header">
      <div class="title">Cockpit Minimap</div>
      <div class="controls">
        <button class="icon-btn" data-action="collapse" title="Collapse">_</button>
      </div>
    </div>
    <div class="content">
      <div class="cockpit-mini-shell">
        <div class="cockpit-mini-track" data-track data-no-drag="true"></div>
        <div class="cockpit-mini-hint" data-hint>Open the Cockpit view to use the minimap.</div>
      </div>
    </div>
  `;

  const track = el.querySelector('[data-track]');
  const hint = el.querySelector('[data-hint]');
  const collapseBtn = el.querySelector('[data-action="collapse"]');
  const viewportEl = document.createElement('div');
  viewportEl.className = 'cockpit-mini-viewport';
  viewportEl.setAttribute('data-no-drag', 'true');
  track?.appendChild(viewportEl);

  const panelEls = new Map();
  let mapState = null;
  let tickHandle = null;
  let openViews = [];

  function isCockpitActive(){
    if (openViews.length) return openViews.includes('Cockpit');
    return window.__currentView === 'Cockpit';
  }

  function getLayout(){
    return window.CockpitPanels?.getLayout?.() || null;
  }

  function setHint(text){
    if (!hint) return;
    hint.textContent = text || '';
    hint.style.display = text ? '' : 'none';
  }

  function clearPanels(){
    panelEls.forEach(el => {
      try { el.remove(); } catch {}
    });
    panelEls.clear();
  }

  function render(){
    if (!track) return;
    const layout = getLayout();
    if (!layout || !layout.viewport || !layout.viewport.width || !layout.viewport.height){
      setHint('Open the Cockpit view to use the minimap.');
      clearPanels();
      if (viewportEl) viewportEl.style.display = 'none';
      return;
    }
    setHint('');

    const trackRect = track.getBoundingClientRect();
    const trackW = trackRect.width || 1;
    const trackH = trackRect.height || 1;
    const zoom = layout.view?.zoom || 1;
    const viewWorld = {
      x: -layout.view.panX / zoom,
      y: -layout.view.panY / zoom,
      width: layout.viewport.width / zoom,
      height: layout.viewport.height / zoom,
    };

    let minX = viewWorld.x;
    let minY = viewWorld.y;
    let maxX = viewWorld.x + viewWorld.width;
    let maxY = viewWorld.y + viewWorld.height;

    (layout.panels || []).forEach(panel => {
      if (!panel.visible) return;
      minX = Math.min(minX, panel.x);
      minY = Math.min(minY, panel.y);
      maxX = Math.max(maxX, panel.x + panel.width);
      maxY = Math.max(maxY, panel.y + panel.height);
    });

    const pad = Math.max(80, Math.min(220, Math.max(viewWorld.width, viewWorld.height) * 0.2));
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;

    const worldW = Math.max(1, maxX - minX);
    const worldH = Math.max(1, maxY - minY);
    const scale = Math.min(trackW / worldW, trackH / worldH);
    const offsetX = (trackW - worldW * scale) / 2;
    const offsetY = (trackH - worldH * scale) / 2;

    mapState = { minX, minY, scale, offsetX, offsetY };

    const activeIds = new Set();
    (layout.panels || []).forEach(panel => {
      if (!panel.visible) return;
      activeIds.add(panel.id);
      let panelEl = panelEls.get(panel.id);
      if (!panelEl){
        panelEl = document.createElement('div');
        panelEl.className = 'cockpit-mini-panel';
        panelEl.title = panel.label || panel.id;
        panelEl.setAttribute('data-no-drag', 'true');
        track.appendChild(panelEl);
        panelEls.set(panel.id, panelEl);
      }
      const left = (panel.x - minX) * scale + offsetX;
      const top = (panel.y - minY) * scale + offsetY;
      const width = Math.max(3, panel.width * scale);
      const height = Math.max(3, panel.height * scale);
      panelEl.style.left = `${left}px`;
      panelEl.style.top = `${top}px`;
      panelEl.style.width = `${width}px`;
      panelEl.style.height = `${height}px`;
    });

    panelEls.forEach((panelEl, id) => {
      if (!activeIds.has(id)){
        try { panelEl.remove(); } catch {}
        panelEls.delete(id);
      }
    });

    if (viewportEl){
      const vLeft = (viewWorld.x - minX) * scale + offsetX;
      const vTop = (viewWorld.y - minY) * scale + offsetY;
      const vWidth = Math.max(6, viewWorld.width * scale);
      const vHeight = Math.max(6, viewWorld.height * scale);
      viewportEl.style.display = '';
      viewportEl.style.left = `${vLeft}px`;
      viewportEl.style.top = `${vTop}px`;
      viewportEl.style.width = `${vWidth}px`;
      viewportEl.style.height = `${vHeight}px`;
    }
  }

  function panToPoint(clientX, clientY){
    if (!mapState || !track) return;
    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const worldX = ((x - mapState.offsetX) / mapState.scale) + mapState.minX;
    const worldY = ((y - mapState.offsetY) / mapState.scale) + mapState.minY;
    if (window.CockpitPanels?.panToWorld){
      window.CockpitPanels.panToWorld(worldX, worldY);
      render();
      return;
    }
    const layout = getLayout();
    if (!layout || !layout.viewport) return;
    const zoom = layout.view?.zoom || 1;
    const panX = layout.viewport.width / 2 - worldX * zoom;
    const panY = layout.viewport.height / 2 - worldY * zoom;
    if (window.CockpitPanels?.setPan){
      window.CockpitPanels.setPan(panX, panY);
      render();
    }
  }

  track?.addEventListener('pointerdown', (ev)=>{
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    panToPoint(ev.clientX, ev.clientY);
    function move(e){ panToPoint(e.clientX, e.clientY); }
    function up(){
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  function tick(){
    const active = isCockpitActive();
    if (!active){
      if (el.style.display !== 'none') el.style.display = 'none';
      return;
    }
    if (el.style.display === 'none') el.style.display = '';
    render();
  }

  function startLoop(){
    if (tickHandle) return;
    tickHandle = window.setInterval(tick, 140);
  }

  function stopLoop(){
    if (!tickHandle) return;
    window.clearInterval(tickHandle);
    tickHandle = null;
  }

  function onViewChanged(payload){
    if (payload && Array.isArray(payload.open)) openViews = payload.open.slice();
    tick();
    if (isCockpitActive()) startLoop();
    else stopLoop();
  }

  collapseBtn?.addEventListener('click', ()=> el.classList.toggle('minimized'));

  try { context?.bus?.on('view:changed', onViewChanged); } catch {}
  try { window?.ChronosBus?.on?.('view:changed', onViewChanged); } catch {}
  document.addEventListener('chronos:cockpit-panels', tick);

  onViewChanged();

  try { window.ChronosCockpitMinimap = { element: el, render: tick }; } catch {}

  return {
    refresh: tick,
  };
}
