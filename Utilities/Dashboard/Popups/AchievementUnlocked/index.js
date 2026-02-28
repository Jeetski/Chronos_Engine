const SEEN_STORAGE_KEY = 'chronos_achievement_popup_seen_v1';
const POPUPS_ENABLED_STORAGE_KEY = 'chronos_dashboard_popups_enabled_v1';
const MAX_SEEN = 300;
const POLL_MS = 5000;

function apiBase() {
  const o = window.location?.origin;
  if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
  return o;
}

function injectStyles() {
  if (document.getElementById('achievement-unlocked-popup-style')) return;
  const style = document.createElement('style');
  style.id = 'achievement-unlocked-popup-style';
  style.textContent = `
    .achievement-unlocked-overlay {
      position: fixed;
      inset: 0;
      z-index: 10020;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(8, 12, 20, 0.56);
      backdrop-filter: blur(3px);
    }
    .achievement-unlocked-card {
      position: relative;
      width: min(560px, 95vw);
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.16);
      background: linear-gradient(160deg, rgba(11,17,31,0.98), rgba(21,30,48,0.94));
      color: var(--chronos-text, #e2ecff);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.58);
      padding: 18px;
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 16px;
      overflow: hidden;
    }
    .achievement-unlocked-ring {
      --fill: 0.0;
      width: 106px;
      height: 106px;
      border-radius: 50%;
      background: conic-gradient(#7aa2f7 calc(var(--fill) * 1turn), rgba(255,255,255,0.10) 0turn);
      position: relative;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12);
      align-self: center;
      justify-self: center;
    }
    .achievement-unlocked-ring::after {
      content: "";
      position: absolute;
      inset: 11px;
      border-radius: 50%;
      background: rgba(9, 12, 20, 0.95);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .achievement-unlocked-ring-center {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      z-index: 1;
      font-weight: 800;
      font-size: 16px;
      letter-spacing: 0.4px;
      color: #dbe6ff;
    }
    .achievement-unlocked-copy h3 {
      margin: 0;
      font-size: 13px;
      letter-spacing: 0.35px;
      text-transform: uppercase;
      color: #7ad6b5;
    }
    .achievement-unlocked-copy h2 {
      margin: 4px 0 8px;
      font-size: clamp(19px, 2.5vw, 25px);
      line-height: 1.15;
    }
    .achievement-unlocked-copy p {
      margin: 0;
      color: var(--chronos-text-muted, #a4b2cc);
      font-size: 13px;
      line-height: 1.45;
    }
    .achievement-unlocked-meta {
      margin-top: 10px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .achievement-unlocked-pill {
      border-radius: 999px;
      padding: 6px 10px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.06);
      font-size: 12px;
      font-weight: 700;
    }
    .achievement-unlocked-pill.points { color: #ffd37a; }
    .achievement-unlocked-pill.xp { color: #89d9ff; }
    .achievement-unlocked-pill.progress { color: #b9c7ff; }
    .achievement-unlocked-actions {
      margin-top: 14px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .achievement-unlocked-actions button {
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.05);
      color: var(--chronos-text, #e2ecff);
      padding: 8px 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .achievement-unlocked-actions button.primary {
      background: var(--chronos-accent-gradient, linear-gradient(135deg, #7aa2f7, #4de2b6));
      color: #0b0f16;
      border-color: rgba(255,255,255,0.18);
    }
    .chronos-confetti {
      position: fixed;
      inset: 0;
      z-index: 10030;
      pointer-events: none;
      overflow: hidden;
    }
    .chronos-confetti-piece {
      position: absolute;
      width: 8px;
      height: 14px;
      border-radius: 2px;
      opacity: 0.95;
      animation: chronos-confetti-fall 2400ms cubic-bezier(.08,.68,.18,1) forwards;
    }
    @keyframes chronos-confetti-fall {
      from { transform: translateY(-20px) rotate(0deg); opacity: 1; }
      to { transform: translateY(120vh) rotate(560deg); opacity: 0; }
    }
    @media (max-width: 620px) {
      .achievement-unlocked-card {
        grid-template-columns: 1fr;
        gap: 10px;
      }
    }
  `;
  document.head.appendChild(style);
}

function esc(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function loadSeenSet() {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(v => String(v)));
  } catch {
    return new Set();
  }
}

function saveSeenSet(set) {
  try {
    const arr = Array.from(set).slice(-MAX_SEEN);
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(arr));
  } catch { }
}

function popupsEnabled() {
  try {
    const raw = localStorage.getItem(POPUPS_ENABLED_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== 'false';
  } catch {
    return true;
  }
}

function eventKey(item) {
  const id = String(item?.event_id || '').trim();
  if (id) return id;
  return [
    String(item?.id || '').trim(),
    String(item?.awarded_at || '').trim(),
    String(item?.name || '').trim(),
    String(item?.points ?? ''),
    String(item?.xp ?? ''),
  ].join('|');
}

function parseIntSafe(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normalizeAward(item = {}, profile = {}) {
  const level = Math.max(1, parseIntSafe(item.level, parseIntSafe(profile.level, 1)));
  const xpInto = Math.max(0, parseIntSafe(item.xp_into_level, parseIntSafe(profile.xp_into_level, 0)));
  const xpNext = Math.max(0, parseIntSafe(item.xp_to_next_level, parseIntSafe(profile.xp_to_next_level, 0)));
  return {
    key: eventKey(item),
    name: String(item.title || item.name || item.id || 'Achievement').trim(),
    description: String(item.description || '').trim(),
    points: Math.max(0, parseIntSafe(item.points, 0)),
    xp: Math.max(0, parseIntSafe(item.xp, 0)),
    leveledUp: Boolean(item.leveled_up) || parseIntSafe(item.levels_gained, 0) > 0,
    levelsGained: Math.max(0, parseIntSafe(item.levels_gained, 0)),
    levelBefore: Math.max(1, parseIntSafe(item.level_before, level)),
    levelAfter: Math.max(1, parseIntSafe(item.level_after, level)),
    level,
    xpInto,
    xpNext,
  };
}

async function fetchProfile() {
  const resp = await fetch(apiBase() + '/api/profile');
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.ok === false) return null;
  return data?.profile && typeof data.profile === 'object' ? data.profile : {};
}

function getPendingAwards(profile, seenSet) {
  const feed = Array.isArray(profile?.achievement_award_feed)
    ? profile.achievement_award_feed
    : [];
  const fallback = profile?.last_achievement_award && typeof profile.last_achievement_award === 'object'
    ? [profile.last_achievement_award]
    : [];
  const source = feed.length ? feed : fallback;
  const out = [];
  for (const raw of source) {
    if (!raw || typeof raw !== 'object') continue;
    const key = eventKey(raw);
    if (!key || seenSet.has(key)) continue;
    out.push(normalizeAward(raw, profile));
  }
  return out;
}

function burstConfetti(intensity = 'normal') {
  const layer = document.createElement('div');
  layer.className = 'chronos-confetti';
  const colors = ['#7aa2f7', '#4de2b6', '#ffd37a', '#f88fb5', '#9be7ff', '#ffffff'];
  const count = intensity === 'level_up' ? 64 : 40;
  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'chronos-confetti-piece';
    piece.style.left = `${Math.round(Math.random() * 100)}vw`;
    piece.style.top = `${Math.round(-10 - Math.random() * 30)}px`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.round(Math.random() * 520)}ms`;
    piece.style.width = `${6 + Math.round(Math.random() * 5)}px`;
    piece.style.height = `${10 + Math.round(Math.random() * 9)}px`;
    piece.style.animationDuration = `${2200 + Math.round(Math.random() * 1200)}ms`;
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 4600);
}

function closePopup(overlay, done, cleanup) {
  cleanup?.();
  try { overlay?.remove(); } catch { }
  done?.();
}

function buildPopup(award, done) {
  const xpPct = award.xpNext > 0 ? Math.max(0, Math.min(1, award.xpInto / award.xpNext)) : 1;
  const effectiveLevel = award.leveledUp ? award.levelAfter : award.level;
  const ringLabel = `LVL ${effectiveLevel}`;
  const progressLabel = award.xpNext > 0 ? `${award.xpInto}/${award.xpNext} XP` : 'MAX LEVEL';
  const titleLine = award.leveledUp ? 'Level Up' : 'Achievement Unlocked';
  const levelUpPill = award.leveledUp
    ? `<span class="achievement-unlocked-pill progress">Level +${Math.max(1, award.levelsGained || (award.levelAfter - award.levelBefore))}</span>`
    : '';

  const overlay = document.createElement('div');
  overlay.className = 'achievement-unlocked-overlay';
  overlay.innerHTML = `
    <div class="achievement-unlocked-card" role="dialog" aria-modal="true" aria-label="Achievement unlocked">
      <div class="achievement-unlocked-ring" style="--fill:${xpPct.toFixed(4)};">
        <div class="achievement-unlocked-ring-center">${esc(ringLabel)}</div>
      </div>
      <div class="achievement-unlocked-copy">
        <h3>${esc(titleLine)}</h3>
        <h2>${esc(award.name)}</h2>
        <p>${esc(award.description || 'Great work. Keep your Chronos momentum going.')}</p>
        <div class="achievement-unlocked-meta">
          <span class="achievement-unlocked-pill points">+${award.points} points</span>
          <span class="achievement-unlocked-pill xp">+${award.xp} XP</span>
          ${levelUpPill}
          <span class="achievement-unlocked-pill progress">${esc(progressLabel)}</span>
        </div>
        <div class="achievement-unlocked-actions">
          <button type="button" class="primary" data-action="open-achievements">Open Achievements</button>
          <button type="button" data-action="dismiss">Dismiss</button>
        </div>
      </div>
    </div>
  `;

  let onEsc = null;
  const cleanup = () => {
    if (onEsc) document.removeEventListener('keydown', onEsc);
    onEsc = null;
  };

  overlay.addEventListener('click', (ev) => {
    const btn = ev.target?.closest?.('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'open-achievements') {
      try { window.ChronosBus?.emit?.('widget:show', 'Achievements'); } catch { }
    }
    closePopup(overlay, done, cleanup);
  });

  onEsc = (ev) => {
    if (ev.key === 'Escape') {
      closePopup(overlay, done, cleanup);
    }
  };
  document.addEventListener('keydown', onEsc);
  document.body.appendChild(overlay);
  burstConfetti(award.leveledUp ? 'level_up' : 'normal');
}

function enqueueAwardPopup(award) {
  const runner = (done) => window.setTimeout(() => buildPopup(award, done), 80);
  if (window.ChronosPopupQueue?.enqueue) {
    window.ChronosPopupQueue.enqueue(runner);
  } else {
    runner(() => { });
  }
}

async function pollForAwards(seenSet) {
  if (!popupsEnabled()) return;
  try {
    const profile = await fetchProfile();
    if (!profile) return;
    const pending = getPendingAwards(profile, seenSet);
    if (!pending.length) return;
    for (const award of pending) {
      if (!award.key || seenSet.has(award.key)) continue;
      seenSet.add(award.key);
      saveSeenSet(seenSet);
      enqueueAwardPopup(award);
    }
  } catch { }
}

function isManualLaunch() {
  try {
    const u = new URL(import.meta.url);
    return u.searchParams.get('manual') === '1';
  } catch {
    return false;
  }
}

function initAchievementUnlockedPopup() {
  if (typeof document === 'undefined') return;
  injectStyles();
  if (isManualLaunch()) {
    enqueueAwardPopup({
      key: `manual:${Date.now()}`,
      name: 'Achievement Unlocked',
      description: 'Manual preview for popup styling and flow.',
      points: 10,
      xp: 10,
      level: 1,
      xpInto: 10,
      xpNext: 1000,
    });
    return;
  }
  if (window.__chronosAchievementPopupWatcherInstalled) return;
  window.__chronosAchievementPopupWatcherInstalled = true;
  const seenSet = loadSeenSet();
  window.setTimeout(() => { void pollForAwards(seenSet); }, 2200);
  window.setInterval(() => { void pollForAwards(seenSet); }, POLL_MS);
}

initAchievementUnlockedPopup();

export {};
