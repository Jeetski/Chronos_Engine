const STYLE_ID = 'chronos-tracker-view-style';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .tracker-shell { display:flex; gap:0; height:100%; min-height:0; color:var(--chronos-text, #e6e8ef); }
    .tracker-calendar { flex:1; min-width:0; border:1px solid rgba(255,255,255,0.08); border-radius:14px; background:rgba(10,14,20,0.72); padding:12px; overflow:auto; }
    .tracker-header { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; }
    .tracker-title { font-size:18px; font-weight:700; }
    .tracker-subtitle { font-size:12px; color:var(--chronos-text-muted, #9aa4b7); }
    .tracker-months { display:grid; grid-template-columns:repeat(3, minmax(260px, 1fr)); gap:10px; }
    .tracker-month { border:1px solid rgba(255,255,255,0.08); border-radius:12px; background:rgba(255,255,255,0.03); padding:8px; }
    .tracker-month-name { font-size:13px; font-weight:700; margin-bottom:8px; letter-spacing:0.04em; text-transform:uppercase; color:var(--chronos-text-soft, #c6cedf); }
    .tracker-weekdays { display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:4px; margin-bottom:4px; }
    .tracker-weekday { text-align:center; font-size:10px; color:var(--chronos-text-muted, #9aa4b7); text-transform:uppercase; }
    .tracker-days { display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:4px; }
    .tracker-day { min-height:28px; border-radius:7px; border:1px solid rgba(255,255,255,0.07); background:rgba(255,255,255,0.06); position:relative; display:flex; align-items:center; justify-content:center; font-size:11px; color:#e6e8ef; }
    .tracker-day.empty { border-color:transparent; background:transparent; }
    .tracker-day.future { background:rgba(130,140,160,0.17); color:#9aa4b7; border-color:rgba(130,140,160,0.2); }
    .tracker-day.done { background:rgba(91,220,130,0.2); color:#67e093; border-color:rgba(91,220,130,0.45); }
    .tracker-day.done.bad { background:rgba(239,106,106,0.2); color:#ff8f8f; border-color:rgba(239,106,106,0.45); }
    .tracker-day.not-done { background:rgba(239,106,106,0.2); color:#ff8f8f; border-color:rgba(239,106,106,0.45); }
    .tracker-day.not-done.good { background:rgba(91,220,130,0.2); color:#67e093; border-color:rgba(91,220,130,0.45); }
    .tracker-day.unknown { background:rgba(130,140,160,0.16); color:#cfd6e6; border-color:rgba(255,255,255,0.17); }
    .tracker-qmark { font-size:12px; color:#fff; font-weight:800; line-height:1; }
    .tracker-splitter { width:8px; cursor:col-resize; flex:0 0 8px; margin:0 6px; border-radius:8px; background:linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04)); border:1px solid rgba(255,255,255,0.06); }
    .tracker-inspector { width:320px; flex:0 0 auto; border:1px solid rgba(255,255,255,0.08); border-radius:14px; background:rgba(13,17,24,0.85); padding:12px; display:flex; flex-direction:column; gap:10px; min-height:0; overflow-y:auto; }
    .tracker-ring-wrap { display:flex; align-items:center; justify-content:center; flex-direction:column; gap:6px; padding:2px 0 8px; border-bottom:1px solid rgba(255,255,255,0.08); }
    .tracker-ring { --p:0; width:110px; height:110px; border-radius:50%; display:grid; place-items:center; background:conic-gradient(var(--chronos-accent, #7aa2f7) calc(var(--p) * 1%), rgba(255,255,255,0.12) 0); position:relative; }
    .tracker-ring::before { content:''; position:absolute; inset:9px; border-radius:50%; background:rgba(9,12,18,0.95); border:1px solid rgba(255,255,255,0.08); }
    .tracker-ring-value { position:relative; z-index:1; font-weight:800; font-size:20px; color:#e7ebf7; }
    .tracker-ring-label { font-size:12px; color:var(--chronos-text-muted, #9aa4b7); }
    .tracker-stats { border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.03); padding:8px; display:flex; flex-direction:column; gap:8px; }
    .tracker-stats-title { font-size:11px; color:var(--chronos-text-muted, #9aa4b7); text-transform:uppercase; letter-spacing:0.08em; }
    .tracker-kpi-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:6px; }
    .tracker-kpi { border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:6px; background:rgba(255,255,255,0.02); }
    .tracker-kpi-label { font-size:10px; color:var(--chronos-text-muted, #9aa4b7); text-transform:uppercase; letter-spacing:0.06em; }
    .tracker-kpi-value { font-size:15px; font-weight:700; color:#e7ebf7; }
    .tracker-line { font-size:12px; color:var(--chronos-text-muted, #9aa4b7); }
    .tracker-weekday-grid { display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:4px; }
    .tracker-weekday-cell { border:1px solid rgba(255,255,255,0.1); border-radius:7px; padding:4px 2px; text-align:center; background:rgba(255,255,255,0.02); }
    .tracker-weekday-name { font-size:10px; color:var(--chronos-text-muted, #9aa4b7); text-transform:uppercase; }
    .tracker-weekday-value { font-size:11px; font-weight:700; color:#e6e8ef; }
    .tracker-month-mini-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:4px; }
    .tracker-month-mini { border:1px solid rgba(255,255,255,0.08); border-radius:7px; padding:4px; background:rgba(255,255,255,0.02); }
    .tracker-month-mini-name { font-size:10px; color:var(--chronos-text-muted, #9aa4b7); text-transform:uppercase; }
    .tracker-month-mini-val { font-size:11px; font-weight:700; color:#e6e8ef; }
    .tracker-search { border:1px solid rgba(255,255,255,0.1); border-radius:8px; background:rgba(255,255,255,0.06); color:var(--chronos-text, #e6e8ef); padding:8px; width:100%; }
    .tracker-groups { display:flex; flex-direction:column; gap:8px; }
    .tracker-group-title { font-size:11px; color:var(--chronos-text-muted, #9aa4b7); text-transform:uppercase; letter-spacing:0.08em; }
    .tracker-item-btn { width:100%; text-align:left; border:1px solid rgba(255,255,255,0.11); border-radius:8px; background:rgba(255,255,255,0.03); color:var(--chronos-text, #e6e8ef); padding:8px; cursor:pointer; }
    .tracker-item-btn.active { border-color:rgba(122,162,247,0.7); background:rgba(122,162,247,0.18); }
    .tracker-item-meta { font-size:11px; color:var(--chronos-text-muted, #9aa4b7); margin-top:2px; }
    .tracker-status { font-size:12px; color:var(--chronos-text-muted, #9aa4b7); min-height:18px; }
    .tracker-status.error { color:#ef6a6a; }
    @media (max-width: 1400px) { .tracker-months { grid-template-columns:repeat(2, minmax(260px, 1fr)); } .tracker-inspector { width:300px; } }
    @media (max-width: 980px) { .tracker-shell { flex-direction:column; gap:10px; } .tracker-splitter { display:none; } .tracker-inspector { width:100%; } .tracker-months { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(style);
}

function apiBase() {
  const o = window.location?.origin;
  if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
  return o;
}

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

  function dateKey(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatMinutes(totalMinutes) {
  const n = Math.max(0, Number(totalMinutes || 0));
  const minutes = Math.round(n);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

export function mount(el) {
  injectStyles();

  const now = new Date();
  const state = {
    year: now.getFullYear(),
    todayKey: dateKey(now),
    sources: [],
    selectedId: '',
    search: '',
    loadingSources: false,
    loadingYear: false,
    error: '',
    tracked: null,
    dayStates: {},
    yearProgressPercent: 0,
    elapsedDays: 0,
    dayCount: 365,
    sleepAnalysis: null,
    sleepMinutesByDate: {},
  };

  const root = document.createElement('div');
  root.className = 'tracker-shell';
  root.innerHTML = `
    <section class="tracker-calendar">
      <div class="tracker-header">
        <div>
          <div class="tracker-title">Tracker</div>
          <div class="tracker-subtitle">${state.year} yearly grid</div>
        </div>
        <div class="tracker-status" data-status></div>
      </div>
      <div class="tracker-months" data-months></div>
    </section>
    <div class="tracker-splitter" data-splitter title="Drag to resize inspector"></div>
    <aside class="tracker-inspector">
      <div class="tracker-ring-wrap">
        <div class="tracker-ring" data-ring><div class="tracker-ring-value" data-ring-value>0%</div></div>
        <div class="tracker-ring-label" data-ring-label>Year elapsed</div>
      </div>
      <div class="tracker-stats" data-stats></div>
      <input class="tracker-search" data-search placeholder="Filter habits/commitments..." />
      <div class="tracker-groups" data-groups></div>
    </aside>
  `;
  el.appendChild(root);

  const statusEl = root.querySelector('[data-status]');
  const monthsEl = root.querySelector('[data-months]');
  const splitterEl = root.querySelector('[data-splitter]');
  const inspectorEl = root.querySelector('.tracker-inspector');
  const groupsEl = root.querySelector('[data-groups]');
  const searchEl = root.querySelector('[data-search]');
  const ringEl = root.querySelector('[data-ring]');
  const ringValueEl = root.querySelector('[data-ring-value]');
  const ringLabelEl = root.querySelector('[data-ring-label]');
  const statsEl = root.querySelector('[data-stats]');
  const INSPECTOR_WIDTH_KEY = 'tracker_inspector_width_v1';
  const MIN_INSPECTOR_WIDTH = 280;
  const MAX_INSPECTOR_WIDTH = 620;

  function clampInspectorWidth(raw) {
    const total = Math.max(0, Number(el.clientWidth || 0));
    const hardMax = Math.max(MIN_INSPECTOR_WIDTH, Math.min(MAX_INSPECTOR_WIDTH, total - 340));
    const n = Number(raw);
    if (!Number.isFinite(n)) return Math.min(320, hardMax);
    return Math.max(MIN_INSPECTOR_WIDTH, Math.min(hardMax, n));
  }

  function applyInspectorWidth(width, persist = true) {
    const next = clampInspectorWidth(width);
    inspectorEl.style.width = `${Math.round(next)}px`;
    if (persist) {
      try { localStorage.setItem(INSPECTOR_WIDTH_KEY, String(Math.round(next))); } catch { }
    }
  }

  function setStatus(msg, tone = '') {
    statusEl.textContent = msg || '';
    statusEl.className = `tracker-status${tone ? ' ' + tone : ''}`;
  }

  function selectedSource() {
    return state.sources.find(s => s.id === state.selectedId) || null;
  }

  function isBadContext() {
    const tracked = state.tracked || {};
    return String(tracked.polarity || '').toLowerCase() === 'bad' || String(tracked.mode || '').toLowerCase() === 'negative';
  }

  function endOfYearKey(year) {
    return `${year}-12-31`;
  }

  function elapsedDateKeys() {
    const year = state.year;
    const start = `${year}-01-01`;
    const end = state.todayKey < endOfYearKey(year) ? state.todayKey : endOfYearKey(year);
    if (end < start) return [];
    const keys = [];
    const cursor = new Date(year, 0, 1);
    while (dateKey(cursor) <= end) {
      keys.push(dateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return keys;
  }

  function isSuccessState(st, badContext) {
    if (!st || (st !== 'done' && st !== 'not_done')) return null;
    return badContext ? st === 'not_done' : st === 'done';
  }

  function computeInspectorStats() {
    const badContext = isBadContext();
    const elapsed = elapsedDateKeys();
    const byDay = state.dayStates || {};
    let done = 0;
    let notDone = 0;
    let unknown = 0;
    const knownFlags = [];
    const successFlags = [];

    for (const k of elapsed) {
      const st = byDay[k]?.state || null;
      if (st === 'done') done += 1;
      else if (st === 'not_done') notDone += 1;
      else unknown += 1;
      if (st === 'done' || st === 'not_done') {
        knownFlags.push(1);
        successFlags.push(isSuccessState(st, badContext) ? 1 : 0);
      } else {
        knownFlags.push(0);
        successFlags.push(0);
      }
    }

    const known = done + notDone;
    const elapsedCount = elapsed.length;
    const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : 0;
    const donePct = pct(done, elapsedCount);
    const notDonePct = pct(notDone, elapsedCount);
    const unknownPct = pct(unknown, elapsedCount);
    const adherence = pct(successFlags.reduce((a, b) => a + b, 0), knownFlags.reduce((a, b) => a + b, 0));

    const rolling = (n) => {
      const sliceKnown = knownFlags.slice(-n);
      const sliceSuccess = successFlags.slice(-n);
      const knownN = sliceKnown.reduce((a, b) => a + b, 0);
      const successN = sliceSuccess.reduce((a, b) => a + b, 0);
      return { pct: pct(successN, knownN), success: successN, known: knownN };
    };
    const r7 = rolling(7);
    const r30 = rolling(30);

    let curStreak = 0;
    let longestStreak = 0;
    let run = 0;
    for (const k of elapsed) {
      const success = isSuccessState(byDay[k]?.state || null, badContext);
      if (success === true) {
        run += 1;
        if (run > longestStreak) longestStreak = run;
      } else {
        run = 0;
      }
    }
    for (let i = elapsed.length - 1; i >= 0; i -= 1) {
      const success = isSuccessState(byDay[elapsed[i]]?.state || null, badContext);
      if (success === true) curStreak += 1;
      else break;
    }

    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdayBuckets = Array.from({ length: 7 }, () => ({ known: 0, success: 0 }));
    for (const k of elapsed) {
      const [y, m, d] = k.split('-').map(Number);
      const wd = new Date(y, m - 1, d).getDay();
      const success = isSuccessState(byDay[k]?.state || null, badContext);
      if (success !== null) {
        weekdayBuckets[wd].known += 1;
        if (success) weekdayBuckets[wd].success += 1;
      }
    }
    const weekday = weekdayBuckets.map((b, idx) => ({
      name: weekdayNames[idx],
      pct: pct(b.success, b.known),
      known: b.known,
    }));

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthStats = [];
    for (let m = 0; m < 12; m += 1) {
      const start = `${state.year}-${String(m + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(state.year, m + 1, 0).getDate();
      const end = `${state.year}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const capEnd = state.todayKey < end ? state.todayKey : end;
      if (capEnd < start) {
        monthStats.push({ name: monthNames[m], pct: 0, done: 0, notDone: 0, unknown: 0 });
        continue;
      }
      const keys = elapsed.filter(k => k >= start && k <= capEnd);
      let md = 0;
      let mnd = 0;
      let mu = 0;
      for (const k of keys) {
        const st = byDay[k]?.state || null;
        if (st === 'done') md += 1;
        else if (st === 'not_done') mnd += 1;
        else mu += 1;
      }
      const mk = md + mnd;
      const successCount = badContext ? mnd : md;
      monthStats.push({ name: monthNames[m], pct: pct(successCount, mk), done: md, notDone: mnd, unknown: mu });
    }

    return { donePct, notDonePct, unknownPct, adherence, r7, r30, curStreak, longestStreak, weekday, monthStats, badContext, known };
  }

  function renderMonths() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const year = state.year;
    const today = state.todayKey;
    const badContext = isBadContext();

    monthsEl.innerHTML = '';
    for (let m = 0; m < 12; m += 1) {
      const first = new Date(year, m, 1);
      const daysInMonth = new Date(year, m + 1, 0).getDate();
      const lead = first.getDay();
      const card = document.createElement('article');
      card.className = 'tracker-month';

      const weekdayHtml = weekdays.map(w => `<div class="tracker-weekday">${w}</div>`).join('');
      const dayCells = [];
      for (let i = 0; i < lead; i += 1) dayCells.push('<div class="tracker-day empty"></div>');

      for (let day = 1; day <= daysInMonth; day += 1) {
        const dt = new Date(year, m, day);
        const key = dateKey(dt);
        const future = key > today;
        const known = state.dayStates[key];
        let cls = 'tracker-day';
        let inner = String(day);
        if (future) {
          cls += ' future';
        } else if (!known) {
          cls += ' unknown';
          inner = `<span class="tracker-qmark">?</span>`;
        } else if (known.state === 'done') {
          cls += ` done${badContext ? ' bad' : ''}`;
        } else if (known.state === 'not_done') {
          cls += ` not-done${badContext ? ' good' : ''}`;
        } else {
          cls += ' unknown';
          inner = `<span class="tracker-qmark">?</span>`;
        }
        dayCells.push(`<div class="${cls}" title="${escapeHtml(key)}">${inner}</div>`);
      }

      card.innerHTML = `
        <div class="tracker-month-name">${monthNames[m]}</div>
        <div class="tracker-weekdays">${weekdayHtml}</div>
        <div class="tracker-days">${dayCells.join('')}</div>
      `;
      monthsEl.appendChild(card);
    }
  }

  function renderInspector() {
    const term = String(state.search || '').trim().toLowerCase();
    const habits = [];
    const commitments = [];
    for (const src of state.sources) {
      if (term && !String(src.name || '').toLowerCase().includes(term)) continue;
      if (src.type === 'habit') habits.push(src); else commitments.push(src);
    }
    const renderBtn = (src) => `
      <button class="tracker-item-btn${state.selectedId === src.id ? ' active' : ''}" data-source-id="${escapeHtml(src.id)}">
        ${escapeHtml(src.name)}
        <div class="tracker-item-meta">${escapeHtml(src.type === 'habit' ? (src.polarity || 'good') : (src.rule_kind || src.mode || 'commitment'))}</div>
      </button>
    `;
    groupsEl.innerHTML = `
      <div class="tracker-group">
        <div class="tracker-group-title">Habits</div>
        ${(habits.length ? habits.map(renderBtn).join('') : '<div class="tracker-item-meta">No habits</div>')}
      </div>
      <div class="tracker-group">
        <div class="tracker-group-title">Commitments</div>
        ${(commitments.length ? commitments.map(renderBtn).join('') : '<div class="tracker-item-meta">No commitments</div>')}
      </div>
    `;
  }

  function renderRing() {
    const pct = Math.max(0, Math.min(100, Number(state.yearProgressPercent || 0)));
    ringEl.style.setProperty('--p', String(pct));
    ringValueEl.textContent = `${pct}%`;
    const tracked = selectedSource();
    ringLabelEl.textContent = tracked
      ? `${state.elapsedDays}/${state.dayCount} days in ${state.year}`
      : `Year elapsed (${state.year})`;
  }

  function renderStats() {
    const src = selectedSource();
    if (!src) {
      statsEl.innerHTML = '<div class="tracker-line">Select an item to see stats.</div>';
      return;
    }
    const s = computeInspectorStats();
    const streakLabel = s.badContext ? 'Clean streak' : 'Streak';
    const sleep = state.tracked && state.tracked.sleep ? (state.sleepAnalysis || null) : null;
    let sleepHtml = '';
    if (sleep) {
      const debtOrSurplus = Number(sleep.debt_minutes || 0) > 0
        ? `Debt: ${formatMinutes(sleep.debt_minutes)}`
        : `Surplus: ${formatMinutes(sleep.surplus_minutes || 0)}`;
      sleepHtml = `
        <div class="tracker-stats-title">Sleep Analysis</div>
        <div class="tracker-line">Target/night: ${formatMinutes(sleep.target_minutes)} (${Number(sleep.target_hours || 0).toFixed(1)}h)</div>
        <div class="tracker-line">Average/night: ${formatMinutes(sleep.average_logged_minutes)} (${sleep.logged_day_count || 0} logged night${Number(sleep.logged_day_count || 0) === 1 ? '' : 's'})</div>
        <div class="tracker-line">Total logged: ${formatMinutes(sleep.total_logged_minutes)}</div>
        <div class="tracker-line">${debtOrSurplus}</div>
        <div class="tracker-line">Short nights (&lt;7h): ${sleep.short_nights_under_7h || 0}</div>
        <div class="tracker-line">Below target: ${sleep.below_target_nights || 0}</div>
        <div class="tracker-line">7d avg: ${formatMinutes(sleep.rolling_7d_average_minutes)}</div>
        <div class="tracker-line">30d avg: ${formatMinutes(sleep.rolling_30d_average_minutes)}</div>
      `;
    }
    statsEl.innerHTML = `
      <div class="tracker-stats-title">Adherence</div>
      <div class="tracker-kpi-grid">
        <div class="tracker-kpi"><div class="tracker-kpi-label">Done</div><div class="tracker-kpi-value">${s.donePct}%</div></div>
        <div class="tracker-kpi"><div class="tracker-kpi-label">Not Done</div><div class="tracker-kpi-value">${s.notDonePct}%</div></div>
        <div class="tracker-kpi"><div class="tracker-kpi-label">Unknown</div><div class="tracker-kpi-value">${s.unknownPct}%</div></div>
      </div>
      <div class="tracker-line">Adherence (logged): ${s.adherence}%</div>
      <div class="tracker-line">7d: ${s.r7.pct}% (${s.r7.success}/${s.r7.known} logged)</div>
      <div class="tracker-line">30d: ${s.r30.pct}% (${s.r30.success}/${s.r30.known} logged)</div>
      <div class="tracker-stats-title">Streaks</div>
      <div class="tracker-line">${streakLabel}: ${s.curStreak} current, ${s.longestStreak} best</div>
      <div class="tracker-stats-title">Weekday Pattern</div>
      <div class="tracker-weekday-grid">
        ${s.weekday.map(w => `<div class="tracker-weekday-cell" title="${w.known} logged"><div class="tracker-weekday-name">${w.name}</div><div class="tracker-weekday-value">${w.pct}%</div></div>`).join('')}
      </div>
      <div class="tracker-stats-title">Month Mini-Stats</div>
      <div class="tracker-month-mini-grid">
        ${s.monthStats.map(m => `<div class="tracker-month-mini" title="done:${m.done} not_done:${m.notDone} unknown:${m.unknown}"><div class="tracker-month-mini-name">${m.name}</div><div class="tracker-month-mini-val">${m.pct}%</div></div>`).join('')}
      </div>
      ${sleepHtml}
    `;
  }

  function render() {
    renderRing();
    renderStats();
    renderInspector();
    renderMonths();
    if (state.loadingSources || state.loadingYear) {
      setStatus('Loading...');
    } else if (state.error) {
      setStatus(state.error, 'error');
    } else {
      const src = selectedSource();
      setStatus(src ? `Tracking: ${src.name}` : 'Choose an item to track.');
    }
  }

  async function loadSources() {
    state.loadingSources = true;
    state.error = '';
    render();
    try {
      const resp = await fetch(apiBase() + '/api/tracker/sources');
      const json = await resp.json();
      if (!resp.ok || json.ok === false) throw new Error(json.error || `HTTP ${resp.status}`);
      state.sources = Array.isArray(json.sources) ? json.sources : [];
      if (!state.selectedId && state.sources.length) state.selectedId = state.sources[0].id;
    } catch (e) {
      state.error = `Failed to load tracked items: ${String(e.message || e)}`;
    } finally {
      state.loadingSources = false;
      render();
    }
  }

  async function loadYear() {
    const src = selectedSource();
    if (!src) {
      state.dayStates = {};
      state.tracked = null;
      state.sleepAnalysis = null;
      state.sleepMinutesByDate = {};
      render();
      return;
    }
    state.loadingYear = true;
    state.error = '';
    render();
    try {
      const url = `${apiBase()}/api/tracker/year?year=${encodeURIComponent(state.year)}&type=${encodeURIComponent(src.type)}&name=${encodeURIComponent(src.name)}`;
      const resp = await fetch(url);
      const json = await resp.json();
      if (!resp.ok || json.ok === false) throw new Error(json.error || `HTTP ${resp.status}`);
      state.dayStates = (json.days && typeof json.days === 'object') ? json.days : {};
      state.tracked = json.tracked || null;
      state.todayKey = String(json.today || state.todayKey);
      state.yearProgressPercent = Number(json.year_progress_percent || 0);
      state.elapsedDays = Number(json.elapsed_days || 0);
      state.dayCount = Number(json.day_count || 365);
      state.sleepAnalysis = (json.sleep_analysis && typeof json.sleep_analysis === 'object') ? json.sleep_analysis : null;
      state.sleepMinutesByDate = (json.sleep_minutes_by_date && typeof json.sleep_minutes_by_date === 'object') ? json.sleep_minutes_by_date : {};
    } catch (e) {
      state.error = `Failed to load year data: ${String(e.message || e)}`;
      state.dayStates = {};
      state.sleepAnalysis = null;
      state.sleepMinutesByDate = {};
    } finally {
      state.loadingYear = false;
      render();
    }
  }

  groupsEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-source-id]');
    if (!btn) return;
    const id = btn.getAttribute('data-source-id');
    if (!id || id === state.selectedId) return;
    state.selectedId = id;
    void loadYear();
  });

  searchEl.addEventListener('input', () => {
    state.search = searchEl.value || '';
    renderInspector();
  });

  try {
    const stored = Number(localStorage.getItem(INSPECTOR_WIDTH_KEY) || '');
    applyInspectorWidth(Number.isFinite(stored) ? stored : 320, false);
  } catch {
    applyInspectorWidth(320, false);
  }

  splitterEl.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const startX = ev.clientX;
    const startW = Number.parseFloat((inspectorEl.style.width || '320').replace('px', '')) || 320;
    const onMove = (e) => {
      const dx = e.clientX - startX;
      applyInspectorWidth(startW - dx, false);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const current = Number.parseFloat((inspectorEl.style.width || '320').replace('px', '')) || 320;
      applyInspectorWidth(current, true);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  window.addEventListener('resize', () => {
    const current = Number.parseFloat((inspectorEl.style.width || '320').replace('px', '')) || 320;
    applyInspectorWidth(current, false);
  });

  (async () => {
    await loadSources();
    await loadYear();
  })();

  return {
    refresh() { void loadYear(); }
  };
}
