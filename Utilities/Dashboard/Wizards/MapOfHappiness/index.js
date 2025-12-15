const OVERLAY_TAG = 'chronos-map-of-happiness';
const STYLE_ID = 'chronos-map-of-happiness-style';

const STEP_DEFS = [
  { id: 'intro', name: 'Orientation', hint: 'Why this matters', render: renderIntroStep },
  { id: 'capture', name: 'Capture', hint: 'List non-negotiables', render: renderCaptureStep },
  { id: 'consolidate', name: 'Consolidate', hint: 'Group into needs', render: renderConsolidateStep },
  { id: 'rank', name: 'Rank & Define', hint: 'Priorities, sufficiency, satisfaction', render: renderRankStep },
  { id: 'tagging', name: 'Tag Items', hint: 'Optionally tag existing items', render: renderTaggingStep },
  { id: 'review', name: 'Review & Save', hint: 'Validate and persist', render: renderReviewStep },
];

const PROMPTS = [
  'Relationships',
  'Autonomy',
  'Health & recovery',
  'Creative output',
  'Safety & stability',
  'Growth & mastery',
  'Purpose / contribution',
  'Adventure / novelty',
  'Finances / security',
  'Play / joy',
];

const ITEM_TYPES = [
  'task',
  'project',
  'routine',
  'subroutine',
  'microroutine',
  'habit',
  'goal',
  'milestone',
  'commitment',
  'reward',
  'achievement',
  'note',
];

let overlayEl = null;
let overlayRefs = null;
let wizardState = null;
let keyHandler = null;

function apiBase() {
  const origin = window.location.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .moh-overlay { position: fixed; inset: 0; z-index: 1200; background: var(--chronos-overlay-gradient); backdrop-filter: var(--chronos-overlay-blur); display: flex; align-items: center; justify-content: center; padding: clamp(12px,3vw,28px); }
    .moh-shell { width: min(1080px, 96vw); max-height: 94vh; background: linear-gradient(135deg, rgba(9,12,24,0.96), rgba(10,14,32,0.96)); border: 1px solid rgba(122,162,247,0.28); border-radius: 22px; box-shadow: 0 30px 90px rgba(0,0,0,0.7); display: flex; flex-direction: column; gap: 14px; padding: clamp(18px,3vw,26px); color: var(--chronos-text); position: relative; overflow: hidden; }
    .moh-shell::after { content: ""; position: absolute; inset: auto -40% -60% auto; width: 420px; height: 420px; background: radial-gradient(circle, rgba(122,162,247,0.14), transparent 65%); pointer-events: none; }
    .moh-header { display: flex; flex-direction: column; gap: 6px; }
    .moh-title { font-size: clamp(22px, 3vw, 28px); font-weight: 800; letter-spacing: 0.2px; display: flex; gap: 10px; align-items: center; }
    .moh-sub { color: var(--chronos-text-muted); font-size: 14px; line-height: 1.5; max-width: 840px; }
    .moh-body { flex: 1 1 auto; overflow: auto; padding-right: 4px; }
    .moh-footer { display: flex; gap: 10px; align-items: center; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px; }
    .moh-steps { display: flex; gap: 6px; flex-wrap: wrap; }
    .moh-step { padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.03); color: var(--chronos-text-muted); font-size: 12px; display: inline-flex; gap: 8px; align-items: center; }
    .moh-step.active { color: var(--chronos-text); border-color: rgba(122,162,247,0.4); background: rgba(122,162,247,0.12); }
    .moh-step strong { font-weight: 700; color: var(--chronos-accent); }
    .moh-actions { display: flex; gap: 10px; }
    .moh-btn { border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: var(--chronos-text); border-radius: 10px; padding: 10px 14px; font-weight: 600; cursor: pointer; transition: all 160ms ease; }
    .moh-btn.primary { background: linear-gradient(135deg, var(--chronos-accent), #7aa2f7); color: #0b1020; border-color: rgba(122,162,247,0.7); }
    .moh-btn:hover { transform: translateY(-1px); border-color: rgba(255,255,255,0.22); }
    .moh-grid { display: grid; gap: 12px; }
    .moh-grid.two { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .moh-card { border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.03); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .moh-card h3 { margin: 0; font-size: 16px; }
    .moh-label { font-size: 13px; color: var(--chronos-text-muted); margin-bottom: 4px; display: block; }
    .moh-input, .moh-textarea, .moh-select { width: 100%; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(12,14,28,0.8); color: var(--chronos-text); padding: 10px 12px; font-size: 14px; }
    .moh-textarea { min-height: 90px; resize: vertical; }
    .moh-chiplist { display: flex; flex-wrap: wrap; gap: 8px; }
    .moh-chip { padding: 6px 10px; border-radius: 12px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); font-size: 12px; cursor: pointer; }
    .moh-chip[data-active="true"] { background: rgba(122,162,247,0.16); border-color: rgba(122,162,247,0.5); color: var(--chronos-accent); }
    .moh-status { font-size: 13px; color: var(--chronos-text-muted); min-height: 18px; }
    .moh-status[data-tone="error"] { color: var(--chronos-danger); }
    .moh-status[data-tone="success"] { color: var(--chronos-success); }
    .moh-inline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .moh-pill { background: rgba(255,255,255,0.06); border-radius: 999px; padding: 6px 10px; font-size: 12px; border: 1px solid rgba(255,255,255,0.08); }
    .moh-progress { position: relative; height: 8px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
    .moh-progress span { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, var(--chronos-accent), #7aa2f7); }
    .moh-yaml { background: #0b0f1d; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px; font-family: "SFMono-Regular", Consolas, Menlo, monospace; color: #cbd5f5; font-size: 12px; white-space: pre; overflow: auto; max-height: 420px; }
    .moh-help { font-size: 13px; color: var(--chronos-text-muted); line-height: 1.5; }
    .moh-small { font-size: 12px; color: var(--chronos-text-muted); }
    .moh-rank-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
    .moh-tag { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.06); font-size: 12px; }
    .moh-badge { font-size: 12px; padding: 6px 10px; background: rgba(122,162,247,0.12); color: var(--chronos-accent); border-radius: 10px; border: 1px solid rgba(122,162,247,0.3); }
  `;
  document.head.appendChild(style);
}

function initialState() {
  return {
    step: 0,
    rawEntries: [],
    assignments: {}, // raw index -> clusterId
    clusters: [],
    mapEntries: [],
    metadata: {},
    saving: false,
    tagging: {
      needKey: '',
      type: 'task',
      search: '',
      itemsByType: {},
      selected: new Set(),
      loading: false,
      error: '',
    },
  };
}

function slugify(text) {
  return (text || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'need';
}

function uniqId() {
  return 'id-' + Math.random().toString(36).slice(2, 9);
}

function setStatus(message, tone = 'muted') {
  if (!overlayRefs?.statusEl) return;
  overlayRefs.statusEl.textContent = message || '';
  overlayRefs.statusEl.dataset.tone = tone;
}

function mountOverlay(context) {
  injectStyles();
  if (overlayEl) overlayEl.remove();
  overlayEl = document.createElement('div');
  overlayEl.className = 'moh-overlay';
  overlayEl.innerHTML = `
    <div class="moh-shell">
      <div class="moh-header">
        <div class="moh-title">Map of Happiness Wizard <span class="moh-pill">Sam Vaknin technique</span></div>
        <div class="moh-sub">Capture everything you cannot be happy without, cluster them into needs, rank them, define sufficiency, and save to <code>User/Settings/map_of_happiness.yml</code> so items can tag <code>happiness</code> values.</div>
        <div class="moh-steps" data-stepper></div>
      </div>
      <div class="moh-body" data-body></div>
      <div class="moh-footer">
        <div class="moh-status" data-status></div>
        <div class="moh-actions">
          <button class="moh-btn" data-cancel>Cancel</button>
          <button class="moh-btn" data-prev>Back</button>
          <button class="moh-btn primary" data-next>Next</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);

  overlayRefs = {
    body: overlayEl.querySelector('[data-body]'),
    statusEl: overlayEl.querySelector('[data-status]'),
    stepper: overlayEl.querySelector('[data-stepper]'),
    cancelBtn: overlayEl.querySelector('[data-cancel]'),
    prevBtn: overlayEl.querySelector('[data-prev]'),
    nextBtn: overlayEl.querySelector('[data-next]'),
    context,
  };
  wizardState = initialState();

  overlayRefs.cancelBtn.addEventListener('click', closeWizard);
  overlayRefs.prevBtn.addEventListener('click', () => changeStep(-1));
  overlayRefs.nextBtn.addEventListener('click', handleNext);

  keyHandler = (ev) => {
    if (ev.key === 'Escape') closeWizard();
  };
  window.addEventListener('keydown', keyHandler);

  refreshStepper();
  renderStepContent();
  updateNav();
}

function refreshStepper() {
  if (!overlayRefs?.stepper) return;
  overlayRefs.stepper.innerHTML = '';
  STEP_DEFS.forEach((step, idx) => {
    const el = document.createElement('div');
    el.className = 'moh-step' + (idx === wizardState.step ? ' active' : '');
    el.innerHTML = `<strong>${idx + 1}</strong> ${step.name} <span class="moh-small">${step.hint}</span>`;
    overlayRefs.stepper.appendChild(el);
  });
}

function updateNav() {
  const prevDisabled = wizardState.step === 0;
  const lastStep = wizardState.step === STEP_DEFS.length - 1;
  if (overlayRefs?.prevBtn) overlayRefs.prevBtn.disabled = prevDisabled;
  if (overlayRefs?.nextBtn) overlayRefs.nextBtn.textContent = lastStep ? 'Save Map' : 'Next';
}

function changeStep(delta) {
  const target = wizardState.step + delta;
  if (target < 0 || target >= STEP_DEFS.length) return;
  wizardState.step = target;
  setStatus('');
  refreshStepper();
  renderStepContent();
  updateNav();
}

function handleNext() {
  const current = wizardState.step;
  const validation = validateStep(current);
  if (!validation.valid) {
    setStatus(validation.message, 'error');
    return;
  }
  if (current === STEP_DEFS.length - 1) {
    saveMap();
  } else {
    changeStep(1);
  }
}

function validateStep(stepIndex) {
  if (STEP_DEFS[stepIndex]?.id === 'capture') {
    const entries = collectRawEntries();
    if (!entries.length) return { valid: false, message: 'Add at least one non-negotiable entry.' };
    wizardState.rawEntries = entries;
  }
  if (STEP_DEFS[stepIndex]?.id === 'consolidate') {
    if (!wizardState.clusters.length) return { valid: false, message: 'Create at least one need/category.' };
  }
  if (STEP_DEFS[stepIndex]?.id === 'rank') {
    syncMapEntriesFromClusters();
    if (!wizardState.mapEntries.length) return { valid: false, message: 'No map entries to rank.' };
    const priorities = wizardState.mapEntries.map(e => Number(e.priority || 0));
    const uniq = new Set(priorities);
    if (uniq.size !== priorities.length) return { valid: false, message: 'Priority ranks must be unique.' };
    if (priorities.some(p => isNaN(p) || p < 1)) return { valid: false, message: 'Priority ranks must be positive numbers.' };
    const invalidSatisfaction = wizardState.mapEntries.find(e => isNaN(Number(e.satisfaction)) || Number(e.satisfaction) < 0 || Number(e.satisfaction) > 100);
    if (invalidSatisfaction) return { valid: false, message: `Satisfaction for "${invalidSatisfaction.label || invalidSatisfaction.key}" must be between 0 and 100.` };
    const keys = wizardState.mapEntries.map(e => (e.key || '').trim().toLowerCase());
    const keySet = new Set(keys);
    if (keySet.size !== keys.length || keys.some(k => !k)) return { valid: false, message: 'Each entry needs a unique, non-empty key.' };
  }
  return { valid: true, message: '' };
}

function collectRawEntries() {
  const area = overlayRefs?.body?.querySelector('[data-raw-list]');
  if (!area) return wizardState.rawEntries;
  const lines = area.value.split('\n').map(s => s.trim()).filter(Boolean);
  return Array.from(new Set(lines));
}

function renderStepContent() {
  if (!overlayRefs?.body) return;
  const step = STEP_DEFS[wizardState.step];
  if (!step) return;
  step.render(overlayRefs.body, wizardState);
}

function renderIntroStep(container) {
  container.innerHTML = `
    <div class="moh-card">
      <h3>Map of Happiness by Sam Vaknin</h3>
      <p class="moh-help">List every condition without which you cannot be happy, consolidate them into higher-level needs, rank them, and define what "enough" means. The wizard saves your map to <code>map_of_happiness.yml</code> so items and templates can tag <code>happiness</code> values (single value or array). Source: <a class="moh-link" href="https://vaknin-talks.com/transcripts/Map_Your_Happiness_Past_and_Future_Selves_EXCERPT/" target="_blank" rel="noopener">Vaknin Talks</a>.</p>
      <div class="moh-chiplist">
        <span class="moh-chip">Status-aware planning</span>
        <span class="moh-chip">Values-aligned scheduling</span>
        <span class="moh-chip">Dashboard visualization</span>
      </div>
    </div>
    <div class="moh-card">
      <h3>How it works</h3>
      <ol class="moh-help" style="padding-left: 18px; line-height:1.6;">
        <li>Capture every non-negotiable (exclude nice-to-haves).</li>
        <li>Cluster entries into needs (Freedom, Safety, Connection...).</li>
        <li>Rank needs, define sufficiency, set satisfaction (0-100), and link Chronos items that protect each need.</li>
        <li>Review YAML preview, auto-archive the previous file, and save.</li>
      </ol>
      <p class="moh-help">Tip: After saving, tag items with <code>happiness: [&lt;key&gt;]</code> so the cockpit panel can show coverage.</p>
      <div style="margin-top: 12px;">
        <button class="moh-btn primary" data-start>Begin capture</button>
      </div>
    </div>
  `;
  container.querySelector('[data-start]')?.addEventListener('click', () => {
    wizardState.step = 1;
    refreshStepper();
    renderStepContent();
    updateNav();
  });
}

function renderCaptureStep(container) {
  const existing = wizardState.rawEntries.join('\n');
  const promptChips = PROMPTS.map(p => `<span class="moh-chip" data-prompt="${p}">${p}</span>`).join('');
  container.innerHTML = `
    <div class="moh-card">
      <h3>List every non-negotiable</h3>
      <p class="moh-help">Capture conditions without which you cannot be happy. Keep them short; you can clarify later.</p>
      <div class="moh-chiplist" style="margin-bottom:10px;">${promptChips}</div>
      <textarea class="moh-textarea" data-raw-list placeholder="Examples: Deep connection with family&#10;Creative autonomy and freedom&#10;Feeling physically safe and healthy">${existing}</textarea>
      <p class="moh-small">One entry per line. We'll consolidate and rank them next.</p>
    </div>
  `;
  container.querySelectorAll('[data-prompt]').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.prompt || '';
      const area = container.querySelector('[data-raw-list]');
      if (!area) return;
      const lines = collectRawEntries();
      if (!lines.includes(val)) lines.push(val);
      area.value = lines.join('\n');
    });
  });
}

function ensureCluster(label) {
  const trimmed = (label || '').trim();
  if (!trimmed) return null;
  let cluster = wizardState.clusters.find(c => c.label.toLowerCase() === trimmed.toLowerCase());
  if (!cluster) {
    cluster = { id: uniqId(), label: trimmed };
    wizardState.clusters.push(cluster);
  }
  return cluster;
}

function renderConsolidateStep(container) {
  const entries = wizardState.rawEntries.length ? wizardState.rawEntries : collectRawEntries();
  if (!wizardState.rawEntries.length) wizardState.rawEntries = entries;
  container.innerHTML = `
    <div class="moh-card">
      <h3>Consolidate into needs</h3>
      <p class="moh-help">Group raw entries into higher-level needs. Add categories, then assign each entry.</p>
      <div class="moh-inline" style="margin-bottom:10px;">
        <input class="moh-input" data-new-cluster placeholder="Add a need (e.g., Freedom, Safety)" />
        <button class="moh-btn" data-add-cluster>Add</button>
        <span class="moh-small">Make categories broad enough to guide scheduling.</span>
      </div>
      <div class="moh-grid two">
        <div>
          <h4 style="margin:0 0 8px 0;">Entries</h4>
          <div class="moh-grid" style="gap:10px;">
            ${entries.map((line, idx) => {
              const assigned = wizardState.assignments[idx] || '';
              return `
                <div class="moh-card" style="padding:10px;">
                  <div class="moh-label">Entry</div>
                  <div class="moh-pill" style="margin-bottom:6px;">${escapeHtml(line)}</div>
                  <label class="moh-label">Need</label>
                  <select class="moh-select" data-assign="${idx}">
                    <option value="">Unassigned</option>
                    ${wizardState.clusters.map(c => `<option value="${c.id}" ${assigned===c.id?'selected':''}>${escapeHtml(c.label)}</option>`).join('')}
                  </select>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        <div>
          <h4 style="margin:0 0 8px 0;">Needs</h4>
          <div class="moh-chiplist" data-cluster-list>
            ${wizardState.clusters.map(c => `<span class="moh-chip" data-cluster="${c.id}">${escapeHtml(c.label)}</span>`).join('')}
          </div>
          <p class="moh-help" style="margin-top:10px;">Unassigned entries can be left for later, but aim to place them before ranking.</p>
        </div>
      </div>
    </div>
  `;
  container.querySelector('[data-add-cluster]')?.addEventListener('click', () => {
    const input = container.querySelector('[data-new-cluster]');
    if (!input) return;
    const label = input.value.trim();
    if (!label) return;
    ensureCluster(label);
    input.value = '';
    renderStepContent();
    refreshStepper();
  });
  container.querySelectorAll('[data-assign]').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = Number(sel.dataset.assign);
      const val = sel.value || '';
      wizardState.assignments[idx] = val;
      if (!val) delete wizardState.assignments[idx];
    });
  });
}

function syncMapEntriesFromClusters() {
  const essentialsByCluster = {};
  wizardState.rawEntries.forEach((entry, idx) => {
    const cid = wizardState.assignments[idx];
    if (!cid) return;
    if (!essentialsByCluster[cid]) essentialsByCluster[cid] = [];
    essentialsByCluster[cid].push(entry);
  });
  const nextMap = [];
  wizardState.clusters.forEach((cluster, i) => {
    const existing = wizardState.mapEntries.find(e => e.clusterId === cluster.id) || {};
    const key = existing.key || slugify(cluster.label || `need-${i+1}`);
    nextMap.push({
      clusterId: cluster.id,
      key,
      label: existing.label || cluster.label,
      priority: existing.priority || (i + 1),
      essentials: existing.essentials && existing.essentials.length ? existing.essentials : (essentialsByCluster[cluster.id] || []),
      definition: existing.definition || '',
      satisfaction: typeof existing.satisfaction === 'number' ? existing.satisfaction : 50,
      linkedItems: Array.isArray(existing.linkedItems) ? existing.linkedItems : [],
      notes: existing.notes || '',
    });
  });
  wizardState.mapEntries = nextMap;
}

function renderRankStep(container) {
  syncMapEntriesFromClusters();
  const cards = wizardState.mapEntries.map((entry, idx) => {
    const essentialsText = (entry.essentials || []).join('\n');
    const linked = entry.linkedItems || [];
    return `
      <div class="moh-card" data-entry="${entry.clusterId}">
        <div class="moh-inline" style="justify-content: space-between;">
          <div class="moh-badge">Priority #${entry.priority || idx + 1}</div>
          <div class="moh-small">Key: <code>${escapeHtml(entry.key || '')}</code></div>
        </div>
        <label class="moh-label">Label</label>
        <input class="moh-input" data-field="label" value="${escapeAttr(entry.label)}" placeholder="Freedom" />
        <div class="moh-grid two">
          <label class="moh-label">Key<input class="moh-input" data-field="key" value="${escapeAttr(entry.key)}" /></label>
          <label class="moh-label">Priority (unique rank)<input class="moh-input" type="number" min="1" data-field="priority" value="${escapeAttr(entry.priority)}" /></label>
        </div>
        <label class="moh-label">Definition of sufficiency</label>
        <textarea class="moh-textarea" data-field="definition" placeholder="What does 'enough' look like?">${escapeHtml(entry.definition)}</textarea>
        <label class="moh-label">Essentials (one per line)</label>
        <textarea class="moh-textarea" data-field="essentials">${escapeHtml(essentialsText)}</textarea>
        <div class="moh-grid two">
          <div>
            <label class="moh-label">Current satisfaction (0-100)</label>
            <input class="moh-input" type="number" min="0" max="100" data-field="satisfaction" value="${escapeAttr(entry.satisfaction)}" />
          </div>
          <div>
            <label class="moh-label">Linked items (type:name per line)</label>
            <textarea class="moh-textarea" data-field="linked">${escapeHtml(formatLinkedText(linked))}</textarea>
          </div>
        </div>
        <label class="moh-label">Notes (optional)</label>
        <textarea class="moh-textarea" data-field="notes" placeholder="Consolidated from money + travel statements.">${escapeHtml(entry.notes || '')}</textarea>
        <div class="moh-chiplist">
          ${(wizardState.rawEntries || []).filter((_, i) => wizardState.assignments[i] === entry.clusterId).map(t => `<span class="moh-chip">${escapeHtml(t)}</span>`).join('')}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="moh-card">
      <h3>Rank and define each need</h3>
      <p class="moh-help">Assign unique priority ranks (1 = most critical), define sufficiency, score current satisfaction (0-100), and link Chronos items/templates that protect this need.</p>
      <div class="moh-rank-grid">${cards}</div>
    </div>
  `;

  container.querySelectorAll('[data-entry]').forEach(card => {
    const cid = card.dataset.entry;
    const entry = wizardState.mapEntries.find(e => e.clusterId === cid);
    if (!entry) return;
    card.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('input', () => {
        const field = el.dataset.field;
        const val = el.value;
        if (field === 'priority') entry.priority = Number(val);
        else if (field === 'satisfaction') entry.satisfaction = Number(val);
        else if (field === 'essentials') entry.essentials = (val || '').split('\n').map(s => s.trim()).filter(Boolean);
        else if (field === 'linked') entry.linkedItems = parseLinkedText(val || '');
        else if (field === 'key') entry.key = slugify(val || entry.label || '');
        else entry[field] = val;
      });
    });
  });
}

function renderTaggingStep(container) {
  const tagState = wizardState.tagging || {};
  if (!tagState.needKey && wizardState.mapEntries.length) {
    tagState.needKey = wizardState.mapEntries[0].key;
  }
  const needs = wizardState.mapEntries.map(e => ({ key: e.key, label: e.label }));
  const options = needs.map(n => `<option value="${escapeAttr(n.key)}" ${tagState.needKey === n.key ? 'selected' : ''}>${escapeHtml(n.label || n.key)}</option>`).join('');
  const typeOptions = ITEM_TYPES.map(t => `<option value="${t}" ${tagState.type === t ? 'selected' : ''}>${t}</option>`).join('');
  const items = (tagState.itemsByType?.[tagState.type] || []);
  const filtered = items.filter(item => {
    const q = (tagState.search || '').toLowerCase();
    if (!q) return true;
    return (item.name || '').toLowerCase().includes(q);
  });

  container.innerHTML = `
    <div class="moh-card">
      <h3>Optionally tag existing items</h3>
      <p class="moh-help">Assign <code>happiness: [&lt;key&gt;]</code> to existing items/templates so the cockpit panel can show coverage. This step is optional.</p>
      <div class="moh-grid two" style="align-items:flex-end;">
        <label class="moh-label">Need to tag<select class="moh-select" data-tag-need>${options}</select></label>
        <div class="moh-grid two">
          <label class="moh-label">Item type<select class="moh-select" data-tag-type>${typeOptions}</select></label>
          <label class="moh-label">Search<input class="moh-input" data-tag-search placeholder="Filter names" value="${escapeAttr(tagState.search)}" /></label>
        </div>
      </div>
      <div class="moh-status" data-tag-status>${tagState.loading ? 'Loading items...' : (tagState.error || '')}</div>
      <div class="moh-card" style="max-height:260px; overflow:auto; border-style:dashed;">
        ${!filtered.length ? '<div class="moh-small">No items match.</div>' : filtered.map(row => {
          const id = `${row.type||tagState.type}:${row.name}`;
          const checked = tagState.selected?.has(id);
          return `
            <label style="display:flex; gap:8px; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
              <input type="checkbox" data-tag-item value="${escapeAttr(id)}" ${checked ? 'checked' : ''} />
              <span class="moh-panel-chip">${escapeHtml(row.type || tagState.type)}</span>
              <span>${escapeHtml(row.name || '')}</span>
            </label>
          `;
        }).join('')}
      </div>
      <p class="moh-small">Tagged items keep existing properties; we append the selected need to any existing <code>happiness</code> list.</p>
    </div>
  `;

  container.querySelector('[data-tag-need]')?.addEventListener('change', (ev) => {
    tagState.needKey = ev.target.value;
  });
  container.querySelector('[data-tag-type]')?.addEventListener('change', async (ev) => {
    tagState.type = ev.target.value;
    await ensureItemsLoaded(tagState.type);
    renderStepContent();
  });
  container.querySelector('[data-tag-search]')?.addEventListener('input', (ev) => {
    tagState.search = ev.target.value;
    renderStepContent();
  });
  container.querySelectorAll('[data-tag-item]')?.forEach(el => {
    el.addEventListener('change', (ev) => {
      const val = ev.target.value;
      if (!tagState.selected) tagState.selected = new Set();
      if (ev.target.checked) tagState.selected.add(val);
      else tagState.selected.delete(val);
    });
  });

  // Lazy load items the first time we hit this step
  if (!tagState.itemsByType?.[tagState.type] && !tagState.loading) {
    ensureItemsLoaded(tagState.type).then(() => renderStepContent());
  }
}

async function ensureItemsLoaded(itemType) {
  const tagState = wizardState.tagging || {};
  tagState.loading = true;
  tagState.error = '';
  setStatus('Loading items...', 'muted');
  try {
    const resp = await fetch(`${apiBase()}/api/items?type=${encodeURIComponent(itemType)}`);
    if (!resp.ok) throw new Error(`Items load failed (HTTP ${resp.status})`);
    const data = await resp.json().catch(() => ({}));
    const items = Array.isArray(data?.items) ? data.items : [];
    const normalized = items
      .map(row => ({
        name: row.name || '',
        type: row.type || itemType,
      }))
      .filter(r => r.name);
    normalized.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    if (!tagState.itemsByType) tagState.itemsByType = {};
    tagState.itemsByType[itemType] = normalized;
    tagState.error = '';
  } catch (err) {
    console.error('[MapOfHappiness] load items failed', err);
    tagState.error = err?.message || 'Failed to load items.';
  } finally {
    tagState.loading = false;
    setStatus('');
  }
}

function parseLinkedText(text) {
  const lines = (text || '').split('\n').map(s => s.trim()).filter(Boolean);
  const out = [];
  lines.forEach(line => {
    const [type, ...rest] = line.split(':');
    const name = rest.join(':').trim();
    if (!type || !name) return;
    out.push({ type: type.trim(), name });
  });
  return out;
}

function formatLinkedText(list) {
  if (!Array.isArray(list)) return '';
  return list.map(item => `${item.type || ''}:${item.name || ''}`.trim()).filter(Boolean).join('\n');
}

function buildYamlPayload() {
  const entries = [...wizardState.mapEntries].sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0));
  const map = entries.map(e => {
    const clean = {
      key: e.key || slugify(e.label),
      label: e.label || e.key || 'need',
      priority: Number(e.priority || 0),
      essentials: (e.essentials || []).filter(Boolean),
      definition: (e.definition || '').trim(),
      satisfaction: Number(isNaN(e.satisfaction) ? 0 : e.satisfaction),
      linked_items: Array.isArray(e.linkedItems) ? e.linkedItems.filter(li => li.type && li.name).map(li => ({ type: li.type, name: li.name })) : [],
      notes: (e.notes || '').trim(),
    };
    if (!clean.essentials.length) delete clean.essentials;
    if (!clean.definition) delete clean.definition;
    if (!clean.notes) delete clean.notes;
    if (!clean.linked_items.length) delete clean.linked_items;
    return clean;
  });
  const payload = {
    map,
    metadata: {
      source: 'Map of Happiness (Sam Vaknin)',
      captured_at: new Date().toISOString(),
      wizard: 'map_of_happiness',
      version: 1,
    },
    raw_entries: wizardState.rawEntries || [],
  };
  return payloadToYaml(payload);
}

function payloadToYaml(data, indent = 0) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(data)) {
    if (!data.length) return pad + '[]';
    return data.map(item => {
      if (typeof item === 'object' && item !== null) {
        return `${pad}-\n${payloadToYaml(item, indent + 1)}`;
      }
      return `${pad}- ${formatPrimitive(item)}`;
    }).join('\n');
  }
  if (typeof data === 'object' && data !== null) {
    return Object.entries(data).map(([k, v]) => {
      if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return '';
      if (Array.isArray(v) && !v.length) return '';
      if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) return '';
      if (typeof v === 'object') {
        return `${pad}${k}:\n${payloadToYaml(v, indent + 1)}`;
      }
      return `${pad}${k}: ${formatPrimitive(v)}`;
    }).filter(Boolean).join('\n');
  }
  return pad + formatPrimitive(data);
}

function formatPrimitive(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v ?? '');
  if (!s.length) return "''";
  if (/^[A-Za-z0-9_\-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

function renderReviewStep(container) {
  const yaml = buildYamlPayload();
  const mapCount = wizardState.mapEntries.length;
  const avgSatisfaction = wizardState.mapEntries.length
    ? Math.round(wizardState.mapEntries.reduce((acc, e) => acc + (Number(e.satisfaction) || 0), 0) / wizardState.mapEntries.length)
    : 0;
  container.innerHTML = `
    <div class="moh-card">
      <h3>Review & Save</h3>
      <p class="moh-help">We will archive the previous file to <code>map_of_happiness.archive.*.yml</code> in User/Settings, then replace <code>map_of_happiness.yml</code>. Items can reference needs via <code>happiness: [&lt;key&gt;]</code>.</p>
      <div class="moh-inline" style="margin-bottom:10px;">
        <span class="moh-badge">${mapCount} needs</span>
        <span class="moh-badge">Avg satisfaction: ${avgSatisfaction}%</span>
      </div>
      <div class="moh-yaml" data-preview>${escapeHtml(yaml)}</div>
      <p class="moh-small">Saving will emit <code>wizard:map_of_happiness:created</code> so panels can refresh.</p>
    </div>
  `;
}

async function applyTags() {
  const tagState = wizardState.tagging || {};
  const need = (tagState.needKey || '').trim();
  if (!need || !tagState.selected || tagState.selected.size === 0) return;
  setStatus(`Tagging ${tagState.selected.size} item(s)...`, 'muted');
  const needSlug = slugify(need);
  const results = { ok: 0, fail: 0 };

  for (const entry of Array.from(tagState.selected)) {
    const [typeRaw, ...nameParts] = entry.split(':');
    const type = (typeRaw || '').trim();
    const name = nameParts.join(':').trim();
    if (!type || !name) continue;
    try {
      const resp = await fetch(`${apiBase()}/api/item?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`);
      if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`);
      const data = await resp.json().catch(() => ({}));
      const yamlData = (data && data.data) || {};
      let happiness = [];
      const hRaw = yamlData?.happiness;
      if (Array.isArray(hRaw)) happiness = hRaw.map(v => String(v));
      else if (typeof hRaw === 'string') happiness = [hRaw];
      const normSet = new Set(happiness.map(v => slugify(v)));
      if (!normSet.has(needSlug)) {
        happiness.push(need);
      }
      const setResp = await fetch(`${apiBase()}/api/cli`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'set',
          args: [type, name],
          properties: { happiness },
        }),
      });
      const setData = await setResp.json().catch(() => ({}));
      if (!setResp.ok || setData.ok === false) throw new Error(setData.error || setData.stderr || `Set failed (${setResp.status})`);
      results.ok += 1;
    } catch (err) {
      console.warn('[MapOfHappiness] tagging failed for', entry, err);
      results.fail += 1;
    }
  }

  if (results.fail) {
    setStatus(`Tagged ${results.ok} item(s); ${results.fail} failed.`, 'error');
  } else {
    setStatus(`Tagged ${results.ok} item(s).`, 'success');
  }
}

async function archiveExistingFile() {
  try {
    const resp = await fetch(`${apiBase()}/api/settings?file=map_of_happiness.yml`);
    if (!resp.ok) return false;
    const data = await resp.json().catch(() => null);
    const raw = data?.content || '';
    if (!raw) return false;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveName = `map_of_happiness.archive.${stamp}.yml`;
    await fetch(`${apiBase()}/api/settings?file=${encodeURIComponent(archiveName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: raw,
    });
    return true;
  } catch (err) {
    console.warn('[MapOfHappiness] archive skipped', err);
    return false;
  }
}

async function saveMap() {
  if (wizardState.saving) return;
  wizardState.saving = true;
  setStatus('Saving map...', 'muted');
  try {
    const yaml = buildYamlPayload();
    await archiveExistingFile();
    const resp = await fetch(`${apiBase()}/api/settings?file=map_of_happiness.yml`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: yaml,
    });
    if (!resp.ok) throw new Error(`Save failed (HTTP ${resp.status})`);
    await applyTags();
    setStatus('Saved map_of_happiness.yml', 'success');
    try { overlayRefs?.context?.bus?.emit?.('wizard:map_of_happiness:created', { file: 'map_of_happiness.yml' }); } catch {}
  } catch (err) {
    console.error('[MapOfHappiness] save failed', err);
    setStatus(err?.message || 'Failed to save map.', 'error');
  } finally {
    wizardState.saving = false;
  }
}

function closeWizard() {
  if (overlayEl) overlayEl.remove();
  overlayEl = null;
  overlayRefs = null;
  wizardState = null;
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case '\'': return '&#39;';
      default: return ch;
    }
  });
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

export async function launch(context, options = {}) {
  mountOverlay(context);
}
