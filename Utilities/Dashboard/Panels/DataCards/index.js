const PANEL_BASE_ID = 'datacards';
const PANEL_STATE_PREFIX = 'chronos_datacards_panel_state_';
const INSTANCE_STORAGE_KEY = 'chronos_datacards_panel_instances_v1';
const STYLE_ID = 'cockpit-datacards-panel-style';

let managerRef = null;
let cachedInstances = null;

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
    .datacards-panel-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      color: var(--chronos-text);
      font-size: 13px;
      gap: 0;
      overflow: hidden;
    }
    .datacards-panel-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      flex-shrink: 0;
    }
    .datacards-panel-top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .datacards-panel-title {
      font-size: 14px;
      font-weight: 600;
      margin: 0;
      color: var(--chronos-text);
    }
    .datacards-panel-controls {
      display: flex;
      gap: 4px;
    }
    .datacards-panel-select {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      color: var(--chronos-text);
      border-radius: 6px;
      padding: 4px 6px;
      font-size: 11px;
      max-width: 120px;
    }
    .datacards-search-input {
      background: rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.1);
      color: var(--chronos-text);
      border-radius: 6px;
      padding: 4px 6px;
      font-size: 11px;
      width: 100%;
    }
    .datacards-panel-body {
      flex: 1;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      padding-top: 8px;
    }
    .datacards-card-viewer {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      overflow: hidden;
      position: relative;
    }
    .datacards-card-content {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
    }
    .datacard-field-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: 12px;
    }
    .datacard-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: rgba(255,255,255,0.4);
    }
    .datacard-value {
      font-size: 13px;
      color: rgba(255,255,255,0.9);
      word-break: break-word;
    }
    .datacards-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 8px;
      flex-shrink: 0;
    }
    .datacards-nav-btn {
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        color: var(--chronos-text);
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 16px; 
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 36px;
    }
    .datacards-nav-btn:hover {
        background: rgba(255,255,255,0.15);
    }
    .datacards-nav-btn:disabled {
        opacity: 0.3;
        cursor: default;
    }
    .datacards-counter {
        font-size: 11px;
        color: rgba(255,255,255,0.5);
    }
    .datacards-panel-empty {
      text-align: center;
      padding: 20px;
      color: rgba(255,255,255,0.4);
      font-style: italic;
    }
    .datacards-panel-btn {
        background: transparent;
        border: 1px solid rgba(255,255,255,0.2);
        color: rgba(255,255,255,0.8);
        border-radius: 4px;
        font-size: 11px;
        padding: 2px 6px;
        cursor: pointer;
    }
    .datacards-panel-btn:hover {
        background: rgba(255,255,255,0.1);
    }
  `;
    document.head.appendChild(style);
}

function apiBase() {
    const origin = window.location?.origin;
    if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
    return origin;
}

function readStoredJSON(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function writeStoredJSON(key, value) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
    } catch { }
}

// Instance Management (allowing multiple data card panels)
function loadInstanceRecords() {
    if (cachedInstances) return cachedInstances;
    const stored = readStoredJSON(INSTANCE_STORAGE_KEY);
    if (Array.isArray(stored) && stored.length) {
        cachedInstances = stored;
    } else {
        cachedInstances = [{ id: PANEL_BASE_ID, label: 'Data Cards' }];
        persistInstances();
    }
    return cachedInstances;
}

function persistInstances() {
    if (!cachedInstances) return;
    writeStoredJSON(INSTANCE_STORAGE_KEY, cachedInstances);
}

function generateInstanceId() {
    return `${PANEL_BASE_ID}-${Math.random().toString(36).slice(2, 8)}`;
}

function createInstanceRecord(label) {
    const instances = loadInstanceRecords();
    const record = {
        id: generateInstanceId(),
        label: label || 'Data Cards',
    };
    instances.push(record);
    persistInstances();
    return record;
}

function createDefinition(instance) {
    return {
        id: instance.id,
        label: instance.label,
        defaultVisible: false,
        defaultPosition: { x: 100, y: 100 },
        size: { width: 340, height: 460 },
        mount: (root) => mountDataCardsPanel(root, instance),
        menuKey: PANEL_BASE_ID,
        menuLabel: 'Data Cards',
        menuPrimary: instance.id === PANEL_BASE_ID,
    };
}

function registerPanels(manager) {
    injectStyles();
    managerRef = manager;
    const instances = loadInstanceRecords();
    instances.forEach(instance => manager.registerPanel(createDefinition(instance)));

    // Public Service for creating new instances
    window.DataCardsPanelService = {
        create: (label) => {
            const record = createInstanceRecord(label);
            manager.registerPanel(createDefinition(record));
            manager.setVisible(record.id, true);
        }
    };
}

export function register(manager) {
    registerPanels(manager);
}

async function fetchSeriesList() {
    const res = await fetch(`${apiBase()}/api/datacards/series`);
    const data = await res.json();
    return data.ok ? data.series : [];
}

async function fetchCards(series) {
    const res = await fetch(`${apiBase()}/api/datacards/series/${series}/cards`);
    const data = await res.json();
    return data.ok ? data.cards : [];
}

function mountDataCardsPanel(root, instance) {
    injectStyles();
    const stateKey = `${PANEL_STATE_PREFIX}${instance.id}`;
    // Load initial state
    const savedState = readStoredJSON(stateKey) || {};

    let currentSeries = savedState.series || '';
    let currentIndex = savedState.index || 0;
    let searchQuery = savedState.query || '';
    let allCards = [];
    let displayCards = [];

    root.classList.add('datacards-panel-shell');
    root.innerHTML = `
    <div class="datacards-panel-header">
        <div class="datacards-panel-top-row">
             <span class="datacards-panel-title">Data Cards</span>
             <div class="datacards-panel-controls">
                <button class="datacards-panel-btn refresh-btn" title="Refresh">↻</button>
                <button class="datacards-panel-btn new-panel-btn" title="New Panel">+</button>
             </div>
        </div>
        <div style="display: flex; gap: 8px;">
            <select class="datacards-panel-select series-select">
                <option value="" disabled selected>Select Series</option>
            </select>
            <select class="datacards-panel-select sort-select">
                <option value="order">Order</option>
                <option value="name">Name</option>
                <option value="newest">Newest</option>
            </select>
        </div>
        <input type="text" class="datacards-search-input" placeholder="Search cards..." value="${searchQuery}">
    </div>
    <div class="datacards-panel-body">
        <div class="datacards-panel-empty">Select a series</div>
    </div>
    <div class="datacards-footer">
        <button class="datacards-nav-btn prev-btn">‹</button>
        <span class="datacards-counter">-- / --</span>
        <button class="datacards-nav-btn next-btn">›</button>
    </div>
  `;

    const select = root.querySelector('.series-select');
    const sortSelect = root.querySelector('.sort-select');
    const searchInput = root.querySelector('.datacards-search-input');
    const body = root.querySelector('.datacards-panel-body');
    const refreshBtn = root.querySelector('.refresh-btn');
    const newPanelBtn = root.querySelector('.new-panel-btn');
    const prevBtn = root.querySelector('.prev-btn');
    const nextBtn = root.querySelector('.next-btn');
    const counter = root.querySelector('.datacards-counter');

    const updateFooter = () => {
        if (displayCards.length === 0) {
            counter.textContent = "0 / 0";
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            return;
        }
        counter.textContent = `${currentIndex + 1} / ${displayCards.length}`;
        prevBtn.disabled = currentIndex <= 0;
        nextBtn.disabled = currentIndex >= displayCards.length - 1;
    };

    const renderCurrentCard = () => {
        body.innerHTML = '';
        if (displayCards.length === 0) {
            body.innerHTML = '<div class="datacards-panel-empty">No cards found matching criteria.</div>';
            updateFooter();
            return;
        }

        const card = displayCards[currentIndex];
        if (!card) {
            // Fallback if index is out of bounds
            currentIndex = 0;
            if (displayCards.length) renderCurrentCard();
            return;
        }

        const viewer = document.createElement('div');
        viewer.className = 'datacards-card-viewer';

        let html = '<div class="datacards-card-content">';

        // Title / ID
        html += `
        <div class="datacard-field-row" style="margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
            <div class="datacard-value" style="font-size: 18px; font-weight: 700;">${card.name || card.title || card.id}</div> 
             ${card.id && card.id !== card.name ? `<div class="datacard-label">ID: ${card.id}</div>` : ''}
        </div>
      `;

        // Fields
        const ignore = new Set(['name', 'title', 'id', 'description', 'notes', 'order']);

        // Description first if exists
        if (card.description || card.notes) {
            html += `
            <div class="datacard-field-row">
                <div class="datacard-label">Description</div>
                <div class="datacard-value" style="white-space: pre-wrap;">${card.description || card.notes}</div>
            </div>
           `;
        }

        // Dynamic fields
        Object.entries(card).forEach(([k, v]) => {
            if (ignore.has(k)) return;
            if (v === null || v === undefined || v === '') return;
            if (typeof v === 'object') v = JSON.stringify(v);

            html += `
            <div class="datacard-field-row">
                <div class="datacard-label">${k.replace(/_/g, ' ')}</div>
                <div class="datacard-value">${v}</div>
            </div>
          `;
        });

        // Manual Order if exists
        if (card.order !== undefined) {
            html += `
            <div class="datacard-field-row" style="margin-top: auto; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
                <div class="datacard-label"># ${card.order}</div>
            </div>
          `;
        }

        html += '</div>';
        viewer.innerHTML = html;
        body.appendChild(viewer);

        updateFooter();
    };

    const applySort = () => {
        const mode = sortSelect.value;
        displayCards.sort((a, b) => {
            if (mode === 'order') {
                // Order field (asc), then Name
                const oa = typeof a.order === 'number' ? a.order : 999999;
                const ob = typeof b.order === 'number' ? b.order : 999999;
                if (oa !== ob) return oa - ob;
                return String(a.name || a.id).localeCompare(String(b.name || b.id));
            }
            if (mode === 'name') {
                return String(a.name || a.id).localeCompare(String(b.name || b.id));
            }
            if (mode === 'newest') {
                // Assuming alphanumeric ID or imported_at might indicate age, but usually filesystem order is random
                // Let's rely on imported_at if exists
                const ta = a.imported_at || '';
                const tb = b.imported_at || '';
                return tb.localeCompare(ta);
            }
            return 0;
        });
    };

    const filterAndRender = () => {
        const q = searchInput.value.toLowerCase().trim();
        if (!q) {
            displayCards = [...allCards];
        } else {
            displayCards = allCards.filter(c => {
                // Search in values
                return Object.values(c).some(val =>
                    val && String(val).toLowerCase().includes(q)
                );
            });
        }
        applySort();
        // If we filtered, reset index unless we can find the previous card
        // For now, simple reset to 0 in search is safer UX
        currentIndex = 0;
        renderCurrentCard();

        // Save state
        writeStoredJSON(stateKey, {
            series: currentSeries,
            index: currentIndex,
            query: q
        });
    };

    const loadCards = async () => {
        if (!currentSeries) {
            body.innerHTML = '<div class="datacards-panel-empty">Select a series</div>';
            updateFooter();
            return;
        }
        body.innerHTML = '<div class="datacards-panel-empty">Loading...</div>';
        try {
            allCards = await fetchCards(currentSeries);
            filterAndRender();
        } catch (e) {
            body.innerHTML = `<div class="datacards-panel-empty">Error: ${e}</div>`;
        }
    };

    const init = async () => {
        const series = await fetchSeriesList();
        select.innerHTML = '<option value="" disabled>Select Series</option>';
        if (series.length === 0) {
            select.innerHTML += '<option value="" disabled>No series found</option>';
        }
        series.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            if (s === currentSeries) opt.selected = true;
            select.appendChild(opt);
        });

        if (currentSeries) {
            loadCards();
        } else {
            body.innerHTML = '<div class="datacards-panel-empty">Select a series</div>';
            updateFooter();
        }
    };

    // Event Listeners
    select.addEventListener('change', (e) => {
        currentSeries = e.target.value;
        currentIndex = 0;
        loadCards();
    });

    sortSelect.addEventListener('change', () => {
        filterAndRender();
    });

    searchInput.addEventListener('input', () => {
        filterAndRender();
    });

    refreshBtn.addEventListener('click', () => {
        init();
    });

    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex--;
            renderCurrentCard();
            writeStoredJSON(stateKey, { series: currentSeries, index: currentIndex, query: searchInput.value });
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentIndex < displayCards.length - 1) {
            currentIndex++;
            renderCurrentCard();
            writeStoredJSON(stateKey, { series: currentSeries, index: currentIndex, query: searchInput.value });
        }
    });

    newPanelBtn.addEventListener('click', () => {
        window.DataCardsPanelService?.create?.();
    });

    init();

    return {
        dispose() {
            // cleanup if needed
        }
    };
}
