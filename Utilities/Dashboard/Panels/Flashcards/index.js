const PANEL_ID = 'flashcards';
const STYLE_ID = 'cockpit-flashcards-style';
const DEFAULT_TAG = 'flashcard';
const DEFAULT_TYPE = 'note';
const SUPPORTED_TYPES = ['note', 'task', 'habit'];

function injectStyles(){
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .flashcards-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 12px;
      color: var(--chronos-text);
      font-size: 13px;
    }
    .flashcards-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }
    .flashcards-title {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .flashcards-title strong {
      font-size: 17px;
      font-weight: 700;
    }
    .flashcards-title span {
      font-size: 12px;
      color: var(--chronos-text-muted);
      letter-spacing: 0.4px;
    }
    .flashcards-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .flashcards-btn {
      border: 1px solid rgba(255,255,255,0.12);
      background: var(--chronos-surface-soft);
      color: var(--chronos-text);
      border-radius: 12px;
      padding: 8px 12px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    .flashcards-btn:hover:not([disabled]) {
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(2,4,12,0.35);
    }
    .flashcards-btn[disabled] {
      opacity: 0.6;
      cursor: default;
      transform: none;
      box-shadow: none;
    }
    .flashcards-btn--primary {
      background: var(--chronos-accent-gradient);
      border-color: rgba(255,255,255,0.2);
    }
    .flashcards-filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 10px;
      padding: 12px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.08);
      background: var(--chronos-surface);
    }
    .flashcards-filters label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--chronos-text-muted);
    }
    .flashcards-filters select,
    .flashcards-filters input {
      background: var(--chronos-surface-soft);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      padding: 7px 10px;
      color: var(--chronos-text);
      font-size: 13px;
    }
    .flashcards-card {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.1);
      background: linear-gradient(135deg, rgba(122,162,247,0.15), rgba(77,226,182,0.08));
      box-shadow: 0 10px 30px rgba(4, 8, 18, 0.5);
      min-height: 160px;
    }
    .flashcards-card.empty {
      align-items: center;
      justify-content: center;
      text-align: center;
      color: var(--chronos-text-muted);
      background: var(--chronos-surface);
      box-shadow: none;
    }
    .flashcards-card h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: var(--chronos-text);
      word-break: break-word;
    }
    .flashcards-sub {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 12px;
      color: var(--chronos-text-muted);
    }
    .flashcards-pill {
      padding: 3px 10px;
      border-radius: 999px;
      background: rgba(0,0,0,0.18);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .flashcards-answer {
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(0,0,0,0.3);
      color: var(--chronos-text);
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .flashcards-controls {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .flashcards-status {
      font-size: 12px;
      color: var(--chronos-text-muted);
      min-height: 16px;
    }
    .flashcards-status.error {
      color: var(--chronos-danger);
    }
  `;
  document.head.appendChild(style);
}

function apiBase(){
  const origin = window.location?.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

function createDefinition(){
  return {
    id: PANEL_ID,
    label: 'Flashcards',
    defaultVisible: false,
    defaultPosition: { x: 220, y: 64 },
    size: { width: 360, height: 440 },
    mount: (root) => mountFlashcardsPanel(root),
    menuKey: PANEL_ID,
    menuLabel: 'Flashcards',
  };
}

export function register(manager){
  injectStyles();
  manager.registerPanel(createDefinition());
}

const autoAttach = (manager) => {
  try {
    if (manager && typeof manager.registerPanel === 'function'){
      register(manager);
    }
  } catch (error) {
    console.error('[Chronos][Panels][Flashcards] Failed to register panel', error);
  }
};

if (typeof window !== 'undefined') {
  const defs = window.__cockpitPanelDefinitions || [];
  defs.push(autoAttach);
  window.__cockpitPanelDefinitions = defs;
  if (typeof window.__cockpitPanelRegister === 'function') {
    try { window.__cockpitPanelRegister(autoAttach); } catch {}
  }
}

function mountFlashcardsPanel(root){
  injectStyles();
  root.classList.add('flashcards-shell');
  root.innerHTML = `
    <div class="flashcards-header">
      <div class="flashcards-title">
        <strong>Flashcards</strong>
        <span>Review tagged notes as quick cards. Default tag: "${DEFAULT_TAG}".</span>
      </div>
      <div class="flashcards-actions">
        <button type="button" class="flashcards-btn flashcards-btn--ghost flashcards-refresh">Refresh</button>
        <button type="button" class="flashcards-btn flashcards-btn--primary flashcards-shuffle">Shuffle</button>
      </div>
    </div>
    <div class="flashcards-filters">
      <label>
        Type
        <select class="flashcards-type"></select>
      </label>
      <label>
        Tag
        <input class="flashcards-tag" type="text" placeholder="flashcard" />
      </label>
      <label>
        Search
        <input class="flashcards-search" type="text" placeholder="keyword" />
      </label>
    </div>
    <div class="flashcards-card empty">
      <div>No cards yet. Refresh to load notes with the tag.</div>
    </div>
    <div class="flashcards-controls">
      <button type="button" class="flashcards-btn flashcards-prev">Prev</button>
      <button type="button" class="flashcards-btn flashcards-next">Next</button>
      <button type="button" class="flashcards-btn flashcards-btn--primary flashcards-reveal">Show Answer</button>
      <button type="button" class="flashcards-btn flashcards-clear">Clear Filters</button>
      <div class="flashcards-status"></div>
    </div>
  `;

  const typeSelect = root.querySelector('.flashcards-type');
  const tagInput = root.querySelector('.flashcards-tag');
  const searchInput = root.querySelector('.flashcards-search');
  const refreshBtn = root.querySelector('.flashcards-refresh');
  const shuffleBtn = root.querySelector('.flashcards-shuffle');
  const prevBtn = root.querySelector('.flashcards-prev');
  const nextBtn = root.querySelector('.flashcards-next');
  const revealBtn = root.querySelector('.flashcards-reveal');
  const clearBtn = root.querySelector('.flashcards-clear');
  const cardEl = root.querySelector('.flashcards-card');
  const statusEl = root.querySelector('.flashcards-status');

  SUPPORTED_TYPES.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type.replace(/_/g, ' ');
    typeSelect.appendChild(option);
  });
  typeSelect.value = DEFAULT_TYPE;
  tagInput.value = DEFAULT_TAG;

  const state = {
    type: DEFAULT_TYPE,
    tag: DEFAULT_TAG,
    q: '',
  };

  const runtime = {
    deck: [],
    index: 0,
    showingAnswer: false,
    loading: false,
  };

  const setStatus = (text, isError=false)=>{
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.classList.toggle('error', !!isError);
  };

  const normalizeText = (value)=>{
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join('\n');
    return '';
  };

  const extractTags = (item)=>{
    const out = [];
    const maybeAdd = (v)=>{
      if (!v && v !== 0) return;
      const str = String(v).trim();
      if (str) out.push(str.toLowerCase());
    };
    try {
      if (Array.isArray(item.tags)) item.tags.forEach(maybeAdd);
      if (Array.isArray(item.labels)) item.labels.forEach(maybeAdd);
      if (item.category) maybeAdd(item.category);
      if (item.categories && Array.isArray(item.categories)) item.categories.forEach(maybeAdd);
    } catch {}
    return out;
  };

  const matchesFilters = (item)=>{
    if (state.tag){
      const tags = extractTags(item);
      if (!tags.includes(state.tag.toLowerCase())) return false;
    }
    if (state.q){
      const needle = state.q.toLowerCase();
      const hay = `${item.name || ''} ${normalizeText(item.content) || ''} ${(item.description || '')} ${(item.summary || '')}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  };

  const shuffleDeck = ()=>{
    for (let i = runtime.deck.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [runtime.deck[i], runtime.deck[j]] = [runtime.deck[j], runtime.deck[i]];
    }
  };

  const renderCard = ()=>{
    if (!cardEl) return;
    const current = runtime.deck[runtime.index];
    if (!current){
      cardEl.classList.add('empty');
      cardEl.innerHTML = `<div>No cards matched. Adjust filters and refresh.</div>`;
      return;
    }
    cardEl.classList.remove('empty');
    const tags = extractTags(current);
    const pills = [];
    if (tags.length) pills.push(`<span class="flashcards-pill">Tags: ${tags.join(', ')}</span>`);
    if (current.priority) pills.push(`<span class="flashcards-pill">Priority: ${current.priority}</span>`);
    if (current.category) pills.push(`<span class="flashcards-pill">Category: ${current.category}</span>`);
    const answer = normalizeText(current.content) || normalizeText(current.description) || normalizeText(current.summary) || '(No content)';
    cardEl.innerHTML = `
      <h3>${current.name || '(untitled)'}</h3>
      <div class="flashcards-sub">
        <span>#${runtime.index + 1} of ${runtime.deck.length}</span>
        ${pills.join(' ')}
      </div>
      ${runtime.showingAnswer ? `<div class="flashcards-answer">${answer}</div>` : `<div class="flashcards-answer" style="opacity:0.65;">Hidden — click Show Answer</div>`}
    `;
    revealBtn.textContent = runtime.showingAnswer ? 'Hide Answer' : 'Show Answer';
  };

  const nextCard = ()=>{
    if (!runtime.deck.length) return;
    runtime.index = (runtime.index + 1) % runtime.deck.length;
    runtime.showingAnswer = false;
    renderCard();
  };

  const prevCard = ()=>{
    if (!runtime.deck.length) return;
    runtime.index = (runtime.index - 1 + runtime.deck.length) % runtime.deck.length;
    runtime.showingAnswer = false;
    renderCard();
  };

  const loadDeck = async ()=>{
    runtime.loading = true;
    setStatus('Loading cards...');
    try {
      const params = new URLSearchParams();
      params.set('type', state.type);
      if (state.q) params.set('q', state.q);
      const resp = await fetch(`${apiBase()}/api/items?${params.toString()}`);
      const payload = await resp.json().catch(()=> ({}));
      if (!resp.ok || payload.ok === false){
        throw new Error(payload.error || payload.stderr || `HTTP ${resp.status}`);
      }
      const items = Array.isArray(payload.items) ? payload.items : [];
      const filtered = items.filter(matchesFilters);
      runtime.deck = filtered;
      runtime.index = 0;
      runtime.showingAnswer = false;
      if (!filtered.length){
        renderCard();
        setStatus('No cards found for the current filters.');
        return;
      }
      shuffleDeck();
      renderCard();
      setStatus(`Loaded ${runtime.deck.length} card${runtime.deck.length === 1 ? '' : 's'}.`);
    } catch (error) {
      console.error('[Chronos][Panels][Flashcards] loadDeck failed', error);
      runtime.deck = [];
      runtime.index = 0;
      runtime.showingAnswer = false;
      renderCard();
      setStatus(error?.message || 'Failed to load cards', true);
    } finally {
      runtime.loading = false;
    }
  };

  const updateState = ()=>{
    state.type = typeSelect.value || DEFAULT_TYPE;
    state.tag = (tagInput.value || '').trim();
    state.q = (searchInput.value || '').trim();
  };

  typeSelect.addEventListener('change', ()=>{ updateState(); loadDeck(); });
  tagInput.addEventListener('input', ()=>{ updateState(); });
  searchInput.addEventListener('input', ()=>{ updateState(); });
  refreshBtn.addEventListener('click', ()=>{ updateState(); loadDeck(); });
  shuffleBtn.addEventListener('click', ()=>{
    if (!runtime.deck.length){
      setStatus('No cards to shuffle.');
      return;
    }
    shuffleDeck();
    runtime.index = 0;
    runtime.showingAnswer = false;
    renderCard();
    setStatus(`Shuffled ${runtime.deck.length} card${runtime.deck.length === 1 ? '' : 's'}.`);
  });
  nextBtn.addEventListener('click', ()=>{ nextCard(); setStatus(''); });
  prevBtn.addEventListener('click', ()=>{ prevCard(); setStatus(''); });
  revealBtn.addEventListener('click', ()=>{
    runtime.showingAnswer = !runtime.showingAnswer;
    renderCard();
  });
  clearBtn.addEventListener('click', ()=>{
    tagInput.value = DEFAULT_TAG;
    searchInput.value = '';
    typeSelect.value = DEFAULT_TYPE;
    updateState();
    loadDeck();
  });

  renderCard();
  setStatus('Loading cards...');
  loadDeck();

  return {
    dispose(){
      // Nothing persistent to clean up beyond DOM removal.
    }
  };
}
