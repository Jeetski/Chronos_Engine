// Self Authoring Suite - Modular Reflection Interface
// Users can complete sections independently, progress auto-saves

const STORAGE_KEY = 'chronos_self_authoring_data';

const SECTIONS = [
  { id: 'mode', title: 'Choose Mode', icon: '⚙️', category: 'setup' },
  { id: 'past', title: 'Past Authoring', icon: '🕰️', category: 'reflection' },
  { id: 'present-faults', title: 'Faults & Weaknesses', icon: '⚠️', category: 'reflection' },
  { id: 'present-virtues', title: 'Strengths & Virtues', icon: '🌟', category: 'reflection' },
  { id: 'future-vision', title: 'Future Vision', icon: '🔮', category: 'planning' },
  { id: 'future-action', title: 'Action Planning', icon: '🚀', category: 'planning' },
  { id: 'generate', title: 'Generate Items', icon: '✅', category: 'finalize' },
];

let authoringData = {
  mode: 'deep',
  lastSaved: null,

  // Past
  pastExperiences: '',
  pastRelationships: '',
  pastTurningPoints: '',
  pastLessons: [],

  // Present - Faults
  presentWeaknesses: '',
  presentBadHabits: [],
  presentNegativePatterns: '',

  // Present - Virtues
  presentStrengths: '',
  presentGoodHabits: [],
  presentWins: '',

  // Future - Vision
  futureVision1Year: '',
  futureVision3Year: '',
  futureVision5Year: '',
  futureDomains: {
    career: '',
    relationships: '',
    health: '',
    growth: '',
    finances: '',
    creativity: '',
  },

  // Future - Action
  futureGoals: [],
  futureObstacles: '',
  futureActionSteps: [],

  // Generated items
  generatedItems: [],
};

let currentSection = 'mode';

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

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(authoringData, parsed);
      console.log('[SelfAuthoring] Loaded saved progress');
    }
  } catch (err) {
    console.error('[SelfAuthoring] Failed to load data:', err);
  }
}

function saveData() {
  try {
    authoringData.lastSaved = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authoringData));
    updateLastSaved();
  } catch (err) {
    console.error('[SelfAuthoring] Failed to save data:', err);
  }
}

function updateLastSaved() {
  const el = document.getElementById('sa-last-saved');
  if (el && authoringData.lastSaved) {
    const date = new Date(authoringData.lastSaved);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el.textContent = `Last saved: ${timeStr}`;
  }
}

function getSectionCompletion(sectionId) {
  switch (sectionId) {
    case 'mode':
      return authoringData.mode ? 100 : 0;
    case 'past':
      let pastTotal = 0;
      let pastFilled = 0;
      if (authoringData.mode === 'quick') {
        return authoringData.pastLessons.length > 0 ? 100 : 0;
      } else {
        if (authoringData.pastExperiences) pastFilled++;
        if (authoringData.pastRelationships) pastFilled++;
        if (authoringData.pastTurningPoints) pastFilled++;
        pastTotal = 3;
        return Math.round((pastFilled / pastTotal) * 100);
      }
    case 'present-faults':
      return (authoringData.presentWeaknesses || authoringData.presentBadHabits.length > 0) ? 100 : 0;
    case 'present-virtues':
      return (authoringData.presentStrengths || authoringData.presentGoodHabits.length > 0) ? 100 : 0;
    case 'future-vision':
      return (authoringData.futureVision1Year || authoringData.futureVision3Year) ? 100 : 0;
    case 'future-action':
      return (authoringData.futureGoals.length > 0 || authoringData.futureActionSteps.length > 0) ? 100 : 0;
    case 'generate':
      return authoringData.generatedItems.length > 0 ? 100 : 0;
    default:
      return 0;
  }
}

export function launch(context) {
  loadData();

  const overlay = document.createElement('div');
  overlay.id = 'selfAuthoringOverlay';
  overlay.className = 'chronos-wizard-overlay';
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;';

  const container = document.createElement('div');
  container.id = 'selfAuthoringContainer';
  container.style.cssText = 'background:linear-gradient(135deg, var(--chronos-surface), var(--chronos-bg)); border:2px solid var(--chronos-border-strong); border-radius:16px; max-width:1200px; width:100%; max-height:90vh; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.6); display:flex;';

  overlay.appendChild(container);
  document.body.appendChild(overlay);

  injectStyles();
  render(container);
}

function injectStyles() {
  if (document.querySelector('[data-self-authoring-styles]')) return;
  const style = document.createElement('style');
  style.dataset.selfAuthoringStyles = 'true';
  style.textContent = `
    .sa-sidebar {
      width: 280px;
      background: linear-gradient(180deg, var(--chronos-surface), var(--chronos-surface-strong));
      border-right: 2px solid var(--chronos-border-strong);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }
    .sa-sidebar::-webkit-scrollbar {
      width: 6px;
    }
    .sa-sidebar::-webkit-scrollbar-thumb {
      background: rgba(122,162,247,0.3);
      border-radius: 999px;
    }
    .sa-header {
      padding: 20px;
      border-bottom: 1px solid var(--chronos-border);
    }
    .sa-title {
      font-size: 20px;
      font-weight: 700;
      background: linear-gradient(135deg, var(--chronos-accent), var(--chronos-accent));
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      margin: 0 0 8px 0;
    }
    .sa-subtitle {
      font-size: 12px;
      color: var(--chronos-text-muted);
      margin: 0;
    }
    .sa-nav {
      flex: 1;
      padding: 12px;
    }
    .sa-nav-category {
      font-size: 11px;
      font-weight: 700;
      color: var(--chronos-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 16px 0 8px 12px;
    }
    .sa-nav-category:first-child {
      margin-top: 0;
    }
    .sa-nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 200ms ease;
      margin-bottom: 4px;
      border: 1px solid transparent;
    }
    .sa-nav-item:hover {
      background: rgba(122,162,247,0.08);
      border-color: rgba(122,162,247,0.2);
    }
    .sa-nav-item.active {
      background: linear-gradient(135deg, rgba(122,162,247,0.15), rgba(157,124,216,0.15));
      border-color: rgba(122,162,247,0.3);
    }
    .sa-nav-icon {
      font-size: 20px;
    }
    .sa-nav-label {
      flex: 1;
      font-size: 14px;
      font-weight: 500;
      color: var(--chronos-text);
    }
    .sa-nav-progress {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 2px solid rgba(122,162,247,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      color: var(--chronos-accent);
      background: conic-gradient(var(--chronos-accent) var(--progress), transparent var(--progress));
      position: relative;
    }
    .sa-nav-progress::before {
      content: '';
      position: absolute;
      inset: 2px;
      background: var(--chronos-surface);
      border-radius: 50%;
      z-index: 0;
    }
    .sa-nav-progress span {
      position: relative;
      z-index: 1;
    }
    .sa-footer {
      padding: 16px;
      border-top: 1px solid var(--chronos-border);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sa-last-saved {
      font-size: 11px;
      color: var(--chronos-text-muted);
      text-align: center;
    }
    .sa-clear-btn {
      background: rgba(239,106,106,0.15);
      border: 1px solid rgba(239,106,106,0.3);
      color: var(--chronos-danger);
      font-size: 12px;
      padding: 8px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 200ms ease;
    }
    .sa-clear-btn:hover {
      background: rgba(239,106,106,0.25);
      border-color: rgba(239,106,106,0.5);
    }
    .sa-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .sa-topbar {
      padding: 20px 24px;
      background: linear-gradient(135deg, var(--chronos-surface-highlight), var(--chronos-surface-highlight));
      border-bottom: 2px solid var(--chronos-border-strong);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .sa-section-title {
      font-size: 24px;
      font-weight: 700;
      color: var(--chronos-text);
      margin: 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .sa-close-btn {
      background: transparent;
      border: 2px solid var(--chronos-border-strong);
      color: var(--chronos-text-muted);
      font-size: 24px;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 200ms ease;
    }
    .sa-close-btn:hover {
      background: var(--chronos-border-strong);
      border-color: var(--chronos-border-strong);
      color: var(--chronos-text);
    }
    .sa-content {
      flex: 1;
      overflow-y: auto;
      padding: 32px 24px;
      color: var(--chronos-text);
    }
    .sa-content::-webkit-scrollbar {
      width: 10px;
    }
    .sa-content::-webkit-scrollbar-thumb {
      background: rgba(122,162,247,0.3);
      border-radius: 999px;
    }
    .sa-content::-webkit-scrollbar-track {
      background: rgba(255,255,255,0.03);
    }
    .sa-section-desc {
      font-size: 16px;
      color: var(--chronos-text-muted);
      margin: 0 0 32px 0;
      line-height: 1.6;
    }
    .sa-prompt {
      margin-bottom: 24px;
    }
    .sa-prompt-label {
      font-size: 16px;
      font-weight: 600;
      color: var(--chronos-text);
      margin-bottom: 8px;
      display: block;
    }
    .sa-prompt-hint {
      font-size: 13px;
      color: var(--chronos-text-muted);
      font-style: italic;
      margin-bottom: 8px;
      display: block;
    }
    .sa-textarea {
      width: 100%;
      min-height: 120px;
      background: rgba(15,20,29,0.6);
      border: 2px solid var(--chronos-border-strong);
      border-radius: 10px;
      padding: 12px 16px;
      color: var(--chronos-text);
      font-family: Georgia, serif;
      font-size: 15px;
      line-height: 1.6;
      resize: vertical;
      outline: none;
      transition: all 200ms ease;
    }
    .sa-textarea:focus {
      border-color: var(--chronos-border-strong);
      background: rgba(15,20,29,0.8);
      box-shadow: 0 0 0 3px rgba(122,162,247,0.15);
    }
    .sa-textarea.tall {
      min-height: 200px;
    }
    .sa-input {
      width: 100%;
      background: rgba(15,20,29,0.6);
      border: 2px solid var(--chronos-border-strong);
      border-radius: 10px;
      padding: 10px 14px;
      color: var(--chronos-text);
      font-size: 14px;
      outline: none;
      transition: all 200ms ease;
    }
    .sa-input:focus {
      border-color: var(--chronos-border-strong);
      background: rgba(15,20,29,0.8);
      box-shadow: 0 0 0 3px rgba(122,162,247,0.15);
    }
    .sa-mode-select {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin: 32px 0;
    }
    .sa-mode-card {
      background: linear-gradient(135deg, rgba(122,162,247,0.08), rgba(157,124,216,0.08));
      border: 2px solid rgba(122,162,247,0.2);
      border-radius: 12px;
      padding: 20px;
      cursor: pointer;
      transition: all 200ms ease;
    }
    .sa-mode-card:hover {
      border-color: rgba(122,162,247,0.4);
      background: linear-gradient(135deg, rgba(122,162,247,0.15), rgba(157,124,216,0.15));
      transform: translateY(-2px);
    }
    .sa-mode-card.selected {
      border-color: var(--chronos-accent);
      background: linear-gradient(135deg, rgba(122,162,247,0.2), rgba(157,124,216,0.2));
    }
    .sa-mode-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--chronos-accent);
      margin: 0 0 8px 0;
    }
    .sa-mode-time {
      font-size: 13px;
      color: var(--chronos-text-muted);
      margin-bottom: 12px;
    }
    .sa-mode-desc {
      font-size: 14px;
      color: var(--chronos-text-muted);
      line-height: 1.5;
    }
    .sa-list-input {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sa-list-item {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .sa-list-remove {
      background: rgba(239,106,106,0.15);
      border: 1px solid rgba(239,106,106,0.3);
      color: var(--chronos-danger);
      font-size: 18px;
      width: 32px;
      height: 32px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 200ms ease;
    }
    .sa-list-remove:hover {
      background: rgba(239,106,106,0.25);
      border-color: rgba(239,106,106,0.5);
    }
    .sa-list-add {
      background: rgba(158,206,106,0.15);
      border: 2px solid rgba(158,206,106,0.3);
      color: var(--chronos-success);
      font-size: 14px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      margin-top: 8px;
      transition: all 200ms ease;
    }
    .sa-list-add:hover {
      background: rgba(158,206,106,0.25);
      border-color: rgba(158,206,106,0.5);
    }
    .sa-domain-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .sa-domain {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sa-item-card {
      background: linear-gradient(135deg, rgba(122,162,247,0.06), rgba(157,124,216,0.06));
      border: 1px solid rgba(122,162,247,0.2);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .sa-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .sa-item-type {
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(122,162,247,0.15);
      border: 1px solid rgba(122,162,247,0.3);
      color: var(--chronos-accent);
    }
    .sa-item-toggle {
      width: 20px;
      height: 20px;
    }
    .sa-item-name {
      font-size: 16px;
      font-weight: 600;
      color: var(--chronos-text);
      margin-bottom: 4px;
    }
    .sa-item-meta {
      font-size: 13px;
      color: var(--chronos-text-muted);
    }
    .sa-btn {
      background: linear-gradient(135deg, var(--chronos-accent), var(--chronos-accent-strong));
      border: 2px solid var(--chronos-accent-strong);
      color: white;
      font-size: 15px;
      font-weight: 600;
      padding: 12px 24px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 200ms ease;
      width: 100%;
    }
    .sa-btn:hover {
      background: linear-gradient(135deg, var(--chronos-accent), var(--chronos-accent-strong));
      border-color: var(--chronos-accent-strong);
      transform: translateY(-1px);
    }
    .sa-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      transform: none;
    }
    .sa-generate-summary {
      background: rgba(122,162,247,0.1);
      border: 1px solid rgba(122,162,247,0.3);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .sa-generate-summary h3 {
      margin: 0 0 12px 0;
      font-size: 18px;
      color: var(--chronos-accent);
    }
    .sa-generate-summary p {
      margin: 0;
      color: var(--chronos-text-muted);
      font-size: 14px;
      line-height: 1.5;
    }
  `;
  document.head.appendChild(style);
}

function render(container) {
  container.innerHTML = `
    <div class="sa-sidebar">
      <div class="sa-header">
        <h1 class="sa-title">Self Authoring</h1>
        <p class="sa-subtitle">Reflect, plan, and grow</p>
      </div>
      <nav class="sa-nav" id="sa-nav"></nav>
      <div class="sa-footer">
        <div class="sa-last-saved" id="sa-last-saved"></div>
        <button class="sa-clear-btn" id="sa-clear-all">Clear All Progress</button>
      </div>
    </div>
    <div class="sa-main">
      <div class="sa-topbar">
        <h2 class="sa-section-title" id="sa-current-title"></h2>
        <button class="sa-close-btn" id="sa-close">×</button>
      </div>
      <div class="sa-content" id="sa-section-content"></div>
    </div>
  `;

  renderNav();
  renderSection(currentSection);
  updateLastSaved();

  document.getElementById('sa-close').addEventListener('click', () => {
    document.getElementById('selfAuthoringOverlay').remove();
  });

  document.getElementById('sa-clear-all').addEventListener('click', () => {
    if (confirm('Clear all self authoring progress? This cannot be undone.')) {
      localStorage.removeItem(STORAGE_KEY);
      location.reload(); // Reload to reset state
    }
  });
}

function renderNav() {
  const nav = document.getElementById('sa-nav');
  nav.innerHTML = ''; // Clear existing nav items
  let currentCategory = null;

  SECTIONS.forEach(section => {
    if (section.category !== currentCategory) {
      currentCategory = section.category;
      const categoryEl = document.createElement('div');
      categoryEl.className = 'sa-nav-category';
      categoryEl.textContent = currentCategory;
      nav.appendChild(categoryEl);
    }

    const completion = getSectionCompletion(section.id);
    const item = document.createElement('div');
    item.className = `sa-nav-item ${section.id === currentSection ? 'active' : ''}`;
    item.innerHTML = `
      <div class="sa-nav-icon">${section.icon}</div>
      <div class="sa-nav-label">${section.title}</div>
      <div class="sa-nav-progress" style="--progress: ${completion}%">
        <span>${completion}%</span>
      </div>
    `;

    item.addEventListener('click', () => {
      currentSection = section.id;
      render(document.getElementById('selfAuthoringContainer'));
    });

    nav.appendChild(item);
  });
}

function renderSection(sectionId) {
  const section = SECTIONS.find(s => s.id === sectionId);
  document.getElementById('sa-current-title').innerHTML = `${section.icon} ${section.title}`;

  const content = document.getElementById('sa-section-content');

  switch (sectionId) {
    case 'mode':
      renderModeSection(content);
      break;
    case 'past':
      renderPastSection(content);
      break;
    case 'present-faults':
      renderFaultsSection(content);
      break;
    case 'present-virtues':
      renderVirtuesSection(content);
      break;
    case 'future-vision':
      renderVisionSection(content);
      break;
    case 'future-action':
      renderActionSection(content);
      break;
    case 'generate':
      renderGenerateSection(content);
      break;
  }
}

function renderModeSection(container) {
  container.innerHTML = `
    <p class="sa-section-desc">
      Choose how deep you want to go with self authoring. You can switch modes anytime.
    </p>
    <div class="sa-mode-select">
      <div class="sa-mode-card ${authoringData.mode === 'quick' ? 'selected' : ''}" data-mode="quick">
        <div class="sa-mode-title">⚡ Quick Insight</div>
        <div class="sa-mode-time">15-30 minutes</div>
        <div class="sa-mode-desc">
          Streamlined prompts for fast reflection and goal setting. Perfect for regular check-ins.
        </div>
      </div>
      <div class="sa-mode-card ${authoringData.mode === 'deep' ? 'selected' : ''}" data-mode="deep">
        <div class="sa-mode-title">🌊 Deep Reflection</div>
        <div class="sa-mode-time">1-2 hours</div>
        <div class="sa-mode-desc">
          Comprehensive exercises for profound self-discovery. Recommended for major life transitions.
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-mode]').forEach(card => {
    card.addEventListener('click', () => {
      authoringData.mode = card.dataset.mode;
      saveData();
      renderSection(currentSection);
      renderNav();
    });
  });
}

function renderPastSection(container) {
  const isQuick = authoringData.mode === 'quick';

  container.innerHTML = `
    <p class="sa-section-desc">
      ${isQuick
      ? 'Reflect briefly on your past to extract key lessons that shaped you.'
      : 'Take time to deeply reflect on formative experiences and their lasting impact.'}
    </p>
    
    ${isQuick ? `
      <div class="sa-prompt">
        <label class="sa-prompt-label">Key Lessons from Your Past</label>
        <span class="sa-prompt-hint">List 3-5 important lessons you've learned (one per line)</span>
        <div class="sa-list-input" id="past-lessons-list"></div>
        <button class="sa-list-add" id="add-lesson">+ Add Lesson</button>
      </div>
    ` : `
      <div class="sa-prompt">
        <label class="sa-prompt-label">Significant Experiences</label>
        <span class="sa-prompt-hint">Describe 3-5 formative experiences that shaped you</span>
        <textarea class="sa-textarea tall" id="past-experiences">${authoringData.pastExperiences}</textarea>
      </div>
      
      <div class="sa-prompt">
        <label class="sa-prompt-label">Past Relationships</label>
        <span class="sa-prompt-hint">Reflect on key relationships (family, friends, mentors)</span>
        <textarea class="sa-textarea" id="past-relationships">${authoringData.pastRelationships}</textarea>
      </div>
      
      <div class="sa-prompt">
        <label class="sa-prompt-label">Turning Points</label>
        <span class="sa-prompt-hint">What were major crossroads or decisions?</span>
        <textarea class="sa-textarea" id="past-turning-points">${authoringData.pastTurningPoints}</textarea>
      </div>
    `}
  `;

  if (isQuick) {
    renderListInput('past-lessons-list', 'add-lesson', authoringData.pastLessons, (items) => {
      authoringData.pastLessons = items;
      saveData();
      renderNav();
    }, 'Failure is a teacher, not an enemy');
  } else {
    setupTextareaAutoSave('past-experiences', () => authoringData.pastExperiences, (val) => {
      authoringData.pastExperiences = val;
      saveData();
      renderNav();
    });

    setupTextareaAutoSave('past-relationships', () => authoringData.pastRelationships, (val) => {
      authoringData.pastRelationships = val;
      saveData();
      renderNav();
    });

    setupTextareaAutoSave('past-turning-points', () => authoringData.pastTurningPoints, (val) => {
      authoringData.pastTurningPoints = val;
      saveData();
      renderNav();
    });
  }
}

function renderFaultsSection(container) {
  container.innerHTML = `
    <p class="sa-section-desc">
      Honest self-assessment is the foundation of growth. Identify what's holding you back.
    </p>
    
    <div class="sa-prompt">
      <label class="sa-prompt-label">Current Weaknesses</label>
      <span class="sa-prompt-hint">What areas need improvement? Be specific and honest.</span>
      <textarea class="sa-textarea" id="present-weaknesses">${authoringData.presentWeaknesses}</textarea>
    </div>
    
    <div class="sa-prompt">
      <label class="sa-prompt-label">Bad Habits to Eliminate</label>
      <span class="sa-prompt-hint">List habits you want to break (one per line)</span>
      <div class="sa-list-input" id="bad-habits-list"></div>
      <button class="sa-list-add" id="add-bad-habit">+ Add Habit</button>
    </div>
    
    ${authoringData.mode === 'deep' ? `
      <div class="sa-prompt">
        <label class="sa-prompt-label">Negative Patterns</label>
        <span class="sa-prompt-hint">What recurring patterns cause you trouble?</span>
        <textarea class="sa-textarea" id="present-negative-patterns">${authoringData.presentNegativePatterns}</textarea>
      </div>
    ` : ''}
  `;

  setupTextareaAutoSave('present-weaknesses', () => authoringData.presentWeaknesses, (val) => {
    authoringData.presentWeaknesses = val;
    saveData();
    renderNav();
  });

  renderListInput('bad-habits-list', 'add-bad-habit', authoringData.presentBadHabits, (items) => {
    authoringData.presentBadHabits = items;
    saveData();
    renderNav();
  }, 'Procrastination');

  if (authoringData.mode === 'deep') {
    setupTextareaAutoSave('present-negative-patterns', () => authoringData.presentNegativePatterns, (val) => {
      authoringData.presentNegativePatterns = val;
      saveData();
      renderNav();
    });
  }
}

function renderVirtuesSection(container) {
  container.innerHTML = `
    <p class="sa-section-desc">
      Recognize what you do well. These are the foundations to build upon.
    </p>
    
    <div class="sa-prompt">
      <label class="sa-prompt-label">Current Strengths</label>
      <span class="sa-prompt-hint">What are you naturally good at?</span>
      <textarea class="sa-textarea" id="present-strengths">${authoringData.presentStrengths}</textarea>
    </div>
    
    <div class="sa-prompt">
      <label class="sa-prompt-label">Good Habits to Maintain</label>
      <span class="sa-prompt-hint">List positive habits to strengthen (one per line)</span>
      <div class="sa-list-input" id="good-habits-list"></div>
      <button class="sa-list-add" id="add-good-habit">+ Add Habit</button>
    </div>
    
    ${authoringData.mode === 'deep' ? `
      <div class="sa-prompt">
        <label class="sa-prompt-label">Current Wins</label>
        <span class="sa-prompt-hint">What's working well in your life right now?</span>
        <textarea class="sa-textarea" id="present-wins">${authoringData.presentWins}</textarea>
      </div>
    ` : ''}
  `;

  setupTextareaAutoSave('present-strengths', () => authoringData.presentStrengths, (val) => {
    authoringData.presentStrengths = val;
    saveData();
    renderNav();
  });

  renderListInput('good-habits-list', 'add-good-habit', authoringData.presentGoodHabits, (items) => {
    authoringData.presentGoodHabits = items;
    saveData();
    renderNav();
  }, 'Morning exercise');

  if (authoringData.mode === 'deep') {
    setupTextareaAutoSave('present-wins', () => authoringData.presentWins, (val) => {
      authoringData.presentWins = val;
      saveData();
      renderNav();
    });
  }
}

function renderVisionSection(container) {
  container.innerHTML = `
    <p class="sa-section-desc">
      Imagine your ideal future. Be specific and aspirational.
    </p>
    
    <div class="sa-prompt">
      <label class="sa-prompt-label">1-Year Vision</label>
      <span class="sa-prompt-hint">Where do you want to be in 1 year?</span>
      <textarea class="sa-textarea" id="future-1year">${authoringData.futureVision1Year}</textarea>
    </div>
    
    <div class="sa-prompt">
      <label class="sa-prompt-label">3-Year Vision</label>
      <span class="sa-prompt-hint">What does your life look like in 3 years?</span>
      <textarea class="sa-textarea" id="future-3year">${authoringData.futureVision3Year}</textarea>
    </div>
    
    ${authoringData.mode === 'deep' ? `
      <div class="sa-prompt">
        <label class="sa-prompt-label">Life Domains</label>
        <span class="sa-prompt-hint">Describe your ideal future in each area</span>
        <div class="sa-domain-grid">
          <div class="sa-domain">
            <label style="font-weight:600; color:var(--chronos-text); margin-bottom:4px;">Career/Work</label>
            <textarea class="sa-textarea" id="domain-career" style="min-height:80px;">${authoringData.futureDomains.career}</textarea>
          </div>
          <div class="sa-domain">
            <label style="font-weight:600; color:var(--chronos-text); margin-bottom:4px;">Relationships</label>
            <textarea class="sa-textarea" id="domain-relationships" style="min-height:80px;">${authoringData.futureDomains.relationships}</textarea>
          </div>
          <div class="sa-domain">
            <label style="font-weight:600; color:var(--chronos-text); margin-bottom:4px;">Health/Fitness</label>
            <textarea class="sa-textarea" id="domain-health" style="min-height:80px;">${authoringData.futureDomains.health}</textarea>
          </div>
          <div class="sa-domain">
            <label style="font-weight:600; color:var(--chronos-text); margin-bottom:4px;">Personal Growth</label>
            <textarea class="sa-textarea" id="domain-growth" style="min-height:80px;">${authoringData.futureDomains.growth}</textarea>
          </div>
        </div>
      </div>
    ` : ''}
  `;

  setupTextareaAutoSave('future-1year', () => authoringData.futureVision1Year, (val) => {
    authoringData.futureVision1Year = val;
    saveData();
    renderNav();
  });

  setupTextareaAutoSave('future-3year', () => authoringData.futureVision3Year, (val) => {
    authoringData.futureVision3Year = val;
    saveData();
    renderNav();
  });

  if (authoringData.mode === 'deep') {
    ['career', 'relationships', 'health', 'growth'].forEach(domain => {
      setupTextareaAutoSave(`domain-${domain}`, () => authoringData.futureDomains[domain], (val) => {
        authoringData.futureDomains[domain] = val;
        saveData();
        renderNav();
      });
    });
  }
}

function renderActionSection(container) {
  container.innerHTML = `
    <p class="sa-section-desc">
      Transform your vision into concrete goals and action steps.
    </p>
    
    <div class="sa-prompt">
      <label class="sa-prompt-label">Specific Goals</label>
      <span class="sa-prompt-hint">List tangible goals (one per line)</span>
      <div class="sa-list-input" id="goals-list"></div>
      <button class="sa-list-add" id="add-goal">+ Add Goal</button>
    </div>
    
    <div class="sa-prompt">
      <label class="sa-prompt-label">Action Steps</label>
      <span class="sa-prompt-hint">What are the first steps? (one per line)</span>
      <div class="sa-list-input" id="actions-list"></div>
      <button class="sa-list-add" id="add-action">+ Add Action</button>
    </div>
    
    ${authoringData.mode === 'deep' ? `
      <div class="sa-prompt">
        <label class="sa-prompt-label">Potential Obstacles</label>
        <span class="sa-prompt-hint">What might prevent you from achieving these goals?</span>
        <textarea class="sa-textarea" id="future-obstacles">${authoringData.futureObstacles}</textarea>
      </div>
    ` : ''}
  `;

  renderListInput('goals-list', 'add-goal', authoringData.futureGoals, (items) => {
    authoringData.futureGoals = items;
    saveData();
    renderNav();
  }, 'Get promoted to senior engineer');

  renderListInput('actions-list', 'add-action', authoringData.futureActionSteps, (items) => {
    authoringData.futureActionSteps = items;
    saveData();
    renderNav();
  }, 'Join a running club');

  if (authoringData.mode === 'deep') {
    setupTextareaAutoSave('future-obstacles', () => authoringData.futureObstacles, (val) => {
      authoringData.futureObstacles = val;
      saveData();
      renderNav();
    });
  }
}

function renderGenerateSection(container) {
  generateItems();

  const badHabitsCount = authoringData.presentBadHabits.filter(h => h.trim()).length;
  const goodHabitsCount = authoringData.presentGoodHabits.filter(h => h.trim()).length;
  const goalsCount = authoringData.futureGoals.filter(g => g.trim()).length;
  const tasksCount = authoringData.futureActionSteps.filter(a => a.trim()).length;

  container.innerHTML = `
    <div class="sa-generate-summary">
      <h3>Items to Create</h3>
      <p>
        Based on your reflections, we'll create:
        <ul style="margin: 12px 0 0 0; padding-left: 20px;">
          ${badHabitsCount > 0 ? `<li>${badHabitsCount} bad habit(s) to eliminate</li>` : ''}
          ${goodHabitsCount > 0 ? `<li>${goodHabitsCount} good habit(s) to maintain</li>` : ''}
          ${goalsCount > 0 ? `<li>${goalsCount} goal(s) to achieve</li>` : ''}
          ${tasksCount > 0 ? `<li>${tasksCount} task(s) to complete</li>` : ''}
          ${authoringData.generatedItems.length === 0 ? '<li style="color:var(--chronos-text-muted);">No items to generate. Fill out other sections first.</li>' : ''}
        </ul>
      </p>
    </div>
    
    <div id="items-preview"></div>
    
    ${authoringData.generatedItems.length > 0 ? `
      <div style="display:flex; gap:12px; margin-top:24px;">
        <button class="sa-btn" id="create-items-btn" style="flex:1;">Create ${authoringData.generatedItems.filter(i => i.enabled).length} Items</button>
        <button class="sa-btn" id="save-archive-btn" style="flex:1; background:linear-gradient(135deg,var(--chronos-accent),var(--chronos-accent)); border-color:var(--chronos-accent);">Save & Archive</button>
      </div>
      <p style="color:var(--chronos-text-muted); font-size:13px; margin-top:12px; text-align:center;">
        💾 "Save & Archive" will save your reflections as a Note and Journal entry (without creating items)
      </p>
    ` : ''}
  `;

  const previewEl = document.getElementById('items-preview');
  authoringData.generatedItems.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'sa-item-card';
    card.innerHTML = `
      <div class="sa-item-header">
        <span class="sa-item-type">${item.type}</span>
        <input type="checkbox" class="sa-item-toggle" data-idx="${idx}" ${item.enabled ? 'checked' : ''} />
      </div>
      <div class="sa-item-name">${escapeHtml(item.name)}</div>
      ${item.polarity ? `<div class="sa-item-meta">Polarity: ${item.polarity}</div>` : ''}
    `;
    previewEl.appendChild(card);

    card.querySelector('.sa-item-toggle').addEventListener('change', (e) => {
      authoringData.generatedItems[idx].enabled = e.target.checked;
      saveData();
    });
  });

  const createBtn = document.getElementById('create-items-btn');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      await createItemsAndSave(createBtn);
    });
  }

  const saveArchiveBtn = document.getElementById('save-archive-btn');
  if (saveArchiveBtn) {
    saveArchiveBtn.addEventListener('click', async () => {
      await saveToNoteAndJournal(saveArchiveBtn);
    });
  }
}

async function createItemsAndSave(btn) {
  btn.disabled = true;
  btn.textContent = 'Creating...';

  try {
    // Create items
    for (const item of authoringData.generatedItems) {
      if (!item.enabled) continue;

      const payload = {
        type: item.type,
        name: item.name,
      };

      if (item.type === 'habit') {
        payload.polarity = item.polarity;
      }

      await apiRequest('/api/item', { method: 'POST', body: payload });
    }

    // Also save to Note and Journal
    await saveToNoteAndJournal(null, false);

    alert(`Successfully created ${authoringData.generatedItems.filter(i => i.enabled).length} items and saved reflections!`);

    // Clear localStorage after successful creation
    if (confirm('Clear self authoring progress now that items are created?')) {
      localStorage.removeItem(STORAGE_KEY);
    }

    document.getElementById('selfAuthoringOverlay').remove();
  } catch (err) {
    alert(`Error creating items: ${err.message}`);
    btn.disabled = false;
    btn.textContent = `Create ${authoringData.generatedItems.filter(i => i.enabled).length} Items`;
  }
}

async function saveToNoteAndJournal(btn, showAlert = true) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  try {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const noteName = `Self Authoring - ${timestamp}`;

    // Build content summary
    const contentParts = [];

    if (authoringData.mode) {
      contentParts.push(`Mode: ${authoringData.mode === 'quick' ? 'Quick Insight' : 'Deep Reflection'}\n`);
    }

    // Past section
    if (authoringData.pastExperiences || authoringData.pastLessons.length > 0) {
      contentParts.push(`\n## PAST AUTHORING\n`);
      if (authoringData.pastExperiences) {
        contentParts.push(`### Experiences\n${authoringData.pastExperiences}\n`);
      }
      if (authoringData.pastRelationships) {
        contentParts.push(`### Relationships\n${authoringData.pastRelationships}\n`);
      }
      if (authoringData.pastTurningPoints) {
        contentParts.push(`### Turning Points\n${authoringData.pastTurningPoints}\n`);
      }
      if (authoringData.pastLessons.length > 0) {
        contentParts.push(`### Lessons\n${authoringData.pastLessons.map(l => `- ${l}`).join('\n')}\n`);
      }
    }

    // Present section
    if (authoringData.presentWeaknesses || authoringData.presentBadHabits.length > 0 ||
      authoringData.presentStrengths || authoringData.presentGoodHabits.length > 0) {
      contentParts.push(`\n## PRESENT AUTHORING\n`);

      if (authoringData.presentWeaknesses || authoringData.presentBadHabits.length > 0) {
        contentParts.push(`### Faults\n`);
        if (authoringData.presentWeaknesses) {
          contentParts.push(`**Weaknesses:**\n${authoringData.presentWeaknesses}\n\n`);
        }
        if (authoringData.presentBadHabits.length > 0) {
          contentParts.push(`**Bad Habits:**\n${authoringData.presentBadHabits.map(h => `- ${h}`).join('\n')}\n\n`);
        }
        if (authoringData.presentNegativePatterns) {
          contentParts.push(`**Negative Patterns:**\n${authoringData.presentNegativePatterns}\n\n`);
        }
      }

      if (authoringData.presentStrengths || authoringData.presentGoodHabits.length > 0) {
        contentParts.push(`### Virtues\n`);
        if (authoringData.presentStrengths) {
          contentParts.push(`**Strengths:**\n${authoringData.presentStrengths}\n\n`);
        }
        if (authoringData.presentGoodHabits.length > 0) {
          contentParts.push(`**Good Habits:**\n${authoringData.presentGoodHabits.map(h => `- ${h}`).join('\n')}\n\n`);
        }
        if (authoringData.presentWins) {
          contentParts.push(`**Current Wins:**\n${authoringData.presentWins}\n\n`);
        }
      }
    }

    // Future section
    if (authoringData.futureVision1Year || authoringData.futureGoals.length > 0) {
      contentParts.push(`\n## FUTURE AUTHORING\n`);

      if (authoringData.futureVision1Year || authoringData.futureVision3Year) {
        contentParts.push(`### Vision\n`);
        if (authoringData.futureVision1Year) {
          contentParts.push(`**1-Year:**\n${authoringData.futureVision1Year}\n\n`);
        }
        if (authoringData.futureVision3Year) {
          contentParts.push(`**3-Year:**\n${authoringData.futureVision3Year}\n\n`);
        }
        if (authoringData.futureVision5Year) {
          contentParts.push(`**5-Year:**\n${authoringData.futureVision5Year}\n\n`);
        }

        // Domains
        const domains = Object.entries(authoringData.futureDomains).filter(([k, v]) => v.trim());
        if (domains.length > 0) {
          contentParts.push(`**Life Domains:**\n`);
          domains.forEach(([domain, text]) => {
            contentParts.push(`- ${domain.charAt(0).toUpperCase() + domain.slice(1)}: ${text}\n`);
          });
          contentParts.push('\n');
        }
      }

      if (authoringData.futureGoals.length > 0 || authoringData.futureActionSteps.length > 0) {
        contentParts.push(`### Action Plan\n`);
        if (authoringData.futureGoals.length > 0) {
          contentParts.push(`**Goals:**\n${authoringData.futureGoals.map(g => `- ${g}`).join('\n')}\n\n`);
        }
        if (authoringData.futureActionSteps.length > 0) {
          contentParts.push(`**Action Steps:**\n${authoringData.futureActionSteps.map(a => `- ${a}`).join('\n')}\n\n`);
        }
        if (authoringData.futureObstacles) {
          contentParts.push(`**Obstacles:**\n${authoringData.futureObstacles}\n\n`);
        }
      }
    }

    const fullContent = contentParts.join('');

    // Create Note
    const notePayload = {
      type: 'note',
      name: noteName,
      content: fullContent,
      category: 'Personal Development',
      tags: ['self-authoring', 'reflection', 'planning', authoringData.mode],
      self_authoring: {
        mode: authoringData.mode,
        created_date: timestamp,
        version: '1.0',
      },
    };

    await apiRequest('/api/item', { method: 'POST', body: notePayload });

    // Create Journal Entry
    const journalPayload = {
      type: 'journal_entry',
      name: `Self Authoring Reflection - ${timestamp}`,
      content: fullContent,
      category: 'Self Development',
      tags: ['self-authoring', 'reflection', 'life-planning'],
      mood: 'reflective',
      self_authoring: {
        mode: authoringData.mode,
        created_date: timestamp,
        version: '1.0',
      },
    };

    await apiRequest('/api/item', { method: 'POST', body: journalPayload });

    if (showAlert) {
      alert('Self authoring reflections saved as Note and Journal entry!');
      document.getElementById('selfAuthoringOverlay').remove();
    }
  } catch (err) {
    alert(`Error saving: ${err.message}`);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save & Archive';
    }
  }
}

function setupTextareaAutoSave(id, getter, setter) {
  const el = document.getElementById(id);
  if (!el) return;

  let saveTimeout;
  el.addEventListener('input', (e) => {
    setter(e.target.value);
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveData();
      renderNav();
    }, 500); // Auto-save 500ms after typing stops
  });
}

function renderListInput(containerId, addBtnId, items, onChange, placeholder = '') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  items.forEach((text, idx) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'sa-list-item';
    itemEl.innerHTML = `
      <input type="text" class="sa-input" value="${escapeAttr(text)}" data-idx="${idx}" placeholder="${escapeAttr(placeholder)}" />
      <button class="sa-list-remove" data-idx="${idx}">×</button>
    `;
    container.appendChild(itemEl);

    let saveTimeout;
    itemEl.querySelector('input').addEventListener('input', (e) => {
      items[e.target.dataset.idx] = e.target.value;
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => onChange(items), 500);
    });

    itemEl.querySelector('.sa-list-remove').addEventListener('click', (e) => {
      items.splice(e.target.dataset.idx, 1);
      onChange(items);
      renderListInput(containerId, addBtnId, items, onChange, placeholder);
    });
  });

  const addBtn = document.getElementById(addBtnId);
  if (addBtn) {
    addBtn.replaceWith(addBtn.cloneNode(true)); // Remove old listener
    document.getElementById(addBtnId).addEventListener('click', () => {
      items.push('');
      onChange(items);
      renderListInput(containerId, addBtnId, items, onChange, placeholder);
      setTimeout(() => {
        const inputs = container.querySelectorAll('input');
        if (inputs.length > 0) inputs[inputs.length - 1].focus();
      }, 50);
    });
  }
}

function generateItems() {
  authoringData.generatedItems = [];

  authoringData.presentBadHabits.forEach(name => {
    if (name.trim()) {
      authoringData.generatedItems.push({
        type: 'habit',
        name: name.trim(),
        polarity: 'bad',
        enabled: true,
      });
    }
  });

  authoringData.presentGoodHabits.forEach(name => {
    if (name.trim()) {
      authoringData.generatedItems.push({
        type: 'habit',
        name: name.trim(),
        polarity: 'good',
        enabled: true,
      });
    }
  });

  authoringData.futureGoals.forEach(name => {
    if (name.trim()) {
      authoringData.generatedItems.push({
        type: 'goal',
        name: name.trim(),
        enabled: true,
      });
    }
  });

  authoringData.futureActionSteps.forEach(name => {
    if (name.trim()) {
      authoringData.generatedItems.push({
        type: 'task',
        name: name.trim(),
        enabled: true,
      });
    }
  });
}
