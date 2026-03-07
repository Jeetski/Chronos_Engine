export function mount(el) {
  el.className = 'widget status-widget';

  const tpl = `
    <div class="header" id="statusHeader">
      <div class="title">Status Station</div>
      <div class="controls">
        <button class="icon-btn" id="statusMin" title="Minimize">_</button>
        <button class="icon-btn" id="statusClose" title="Close">x</button>
      </div>
    </div>
    <div class="content">
      <div id="statusFields"></div>
      <div class="row">
        <div class="spacer"></div>
        <button class="btn btn-primary" id="statusUpdate">Update</button>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  // Inject CSS
  if (!el.querySelector('link[href="./widgets/Status/status.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './widgets/Status/status.css';
    el.appendChild(link);
  }

  const header = el.querySelector('#statusHeader');
  const btnMin = el.querySelector('#statusMin');
  const btnClose = el.querySelector('#statusClose');
  const contentRoot = el.querySelector('.content');
  const fieldsRoot = el.querySelector('#statusFields');
  const btnUpdate = el.querySelector('#statusUpdate');
  fieldsRoot.classList.add('status-knob-polygon');

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

  const settings = (window.CHRONOS_SETTINGS && window.CHRONOS_SETTINGS.status) || {};
  const types = Array.isArray(settings.types) ? settings.types : ['Health', 'Place', 'Energy', 'Mind State', 'Focus', 'Emotion', 'Vibe'];
  const optionsMap = settings.options || {};
  let currentStatus = normalizeStatusMap(settings.current || {});
  const optionRankMap = {};
  let radarState = null;

  // Render fields
  const fieldRefs = {};
  function slugify(name) { return String(name || '').trim().toLowerCase().replace(/\s+/g, '_'); }
  function normalizeStatusMap(map) {
    const out = {};
    Object.entries(map || {}).forEach(([key, value]) => {
      const slug = slugify(key);
      if (slug) out[slug] = value;
    });
    return out;
  }
  async function fetchCurrentStatus() {
    const resp = await fetch(apiBase() + '/api/status/current');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
    return normalizeStatusMap(data.status || data || {});
  }
  function applyCurrentStatus(map) {
    const normalized = normalizeStatusMap(map || {});
    currentStatus = { ...currentStatus, ...normalized };
    Object.keys(fieldRefs).forEach(key => {
      const knob = fieldRefs[key];
      if (!knob) return;
      const rawVal = currentStatus[key];
      if (!rawVal) return;
      knob.value = rawVal;
    });
  }
  function expandText(s) { try { return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s || '')) : String(s || ''); } catch { return String(s || ''); } }
  function isWidgetVisible() {
    return !!(el && el.style.display !== 'none' && el.offsetWidth > 0);
  }
  function autoExpandToFit(opts = {}) {
    const allowShrink = !!opts.allowShrink;
    if (!isWidgetVisible() || el.classList.contains('minimized')) return;
    const minWidgetHeight = 380;
    const maxAutoHeight = Math.min(Math.max(minWidgetHeight, (window.innerHeight || 900) - 110), 560);
    const headerH = header?.offsetHeight || 44;
    const contentH = contentRoot?.scrollHeight || 0;
    const targetRaw = Math.ceil(headerH + contentH + 12);
    const target = Math.max(minWidgetHeight, Math.min(maxAutoHeight, targetRaw));
    const current = Math.ceil(el.offsetHeight || 0);
    if ((allowShrink && target !== current) || (!allowShrink && target > current)) {
      el.style.height = `${target}px`;
    }
  }
  function queueAutoExpandToFit(opts = {}) {
    requestAnimationFrame(() => requestAnimationFrame(() => autoExpandToFit(opts)));
  }
  // Helper to render a knob
  function renderKnob(typeSlug, labelText, options, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'status-knob-row';

    const lbl = document.createElement('div');
    lbl.className = 'knob-label';
    lbl.textContent = labelText;
    lbl.setAttribute('data-raw', labelText);
    wrap.appendChild(lbl);

    const knobContainer = document.createElement('div');
    knobContainer.className = 'knob-container';
    knobContainer.title = 'Drag up/down to adjust';

    const ring = document.createElement('div');
    ring.className = 'knob-ring';

    const dial = document.createElement('div');
    dial.className = 'knob-dial';

    knobContainer.append(ring, dial);
    wrap.appendChild(knobContainer);

    const valDisplay = document.createElement('div');
    valDisplay.className = 'knob-value-display';
    wrap.appendChild(valDisplay);

    // State
    const validOptions = Array.isArray(options) && options.length ? options : ['Poor', 'Fair', 'Good', 'Excellent'];
    let currentIndex = 0; // default to first

    // API object to get/set value
    const api = {
      get value() { return validOptions[currentIndex]; },
      get normalized() { return (validOptions.length - 1) <= 0 ? 1 : (currentIndex / (validOptions.length - 1)); },
      set value(val) {
        // try exact then case-insensitive
        let idx = validOptions.indexOf(val);
        if (idx === -1) idx = validOptions.findIndex(o => String(o).toLowerCase() === String(val).toLowerCase());
        if (idx !== -1) {
          currentIndex = idx;
          updateVisuals();
        }
      },
      options: validOptions.slice(),
      el: wrap
    };

    function updateVisuals() {
      // Map index to angle range (-135 to 135 = 270 degrees total)
      const pct = currentIndex / (validOptions.length - 1 || 1);
      const angle = -135 + (pct * 270);
      dial.style.transform = `rotate(${angle}deg)`;

      const rawText = String(validOptions[currentIndex]);
      valDisplay.textContent = expandText(rawText);
      valDisplay.setAttribute('data-raw', rawText);
      try { onChange && onChange(); } catch { }
    }
    updateVisuals(); // Init

    // Interaction
    knobContainer.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation(); // Prevent widget drag
      try { knobContainer.setPointerCapture(ev.pointerId); } catch { }
      const startY = ev.clientY;
      const startIndex = currentIndex;
      const Sensitivity = 15; // pixels per step

      const onMove = (e) => {
        const dy = startY - e.clientY; // drag up = positive
        const steps = Math.round(dy / Sensitivity);
        let nextIndex = startIndex + steps;
        nextIndex = Math.max(0, Math.min(validOptions.length - 1, nextIndex));

        if (nextIndex !== currentIndex) {
          currentIndex = nextIndex;
          updateVisuals();
        }
      };

      const onUp = (e) => {
        knobContainer.removeEventListener('pointermove', onMove);
        knobContainer.removeEventListener('pointerup', onUp);
        try { knobContainer.releasePointerCapture(e.pointerId); } catch { }
      };

      knobContainer.addEventListener('pointermove', onMove);
      knobContainer.addEventListener('pointerup', onUp);
    });

    // Allow wheel support
    knobContainer.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const dir = ev.deltaY > 0 ? -1 : 1;
      let nextIndex = currentIndex + dir;
      nextIndex = Math.max(0, Math.min(validOptions.length - 1, nextIndex));
      if (nextIndex !== currentIndex) {
        currentIndex = nextIndex;
        updateVisuals();
      }
    });

    fieldsRoot.appendChild(wrap);
    return api;
  }

  function toPolarPoint(cx, cy, radius, angle) {
    return { x: cx + (radius * Math.cos(angle)), y: cy + (radius * Math.sin(angle)) };
  }

  function ensureRadarLayer(nodes) {
    const wrap = document.createElement('div');
    wrap.className = 'status-radar-wrap';
    wrap.innerHTML = `
      <svg class="status-radar" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <g class="status-radar-grid"></g>
        <polygon class="status-radar-area"></polygon>
        <polygon class="status-radar-outline"></polygon>
        <g class="status-radar-points"></g>
      </svg>
    `;
    fieldsRoot.appendChild(wrap);

    const svg = wrap.querySelector('.status-radar');
    const gridEl = wrap.querySelector('.status-radar-grid');
    const pointsEl = wrap.querySelector('.status-radar-points');
    const areaEl = wrap.querySelector('.status-radar-area');
    const outlineEl = wrap.querySelector('.status-radar-outline');
    const center = { x: 50, y: 50 };
    const maxRadius = 34;
    const ringLevels = 4;

    // Rings
    for (let level = 1; level <= ringLevels; level += 1) {
      const r = (maxRadius * level) / ringLevels;
      const pts = nodes.map((n) => {
        const p = toPolarPoint(center.x, center.y, r, n.angle);
        return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      }).join(' ');
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      ring.setAttribute('class', 'status-radar-ring');
      ring.setAttribute('points', pts);
      gridEl.appendChild(ring);
    }

    // Spokes
    nodes.forEach((n) => {
      const p = toPolarPoint(center.x, center.y, maxRadius, n.angle);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'status-radar-spoke');
      line.setAttribute('x1', String(center.x));
      line.setAttribute('y1', String(center.y));
      line.setAttribute('x2', p.x.toFixed(2));
      line.setAttribute('y2', p.y.toFixed(2));
      gridEl.appendChild(line);
    });

    return { svg, pointsEl, areaEl, outlineEl, center, maxRadius, nodes };
  }

  function updateRadarChart() {
    if (!radarState || !radarState.nodes?.length) return;
    const pts = radarState.nodes.map((n) => {
      const knob = fieldRefs[n.typeSlug];
      const value = knob ? knob.normalized : 0;
      const radius = radarState.maxRadius * Math.max(0, Math.min(1, value));
      const p = toPolarPoint(radarState.center.x, radarState.center.y, radius, n.angle);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    });
    const poly = pts.join(' ');
    radarState.areaEl.setAttribute('points', poly);
    radarState.outlineEl.setAttribute('points', poly);
    radarState.pointsEl.innerHTML = '';
    pts.forEach((pt) => {
      const [x, y] = pt.split(',');
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('class', 'status-radar-dot');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', '1.3');
      radarState.pointsEl.appendChild(dot);
    });
  }

  function triggerRadarUpdateFx() {
    if (!radarState?.svg) return;
    const svg = radarState.svg;
    svg.classList.remove('status-radar-update-fx');
    void svg.getBoundingClientRect();
    svg.classList.add('status-radar-update-fx');
    setTimeout(() => {
      try { svg.classList.remove('status-radar-update-fx'); } catch { }
    }, 760);
  }

  async function loadValueRanks(typeSlug) {
    try {
      const resp = await fetch(apiBase() + `/api/settings?file=${encodeURIComponent(typeSlug + '_settings.yml')}`);
      const json = await resp.json().catch(() => ({}));
      const data = (json && json.data && typeof json.data === 'object') ? json.data : {};
      const root = Object.values(data)[0];
      if (!root || typeof root !== 'object') return null;
      const ranks = {};
      Object.entries(root).forEach(([label, meta]) => {
        const n = Number(meta && meta.value);
        if (!Number.isNaN(n)) ranks[String(label)] = n;
      });
      return Object.keys(ranks).length ? ranks : null;
    } catch {
      return null;
    }
  }

  function sortOptionsLowToHigh(typeSlug, options) {
    const src = Array.isArray(options) ? options.slice() : [];
    const ranks = optionRankMap[typeSlug];
    if (!ranks) return src;
    return src.sort((a, b) => {
      const av = Number(ranks[a]);
      const bv = Number(ranks[b]);
      const aHas = Number.isFinite(av);
      const bHas = Number.isFinite(bv);
      if (!aHas && !bHas) return 0;
      if (!aHas) return 1;
      if (!bHas) return -1;
      // Higher configured value means lower status severity in existing status files.
      // Sort descending by rank so knobs read low -> high.
      return bv - av;
    });
  }

  function renderFields() {
    fieldsRoot.innerHTML = '';
    Object.keys(fieldRefs).forEach(k => delete fieldRefs[k]);

    const count = Math.max(1, types.length);
    const step = (Math.PI * 2) / count;
    const startAngle = -Math.PI / 2;
    const radarNodes = types.map((type, idx) => ({ typeSlug: slugify(type), angle: startAngle + (idx * step) }));
    radarState = ensureRadarLayer(radarNodes);
    types.forEach((type, idx) => {
      const typeSlug = slugify(type);
      const labelText = expandText(type);
      const rawOpts = Array.isArray(optionsMap[type]) ? optionsMap[type] : ['Poor', 'Fair', 'Good', 'Excellent'];
      const opts = sortOptionsLowToHigh(typeSlug, rawOpts);

      const knob = renderKnob(typeSlug, labelText, opts, updateRadarChart);
      const angle = startAngle + (idx * step);
      const x = 50 + (39 * Math.cos(angle));
      const y = 50 + (39 * Math.sin(angle));
      knob.el.style.left = `${x}%`;
      knob.el.style.top = `${y}%`;
      fieldRefs[typeSlug] = knob;

      const curVal = currentStatus[typeSlug];
      if (curVal) knob.value = curVal;
    });
    updateRadarChart();
    queueAutoExpandToFit();
  }

  async function initFields() {
    await Promise.all(types.map(async (type) => {
      const typeSlug = slugify(type);
      const ranks = await loadValueRanks(typeSlug);
      if (ranks) optionRankMap[typeSlug] = ranks;
    }));
    renderFields();
  }
  // Re-expand options when vars change
  try {
    window?.ChronosVars && context?.bus?.on('vars:changed', () => {
      try {
        fieldsRoot.querySelectorAll('.knob-label').forEach(l => {
          const raw = l.getAttribute('data-raw') || l.textContent || '';
          l.textContent = expandText(raw);
        });
        fieldsRoot.querySelectorAll('.knob-value-display').forEach(d => {
          const raw = d.getAttribute('data-raw') || d.textContent || '';
          d.textContent = expandText(raw);
        });
        // Also update standard hints
        fieldsRoot.querySelectorAll('label.hint').forEach(l => {
          const raw = l.getAttribute('data-raw') || l.textContent || '';
          l.textContent = expandText(raw);
        });
      } catch { }
      queueAutoExpandToFit();
    });
  } catch { }

  // Dragging
  header.addEventListener('pointerdown', (ev) => {
    const startX = ev.clientX, startY = ev.clientY; const rect = el.getBoundingClientRect(); const offX = startX - rect.left, offY = startY - rect.top;
    function onMove(e) { el.style.left = Math.max(6, e.clientX - offX) + 'px'; el.style.top = Math.max(6, e.clientY - offY) + 'px'; el.style.right = 'auto'; }
    function onUp() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  });
  btnMin.addEventListener('click', () => el.classList.toggle('minimized'));
  btnClose.addEventListener('click', () => el.style.display = 'none');

  // Update handler
  btnUpdate.addEventListener('click', async () => {
    // Build YAML map of indicator:value (lowercase indicator keys)
    const lines = [];
    Object.keys(fieldRefs).forEach(k => { const v = fieldRefs[k].value; if (v) lines.push(`${k}: ${v}`); });
    const payload = lines.join('\n');
    try {
      const resp = await fetch(apiBase() + '/api/status/update', { method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body: payload });
      const text = await resp.text();
      console.log('[Chronos][Status] Update response:', text);
      if (resp.ok) {
        try {
          const latest = await fetchCurrentStatus();
          applyCurrentStatus(latest);
        } catch (e) {
          console.warn('[Chronos][Status] Refresh failed after update:', e);
        }
        triggerRadarUpdateFx();
        setTimeout(() => { alert('Status updated.'); }, 780);
      } else {
        alert('Failed to update status.');
      }
    } catch (e) {
      console.error('[Chronos][Status] Update error:', e);
      alert('Failed to reach Chronos dashboard server. Run: dashboard');
    }
  });

  // Resizers
  function edgeDrag(startRect, cb) { return (ev) => { ev.preventDefault(); function move(e) { cb(e, startRect); } function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); } window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); } }
  const minWidgetWidth = 300;
  const minWidgetHeight = 380;
  const re = el.querySelector('.resizer.e'); const rs = el.querySelector('.resizer.s'); const rse = el.querySelector('.resizer.se');
  if (re) re.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(minWidgetWidth, e.clientX - sr.left) + 'px'; })(ev); });
  if (rs) rs.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.height = Math.max(minWidgetHeight, e.clientY - sr.top) + 'px'; })(ev); });
  if (rse) rse.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(minWidgetWidth, e.clientX - sr.left) + 'px'; el.style.height = Math.max(minWidgetHeight, e.clientY - sr.top) + 'px'; })(ev); });

  initFields().then(() => fetchCurrentStatus().then(applyCurrentStatus).catch(() => { })).catch(() => {
    renderFields();
    fetchCurrentStatus().then(applyCurrentStatus).catch(() => { });
  });

  try {
    const visibilityObserver = new MutationObserver(() => {
      if (isWidgetVisible()) queueAutoExpandToFit();
    });
    visibilityObserver.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
  } catch { }
  window.addEventListener('resize', () => queueAutoExpandToFit());
  queueAutoExpandToFit();

  console.log('[Chronos][Status] Widget ready');
  return {};
}
