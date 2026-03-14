const STYLE_ID = 'chronos-atlas-view-style';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .atlas-shell { position:relative; display:block; height:100%; min-height:0; color:var(--chronos-text, #e8edf7); padding:8px; box-sizing:border-box; }
    .atlas-glass { border:1px solid rgba(255,255,255,0.1); border-radius:18px; background:linear-gradient(180deg, rgba(255,255,255,0.085), rgba(255,255,255,0.04)); box-shadow:0 20px 44px rgba(0,0,0,0.22); backdrop-filter:blur(18px) saturate(140%); }
    .atlas-toolbar { position:absolute; top:16px; left:16px; bottom:16px; width:236px; z-index:5; display:flex; flex-direction:column; gap:10px; padding:12px; overflow:auto; }
    .atlas-toolbar.atlas-panel-collapsed { display:none; }
    .atlas-section-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .atlas-section-toggle { display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:inherit; border-radius:12px; padding:0; cursor:pointer; font-size:18px; font-weight:700; line-height:1; }
    .atlas-section-toggle:hover { background:rgba(255,255,255,0.08); }
    .atlas-section-body { display:flex; flex-direction:column; gap:10px; }
    .atlas-panel-collapsed .atlas-section-body { display:none; }
    .atlas-floating-toggle { position:absolute; z-index:7; display:none; align-items:center; justify-content:center; width:40px; height:40px; border:none; border-radius:14px; background:rgba(8,12,18,0.74); color:#eef4ff; font-size:20px; font-weight:700; cursor:pointer; box-shadow:0 12px 24px rgba(0,0,0,0.24); backdrop-filter:blur(12px); }
    .atlas-floating-toggle:hover { background:rgba(18,24,36,0.84); }
    .atlas-floating-toggle.toolbar { top:18px; left:18px; }
    .atlas-floating-toggle.inspector { top:18px; right:18px; }
    .atlas-toolbar-row { display:flex; flex-direction:column; gap:10px; align-items:stretch; }
    .atlas-title-block { margin-right:0; min-width:0; }
    .atlas-title { font-size:22px; font-weight:800; letter-spacing:0.03em; text-transform:uppercase; }
    .atlas-subtitle { font-size:12px; color:var(--chronos-text-muted, #9ca7bd); }
    .atlas-search {
      min-width:0;
      width:100%;
      padding:11px 14px;
      border-radius:12px;
      border:1px solid rgba(255,255,255,0.12);
      background:rgba(18,24,40,0.96);
      color:var(--chronos-text, #e8edf7);
      -webkit-text-fill-color:var(--chronos-text, #e8edf7);
      caret-color:var(--chronos-text, #e8edf7);
    }
    .atlas-search::placeholder { color:rgba(203,212,231,0.62); }
    .atlas-search:focus {
      outline:none;
      border-color:rgba(122,162,247,0.55);
      box-shadow:0 0 0 3px rgba(122,162,247,0.16);
    }
    .atlas-select {
      width:100%;
      padding:11px 14px;
      border-radius:12px;
      border:1px solid rgba(255,255,255,0.12);
      background:rgba(18,24,40,0.96);
      color:var(--chronos-text, #e8edf7);
      -webkit-text-fill-color:var(--chronos-text, #e8edf7);
      color-scheme:dark;
      -webkit-color-scheme:dark;
      appearance:none;
    }
    .atlas-select option,
    .atlas-select optgroup {
      background:#121828;
      color:var(--chronos-text, #e8edf7);
    }
    .atlas-select:focus {
      outline:none;
      border-color:rgba(122,162,247,0.55);
      box-shadow:0 0 0 3px rgba(122,162,247,0.16);
    }
    .atlas-toggle-group { display:inline-flex; padding:4px; border-radius:999px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); }
    .atlas-toggle { border:none; background:transparent; color:var(--chronos-text-muted, #9ca7bd); padding:8px 14px; border-radius:999px; cursor:pointer; font-size:12px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; }
    .atlas-toggle.active { background:linear-gradient(135deg, rgba(255,126,92,0.26), rgba(255,196,82,0.18)); color:#fff4db; box-shadow:0 10px 24px rgba(255,140,92,0.18); }
    .atlas-chip-label { font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:var(--chronos-text-muted, #9ca7bd); }
    .atlas-body { position:relative; height:100%; min-height:0; }
    .atlas-canvas-shell { position:relative; height:100%; min-height:260px; width:100%; border:1px solid rgba(255,255,255,0.08); border-radius:22px; overflow:hidden; background:
      radial-gradient(circle at top, rgba(255,171,98,0.14), transparent 38%),
      radial-gradient(circle at 12% 18%, rgba(114,151,255,0.16), transparent 28%),
      radial-gradient(circle at 82% 78%, rgba(73,210,166,0.12), transparent 24%),
      linear-gradient(180deg, rgba(9,12,18,0.95), rgba(6,8,13,0.92)); }
    .atlas-canvas-shell::before { content:''; position:absolute; inset:0; pointer-events:none; background-image:
      linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
      background-size:38px 38px;
      opacity:0.4;
    }
    .atlas-canvas-meta { position:absolute; top:14px; left:268px; right:16px; display:flex; justify-content:space-between; gap:10px; z-index:2; pointer-events:none; }
    .atlas-canvas-badge { display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; border:1px solid rgba(255,255,255,0.1); background:rgba(7,10,16,0.7); backdrop-filter:blur(12px); font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:#cbd4e7; }
    .atlas-zoom-controls { position:absolute; right:18px; bottom:18px; z-index:6; display:flex; flex-direction:column; gap:8px; }
    .atlas-zoom-btn { width:40px; height:40px; border:none; border-radius:14px; background:rgba(8,12,18,0.72); color:#eef4ff; font-size:20px; font-weight:700; cursor:pointer; box-shadow:0 12px 24px rgba(0,0,0,0.22); backdrop-filter:blur(12px); }
    .atlas-zoom-btn:hover { background:rgba(18,24,36,0.84); }
    .atlas-zoom-readout { display:flex; align-items:center; justify-content:center; min-width:40px; height:32px; border-radius:12px; background:rgba(8,12,18,0.72); color:#dbe5f9; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; box-shadow:0 12px 24px rgba(0,0,0,0.18); backdrop-filter:blur(12px); }
    .atlas-svg { width:100%; height:100%; display:block; position:relative; z-index:1; }
    .atlas-node { pointer-events:auto; cursor:pointer; }
    .atlas-node * { pointer-events:auto; }
    .atlas-node circle { pointer-events:auto; }
    .atlas-empty { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-align:center; padding:24px; color:var(--chronos-text-muted, #9ca7bd); z-index:3; pointer-events:auto; }
    .atlas-empty[hidden] { display:none !important; pointer-events:none !important; }
    .atlas-inspector { position:absolute; top:16px; right:16px; bottom:16px; width:min(760px, calc(100% - 300px)); z-index:5; display:flex; flex-direction:column; overflow:auto; gap:10px; padding:12px; }
    .atlas-inspector.atlas-panel-collapsed { display:none; }
    .atlas-panel { border:1px solid rgba(255,255,255,0.08); border-radius:16px; background:rgba(255,255,255,0.03); padding:10px; }
    .atlas-node-title { font-size:20px; font-weight:800; }
    .atlas-node-meta { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
    .atlas-pill { display:inline-flex; align-items:center; gap:6px; padding:5px 9px; border-radius:999px; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04); color:#dbe4f6; }
    .atlas-kpi-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px; }
    .atlas-kpi { border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:10px; background:rgba(255,255,255,0.025); }
    .atlas-kpi-label { font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:var(--chronos-text-muted, #9ca7bd); }
    .atlas-kpi-value { margin-top:4px; font-size:18px; font-weight:800; color:#f5f8ff; }
    .atlas-kpi-value.is-truncated { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .atlas-section-title { font-size:11px; letter-spacing:0.09em; text-transform:uppercase; color:var(--chronos-text-muted, #9ca7bd); margin-bottom:10px; }
    .atlas-reading { font-size:13px; line-height:1.5; color:#d8e0ef; }
    .atlas-yaml-grid { display:grid; grid-template-columns:minmax(110px, 132px) minmax(0, 1fr); gap:8px 10px; font-size:12px; max-height:100%; overflow:auto; }
    .atlas-yaml-key { color:#82b7ff; font-weight:700; text-transform:lowercase; }
    .atlas-yaml-value { color:#f6d38d; word-break:break-word; }
    .atlas-yaml-value.is-array { color:#91e6c0; }
    .atlas-yaml-value.is-empty { color:#71809c; font-style:italic; }
    .atlas-actions { display:flex; gap:8px; flex-wrap:wrap; }
    .atlas-btn { border:1px solid rgba(255,255,255,0.11); border-radius:12px; padding:9px 12px; background:rgba(255,255,255,0.04); color:inherit; cursor:pointer; }
    .atlas-btn:hover { background:rgba(255,255,255,0.08); }
    .atlas-legend { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; }
    .atlas-legend-line { display:flex; align-items:center; gap:8px; font-size:12px; color:#d8e0ef; }
    .atlas-legend-swatch { width:14px; height:14px; border-radius:999px; box-shadow:0 0 0 1px rgba(255,255,255,0.14) inset; }
    .atlas-status { min-height:20px; font-size:12px; color:var(--chronos-text-muted, #9ca7bd); }
    .atlas-status.error { color:#ff9090; }
    @media (max-width: 1280px) {
      .atlas-toolbar { top:12px; left:12px; bottom:12px; width:220px; }
      .atlas-canvas-meta { left:244px; right:12px; }
      .atlas-inspector { top:12px; right:12px; bottom:12px; width:min(520px, calc(100% - 260px)); }
      .atlas-canvas-shell { min-height:240px; }
      .atlas-floating-toggle.toolbar { top:14px; left:14px; }
      .atlas-floating-toggle.inspector { top:14px; right:14px; }
    }
  `;
  document.head.appendChild(style);
}

function apiBase() {
  const origin = window.location?.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toneForDistance(distance, unreachable = false) {
  if (unreachable || !Number.isFinite(distance) || distance < 0) {
    return { fill: '#4e6588', stroke: 'rgba(154,177,214,0.35)', edge: 'rgba(105,128,166,0.16)' };
  }
  const palette = [
    { fill: '#ff7f5c', stroke: 'rgba(255,212,164,0.88)', edge: 'rgba(255,140,92,0.45)' },
    { fill: '#ffb454', stroke: 'rgba(255,232,185,0.8)', edge: 'rgba(255,180,84,0.36)' },
    { fill: '#d5d86d', stroke: 'rgba(248,245,195,0.72)', edge: 'rgba(206,214,109,0.28)' },
    { fill: '#67d8b5', stroke: 'rgba(195,255,236,0.7)', edge: 'rgba(103,216,181,0.22)' },
    { fill: '#5f9dff', stroke: 'rgba(212,233,255,0.68)', edge: 'rgba(95,157,255,0.18)' },
  ];
  return palette[Math.max(0, Math.min(palette.length - 1, Math.floor(distance)))];
}

function parseSearchTerm(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  const colonIndex = value.indexOf(':');
  if (colonIndex > 0) {
    const key = value.slice(0, colonIndex).trim().toLowerCase();
    const query = value.slice(colonIndex + 1).trim().toLowerCase();
    if (key && query) return { mode: 'property', key, query };
  }
  return { mode: 'text', query: value.toLowerCase() };
}

function buildAdjacency(nodes, edges, lens) {
  const adjacency = new Map();
  const relevantEdges = edges.filter(edge => lens === 'dependency' ? edge.family === 'dependency' : true);
  nodes.forEach(node => adjacency.set(node.id, new Set()));
  relevantEdges.forEach(edge => {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source).add(edge.target);
    adjacency.get(edge.target).add(edge.source);
  });
  return adjacency;
}

function computeDistances(nodes, edges, focusId, lens) {
  const adjacency = buildAdjacency(nodes, edges, lens);
  const distances = new Map();
  nodes.forEach(node => distances.set(node.id, Number.POSITIVE_INFINITY));
  if (!focusId || !distances.has(focusId)) return distances;
  const queue = [focusId];
  distances.set(focusId, 0);
  while (queue.length) {
    const current = queue.shift();
    const currentDistance = distances.get(current) || 0;
    (adjacency.get(current) || new Set()).forEach(next => {
      if ((distances.get(next) || Number.POSITIVE_INFINITY) <= currentDistance + 1) return;
      distances.set(next, currentDistance + 1);
      queue.push(next);
    });
  }
  return distances;
}

function computeConnectedSet(nodes, edges, focusId) {
  const adjacency = buildAdjacency(nodes, edges, 'directness');
  const connected = new Set();
  if (!focusId || !adjacency.has(focusId)) return connected;
  const queue = [focusId];
  connected.add(focusId);
  while (queue.length) {
    const current = queue.shift();
    (adjacency.get(current) || new Set()).forEach(next => {
      if (connected.has(next)) return;
      connected.add(next);
      queue.push(next);
    });
  }
  return connected;
}

function sortNodeTypes(nodes) {
  return Array.from(new Set(nodes.map(node => String(node.type || '').toLowerCase()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function queryMatches(node, parsedQuery) {
  if (!parsedQuery) return true;
  if (parsedQuery.mode === 'text') return String(node.query_blob || '').includes(parsedQuery.query);
  const direct = node[parsedQuery.key];
  if (Array.isArray(direct)) return direct.some(value => String(value).toLowerCase().includes(parsedQuery.query));
  if (direct != null && String(direct).toLowerCase().includes(parsedQuery.query)) return true;
  const propertyValue = node.properties ? node.properties[parsedQuery.key] : undefined;
  if (Array.isArray(propertyValue)) return propertyValue.some(value => String(value).toLowerCase().includes(parsedQuery.query));
  return propertyValue != null && String(propertyValue).toLowerCase().includes(parsedQuery.query);
}

function buildInspectorRows(node) {
  if (!node) return [];
  const rows = [];
  const push = (key, value) => rows.push({ key, value });
  push('name', node.name);
  push('type', node.type);
  push('status', node.status || node.state || '');
  push('category', node.category || '');
  push('priority', node.priority || '');
  push('stage', node.stage || '');
  push('place', node.place || '');
  push('tags', Array.isArray(node.tags) ? node.tags : []);
  push('status_keys', Array.isArray(node.status_keys) ? node.status_keys : []);
  Object.keys(node.properties || {}).sort((a, b) => a.localeCompare(b)).forEach(key => {
    if (['category', 'priority', 'status', 'state', 'stage', 'place', 'location', 'tags'].includes(key)) return;
    push(key, node.properties[key]);
  });
  return rows.filter(row => row.value !== undefined);
}

function formatValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
  if (value === null || value === undefined || value === '') return 'empty';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function relationshipSummary(node, distances, lens, edges, focusNode) {
  if (!node) return 'Select a node to inspect its structural role.';
  const distance = distances.get(node.id);
  if (!focusNode) return `${node.name} is available in the Atlas graph.`;
  if (node.id === focusNode.id) {
    return lens === 'dependency'
      ? `${node.name} is the current dependency anchor. Hotter nodes sit on prerequisite or requirement paths relative to it.`
      : `${node.name} is the current structural center. Hotter nodes are directly linked, colder nodes are more indirect.`;
  }
  const connectionLabel = lens === 'dependency' ? 'dependency path' : 'structural path';
  const edgeKinds = edges.filter(edge => edge.source === node.id || edge.target === node.id).slice(0, 3).map(edge => edge.kind.replace(/_/g, ' '));
  const edgeText = edgeKinds.length ? ` Key links: ${edgeKinds.join(', ')}.` : '';
  if (!Number.isFinite(distance)) return `${node.name} is outside the current ${connectionLabel} neighborhood of ${focusNode.name}.${edgeText}`;
  if (distance <= 1) return `${node.name} is directly connected to ${focusNode.name} in the current ${connectionLabel}.${edgeText}`;
  return `${node.name} is ${distance} steps away from ${focusNode.name} in the current ${connectionLabel}.${edgeText}`;
}

function estimateLabelWidth(name, scale = 1) {
  const text = String(name || '');
  return Math.max(52, Math.min(192, (16 + (text.length * 6.4)) * scale));
}

function rectsIntersect(a, b, padding = 0) {
  return !(
    (a.right + padding) < b.left ||
    (b.right + padding) < a.left ||
    (a.bottom + padding) < b.top ||
    (b.bottom + padding) < a.top
  );
}

function computeNodeVisuals(nodes, focusId, selectedId, metrics = {}) {
  const width = Math.max(320, Number(metrics.width) || 1280);
  const paneScale = width < 420 ? 0.64 : width < 520 ? 0.76 : width < 700 ? 0.88 : 1;
  const densityScale = nodes.length > 60 ? 0.56 : nodes.length > 45 ? 0.64 : nodes.length > 30 ? 0.76 : nodes.length > 18 ? 0.88 : 1;
  const scale = paneScale * densityScale;
  const visuals = new Map();
  nodes.forEach(node => {
    const degree = Number(node.degree || 0);
    const circleRadius = node.id === focusId
      ? Math.max(13, 24 * scale)
      : Math.max(5, Math.min(17, (7.5 + degree * 0.9) * scale));
    const selectedHalo = node.id === (selectedId || focusId) ? Math.max(4, 5 * scale) : 0;
    const interactiveRadius = circleRadius + selectedHalo;
    visuals.set(node.id, {
      circleRadius,
      selectedHalo,
      interactiveRadius,
      footprintRadius: interactiveRadius + 7,
      labelWidth: estimateLabelWidth(node.name, Math.max(0.72, paneScale)),
      labelHeight: 14,
    });
  });
  return visuals;
}

function minimumRadiusForLane(laneNodes, visuals, floorRadius = 0) {
  if (!laneNodes.length) return floorRadius;
  const diameters = laneNodes.map(node => ((visuals.get(node.id)?.footprintRadius || 12) * 2) + 12);
  const totalArc = diameters.reduce((sum, value) => sum + value, 0);
  const maxDiameter = diameters.reduce((max, value) => Math.max(max, value), 0);
  const count = laneNodes.length;
  const byArc = totalArc / (2 * Math.PI);
  const byChord = count > 1
    ? maxDiameter / (2 * Math.max(0.12, Math.sin(Math.PI / count)))
    : 0;
  return Math.max(floorRadius, byArc, byChord);
}

function computeLabelVisibility(nodes, positions, visuals, metrics, focusId, selectedId) {
  const compact = metrics.width < 520 || nodes.length > 18;
  const labelBudget = nodes.length <= 10
    ? nodes.length
    : metrics.width < 420
      ? 2
      : metrics.width < 560
        ? 4
        : metrics.width < 760
          ? 8
          : 14;
  const ordered = [...nodes].sort((a, b) => {
    const aPriority = (a.id === focusId || a.id === selectedId ? 10_000 : 0) + Number(a.hub_score || 0);
    const bPriority = (b.id === focusId || b.id === selectedId ? 10_000 : 0) + Number(b.hub_score || 0);
    return bPriority - aPriority;
  });
  const accepted = [];
  const visible = new Set();
  ordered.forEach(node => {
    const pos = positions.get(node.id);
    const visual = visuals.get(node.id);
    if (!pos || !visual) return;
    const forced = node.id === focusId || node.id === selectedId;
    if (!forced && compact && visible.size >= labelBudget) return;
    const top = pos.y + visual.interactiveRadius + 8;
    const rect = {
      left: pos.x - (visual.labelWidth / 2),
      right: pos.x + (visual.labelWidth / 2),
      top,
      bottom: top + visual.labelHeight,
    };
    if (!forced && accepted.some(existing => rectsIntersect(existing, rect, 6))) return;
    visible.add(node.id);
    accepted.push(rect);
  });
  return visible;
}

function computeLayout(nodes, distances, focusId, metrics = {}, visuals = new Map()) {
  const width = Math.max(320, Number(metrics.width) || 1280);
  const height = Math.max(260, Number(metrics.height) || 820);
  const safeLeft = Math.max(24, Math.min(width - 140, Number(metrics.leftInset) || 24));
  const safeRight = Math.max(safeLeft + 140, width - Math.max(24, Number(metrics.rightInset) || 24));
  const safeTop = Math.max(24, Math.min(height - 140, Number(metrics.topInset) || 64));
  const safeBottom = Math.max(safeTop + 140, height - Math.max(24, Number(metrics.bottomInset) || 84));
  const safeWidth = Math.max(160, safeRight - safeLeft);
  const safeHeight = Math.max(160, safeBottom - safeTop);
  const centerX = safeLeft + (safeWidth / 2);
  const centerY = safeTop + (safeHeight / 2);
  const positions = new Map();
  if (focusId) positions.set(focusId, { x: centerX, y: centerY, ring: 0 });
  const rest = nodes.filter(node => node.id !== focusId);
  let maxFinite = 0;
  rest.forEach(node => {
    const distance = distances.get(node.id);
    if (Number.isFinite(distance) && distance > maxFinite) maxFinite = distance;
  });
  const outerRing = Math.max(3, maxFinite + 1);
  const buckets = new Map();
  rest.forEach(node => {
    const distance = distances.get(node.id);
    const ring = Number.isFinite(distance) ? Math.max(1, distance) : outerRing;
    if (!buckets.has(ring)) buckets.set(ring, []);
    buckets.get(ring).push(node);
  });
  let currentRadius = Math.max((visuals.get(focusId)?.footprintRadius || 18) + 40, 72);
  Array.from(buckets.keys()).sort((a, b) => a - b).forEach((ring, ringIndex) => {
    const bucket = [...(buckets.get(ring) || [])];
    bucket.sort((a, b) => (Number(b.hub_score || 0) - Number(a.hub_score || 0)) || String(a.name || '').localeCompare(String(b.name || '')));
    let laneIndex = 0;
    while (bucket.length) {
      const lane = [];
      while (bucket.length) {
        const candidate = bucket[0];
        const trial = lane.concat(candidate);
        const required = minimumRadiusForLane(trial, visuals, currentRadius);
        if (lane.length && required > currentRadius * 1.04) break;
        lane.push(bucket.shift());
      }
      if (!lane.length) lane.push(bucket.shift());
      const radius = minimumRadiusForLane(lane, visuals, currentRadius);
      const step = (Math.PI * 2) / Math.max(lane.length, 1);
      const offset = (ringIndex + laneIndex) % 2 ? -Math.PI / 2 : -Math.PI / 2 + (step / 2);
      lane.forEach((node, index) => {
        const angle = offset + (index * step);
        positions.set(node.id, {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
          ring,
        });
      });
      const laneMaxFootprint = lane.reduce((max, node) => Math.max(max, visuals.get(node.id)?.footprintRadius || 14), 14);
      currentRadius = radius + (laneMaxFootprint * 2) + 16;
      laneIndex += 1;
    }
    currentRadius += Math.max(12, 14 + (ringIndex * 2));
  });
  return { positions, centerX, centerY };
}

export function mount(el, context = {}) {
  injectStyles();
  const state = {
    graph: null,
    focusId: '',
    selectedId: '',
    lens: 'directness',
    search: '',
    statusFilter: 'all',
    hideFiltered: false,
    typeFilters: new Set(),
    types: [],
    error: '',
    zoom: 1,
    toolbarCollapsed: false,
    inspectorCollapsed: false,
    toolbarUserSet: false,
    inspectorUserSet: false,
  };
  const root = document.createElement('div');
  root.className = 'atlas-shell';
  root.innerHTML = `
    <button class="atlas-floating-toggle toolbar" type="button" data-open-toolbar aria-label="Open controls">≡</button>
    <button class="atlas-floating-toggle inspector" type="button" data-open-inspector aria-label="Open inspector">≡</button>
    <section class="atlas-toolbar atlas-glass" data-toolbar-panel>
      <div class="atlas-section-head">
        <div class="atlas-title-block">
          <div class="atlas-title">Atlas</div>
          <div class="atlas-subtitle">Structural graph of your Chronos system</div>
        </div>
        <button class="atlas-section-toggle" type="button" data-toggle-toolbar aria-label="Toggle controls panel">≡</button>
      </div>
      <div class="atlas-section-body">
        <div class="atlas-toolbar-row">
          <input class="atlas-search" data-search placeholder="Search by name or property:value" />
          <select class="atlas-select" data-status-filter>
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive / completed</option>
            <option value="ghost">References only</option>
          </select>
          <div class="atlas-toggle-group">
            <button class="atlas-toggle active" type="button" data-lens="directness">Directness</button>
            <button class="atlas-toggle" type="button" data-lens="dependency">Dependency</button>
          </div>
        </div>
        <div class="atlas-toolbar-row">
          <div class="atlas-chip-label">Type</div>
          <select class="atlas-select" data-type-filter>
            <option value="all">All types</option>
          </select>
        </div>
      </div>
    </section>
    <section class="atlas-body" data-atlas-body>
      <div class="atlas-canvas-shell">
        <div class="atlas-canvas-meta">
          <div class="atlas-canvas-badge" data-canvas-meta-left></div>
          <div class="atlas-canvas-badge" data-canvas-meta-right></div>
        </div>
        <svg class="atlas-svg" data-graph viewBox="0 0 1280 820" preserveAspectRatio="xMidYMid meet"></svg>
        <div class="atlas-zoom-controls">
          <button class="atlas-zoom-btn" type="button" data-zoom-in>+</button>
          <div class="atlas-zoom-readout" data-zoom-readout>100%</div>
          <button class="atlas-zoom-btn" type="button" data-zoom-out>-</button>
          <button class="atlas-zoom-btn" type="button" data-zoom-reset>o</button>
        </div>
        <div class="atlas-empty" data-empty hidden></div>
        <aside class="atlas-inspector atlas-glass" data-inspector-panel>
        <div class="atlas-section-head">
          <div class="atlas-chip-label">Inspector</div>
          <button class="atlas-section-toggle" type="button" data-toggle-inspector aria-label="Toggle inspector panel">≡</button>
        </div>
        <div class="atlas-panel">
          <div class="atlas-node-title" data-node-title>Atlas</div>
          <div class="atlas-node-meta" data-node-meta></div>
        </div>
        <div class="atlas-panel">
          <div class="atlas-section-title">Current Reading</div>
          <div class="atlas-reading" data-reading>Loading graph…</div>
        </div>
        <div class="atlas-panel">
          <div class="atlas-section-title">Local Metrics</div>
          <div class="atlas-kpi-grid" data-kpis></div>
        </div>
        <div class="atlas-panel">
          <div class="atlas-section-title">Parsed YAML</div>
          <div class="atlas-yaml-grid" data-yaml-grid></div>
        </div>
        <div class="atlas-panel">
          <div class="atlas-section-title">Legend</div>
          <div class="atlas-legend">
            <div class="atlas-legend-line"><span class="atlas-legend-swatch" style="background:#ff7f5c;"></span>Hot = near / strongly relevant</div>
            <div class="atlas-legend-line"><span class="atlas-legend-swatch" style="background:#5f9dff;"></span>Cold = distant / peripheral</div>
            <div class="atlas-legend-line"><span class="atlas-legend-swatch" style="background:#67d8b5;"></span>Node size = local connectivity</div>
            <div class="atlas-legend-line"><span class="atlas-legend-swatch" style="background:#2a3550;"></span>Ghost = referenced but not found</div>
          </div>
        </div>
        <div class="atlas-panel">
          <div class="atlas-actions">
            <button class="atlas-btn" type="button" data-recenter>Recenter on selected</button>
            <button class="atlas-btn" type="button" data-open-item>Open item</button>
          </div>
          <div class="atlas-status" data-status></div>
        </div>
        </aside>
      </div>
    </section>
  `;
  el.appendChild(root);

  const searchEl = root.querySelector('[data-search]');
  const statusFilterEl = root.querySelector('[data-status-filter]');
  const typeFilterEl = root.querySelector('[data-type-filter]');
  const graphEl = root.querySelector('[data-graph]');
  const emptyEl = root.querySelector('[data-empty]');
  const readingEl = root.querySelector('[data-reading]');
  const nodeTitleEl = root.querySelector('[data-node-title]');
  const nodeMetaEl = root.querySelector('[data-node-meta]');
  const yamlGridEl = root.querySelector('[data-yaml-grid]');
  const statusEl = root.querySelector('[data-status]');
  const kpisEl = root.querySelector('[data-kpis]');
  const metaLeftEl = root.querySelector('[data-canvas-meta-left]');
  const metaRightEl = root.querySelector('[data-canvas-meta-right]');
  const zoomReadoutEl = root.querySelector('[data-zoom-readout]');
  const recenterBtn = root.querySelector('[data-recenter]');
  const openBtn = root.querySelector('[data-open-item]');
  const zoomInBtn = root.querySelector('[data-zoom-in]');
  const zoomOutBtn = root.querySelector('[data-zoom-out]');
  const zoomResetBtn = root.querySelector('[data-zoom-reset]');
  const canvasShellEl = root.querySelector('.atlas-canvas-shell');
  const toolbarPanelEl = root.querySelector('[data-toolbar-panel]');
  const inspectorPanelEl = root.querySelector('[data-inspector-panel]');
  const toggleToolbarBtn = root.querySelector('[data-toggle-toolbar]');
  const toggleInspectorBtn = root.querySelector('[data-toggle-inspector]');
  const openToolbarBtn = root.querySelector('[data-open-toolbar]');
  const openInspectorBtn = root.querySelector('[data-open-inspector]');

  function setStatus(message, tone = '') {
    statusEl.textContent = message || '';
    statusEl.className = `atlas-status${tone ? ' ' + tone : ''}`;
  }

  function clampZoom(value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return 1;
    return Math.max(0.45, Math.min(2.5, next));
  }

  function canvasWidth() {
    return Math.round(canvasShellEl?.getBoundingClientRect?.().width || root.getBoundingClientRect?.().width || 0);
  }

  function applyResponsivePanels(force = false) {
    const width = canvasWidth();
    if (!width) return;
    const compactToolbar = width < 720;
    const compactInspector = width < 960;
    if (force || !state.toolbarUserSet) state.toolbarCollapsed = compactToolbar;
    if (force || !state.inspectorUserSet) state.inspectorCollapsed = compactInspector;
  }

  function syncPanelButtons() {
    toolbarPanelEl?.classList.toggle('atlas-panel-collapsed', !!state.toolbarCollapsed);
    inspectorPanelEl?.classList.toggle('atlas-panel-collapsed', !!state.inspectorCollapsed);
    if (toggleToolbarBtn) {
      toggleToolbarBtn.textContent = '≡';
      toggleToolbarBtn.title = state.toolbarCollapsed ? 'Expand controls' : 'Collapse controls';
    }
    if (toggleInspectorBtn) {
      toggleInspectorBtn.textContent = '≡';
      toggleInspectorBtn.title = state.inspectorCollapsed ? 'Expand inspector' : 'Collapse inspector';
    }
    if (openToolbarBtn) {
      openToolbarBtn.style.display = state.toolbarCollapsed ? 'inline-flex' : 'none';
      openToolbarBtn.title = 'Open controls';
    }
    if (openInspectorBtn) {
      openInspectorBtn.style.display = state.inspectorCollapsed ? 'inline-flex' : 'none';
      openInspectorBtn.title = 'Open inspector';
    }
  }

  function canvasMetrics() {
    const canvasRect = canvasShellEl?.getBoundingClientRect?.();
    const toolbarRect = state.toolbarCollapsed ? null : toolbarPanelEl?.getBoundingClientRect?.();
    const inspectorRect = state.inspectorCollapsed ? null : inspectorPanelEl?.getBoundingClientRect?.();
    return {
      width: Math.max(320, Math.round(canvasRect?.width || 1280)),
      height: Math.max(260, Math.round(canvasRect?.height || 820)),
      leftInset: toolbarRect ? Math.round(toolbarRect.width + 28) : 18,
      rightInset: inspectorRect ? Math.round(inspectorRect.width + 28) : 18,
      topInset: 64,
      bottomInset: 82,
    };
  }

  function graphNodes() {
    return Array.isArray(state.graph?.nodes) ? state.graph.nodes : [];
  }

  function graphEdges() {
    return Array.isArray(state.graph?.edges) ? state.graph.edges : [];
  }

  function selectedNode() {
    return graphNodes().find(node => node.id === state.selectedId) || null;
  }

  function focusNode() {
    return graphNodes().find(node => node.id === state.focusId) || null;
  }

  function matchesStatus(node) {
    const statusText = String(node.status || node.state || '').toLowerCase();
    if (state.statusFilter === 'all') return true;
    if (state.statusFilter === 'ghost') return !!node.ghost;
    if (state.statusFilter === 'active') return !node.ghost && !['completed', 'archived', 'inactive'].includes(statusText);
    if (state.statusFilter === 'inactive') return !!node.ghost || ['completed', 'archived', 'inactive'].includes(statusText);
    return true;
  }

  function matchesType(node) {
    if (!state.typeFilters.size) return true;
    return state.typeFilters.has(String(node.type || '').toLowerCase());
  }

  function visibleNodes() {
    const parsedQuery = parseSearchTerm(state.search);
    return graphNodes().filter(node => matchesStatus(node) && matchesType(node) && queryMatches(node, parsedQuery));
  }

  function hasActiveFilters() {
    return Boolean(state.search || state.typeFilters.size || state.statusFilter !== 'all');
  }

  function displayNodes() {
    const allNodes = graphNodes();
    const connectedIds = computeConnectedSet(allNodes, graphEdges(), state.focusId);
    const filteredIds = new Set(visibleNodes().map(node => node.id));
    if (hasActiveFilters()) {
      return allNodes.filter(node => connectedIds.has(node.id) || filteredIds.has(node.id));
    }
    if (connectedIds.size) {
      return allNodes.filter(node => connectedIds.has(node.id));
    }
    return allNodes;
  }

  function renderTypeFilter() {
    if (!typeFilterEl) return;
    const previous = state.typeFilters.size ? Array.from(state.typeFilters)[0] : 'all';
    typeFilterEl.innerHTML = '<option value="all">All types</option>' + state.types.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');
    typeFilterEl.value = state.types.includes(previous) ? previous : 'all';
  }

  function renderInspector(distances) {
    const node = selectedNode() || focusNode();
    const focus = focusNode();
    nodeTitleEl.textContent = node ? node.name : 'Atlas';
    nodeMetaEl.innerHTML = '';
    const pills = node
      ? [node.type, node.status || node.state, node.category, node.ghost ? 'reference' : ''].filter(Boolean)
      : ['structural overview'];
    pills.forEach(value => {
      const pill = document.createElement('span');
      pill.className = 'atlas-pill';
      pill.textContent = value;
      nodeMetaEl.appendChild(pill);
    });
    readingEl.textContent = relationshipSummary(node, distances, state.lens, graphEdges(), focus);
    const metrics = node
      ? [
          { label: 'Degree', value: String(node.degree || 0) },
          { label: 'Hub', value: String(node.hub_score || 0) },
          { label: state.lens === 'dependency' ? 'Dep Dist' : 'Distance', value: Number.isFinite(distances.get(node.id)) ? String(distances.get(node.id)) : 'far' },
          { label: 'Path', value: node.path ? node.path.split('/').slice(-2).join('/') : 'reference' },
        ]
      : [
          { label: 'Nodes', value: String(state.graph?.meta?.node_count || 0) },
          { label: 'Edges', value: String(state.graph?.meta?.edge_count || 0) },
          { label: 'Lens', value: state.lens },
          { label: 'Center', value: focus ? focus.name : 'none' },
        ];
    kpisEl.innerHTML = metrics.map(metric => {
      const truncated = metric.label === 'Path';
      const valueClass = `atlas-kpi-value${truncated ? ' is-truncated' : ''}`;
      const titleAttr = truncated ? ` title="${escapeHtml(metric.value)}"` : '';
      return `
        <div class="atlas-kpi">
          <div class="atlas-kpi-label">${escapeHtml(metric.label)}</div>
          <div class="${valueClass}"${titleAttr}>${escapeHtml(metric.value)}</div>
        </div>
      `;
    }).join('');
    const rows = buildInspectorRows(node);
    yamlGridEl.innerHTML = rows.map(row => {
      const isArray = Array.isArray(row.value);
      const text = formatValue(row.value);
      const classes = ['atlas-yaml-value'];
      if (isArray) classes.push('is-array');
      if (text === 'empty' || text === 'none') classes.push('is-empty');
      return `<div class="atlas-yaml-key">${escapeHtml(row.key)}</div><div class="${classes.join(' ')}">${escapeHtml(text)}</div>`;
    }).join('') || '<div class="atlas-yaml-key">state</div><div class="atlas-yaml-value is-empty">No node selected.</div>';
  }

  function openSelectedItem() {
    const node = selectedNode() || focusNode();
    if (!node) return;
    if (!node.path) {
      setStatus('Referenced node has no backing file.', 'error');
      return;
    }
    fetch(apiBase() + '/api/editor/open-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: node.path }),
    })
      .then(() => setStatus(`Queued ${node.name} for editor open.`))
      .catch(error => setStatus(`Open request failed: ${error}`, 'error'));
  }

  function activateNode(nodeId) {
    if (!nodeId) return;
    state.selectedId = nodeId;
    state.focusId = nodeId;
    state.zoom = 1;
    render();
  }

  function bindGraphInteractions() {
    graphEl.querySelectorAll('.atlas-node[data-node-id]').forEach(nodeEl => {
      nodeEl.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        activateNode(nodeEl.getAttribute('data-node-id') || '');
      });
      nodeEl.addEventListener('pointerdown', event => {
        event.stopPropagation();
      });
    });
  }

  function renderGraph() {
    const matchedNodes = visibleNodes();
    const nodes = displayNodes();
    const nodeIds = new Set(nodes.map(node => node.id));
    const visibleIds = new Set(matchedNodes.map(node => node.id));
    const edges = graphEdges().filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    const distances = computeDistances(nodes, edges, state.focusId, state.lens);
    const metrics = canvasMetrics();
    const visuals = computeNodeVisuals(nodes, state.focusId, state.selectedId, metrics);
    const layout = computeLayout(nodes, distances, state.focusId, metrics, visuals);
    const visibleLabels = computeLabelVisibility(nodes, layout.positions, visuals, metrics, state.focusId, state.selectedId);

    if (!nodes.length || (!matchedNodes.length && (state.search || state.typeFilters.size || state.statusFilter !== 'all'))) {
      graphEl.innerHTML = '';
      emptyEl.hidden = false;
      emptyEl.textContent = 'No nodes match the current Atlas filters.';
      renderInspector(new Map());
      return;
    }

    emptyEl.hidden = true;
    metaLeftEl.textContent = `${nodes.length} nodes visible`;
    metaRightEl.textContent = `${state.lens === 'dependency' ? 'Dependency' : 'Directness'} lens`;
    zoomReadoutEl.textContent = `${Math.round(state.zoom * 100)}%`;

    const edgeMarkup = edges.map(edge => {
      const sourcePos = layout.positions.get(edge.source);
      const targetPos = layout.positions.get(edge.target);
      if (!sourcePos || !targetPos) return '';
      const highlighted = edge.source === state.selectedId || edge.target === state.selectedId || edge.source === state.focusId || edge.target === state.focusId;
      const distance = Math.min(distances.get(edge.source) || 99, distances.get(edge.target) || 99);
      const tone = toneForDistance(distance, !Number.isFinite(distance));
      const stroke = edge.family === 'dependency' ? tone.edge.replace('0.', '0.55') : tone.edge;
      const opacity = highlighted ? 0.9 : (visibleIds.has(edge.source) && visibleIds.has(edge.target) ? 0.42 : 0.12);
      const width = highlighted ? 2.4 : (edge.family === 'dependency' ? 1.7 : 1.1);
      return `<line x1="${sourcePos.x}" y1="${sourcePos.y}" x2="${targetPos.x}" y2="${targetPos.y}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${width}" stroke-linecap="round" />`;
    }).join('');

    const nodeMarkup = nodes.map(node => {
      const pos = layout.positions.get(node.id);
      const visual = visuals.get(node.id);
      if (!pos) return '';
      const distance = distances.get(node.id);
      const tone = toneForDistance(distance, !Number.isFinite(distance));
      const radius = visual?.circleRadius || 10;
      const interactiveRadius = visual?.interactiveRadius || radius;
      const opacity = visibleIds.has(node.id) ? 1 : 0.24;
      const selected = node.id === (state.selectedId || state.focusId);
      const labelVisible = visibleLabels.has(node.id);
      const labelY = pos.y + interactiveRadius + 8;
      return `
        <g class="atlas-node" data-node-id="${escapeHtml(node.id)}" style="cursor:pointer; opacity:${opacity};">
          <title>${escapeHtml(node.name)}</title>
          <circle cx="${pos.x}" cy="${pos.y}" r="${interactiveRadius}" fill="rgba(255,255,255,0.02)" stroke="${selected ? tone.stroke : 'rgba(255,255,255,0.08)'}" stroke-width="${selected ? 1.7 : 1}" />
          <circle cx="${pos.x}" cy="${pos.y}" r="${radius}" fill="${node.ghost ? '#2d3b57' : tone.fill}" stroke="${tone.stroke}" stroke-width="${node.id === state.focusId ? 2.8 : 1.4}" />
          ${labelVisible ? `<text x="${pos.x}" y="${labelY}" text-anchor="middle" dominant-baseline="hanging" fill="${visibleIds.has(node.id) ? '#edf3ff' : 'rgba(237,243,255,0.42)'}" font-size="12" font-weight="${selected ? 700 : 500}" style="pointer-events:none;">${escapeHtml(node.name)}</text>` : ''}
        </g>
      `;
    }).join('');

    graphEl.innerHTML = `
      <defs>
        <radialGradient id="atlasFocusGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="rgba(255,196,82,0.28)"></stop>
          <stop offset="100%" stop-color="rgba(255,196,82,0)"></stop>
        </radialGradient>
      </defs>
      <circle cx="${layout.centerX}" cy="${layout.centerY}" r="74" fill="url(#atlasFocusGlow)" opacity="0.8"></circle>
      ${edgeMarkup}
      ${nodeMarkup}
    `;
    bindGraphInteractions();

    const positioned = nodes
      .map(node => {
        const pos = layout.positions.get(node.id);
        const visual = visuals.get(node.id);
        if (!pos) return null;
        return {
          x: pos.x,
          y: pos.y,
          radius: visual?.interactiveRadius || visual?.circleRadius || 12,
          labelVisible: visibleLabels.has(node.id),
          labelWidth: visual?.labelWidth || 0,
          labelHeight: visual?.labelHeight || 0,
        };
      })
      .filter(Boolean);
    if (positioned.length) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      positioned.forEach(point => {
        minX = Math.min(minX, point.x - point.radius - 26);
        maxX = Math.max(maxX, point.x + point.radius + 26);
        minY = Math.min(minY, point.y - point.radius - 26);
        maxY = Math.max(maxY, point.y + point.radius + 48);
        if (point.labelVisible) {
          minX = Math.min(minX, point.x - (point.labelWidth / 2) - 12);
          maxX = Math.max(maxX, point.x + (point.labelWidth / 2) + 12);
          maxY = Math.max(maxY, point.y + point.radius + point.labelHeight + 28);
        }
      });
      const boundsWidth = Math.max(260, maxX - minX);
      const boundsHeight = Math.max(220, maxY - minY);
      const freeWidthRatio = Math.max(0.18, (metrics.width - metrics.leftInset - metrics.rightInset) / Math.max(1, metrics.width));
      const freeHeightRatio = Math.max(0.22, (metrics.height - metrics.topInset - metrics.bottomInset) / Math.max(1, metrics.height));
      const width = boundsWidth / freeWidthRatio;
      const height = boundsHeight / freeHeightRatio;
      const leftPad = width * (metrics.leftInset / Math.max(1, metrics.width));
      const topPad = height * (metrics.topInset / Math.max(1, metrics.height));
      const zoom = clampZoom(state.zoom);
      const zoomedWidth = width / zoom;
      const zoomedHeight = height / zoom;
      const baseMinX = minX - leftPad;
      const baseMinY = minY - topPad;
      const centerX = baseMinX + (width / 2);
      const centerY = baseMinY + (height / 2);
      graphEl.setAttribute('viewBox', `${centerX - (zoomedWidth / 2)} ${centerY - (zoomedHeight / 2)} ${zoomedWidth} ${zoomedHeight}`);
    }

    renderInspector(distances);
  }

  function render() {
    applyResponsivePanels();
    syncPanelButtons();
    renderTypeFilter();
    root.querySelectorAll('[data-lens]').forEach(button => {
      button.classList.toggle('active', button.getAttribute('data-lens') === state.lens);
    });
    renderGraph();
  }

  async function loadGraph() {
    setStatus('Loading Atlas graph...');
    try {
      const response = await fetch(apiBase() + '/api/graph');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload?.ok) throw new Error(payload?.error || 'Graph request failed');
      state.graph = payload;
      state.types = sortNodeTypes(payload.nodes || []);
      state.focusId = payload.default_center || (payload.nodes?.[0]?.id || '');
      state.selectedId = state.focusId;
      setStatus(`Loaded ${payload.meta?.node_count || 0} nodes and ${payload.meta?.edge_count || 0} edges.`);
      render();
    } catch (error) {
      console.error('[Atlas] loadGraph failed', error);
      state.error = String(error);
      emptyEl.hidden = false;
      emptyEl.textContent = `Atlas failed to load: ${error}`;
      setStatus(`Atlas failed to load: ${error}`, 'error');
      readingEl.textContent = 'Graph data could not be loaded.';
    }
  }

  searchEl.addEventListener('input', event => {
    state.search = event.target.value || '';
    render();
  });

  statusFilterEl.addEventListener('change', event => {
    state.statusFilter = event.target.value || 'all';
    const visible = visibleNodes();
    if (visible.length && !visible.some(node => node.id === state.focusId)) {
      state.focusId = visible[0].id;
      state.selectedId = visible[0].id;
    }
    render();
  });

  typeFilterEl.addEventListener('change', event => {
    const value = String(event.target.value || 'all').toLowerCase();
    state.typeFilters.clear();
    if (value && value !== 'all') {
      state.typeFilters.add(value);
    }
    const visible = visibleNodes();
    if (visible.length && !visible.some(node => node.id === state.focusId)) {
      state.focusId = visible[0].id;
      state.selectedId = visible[0].id;
    }
    render();
  });

  root.querySelectorAll('[data-lens]').forEach(button => {
    button.addEventListener('click', () => {
      state.lens = button.getAttribute('data-lens') || 'directness';
      state.zoom = 1;
      render();
    });
  });

  recenterBtn.addEventListener('click', () => {
    const node = selectedNode();
    if (!node) return;
    state.focusId = node.id;
    state.zoom = 1;
    render();
  });

  openBtn.addEventListener('click', openSelectedItem);
  zoomInBtn.addEventListener('click', () => {
    state.zoom = clampZoom(state.zoom * 1.18);
    render();
  });
  zoomOutBtn.addEventListener('click', () => {
    state.zoom = clampZoom(state.zoom / 1.18);
    render();
  });
  zoomResetBtn.addEventListener('click', () => {
    state.zoom = 1;
    render();
  });
  graphEl.addEventListener('wheel', event => {
    event.preventDefault();
    state.zoom = clampZoom(state.zoom * (event.deltaY < 0 ? 1.08 : 0.92));
    render();
  }, { passive: false });
  toggleToolbarBtn.addEventListener('click', () => {
    state.toolbarUserSet = true;
    state.toolbarCollapsed = !state.toolbarCollapsed;
    render();
  });
  toggleInspectorBtn.addEventListener('click', () => {
    state.inspectorUserSet = true;
    state.inspectorCollapsed = !state.inspectorCollapsed;
    render();
  });
  openToolbarBtn.addEventListener('click', () => {
    state.toolbarUserSet = true;
    state.toolbarCollapsed = false;
    render();
  });
  openInspectorBtn.addEventListener('click', () => {
    state.inspectorUserSet = true;
    state.inspectorCollapsed = false;
    render();
  });

  applyResponsivePanels(true);
  syncPanelButtons();
  if (typeof ResizeObserver === 'function' && canvasShellEl) {
    const resizeObserver = new ResizeObserver(() => {
      if (state.graph) render();
    });
    resizeObserver.observe(canvasShellEl);
  }
  loadGraph();
}
