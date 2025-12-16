const OVERLAY_TAG = 'chronos-newyear-resolutions';
let stylesInjected = false;
let overlayEl = null;
let overlayRefs = null;
let wizardState = null;
let keyHandler = null;

const STEP_DEFS = [
  { id: 'welcome', name: 'Welcome', hint: 'Start your journey', render: renderWelcomeStep },
  { id: 'dream', name: 'Dream Big', hint: 'What do you want to achieve?', render: renderDreamBigStep },
  { id: 'create', name: 'Create & Link', hint: 'Turn dreams into items', render: renderCreateLinkStep },
  { id: 'affirm', name: 'Affirmations', hint: 'Speak it into existence', render: renderAffirmationsStep },
  { id: 'review', name: 'Seal Intentions', hint: 'Review and commit', render: renderReviewStep },
];

const ITEM_TYPES = [
  { value: 'goal', label: 'Goal', icon: '🎯' },
  { value: 'habit', label: 'Habit', icon: '🔄' },
  { value: 'commitment', label: 'Commitment', icon: '🤝' },
  { value: 'task', label: 'Task', icon: '✓' },
  { value: 'project', label: 'Project', icon: '📁' },
  { value: 'routine', label: 'Routine', icon: '⏰' },
];

const AFFIRMATION_TEMPLATES = [
  { prefix: 'I achieve', example: 'I achieve my fitness goals' },
  { prefix: 'I am', example: 'I am a marathon runner' },
  { prefix: 'I complete', example: 'I complete my novel' },
  { prefix: 'I weigh', example: 'I weigh 165 pounds' },
  { prefix: 'I build', example: 'I build a successful business' },
  { prefix: 'I create', example: 'I create beautiful art daily' },
  { prefix: 'I master', example: 'I master Spanish fluently' },
];

function apiBase() {
  const origin = window.location.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

async function apiRequest(path, { method = 'GET', body } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const resp = await fetch(apiBase() + path, opts);
  const text = await resp.text();
  let data = text;
  try { data = JSON.parse(text); } catch { }
  if (!resp.ok || (data && data.ok === false)) {
    const err = (data && (data.error || data.stderr)) || text || `HTTP ${resp.status}`;
    throw new Error(err);
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function randomId(prefix) {
  if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID().split('-')[0]}`;
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function injectStyles() {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.dataset.wizardStyles = OVERLAY_TAG;
  style.textContent = `
    .newyear-overlay {
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
    .newyear-shell {
      width: min(1100px, 96vw);
      max-height: 94vh;
      background: linear-gradient(165deg, rgba(15,18,28,0.98), var(--chronos-surface));
      border: 1px solid rgba(122,162,247,0.35);
      border-radius: 24px;
      color: var(--chronos-text);
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: clamp(24px, 4vw, 36px);
      box-shadow: 0 30px 90px rgba(0,0,0,0.7), 0 0 80px var(--chronos-accent-soft);
      position: relative;
      overflow: hidden;
    }
    .newyear-shell::before {
      content: "";
      position: absolute;
      top: -50%;
      right: -20%;
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(122,162,247,0.25), transparent 70%);
      pointer-events: none;
      animation: shimmer 8s ease-in-out infinite;
    }
    @keyframes shimmer {
      0%, 100% { opacity: 0.3; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(1.1); }
    }
    .newyear-header {
      position: relative;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
    }
    .newyear-hero {
      flex: 1;
    }
    .newyear-year {
      font-size: 56px;
      font-weight: 800;
      background: linear-gradient(135deg, var(--chronos-accent), var(--chronos-accent), var(--chronos-accent-strong));
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: 3px;
      margin: 0;
      line-height: 1;
      text-shadow: 0 0 30px rgba(122,162,247,0.45);
    }
    .newyear-subtitle {
      margin: 8px 0 0 0;
      font-size: 18px;
      color: var(--chronos-text-muted);
      letter-spacing: 1.5px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .newyear-close {
      background: none;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 12px;
      color: var(--chronos-text-soft);
      font-size: 24px;
      cursor: pointer;
      padding: 8px 12px;
      transition: all 180ms ease;
    }
    .newyear-close:hover {
      color: #fff;
      border-color: rgba(122,162,247,0.6);
      background: var(--chronos-accent-soft);
    }
    .newyear-stepper {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
    }
    .stepper-step {
      display: flex;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 12px;
      background: rgba(12,15,24,0.8);
      border: 1px solid rgba(255,255,255,0.08);
      align-items: center;
      transition: all 200ms ease;
    }
    .stepper-step .bullet {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      border: 2px solid rgba(255,255,255,0.2);
      color: var(--chronos-text-muted);
      flex-shrink: 0;
      transition: all 200ms ease;
    }
    .stepper-step .step-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .stepper-step .step-name {
      font-weight: 600;
      font-size: 13px;
      color: var(--chronos-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .stepper-step .step-hint {
      font-size: 11px;
      color: var(--chronos-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .stepper-step.active {
      border-color: var(--chronos-accent);
      background: var(--chronos-accent-soft);
      box-shadow: var(--chronos-accent-glow);
    }
    .stepper-step.active .bullet {
      border-color: var(--chronos-accent);
      background: var(--chronos-accent-soft);
      color: #fff;
    }
    .stepper-step.active .step-name { color: var(--chronos-accent); }
    .stepper-step.done {
      border-color: var(--chronos-success);
      background: var(--chronos-success-soft);
    }
    .stepper-step.done .bullet {
      border-color: var(--chronos-success);
      background: var(--chronos-success-soft);
      color: var(--chronos-success);
    }
    .newyear-content {
      position: relative;
      z-index: 1;
      flex: 1;
      background: rgba(8,11,20,0.85);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 18px;
      padding: 24px;
      display: flex;
      min-height: 0;
    }
    .newyear-body {
      flex: 1;
      overflow: auto;
      padding-right: 8px;
    }
    .newyear-body::-webkit-scrollbar {
      width: 8px;
    }
    .newyear-body::-webkit-scrollbar-thumb {
      background: var(--chronos-accent-soft);
      border-radius: 999px;
    }
    .newyear-body::-webkit-scrollbar-track {
      background: rgba(255,255,255,0.03);
      border-radius: 999px;
    }
    .newyear-footer {
      position: relative;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
    }
    .newyear-status {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .newyear-status [data-status] {
      min-height: 22px;
      font-size: 14px;
      color: var(--chronos-text-muted);
    }
    .newyear-status [data-status][data-tone="success"] { color: var(--chronos-success); }
    .newyear-status [data-status][data-tone="error"] { color: var(--chronos-danger); }
    .newyear-status [data-validation] {
      font-size: 13px;
      color: var(--chronos-warning);
    }
    .newyear-actions {
      display: flex;
      gap: 12px;
    }
    .newyear-actions button {
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.15);
      padding: 11px 22px;
      font-size: 15px;
      font-weight: 600;
      background: rgba(12,15,24,0.9);
      color: inherit;
      cursor: pointer;
      transition: all 180ms ease;
    }
    .newyear-actions button:hover:not(:disabled) {
      border-color: rgba(255,255,255,0.3);
      transform: translateY(-1px);
    }
    .newyear-actions button.primary {
      background: var(--chronos-accent-gradient);
      border-color: rgba(122,162,247,0.6);
      color: #fff;
      box-shadow: var(--chronos-accent-glow);
    }
    .newyear-actions button.primary:hover:not(:disabled) {
      box-shadow: 0 14px 32px rgba(74,98,255,0.45);
    }
    .newyear-actions button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    .form-section {
      margin-bottom: 28px;
    }
    .form-section h2 {
      margin: 0 0 12px 0;
      font-size: 22px;
      font-weight: 700;
      color: var(--chronos-accent);
      font-family: Georgia, serif;
    }
    .form-section p {
      margin: 0 0 16px 0;
      color: var(--chronos-text-muted);
      line-height: 1.6;
    }
    .form-grid {
      display: grid;
      gap: 16px;
    }
    .form-grid.two {
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }
    .form-grid label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 14px;
      color: var(--chronos-text-muted);
      font-weight: 500;
    }
    .form-grid label .hint {
      font-size: 12px;
      color: var(--chronos-text-muted);
      font-weight: 400;
    }
    input[type="text"], textarea, select {
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(8,12,22,0.9);
      color: var(--chronos-text);
      padding: 10px 14px;
      font-size: 15px;
      font-family: inherit;
    }
    textarea {
      min-height: 120px;
      resize: vertical;
      line-height: 1.5;
    }
    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: rgba(122,162,247,0.6);
      box-shadow: 0 0 0 3px var(--chronos-accent-soft);
    }
    .resolution-item {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 16px;
      background: rgba(10,14,24,0.9);
      margin-bottom: 14px;
    }
    .resolution-item-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .resolution-item-text {
      font-size: 17px;
      font-weight: 600;
      color: var(--chronos-text);
      font-style: italic;
      flex: 1;
    }
    .resolution-item-remove {
      background: none;
      border: none;
      color: var(--chronos-text-muted);
      cursor: pointer;
      font-size: 20px;
      padding: 4px 8px;
      border-radius: 6px;
      transition: all 150ms ease;
    }
    .resolution-item-remove:hover {
      color: var(--chronos-danger);
      background: var(--chronos-danger-soft);
    }
    .resolution-item-controls {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 10px;
      align-items: start;
    }
    .action-toggle {
      display: flex;
      gap: 4px;
      background: rgba(255,255,255,0.03);
      padding: 3px;
      border-radius: 8px;
    }
    .action-toggle button {
      flex: 1;
      border: none;
      background: transparent;
      color: var(--chronos-text-muted);
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 150ms ease;
    }
    .action-toggle button.active {
      background: var(--chronos-accent-soft);
      color: var(--chronos-accent);
    }
    .item-type-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--chronos-accent-soft);
      color: var(--chronos-accent);
      font-size: 12px;
      font-weight: 600;
      border: 1px solid rgba(122,162,247,0.4);
    }
    .affirmation-card {
      border: 2px solid rgba(122,162,247,0.35);
      border-radius: 16px;
      padding: 20px;
      background: linear-gradient(135deg, rgba(122,162,247,0.12), rgba(42,85,224,0.12));
      margin-bottom: 16px;
    }
    .affirmation-text {
      font-family: Georgia, serif;
      font-size: 24px;
      font-weight: 700;
      color: var(--chronos-accent);
      margin-bottom: 8px;
      font-style: italic;
    }
    .affirmation-raw {
      font-size: 14px;
      color: var(--chronos-text-muted);
      font-style: italic;
      margin-bottom: 12px;
    }
    .template-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 8px 0;
    }
    .template-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      color: var(--chronos-text-muted);
      font-size: 13px;
      cursor: pointer;
      transition: all 150ms ease;
    }
    .template-pill:hover {
      background: var(--chronos-accent-soft);
      border-color: rgba(122,162,247,0.45);
      color: var(--chronos-accent);
    }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function createInitialState() {
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1; // Default to next year for resolutions
  return {
    step: 0,
    busy: false,
    year: nextYear,
    dreamResponses: {
      achieve: '',
      habits: '',
      learn: '',
      letgo: '',
    },
    items: [],
  };
}

function parseResponses(responses) {
  const items = [];

  // Map each prompt to its default item type and properties
  const promptDefaults = {
    achieve: { itemType: 'goal', polarity: null },
    habits: { itemType: 'habit', polarity: 'good' },
    learn: { itemType: 'goal', polarity: null },
    letgo: { itemType: 'habit', polarity: 'bad' },
  };

  Object.entries(responses).forEach(([promptKey, text]) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const defaults = promptDefaults[promptKey] || { itemType: 'goal', polarity: null };

    lines.forEach(line => {
      if (line.length > 2) {
        items.push({
          id: randomId('res'),
          rawText: line,
          affirmation: '',
          itemType: defaults.itemType,
          polarity: defaults.polarity,
          action: 'create',
          newItemName: line.slice(0, 50),
          existingItemName: null,
          templateName: null,
          promptSource: promptKey,
        });
      }
    });
  });
  return items;
}

function removeOverlay() {
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

function setStatus(message = '', tone = 'info') {
  if (!overlayRefs?.statusEl) return;
  overlayRefs.statusEl.textContent = message;
  overlayRefs.statusEl.dataset.tone = tone;
}

function setValidation(message = '') {
  if (!overlayRefs?.validationEl) return;
  overlayRefs.validationEl.textContent = message;
}

function refreshStepper() {
  if (!overlayRefs?.stepperContainer || !wizardState) return;
  const active = wizardState.step;
  overlayRefs.stepperContainer.querySelectorAll('.stepper-step').forEach((el, idx) => {
    el.classList.toggle('active', idx === active);
    el.classList.toggle('done', idx < active);
  });
}

function updateNavigation() {
  if (!overlayRefs || !wizardState) return;
  const isFirst = wizardState.step === 0;
  const isLast = wizardState.step === STEP_DEFS.length - 1;
  overlayRefs.prevBtn.style.display = isFirst ? 'none' : 'inline-block';
  overlayRefs.nextBtn.textContent = isLast ? 'Create Resolutions' : 'Next';
  overlayRefs.nextBtn.disabled = wizardState.busy;
  overlayRefs.cancelBtn.disabled = wizardState.busy;
}

function validateStep(index, state) {
  if (index === 1) {
    const hasAny = Object.values(state.dreamResponses).some(v => v.trim().length > 0);
    if (!hasAny) return { valid: false, message: 'Share at least one dream or intention.' };
  }
  if (index === 2) {
    if (!state.items.length) return { valid: false, message: 'Create at least one resolution item.' };
  }
  if (index === 3) {
    const missingAffirmations = state.items.filter(item => !item.affirmation.trim());
    if (missingAffirmations.length) return { valid: false, message: `Add affirmations for ${missingAffirmations.length} item(s).` };
  }
  return { valid: true };
}

function renderStepContent() {
  if (!overlayRefs?.body || !wizardState) return;
  const def = STEP_DEFS[wizardState.step];
  if (!def) return;
  overlayRefs.body.innerHTML = '';
  def.render(overlayRefs.body, wizardState);
  const validation = validateStep(wizardState.step, wizardState);
  setValidation(validation.valid ? '' : validation.message);
}

async function changeStep(delta) {
  if (!wizardState) return;
  const newStep = wizardState.step + delta;
  if (newStep < 0 || newStep >= STEP_DEFS.length) return;

  // Parse responses before moving from Dream step
  if (wizardState.step === 1 && delta > 0) {
    wizardState.items = parseResponses(wizardState.dreamResponses);
  }

  wizardState.step = newStep;
  refreshStepper();
  renderStepContent();
  updateNavigation();
}

async function finishWizard() {
  if (!wizardState) return;
  const validation = validateStep(wizardState.step, wizardState);
  if (!validation.valid) {
    setStatus(validation.message, 'error');
    return;
  }

  wizardState.busy = true;
  updateNavigation();
  setStatus('Creating your resolutions...', 'info');

  try {
    const currentDate = new Date().toISOString().split('T')[0];

    for (const item of wizardState.items) {
      const resolutionProperty = {
        raw_text: item.rawText,
        affirmation: item.affirmation,
        year: wizardState.year,
        created_date: currentDate,
      };

      const itemPayload = {
        type: item.itemType,
        name: item.action === 'create' ? item.newItemName : item.existingItemName,
        resolution: resolutionProperty,
      };

      // Add polarity for habits
      if (item.itemType === 'habit' && item.polarity) {
        itemPayload.polarity = item.polarity;
      }

      if (item.action === 'create' || (item.action === 'link' && item.existingItemName)) {
        // Create new item or update existing item with resolution property
        await apiRequest('/api/item', {
          method: 'POST',
          body: itemPayload,
        });
      }
    }

    setStatus(`Created ${wizardState.items.length} resolution(s) for ${wizardState.year}!`, 'success');
    await new Promise(resolve => setTimeout(resolve, 1500));
    closeWizard();
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
    wizardState.busy = false;
    updateNavigation();
  }
}

function closeWizard() {
  removeOverlay();
}

// Step renderers
function renderWelcomeStep(container, state) {
  container.innerHTML = `
    <div class="form-section">
      <h2>Welcome to Your ${state.year} Resolutions</h2>
      <p>This is your moment to dream big and set intentions for the year ahead. Through this guided process, you'll:</p>
      <ul style="color: var(--chronos-text-muted); line-height: 1.8; margin: 16px 0;">
        <li>🌟 Clarify what you want to achieve this year</li>
        <li>✨ Transform dreams into actionable goals, habits, and commitments</li>
        <li>💫 Craft powerful affirmations in the present tense</li>
        <li>🎯 Create a system to track your progress throughout the year</li>
      </ul>
      <p style="margin-top: 24px; padding: 16px; background: var(--chronos-accent-soft); border-left: 3px solid var(--chronos-accent-strong); border-radius: 8px;">
        <strong style="color: var(--chronos-accent);">Remember:</strong> This isn't about perfection—it's about intention. Be honest, be ambitious, and most importantly, be yourself.
      </p>
    </div>
  `;
}

function renderDreamBigStep(container, state) {
  container.innerHTML = `
    <div class="form-section">
      <h2>What Do You Want to Achieve?</h2>
      <p>Write freely—one dream per line. These will become your resolutions.</p>
    </div>
    <div class="form-grid">
      <label>
        <span>What 10 things do you want to achieve this year?</span>
        <span class="hint">Goals, milestones, accomplishments—dream big!</span>
        <textarea data-dream-field="achieve" placeholder="Run a marathon&#10;Publish my novel&#10;Launch my business&#10;...">${escapeHtml(state.dreamResponses.achieve)}</textarea>
      </label>
      <label>
        <span>What habits do you want to build?</span>
        <span class="hint">Daily or weekly practices that will transform you</span>
        <textarea data-dream-field="habits" placeholder="Meditate daily&#10;Exercise 4x per week&#10;Read before bed&#10;...">${escapeHtml(state.dreamResponses.habits)}</textarea>
      </label>
      <label>
        <span>What skills do you want to learn?</span>
        <span class="hint">Languages, instruments, crafts, technologies</span>
        <textarea data-dream-field="learn" placeholder="Learn Spanish fluently&#10;Master piano&#10;Learn to code&#10;...">${escapeHtml(state.dreamResponses.learn)}</textarea>
      </label>
      <label>
        <span>What do you want to let go of?</span>
        <span class="hint">Habits, beliefs, or patterns to release</span>
        <textarea data-dream-field="letgo" placeholder="Stop procrastinating&#10;Let go of perfectionism&#10;Reduce social media time&#10;...">${escapeHtml(state.dreamResponses.letgo)}</textarea>
      </label>
    </div>
  `;

  container.querySelectorAll('[data-dream-field]').forEach(el => {
    el.addEventListener('input', (ev) => {
      state.dreamResponses[ev.target.dataset.dreamField] = ev.target.value;
    });
  });
}

function renderCreateLinkStep(container, state) {
  container.innerHTML = `
    <div class="form-section">
      <h2>Turn Dreams Into Action</h2>
      <p>For each dream, decide: create a new item or link to an existing one.</p>
    </div>
    <div id="items-list"></div>
  `;

  const listEl = container.querySelector('#items-list');

  state.items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'resolution-item';
    card.dataset.itemId = item.id;

    const typeIcon = ITEM_TYPES.find(t => t.value === item.itemType)?.icon || '📌';

    card.innerHTML = `
      <div class="resolution-item-header">
        <div class="resolution-item-text">"${escapeHtml(item.rawText)}"</div>
        <button class="resolution-item-remove" data-remove-item="${idx}">×</button>
      </div>
      <div class="resolution-item-controls">
        <div class="action-toggle">
          <button data-action-btn="create" class="${item.action === 'create' ? 'active' : ''}">Create</button>
          <button data-action-btn="link" class="${item.action === 'link' ? 'active' : ''}">Link</button>
        </div>
        <div class="item-config" data-item-config></div>
      </div>
    `;

    listEl.appendChild(card);

    // Remove button
    card.querySelector('[data-remove-item]').addEventListener('click', () => {
      state.items.splice(idx, 1);
      renderStepContent();
    });

    // Action toggle
    card.querySelectorAll('[data-action-btn]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.actionBtn;
        item.action = action;
        card.querySelectorAll('[data-action-btn]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderItemConfig(card.querySelector('[data-item-config]'), item);
      });
    });

    renderItemConfig(card.querySelector('[data-item-config]'), item);
  });
}

function renderItemConfig(container, item) {
  if (item.action === 'create') {
    const typeOptions = ITEM_TYPES.map(t =>
      `<option value="${t.value}" ${t.value === item.itemType ? 'selected' : ''}>${t.icon} ${t.label}</option>`
    ).join('');

    let polarityHtml = '';
    if (item.itemType === 'habit') {
      polarityHtml = `
        <label>
          <span>Polarity</span>
          <select data-item-polarity>
            <option value="good" ${item.polarity === 'good' ? 'selected' : ''}>✅ Good (Build this)</option>
            <option value="bad" ${item.polarity === 'bad' ? 'selected' : ''}>❌ Bad (Avoid this)</option>
          </select>
        </label>
      `;
    }

    container.innerHTML = `
      <div class="form-grid two">
        <label>
          <span>Item Type</span>
          <select data-item-type>
            ${typeOptions}
          </select>
        </label>
        <label>
          <span>Item Name</span>
          <input type="text" data-item-name value="${escapeAttr(item.newItemName)}" placeholder="Enter name" />
        </label>
        ${polarityHtml}
      </div>
    `;

    const typeSelect = container.querySelector('[data-item-type]');
    typeSelect.addEventListener('change', (ev) => {
      item.itemType = ev.target.value;
      // Set default polarity when switching to habit
      if (ev.target.value === 'habit' && !item.polarity) {
        item.polarity = item.promptSource === 'letgo' ? 'bad' : 'good';
      }
      renderItemConfig(container, item); // Re-render to show/hide polarity
    });

    container.querySelector('[data-item-name]').addEventListener('input', (ev) => {
      item.newItemName = ev.target.value;
    });

    const polaritySelect = container.querySelector('[data-item-polarity]');
    if (polaritySelect) {
      polaritySelect.addEventListener('change', (ev) => {
        item.polarity = ev.target.value;
      });
    }
  } else {
    container.innerHTML = `
      <div class="form-grid">
        <label>
          <span>Link to existing item</span>
          <input type="text" data-existing-name value="${escapeAttr(item.existingItemName || '')}" placeholder="Type item name" />
        </label>
      </div>
    `;

    container.querySelector('[data-existing-name]').addEventListener('input', (ev) => {
      item.existingItemName = ev.target.value;
    });
  }
}

function renderAffirmationsStep(container, state) {
  container.innerHTML = `
    <div class="form-section">
      <h2>Speak It Into Existence</h2>
      <p>Write affirmations in the <strong>present tense</strong>, as if you've already achieved them. These will remind you of your intentions throughout the year.</p>
      <div class="template-list">
        ${AFFIRMATION_TEMPLATES.map(t => `
          <div class="template-pill" title="${escapeAttr(t.example)}">
            ${escapeHtml(t.prefix)}...
          </div>
        `).join('')}
      </div>
    </div>
    <div id="affirmations-list"></div>
  `;

  const listEl = container.querySelector('var(--chronos-accent-soft)irmations-list');

  state.items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'affirmation-card';

    const typeIcon = ITEM_TYPES.find(t => t.value === item.itemType)?.icon || '📌';
    const typeLabel = ITEM_TYPES.find(t => t.value === item.itemType)?.label || item.itemType;

    card.innerHTML = `
      <div style="margin-bottom: 8px;">
        <span class="item-type-badge">${typeIcon} ${typeLabel}</span>
      </div>
      <div class="affirmation-raw">"${escapeHtml(item.rawText)}"</div>
      <label style="display: flex; flex-direction: column; gap: 6px;">
        <span style="font-size: 13px; color: var(--chronos-text-muted); font-weight: 600;">Present-Tense Affirmation</span>
        <input 
          type="text" 
          data-affirmation="${item.id}" 
          value="${escapeAttr(item.affirmation)}" 
          placeholder="I achieve... / I am... / I complete..."
          style="font-size: 18px; font-weight: 600; color: var(--chronos-accent);"
        />
      </label>
    `;

    listEl.appendChild(card);

    card.querySelector('[data-affirmation]').addEventListener('input', (ev) => {
      item.affirmation = ev.target.value;
    });
  });
}

function renderReviewStep(container, state) {
  const createCount = state.items.filter(i => i.action === 'create').length;
  const linkCount = state.items.filter(i => i.action === 'link').length;

  container.innerHTML = `
    <div class="form-section">
      <h2>Review Your ${state.year} Resolutions</h2>
      <p>You're about to create <strong>${createCount} new item(s)</strong>${linkCount ? ` and link <strong>${linkCount} existing item(s)</strong>` : ''} with resolution properties.</p>
    </div>
  `;

  state.items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'affirmation-card';

    const typeIcon = ITEM_TYPES.find(t => t.value === item.itemType)?.icon || '📌';
    const typeLabel = ITEM_TYPES.find(t => t.value === item.itemType)?.label || item.itemType;
    const actionLabel = item.action === 'create' ? `Create new ${typeLabel}` : `Link to existing item`;
    const itemNameLabel = item.action === 'create' ? item.newItemName : item.existingItemName;

    card.innerHTML = `
      <div class="affirmation-text">${escapeHtml(item.affirmation)}</div>
      <div class="affirmation-raw">"${escapeHtml(item.rawText)}"</div>
      <div style="margin-top: 12px; font-size: 13px; color: var(--chronos-text-muted);">
        <span class="item-type-badge">${typeIcon} ${actionLabel}: ${escapeHtml(itemNameLabel)}</span>
      </div>
    `;

    container.appendChild(card);
  });
}

function mountOverlay() {
  injectStyles();

  wizardState = createInitialState();

  overlayEl = document.createElement('div');
  overlayEl.className = 'newyear-overlay';

  overlayEl.innerHTML = `
    <div class="newyear-shell">
      <div class="newyear-header">
        <div class="newyear-hero">
          <h1 class="newyear-year">${wizardState.year}</h1>
          <p class="newyear-subtitle">New Year's Resolutions</p>
        </div>
        <button class="newyear-close" data-close>×</button>
      </div>
      <div class="newyear-stepper" data-stepper></div>
      <div class="newyear-content">
        <div class="newyear-body" data-body></div>
      </div>
      <div class="newyear-footer">
        <div class="newyear-status">
          <div data-status></div>
          <div data-validation></div>
        </div>
        <div class="newyear-actions">
          <button data-cancel>Cancel</button>
          <button data-prev>Previous</button>
          <button data-next class="primary">Next</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlayEl);

  // Build stepper
  const stepperContainer = overlayEl.querySelector('[data-stepper]');
  STEP_DEFS.forEach((def, idx) => {
    const step = document.createElement('div');
    step.className = 'stepper-step';
    step.innerHTML = `
      <div class="bullet">${idx + 1}</div>
      <div class="step-info">
        <div class="step-name">${def.name}</div>
        <div class="step-hint">${def.hint}</div>
      </div>
    `;
    stepperContainer.appendChild(step);
  });

  overlayRefs = {
    stepperContainer,
    body: overlayEl.querySelector('[data-body]'),
    statusEl: overlayEl.querySelector('[data-status]'),
    validationEl: overlayEl.querySelector('[data-validation]'),
    closeBtn: overlayEl.querySelector('[data-close]'),
    cancelBtn: overlayEl.querySelector('[data-cancel]'),
    prevBtn: overlayEl.querySelector('[data-prev]'),
    nextBtn: overlayEl.querySelector('[data-next]'),
  };

  overlayRefs.closeBtn?.addEventListener('click', closeWizard);
  overlayRefs.cancelBtn.addEventListener('click', closeWizard);
  overlayRefs.prevBtn.addEventListener('click', () => changeStep(-1));
  overlayRefs.nextBtn.addEventListener('click', async () => {
    if (wizardState.step === STEP_DEFS.length - 1) {
      await finishWizard();
    } else {
      const validation = validateStep(wizardState.step, wizardState);
      if (validation.valid) {
        await changeStep(1);
      } else {
        setStatus(validation.message, 'error');
      }
    }
  });

  keyHandler = (ev) => {
    if (ev.key === 'Escape') closeWizard();
  };
  window.addEventListener('keydown', keyHandler);

  refreshStepper();
  renderStepContent();
  updateNavigation();
}

export async function launch(context, options = {}) {
  mountOverlay();
}
