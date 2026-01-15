const OVERLAY_TAG = 'chronos-project-wizard';
let stylesInjected = false;
let overlayEl = null;
let overlayRefs = null;
let wizardState = null;
let keyHandler = null;
let contextRef = null;
let optionsRef = null;

const STEP_DEFS = [
  { id: 'brief', name: 'Project Brief', hint: 'Capture owner, scope, and timing.', render: renderBriefStep },
  { id: 'plan', name: 'Milestones & Kickoff', hint: 'Break the project down before launch.', render: renderPlanStep },
  { id: 'review', name: 'Review & Create', hint: 'Preview YAML and create items.', render: renderReviewStep },
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
    .project-wizard-shell {
      width: min(920px, 95vw);
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
    .wizard-header { display: flex; justify-content: space-between; gap: 16px; }
    .wizard-header button.close {
      background: none;
      border: none;
      color: var(--chronos-text-soft);
      font-size: 20px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 10px;
    }
    .wizard-header button.close:hover { color: #fff; background: rgba(255,255,255,0.08); }
    .wizard-eyebrow { font-size: 13px; text-transform: uppercase; letter-spacing: 2px; color: var(--chronos-text-soft); margin-bottom: 6px; }
    .wizard-progress {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
    .wizard-progress .step.active { border-color: var(--chronos-accent); background: var(--chronos-accent-soft); }
    .wizard-progress .step.done { border-color: var(--chronos-success); background: var(--chronos-success-soft); }
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
    .wizard-actions { display: flex; gap: 10px; }
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
    .wizard-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
    .wizard-status { flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .wizard-status [data-status][data-tone="success"] { color: var(--chronos-success); }
    .wizard-status [data-status][data-tone="error"] { color: var(--chronos-danger); }
    .wizard-status [data-status][data-tone="warn"] { color: var(--chronos-warning); }
    .form-grid { display: grid; gap: 14px; }
    .form-grid.two { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .form-grid label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--chronos-text); }
    .form-grid label span.hint { font-size: 12px; color: var(--chronos-text-soft); }
    input[type="text"], input[type="date"], textarea, select {
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(8,12,20,0.85);
      color: var(--chronos-text);
      padding: 9px 12px;
      font-size: 15px;
    }
    textarea { min-height: 90px; resize: vertical; }
    .card-list { display: flex; flex-direction: column; gap: 12px; }
    .wizard-card { border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 14px; background: rgba(11,15,24,0.88); }
    .wizard-card header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .wizard-card button.remove { background: none; border: none; color: var(--chronos-text-soft); cursor: pointer; }
    .wizard-card button.remove:hover { color: var(--chronos-danger); }
    .yaml-preview { border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 14px; background: rgba(9,12,20,0.9); margin-top: 12px; }
    .yaml-preview pre { max-height: 320px; overflow: auto; background: rgba(3,5,9,0.9); padding: 14px; border-radius: 10px; color: var(--chronos-text); font-size: 13px; }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function removeOverlay(){
  if (overlayEl){ overlayEl.remove(); overlayEl = null; overlayRefs = null; }
  if (keyHandler){ window.removeEventListener('keydown', keyHandler); keyHandler = null; }
  wizardState = null;
}

function createInitialState(){
  return {
    step: 0,
    busy: false,
    project: {
      name: '',
      summary: '',
      owner: '',
      category: '',
      priority: '',
      mission: '',
      success: '',
      tags: '',
      start_date: '',
      target_date: '',
    },
    milestones: [createMilestone()],
    kickoff: {
      tasks: '',
      dependencies: '',
      communications: 'Weekly status email',
      checkins: 'Friday retro',
      notes: '',
    },
    metadata: { categories: [], priorities: [] },
  };
}

function createMilestone(){
  return {
    id: randomId('milestone'),
    name: '',
    summary: '',
    target_date: '',
    owner: '',
    status: '',
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
  if (body !== undefined){
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const resp = await fetch(apiBase() + path, opts);
  const text = await resp.text();
  let data = text;
  try { data = JSON.parse(text); } catch {}
  if (!resp.ok || (data && typeof data === 'object' && data.ok === false)){
    const err = (data && (data.error || data.stderr)) || text || `HTTP ${resp.status}`;
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

function setField(path, value){
  if (!wizardState) return;
  const parts = path.split('.');
  let ref = wizardState;
  for (let i = 0; i < parts.length - 1; i++){
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

function slugify(value){
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
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

function buildProjectPayload(state){
  if (!state?.project?.name?.trim()) throw new Error('Project name is required.');
  if (!state.project.summary?.trim()) throw new Error('Add a summary.');
  const project = state.project;
  const payload = {
    type: 'project',
    name: project.name.trim(),
    description: project.summary.trim(),
  };
  if (project.owner?.trim()) payload.owner = project.owner.trim();
  if (project.category?.trim()) payload.category = project.category.trim();
  if (project.priority?.trim()) payload.priority = project.priority.trim();
  if (project.mission?.trim()) payload.mission = project.mission.trim();
  if (project.success?.trim()) payload.success = project.success.trim();
  if (project.tags?.trim()) payload.tags = project.tags.split(',').map(t => t.trim()).filter(Boolean);
  if (project.start_date) payload.start_date = project.start_date;
  if (project.target_date) payload.due_date = project.target_date;

  const milestones = state.milestones
    .map((mile, idx) => {
      if (!mile.name?.trim()) return null;
      if (!mile.summary?.trim()) return null;
      const entry = {
        id: slugify(mile.name) || `milestone_${idx + 1}`,
        name: mile.name.trim(),
        description: mile.summary.trim(),
      };
      if (mile.owner?.trim()) entry.owner = mile.owner.trim();
      if (mile.target_date) entry.due_date = mile.target_date;
      if (mile.status?.trim()) entry.status = mile.status.trim();
      return entry;
    })
    .filter(Boolean);
  if (!milestones.length) throw new Error('Add at least one milestone.');
  payload.milestones = milestones;

  const kickoffTasks = listFromMultiline(state.kickoff.tasks);
  const kickoff = {};
  if (kickoffTasks.length) kickoff.tasks = kickoffTasks;
  if (state.kickoff.dependencies?.trim()) kickoff.dependencies = state.kickoff.dependencies.trim();
  if (state.kickoff.communications?.trim()) kickoff.communications = state.kickoff.communications.trim();
  if (state.kickoff.checkins?.trim()) kickoff.checkins = state.kickoff.checkins.trim();
  if (state.kickoff.notes?.trim()) kickoff.notes = state.kickoff.notes.trim();
  if (!shouldSkip(kickoff)) payload.kickoff_plan = kickoff;
  return payload;
}

function renderBriefStep(container, state){
  const categories = state.metadata.categories || [];
  const priorities = state.metadata.priorities || [];
  const catOptions = ['<option value="">Select category</option>']
    .concat(categories.map(opt => `<option value="${escapeAttr(opt.value)}"${opt.value === state.project.category ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`))
    .join('');
  const priorityOptions = ['<option value="">Select priority</option>']
    .concat(priorities.map(opt => `<option value="${escapeAttr(opt.value)}"${opt.value === state.project.priority ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`))
    .join('');
  container.innerHTML = `
    <div>
      <h2 class="section-header">Tell Chronos about the project</h2>
      <p class="hint">This info powers filters, dashboards, and the YAML file.</p>
    </div>
    <div class="form-grid two">
      <label>Project name<input type="text" data-field="project.name" value="${escapeAttr(state.project.name)}" placeholder="Chronos Dashboard Refresh" /></label>
      <label>Owner<input type="text" data-field="project.owner" value="${escapeAttr(state.project.owner)}" placeholder="Optional" /></label>
      <label>Category<select data-field="project.category">${catOptions}</select></label>
      <label>Priority<select data-field="project.priority">${priorityOptions}</select></label>
      <label>Start date<input type="date" data-field="project.start_date" value="${escapeAttr(state.project.start_date)}" /></label>
      <label>Target date<input type="date" data-field="project.target_date" value="${escapeAttr(state.project.target_date)}" /></label>
    </div>
    <div class="form-grid">
      <label>Summary<textarea data-field="project.summary" placeholder="What problem are you solving?">${escapeHtml(state.project.summary)}</textarea></label>
      <label>Mission<textarea data-field="project.mission">${escapeHtml(state.project.mission)}</textarea></label>
      <label>Success signals<textarea data-field="project.success" placeholder="How will you measure success?">${escapeHtml(state.project.success)}</textarea></label>
      <label>Tags<span class="hint">Comma separated.</span><input type="text" data-field="project.tags" value="${escapeAttr(state.project.tags)}" placeholder="client, q1, redesign" /></label>
    </div>
  `;
  container.querySelectorAll('[data-field]').forEach(el => {
    const handler = (ev)=> setField(ev.target.dataset.field, ev.target.value);
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });
}

function renderPlanStep(container, state){
  container.innerHTML = `
    <div>
      <h2 class="section-header">Milestones & kickoff plan</h2>
      <p class="hint">Break the work into chunks and capture the first tasks.</p>
    </div>
    <div class="card-list" data-milestones></div>
    <button type="button" class="primary" data-add-mile>Add milestone</button>
    <div class="form-grid two" style="margin-top:18px;">
      <label>Kickoff tasks<span class="hint">One per line.</span><textarea data-kickoff="tasks">${escapeHtml(state.kickoff.tasks)}</textarea></label>
      <label>Dependencies<textarea data-kickoff="dependencies">${escapeHtml(state.kickoff.dependencies)}</textarea></label>
      <label>Communications plan<input type="text" data-kickoff="communications" value="${escapeAttr(state.kickoff.communications)}" /></label>
      <label>Check-ins<input type="text" data-kickoff="checkins" value="${escapeAttr(state.kickoff.checkins)}" /></label>
      <label>Notes<textarea data-kickoff="notes">${escapeHtml(state.kickoff.notes)}</textarea></label>
    </div>
  `;
  const listEl = container.querySelector('[data-milestones]');
  function renderList(){
    listEl.innerHTML = '';
    state.milestones.forEach((mile, idx) => {
      const card = document.createElement('section');
      card.className = 'wizard-card';
      card.dataset.milestoneId = mile.id;
      card.innerHTML = `
        <header>
          <strong>${escapeHtml(mile.name || `Milestone ${idx + 1}`)}</strong>
          <button type="button" class="remove" aria-label="Remove milestone">Remove</button>
        </header>
        <div class="form-grid two">
          <label>Name<input type="text" data-m-field="name" value="${escapeAttr(mile.name)}" /></label>
          <label>Owner<input type="text" data-m-field="owner" value="${escapeAttr(mile.owner)}" /></label>
          <label>Target date<input type="date" data-m-field="target_date" value="${escapeAttr(mile.target_date)}" /></label>
          <label>Status<input type="text" data-m-field="status" value="${escapeAttr(mile.status)}" placeholder="pending / in_progress" /></label>
        </div>
        <label>Summary<textarea data-m-field="summary">${escapeHtml(mile.summary)}</textarea></label>
      `;
      card.querySelector('.remove')?.addEventListener('click', ()=>{
        if (state.milestones.length === 1) return;
        state.milestones = state.milestones.filter(m => m.id !== mile.id);
        renderList();
        updateValidationHint();
      });
      card.querySelectorAll('[data-m-field]').forEach(el => {
        el.addEventListener('input', (ev)=>{
          const target = state.milestones.find(m => m.id === mile.id);
          if (!target) return;
          target[ev.target.dataset.mField] = ev.target.value;
          if (ev.target.dataset.mField === 'name'){
            card.querySelector('strong').textContent = ev.target.value || `Milestone ${idx + 1}`;
          }
          updateValidationHint();
        });
      });
      listEl.appendChild(card);
    });
  }
  renderList();
  container.querySelector('[data-add-mile]')?.addEventListener('click', ()=>{
    state.milestones.push(createMilestone());
    renderList();
  });
  container.querySelectorAll('[data-kickoff]').forEach(el => {
    el.addEventListener('input', (ev)=>{
      state.kickoff[ev.target.dataset.kickoff] = ev.target.value;
      updateValidationHint();
    });
  });
}

function renderReviewStep(container, state){
  let yaml = '';
  try {
    yaml = toYaml(buildProjectPayload(state), 0);
  } catch (err) {
    yaml = `# Fix validation errors first\n# ${err.message}`;
  }
  const milestoneList = state.milestones
    .filter(m => m.name.trim())
    .map(m => `<li>${escapeHtml(m.name)}${m.target_date ? ` (due ${escapeHtml(m.target_date)})` : ''}</li>`)
    .join('') || '<li>Add milestones.</li>';
  container.innerHTML = `
    <div>
      <h2 class="section-header">Review</h2>
      <p class="hint">Chronos will write a project YAML file using the preview below.</p>
    </div>
    <div class="form-grid two">
      <ul>
        <li><strong>Name:</strong> ${escapeHtml(state.project.name || 'n/a')}</li>
        <li><strong>Owner:</strong> ${escapeHtml(state.project.owner || 'n/a')}</li>
        <li><strong>Category:</strong> ${escapeHtml(state.project.category || 'n/a')}</li>
        <li><strong>Priority:</strong> ${escapeHtml(state.project.priority || 'n/a')}</li>
      </ul>
      <div>
        <strong>Milestones</strong>
        <ul>${milestoneList}</ul>
      </div>
    </div>
    <div class="yaml-preview">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <strong>Project YAML preview</strong>
        <button type="button" class="primary" data-copy>Copy YAML</button>
      </div>
      <pre>${escapeHtml(yaml)}</pre>
    </div>
  `;
  container.querySelector('[data-copy]')?.addEventListener('click', async ()=>{
    try {
      await navigator.clipboard?.writeText?.(yaml);
      setStatus('Copied YAML to clipboard.', 'success');
    } catch {
      setStatus('Unable to copy automatically.', 'warn');
    }
  });
}

function renderStepContent(){
  if (!overlayRefs?.body || !wizardState) return;
  const def = STEP_DEFS[wizardState.step];
  overlayRefs.body.innerHTML = '';
  def.render(overlayRefs.body, wizardState);
  updateValidationHint();
}

function refreshStepper(){
  if (!overlayRefs?.stepper || !wizardState) return;
  overlayRefs.stepper.innerHTML = STEP_DEFS.map((step, idx) => {
    const cls = idx === wizardState.step ? 'active' : idx < wizardState.step ? 'done' : '';
    return `
      <div class="step ${cls}">
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

function changeStep(delta){
  if (!wizardState) return;
  const next = wizardState.step + delta;
  if (next < 0 || next >= STEP_DEFS.length) return;
  wizardState.step = next;
  setStatus('');
  updateNavigation();
}

function updateNavigation(){
  if (!overlayRefs || !wizardState) return;
  refreshStepper();
  renderStepContent();
  if (overlayRefs.next){
    overlayRefs.next.style.display = wizardState.step === STEP_DEFS.length - 1 ? 'none' : '';
    if (wizardState.step < STEP_DEFS.length - 1){
      overlayRefs.next.textContent = `Next · ${STEP_DEFS[wizardState.step + 1].name}`;
    }
  }
  if (overlayRefs.create) overlayRefs.create.style.display = wizardState.step === STEP_DEFS.length - 1 ? '' : 'none';
  updateValidationHint();
}

async function saveProject(){
  if (!wizardState) return;
  const validation = validateStep(STEP_DEFS.length - 1, wizardState);
  if (!validation.valid){
    setStatus(validation.message || 'Fix validation issues before saving.', 'warn');
    updateValidationHint();
    return;
  }
  let payload;
  try {
    payload = buildProjectPayload(wizardState);
  } catch (err) {
    setStatus(err.message, 'warn');
    updateValidationHint();
    return;
  }
  wizardState.busy = true;
  updateValidationHint();
  setStatus('Creating project...', 'info');
  try {
    await apiRequest('/api/item', { method: 'POST', body: payload });
    const kickoffTasks = listFromMultiline(wizardState.kickoff.tasks);
    for (const [idx, task] of kickoffTasks.entries()){
      await apiRequest('/api/item', { method: 'POST', body: {
        type: 'task',
        name: task,
        description: `Kickoff task for ${payload.name}`,
        project: payload.name,
        order: idx + 1,
      }});
    }
    setStatus('Project created successfully.', 'success');
    contextRef?.bus?.emit?.('wizard:project:created', { name: payload.name });
  } catch (err) {
    setStatus(err.message || 'Failed to create project.', 'error');
  } finally {
    wizardState.busy = false;
    updateValidationHint();
  }
}

async function loadMetadata(){
  try {
    const [cats, pri] = await Promise.all([
      fetchSettings('category_settings.yml'),
      fetchSettings('priority_settings.yml'),
    ]);
    if (cats?.Category_Settings || cats?.category_settings){
      wizardState.metadata.categories = parseOrderedEntries(cats.Category_Settings || cats.category_settings);
    }
    if (pri?.Priority_Settings || pri?.priority_settings){
      wizardState.metadata.priorities = parseOrderedEntries(pri.Priority_Settings || pri.priority_settings);
    }
  } catch (err) {
    console.warn('[Chronos][ProjectWizard] Metadata load failed', err);
    setStatus('Metadata unavailable. Continue with manual entries.', 'warn');
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

function validateStep(index, state){
  if (!state) return { valid: false, message: '' };
  if (index === 0){
    if (!state.project.name?.trim()) return { valid: false, message: 'Name your project before continuing.' };
    if (!state.project.summary?.trim()) return { valid: false, message: 'Add a summary.' };
    return { valid: true };
  }
  if (index === 1){
    const milestones = state.milestones.filter(m => m.name.trim());
    if (!milestones.length) return { valid: false, message: 'Add at least one milestone.' };
    if (milestones.some(m => !m.summary.trim())) return { valid: false, message: 'Describe each milestone.' };
    return { valid: true };
  }
  if (index === 2){
    try {
      buildProjectPayload(state);
      return { valid: true };
    } catch (err) {
      return { valid: false, message: err.message };
    }
  }
  return { valid: true };
}

function closeWizard(){
  contextRef?.bus?.emit?.('wizard:closed', { wizard: optionsRef?.wizard || 'ProjectLaunch' });
  removeOverlay();
}

function mountOverlay(){
  injectStyles();
  removeOverlay();
  overlayEl = document.createElement('div');
  overlayEl.className = 'wizard-overlay';
  overlayEl.setAttribute('data-wizard-overlay', OVERLAY_TAG);
  overlayEl.innerHTML = `
    <div class="project-wizard-shell">
      <div class="wizard-header">
        <div>
          <div class="wizard-eyebrow">Chronos Wizard</div>
          <h1>Project Launch Wizard</h1>
          <p class="hint">Capture the brief, milestones, and kickoff plan in one guided flow.</p>
        </div>
        <button type="button" class="close" aria-label="Close">×</button>
      </div>
      <div class="wizard-progress" data-stepper></div>
      <div class="wizard-body" data-step-region></div>
      <div class="wizard-footer">
        <div class="wizard-status">
          <div data-status></div>
          <div data-validation></div>
        </div>
        <div class="wizard-actions">
          <button type="button" data-action="close">Cancel</button>
          <button type="button" data-action="prev">Back</button>
          <button type="button" class="primary" data-action="next">Next Step</button>
          <button type="button" class="primary" data-action="create">Create Project</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  const shell = overlayEl.querySelector('.project-wizard-shell');
  const helpBtn = contextRef?.createHelpButton?.('ProjectLaunch', {
    className: 'wizard-help-btn icon-btn help-btn',
    fallbackLabel: 'Project Launch Wizard'
  });
  if (shell && helpBtn) shell.appendChild(helpBtn);
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
  overlayRefs.close?.addEventListener('click', closeWizard);
  overlayRefs.prev?.addEventListener('click', ()=> changeStep(-1));
  overlayRefs.next?.addEventListener('click', ()=> changeStep(1));
  overlayRefs.create?.addEventListener('click', saveProject);
  overlayEl.querySelector('button.close')?.addEventListener('click', closeWizard);
  overlayEl.addEventListener('click', (ev)=> { if (ev.target === overlayEl) closeWizard(); });
  keyHandler = (ev) => { if (ev.key === 'Escape') closeWizard(); };
  window.addEventListener('keydown', keyHandler);
  wizardState = createInitialState();
  updateNavigation();
}

export async function launch(context, options = {}){
  contextRef = context || null;
  optionsRef = options || {};
  mountOverlay();
  contextRef?.bus?.emit?.('wizard:opened', { wizard: options?.wizard || 'ProjectLaunch' });
  await loadMetadata();
}
