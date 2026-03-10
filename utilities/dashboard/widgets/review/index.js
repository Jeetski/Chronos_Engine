export function mount(el, context) {
  if (!document.getElementById('review-css')) {
    const link = document.createElement('link');
    link.id = 'review-css';
    link.rel = 'stylesheet';
    link.href = new URL('./review.css', import.meta.url).toString();
    document.head.appendChild(link);
  }

  el.className = 'widget review-widget';
  try { el.dataset.uiId = 'widget.review'; } catch { }

  const css = `
    .rv { display:flex; flex-direction:column; gap:10px; }
    .row { display:flex; gap:6px; align-items:center; flex-wrap: wrap; }
    .col { display:flex; flex-direction:column; gap:8px; }
    .hint { color: var(--text-dim); font-size: 12px; }
    .log { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--text-dim); background:#0f141d; border:1px solid #222835; border-radius:8px; padding:8px; max-height: 160px; overflow:auto; }
  `;
  el.innerHTML = `
    <style>${css}</style>
    <div class="header" id="rvHeader" data-ui-id="widget.review.header">
      <div class="title" data-ui-id="widget.review.title">Review</div>
      <div class="controls">
        <button class="icon-btn" id="rvMin" title="Minimize" data-ui-id="widget.review.minimize_button">_</button>
        <button class="icon-btn" id="rvClose" title="Close" data-ui-id="widget.review.close_button">x</button>
      </div>
    </div>
    <div class="content" data-ui-id="widget.review.panel">
      <div class="rv">
        <div class="row">
          <label class="hint">Type</label>
          <select id="rvType" class="input" style="width:140px;" data-ui-id="widget.review.type_select">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <label class="hint">Period</label>
          <input id="rvPeriod" class="input" style="width:140px;" placeholder="YYYY-MM-DD | YYYY-WW | YYYY-MM" data-ui-id="widget.review.period_input" />
          <button class="btn" id="rvToday" data-ui-id="widget.review.this_button">This</button>
          <div class="spacer"></div>
          <button class="btn" id="rvGenerate" data-ui-id="widget.review.generate_button">Generate</button>
          <button class="btn" id="rvOpen" data-ui-id="widget.review.open_button">Open</button>
          <button class="btn" id="rvExport" data-ui-id="widget.review.export_button">Export</button>
        </div>
        <div class="row">
          <span class="hint" data-ui-id="widget.review.tip_text">Tip: Daily uses YYYY-MM-DD, Weekly uses ISO YYYY-WW, Monthly uses YYYY-MM.</span>
        </div>
        <div class="col">
          <div class="row" style="gap:6px;">
            <button class="btn" id="rvPrev" data-ui-id="widget.review.prev_button">Prev</button>
            <button class="btn" id="rvNext" data-ui-id="widget.review.next_button">Next</button>
            <div class="spacer"></div>
            <label class="hint" style="display:flex; align-items:center; gap:6px;">
              <input type="checkbox" id="rvExpandToggle" checked data-ui-id="widget.review.expand_checkbox" />
              Expand
            </label>
            <span class="hint" id="rvStatus" data-ui-id="widget.review.status_text"></span>
          </div>
          <div id="rvLog" class="log" data-ui-id="widget.review.log_text"></div>
        </div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;

  const btnMin = el.querySelector('#rvMin');
  const btnClose = el.querySelector('#rvClose');
  const typeEl = el.querySelector('#rvType');
  const periodEl = el.querySelector('#rvPeriod');
  const btnThis = el.querySelector('#rvToday');
  const btnGen = el.querySelector('#rvGenerate');
  const btnOpen = el.querySelector('#rvOpen');
  const btnExport = el.querySelector('#rvExport');
  const btnPrev = el.querySelector('#rvPrev');
  const btnNext = el.querySelector('#rvNext');
  const statusEl = el.querySelector('#rvStatus');
  const logEl = el.querySelector('#rvLog');
  const expandChk = el.querySelector('#rvExpandToggle');

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  async function postYaml(url, obj) {
    const yaml = (o) => {
      const lines = [];
      for (const [k, v] of Object.entries(o || {})) {
        if (Array.isArray(v)) {
          lines.push(`${k}:`);
          v.forEach(it => lines.push(`  - ${JSON.stringify(it)}`));
        } else if (typeof v === 'object' && v) {
          lines.push(`${k}:`);
          for (const [k2, v2] of Object.entries(v)) lines.push(`  ${k2}: ${JSON.stringify(v2)}`);
        } else {
          lines.push(`${k}: ${JSON.stringify(v)}`);
        }
      }
      return lines.join('\n');
    };
    return await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body: yaml(obj) });
  }

  function setStatus(msg) { statusEl.textContent = msg || ''; }
  let rawReview = '';
  function setLog(text) {
    rawReview = String(text || '');
    try {
      if (!expandChk || !expandChk.checked) {
        logEl.textContent = rawReview;
        return;
      }
      const exp = (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(rawReview) : rawReview;
      logEl.textContent = exp;
    } catch {
      logEl.textContent = rawReview;
    }
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function thisWeek() {
    const d = new Date();
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
    return `${tmp.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
  }
  function thisMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function setThis() {
    const t = String(typeEl.value || 'daily');
    if (t === 'daily') periodEl.value = today();
    else if (t === 'weekly') periodEl.value = thisWeek();
    else periodEl.value = thisMonth();
  }
  function shiftPeriod(dir) {
    const t = String(typeEl.value || 'daily');
    const p = String(periodEl.value || '');
    try {
      if (t === 'daily') {
        const dt = new Date(p && /\d{4}-\d{2}-\d{2}/.test(p) ? p : today());
        dt.setDate(dt.getDate() + dir);
        periodEl.value = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      } else if (t === 'weekly') {
        const [y, w] = (p && /\d{4}-\d{2}/.test(p)) ? p.split('-').map(Number) : thisWeek().split('-').map(Number);
        const jan4 = new Date(Date.UTC(y, 0, 4));
        const jan4Day = jan4.getUTCDay() || 7;
        const week1Mon = new Date(jan4);
        week1Mon.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
        const monday = new Date(week1Mon);
        monday.setUTCDate(week1Mon.getUTCDate() + (w - 1) * 7 + (dir * 7));
        const tmp = new Date(monday);
        tmp.setUTCDate(monday.getUTCDate() + 3);
        const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
        periodEl.value = `${tmp.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
      } else {
        const [y, m] = (p && /\d{4}-\d{2}/.test(p)) ? p.split('-').map(Number) : thisMonth().split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, 1));
        dt.setUTCMonth(dt.getUTCMonth() + dir);
        periodEl.value = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
      }
    } catch {}
  }

  async function runReview(cmd, args) {
    const body = { command: cmd, args: args || [], properties: {} };
    const r = await postYaml(apiBase() + '/api/cli', body);
    return await r.text();
  }

  async function fetchReviewYaml(t, period) {
    const url = apiBase() + `/api/review?type=${encodeURIComponent(t)}&period=${encodeURIComponent(period)}`;
    let lastErr = '';
    for (let i = 0; i < 5; i++) {
      try {
        const r = await fetch(url);
        const text = await r.text();
        if (r.ok) {
          setLog(text);
          return;
        }
        lastErr = text || `HTTP ${r.status}`;
      } catch (e) {
        lastErr = String(e);
      }
      await new Promise(res => setTimeout(res, 300));
    }
    setLog(lastErr || 'Failed to load review');
  }

  btnThis.addEventListener('click', setThis);
  btnPrev.addEventListener('click', () => shiftPeriod(-1));
  btnNext.addEventListener('click', () => shiftPeriod(1));
  typeEl.addEventListener('change', setThis);

  btnGen.addEventListener('click', async () => {
    const t = String(typeEl.value || 'daily');
    const p = String(periodEl.value || '').trim();
    setStatus('Generating...');
    setLog('');
    await runReview('review', [t, p].filter(Boolean));
    await fetchReviewYaml(t, p);
    setStatus('Done');
  });
  btnOpen.addEventListener('click', async () => {
    const t = String(typeEl.value || 'daily');
    const p = String(periodEl.value || '').trim();
    setStatus('Loading...');
    setLog('');
    await fetchReviewYaml(t, p);
    setStatus('Done');
  });
  btnExport.addEventListener('click', async () => {
    const t = String(typeEl.value || 'daily');
    const p = String(periodEl.value || '').trim();
    setStatus('Exporting...');
    setLog('');
    await runReview('review', ['export', t, p].filter(Boolean));
    setStatus('Done');
  });
  expandChk.addEventListener('change', () => { setLog(rawReview); });

  btnClose.addEventListener('click', () => { el.style.display = 'none'; try { context?.bus?.emit('widget:closed', 'Review'); } catch { } });
  btnMin.addEventListener('click', () => {
    const c = el.querySelector('.content');
    if (!c) return;
    c.style.display = (c.style.display === 'none' ? '' : 'none');
    setStatus(c.style.display === 'none' ? 'Minimized.' : '');
  });

  setThis();
}
