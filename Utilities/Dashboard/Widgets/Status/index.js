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
  if (!el.querySelector('link[href="./Widgets/Status/status.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './Widgets/Status/status.css';
    el.appendChild(link);
  }

  const header = el.querySelector('#statusHeader');
  const btnMin = el.querySelector('#statusMin');
  const btnClose = el.querySelector('#statusClose');
  const fieldsRoot = el.querySelector('#statusFields');
  const btnUpdate = el.querySelector('#statusUpdate');
  // fx toggle for expanded display of labels (does not affect saves)
  const fxWrap = document.createElement('label'); fxWrap.className = 'hint'; fxWrap.style.display = 'flex'; fxWrap.style.alignItems = 'center'; fxWrap.style.gap = '6px'; fxWrap.style.margin = '6px 0';
  const fx = document.createElement('input'); fx.type = 'checkbox'; fx.id = 'statusFxToggle'; fx.checked = true; fxWrap.append(fx, document.createTextNode('fx'));
  try { fieldsRoot.parentElement.insertBefore(fxWrap, fieldsRoot); } catch { }

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

  const settings = (window.CHRONOS_SETTINGS && window.CHRONOS_SETTINGS.status) || {};
  const types = Array.isArray(settings.types) ? settings.types : ['Health', 'Place', 'Energy', 'Mind State', 'Focus', 'Emotion', 'Vibe'];
  const optionsMap = settings.options || {};
  let currentStatus = normalizeStatusMap(settings.current || {});

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
      const select = fieldRefs[key];
      if (!select) return;
      const rawVal = currentStatus[key];
      if (!rawVal) return;
      const exact = Array.from(select.options).find(o => o.value === rawVal);
      const ci = exact || Array.from(select.options || []).find(o => o.value.toLowerCase() === String(rawVal).toLowerCase());
      if (ci) select.value = ci.value;
      if (select.value === undefined && typeof select.value === 'string') select.value = rawVal; // knob case fallback
    });
  }
  function expandText(s) { try { return (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(s || '')) : String(s || ''); } catch { return String(s || ''); } }
  let fxEnabled = true;
  fx?.addEventListener('change', () => {
    fxEnabled = !!fx.checked;
    try {
      fieldsRoot.querySelectorAll('.knob-label').forEach(l => {
        const raw = l.getAttribute('data-raw') || l.textContent || '';
        l.textContent = fxEnabled ? expandText(raw) : raw;
      });
      fieldsRoot.querySelectorAll('.knob-value-display').forEach(d => {
        const raw = d.getAttribute('data-raw') || d.textContent || '';
        d.textContent = fxEnabled ? expandText(raw) : raw;
      });
      fieldsRoot.querySelectorAll('label.hint').forEach(l => {
        const raw = l.getAttribute('data-raw') || l.textContent || '';
        l.textContent = fxEnabled ? expandText(raw) : raw;
      });
    } catch { }
  });

  // Helper to render a knob
  function renderKnob(typeSlug, labelText, options) {
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
      set value(val) {
        // try exact then case-insensitive
        let idx = validOptions.indexOf(val);
        if (idx === -1) idx = validOptions.findIndex(o => String(o).toLowerCase() === String(val).toLowerCase());
        if (idx !== -1) {
          currentIndex = idx;
          updateVisuals();
        }
      },
      el: wrap
    };

    function updateVisuals() {
      // Map index to angle range (-135 to 135 = 270 degrees total)
      const pct = currentIndex / (validOptions.length - 1 || 1);
      const angle = -135 + (pct * 270);
      dial.style.transform = `rotate(${angle}deg)`;

      const rawText = String(validOptions[currentIndex]);
      valDisplay.textContent = fxEnabled ? expandText(rawText) : rawText;
      valDisplay.setAttribute('data-raw', rawText);
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

  types.forEach(type => {
    const typeSlug = slugify(type);
    const labelText = expandText(type);
    const opts = Array.isArray(optionsMap[type]) ? optionsMap[type] : ['Poor', 'Fair', 'Good', 'Excellent'];

    // Create knob
    const knob = renderKnob(typeSlug, labelText, opts);
    fieldRefs[typeSlug] = knob;

    // Set initial value
    const curVal = currentStatus[typeSlug];
    if (curVal) knob.value = curVal;
  });
  // Re-expand options when vars change
  try {
    window?.ChronosVars && context?.bus?.on('vars:changed', () => {
      try {
        fieldsRoot.querySelectorAll('.knob-label').forEach(l => {
          const raw = l.getAttribute('data-raw') || l.textContent || '';
          l.textContent = fxEnabled ? expandText(raw) : raw;
        });
        fieldsRoot.querySelectorAll('.knob-value-display').forEach(d => {
          const raw = d.getAttribute('data-raw') || d.textContent || '';
          d.textContent = fxEnabled ? expandText(raw) : raw;
        });
        // Also update standard hints
        fieldsRoot.querySelectorAll('label.hint').forEach(l => {
          const raw = l.getAttribute('data-raw') || l.textContent || '';
          l.textContent = fxEnabled ? expandText(raw) : raw;
        });
      } catch { }
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
        alert('Status updated.');
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
  const re = el.querySelector('.resizer.e'); const rs = el.querySelector('.resizer.s'); const rse = el.querySelector('.resizer.se');
  if (re) re.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(260, e.clientX - sr.left) + 'px'; })(ev); });
  if (rs) rs.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.height = Math.max(160, e.clientY - sr.top) + 'px'; })(ev); });
  if (rse) rse.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(260, e.clientX - sr.left) + 'px'; el.style.height = Math.max(160, e.clientY - sr.top) + 'px'; })(ev); });

  fetchCurrentStatus().then(applyCurrentStatus).catch(() => { });

  console.log('[Chronos][Status] Widget ready');
  return {};
}
