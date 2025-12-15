const OVERLAY_TAG = 'chronos-future-self-dialogue';
const STYLE_ID = 'chronos-future-self-dialogue-style';
const SOURCE_LINK = 'https://vaknin-talks.com/transcripts/Map_Your_Happiness_Past_and_Future_Selves_EXCERPT/';

const STEP_DEFS = [
  { id: 'intro', name: 'Orientation', hint: 'Sam Vaknin technique', render: renderIntro },
  { id: 'futureToPast', name: 'Future → Past', hint: 'Speak as your future self', render: renderFutureToPast },
  { id: 'letter', name: 'Letter to Future Self', hint: 'Write the letter', render: renderLetter },
  { id: 'reactions', name: 'Perspectives', hint: 'Past / Present / Future reactions', render: renderReactions },
  { id: 'review', name: 'Review & Save', hint: 'Journal entry', render: renderReview },
];

let overlayEl = null;
let overlayRefs = null;
let wizardState = null;
let keyHandler = null;

function initialState() {
  return {
    step: 0,
    futureToPast: '',
    letter: '',
    reactions: {
      past: '',
      present: '',
      future: '',
    },
    tag: 'future_self_dialogue',
    title: '',
    saving: false,
  };
}

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
    .fsd-overlay { position: fixed; inset: 0; z-index: 1200; background: var(--chronos-overlay-gradient); backdrop-filter: var(--chronos-overlay-blur); display: flex; align-items: center; justify-content: center; padding: clamp(12px,3vw,28px); }
    .fsd-shell { width: min(1080px, 96vw); max-height: 94vh; background: linear-gradient(135deg, rgba(10,12,26,0.95), rgba(9,13,30,0.95)); border: 1px solid rgba(122,162,247,0.28); border-radius: 22px; box-shadow: 0 30px 90px rgba(0,0,0,0.7); display: flex; flex-direction: column; gap: 14px; padding: clamp(18px,3vw,26px); color: var(--chronos-text); overflow: hidden; position: relative; }
    .fsd-shell::after { content: ""; position: absolute; inset: auto -40% -60% auto; width: 420px; height: 420px; background: radial-gradient(circle, rgba(122,162,247,0.14), transparent 65%); pointer-events: none; }
    .fsd-header { display: flex; flex-direction: column; gap: 6px; }
    .fsd-title { font-size: clamp(22px, 3vw, 28px); font-weight: 800; letter-spacing: 0.2px; display: flex; gap: 10px; align-items: center; }
    .fsd-sub { color: var(--chronos-text-muted); font-size: 14px; line-height: 1.5; max-width: 860px; }
    .fsd-body { flex: 1 1 auto; overflow: auto; padding-right: 4px; }
    .fsd-footer { display: flex; gap: 10px; align-items: center; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px; }
    .fsd-steps { display: flex; gap: 6px; flex-wrap: wrap; }
    .fsd-step { padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.03); color: var(--chronos-text-muted); font-size: 12px; display: inline-flex; gap: 8px; align-items: center; }
    .fsd-step.active { color: var(--chronos-text); border-color: rgba(122,162,247,0.4); background: rgba(122,162,247,0.12); }
    .fsd-step strong { font-weight: 700; color: var(--chronos-accent); }
    .fsd-actions { display: flex; gap: 10px; }
    .fsd-btn { border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: var(--chronos-text); border-radius: 10px; padding: 10px 14px; font-weight: 600; cursor: pointer; transition: all 160ms ease; }
    .fsd-btn.primary { background: linear-gradient(135deg, var(--chronos-accent), #7aa2f7); color: #0b1020; border-color: rgba(122,162,247,0.7); }
    .fsd-btn:hover { transform: translateY(-1px); border-color: rgba(255,255,255,0.22); }
    .fsd-card { border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .fsd-grid { display: grid; gap: 12px; }
    .fsd-grid.two { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .fsd-label { font-size: 13px; color: var(--chronos-text-muted); margin-bottom: 4px; display: block; }
    .fsd-input, .fsd-textarea { width: 100%; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(12,14,28,0.8); color: var(--chronos-text); padding: 10px 12px; font-size: 14px; }
    .fsd-textarea { min-height: 120px; resize: vertical; }
    .fsd-status { font-size: 13px; color: var(--chronos-text-muted); min-height: 18px; }
    .fsd-status[data-tone="error"] { color: var(--chronos-danger); }
    .fsd-pill { background: rgba(255,255,255,0.06); border-radius: 999px; padding: 6px 10px; font-size: 12px; border: 1px solid rgba(255,255,255,0.08); }
    .fsd-yaml { background: #0b0f1d; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px; font-family: "SFMono-Regular", Consolas, Menlo, monospace; color: #cbd5f5; font-size: 12px; white-space: pre; overflow: auto; max-height: 400px; }
    .fsd-link { color: var(--chronos-accent); text-decoration: none; font-weight: 600; }
  `;
  document.head.appendChild(style);
}

function mountOverlay(context) {
  injectStyles();
  if (overlayEl) overlayEl.remove();
  overlayEl = document.createElement('div');
  overlayEl.className = 'fsd-overlay';
  overlayEl.innerHTML = `
    <div class="fsd-shell">
      <div class="fsd-header">
        <div class="fsd-title">Future Self Dialogue <span class="fsd-pill">Sam Vaknin</span></div>
        <div class="fsd-sub">Speak as your future actualized self to your past self, then write a letter to your future self and read it through past/present/future lenses. Source: <a class="fsd-link" href="${SOURCE_LINK}" target="_blank" rel="noopener">Vaknin Talks</a>.</div>
        <div class="fsd-steps" data-stepper></div>
      </div>
      <div class="fsd-body" data-body></div>
      <div class="fsd-footer">
        <div class="fsd-status" data-status></div>
        <div class="fsd-actions">
          <button class="fsd-btn" data-cancel>Cancel</button>
          <button class="fsd-btn" data-prev>Back</button>
          <button class="fsd-btn primary" data-next>Next</button>
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

  keyHandler = (ev) => { if (ev.key === 'Escape') closeWizard(); };
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
    el.className = 'fsd-step' + (idx === wizardState.step ? ' active' : '');
    el.innerHTML = `<strong>${idx + 1}</strong> ${step.name} <span class="fsd-pill">${step.hint}</span>`;
    overlayRefs.stepper.appendChild(el);
  });
}

function updateNav() {
  const prevDisabled = wizardState.step === 0;
  const lastStep = wizardState.step === STEP_DEFS.length - 1;
  overlayRefs.prevBtn.disabled = prevDisabled;
  overlayRefs.nextBtn.textContent = lastStep ? 'Save Journal' : 'Next';
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
  const validation = validateStep(wizardState.step);
  if (!validation.valid) {
    setStatus(validation.message, 'error');
    return;
  }
  if (wizardState.step === STEP_DEFS.length - 1) {
    saveJournal();
  } else {
    changeStep(1);
  }
}

function validateStep(step) {
  const id = STEP_DEFS[step]?.id;
  if (id === 'futureToPast' && !wizardState.futureToPast.trim()) return { valid: false, message: 'Add a future-to-past message.' };
  if (id === 'letter' && !wizardState.letter.trim()) return { valid: false, message: 'Write the letter to your future self.' };
  if (id === 'reactions') {
    const { past, present, future } = wizardState.reactions;
    if (![past, present, future].some(v => v.trim())) return { valid: false, message: 'Capture at least one reaction (past/present/future).' };
  }
  return { valid: true, message: '' };
}

function setStatus(message, tone = 'muted') {
  if (!overlayRefs?.statusEl) return;
  overlayRefs.statusEl.textContent = message || '';
  overlayRefs.statusEl.dataset.tone = tone;
}

function renderStepContent() {
  if (!overlayRefs?.body) return;
  const step = STEP_DEFS[wizardState.step];
  if (!step) return;
  step.render(overlayRefs.body, wizardState);
}

function renderIntro(container) {
  container.innerHTML = `
    <div class="fsd-card">
      <h3>Why this works</h3>
      <p class="fsd-sub">You speak as your future actualized self to your past self, then write a letter to your future self and read it through past/present/future lenses. The emotional contrast surfaces gaps, tensions, and missed lessons. Source: <a class="fsd-link" href="${SOURCE_LINK}" target="_blank" rel="noopener">Vaknin Talks</a>.</p>
      <div class="fsd-grid two">
        <div><strong>Steps</strong><br/>Future → Past dialogue · Letter to Future · Reactions (past/present/future) · Save as journal</div>
        <div><strong>Output</strong><br/>Journal entry under <code>User/Journal/</code> with prompts, reactions, tags.</div>
      </div>
      <button class="fsd-btn primary" data-start>Begin</button>
    </div>
  `;
  container.querySelector('[data-start]')?.addEventListener('click', () => {
    wizardState.step = 1;
    refreshStepper();
    renderStepContent();
    updateNav();
  });
}

function renderFutureToPast(container) {
  container.innerHTML = `
    <div class="fsd-card">
      <h3>Speak as your future self to your past self</h3>
      <p class="fsd-sub">Imagine your future self has already achieved your core outcomes. Speak directly to your past self: warnings, reframes, gratitude.</p>
      <label class="fsd-label">Message</label>
      <textarea class="fsd-textarea" data-field="futureToPast" placeholder="What would your future self say to your past self?">${escapeHtml(wizardState.futureToPast)}</textarea>
    </div>
  `;
  container.querySelector('[data-field="futureToPast"]')?.addEventListener('input', (ev) => {
    wizardState.futureToPast = ev.target.value;
  });
}

function renderLetter(container) {
  container.innerHTML = `
    <div class="fsd-card">
      <h3>Write to your future self</h3>
      <p class="fsd-sub">From your present self, write a letter to your future successful/actualized self.</p>
      <label class="fsd-label">Letter</label>
      <textarea class="fsd-textarea" data-field="letter" placeholder="Start with: Dear Future Me, ...">${escapeHtml(wizardState.letter)}</textarea>
      <label class="fsd-label">Optional title</label>
      <input class="fsd-input" data-field="title" value="${escapeAttr(wizardState.title)}" placeholder="Future Self Dialogue - YYYY-MM-DD" />
    </div>
  `;
  container.querySelector('[data-field="letter"]')?.addEventListener('input', (ev) => { wizardState.letter = ev.target.value; });
  container.querySelector('[data-field="title"]')?.addEventListener('input', (ev) => { wizardState.title = ev.target.value; });
}

function renderReactions(container) {
  const { past, present, future } = wizardState.reactions;
  container.innerHTML = `
    <div class="fsd-card">
      <h3>Read the letter through three selves</h3>
      <p class="fsd-sub">How does the letter land when you read it as each self? Capture tensions or insights.</p>
      <div class="fsd-grid two">
        <label class="fsd-label">As Past Self<textarea class="fsd-textarea" data-field="react-past" placeholder="What stands out?">${escapeHtml(past)}</textarea></label>
        <label class="fsd-label">As Present Self<textarea class="fsd-textarea" data-field="react-present" placeholder="What feels true or off now?">${escapeHtml(present)}</textarea></label>
      </div>
      <label class="fsd-label">As Future Self</label>
      <textarea class="fsd-textarea" data-field="react-future" placeholder="What resonates or conflicts when you read as your future self?">${escapeHtml(future)}</textarea>
    </div>
  `;
  container.querySelector('[data-field="react-past"]')?.addEventListener('input', ev => wizardState.reactions.past = ev.target.value);
  container.querySelector('[data-field="react-present"]')?.addEventListener('input', ev => wizardState.reactions.present = ev.target.value);
  container.querySelector('[data-field="react-future"]')?.addEventListener('input', ev => wizardState.reactions.future = ev.target.value);
}

function renderReview(container) {
  const yaml = buildJournalYaml();
  container.innerHTML = `
    <div class="fsd-card">
      <h3>Review & Save</h3>
      <p class="fsd-sub">This will write a journal entry under <code>User/Journal/</code> with your dialogue, letter, and reactions. Source: <a class="fsd-link" href="${SOURCE_LINK}" target="_blank" rel="noopener">Vaknin Talks</a>.</p>
      <div class="fsd-yaml">${escapeHtml(yaml)}</div>
      <button class="fsd-btn" data-copy>Copy to clipboard</button>
    </div>
  `;
  container.querySelector('[data-copy]')?.addEventListener('click', () => {
    try {
      navigator.clipboard.writeText(buildJournalYaml());
      setStatus('Copied YAML to clipboard', 'success');
    } catch {
      setStatus('Copy failed (clipboard blocked).', 'error');
    }
  });
}

function buildJournalYaml() {
  const today = new Date().toISOString().slice(0, 10);
  const title = wizardState.title?.trim() || `Future Self Dialogue - ${today}`;
  const payload = {
    title,
    type: 'journal_entry',
    source: 'Sam Vaknin - Future Self Dialogue',
    link: SOURCE_LINK,
    captured_at: new Date().toISOString(),
    prompts: {
      future_to_past: wizardState.futureToPast || '',
      letter_to_future: wizardState.letter || '',
      reactions: {
        past: wizardState.reactions.past || '',
        present: wizardState.reactions.present || '',
        future: wizardState.reactions.future || '',
      },
    },
    tags: ['future_self', 'vaknin', 'reflection'],
  };
  return toYaml(payload);
}

function toYaml(data, indent = 0) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(data)) {
    if (!data.length) return pad + '[]';
    return data.map(item => {
      if (typeof item === 'object' && item !== null) {
        return `${pad}-\n${toYaml(item, indent + 1)}`;
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
        return `${pad}${k}:\n${toYaml(v, indent + 1)}`;
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
  if (/^[A-Za-z0-9_\\-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

async function saveJournal() {
  if (wizardState.saving) return;
  wizardState.saving = true;
  setStatus('Saving journal entry...', 'muted');
  try {
    const today = new Date().toISOString().slice(0, 10);
    const fname = `${today}_future_self_dialogue.yml`;
    const body = buildJournalYaml();
    const resp = await fetch(`${apiBase()}/api/settings?file=../Journal/${encodeURIComponent(fname)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
    if (!resp.ok) throw new Error(`Save failed (HTTP ${resp.status})`);
    setStatus(`Saved journal entry ${fname}`, 'success');
    try { overlayRefs?.context?.bus?.emit?.('wizard:future_self_dialogue:saved', { file: fname }); } catch {}
  } catch (err) {
    console.error('[FutureSelfDialogue] save failed', err);
    setStatus(err?.message || 'Failed to save journal entry.', 'error');
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
      case "'": return '&#39;';
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
