const STORAGE_KEY = 'chronos_sleep_checkin_popup_v1';
const MANUAL_LAUNCH = String(import.meta?.url || '').includes('manual=1');
const QUALITY_OPTIONS = ['Excellent', 'Good', 'Okay', 'Poor'];

function apiBase() {
  const o = window.location?.origin;
  if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
  return o;
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state || {})); } catch {}
}

function snooze(ms) {
  const st = loadState();
  st.snoozeUntil = Date.now() + Math.max(60_000, Number(ms) || 0);
  saveState(st);
}

function isSnoozed() {
  const st = loadState();
  return Number(st.snoozeUntil || 0) > Date.now();
}

function markAcknowledged(dateKey) {
  const st = loadState();
  st.ackDate = String(dateKey || '');
  st.snoozeUntil = 0;
  saveState(st);
}

function isAcknowledged(dateKey) {
  const st = loadState();
  return String(st.ackDate || '') === String(dateKey || '');
}

function parseHm(value, fallback = '06:00') {
  const text = String(value || '').trim();
  const m = text.match(/(\d{1,2}):(\d{2})/);
  if (!m) return fallback;
  const hh = Math.max(0, Math.min(23, Number(m[1]) || 0));
  const mm = Math.max(0, Math.min(59, Number(m[2]) || 0));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function hmToMinutes(hm) {
  const m = String(hm || '00:00').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return ((Number(m[1]) || 0) * 60) + (Number(m[2]) || 0);
}

function minutesToHm(total) {
  const t = Math.max(0, Math.round(Number(total) || 0));
  const hh = Math.floor((t % (24 * 60)) / 60);
  const mm = t % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatHours(totalMinutes) {
  const m = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r}m`;
  if (!r) return `${h}h`;
  return `${h}h ${r}m`;
}

function yesterdayDateKey() {
  const d = new Date(Date.now() - (24 * 60 * 60 * 1000));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchSleepContext() {
  const base = apiBase();
  let checkin = {};
  let sources = {};
  try {
    const checkinResp = await fetch(`${base}/api/yesterday/checkin`);
    checkin = await checkinResp.json().catch(() => ({}));
    if (!checkinResp.ok || checkin?.ok === false) checkin = {};
  } catch {
    checkin = {};
  }
  try {
    const sourcesResp = await fetch(`${base}/api/tracker/sources`);
    sources = await sourcesResp.json().catch(() => ({}));
    if (!sourcesResp.ok || sources?.ok === false) sources = {};
  } catch {
    sources = {};
  }

  const sleepSources = (Array.isArray(sources.sources) ? sources.sources : [])
    .filter(s => String(s?.type || '') === 'habit' && !!s?.sleep)
    .map(s => ({
      name: String(s.name || '').trim(),
      targetHours: Number(s.sleep_target_hours || 8) || 8,
    }))
    .filter(s => !!s.name);

  return {
    date: String(checkin?.date || yesterdayDateKey()),
    rows: Array.isArray(checkin?.rows) ? checkin.rows : [],
    sleepSources,
  };
}

function injectStyles() {
  if (document.getElementById('sleep-checkin-style')) return;
  const style = document.createElement('style');
  style.id = 'sleep-checkin-style';
  style.textContent = `
    .sleep-checkin-overlay {
      position: fixed; inset: 0; z-index: 10002;
      background: rgba(7, 10, 18, 0.72);
      backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center;
      padding: 18px;
    }
    .sleep-checkin-card {
      width: min(620px, 96vw);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 14px;
      background: rgba(13, 18, 31, 0.98);
      color: var(--chronos-text, #d9e4ff);
      box-shadow: 0 20px 50px rgba(0,0,0,0.55);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .sleep-checkin-title { margin: 0; font-size: 19px; font-weight: 800; }
    .sleep-checkin-meta { color: var(--chronos-text-muted, #9db0cf); font-size: 12px; }
    .sleep-checkin-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
    .sleep-checkin-input, .sleep-checkin-select {
      width: 100%; box-sizing: border-box; border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04);
      color: var(--chronos-text, #d9e4ff); padding: 7px 8px; font-size: 13px;
    }
    .sleep-checkin-textarea {
      width: 100%; box-sizing: border-box; min-height: 82px; resize: vertical;
      border-radius: 8px; border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.04); color: var(--chronos-text, #d9e4ff);
      padding: 8px; font-size: 13px; font-family: inherit;
    }
    .sleep-checkin-label { font-size: 12px; color: var(--chronos-text-muted, #9db0cf); margin-bottom: 4px; }
    .sleep-checkin-span-2 { grid-column: 1 / -1; }
    .sleep-checkin-panel {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px; padding: 8px;
      background: rgba(255,255,255,0.03);
      display: flex; flex-direction: column; gap: 5px;
    }
    .sleep-checkin-toggle {
      display: inline-flex; align-items: center; gap: 8px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.04);
      color: var(--chronos-text, #d9e4ff);
      border-radius: 999px;
      padding: 7px 11px;
      font-weight: 700;
      cursor: pointer;
      width: fit-content;
    }
    .sleep-checkin-toggle.active {
      border-color: rgba(122,162,247,0.55);
      background: rgba(122,162,247,0.15);
    }
    .sleep-checkin-dream[hidden] { display: none; }
    .sleep-checkin-dream {
      border: 1px solid rgba(122,162,247,0.18);
      background: linear-gradient(180deg, rgba(39, 52, 79, 0.24), rgba(14, 19, 31, 0.24));
    }
    .sleep-checkin-line { font-size: 13px; color: var(--chronos-text-muted, #9db0cf); }
    .sleep-checkin-line strong { color: var(--chronos-text, #d9e4ff); }
    .sleep-checkin-status { min-height: 18px; font-size: 12px; color: var(--chronos-text-muted, #9db0cf); }
    .sleep-checkin-status.error { color: #ff8b8b; }
    .sleep-checkin-status.success { color: #89f0b0; }
    .sleep-checkin-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .sleep-checkin-btn {
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.05);
      color: var(--chronos-text, #d9e4ff);
      border-radius: 10px;
      padding: 8px 11px;
      font-weight: 700;
      cursor: pointer;
    }
    .sleep-checkin-btn.primary {
      background: var(--chronos-accent-gradient, linear-gradient(135deg,#7aa2f7,#4de2b6));
      color: #0b0f16;
      border-color: rgba(255,255,255,0.2);
    }
  `;
  document.head.appendChild(style);
}

function closePopup(overlay, done) {
  try { overlay.remove(); } catch {}
  done?.();
}

function buildPopup(payload, done) {
  const overlay = document.createElement('div');
  overlay.className = 'sleep-checkin-overlay';
  const sleepSources = Array.isArray(payload.sleepSources) ? payload.sleepSources : [];
  const dateKey = String(payload.date || yesterdayDateKey());
  const fallbackTarget = 8;
  const defaultSource = sleepSources[0] || { name: 'Sleep', targetHours: fallbackTarget };
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const matched = rows.find(r => String(r?.name || '').toLowerCase() === String(defaultSource.name || '').toLowerCase());
  const defaultWake = parseHm(matched?.scheduled_end || matched?.entry?.scheduled_end || '06:00', '06:00');

  overlay.innerHTML = `
    <div class="sleep-checkin-card" role="dialog" aria-modal="true" aria-label="Sleep check-in">
      <h2 class="sleep-checkin-title">Sleep Check-In</h2>
      <div class="sleep-checkin-meta">${dateKey} | Log last night's sleep and update your sleep balance.</div>
      <div class="sleep-checkin-grid">
        <div>
          <div class="sleep-checkin-label">Sleep item</div>
          <select class="sleep-checkin-select" data-field="item">
            ${sleepSources.length
              ? sleepSources.map(s => `<option value="${String(s.name)}">${String(s.name)}</option>`).join('')
              : `<option value="${String(defaultSource.name)}">${String(defaultSource.name)}</option>`
            }
          </select>
        </div>
        <div>
          <div class="sleep-checkin-label">Target hours</div>
          <input class="sleep-checkin-input" data-field="target" type="number" min="4" max="12" step="0.25" value="${Number(defaultSource.targetHours || fallbackTarget)}" />
        </div>
        <div>
          <div class="sleep-checkin-label">Hours slept</div>
          <input class="sleep-checkin-input" data-field="hours" type="number" min="0" max="16" step="0.25" value="8" />
        </div>
        <div>
          <div class="sleep-checkin-label">Wake time</div>
          <input class="sleep-checkin-input" data-field="wake" type="time" value="${defaultWake}" />
        </div>
        <div>
          <div class="sleep-checkin-label">Sleep quality</div>
          <select class="sleep-checkin-select" data-field="quality">
            <option value="">Choose quality</option>
            ${QUALITY_OPTIONS.map(q => `<option value="${q}">${q}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="sleep-checkin-label">Freeform tags</div>
          <input class="sleep-checkin-input" data-field="tags" type="text" placeholder="deep-sleep, vivid, restless" />
        </div>
        <div class="sleep-checkin-span-2">
          <div class="sleep-checkin-label">Notes</div>
          <textarea class="sleep-checkin-textarea" data-field="notes" placeholder="How did sleep feel, what threw it off, what helped?"></textarea>
        </div>
      </div>
      <div class="sleep-checkin-panel" data-analysis></div>
      <button class="sleep-checkin-toggle" type="button" data-action="toggle-dream">What did you dream?</button>
      <div class="sleep-checkin-panel sleep-checkin-dream" data-dream-panel hidden>
        <div class="sleep-checkin-label">Dream diary entry</div>
        <textarea class="sleep-checkin-textarea" data-field="dream" placeholder="Write whatever you remember. Fragments count."></textarea>
      </div>
      <div class="sleep-checkin-status" data-status></div>
      <div class="sleep-checkin-actions">
        <button class="sleep-checkin-btn" data-action="snooze" data-ms="900000">Remind in 15m</button>
        <button class="sleep-checkin-btn" data-action="dismiss">Dismiss</button>
        <button class="sleep-checkin-btn primary" data-action="apply">Apply Sleep Log</button>
      </div>
    </div>
  `;

  const statusEl = overlay.querySelector('[data-status]');
  const analysisEl = overlay.querySelector('[data-analysis]');
  const itemEl = overlay.querySelector('[data-field="item"]');
  const targetEl = overlay.querySelector('[data-field="target"]');
  const hoursEl = overlay.querySelector('[data-field="hours"]');
  const wakeEl = overlay.querySelector('[data-field="wake"]');
  const qualityEl = overlay.querySelector('[data-field="quality"]');
  const tagsEl = overlay.querySelector('[data-field="tags"]');
  const notesEl = overlay.querySelector('[data-field="notes"]');
  const dreamEl = overlay.querySelector('[data-field="dream"]');
  const dreamPanelEl = overlay.querySelector('[data-dream-panel]');
  const dreamToggleEl = overlay.querySelector('[data-action="toggle-dream"]');

  const sourceMap = Object.fromEntries(sleepSources.map(s => [String(s.name), s]));
  let dreamOpen = false;

  function setStatus(msg, tone = '') {
    statusEl.textContent = msg || '';
    statusEl.className = `sleep-checkin-status${tone ? ' ' + tone : ''}`;
  }

  function renderAnalysis() {
    const targetHours = Math.max(1, Number(targetEl.value || fallbackTarget));
    const sleptHours = Math.max(0, Number(hoursEl.value || 0));
    const targetM = Math.round(targetHours * 60);
    const sleptM = Math.round(sleptHours * 60);
    const balance = sleptM - targetM;
    const abs = Math.abs(balance);
    const label = balance >= 0 ? 'Sleep surplus' : 'Sleep deficit';
    const nextTargetM = balance < 0 ? Math.min(Math.round((targetHours + 1.0) * 60), targetM + abs) : targetM;
    analysisEl.innerHTML = `
      <div class="sleep-checkin-line">Logged: <strong>${formatHours(sleptM)}</strong> | Target: <strong>${formatHours(targetM)}</strong></div>
      <div class="sleep-checkin-line">${label}: <strong>${formatHours(abs)}</strong></div>
      <div class="sleep-checkin-line">Recovery plan: <strong>${formatHours(nextTargetM)}</strong> target tonight (gentle catch-up).</div>
      <div class="sleep-checkin-line">Suggestion: earlier wind-down, keep wake time stable, short nap only if needed.</div>
    `;
  }

  function parseTags(value) {
    return String(value || '')
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
  }

  function setDreamOpen(nextOpen) {
    dreamOpen = !!nextOpen;
    if (dreamPanelEl) dreamPanelEl.hidden = !dreamOpen;
    if (dreamToggleEl) dreamToggleEl.classList.toggle('active', dreamOpen);
    if (dreamToggleEl) dreamToggleEl.textContent = dreamOpen ? 'Hide dream diary' : 'What did you dream?';
  }

  function pickRowFor(name) {
    const needle = String(name || '').trim().toLowerCase();
    if (!needle) return null;
    return rows.find(r => String(r?.name || '').trim().toLowerCase() === needle) || null;
  }

  itemEl?.addEventListener('change', () => {
    const src = sourceMap[String(itemEl.value || '')];
    if (src && Number.isFinite(Number(src.targetHours))) {
      targetEl.value = String(Number(src.targetHours));
    }
    const row = pickRowFor(itemEl.value);
    wakeEl.value = parseHm(row?.scheduled_end || row?.entry?.scheduled_end || wakeEl.value || '06:00', '06:00');
    renderAnalysis();
  });
  targetEl?.addEventListener('input', renderAnalysis);
  hoursEl?.addEventListener('input', renderAnalysis);
  renderAnalysis();

  overlay.addEventListener('click', async (ev) => {
    const btn = ev.target?.closest?.('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'dismiss') {
      markAcknowledged(dateKey);
      closePopup(overlay, done);
      return;
    }
    if (action === 'snooze') {
      const ms = parseInt(btn.getAttribute('data-ms') || '0', 10) || 900_000;
      snooze(ms);
      closePopup(overlay, done);
      return;
    }
    if (action === 'toggle-dream') {
      setDreamOpen(!dreamOpen);
      if (dreamOpen && dreamEl) {
        window.setTimeout(() => dreamEl.focus(), 0);
      }
      return;
    }
    if (action !== 'apply') return;

    try {
      setStatus('Saving sleep log...');
      const name = String(itemEl.value || defaultSource.name || 'Sleep').trim();
      const sleptHours = Math.max(0, Number(hoursEl.value || 0));
      const sleptM = Math.round(sleptHours * 60);
      const quality = String(qualityEl?.value || '').trim();
      const note = String(notesEl?.value || '').trim();
      const tags = parseTags(tagsEl?.value || '');
      const dreamText = String(dreamEl?.value || '').trim();
      if (!name || sleptM <= 0) {
        setStatus('Provide a sleep item and valid hours slept.', 'error');
        return;
      }
      const wake = parseHm(wakeEl.value || '06:00', '06:00');
      let endM = hmToMinutes(wake);
      let startM = endM - sleptM;
      while (startM < 0) startM += 24 * 60;
      const startHm = minutesToHm(startM);
      const row = pickRowFor(name);
      const updates = [];
      const additional = [];
      if (row && row.key) {
        updates.push({
          key: String(row.key),
          status: 'completed',
          actual_start: startHm,
          actual_end: wake,
          note: note || `Sleep check-in: ${sleptHours}h`,
          quality,
          tags,
        });
      } else {
        additional.push({
          type: 'habit',
          name,
          status: 'completed',
          scheduled_start: startHm,
          scheduled_end: wake,
          actual_start: startHm,
          actual_end: wake,
          note: note || `Sleep check-in: ${sleptHours}h`,
          quality,
          tags,
        });
      }

      const dreamEntry = dreamText ? {
        content: dreamText,
        date: dateKey,
        sleep_item: name,
        sleep_hours: sleptHours,
        quality,
        tags: tags.concat(['dream']),
        note,
      } : null;

      const resp = await fetch(`${apiBase()}/api/yesterday/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateKey, updates, additional, dream_entry: dreamEntry }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) throw new Error(data?.error || `HTTP ${resp.status}`);
      setStatus(data?.dream_entry?.created ? 'Sleep log and dream entry saved.' : 'Sleep log saved.', 'success');
      markAcknowledged(dateKey);
      window.setTimeout(() => closePopup(overlay, done), 220);
    } catch (err) {
      setStatus(`Save failed: ${err?.message || err}`, 'error');
    }
  });

  setDreamOpen(false);

  document.body.appendChild(overlay);
}

async function maybeShow(done) {
  if (!MANUAL_LAUNCH && isSnoozed()) { done?.(); return; }
  let payload = null;
  try {
    payload = await fetchSleepContext();
  } catch {
    payload = null;
  }
  if (!payload) {
    payload = { date: yesterdayDateKey(), rows: [], sleepSources: [{ name: 'Sleep', targetHours: 8 }] };
  }
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const hasSleepTargets = Array.isArray(payload.sleepSources) && payload.sleepSources.length > 0;
  const hasSleepRows = rows.some(r => /\bsleep|bedtime\b/i.test(String(r?.name || '')));
  if (!MANUAL_LAUNCH && !hasSleepTargets && !hasSleepRows) { done?.(); return; }
  if (!MANUAL_LAUNCH && isAcknowledged(payload.date)) { done?.(); return; }
  injectStyles();
  buildPopup(payload, done);
}

function initSleepCheckinPopup() {
  if (typeof document === 'undefined') return;
  const runner = (done) => setTimeout(() => {
    maybeShow(done).catch((err) => {
      try { console.error('[Chronos][Popups][SleepCheckin] failed', err); } catch {}
      done?.();
    });
  }, 2600);
  if (window.ChronosPopupQueue?.enqueue) window.ChronosPopupQueue.enqueue(runner);
  else runner(() => {});
}

initSleepCheckinPopup();

export {};
