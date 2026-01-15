const VIEW_ID = 'canvas';
const BOARD_TYPE = 'canvas_board';
const BOARD_LABEL = 'Constellations';
const AUTOSAVE_DELAY = 800;
const DRAG_SNAP_FALLBACK = 16;
const MIN_NODE_WIDTH = 160;
const MIN_NODE_HEIGHT = 120;

const TOOL_SELECT = 'select';
const TOOL_PAN = 'pan';
const TOOL_STICKY = 'sticky';
const TOOL_TEXT = 'text';
const TOOL_DRAW = 'draw';
const TOOL_CONNECT = 'connect';
const TOOL_MEDIA = 'media';

const TOOL_LABELS = {
  [TOOL_SELECT]: 'Select',
  [TOOL_PAN]: 'Pan',
  [TOOL_STICKY]: 'Sticky',
  [TOOL_TEXT]: 'Text',
  [TOOL_DRAW]: 'Draw',
  [TOOL_CONNECT]: 'Connect',
  [TOOL_MEDIA]: 'Media',
};

const LIBRARY_TYPES = ['task', 'goal', 'project', 'habit', 'commitment', 'note', 'milestone'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickJson(value, fallback) {
  if (!value || typeof value !== 'object') return fallback;
  return value;
}

class CanvasView {
  constructor() {
    this.id = VIEW_ID;
    this.label = 'Canvas';
    this.icon = 'Canvas';
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.tool = TOOL_SELECT;
    this.isPanning = false;
    this.isDrawing = false;
    this.isDraggingNode = false;
    this.isResizingNode = false;
    this.isSpacePanning = false;
    this.isSelecting = false;
    this.pointerStart = { x: 0, y: 0 };
    this.panStart = { x: 0, y: 0 };
    this.nodeStart = { x: 0, y: 0 };
    this.resizeStart = null;
    this.dragStartNodes = null;
    this.selectionStart = null;
    this.clipboard = null;
    this.lastPointerWorld = { x: 0, y: 0 };
    this.nodes = new Map();
    this.connections = [];
    this.pendingConnection = null;
    this.currentInkPath = null;
    this.inkStrokes = [];
    this.selectedIds = new Set();
    this.activeBoardName = null;
    this.boardItems = [];
    this.libraryItems = [];
    this.saveTimer = null;
    this.isLoadingBoard = false;
    this.cleanups = [];
    this.linkId = null;
    this.linkToken = null;
  }

  async mount(container, context) {
    this.context = context;
    container.innerHTML = `
      <link rel="stylesheet" href="./Views/Canvas/canvas.css">
      <div id="canvas-interface">
        <aside id="canvas-sidebar">
          <div class="sidebar-header">
            <span>${BOARD_LABEL}</span>
            <button class="icon-btn" data-collapse title="Collapse">Collapse</button>
          </div>
          <div class="sidebar-content">
            <div class="library-section">
              <div class="library-label">Constellations</div>
              <button class="btn btn-primary" data-new-board style="width:100%">+ New Board</button>
              <div class="board-list" data-board-list></div>
              <button class="btn" data-link-invite style="width:100%; margin-top: 10px;">Invite</button>
            </div>
            <div class="library-section">
              <div class="library-label">Library</div>
              <input class="input" data-library-search placeholder="Search items..." />
              <div id="library-tree" data-library-tree></div>
            </div>
          </div>
        </aside>
        <div id="canvas-topbar">
          <div class="topbar-section">
            <div class="board-chip">
              <span class="board-chip-label">Board</span>
              <button class="board-chip-name" data-board-title type="button">Untitled</button>
              <button class="icon-btn ghost" data-rename title="Rename board">Rename</button>
            </div>
          </div>
          <div class="topbar-section">
            <button class="icon-btn ghost" data-fit title="Fit to content">Fit</button>
            <button class="icon-btn ghost" data-zoom-out title="Zoom out">-</button>
            <button class="zoom-pill" data-zoom-display type="button">100%</button>
            <button class="icon-btn ghost" data-zoom-in title="Zoom in">+</button>
          </div>
        </div>
        <div id="canvas-toolbar" role="toolbar">
          <button class="tool-btn active" data-tool="select" title="Select (V)">
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 4 L18 12 L12 13.5 L14.8 19.5 L12.8 20.5 L10 14.5 L6 18 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
              </svg>
            </span>
            <span class="tool-label">Select</span>
            <span class="tool-key">V</span>
          </button>
          <button class="tool-btn" data-tool="pan" title="Pan (H)">
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 12 V7 a1.5 1.5 0 0 1 3 0 v5 M10 8 V6 a1.5 1.5 0 0 1 3 0 v6 M13 9 V7.2 a1.5 1.5 0 0 1 3 0 V13 M16 10.5 V9.2 a1.5 1.5 0 0 1 3 0 V13.2 c0 3-1.6 5-4.3 6.3 L12 21 l-5-4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </span>
            <span class="tool-label">Pan</span>
            <span class="tool-key">H</span>
          </button>
          <button class="tool-btn" data-tool="sticky" title="Sticky Note (N)">
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 4 H15 L19 8 V20 H5 Z M15 4 V8 H19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
              </svg>
            </span>
            <span class="tool-label">Sticky</span>
            <span class="tool-key">N</span>
          </button>
          <button class="tool-btn" data-tool="text" title="Text (T)">
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 6 H19 M12 6 V18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
              </svg>
            </span>
            <span class="tool-label">Text</span>
            <span class="tool-key">T</span>
          </button>
          <button class="tool-btn" data-tool="draw" title="Draw (P)">
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 16 L16 4 L20 8 L8 20 L4 20 Z M14 6 L18 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
              </svg>
            </span>
            <span class="tool-label">Draw</span>
            <span class="tool-key">P</span>
          </button>
          <button class="tool-btn" data-tool="connect" title="Connect (L)">
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 12 h6 M7 12 a3 3 0 0 1 3-3 h2 M15 12 a3 3 0 0 0 3 3 h2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </span>
            <span class="tool-label">Link</span>
            <span class="tool-key">L</span>
          </button>
          <button class="tool-btn" data-tool="media" title="Media (M)">
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="6" width="16" height="12" fill="none" stroke="currentColor" stroke-width="1.6"></rect>
                <path d="M6 16 L10 12 L14 16 L17 13 L20 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                <circle cx="9" cy="10" r="1.4" fill="none" stroke="currentColor" stroke-width="1.6"></circle>
              </svg>
            </span>
            <span class="tool-label">Media</span>
            <span class="tool-key">M</span>
          </button>
        </div>
        <div id="canvas-hud">
          <div class="hud-row">
            <span data-hud-tool>${TOOL_LABELS[this.tool]}</span>
            <span class="hud-divider"></span>
            <span data-hud-zoom>100%</span>
          </div>
          <div class="hud-row dim" data-hud-coords>0, 0</div>
        </div>
      </div>
      <div id="canvas-world-container">
        <div id="canvas-world">
          <div class="canvas-layer" id="layer-grid"></div>
          <div class="canvas-layer" id="layer-connections">
            <svg class="canvas-svg"></svg>
          </div>
          <div class="canvas-layer" id="layer-ink">
            <svg class="canvas-svg"></svg>
          </div>
          <div class="canvas-layer" id="layer-nodes"></div>
        </div>
        <div id="canvas-selection" aria-hidden="true"></div>
      </div>
    `;

    this.container = container;
    this.sidebar = container.querySelector('#canvas-sidebar');
    this.worldContainer = container.querySelector('#canvas-world-container');
    this.world = container.querySelector('#canvas-world');
    this.nodesLayer = container.querySelector('#layer-nodes');
    this.connectionsLayer = container.querySelector('#layer-connections svg');
    this.inkLayer = container.querySelector('#layer-ink svg');
    this.selectionEl = container.querySelector('#canvas-selection');
    this.toolbar = container.querySelector('#canvas-toolbar');
    this.hudTool = container.querySelector('[data-hud-tool]');
    this.hudZoom = container.querySelector('[data-hud-zoom]');
    this.hudCoords = container.querySelector('[data-hud-coords]');
    this.boardTitle = container.querySelector('[data-board-title]');
    this.zoomDisplay = container.querySelector('[data-zoom-display]');
    this.libraryTree = container.querySelector('[data-library-tree]');
    this.librarySearch = container.querySelector('[data-library-search]');
    this.boardList = container.querySelector('[data-board-list]');

    this.panX = 300;
    this.panY = 220;
    this.zoom = 1;
    this._bindUI();
    this._bindWorld();
    this._bindKeyboard();
    await this._loadLinkSettings();
    await this._loadBoards();
    await this._loadLibrary();
    this._applyTransform();
  }

  _bindUI() {
    const collapseBtn = this.container.querySelector('[data-collapse]');
    if (collapseBtn) {
      const handler = () => this.sidebar.classList.toggle('collapsed');
      collapseBtn.addEventListener('click', handler);
      this.cleanups.push(() => collapseBtn.removeEventListener('click', handler));
    }

    const newBoardBtn = this.container.querySelector('[data-new-board]');
    if (newBoardBtn) {
      const handler = () => this._createBoard();
      newBoardBtn.addEventListener('click', handler);
      this.cleanups.push(() => newBoardBtn.removeEventListener('click', handler));
    }

    const toolHandler = (ev) => {
      const btn = ev.target.closest('[data-tool]');
      if (!btn) return;
      this.setTool(btn.dataset.tool);
    };
    this.toolbar.addEventListener('click', toolHandler);
    this.cleanups.push(() => this.toolbar.removeEventListener('click', toolHandler));

    if (this.boardList) {
      const handler = (ev) => {
        const button = ev.target.closest('[data-board-name]');
        if (!button) return;
        this._selectBoard(button.dataset.boardName);
      };
      this.boardList.addEventListener('click', handler);
      this.cleanups.push(() => this.boardList.removeEventListener('click', handler));
    }

    if (this.librarySearch) {
      const handler = () => this._renderLibrary();
      this.librarySearch.addEventListener('input', handler);
      this.cleanups.push(() => this.librarySearch.removeEventListener('input', handler));
    }

    const renameBtn = this.container.querySelector('[data-rename]');
    if (renameBtn) {
      const handler = () => this._renameBoard();
      renameBtn.addEventListener('click', handler);
      this.cleanups.push(() => renameBtn.removeEventListener('click', handler));
    }

    if (this.boardTitle) {
      const handler = () => this._renameBoard();
      this.boardTitle.addEventListener('click', handler);
      this.cleanups.push(() => this.boardTitle.removeEventListener('click', handler));
    }

    const linkInviteBtn = this.container.querySelector('[data-link-invite]');
    if (linkInviteBtn) {
      const handler = () => this._inviteLink();
      linkInviteBtn.addEventListener('click', handler);
      this.cleanups.push(() => linkInviteBtn.removeEventListener('click', handler));
    }

    const fitBtn = this.container.querySelector('[data-fit]');
    if (fitBtn) {
      const handler = () => this._fitToContent();
      fitBtn.addEventListener('click', handler);
      this.cleanups.push(() => fitBtn.removeEventListener('click', handler));
    }

    const zoomOut = this.container.querySelector('[data-zoom-out]');
    if (zoomOut) {
      const handler = () => this._zoomBy(-0.12, { x: this.worldContainer.clientWidth / 2, y: this.worldContainer.clientHeight / 2 });
      zoomOut.addEventListener('click', handler);
      this.cleanups.push(() => zoomOut.removeEventListener('click', handler));
    }

    const zoomIn = this.container.querySelector('[data-zoom-in]');
    if (zoomIn) {
      const handler = () => this._zoomBy(0.12, { x: this.worldContainer.clientWidth / 2, y: this.worldContainer.clientHeight / 2 });
      zoomIn.addEventListener('click', handler);
      this.cleanups.push(() => zoomIn.removeEventListener('click', handler));
    }

    if (this.libraryTree) {
      const dragHandler = (ev) => {
        const node = ev.target.closest('[data-item-type]');
        if (!node) return;
        const payload = {
          type: node.dataset.itemType,
          name: node.dataset.itemName,
        };
        ev.dataTransfer.setData('application/x-chronos-item', JSON.stringify(payload));
        ev.dataTransfer.setData('text/plain', `${payload.type}:${payload.name}`);
      };
      this.libraryTree.addEventListener('dragstart', dragHandler);
      this.cleanups.push(() => this.libraryTree.removeEventListener('dragstart', dragHandler));
    }
  }

  _bindWorld() {
    const handleWheel = (ev) => {
      ev.preventDefault();
      const rect = this.worldContainer.getBoundingClientRect();
      const scale = this._getScaleFactor();
      const point = {
        x: (ev.clientX - rect.left) / scale,
        y: (ev.clientY - rect.top) / scale,
      };
      if (ev.ctrlKey) {
        const delta = clamp(-ev.deltaY * 0.0012, -0.4, 0.4);
        this._zoomBy(delta, point);
      } else {
        this._panBy(-ev.deltaX, -ev.deltaY);
      }
    };
    this.worldContainer.addEventListener('wheel', handleWheel, { passive: false });
    this.cleanups.push(() => this.worldContainer.removeEventListener('wheel', handleWheel));

    const pointerDown = (ev) => {
      if (ev.button !== 0) return;
      const targetNode = ev.target.closest('.canvas-node');
      if (ev.target.closest('.node-action')) return;
      if (ev.target.closest('.node-resize')) {
        if (targetNode) {
          this._startResize(ev, targetNode);
        }
        return;
      }
      if (targetNode && ev.target.closest('.node-content')) return;
      if (targetNode && this.tool === TOOL_CONNECT) {
        this._handleConnectClick(targetNode);
        return;
      }
      if (targetNode && (this.tool === TOOL_SELECT || this.tool === TOOL_PAN || this.isSpacePanning)) {
        this._startNodeDrag(ev, targetNode, ev.shiftKey);
        return;
      }
      if (this.tool === TOOL_DRAW) {
        this._startDraw(ev);
        return;
      }
      if (this.tool === TOOL_PAN || this.isSpacePanning) {
        this._startPan(ev);
        return;
      }
      if (this.tool === TOOL_SELECT && !targetNode) {
        this._startSelection(ev);
        return;
      }
      if (this.tool === TOOL_STICKY || this.tool === TOOL_TEXT || this.tool === TOOL_MEDIA) {
        const world = this._toWorld(ev.clientX, ev.clientY);
        this._spawnNode({
          type: this.tool,
          title: TOOL_LABELS[this.tool],
          content: this.tool === TOOL_MEDIA ? 'Drop media here.' : 'New node.',
          x: world.x,
          y: world.y,
        });
        return;
      }
      if (!ev.shiftKey) this._clearSelection();
      this._startPan(ev);
    };
    this.worldContainer.addEventListener('pointerdown', pointerDown);
    this.cleanups.push(() => this.worldContainer.removeEventListener('pointerdown', pointerDown));

    const pointerMove = (ev) => {
      if (this.isPanning) this._movePan(ev);
      if (this.isDraggingNode) this._moveNode(ev);
      if (this.isResizingNode) this._moveResize(ev);
      if (this.isDrawing) this._moveDraw(ev);
      if (this.isSelecting) this._moveSelection(ev);
      this._updateHudCoords(ev.clientX, ev.clientY);
    };
    window.addEventListener('pointermove', pointerMove);
    this.cleanups.push(() => window.removeEventListener('pointermove', pointerMove));

    const pointerUp = () => {
      const wasPanning = this.isPanning;
      const wasDragging = this.isDraggingNode;
      const wasDrawing = this.isDrawing;
      const wasResizing = this.isResizingNode;
      const wasSelecting = this.isSelecting;
      if (this.isPanning) this.isPanning = false;
      if (this.isDraggingNode) this.isDraggingNode = false;
      if (this.isResizingNode) this._finishResize();
      if (this.isDrawing) this._finishDraw();
      if (this.isSelecting) this._finishSelection();
      if (wasPanning || wasDragging || wasDrawing || wasResizing || wasSelecting) {
        this._scheduleSave();
      }
    };
    window.addEventListener('pointerup', pointerUp);
    this.cleanups.push(() => window.removeEventListener('pointerup', pointerUp));

    const dropHandler = (ev) => {
      ev.preventDefault();
      const targetNode = ev.target.closest('.canvas-node');
      const itemPayload = ev.dataTransfer.getData('application/x-chronos-item');
      const world = this._toWorld(ev.clientX, ev.clientY);
      if (ev.dataTransfer.files && ev.dataTransfer.files.length) {
        this._handleMediaFiles(ev.dataTransfer.files, world, targetNode);
        return;
      }
      if (itemPayload) {
        try {
          const ref = JSON.parse(itemPayload);
          if (ref && ref.type && ref.name) {
            this._spawnNode({
              type: ref.type,
              title: `${ref.type.toUpperCase()}: ${ref.name}`,
              content: 'Linked item.',
              x: world.x,
              y: world.y,
              ref,
            });
            return;
          }
        } catch {}
      }
      const type = ev.dataTransfer.getData('text/plain');
      if (type) {
        this._spawnNode({
          type,
          title: type.toUpperCase(),
          content: 'Dropped from library.',
          x: world.x,
          y: world.y,
        });
      }
    };
    const dragOver = (ev) => ev.preventDefault();
    this.worldContainer.addEventListener('drop', dropHandler);
    this.worldContainer.addEventListener('dragover', dragOver);
    this.cleanups.push(() => this.worldContainer.removeEventListener('drop', dropHandler));
    this.cleanups.push(() => this.worldContainer.removeEventListener('dragover', dragOver));
  }

  _bindKeyboard() {
    const handler = (ev) => {
      if (ev.target.closest('input, textarea') || ev.target.isContentEditable) return;
      const key = ev.key.toLowerCase();
      if (key === ' ') {
        this.isSpacePanning = true;
        ev.preventDefault();
      }
      if (key === 'v') this.setTool(TOOL_SELECT);
      if (key === 'h') this.setTool(TOOL_PAN);
      if (key === 'n') this.setTool(TOOL_STICKY);
      if (key === 't') this.setTool(TOOL_TEXT);
      if (key === 'p') this.setTool(TOOL_DRAW);
      if (key === 'l') this.setTool(TOOL_CONNECT);
      if (key === 'm') this.setTool(TOOL_MEDIA);
      if (key === 'f') this._fitToContent();
      if (key === '=' || key === '+') this._zoomBy(0.12, { x: this.worldContainer.clientWidth / 2, y: this.worldContainer.clientHeight / 2 });
      if (key === '-' || key === '_') this._zoomBy(-0.12, { x: this.worldContainer.clientWidth / 2, y: this.worldContainer.clientHeight / 2 });
      if (key === 'escape') this._clearSelection();
      if (key === 'delete' || key === 'backspace') this._deleteSelection();
      if (key === 'a' && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        this._selectAll();
      }
      if (key === 'd' && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        this._duplicateSelection();
      }
      if (key === 'c' && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        this._copySelection();
      }
      if (key === 'v' && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        this._pasteSelection();
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        ev.preventDefault();
        const delta = ev.shiftKey ? 10 : 1;
        this._nudgeSelection(
          key === 'arrowleft' ? -delta : key === 'arrowright' ? delta : 0,
          key === 'arrowup' ? -delta : key === 'arrowdown' ? delta : 0,
        );
      }
    };
    window.addEventListener('keydown', handler);
    this.cleanups.push(() => window.removeEventListener('keydown', handler));

    const upHandler = (ev) => {
      if (ev.key === ' ') this.isSpacePanning = false;
    };
    window.addEventListener('keyup', upHandler);
    this.cleanups.push(() => window.removeEventListener('keyup', upHandler));

    const pasteHandler = (ev) => {
      if (!ev.clipboardData) return;
      const items = Array.from(ev.clipboardData.items || []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      ev.preventDefault();
      const world = this.lastPointerWorld || { x: 0, y: 0 };
      const selected = this._getSelectedNodes();
      const targetNode = selected.length === 1 ? selected[0].el : null;
      this._handleMediaFiles([file], world, targetNode);
    };
    window.addEventListener('paste', pasteHandler);
    this.cleanups.push(() => window.removeEventListener('paste', pasteHandler));
  }

  setTool(tool) {
    if (!TOOL_LABELS[tool]) return;
    this.tool = tool;
    this.toolbar.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    if (this.hudTool) this.hudTool.textContent = TOOL_LABELS[this.tool];
    if (this.tool !== TOOL_CONNECT) this.pendingConnection = null;
  }

  _applyTransform() {
    if (!this.world) return;
    this.world.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    const zoomLabel = `${Math.round(this.zoom * 100)}%`;
    if (this.hudZoom) this.hudZoom.textContent = zoomLabel;
    if (this.zoomDisplay) this.zoomDisplay.textContent = zoomLabel;
  }

  _getScaleFactor() {
    try {
      const root = document.getElementById('scaleRoot');
      if (!root) return 1;
      const tr = getComputedStyle(root).transform;
      if (!tr || tr === 'none') return 1;
      const match = tr.match(/matrix\(([^)]+)\)/);
      if (!match) return 1;
      const parts = match[1].split(',').map((v) => parseFloat(v.trim()));
      const a = parts[0];
      const b = parts[1];
      const d = parts[3];
      const scaleX = Number.isFinite(a) ? Math.hypot(a, b || 0) : 1;
      const scaleY = Number.isFinite(d) ? Math.abs(d) : scaleX;
      return scaleX || scaleY || 1;
    } catch {
      return 1;
    }
  }

  _toScaledPoint(clientX, clientY) {
    const root = document.getElementById('scaleRoot');
    const rect = root ? root.getBoundingClientRect() : { left: 0, top: 0 };
    const scale = this._getScaleFactor();
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
      scale,
    };
  }

  _panBy(dx, dy) {
    this.panX += dx;
    this.panY += dy;
    this._applyTransform();
    this._scheduleSave();
  }

  _zoomBy(delta, anchor) {
    const prev = this.zoom;
    const next = clamp(prev * (1 + delta), 0.25, 3.2);
    const worldX = (anchor.x - this.panX) / prev;
    const worldY = (anchor.y - this.panY) / prev;
    this.zoom = next;
    this.panX = anchor.x - worldX * next;
    this.panY = anchor.y - worldY * next;
    this._applyTransform();
    this._scheduleSave();
  }

  _toWorld(clientX, clientY) {
    const rect = this.worldContainer.getBoundingClientRect();
    const scale = this._getScaleFactor();
    const x = ((clientX - rect.left) / scale - this.panX) / this.zoom;
    const y = ((clientY - rect.top) / scale - this.panY) / this.zoom;
    return { x, y };
  }

  _updateHudCoords(clientX, clientY) {
    const world = this._toWorld(clientX, clientY);
    this.lastPointerWorld = world;
    if (!this.hudCoords) return;
    this.hudCoords.textContent = `${Math.round(world.x)}, ${Math.round(world.y)}`;
  }

  _startPan(ev) {
    this.isPanning = true;
    try { this.worldContainer.setPointerCapture(ev.pointerId); } catch {}
    const pos = this._toScaledPoint(ev.clientX, ev.clientY);
    this.pointerStart = { x: pos.x, y: pos.y };
    this.panStart = { x: this.panX, y: this.panY };
  }

  _movePan(ev) {
    const pos = this._toScaledPoint(ev.clientX, ev.clientY);
    const dx = pos.x - this.pointerStart.x;
    const dy = pos.y - this.pointerStart.y;
    this.panX = this.panStart.x + dx;
    this.panY = this.panStart.y + dy;
    this._applyTransform();
  }

  _startNodeDrag(ev, nodeEl, additive) {
    this._selectNode(nodeEl, { toggle: additive });
    const id = nodeEl.dataset.nodeId;
    if (!this.nodes.get(id)) return;
    this.isDraggingNode = true;
    try { this.worldContainer.setPointerCapture(ev.pointerId); } catch {}
    const pos = this._toScaledPoint(ev.clientX, ev.clientY);
    this.pointerStart = { x: pos.x, y: pos.y };
    this.dragStartNodes = new Map();
    this._getSelectedNodes().forEach((node) => {
      this.dragStartNodes.set(node.id, { x: node.x, y: node.y });
    });
  }

  _moveNode(ev) {
    if (!this.dragStartNodes) return;
    const pos = this._toScaledPoint(ev.clientX, ev.clientY);
    const dx = (pos.x - this.pointerStart.x) / this.zoom;
    const dy = (pos.y - this.pointerStart.y) / this.zoom;
    const snap = this._getSnapSize();
    this._getSelectedNodes().forEach((node) => {
      const start = this.dragStartNodes.get(node.id);
      if (!start) return;
      const nextX = start.x + dx;
      const nextY = start.y + dy;
      const snapped = this._maybeSnap(nextX, nextY, ev.altKey, snap);
      node.x = snapped.x;
      node.y = snapped.y;
      node.el.style.left = `${node.x}px`;
      node.el.style.top = `${node.y}px`;
    });
    this._updateConnections();
  }

  _startResize(ev, nodeEl) {
    const id = nodeEl.dataset.nodeId;
    const node = this.nodes.get(id);
    if (!node) return;
    this._selectNode(nodeEl);
    this.isResizingNode = true;
    try { this.worldContainer.setPointerCapture(ev.pointerId); } catch {}
    const pos = this._toScaledPoint(ev.clientX, ev.clientY);
    const rect = nodeEl.getBoundingClientRect();
    this.resizeStart = {
      id,
      x: pos.x,
      y: pos.y,
      width: rect.width / pos.scale,
      height: rect.height / pos.scale,
    };
  }

  _moveResize(ev) {
    if (!this.resizeStart) return;
    const node = this.nodes.get(this.resizeStart.id);
    if (!node) return;
    const pos = this._toScaledPoint(ev.clientX, ev.clientY);
    const dx = (pos.x - this.resizeStart.x) / this.zoom;
    const dy = (pos.y - this.resizeStart.y) / this.zoom;
    const snap = this._getSnapSize();
    let nextW = this.resizeStart.width + dx;
    let nextH = this.resizeStart.height + dy;
    if (ev.shiftKey) {
      const ratio = this.resizeStart.width / Math.max(1, this.resizeStart.height);
      if (Math.abs(dx) > Math.abs(dy)) {
        nextH = nextW / ratio;
      } else {
        nextW = nextH * ratio;
      }
    }
    nextW = Math.max(MIN_NODE_WIDTH, nextW);
    nextH = Math.max(MIN_NODE_HEIGHT, nextH);
    const snappedW = ev.altKey ? nextW : Math.round(nextW / snap) * snap;
    const snappedH = ev.altKey ? nextH : Math.round(nextH / snap) * snap;
    node.width = snappedW;
    node.height = snappedH;
    node.el.style.width = `${snappedW}px`;
    node.el.style.height = `${snappedH}px`;
    this._updateConnections();
  }

  _finishResize() {
    this.isResizingNode = false;
    this.resizeStart = null;
  }

  _startSelection(ev) {
    this.isSelecting = true;
    try { this.worldContainer.setPointerCapture(ev.pointerId); } catch {}
    const startWorld = this._toWorld(ev.clientX, ev.clientY);
    this.lastPointerWorld = startWorld;
    const rect = this.worldContainer.getBoundingClientRect();
    const scale = this._getScaleFactor();
    const clientX = (ev.clientX - rect.left) / scale;
    const clientY = (ev.clientY - rect.top) / scale;
    this.selectionStart = {
      clientX,
      clientY,
      worldX: startWorld.x,
      worldY: startWorld.y,
      additive: ev.shiftKey,
    };
    if (!ev.shiftKey) this._clearSelection();
    if (this.selectionEl) {
      this.selectionEl.style.display = 'block';
      this.selectionEl.style.left = `${clientX}px`;
      this.selectionEl.style.top = `${clientY}px`;
      this.selectionEl.style.width = '0px';
      this.selectionEl.style.height = '0px';
    }
  }

  _moveSelection(ev) {
    if (!this.selectionStart || !this.selectionEl) return;
    const rect = this.worldContainer.getBoundingClientRect();
    const scale = this._getScaleFactor();
    const clientX = (ev.clientX - rect.left) / scale;
    const clientY = (ev.clientY - rect.top) / scale;
    const left = Math.min(this.selectionStart.clientX, clientX);
    const top = Math.min(this.selectionStart.clientY, clientY);
    const width = Math.abs(clientX - this.selectionStart.clientX);
    const height = Math.abs(clientY - this.selectionStart.clientY);
    this.selectionEl.style.left = `${left}px`;
    this.selectionEl.style.top = `${top}px`;
    this.selectionEl.style.width = `${width}px`;
    this.selectionEl.style.height = `${height}px`;
  }

  _finishSelection() {
    if (!this.selectionStart) return;
    const start = this.selectionStart;
    const end = this.lastPointerWorld || { x: start.worldX, y: start.worldY };
    const minX = Math.min(start.worldX, end.x);
    const minY = Math.min(start.worldY, end.y);
    const maxX = Math.max(start.worldX, end.x);
    const maxY = Math.max(start.worldY, end.y);
    const selected = new Set(start.additive ? Array.from(this.selectedIds) : []);
    this.nodes.forEach((node) => {
      const nx = node.x;
      const ny = node.y;
      const nw = node.width || 0;
      const nh = node.height || 0;
      const intersects = nx < maxX && nx + nw > minX && ny < maxY && ny + nh > minY;
      if (intersects) selected.add(node.id);
    });
    this.selectedIds = selected;
    this._syncSelectionStyles();
    this.isSelecting = false;
    this.selectionStart = null;
    if (this.selectionEl) this.selectionEl.style.display = 'none';
  }

  _startDraw(ev) {
    const world = this._toWorld(ev.clientX, ev.clientY);
    this.isDrawing = true;
    try { this.worldContainer.setPointerCapture(ev.pointerId); } catch {}
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${world.x} ${world.y}`);
    path.setAttribute('class', 'ink-path');
    this.inkLayer.appendChild(path);
    this.currentInkPath = { path, points: [world] };
  }

  _moveDraw(ev) {
    if (!this.currentInkPath) return;
    const world = this._toWorld(ev.clientX, ev.clientY);
    this.currentInkPath.points.push(world);
    const d = this.currentInkPath.points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
    this.currentInkPath.path.setAttribute('d', d);
  }

  _finishDraw() {
    if (this.currentInkPath && this.currentInkPath.points.length > 1) {
      this.inkStrokes.push({
        points: this.currentInkPath.points.map((pt) => [pt.x, pt.y]),
      });
    }
    this.isDrawing = false;
    this.currentInkPath = null;
  }

  _handleConnectClick(nodeEl) {
    const id = nodeEl.dataset.nodeId;
    if (!id) return;
    if (!this.pendingConnection) {
      this.pendingConnection = id;
      this._selectNode(nodeEl);
      return;
    }
    if (this.pendingConnection === id) return;
    this.connections.push({ from: this.pendingConnection, to: id });
    this.pendingConnection = null;
    this._updateConnections();
  }

  _updateConnections() {
    if (!this.connectionsLayer) return;
    this.connectionsLayer.innerHTML = `
      <defs>
        <marker id="canvas-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(120, 170, 255, 0.7)"></path>
        </marker>
      </defs>
    `;
    this.connections.forEach((conn) => {
      const from = this.nodes.get(conn.from);
      const to = this.nodes.get(conn.to);
      if (!from || !to) return;
      const fromHeader = from.el?.querySelector('.node-header');
      const toHeader = to.el?.querySelector('.node-header');
      const fromHeaderHeight = fromHeader ? fromHeader.getBoundingClientRect().height : 24;
      const toHeaderHeight = toHeader ? toHeader.getBoundingClientRect().height : 24;
      const startX = from.x + from.width / 2;
      const startY = from.y + fromHeaderHeight / 2;
      const endX = to.x + to.width / 2;
      const endY = to.y + toHeaderHeight / 2;
      const dx = Math.max(60, Math.abs(endX - startX) * 0.35);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`);
      path.setAttribute('class', 'canvas-connection');
      path.setAttribute('marker-end', 'url(#canvas-arrow)');
      this.connectionsLayer.appendChild(path);
    });
  }

  _spawnNode({ type, title, content, x, y, width, height, ref, media, silent }) {
    const nodeId = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const node = document.createElement('div');
    node.className = 'canvas-node';
    node.dataset.nodeId = nodeId;
    if (ref) node.classList.add('has-ref');
    if (type === TOOL_STICKY) node.classList.add('type-sticky');
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    if (width) node.style.width = `${width}px`;
    if (height) node.style.height = `${height}px`;
    node.innerHTML = `
      <div class="node-header">
        <span class="node-type-icon">${String(type || '').toUpperCase()}</span>
        <span class="node-title">${title || 'Untitled'}</span>
        <span class="node-actions">
          ${ref ? '<button class="node-action" data-open-ref title="Open item">Open</button>' : ''}
        </span>
      </div>
      <div class="node-media" aria-hidden="true"></div>
      <div class="node-content" contenteditable="true"></div>
      <div class="node-resize" title="Resize"></div>
    `;
    const titleEl = node.querySelector('.node-title');
    if (titleEl) {
      const handler = (ev) => {
        ev.stopPropagation();
        const next = window.prompt('Rename node', titleEl.textContent || '');
        if (!next || !next.trim()) return;
        titleEl.textContent = next.trim();
        const model = this.nodes.get(nodeId);
        if (model) model.title = next.trim();
        this._scheduleSave();
      };
      titleEl.addEventListener('dblclick', handler);
      this.cleanups.push(() => titleEl.removeEventListener('dblclick', handler));
    }
    const openBtn = node.querySelector('[data-open-ref]');
    if (openBtn) {
      const handler = (ev) => {
        ev.stopPropagation();
        this._openNodeRef(nodeId);
      };
      openBtn.addEventListener('click', handler);
      this.cleanups.push(() => openBtn.removeEventListener('click', handler));
    }
    const contentEl = node.querySelector('.node-content');
    if (contentEl) {
      contentEl.textContent = content || '';
      const handleInput = () => {
        const model = this.nodes.get(nodeId);
        if (model) model.content = contentEl.textContent || '';
        this._scheduleSave();
      };
      contentEl.addEventListener('input', handleInput);
      this.cleanups.push(() => contentEl.removeEventListener('input', handleInput));
    }

    this.nodesLayer.appendChild(node);
    const rect = node.getBoundingClientRect();
    const size = {
      width: width || rect.width || 220,
      height: height || rect.height || 160,
    };
    this.nodes.set(nodeId, {
      id: nodeId,
      type,
      title,
      content: content || '',
      x,
      y,
      width: size.width,
      height: size.height,
      ref: ref || null,
      media: media || null,
      el: node,
    });
    if (media) {
      this._applyNodeMedia(nodeId, media);
    }
    this._selectNode(node);
    this._updateConnections();
    if (!silent) this._scheduleSave();
    return this.nodes.get(nodeId);
  }

  _renderInk() {
    if (!this.inkLayer) return;
    this.inkLayer.innerHTML = '';
    this.inkStrokes.forEach((stroke) => {
      const points = stroke.points || [];
      if (points.length < 2) return;
      const d = points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt[0]} ${pt[1]}`).join(' ');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'ink-path');
      this.inkLayer.appendChild(path);
    });
  }

  _selectNode(nodeEl, opts = {}) {
    const id = nodeEl.dataset.nodeId;
    if (!id) return;
    if (opts.toggle) {
      if (this.selectedIds.has(id)) {
        this.selectedIds.delete(id);
      } else {
        this.selectedIds.add(id);
      }
    } else {
      this.selectedIds = new Set([id]);
    }
    this._syncSelectionStyles();
  }

  _clearSelection() {
    this.selectedIds.clear();
    this._syncSelectionStyles();
    this.pendingConnection = null;
  }

  _getSelected() {
    const el = this.nodesLayer.querySelector('.canvas-node.selected');
    if (!el) return null;
    return this.nodes.get(el.dataset.nodeId);
  }

  _getSelectedNodes() {
    const nodes = [];
    this.selectedIds.forEach((id) => {
      const node = this.nodes.get(id);
      if (node) nodes.push(node);
    });
    return nodes;
  }

  _syncSelectionStyles() {
    this.nodesLayer.querySelectorAll('.canvas-node').forEach((node) => {
      node.classList.toggle('selected', this.selectedIds.has(node.dataset.nodeId));
    });
  }

  _selectAll() {
    this.selectedIds = new Set(Array.from(this.nodes.keys()));
    this._syncSelectionStyles();
  }

  _nudgeSelection(dx, dy) {
    if (!this.selectedIds.size) return;
    const snap = this._getSnapSize();
    this._getSelectedNodes().forEach((node) => {
      const nextX = node.x + dx;
      const nextY = node.y + dy;
      const snapped = this._maybeSnap(nextX, nextY, false, snap);
      node.x = snapped.x;
      node.y = snapped.y;
      node.el.style.left = `${node.x}px`;
      node.el.style.top = `${node.y}px`;
    });
    this._updateConnections();
    this._scheduleSave();
  }

  _duplicateSelection() {
    const selected = this._getSelectedNodes();
    if (!selected.length) return;
    const offset = 40;
    const newIds = [];
    selected.forEach((node) => {
      const clone = {
        type: node.type,
        title: node.title,
        content: node.content,
        x: node.x + offset,
        y: node.y + offset,
        width: node.width,
        height: node.height,
        ref: node.ref || null,
      };
      const newNode = this._spawnNode({ ...clone, silent: true });
      if (newNode) newIds.push(newNode.id);
    });
    this.selectedIds = new Set(newIds);
    this._syncSelectionStyles();
    this._scheduleSave();
  }

  _copySelection() {
    const selected = this._getSelectedNodes();
    if (!selected.length) return;
    let minX = Infinity;
    let minY = Infinity;
    const selectedIds = new Set(selected.map((node) => node.id));
    selected.forEach((node) => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
    });
    const nodes = selected.map((node) => ({
      id: node.id,
      type: node.type,
      title: node.el ? (node.el.querySelector('.node-title')?.textContent || node.title) : node.title,
      content: node.el ? (node.el.querySelector('.node-content')?.textContent || node.content) : node.content,
      x: node.x - minX,
      y: node.y - minY,
      width: node.width,
      height: node.height,
      ref: node.ref || null,
      media: node.media || null,
    }));
    const connections = this.connections.filter((conn) => selectedIds.has(conn.from) && selectedIds.has(conn.to));
    this.clipboard = { nodes, connections, origin: { x: minX, y: minY } };
  }

  _pasteSelection() {
    if (!this.clipboard || !this.clipboard.nodes.length) return;
    const base = this.lastPointerWorld || { x: 0, y: 0 };
    const idMap = new Map();
    const newIds = [];
    this.clipboard.nodes.forEach((node) => {
      const created = this._spawnNode({
        type: node.type,
        title: node.title,
        content: node.content,
        x: base.x + node.x,
        y: base.y + node.y,
        width: node.width,
        height: node.height,
        ref: node.ref || null,
        media: node.media || null,
        silent: true,
      });
      if (created) {
        idMap.set(node.id, created.id);
        newIds.push(created.id);
      }
    });
    this.clipboard.connections.forEach((conn) => {
      const from = idMap.get(conn.from);
      const to = idMap.get(conn.to);
      if (from && to) this.connections.push({ from, to });
    });
    this.selectedIds = new Set(newIds);
    this._syncSelectionStyles();
    this._updateConnections();
    this._scheduleSave();
  }

  _deleteSelection() {
    const selected = this._getSelectedNodes();
    if (!selected.length) return;
    selected.forEach((node) => {
      node.el.remove();
      this.nodes.delete(node.id);
      this.connections = this.connections.filter((conn) => conn.from !== node.id && conn.to !== node.id);
    });
    this.selectedIds.clear();
    this._updateConnections();
    this._scheduleSave();
  }

  async _fetchJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }
    return res.json();
  }

  async _loadLinkSettings() {
    try {
      const data = await this._fetchJson('/api/link/settings', {});
      const settings = (data && data.settings) || {};
      this.linkId = settings.link_id || null;
      this.linkToken = settings.token || null;
    } catch {
      this.linkId = null;
      this.linkToken = null;
    }
  }

  async _inviteLink() {
    if (!this.activeBoardName) return;
    try {
      const data = await this._fetchJson(`/api/link/invite?board=${encodeURIComponent(this.activeBoardName)}`, {});
      if (!data || !data.url) return;
      const message = `Share this Link invite URL:\n${data.url}\n\nToken: ${data.token || ''}`;
      window.prompt('Link Invite', message);
    } catch (err) {
      console.error('[Canvas] Failed to create Link invite', err);
    }
  }

  async _loadBoards() {
    try {
      const data = await this._fetchJson(`/api/items?type=${BOARD_TYPE}`, {});
      this.boardItems = Array.isArray(data.items) ? data.items : [];
    } catch (err) {
      console.error('[Canvas] Failed to load boards', err);
      this.boardItems = [];
    }
    this._renderBoardList();
    if (!this.boardItems.length) {
      await this._createBoard();
      return;
    }
    const first = this.boardItems[0];
    if (first && first.name) {
      await this._selectBoard(first.name);
    }
  }

  _renderBoardList() {
    if (!this.boardList) return;
    this.boardList.innerHTML = '';
    if (!this.boardItems.length) {
      const empty = document.createElement('div');
      empty.className = 'board-empty';
      empty.textContent = 'No boards yet.';
      this.boardList.appendChild(empty);
      return;
    }
    this.boardItems.forEach((board) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'board-item';
      btn.dataset.boardName = board.name;
      btn.textContent = board.name;
      if (board.name === this.activeBoardName) btn.classList.add('active');
      this.boardList.appendChild(btn);
    });
    if (this.boardTitle) {
      this.boardTitle.textContent = this.activeBoardName || 'Untitled';
    }
  }

  _nextBoardName() {
    const base = 'Constellation';
    const existing = new Set(this.boardItems.map((b) => b.name));
    let idx = existing.size ? existing.size + 1 : 1;
    let name = `${base} ${idx}`;
    while (existing.has(name)) {
      idx += 1;
      name = `${base} ${idx}`;
    }
    return name;
  }

  async _createBoard() {
    const name = this._nextBoardName();
    const payload = {
      type: BOARD_TYPE,
      name,
      viewport: { panX: 0, panY: 0, zoom: 1 },
      nodes: [],
      connections: [],
      ink: [],
    };
    await this._saveBoardPayload(name, payload);
    await this._loadBoards();
    await this._selectBoard(name);
  }

  async _selectBoard(name) {
    if (!name) return;
    this.activeBoardName = name;
    this._renderBoardList();
    await this._loadBoardPayload(name);
  }

  async _loadBoardPayload(name) {
    this.isLoadingBoard = true;
    try {
      const data = await this._fetchJson(`/api/item?type=${BOARD_TYPE}&name=${encodeURIComponent(name)}`);
      const item = pickJson(data.item, {});
      this._applyBoard(item);
    } catch (err) {
      console.error('[Canvas] Failed to load board', err);
    } finally {
      this.isLoadingBoard = false;
    }
  }

  _applyBoard(item) {
    this._clearBoard();
    const viewport = pickJson(item.viewport, {});
    this.panX = Number(viewport.panX || 0);
    this.panY = Number(viewport.panY || 0);
    this.zoom = Number(viewport.zoom || 1);
    this._applyTransform();

    const nodes = Array.isArray(item.nodes) ? item.nodes : [];
    nodes.forEach((node) => {
      if (!node) return;
      this._spawnNode({
        type: node.type || 'note',
        title: node.title || node.name || 'Node',
        content: node.content || '',
        x: Number(node.x || 0),
        y: Number(node.y || 0),
        width: node.width,
        height: node.height,
        ref: node.ref || null,
        media: node.media || null,
        silent: true,
      });
    });
    this.connections = Array.isArray(item.connections) ? item.connections : [];
    this._updateConnections();
    this.inkStrokes = Array.isArray(item.ink) ? item.ink : [];
    this._renderInk();
    if (this.boardTitle) this.boardTitle.textContent = this.activeBoardName || 'Untitled';
  }

  _clearBoard() {
    this.nodes.clear();
    this.connections = [];
    this.pendingConnection = null;
    this.inkStrokes = [];
    this.selectedIds.clear();
    this.isSelecting = false;
    this.selectionStart = null;
    if (this.selectionEl) this.selectionEl.style.display = 'none';
    if (this.nodesLayer) this.nodesLayer.innerHTML = '';
    if (this.connectionsLayer) this.connectionsLayer.innerHTML = '';
    if (this.inkLayer) this.inkLayer.innerHTML = '';
  }

  _serializeBoard() {
    const nodes = [];
    this.nodes.forEach((node) => {
      const el = node.el;
      const rect = el ? el.getBoundingClientRect() : null;
      const contentEl = el ? el.querySelector('.node-content') : null;
      const titleEl = el ? el.querySelector('.node-title') : null;
      nodes.push({
        id: node.id,
        type: node.type,
        title: titleEl ? titleEl.textContent || '' : node.title,
        content: contentEl ? contentEl.textContent || '' : node.content,
        x: node.x,
        y: node.y,
        width: rect ? rect.width : node.width,
        height: rect ? rect.height : node.height,
        ref: node.ref || null,
        media: node.media || null,
      });
    });
    const connections = this.connections.filter((conn) => this.nodes.has(conn.from) && this.nodes.has(conn.to));
    const now = Date.now();
    const updatedBy = this.linkId || 'local';
    return {
      type: BOARD_TYPE,
      name: this.activeBoardName,
      viewport: { panX: this.panX, panY: this.panY, zoom: this.zoom },
      nodes,
      connections,
      ink: this.inkStrokes,
      link_rev: now,
      link_updated_at: new Date(now).toISOString(),
      link_updated_by: updatedBy,
    };
  }

  _scheduleSave() {
    if (!this.activeBoardName) return;
    if (this.isLoadingBoard) return;
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this._saveBoard();
    }, AUTOSAVE_DELAY);
  }

  async _renameBoard() {
    if (!this.activeBoardName) return;
    const next = window.prompt('Rename board', this.activeBoardName);
    if (!next || next.trim() === '' || next === this.activeBoardName) return;
    try {
      await this._fetchJson('/api/item/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: BOARD_TYPE,
          old_name: this.activeBoardName,
          new_name: next.trim(),
        }),
      });
      await this._loadBoards();
      await this._selectBoard(next.trim());
    } catch (err) {
      console.error('[Canvas] Failed to rename board', err);
    }
  }

  _fitToContent() {
    if (!this.worldContainer) return;
    const nodes = Array.from(this.nodes.values());
    const rect = this.worldContainer.getBoundingClientRect();
    const viewportW = Math.max(1, rect.width);
    const viewportH = Math.max(1, rect.height);
    if (!nodes.length) {
      this.zoom = 1;
      this.panX = viewportW / 2;
      this.panY = viewportH / 2;
      this._applyTransform();
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    nodes.forEach((node) => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + (node.width || 200));
      maxY = Math.max(maxY, node.y + (node.height || 160));
    });
    const padding = 140;
    const boxW = Math.max(1, maxX - minX + padding);
    const boxH = Math.max(1, maxY - minY + padding);
    const nextZoom = clamp(Math.min(viewportW / boxW, viewportH / boxH), 0.3, 2.5);
    this.zoom = nextZoom;
    this.panX = (viewportW - (maxX - minX) * nextZoom) / 2 - minX * nextZoom;
    this.panY = (viewportH - (maxY - minY) * nextZoom) / 2 - minY * nextZoom;
    this._applyTransform();
  }

  async _saveBoard() {
    if (!this.activeBoardName) return;
    const payload = this._serializeBoard();
    await this._saveBoardPayload(this.activeBoardName, payload);
  }

  async _saveBoardPayload(name, payload) {
    try {
      await this._fetchJson('/api/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: BOARD_TYPE,
          name,
          content: payload,
        }),
      });
    } catch (err) {
      console.error('[Canvas] Failed to save board', err);
    }
  }

  async _loadLibrary() {
    const results = [];
    await Promise.all(LIBRARY_TYPES.map(async (type) => {
      try {
        const data = await this._fetchJson(`/api/items?type=${type}`, {});
      const items = Array.isArray(data.items) ? data.items : [];
      items.forEach((item) => {
        if (item && item.name) results.push({ type, name: item.name });
      });
    } catch (err) {
      console.warn('[Canvas] Library load failed', type, err);
    }
  }));
    this.libraryItems = results;
    this._renderLibrary();
  }

  _renderLibrary() {
    if (!this.libraryTree) return;
    const query = (this.librarySearch?.value || '').trim().toLowerCase();
    const items = this.libraryItems.filter((item) => {
      if (!query) return true;
      return item.name.toLowerCase().includes(query) || item.type.toLowerCase().includes(query);
    });
    this.libraryTree.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'library-empty';
      empty.textContent = 'No items found.';
      this.libraryTree.appendChild(empty);
      return;
    }
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'dropdown-item';
      row.draggable = true;
      row.dataset.itemType = item.type;
      row.dataset.itemName = item.name;
      row.textContent = `${item.type.toUpperCase()}: ${item.name}`;
      this.libraryTree.appendChild(row);
    });
  }

  _getSnapSize() {
    if (!this.container) return DRAG_SNAP_FALLBACK;
    const value = getComputedStyle(this.container).getPropertyValue('--grid-sub');
    const parsed = Number(String(value || '').replace('px', '').trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DRAG_SNAP_FALLBACK;
  }

  _maybeSnap(x, y, disable, snap) {
    if (disable) return { x, y };
    return {
      x: Math.round(x / snap) * snap,
      y: Math.round(y / snap) * snap,
    };
  }

  async _openNodeRef(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node || !node.ref) return;
    const { type, name } = node.ref;
    if (!type || !name) return;
    try {
      await fetch('/api/cli', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'edit',
          args: [type, name],
          properties: {},
        }),
      });
    } catch (err) {
      console.error('[Canvas] Failed to open item', err);
    }
  }

  _applyNodeMedia(nodeId, media) {
    const node = this.nodes.get(nodeId);
    if (!node || !node.el) return;
    const mediaEl = node.el.querySelector('.node-media');
    if (!mediaEl) return;
    mediaEl.innerHTML = '';
    if (!media || !media.src) return;
    if (media.kind === 'image') {
      const img = document.createElement('img');
      img.src = media.src;
      img.alt = media.name || 'Media';
      img.loading = 'lazy';
      mediaEl.appendChild(img);
    }
  }

  _handleMediaFiles(files, world, targetNode) {
    const list = Array.from(files || []);
    if (!list.length) return;
    const imageFiles = list.filter((file) => file.type && file.type.startsWith('image/'));
    if (!imageFiles.length) return;
    imageFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = () => {
        const media = {
          kind: 'image',
          src: reader.result,
          name: file.name,
          size: file.size,
        };
        if (targetNode) {
          const id = targetNode.dataset.nodeId;
          const node = this.nodes.get(id);
          if (!node) return;
          node.media = media;
          node.type = TOOL_MEDIA;
          this._applyNodeMedia(id, media);
          this._scheduleSave();
          return;
        }
        const offset = index * 24;
        const created = this._spawnNode({
          type: TOOL_MEDIA,
          title: file.name || 'Image',
          content: 'Media',
          x: world.x + offset,
          y: world.y + offset,
          width: 260,
          height: 220,
          media,
          silent: true,
        });
        if (created) {
          this._scheduleSave();
        }
      };
      reader.readAsDataURL(file);
    });
  }

  unmount() {
    if (this.saveTimer) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this._saveBoard();
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
  }
}

export function mount(el, context) {
  const view = new CanvasView();
  view.mount(el, context);
  return view;
}
