
import { TESTS, DEFAULT_TEST_ID } from './tests.js';

const STORAGE_PREFIX = 'chronos-big5-progress:';
const SELECTED_TEST_KEY = 'chronos-big5-selected-test';

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
    try { data = JSON.parse(text); } catch {}
    if (!resp.ok || (data && typeof data === 'object' && data.ok === false)) {
        const err = (data && (data.error || data.stderr)) || text || `HTTP ${resp.status}`;
        throw new Error(err);
    }
    return data;
}

async function saveFile(path, content) {
    return apiRequest('/api/file/write', {
        method: 'POST',
        body: { path, content }
    });
}

function injectStyles() {
    if (document.getElementById('big5-wizard-styles')) return;
    const link = document.createElement('link');
    link.id = 'big5-wizard-styles';
    link.rel = 'stylesheet';
    link.href = new URL('./style.css', import.meta.url).href;
    document.head.appendChild(link);
}

export async function launch(context, options = {}) {
    injectStyles();

    function getSelectedTestId() {
        try {
            const saved = localStorage.getItem(SELECTED_TEST_KEY);
            if (saved && TESTS[saved]) return saved;
        } catch {}
        return DEFAULT_TEST_ID;
    }

    function setSelectedTestId(testId) {
        try {
            localStorage.setItem(SELECTED_TEST_KEY, testId);
        } catch {}
    }

    function getStorageKey(testId) {
        return `${STORAGE_PREFIX}${testId}`;
    }

    // State
    let currentStep = 0;
    const ANSWERS = {};
    let resultsSaved = false;
    let keyHandler = null;
    let hasSavedProgress = false;
    let savedProgressStep = null;
    let activeTestId = getSelectedTestId();
    let activeTest = TESTS[activeTestId] || TESTS[DEFAULT_TEST_ID];
    let items = activeTest.items || [];
    let batchSize = activeTest.batchSize || 10;
    let totalSteps = Math.ceil(items.length / batchSize) + 2; // Intro + Batches + Results
    let traitOrder = activeTest.traitOrder || [];
    let traitDescs = activeTest.traits || {};

    function loadProgress(testId = activeTestId) {
        try {
            const raw = localStorage.getItem(getStorageKey(testId));
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || data.testId !== testId) return null;
            return data;
        } catch {
            return null;
        }
    }

    function persistProgress(extra = {}) {
        try {
            const payload = {
                testId: activeTestId,
                step: currentStep,
                answers: { ...ANSWERS },
                updatedAt: new Date().toISOString(),
                completed: currentStep === totalSteps - 1,
                ...extra,
            };
            localStorage.setItem(getStorageKey(activeTestId), JSON.stringify(payload));
            hasSavedProgress = true;
        } catch {
        }
    }

    function clearProgress(testId = activeTestId) {
        try {
            localStorage.removeItem(getStorageKey(testId));
        } catch {
        }
        hasSavedProgress = false;
    }

    function setActiveTest(testId, { restore = true } = {}) {
        const next = TESTS[testId] || TESTS[DEFAULT_TEST_ID];
        activeTestId = next.id;
        activeTest = next;
        items = activeTest.items || [];
        batchSize = activeTest.batchSize || 10;
        totalSteps = Math.ceil(items.length / batchSize) + 2;
        traitOrder = activeTest.traitOrder || [];
        traitDescs = activeTest.traits || {};
        setSelectedTestId(activeTestId);

        Object.keys(ANSWERS).forEach(k => delete ANSWERS[k]);
        currentStep = 0;
        resultsSaved = false;
        hasSavedProgress = false;
        savedProgressStep = null;

        if (restore) {
            const saved = loadProgress(activeTestId);
            if (saved?.answers && typeof saved.answers === 'object') {
                Object.entries(saved.answers).forEach(([k, v]) => {
                    const num = Number(v);
                    if (!Number.isNaN(num)) ANSWERS[k] = num;
                });
            }
            if (Number.isInteger(saved?.step)) {
                savedProgressStep = Math.min(Math.max(saved.step, 0), totalSteps - 1);
            }
            hasSavedProgress = Object.keys(ANSWERS).length > 0 || (savedProgressStep ?? 0) > 0;
        }
    }

    // UI Shell
    const overlay = document.createElement('div');
    overlay.className = 'wizard-overlay chronos-wizard-overlay';
    overlay.innerHTML = `
    <div class="wizard-container chronos-wizard-shell">
      <div class="wizard-header chronos-wizard-header">
        <div class="wizard-title-row">
          <div class="wizard-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
              <path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/>
            </svg>
          </div>
          <div class="wizard-title-text">
            <h1>Big 5 Assessment</h1>
            <p>Psychometric calibration for your Chronos Agents</p>
          </div>
        </div>
        <button class="wizard-close" id="closeBtn" aria-label="Close">x</button>
        <div class="progress-bar">
          <div class="progress-fill" id="progressFill"></div>
        </div>
      </div>
      
      <div class="wizard-content chronos-wizard-body" id="contentArea">
        <!-- Dynamic Content -->
      </div>

      <div class="wizard-footer chronos-wizard-footer">
        <div class="step-indicator" id="stepIndicator">Intro</div>
        <div class="wizard-actions chronos-wizard-actions">
          <button id="resetBtn" class="btn secondary">Restart</button>
          <button id="prevBtn" class="btn secondary">Back</button>
          <button id="nextBtn" class="btn primary">Start Assessment</button>
        </div>
      </div>
    </div>
  `;
    document.body.appendChild(overlay);

    // Refs
    const contentArea = overlay.querySelector('#contentArea');
    const nextBtn = overlay.querySelector('#nextBtn');
    const prevBtn = overlay.querySelector('#prevBtn');
    const progressFill = overlay.querySelector('#progressFill');
    const stepIndicator = overlay.querySelector('#stepIndicator');
    const closeBtn = overlay.querySelector('#closeBtn');
    const resetBtn = overlay.querySelector('#resetBtn');

    // Logic
    function updateUI() {
        // Progress
        const pct = (currentStep / (totalSteps - 1)) * 100;
        progressFill.style.width = `${pct}%`;

        // Step Indicator
        if (currentStep === 0) stepIndicator.textContent = 'Intro';
        else if (currentStep === totalSteps - 1) stepIndicator.textContent = 'Results';
        else stepIndicator.textContent = `Part ${currentStep} of ${totalSteps - 2}`;

        // Buttons
        prevBtn.style.visibility = currentStep === 0 ? 'hidden' : 'visible';
        resetBtn.style.display = hasSavedProgress || currentStep > 0 ? '' : 'none';

        // Reset button state
        nextBtn.onclick = null;

        if (currentStep === totalSteps - 1) {
            nextBtn.textContent = 'Close';
            nextBtn.onclick = () => closeWizard();
            nextBtn.disabled = false;
        } else if (currentStep === 0) {
            nextBtn.textContent = 'Start Assessment';
            nextBtn.onclick = () => goNext();
            nextBtn.disabled = false;
        } else if (currentStep === totalSteps - 2) {
            nextBtn.textContent = 'Finish & Save';
            nextBtn.onclick = () => goNext();
        } else {
            nextBtn.textContent = 'Next';
            nextBtn.onclick = () => goNext();
        }

        renderStep();

        if (currentStep > 0 && currentStep < totalSteps - 1) {
            validateBatch();
        }
    }

    function goNext() {
        if (currentStep < totalSteps - 1) {
            currentStep++;
            persistProgress();
            updateUI();
        }
    }

    function goPrev() {
        if (currentStep > 0) {
            currentStep--;
            persistProgress();
            updateUI();
        }
    }
    prevBtn.onclick = goPrev;

    function closeWizard() {
        if (keyHandler) {
            window.removeEventListener('keydown', keyHandler);
            keyHandler = null;
        }
        overlay.remove();
    }

    function getTestSelectorHtml() {
        const cards = Object.values(TESTS).map(test => {
            const active = test.id === activeTestId;
            const pros = (test.pros || []).map(p => `<li>${p}</li>`).join('');
            const cons = (test.cons || []).map(c => `<li>${c}</li>`).join('');
            return `
        <div class="test-card${active ? ' active' : ''}">
          <div class="test-card-header">
            <div>
              <h3>${test.shortName}</h3>
              <p>${test.itemCount} items | ${test.timeEstimate}</p>
            </div>
            <button class="btn secondary" data-select-test="${test.id}">${active ? 'Selected' : 'Use this test'}</button>
          </div>
          <div class="test-card-body">
            <div class="test-meta">
              <span>Source:</span>
              <a href="${test.source.url}" target="_blank" rel="noopener">${test.source.label}</a>
            </div>
            <div class="test-columns">
              <div>
                <strong>Pros</strong>
                <ul>${pros}</ul>
              </div>
              <div>
                <strong>Cons</strong>
                <ul>${cons}</ul>
              </div>
            </div>
          </div>
        </div>
      `;
        }).join('');

        return `
      <div class="test-selector">
        <h2>Choose a Test</h2>
        <p>Select the profile depth you want right now. You can retake or switch later.</p>
        <div class="test-card-grid">${cards}</div>
      </div>
    `;
    }

    function bindTestSelector() {
        contentArea.querySelectorAll('[data-select-test]').forEach(btn => {
            btn.addEventListener('click', () => {
                const testId = btn.getAttribute('data-select-test');
                if (!testId || testId === activeTestId) return;
                setActiveTest(testId, { restore: true });
                updateUI();
            });
        });
    }

    function renderStep() {
        contentArea.innerHTML = '';
        contentArea.scrollTop = 0;

        if (currentStep === 0) {
            contentArea.innerHTML = `
        <div class="slide-intro">
          <div class="intro-icon-large">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
              <path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/>
              <path d="M12 6v2m0 8v2m-6-6h2m8 0h2"/>
            </svg>
          </div>
          <h2>Know Thyself</h2>
          <p>
            This protocol uses ${activeTest.shortName} to calibrate your psychometric profile.
            Your Familiars will use this data to better understand your needs, communication style, 
            and optimal workflows.
          </p>
          <div class="alert-box">
             There are ${items.length} statements. Answer honestly based on how you usually are, 
            not how you want to be.
          </div>
          <div class="source-link">
            Source: <a href="${activeTest.source.url}" target="_blank" rel="noopener">${activeTest.source.label}</a>
          </div>
          ${hasSavedProgress ? `
          <div class="resume-box">
            <strong>Resume detected.</strong>
            <span>Pick up where you left off or restart.</span>
            <div class="resume-actions">
              <button class="btn secondary" data-resume>Resume</button>
              <button class="btn secondary" data-restart>Restart</button>
            </div>
          </div>
          ` : ''}
        </div>
        ${getTestSelectorHtml()}
      `;
            const resumeBtn = contentArea.querySelector('[data-resume]');
            const restartBtn = contentArea.querySelector('[data-restart]');
            bindTestSelector();
            if (resumeBtn) {
                resumeBtn.addEventListener('click', () => {
                    if (currentStep === 0 && hasSavedProgress) {
                        const fallback = loadProgress();
                        const step = Number.isInteger(savedProgressStep) ? savedProgressStep : fallback?.step;
                        if (Number.isInteger(step)) {
                            currentStep = Math.min(Math.max(step, 0), totalSteps - 1);
                            updateUI();
                        }
                    }
                });
            }
            if (restartBtn) {
                restartBtn.addEventListener('click', () => resetWizard());
            }
        } else if (currentStep === totalSteps - 1) {
            renderResults();
        } else {
            const batchIndex = currentStep - 1;
            const start = batchIndex * batchSize;
            const end = start + batchSize;
            const batch = items.slice(start, end);

            const container = document.createElement('div');
            container.className = 'question-group';

            batch.forEach((q, idx) => {
                const qEl = document.createElement('div');
                qEl.className = 'question-item';
                qEl.dataset.id = q.id;

                const savedVal = ANSWERS[q.id];

                qEl.innerHTML = `
          <div class="q-text">
            <span class="q-num">${start + idx + 1}.</span>
            <span>${q.text}</span>
          </div>
          <div class="likert-scale">
            ${[1, 2, 3, 4, 5].map(val => `
              <label class="likert-option">
                <input type="radio" name="${q.id}" value="${val}" class="likert-input" ${savedVal == val ? 'checked' : ''}>
                <div class="likert-circle"></div>
                <span class="likert-label">${val === 1 ? 'Disagree' : (val === 5 ? 'Agree' : '')}</span>
              </label>
            `).join('')}
          </div>
        `;

                const inputs = qEl.querySelectorAll('input');
                inputs.forEach(inp => {
                    inp.addEventListener('change', (e) => {
                        ANSWERS[q.id] = parseInt(e.target.value);
                        persistProgress();
                        validateBatch();
                        qEl.classList.add('active');
                        setTimeout(() => qEl.classList.remove('active'), 300);
                    });
                });

                container.appendChild(qEl);
            });
            contentArea.appendChild(container);
        }
    }

    function validateBatch() {
        if (currentStep === 0 || currentStep === totalSteps - 1) {
            nextBtn.disabled = false;
            return;
        }
        const batchIndex = currentStep - 1;
        const start = batchIndex * batchSize;
        const end = start + batchSize;
        const batch = items.slice(start, end);
        const allAnswered = batch.every(q => ANSWERS[q.id] !== undefined);
        nextBtn.disabled = !allAnswered;
    }

    function calculateScores() {
        const traitScores = {};
        const traitCounts = {};
        const facetScores = {};
        const facetCounts = {};
        const facetByTrait = {};

        traitOrder.forEach(trait => {
            traitScores[trait] = 0;
            traitCounts[trait] = 0;
        });

        items.forEach(q => {
            const val = ANSWERS[q.id];
            if (val === undefined) return;
            let score = val;
            if (q.key === -1) score = 6 - val;

            if (!(q.trait in traitScores)) {
                traitScores[q.trait] = 0;
                traitCounts[q.trait] = 0;
            }
            traitScores[q.trait] += score;
            traitCounts[q.trait] += 1;

            if (q.facet) {
                if (!facetByTrait[q.trait]) facetByTrait[q.trait] = [];
                if (!facetByTrait[q.trait].includes(q.facet)) facetByTrait[q.trait].push(q.facet);
                if (!(q.facet in facetScores)) {
                    facetScores[q.facet] = 0;
                    facetCounts[q.facet] = 0;
                }
                facetScores[q.facet] += score;
                facetCounts[q.facet] += 1;
            }
        });

        const traitResults = {};
        Object.keys(traitScores).forEach(trait => {
            const raw = traitScores[trait];
            const count = traitCounts[trait] || 0;
            if (!count) return;
            const max = count * 5;
            const min = count * 1;
            traitResults[trait] = Math.round(((raw - min) / (max - min)) * 100);
        });

        const facetResults = {};
        Object.keys(facetScores).forEach(facet => {
            const raw = facetScores[facet];
            const count = facetCounts[facet] || 0;
            if (!count) return;
            const max = count * 5;
            const min = count * 1;
            facetResults[facet] = Math.round(((raw - min) / (max - min)) * 100);
        });

        return { traits: traitResults, facets: facetResults, facetByTrait };
    }

    function getColor(score) {
        if (score > 66) return '#10B981';
        if (score > 33) return '#3B82F6';
        return '#64748B';
    }

    function buildFacetHtml(facets, facetByTrait) {
        if (!activeTest.hasFacets) return '';
        const blocks = traitOrder.map(trait => {
            const list = facetByTrait[trait] || [];
            if (!list.length) return '';
            const rows = list.map(facet => {
                const parts = String(facet).split(' ');
                const code = parts.shift();
                const name = parts.join(' ') || facet;
                const score = facets[facet];
                if (score === undefined) return '';
                return `
                <div class="facet-row">
                  <span class="facet-code">${code}</span>
                  <span class="facet-name">${name}</span>
                  <span class="facet-score">${score}%</span>
                </div>
                `;
            }).join('');
            return `
            <div class="facet-card">
              <h4>${trait}</h4>
              ${rows}
            </div>
            `;
        }).filter(Boolean).join('');

        if (!blocks) return '';
        return `
        <div class="facet-section">
          <h3>Facet Breakdown</h3>
          <div class="facet-grid">
            ${blocks}
          </div>
        </div>
        `;
    }

    function renderRadarChart(container, scores) {
        if (!container) return;
        container.innerHTML = '';
        const size = 380;
        const center = size / 2;
        const maxRadius = 130;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
        svg.setAttribute('class', 'radar-chart');

        const levels = [0.25, 0.5, 0.75, 1];
        levels.forEach(level => {
            const circle = document.createElementNS(svg.namespaceURI, 'circle');
            circle.setAttribute('cx', center);
            circle.setAttribute('cy', center);
            circle.setAttribute('r', maxRadius * level);
            circle.setAttribute('class', 'radar-grid');
            svg.appendChild(circle);
        });

        traitOrder.forEach((trait, idx) => {
            const angle = -Math.PI / 2 + (idx * (2 * Math.PI / traitOrder.length));
            const x = center + Math.cos(angle) * maxRadius;
            const y = center + Math.sin(angle) * maxRadius;
            const line = document.createElementNS(svg.namespaceURI, 'line');
            line.setAttribute('x1', center);
            line.setAttribute('y1', center);
            line.setAttribute('x2', x);
            line.setAttribute('y2', y);
            line.setAttribute('class', 'radar-axis');
            svg.appendChild(line);

            const label = document.createElementNS(svg.namespaceURI, 'text');
            const labelRadius = maxRadius + 30;
            const lx = center + Math.cos(angle) * labelRadius;
            const ly = center + Math.sin(angle) * labelRadius;
            label.setAttribute('x', lx);
            label.setAttribute('y', ly);
            label.setAttribute('class', 'radar-label');
            if (Math.abs(Math.cos(angle)) < 0.3) label.setAttribute('text-anchor', 'middle');
            else if (Math.cos(angle) > 0) label.setAttribute('text-anchor', 'start');
            else label.setAttribute('text-anchor', 'end');
            label.textContent = trait;
            svg.appendChild(label);
        });

        const points = traitOrder.map((trait, idx) => {
            const angle = -Math.PI / 2 + (idx * (2 * Math.PI / traitOrder.length));
            const value = Math.max(0, Math.min(100, scores[trait] || 0));
            const radius = (value / 100) * maxRadius;
            const x = center + Math.cos(angle) * radius;
            const y = center + Math.sin(angle) * radius;
            return { x, y };
        });

        const polygon = document.createElementNS(svg.namespaceURI, 'polygon');
        polygon.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
        polygon.setAttribute('class', 'radar-area');
        svg.appendChild(polygon);

        const outline = document.createElementNS(svg.namespaceURI, 'polygon');
        outline.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
        outline.setAttribute('class', 'radar-outline');
        svg.appendChild(outline);

        points.forEach(p => {
            const dot = document.createElementNS(svg.namespaceURI, 'circle');
            dot.setAttribute('cx', p.x);
            dot.setAttribute('cy', p.y);
            dot.setAttribute('r', 3.5);
            dot.setAttribute('class', 'radar-dot');
            svg.appendChild(dot);
        });

        container.appendChild(svg);
    }

    async function renderResults() {
        const { traits, facets, facetByTrait } = calculateScores();
        const facetHtml = buildFacetHtml(facets, facetByTrait);
        contentArea.innerHTML = `
      <div class="results-grid">
        <div class="chart-container" data-radar>
        </div>
        <div class="traits-list">
          ${traitOrder.map(trait => {
            const score = traits[trait];
            return `
            <div class="trait-card" style="border-left-color: ${getColor(score)}">
              <h3>${trait} <span class="trait-score">${score}%</span></h3>
              <p class="trait-desc">${traitDescs[trait] || ''}</p>
            </div>
            `;
          }).join('')}
        </div>
      </div>
      ${facetHtml}
      <div class="save-status" data-save-status>Saving results...</div>
      <div class="source-link">
        Source: <a href="${activeTest.source.url}" target="_blank" rel="noopener">${activeTest.source.label}</a>
      </div>
      <div class="retake-row">
        <button class="btn secondary" data-retake>Retake assessment</button>
      </div>
    `;

        renderRadarChart(contentArea.querySelector('[data-radar]'), traits);

        const statusEl = contentArea.querySelector('[data-save-status]');
        const retakeBtn = contentArea.querySelector('[data-retake]');
        if (retakeBtn) retakeBtn.addEventListener('click', () => resetWizard());
        try {
            if (!resultsSaved) {
                await persistData(traits, facets, ANSWERS);
                resultsSaved = true;
                persistProgress({ completed: true, completedAt: new Date().toISOString() });
            }
            if (statusEl) {
                statusEl.textContent = 'Results saved to Profile.';
                statusEl.dataset.tone = 'success';
            }
        } catch (err) {
            if (statusEl) {
                statusEl.textContent = `Save failed: ${err.message || 'Unknown error'}`;
                statusEl.dataset.tone = 'error';
            }
            console.error('[Chronos][Big5] Save failed', err);
        }
    }

    async function persistData(traits, facets, answers) {
        const dateStr = new Date().toISOString().split('T')[0];
        const timestamp = new Date().toISOString();

        const snapshot = {
            test_id: activeTestId,
            test_name: activeTest.name,
            source: activeTest.source?.url || '',
            item_count: items.length,
            date: dateStr,
            timestamp,
            traits,
            facets,
            answers
        };

        // Manual YAML construction
        let yamlSnapshot = `test_id: ${activeTestId}\n`;
        yamlSnapshot += `test_name: ${JSON.stringify(activeTest.name)}\n`;
        if (activeTest.source?.url) yamlSnapshot += `source: ${activeTest.source.url}\n`;
        yamlSnapshot += `item_count: ${items.length}\n`;
        yamlSnapshot += `date: ${dateStr}\ntimestamp: ${timestamp}\ntraits:\n`;
        Object.keys(traits).forEach(t => { yamlSnapshot += `  ${t}: ${traits[t]}\n`; });
        if (activeTest.hasFacets && facets && Object.keys(facets).length) {
            yamlSnapshot += `facets:\n`;
            Object.keys(facets).forEach(f => { yamlSnapshot += `  ${f}: ${facets[f]}\n`; });
        }
        yamlSnapshot += `answers:\n`;
        Object.keys(answers).forEach(id => { yamlSnapshot += `  ${id}: ${answers[id]}\n`; });

        await saveFile(`User/Profile/Big5/results_${activeTestId}_${dateStr}.yml`, yamlSnapshot);
        await saveFile(`User/Profile/personality_${activeTestId}.yml`, yamlSnapshot);
        await saveFile(`User/Profile/personality.yml`, yamlSnapshot);

        let summary = `## ${activeTest.name} ${dateStr}\n\n`;
        Object.keys(traits).forEach(t => {
            const val = traits[t];
            let level = val > 66 ? "High" : (val < 33 ? "Low" : "Moderate");
            summary += `- **${t}**: ${val}% (${level})\n`;
        });

        if (activeTest.hasFacets && facets && Object.keys(facets).length) {
            summary += `\n### Facets\n\n`;
            Object.keys(facets).forEach(f => {
                summary += `- **${f}**: ${facets[f]}%\n`;
            });
        }

        let currentMd = "";
        try {
            const res = await apiRequest(`/api/file/read?path=User/Profile/personality.md`);
            if (res.ok !== false) currentMd = res.content || "";
        } catch { }

        const newMd = currentMd + "\n\n" + summary;
        await saveFile(`User/Profile/personality.md`, newMd);
    }

    function resetWizard() {
        clearProgress();
        resultsSaved = false;
        currentStep = 0;
        Object.keys(ANSWERS).forEach(k => delete ANSWERS[k]);
        updateUI();
    }

    // Init
    setActiveTest(activeTestId, { restore: true });

    closeBtn.addEventListener('click', closeWizard);
    overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay) closeWizard();
    });
    keyHandler = (ev) => {
        if (ev.key === 'Escape') closeWizard();
    };
    window.addEventListener('keydown', keyHandler);

    const helpBtn = context?.createHelpButton?.('Big5', {
        className: 'wizard-help-btn icon-btn help-btn',
        fallbackLabel: 'Big 5 Assessment'
    });
    if (helpBtn) {
        helpBtn.classList.add('wizard-help-btn');
        overlay.querySelector('.wizard-container')?.appendChild(helpBtn);
    }

    resetBtn.addEventListener('click', () => resetWizard());

    updateUI();
}
