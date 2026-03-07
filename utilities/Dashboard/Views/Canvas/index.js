const VIEW_ID = 'canvas';
const BOARD_TYPE = 'canvas_board';
const BOARD_LABEL = 'Boards';
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
const TOOL_FRAME = 'frame';
const TOOL_SHAPE_RECT = 'shape-rect';
const TOOL_SHAPE_ROUND = 'shape-round';
const TOOL_SHAPE_CIRCLE = 'shape-circle';
const TOOL_SHAPE_DIAMOND = 'shape-diamond';
const TOOL_LINE = 'line';
const TOOL_ARROW = 'arrow';

const TOOL_LABELS = {
  [TOOL_SELECT]: 'Select',
  [TOOL_PAN]: 'Pan',
  [TOOL_STICKY]: 'Sticky',
  [TOOL_TEXT]: 'Text',
  [TOOL_DRAW]: 'Draw',
  [TOOL_CONNECT]: 'Connect',
  [TOOL_MEDIA]: 'Media',
  [TOOL_FRAME]: 'Frame',
  [TOOL_SHAPE_RECT]: 'Rectangle',
  [TOOL_SHAPE_ROUND]: 'Pill',
  [TOOL_SHAPE_CIRCLE]: 'Circle',
  [TOOL_SHAPE_DIAMOND]: 'Diamond',
  [TOOL_LINE]: 'Line',
  [TOOL_ARROW]: 'Arrow',
};

const LIBRARY_TYPES = ['task', 'goal', 'project', 'habit', 'commitment', 'note', 'milestone'];
const VISUALIZER_FALLBACK_TYPES = [
  'task',
  'goal',
  'project',
  'habit',
  'commitment',
  'note',
  'milestone',
  'reward',
  'achievement',
  'reminder',
  'alarm',
  'appointment',
  'routine',
  'subroutine',
  'microroutine',
  'day',
  'week',
  'plan',
];
const VISUALIZER_SOURCES = [
  { id: 'matrix', label: 'Matrix Preset' },
  { id: 'items', label: 'Items Filter' },
];
const VISUALIZER_CHARTS = [
  { id: 'bar', label: 'Bar' },
  { id: 'pie', label: 'Pie' },
  { id: 'donut', label: 'Donut' },
  { id: 'radar', label: 'Radar' },
  { id: 'line', label: 'Line' },
];
const VISUALIZER_DIMENSIONS = [
  { id: 'rows', label: 'Rows' },
  { id: 'cols', label: 'Columns' },
];
const VISUALIZER_GROUPS = [
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'category', label: 'Category' },
  { id: 'project', label: 'Project' },
  { id: 'tag', label: 'Tag' },
  { id: 'type', label: 'Type' },
  { id: 'template_type', label: 'Template Type' },
  { id: 'custom', label: 'Custom' },
];
const VISUALIZER_METRICS = [
  { id: 'count', label: 'Count' },
  { id: 'duration', label: 'Total Minutes' },
  { id: 'points', label: 'Points' },
];
const VISUALIZER_DEFAULTS = {
  source: 'matrix',
  chart: 'bar',
  dimension: 'rows',
  groupBy: 'status',
  metric: 'count',
};
const DEFAULT_NODE_STYLE = {
  fill: 'var(--chronos-surface-highlight)',
  stroke: 'var(--chronos-accent)',
  strokeWidth: 2,
  borderStyle: 'solid',
  textAlign: 'center',
  fontSize: 15,
  textColor: 'var(--chronos-text)',
  fontFamily: 'var(--chronos-font-body, "IBM Plex Sans", sans-serif)',
  fontWeight: '500',
  fontStyle: 'normal',
  underline: 'none',
  textShadow: 'none',
  opacity: 1,
  radius: 14,
  shadow: 0.45,
  rotate: 0,
};
const DEFAULT_INK_STYLE = {
  stroke: 'var(--chronos-accent)',
  strokeWidth: 2.2,
  opacity: 0.85,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickJson(value, fallback) {
  if (!value || typeof value !== 'object') return fallback;
  return value;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function titleCaseFromKey(value) {
  return normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function resolveCssColor(value) {
  const raw = normalizeText(value);
  if (!raw) return raw;
  const match = raw.match(/var\((--[^)]+)\)/);
  if (!match) return raw;
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
  return resolved || raw;
}

function resolveTextShadow(value) {
  if (value === 'soft') return '0 4px 12px rgba(0, 0, 0, 0.35)';
  if (value === 'strong') return '0 6px 18px rgba(0, 0, 0, 0.55)';
  return 'none';
}

function isShapeType(type) {
  return [TOOL_SHAPE_RECT, TOOL_SHAPE_ROUND, TOOL_SHAPE_CIRCLE, TOOL_SHAPE_DIAMOND].includes(type);
}

function isLineType(type) {
  return type === TOOL_LINE || type === TOOL_ARROW;
}

function defaultStyleForType(type) {
  if (type === TOOL_TEXT) {
    return {
      ...DEFAULT_NODE_STYLE,
      fill: 'transparent',
      stroke: 'transparent',
      borderStyle: 'solid',
      textAlign: 'left',
      fontSize: 16,
    };
  }
  if (type === TOOL_FRAME) {
    return {
      ...DEFAULT_NODE_STYLE,
      fill: 'transparent',
      borderStyle: 'dashed',
      strokeWidth: 2,
      textAlign: 'left',
    };
  }
  if (isLineType(type)) {
    return {
      ...DEFAULT_NODE_STYLE,
      fill: 'transparent',
      borderStyle: 'solid',
      strokeWidth: 3,
      textAlign: 'left',
    };
  }
  if (isShapeType(type)) {
    return {
      ...DEFAULT_NODE_STYLE,
      textAlign: 'center',
    };
  }
  return { ...DEFAULT_NODE_STYLE };
}

function parseFilterMap(text) {
  const map = {};
  const raw = normalizeText(text);
  if (!raw) return map;
  raw.split(',').forEach((chunk) => {
    const pair = chunk.trim();
    if (!pair || !pair.includes(':')) return;
    const parts = pair.split(':');
    const key = normalizeText(parts.shift()).toLowerCase();
    const value = normalizeText(parts.join(':'));
    if (key && value) map[key] = value;
  });
  return map;
}

function parseDurationToMinutes(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return 0;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  const matches = raw.match(/(\d+(\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/g);
  if (!matches) return 0;
  let total = 0;
  matches.forEach((chunk) => {
    const parts = chunk.trim().split(/\s+/);
    const amount = parseFloat(parts[0]);
    const unit = parts[1] || '';
    if (!Number.isFinite(amount)) return;
    if (unit.startsWith('h')) total += amount * 60;
    else total += amount;
  });
  return total;
}

function parsePoints(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const num = Number(String(value || '').trim());
  return Number.isFinite(num) ? num : 0;
}

function getThemeTokens() {
  const styles = getComputedStyle(document.documentElement);
  return {
    text: normalizeText(styles.getPropertyValue('--chronos-text')) || '#e6e8ef',
    textMuted: normalizeText(styles.getPropertyValue('--chronos-text-muted')) || '#a6adbb',
    accent: normalizeText(styles.getPropertyValue('--chronos-accent')) || '#7aa2f7',
    accentStrong: normalizeText(styles.getPropertyValue('--chronos-accent-strong')) || '#2a55e0',
    success: normalizeText(styles.getPropertyValue('--chronos-success')) || '#22d7a5',
    warning: normalizeText(styles.getPropertyValue('--chronos-warning')) || '#f4c076',
    danger: normalizeText(styles.getPropertyValue('--chronos-danger')) || '#ff9aa2',
    surface: normalizeText(styles.getPropertyValue('--chronos-surface-strong')) || '#0b101a',
  };
}

function getThemePalette(tokens) {
  return [
    tokens.accent,
    tokens.success,
    tokens.warning,
    tokens.danger,
    tokens.accentStrong,
    '#9b7bff',
    '#4cd9ff',
    '#ffa86b',
    '#73f7ff',
    '#ffd86b',
  ];
}

function formatValue(value) {
  if (!Number.isFinite(value)) return '--';
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (value % 1 === 0) return String(value);
  return value.toFixed(1);
}

function buildMatrixSeries(snapshot, dimension) {
  if (!snapshot) return [];
  const rows = snapshot.rows || [];
  const cols = snapshot.cols || [];
  const cells = snapshot.cells || {};
  const useRows = dimension !== 'cols';
  const source = useRows ? rows : cols;
  const opposing = useRows ? cols : rows;
  const entries = source.map((entry) => {
    const total = opposing.reduce((sum, counterpart) => {
      const key = useRows ? `${entry.id}|${counterpart.id}` : `${counterpart.id}|${entry.id}`;
      const value = Number(cells[key]?.value) || 0;
      return sum + value;
    }, 0);
    return { id: entry.id, label: entry.label, value: total };
  });
  entries.sort((a, b) => b.value - a.value);
  return entries.slice(0, 12);
}

function normalizeMatrixSnapshot(snapshot) {
  if (!snapshot) return null;
  if (snapshot.rows && snapshot.cols && snapshot.cells) return snapshot;
  const inner = snapshot.matrix || snapshot.payload || null;
  if (!inner) return null;
  return {
    rows: inner.rows || [],
    cols: inner.cols || [],
    cells: inner.cells || {},
    meta: inner.meta || snapshot.meta || {},
  };
}

function renderBarChart(ctx, width, height, series, tokens, palette) {
  const padding = 32;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const max = series.reduce((m, entry) => Math.max(m, entry.value), 0) || 1;
  const barWidth = chartWidth / series.length - 10;
  ctx.save();
  ctx.translate(padding, padding);
  series.forEach((entry, index) => {
    const valueHeight = (entry.value / max) * (chartHeight - 30);
    const x = index * (barWidth + 10);
    const y = chartHeight - valueHeight;
    ctx.fillStyle = palette[index % palette.length];
    const widthValue = Math.max(barWidth, 8);
    ctx.fillRect(x, y, widthValue, valueHeight);
    ctx.fillStyle = tokens.text;
    ctx.font = '11px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(formatValue(entry.value), x + barWidth / 2, y - 4);
    ctx.save();
    ctx.translate(x + barWidth / 2, chartHeight + 14);
    ctx.rotate(-Math.PI / 8);
    ctx.fillStyle = tokens.textMuted;
    ctx.fillText(entry.label, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

function renderLineChart(ctx, width, height, series, tokens, palette) {
  const padding = 32;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const max = series.reduce((m, entry) => Math.max(m, entry.value), 0) || 1;
  const step = chartWidth / Math.max(series.length - 1, 1);
  ctx.save();
  ctx.translate(padding, padding);
  ctx.strokeStyle = palette[0];
  ctx.lineWidth = 2;
  ctx.beginPath();
  series.forEach((entry, index) => {
    const x = index * step;
    const y = chartHeight - (entry.value / max) * (chartHeight - 12);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  series.forEach((entry, index) => {
    const x = index * step;
    const y = chartHeight - (entry.value / max) * (chartHeight - 12);
    ctx.fillStyle = palette[index % palette.length];
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tokens.textMuted;
    ctx.font = '10px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(entry.label, x, chartHeight + 14);
  });
  ctx.restore();
}

function renderPieChart(ctx, width, height, series, tokens, palette, donut) {
  const radius = Math.min(width, height) / 2 - 20;
  const centerX = width / 2;
  const centerY = height / 2;
  const total = series.reduce((sum, entry) => sum + Math.max(0, entry.value), 0) || 1;
  let angle = -Math.PI / 2;
  series.forEach((entry, index) => {
    const slice = (entry.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.fillStyle = palette[index % palette.length];
    ctx.arc(centerX, centerY, radius, angle, angle + slice);
    ctx.closePath();
    ctx.fill();
    const mid = angle + slice / 2;
    const labelX = centerX + Math.cos(mid) * (radius * 0.65);
    const labelY = centerY + Math.sin(mid) * (radius * 0.65);
    ctx.fillStyle = tokens.surface;
    ctx.font = 'bold 12px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round((entry.value / total) * 100) + '%', labelX, labelY);
    angle += slice;
  });
  if (donut) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = tokens.surface;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function renderRadarChart(ctx, width, height, series, tokens, palette) {
  const limit = Math.min(series.length, 8);
  const reduced = series.slice(0, limit);
  const max = reduced.reduce((m, entry) => Math.max(m, entry.value), 0) || 1;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 28;
  const steps = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;

  for (let step = 1; step <= steps; step++) {
    const levelRadius = (step / steps) * radius;
    ctx.beginPath();
    for (let i = 0; i < limit; i++) {
      const angle = (Math.PI * 2 * i / limit) - Math.PI / 2;
      const x = centerX + Math.cos(angle) * levelRadius;
      const y = centerY + Math.sin(angle) * levelRadius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  reduced.forEach((entry, index) => {
    const angle = (Math.PI * 2 * index / limit) - Math.PI / 2;
    const x = centerX + Math.cos(angle) * (radius + 10);
    const y = centerY + Math.sin(angle) * (radius + 10);
    ctx.fillStyle = tokens.textMuted;
    ctx.font = '10px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(entry.label, x, y);
  });

  ctx.beginPath();
  reduced.forEach((entry, index) => {
    const angle = (Math.PI * 2 * index / limit) - Math.PI / 2;
    const distance = (entry.value / max) * radius;
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.strokeStyle = palette[0];
  ctx.lineWidth = 2;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = palette[0];
  ctx.fill();
  ctx.restore();
  ctx.stroke();
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
    this.isDraggingLineHandle = false;
    this.lineDrag = null;
    this.isDraggingInk = false;
    this.isDraggingInkPoint = false;
    this.inkDrag = null;
    this.inkPointDrag = null;
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
    this.selectedInkId = null;
    this.selectedIds = new Set();
    this.activeBoardName = null;
    this.boardItems = [];
    this.libraryItems = [];
    this.saveTimer = null;
    this.isLoadingBoard = false;
    this.cleanups = [];
    this.linkId = null;
    this.linkToken = null;
    this.inspectorClosed = false;
    this.vizMeta = {
      presets: [],
      matrix: null,
      itemTypes: [],
    };
  }

  async mount(container, context) {
    this.context = context;
    container.id = 'view-canvas';
    container.innerHTML = `
      <link rel="stylesheet" href="./Views/Canvas/canvas.css">
      <div id="canvas-interface">
        <aside id="canvas-sidebar">
          <div class="sidebar-header">
            <button class="icon-btn" data-collapse title="Collapse">≡</button>
            <span>${BOARD_LABEL}</span>
          </div>
          <div class="sidebar-content">
            <div class="library-section">
              <div class="library-label">Boards</div>
              <button class="btn btn-primary" data-new-board style="width:100%">+ New Board</button>
              <div class="board-list" data-board-list></div>
              <button class="btn" data-link-invite style="width:100%; margin-top: 10px;">Invite</button>
            </div>
            <div class="library-section">
              <div class="library-label">Library</div>
              <div class="library-row">
                <label class="library-label">Type</label>
                <select class="input" data-library-type></select>
              </div>
              <div class="library-row">
                <label class="library-label">Search</label>
                <input class="input" data-library-search placeholder="Search items..." />
              </div>
              <div class="library-row">
                <label class="library-label">Filters</label>
                <input class="input" data-library-filter placeholder="status:pending, tag:home" />
              </div>
              <div class="library-row">
                <label class="library-label">Result</label>
                <select class="input" data-library-result></select>
              </div>
              <div class="library-actions">
                <button class="btn btn-primary" data-library-add>Add to Canvas</button>
                <button class="btn" data-library-open>Open</button>
              </div>
            </div>
            <div class="library-section insert-section">
              <div class="library-label">Insert</div>
              <div class="insert-grid" data-insert-grid>
                <button class="insert-tile" data-insert-type="sticky" draggable="true">Sticky</button>
                <button class="insert-tile" data-insert-type="text" draggable="true">Text</button>
                <button class="insert-tile" data-insert-type="shape-rect" draggable="true">Rect</button>
                <button class="insert-tile" data-insert-type="shape-round" draggable="true">Pill</button>
                <button class="insert-tile" data-insert-type="shape-circle" draggable="true">Circle</button>
                <button class="insert-tile" data-insert-type="shape-diamond" draggable="true">Diamond</button>
                <button class="insert-tile" data-insert-type="frame" draggable="true">Frame</button>
                <button class="insert-tile" data-insert-type="line" draggable="true">Line</button>
                <button class="insert-tile" data-insert-type="arrow" draggable="true">Arrow</button>
                <button class="insert-tile" data-insert-type="media" draggable="true">Media</button>
                <button class="insert-tile" data-insert-type="visualizer" draggable="true">Visualizer</button>
              </div>
            </div>
          </div>
        </aside>
        <aside id="canvas-inspector">
          <div class="sidebar-header">
            <span>Inspector</span>
            <span class="inspector-type" data-inspector-type>None</span>
            <button class="icon-btn" data-inspector-close title="Close">✕</button>
          </div>
          <div class="sidebar-content" data-inspector-panel>
            <div class="library-row">
              <label class="library-label">Title</label>
              <input class="input" data-inspector-title placeholder="Untitled" />
            </div>
            <div class="inspector-grid">
              <div class="library-row">
                <label class="library-label">Width</label>
                <input class="input" data-inspector-width type="number" min="40" />
              </div>
              <div class="library-row">
                <label class="library-label">Height</label>
                <input class="input" data-inspector-height type="number" min="40" />
              </div>
            </div>
            <div class="inspector-grid">
              <div class="library-row">
                <label class="library-label">Fill</label>
                <input class="input" data-inspector-fill type="color" />
              </div>
              <div class="library-row">
                <label class="library-label">Stroke</label>
                <input class="input" data-inspector-stroke type="color" />
              </div>
            </div>
            <div class="inspector-grid">
              <div class="library-row">
                <label class="library-label">Stroke Width</label>
                <input class="input" data-inspector-stroke-width type="number" min="0" step="1" />
              </div>
              <div class="library-row">
                <label class="library-label">Border Style</label>
                <select class="input" data-inspector-border-style>
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </div>
            </div>
            <div class="inspector-grid">
              <div class="library-row">
                <label class="library-label">Text Align</label>
                <select class="input" data-inspector-text-align>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
              <div class="library-row">
                <label class="library-label">Font Size</label>
                <input class="input" data-inspector-font-size type="number" min="8" max="64" />
              </div>
            </div>
            <div class="inspector-grid">
              <div class="library-row">
                <label class="library-label">Font Color</label>
                <input class="input" data-inspector-font-color type="color" />
              </div>
              <div class="library-row">
                <label class="library-label">Font Family</label>
                <select class="input" data-inspector-font-family>
                  <option value="Space Grotesk, sans-serif">Space Grotesk</option>
                  <option value="IBM Plex Sans, sans-serif">IBM Plex Sans</option>
                  <option value="IBM Plex Mono, monospace">IBM Plex Mono</option>
                  <option value="Space Mono, monospace">Space Mono</option>
                  <option value="serif">Serif</option>
                </select>
              </div>
            </div>
            <div class="inspector-grid">
              <div class="library-row">
                <label class="library-label">Weight</label>
                <select class="input" data-inspector-font-weight>
                  <option value="400">Regular</option>
                  <option value="600">Semibold</option>
                  <option value="700">Bold</option>
                </select>
              </div>
              <div class="library-row">
                <label class="library-label">Style</label>
                <select class="input" data-inspector-font-style>
                  <option value="normal">Normal</option>
                  <option value="italic">Italic</option>
                </select>
              </div>
            </div>
            <div class="inspector-grid">
              <div class="library-row">
                <label class="library-label">Underline</label>
                <select class="input" data-inspector-underline>
                  <option value="none">None</option>
                  <option value="underline">Underline</option>
                </select>
              </div>
              <div class="library-row">
                <label class="library-label">Text Shadow</label>
                <select class="input" data-inspector-text-shadow>
                  <option value="none">None</option>
                  <option value="soft">Soft</option>
                  <option value="strong">Strong</option>
                </select>
              </div>
            </div>
            <div class="inspector-grid">
              <div class="library-row">
                <label class="library-label">Start X</label>
                <input class="input" data-inspector-line-x1 type="number" />
              </div>
              <div class="library-row">
                <label class="library-label">Start Y</label>
                <input class="input" data-inspector-line-y1 type="number" />
              </div>
            </div>
            <div class="inspector-grid">
              <div class="library-row">
                <label class="library-label">End X</label>
                <input class="input" data-inspector-line-x2 type="number" />
              </div>
              <div class="library-row">
                <label class="library-label">End Y</label>
                <input class="input" data-inspector-line-y2 type="number" />
              </div>
            </div>
            <div class="inspector-grid">
              <div class="library-row">
                <label class="library-label">Rotation</label>
                <input class="input" data-inspector-rotate type="number" min="-180" max="180" />
              </div>
              <div class="library-row">
                <label class="library-label">Corner Radius</label>
                <input class="input" data-inspector-radius type="number" min="0" max="120" />
              </div>
            </div>
            <div class="library-row">
              <label class="library-label">Shadow</label>
              <input class="input" data-inspector-shadow type="range" min="0" max="1" step="0.05" />
            </div>
            <div class="library-row">
              <label class="library-label">Opacity</label>
              <input class="input" data-inspector-opacity type="range" min="0.1" max="1" step="0.05" />
            </div>
          </div>
          <div class="inspector-empty" data-inspector-empty>Select an element.</div>
        </aside>
        <button id="canvas-sidebar-toggle" class="icon-btn" data-sidebar-toggle title="Toggle sidebar">≡</button>
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
        <div id="canvas-context-menu" hidden>
          <button class="context-item" data-action="cut">Cut</button>
          <button class="context-item" data-action="copy">Copy</button>
          <button class="context-item" data-action="paste">Paste</button>
          <button class="context-item" data-action="duplicate">Duplicate</button>
          <button class="context-item" data-action="delete">Delete</button>
          <div class="context-divider"></div>
          <button class="context-item" data-action="select-all">Select All</button>
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
    this.inspector = container.querySelector('#canvas-inspector');
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
    this.contextMenu = container.querySelector('#canvas-context-menu');
    this.boardTitle = container.querySelector('[data-board-title]');
    this.zoomDisplay = container.querySelector('[data-zoom-display]');
    this.librarySearch = container.querySelector('[data-library-search]');
    this.libraryType = container.querySelector('[data-library-type]');
    this.libraryFilter = container.querySelector('[data-library-filter]');
    this.libraryResult = container.querySelector('[data-library-result]');
    this.libraryAdd = container.querySelector('[data-library-add]');
    this.libraryOpen = container.querySelector('[data-library-open]');
    this.insertGrid = container.querySelector('[data-insert-grid]');
    this.sidebarToggle = container.querySelector('[data-sidebar-toggle]');
    this.inspectorPanel = container.querySelector('[data-inspector-panel]');
    this.inspectorEmpty = container.querySelector('[data-inspector-empty]');
    this.inspectorType = container.querySelector('[data-inspector-type]');
    this.inspectorTitle = container.querySelector('[data-inspector-title]');
    this.inspectorWidth = container.querySelector('[data-inspector-width]');
    this.inspectorHeight = container.querySelector('[data-inspector-height]');
    this.inspectorFill = container.querySelector('[data-inspector-fill]');
    this.inspectorStroke = container.querySelector('[data-inspector-stroke]');
    this.inspectorStrokeWidth = container.querySelector('[data-inspector-stroke-width]');
    this.inspectorBorderStyle = container.querySelector('[data-inspector-border-style]');
    this.inspectorTextAlign = container.querySelector('[data-inspector-text-align]');
    this.inspectorFontSize = container.querySelector('[data-inspector-font-size]');
    this.inspectorFontColor = container.querySelector('[data-inspector-font-color]');
    this.inspectorFontFamily = container.querySelector('[data-inspector-font-family]');
    this.inspectorFontWeight = container.querySelector('[data-inspector-font-weight]');
    this.inspectorFontStyle = container.querySelector('[data-inspector-font-style]');
    this.inspectorUnderline = container.querySelector('[data-inspector-underline]');
    this.inspectorTextShadow = container.querySelector('[data-inspector-text-shadow]');
    this.inspectorLineX1 = container.querySelector('[data-inspector-line-x1]');
    this.inspectorLineY1 = container.querySelector('[data-inspector-line-y1]');
    this.inspectorLineX2 = container.querySelector('[data-inspector-line-x2]');
    this.inspectorLineY2 = container.querySelector('[data-inspector-line-y2]');
    this.inspectorRotate = container.querySelector('[data-inspector-rotate]');
    this.inspectorRadius = container.querySelector('[data-inspector-radius]');
    this.inspectorShadow = container.querySelector('[data-inspector-shadow]');
    this.inspectorOpacity = container.querySelector('[data-inspector-opacity]');
    this.inspectorClose = container.querySelector('[data-inspector-close]');
    this.boardList = container.querySelector('[data-board-list]');

    this.panX = 300;
    this.panY = 220;
    this.zoom = 1;
    this._bindUI();
    this._bindWorld();
    this._bindKeyboard();
    await this._loadLinkSettings();
    await this._loadBoards();
    await this._loadVisualizerMetaCache();
    await this._loadLibrary();
    this._applyTransform();
    this._updateInspector();
  }

  _bindUI() {
    const collapseBtn = this.container.querySelector('[data-collapse]');
    if (collapseBtn) {
      const handler = () => this._toggleSidebar();
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

    if (this.libraryFilter) {
      const handler = () => this._renderLibrary();
      this.libraryFilter.addEventListener('input', handler);
      this.cleanups.push(() => this.libraryFilter.removeEventListener('input', handler));
    }

    if (this.libraryType) {
      const handler = () => {
        this._loadLibrary();
      };
      this.libraryType.addEventListener('change', handler);
      this.cleanups.push(() => this.libraryType.removeEventListener('change', handler));
    }

    if (this.libraryAdd) {
      const handler = () => this._addSelectedLibraryItem();
      this.libraryAdd.addEventListener('click', handler);
      this.cleanups.push(() => this.libraryAdd.removeEventListener('click', handler));
    }

    if (this.libraryOpen) {
      const handler = () => this._openSelectedLibraryItem();
      this.libraryOpen.addEventListener('click', handler);
      this.cleanups.push(() => this.libraryOpen.removeEventListener('click', handler));
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

    if (this.insertGrid) {
      const clickHandler = (ev) => {
        const tile = ev.target.closest('[data-insert-type]');
        if (!tile) return;
        this._insertTile(tile.dataset.insertType);
      };
      const dragHandler = (ev) => {
        const tile = ev.target.closest('[data-insert-type]');
        if (!tile) return;
        ev.dataTransfer.setData('application/x-chronos-insert', tile.dataset.insertType || '');
        ev.dataTransfer.setData('text/plain', tile.dataset.insertType || '');
      };
      this.insertGrid.addEventListener('click', clickHandler);
      this.insertGrid.addEventListener('dragstart', dragHandler);
      this.cleanups.push(() => this.insertGrid.removeEventListener('click', clickHandler));
      this.cleanups.push(() => this.insertGrid.removeEventListener('dragstart', dragHandler));
    }

    if (this.sidebarToggle) {
      const handler = () => this._toggleSidebar();
      this.sidebarToggle.addEventListener('click', handler);
      this.cleanups.push(() => this.sidebarToggle.removeEventListener('click', handler));
    }

    if (this.inspectorClose && this.inspector) {
      const handler = () => {
        this.inspectorClosed = true;
        this.inspector.classList.add('collapsed');
        this._clearSelection();
      };
      this.inspectorClose.addEventListener('click', handler);
      this.cleanups.push(() => this.inspectorClose.removeEventListener('click', handler));
    }

    if (this.inspectorTitle) {
      const handler = () => {
        const node = this._getPrimarySelectedNode();
        if (!node) return;
        node.title = this.inspectorTitle.value;
        const titleEl = node.el?.querySelector('.node-title');
        if (titleEl) titleEl.textContent = node.title;
        this._scheduleSave();
      };
      this.inspectorTitle.addEventListener('input', handler);
      this.cleanups.push(() => this.inspectorTitle.removeEventListener('input', handler));
    }
    if (this.inspectorWidth) {
      const handler = () => this._applyInspectorSize();
      this.inspectorWidth.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorWidth.removeEventListener('change', handler));
    }
    if (this.inspectorHeight) {
      const handler = () => this._applyInspectorSize();
      this.inspectorHeight.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorHeight.removeEventListener('change', handler));
    }
    if (this.inspectorFill) {
      const handler = () => this._applyInspectorStyle({ fill: this.inspectorFill.value });
      this.inspectorFill.addEventListener('input', handler);
      this.cleanups.push(() => this.inspectorFill.removeEventListener('input', handler));
    }
    if (this.inspectorStroke) {
      const handler = () => this._applyInspectorStyle({ stroke: this.inspectorStroke.value });
      this.inspectorStroke.addEventListener('input', handler);
      this.cleanups.push(() => this.inspectorStroke.removeEventListener('input', handler));
    }
    if (this.inspectorStrokeWidth) {
      const handler = () => this._applyInspectorStyle({ strokeWidth: Number(this.inspectorStrokeWidth.value) || 0 });
      this.inspectorStrokeWidth.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorStrokeWidth.removeEventListener('change', handler));
    }
    if (this.inspectorBorderStyle) {
      const handler = () => this._applyInspectorStyle({ borderStyle: this.inspectorBorderStyle.value });
      this.inspectorBorderStyle.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorBorderStyle.removeEventListener('change', handler));
    }
    if (this.inspectorTextAlign) {
      const handler = () => this._applyInspectorStyle({ textAlign: this.inspectorTextAlign.value });
      this.inspectorTextAlign.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorTextAlign.removeEventListener('change', handler));
    }
    if (this.inspectorFontSize) {
      const handler = () => this._applyInspectorStyle({ fontSize: Number(this.inspectorFontSize.value) || 12 });
      this.inspectorFontSize.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorFontSize.removeEventListener('change', handler));
    }
    if (this.inspectorFontColor) {
      const handler = () => this._applyInspectorStyle({ textColor: this.inspectorFontColor.value });
      this.inspectorFontColor.addEventListener('input', handler);
      this.cleanups.push(() => this.inspectorFontColor.removeEventListener('input', handler));
    }
    if (this.inspectorFontFamily) {
      const handler = () => this._applyInspectorStyle({ fontFamily: this.inspectorFontFamily.value });
      this.inspectorFontFamily.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorFontFamily.removeEventListener('change', handler));
    }
    if (this.inspectorFontWeight) {
      const handler = () => this._applyInspectorStyle({ fontWeight: this.inspectorFontWeight.value });
      this.inspectorFontWeight.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorFontWeight.removeEventListener('change', handler));
    }
    if (this.inspectorFontStyle) {
      const handler = () => this._applyInspectorStyle({ fontStyle: this.inspectorFontStyle.value });
      this.inspectorFontStyle.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorFontStyle.removeEventListener('change', handler));
    }
    if (this.inspectorUnderline) {
      const handler = () => this._applyInspectorStyle({ underline: this.inspectorUnderline.value });
      this.inspectorUnderline.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorUnderline.removeEventListener('change', handler));
    }
    if (this.inspectorTextShadow) {
      const handler = () => this._applyInspectorStyle({ textShadow: this.inspectorTextShadow.value });
      this.inspectorTextShadow.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorTextShadow.removeEventListener('change', handler));
    }
    if (this.inspectorLineX1) {
      const handler = () => this._applyInspectorLine();
      this.inspectorLineX1.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorLineX1.removeEventListener('change', handler));
    }
    if (this.inspectorLineY1) {
      const handler = () => this._applyInspectorLine();
      this.inspectorLineY1.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorLineY1.removeEventListener('change', handler));
    }
    if (this.inspectorLineX2) {
      const handler = () => this._applyInspectorLine();
      this.inspectorLineX2.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorLineX2.removeEventListener('change', handler));
    }
    if (this.inspectorLineY2) {
      const handler = () => this._applyInspectorLine();
      this.inspectorLineY2.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorLineY2.removeEventListener('change', handler));
    }
    if (this.inspectorRotate) {
      const handler = () => this._applyInspectorStyle({ rotate: Number(this.inspectorRotate.value) || 0 });
      this.inspectorRotate.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorRotate.removeEventListener('change', handler));
    }
    if (this.inspectorRadius) {
      const handler = () => this._applyInspectorStyle({ radius: Number(this.inspectorRadius.value) || 0 });
      this.inspectorRadius.addEventListener('change', handler);
      this.cleanups.push(() => this.inspectorRadius.removeEventListener('change', handler));
    }
    if (this.inspectorShadow) {
      const handler = () => this._applyInspectorStyle({ shadow: Number(this.inspectorShadow.value) || 0 });
      this.inspectorShadow.addEventListener('input', handler);
      this.cleanups.push(() => this.inspectorShadow.removeEventListener('input', handler));
    }
    if (this.inspectorOpacity) {
      const handler = () => this._applyInspectorStyle({ opacity: Number(this.inspectorOpacity.value) || 1 });
      this.inspectorOpacity.addEventListener('input', handler);
      this.cleanups.push(() => this.inspectorOpacity.removeEventListener('input', handler));
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

    if (this.libraryResult) {
      this.libraryResult.draggable = false;
    }

    if (this.contextMenu) {
      const handler = (ev) => {
        const item = ev.target.closest('[data-action]');
        if (!item) return;
        this._handleContextAction(item.dataset.action);
        this._hideContextMenu();
      };
      this.contextMenu.addEventListener('click', handler);
      this.cleanups.push(() => this.contextMenu.removeEventListener('click', handler));
    }

    const hideHandler = (ev) => {
      if (!this.contextMenu || this.contextMenu.hidden) return;
      if (ev.target.closest('#canvas-context-menu')) return;
      this._hideContextMenu();
    };
    window.addEventListener('pointerdown', hideHandler);
    this.cleanups.push(() => window.removeEventListener('pointerdown', hideHandler));
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
      if (ev.button === 2 && ev.ctrlKey) {
        ev.preventDefault();
        this._fitToContent();
        return;
      }
      if (ev.button !== 0) return;
      const targetNode = ev.target.closest('.canvas-node');
      const inkHandle = ev.target.closest('.ink-handle');
      if (inkHandle) {
        const strokeId = inkHandle.dataset.strokeId;
        const pointIndex = Number(inkHandle.dataset.pointIndex);
        this._startInkPointDrag(ev, strokeId, pointIndex);
        return;
      }
      const inkPath = ev.target.closest('.ink-path');
      if (inkPath && this.tool === TOOL_SELECT) {
        const strokeId = inkPath.dataset.strokeId;
        if (strokeId) {
          this._selectInkStroke(strokeId);
          this._startInkDrag(ev, strokeId);
        }
        return;
      }
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
        const additive = ev.ctrlKey || ev.metaKey;
        this._startNodeDrag(ev, targetNode, additive, ev.shiftKey);
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
        this._startSelection(ev, ev.ctrlKey || ev.metaKey);
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
      if (!(ev.ctrlKey || ev.metaKey)) this._clearSelection();
      this._startPan(ev);
    };
    this.worldContainer.addEventListener('pointerdown', pointerDown);
    this.cleanups.push(() => this.worldContainer.removeEventListener('pointerdown', pointerDown));

    const handleContextMenu = (ev) => {
      if (ev.ctrlKey) {
        ev.preventDefault();
        this._fitToContent();
        return;
      }
      ev.preventDefault();
      const inkPath = ev.target.closest('.ink-path');
      const targetNode = ev.target.closest('.canvas-node');
      if (inkPath?.dataset.strokeId) {
        this._selectInkStroke(inkPath.dataset.strokeId);
      } else if (targetNode) {
        this._selectNode(targetNode);
      } else {
        this._clearSelection();
      }
      this._openContextMenu(ev.clientX, ev.clientY);
    };
    this.worldContainer.addEventListener('contextmenu', handleContextMenu);
    this.cleanups.push(() => this.worldContainer.removeEventListener('contextmenu', handleContextMenu));

      const pointerMove = (ev) => {
        if (this.isPanning) this._movePan(ev);
        if (this.isDraggingNode) this._moveNode(ev);
        if (this.isResizingNode) this._moveResize(ev);
        if (this.isDraggingLineHandle) this._moveLineHandle(ev);
        if (this.isDraggingInk) this._moveInkDrag(ev);
        if (this.isDraggingInkPoint) this._moveInkPointDrag(ev);
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
        const wasLineDrag = this.isDraggingLineHandle;
        const wasInkDrag = this.isDraggingInk || this.isDraggingInkPoint;
        if (this.isPanning) this.isPanning = false;
        if (this.isDraggingNode) this.isDraggingNode = false;
        if (this.isResizingNode) this._finishResize();
        if (this.isDraggingLineHandle) this._finishLineHandle();
        if (this.isDraggingInk) this._finishInkDrag();
        if (this.isDraggingInkPoint) this._finishInkPointDrag();
        if (this.isDrawing) this._finishDraw();
        if (this.isSelecting) this._finishSelection();
        if (wasPanning || wasDragging || wasDrawing || wasResizing || wasSelecting || wasLineDrag || wasInkDrag) {
          this._scheduleSave();
        }
      };
    window.addEventListener('pointerup', pointerUp);
    this.cleanups.push(() => window.removeEventListener('pointerup', pointerUp));

    const dropHandler = (ev) => {
      ev.preventDefault();
      const targetNode = ev.target.closest('.canvas-node');
      const itemPayload = ev.dataTransfer.getData('application/x-chronos-item');
      const insertType = ev.dataTransfer.getData('application/x-chronos-insert');
      const world = this._toWorld(ev.clientX, ev.clientY);
      if (ev.dataTransfer.files && ev.dataTransfer.files.length) {
        this._handleMediaFiles(ev.dataTransfer.files, world, targetNode);
        return;
      }
      if (insertType) {
        this._insertTile(insertType, world);
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
        if (key === 'escape') {
          this._hideContextMenu();
          this._clearSelection();
        }
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
        if (key === 'x' && (ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          this._cutSelection();
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

  _startNodeDrag(ev, nodeEl, additive, duplicate) {
    const id = nodeEl.dataset.nodeId;
    if (!id) return;
    if (duplicate) {
      if (!this.selectedIds.has(id)) {
        this.selectedIds = new Set([id]);
        this._syncSelectionStyles();
      }
      this._duplicateSelection({ offsetX: 0, offsetY: 0 });
      const primary = this._getPrimarySelectedNode();
      if (!primary?.el) return;
      nodeEl = primary.el;
    } else {
      this._selectNode(nodeEl, { toggle: additive });
    }
    const activeId = nodeEl.dataset.nodeId;
    if (!this.nodes.get(activeId)) return;
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
    if (node.type === TOOL_SHAPE_CIRCLE || node.type === TOOL_SHAPE_DIAMOND) {
      const size = Math.max(nextW, nextH);
      nextW = size;
      nextH = size;
    }
    const snappedW = ev.altKey ? nextW : Math.round(nextW / snap) * snap;
    const snappedH = ev.altKey ? nextH : Math.round(nextH / snap) * snap;
    if (node.line && this.resizeStart.width && this.resizeStart.height) {
      const scaleX = snappedW / this.resizeStart.width;
      const scaleY = snappedH / this.resizeStart.height;
      node.line.x1 *= scaleX;
      node.line.x2 *= scaleX;
      node.line.y1 *= scaleY;
      node.line.y2 *= scaleY;
    }
    node.width = snappedW;
    node.height = snappedH;
    node.el.style.width = `${snappedW}px`;
    node.el.style.height = `${snappedH}px`;
    this._updateConnections();
    if (isLineType(node.type)) {
      this._applyLineVisual(node.id);
    }
  }

  _finishResize() {
    if (this.resizeStart) {
      const node = this.nodes.get(this.resizeStart.id);
      if (node?.type === 'visualizer' && node.visualizerUI) {
        this._renderVisualizerCanvas(node.visualizerUI, node.visualizerUI.series || [], node.visualizer?.chart || VISUALIZER_DEFAULTS.chart);
      }
    }
    this.isResizingNode = false;
    this.resizeStart = null;
  }

  _startSelection(ev, additive) {
    if (this.tool !== TOOL_SELECT) return;
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
      additive: Boolean(additive),
    };
    if (!additive) this._clearSelection();
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

  _startInkDrag(ev, strokeId) {
    const stroke = this.inkStrokes.find((entry) => entry.id === strokeId);
    if (!stroke) return;
    this.isDraggingInk = true;
    try { this.worldContainer.setPointerCapture(ev.pointerId); } catch {}
    const start = this._toWorld(ev.clientX, ev.clientY);
    const points = (stroke.points || []).map((pt) => (Array.isArray(pt) ? [pt[0], pt[1]] : [pt.x, pt.y]));
    this.inkDrag = { id: strokeId, start, points };
  }

  _moveInkDrag(ev) {
    if (!this.inkDrag) return;
    const stroke = this.inkStrokes.find((entry) => entry.id === this.inkDrag.id);
    if (!stroke) return;
    const next = this._toWorld(ev.clientX, ev.clientY);
    const dx = next.x - this.inkDrag.start.x;
    const dy = next.y - this.inkDrag.start.y;
    stroke.points = this.inkDrag.points.map(([x, y]) => [x + dx, y + dy]);
    this._renderInk();
  }

  _finishInkDrag() {
    this.isDraggingInk = false;
    this.inkDrag = null;
  }

  _startInkPointDrag(ev, strokeId, pointIndex) {
    const stroke = this.inkStrokes.find((entry) => entry.id === strokeId);
    if (!stroke) return;
    if (Number.isNaN(pointIndex)) return;
    this.isDraggingInkPoint = true;
    try { this.worldContainer.setPointerCapture(ev.pointerId); } catch {}
    const start = this._toWorld(ev.clientX, ev.clientY);
    const points = (stroke.points || []).map((pt) => (Array.isArray(pt) ? [pt[0], pt[1]] : [pt.x, pt.y]));
    this.inkPointDrag = { id: strokeId, index: pointIndex, start, points };
    if (this.selectedInkId !== strokeId) this._selectInkStroke(strokeId);
  }

  _moveInkPointDrag(ev) {
    if (!this.inkPointDrag) return;
    const stroke = this.inkStrokes.find((entry) => entry.id === this.inkPointDrag.id);
    if (!stroke) return;
    const next = this._toWorld(ev.clientX, ev.clientY);
    const dx = next.x - this.inkPointDrag.start.x;
    const dy = next.y - this.inkPointDrag.start.y;
    const nextPoints = this.inkPointDrag.points.map(([x, y], idx) => {
      if (idx !== this.inkPointDrag.index) return [x, y];
      return [x + dx, y + dy];
    });
    stroke.points = nextPoints;
    this._renderInk();
  }

  _finishInkPointDrag() {
    this.isDraggingInkPoint = false;
    this.inkPointDrag = null;
  }

  _startDraw(ev) {
    const world = this._toWorld(ev.clientX, ev.clientY);
    this.isDrawing = true;
    try { this.worldContainer.setPointerCapture(ev.pointerId); } catch {}
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${world.x} ${world.y}`);
    path.setAttribute('class', 'ink-path');
    const strokeId = `ink_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const style = { ...DEFAULT_INK_STYLE };
    path.dataset.strokeId = strokeId;
    path.style.stroke = resolveCssColor(style.stroke);
    path.style.strokeWidth = style.strokeWidth;
    path.style.opacity = style.opacity;
    this.inkLayer.appendChild(path);
    this.currentInkPath = { id: strokeId, path, points: [world], style };
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
        id: this.currentInkPath.id,
        points: this.currentInkPath.points.map((pt) => [pt.x, pt.y]),
        style: this.currentInkPath.style,
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
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--canvas-accent)"></path>
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

  _spawnNode({ type, title, content, x, y, width, height, ref, media, visualizer, style, line, silent }) {
    const nodeId = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const node = document.createElement('div');
    node.className = 'canvas-node';
    node.dataset.nodeId = nodeId;
    if (ref) node.classList.add('has-ref');
    if (type === TOOL_STICKY) node.classList.add('type-sticky');
    if (type === TOOL_TEXT) node.classList.add('type-text');
    if (type === TOOL_FRAME) node.classList.add('type-frame');
    if (isShapeType(type)) node.classList.add(`type-${type}`);
    if (type === TOOL_LINE) node.classList.add('type-line');
    if (type === TOOL_ARROW) node.classList.add('type-arrow');
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
    if (contentEl && type !== 'visualizer' && !isLineType(type)) {
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
      visualizer: visualizer || null,
      style: style || defaultStyleForType(type),
      line: isLineType(type)
        ? (line || { x1: 8, y1: size.height / 2, x2: Math.max(60, size.width - 8), y2: size.height / 2 })
        : null,
      el: node,
    });
    this._applyNodeStyle(nodeId);
    if (media) {
      this._applyNodeMedia(nodeId, media);
    }
    if (type === 'visualizer') {
      this._applyVisualizerNode(nodeId, visualizer || {});
    }
    if (isLineType(type)) {
      this._applyLineVisual(nodeId);
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
      if (!stroke.id) {
        stroke.id = `ink_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      }
      const style = { ...DEFAULT_INK_STYLE, ...(stroke.style || {}) };
      stroke.style = style;
      const points = (stroke.points || []).map((pt) => (Array.isArray(pt) ? pt : [pt.x, pt.y]));
      if (points.length < 2) return;
      const d = points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt[0]} ${pt[1]}`).join(' ');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', `ink-path${stroke.id === this.selectedInkId ? ' selected' : ''}`);
      path.dataset.strokeId = stroke.id;
      path.style.stroke = resolveCssColor(style.stroke);
      path.style.strokeWidth = style.strokeWidth;
      path.style.opacity = style.opacity ?? 1;
      this.inkLayer.appendChild(path);
      if (stroke.id === this.selectedInkId) {
        points.forEach((pt, idx) => {
          const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          handle.setAttribute('class', 'ink-handle');
          handle.setAttribute('cx', pt[0]);
          handle.setAttribute('cy', pt[1]);
          handle.setAttribute('r', '5');
          handle.dataset.strokeId = stroke.id;
          handle.dataset.pointIndex = String(idx);
          this.inkLayer.appendChild(handle);
        });
      }
    });
  }

  _selectNode(nodeEl, opts = {}) {
    const id = nodeEl.dataset.nodeId;
    if (!id) return;
    if (this.selectedInkId) {
      this.selectedInkId = null;
      this._renderInk();
    }
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
    this._updateInspector();
  }

  _clearSelection() {
    this.selectedIds.clear();
    if (this.selectedInkId) {
      this.selectedInkId = null;
      this._renderInk();
    }
    this._syncSelectionStyles();
    this.pendingConnection = null;
    this._updateInspector();
  }

  _getSelected() {
    const el = this.nodesLayer.querySelector('.canvas-node.selected');
    if (!el) return null;
    return this.nodes.get(el.dataset.nodeId);
  }

  _getSelectedInk() {
    if (!this.selectedInkId) return null;
    return this.inkStrokes.find((stroke) => stroke.id === this.selectedInkId) || null;
  }

  _selectInkStroke(strokeId) {
    if (!strokeId) return;
    this.selectedIds.clear();
    this._syncSelectionStyles();
    this.selectedInkId = strokeId;
    this._renderInk();
    this._updateInspector();
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
    if (this.selectedInkId) {
      this.selectedInkId = null;
      this._renderInk();
    }
    this._syncSelectionStyles();
    this._updateInspector();
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

  _duplicateSelection(opts = {}) {
    const selected = this._getSelectedNodes();
    const stroke = this._getSelectedInk();
    if (!selected.length && !stroke) return;
    const offsetX = Number(opts.offsetX ?? 40);
    const offsetY = Number(opts.offsetY ?? 40);
    const newIds = [];
    selected.forEach((node) => {
      const clone = {
        type: node.type,
        title: node.title,
        content: node.content,
        x: node.x + offsetX,
        y: node.y + offsetY,
        width: node.width,
        height: node.height,
        ref: node.ref || null,
        visualizer: node.visualizer ? { ...node.visualizer } : null,
        style: node.style ? { ...node.style } : null,
        line: node.line ? { ...node.line } : null,
      };
      const newNode = this._spawnNode({ ...clone, silent: true });
      if (newNode) newIds.push(newNode.id);
    });
    this.selectedIds = new Set(newIds);
    this._syncSelectionStyles();
    if (stroke) {
      const points = (stroke.points || []).map((pt) => (Array.isArray(pt) ? pt : [pt.x, pt.y]));
      const nextStroke = {
        id: `ink_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        points: points.map(([x, y]) => [x + offsetX, y + offsetY]),
        style: { ...(stroke.style || DEFAULT_INK_STYLE) },
      };
      this.inkStrokes.push(nextStroke);
      this.selectedInkId = nextStroke.id;
      this._renderInk();
    }
    this._scheduleSave();
  }

  _copySelection() {
    const selected = this._getSelectedNodes();
    const stroke = this._getSelectedInk();
    if (!selected.length && !stroke) return;
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
      visualizer: node.visualizer ? { ...node.visualizer } : null,
      style: node.style ? { ...node.style } : null,
      line: node.line ? { ...node.line } : null,
    }));
    const connections = this.connections.filter((conn) => selectedIds.has(conn.from) && selectedIds.has(conn.to));
    const ink = [];
    if (stroke) {
      const points = (stroke.points || []).map((pt) => (Array.isArray(pt) ? pt : [pt.x, pt.y]));
      const xs = points.map((pt) => pt[0]);
      const ys = points.map((pt) => pt[1]);
      const inkMinX = xs.length ? Math.min(...xs) : 0;
      const inkMinY = ys.length ? Math.min(...ys) : 0;
      minX = Math.min(minX, inkMinX);
      minY = Math.min(minY, inkMinY);
      ink.push({
        points,
        style: { ...(stroke.style || DEFAULT_INK_STYLE) },
      });
    }
    if (!Number.isFinite(minX)) minX = 0;
    if (!Number.isFinite(minY)) minY = 0;
    this.clipboard = { nodes, connections, origin: { x: minX, y: minY } };
    if (ink.length) this.clipboard.ink = ink;
  }

  _cutSelection() {
    if (!this._getSelectedNodes().length && !this.selectedInkId) return;
    this._copySelection();
    this._deleteSelection();
  }

  _pasteSelection() {
    if (!this.clipboard || (!this.clipboard.nodes?.length && !this.clipboard.ink?.length)) return;
    const base = this.lastPointerWorld || { x: 0, y: 0 };
    const idMap = new Map();
    const newIds = [];
    const connections = Array.isArray(this.clipboard.connections) ? this.clipboard.connections : [];
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
        visualizer: node.visualizer ? { ...node.visualizer } : null,
        style: node.style ? { ...node.style } : null,
        line: node.line ? { ...node.line } : null,
        silent: true,
      });
      if (created) {
        idMap.set(node.id, created.id);
        newIds.push(created.id);
      }
    });
    connections.forEach((conn) => {
      const from = idMap.get(conn.from);
      const to = idMap.get(conn.to);
      if (from && to) this.connections.push({ from, to });
    });
    if (Array.isArray(this.clipboard.ink) && this.clipboard.ink.length) {
      const origin = this.clipboard.origin || { x: 0, y: 0 };
      this.clipboard.ink.forEach((stroke) => {
        const points = (stroke.points || []).map((pt) => (Array.isArray(pt) ? pt : [pt[0], pt[1]]));
        const nextStroke = {
          id: `ink_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          points: points.map(([x, y]) => [x - origin.x + base.x, y - origin.y + base.y]),
          style: { ...(stroke.style || DEFAULT_INK_STYLE) },
        };
        this.inkStrokes.push(nextStroke);
        this.selectedInkId = nextStroke.id;
      });
      this._renderInk();
    }
    this.selectedIds = new Set(newIds);
    this._syncSelectionStyles();
    this._updateConnections();
    this._scheduleSave();
  }

  _deleteSelection() {
    const selected = this._getSelectedNodes();
    if (!selected.length && !this.selectedInkId) return;
    selected.forEach((node) => {
      node.el.remove();
      this.nodes.delete(node.id);
      this.connections = this.connections.filter((conn) => conn.from !== node.id && conn.to !== node.id);
    });
    this.selectedIds.clear();
    if (this.selectedInkId) {
      this.inkStrokes = this.inkStrokes.filter((stroke) => stroke.id !== this.selectedInkId);
      this.selectedInkId = null;
      this._renderInk();
    }
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
    const base = 'Board';
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
        visualizer: node.visualizer || null,
        style: node.style || null,
        line: node.line || null,
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
      const contentValue = node.type === 'visualizer'
        ? (node.content || '')
        : (contentEl ? contentEl.textContent || '' : node.content || '');
      nodes.push({
        id: node.id,
        type: node.type,
        title: titleEl ? titleEl.textContent || '' : node.title,
        content: contentValue,
        x: node.x,
        y: node.y,
        width: rect ? rect.width : node.width,
        height: rect ? rect.height : node.height,
        ref: node.ref || null,
        media: node.media || null,
        visualizer: node.visualizer || null,
        style: node.style || null,
        line: node.line || null,
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
    const types = this.vizMeta.itemTypes.length ? this.vizMeta.itemTypes : VISUALIZER_FALLBACK_TYPES;
    if (this.libraryType) {
      this.libraryType.innerHTML = '';
      types.forEach((type) => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = titleCaseFromKey(type);
        this.libraryType.appendChild(option);
      });
      if (!this.libraryType.value) {
        this.libraryType.value = types[0] || 'task';
      }
    }
    const selected = this.libraryType?.value || types[0] || 'task';
    try {
      const data = await this._fetchJson(`/api/items?type=${encodeURIComponent(selected)}`, {});
      this.libraryItems = Array.isArray(data.items) ? data.items : [];
    } catch (err) {
      console.warn('[Canvas] Library load failed', selected, err);
      this.libraryItems = [];
    }
    this._renderLibrary();
  }

  _renderLibrary() {
    if (!this.libraryResult) return;
    const query = (this.librarySearch?.value || '').trim().toLowerCase();
    const filters = parseFilterMap(this.libraryFilter?.value || '');
    const items = this._applyItemFilters(this.libraryItems, filters).filter((item) => {
      if (!query) return true;
      const name = String(item.name || '').toLowerCase();
      return name.includes(query);
    });
    this.libraryResult.innerHTML = '';
    if (!items.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No items found';
      this.libraryResult.appendChild(option);
      return;
    }
    items.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.name;
      const status = item.status ? ` • ${item.status}` : '';
      const priority = item.priority ? ` • ${item.priority}` : '';
      option.textContent = `${item.name}${status}${priority}`;
      this.libraryResult.appendChild(option);
    });
  }

  _getPrimarySelectedNode() {
    const selected = this._getSelectedNodes();
    return selected.length ? selected[0] : null;
  }

  _applyInspectorSize() {
    const node = this._getPrimarySelectedNode();
    if (!node) return;
    const width = Number(this.inspectorWidth?.value) || node.width;
    const height = Number(this.inspectorHeight?.value) || node.height;
    let nextW = Math.max(MIN_NODE_WIDTH, width);
    let nextH = Math.max(MIN_NODE_HEIGHT, height);
    if (node.type === TOOL_SHAPE_CIRCLE || node.type === TOOL_SHAPE_DIAMOND) {
      const size = Math.max(nextW, nextH);
      nextW = size;
      nextH = size;
    }
    if (node.line && node.width && node.height) {
      const scaleX = nextW / node.width;
      const scaleY = nextH / node.height;
      node.line.x1 *= scaleX;
      node.line.x2 *= scaleX;
      node.line.y1 *= scaleY;
      node.line.y2 *= scaleY;
    }
    node.width = nextW;
    node.height = nextH;
    if (node.el) {
      node.el.style.width = `${node.width}px`;
      node.el.style.height = `${node.height}px`;
    }
    if (isLineType(node.type)) {
      this._applyLineVisual(node.id);
    }
    if (node.type === 'visualizer' && node.visualizerUI) {
      this._renderVisualizerCanvas(node.visualizerUI, node.visualizerUI.series || [], node.visualizer?.chart || VISUALIZER_DEFAULTS.chart);
    }
    this._updateConnections();
    this._scheduleSave();
  }

  _applyInspectorStyle(next) {
    const node = this._getPrimarySelectedNode();
    if (!node) {
      const stroke = this._getSelectedInk();
      if (!stroke) return;
      const style = { ...DEFAULT_INK_STYLE, ...(stroke.style || {}) };
      if (next.stroke) style.stroke = next.stroke;
      if (Number.isFinite(next.strokeWidth)) style.strokeWidth = next.strokeWidth;
      if (Number.isFinite(next.opacity)) style.opacity = next.opacity;
      stroke.style = style;
      this._renderInk();
      this._scheduleSave();
      return;
    }
    node.style = { ...node.style, ...next };
    this._applyNodeStyle(node.id);
    if (isLineType(node.type)) {
      this._applyLineVisual(node.id);
    }
    if (node.type === 'visualizer' && node.visualizerUI) {
      this._renderVisualizerCanvas(node.visualizerUI, node.visualizerUI.series || [], node.visualizer?.chart || VISUALIZER_DEFAULTS.chart);
    }
    this._scheduleSave();
  }

  _applyInspectorLine() {
    const node = this._getPrimarySelectedNode();
    if (!node || !isLineType(node.type)) return;
    const x1 = Number(this.inspectorLineX1?.value);
    const y1 = Number(this.inspectorLineY1?.value);
    const x2 = Number(this.inspectorLineX2?.value);
    const y2 = Number(this.inspectorLineY2?.value);
    if (!node.line) node.line = { x1: 8, y1: 8, x2: 60, y2: 8 };
    if (Number.isFinite(x1)) node.line.x1 = x1;
    if (Number.isFinite(y1)) node.line.y1 = y1;
    if (Number.isFinite(x2)) node.line.x2 = x2;
    if (Number.isFinite(y2)) node.line.y2 = y2;
    this._ensureLineBounds(node);
    this._applyLineVisual(node.id);
    this._scheduleSave();
  }

  _openContextMenu(clientX, clientY) {
    if (!this.contextMenu || !this.container) return;
    const hasNodeSelection = this.selectedIds.size > 0;
    const hasInkSelection = Boolean(this.selectedInkId);
    const canPaste = Boolean(this.clipboard && this.clipboard.nodes && this.clipboard.nodes.length);
    const canSelectAll = this.nodes.size > 0;
    const actionStates = {
      cut: hasNodeSelection || hasInkSelection,
      copy: hasNodeSelection || hasInkSelection,
      paste: canPaste || Boolean(this.clipboard?.ink?.length),
      duplicate: hasNodeSelection || hasInkSelection,
      delete: hasNodeSelection || hasInkSelection,
      'select-all': canSelectAll,
    };
    this.contextMenu.querySelectorAll('[data-action]').forEach((item) => {
      const action = item.dataset.action;
      const enabled = actionStates[action] ?? true;
      item.disabled = !enabled;
      item.classList.toggle('disabled', !enabled);
    });
    this.contextMenu.hidden = false;
    const rect = this.container.getBoundingClientRect();
    const leftBase = clientX - rect.left;
    const topBase = clientY - rect.top;
    const menuRect = this.contextMenu.getBoundingClientRect();
    const left = clamp(leftBase, 8, Math.max(8, rect.width - menuRect.width - 8));
    const top = clamp(topBase, 8, Math.max(8, rect.height - menuRect.height - 8));
    this.contextMenu.style.left = `${left}px`;
    this.contextMenu.style.top = `${top}px`;
  }

  _hideContextMenu() {
    if (!this.contextMenu) return;
    this.contextMenu.hidden = true;
  }

  _handleContextAction(action) {
    switch (action) {
      case 'cut':
        this._cutSelection();
        break;
      case 'copy':
        this._copySelection();
        break;
      case 'paste':
        this._pasteSelection();
        break;
      case 'duplicate':
        this._duplicateSelection();
        break;
      case 'delete':
        this._deleteSelection();
        break;
      case 'select-all':
        this._selectAll();
        break;
      default:
        break;
    }
  }

  _applyNodeStyle(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node || !node.el) return;
    const style = node.style || defaultStyleForType(node.type);
    node.style = style;
    node.el.style.setProperty('--node-fill', style.fill || 'transparent');
    node.el.style.setProperty('--node-stroke', style.stroke || 'transparent');
    node.el.style.setProperty('--node-border-style', style.borderStyle || 'solid');
    node.el.style.setProperty('--node-stroke-width', `${style.strokeWidth ?? 2}px`);
    node.el.style.setProperty('--node-text-align', style.textAlign || 'left');
    node.el.style.setProperty('--node-font-size', `${style.fontSize ?? 14}px`);
    node.el.style.setProperty('--node-text-color', style.textColor || DEFAULT_NODE_STYLE.textColor);
    node.el.style.setProperty('--node-font-family', style.fontFamily || DEFAULT_NODE_STYLE.fontFamily);
    node.el.style.setProperty('--node-font-weight', style.fontWeight || DEFAULT_NODE_STYLE.fontWeight);
    node.el.style.setProperty('--node-font-style', style.fontStyle || DEFAULT_NODE_STYLE.fontStyle);
    node.el.style.setProperty('--node-underline', style.underline || DEFAULT_NODE_STYLE.underline);
    node.el.style.setProperty('--node-text-shadow', resolveTextShadow(style.textShadow));
    node.el.style.setProperty('--node-opacity', `${style.opacity ?? 1}`);
    node.el.style.setProperty('--node-radius', `${style.radius ?? 14}px`);
    const shadowStrength = style.shadow ?? DEFAULT_NODE_STYLE.shadow;
    node.el.style.setProperty('--node-shadow', shadowStrength > 0
      ? `0 18px 40px rgba(2, 6, 18, ${shadowStrength})`
      : 'none');
    node.el.style.transform = style.rotate ? `rotate(${style.rotate}deg)` : '';
  }

  _applyLineVisual(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node || !node.el) return;
    const contentEl = node.el.querySelector('.node-content');
    if (!contentEl) return;
    contentEl.contentEditable = 'false';
    const stroke = resolveCssColor(node.style?.stroke || DEFAULT_NODE_STYLE.stroke);
    const strokeWidth = node.style?.strokeWidth ?? DEFAULT_NODE_STYLE.strokeWidth;
    const dashStyle = node.style?.borderStyle || 'solid';
    const dashArray = dashStyle === 'dashed' ? '8 6' : dashStyle === 'dotted' ? '2 6' : '';
    const width = node.width || 200;
    const height = node.height || 80;
    if (!node.line) {
      node.line = {
        x1: 8,
        y1: Math.max(8, height / 2),
        x2: Math.max(60, width - 8),
        y2: Math.max(8, height / 2),
      };
    }
    const arrow = node.type === TOOL_ARROW;
    const marker = arrow
      ? `<defs><marker id="arrowhead-${node.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${stroke}"></path></marker></defs>`
      : '';
    const { x1, y1, x2, y2 } = node.line;
    contentEl.innerHTML = `
      <svg class="line-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        ${marker}
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" ${dashArray ? `stroke-dasharray="${dashArray}"` : ''} ${arrow ? `marker-end="url(#arrowhead-${node.id})"` : ''} />
      </svg>
      <div class="line-handle" data-line-handle="start" style="left:${x1}px; top:${y1}px;"></div>
      <div class="line-handle" data-line-handle="end" style="left:${x2}px; top:${y2}px;"></div>
    `;
    const startHandle = contentEl.querySelector('[data-line-handle="start"]');
    const endHandle = contentEl.querySelector('[data-line-handle="end"]');
    const startHandler = (ev) => this._startLineHandleDrag(ev, node.id, 'start');
    const endHandler = (ev) => this._startLineHandleDrag(ev, node.id, 'end');
    if (startHandle) {
      startHandle.addEventListener('pointerdown', startHandler);
      this.cleanups.push(() => startHandle.removeEventListener('pointerdown', startHandler));
    }
    if (endHandle) {
      endHandle.addEventListener('pointerdown', endHandler);
      this.cleanups.push(() => endHandle.removeEventListener('pointerdown', endHandler));
    }
  }

  _startLineHandleDrag(ev, nodeId, handle) {
    ev.stopPropagation();
    ev.preventDefault();
    const node = this.nodes.get(nodeId);
    if (!node) return;
    this.isDraggingLineHandle = true;
    try { this.worldContainer.setPointerCapture(ev.pointerId); } catch {}
    this.lineDrag = { nodeId, handle };
  }

  _moveLineHandle(ev) {
    if (!this.lineDrag) return;
    const node = this.nodes.get(this.lineDrag.nodeId);
    if (!node || !node.el) return;
    const rect = node.el.getBoundingClientRect();
    const scale = this._getScaleFactor();
    let x = (ev.clientX - rect.left) / scale;
    let y = (ev.clientY - rect.top) / scale;
    if (!node.line) {
      node.line = { x1: 8, y1: rect.height / 2, x2: rect.width - 8, y2: rect.height / 2 };
    }
    const delta = this._ensureLineBounds(node, x, y);
    x = delta.x;
    y = delta.y;
    if (this.lineDrag.handle === 'start') {
      node.line.x1 = x;
      node.line.y1 = y;
    } else {
      node.line.x2 = x;
      node.line.y2 = y;
    }
    this._applyLineVisual(node.id);
  }

  _finishLineHandle() {
    this.isDraggingLineHandle = false;
    this.lineDrag = null;
  }

  _ensureLineBounds(node, x, y) {
    let nextX = x;
    let nextY = y;
    let shiftX = 0;
    let shiftY = 0;
    if (nextX < 0) {
      shiftX = nextX;
      nextX = 0;
    } else if (nextX > node.width) {
      node.width = nextX;
    }
    if (nextY < 0) {
      shiftY = nextY;
      nextY = 0;
    } else if (nextY > node.height) {
      node.height = nextY;
    }
    if (shiftX || shiftY) {
      node.x += shiftX;
      node.y += shiftY;
      node.width = Math.max(MIN_NODE_WIDTH, node.width - shiftX);
      node.height = Math.max(MIN_NODE_HEIGHT, node.height - shiftY);
      if (node.line) {
        node.line.x1 -= shiftX;
        node.line.x2 -= shiftX;
        node.line.y1 -= shiftY;
        node.line.y2 -= shiftY;
      }
      if (node.el) {
        node.el.style.left = `${node.x}px`;
        node.el.style.top = `${node.y}px`;
        node.el.style.width = `${node.width}px`;
        node.el.style.height = `${node.height}px`;
      }
    }
    return { x: nextX, y: nextY };
  }

  _updateInspector() {
    if (!this.inspectorPanel || !this.inspectorEmpty) return;
    const node = this._getPrimarySelectedNode();
    const stroke = this._getSelectedInk();
    const hasSelection = Boolean(node || stroke);
    if (!hasSelection) {
      this.inspectorPanel.style.display = 'none';
      this.inspectorEmpty.style.display = 'block';
      if (this.inspectorType) this.inspectorType.textContent = 'None';
      if (this.inspector && this.inspectorClosed) {
        this.inspector.classList.add('collapsed');
      }
      return;
    }
    if (this.inspector) {
      this.inspectorClosed = false;
      this.inspector.classList.remove('collapsed');
    }
    this.inspectorPanel.style.display = 'block';
    this.inspectorEmpty.style.display = 'none';

    const tokens = getThemeTokens();
    const style = node ? (node.style || defaultStyleForType(node.type)) : { ...DEFAULT_INK_STYLE, ...(stroke.style || {}) };

    const setDisabled = (disabled, list) => {
      list.forEach((el) => {
        if (el) el.disabled = disabled;
      });
    };

    if (stroke && !node) {
      if (this.inspectorType) this.inspectorType.textContent = 'Drawing';
      if (this.inspectorTitle) this.inspectorTitle.value = 'Drawing';
      const points = (stroke.points || []).map((pt) => (Array.isArray(pt) ? pt : [pt.x, pt.y]));
      const xs = points.map((pt) => pt[0]);
      const ys = points.map((pt) => pt[1]);
      const width = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
      const height = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
      if (this.inspectorWidth) this.inspectorWidth.value = Math.round(width || 0);
      if (this.inspectorHeight) this.inspectorHeight.value = Math.round(height || 0);
      if (this.inspectorFill) this.inspectorFill.value = tokens.accent;
      if (this.inspectorStroke) this.inspectorStroke.value = style.stroke?.startsWith('#') ? style.stroke : tokens.accent;
      if (this.inspectorStrokeWidth) this.inspectorStrokeWidth.value = style.strokeWidth ?? DEFAULT_INK_STYLE.strokeWidth;
      if (this.inspectorOpacity) this.inspectorOpacity.value = style.opacity ?? DEFAULT_INK_STYLE.opacity;
      setDisabled(true, [
        this.inspectorTitle,
        this.inspectorWidth,
        this.inspectorHeight,
        this.inspectorFill,
        this.inspectorBorderStyle,
        this.inspectorTextAlign,
        this.inspectorFontSize,
        this.inspectorFontColor,
        this.inspectorFontFamily,
        this.inspectorFontWeight,
        this.inspectorFontStyle,
        this.inspectorUnderline,
        this.inspectorTextShadow,
        this.inspectorLineX1,
        this.inspectorLineY1,
        this.inspectorLineX2,
        this.inspectorLineY2,
        this.inspectorRotate,
        this.inspectorRadius,
        this.inspectorShadow,
      ]);
      setDisabled(false, [this.inspectorStroke, this.inspectorStrokeWidth, this.inspectorOpacity]);
      return;
    }

    if (this.inspectorType) this.inspectorType.textContent = titleCaseFromKey(node.type || 'node');
    if (this.inspectorTitle) this.inspectorTitle.value = node.title || '';
    if (this.inspectorWidth) this.inspectorWidth.value = Math.round(node.width || 0);
    if (this.inspectorHeight) this.inspectorHeight.value = Math.round(node.height || 0);
    if (this.inspectorFill) {
      this.inspectorFill.value = style.fill && style.fill.startsWith('#') ? style.fill : tokens.accent;
    }
    if (this.inspectorStroke) {
      this.inspectorStroke.value = style.stroke && style.stroke.startsWith('#') ? style.stroke : tokens.accent;
    }
    if (this.inspectorStrokeWidth) this.inspectorStrokeWidth.value = style.strokeWidth ?? DEFAULT_NODE_STYLE.strokeWidth;
    if (this.inspectorBorderStyle) this.inspectorBorderStyle.value = style.borderStyle || 'solid';
    if (this.inspectorTextAlign) this.inspectorTextAlign.value = style.textAlign || 'left';
    if (this.inspectorFontSize) this.inspectorFontSize.value = style.fontSize ?? DEFAULT_NODE_STYLE.fontSize;
    if (this.inspectorFontColor) this.inspectorFontColor.value = style.textColor && style.textColor.startsWith('#') ? style.textColor : tokens.text;
    if (this.inspectorFontFamily) this.inspectorFontFamily.value = style.fontFamily || DEFAULT_NODE_STYLE.fontFamily;
    if (this.inspectorFontWeight) this.inspectorFontWeight.value = style.fontWeight || DEFAULT_NODE_STYLE.fontWeight;
    if (this.inspectorFontStyle) this.inspectorFontStyle.value = style.fontStyle || DEFAULT_NODE_STYLE.fontStyle;
    if (this.inspectorUnderline) this.inspectorUnderline.value = style.underline || DEFAULT_NODE_STYLE.underline;
    if (this.inspectorTextShadow) this.inspectorTextShadow.value = style.textShadow || DEFAULT_NODE_STYLE.textShadow;
    if (this.inspectorRotate) this.inspectorRotate.value = style.rotate ?? DEFAULT_NODE_STYLE.rotate;
    if (this.inspectorRadius) this.inspectorRadius.value = style.radius ?? DEFAULT_NODE_STYLE.radius;
    if (this.inspectorShadow) this.inspectorShadow.value = style.shadow ?? DEFAULT_NODE_STYLE.shadow;
    if (this.inspectorOpacity) this.inspectorOpacity.value = style.opacity ?? 1;
    const lineEnabled = isLineType(node.type);
    if (this.inspectorLineX1) this.inspectorLineX1.value = lineEnabled ? Math.round(node.line?.x1 ?? 0) : '';
    if (this.inspectorLineY1) this.inspectorLineY1.value = lineEnabled ? Math.round(node.line?.y1 ?? 0) : '';
    if (this.inspectorLineX2) this.inspectorLineX2.value = lineEnabled ? Math.round(node.line?.x2 ?? 0) : '';
    if (this.inspectorLineY2) this.inspectorLineY2.value = lineEnabled ? Math.round(node.line?.y2 ?? 0) : '';
    setDisabled(false, [
      this.inspectorTitle,
      this.inspectorWidth,
      this.inspectorHeight,
      this.inspectorFill,
      this.inspectorStroke,
      this.inspectorStrokeWidth,
      this.inspectorBorderStyle,
      this.inspectorTextAlign,
      this.inspectorFontSize,
      this.inspectorFontColor,
      this.inspectorFontFamily,
      this.inspectorFontWeight,
      this.inspectorFontStyle,
      this.inspectorUnderline,
      this.inspectorTextShadow,
      this.inspectorLineX1,
      this.inspectorLineY1,
      this.inspectorLineX2,
      this.inspectorLineY2,
      this.inspectorRotate,
      this.inspectorRadius,
      this.inspectorShadow,
      this.inspectorOpacity,
    ]);
    setDisabled(!lineEnabled, [
      this.inspectorLineX1,
      this.inspectorLineY1,
      this.inspectorLineX2,
      this.inspectorLineY2,
    ]);
  }

  async _loadVisualizerMetaCache() {
    try {
      const data = await this._fetchJson('/api/cockpit/matrix/presets', {});
      this.vizMeta.presets = Array.isArray(data.presets) ? data.presets : [];
    } catch (err) {
      console.warn('[Canvas] Visualizer presets failed', err);
      this.vizMeta.presets = [];
    }
    try {
      const data = await this._fetchJson('/api/cockpit/matrix?meta=true', {});
      const itemTypes = Array.isArray(data.item_types) ? data.item_types : [];
      const templateTypes = Array.isArray(data.template_types) ? data.template_types : [];
      const merged = Array.from(new Set([...itemTypes, ...templateTypes])).filter(Boolean);
      this.vizMeta.itemTypes = merged.length ? merged : [...VISUALIZER_FALLBACK_TYPES];
    } catch (err) {
      console.warn('[Canvas] Visualizer meta failed', err);
      this.vizMeta.itemTypes = [...VISUALIZER_FALLBACK_TYPES];
    }
  }

  _addSelectedLibraryItem() {
    const name = this.libraryResult?.value;
    const type = this.libraryType?.value;
    if (!name || !type) return;
    const anchor = this.lastPointerWorld || { x: 240, y: 180 };
    this._spawnNode({
      type,
      title: `${type.toUpperCase()}: ${name}`,
      content: 'Linked item.',
      x: anchor.x,
      y: anchor.y,
      ref: { type, name },
    });
  }

  _openSelectedLibraryItem() {
    const name = this.libraryResult?.value;
    const type = this.libraryType?.value;
    if (!name || !type) return;
    this._openItemInEditor(type, name);
  }

  _insertTile(tileType, worldOverride) {
    const world = worldOverride || this.lastPointerWorld || { x: 260, y: 200 };
    if (!tileType) return;
    if (tileType === 'visualizer') {
      const preset = this.vizMeta.presets[0]?.name || '';
      const config = {
        ...VISUALIZER_DEFAULTS,
        preset,
        itemType: this.vizMeta.itemTypes[0] || 'task',
      };
      this._spawnNode({
        type: 'visualizer',
        title: 'Visualizer',
        content: '',
        x: world.x,
        y: world.y,
        width: 360,
        height: 320,
        visualizer: config,
      });
      return;
    }
    if (tileType === TOOL_MEDIA) {
      this._spawnNode({
        type: TOOL_MEDIA,
        title: 'Media',
        content: 'Drop media here.',
        x: world.x,
        y: world.y,
        width: 260,
        height: 220,
      });
      return;
    }
    if (tileType === TOOL_LINE || tileType === TOOL_ARROW) {
      this._spawnNode({
        type: tileType,
        title: TOOL_LABELS[tileType] || 'Line',
        content: '',
        x: world.x,
        y: world.y,
        width: 240,
        height: 60,
        line: { x1: 12, y1: 30, x2: 228, y2: 30 },
      });
      return;
    }
    if (tileType === TOOL_FRAME) {
      this._spawnNode({
        type: tileType,
        title: 'Frame',
        content: 'Section',
        x: world.x,
        y: world.y,
        width: 420,
        height: 260,
      });
      return;
    }
    if (isShapeType(tileType)) {
      this._spawnNode({
        type: tileType,
        title: TOOL_LABELS[tileType] || 'Shape',
        content: 'Label',
        x: world.x,
        y: world.y,
        width: 220,
        height: 160,
      });
      return;
    }
    const label = TOOL_LABELS[tileType] || titleCaseFromKey(tileType);
    this._spawnNode({
      type: tileType,
      title: label,
      content: tileType === TOOL_TEXT ? 'New text block.' : 'New node.',
      x: world.x,
      y: world.y,
    });
  }

  _toggleSidebar() {
    if (!this.sidebar) return;
    this.sidebar.classList.toggle('collapsed');
  }

  async _fetchMatrixSeries(presetName, dimension) {
    if (!presetName) return { series: [], status: 'No preset selected.' };
    let preset = this.vizMeta.presets.find((entry) => entry.name === presetName);
    if (!preset) {
      return { series: [], status: 'Preset not found.' };
    }
    if (!preset.rows || !preset.cols) {
      try {
        const full = await this._fetchJson(`/api/cockpit/matrix/presets?name=${encodeURIComponent(preset.name)}`, {});
        if (full && full.preset) preset = full.preset;
      } catch {}
    }
    const row = encodeURIComponent(JSON.stringify(preset.rows || []));
    const col = encodeURIComponent(JSON.stringify(preset.cols || []));
    const metric = encodeURIComponent(preset.metric || 'count');
    const filters = preset.filters ? encodeURIComponent(JSON.stringify(preset.filters)) : '';
    const rowSort = encodeURIComponent(preset.row_sort || 'label-asc');
    const colSort = encodeURIComponent(preset.col_sort || 'label-asc');
    const url = `/api/cockpit/matrix?row=${row}&col=${col}&metric=${metric}&row_sort=${rowSort}&col_sort=${colSort}${filters ? `&filters=${filters}` : ''}`;
    const data = await this._fetchJson(url, {});
    const snapshot = normalizeMatrixSnapshot(data);
    const series = buildMatrixSeries(snapshot, dimension);
    return { series, status: `Preset: ${preset.label || preset.name}` };
  }

  async _fetchItemSeries(config) {
    const type = encodeURIComponent(config.itemType || 'task');
    const data = await this._fetchJson(`/api/items?type=${type}`, {});
    const items = Array.isArray(data.items) ? data.items : [];
    const filters = parseFilterMap(config.itemFilters || '');
    const filtered = this._applyItemFilters(items, filters);
    const groupKey = config.groupBy === 'custom' ? normalizeText(config.customGroup) : config.groupBy;
    if (!groupKey) {
      return { series: [], status: 'Add a custom group key.' };
    }
    const series = this._buildItemSeries(filtered, groupKey, config.metric);
    return { series, status: `Items: ${config.itemType}` };
  }

  _applyVisualizerNode(nodeId, config) {
    const node = this.nodes.get(nodeId);
    if (!node || !node.el) return;
    node.el.classList.add('type-visualizer');
    const contentEl = node.el.querySelector('.node-content');
    if (!contentEl) return;
    contentEl.contentEditable = 'false';
    const merged = {
      ...VISUALIZER_DEFAULTS,
      preset: this.vizMeta.presets[0]?.name || '',
      itemType: this.vizMeta.itemTypes[0] || 'task',
      ...config,
    };
    node.visualizer = merged;
    node.content = '';
    contentEl.innerHTML = `
      <div class="viz-node">
        <div class="viz-node-row">
          <label>Source</label>
          <select data-viz-source></select>
        </div>
        <div class="viz-node-panel" data-viz-matrix>
          <label>Preset</label>
          <select data-viz-preset></select>
          <label>Dimension</label>
          <select data-viz-dimension></select>
        </div>
        <div class="viz-node-panel" data-viz-items>
          <label>Type</label>
          <select data-viz-item-type></select>
          <label>Filters</label>
          <input data-viz-item-filters placeholder="status:pending, tag:home" />
          <label>Group By</label>
          <select data-viz-group-by></select>
          <div data-viz-custom-group>
            <label>Custom</label>
            <input data-viz-custom-key placeholder="owner or theme" />
          </div>
          <label>Metric</label>
          <select data-viz-metric></select>
        </div>
        <div class="viz-node-row">
          <div class="viz-node-field">
            <label>Chart</label>
            <select data-viz-chart></select>
          </div>
          <button data-viz-refresh>Refresh</button>
        </div>
        <div class="viz-node-status"></div>
        <div class="viz-node-canvas">
          <canvas></canvas>
          <div class="viz-empty">Load a preset or filter.</div>
        </div>
        <div class="viz-legend"></div>
      </div>
    `;
    const sourceSelect = contentEl.querySelector('[data-viz-source]');
    const presetSelect = contentEl.querySelector('[data-viz-preset]');
    const dimensionSelect = contentEl.querySelector('[data-viz-dimension]');
    const itemTypeSelect = contentEl.querySelector('[data-viz-item-type]');
    const itemFiltersInput = contentEl.querySelector('[data-viz-item-filters]');
    const groupBySelect = contentEl.querySelector('[data-viz-group-by]');
    const customGroupWrap = contentEl.querySelector('[data-viz-custom-group]');
    const customGroupInput = contentEl.querySelector('[data-viz-custom-key]');
    const metricSelect = contentEl.querySelector('[data-viz-metric]');
    const chartSelect = contentEl.querySelector('[data-viz-chart]');
    const refreshBtn = contentEl.querySelector('[data-viz-refresh]');
    const statusEl = contentEl.querySelector('.viz-node-status');
    const canvas = contentEl.querySelector('canvas');
    const emptyEl = contentEl.querySelector('.viz-empty');
    const legendEl = contentEl.querySelector('.viz-legend');

    const fillSelect = (select, options, value) => {
      if (!select) return;
      select.innerHTML = '';
      options.forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.id;
        option.textContent = opt.label;
        select.appendChild(option);
      });
      if (value) select.value = value;
    };

    fillSelect(sourceSelect, VISUALIZER_SOURCES, merged.source);
    fillSelect(presetSelect, this.vizMeta.presets.map((preset) => ({
      id: preset.name,
      label: preset.label || preset.name,
    })), merged.preset);
    fillSelect(dimensionSelect, VISUALIZER_DIMENSIONS, merged.dimension);
    fillSelect(itemTypeSelect, this.vizMeta.itemTypes.map((item) => ({ id: item, label: titleCaseFromKey(item) })), merged.itemType);
    fillSelect(groupBySelect, VISUALIZER_GROUPS, merged.groupBy);
    fillSelect(metricSelect, VISUALIZER_METRICS, merged.metric);
    fillSelect(chartSelect, VISUALIZER_CHARTS, merged.chart);

    if (itemFiltersInput) itemFiltersInput.value = merged.itemFilters || '';
    if (customGroupInput) customGroupInput.value = merged.customGroup || '';
    if (customGroupWrap) customGroupWrap.hidden = merged.groupBy !== 'custom';

    const updateVisibility = () => {
      const isMatrix = merged.source === 'matrix';
      const matrixPanel = contentEl.querySelector('[data-viz-matrix]');
      const itemsPanel = contentEl.querySelector('[data-viz-items]');
      if (matrixPanel) matrixPanel.hidden = !isMatrix;
      if (itemsPanel) itemsPanel.hidden = isMatrix;
    };

    const redraw = (series, status) => {
      if (statusEl) statusEl.textContent = status || '';
      node.visualizerUI.series = series;
      this._renderVisualizerCanvas({ canvas, emptyEl, legendEl }, series, merged.chart);
    };

    const refresh = async () => {
      try {
        if (merged.source === 'matrix') {
          const result = await this._fetchMatrixSeries(merged.preset, merged.dimension);
          redraw(result.series, result.status);
        } else {
          const result = await this._fetchItemSeries(merged);
          redraw(result.series, result.status);
        }
      } catch (err) {
        console.error('[Canvas] Visualizer node failed', err);
        redraw([], 'Failed to load.');
      }
    };

    const bind = (el, event, handler) => {
      if (!el) return;
      el.addEventListener(event, handler);
      this.cleanups.push(() => el.removeEventListener(event, handler));
    };

    bind(sourceSelect, 'change', () => {
      merged.source = sourceSelect.value;
      updateVisibility();
      refresh();
      this._scheduleSave();
    });
    bind(presetSelect, 'change', () => {
      merged.preset = presetSelect.value;
      refresh();
      this._scheduleSave();
    });
    bind(dimensionSelect, 'change', () => {
      merged.dimension = dimensionSelect.value;
      refresh();
      this._scheduleSave();
    });
    bind(itemTypeSelect, 'change', () => {
      merged.itemType = itemTypeSelect.value;
      refresh();
      this._scheduleSave();
    });
    bind(itemFiltersInput, 'input', () => {
      merged.itemFilters = itemFiltersInput.value;
    });
    bind(groupBySelect, 'change', () => {
      merged.groupBy = groupBySelect.value;
      if (customGroupWrap) customGroupWrap.hidden = merged.groupBy !== 'custom';
      refresh();
      this._scheduleSave();
    });
    bind(customGroupInput, 'input', () => {
      merged.customGroup = customGroupInput.value;
    });
    bind(metricSelect, 'change', () => {
      merged.metric = metricSelect.value;
      refresh();
      this._scheduleSave();
    });
    bind(chartSelect, 'change', () => {
      merged.chart = chartSelect.value;
      refresh();
      this._scheduleSave();
    });
    bind(refreshBtn, 'click', refresh);

    node.visualizerUI = { canvas, emptyEl, legendEl, statusEl, refresh, series: [] };
    updateVisibility();
    refresh();
  }

  _renderVisualizerCanvas(ui, series, chartType) {
    const { canvas, emptyEl, legendEl } = ui;
    if (!canvas || !legendEl) return;
    if (!series || !series.length) {
      if (emptyEl) emptyEl.hidden = false;
      legendEl.innerHTML = '';
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    const tokens = getThemeTokens();
    const palette = getThemePalette(tokens);
    const wrapper = canvas.parentElement;
    const rect = wrapper.getBoundingClientRect();
    const styles = getComputedStyle(wrapper);
    const padX = parseFloat(styles.paddingLeft || 0) + parseFloat(styles.paddingRight || 0);
    const padY = parseFloat(styles.paddingTop || 0) + parseFloat(styles.paddingBottom || 0);
    const innerWidth = Math.max(80, rect.width - padX);
    const innerHeight = Math.max(80, rect.height - padY);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    else ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (chartType === 'pie') renderPieChart(ctx, innerWidth, innerHeight, series, tokens, palette, false);
    else if (chartType === 'donut') renderPieChart(ctx, innerWidth, innerHeight, series, tokens, palette, true);
    else if (chartType === 'radar') renderRadarChart(ctx, innerWidth, innerHeight, series, tokens, palette);
    else if (chartType === 'line') renderLineChart(ctx, innerWidth, innerHeight, series, tokens, palette);
    else renderBarChart(ctx, innerWidth, innerHeight, series, tokens, palette);
    legendEl.innerHTML = '';
    series.forEach((entry, index) => {
      const span = document.createElement('span');
      span.style.color = palette[index % palette.length];
      span.textContent = `${entry.label} (${formatValue(entry.value)})`;
      legendEl.appendChild(span);
    });
  }

  _applyItemFilters(items, filters) {
    if (!filters || !Object.keys(filters).length) return items;
    return items.filter((item) => {
      const data = item || {};
      return Object.entries(filters).every(([key, value]) => {
        const needle = String(value || '').toLowerCase();
        if (!needle) return true;
        if (key === 'tag' || key === 'tags') {
          const tags = data.tags || data.tag || [];
          const list = Array.isArray(tags) ? tags : [tags];
          return list.some((tag) => String(tag || '').toLowerCase() === needle);
        }
        const candidate = data[key];
        if (Array.isArray(candidate)) {
          return candidate.some((entry) => String(entry || '').toLowerCase() === needle);
        }
        return String(candidate || '').toLowerCase() === needle;
      });
    });
  }

  _buildItemSeries(items, groupKey, metric) {
    const safeGroup = normalizeText(groupKey || '');
    const groups = new Map();
    const addValue = (label, increment) => {
      const key = label || 'Unspecified';
      const current = groups.get(key) || 0;
      groups.set(key, current + increment);
    };
    items.forEach((item) => {
      const data = item || {};
      const values = [];
      if (safeGroup === 'tag') {
        const tags = data.tags || data.tag || [];
        const list = Array.isArray(tags) ? tags : [tags];
        list.forEach((tag) => values.push(normalizeText(tag)));
      } else if (safeGroup === 'type') {
        values.push(normalizeText(data.type || data.item_type));
      } else {
        const raw = data[safeGroup];
        if (Array.isArray(raw)) raw.forEach((entry) => values.push(normalizeText(entry)));
        else values.push(normalizeText(raw));
      }
      const cleanValues = values.filter((entry) => entry);
      const resolved = cleanValues.length ? cleanValues : ['Unspecified'];
      resolved.forEach((label) => {
        let increment = 1;
        if (metric === 'duration') increment = parseDurationToMinutes(data.duration);
        if (metric === 'points') increment = parsePoints(data.points);
        addValue(label, increment);
      });
    });
    const series = Array.from(groups.entries()).map(([label, value]) => ({ label, value }));
    series.sort((a, b) => b.value - a.value);
    return series.slice(0, 12);
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
    await this._openItemInEditor(type, name);
  }

  async _openItemInEditor(type, name) {
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
