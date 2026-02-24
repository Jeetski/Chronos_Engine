const OVERLAY_TAG = 'chronos-goal-wizard';
let stylesInjected = false;
let overlayEl = null;
let overlayRefs = null;
let wizardState = null;
let keyHandler = null;
let contextRef = null;
let optionsRef = null;

const STEP_DEFS = [
  { id: 'vision', name: 'Goal Vision', hint: 'Who, why, and when.', render: renderVisionStep },
  { id: 'signals', name: 'Outcomes & Signals', hint: 'Define success metrics and habits.', render: renderSignalsStep },
  { id: 'hindering', name: 'Hindering Habits', hint: 'Capture what lowers your odds.', render: renderHinderingStep },
  { id: 'milestones', name: 'Milestones & Workstreams', hint: 'Map the path forward.', render: renderMilestonesStep },
  { id: 'review', name: 'Review & Create', hint: 'Confirm YAML then create the goal.', render: renderReviewStep },
];

const HORIZON_PRESETS = [
  { value: '30d', label: '30 days (focus sprint)' },
  { value: '60d', label: '60 days' },
  { value: '90d', label: '90 days (quarter)' },
  { value: '6m', label: '6 months' },
  { value: '12m', label: '12 months' },
  { value: 'custom', label: 'Custom duration' },
];

const CADENCE_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'custom', label: 'Custom cadence' },
];

function injectStyles(){
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.dataset.wizardStyles = OVERLAY_TAG;
  style.textContent = `
    .wizard-overlay {
      position: fixed;
      inset: 0;
      z-index: 1200;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--chronos-overlay-gradient);
      backdrop-filter: var(--chronos-overlay-blur);
      padding: clamp(16px, 3vw, 32px);
    }
    .goal-wizard-shell {
      width: min(960px, 95vw);
      max-height: 92vh;
      background: linear-gradient(180deg, var(--chronos-surface-strong), var(--chronos-surface));
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      color: var(--chronos-text);
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 28px;
      box-shadow: 0 25px 80px rgba(0,0,0,0.65);
      overflow: hidden;
      position: relative;
    }
    .goal-wizard-shell h1 {
      margin: 0;
      font-size: 28px;
      letter-spacing: 0.3px;
    }
    .wizard-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
    }
    .wizard-eyebrow {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: var(--chronos-text-soft);
      margin-bottom: 6px;
    }
    .wizard-header button.close {
      background: none;
      border: none;
      color: var(--chronos-text-soft);
      font-size: 20px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 10px;
    }
    .wizard-header button.close:hover {
      color: #fff;
      background: rgba(255,255,255,0.08);
    }
    .wizard-progress {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px;
    }
    .wizard-progress .step {
      display: flex;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 10px;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.05);
    }
    .wizard-progress .step .bullet {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      border: 1px solid rgba(255,255,255,0.2);
    }
    .wizard-progress .step.active {
      border-color: var(--chronos-accent);
      background: var(--chronos-accent-soft);
    }
    .wizard-progress .step.done {
      border-color: var(--chronos-success);
      background: var(--chronos-success-soft);
    }
    .wizard-progress .step.active .bullet {
      border-color: var(--chronos-accent);
      color: var(--chronos-text);
    }
    .wizard-progress .step.done .bullet {
      border-color: var(--chronos-success);
      color: var(--chronos-success);
    }
    .wizard-body {
      flex: 1;
      overflow: auto;
      border: 1px solid rgba(255,255,255,0.04);
      border-radius: 16px;
      padding: 20px;
      background: rgba(7,9,15,0.65);
    }
    .wizard-footer {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    .wizard-actions {
      display: flex;
      gap: 10px;
    }
    .wizard-actions button {
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      padding: 10px 20px;
      font-size: 15px;
      background: rgba(10,13,22,0.9);
      color: inherit;
      cursor: pointer;
    }
    .wizard-actions button.primary {
      background: var(--chronos-accent-gradient);
      border-color: rgba(122,162,247,0.6);
      color: #fff;
      font-weight: 600;
      box-shadow: var(--chronos-accent-glow);
    }
    .wizard-actions button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .wizard-status {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .wizard-status [data-status] {
      min-height: 20px;
      font-size: 14px;
    }
    .wizard-status [data-status][data-tone="success"] { color: var(--chronos-success); }
    .wizard-status [data-status][data-tone="error"] { color: var(--chronos-danger); }
    .wizard-status [data-status][data-tone="warn"] { color: var(--chronos-warning); }
    .wizard-status [data-validation] {
      font-size: 13px;
      color: var(--chronos-warning);
    }
    .form-grid {
      display: grid;
      gap: 14px;
    }
    .form-grid.two {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .form-grid.three {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .form-grid label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
      color: var(--chronos-text-muted);
    }
    .form-grid label span.hint {
      font-size: 12px;
      color: var(--chronos-text-soft);
    }
    input[type="text"], input[type="date"], input[type="number"], select, textarea {
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(8,12,20,0.85);
      color: var(--chronos-text);
      padding: 9px 12px;
      font-size: 15px;
    }
    textarea {
      min-height: 90px;
      resize: vertical;
    }
    .section-header {
      margin: 0 0 12px 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--chronos-text);
    }
    .hint {
      color: var(--chronos-text-soft);
      font-size: 13px;
    }
    .metric-list, .milestone-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .metric-card, .milestone-card {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 14px;
      background: rgba(11,15,24,0.88);
    }
    .metric-card header, .milestone-card header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .metric-card header strong, .milestone-card header strong {
      font-size: 16px;
    }
    .metric-card button.remove, .milestone-card button.remove {
      background: none;
      border: none;
      color: var(--chronos-text-soft);
      cursor: pointer;
    }
    .metric-card button.remove:hover, .milestone-card button.remove:hover {
      color: var(--chronos-danger);
    }
    .yaml-preview {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 14px;
      background: rgba(9,12,20,0.9);
      margin-top: 12px;
    }
    .yaml-preview pre {
      max-height: 320px;
      overflow: auto;
      background: rgba(3,5,9,0.9);
      padding: 14px;
      border-radius: 10px;
      color: var(--chronos-text);
      font-size: 13px;
    }
    .tagline {
      font-size: 14px;
      color: var(--chronos-text-muted);
    }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function removeOverlay(){
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
    overlayRefs = null;
  }
  if (keyHandler) {
    window.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  wizardState = null;
}

function createInitialState(){
  return {
    step: 0,
    busy: false,
    mode: 'create',
    targetGoalName: '',
    goal: {
      name: '',
      description: '',
      why: '',
      category: '',
      priority: '',
      horizon: '90d',
      customHorizon: '',
      start_date: '',
      target_date: '',
      celebrate: '',
      tags: '',
    },
    metrics: [createMetric()],
    supports: {
      habits: '',
      first_action: '',
      checkpoints: 'Weekly review',
      risks: '',
      accountability: '',
    },
    hindering: {
      selectedHabits: [],
      newHabits: '',
    },
    milestoneLinks: {
      selectedExisting: [],
    },
    milestones: [createMilestone(), createMilestone()],
    metadata: { categories: [], priorities: [], habits: [], milestones: [], goals: [] },
    originalLinks: {
      habits: [],
      milestones: [],
    },
  };
}
function createMetric(){
  return {
    id: randomId('metric'),
    label: '',
    target: '',
    cadence: 'weekly',
    cadenceCustom: '',
    leading: true,
    notes: '',
  };
}

function createMilestone(){
  return {
    id: randomId('milestone'),
    name: '',
    summary: '',
    target_date: '',
    metric: '',
    steps: '',
    celebrate: '',
    owner: '',
    weight: 1,
  };
}

function randomId(prefix){
  if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID().split('-')[0]}`;
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function apiBase(){
  const origin = window.location.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

async function apiRequest(path, { method = 'GET', body } = {}){
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const resp = await fetch(apiBase() + path, opts);
  const text = await resp.text();
  let data = text;
  try { data = JSON.parse(text); } catch {}
  if (!resp.ok || (data && typeof data === 'object' && data.ok === false)) {
    const err = (data && data.error) || text || `HTTP ${resp.status}`;
    throw new Error(err);
  }
  return data;
}

function escapeHtml(value){
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value){
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function setFieldValue(path, value){
  if (!wizardState) return;
  const parts = path.split('.');
  let ref = wizardState;
  for (let i = 0; i < parts.length - 1; i++) {
    ref = ref[parts[i]];
    if (!ref) return;
  }
  ref[parts[parts.length - 1]] = value;
  updateValidationHint();
  if (wizardState.step === STEP_DEFS.length - 1) renderStepContent();
}

function listFromMultiline(text){
  return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function listFromMaybe(value){
  if (Array.isArray(value)) return normalizeNameList(value);
  if (typeof value === 'string') return normalizeNameList(listFromMultiline(value));
  return [];
}

function normalizeNameList(values){
  const out = [];
  const seen = new Set();
  (values || []).forEach((raw) => {
    const name = String(raw || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
  });
  return out;
}

function collectHinderingHabits(state){
  const selected = normalizeNameList((state?.hindering?.selectedHabits) || []);
  const typed = normalizeNameList(listFromMultiline(state?.hindering?.newHabits || ''));
  return normalizeNameList(selected.concat(typed));
}

function collectMilestoneLinks(state){
  const selectedExisting = normalizeNameList((state?.milestoneLinks?.selectedExisting) || []);
  const authored = normalizeNameList((state?.milestones || []).map(m => m?.name || '').filter(Boolean));
  return normalizeNameList(selectedExisting.concat(authored));
}

function mergeGoalsArray(existing, legacyGoal){
  const merged = [];
  const pushName = (value) => {
    const name = String(value || '').trim();
    if (!name) return;
    if (merged.some(x => x.toLowerCase() === name.toLowerCase())) return;
    merged.push(name);
  };
  if (Array.isArray(existing)) existing.forEach(pushName);
  if (typeof legacyGoal === 'string') pushName(legacyGoal);
  return merged;
}

function slugify(value){
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 42);
}

function shouldSkip(val){
  if (val === undefined || val === null) return true;
  if (typeof val === 'string') return val.trim() === '';
  if (Array.isArray(val)) return !val.length;
  if (typeof val === 'object') return !Object.keys(val).length;
  return false;
}

function formatPrimitive(value){
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const str = String(value ?? '');
  if (!str.length) return "''";
  if (/^[A-Za-z0-9_\- ]+$/.test(str)) return str;
  return JSON.stringify(str);
}

function toYaml(value, indent = 0){
  const pad = '  '.repeat(indent);
  if (Array.isArray(value)){
    if (!value.length) return pad + '[]';
    return value.map(item => {
      if (typeof item === 'object' && item !== null){
        const nested = toYaml(item, indent + 1);
        return `${pad}-\n${nested}`;
      }
      return `${pad}- ${formatPrimitive(item)}`;
    }).join('\n');
  }
  if (typeof value === 'object' && value !== null){
    const entries = Object.entries(value).filter(([,v]) => !shouldSkip(v));
    if (!entries.length) return pad + '{}';
    return entries.map(([key, val]) => {
      if (typeof val === 'object' && val !== null){
        const nested = toYaml(val, indent + 1);
        return `${pad}${key}:\n${nested}`;
      }
      return `${pad}${key}: ${formatPrimitive(val)}`;
    }).join('\n');
  }
  return pad + formatPrimitive(value);
}

function buildGoalPayload(state){
  if (!state?.goal?.name?.trim()) throw new Error('Goal name is required.');
  if (!state.goal.description?.trim()) throw new Error('Add a short description.');
  const name = state.goal.name.trim();
  const base = {
    type: 'goal',
    name,
    status: 'planned',
    description: state.goal.description.trim(),
  };
  if (state.goal.category?.trim()) base.category = state.goal.category.trim();
  if (state.goal.priority?.trim()) base.priority = state.goal.priority.trim();
  if (state.goal.why?.trim()) base.why = state.goal.why.trim();
  const duration = state.goal.horizon === 'custom' ? state.goal.customHorizon : state.goal.horizon;
  if (duration?.trim()) base.duration = duration.trim();
  if (state.goal.start_date) base.start_date = state.goal.start_date;
  if (state.goal.target_date) base.due_date = state.goal.target_date;
  if (state.goal.celebrate?.trim()) base.celebration = state.goal.celebrate.trim();
  if (state.goal.tags?.trim()) base.tags = state.goal.tags.split(',').map(s => s.trim()).filter(Boolean);

  const metrics = state.metrics
    .map(m => ({
      label: m.label.trim(),
      target: m.target.trim(),
      cadence: m.cadence === 'custom' ? m.cadenceCustom.trim() : m.cadence,
      leading: !!m.leading,
      notes: m.notes.trim(),
    }))
    .filter(m => m.label && (m.target || m.notes));
  if (metrics.length) base.success_metrics = metrics;

  const habitList = normalizeNameList(listFromMultiline(state.supports.habits));
  if (habitList.length) base.supporting_habits = habitList;
  const hinderingHabits = collectHinderingHabits(state);
  if (hinderingHabits.length) base.hindering_habits = hinderingHabits;
  if (state.supports.first_action?.trim()) base.first_action = state.supports.first_action.trim();
  if (state.supports.checkpoints?.trim()) base.review_cadence = state.supports.checkpoints.trim();
  const risks = listFromMultiline(state.supports.risks);
  if (risks.length) base.risks = risks;
  const accountability = listFromMultiline(state.supports.accountability);
  if (accountability.length) base.accountability = accountability;

  const milestones = state.milestones
    .map((m, idx) => {
      if (!m.name?.trim()) return null;
      if (!m.summary?.trim()) return null;
      const steps = listFromMultiline(m.steps);
      const entry = {
        id: slugify(m.name) || `milestone_${idx + 1}`,
        name: m.name.trim(),
        description: m.summary.trim(),
        weight: Number(m.weight) || 1,
      };
      if (m.target_date) entry.due_date = m.target_date;
      if (m.metric?.trim()) entry.criteria = m.metric.trim();
      if (steps.length) entry.plan = steps;
      if (m.owner?.trim()) entry.owner = m.owner.trim();
      if (m.celebrate?.trim()) entry.celebration = m.celebrate.trim();
      return entry;
    })
    .filter(Boolean);
  if (!milestones.length) throw new Error('Add at least one milestone.');
  base.milestones = milestones;
  const linkedMilestones = collectMilestoneLinks(state);
  if (linkedMilestones.length) base.linked_milestones = linkedMilestones;
  return base;
}

function validateStep(index, state){
  if (!state) return { valid: false, message: '' };
  if (index === 0){
    if (!state.goal.name?.trim()) return { valid: false, message: 'Name your goal to continue.' };
    if (!state.goal.description?.trim()) return { valid: false, message: 'Add a short description.' };
    return { valid: true };
  }
  if (index === 1){
    const metrics = state.metrics.filter(m => m.label.trim() && (m.target.trim() || m.notes.trim()));
    if (!metrics.length) return { valid: false, message: 'Capture at least one success metric or signal.' };
    return { valid: true };
  }
  if (index === 2){
    const supporting = normalizeNameList(listFromMultiline(state.supports?.habits || ''));
    const hindering = collectHinderingHabits(state);
    if (hindering.some(name => !name.trim())) return { valid: false, message: 'Fix hindering habit names.' };
    const overlap = hindering.find(name => supporting.some(s => s.toLowerCase() === name.toLowerCase()));
    if (overlap) return { valid: false, message: `Habit "${overlap}" cannot be both supporting and hindering.` };
    return { valid: true };
  }
  if (index === 3){
    const authored = (state.milestones || []).filter(m => m.name.trim());
    const linkedExisting = normalizeNameList(state?.milestoneLinks?.selectedExisting || []);
    if (!authored.length && !linkedExisting.length) return { valid: false, message: 'Add or link at least one milestone.' };
    if (authored.some(m => !m.summary.trim())) return { valid: false, message: 'Describe each authored milestone.' };
    return { valid: true };
  }
  if (index === STEP_DEFS.length - 1){
    try {
      buildGoalPayload(state);
      return { valid: true };
    } catch (err) {
      return { valid: false, message: err.message };
    }
  }
  return { valid: true };
}

function renderStepContent(){
  if (!overlayRefs?.body || !wizardState) return;
  const def = STEP_DEFS[wizardState.step];
  if (!def) return;
  overlayRefs.body.innerHTML = '';
  def.render(overlayRefs.body, wizardState);
  updateValidationHint();
}

function renderVisionStep(container, state){
  const categories = state.metadata.categories || [];
  const priorities = state.metadata.priorities || [];
  const knownGoals = (state.metadata.goals || []).filter(Boolean);
  const catOptions = ['<option value="">Select category</option>']
    .concat(categories.map(opt => `<option value="${escapeAttr(opt.value)}"${opt.value === state.goal.category ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`))
    .join('');
  const priorityOptions = ['<option value="">Select priority</option>']
    .concat(priorities.map(opt => `<option value="${escapeAttr(opt.value)}"${opt.value === state.goal.priority ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`))
    .join('');
  const horizonOptions = HORIZON_PRESETS
    .map(opt => `<option value="${opt.value}"${opt.value === state.goal.horizon ? ' selected' : ''}>${opt.label}</option>`)
    .join('');
  const selectedGoal = state.mode === 'edit' ? state.goal.name : '__new__';
  const goalOptions = ['<option value="__new__">+ New goal</option>']
    .concat(knownGoals.map(name => `<option value="${escapeAttr(name)}"${name === selectedGoal ? ' selected' : ''}>${escapeHtml(name)}</option>`))
    .join('');

  container.innerHTML = `
    <div>
      <h2 class="section-header">Clarify the goal</h2>
      <p class="hint">Give Chronos enough context to prioritize the work and communicate why it matters.</p>
      ${state.mode === 'edit' ? '<p class="hint">Editing mode keeps the goal name fixed so linked habits and milestones stay consistent.</p>' : ''}
    </div>
    <div class="form-grid">
      <label>Existing goals
        <span class="hint">Pick an existing goal to edit, or keep "+ New goal" to create from scratch.</span>
        <select data-existing-goal>${goalOptions}</select>
      </label>
    </div>
    <div class="form-grid two">
      <label>Goal name<input type="text" data-field="goal.name" value="${escapeAttr(state.goal.name)}" placeholder="Ship my personal project" ${state.mode === 'edit' ? 'disabled' : ''} /></label>
      <label>Category<select data-field="goal.category">${catOptions}</select></label>
      <label>Priority<select data-field="goal.priority">${priorityOptions}</select></label>
      <label>Time horizon<select data-field="goal.horizon">${horizonOptions}</select></label>
      <label data-custom-horizon>Custom horizon<input type="text" data-field="goal.customHorizon" value="${escapeAttr(state.goal.customHorizon)}" placeholder="e.g., 14 weeks" /></label>
      <label>Kickoff date<input type="date" data-field="goal.start_date" value="${escapeAttr(state.goal.start_date)}" /></label>
      <label>Target date<input type="date" data-field="goal.target_date" value="${escapeAttr(state.goal.target_date)}" /></label>
      <label>Celebration / reward<input type="text" data-field="goal.celebrate" value="${escapeAttr(state.goal.celebrate)}" placeholder="Weekend trip, dinner, etc." /></label>
      <label>Focus tags<span class="hint">Comma separated (projects, health, etc.).</span><input type="text" data-field="goal.tags" value="${escapeAttr(state.goal.tags)}" placeholder="project, q1, shipping" /></label>
    </div>
    <div class="form-grid">
      <label>Description<textarea data-field="goal.description">${escapeHtml(state.goal.description)}</textarea></label>
      <label>Why it matters<textarea data-field="goal.why" placeholder="What improves if you hit this goal?">${escapeHtml(state.goal.why)}</textarea></label>
    </div>
  `;
  container.querySelectorAll('[data-field]').forEach(el => {
    const handler = (ev) => setFieldValue(ev.target.dataset.field, ev.target.value);
    el.addEventListener('input', handler);
  });
  const goalPicker = container.querySelector('[data-existing-goal]');
  if (goalPicker) {
    goalPicker.addEventListener('change', async (ev) => {
      const picked = String(ev.target.value || '').trim();
      if (!picked || picked === '__new__') {
        resetToCreateMode();
        updateNavigation();
        return;
      }
      await loadGoalForEdit(picked);
      updateNavigation();
    });
  }
  const customRow = container.querySelector('[data-custom-horizon]');
  if (customRow) customRow.style.display = state.goal.horizon === 'custom' ? 'flex' : 'none';
}
function renderSignalsStep(container, state){
  container.innerHTML = `
    <div>
      <h2 class="section-header">Define success signals</h2>
      <p class="hint">Create metrics or qualitative signals that indicate the goal is trending in the right direction.</p>
    </div>
    <div class="metric-list"></div>
    <button class="primary" type="button" data-add-metric>Add success metric</button>
    <div style="margin-top:16px;">
      <h3 class="section-header" style="font-size:16px;">Support systems</h3>
      <div class="form-grid two">
        <label>Supporting habits / rituals<span class="hint">One per line. Each habit will be linked to this goal via <code>goals: []</code>.</span><textarea data-support-field="habits">${escapeHtml(state.supports.habits)}</textarea></label>
        <label>First meaningful action<textarea data-support-field="first_action" placeholder="What can you do this week to start?">${escapeHtml(state.supports.first_action)}</textarea></label>
        <label>Checkpoint cadence<input type="text" data-support-field="checkpoints" value="${escapeAttr(state.supports.checkpoints)}" /></label>
        <label>Risks or blockers<span class="hint">One per line.</span><textarea data-support-field="risks">${escapeHtml(state.supports.risks)}</textarea></label>
        <label>Accountability partners<span class="hint">People, channels, or rituals.</span><textarea data-support-field="accountability">${escapeHtml(state.supports.accountability)}</textarea></label>
      </div>
    </div>
  `;
  const listEl = container.querySelector('.metric-list');
  state.metrics.forEach(metric => {
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.dataset.metricId = metric.id;
    card.innerHTML = `
      <header>
        <strong>${escapeHtml(metric.label || 'Metric')}</strong>
        <button type="button" class="remove" title="Remove metric">Remove</button>
      </header>
      <div class="form-grid two">
        <label>Metric name<input type="text" data-metric-field="label" value="${escapeAttr(metric.label)}" placeholder="e.g., Publish new build" /></label>
        <label>Target / definition<input type="text" data-metric-field="target" value="${escapeAttr(metric.target)}" placeholder="e.g., 2 releases / month" /></label>
        <label>Cadence<select data-metric-field="cadence">${CADENCE_OPTIONS.map(opt => `<option value="${opt.value}"${opt.value === metric.cadence ? ' selected' : ''}>${opt.label}</option>`).join('')}</select></label>
        <label data-metric-custom>Custom cadence<input type="text" data-metric-field="cadenceCustom" value="${escapeAttr(metric.cadenceCustom)}" placeholder="e.g., every sprint" /></label>
        <label>Notes<textarea data-metric-field="notes">${escapeHtml(metric.notes)}</textarea></label>
        <label style="flex-direction:row; align-items:center; gap:8px;">
          <input type="checkbox" data-metric-field="leading" ${metric.leading ? 'checked' : ''} />Leading indicator
        </label>
      </div>
    `;
    listEl.appendChild(card);
    const removeBtn = card.querySelector('button.remove');
    removeBtn.addEventListener('click', ()=>{
      if (state.metrics.length === 1) return;
      state.metrics = state.metrics.filter(m => m.id !== metric.id);
      renderStepContent();
    });
    card.querySelectorAll('[data-metric-field]').forEach(el => {
      const field = el.dataset.metricField;
      const handler = (ev) => {
        const val = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
        const targetMetric = state.metrics.find(m => m.id === metric.id);
        if (!targetMetric) return;
        targetMetric[field] = val;
        if (field === 'label') card.querySelector('strong').textContent = val || 'Metric';
        const customRow = card.querySelector('[data-metric-custom]');
        if (customRow) customRow.style.display = targetMetric.cadence === 'custom' ? 'flex' : 'none';
        updateValidationHint();
        if (state.step === STEP_DEFS.length - 1) renderStepContent();
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });
    const customRow = card.querySelector('[data-metric-custom]');
    if (customRow) customRow.style.display = metric.cadence === 'custom' ? 'flex' : 'none';
  });
  container.querySelector('[data-add-metric]')?.addEventListener('click', ()=>{
    state.metrics.push(createMetric());
    renderStepContent();
  });
  container.querySelectorAll('[data-support-field]').forEach(el => {
    const handler = (ev) => {
      state.supports[ev.target.dataset.supportField] = ev.target.value;
      updateValidationHint();
      if (state.step === STEP_DEFS.length - 1) renderStepContent();
    };
    el.addEventListener('input', handler);
  });
}

function renderHinderingStep(container, state){
  const habits = (state.metadata.habits || [])
    .filter(h => h && h.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const selectedSet = new Set((state.hindering.selectedHabits || []).map(x => String(x).toLowerCase()));
  container.innerHTML = `
    <div>
      <h2 class="section-header">What gets in the way?</h2>
      <p class="hint">Link habits that reduce your chance of success. These are saved as <code>hindering_habits</code> on the goal and linked to the goal via each habit's <code>goals: []</code>.</p>
    </div>
    <div class="form-grid">
      <label>Existing habits
        <span class="hint">Select any existing habit to link. Habits linked here are treated as hindering for this goal.</span>
      </label>
      <div class="metric-list" data-habit-select-list></div>
      <label>Create new hindering habits (one per line)
        <textarea data-hindering-field="newHabits" placeholder="Doomscrolling at night&#10;Skipping planning&#10;Late caffeine">${escapeHtml(state.hindering.newHabits || '')}</textarea>
      </label>
    </div>
  `;
  const list = container.querySelector('[data-habit-select-list]');
  if (!list) return;
  if (!habits.length) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'No habits found yet. Add names below to create linked hindering habits.';
    list.appendChild(empty);
  } else {
    habits.forEach((habit) => {
      const row = document.createElement('label');
      row.className = 'metric-card';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.gap = '12px';
      const checked = selectedSet.has(String(habit.name).toLowerCase()) ? 'checked' : '';
      const polarity = String(habit.polarity || 'good').toLowerCase();
      row.innerHTML = `
        <span>
          <strong>${escapeHtml(habit.name)}</strong>
          <span class="hint">(${escapeHtml(polarity)})</span>
        </span>
        <input type="checkbox" data-hindering-existing="${escapeAttr(habit.name)}" ${checked} />
      `;
      list.appendChild(row);
    });
    container.querySelectorAll('[data-hindering-existing]').forEach((el) => {
      el.addEventListener('change', (ev) => {
        const name = String(ev.target.dataset.hinderingExisting || '').trim();
        if (!name) return;
        const current = normalizeNameList(state.hindering.selectedHabits || []);
        const key = name.toLowerCase();
        const has = current.some(x => x.toLowerCase() === key);
        if (ev.target.checked && !has) current.push(name);
        if (!ev.target.checked && has) {
          state.hindering.selectedHabits = current.filter(x => x.toLowerCase() !== key);
        } else {
          state.hindering.selectedHabits = current;
        }
        updateValidationHint();
        if (state.step === STEP_DEFS.length - 1) renderStepContent();
      });
    });
  }
  container.querySelectorAll('[data-hindering-field]').forEach(el => {
    el.addEventListener('input', (ev) => {
      state.hindering[ev.target.dataset.hinderingField] = ev.target.value;
      updateValidationHint();
      if (state.step === STEP_DEFS.length - 1) renderStepContent();
    });
  });
}

function renderMilestonesStep(container, state){
  const knownMilestones = (state.metadata.milestones || [])
    .filter(m => m && m.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const selectedExisting = new Set((state.milestoneLinks.selectedExisting || []).map(x => String(x).toLowerCase()));
  container.innerHTML = `
    <div>
      <h2 class="section-header">Turn the goal into milestones</h2>
      <p class="hint">Author new milestones and/or link existing ones to this goal.</p>
    </div>
    <div class="form-grid">
      <label>Link existing milestones</label>
      <div class="metric-list" data-existing-milestones></div>
    </div>
    <div class="milestone-list"></div>
    <button class="primary" type="button" data-add-milestone>Add milestone</button>
  `;
  const existingEl = container.querySelector('[data-existing-milestones]');
  if (existingEl) {
    if (!knownMilestones.length) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = 'No existing milestones found. Create one below.';
      existingEl.appendChild(empty);
    } else {
      knownMilestones.forEach((m) => {
        const row = document.createElement('label');
        row.className = 'metric-card';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.gap = '12px';
        const checked = selectedExisting.has(String(m.name).toLowerCase()) ? 'checked' : '';
        const currentGoal = String(m.goal || '').trim();
        const goalInfo = currentGoal ? `goal: ${currentGoal}` : 'unlinked';
        row.innerHTML = `
          <span>
            <strong>${escapeHtml(m.name)}</strong>
            <span class="hint">(${escapeHtml(goalInfo)})</span>
          </span>
          <input type="checkbox" data-existing-milestone="${escapeAttr(m.name)}" ${checked} />
        `;
        existingEl.appendChild(row);
      });
      container.querySelectorAll('[data-existing-milestone]').forEach((el) => {
        el.addEventListener('change', (ev) => {
          const name = String(ev.target.dataset.existingMilestone || '').trim();
          if (!name) return;
          const current = normalizeNameList(state.milestoneLinks.selectedExisting || []);
          const key = name.toLowerCase();
          const has = current.some(x => x.toLowerCase() === key);
          if (ev.target.checked && !has) current.push(name);
          if (!ev.target.checked && has) {
            state.milestoneLinks.selectedExisting = current.filter(x => x.toLowerCase() !== key);
          } else {
            state.milestoneLinks.selectedExisting = current;
          }
          updateValidationHint();
          if (state.step === STEP_DEFS.length - 1) renderStepContent();
        });
      });
    }
  }
  const listEl = container.querySelector('.milestone-list');
  state.milestones.forEach((mile, idx) => {
    const card = document.createElement('div');
    card.className = 'milestone-card';
    card.dataset.milestoneId = mile.id;
    card.innerHTML = `
      <header>
        <strong>${escapeHtml(mile.name || `Milestone ${idx + 1}`)}</strong>
        <button type="button" class="remove" title="Remove milestone">Remove</button>
      </header>
      <div class="form-grid two">
        <label>Milestone name<input type="text" data-milestone-field="name" value="${escapeAttr(mile.name)}" placeholder="Launch beta" /></label>
        <label>Target date<input type="date" data-milestone-field="target_date" value="${escapeAttr(mile.target_date)}" /></label>
        <label>Owner / lead<input type="text" data-milestone-field="owner" value="${escapeAttr(mile.owner)}" placeholder="Optional" /></label>
        <label>Weight<input type="number" min="1" max="5" data-milestone-field="weight" value="${escapeAttr(mile.weight)}" /></label>
      </div>
      <div class="form-grid">
        <label>Definition of done<textarea data-milestone-field="summary" placeholder="What does success look like?">${escapeHtml(mile.summary)}</textarea></label>
        <label>Success signal / metric<input type="text" data-milestone-field="metric" value="${escapeAttr(mile.metric)}" placeholder="e.g., 25 engaged testers" /></label>
        <label>Key steps (one per line)<textarea data-milestone-field="steps">${escapeHtml(mile.steps)}</textarea></label>
        <label>Celebration note<input type="text" data-milestone-field="celebrate" value="${escapeAttr(mile.celebrate)}" placeholder="Team lunch" /></label>
      </div>
    `;
    listEl.appendChild(card);
    const removeBtn = card.querySelector('.remove');
    removeBtn.addEventListener('click', ()=>{
      if (state.milestones.length === 1) return;
      state.milestones = state.milestones.filter(m => m.id !== mile.id);
      renderStepContent();
    });
    card.querySelectorAll('[data-milestone-field]').forEach(el => {
      const field = el.dataset.milestoneField;
      const handler = (ev) => {
        const val = field === 'weight' ? Number(ev.target.value) : ev.target.value;
        const target = state.milestones.find(m => m.id === mile.id);
        if (!target) return;
        target[field] = val;
        if (field === 'name') card.querySelector('strong').textContent = val || `Milestone ${idx + 1}`;
        updateValidationHint();
        if (state.step === STEP_DEFS.length - 1) renderStepContent();
      };
      el.addEventListener('input', handler);
    });
  });
  container.querySelector('[data-add-milestone]')?.addEventListener('click', ()=>{
    state.milestones.push(createMilestone());
    renderStepContent();
  });
}

function renderReviewStep(container, state){
  let yaml = '';
  let payload = {};
  try {
    payload = buildGoalPayload(state);
    yaml = toYaml(payload, 0);
  } catch (err) {
    yaml = `# Fix validation before saving\n# ${err.message}`;
  }
  const metrics = (payload.success_metrics || state.metrics)
    .filter(m => (m.label || '').trim())
    .map(m => `<li><strong>${escapeHtml(m.label)}</strong> – ${escapeHtml((m.target || m.notes || '').trim() || 'Define target')}</li>`)
    .join('');
  const milestoneSummary = (payload.milestones || [])
    .map(m => `<li><strong>${escapeHtml(m.name)}</strong> – ${escapeHtml(m.description || '')}${m.due_date ? ` (due ${escapeHtml(m.due_date)})` : ''}</li>`)
    .join('');
  const linkedMilestones = (payload.linked_milestones || [])
    .map(name => `<li>${escapeHtml(name)}</li>`)
    .join('');
  const supportingHabits = (payload.supporting_habits || [])
    .map(name => `<li>${escapeHtml(name)}</li>`)
    .join('');
  const hinderingHabits = (payload.hindering_habits || [])
    .map(name => `<li>${escapeHtml(name)}</li>`)
    .join('');
  container.innerHTML = `
    <div>
      <h2 class="section-header">Review and confirm</h2>
      <p class="hint">Chronos will create a goal YAML file using the structure below.</p>
    </div>
    <div class="form-grid two">
      <div>
        <h3 class="tagline">Snapshot</h3>
        <ul>
          <li><strong>Name:</strong> ${escapeHtml(state.goal.name)}</li>
          <li><strong>Category:</strong> ${escapeHtml(state.goal.category || 'n/a')}</li>
          <li><strong>Priority:</strong> ${escapeHtml(state.goal.priority || 'n/a')}</li>
          <li><strong>Horizon:</strong> ${escapeHtml(state.goal.horizon === 'custom' ? state.goal.customHorizon : state.goal.horizon)}</li>
        </ul>
      </div>
      <div>
        <h3 class="tagline">Milestones</h3>
        <ul>${milestoneSummary || '<li>Add at least one milestone.</li>'}</ul>
      </div>
    </div>
    <div>
      <h3 class="tagline">Linked milestones (existing + authored)</h3>
      <ul>${linkedMilestones || '<li>None linked</li>'}</ul>
    </div>
    <div>
      <h3 class="tagline">Success metrics</h3>
      <ul>${metrics || '<li>Add at least one metric.</li>'}</ul>
    </div>
    <div class="form-grid two">
      <div>
        <h3 class="tagline">Supporting habits</h3>
        <ul>${supportingHabits || '<li>None defined</li>'}</ul>
      </div>
      <div>
        <h3 class="tagline">Hindering habits</h3>
        <ul>${hinderingHabits || '<li>None defined</li>'}</ul>
      </div>
    </div>
    <div class="yaml-preview">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <strong>Goal YAML preview</strong>
        <button type="button" data-copy-yaml class="primary" style="padding:6px 12px;">Copy YAML</button>
      </div>
      <pre>${escapeHtml(yaml)}</pre>
    </div>
  `;
  container.querySelector('[data-copy-yaml]')?.addEventListener('click', async ()=>{
    const text = yaml;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      setStatus('YAML copied to clipboard.', 'success');
    } catch {
      setStatus('Unable to copy YAML. Select and copy manually.', 'warn');
    }
  });
}
function refreshStepper(){
  if (!overlayRefs?.stepper || !wizardState) return;
  overlayRefs.stepper.innerHTML = STEP_DEFS.map((step, idx) => {
    const stateClass = idx === wizardState.step ? 'active' : idx < wizardState.step ? 'done' : '';
    return `
      <div class="step ${stateClass}">
        <div class="bullet">${idx + 1}</div>
        <div>
          <div>${escapeHtml(step.name)}</div>
          <div class="hint">${escapeHtml(step.hint)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function setStatus(message = '', tone = 'info'){
  if (!wizardState) return;
  if (!overlayRefs?.status) return;
  overlayRefs.status.textContent = message;
  overlayRefs.status.dataset.tone = tone;
}

function updateValidationHint(){
  if (!overlayRefs?.validation || !wizardState) return;
  const validation = validateStep(wizardState.step, wizardState);
  overlayRefs.validation.textContent = validation.valid ? '' : validation.message || '';
  if (overlayRefs.next) overlayRefs.next.disabled = wizardState.busy || wizardState.step === STEP_DEFS.length - 1 || !validation.valid;
  if (overlayRefs.create) overlayRefs.create.disabled = wizardState.busy || wizardState.step !== STEP_DEFS.length - 1 || !validation.valid;
  if (overlayRefs.prev) overlayRefs.prev.disabled = wizardState.busy || wizardState.step === 0;
}

function updateNavigation(){
  if (!overlayRefs || !wizardState) return;
  refreshStepper();
  renderStepContent();
  if (overlayRefs.next) {
    overlayRefs.next.style.display = wizardState.step === STEP_DEFS.length - 1 ? 'none' : '';
    if (wizardState.step < STEP_DEFS.length - 1) {
      overlayRefs.next.textContent = `Next • ${STEP_DEFS[wizardState.step + 1].name}`;
    }
  }
  if (overlayRefs.create) overlayRefs.create.style.display = wizardState.step === STEP_DEFS.length - 1 ? '' : 'none';
  if (overlayRefs.create) overlayRefs.create.textContent = wizardState.mode === 'edit' ? 'Save Goal' : 'Create Goal';
  updateValidationHint();
}

function changeStep(delta){
  if (!wizardState) return;
  const next = wizardState.step + delta;
  if (next < 0 || next >= STEP_DEFS.length) return;
  wizardState.step = next;
  setStatus('');
  updateNavigation();
}

async function saveGoal(){
  if (!wizardState) return;
  const validation = validateStep(STEP_DEFS.length - 1, wizardState);
  if (!validation.valid) {
    setStatus(validation.message || 'Fix validation issues before saving.', 'warn');
    updateValidationHint();
    return;
  }
  let payload;
  try {
    payload = buildGoalPayload(wizardState);
  } catch (err) {
    setStatus(err.message, 'warn');
    updateValidationHint();
    return;
  }
  wizardState.busy = true;
  updateValidationHint();
  setStatus('Creating goal...', 'info');
  try {
    await apiRequest('/api/item', { method: 'POST', body: payload });
    await syncHabitGoalLinks(payload, wizardState.originalLinks.habits || []);
    await syncMilestoneGoalLinks(payload, wizardState.originalLinks.milestones || [], wizardState);
    wizardState.originalLinks.habits = normalizeNameList((payload.supporting_habits || []).concat(payload.hindering_habits || []));
    wizardState.originalLinks.milestones = normalizeNameList(payload.linked_milestones || []);
    setStatus(wizardState.mode === 'edit'
      ? 'Goal updated successfully, with habit and milestone links synced.'
      : 'Goal created successfully, with habit and milestone links synced.', 'success');
    wizardState.busy = false;
    updateValidationHint();
    contextRef?.bus?.emit?.('wizard:goal:created', { name: payload.name });
    contextRef?.bus?.emit?.('wizard:goal:saved', { name: payload.name, mode: wizardState.mode });
  } catch (err) {
    setStatus(err.message || 'Failed to create goal.', 'error');
    wizardState.busy = false;
    updateValidationHint();
  }
}

async function syncHabitGoalLinks(goalPayload, previousHabitLinks = []){
  const goalName = String(goalPayload?.name || '').trim();
  if (!goalName) return;

  const supporting = normalizeNameList(goalPayload.supporting_habits || []);
  const hindering = normalizeNameList(goalPayload.hindering_habits || []);
  const allNames = normalizeNameList(supporting.concat(hindering));
  const prevNames = normalizeNameList(previousHabitLinks);
  if (!allNames.length && !prevNames.length) return;

  let habitIndex = {};
  try {
    const resp = await apiRequest('/api/habits');
    const rows = Array.isArray(resp?.habits) ? resp.habits : [];
    rows.forEach((row) => {
      const name = String(row?.name || '').trim();
      if (!name) return;
      habitIndex[name.toLowerCase()] = row;
    });
  } catch {
    habitIndex = {};
  }

  for (const habitName of allNames) {
    const key = habitName.toLowerCase();
    const isHindering = hindering.some(x => x.toLowerCase() === key);
    const existing = habitIndex[key];
    let habitPayload = null;

    if (existing) {
      try {
        const itemResp = await apiRequest(`/api/item?type=habit&name=${encodeURIComponent(habitName)}`);
        habitPayload = itemResp?.item && typeof itemResp.item === 'object' ? itemResp.item : null;
      } catch {
        habitPayload = null;
      }
    }

    if (!habitPayload) {
      habitPayload = {
        type: 'habit',
        name: habitName,
        status: 'pending',
        polarity: isHindering ? 'bad' : 'good',
      };
    }

    const goals = mergeGoalsArray(habitPayload.goals, habitPayload.goal);
    if (!goals.some(x => x.toLowerCase() === goalName.toLowerCase())) goals.push(goalName);
    habitPayload.goals = goals;
    if (isHindering) habitPayload.polarity = 'bad';
    habitPayload.type = 'habit';
    habitPayload.name = habitName;

    await apiRequest('/api/item', { method: 'POST', body: habitPayload });
  }

  const removed = prevNames.filter(name => !allNames.some(x => x.toLowerCase() === name.toLowerCase()));
  for (const habitName of removed) {
    let itemResp = null;
    try {
      itemResp = await apiRequest(`/api/item?type=habit&name=${encodeURIComponent(habitName)}`);
    } catch {
      itemResp = null;
    }
    const habitPayload = itemResp?.item && typeof itemResp.item === 'object' ? itemResp.item : null;
    if (!habitPayload) continue;
    const goals = mergeGoalsArray(habitPayload.goals, habitPayload.goal).filter(x => x.toLowerCase() !== goalName.toLowerCase());
    habitPayload.goals = goals;
    if (typeof habitPayload.goal === 'string' && habitPayload.goal.trim().toLowerCase() === goalName.toLowerCase()) {
      delete habitPayload.goal;
    }
    habitPayload.type = 'habit';
    habitPayload.name = habitName;
    await apiRequest('/api/item', { method: 'POST', body: habitPayload });
  }
}

async function syncMilestoneGoalLinks(goalPayload, previousMilestoneLinks = [], state = null){
  const goalName = String(goalPayload?.name || '').trim();
  if (!goalName) return;
  const desiredNames = normalizeNameList(goalPayload.linked_milestones || []);
  const prevNames = normalizeNameList(previousMilestoneLinks || []);
  const authoredByName = {};
  ((state?.milestones) || []).forEach((m) => {
    const name = String(m?.name || '').trim();
    if (!name) return;
    authoredByName[name.toLowerCase()] = m;
  });

  for (const msName of desiredNames) {
    const authored = authoredByName[msName.toLowerCase()] || null;
    let payload = null;
    try {
      const resp = await apiRequest(`/api/item?type=milestone&name=${encodeURIComponent(msName)}`);
      payload = resp?.item && typeof resp.item === 'object' ? resp.item : null;
    } catch {
      payload = null;
    }
    if (!payload) payload = { type: 'milestone', name: msName, status: 'pending', progress: { percent: 0 } };
    payload.type = 'milestone';
    payload.name = msName;
    payload.goal = goalName;
    if (authored) {
      if (String(authored.summary || '').trim()) payload.description = String(authored.summary).trim();
      if (authored.target_date) payload.due_date = authored.target_date;
      if (String(authored.metric || '').trim()) payload.criteria = String(authored.metric).trim();
      if (authored.owner) payload.owner = authored.owner;
      payload.weight = Number(authored.weight) || 1;
      const steps = listFromMultiline(authored.steps || '');
      if (steps.length) payload.plan = steps;
      if (String(authored.celebrate || '').trim()) payload.celebration = String(authored.celebrate).trim();
    }
    await apiRequest('/api/item', { method: 'POST', body: payload });
  }

  const removed = prevNames.filter(name => !desiredNames.some(x => x.toLowerCase() === name.toLowerCase()));
  for (const msName of removed) {
    let resp = null;
    try {
      resp = await apiRequest(`/api/item?type=milestone&name=${encodeURIComponent(msName)}`);
    } catch {
      resp = null;
    }
    const payload = resp?.item && typeof resp.item === 'object' ? resp.item : null;
    if (!payload) continue;
    if (String(payload.goal || '').trim().toLowerCase() === goalName.toLowerCase()) {
      delete payload.goal;
      payload.type = 'milestone';
      payload.name = msName;
      await apiRequest('/api/item', { method: 'POST', body: payload });
    }
  }
}

async function loadMetadata(){
  if (!wizardState) return;
  const [cat, pri, habits, milestones, goals] = await Promise.allSettled([
    fetchSettings('category_settings.yml'),
    fetchSettings('priority_settings.yml'),
    apiRequest('/api/habits'),
    apiRequest('/api/items?type=milestone'),
    apiRequest('/api/goals'),
  ]);
  if (cat.status === 'fulfilled') {
    const catResp = cat.value;
    if (catResp?.Category_Settings || catResp?.category_settings) {
      wizardState.metadata.categories = parseOrderedEntries(catResp.Category_Settings || catResp.category_settings);
    }
  }
  if (pri.status === 'fulfilled') {
    const priResp = pri.value;
    if (priResp?.Priority_Settings || priResp?.priority_settings) {
      wizardState.metadata.priorities = parseOrderedEntries(priResp.Priority_Settings || priResp.priority_settings);
    }
  }
  if (habits.status === 'fulfilled') {
    const habitResp = habits.value;
    wizardState.metadata.habits = Array.isArray(habitResp?.habits)
      ? habitResp.habits.map(h => ({ name: String(h?.name || ''), polarity: String(h?.polarity || 'good') })).filter(h => h.name)
      : [];
  } else {
    wizardState.metadata.habits = [];
  }
  if (milestones.status === 'fulfilled') {
    const msResp = milestones.value;
    wizardState.metadata.milestones = Array.isArray(msResp?.items)
      ? msResp.items
        .filter(m => m && String(m.type || '').toLowerCase() === 'milestone')
        .map(m => ({ name: String(m.name || ''), goal: String(m.goal || '') }))
        .filter(m => m.name)
      : [];
  } else {
    wizardState.metadata.milestones = [];
  }
  if (goals.status === 'fulfilled') {
    const goalResp = goals.value;
    wizardState.metadata.goals = Array.isArray(goalResp?.goals)
      ? goalResp.goals.map(g => String(g?.name || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b))
      : [];
  } else {
    wizardState.metadata.goals = [];
  }
  if (cat.status === 'rejected' || pri.status === 'rejected' || habits.status === 'rejected' || milestones.status === 'rejected' || goals.status === 'rejected') {
    console.warn('[Chronos][GoalWizard] Metadata load partial failure', {
      categories: cat.status,
      priorities: pri.status,
      habits: habits.status,
      milestones: milestones.status,
      goals: goals.status,
    });
    setStatus('Some metadata could not be loaded. You can continue with manual input.', 'warn');
  }
  updateNavigation();
}

async function fetchSettings(file){
  const resp = await fetch(`${apiBase()}/api/settings?file=${encodeURIComponent(file)}`);
  const data = await resp.json().catch(()=> ({}));
  if (!resp.ok) throw new Error(data?.error || `Failed to load ${file}`);
  return data.data || {};
}

function parseOrderedEntries(entries){
  return Object.entries(entries || {}).map(([name, meta]) => ({
    value: name,
    label: name,
    order: Number(meta?.value) || Number(meta?.Value) || 999,
  })).sort((a, b) => (a.order || 999) - (b.order || 999));
}

function goalsContainName(goalsValue, goalName){
  const target = String(goalName || '').trim().toLowerCase();
  if (!target) return false;
  const list = mergeGoalsArray(Array.isArray(goalsValue) ? goalsValue : [], typeof goalsValue === 'string' ? goalsValue : '');
  return list.some(x => x.toLowerCase() === target);
}

function resolveTargetGoalName(options){
  const maybe = [options?.goalName, options?.goal, options?.name];
  for (const entry of maybe) {
    const v = String(entry || '').trim();
    if (v) return v;
  }
  return '';
}

function toMultiline(values){
  const list = normalizeNameList(values || []);
  return list.join('\n');
}

function resetToCreateMode(){
  if (!wizardState) return;
  const metadata = wizardState.metadata || { categories: [], priorities: [], habits: [], milestones: [], goals: [] };
  wizardState.mode = 'create';
  wizardState.targetGoalName = '';
  wizardState.goal = {
    name: '',
    description: '',
    why: '',
    category: '',
    priority: '',
    horizon: '90d',
    customHorizon: '',
    start_date: '',
    target_date: '',
    celebrate: '',
    tags: '',
  };
  wizardState.metrics = [createMetric()];
  wizardState.supports = {
    habits: '',
    first_action: '',
    checkpoints: 'Weekly review',
    risks: '',
    accountability: '',
  };
  wizardState.hindering = { selectedHabits: [], newHabits: '' };
  wizardState.milestoneLinks = { selectedExisting: [] };
  wizardState.milestones = [createMilestone(), createMilestone()];
  wizardState.originalLinks = { habits: [], milestones: [] };
  wizardState.metadata = metadata;
  setStatus('Create mode enabled.', 'info');
}

async function loadGoalForEdit(goalName){
  if (!wizardState || !goalName) return;
  const normalizedName = String(goalName).trim();
  if (!normalizedName) return;

  const [goalRes, habitsRes, milestonesRes] = await Promise.allSettled([
    apiRequest(`/api/item?type=goal&name=${encodeURIComponent(normalizedName)}`),
    apiRequest('/api/items?type=habit'),
    apiRequest('/api/items?type=milestone'),
  ]);

  if (goalRes.status !== 'fulfilled' || !goalRes.value?.item) {
    setStatus(`Could not load goal "${normalizedName}". Starting in create mode.`, 'warn');
    return;
  }

  const goal = goalRes.value.item || {};
  wizardState.mode = 'edit';
  wizardState.targetGoalName = normalizedName;
  wizardState.goal.name = String(goal.name || normalizedName);
  wizardState.goal.description = String(goal.description || '');
  wizardState.goal.why = String(goal.why || '');
  wizardState.goal.category = String(goal.category || '');
  wizardState.goal.priority = String(goal.priority || '');
  wizardState.goal.start_date = String(goal.start_date || '');
  wizardState.goal.target_date = String(goal.due_date || goal.target_date || '');
  wizardState.goal.celebrate = String(goal.celebration || goal.celebrate || '');
  wizardState.goal.tags = Array.isArray(goal.tags) ? goal.tags.join(', ') : String(goal.tags || '');
  const duration = String(goal.duration || '90d').trim();
  const knownHorizons = new Set(HORIZON_PRESETS.map(x => x.value));
  if (knownHorizons.has(duration)) {
    wizardState.goal.horizon = duration;
    wizardState.goal.customHorizon = '';
  } else if (duration) {
    wizardState.goal.horizon = 'custom';
    wizardState.goal.customHorizon = duration;
  }

  const habitItems = habitsRes.status === 'fulfilled' && Array.isArray(habitsRes.value?.items) ? habitsRes.value.items : [];
  const linkedFromHabits = habitItems
    .filter(h => h && String(h.type || '').toLowerCase() === 'habit')
    .filter(h => goalsContainName(h.goals || h.goal || [], normalizedName))
    .map(h => ({ name: String(h.name || ''), polarity: String(h.polarity || 'good').toLowerCase() }))
    .filter(h => h.name);
  const linkedHabitNames = normalizeNameList(linkedFromHabits.map(h => h.name));

  const supporting = listFromMaybe(goal.supporting_habits);
  const hindering = listFromMaybe(goal.hindering_habits);
  const inferredSupporting = linkedFromHabits.filter(h => h.polarity !== 'bad').map(h => h.name);
  const inferredHindering = linkedFromHabits.filter(h => h.polarity === 'bad').map(h => h.name);

  wizardState.supports.habits = toMultiline(supporting.length ? supporting : inferredSupporting);
  wizardState.hindering.selectedHabits = normalizeNameList(hindering.length ? hindering : inferredHindering);
  wizardState.hindering.newHabits = '';
  wizardState.originalLinks.habits = normalizeNameList(linkedHabitNames.concat(supporting, hindering));

  const authoredMilestones = Array.isArray(goal.milestones) ? goal.milestones : [];
  if (authoredMilestones.length) {
    wizardState.milestones = authoredMilestones.map((m, idx) => ({
      id: randomId(`milestone_${idx + 1}`),
      name: String(m?.name || ''),
      summary: String(m?.description || ''),
      target_date: String(m?.due_date || ''),
      metric: String(m?.criteria || ''),
      steps: Array.isArray(m?.plan) ? m.plan.join('\n') : '',
      celebrate: String(m?.celebration || ''),
      owner: String(m?.owner || ''),
      weight: Number(m?.weight) || 1,
    })).filter(m => m.name || m.summary);
  }
  if (!wizardState.milestones.length) wizardState.milestones = [createMilestone()];

  const milestoneItems = milestonesRes.status === 'fulfilled' && Array.isArray(milestonesRes.value?.items) ? milestonesRes.value.items : [];
  const linkedMsFromItems = milestoneItems
    .filter(m => m && String(m.type || '').toLowerCase() === 'milestone')
    .filter(m => String(m.goal || '').trim().toLowerCase() === normalizedName.toLowerCase())
    .map(m => String(m.name || ''))
    .filter(Boolean);
  const linkedMsFromGoal = listFromMaybe(goal.linked_milestones);
  const linkedMilestones = normalizeNameList(linkedMsFromItems.concat(linkedMsFromGoal));
  wizardState.milestoneLinks.selectedExisting = linkedMilestones;
  wizardState.originalLinks.milestones = linkedMilestones;

  setStatus(`Editing goal "${wizardState.goal.name}".`, 'info');
}

function mountOverlay(){
  injectStyles();
  removeOverlay();
  overlayEl = document.createElement('div');
  overlayEl.className = 'wizard-overlay chronos-wizard-overlay';
  overlayEl.setAttribute('data-wizard-overlay', OVERLAY_TAG);
  overlayEl.innerHTML = `
    <div class="goal-wizard-shell chronos-wizard-shell">
      <div class="wizard-header chronos-wizard-header">
        <div>
          <div class="wizard-eyebrow">Chronos Wizard</div>
          <h1>Goal Planning Wizard</h1>
          <p class="tagline">Design a compelling goal, break it into milestones, and save it as YAML.</p>
        </div>
        <button type="button" class="close" aria-label="Close">×</button>
      </div>
      <div class="wizard-progress chronos-wizard-stepper" data-stepper></div>
      <div class="wizard-body chronos-wizard-body" data-step-region></div>
      <div class="wizard-footer chronos-wizard-footer">
        <div class="wizard-status chronos-wizard-status">
          <div data-status></div>
          <div data-validation></div>
        </div>
        <div class="wizard-actions chronos-wizard-actions">
          <button type="button" data-action="close">Cancel</button>
          <button type="button" data-action="prev">Back</button>
          <button type="button" class="primary" data-action="next">Next Step</button>
          <button type="button" class="primary" data-action="create">Create Goal</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  const shell = overlayEl.querySelector('.goal-wizard-shell');
  const helpBtn = contextRef?.createHelpButton?.('GoalPlanning', {
    className: 'wizard-help-btn icon-btn help-btn',
    fallbackLabel: 'Goal Planning Wizard'
  });
  if (shell && helpBtn) {
    helpBtn.classList.add('wizard-help-btn');
    shell.appendChild(helpBtn);
  }
  overlayRefs = {
    body: overlayEl.querySelector('[data-step-region]'),
    stepper: overlayEl.querySelector('[data-stepper]'),
    status: overlayEl.querySelector('[data-status]'),
    validation: overlayEl.querySelector('[data-validation]'),
    next: overlayEl.querySelector('[data-action="next"]'),
    prev: overlayEl.querySelector('[data-action="prev"]'),
    close: overlayEl.querySelector('[data-action="close"]'),
    create: overlayEl.querySelector('[data-action="create"]'),
  };
  overlayRefs.close.addEventListener('click', closeWizard);
  overlayRefs.prev.addEventListener('click', ()=> changeStep(-1));
  overlayRefs.next.addEventListener('click', ()=> changeStep(1));
  overlayRefs.create.addEventListener('click', saveGoal);
  overlayEl.querySelector('button.close')?.addEventListener('click', closeWizard);
  overlayEl.addEventListener('click', (ev)=> { if (ev.target === overlayEl) closeWizard(); });
  keyHandler = (ev) => { if (ev.key === 'Escape') closeWizard(); };
  window.addEventListener('keydown', keyHandler);
  wizardState = createInitialState();
  updateNavigation();
}

function closeWizard(){
  contextRef?.bus?.emit?.('wizard:closed', { wizard: optionsRef?.wizard || 'GoalPlanning' });
  removeOverlay();
}

export async function launch(context, options = {}){
  contextRef = context || null;
  optionsRef = options || {};
  mountOverlay();
  contextRef?.bus?.emit?.('wizard:opened', { wizard: options?.wizard || 'GoalPlanning' });
  const targetGoalName = resolveTargetGoalName(optionsRef);
  if (targetGoalName) {
    await loadGoalForEdit(targetGoalName);
  }
  await loadMetadata();
}
