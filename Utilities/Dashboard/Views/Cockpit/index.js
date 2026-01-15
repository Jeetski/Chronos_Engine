
const STYLE_ID = 'cockpit-blank-style';
const STORAGE_KEY = 'chronos_cockpit_panels_v1';
const VIEW_DEFAULT = {
  panX: 0,
  panY: 0,
  zoom: 1,
  snap: true,
  minimap: true,
};
const ZOOM_LIMITS = { min: 0.6, max: 1.8 };
const GRID_SIZE = 12;

function clamp(v, min, max){
  return Math.max(min, Math.min(max, v));
}

function isInteractiveTarget(target){
  if (!target) return false;
  const selector = [
    'input',
    'textarea',
    'select',
    'button',
    'a',
    'label',
    '[contenteditable="true"]',
    '[data-no-drag]',
    '.no-drag',
    '.cockpit-panel-actions',
    '.cockpit-panel-help-btn',
    '.cockpit-panel-resizer',
    '.cockpit-panel-menu',
  ].join(',');
  return !!target.closest(selector);
}

function injectStyles(){
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .cockpit-blank {
      position: relative;
      width: 100%;
      height: 100%;
      border: 1px solid rgba(34,40,53,0.9);
      border-radius: 18px;
      overflow: hidden;
      background: radial-gradient(circle at 20% 20%, rgba(14,18,28,0.92), rgba(8,10,16,0.98));
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02), 0 18px 60px rgba(0,0,0,0.45);
      touch-action: none;
    }
    .cockpit-grid {
      position: absolute;
      inset: 0;
      background-color: #0c111a;
      background-image:
        radial-gradient(circle at center, rgba(120,150,220,0.8) 2px, transparent 0),
        radial-gradient(circle at center, rgba(120,150,220,0.45) 2px, transparent 0);
      background-size: 60px 60px, 12px 12px;
      background-position: 0 0, 0 0;
      opacity: 0.9;
      pointer-events: none;
      will-change: background-position, background-size;
    }
    .cockpit-panels {
      position: absolute;
      inset: 0;
      padding: 18px;
      transform-origin: 0 0;
      will-change: transform;
    }
    .cockpit-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 12px;
      color: #e6e8ef;
      padding: 20px;
      pointer-events: auto;
      transition: opacity 0.2s ease, transform 0.2s ease;
      backdrop-filter: blur(2px);
    }
    .cockpit-overlay.hidden {
      opacity: 0;
      transform: translateY(8px);
      pointer-events: none;
    }
    .cockpit-title {
      font-size: 28px;
      letter-spacing: 0.6px;
      font-weight: 700;
    }
    .cockpit-subtitle {
      font-size: 16px;
      color: #9aa3b8;
      max-width: 420px;
      line-height: 1.5;
    }
    .cockpit-hint {
      font-size: 13px;
      color: rgba(154,163,184,0.8);
    }
    .cockpit-panel {
      position: absolute;
      background: rgba(15,18,30,0.95);
      border: 1px solid rgba(60,70,96,0.9);
      border-radius: 20px;
      box-shadow: 0 18px 50px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.03);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      pointer-events: auto;
      user-select: none;
    }
    .cockpit-panel.pulse {
      animation: cockpitPulse 900ms ease;
    }
    @keyframes cockpitPulse {
      0% { box-shadow: 0 0 0 0 rgba(122,162,247,0.0), 0 18px 50px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.03); }
      25% { box-shadow: 0 0 0 3px rgba(122,162,247,0.35), 0 18px 50px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.03); }
      70% { box-shadow: 0 0 0 2px rgba(122,162,247,0.2), 0 18px 50px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.03); }
      100% { box-shadow: 0 18px 50px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.03); }
    }
    .cockpit-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
      padding: 12px 18px 10px;
      color: #f4f5fb;
      cursor: grab;
      background: linear-gradient(135deg, rgba(32,38,58,0.95), rgba(18,22,32,0.95));
      border-bottom: 1px solid rgba(255,255,255,0.05);
      user-select: none;
    }
    .cockpit-panel-header:active {
      cursor: grabbing;
    }
    .cockpit-panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      letter-spacing: 0.02em;
    }
    .cockpit-panel-actions {
      display: flex;
      gap: 6px;
    }
    .cockpit-panel-actions button {
      background: rgba(255,255,255,0.08);
      border: none;
      border-radius: 6px;
      color: #d5dbf1;
      width: 28px;
      height: 28px;
      cursor: pointer;
      font-size: 13px;
    }
    .cockpit-panel-actions button:hover {
      background: rgba(255,255,255,0.15);
    }
    .cockpit-panel-help-btn {
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
    }
    .cockpit-panel-content {
      flex: 1;
      padding: 16px 18px 18px;
      overflow: auto;
      background: rgba(6,8,14,0.9);
      user-select: text;
    }
    .cockpit-panel-empty-prompt {
      font-size: 13px;
      color: #9aa3b8;
      text-align: center;
      margin-top: 40px;
    }
    .cockpit-panel-resizer {
      position: absolute;
      border: 1px solid rgba(255,255,255,0.35);
      background: rgba(255,255,255,0.08);
      border-radius: 4px;
      opacity: 0.85;
    }
    .cockpit-panel-resizer:hover {
      background: rgba(255,255,255,0.16);
    }
    .cockpit-panel-resizer.se {
      width: 16px;
      height: 16px;
      right: 8px;
      bottom: 8px;
      cursor: nwse-resize;
    }
    .cockpit-panel-resizer.se::after {
      content: '';
      position: absolute;
      right: 3px;
      bottom: 3px;
      width: 8px;
      height: 8px;
      border-right: 2px solid rgba(255,255,255,0.6);
      border-bottom: 2px solid rgba(255,255,255,0.6);
    }
    .cockpit-panel-resizer.e {
      width: 8px;
      right: 0;
      top: 12px;
      bottom: 12px;
      cursor: ew-resize;
    }
    .cockpit-panel-resizer.s {
      height: 8px;
      left: 12px;
      right: 12px;
      bottom: 0;
      cursor: ns-resize;
    }
    .cockpit-controls {
      position: absolute;
      right: 16px;
      bottom: 16px;
      display: flex;
      gap: 10px;
      align-items: center;
      background: rgba(9,12,20,0.9);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 999px;
      padding: 6px 12px;
      color: #dbe3ff;
      pointer-events: auto;
      box-shadow: 0 6px 20px rgba(0,0,0,0.45);
      z-index: 30;
    }
    .cockpit-zoom-controls {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .cockpit-zoom-btn,
    .cockpit-reset-btn,
    .cockpit-fit-btn,
    .cockpit-snap-btn,
    .cockpit-minimap-btn {
      width: 30px;
      height: 30px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.08);
      color: #f8fbff;
      cursor: pointer;
      font-weight: 600;
    }
    .cockpit-zoom-btn:hover,
    .cockpit-reset-btn:hover,
    .cockpit-fit-btn:hover,
    .cockpit-snap-btn:hover,
    .cockpit-minimap-btn:hover {
      border-color: rgba(255,255,255,0.35);
      background: rgba(255,255,255,0.15);
    }
    .cockpit-zoom-label {
      min-width: 48px;
      text-align: center;
      font-variant-numeric: tabular-nums;
      font-size: 13px;
    }
    .cockpit-toolbar {
      position: absolute;
      left: 16px;
      top: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(9,12,20,0.9);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 8px 10px;
      color: #dbe3ff;
      pointer-events: auto;
      box-shadow: 0 6px 20px rgba(0,0,0,0.45);
      z-index: 30;
    }
    .cockpit-toolbar-title {
      font-size: 11px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(160,170,196,0.9);
      padding: 0 2px;
    }
    .cockpit-panel-launcher {
      position: relative;
    }
    .cockpit-panel-launcher button {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      color: #f3f6ff;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.03em;
    }
    .cockpit-panel-launcher button:hover {
      background: rgba(255,255,255,0.14);
    }
    .cockpit-panel-menu {
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      width: 240px;
      background: rgba(10,14,24,0.96);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      box-shadow: 0 14px 26px rgba(0,0,0,0.5);
      padding: 10px;
      display: none;
      z-index: 50;
    }
    .cockpit-panel-menu.visible {
      display: block;
    }
    .cockpit-panel-menu input {
      width: 100%;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(6,8,16,0.9);
      color: #dfe6ff;
      font-size: 12px;
      margin-bottom: 8px;
    }
    .cockpit-panel-menu-list {
      max-height: 220px;
      overflow: auto;
      display: grid;
      gap: 6px;
      padding-right: 4px;
    }
    .cockpit-panel-menu-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 8px;
      background: rgba(255,255,255,0.04);
      color: #dbe3ff;
      cursor: pointer;
      font-size: 12px;
    }
    .cockpit-panel-menu-item:hover {
      background: rgba(255,255,255,0.1);
    }
    .cockpit-panel-menu-item span {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cockpit-panel-menu-item em {
      font-style: normal;
      font-size: 11px;
      color: rgba(170,182,208,0.8);
    }
    .cockpit-minimap {
      position: fixed;
      left: 16px;
      bottom: 16px;
      width: 220px;
      height: 170px;
      background: rgba(9,12,20,0.92);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      color: #dbe3ff;
      pointer-events: auto;
      box-shadow: 0 10px 24px rgba(0,0,0,0.55);
      z-index: 40;
      opacity: 1;
      visibility: visible;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .cockpit-minimap.hidden {
      opacity: 0;
      transform: translateY(10px);
      pointer-events: none;
    }
    .cockpit-minimap-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(160,170,196,0.9);
      cursor: move;
      user-select: none;
    }
    .cockpit-minimap-body {
      flex: 1;
      padding: 10px;
      display: flex;
      flex-direction: column;
    }
    .cockpit-minimap-track {
      position: relative;
      flex: 1;
      background: rgba(4,6,12,0.75);
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.05);
      overflow: hidden;
      cursor: grab;
    }
    .cockpit-minimap-track:active {
      cursor: grabbing;
    }
    .cockpit-minimap-panel {
      position: absolute;
      border-radius: 4px;
      background: rgba(122,162,247,0.45);
      border: 1px solid rgba(122,162,247,0.7);
      box-shadow: 0 0 0 1px rgba(15,20,32,0.4);
      pointer-events: none;
      min-width: 3px;
      min-height: 3px;
    }
    .cockpit-minimap-viewport {
      position: absolute;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.75);
      background: rgba(255,255,255,0.08);
      box-shadow: 0 0 0 1px rgba(5,8,16,0.6);
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}
class CockpitPanelManager {
  constructor(rootEl, context, options = {}){
    this.root = rootEl;
    this.context = context || {};
    this.surface = rootEl.querySelector('.cockpit-panels');
    this.grid = rootEl.querySelector('.cockpit-grid');
    this.overlay = rootEl.querySelector('.cockpit-overlay');
    this.controls = rootEl.querySelector('.cockpit-controls');
    this.toolbar = rootEl.querySelector('.cockpit-toolbar');
    this.zoomLabel = rootEl.querySelector('[data-zoom-label]');
    this.zoomInBtn = rootEl.querySelector('[data-zoom-in]');
    this.zoomOutBtn = rootEl.querySelector('[data-zoom-out]');
    this.resetBtn = rootEl.querySelector('[data-reset-view]');
    this.fitBtn = rootEl.querySelector('[data-fit-view]');
    this.snapBtn = rootEl.querySelector('[data-snap-toggle]');
    this.minimapBtn = rootEl.querySelector('[data-minimap-toggle]');
    this.panelMenuBtn = rootEl.querySelector('[data-panel-menu-toggle]');
    this.panelMenu = rootEl.querySelector('[data-panel-menu]');
    this.panelMenuSearch = rootEl.querySelector('[data-panel-menu-search]');
    this.panelMenuList = rootEl.querySelector('[data-panel-menu-list]');
    const minimapWrap = options.minimapWrap || rootEl.querySelector('[data-minimap]');
    this.minimap = {
      wrap: minimapWrap,
      track: minimapWrap?.querySelector('[data-minimap-track]'),
      viewport: minimapWrap?.querySelector('[data-minimap-viewport]'),
      state: null,
      raf: null,
    };
    this.entries = new Map();
    this.zIndex = 10;
    this.cleanups = [];
    this.persistHandle = null;
    this.state = this._loadState();
    this.view = this._loadView();
    this._applyViewTransform();
    this._bindViewportControls();
    this._bindToolbarControls();
    this._bindMinimap();
    this._scheduleMinimapUpdate();
    this._updateOverlay();
    this.api = {
      list: () => this.list(),
      toggle: (id) => this.toggle(id),
      setVisible: (id, visible) => this.setVisible(id, visible),
      showAll: () => this.showAll(),
      hideAll: () => this.hideAll(),
      remove: (id) => this.remove(id),
      getLayout: () => this.getLayout(),
      panToWorld: (x, y) => this.panToWorld(x, y),
      setPan: (x, y) => this.setPan(x, y),
      register: (def) => this.registerPanel(def),
      fit: () => this.fitToContent(),
    };
  }

  _loadState(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  _loadView(){
    const base = { ...VIEW_DEFAULT };
    const stored = this.state?._view;
    if (stored && typeof stored === 'object'){
      if (typeof stored.panX === 'number') base.panX = stored.panX;
      if (typeof stored.panY === 'number') base.panY = stored.panY;
      if (typeof stored.zoom === 'number') base.zoom = clamp(stored.zoom, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
      if (typeof stored.snap === 'boolean') base.snap = stored.snap;
      if (typeof stored.minimap === 'boolean') base.minimap = stored.minimap;
    }
    return base;
  }

  _persist(){
    if (this.persistHandle){
      window.clearTimeout(this.persistHandle);
      this.persistHandle = null;
    }
    const payload = {
      _view: {
        panX: this.view.panX,
        panY: this.view.panY,
        zoom: this.view.zoom,
        snap: this.view.snap,
        minimap: this.view.minimap,
      }
    };
    this.entries.forEach(entry => {
      payload[entry.id] = {
        visible: !!entry.visible,
        x: entry.position.x,
        y: entry.position.y,
        width: entry.size.width,
        height: entry.size.height,
      };
    });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
    this.state = payload;
  }

  _notify(){
    try { document.dispatchEvent(new CustomEvent('chronos:cockpit-panels')); } catch {}
  }

  _applyViewTransform(){
    if (this.surface){
      const { panX, panY, zoom } = this.view;
      this.surface.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    }
    if (this.grid){
      const { panX, panY, zoom } = this.view;
      const coarse = 60 * zoom;
      const fine = 12 * zoom;
      this.grid.style.backgroundSize = `${coarse}px ${coarse}px, ${fine}px ${fine}px`;
      this.grid.style.backgroundPosition = `${panX}px ${panY}px, ${panX}px ${panY}px`;
    }
    if (this.minimap?.wrap){
      this.minimap.wrap.classList.toggle('hidden', !this.view.minimap);
    }
    this._updateZoomLabel();
    this._scheduleMinimapUpdate();
  }

  _updateZoomLabel(){
    if (!this.zoomLabel) return;
    const pct = Math.round((this.view.zoom || 1) * 100);
    this.zoomLabel.textContent = `${pct}%`;
  }

  _schedulePersist(){
    if (this.persistHandle) return;
    this.persistHandle = window.setTimeout(()=> {
      this.persistHandle = null;
      this._persist();
    }, 200);
  }

  _bindViewportControls(){
    if (!this.root) return;
    const handleWheel = (ev)=>{
      if (ev.ctrlKey){
        ev.preventDefault();
        const rect = this.root.getBoundingClientRect();
        const point = {
          x: ev.clientX - rect.left,
          y: ev.clientY - rect.top,
        };
        const delta = clamp(-ev.deltaY * 0.0015, -0.8, 0.8);
        this.zoomBy(delta, point);
      } else {
        ev.preventDefault();
        this.panBy(-ev.deltaX, -ev.deltaY);
      }
    };
    this.root.addEventListener('wheel', handleWheel, { passive: false });
    this.cleanups.push(()=> this.root.removeEventListener('wheel', handleWheel));

    const handlePanStart = (ev)=>{
      if (ev.button !== 0) return;
      if (ev.target.closest('.cockpit-panel')) return;
      if (ev.target.closest('.cockpit-controls')) return;
      if (ev.target.closest('.cockpit-toolbar')) return;
      if (ev.target.closest('.cockpit-minimap')) return;
      ev.preventDefault();
      const start = { x: ev.clientX, y: ev.clientY };
      const startPan = { x: this.view.panX, y: this.view.panY };
      const move = (e)=>{
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        this.setPan(startPan.x + dx, startPan.y + dy);
      };
      const up = ()=>{
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        this._persist();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    this.root.addEventListener('pointerdown', handlePanStart);
    this.cleanups.push(()=> this.root.removeEventListener('pointerdown', handlePanStart));
  }

  _bindToolbarControls(){
    if (!this.root) return;
    if (this.zoomInBtn){
      const zoomInHandler = ()=> this.setZoom(this.view.zoom + 0.15);
      this.zoomInBtn.addEventListener('click', zoomInHandler);
      this.cleanups.push(()=> this.zoomInBtn.removeEventListener('click', zoomInHandler));
    }
    if (this.zoomOutBtn){
      const zoomOutHandler = ()=> this.setZoom(this.view.zoom - 0.15);
      this.zoomOutBtn.addEventListener('click', zoomOutHandler);
      this.cleanups.push(()=> this.zoomOutBtn.removeEventListener('click', zoomOutHandler));
    }
    if (this.resetBtn){
      const resetHandler = ()=> this.resetView();
      this.resetBtn.addEventListener('click', resetHandler);
      this.cleanups.push(()=> this.resetBtn.removeEventListener('click', resetHandler));
    }
    if (this.fitBtn){
      const fitHandler = ()=> this.fitToContent();
      this.fitBtn.addEventListener('click', fitHandler);
      this.cleanups.push(()=> this.fitBtn.removeEventListener('click', fitHandler));
    }
    if (this.snapBtn){
      const snapHandler = ()=>{
        this.view.snap = !this.view.snap;
        this._updateSnapButton();
        this._persist();
      };
      this.snapBtn.addEventListener('click', snapHandler);
      this.cleanups.push(()=> this.snapBtn.removeEventListener('click', snapHandler));
      this._updateSnapButton();
    }
    if (this.minimapBtn){
      const minimapHandler = ()=>{
        this.view.minimap = !this.view.minimap;
        this._applyViewTransform();
        this._persist();
      };
      this.minimapBtn.addEventListener('click', minimapHandler);
      this.cleanups.push(()=> this.minimapBtn.removeEventListener('click', minimapHandler));
    }
    if (this.panelMenuBtn && this.panelMenu){
      const toggleMenu = (ev)=>{
        ev.stopPropagation();
        this.panelMenu.classList.toggle('visible');
        if (this.panelMenu.classList.contains('visible')){
          this._refreshPanelMenu();
          window.setTimeout(()=> this.panelMenuSearch?.focus(), 30);
        }
      };
      this.panelMenuBtn.addEventListener('click', toggleMenu);
      this.cleanups.push(()=> this.panelMenuBtn.removeEventListener('click', toggleMenu));
      const closeMenu = ()=>{
        this.panelMenu.classList.remove('visible');
      };
      window.addEventListener('click', closeMenu);
      this.cleanups.push(()=> window.removeEventListener('click', closeMenu));
      this.panelMenu.addEventListener('click', (ev)=> ev.stopPropagation());
      if (this.panelMenuSearch){
        const searchHandler = ()=> this._refreshPanelMenu();
        this.panelMenuSearch.addEventListener('input', searchHandler);
        this.cleanups.push(()=> this.panelMenuSearch.removeEventListener('input', searchHandler));
      }
    }
    if (this.overlay){
      this.overlay.addEventListener('click', ()=>{
        if (this.panelMenu){
          this.panelMenu.classList.add('visible');
          this._refreshPanelMenu();
        }
      });
    }
  }

  _updateSnapButton(){
    if (!this.snapBtn) return;
    this.snapBtn.style.background = this.view.snap
      ? 'rgba(122,162,247,0.3)'
      : 'rgba(255,255,255,0.08)';
    this.snapBtn.title = this.view.snap ? 'Snap on' : 'Snap off';
  }

  _bindMinimap(){
    if (!this.minimap?.track || !this.root) return;
    const track = this.minimap.track;
    const handleWheel = (ev)=>{
      ev.stopPropagation();
    };
    track.addEventListener('wheel', handleWheel, { passive: true });
    this.cleanups.push(()=> track.removeEventListener('wheel', handleWheel));

    const handlePointerDown = (ev)=>{
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      const rect = track.getBoundingClientRect();
      const start = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      this._panToMinimapPoint(start.x, start.y);
      const move = (e)=>{
        const rectMove = track.getBoundingClientRect();
        const x = e.clientX - rectMove.left;
        const y = e.clientY - rectMove.top;
        this._panToMinimapPoint(x, y);
      };
      const up = ()=>{
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        this._persist();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    track.addEventListener('pointerdown', handlePointerDown);
    this.cleanups.push(()=> track.removeEventListener('pointerdown', handlePointerDown));

    const handleResize = ()=> this._scheduleMinimapUpdate();
    window.addEventListener('resize', handleResize);
    this.cleanups.push(()=> window.removeEventListener('resize', handleResize));
  }

  _panToMinimapPoint(x, y){
    const map = this.minimap?.state;
    if (!map || !this.root) return;
    const worldX = ((x - map.offsetX) / map.scale) + map.minX;
    const worldY = ((y - map.offsetY) / map.scale) + map.minY;
    const zoom = this.view.zoom || 1;
    const rect = this.root.getBoundingClientRect();
    const panX = rect.width / 2 - worldX * zoom;
    const panY = rect.height / 2 - worldY * zoom;
    this.setPan(panX, panY);
  }

  _scheduleMinimapUpdate(){
    if (!this.minimap?.track) return;
    if (this.minimap.raf) return;
    this.minimap.raf = window.requestAnimationFrame(()=>{
      this.minimap.raf = null;
      this._updateMinimap();
    });
  }

  _updateMinimap(){
    if (!this.minimap?.track || !this.root) return;
    if (!this.view.minimap) return;
    const track = this.minimap.track;
    const rect = track.getBoundingClientRect();
    const trackW = rect.width || 1;
    const trackH = rect.height || 1;
    if (trackW <= 0 || trackH <= 0) return;

    const zoom = this.view.zoom || 1;
    const viewRect = this.root.getBoundingClientRect();
    const viewWorld = {
      x: -this.view.panX / zoom,
      y: -this.view.panY / zoom,
      width: viewRect.width / zoom,
      height: viewRect.height / zoom,
    };

    let minX = viewWorld.x;
    let minY = viewWorld.y;
    let maxX = viewWorld.x + viewWorld.width;
    let maxY = viewWorld.y + viewWorld.height;

    this.entries.forEach(entry => {
      if (!entry.visible) return;
      minX = Math.min(minX, entry.position.x);
      minY = Math.min(minY, entry.position.y);
      maxX = Math.max(maxX, entry.position.x + entry.size.width);
      maxY = Math.max(maxY, entry.position.y + entry.size.height);
    });

    const pad = Math.max(80, Math.min(240, Math.max(viewWorld.width, viewWorld.height) * 0.2));
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;

    const worldW = Math.max(1, maxX - minX);
    const worldH = Math.max(1, maxY - minY);
    const scale = Math.min(trackW / worldW, trackH / worldH);
    const offsetX = (trackW - worldW * scale) / 2;
    const offsetY = (trackH - worldH * scale) / 2;

    this.minimap.state = { minX, minY, scale, offsetX, offsetY, worldW, worldH };

    this.entries.forEach(entry => {
      if (!entry.visible){
        if (entry.miniEl){
          try { entry.miniEl.remove(); } catch {}
          entry.miniEl = null;
        }
        return;
      }
      if (!entry.miniEl){
        const el = document.createElement('div');
        el.className = 'cockpit-minimap-panel';
        el.title = entry.label || entry.id;
        track.appendChild(el);
        entry.miniEl = el;
      }
      const left = (entry.position.x - minX) * scale + offsetX;
      const top = (entry.position.y - minY) * scale + offsetY;
      const width = Math.max(3, entry.size.width * scale);
      const height = Math.max(3, entry.size.height * scale);
      entry.miniEl.style.left = `${left}px`;
      entry.miniEl.style.top = `${top}px`;
      entry.miniEl.style.width = `${width}px`;
      entry.miniEl.style.height = `${height}px`;
    });

    if (this.minimap.viewport){
      const vLeft = (viewWorld.x - minX) * scale + offsetX;
      const vTop = (viewWorld.y - minY) * scale + offsetY;
      const vWidth = Math.max(6, viewWorld.width * scale);
      const vHeight = Math.max(6, viewWorld.height * scale);
      this.minimap.viewport.style.left = `${vLeft}px`;
      this.minimap.viewport.style.top = `${vTop}px`;
      this.minimap.viewport.style.width = `${vWidth}px`;
      this.minimap.viewport.style.height = `${vHeight}px`;
    }
  }

  setPan(x, y){
    this.view.panX = x;
    this.view.panY = y;
    this._applyViewTransform();
    this._schedulePersist();
  }

  panBy(dx, dy){
    this.setPan(this.view.panX + dx, this.view.panY + dy);
  }

  setZoom(nextZoom, center){
    const prev = this.view.zoom || 1;
    const clamped = clamp(nextZoom, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
    const rect = this.root?.getBoundingClientRect();
    const anchor = center || (rect ? { x: rect.width / 2, y: rect.height / 2 } : { x: 0, y: 0 });
    const worldX = (anchor.x - this.view.panX) / prev;
    const worldY = (anchor.y - this.view.panY) / prev;
    this.view.zoom = clamped;
    this.view.panX = anchor.x - worldX * clamped;
    this.view.panY = anchor.y - worldY * clamped;
    this._applyViewTransform();
    this._schedulePersist();
  }

  zoomBy(delta, center){
    const factor = 1 + delta;
    this.setZoom(this.view.zoom * factor, center);
  }

  resetView(){
    this.view = { ...VIEW_DEFAULT };
    this._applyViewTransform();
    this._persist();
  }

  fitToContent(){
    if (!this.root) return;
    const panels = Array.from(this.entries.values()).filter(entry => entry.visible);
    if (!panels.length) return this.resetView();
    const bounds = panels.reduce((acc, entry)=>{
      acc.minX = Math.min(acc.minX, entry.position.x);
      acc.minY = Math.min(acc.minY, entry.position.y);
      acc.maxX = Math.max(acc.maxX, entry.position.x + entry.size.width);
      acc.maxY = Math.max(acc.maxY, entry.position.y + entry.size.height);
      return acc;
    }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const padding = 80;
    const worldW = Math.max(1, bounds.maxX - bounds.minX + padding * 2);
    const worldH = Math.max(1, bounds.maxY - bounds.minY + padding * 2);
    const rect = this.root.getBoundingClientRect();
    const scale = Math.min(rect.width / worldW, rect.height / worldH);
    const zoom = clamp(scale, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
    const centerX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
    const centerY = bounds.minY + (bounds.maxY - bounds.minY) / 2;
    this.view.zoom = zoom;
    this.view.panX = rect.width / 2 - centerX * zoom;
    this.view.panY = rect.height / 2 - centerY * zoom;
    this._applyViewTransform();
    this._persist();
  }

  _updateOverlay(){
    if (!this.overlay) return;
    const hasVisible = Array.from(this.entries.values()).some(entry => entry.visible);
    this.overlay.classList.toggle('hidden', hasVisible);
  }

  registerPanel(def){
    if (!def || !def.id || this.entries.has(def.id)) return;
    const entry = {
      id: def.id,
      label: def.label || def.id,
      icon: def.icon || '',
      helpKey: def.helpKey || def.menuKey || def.id,
      mount: def.mount,
      defaultVisible: !!def.defaultVisible,
      position: {
        x: def.defaultPosition?.x ?? 32,
        y: def.defaultPosition?.y ?? 32,
      },
      size: {
        width: def.size?.width ?? 360,
        height: def.size?.height ?? 360,
      },
      visible: !!def.defaultVisible,
      menuKey: def.menuKey || def.menuGroup || def.id,
      menuLabel: def.menuLabel || def.label || def.id,
      menuPrimary: !!def.menuPrimary,
      el: null,
      api: null,
    };
    const saved = this.state[entry.id];
    if (saved){
      if (typeof saved.x === 'number') entry.position.x = saved.x;
      if (typeof saved.y === 'number') entry.position.y = saved.y;
      if (typeof saved.width === 'number') entry.size.width = saved.width;
      if (typeof saved.height === 'number') entry.size.height = saved.height;
      if (typeof saved.visible === 'boolean') entry.visible = saved.visible;
    } else if (this.root){
      try {
        const rect = this.root.getBoundingClientRect();
        const zoom = this.view.zoom || 1;
        const vx = rect.width / 2 - (entry.size.width / 2);
        const vy = rect.height / 2 - (entry.size.height / 2);
        entry.position.x = (-this.view.panX / zoom) + vx;
        entry.position.y = (-this.view.panY / zoom) + vy;
      } catch {}
    }
    this.entries.set(entry.id, entry);
    if (entry.visible) this._mountEntry(entry);
    this._updateOverlay();
    this._notify();
    this._refreshPanelMenu();
    this._scheduleMinimapUpdate();
  }

  list(){
    return Array.from(this.entries.values()).map(entry => ({
      id: entry.id,
      label: entry.label,
      visible: !!entry.visible,
      menuKey: entry.menuKey || entry.id,
      menuLabel: entry.menuLabel || entry.label,
      menuPrimary: !!entry.menuPrimary,
    }));
  }

  getLayout(){
    const rect = this.root?.getBoundingClientRect?.();
    const viewport = {
      width: rect?.width || 0,
      height: rect?.height || 0,
    };
    const panels = Array.from(this.entries.values()).map(entry => ({
      id: entry.id,
      label: entry.label,
      visible: !!entry.visible,
      x: entry.position.x,
      y: entry.position.y,
      width: entry.size.width,
      height: entry.size.height,
    }));
    return {
      view: { ...this.view },
      viewport,
      panels,
    };
  }

  panToWorld(worldX, worldY){
    if (!this.root) return;
    const rect = this.root.getBoundingClientRect();
    if (!rect) return;
    const zoom = this.view.zoom || 1;
    const panX = rect.width / 2 - worldX * zoom;
    const panY = rect.height / 2 - worldY * zoom;
    this.setPan(panX, panY);
  }

  toggle(id){
    const entry = this.entries.get(id);
    if (!entry) return;
    this.setVisible(id, !entry.visible);
  }

  setVisible(id, visible){
    const entry = this.entries.get(id);
    if (!entry) return;
    if (visible){
      if (!entry.el) this._mountEntry(entry);
    } else {
      this._unmountEntry(entry);
    }
    entry.visible = !!visible;
    this._updateOverlay();
    this._persist();
    this._notify();
    this._refreshPanelMenu();
    this._scheduleMinimapUpdate();
  }

  showAll(){
    this.entries.forEach(entry => this.setVisible(entry.id, true));
  }

  hideAll(){
    this.entries.forEach(entry => this.setVisible(entry.id, false));
  }

  remove(id){
    const entry = this.entries.get(id);
    if (!entry) return;
    this._unmountEntry(entry);
    this.entries.delete(id);
    if (this.state && typeof this.state === 'object'){
      delete this.state[id];
    }
    this._persist();
    this._updateOverlay();
    this._notify();
    this._refreshPanelMenu();
    this._scheduleMinimapUpdate();
  }

  _focus(entry){
    if (!entry?.el) return;
    entry.el.style.zIndex = String(++this.zIndex);
    try {
      entry.el.classList.remove('pulse');
      void entry.el.offsetWidth;
      entry.el.classList.add('pulse');
      window.setTimeout(()=>{ try { entry.el.classList.remove('pulse'); } catch {} }, 900);
    } catch {}
  }

  _centerPanel(entry){
    if (!this.root || !entry) return;
    const zoom = this.view.zoom || 1;
    const rect = this.root.getBoundingClientRect();
    const targetX = rect.width / 2;
    const targetY = rect.height / 2;
    const panelCenterX = (entry.position.x + entry.size.width / 2) * zoom;
    const panelCenterY = (entry.position.y + entry.size.height / 2) * zoom;
    this.setPan(targetX - panelCenterX, targetY - panelCenterY);
  }
  _mountEntry(entry){
    if (!this.surface || entry.el) return;
    const wrapper = document.createElement('section');
    wrapper.className = 'cockpit-panel';
    wrapper.dataset.panel = entry.id;
    wrapper.style.width = `${entry.size.width}px`;
    wrapper.style.height = `${entry.size.height}px`;
    wrapper.style.left = `${entry.position.x}px`;
    wrapper.style.top = `${entry.position.y}px`;
    wrapper.style.zIndex = String(++this.zIndex);

    const header = document.createElement('header');
    header.className = 'cockpit-panel-header';
    const title = document.createElement('div');
    title.className = 'cockpit-panel-title';
    title.textContent = entry.label;
    const actions = document.createElement('div');
    actions.className = 'cockpit-panel-actions';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.title = 'Hide panel';
    closeBtn.textContent = 'x';
    const panelHelpKey = entry.helpKey || entry.menuKey || entry.id;
    const helpBtn = this.context?.createHelpButton?.(panelHelpKey, {
      className: 'cockpit-panel-help-btn',
      fallbackLabel: entry.label || entry.id,
    });
    if (helpBtn) actions.appendChild(helpBtn);
    actions.appendChild(closeBtn);
    header.append(title, actions);

    const body = document.createElement('div');
    body.className = 'cockpit-panel-content';

    wrapper.append(header, body);
    this.surface.appendChild(wrapper);
    entry.el = wrapper;
    entry.body = body;
    this._scheduleMinimapUpdate();

    closeBtn.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      this.setVisible(entry.id, false);
    });
    wrapper.addEventListener('pointerdown', ()=> this._focus(entry));
    header.addEventListener('dblclick', (ev)=>{
      ev.stopPropagation();
      this._centerPanel(entry);
    });
    this._makeDraggable(entry, wrapper);
    this._makeResizable(entry, wrapper);

    try {
      entry.api = typeof entry.mount === 'function'
        ? entry.mount(body, this.context)
        : null;
    } catch (err) {
      console.error('[Chronos][Cockpit] Panel mount failed', entry.id, err);
      body.innerHTML = `<div class="cockpit-panel-empty-prompt">Unable to load this panel. Check console for details.</div>`;
    }
  }

  _unmountEntry(entry){
    if (!entry.el) return;
    try { entry.api?.dispose?.(); } catch {}
    try { entry.el.remove(); } catch {}
    entry.el = null;
    entry.api = null;
    if (entry.miniEl){
      try { entry.miniEl.remove(); } catch {}
      entry.miniEl = null;
    }
    this._scheduleMinimapUpdate();
  }

  _applySnap(value, enabled, bypass){
    if (!enabled || bypass) return value;
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  }

  _makeDraggable(entry, wrapper){
    if (!wrapper) return;
    wrapper.addEventListener('pointerdown', (ev)=>{
      if (ev.button !== 0) return;
      if (isInteractiveTarget(ev.target)) return;
      ev.preventDefault();
      this._focus(entry);
      const startX = ev.clientX;
      const startY = ev.clientY;
      const startPos = { x: entry.position.x, y: entry.position.y };
      const move = (e)=>{
        const zoom = this.view.zoom || 1;
        const rawX = startPos.x + (e.clientX - startX) / zoom;
        const rawY = startPos.y + (e.clientY - startY) / zoom;
        const nextX = this._applySnap(rawX, this.view.snap, e.altKey);
        const nextY = this._applySnap(rawY, this.view.snap, e.altKey);
        entry.position.x = nextX;
        entry.position.y = nextY;
        if (entry.el){
          entry.el.style.left = `${nextX}px`;
          entry.el.style.top = `${nextY}px`;
        }
        this._scheduleMinimapUpdate();
      };
      const up = ()=>{
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        this._persist();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  _makeResizable(entry, wrapper){
    const resizer = document.createElement('div');
    resizer.className = 'cockpit-panel-resizer se';
    const resizerE = document.createElement('div');
    resizerE.className = 'cockpit-panel-resizer e';
    const resizerS = document.createElement('div');
    resizerS.className = 'cockpit-panel-resizer s';
    wrapper.append(resizer, resizerE, resizerS);
    const MIN_WIDTH = 180;
    const MIN_HEIGHT = 140;
    const handleResize = (ev, mode)=>{
      ev.stopPropagation();
      if (ev.button !== 0) return;
      ev.preventDefault();
      this._focus(entry);
      const startX = ev.clientX;
      const startY = ev.clientY;
      const startSize = { width: entry.size.width, height: entry.size.height };
      const header = wrapper.querySelector('.cockpit-panel-header');
      const headerW = header ? Math.ceil(header.scrollWidth) : 0;
      const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
      const minW = Math.max(MIN_WIDTH, headerW + 12);
      const minH = Math.max(MIN_HEIGHT, headerH + 20);
      const move = (e)=>{
        const zoom = this.view.zoom || 1;
        const deltaX = (e.clientX - startX) / zoom;
        const deltaY = (e.clientY - startY) / zoom;
        let newWidth = startSize.width;
        let newHeight = startSize.height;
        if (mode === 'e' || mode === 'se') newWidth = Math.max(minW, startSize.width + deltaX);
        if (mode === 's' || mode === 'se') newHeight = Math.max(minH, startSize.height + deltaY);
        newWidth = this._applySnap(newWidth, this.view.snap, e.altKey);
        newHeight = this._applySnap(newHeight, this.view.snap, e.altKey);
        entry.size.width = newWidth;
        entry.size.height = newHeight;
        if (entry.el){
          entry.el.style.width = `${newWidth}px`;
          entry.el.style.height = `${newHeight}px`;
        }
        this._scheduleMinimapUpdate();
      };
      const up = ()=>{
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        this._persist();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    resizer.addEventListener('pointerdown', (ev)=> handleResize(ev, 'se'));
    resizerE.addEventListener('pointerdown', (ev)=> handleResize(ev, 'e'));
    resizerS.addEventListener('pointerdown', (ev)=> handleResize(ev, 's'));
  }

  _refreshPanelMenu(){
    if (!this.panelMenuList) return;
    const query = (this.panelMenuSearch?.value || '').trim().toLowerCase();
    const items = Array.from(this.entries.values())
      .sort((a, b)=> a.label.localeCompare(b.label))
      .filter(entry => !query || entry.label.toLowerCase().includes(query));
    this.panelMenuList.innerHTML = '';
    items.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'cockpit-panel-menu-item';
      const label = document.createElement('span');
      label.textContent = entry.label;
      const state = document.createElement('em');
      state.textContent = entry.visible ? 'visible' : 'hidden';
      row.append(label, state);
      row.addEventListener('click', ()=>{
        this.setVisible(entry.id, !entry.visible);
        this._refreshPanelMenu();
      });
      this.panelMenuList.appendChild(row);
    });
  }

  dispose(){
    if (this.persistHandle){
      window.clearTimeout(this.persistHandle);
      this.persistHandle = null;
    }
    if (this.minimap?.raf){
      window.cancelAnimationFrame(this.minimap.raf);
      this.minimap.raf = null;
    }
    if (Array.isArray(this.cleanups)){
      this.cleanups.forEach(fn => {
        try { fn(); } catch {}
      });
      this.cleanups = [];
    }
    this.entries.forEach(entry => this._unmountEntry(entry));
    this.entries.clear();
    this._updateOverlay();
    this._notify();
  }
}

const PANEL_IMPORTS = [
  'Schedule',
  'Matrix',
  'MatrixVisuals',
  'StatusStrip',
  'Commitments',
  'Lists',
  'Deadlines',
  'Checklist',
  'Flashcards',
  'RandomPicker',
  'MapOfHappiness',
];

async function loadPanels(manager){
  const tasks = PANEL_IMPORTS.map(async (name)=>{
    const url = new URL(`../../Panels/${name}/index.js`, import.meta.url);
    try {
      const mod = await import(url);
      if (mod && typeof mod.register === 'function') {
        mod.register(manager);
        try { document.dispatchEvent(new CustomEvent('chronos:cockpit-panels')); } catch {}
      } else {
        console.warn('[Chronos][Cockpit] Panel module has no register export', name);
      }
    } catch (err) {
      console.error('[Chronos][Cockpit] Failed to load panel module', name, err);
    }
  });
  await Promise.all(tasks);
}

export function mount(el, context){
  injectStyles();
  el.innerHTML = `
    <div class="cockpit-blank">
      <div class="cockpit-grid" aria-hidden="true"></div>
      <div class="cockpit-panels" aria-live="polite"></div>
      <div class="cockpit-overlay">
        <div class="cockpit-title">Cockpit Canvas</div>
        <div class="cockpit-subtitle">
          Drop panels from the launcher, drag them into place, and build your flight deck.
        </div>
        <div class="cockpit-hint">Scroll to pan, Ctrl + scroll to zoom. Double-click a panel header to center it.</div>
      </div>
      <div class="cockpit-toolbar">
        <span class="cockpit-toolbar-title">Cockpit</span>
        <div class="cockpit-panel-launcher">
          <button type="button" data-panel-menu-toggle>Panels</button>
          <div class="cockpit-panel-menu" data-panel-menu>
            <input type="text" placeholder="Filter panels" data-panel-menu-search />
            <div class="cockpit-panel-menu-list" data-panel-menu-list></div>
          </div>
        </div>
      </div>
      <div class="cockpit-controls">
        <div class="cockpit-zoom-controls">
          <button type="button" class="cockpit-zoom-btn" data-zoom-out aria-label="Zoom out">-</button>
          <span class="cockpit-zoom-label" data-zoom-label>100%</span>
          <button type="button" class="cockpit-zoom-btn" data-zoom-in aria-label="Zoom in">+</button>
        </div>
        <button type="button" class="cockpit-fit-btn" data-fit-view title="Fit view">Fit</button>
        <button type="button" class="cockpit-reset-btn" data-reset-view title="Reset view">Reset</button>
        <button type="button" class="cockpit-snap-btn" data-snap-toggle title="Snap toggle">Snap</button>
        <button type="button" class="cockpit-minimap-btn" data-minimap-toggle title="Minimap toggle">Map</button>
      </div>
      <div class="cockpit-minimap" data-minimap>
        <div class="cockpit-minimap-header">Minimap</div>
        <div class="cockpit-minimap-body">
          <div class="cockpit-minimap-track" data-minimap-track>
            <div class="cockpit-minimap-viewport" data-minimap-viewport></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const manager = new CockpitPanelManager(el.querySelector('.cockpit-blank'), context);

  function handlePanelRegistration(entry){
    if (!entry) return;
    try {
      if (typeof entry === 'function'){
        console.log('[Chronos][Cockpit] Registering panel via function');
        entry(manager);
      } else if (typeof entry === 'object' && entry.id){
        console.log('[Chronos][Cockpit] Registering panel via object', entry.id);
        manager.registerPanel(entry);
      }
    } catch (err) {
      console.error('[Chronos][Cockpit] Panel registration failed', err);
    }
  }

  const definitions = window.__cockpitPanelDefinitions;
  if (Array.isArray(definitions)) {
    definitions.forEach(handlePanelRegistration);
  }
  window.__cockpitPanelRegister = (entry)=> handlePanelRegistration(entry);

  loadPanels(manager);

  window.CockpitPanels = manager.api;
  try { document.dispatchEvent(new CustomEvent('chronos:cockpit-panels')); } catch {}

  return {
    dispose(){
      manager.dispose();
      window.__cockpitPanelRegister = null;
      if (window.CockpitPanels === manager.api){
        window.CockpitPanels = null;
        try { document.dispatchEvent(new CustomEvent('chronos:cockpit-panels')); } catch {}
      }
    }
  };
}
