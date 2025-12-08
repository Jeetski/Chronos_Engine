const STYLE_ID = 'cockpit-blank-style';
const STORAGE_KEY = 'chronos_cockpit_panels_v1';
const VIEW_DEFAULT = { panX: 0, panY: 0, zoom: 1 };
const ZOOM_LIMITS = { min: 0.6, max: 1.8 };

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
      background: #0d111a;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02), 0 18px 60px rgba(0,0,0,0.45);
      touch-action: none;
    }
    .cockpit-grid {
      position: absolute;
      inset: 0;
      background-color: #0d111a;
      background-image:
        radial-gradient(circle at center, rgba(150,180,255,0.9) 2px, transparent 0),
        radial-gradient(circle at center, rgba(150,180,255,0.6) 2px, transparent 0);
      background-size: 60px 60px, 12px 12px;
      background-position: 0 0, 0 0;
      opacity: 0.95;
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
      pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .cockpit-overlay.hidden {
      opacity: 0;
      transform: translateY(8px);
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
      min-width: 280px;
      min-height: 220px;
      max-width: 540px;
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
    }
    .cockpit-panel-header:active {
      cursor: grabbing;
    }
    .cockpit-panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
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
      width: 16px;
      height: 16px;
      right: 8px;
      bottom: 8px;
      border: 1px solid rgba(255,255,255,0.35);
      border-radius: 4px;
      background: rgba(255,255,255,0.1);
      cursor: nwse-resize;
    }
    .cockpit-panel-resizer::after {
      content: '';
      position: absolute;
      right: 3px;
      bottom: 3px;
      width: 8px;
      height: 8px;
      border-right: 2px solid rgba(255,255,255,0.6);
      border-bottom: 2px solid rgba(255,255,255,0.6);
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
    .cockpit-reset-btn {
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
    .cockpit-reset-btn:hover {
      border-color: rgba(255,255,255,0.35);
      background: rgba(255,255,255,0.15);
    }
    .cockpit-zoom-label {
      min-width: 48px;
      text-align: center;
      font-variant-numeric: tabular-nums;
      font-size: 13px;
    }
  `;
  document.head.appendChild(style);
}

function clamp(v, min, max){
  return Math.max(min, Math.min(max, v));
}

class CockpitPanelManager {
  constructor(rootEl, context){
    this.root = rootEl;
    this.context = context || {};
    this.surface = rootEl.querySelector('.cockpit-panels');
    this.grid = rootEl.querySelector('.cockpit-grid');
    this.overlay = rootEl.querySelector('.cockpit-overlay');
    this.controls = rootEl.querySelector('.cockpit-controls');
    this.zoomLabel = rootEl.querySelector('[data-zoom-label]');
    this.zoomInBtn = rootEl.querySelector('[data-zoom-in]');
    this.zoomOutBtn = rootEl.querySelector('[data-zoom-out]');
    this.resetBtn = rootEl.querySelector('[data-reset-view]');
    this.entries = new Map();
    this.zIndex = 10;
    this.cleanups = [];
    this.persistHandle = null;
    this.state = this._loadState();
    this.view = this._loadView();
    this._applyViewTransform();
    this._bindViewportControls();
    this.api = {
      list: () => this.list(),
      toggle: (id) => this.toggle(id),
      setVisible: (id, visible) => this.setVisible(id, visible),
      showAll: () => this.showAll(),
      hideAll: () => this.hideAll(),
      remove: (id) => this.remove(id),
      register: (def) => this.registerPanel(def),
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
    this._updateZoomLabel();
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
  }

  _focus(entry){
    if (!entry?.el) return;
    entry.el.style.zIndex = String(++this.zIndex);
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

    closeBtn.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      this.setVisible(entry.id, false);
    });
    wrapper.addEventListener('pointerdown', ()=> this._focus(entry));
    this._makeDraggable(entry, header);
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
  }

  _makeDraggable(entry, handle){
    if (!handle) return;
    handle.addEventListener('pointerdown', (ev)=>{
      if (ev.button !== 0) return;
      ev.preventDefault();
      this._focus(entry);
      const startX = ev.clientX;
      const startY = ev.clientY;
      const startPos = { x: entry.position.x, y: entry.position.y };
      const move = (e)=>{
        const zoom = this.view.zoom || 1;
        const nextX = startPos.x + (e.clientX - startX) / zoom;
        const nextY = startPos.y + (e.clientY - startY) / zoom;
        entry.position.x = nextX;
        entry.position.y = nextY;
        if (entry.el){
          entry.el.style.left = `${nextX}px`;
          entry.el.style.top = `${nextY}px`;
        }
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
    resizer.className = 'cockpit-panel-resizer';
    wrapper.appendChild(resizer);
    const MIN_WIDTH = 260;
    const MIN_HEIGHT = 200;
    resizer.addEventListener('pointerdown', (ev)=>{
      ev.stopPropagation();
      if (ev.button !== 0) return;
      ev.preventDefault();
      this._focus(entry);
      const startX = ev.clientX;
      const startY = ev.clientY;
      const startSize = { width: entry.size.width, height: entry.size.height };
      const move = (e)=>{
        const zoom = this.view.zoom || 1;
        const deltaX = (e.clientX - startX) / zoom;
        const deltaY = (e.clientY - startY) / zoom;
        let newWidth = Math.max(MIN_WIDTH, startSize.width + deltaX);
        let newHeight = Math.max(MIN_HEIGHT, startSize.height + deltaY);
        entry.size.width = newWidth;
        entry.size.height = newHeight;
        if (entry.el){
          entry.el.style.width = `${newWidth}px`;
          entry.el.style.height = `${newHeight}px`;
        }
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

  dispose(){
    if (this.persistHandle){
      window.clearTimeout(this.persistHandle);
      this.persistHandle = null;
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

export function mount(el, context){
  injectStyles();
  el.innerHTML = `
    <div class="cockpit-blank">
      <div class="cockpit-grid" aria-hidden="true"></div>
      <div class="cockpit-panels" aria-live="polite"></div>
      <div class="cockpit-overlay">
        <div class="cockpit-title">Cockpit Canvas</div>
        <div class="cockpit-subtitle">
          This space acts like a navigation table. Drop panels from the Panels menu, drag them into position, and arrange your personal flight deck.
        </div>
        <div class="cockpit-hint">Scroll to glide across the grid, Ctrl + scroll (or the buttons) to zoom. Choose a panel from the Panels dropdown to place your first gauge.</div>
      </div>
      <div class="cockpit-controls">
        <div class="cockpit-zoom-controls">
          <button type="button" class="cockpit-zoom-btn" data-zoom-out aria-label="Zoom out">−</button>
          <span class="cockpit-zoom-label" data-zoom-label>100%</span>
          <button type="button" class="cockpit-zoom-btn" data-zoom-in aria-label="Zoom in">+</button>
        </div>
        <button type="button" class="cockpit-reset-btn" data-reset-view>Reset</button>
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

  import(new URL('../../Panels/Schedule/index.js', import.meta.url))
    .then(mod => {
      console.log('[Chronos][Cockpit] Schedule module import resolved', !!mod);
      if (mod && typeof mod.register === 'function') {
        try { mod.register(manager); } catch (err) { console.error('[Chronos][Cockpit] Schedule panel register failed', err); }
        try { document.dispatchEvent(new CustomEvent('chronos:cockpit-panels')); } catch {}
      } else {
        console.warn('[Chronos][Cockpit] Schedule module has no register export');
      }
    })
    .catch(err => console.error('[Chronos][Cockpit] Failed to load schedule panel module', err));

  import(new URL('../../Panels/Matrix/index.js', import.meta.url))
    .then(mod => {
      console.log('[Chronos][Cockpit] Matrix module import resolved', !!mod);
      if (mod && typeof mod.register === 'function') {
        try { mod.register(manager); } catch (err) { console.error('[Chronos][Cockpit] Matrix panel register failed', err); }
        try { document.dispatchEvent(new CustomEvent('chronos:cockpit-panels')); } catch {}
      } else {
        console.warn('[Chronos][Cockpit] Matrix module has no register export');
      }
    })
    .catch(err => console.error('[Chronos][Cockpit] Failed to load matrix panel module', err));

  import(new URL('../../Panels/MatrixVisuals/index.js', import.meta.url))
    .then(mod => {
      console.log('[Chronos][Cockpit] Matrix visuals module import resolved', !!mod);
      if (mod && typeof mod.register === 'function') {
        try { mod.register(manager); } catch (err) { console.error('[Chronos][Cockpit] Matrix visuals panel register failed', err); }
        try { document.dispatchEvent(new CustomEvent('chronos:cockpit-panels')); } catch {}
      } else {
        console.warn('[Chronos][Cockpit] Matrix visuals module has no register export');
      }
    })
    .catch(err => console.error('[Chronos][Cockpit] Failed to load matrix visuals panel module', err));

  import(new URL('../../Panels/StatusStrip/index.js', import.meta.url))
    .then(mod => {
      console.log('[Chronos][Cockpit] Status strip module import resolved', !!mod);
      if (mod && typeof mod.register === 'function') {
        try { mod.register(manager); } catch (err) { console.error('[Chronos][Cockpit] Status strip panel register failed', err); }
        try { document.dispatchEvent(new CustomEvent('chronos:cockpit-panels')); } catch {}
      } else {
        console.warn('[Chronos][Cockpit] Status strip module has no register export');
      }
    })
    .catch(err => console.error('[Chronos][Cockpit] Failed to load status strip panel module', err));

  import(new URL('../../Panels/Commitments/index.js', import.meta.url))
    .then(mod => {
      console.log('[Chronos][Cockpit] Commitments module import resolved', !!mod);
      if (mod && typeof mod.register === 'function') {
        try { mod.register(manager); } catch (err) { console.error('[Chronos][Cockpit] Commitments panel register failed', err); }
        try { document.dispatchEvent(new CustomEvent('chronos:cockpit-panels')); } catch {}
      } else {
        console.warn('[Chronos][Cockpit] Commitments module has no register export');
      }
    })
    .catch(err => console.error('[Chronos][Cockpit] Failed to load commitments panel module', err));

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
