export function mount(el, context) {
  // Load CSS
  if (!document.getElementById('review-css')) {
    const link = document.createElement('link');
    link.id = 'review-css';
    link.rel = 'stylesheet';
    link.href = './Widgets/Review/review.css';
    document.head.appendChild(link);
  }

  el.className = 'widget review-widget';

  const css = `
    .rv { display:flex; flex-direction:column; gap:10px; }
    .row { display:flex; gap:6px; align-items:center; flex-wrap: wrap; }
    .col { display:flex; flex-direction:column; gap:8px; }
    .hint { color: var(--text-dim); font-size: 12px; }
    .log { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--text-dim); background:#0f141d; border:1px solid #222835; border-radius:8px; padding:8px; max-height: 160px; overflow:auto; }
  `;
  el.innerHTML = `
    <style>${css}</style>
    <div class="header" id="rvHeader">
      <div class="title">Review</div>
      <div class="controls">
        <button class="icon-btn" id="rvMin" title="Minimize">_</button>
        <button class="icon-btn" id="rvClose" title="Close">x</button>
      </div>
    </div>
    <div class="content">
      <div class="rv">
        <div class="row">
          <label class="hint">Type</label>
          <select id="rvType" class="input" style="width:140px;">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <label class="hint">Period</label>
          <input id="rvPeriod" class="input" style="width:140px;" placeholder="YYYY-MM-DD | YYYY-WW | YYYY-MM" />
          <button class="btn" id="rvToday">This</button>
          <div class="spacer"></div>
          <button class="btn" id="rvGenerate">Generate</button>
          <button class="btn" id="rvOpen">Open</button>
          <button class="btn" id="rvExport">Export</button>
        </div>
        <div class="row">
          <span class="hint">Tip: Daily uses YYYY-MM-DD, Weekly uses ISO YYYY-WW, Monthly uses YYYY-MM.</span>
        </div>
        <div class="col">
          <div class="row" style="gap:6px;">
            <button class="btn" id="rvPrev">Prev</button>
            <button class="btn" id="rvNext">Next</button>
            <div class="spacer"></div>
            <span class="hint" id="rvStatus"></span>
          </div>
          <div id="rvLog" class="log"></div>
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
  // Expand toggle UI
  const expandWrap = document.createElement('label'); expandWrap.className = 'hint'; expandWrap.style.display = 'flex'; expandWrap.style.alignItems = 'center'; expandWrap.style.gap = '6px';
  const expandChk = document.createElement('input'); expandChk.type = 'checkbox'; expandChk.id = 'rvExpandToggle'; expandChk.checked = true;
  expandWrap.append(expandChk, document.createTextNode('Expand'));
  try { statusEl.parentElement.insertBefore(expandWrap, statusEl); } catch { }

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  async function postYaml(url, obj) {
    const yaml = (o) => {
      const lines = []; for (const [k, v] of Object.entries(o || {})) {
        if (Array.isArray(v)) { lines.push(`${k}:`); v.forEach(it => lines.push(`  - ${JSON.stringify(it)}`)); }
        else if (typeof v === 'object' && v) { lines.push(`${k}:`); for (const [k2, v2] of Object.entries(v)) lines.push(`  ${k2}: ${JSON.stringify(v2)}`); }
        else { lines.push(`${k}: ${JSON.stringify(v)}`); }
      } return lines.join('\n');
    };
    return await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body: yaml(obj) });
  }

  function setStatus(msg) { statusEl.textContent = msg || ''; }
  function appendLog(text) { logEl.textContent = String(logEl.textContent || '') + (text ? (String(text).endsWith('\n') ? text : text + '\n') : ''); logEl.scrollTop = logEl.scrollHeight; }
  let __rawReview = '';
  function setLog(text) {
    __rawReview = String(text || '');
    try {
      if (!expandChk || !expandChk.checked) { logEl.textContent = __rawReview; return; }
      const exp = (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(__rawReview) : __rawReview;
      logEl.textContent = exp;
    } catch { logEl.textContent = __rawReview; }
  }

  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function thisWeek() { const d = new Date(); const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dayNum = tmp.getUTCDay() || 7; tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum); const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1)); const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7); return `${tmp.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`; }
  function thisMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
  function shiftPeriod(dir) { // dir = -1 or +1
    const t = String(typeEl.value || 'daily');
    let p = String(periodEl.value || '');
    try {
      if (t === 'daily') {
        const dt = new Date(p && /\d{4}-\d{2}-\d{2}/.test(p) ? p : today());
        dt.setDate(dt.getDate() + dir);
        periodEl.value = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      } else if (t === 'weekly') {
        // Rough week shift: convert ISO to date by assuming Monday of that week
        const [y, w] = (p && /\d{4}-\d{2}/.test(p)) ? p.split('-').map(Number) : thisWeek().split('-').map(Number);
        const jan4 = new Date(Date.UTC(y, 0, 4)); const jan4Day = jan4.getUTCDay() || 7; const week1Mon = new Date(jan4); week1Mon.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
        const monday = new Date(week1Mon); monday.setUTCDate(week1Mon.getUTCDate() + (w - 1) * 7 + (dir * 7));
        // derive ISO week from monday
        const tmp = new Date(monday); const dayNum = 1; tmp.setUTCDate(monday.getUTCDate() + (4 - dayNum)); const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
        periodEl.value = `${tmp.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
      } else {
        const [y, m] = (p && /\d{4}-\d{2}/.test(p)) ? p.split('-').map(Number) : thisMonth().split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, 1)); dt.setUTCMonth(dt.getUTCMonth() + dir);
        periodEl.value = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
      }
    } catch { }
  }

  async function runReview(cmd, args) {
    const body = { command: cmd, args: args || [], properties: {} };
    try {
      const r = await postYaml(apiBase() + "/api/cli", body);
      const text = await r.text();
      // Still return for debugging, but do not append to log here
      return text;
    } catch (e) {
      appendLog(String(e)); return '';
    }
  }

  async function fetchReviewYaml(t, period) {
    // Retry a few times to allow file generation to complete
    const url = apiBase() + `/api/review?type=${encodeURIComponent(t)}&period=${encodeURIComponent(period)}`;
    let lastErr = '';
    for (let i = 0; i < 5; i++) {
      try {
        const r = await fetch(url);
        const text = await r.text();
        if (r.ok) { setLog(text); return; }
        lastErr = text || `HTTP ${r.status}`;
      } catch (e) { lastErr = String(e); }
      await new Promise(res => setTimeout(res, 300));
    }
    appendLog(lastErr || 'Failed to load review');
  }

  function setThis() {
    const t = String(typeEl.value || 'daily');
    if (t === 'daily') periodEl.value = today();
    else if (t === 'weekly') periodEl.value = thisWeek();
    else periodEl.value = thisMonth();
  }

  btnThis.addEventListener('click', setThis);
  btnPrev.addEventListener('click', () => shiftPeriod(-1));
  btnNext.addEventListener('click', () => shiftPeriod(+1));
  typeEl.addEventListener('change', setThis);

  btnGen.addEventListener('click', async () => {
    const t = String(typeEl.value || 'daily');
    const p = String(periodEl.value || '').trim();
    setStatus('Generating...'); setLog('');
    await runReview('review', [t, p].filter(Boolean));
    await fetchReviewYaml(t, p);
    setStatus('Done');
  });
  btnOpen.addEventListener('click', async () => {
    const t = String(typeEl.value || 'daily');
    const p = String(periodEl.value || '').trim();
    setStatus('Loading...'); setLog('');
    await fetchReviewYaml(t, p);
    setStatus('Done');
  });
  expandChk.addEventListener('change', () => { setLog(__rawReview); });
  btnExport.addEventListener('click', async () => {
    const t = String(typeEl.value || 'daily');
    const p = String(periodEl.value || '').trim();
    setStatus('Exporting...'); setLog('');
    await runReview('review', ['export', t, p].filter(Boolean));
    setStatus('Done');
  });

  btnClose.addEventListener('click', () => { el.style.display = 'none'; try { context?.bus?.emit('widget:closed', 'Review'); } catch { } });
  btnMin.addEventListener('click', () => { const c = el.querySelector('.content'); if (!c) return; c.style.display = (c.style.display === 'none' ? '' : 'none'); });

  // Seed defaults
  setThis();
}
