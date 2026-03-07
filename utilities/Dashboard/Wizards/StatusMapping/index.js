const OVERLAY_TAG = "chronos-status-mapping-wizard";
let stylesInjected = false;
let overlayEl = null;
let keyHandler = null;
let refs = null;
let wizardState = null;
let contextRef = null;
let optionsRef = null;

const STEP_DEFS = [
  { name: "Status Map", key: "mapping" },
  { name: "Scope", key: "scope" },
  { name: "Preview", key: "preview" },
];

function apiBase() {
  const origin = window.location.origin;
  if (!origin || origin === "null" || origin.startsWith("file:")) return "http://127.0.0.1:7357";
  return origin;
}

async function apiRequest(path, { method = "GET", body } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers["Content-Type"] = "application/json";
  }
  const resp = await fetch(apiBase() + path, opts);
  const text = await resp.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!resp.ok || (data && data.ok === false)) {
    const err = (data && (data.error || data.stderr)) || text || `HTTP ${resp.status}`;
    throw new Error(err);
  }
  return data;
}

function injectStyles() {
  if (stylesInjected) return;
  const style = document.createElement("style");
  style.textContent = `
    .status-map-shell { width: min(1100px, 96vw); max-height: 94vh; }
    .status-map-top { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
    .status-map-top h1 { margin:0; font-size: clamp(21px, 2.8vw, 30px); }
    .status-map-top p { margin:6px 0 0; color: var(--chronos-text-muted); }
    .status-map-close {
      border:1px solid var(--chronos-border-strong); border-radius:10px;
      background: rgba(15,18,30,.75); color: var(--chronos-text); cursor:pointer; padding:8px 12px;
    }
    .status-map-close:hover { filter: brightness(1.08); }
    .status-map-content { display:flex; flex-direction:column; gap:14px; }
    .status-map-shell .wizard-progress {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 8px;
    }
    .status-map-shell .wizard-progress .step {
      display: flex;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 10px;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.05);
      color: var(--chronos-text);
      font-size: 13px;
    }
    .status-map-shell .wizard-progress .step .bullet {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      border: 1px solid rgba(255,255,255,0.2);
      flex: 0 0 auto;
    }
    .status-map-shell .wizard-progress .step.active {
      border-color: var(--chronos-accent);
      background: var(--chronos-accent-soft);
    }
    .status-map-shell .wizard-progress .step.done {
      border-color: var(--chronos-success);
      background: var(--chronos-success-soft);
    }
    .status-map-shell .wizard-progress .step.active .bullet {
      border-color: var(--chronos-accent);
      color: var(--chronos-text);
    }
    .status-map-shell .wizard-progress .step.done .bullet {
      border-color: var(--chronos-success);
      color: var(--chronos-success);
    }
    .status-map-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:10px; }
    .status-card, .scope-card, .preview-card {
      background: rgba(8,12,22,.68);
      border: 1px solid var(--chronos-border-strong);
      border-radius: 12px;
      padding: 12px;
    }
    .status-card h3, .scope-card h3, .preview-card h3 { margin:0 0 8px; font-size: 14px; }
    .status-card .meta { font-size: 12px; color: var(--chronos-text-soft); margin-bottom: 8px; }
    .status-values { display:flex; flex-wrap:wrap; gap:8px; max-height:130px; overflow:auto; padding-right:3px; }
    .status-chip {
      display:inline-flex; align-items:center; gap:5px; padding:5px 9px; border-radius:999px;
      border:1px solid rgba(122,162,247,.35); background: rgba(18,24,40,.9); font-size:12px;
    }
    .status-chip input { margin: 0; }
    .status-extra {
      width: 100%; margin-top: 10px; background: rgba(12,18,30,.9); color: var(--chronos-text);
      border:1px solid var(--chronos-border-strong); border-radius:8px; padding:8px 10px; outline:none;
    }
    .status-extra:focus, .scope-input:focus, .scope-select:focus {
      border-color: rgba(122,162,247,.75); box-shadow: 0 0 0 2px rgba(122,162,247,.2);
    }
    .scope-controls { display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap:10px; }
    .scope-input, .scope-select {
      width:100%; background: rgba(12,18,30,.9); color: var(--chronos-text);
      border:1px solid var(--chronos-border-strong); border-radius:8px; padding:8px 10px; outline:none;
    }
    .scope-inline { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .scope-buttons { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
    .scope-buttons button, .status-mini-btn {
      border:1px solid var(--chronos-border-strong); border-radius:9px; background: rgba(14,18,28,.9);
      color: var(--chronos-text); padding:6px 10px; cursor:pointer; font-size:12px;
    }
    .scope-buttons button:hover, .status-mini-btn:hover { filter: brightness(1.08); }
    .type-list {
      display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:8px; max-height: 180px; overflow:auto; padding-right:3px;
    }
    .type-item { display:flex; align-items:center; gap:8px; font-size: 13px; }
    .preview-stats { display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap:10px; }
    .stat-box {
      background: rgba(10,16,30,.72); border:1px solid var(--chronos-border-strong);
      border-radius:10px; padding:10px;
    }
    .stat-box .k { font-size: 12px; color: var(--chronos-text-soft); }
    .stat-box .v { margin-top: 4px; font-size: 22px; font-weight: 700; }
    .preview-table-wrap {
      border:1px solid var(--chronos-border-strong); border-radius: 10px; overflow:auto; max-height: 300px;
      background: rgba(8,12,20,.7);
    }
    .preview-table { width:100%; border-collapse: collapse; font-size: 12px; }
    .preview-table th, .preview-table td { border-bottom: 1px solid rgba(92,104,136,.35); padding: 8px 10px; text-align:left; vertical-align:top; }
    .preview-table th { position: sticky; top: 0; background: rgba(15,20,36,.96); z-index: 1; }
    .tone-success { color: var(--chronos-success); }
    .tone-warn { color: var(--chronos-warning); }
    .tone-danger { color: var(--chronos-danger); }
    .tone-muted { color: var(--chronos-text-soft); }
    .status-map-footer-note { font-size: 12px; color: var(--chronos-text-soft); }
    @media (max-width: 680px) {
      .status-map-shell { width: min(1100px, 98vw); }
      .status-map-top { flex-direction: column; }
      .status-map-close { align-self:flex-end; }
      .status-map-shell .wizard-progress { grid-template-columns: 1fr; }
      .preview-table { font-size: 11px; }
    }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugStatus(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function parseCSV(text) {
  return String(text || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeStatusRequirements(raw) {
  if (!isObject(raw)) return {};
  const out = {};
  Object.entries(raw).forEach(([key, value]) => {
    const k = slugStatus(key);
    const vals = asArray(value).map((v) => String(v).trim()).filter(Boolean);
    if (k && vals.length) out[k] = vals;
  });
  return out;
}

function extractLegacyStatusRequirements(item, knownStatusKeys) {
  if (!isObject(item)) return {};
  const out = {};
  for (const key of knownStatusKeys) {
    if (!(key in item)) continue;
    const vals = asArray(item[key]).map((v) => String(v).trim()).filter(Boolean);
    if (vals.length) out[key] = vals;
  }
  return out;
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function buildDesiredStatusMap(state) {
  const out = {};
  for (const dim of state.dimensions) {
    const set = state.selectedValues[dim.slug] || new Set();
    const vals = Array.from(set);
    vals.push(...parseCSV(state.manualValues[dim.slug] || ""));
    const cleaned = Array.from(new Set(vals.map((v) => String(v).trim()).filter(Boolean)));
    if (cleaned.length) out[dim.slug] = cleaned;
  }
  return out;
}

function mergeRequirements(currentReq, desiredReq, mode) {
  const current = normalizeStatusRequirements(currentReq);
  if (mode === "replace") return { ...desiredReq };
  const merged = { ...current };
  Object.entries(desiredReq).forEach(([key, values]) => {
    merged[key] = Array.from(new Set([...(merged[key] || []), ...values]));
  });
  return merged;
}

function formatReq(req) {
  if (!isObject(req) || !Object.keys(req).length) return "none";
  return Object.entries(req)
    .map(([k, v]) => `${k}: [${asArray(v).join(", ")}]`)
    .join("; ");
}

function defaultState() {
  return {
    step: 0,
    busy: false,
    items: [],
    itemTypes: [],
    dimensions: [],
    selectedValues: {},
    manualValues: {},
    selectedTypes: new Set(),
    filters: {
      nameIncludes: "",
      categoryEquals: "",
      tagContains: "",
      onlyMissing: true,
      mode: "merge",
      writeLegacyKeys: false,
    },
    preview: null,
    lastBatch: null,
  };
}

async function loadStatusDimensions() {
  const candidates = ["status_settings.yml", "Status_Settings.yml"];
  let config = null;
  for (const file of candidates) {
    try {
      const resp = await apiRequest(`/api/settings?file=${encodeURIComponent(file)}`);
      if (resp?.ok && isObject(resp.data)) {
        config = resp.data;
        break;
      }
    } catch {}
  }
  const rows = asArray(config?.Status_Settings).filter(isObject).sort((a, b) => Number(a.Rank || 999) - Number(b.Rank || 999));
  const out = [];
  for (const row of rows) {
    const name = String(row.Name || "").trim();
    if (!name) continue;
    const slug = slugStatus(name);
    let values = [];
    try {
      const child = await apiRequest(`/api/settings?file=${encodeURIComponent(`${slug}_settings.yml`)}`);
      let childData = child?.data;
      if (isObject(childData) && Object.keys(childData).length === 1) {
        const first = childData[Object.keys(childData)[0]];
        if (isObject(first)) childData = first;
      }
      if (isObject(childData)) values = Object.keys(childData).map((v) => String(v).trim()).filter(Boolean);
    } catch {}
    out.push({
      name,
      slug,
      description: String(row.Description || "").trim(),
      values,
    });
  }
  return out;
}

async function loadItems() {
  const resp = await apiRequest("/api/items");
  const items = asArray(resp?.items).filter(isObject);
  const itemTypes = Array.from(new Set(items.map((it) => String(it.type || "").trim().toLowerCase()).filter(Boolean))).sort();
  return { items, itemTypes };
}

function applyFilters(items, state) {
  const nameNeedle = state.filters.nameIncludes.trim().toLowerCase();
  const categoryNeedle = state.filters.categoryEquals.trim().toLowerCase();
  const tagNeedle = state.filters.tagContains.trim().toLowerCase();
  const selectedTypes = state.selectedTypes;
  const knownStatusKeys = state.dimensions.map((d) => d.slug);
  const desiredReq = buildDesiredStatusMap(state);
  const desiredKeys = Object.keys(desiredReq);

  const selected = [];
  let withStatus = 0;
  let withoutStatus = 0;
  let matchingSelected = 0;

  for (const item of items) {
    const type = String(item.type || "").trim().toLowerCase();
    if (selectedTypes.size && !selectedTypes.has(type)) continue;
    const name = String(item.name || "").trim();
    const category = String(item.category || "").trim().toLowerCase();
    const tags = normalizeTags(item.tags);

    if (nameNeedle && !name.toLowerCase().includes(nameNeedle)) continue;
    if (categoryNeedle && category !== categoryNeedle) continue;
    if (tagNeedle && !tags.some((tag) => tag.includes(tagNeedle))) continue;

    const direct = normalizeStatusRequirements(item.status_requirements);
    const legacy = extractLegacyStatusRequirements(item, knownStatusKeys);
    const mergedCurrent = { ...legacy, ...direct };
    const hasStatus = Object.keys(mergedCurrent).length > 0;
    if (hasStatus) withStatus += 1;
    else withoutStatus += 1;
    if (state.filters.onlyMissing && hasStatus) continue;

    let score = 0;
    for (const key of desiredKeys) {
      const existing = asArray(mergedCurrent[key]).map((v) => String(v).toLowerCase());
      const wanted = asArray(desiredReq[key]).map((v) => String(v).toLowerCase());
      if (wanted.some((v) => existing.includes(v))) score += 1;
    }
    if (score > 0) matchingSelected += 1;

    const nextReq = mergeRequirements(direct, desiredReq, state.filters.mode);
    selected.push({
      type,
      name,
      category,
      tags,
      currentDirectReq: direct,
      currentMergedReq: mergedCurrent,
      nextReq,
      score,
    });
  }

  return {
    selected,
    selectedCount: selected.length,
    withStatus,
    withoutStatus,
    matchingSelected,
    desiredReq,
  };
}

function setStatus(text, tone = "info") {
  if (!refs?.status) return;
  refs.status.textContent = text || "";
  refs.status.dataset.tone = tone;
  refs.status.classList.remove("tone-success", "tone-danger", "tone-warn", "tone-muted");
  if (tone === "success") refs.status.classList.add("tone-success");
  else if (tone === "error") refs.status.classList.add("tone-danger");
  else if (tone === "warn") refs.status.classList.add("tone-warn");
  else refs.status.classList.add("tone-muted");
}

function closeWizard() {
  if (keyHandler) {
    window.removeEventListener("keydown", keyHandler);
    keyHandler = null;
  }
  if (overlayEl?.parentNode) overlayEl.parentNode.removeChild(overlayEl);
  overlayEl = null;
  refs = null;
  wizardState = null;
  try {
    contextRef?.bus?.emit?.("wizard:closed", { wizard: optionsRef?.wizard || "StatusMapping" });
  } catch {}
}

function recomputePreview() {
  wizardState.preview = applyFilters(wizardState.items, wizardState);
}

function renderStepper() {
  if (!refs?.stepper) return;
  refs.stepper.innerHTML = "";
  STEP_DEFS.forEach((step, idx) => {
    const el = document.createElement("div");
    let cls = "";
    if (idx < wizardState.step) cls = "done";
    else if (idx === wizardState.step) cls = "active";
    el.className = `step ${cls}`.trim();
    const bullet = idx < wizardState.step ? "✓" : String(idx + 1);
    el.innerHTML = `<span class="bullet">${bullet}</span><span>${escapeHtml(step.name)}</span>`;
    refs.stepper.appendChild(el);
  });
}

function validateStep(stepIndex) {
  if (stepIndex === 0) {
    const desired = buildDesiredStatusMap(wizardState);
    if (!Object.keys(desired).length) return { valid: false, message: "Select at least one status value to map." };
  }
  if (stepIndex === 1) {
    if (!wizardState.selectedTypes.size) return { valid: false, message: "Pick at least one item/template type." };
  }
  if (stepIndex === 2) {
    if (!wizardState.preview?.selectedCount) return { valid: false, message: "No matching items for current filters." };
  }
  return { valid: true, message: "" };
}

function renderMappingStep(container) {
  const dimensions = wizardState.dimensions;
  const grid = document.createElement("div");
  grid.className = "status-map-grid";
  dimensions.forEach((dim) => {
    const card = document.createElement("div");
    card.className = "status-card";
    const header = document.createElement("h3");
    header.textContent = dim.name;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = dim.description || "Custom status dimension";
    card.append(header, meta);

    const valuesWrap = document.createElement("div");
    valuesWrap.className = "status-values";
    const selected = wizardState.selectedValues[dim.slug] || new Set();
    if (dim.values.length) {
      dim.values.forEach((value) => {
        const chip = document.createElement("label");
        chip.className = "status-chip";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selected.has(value);
        cb.addEventListener("change", () => {
          if (cb.checked) selected.add(value);
          else selected.delete(value);
          wizardState.selectedValues[dim.slug] = selected;
          recomputePreview();
          updateFooterControls();
        });
        const text = document.createElement("span");
        text.textContent = value;
        chip.append(cb, text);
        valuesWrap.appendChild(chip);
      });
    } else {
      const muted = document.createElement("div");
      muted.className = "tone-muted";
      muted.textContent = "No predefined values. Use custom values below.";
      valuesWrap.appendChild(muted);
    }
    card.appendChild(valuesWrap);

    const extra = document.createElement("input");
    extra.className = "status-extra";
    extra.placeholder = "Custom values (comma-separated)";
    extra.value = wizardState.manualValues[dim.slug] || "";
    extra.addEventListener("input", () => {
      wizardState.manualValues[dim.slug] = extra.value;
      recomputePreview();
      updateFooterControls();
    });
    card.appendChild(extra);
    grid.appendChild(card);
  });
  container.appendChild(grid);
}

function renderScopeStep(container) {
  const desired = buildDesiredStatusMap(wizardState);
  const scopeCard = document.createElement("div");
  scopeCard.className = "scope-card";
  scopeCard.innerHTML = `
    <h3>1) Item / Template Types</h3>
    <div class="scope-buttons">
      <button type="button" data-act="all">Select all</button>
      <button type="button" data-act="none">Clear</button>
      <button type="button" data-act="templates">Templates focus</button>
    </div>
    <div class="type-list" data-type-list></div>
  `;
  const typeList = scopeCard.querySelector("[data-type-list]");
  wizardState.itemTypes.forEach((type) => {
    const row = document.createElement("label");
    row.className = "type-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = wizardState.selectedTypes.has(type);
    cb.addEventListener("change", () => {
      if (cb.checked) wizardState.selectedTypes.add(type);
      else wizardState.selectedTypes.delete(type);
      recomputePreview();
      updateFooterControls();
    });
    row.append(cb, document.createTextNode(type));
    typeList.appendChild(row);
  });

  scopeCard.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.act;
      if (action === "all") wizardState.selectedTypes = new Set(wizardState.itemTypes);
      else if (action === "none") wizardState.selectedTypes = new Set();
      else if (action === "templates") {
        const pref = ["day", "day_template", "week", "week_template", "routine", "subroutine", "microroutine", "task"];
        const filtered = wizardState.itemTypes.filter((t) => pref.includes(t));
        wizardState.selectedTypes = new Set(filtered.length ? filtered : wizardState.itemTypes);
      }
      renderCurrentStep();
    });
  });

  const filterCard = document.createElement("div");
  filterCard.className = "scope-card";
  filterCard.innerHTML = `
    <h3>2) Filters</h3>
    <div class="scope-controls">
      <div>
        <label>Name contains</label>
        <input class="scope-input" data-field="nameIncludes" placeholder="e.g., workout, planning">
      </div>
      <div>
        <label>Category equals</label>
        <input class="scope-input" data-field="categoryEquals" placeholder="e.g., health">
      </div>
      <div>
        <label>Tag contains</label>
        <input class="scope-input" data-field="tagContains" placeholder="e.g., recovery">
      </div>
      <div>
        <label>Mapping mode</label>
        <select class="scope-select" data-field="mode">
          <option value="merge">Merge into existing status requirements</option>
          <option value="replace">Replace existing status requirements</option>
        </select>
      </div>
    </div>
    <div class="scope-inline" style="margin-top:10px;">
      <label><input type="checkbox" data-field="onlyMissing"> Only items missing status requirements</label>
      <label><input type="checkbox" data-field="writeLegacyKeys"> Also write legacy top-level status keys</label>
    </div>
  `;

  filterCard.querySelectorAll("[data-field]").forEach((input) => {
    const field = input.dataset.field;
    if (input.type === "checkbox") {
      input.checked = Boolean(wizardState.filters[field]);
      input.addEventListener("change", () => {
        wizardState.filters[field] = input.checked;
        recomputePreview();
        updateFooterControls();
      });
    } else {
      input.value = wizardState.filters[field] ?? "";
      input.addEventListener("input", () => {
        wizardState.filters[field] = input.value;
        recomputePreview();
        updateFooterControls();
      });
    }
  });

  const mapCard = document.createElement("div");
  mapCard.className = "scope-card";
  mapCard.innerHTML = `<h3>3) Proposed Status Map</h3><div>${escapeHtml(formatReq(desired))}</div>`;

  container.append(scopeCard, filterCard, mapCard);
}

function renderPreviewStep(container) {
  const preview = wizardState.preview || { selected: [], selectedCount: 0, withStatus: 0, withoutStatus: 0, matchingSelected: 0 };
  const card = document.createElement("div");
  card.className = "preview-card";
  card.innerHTML = `
    <h3>Coverage + Apply Impact</h3>
    <div class="preview-stats">
      <div class="stat-box"><div class="k">Matching Scope</div><div class="v">${preview.selectedCount}</div></div>
      <div class="stat-box"><div class="k">Already Tagged</div><div class="v">${preview.withStatus}</div></div>
      <div class="stat-box"><div class="k">Missing Status Tags</div><div class="v">${preview.withoutStatus}</div></div>
      <div class="stat-box"><div class="k">Already Matching Selected Values</div><div class="v">${preview.matchingSelected}</div></div>
    </div>
    <div style="margin-top:10px;" class="tone-muted">
      Apply mode: <strong>${escapeHtml(wizardState.filters.mode)}</strong> |
      Only missing: <strong>${wizardState.filters.onlyMissing ? "yes" : "no"}</strong> |
      Legacy keys: <strong>${wizardState.filters.writeLegacyKeys ? "yes" : "no"}</strong>
    </div>
  `;
  container.appendChild(card);

  const samples = document.createElement("div");
  samples.className = "preview-card";
  const rows = preview.selected.slice(0, 80);
  let tableHtml = `
    <h3>Sample Changes (${rows.length}${preview.selectedCount > rows.length ? ` of ${preview.selectedCount}` : ""})</h3>
    <div class="preview-table-wrap">
      <table class="preview-table">
        <thead><tr><th>Type</th><th>Name</th><th>Current</th><th>After</th></tr></thead>
        <tbody>
  `;
  if (!rows.length) {
    tableHtml += `<tr><td colspan="4" class="tone-muted">No items match current scope.</td></tr>`;
  } else {
    rows.forEach((row) => {
      tableHtml += `<tr>
        <td>${escapeHtml(row.type)}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(formatReq(row.currentMergedReq))}</td>
        <td>${escapeHtml(formatReq(row.nextReq))}</td>
      </tr>`;
    });
  }
  tableHtml += "</tbody></table></div>";
  samples.innerHTML = tableHtml;
  container.appendChild(samples);
}

function renderCurrentStep() {
  if (!refs?.body || !wizardState) return;
  recomputePreview();
  refs.body.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "status-map-content";
  if (wizardState.step === 0) renderMappingStep(wrap);
  else if (wizardState.step === 1) renderScopeStep(wrap);
  else renderPreviewStep(wrap);
  refs.body.appendChild(wrap);
  renderStepper();
  updateFooterControls();
}

function updateFooterControls() {
  if (!refs || !wizardState) return;
  const validation = validateStep(wizardState.step);
  refs.prev.disabled = wizardState.busy || wizardState.step === 0;
  refs.next.disabled = wizardState.busy || wizardState.step >= STEP_DEFS.length - 1 || !validation.valid;
  refs.apply.disabled = wizardState.busy || wizardState.step !== STEP_DEFS.length - 1 || !validation.valid;
  refs.undo.disabled = wizardState.busy || !wizardState.lastBatch?.ops?.length;
  refs.validation.textContent = validation.valid ? "" : validation.message;
  refs.validation.className = validation.valid ? "tone-muted" : "tone-warn";
}

function moveStep(delta) {
  const target = wizardState.step + delta;
  if (target < 0 || target >= STEP_DEFS.length) return;
  const validation = validateStep(wizardState.step);
  if (delta > 0 && !validation.valid) return;
  wizardState.step = target;
  renderCurrentStep();
}

async function applyBulkTags() {
  if (wizardState.busy) return;
  recomputePreview();
  const targets = wizardState.preview?.selected || [];
  if (!targets.length) {
    setStatus("No matching items to update.", "warn");
    return;
  }
  wizardState.busy = true;
  updateFooterControls();
  setStatus(`Applying status map to ${targets.length} item(s)...`, "info");

  const desiredReq = wizardState.preview.desiredReq;
  const ops = [];
  const failures = [];
  const knownStatusKeys = wizardState.dimensions.map((d) => d.slug);

  for (let i = 0; i < targets.length; i += 1) {
    const item = targets[i];
    const beforeLegacy = extractLegacyStatusRequirements(item, knownStatusKeys);
    const payload = { status_requirements: item.nextReq };
    if (wizardState.filters.writeLegacyKeys) {
      Object.entries(desiredReq).forEach(([key, vals]) => {
        payload[key] = vals.length <= 1 ? (vals[0] || null) : vals;
      });
    }
    try {
      await apiRequest("/api/item", {
        method: "POST",
        body: {
          type: item.type,
          name: item.name,
          properties: payload,
        },
      });
      ops.push({
        type: item.type,
        name: item.name,
        beforeReq: item.currentDirectReq,
        beforeLegacy,
        afterReq: item.nextReq,
      });
      if (i % 15 === 0 || i === targets.length - 1) {
        setStatus(`Applied ${i + 1}/${targets.length} updates...`, "info");
      }
    } catch (err) {
      failures.push({ type: item.type, name: item.name, error: String(err?.message || err) });
    }
  }

  wizardState.lastBatch = { ops, desiredReq, wroteLegacy: wizardState.filters.writeLegacyKeys };
  wizardState.busy = false;
  try {
    const refreshed = await loadItems();
    wizardState.items = refreshed.items;
    wizardState.itemTypes = refreshed.itemTypes;
    if (!wizardState.selectedTypes.size) wizardState.selectedTypes = new Set(refreshed.itemTypes);
  } catch {}
  recomputePreview();
  renderCurrentStep();
  if (failures.length) {
    setStatus(`Updated ${ops.length} item(s), ${failures.length} failed.`, "warn");
    console.warn("[Chronos][StatusMappingWizard] failures", failures);
  } else {
    setStatus(`Updated ${ops.length} item(s). Undo is available in this session.`, "success");
  }
  try {
    contextRef?.bus?.emit?.("wizard:status_mapping:applied", {
      updated: ops.length,
      failed: failures.length,
      map: desiredReq,
    });
  } catch {}
}

async function undoLastBatch() {
  const batch = wizardState?.lastBatch;
  if (!batch?.ops?.length || wizardState.busy) return;
  wizardState.busy = true;
  updateFooterControls();
  setStatus(`Reverting ${batch.ops.length} item(s)...`, "warn");
  const failures = [];
  for (let i = 0; i < batch.ops.length; i += 1) {
    const op = batch.ops[i];
    const payload = { status_requirements: op.beforeReq && Object.keys(op.beforeReq).length ? op.beforeReq : null };
    if (batch.wroteLegacy) {
      wizardState.dimensions.forEach((dim) => {
        const prevVals = asArray(op.beforeLegacy?.[dim.slug]).filter(Boolean);
        payload[dim.slug] = prevVals.length <= 1 ? (prevVals[0] || null) : prevVals;
      });
    }
    try {
      await apiRequest("/api/item", {
        method: "POST",
        body: {
          type: op.type,
          name: op.name,
          properties: payload,
        },
      });
    } catch (err) {
      failures.push({ type: op.type, name: op.name, error: String(err?.message || err) });
    }
  }
  wizardState.lastBatch = null;
  wizardState.busy = false;
  try {
    const refreshed = await loadItems();
    wizardState.items = refreshed.items;
    wizardState.itemTypes = refreshed.itemTypes;
  } catch {}
  recomputePreview();
  renderCurrentStep();
  if (failures.length) {
    setStatus(`Undo completed with ${failures.length} failure(s).`, "warn");
    console.warn("[Chronos][StatusMappingWizard] undo failures", failures);
  } else {
    setStatus("Undo complete. Previous status tags restored.", "success");
  }
}

function buildUI() {
  overlayEl = document.createElement("div");
  overlayEl.className = "chronos-wizard-overlay";
  overlayEl.dataset.wizardOverlay = OVERLAY_TAG;
  overlayEl.innerHTML = `
    <div class="chronos-wizard-shell status-map-shell">
      <div class="status-map-top">
        <div>
          <h1>Status Mapping Wizard</h1>
          <p>Bulk-tag items and templates with status requirements, preview impact, then apply with undo.</p>
        </div>
        <button class="status-map-close" data-close type="button">Close</button>
      </div>
      <div class="wizard-progress chronos-wizard-stepper" data-stepper></div>
      <div class="chronos-wizard-body" data-body></div>
      <div class="chronos-wizard-footer">
        <div class="chronos-wizard-status">
          <div data-status class="tone-muted"></div>
          <div data-validation class="tone-muted"></div>
          <div class="status-map-footer-note">Tip: use Merge mode first, then switch to Replace only if you want strict status gating.</div>
        </div>
        <div class="chronos-wizard-actions">
          <button type="button" data-prev>Back</button>
          <button type="button" data-next class="primary">Next</button>
          <button type="button" data-apply class="primary">Apply Tags</button>
          <button type="button" data-undo>Undo Last Apply</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  refs = {
    body: overlayEl.querySelector("[data-body]"),
    stepper: overlayEl.querySelector("[data-stepper]"),
    prev: overlayEl.querySelector("[data-prev]"),
    next: overlayEl.querySelector("[data-next]"),
    apply: overlayEl.querySelector("[data-apply]"),
    undo: overlayEl.querySelector("[data-undo]"),
    status: overlayEl.querySelector("[data-status]"),
    validation: overlayEl.querySelector("[data-validation]"),
    close: overlayEl.querySelector("[data-close]"),
  };
  refs.prev.addEventListener("click", () => moveStep(-1));
  refs.next.addEventListener("click", () => moveStep(1));
  refs.apply.addEventListener("click", () => {
    applyBulkTags().catch((err) => {
      wizardState.busy = false;
      updateFooterControls();
      setStatus(String(err?.message || err), "error");
    });
  });
  refs.undo.addEventListener("click", () => {
    undoLastBatch().catch((err) => {
      wizardState.busy = false;
      updateFooterControls();
      setStatus(String(err?.message || err), "error");
    });
  });
  refs.close.addEventListener("click", closeWizard);
  overlayEl.addEventListener("click", (ev) => {
    if (ev.target === overlayEl) closeWizard();
  });
  keyHandler = (ev) => {
    if (ev.key === "Escape") closeWizard();
  };
  window.addEventListener("keydown", keyHandler);
}

export async function launch(context, options = {}) {
  injectStyles();
  contextRef = context || null;
  optionsRef = options || {};
  wizardState = defaultState();
  buildUI();
  setStatus("Loading status dimensions and items...", "info");
  try {
    const [dimensions, data] = await Promise.all([loadStatusDimensions(), loadItems()]);
    wizardState.dimensions = dimensions;
    wizardState.items = data.items;
    wizardState.itemTypes = data.itemTypes;
    wizardState.selectedTypes = new Set(data.itemTypes);
    dimensions.forEach((dim) => {
      wizardState.selectedValues[dim.slug] = new Set();
      wizardState.manualValues[dim.slug] = "";
    });
    recomputePreview();
    renderCurrentStep();
    if (!dimensions.length) {
      setStatus("No status dimensions found. Configure status settings first.", "warn");
    } else {
      setStatus(`Loaded ${dimensions.length} dimensions and ${data.items.length} items.`, "success");
    }
    try {
      contextRef?.bus?.emit?.("wizard:opened", { wizard: options?.wizard || "StatusMapping" });
    } catch {}
  } catch (err) {
    setStatus(`Failed to load wizard data: ${String(err?.message || err)}`, "error");
    console.error("[Chronos][StatusMappingWizard] launch error", err);
  }
}
