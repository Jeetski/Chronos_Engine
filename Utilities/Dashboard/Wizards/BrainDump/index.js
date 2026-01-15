const OVERLAY_TAG = 'chronos-brain-dump-wizard';
let stylesInjected = false;
let overlayEl = null;
let overlayRefs = null;
let wizardState = null;
let keyHandler = null;
let contextRef = null;
let optionsRef = null;

const STEP_DEFS = [
  { id: 'capture', name: 'Capture', hint: 'Dump tasks as simple lines.', render: renderCaptureStep },
  { id: 'sort', name: 'Sort', hint: 'Bucket by horizon.', render: renderSortStep },
  { id: 'refine', name: 'Refine', hint: 'Priority, due dates, tags.', render: renderRefineStep },
];

const BUCKETS = [
  { id: 'week', label: 'This week', description: 'Short-term and urgent.' },
  { id: 'month', label: 'This month', description: 'Default bucket.' },
  { id: 'later', label: 'Later', description: 'Backlog items.' },
];

const FALLBACK_PRIORITIES = [
  { value: 'Urgent', label: 'Urgent' },
  { value: 'High', label: 'High' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Low', label: 'Low' },
  { value: 'Optional', label: 'Optional' },
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
    .brain-dump-shell {
      width: min(980px, 95vw);
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
    .wizard-actions { display: flex; gap: 10px; flex-wrap: wrap; }
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
    .wizard-status [data-validation] { font-size: 13px; color: var(--chronos-warning); }
    .form-grid { display: grid; gap: 14px; }
    .form-grid.two { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--chronos-text); }
    label span.hint { font-size: 12px; color: var(--chronos-text-soft); }
    input[type="text"], input[type="date"], textarea, select {
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(8,12,20,0.85);
      color: var(--chronos-text);
      padding: 9px 12px;
      font-size: 15px;
    }
    textarea { min-height: 130px; resize: vertical; }
    .section-header {
      margin: 0 0 12px 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--chronos-text);
    }
    .hint { color: var(--chronos-text-soft); font-size: 13px; }
    .bucket-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
    }
    .bucket-column {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      background: rgba(11,15,24,0.88);
      display: flex;
      flex-direction: column;
      min-height: 260px;
      overflow: hidden;
    }
    .bucket-header {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10px;
    }
    .bucket-header h3 { margin: 0; font-size: 16px; }
    .bucket-header p { margin: 0; font-size: 12px; color: var(--chronos-text-soft); }
    .bucket-list { padding: 12px; display: flex; flex-direction: column; gap: 10px; overflow: auto; }
    .task-card {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 10px;
      background: rgba(7,12,20,0.7);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .task-row { display: flex; align-items: center; gap: 8px; }
    .task-row input { flex: 1; }
    .task-actions { display: flex; gap: 6px; }
    .task-actions button {
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 4px 8px;
      font-size: 12px;
      background: rgba(12,16,28,0.8);
      color: inherit;
      cursor: pointer;
    }
    .task-actions button.danger { color: var(--chronos-danger); }
    .refine-list { display: flex; flex-direction: column; gap: 12px; }
    .refine-card {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 14px;
      background: rgba(11,15,24,0.88);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .refine-card header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(59,100,255,0.15);
      color: var(--chronos-text-soft);
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
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
    captureText: '',
    tasks: [],
    lastParsedText: '',
    metadata: { priorities: [] },
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

function parseCaptureLines(text){
  return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function createTask(name){
  return {
    id: randomId('task'),
    name: name.trim(),
    horizon: 'month',
    priority: '',
    due_date: '',
    tags: '',
  };
}

function syncTasksFromCapture(force = false){
  if (!wizardState) return;
  if (!force && wizardState.lastParsedText === wizardState.captureText) return;
  const lines = parseCaptureLines(wizardState.captureText);
  wizardState.tasks = lines.map(line => createTask(line));
  wizardState.lastParsedText = wizardState.captureText;
}

function bucketLabel(id){
  const bucket = BUCKETS.find(b => b.id === id);
  return bucket ? bucket.label : id;
}

function parseTags(text){
  return String(text || '').split(',').map(s => s.trim()).filter(Boolean);
}

function renderCaptureStep(container, state){
  container.innerHTML = `
    <div>
      <h2 class="section-header">Rapid task capture</h2>
      <p class="hint">One task per line. Keep it fast and messy.</p>
    </div>
    <div class="form-grid">
      <label>Brain dump<textarea data-field="captureText" placeholder="Fix onboarding flow&#10;Write release notes&#10;Review roadmap">${escapeHtml(state.captureText)}</textarea></label>
    </div>
  `;
  container.querySelector('[data-field="captureText"]')?.addEventListener('input', (ev)=>{
    state.captureText = ev.target.value;
    updateValidationHint();
  });
}

function renderSortStep(container, state){
  const tasksByBucket = BUCKETS.reduce((acc, bucket)=>{
    acc[bucket.id] = state.tasks.filter(task => task.horizon === bucket.id);
    return acc;
  }, {});
  container.innerHTML = `
    <div>
      <h2 class="section-header">Sort by horizon</h2>
      <p class="hint">Move tasks into the right time window. Editing capture resets these buckets.</p>
    </div>
    <div class="bucket-grid"></div>
  `;
  const grid = container.querySelector('.bucket-grid');
  BUCKETS.forEach(bucket => {
    const column = document.createElement('section');
    column.className = 'bucket-column';
    column.dataset.bucket = bucket.id;
    const items = tasksByBucket[bucket.id] || [];
    column.innerHTML = `
      <div class="bucket-header">
        <div>
          <h3>${escapeHtml(bucket.label)}</h3>
          <p>${escapeHtml(bucket.description)}</p>
        </div>
        <span class="pill">${items.length}</span>
      </div>
      <div class="bucket-list"></div>
    `;
    const list = column.querySelector('.bucket-list');
    items.forEach(task => {
      const card = document.createElement('div');
      card.className = 'task-card';
      card.innerHTML = `
        <div class="task-row">
          <input type="text" value="${escapeAttr(task.name)}" data-task-field="name" />
        </div>
        <div class="task-actions">
          <button type="button" data-move="left">Left</button>
          <button type="button" data-move="right">Right</button>
          <button type="button" class="danger" data-remove>Remove</button>
        </div>
      `;
      card.querySelector('[data-task-field="name"]')?.addEventListener('input', (ev)=>{
        task.name = ev.target.value;
        updateValidationHint();
      });
      card.querySelector('[data-remove]')?.addEventListener('click', ()=>{
        state.tasks = state.tasks.filter(item => item.id !== task.id);
        renderStepContent();
      });
      card.querySelectorAll('[data-move]').forEach(btn => {
        btn.addEventListener('click', (ev)=>{
          const dir = ev.currentTarget.dataset.move;
          const idx = BUCKETS.findIndex(b => b.id === task.horizon);
          if (dir === 'left' && idx > 0) task.horizon = BUCKETS[idx - 1].id;
          if (dir === 'right' && idx < BUCKETS.length - 1) task.horizon = BUCKETS[idx + 1].id;
          renderStepContent();
        });
      });
      list.appendChild(card);
    });
    grid.appendChild(column);
  });
}

function renderRefineStep(container, state){
  const priorities = state.metadata.priorities.length ? state.metadata.priorities : FALLBACK_PRIORITIES;
  container.innerHTML = `
    <div>
      <h2 class="section-header">Refine the details</h2>
      <p class="hint">Optional polish. Leave blank to keep it lightweight.</p>
    </div>
    <div class="refine-list"></div>
  `;
  const list = container.querySelector('.refine-list');
  state.tasks.forEach(task => {
    const card = document.createElement('section');
    card.className = 'refine-card';
    card.innerHTML = `
      <header>
        <div>
          <strong>${escapeHtml(task.name || 'Untitled task')}</strong>
          <div class="pill">${escapeHtml(bucketLabel(task.horizon))}</div>
        </div>
        <button type="button" class="danger" data-remove>Remove</button>
      </header>
      <div class="form-grid two">
        <label>Task name<input type="text" data-field="name" value="${escapeAttr(task.name)}" /></label>
        <label>Priority<select data-field="priority">
          <option value="">Select priority</option>
          ${priorities.map(opt => `<option value="${escapeAttr(opt.value)}"${opt.value === task.priority ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}
        </select></label>
        <label>Due date<input type="date" data-field="due_date" value="${escapeAttr(task.due_date)}" /></label>
        <label>Tags<span class="hint">Comma separated.</span><input type="text" data-field="tags" value="${escapeAttr(task.tags)}" placeholder="client, roadmap" /></label>
      </div>
    `;
    card.querySelector('[data-remove]')?.addEventListener('click', ()=>{
      state.tasks = state.tasks.filter(item => item.id !== task.id);
      renderStepContent();
    });
    card.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('input', (ev)=>{
        task[ev.target.dataset.field] = ev.target.value;
        if (ev.target.dataset.field === 'name'){
          card.querySelector('strong').textContent = ev.target.value || 'Untitled task';
        }
        updateValidationHint();
      });
      el.addEventListener('change', (ev)=>{
        task[ev.target.dataset.field] = ev.target.value;
        updateValidationHint();
      });
    });
    list.appendChild(card);
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

function validateStep(index, state){
  if (!state) return { valid: false, message: '' };
  if (index === 0){
    if (!parseCaptureLines(state.captureText).length) return { valid: false, message: 'Add at least one task line.' };
    return { valid: true };
  }
  if (index === 1){
    if (!state.tasks.length) return { valid: false, message: 'No tasks to sort.' };
    if (state.tasks.some(task => !task.name.trim())) return { valid: false, message: 'Fill in task names before continuing.' };
    return { valid: true };
  }
  if (index === 2){
    if (!state.tasks.length) return { valid: false, message: 'No tasks to create.' };
    if (state.tasks.some(task => !task.name.trim())) return { valid: false, message: 'Each task needs a name.' };
    return { valid: true };
  }
  return { valid: true };
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
  if (overlayRefs.next){
    overlayRefs.next.style.display = wizardState.step === STEP_DEFS.length - 1 ? 'none' : '';
    if (wizardState.step < STEP_DEFS.length - 1){
      overlayRefs.next.textContent = `Next -> ${STEP_DEFS[wizardState.step + 1].name}`;
    }
  }
  if (overlayRefs.create) overlayRefs.create.style.display = wizardState.step === STEP_DEFS.length - 1 ? '' : 'none';
  updateValidationHint();
}

function changeStep(delta){
  if (!wizardState) return;
  const next = wizardState.step + delta;
  if (next < 0 || next >= STEP_DEFS.length) return;
  if (wizardState.step === 0 && delta > 0){
    syncTasksFromCapture(true);
    if (!wizardState.tasks.length){
      setStatus('Add at least one task line first.', 'warn');
      updateValidationHint();
      return;
    }
  }
  wizardState.step = next;
  setStatus('');
  updateNavigation();
}

async function saveTasks(){
  if (!wizardState) return;
  const validation = validateStep(STEP_DEFS.length - 1, wizardState);
  if (!validation.valid){
    setStatus(validation.message || 'Fix validation issues before saving.', 'warn');
    updateValidationHint();
    return;
  }
  wizardState.busy = true;
  updateValidationHint();
  setStatus('Creating tasks...', 'info');
  let created = 0;
  const failures = [];
  try {
    for (const task of wizardState.tasks){
      const name = task.name.trim();
      if (!name) continue;
      const payload = {
        type: 'task',
        name,
        horizon: task.horizon || 'month',
      };
      if (task.priority?.trim()) payload.priority = task.priority.trim();
      if (task.due_date) payload.due_date = task.due_date;
      const tags = parseTags(task.tags);
      if (tags.length) payload.tags = tags;
      try {
        await apiRequest('/api/item', { method: 'POST', body: payload });
        created += 1;
      } catch (err) {
        failures.push(`${name}: ${err.message || 'Failed to create'}`);
      }
    }
    if (failures.length){
      setStatus(`Created ${created} tasks. ${failures.length} failed.`, 'warn');
      console.warn('[Chronos][BrainDumpWizard] Task creation failures', failures);
    } else {
      setStatus(`Created ${created} tasks successfully.`, 'success');
    }
    contextRef?.bus?.emit?.('wizard:brainDump:created', { created, failed: failures.length });
  } finally {
    wizardState.busy = false;
    updateValidationHint();
  }
}

async function loadMetadata(){
  try {
    const pri = await fetchSettings('priority_settings.yml');
    if (pri?.Priority_Settings || pri?.priority_settings){
      wizardState.metadata.priorities = parseOrderedEntries(pri.Priority_Settings || pri.priority_settings);
    }
  } catch (err) {
    console.warn('[Chronos][BrainDumpWizard] Priority settings load failed', err);
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

function closeWizard(){
  contextRef?.bus?.emit?.('wizard:closed', { wizard: optionsRef?.wizard || 'BrainDump' });
  removeOverlay();
}

function mountOverlay(){
  injectStyles();
  removeOverlay();
  overlayEl = document.createElement('div');
  overlayEl.className = 'wizard-overlay';
  overlayEl.setAttribute('data-wizard-overlay', OVERLAY_TAG);
  overlayEl.innerHTML = `
    <div class="brain-dump-shell">
      <div class="wizard-header">
        <div>
          <div class="wizard-eyebrow">Chronos Wizard</div>
          <h1>Brain Dump Wizard</h1>
          <p class="hint">Capture tasks fast, bucket them by horizon, then optionally refine.</p>
        </div>
        <button type="button" class="close" aria-label="Close">x</button>
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
          <button type="button" class="primary" data-action="create">Create Tasks</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  const shell = overlayEl.querySelector('.brain-dump-shell');
  const helpBtn = contextRef?.createHelpButton?.('BrainDump', {
    className: 'wizard-help-btn icon-btn help-btn',
    fallbackLabel: 'Brain Dump Wizard'
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
  overlayRefs.create?.addEventListener('click', saveTasks);
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
  contextRef?.bus?.emit?.('wizard:opened', { wizard: options?.wizard || 'BrainDump' });
  await loadMetadata();
}
