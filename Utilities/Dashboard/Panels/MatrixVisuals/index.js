const STYLE_ID = 'cockpit-matrix-visual-style';
const PANEL_ID = 'matrix-visuals';
const DEFAULT_CHART = 'bar';
const DEFAULT_DIMENSION = 'rows';
const COLOR_PALETTE = [
  '#5d8dff',
  '#6ddccf',
  '#f6a45b',
  '#d97bff',
  '#ff6b81',
  '#7f8cff',
  '#50fa7b',
  '#ffdd57',
  '#2ec7ff',
  '#ff9ff3',
];
const CHART_OPTIONS = [
  { id: 'bar', label: 'Bar' },
  { id: 'pie', label: 'Pie' },
  { id: 'radar', label: 'Radar' },
];
const DIMENSION_OPTIONS = [
  { id: 'rows', label: 'Rows' },
  { id: 'cols', label: 'Columns' },
];

let managerRef = null;
let panelApi = null;
let latestSnapshot = null;

function injectStyles(){
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .matrix-visual-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 12px;
      color: var(--chronos-text);
      font-size: 14px;
    }
    .matrix-visual-toolbar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
    }
    .matrix-visual-toolbar label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: var(--chronos-text-muted);
    }
    .matrix-visual-toolbar select {
      background: var(--chronos-surface-soft);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 6px 10px;
      color: var(--chronos-text);
      font-size: 13px;
    }
    .matrix-visual-actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .matrix-visual-actions button {
      background: var(--chronos-accent-gradient);
      border: none;
      border-radius: 10px;
      color: #fff;
      padding: 8px 16px;
      font-weight: 600;
      cursor: pointer;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .matrix-visual-actions button:hover {
      filter: brightness(1.05);
    }
    .matrix-visual-status {
      font-size: 12px;
      color: var(--chronos-text-muted);
    }
    .matrix-visual-canvas {
      flex: 1;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      background: var(--chronos-surface);
      position: relative;
      display: flex;
      flex-direction: column;
    }
    .matrix-visual-canvas canvas {
      flex: 1;
      width: 100%;
      height: 100%;
    }
    .matrix-visual-empty {
      padding: 18px;
      text-align: center;
      color: var(--chronos-text-muted);
      font-size: 13px;
    }
    .matrix-visual-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .matrix-visual-legend span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--chronos-surface-soft);
      border-radius: 8px;
      padding: 4px 10px;
      font-size: 12px;
      color: var(--chronos-text);
    }
    .matrix-visual-legend span::before {
      content: '';
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: currentColor;
    }
  `;
  document.head.appendChild(style);
}

function createDefinition(){
  return {
    id: PANEL_ID,
    label: 'Matrix Visuals',
    defaultVisible: false,
    defaultPosition: { x: 160, y: 140 },
    size: { width: 560, height: 460 },
    mount: (root)=> mountVisualPanel(root),
    menuKey: PANEL_ID,
    menuLabel: 'Matrix Visuals',
  };
}

function registerPanels(manager){
  injectStyles();
  managerRef = manager;
  manager.registerPanel(createDefinition());
  ensureService();
}

export function register(manager){
  registerPanels(manager);
}

const autoAttach = (manager) => {
  try {
    if (manager && typeof manager.registerPanel === 'function') {
      registerPanels(manager);
    }
  } catch (err) {
    console.error('[Chronos][Panels] Failed to register matrix visuals panel', err);
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

function mountVisualPanel(root){
  injectStyles();
  root.classList.add('matrix-visual-shell');
  root.innerHTML = `
    <div class="matrix-visual-toolbar">
      <label>Chart Type
        <select data-field="chart"></select>
      </label>
      <label>Dimension
        <select data-field="dimension"></select>
      </label>
    </div>
    <div class="matrix-visual-actions">
      <button type="button" data-action="export-image">Export Image</button>
    </div>
    <div class="matrix-visual-status"></div>
    <div class="matrix-visual-canvas">
      <canvas></canvas>
      <div class="matrix-visual-empty" hidden>No matrix snapshot loaded yet.</div>
    </div>
    <div class="matrix-visual-legend"></div>
  `;

  const chartSelect = root.querySelector('select[data-field="chart"]');
  const dimensionSelect = root.querySelector('select[data-field="dimension"]');
  const statusEl = root.querySelector('.matrix-visual-status');
  const canvas = root.querySelector('canvas');
  const emptyEl = root.querySelector('.matrix-visual-empty');
  const legendEl = root.querySelector('.matrix-visual-legend');
  let exportBtn = root.querySelector('button[data-action="export-image"]');
  if (!exportBtn){
    const actions = root.querySelector('.matrix-visual-actions');
    if (actions){
      exportBtn = document.createElement('button');
      exportBtn.type = 'button';
      exportBtn.dataset.action = 'export-image';
      exportBtn.textContent = 'Export Image';
      actions.appendChild(exportBtn);
    }
  }

  CHART_OPTIONS.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.id;
    option.textContent = opt.label;
    chartSelect.appendChild(option);
  });
  DIMENSION_OPTIONS.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.id;
    option.textContent = opt.label;
    dimensionSelect.appendChild(option);
  });
  chartSelect.value = DEFAULT_CHART;
  dimensionSelect.value = DEFAULT_DIMENSION;

  const state = {
    chart: DEFAULT_CHART,
    dimension: DEFAULT_DIMENSION,
    snapshot: null,
  };

  const updateLegend = (series)=>{
    legendEl.innerHTML = '';
    if (!series?.length) return;
    series.forEach((entry, index)=>{
      const span = document.createElement('span');
      span.style.color = pickColor(index);
      span.textContent = `${entry.label} (${formatValue(entry.value)})`;
      legendEl.appendChild(span);
    });
  };

  const setStatus = ()=>{
    if (!state.snapshot){
      statusEl.textContent = 'Waiting for data…';
      return;
    }
    const ctx = state.snapshot.context || {};
    const bits = [];
    if (ctx.metric) bits.push(`Metric: ${ctx.metric}`);
    if (ctx.dimension === 'cols') bits.push('Dimension: columns');
    if (ctx.filters && Object.keys(ctx.filters).length){
      bits.push(`Filters: ${Object.entries(ctx.filters).map(([k, v])=> `${k}:${v}`).join(', ')}`);
    }
    if (state.snapshot.capturedAt){
      bits.push(`Captured ${new Date(state.snapshot.capturedAt).toLocaleTimeString()}`);
    }
    statusEl.textContent = bits.join(' | ');
  };

  const draw = ()=>{
    const payload = state.snapshot;
    if (!payload || !payload.rows?.length || !payload.cols?.length){
      emptyEl.hidden = false;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      legendEl.innerHTML = '';
      return;
    }
    emptyEl.hidden = true;
    const series = buildSeries(payload, state.dimension);
    updateLegend(series);
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.parentElement.getBoundingClientRect();
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    else ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    if (!series.length){
      emptyEl.hidden = false;
      emptyEl.textContent = 'No values found for this dimension.';
      return;
    }
    if (state.chart === 'pie') renderPieChart(ctx, width, height, series);
    else if (state.chart === 'radar') renderRadarChart(ctx, width, height, series);
    else renderBarChart(ctx, width, height, series);
  };

  const exportImage = ()=>{
    if (!state.snapshot){
      statusEl.textContent = 'Load a matrix snapshot before exporting.';
      setTimeout(()=> setStatus(), 2000);
      return;
    }
    const filename = `chronos_matrix_visual_${state.chart}_${Date.now()}.webp`;
    const save = (blob)=>{
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(()=> URL.revokeObjectURL(url), 1000);
      statusEl.textContent = `Exported ${filename}`;
      setTimeout(()=> setStatus(), 2500);
    };
    const fallback = ()=>{
      statusEl.textContent = 'Unable to export image.';
      setTimeout(()=> setStatus(), 2500);
    };
    if (canvas.toBlob){
      canvas.toBlob((blob)=>{
        if (!blob){
          fallback();
          return;
        }
        save(blob);
      }, 'image/webp', 0.92);
    } else {
      try {
        const dataUrl = canvas.toDataURL('image/webp', 0.92);
        const byteString = atob(dataUrl.split(',')[1]);
        const len = byteString.length;
        const arr = new Uint8Array(len);
        for (let i = 0; i < len; i++) arr[i] = byteString.charCodeAt(i);
        save(new Blob([arr], { type: 'image/webp' }));
      } catch (err) {
        console.warn('[Chronos][MatrixVisuals] Export failed', err);
        fallback();
      }
    }
  };

  chartSelect.addEventListener('change', ()=>{
    state.chart = chartSelect.value;
    draw();
  });
  dimensionSelect.addEventListener('change', ()=>{
    state.dimension = dimensionSelect.value;
    draw();
  });
  exportBtn?.addEventListener('click', exportImage);

  const applySnapshot = (snapshot)=>{
    state.snapshot = normalizeSnapshot(snapshot);
    setStatus();
    draw();
  };

  if (latestSnapshot){
    applySnapshot(latestSnapshot);
  } else {
    setStatus();
  }

  const api = {
    update(snapshot){
      applySnapshot(snapshot);
    }
  };
  panelApi = api;
  return api;
}

function normalizeSnapshot(snapshot){
  if (!snapshot) return null;
  if (snapshot.rows && snapshot.cols && snapshot.cells) return snapshot;
  const inner = snapshot.matrix || snapshot.payload || null;
  if (!inner) return null;
  return {
    rows: inner.rows || [],
    cols: inner.cols || [],
    cells: inner.cells || {},
    metric: snapshot.metric || snapshot.context?.metric || inner.meta?.metric,
    context: snapshot.context || {},
    capturedAt: snapshot.capturedAt || Date.now(),
  };
}

function buildSeries(snapshot, dimension){
  if (!snapshot) return [];
  const rows = snapshot.rows || [];
  const cols = snapshot.cols || [];
  const cells = snapshot.cells || {};
  const useRows = dimension !== 'cols';
  const source = useRows ? rows : cols;
  const opposing = useRows ? cols : rows;
  const entries = source.map(entry => {
    const total = opposing.reduce((sum, counterpart)=>{
      const key = useRows ? `${entry.id}|${counterpart.id}` : `${counterpart.id}|${entry.id}`;
      const value = Number(cells[key]?.value) || 0;
      return sum + value;
    }, 0);
    return { id: entry.id, label: entry.label, value: total };
  });
  entries.sort((a, b)=> b.value - a.value);
  return entries.slice(0, 12);
}

function pickColor(index){
  return COLOR_PALETTE[index % COLOR_PALETTE.length];
}

function formatValue(value){
  if (!Number.isFinite(value)) return '--';
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (value % 1 === 0) return String(value);
  return value.toFixed(1);
}

function renderBarChart(ctx, width, height, series){
  const padding = 32;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const max = series.reduce((m, entry)=> Math.max(m, entry.value), 0) || 1;
  const barWidth = chartWidth / series.length - 12;
  ctx.save();
  ctx.translate(padding, padding);
  series.forEach((entry, index)=>{
    const valueHeight = (entry.value / max) * (chartHeight - 32);
    const x = index * (barWidth + 12);
    const y = chartHeight - valueHeight;
    ctx.fillStyle = pickColor(index);
    const widthValue = Math.max(barWidth, 8);
    ctx.fillRect(x, y, widthValue, valueHeight);
    ctx.fillStyle = '#cfd6ef';
    ctx.font = '11px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(formatValue(entry.value), x + barWidth / 2, y - 4);
    ctx.save();
    ctx.translate(x + barWidth / 2, chartHeight + 14);
    ctx.rotate(-Math.PI / 8);
    ctx.fillText(entry.label, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

function renderPieChart(ctx, width, height, series){
  const radius = Math.min(width, height) / 2 - 32;
  const centerX = width / 2;
  const centerY = height / 2;
  const total = series.reduce((sum, entry)=> sum + Math.max(0, entry.value), 0) || 1;
  let angle = -Math.PI / 2;
  series.forEach((entry, index)=>{
    const slice = (entry.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.fillStyle = pickColor(index);
    ctx.arc(centerX, centerY, radius, angle, angle + slice);
    ctx.closePath();
    ctx.fill();
    const mid = angle + slice / 2;
    const labelX = centerX + Math.cos(mid) * (radius * 0.65);
    const labelY = centerY + Math.sin(mid) * (radius * 0.65);
    ctx.fillStyle = '#0b0f16';
    ctx.font = 'bold 12px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round((entry.value / total) * 100) + '%', labelX, labelY);
    angle += slice;
  });
}

function renderRadarChart(ctx, width, height, series){
  const limit = Math.min(series.length, 8);
  const reduced = series.slice(0, limit);
  const max = reduced.reduce((m, entry)=> Math.max(m, entry.value), 0) || 1;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 40;
  const steps = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;

  for (let step = 1; step <= steps; step++){
    const levelRadius = (step / steps) * radius;
    ctx.beginPath();
    for (let i = 0; i < limit; i++){
      const angle = (Math.PI * 2 * i / limit) - Math.PI / 2;
      const x = centerX + Math.cos(angle) * levelRadius;
      const y = centerY + Math.sin(angle) * levelRadius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  reduced.forEach((entry, index)=>{
    const angle = (Math.PI * 2 * index / limit) - Math.PI / 2;
    const x = centerX + Math.cos(angle) * (radius + 12);
    const y = centerY + Math.sin(angle) * (radius + 12);
    ctx.fillStyle = '#cad2f3';
    ctx.font = '11px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(entry.label, x, y);
  });

  ctx.beginPath();
  reduced.forEach((entry, index)=>{
    const angle = (Math.PI * 2 * index / limit) - Math.PI / 2;
    const distance = (entry.value / max) * radius;
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(99,132,255,0.35)';
  ctx.strokeStyle = '#5d8dff';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
}

function ensureService(){
  window.MatrixVisualPanelService = {
    setSnapshot(snapshot){
      latestSnapshot = enrichSnapshot(snapshot);
      try { panelApi?.update?.(latestSnapshot); } catch {}
    },
    openWithPayload(snapshot){
      latestSnapshot = enrichSnapshot(snapshot);
      try {
        panelApi?.update?.(latestSnapshot);
        managerRef?.setVisible?.(PANEL_ID, true);
      } catch {}
    }
  };
}

function enrichSnapshot(snapshot){
  if (!snapshot) return null;
  const normalized = normalizeSnapshot(snapshot);
  if (!normalized) return null;
  if (!normalized.context) normalized.context = {};
  if (snapshot.context){
    normalized.context = { ...snapshot.context };
  }
  if (!normalized.capturedAt){
    normalized.capturedAt = snapshot.capturedAt || Date.now();
  }
  return normalized;
}
