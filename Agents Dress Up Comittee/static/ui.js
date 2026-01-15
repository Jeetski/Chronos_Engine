// Minimal UI script: fetch familiars, send chat, poll for reply.

async function getJSON(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Global map for layout configs: famId -> { "rel_path": { scale, x, y, transform_origin } }
const FAM_LAYOUTS = new Map();
// Global map for background-specific layout overrides: famId -> { "background.png": { "avatar.png": { ... } } }
const BG_LAYOUTS = new Map();
// Track if familiar has been "undressed" (NSFW triggered), so they default to "tee" outfit
const FAM_UNDRESSED = new Map();
// Map of familiar -> avatar <img> element on stage
const AVATAR_IMGS = new Map();
  // Track the last resolved avatar path per familiar (for thinking state)
  const CURRENT_AVATAR_PATH = new Map();
  // Track the last layout key to avoid repeated layout fetches
  const LAST_LAYOUT_KEY = new Map();
  // Cache resolved layouts to avoid repeated /avatar-layout fetches
  const LAYOUT_CACHE = new Map();
  // Track in-flight layout fetches to dedupe concurrent requests
  const LAYOUT_PENDING = new Map();
// Committee guest list (ordered)
const COMMITTEE_GUESTS = [];
const COMMITTEE_PENDING = new Set();
const DEFAULT_COMMITTEE_OFFSET_RATIO = 0.95; // relative to host width
const COMMITTEE_OFFSET_MIN_PX = 90;
const COMMITTEE_OFFSET_Y = "0px";
const OFFSET_ENABLED_KEY = 'aduc_guest_offset_enabled';
const OFFSET_FACTOR_KEY = 'aduc_guest_offset_factor';
let COMMITTEE_OFFSET_RATIO = DEFAULT_COMMITTEE_OFFSET_RATIO;
let COMMITTEE_OFFSET_ENABLED = true;
let COMMITTEE_OFFSET_FACTOR = 1.0;

function isCommitteeActive() {
  return COMMITTEE_GUESTS.length > 0;
}

function getDevLayoutMode() {
  const input = document.querySelector('input[name="devLayoutMode"]:checked');
  return input ? input.value : 'solo';
}

function buildLayoutUrl(famId, relPath, bg, mode) {
  const params = [];
  if (bg) params.push(`bg=${bg}`);
  if (mode === 'committee') params.push('committee=1');
  const suffix = params.length ? `?${params.join('&')}` : '';
  return `/familiars/${encodeURIComponent(famId)}/avatar-layout/${relPath}${suffix}`;
}

function loadGuestOffsetPrefs() {
  try {
    const enabledRaw = localStorage.getItem(OFFSET_ENABLED_KEY);
    if (enabledRaw !== null) COMMITTEE_OFFSET_ENABLED = enabledRaw === 'true';
    const factorRaw = localStorage.getItem(OFFSET_FACTOR_KEY);
    const factorVal = parseFloat(factorRaw);
    if (!Number.isNaN(factorVal) && factorVal > 0) {
      COMMITTEE_OFFSET_FACTOR = factorVal;
    }
  } catch { }
}

function saveGuestOffsetPrefs() {
  try {
    localStorage.setItem(OFFSET_ENABLED_KEY, String(COMMITTEE_OFFSET_ENABLED));
    localStorage.setItem(OFFSET_FACTOR_KEY, String(COMMITTEE_OFFSET_FACTOR));
  } catch { }
}

function getAvatarImg(famId) {
  if (AVATAR_IMGS.has(famId)) return AVATAR_IMGS.get(famId);
  const hostImg = document.getElementById('avatarImg');
  return hostImg || null;
}

function getCommitteeOffset(famId) {
  if (!famId || famId === CURRENT_FAM) return { x: "0px", y: "0px" };
  if (!COMMITTEE_OFFSET_ENABLED) return { x: "0px", y: "0px" };
  const idx = COMMITTEE_GUESTS.indexOf(famId);
  if (idx === -1) return { x: "0px", y: "0px" };
  const hostImg = getAvatarImg(CURRENT_FAM);
  const hostW = hostImg ? hostImg.getBoundingClientRect().width : 0;
  const basePx = Math.round((hostW || 0) * COMMITTEE_OFFSET_RATIO * COMMITTEE_OFFSET_FACTOR);
  const stepPx = Math.max(COMMITTEE_OFFSET_MIN_PX, basePx || 0);
  const x = `${(idx + 1) * (stepPx || COMMITTEE_OFFSET_MIN_PX)}px`;
  return { x, y: COMMITTEE_OFFSET_Y };
}

function setAvatar(famId, emotionOrPath, opts = {}) {
  const img = getAvatarImg(famId);
  if (!img) return;
  // Support both emotion names (calm) and direct paths (nsfw/pose.png)
  let src = '';
  let relPath = '';

  // Check if this input triggers the "undressed" state (tee mode)
  if (emotionOrPath && (emotionOrPath.includes('/nsfw/') || emotionOrPath.startsWith('nsfw/'))) {
    FAM_UNDRESSED.set(famId, true);
  }

  if (emotionOrPath.includes('/') || emotionOrPath.includes('.')) {
    // Direct path usage (e.g. from catalog selector or specific moment)
    // Remove leading slash if any
    relPath = emotionOrPath.replace(/^\//, '');
    const safe = relPath.split('/').map(encodeURIComponent).join('/');
    src = `/familiars/${encodeURIComponent(famId)}/avatar/${safe}`;
  } else {
    // Emotion alias usage
    // If FAM_UNDRESSED is true for this familiar, try the "tee" folder first
    // (Assuming structure: avatar/nsfw/tee/emotion.png)
    if (FAM_UNDRESSED.get(famId)) {
      relPath = `nsfw/tee/${emotionOrPath}.png`;
      src = `/familiars/${encodeURIComponent(famId)}/avatar/nsfw/tee/${encodeURIComponent(emotionOrPath)}.png`;
    } else {
      relPath = `${emotionOrPath}.png`; // Approximate relative path for layout lookup
      src = `/familiars/${encodeURIComponent(famId)}/avatar/${encodeURIComponent(emotionOrPath)}.png`;
    }
  }

  if (opts && opts.preview) {
    src += '?preview=true';
  }

  const offset = opts.offset || getCommitteeOffset(famId);
  let bgKey = '';
  const bgEl = document.getElementById('avatarBg');
  if (bgEl && bgEl.style.backgroundImage) {
    const m = bgEl.style.backgroundImage.match(/background\/([^"')]+)/);
    if (m) bgKey = decodeURIComponent(m[1]);
  }
  const mode = isCommitteeActive() ? 'committee' : 'solo';
  const key = `${relPath}|${bgKey}|${offset?.x || ''}|${offset?.y || ''}|${mode}|${opts.preview ? 'preview' : ''}`;
  if (!opts.force && CURRENT_AVATAR_PATH.get(famId) === relPath && LAST_LAYOUT_KEY.get(famId) === key) {
    return;
  }

  img.onerror = () => {
    // General Fallback: if in a subfolder (matches /avatar/something/...) and fails, try base version
    if (src.includes('/avatar/') && (src.match(/\/avatar\/.+\//))) {
      // Revert to base filename
      const filename = relPath.split('/').pop();
      // If we already tried base (unlikely if relPath had logic), stop
      if (filename === relPath) {
        img.onerror = () => { img.src = '/static/avatar-default.svg'; };
        img.src = '/static/avatar-default.svg';
        return;
      }

      const standardSrc = src.replace(/\/avatar\/.+\//, '/avatar/');
      img.onerror = () => { img.src = '/static/avatar-default.svg'; };
      img.src = standardSrc;
      // Apply base layout
      applyLayout(famId, filename, img, opts.offset);
      return;
    }
    img.src = '/static/avatar-default.svg';
  };
  img.src = src;
  CURRENT_AVATAR_PATH.set(famId, relPath || '');

  // Apply Layout Transform
  applyLayout(famId, relPath, img, offset);
  LAST_LAYOUT_KEY.set(famId, key);
}

async function applyLayout(famId, relPath, imgEl, offset) {
  // Fetch resolved layout from server (includes global, outfit-specific, and location overrides)
  try {
    // Get current background for location-specific layout
    let bg = '';
    const bgEl = document.getElementById('avatarBg');
    if (bgEl && bgEl.style.backgroundImage) {
      const m = bgEl.style.backgroundImage.match(/background\/([^"')]+)/);
      if (m) bg = encodeURIComponent(decodeURIComponent(m[1]));
    }

    const mode = isCommitteeActive() ? 'committee' : 'solo';
    const cacheKey = `${famId}|${relPath}|${bg || ''}|${mode}`;
    let layout = LAYOUT_CACHE.get(cacheKey);
    if (!layout) {
      let pending = LAYOUT_PENDING.get(cacheKey);
      if (!pending) {
        const url = buildLayoutUrl(famId, relPath, bg, mode);
        pending = getJSON(url);
        LAYOUT_PENDING.set(cacheKey, pending);
      }
      layout = await pending;
      LAYOUT_CACHE.set(cacheKey, layout);
      LAYOUT_PENDING.delete(cacheKey);
    }

    const scale = layout.scale ?? 1.0;
    const x = layout.x ?? '0px';
    const y = layout.y ?? '0px';
    const origin = layout.transform_origin ?? 'center center';
    const mirror = layout.mirror ?? false;

    imgEl.style.transformOrigin = origin;

    const offX = offset?.x || "0px";
    const offY = offset?.y || "0px";
    const xExpr = `calc(${x} + ${offX})`;
    const yExpr = `calc(${y} + ${offY})`;
    const base = imgEl && imgEl.closest && imgEl.closest('#avatarGroup') ? 'translate(-50%, 0) ' : '';
    let transform = `${base}translate(${xExpr}, ${yExpr}) scale(${scale})`;
    if (mirror) {
      transform += ' scaleX(-1)';
    }
    imgEl.style.transform = transform;
  } catch (err) {
    console.error('Failed to fetch layout from server, using fallback:', err);
    // Fallback to old client-side logic
    applyLayoutFallback(famId, relPath, imgEl, offset);
  }
}

function applyLayoutFallback(famId, relPath, imgEl, offset) {
  const layouts = FAM_LAYOUTS.get(famId) || {};
  let bestMatch = {};
  let bestLen = -1;

  // Find most specific matching path in layout map
  // Layout keys are folder paths relative to avatar/ (e.g. "", "nsfw", "activities/cook")
  // We match if relPath starts with that folder
  const target = relPath.replace(/\\/g, '/'); // ensure forward slashes

  for (const [folder, config] of Object.entries(layouts)) {
    // Root config ("") matches everything if no better match found
    if (folder === "") {
      if (bestLen < 0) {
        bestMatch = config;
        bestLen = 0;
      }
      continue;
    }
    // Check if target matches folder (e.g. "nsfw/pose.png" starts with "nsfw/")
    if (target.startsWith(folder + '/') || target === folder) {
      if (folder.length > bestLen) {
        bestMatch = config;
        bestLen = folder.length;
      }
      continue;
    }
  }

  // Check for specific file overrides within the best matched config
  // The 'overrides' key can map filenames (e.g. "thinking.png") to layout objects
  if (bestMatch && bestMatch.overrides) {
    // We accept keys that match the file name or relative path
    // relPath is e.g. "nsfw/blush.png" or "thinking.png"

    // 1. Try exact match
    if (bestMatch.overrides[relPath]) {
      bestMatch = { ...bestMatch, ...bestMatch.overrides[relPath] };
    }
    // 2. Try basename match (e.g. "blush.png") if explicit path didn't match
    else {
      const parts = relPath.split('/');
      const filename = parts[parts.length - 1]; // "blush.png"
      if (bestMatch.overrides[filename]) {
        bestMatch = { ...bestMatch, ...bestMatch.overrides[filename] };
      }
    }
  }

  // --- Background-Specific Override ---
  // If the familiar has a background-specific layout config loaded
  const bgLayouts = BG_LAYOUTS.get(famId);
  if (bgLayouts) {
    // Determine current background from DOM or State
    // We try DOM first as it's the source of visual truth (style="background-image: url(...)")
    // format: url("/familiars/lumi/background/cabin_winter.png")
    const bgEl = document.getElementById('avatarBg');
    let currentBg = "";
    if (bgEl && bgEl.style.backgroundImage) {
      const m = bgEl.style.backgroundImage.match(/background\/([^"')]+)/);
      if (m) currentBg = decodeURIComponent(m[1]);
    }

    // If no DOM (startup?), try State map
    if (!currentBg) {
      const act = CURRENT_ACTIVITY.get(famId);
      if (act && act.background) currentBg = act.background;
    }

    if (currentBg && bgLayouts[currentBg]) {
      const overrides = bgLayouts[currentBg];
      // Apply override if it matches current relPath or filename
      // 1. Exact path match
      if (overrides[relPath]) {
        bestMatch = { ...bestMatch, ...overrides[relPath] };
      }
      // 2. Basename match
      else {
        const parts = relPath.split('/');
        const filename = parts[parts.length - 1];
        if (overrides[filename]) {
          bestMatch = { ...bestMatch, ...overrides[filename] };
        }
        // 3. 'default' fallback in this background
        else if (overrides['default']) {
          bestMatch = { ...bestMatch, ...overrides['default'] };
        }
      }
    }
  }
  // ------------------------------------

  // Check for state-based overrides (e.g. "greeting")
  if (bestMatch && bestMatch.states) {
    const isGreeting = document.body.classList.contains('greeting');
    if (isGreeting) {
      // Merge generic greeting config
      if (bestMatch.states.greeting) {
        bestMatch = { ...bestMatch, ...bestMatch.states.greeting };
      }
      // Merge activity-specific greeting config (e.g. "greeting_studying")
      const act = document.body.dataset.activity;
      if (act) {
        const key = `greeting_${act}`;
        if (bestMatch.states[key]) {
          bestMatch = { ...bestMatch, ...bestMatch.states[key] };
        }
      }
    }
  }

  const scale = bestMatch.scale ?? 1.0;
  const x = bestMatch.x ?? '0px';
  const y = bestMatch.y ?? '0px';
  const origin = bestMatch.transform_origin ?? 'center center';
  const mirror = bestMatch.mirror ?? false;

  imgEl.style.transformOrigin = origin;

  const offX = offset?.x || "0px";
  const offY = offset?.y || "0px";
  const xExpr = `calc(${x} + ${offX})`;
  const yExpr = `calc(${y} + ${offY})`;
  const base = imgEl && imgEl.closest && imgEl.closest('#avatarGroup') ? 'translate(-50%, 0) ' : '';
  let transform = `${base}translate(${xExpr}, ${yExpr}) scale(${scale})`;
  if (mirror) {
    transform += ' scaleX(-1)';
  }
  imgEl.style.transform = transform;
}

function setBackground(famId, filename) {
  // Don't use encodeURIComponent on filename - it would encode slashes needed for subfolders like christmas/
  const url = filename
    ? `/familiars/${encodeURIComponent(famId)}/background/${filename}`
    : '/static/backgrounds/void_space.svg';
  const bg = document.getElementById('avatarBg');
  if (bg) bg.style.backgroundImage = `url('${url}')`;

  // Also update state.json so familiar knows their location
  if (filename) {
    getJSON(`/familiars/${encodeURIComponent(famId)}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: filename })
    }).catch(e => console.warn('Failed to update location state:', e));
  }
}

function ensureAvatarSlot(famId) {
  if (AVATAR_IMGS.has(famId)) return AVATAR_IMGS.get(famId);
  const group = document.getElementById('avatarGroup');
  if (!group) return null;
  const img = el('img', 'avatar-guest');
  img.id = `avatarImg-${famId}`;
  img.alt = `${famId} avatar`;
  img.src = '/static/avatar-default.svg';
  group.appendChild(img);
  AVATAR_IMGS.set(famId, img);
  return img;
}

function removeAvatarSlot(famId) {
  const img = AVATAR_IMGS.get(famId);
  if (img && img.id !== 'avatarImg') {
    img.remove();
  }
  AVATAR_IMGS.delete(famId);
  CURRENT_AVATAR_PATH.delete(famId);
}

async function setAvatarFromState(famId) {
  try {
    const st = await getJSON(`/familiars/${encodeURIComponent(famId)}/state`);
    const emotion = st?.emotion || 'calm';
    setAvatar(famId, emotion, { offset: getCommitteeOffset(famId) });
  } catch {
    setAvatar(famId, 'calm', { offset: getCommitteeOffset(famId) });
  }
}

function syncCommitteeAvatars() {
  const hostImg = document.getElementById('avatarImg');
  if (CURRENT_FAM && hostImg) {
    AVATAR_IMGS.set(CURRENT_FAM, hostImg);
  }

  // Remove any stale guest slots
  for (const [famId, img] of AVATAR_IMGS.entries()) {
    if (famId !== CURRENT_FAM && !COMMITTEE_GUESTS.includes(famId)) {
      if (img && img.id !== 'avatarImg') img.remove();
      AVATAR_IMGS.delete(famId);
    }
  }

  // Ensure all guests have slots
  for (const famId of COMMITTEE_GUESTS) {
    if (famId !== CURRENT_FAM) ensureAvatarSlot(famId);
  }
}

function refreshCommitteeLayouts() {
  const all = [CURRENT_FAM, ...COMMITTEE_GUESTS].filter(Boolean);
  for (const famId of all) {
    const relPath = CURRENT_AVATAR_PATH.get(famId);
    if (relPath) {
      setAvatar(famId, relPath, { offset: getCommitteeOffset(famId) });
    } else {
      setAvatar(famId, 'calm', { offset: getCommitteeOffset(famId) });
    }
  }
}

  function addGuest(famId) {
    if (!famId || famId === CURRENT_FAM) return;
    if (!COMMITTEE_GUESTS.includes(famId)) {
      COMMITTEE_GUESTS.push(famId);
    }
    syncCommitteeAvatars();
    if (!CURRENT_AVATAR_PATH.get(famId)) {
      setAvatarFromState(famId);
    }
  refreshCommitteeLayouts();
  updateCommitteeButtons();
  updateGuestDevVisibility();
  try { refreshDevTargetSelector(); } catch { }
  try { updateDevDraggableClass(); } catch { }
  }

  function removeGuest(famId) {
    const idx = COMMITTEE_GUESTS.indexOf(famId);
    if (idx === -1) return;
    COMMITTEE_GUESTS.splice(idx, 1);
    removeAvatarSlot(famId);
  refreshCommitteeLayouts();
  updateCommitteeButtons();
  updateGuestDevVisibility();
  try { refreshDevTargetSelector(); } catch { }
  try { updateDevDraggableClass(); } catch { }
  }

function toggleGuest(famId) {
  if (COMMITTEE_GUESTS.includes(famId)) {
    removeGuest(famId);
  } else {
    if (!COMMITTEE_PENDING.has(famId)) {
      COMMITTEE_PENDING.add(famId);
      updateCommitteeButtons();
      sendInvite(famId).catch(console.error);
    }
  }
}

function updateCommitteeButtons() {
  document.querySelectorAll('.fam-item').forEach(i => {
    const id = i.dataset.id;
    const btn = i.querySelector('.fam-add-btn');
    if (!btn) return;
    const active = COMMITTEE_GUESTS.includes(id);
    btn.classList.toggle('active', active);
    if (active) {
      btn.textContent = 'x';
    } else if (COMMITTEE_PENDING.has(id)) {
      btn.textContent = '…';
    } else {
      btn.textContent = '+';
    }
  });
}

async function sendInvite(guestId) {
  const hostId = document.getElementById('familiar').value;
  if (!hostId || !guestId) return;
  if (PENDING_TURN) return;

  const hostData = FAMILIARS.get(hostId);
  const hostName = hostData?.name || hostId;
  const guestData = FAMILIARS.get(guestId);
  const guestName = guestData?.name || guestId;
  const hostAvatar = `/familiars/${encodeURIComponent(hostId)}/profile/profile.png`;
  const guests = COMMITTEE_GUESTS.filter(id => id && id !== hostId);
  if (!guests.includes(guestId)) guests.push(guestId);

  try {
    const payload = {
      familiar: hostId,
      message: `Invite ${guestName} to the room.`,
      kind: "invite",
      invite_familiar: guestId,
      committee: { guests }
    };
    const res = await getJSON('/chat', { method: 'POST', body: JSON.stringify(payload) });

    let secs = 0;
    let dots = 1;
    const bubble = appendBubble(`Inviting ${guestName}... (0s)`, 'bot', hostName, hostAvatar);
    const imgEl = getAvatarImg(hostId);
    if (imgEl) {
      setAvatar(hostId, thinkingPathFor(hostId));
    }

    const tick = () => {
      secs += 1;
      dots = (dots % 3) + 1;
      bubble.textContent = `Inviting ${guestName}${'.'.repeat(dots)} (${secs}s)`;
    };
    const timer = setInterval(tick, 1000);
    const token = ++POLL_TOKEN;
    const famAtSend = hostId;

    PENDING_TURN = { familiar: hostId, turn_id: res.turn_id, timer, thinkingRows: bubble?.parentElement ? [bubble.parentElement] : [], committee: true, guests };
    showCancelButton(true);

    let done = false;
    const finishPending = () => {
      done = true;
      clearInterval(timer);
      if (PENDING_TURN && PENDING_TURN.thinkingRows) {
        for (const row of PENDING_TURN.thinkingRows) {
          try { row.remove(); } catch { }
        }
      }
      PENDING_TURN = null;
      showCancelButton(false);
    };

    const poll = async () => {
      try {
        if (done) return;
        if (token !== POLL_TOKEN || famAtSend !== document.getElementById('familiar').value) {
          clearInterval(timer);
          return;
        }
        const s = await getJSON(`/cli/status?familiar=${encodeURIComponent(hostId)}&turn_id=${encodeURIComponent(res.turn_id)}`);
        if (s.status === 'cancelled') {
          finishPending();
          appendBubble('(Cancelled)', 'bot', hostName, hostAvatar);
          setAvatar(hostId, 'calm');
          COMMITTEE_PENDING.delete(guestId);
          updateCommitteeButtons();
          return;
        }
        if (s.status === 'responded' && token === POLL_TOKEN && famAtSend === document.getElementById('familiar').value) {
          done = true;
          finishPending();
          try {
            if (s.raw_reply) {
              const prompts = normalizePromptSuggestions(s.prompts || extractPromptTags(s.raw_reply) || extractPromptTags(s.reply));
              const loc = extractLocationTag(s.raw_reply);
              if (loc) {
                setBackground(hostId, loc);
              }
              const lines = parseCommitteeReply(s.raw_reply);
              // Ensure guest slots exist before applying avatar changes
              for (const line of lines) {
                if (line.famId && line.famId !== hostId) {
                  ensureAvatarSlot(line.famId);
                }
              }
              let lastBubble = null;
              for (const line of lines) {
                const famId = line.famId || hostId;
                const fData = FAMILIARS.get(famId);
                const name = line.speaker || fData?.name || famId;
                const avatar = `/familiars/${encodeURIComponent(famId)}/profile/profile.png`;
                lastBubble = appendBubble(line.text || '', 'bot', name, avatar);
                if (line.pose) {
                  setAvatar(famId, line.pose, { offset: getCommitteeOffset(famId) });
                } else if (famId) {
                  setAvatarFromState(famId);
                }
              }
              if (!lines.length) {
                lastBubble = appendBubble(s.reply || '', 'bot', hostName, hostAvatar);
              }
              attachPromptSuggestions(lastBubble, prompts);
            } else {
              const prompts = normalizePromptSuggestions(s.prompts || extractPromptTags(s.reply));
              const bubble = appendBubble(s.reply || '', 'bot', hostName, hostAvatar);
              attachPromptSuggestions(bubble, prompts);
            }
          } catch (err) {
            console.error('Invite response handling failed:', err);
            appendBubble('Invite received. (Render error)', 'bot', hostName, hostAvatar);
          }
          COMMITTEE_PENDING.delete(guestId);
          addGuest(guestId);
          renderIdentity(hostId);
          return;
        }
      } catch { }
      setTimeout(poll, 800);
    };
    poll();
  } catch (e) {
    appendBubble('Invite failed.', 'bot', hostName, hostAvatar);
  }
}

function thinkingPathFor(famId) {
  const rel = CURRENT_AVATAR_PATH.get(famId);
  if (rel) {
    const parts = rel.split('/');
    if (parts.length > 1) {
      const folder = parts.slice(0, -1).join('/');
      if (folder.startsWith('activities')) {
        return 'thinking';
      }
      return `${folder}/thinking.png`;
    }
    return 'thinking';
  }
  const imgEl = getAvatarImg(famId);
  if (imgEl && imgEl.src && imgEl.src.includes('/avatar/')) {
    try {
      const cleanSrc = imgEl.src.split('?')[0];
      const m = cleanSrc.match(/\/avatar\/(.+)\/[^/]+$/);
      if (m) {
        const folder = decodeURIComponent(m[1]);
        if (folder.startsWith('activities')) {
          return 'thinking';
        }
        return `${folder}/thinking.png`;
      }
    } catch { }
  }
  return 'thinking';
}

const FAMILIARS = new Map();
let CURRENT_FAM = null;
let POLL_TOKEN = 0;
// Track a selected activity per familiar (id -> { id, avatar, background })
const CURRENT_ACTIVITY = new Map();
// Track current pending turn for cancellation (null when not pending)
let PENDING_TURN = null; // { familiar, turn_id, timer }
// User's nickname and avatar from profile (loaded when switching familiar)
let USER_NICKNAME = 'You';
let USER_AVATAR = '/static/avatar-default.svg';

async function loadFamiliars() {
  const famList = document.getElementById('familiarList');
  famList.innerHTML = '';
  const list = await getJSON('/familiars');

  // Pre-fetch layouts for all discovered familiars
  for (const f of list) {
    try {
      const lay = await getJSON(`/familiars/${encodeURIComponent(f.id)}/layout`);
      FAM_LAYOUTS.set(f.id, lay);
    } catch { }
    try {
      // Fetch location-specific layout overrides
      const bgLay = await getJSON(`/familiars/${encodeURIComponent(f.id)}/locations/layout.json`);
      BG_LAYOUTS.set(f.id, bgLay);
    } catch { }
  }

  for (const f of list) {
    FAMILIARS.set(f.id, f);

    // Create Sidebar Item
    const item = el('div', 'fam-item');
    item.dataset.id = f.id;
    item.onclick = async () => switchFamiliar(f.id);

    // Profile Thumb (try profile.png, fallback to id)
    const thumb = el('img', 'fam-avatar-thumb');
    // Using a timestamp to bust cache if needed, or simple path
    thumb.src = `/familiars/${encodeURIComponent(f.id)}/profile/profile.png`;
    thumb.onerror = () => { thumb.src = '/static/avatar-default.svg'; };
    item.appendChild(thumb);

    const label = el('span', 'fam-name', f.name || f.id);
    item.appendChild(label);

    const actions = el('div', 'fam-actions');
    const addBtn = el('button', 'fam-add-btn', '+');
    addBtn.title = 'Add to room';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleGuest(f.id);
    });
    actions.appendChild(addBtn);
    item.appendChild(actions);

    famList.appendChild(item);
  }

  if (list.length) {
    const preferred = list.find(x => x.id.toLowerCase() === 'lumi') || list[0];
    await switchFamiliar(preferred.id);
  }
}

async function switchFamiliar(id) {
  const prevHost = CURRENT_FAM;
  // Update Active State in Sidebar
  document.querySelectorAll('.fam-item').forEach(i => {
    i.classList.toggle('active', i.dataset.id === id);
  });

  try { document.body.dataset.fam = id; } catch { }
  // Update hidden input for legacy compatibility
  const hiddenInput = document.getElementById('familiar');
  if (hiddenInput) hiddenInput.value = id;

  CURRENT_FAM = id;
  // Host cannot be a guest
  if (COMMITTEE_GUESTS.includes(id)) {
    removeGuest(id);
  }

  // Load user's nickname and avatar from server (Chronos profile.yml or familiar profile.json)
  try {
    const profileResp = await getJSON(`/user-profile?familiar=${encodeURIComponent(id)}`);
    USER_NICKNAME = profileResp?.nickname || 'You';
    USER_AVATAR = profileResp?.avatar || '/static/avatar-default.svg';
  } catch {
    USER_NICKNAME = 'You';
    USER_AVATAR = '/static/avatar-default.svg';
  }

  // Reset chat for new familiar
  const wrap = document.getElementById('messages');
  if (wrap) wrap.innerHTML = '';

  syncCommitteeAvatars();
  if (prevHost && prevHost !== id && COMMITTEE_GUESTS.includes(prevHost)) {
    ensureAvatarSlot(prevHost);
  }

  await selectAndApplyActivity(id);
  renderIdentity(id);
  if (COMMITTEE_GUESTS.length) {
    refreshCommitteeLayouts();
  }
  updateCommitteeButtons();
  try { refreshDevTargetSelector(); } catch { }
  try { updateDevDraggableClass(); } catch { }

  // Auto-greet
  sendGreet(id).catch(console.error);
}

function appendBubble(text, who, senderName = null, avatarUrl = null) {
  const wrap = document.getElementById('messages');

  // Create message row container
  const row = el('div', `message-row ${who}`);

  // Create avatar container with pic and name
  const avatarContainer = el('div', 'message-avatar');
  const avatarImg = el('img', 'message-avatar-img');
  avatarImg.src = avatarUrl || '/static/avatar-default.svg';
  avatarImg.onerror = () => { avatarImg.src = '/static/avatar-default.svg'; };
  avatarContainer.appendChild(avatarImg);

  // Name label under avatar
  if (senderName) {
    const nameLabel = el('div', 'message-avatar-name');
    nameLabel.textContent = senderName;
    avatarContainer.appendChild(nameLabel);
  }

  // Create bubble with text
  const bubble = el('div', `bubble ${who}`);
  const msgText = el('div', 'bubble-text');
  msgText.textContent = text;
  bubble.appendChild(msgText);

  // Assemble: avatar on left for bot, right for user
  if (who === 'user') {
    row.appendChild(bubble);
    row.appendChild(avatarContainer);
  } else {
    row.appendChild(avatarContainer);
    row.appendChild(bubble);
  }

  wrap.appendChild(row);
  wrap.scrollTop = wrap.scrollHeight;
  return bubble;
}

function normalizePromptSuggestions(list, cap = 3) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const val = String(raw || '').trim();
    if (!val) continue;
    const key = val.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(val);
    if (out.length >= cap) break;
  }
  return out;
}

function extractPromptTags(rawText) {
  if (!rawText) return [];
  const matches = String(rawText).match(/<\s*prompt\s*:\s*([^>]+)\s*>/gi) || [];
  return matches.map(tag => tag.replace(/<\s*prompt\s*:\s*/i, '').replace(/\s*>$/, '').trim()).filter(Boolean);
}

function attachPromptSuggestions(bubble, prompts) {
  const items = normalizePromptSuggestions(prompts);
  if (!bubble || !items.length) return;
  const container = el('div', 'prompt-suggestions');
  for (const text of items) {
    const btn = el('button', 'prompt-suggestion', text);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      const msgEl = document.getElementById('message');
      if (!msgEl) return;
      msgEl.value = text;
      msgEl.dispatchEvent(new Event('input', { bubbles: true }));
      msgEl.focus();
    });
    container.appendChild(btn);
  }
  bubble.appendChild(container);
}

function findFamiliarIdByName(name) {
  if (!name) return '';
  const target = name.trim().toLowerCase();
  for (const [id, data] of FAMILIARS.entries()) {
    const n = (data?.name || '').toLowerCase();
    const fn = (data?.full_name || '').toLowerCase();
    if (n === target || fn === target) return id;
  }
  return '';
}

function normalizeFamiliarId(token) {
  if (!token) return '';
  const t = token.trim().toLowerCase();
  if (FAMILIARS.has(t)) return t;
  for (const [id, data] of FAMILIARS.entries()) {
    const n = (data?.name || '').toLowerCase();
    const fn = (data?.full_name || '').toLowerCase();
    if (n === t || fn === t) return id;
  }
  return '';
}

function normalizeAvatarPose(famId, pose) {
  if (!pose) return '';
  let p = String(pose).trim();
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
    p = p.slice(1, -1).trim();
  }
  p = p.replace(/^\//, '');
  if (p.toLowerCase().startsWith('avatar/')) {
    p = p.slice('avatar/'.length);
  }
  const famPrefix = (famId || '').toLowerCase() + '/';
  if (famPrefix && p.toLowerCase().startsWith(famPrefix)) {
    p = p.slice(famPrefix.length);
  }
  if (p.includes('/') && !p.includes('.')) {
    p = p + '.png';
  }
  return p;
}

function parseCommitteeReply(rawText) {
  const lines = (rawText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out = [];
  let activeSpeaker = '';
  for (const line of lines) {
    if (/^<\s*(emotion|state|hearts|location|background|pose|avatar|prompt)\s*:/i.test(line)) {
      continue;
    }
    const tagMatch = line.match(/<\s*avatar\s*:\s*([^>]+)\s*>/i);
    const avatarTag = tagMatch ? tagMatch[1].trim() : '';
    const cleaned = line
      .replace(/<\s*avatar\s*:[^>]+>/i, '')
      .replace(/<\s*(emotion|state|hearts|location|background|pose|prompt)\s*:[^>]+>/gi, '')
      .trim();
    const bracketMatch = cleaned.match(/^\[([^\]]+)\]\s*:\s*(.*)$/);
    let speaker = '';
    let text = cleaned;
    if (bracketMatch) {
      speaker = bracketMatch[1].trim();
      text = bracketMatch[2].trim();
      if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        text = text.slice(1, -1).trim();
      }
    }
    if (!speaker && !avatarTag && cleaned) {
      const onlyName = findFamiliarIdByName(cleaned);
      if (onlyName) {
        activeSpeaker = cleaned;
        continue;
      }
    }
    if (!speaker && activeSpeaker) {
      speaker = activeSpeaker;
    }
    const speakerId = findFamiliarIdByName(speaker);
    if (!avatarTag && !speakerId) continue;
    const parts = avatarTag.split('/');
    const tagFam = parts.length > 1 ? normalizeFamiliarId(parts[0]) : '';
    const famId = tagFam || speakerId || '';
    const poseRaw = parts.length > 1 ? parts.slice(1).join('/') : (avatarTag || '');
    const pose = normalizeAvatarPose(famId, poseRaw);
    out.push({ speaker, text, famId, pose, avatarTag });
  }
  return out;
}

function extractLocationTag(rawText) {
  const m = rawText.match(/<\s*(location|background)\s*:\s*([a-zA-Z0-9_\-./]+)\s*>/i);
  return m ? m[2] : '';
}

function showCancelButton(show) {
  const btn = document.getElementById('cancelBtn');
  if (btn) {
    btn.style.display = show ? 'inline-block' : 'none';
  }
}

async function cancelPending() {
  if (!PENDING_TURN) return;
  const { familiar, turn_id, timer } = PENDING_TURN;
  try {
    await getJSON('/cli/cancel', {
      method: 'POST',
      body: JSON.stringify({ familiar, turn_id })
    });
    console.log(`[ADUC] Cancelled turn ${turn_id}`);
  } catch (e) {
    console.error('[ADUC] Cancel failed:', e);
  }
  // Let the poll detect cancelled status; don't clear PENDING_TURN here
}

async function sendMessage() {
  const fam = document.getElementById('familiar').value;
  CURRENT_FAM = fam;
  const msgEl = document.getElementById('message');
  const msg = msgEl.value.trim();
  if (!msg) return;
  const guests = COMMITTEE_GUESTS.filter(id => id && id !== fam);
  const committeeMode = guests.length > 0;

  // Get familiar name and avatar for display
  const famData = FAMILIARS.get(fam);
  const famName = famData?.name || fam;
  const famAvatar = `/familiars/${encodeURIComponent(fam)}/profile/profile.png`;

  appendBubble(msg, 'user', USER_NICKNAME, USER_AVATAR);
  msgEl.value = '';
  // Reset textarea height after send
  msgEl.style.height = 'auto';

  try {
    const payload = committeeMode
      ? { familiar: fam, message: msg, committee: { guests } }
      : { familiar: fam, message: msg };
    const res = await getJSON('/chat', { method: 'POST', body: JSON.stringify(payload) });
    // Show thinking indicator and poll for CLI reply
    let secs = 0;
    let dots = 1;
    const thinkingRows = [];
    const thinkingBubbles = [];

    const showThinkingFor = (fid) => {
      const fData = FAMILIARS.get(fid);
      const name = fData?.name || fid;
      const avatar = `/familiars/${encodeURIComponent(fid)}/profile/profile.png`;
      const bubble = appendBubble('Thinking... (0s)', 'bot', name, avatar);
      thinkingBubbles.push(bubble);
      if (bubble && bubble.parentElement) thinkingRows.push(bubble.parentElement);
      setAvatar(fid, thinkingPathFor(fid));
    };

    if (committeeMode) {
      showThinkingFor(fam);
      guests.forEach(showThinkingFor);
    } else {
      showThinkingFor(fam);
    }

    const tick = () => {
      secs += 1;
      dots = (dots % 3) + 1;
      for (const bubble of thinkingBubbles) {
        bubble.textContent = `Thinking${'.'.repeat(dots)} (${secs}s)`;
      }
    };
    const timer = setInterval(tick, 1000);
    const token = ++POLL_TOKEN;
    const famAtSend = fam;

    // Track pending turn for cancellation
    PENDING_TURN = { familiar: fam, turn_id: res.turn_id, timer, thinkingRows, committee: committeeMode, guests };
    showCancelButton(true);

    const finishPending = () => {
      clearInterval(timer);
      if (PENDING_TURN && PENDING_TURN.thinkingRows) {
        for (const row of PENDING_TURN.thinkingRows) {
          try { row.remove(); } catch { }
        }
      }
      PENDING_TURN = null;
      showCancelButton(false);
    };

    let done = false;
    const poll = async () => {
      try {
        if (done) return;
        if (token !== POLL_TOKEN || famAtSend !== document.getElementById('familiar').value) {
          clearInterval(timer);
          return;
        }
        const s = await getJSON(`/cli/status?familiar=${encodeURIComponent(fam)}&turn_id=${encodeURIComponent(res.turn_id)}`);
        if (s.status === 'cancelled') {
          // Turn was cancelled
          done = true;
          finishPending();
          appendBubble('(Cancelled)', 'bot', famName, famAvatar);
          setAvatar(fam, 'calm');
          return;
        }
        if (s.status === 'responded' && token === POLL_TOKEN && famAtSend === document.getElementById('familiar').value) {
          done = true;
          finishPending();
          try {
            if (committeeMode && s.raw_reply) {
              const prompts = normalizePromptSuggestions(s.prompts || extractPromptTags(s.raw_reply) || extractPromptTags(s.reply));
              const loc = extractLocationTag(s.raw_reply);
              if (loc) {
                setBackground(fam, loc);
              }
              const lines = parseCommitteeReply(s.raw_reply);
              let lastBubble = null;
              for (const line of lines) {
                const famId = line.famId || fam;
                const fData = FAMILIARS.get(famId);
                const name = line.speaker || fData?.name || famId;
                const avatar = `/familiars/${encodeURIComponent(famId)}/profile/profile.png`;
                lastBubble = appendBubble(line.text || '', 'bot', name, avatar);
                if (line.pose) {
                  setAvatar(famId, line.pose, { offset: getCommitteeOffset(famId) });
                } else if (famId) {
                  setAvatarFromState(famId);
                }
              }
              if (!lines.length) {
                lastBubble = appendBubble(s.reply || '', 'bot', famName, famAvatar);
              }
              attachPromptSuggestions(lastBubble, prompts);
            } else {
              const prompts = normalizePromptSuggestions(s.prompts || extractPromptTags(s.reply));
              const bubble = appendBubble(s.reply, 'bot', famName, famAvatar);
              attachPromptSuggestions(bubble, prompts);
              // Use pose if set, otherwise fallback to emotion
              const avatarVal = s.pose || s.emotion || 'calm';
              setAvatar(fam, avatarVal);
              try { document.body.dataset.emotion = avatarVal; } catch { }

              // Trigger kiss effect if pose contains "kiss"
              if (avatarVal.toLowerCase().includes('kiss')) {
                showKissEffect();
              }
            }
          } catch (err) {
            console.error('Chat response handling failed:', err);
            appendBubble('Reply received. (Render error)', 'bot', famName, famAvatar);
          }

          // Handle background change from familiar response
          if (s.background) {
            setBackground(fam, s.background);
            // Update state with new background for persistence
            try {
              const curAct = CURRENT_ACTIVITY.get(fam) || {};
              CURRENT_ACTIVITY.set(fam, { ...curAct, background: s.background });
              await getJSON(`/familiars/${encodeURIComponent(fam)}/state`, { method: 'POST', body: JSON.stringify({ activity: s.background }) });
            } catch { }
          }
          try { await getJSON(`/familiars/${encodeURIComponent(fam)}/state`, { method: 'POST', body: JSON.stringify({ activity: "" }) }); } catch { }
          // Refresh hearts after a successful reply
          renderIdentity(fam);
          // If a dev-triggered break is pending, trigger it now (after this message)
          try { maybeTriggerPendingBreak(); } catch { }
          return;
        }
      } catch (e) {
        // ignore transient errors
      }
      setTimeout(poll, 1000);
    };
    setTimeout(poll, 1000);
  } catch (e) {
    appendBubble(`Error: ${e.message}`, 'bot');
  }
}

async function sendGreet(famId) {
  const fam = famId || document.getElementById('familiar').value;
  CURRENT_FAM = fam;
  try {
    // Mark greeting state for CSS (avatar size override)
    try { document.body.classList.add('greeting'); } catch { }
    const act = CURRENT_ACTIVITY.get(fam);
    const res = await getJSON('/greet', { method: 'POST', body: JSON.stringify({ familiar: fam, activity: act ? act.id : undefined }) });
    let secs = 0;
    let dots = 1;
    const baseLbl = (act && act.label) ? String(act.label) : 'Loading';
    const label = baseLbl.charAt(0).toUpperCase() + baseLbl.slice(1);
    const bubble = appendBubble(`${label}... (0s)`, 'bot');
    const tick = () => {
      secs += 1;
      dots = (dots % 3) + 1;
      bubble.textContent = `${label}${'.'.repeat(dots)} (${secs}s)`;
    };
    const timer = setInterval(tick, 1000);
    const token = ++POLL_TOKEN;
    const famAtSend = fam;
    let done = false;
    const poll = async () => {
      try {
        if (done) return;
        if (token !== POLL_TOKEN || famAtSend !== document.getElementById('familiar').value) {
          clearInterval(timer);
          return;
        }
        const s = await getJSON(`/cli/status?familiar=${encodeURIComponent(fam)}&turn_id=${encodeURIComponent(res.turn_id)}`);
        if (s.status === 'responded' && token === POLL_TOKEN && famAtSend === document.getElementById('familiar').value) {
          done = true;
          clearInterval(timer);
          bubble.textContent = s.reply;
          // Remove greeting class BEFORE setting avatar so layout applies correctly
          try { document.body.classList.remove('greeting'); } catch { }

          // Only change avatar if pose is explicitly set in response
          // This keeps the activity avatar for visual continuity
          if (s.pose) {
            setAvatar(fam, s.pose);
            try { document.body.dataset.emotion = s.pose; } catch { }
            // Trigger kiss effect if pose contains "kiss"
            if (s.pose.toLowerCase().includes('kiss')) {
              showKissEffect();
            }
          }
          // Always update emotion dataset for other purposes
          if (s.emotion) {
            try { document.body.dataset.emotion = s.emotion; } catch { }
          }

          // Handle background change from familiar response
          if (s.background) {
            setBackground(fam, s.background);
            // Update state with new background for persistence
            try {
              const curAct = CURRENT_ACTIVITY.get(fam) || {};
              CURRENT_ACTIVITY.set(fam, { ...curAct, background: s.background });
              await getJSON(`/familiars/${encodeURIComponent(fam)}/state`, { method: 'POST', body: JSON.stringify({ activity: s.background }) });
            } catch { }
          }
          try { await getJSON(`/familiars/${encodeURIComponent(fam)}/state`, { method: 'POST', body: JSON.stringify({ activity: "" }) }); } catch { }
          // Refresh hearts after a successful reply
          renderIdentity(fam);
          // If a dev-triggered break is pending, trigger it now (after this message)
          try { maybeTriggerPendingBreak(); } catch { }
          return;
        }
      } catch (_) {
        // ignore transient errors
      }
      setTimeout(poll, 1000);
    };
    setTimeout(poll, 500);
  } catch (e) {
    appendBubble(`Error: ${e.message}`, 'bot');
    try { clearInterval(timer); } catch { }
    try { document.body.classList.remove('greeting'); } catch { }
  }
}

// [Deleted legacy initialization]

async function setupAvatarSelector() {
  const selector = document.getElementById('devAvatarSelector');
  if (!selector) return; // Must be added to HTML first

  // Refresh list on open (or specific event), but for now just load on init if familiar selected
  const populate = async () => {
    const fam = document.getElementById('familiar').value;
    if (!fam) return;
    selector.innerHTML = '<option value="">-- Testing: Select Avatar --</option>';
    try {
      const catalog = await getJSON(`/familiars/${encodeURIComponent(fam)}/catalog`);
      const poses = catalog.poses || [];
      // Sort by category then name
      poses.sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.id.localeCompare(b.id));

      for (const p of poses) {
        const opt = document.createElement('option');
        opt.value = p.id; // relative path e.g. "nsfw/pose.png"
        opt.textContent = `[${p.category}] ${p.id}`;
        selector.appendChild(opt);
      }
    } catch { }
  };

  // Repopulate when familiar changes
  document.getElementById('familiar').addEventListener('change', populate);
  // Initial populate
  setTimeout(populate, 1000);

  selector.addEventListener('change', () => {
    const val = selector.value;
    const fam = document.getElementById('familiar').value;
    if (val && fam) {
      setAvatar(fam, val, { preview: true });
    }
  });
}

async function loadActivities(famId) {
  try {
    const data = await getJSON(`/familiars/${encodeURIComponent(famId)}/activities`);
    const acts = Array.isArray(data.activities) ? data.activities : [];
    return acts;
  } catch {
    return [];
  }
}

async function selectAndApplyActivity(famId) {
  const acts = await loadActivities(famId);
  if (acts.length === 0) {
    // Fallback to default visuals
    setAvatar(famId, 'calm');
    const f = FAMILIARS.get(famId);
    if (f && f.default_background) setBackground(famId, f.default_background);
    try { delete document.body.dataset.activity; } catch { }
    return;
  }
  // Pick a random activity, avoid repeating the last one for this familiar if possible
  let picked = acts[Math.floor(Math.random() * acts.length)];
  try {
    const key = `aduc_last_activity_${famId}`;
    const lastId = localStorage.getItem(key);
    if (acts.length > 1 && lastId && picked.id === lastId) {
      // Choose the next different activity deterministically
      const idx = acts.findIndex(a => a.id === picked.id);
      picked = acts[(idx + 1) % acts.length];
    }
    localStorage.setItem(key, picked.id);
  } catch { }
  CURRENT_ACTIVITY.set(famId, picked);
  try { document.body.dataset.activity = picked.id; } catch { }
  // Apply visuals from activity using setAvatar for proper layout
  setAvatar(famId, picked.avatar);
  setBackground(famId, picked.background);
  // Persist current activity into familiar state so the watcher can see it
  try {
    await getJSON(`/familiars/${encodeURIComponent(famId)}/state`, { method: 'POST', body: JSON.stringify({ activity: picked.id }) });
  } catch { }
}

// [Deleted legacy renderIdentity/Meta logic to fix syntax error]



function drawHearts(value) {
  const heartsEl = document.getElementById('hearts');
  heartsEl.innerHTML = '';
  const max = 5;
  const full = Math.floor(value);
  const frac = Math.max(0, Math.min(1, value - full));
  for (let i = 0; i < max; i++) {
    const wrap = document.createElement('span');
    wrap.className = 'heart';
    wrap.textContent = '\u2665'; // base outline
    const fill = document.createElement('span');
    fill.className = 'fill';
    fill.textContent = '\u2665';
    if (i < full) {
      wrap.classList.add('filled');
      fill.style.width = '100%';
    } else if (i === full && frac >= 0.25) {
      wrap.classList.add('half');
      fill.style.width = '50%';
    }
    wrap.appendChild(fill);
    heartsEl.appendChild(wrap);
  }
}



async function loadSettings() {
  try {
    const s = await getJSON('/settings');
    document.getElementById('nsfwEnabled').checked = !!s.nsfw_enabled;
    if (document.getElementById('devNSFWOverride')) {
      document.getElementById('devNSFWOverride').checked = !!s.dev_nsfw_override;
    }
    if (document.getElementById('devJourneyInstant')) {
      document.getElementById('devJourneyInstant').checked = !!s.dev_instant_journey_return;
    }
    if (document.getElementById('devBypassFamCache')) {
      document.getElementById('devBypassFamCache').checked = !!s.disable_familiar_cache;
    }
    const qs = (s.quiet_hours && s.quiet_hours.start) || '23:00';
    const qe = (s.quiet_hours && s.quiet_hours.end) || '07:00';
    document.getElementById('quietStart').value = qs;
    document.getElementById('quietEnd').value = qe;
    document.getElementById('dailyCap').value = s.daily_nsfw_cap ?? 0;

    // Populate dev avatar selector if empty
    const sel = document.getElementById('devAvatarSelector');
    const famId = document.getElementById('familiar').value;
    if (sel && famId && sel.options.length === 0) {
      getJSON(`/familiars/${famId}/layout`).then(layout => {
        sel.innerHTML = '<option value="">(Select Avatar Code)</option>';
        // flatten
        for (const cat in layout) {
          for (const sub in layout[cat]) {
            // layout[cat][sub] is array of strings
            layout[cat][sub].forEach(code => {
              const opt = document.createElement('option');
              opt.value = code;
              opt.textContent = code;
              sel.appendChild(opt);
            });
          }
        }
      }).catch(() => { });

      // Bind change
      sel.addEventListener('change', () => {
        if (sel.value) {
          const tag = `<pose: ${sel.value}>`;
          appendMessage('cli', `[DEV TEST] ${tag}`);
          // Also force background update?
          const img = document.getElementById('avatarImg');
          if (img) img.src = `/familiars/${famId}/avatar/${sel.value}`;
        }
      });
    }
    // Load per-familiar preferences
    if (document.getElementById('prefEditor') && document.getElementById('familiar')) {
      const famId = document.getElementById('familiar').value;
      if (famId) {
        getJSON(`/familiars/${encodeURIComponent(famId)}/preferences`)
          .then(r => { document.getElementById('prefEditor').value = r.content || ''; })
          .catch(() => { document.getElementById('prefEditor').value = ''; });
      }
    }
    // Load per-familiar memories
    if (document.getElementById('memEditor') && document.getElementById('familiar')) {
      const famId = document.getElementById('familiar').value;
      if (famId) {
        getJSON(`/familiars/${encodeURIComponent(famId)}/memories`)
          .then(r => { document.getElementById('memEditor').value = r.content || ''; })
          .catch(() => { document.getElementById('memEditor').value = ''; });
      }
    }

  } catch (e) {
    // ignore
  }
}

async function saveSettings() {
  const status = document.getElementById('settingsStatus');
  try {
    const body = {
      nsfw_enabled: document.getElementById('nsfwEnabled').checked,
      dev_nsfw_override: !!(document.getElementById('devNSFWOverride') && document.getElementById('devNSFWOverride').checked),
      dev_instant_journey_return: !!(document.getElementById('devJourneyInstant') && document.getElementById('devJourneyInstant').checked),
      disable_familiar_cache: !!(document.getElementById('devBypassFamCache') && document.getElementById('devBypassFamCache').checked),
      quiet_hours: {
        start: document.getElementById('quietStart').value || '23:00',
        end: document.getElementById('quietEnd').value || '07:00'
      },
      daily_nsfw_cap: parseInt(document.getElementById('dailyCap').value || '0', 10)
    };
    await getJSON('/settings', { method: 'POST', body: JSON.stringify(body) });

    // Save per-familiar preferences
    if (document.getElementById('prefEditor') && CURRENT_FAM) {
      const content = document.getElementById('prefEditor').value;
      await getJSON(`/familiars/${encodeURIComponent(CURRENT_FAM)}/preferences`, { method: 'POST', body: JSON.stringify({ content }) });
    }

    // Save per-familiar memories
    if (document.getElementById('memEditor') && CURRENT_FAM) {
      const content = document.getElementById('memEditor').value;
      await getJSON(`/familiars/${encodeURIComponent(CURRENT_FAM)}/memories`, { method: 'POST', body: JSON.stringify({ content }) });
    }

    status.textContent = 'Saved';
    // Refresh identity/avatars and hearts immediately after saving
    if (CURRENT_FAM) {
      await renderIdentity(CURRENT_FAM);
      // Also re-render avatar according to current emotion if last reply set one
      try {
        const st = await getJSON(`/familiars/${encodeURIComponent(CURRENT_FAM)}/state`);
        const emo = (st && st.emotion) ? st.emotion : 'calm';
        setAvatar(CURRENT_FAM, emo);
      } catch { }
    }
    setTimeout(() => status.textContent = '', 1500);
  } catch (e) {
    status.textContent = 'Error saving';
  }
}

// ---- Clear Docs Cache -------------------------------------------------------
document.getElementById('clearCacheBtn')?.addEventListener('click', async () => {
  try {
    const res = await getJSON('/clear-cache', { method: 'POST' });
    const status = document.getElementById('settingsStatus');
    if (status) {
      status.textContent = res.message || 'Cache cleared!';
      setTimeout(() => status.textContent = '', 2000);
    }
  } catch (e) {
    console.error('Clear cache error:', e);
  }
});

// ---- Clear Conversation History ---------------------------------------------
document.getElementById('clearConversationBtn')?.addEventListener('click', async () => {
  try {
    const res = await getJSON('/clear-conversation', { method: 'POST' });
    const status = document.getElementById('settingsStatus');
    if (status) {
      status.textContent = res.message || 'Conversation cleared!';
      setTimeout(() => status.textContent = '', 2000);
    }
    // Also clear the chat bubbles in the UI
    const chatEl = document.getElementById('chat');
    if (chatEl) chatEl.innerHTML = '';
  } catch (e) {
    console.error('Clear conversation error:', e);
  }
});

// ---- Pomodoro ---------------------------------------------------------------
let POMO_MODE = 'focus'; // 'focus' | 'break'
let POMO_INTERVAL = null;
let POMO_REMAIN = 25 * 60; // seconds
let POMO_FOCUS_SEC = 25 * 60;
let POMO_BREAK_SEC = 5 * 60;
let POMO_LONG_BREAK_SEC = 15 * 60; // long break (adjustable)
let POMO_LONG_EVERY = 4; // sessions per long break
let POMO_LONG_ENABLED = true;
let POMO_FOCUS_COUNT = 0; // completed focus sessions since last long break
let POMO_BREAK_IS_LONG = false; // current break type
let POMO_CAMEO_ATTEMPTED = false; // attempt cameo once per focus block

function setupPomodoro() {
  const startBtn = document.getElementById('pomoStart');
  const resetBtn = document.getElementById('pomoReset');
  const focusInput = document.getElementById('pomoFocusMin');
  const breakInput = document.getElementById('pomoBreakMin');
  const presetSel = document.getElementById('pomoPreset');
  const longEnable = document.getElementById('pomoLongEnable');
  const longMin = document.getElementById('pomoLongMin');
  const longEvery = document.getElementById('pomoLongEvery');

  // Load persisted minutes & long-break prefs
  try {
    const f = parseInt(localStorage.getItem('aduc_pomo_focus_min') || '25', 10);
    const b = parseInt(localStorage.getItem('aduc_pomo_break_min') || '5', 10);
    const le = localStorage.getItem('aduc_pomo_long_enable');
    const lm = parseInt(localStorage.getItem('aduc_pomo_long_min') || '15', 10);
    const ev = parseInt(localStorage.getItem('aduc_pomo_long_every') || '4', 10);
    if (Number.isFinite(f) && f >= 1) { POMO_FOCUS_SEC = f * 60; if (focusInput) focusInput.value = String(f); }
    if (Number.isFinite(b) && b >= 1) { POMO_BREAK_SEC = b * 60; if (breakInput) breakInput.value = String(b); }
    if (typeof le === 'string') { POMO_LONG_ENABLED = le === '1'; }
    if (Number.isFinite(lm) && lm >= 1) { POMO_LONG_BREAK_SEC = lm * 60; if (longMin) longMin.value = String(lm); }
    if (Number.isFinite(ev) && ev >= 2) { POMO_LONG_EVERY = ev; if (longEvery) longEvery.value = String(ev); }
    if (longEnable) longEnable.checked = !!POMO_LONG_ENABLED;
  } catch { }

  const presets = { '25-5': [25, 5], '50-10': [50, 10], '45-15': [45, 15], '60-10': [60, 10] };

  const applyCustomEnabled = () => {
    const custom = presetSel && presetSel.value === 'custom';
    if (focusInput) focusInput.disabled = !custom;
    if (breakInput) breakInput.disabled = !custom;
  };

  const updateDurationsFromInputs = (applyRemaining = false) => {
    const fm = Math.max(1, parseInt((focusInput && focusInput.value) || '25', 10));
    const bm = Math.max(1, parseInt((breakInput && breakInput.value) || '5', 10));
    POMO_FOCUS_SEC = fm * 60;
    POMO_BREAK_SEC = bm * 60;
    try { localStorage.setItem('aduc_pomo_focus_min', String(fm)); } catch { }
    try { localStorage.setItem('aduc_pomo_break_min', String(bm)); } catch { }
    if (applyRemaining && !POMO_INTERVAL) {
      POMO_REMAIN = (POMO_MODE === 'focus') ? POMO_FOCUS_SEC : (POMO_BREAK_IS_LONG ? POMO_LONG_BREAK_SEC : POMO_BREAK_SEC);
      updatePomoUI();
    }
  };

  const syncPresetSelection = () => {
    if (!presetSel || !focusInput || !breakInput) return;
    const fv = parseInt(focusInput.value || '25', 10);
    const bv = parseInt(breakInput.value || '5', 10);
    let matched = 'custom';
    for (const [k, [pf, pb]] of Object.entries(presets)) {
      if (pf === fv && pb === bv) { matched = k; break; }
    }
    presetSel.value = matched;
    applyCustomEnabled();
  };

  if (presetSel) {
    presetSel.addEventListener('change', () => {
      const val = presetSel.value;
      if (val === 'custom') { applyCustomEnabled(); return; }
      const [pf, pb] = (val in presets) ? presets[val] : [25, 5];
      if (focusInput) focusInput.value = String(pf);
      if (breakInput) breakInput.value = String(pb);
      applyCustomEnabled();
      updateDurationsFromInputs(true);
    });
  }
  if (focusInput) focusInput.addEventListener('change', () => { if (presetSel) presetSel.value = 'custom'; applyCustomEnabled(); updateDurationsFromInputs(true); });
  if (breakInput) breakInput.addEventListener('change', () => { if (presetSel) presetSel.value = 'custom'; applyCustomEnabled(); updateDurationsFromInputs(true); });

  // Initialize preset selection and durations
  syncPresetSelection();
  updateDurationsFromInputs(true);

  startBtn.addEventListener('click', () => {
    if (POMO_INTERVAL) {
      pausePomodoro();
    } else {
      startPomodoro();
    }
  });
  resetBtn.addEventListener('click', resetPomodoro);
  // Wire long-break controls
  if (longEnable) longEnable.addEventListener('change', () => {
    POMO_LONG_ENABLED = !!longEnable.checked;
    try { localStorage.setItem('aduc_pomo_long_enable', POMO_LONG_ENABLED ? '1' : '0'); } catch { }
  });
  if (longMin) longMin.addEventListener('change', () => {
    const v = Math.max(1, parseInt(longMin.value || '15', 10));
    POMO_LONG_BREAK_SEC = v * 60;
    try { localStorage.setItem('aduc_pomo_long_min', String(v)); } catch { }
    if (!POMO_INTERVAL && POMO_MODE === 'break' && POMO_BREAK_IS_LONG) { POMO_REMAIN = POMO_LONG_BREAK_SEC; updatePomoUI(); }
  });
  if (longEvery) longEvery.addEventListener('change', () => {
    const v = Math.max(2, parseInt(longEvery.value || '4', 10));
    POMO_LONG_EVERY = v;
    try { localStorage.setItem('aduc_pomo_long_every', String(v)); } catch { }
  });
  updatePomoUI();
}

function startPomodoro() {
  if (!POMO_REMAIN) POMO_REMAIN = (POMO_MODE === 'focus' ? POMO_FOCUS_SEC : POMO_BREAK_SEC);
  if (POMO_INTERVAL) return;
  POMO_INTERVAL = setInterval(tickPomodoro, 1000);
  document.getElementById('pomoStart').textContent = 'Pause';
}

function pausePomodoro() {
  if (POMO_INTERVAL) {
    clearInterval(POMO_INTERVAL);
    POMO_INTERVAL = null;
  }
  document.getElementById('pomoStart').textContent = 'Start';
}

function resetPomodoro() {
  pausePomodoro();
  POMO_MODE = 'focus';
  POMO_REMAIN = POMO_FOCUS_SEC;
  POMO_FOCUS_COUNT = 0;
  POMO_BREAK_IS_LONG = false;
  POMO_CAMEO_ATTEMPTED = false;
  updatePomoUI();
}

function tickPomodoro() {
  if (POMO_REMAIN > 0) {
    POMO_REMAIN -= 1;
    updatePomoUI();
    // NSFW cameos are breaks-only; focus tick does not attempt cameos
    if (POMO_REMAIN <= 0) {
      // Cycle finished
      pausePomodoro();
      if (POMO_MODE === 'focus') {
        // Increment completed focus sessions and decide break type
        POMO_FOCUS_COUNT += 1;
        const willLong = POMO_LONG_ENABLED && (POMO_FOCUS_COUNT % POMO_LONG_EVERY === 0);
        onFocusComplete();
        // Auto start break (long or short)
        POMO_MODE = 'break';
        POMO_BREAK_IS_LONG = !!willLong;
        POMO_REMAIN = willLong ? POMO_LONG_BREAK_SEC : POMO_BREAK_SEC;
        updatePomoUI();
        startPomodoro();
        try { scheduleBreakMoments(); } catch { }
      } else {
        onBreakComplete();
        POMO_MODE = 'focus';
        POMO_BREAK_IS_LONG = false;
        POMO_REMAIN = POMO_FOCUS_SEC;
        updatePomoUI();
        POMO_CAMEO_ATTEMPTED = false;
      }
    }
  }
}

function updatePomoUI() {
  const modeEl = document.getElementById('pomoMode');
  if (modeEl) modeEl.textContent = (POMO_MODE === 'focus' ? 'Focus' : (POMO_BREAK_IS_LONG ? 'Long Break' : 'Break'));
  const m = Math.floor(POMO_REMAIN / 60).toString().padStart(2, '0');
  const s = Math.floor(POMO_REMAIN % 60).toString().padStart(2, '0');
  document.getElementById('pomoTime').textContent = `${m}:${s}`;
  // Progress bar: fills up as time elapses
  const prog = document.getElementById('pomoProgress');
  if (prog) {
    const total = (POMO_MODE === 'focus') ? POMO_FOCUS_SEC : (POMO_BREAK_IS_LONG ? POMO_LONG_BREAK_SEC : POMO_BREAK_SEC);
    const done = Math.max(0, Math.min(total, total - POMO_REMAIN));
    const pct = total > 0 ? (done / total) * 100 : 0;
    prog.style.width = `${pct.toFixed(1)}%`;
    prog.classList.remove('focus', 'break', 'long');
    if (POMO_MODE === 'focus') prog.classList.add('focus');
    else if (POMO_BREAK_IS_LONG) prog.classList.add('long');
    else prog.classList.add('break');
  }
}

async function onFocusComplete() {
  const nextIsLong = POMO_LONG_ENABLED && ((POMO_FOCUS_COUNT % POMO_LONG_EVERY) === 0);
  const mins = Math.max(1, Math.round((nextIsLong ? POMO_LONG_BREAK_SEC : POMO_BREAK_SEC) / 60));
  const kind = nextIsLong ? 'long break' : 'short break';
  appendBubble(`Focus complete. Take a ${kind} (${mins}m).`, 'bot');
  try {
    const fam = document.getElementById('familiar').value;
    const beforeState = await getJSON(`/familiars/${encodeURIComponent(fam)}/state`);
    const before = (beforeState && typeof beforeState.hearts === 'number') ? beforeState.hearts : 0;
    const request = Math.min(5, Math.max(0, Math.round((before + 0.5) * 4) / 4)); // request +0.5; server enforces diminishing returns
    await getJSON(`/familiars/${encodeURIComponent(fam)}/state`, { method: 'POST', body: JSON.stringify({ hearts: request }) });
    const afterState = await getJSON(`/familiars/${encodeURIComponent(fam)}/state`);
    const after = (afterState && typeof afterState.hearts === 'number') ? afterState.hearts : before;
    const delta = Math.max(0, Math.round((after - before) * 100) / 100);
    await renderIdentity(fam);
    if (delta > 0) {
      appendBubble(`Hearts +${delta}`, 'bot');
    } else {
      appendBubble('Hearts unchanged', 'bot');
    }
  } catch { }
}

function onBreakComplete() {
  appendBubble('Break complete. Ready to focus.', 'bot');
  // NSFW poses now persist until next message - do not auto-revert here
}

// ---- Moments wiring ---------------------------------------------------------

function currentFamId() {
  const sel = document.getElementById('familiar');
  return sel ? sel.value : null;
}

async function scheduleBreakMoments() {
  const fam = currentFamId();
  if (!fam) return;
  try {
    const res = await getJSON('/moments/start_break', { method: 'POST', body: JSON.stringify({ familiar: fam }) });
    const arr = Array.isArray(res.moments) ? res.moments : [];
    if (arr.length === 0) return;
    // Request a shy, in-character reaction line (AI-generated) for this batch
    try {
      const react = await getJSON('/moments/react', { method: 'POST', body: JSON.stringify({ familiar: fam, break: (POMO_BREAK_IS_LONG ? 'long' : 'short'), batch: 'early' }) });
      if (react && react.turn_id) {
        const token = ++POLL_TOKEN;
        const famAtSend = fam;
        const pollReaction = async () => {
          try {
            const s = await getJSON(`/cli/status?familiar=${encodeURIComponent(fam)}&turn_id=${encodeURIComponent(react.turn_id)}`);
            if (s.status === 'responded' && token === POLL_TOKEN && famAtSend === document.getElementById('familiar').value) {
              appendBubble(s.reply, 'bot');
              return;
            }
          } catch { }
          setTimeout(pollReaction, 1000);
        };
        setTimeout(pollReaction, 500);
      }
    } catch { }
    // Show NSFW poses - they persist until next message
    if (arr.length > 0) {
      // Pick the last pose to display (it persists)
      const finalPose = arr[arr.length - 1].pose;
      // Use setAvatar for consistent layout handling (with preview flag to bypass NSFW blocks)
      setAvatar(fam, finalPose, { preview: true });
      // Log all poses as used
      for (const m of arr) {
        try { await getJSON('/moments/commit', { method: 'POST', body: JSON.stringify({ familiar: fam, pose: m.pose, kind: 'break' }) }); } catch { }
      }
    }
  } catch { }
}

// ---- Manual break triggers (for testing) -----------------------------------
let PENDING_BREAK_TRIGGER = null; // { isLong: boolean }

function triggerBreakAfterNextMessage(isLong) {
  PENDING_BREAK_TRIGGER = { isLong: !!isLong };
  const status = document.getElementById('settingsStatus');
  if (status) {
    status.textContent = isLong ? 'Long break will trigger after next message' : 'Break will trigger after next message';
    setTimeout(() => { try { status.textContent = ''; } catch { } }, 2000);
  }
}

function maybeTriggerPendingBreak() {
  if (PENDING_BREAK_TRIGGER) {
    const isLong = !!PENDING_BREAK_TRIGGER.isLong;
    PENDING_BREAK_TRIGGER = null;
    triggerBreakNow(isLong);
  }
}
function triggerBreakNow(isLong) {
  try {
    pausePomodoro();
  } catch { }
  POMO_MODE = 'break';
  POMO_BREAK_IS_LONG = !!isLong;
  POMO_REMAIN = isLong ? POMO_LONG_BREAK_SEC : POMO_BREAK_SEC;
  updatePomoUI();
  // Show sequential NSFW moments immediately (if allowed)
  scheduleBreakMoments().catch(() => { });
  // Start the countdown for the break
  try { startPomodoro(); } catch { }
}

async function tryCameoCheck() {
  if (POMO_MODE !== 'focus' || POMO_CAMEO_ATTEMPTED) return;
  const fam = currentFamId();
  if (!fam) return;
  const elapsed = Math.max(0, POMO_FOCUS_SEC - POMO_REMAIN);
  const total = POMO_FOCUS_SEC;
  if (elapsed < Math.floor(total * 0.8)) return; // one attempt when crossing 80%
  POMO_CAMEO_ATTEMPTED = true;
  try {
    const res = await getJSON('/moments/check', { method: 'POST', body: JSON.stringify({ familiar: fam, kind: 'focus', elapsed_s: elapsed, total_s: total }) });
    if (res && res.allow && res.pose) {
      await flashPose(fam, res.pose, res.duration_ms || 2000);
      try { await getJSON('/moments/commit', { method: 'POST', body: JSON.stringify({ familiar: fam, pose: res.pose, kind: 'focus' }) }); } catch { }
    }
  } catch { }
}

async function flashPose(famId, poseId, durationMs) {
  const img = document.getElementById('avatarImg');
  if (!img) return;
  const prevSrc = img.src;
  const prevTransform = img.style.transform;
  const prevOrigin = img.style.transformOrigin;
  // Set avatar with layout
  setAvatar(famId, poseId);
  await new Promise(r => setTimeout(r, Math.max(500, durationMs || 2000)));
  // Restore previous state
  img.src = prevSrc;
  img.style.transform = prevTransform;
  img.style.transformOrigin = prevOrigin;
}

// --------------------------------------------------------------------------
// UI Rendering
// --------------------------------------------------------------------------

function renderIdentity(famId) {
  const f = FAMILIARS.get(famId);
  const infoPanel = document.getElementById('familiarInfo');
  if (!f) {
    if (infoPanel) infoPanel.classList.add('hidden');
    return;
  }
  if (infoPanel) infoPanel.classList.remove('hidden');

  // Load Meta
  getJSON(`/familiars/${encodeURIComponent(famId)}/meta`).then(meta => {
    // Name
    const nameEl = document.getElementById('infoName');
    if (nameEl) nameEl.textContent = meta.full_name || meta.name || famId;

    // About
    const aboutEl = document.getElementById('infoAbout');
    if (aboutEl) aboutEl.textContent = meta.description_short || "No description avail.";

    // Stats Line
    const stats = [];
    if (meta.age) stats.push(`Age: ${meta.age}`);
    if (meta.nationality) stats.push(`Nat: ${meta.nationality}`);
    if (meta.aesthetic) stats.push(`Aesthetic: ${meta.aesthetic}`);
    const statsEl = document.getElementById('infoStatsLine');
    if (statsEl) statsEl.textContent = stats.join(' | ');

    // Lists
    const likesList = document.getElementById('infoLikes');
    if (likesList) {
      likesList.innerHTML = '';
      (meta.likes || []).slice(0, 5).forEach(l => {
        const li = el('li', '', l);
        likesList.appendChild(li);
      });
    }

    const dislikesList = document.getElementById('infoDislikes');
    if (dislikesList) {
      dislikesList.innerHTML = '';
      (meta.dislikes || []).slice(0, 5).forEach(d => {
        const li = el('li', '', d);
        dislikesList.appendChild(li);
      });
    }
  }).catch(() => {
    const nameEl = document.getElementById('infoName');
    if (nameEl) nameEl.textContent = famId;
  });

  // State (Hearts)
  getJSON(`/familiars/${encodeURIComponent(famId)}/state`).then(st => {
    const h = st.hearts || 0;
    // Render visual hearts
    const heartsEl = document.getElementById('infoHearts');
    if (heartsEl) {
      heartsEl.innerHTML = '';
      const max = 5;
      const full = Math.floor(h);
      for (let i = 0; i < max; i++) {
        const s = document.createElement('span');
        s.textContent = (i < full) ? '♥' : '♡';
        s.style.color = (i < full) ? '#ff6b6b' : '#555';
        heartsEl.appendChild(s);
      }
    }
  }).catch(() => { });
}

// --------------------------------------------------------------------------
// Initialization
// --------------------------------------------------------------------------

window.addEventListener('DOMContentLoaded', () => {
  (async () => {
    try {
      // Toggle Chat Logic
      const toggleBtn = document.getElementById('toggleChat');
      const chatContainer = document.getElementById('chatContainer');
      if (toggleBtn && chatContainer) {
        toggleBtn.onclick = () => {
          const isHidden = chatContainer.classList.toggle('hidden');
          toggleBtn.textContent = isHidden ? '👁‍🗨' : '👁';
        };
      }

      await loadFamiliars();
      await loadSettings();
      setupPomodoro();
      setupAvatarSelector();

      // Heartbeat
      const statusEl = document.getElementById('agentStatus');
      async function pollHB() {
        try {
          const s = await getJSON('/cli/heartbeat');
          if (statusEl) {
            if (s.active) {
              statusEl.textContent = 'Agent: Online';
              statusEl.classList.remove('offline');
              statusEl.classList.add('online');
            } else {
              statusEl.textContent = 'Agent: Offline';
              statusEl.classList.remove('online');
              statusEl.classList.add('offline');
            }
          }
        } catch {
          if (statusEl) {
            statusEl.textContent = 'Agent: Unknown';
            statusEl.classList.remove('online');
            statusEl.classList.add('offline');
          }
        }
        setTimeout(pollHB, 1500);
      }
      pollHB();

      // Chat Controls
      document.getElementById('send').addEventListener('click', sendMessage);
      const cancelBtn = document.getElementById('cancelBtn');
      if (cancelBtn) cancelBtn.addEventListener('click', cancelPending);

      const msgEl = document.getElementById('message');
      if (msgEl) {
        // Auto-resize
        const autoResize = () => {
          msgEl.style.height = 'auto';
          msgEl.style.height = Math.min(msgEl.scrollHeight, window.innerHeight * 0.3) + 'px';
        };
        msgEl.addEventListener('input', autoResize);
        autoResize();

        msgEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
          }
        });
      }

      // Settings UI
      const panel = document.getElementById('settingsPanel');
      if (panel) {
        const btn = document.getElementById('settingsBtn');
        if (btn) {
          btn.addEventListener('click', () => {
            panel.classList.remove('hidden');
            loadSettings();
          });
        }
        const closeBtn = document.getElementById('settingsClose');
        if (closeBtn) closeBtn.addEventListener('click', () => panel.classList.add('hidden'));

        const saveBtn = document.getElementById('settingsSave');
        if (saveBtn) saveBtn.addEventListener('click', saveSettings);

        const clearMemBtn = document.getElementById('clearMemoryBtn');
        if (clearMemBtn) {
          clearMemBtn.addEventListener('click', () => {
            showConfirm(
              `Clear Memory?`,
              `Are you sure you want to clear <strong>${document.getElementById('familiar').value}</strong>'s memory? This cannot be undone.`,
              () => doClearMemory()
            );
          });
        }
      }

      // Dev Helpers
      const trigShort = document.getElementById('triggerBreak');
      const trigLong = document.getElementById('triggerLongBreak');
      if (trigShort) trigShort.addEventListener('click', () => triggerBreakAfterNextMessage(false));
      if (trigLong) trigLong.addEventListener('click', () => triggerBreakAfterNextMessage(true));

    } catch (e) {
      console.error(e);
    }

    // ---- Helpers for Settings ----

    function showConfirm(title, text, onYes) {
      const d = document.getElementById('confirmModal');
      const t = document.getElementById('confirmTitle');
      const p = document.getElementById('confirmText');
      const y = document.getElementById('confirmYes');
      const c = document.getElementById('confirmCancel');

      if (!d) return;

      t.innerText = title;
      p.innerHTML = text;

      d.showModal();

      const handledTags = { yes: false, cancel: false };

      const Cleanup = () => {
        y.removeEventListener('click', HandleYes);
        c.removeEventListener('click', HandleCancel);
      };

      const HandleYes = () => {
        if (handledTags.yes) return;
        handledTags.yes = true;
        d.close();
        onYes();
        Cleanup();
      };

      const HandleCancel = () => {
        if (handledTags.cancel) return;
        handledTags.cancel = true;
        d.close();
        Cleanup();
      };

      y.addEventListener('click', HandleYes, { once: true });
      c.addEventListener('click', HandleCancel, { once: true });
    }

    function doClearMemory() {
      const famId = document.getElementById('familiar').value;
      const body = { familiar: famId };
      getJSON('/cli/memory/clear', { method: 'POST', body: JSON.stringify(body) })
        .then(resp => {
          if (resp.status === 'cleared') {
            alert(`Memory cleared. Removed ${resp.removed_turns} turns.`);
            window.location.reload();
          } else {
            alert('Error: ' + (resp.error || 'Unknown'));
          }
        })
        .catch(err => {
          alert('Failed to clear memory: ' + err);
        });
    }

    function showKissEffect() {
      const el = document.createElement('div');
      el.className = 'kiss-overlay';
      el.innerHTML = '💋';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2000);
    }

    // =============================================
    // DEV TOOL PANEL LOGIC
    // =============================================

    const devToolState = {
      isOpen: false,
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0,
      avatarStartX: 0,
      avatarStartY: 0,
      currentTargetId: '',
      currentAvatarPath: '',  // e.g. "nsfw/bikini/warm.png"
    };

    const devGuestState = {
      isOpen: false,
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0,
      avatarStartX: 0,
      avatarStartY: 0,
      currentAvatarPath: '',
      currentGuestId: '',
    };

    function getDevTargetId() {
      const select = document.getElementById('devTargetFamiliar');
      if (select && select.value) return select.value;
      const fam = document.getElementById('familiar');
      return (fam && fam.value) ? fam.value : (CURRENT_FAM || '');
    }

    function refreshDevTargetSelector() {
      const select = document.getElementById('devTargetFamiliar');
      if (!select) return;

      const hostId = document.getElementById('familiar')?.value || CURRENT_FAM || '';
      const ids = [];
      if (hostId) ids.push(hostId);
      for (const guestId of COMMITTEE_GUESTS) {
        if (guestId && guestId !== hostId && !ids.includes(guestId)) ids.push(guestId);
      }

      select.innerHTML = '';
      ids.forEach(id => {
        if (id !== hostId) {
          ensureAvatarSlot(id);
        }
        const opt = document.createElement('option');
        const name = FAMILIARS.get(id)?.name || id;
        opt.value = id;
        opt.textContent = (id === hostId) ? `${name} (host)` : name;
        select.appendChild(opt);
      });

      if (ids.length === 0) return;

      let changed = false;
      if (!devToolState.currentTargetId || !ids.includes(devToolState.currentTargetId)) {
        devToolState.currentTargetId = hostId || ids[0];
        changed = true;
      }
      select.value = devToolState.currentTargetId;
      if (changed && devToolState.isOpen) {
        populateAvatarSelector();
        syncDevToolFromAvatar();
        updateDevDraggableClass();
      }
    }

    function updateDevDraggableClass() {
      for (const img of AVATAR_IMGS.values()) {
        if (img) img.classList.remove('draggable');
      }
      const targetId = getDevTargetId();
      const avatarImg = targetId ? getAvatarImg(targetId) : null;
      if (avatarImg && devToolState.isOpen) {
        avatarImg.classList.add('draggable');
      }
    }

    async function refreshPresetList() {
      const select = document.getElementById('devPresetSelect');
      if (!select) return;
      select.innerHTML = '<option value="">Loading...</option>';
      try {
        const resp = await getJSON('/presets/layouts');
        const presets = Array.isArray(resp.presets) ? resp.presets : [];
        select.innerHTML = '<option value="">Select preset...</option>';
        presets.forEach(name => {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          select.appendChild(opt);
        });
      } catch (err) {
        console.error('Failed to load presets:', err);
        select.innerHTML = '<option value="">Error loading</option>';
      }
    }

    async function saveLayoutPreset() {
      const nameInput = document.getElementById('devPresetName');
      const name = nameInput ? nameInput.value.trim() : '';
      if (!name) {
        alert('Enter a preset name (letters, numbers, dash, underscore)');
        return;
      }
      const scaleInput = document.getElementById('devScale');
      const posXInput = document.getElementById('devPosX');
      const posYInput = document.getElementById('devPosY');
      const mirrorCheck = document.getElementById('devMirror');
      const layout = {
        scale: (parseFloat(scaleInput.value) || 100) / 100,
        x: `${parseFloat(posXInput.value) || 0}px`,
        y: `${parseFloat(posYInput.value) || 0}px`,
        mirror: mirrorCheck.checked,
      };
      try {
        await getJSON('/presets/layouts', { method: 'POST', body: JSON.stringify({ name, layout }) });
        await refreshPresetList();
      } catch (err) {
        console.error('Failed to save preset:', err);
        alert('Failed to save preset');
      }
    }

    async function loadLayoutPreset() {
      const select = document.getElementById('devPresetSelect');
      if (!select || !select.value) return;
      try {
        const resp = await getJSON(`/presets/layouts/${encodeURIComponent(select.value)}`);
        const layout = resp.layout || {};
        const scaleInput = document.getElementById('devScale');
        const posXInput = document.getElementById('devPosX');
        const posYInput = document.getElementById('devPosY');
        const mirrorCheck = document.getElementById('devMirror');
        const xMatch = String(layout.x || '0px').match(/-?\d+(\.\d+)?/);
        const yMatch = String(layout.y || '0px').match(/-?\d+(\.\d+)?/);
        scaleInput.value = Math.round((parseFloat(layout.scale) || 1) * 100);
        posXInput.value = xMatch ? xMatch[0] : '0';
        posYInput.value = yMatch ? yMatch[0] : '0';
        mirrorCheck.checked = !!layout.mirror;
        applyDevToolTransform();
      } catch (err) {
        console.error('Failed to load preset:', err);
        alert('Failed to load preset');
      }
    }

    function initDevTool() {
      const toggleBtn = document.getElementById('devToolToggle');
      const panel = document.getElementById('devToolPanel');
      const closeBtn = document.getElementById('devToolClose');
      const targetSelect = document.getElementById('devTargetFamiliar');
      const avatarSelect = document.getElementById('devAvatarSelect');
      const locationSelect = document.getElementById('devLocationSelect');
      const scaleInput = document.getElementById('devScale');
      const posXInput = document.getElementById('devPosX');
      const posYInput = document.getElementById('devPosY');
      const mirrorCheck = document.getElementById('devMirror');
      const snapCheck = document.getElementById('devSnapGrid');
      const gridSizeInput = document.getElementById('devGridSize');
      const saveBtn = document.getElementById('devSaveLayout');
      const offsetEnable = document.getElementById('devGuestOffsetEnabled');
      const offsetSpacing = document.getElementById('devGuestOffsetSpacing');
      const offsetValue = document.getElementById('devGuestOffsetValue');
      const presetSaveBtn = document.getElementById('devPresetSave');
      const presetLoadBtn = document.getElementById('devPresetLoad');

      if (!toggleBtn || !panel) return;

      loadGuestOffsetPrefs();

      const syncOffsetControls = () => {
        if (offsetEnable) offsetEnable.checked = COMMITTEE_OFFSET_ENABLED;
        if (offsetSpacing) {
          offsetSpacing.value = String(Math.round(COMMITTEE_OFFSET_FACTOR * 100));
        }
        if (offsetValue) {
          const pct = Math.round(COMMITTEE_OFFSET_FACTOR * 100);
          offsetValue.textContent = `${pct}%`;
        }
      };

      syncOffsetControls();

      // Toggle panel visibility
      toggleBtn.addEventListener('click', () => {
        devToolState.isOpen = !devToolState.isOpen;
        panel.classList.toggle('hidden', !devToolState.isOpen);
        toggleBtn.classList.toggle('active', devToolState.isOpen);

        if (devToolState.isOpen) {
          refreshDevTargetSelector();
          populateAvatarSelector();
          populateLocationSelector();
          syncDevToolFromAvatar();
          updateDevDraggableClass();
          refreshPresetList();
        }
      });

      closeBtn.addEventListener('click', () => {
        devToolState.isOpen = false;
        panel.classList.add('hidden');
        toggleBtn.classList.remove('active');
        updateDevDraggableClass();
      });

      if (targetSelect) {
        targetSelect.addEventListener('change', () => {
          devToolState.currentTargetId = targetSelect.value;
          devToolState.currentAvatarPath = '';
          populateAvatarSelector();
          syncDevToolFromAvatar();
          applyDevToolTransform();
          updateDevDraggableClass();
        });
      }

      if (offsetEnable) {
        offsetEnable.addEventListener('change', () => {
          COMMITTEE_OFFSET_ENABLED = offsetEnable.checked;
          saveGuestOffsetPrefs();
          refreshCommitteeLayouts();
        });
      }

      if (offsetSpacing) {
        offsetSpacing.addEventListener('input', () => {
          const pct = parseInt(offsetSpacing.value, 10);
          const factor = Number.isNaN(pct) ? 1 : Math.max(0.1, pct / 100);
          COMMITTEE_OFFSET_FACTOR = factor;
          if (offsetValue) offsetValue.textContent = `${Math.round(factor * 100)}%`;
          saveGuestOffsetPrefs();
          refreshCommitteeLayouts();
        });
      }

      document.querySelectorAll('input[name="devLayoutMode"]').forEach((input) => {
        input.addEventListener('change', () => {
          populateAvatarSelector();
          syncDevToolFromAvatar();
        });
      });

      if (presetSaveBtn) presetSaveBtn.addEventListener('click', saveLayoutPreset);
      if (presetLoadBtn) presetLoadBtn.addEventListener('click', loadLayoutPreset);

      // Location selector change
      if (locationSelect) {
        locationSelect.addEventListener('change', () => {
          const famId = document.getElementById('familiar').value;
          const loc = locationSelect.value;
          if (loc && famId) {
            setBackground(famId, loc);
          }
        });
      }

      // Avatar selector change
      avatarSelect.addEventListener('change', async () => {
        const famId = getDevTargetId();
        const path = avatarSelect.value;
        if (path && famId) {
          devToolState.currentAvatarPath = path;
          setAvatar(famId, path, { offset: getCommitteeOffset(famId) });

          // Fetch resolved layout from server and populate dev tool fields
          try {
            // Get current background for location-specific layout
            let bg = '';
            const bgEl = document.getElementById('avatarBg');
            if (bgEl && bgEl.style.backgroundImage) {
              const m = bgEl.style.backgroundImage.match(/background\/([^"')]+)/);
              if (m) bg = encodeURIComponent(decodeURIComponent(m[1]));
            }

            const mode = getDevLayoutMode();
            const url = buildLayoutUrl(famId, path, bg, mode);
            const layout = await getJSON(url);

            // Populate dev tool fields from resolved layout
            const scaleInput = document.getElementById('devScale');
            const posXInput = document.getElementById('devPosX');
            const posYInput = document.getElementById('devPosY');
            const mirrorCheck = document.getElementById('devMirror');

            scaleInput.value = Math.round((layout.scale || 1) * 100);
            const xMatch = String(layout.x || '0px').match(/-?\d+(\.\d+)?/);
            const yMatch = String(layout.y || '0px').match(/-?\d+(\.\d+)?/);
            posXInput.value = xMatch ? xMatch[0] : '0';
            posYInput.value = yMatch ? yMatch[0] : '0';
            mirrorCheck.checked = layout.mirror || false;

            // Apply the layout to the avatar image
            applyDevToolTransform();
          } catch (err) {
            console.error('Failed to fetch layout:', err);
            // Fall back to sync from avatar transform
            setTimeout(syncDevToolFromAvatar, 150);
          }
        }
      });

      // Scale input change
      scaleInput.addEventListener('input', () => {
        applyDevToolTransform();
      });

      // Position input changes
      posXInput.addEventListener('input', applyDevToolTransform);
      posYInput.addEventListener('input', applyDevToolTransform);

      // Mirror checkbox
      mirrorCheck.addEventListener('change', applyDevToolTransform);

      // Drag-and-drop handling
      document.addEventListener('mousedown', (e) => {
        if (!devToolState.isOpen) return;
        const targetId = getDevTargetId();
        const avatarImg = targetId ? getAvatarImg(targetId) : null;
        if (!avatarImg || e.target !== avatarImg) return;
        e.preventDefault();
        devToolState.isDragging = true;
        devToolState.dragStartX = e.clientX;
        devToolState.dragStartY = e.clientY;

        // Parse current position from inputs
        devToolState.avatarStartX = parseFloat(posXInput.value) || 0;
        devToolState.avatarStartY = parseFloat(posYInput.value) || 0;
      });

      document.addEventListener('mousemove', (e) => {
        if (!devToolState.isDragging) return;

        let deltaX = e.clientX - devToolState.dragStartX;
        let deltaY = e.clientY - devToolState.dragStartY;

        // Apply snap-to-grid if enabled
        if (snapCheck.checked) {
          const gridSize = parseInt(gridSizeInput.value) || 20;
          deltaX = Math.round(deltaX / gridSize) * gridSize;
          deltaY = Math.round(deltaY / gridSize) * gridSize;
        }

        const newX = devToolState.avatarStartX + deltaX;
        const newY = devToolState.avatarStartY + deltaY;

        posXInput.value = String(Math.round(newX));
        posYInput.value = String(Math.round(newY));

        applyDevToolTransform();
      });

      document.addEventListener('mouseup', () => {
        devToolState.isDragging = false;
      });

      // Save button
      saveBtn.addEventListener('click', saveDevToolLayout);

      // Center button - reset position to 0,0
      const centerBtn = document.getElementById('devCenterAvatar');
      if (centerBtn) {
        centerBtn.addEventListener('click', () => {
          const posXInput = document.getElementById('devPosX');
          const posYInput = document.getElementById('devPosY');
          posXInput.value = '0';
          posYInput.value = '0';
          applyDevToolTransform();
        });
      }

      // Reset defaults button - reset to default values
      const resetBtn = document.getElementById('devResetDefaults');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          const scaleInput = document.getElementById('devScale');
          const posXInput = document.getElementById('devPosX');
          const posYInput = document.getElementById('devPosY');
          const mirrorCheck = document.getElementById('devMirror');

          scaleInput.value = '100';
          posXInput.value = '0';
          posYInput.value = '0';
          mirrorCheck.checked = false;

          applyDevToolTransform();
        });
      }
    }

    async function populateAvatarSelector() {
      const select = document.getElementById('devAvatarSelect');
      const famId = getDevTargetId();
      if (!select || !famId) return;

      select.innerHTML = '<option value="">Loading...</option>';

      try {
        const resp = await getJSON(`/familiars/${encodeURIComponent(famId)}/avatars`);
        const avatars = resp.avatars || [];

        select.innerHTML = '';

        // Group by outfit folder
        const groups = {};
        avatars.forEach(path => {
          const parts = path.split('/');
          const group = parts.length > 1 ? parts.slice(0, -1).join('/') : 'default';
          if (!groups[group]) groups[group] = [];
          groups[group].push(path);
        });

        for (const [group, paths] of Object.entries(groups)) {
          const optgroup = document.createElement('optgroup');
          optgroup.label = group === 'default' ? 'Default Outfit' : group;
          paths.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p.split('/').pop();
            optgroup.appendChild(opt);
          });
          select.appendChild(optgroup);
        }

        // Select current avatar if known
        if (devToolState.currentAvatarPath) {
          select.value = devToolState.currentAvatarPath;
        }
      } catch (err) {
        console.error('Failed to load avatars:', err);
        select.innerHTML = '<option value="">Error loading</option>';
      }
    }

    async function populateLocationSelector() {
      const select = document.getElementById('devLocationSelect');
      const famId = document.getElementById('familiar').value;
      if (!select || !famId) return;

      select.innerHTML = '<option value="">Loading...</option>';

      try {
        const resp = await getJSON(`/familiars/${encodeURIComponent(famId)}/locations`);
        const locations = resp.locations || [];

        select.innerHTML = '';

        // Group by folder (standard vs christmas)
        const groups = {};
        locations.forEach(path => {
          const parts = path.split('/');
          const group = parts.length > 1 ? parts[0] : 'standard';
          if (!groups[group]) groups[group] = [];
          groups[group].push(path);
        });

        for (const [group, paths] of Object.entries(groups)) {
          const optgroup = document.createElement('optgroup');
          optgroup.label = group.charAt(0).toUpperCase() + group.slice(1);
          paths.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p.split('/').pop();
            optgroup.appendChild(opt);
          });
          select.appendChild(optgroup);
        }

        // Try to select current background
        const bgEl = document.getElementById('avatarBg');
        if (bgEl && bgEl.style.backgroundImage) {
          const m = bgEl.style.backgroundImage.match(/background\/([^"')]+)/);
          if (m) {
            select.value = decodeURIComponent(m[1]);
          }
        }
      } catch (err) {
        console.error('Failed to load locations:', err);
        select.innerHTML = '<option value="">Error loading</option>';
      }
    }

    function syncDevToolFromAvatar() {
      const targetId = getDevTargetId();
      const avatarImg = targetId ? getAvatarImg(targetId) : null;
      const scaleInput = document.getElementById('devScale');
      const posXInput = document.getElementById('devPosX');
      const posYInput = document.getElementById('devPosY');
      const posXVal = document.getElementById('devPosXVal');
      const posYVal = document.getElementById('devPosYVal');
      const mirrorCheck = document.getElementById('devMirror');

      if (!avatarImg) return;

      // Parse current transform
      const transform = avatarImg.style.transform || '';

      // Extract translate values (use the last translate to ignore base centering)
      const translateMatches = Array.from(transform.matchAll(/translate\(([^,]+),\s*([^)]+)\)/g));
      if (translateMatches.length) {
        const last = translateMatches[translateMatches.length - 1];
        const xStr = last[1].trim();
        const yStr = last[2].trim();
        const xMatch = xStr.match(/-?\d+(\.\d+)?(?=px)/);
        const yMatch = yStr.match(/-?\d+(\.\d+)?(?=px)/);
        const xNum = xMatch ? parseFloat(xMatch[0]) : 0;
        const yNum = yMatch ? parseFloat(yMatch[0]) : 0;
        posXInput.value = String(xNum);
        posYInput.value = String(yNum);
        if (posXVal) posXVal.textContent = `${xNum}px`;
        if (posYVal) posYVal.textContent = `${yNum}px`;
      }

      // Extract scale value
      const scaleMatch = transform.match(/scale\(([^)]+)\)/);
      if (scaleMatch) {
        const scaleVal = parseFloat(scaleMatch[1]) || 1;
        scaleInput.value = Math.round(scaleVal * 100);
      }

      // Check for mirror (scaleX(-1))
      mirrorCheck.checked = transform.includes('scaleX(-1)');

      // Try to determine current avatar path from src
      const src = avatarImg.src || '';
      const match = src.match(/\/avatar\/(.+)$/);
      if (match) {
        devToolState.currentAvatarPath = decodeURIComponent(match[1]);
      }
    }

    function applyDevToolTransform() {
      const targetId = getDevTargetId();
      const avatarImg = targetId ? getAvatarImg(targetId) : null;
      const scaleInput = document.getElementById('devScale');
      const posXInput = document.getElementById('devPosX');
      const posYInput = document.getElementById('devPosY');
      const posXVal = document.getElementById('devPosXVal');
      const posYVal = document.getElementById('devPosYVal');
      const mirrorCheck = document.getElementById('devMirror');

      if (!avatarImg) return;

      const scale = (parseFloat(scaleInput.value) || 100) / 100;
      const xNum = parseFloat(posXInput.value) || 0;
      const yNum = parseFloat(posYInput.value) || 0;
      const x = `${xNum}px`;
      const y = `${yNum}px`;
      const mirror = mirrorCheck.checked;
      if (posXVal) posXVal.textContent = `${xNum}px`;
      if (posYVal) posYVal.textContent = `${yNum}px`;

      const offset = getCommitteeOffset(targetId);
      const offX = offset?.x || '0px';
      const offY = offset?.y || '0px';
      const xExpr = (offX === '0px' && offY === '0px') ? x : `calc(${x} + ${offX})`;
      const yExpr = (offX === '0px' && offY === '0px') ? y : `calc(${y} + ${offY})`;
      const base = avatarImg && avatarImg.closest && avatarImg.closest('#avatarGroup') ? 'translate(-50%, 0) ' : '';
      let transform = `${base}translate(${xExpr}, ${yExpr}) scale(${scale})`;
      if (mirror) {
        transform += ' scaleX(-1)';
      }

      avatarImg.style.transform = transform;
    }

    async function saveDevToolLayout() {
      const famId = getDevTargetId();
      const outfitScope = document.querySelector('input[name="devOutfitScope"]:checked')?.value || 'current';
      const locationScope = document.querySelector('input[name="devLocationScope"]:checked')?.value || 'current';
      const scaleInput = document.getElementById('devScale');
      const posXInput = document.getElementById('devPosX');
      const posYInput = document.getElementById('devPosY');
      const mirrorCheck = document.getElementById('devMirror');
      const saveBtn = document.getElementById('devSaveLayout');

      if (!famId || !devToolState.currentAvatarPath) {
        alert('No avatar selected');
        return;
      }

      const layout = {
        scale: (parseFloat(scaleInput.value) || 100) / 100,
        x: `${parseFloat(posXInput.value) || 0}px`,
        y: `${parseFloat(posYInput.value) || 0}px`,
        mirror: mirrorCheck.checked,
      };

      // Get current background for location-specific saves
      let currentBg = '';
      const bgEl = document.getElementById('avatarBg');
      if (bgEl && bgEl.style.backgroundImage) {
        const m = bgEl.style.backgroundImage.match(/background\/([^"')]+)/);
        if (m) currentBg = decodeURIComponent(m[1]);
      }

      const payload = {
        avatar_path: devToolState.currentAvatarPath,
        layout: layout,
        outfit_scope: outfitScope,  // 'current' or 'all'
        location_scope: locationScope,  // 'current' or 'all'
        background: currentBg,
        layout_mode: getDevLayoutMode(),
      };

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const resp = await getJSON(`/familiars/${encodeURIComponent(famId)}/avatar-layout`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (resp.status === 'saved') {
          saveBtn.textContent = '✓ Saved!';
          setTimeout(() => {
            saveBtn.textContent = '💾 Save Layout';
            saveBtn.disabled = false;
          }, 1500);
        } else {
          throw new Error(resp.error || 'Unknown error');
        }
      } catch (err) {
        console.error('Failed to save layout:', err);
        saveBtn.textContent = '❌ Error';
        setTimeout(() => {
          saveBtn.textContent = '💾 Save Layout';
          saveBtn.disabled = false;
        }, 2000);
      }
    }

    function updateGuestDevVisibility() {
      const toggleBtn = document.getElementById('devGuestToggle');
      const panel = document.getElementById('devGuestPanel');
      const hasGuests = COMMITTEE_GUESTS.length > 0;
      if (toggleBtn) toggleBtn.classList.toggle('hidden', !hasGuests);
      if (!hasGuests && panel) {
        panel.classList.add('hidden');
        devGuestState.isOpen = false;
        if (toggleBtn) toggleBtn.classList.remove('active');
      }
      if (hasGuests) {
        refreshGuestFamiliarSelector();
      }
    }

    function refreshGuestFamiliarSelector() {
      const select = document.getElementById('devGuestFamiliar');
      if (!select) return;
      select.innerHTML = '<option value="">Select guest...</option>';
      COMMITTEE_GUESTS.forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = (FAMILIARS.get(id)?.name || id);
        select.appendChild(opt);
      });
      if (devGuestState.currentGuestId && COMMITTEE_GUESTS.includes(devGuestState.currentGuestId)) {
        select.value = devGuestState.currentGuestId;
      } else {
        devGuestState.currentGuestId = '';
      }
    }

    function applyGuestDevToolTransform() {
      const famId = devGuestState.currentGuestId;
      const avatarImg = famId ? getAvatarImg(famId) : null;
      const scaleInput = document.getElementById('devGuestScale');
      const posXInput = document.getElementById('devGuestPosX');
      const posYInput = document.getElementById('devGuestPosY');
      const mirrorCheck = document.getElementById('devGuestMirror');
      if (!avatarImg || !scaleInput || !posXInput || !posYInput || !mirrorCheck) return;

      const scale = (parseFloat(scaleInput.value) || 100) / 100;
      const x = posXInput.value || '0px';
      const y = posYInput.value || '0px';
      const mirror = mirrorCheck.checked;

      let transform = `translate(${x}, ${y}) scale(${scale})`;
      if (mirror) transform += ' scaleX(-1)';
      avatarImg.style.transform = transform;
    }

    function syncGuestDevToolFromAvatar() {
      const famId = devGuestState.currentGuestId;
      const avatarImg = famId ? getAvatarImg(famId) : null;
      const scaleInput = document.getElementById('devGuestScale');
      const posXInput = document.getElementById('devGuestPosX');
      const posYInput = document.getElementById('devGuestPosY');
      const mirrorCheck = document.getElementById('devGuestMirror');
      if (!avatarImg || !scaleInput || !posXInput || !posYInput || !mirrorCheck) return;

      const transform = avatarImg.style.transform || '';
      const translateMatches = Array.from(transform.matchAll(/translate\(([^,]+),\s*([^)]+)\)/g));
      if (translateMatches.length) {
        const last = translateMatches[translateMatches.length - 1];
        posXInput.value = last[1].trim();
        posYInput.value = last[2].trim();
      }

      const scaleMatch = transform.match(/scale\(([^)]+)\)/);
      if (scaleMatch) {
        const scaleVal = parseFloat(scaleMatch[1]) || 1;
        scaleInput.value = Math.round(scaleVal * 100);
      }

      mirrorCheck.checked = transform.includes('scaleX(-1)');

      const src = avatarImg.src || '';
      const match = src.match(/\/avatar\/(.+)$/);
      if (match) {
        devGuestState.currentAvatarPath = decodeURIComponent(match[1]);
      }
    }

    async function populateGuestAvatarSelector() {
      const select = document.getElementById('devGuestAvatarSelect');
      const famId = devGuestState.currentGuestId;
      if (!select || !famId) return;
      select.innerHTML = '<option value="">Loading...</option>';
      try {
        const resp = await getJSON(`/familiars/${encodeURIComponent(famId)}/avatars`);
        const avatars = resp.avatars || [];
        select.innerHTML = '';
        const groups = {};
        avatars.forEach(path => {
          const parts = path.split('/');
          const group = parts.length > 1 ? parts.slice(0, -1).join('/') : 'default';
          if (!groups[group]) groups[group] = [];
          groups[group].push(path);
        });
        for (const [group, paths] of Object.entries(groups)) {
          const optgroup = document.createElement('optgroup');
          optgroup.label = group === 'default' ? 'Default Outfit' : group;
          paths.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p.split('/').pop();
            optgroup.appendChild(opt);
          });
          select.appendChild(optgroup);
        }
        if (devGuestState.currentAvatarPath) {
          select.value = devGuestState.currentAvatarPath;
        }
      } catch (err) {
        console.error('Failed to load guest avatars:', err);
        select.innerHTML = '<option value="">Error loading</option>';
      }
    }

    async function populateGuestLocationSelector() {
      const select = document.getElementById('devGuestLocationSelect');
      const famId = CURRENT_FAM;
      if (!select || !famId) return;
      select.innerHTML = '<option value="">Loading...</option>';
      try {
        const resp = await getJSON(`/familiars/${encodeURIComponent(famId)}/locations`);
        const locations = resp.locations || [];
        select.innerHTML = '';
        const groups = {};
        locations.forEach(path => {
          const parts = path.split('/');
          const group = parts.length > 1 ? parts[0] : 'standard';
          if (!groups[group]) groups[group] = [];
          groups[group].push(path);
        });
        for (const [group, paths] of Object.entries(groups)) {
          const optgroup = document.createElement('optgroup');
          optgroup.label = group.charAt(0).toUpperCase() + group.slice(1);
          paths.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p.split('/').pop();
            optgroup.appendChild(opt);
          });
          select.appendChild(optgroup);
        }
        const bgEl = document.getElementById('avatarBg');
        if (bgEl && bgEl.style.backgroundImage) {
          const m = bgEl.style.backgroundImage.match(/background\/([^"')]+)/);
          if (m) select.value = decodeURIComponent(m[1]);
        }
      } catch (err) {
        console.error('Failed to load guest locations:', err);
        select.innerHTML = '<option value="">Error loading</option>';
      }
    }

    async function saveGuestDevToolLayout() {
      const famId = devGuestState.currentGuestId;
      const outfitScope = document.querySelector('input[name="devGuestOutfitScope"]:checked')?.value || 'current';
      const locationScope = document.querySelector('input[name="devGuestLocationScope"]:checked')?.value || 'current';
      const scaleInput = document.getElementById('devGuestScale');
      const posXInput = document.getElementById('devGuestPosX');
      const posYInput = document.getElementById('devGuestPosY');
      const mirrorCheck = document.getElementById('devGuestMirror');
      const saveBtn = document.getElementById('devGuestSaveLayout');

      if (!famId || !devGuestState.currentAvatarPath) {
        alert('No guest avatar selected');
        return;
      }

      const layout = {
        scale: (parseFloat(scaleInput.value) || 100) / 100,
        x: posXInput.value || '0px',
        y: posYInput.value || '0px',
        mirror: mirrorCheck.checked,
      };

      let currentBg = '';
      const bgEl = document.getElementById('avatarBg');
      if (bgEl && bgEl.style.backgroundImage) {
        const m = bgEl.style.backgroundImage.match(/background\/([^"')]+)/);
        if (m) currentBg = decodeURIComponent(m[1]);
      }

      const payload = {
        avatar_path: devGuestState.currentAvatarPath,
        layout: layout,
        outfit_scope: outfitScope,
        location_scope: locationScope,
        background: currentBg,
      };

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const resp = await getJSON(`/familiars/${encodeURIComponent(famId)}/avatar-layout`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (resp.status === 'saved') {
          saveBtn.textContent = '💾 Saved!';
          setTimeout(() => {
            saveBtn.textContent = '💾 Save Guest Layout';
            saveBtn.disabled = false;
          }, 1500);
        } else {
          throw new Error(resp.error || 'Unknown error');
        }
      } catch (err) {
        console.error('Failed to save guest layout:', err);
        saveBtn.textContent = '❌ Error';
        setTimeout(() => {
          saveBtn.textContent = '💾 Save Guest Layout';
          saveBtn.disabled = false;
        }, 2000);
      }
    }

    function initGuestDevTool() {
      const toggleBtn = document.getElementById('devGuestToggle');
      const panel = document.getElementById('devGuestPanel');
      const closeBtn = document.getElementById('devGuestClose');
      const guestSelect = document.getElementById('devGuestFamiliar');
      const avatarSelect = document.getElementById('devGuestAvatarSelect');
      const locationSelect = document.getElementById('devGuestLocationSelect');
      const scaleInput = document.getElementById('devGuestScale');
      const posXInput = document.getElementById('devGuestPosX');
      const posYInput = document.getElementById('devGuestPosY');
      const mirrorCheck = document.getElementById('devGuestMirror');
      const snapCheck = document.getElementById('devGuestSnapGrid');
      const gridSizeInput = document.getElementById('devGuestGridSize');
      const saveBtn = document.getElementById('devGuestSaveLayout');

      if (!toggleBtn || !panel) return;

      toggleBtn.addEventListener('click', () => {
        devGuestState.isOpen = !devGuestState.isOpen;
        panel.classList.toggle('hidden', !devGuestState.isOpen);
        toggleBtn.classList.toggle('active', devGuestState.isOpen);
        if (devGuestState.isOpen) {
          refreshGuestFamiliarSelector();
          populateGuestAvatarSelector();
          populateGuestLocationSelector();
          syncGuestDevToolFromAvatar();
        }
      });

      closeBtn.addEventListener('click', () => {
        devGuestState.isOpen = false;
        panel.classList.add('hidden');
        toggleBtn.classList.remove('active');
      });

      if (guestSelect) {
        guestSelect.addEventListener('change', () => {
          devGuestState.currentGuestId = guestSelect.value;
          devGuestState.currentAvatarPath = '';
          populateGuestAvatarSelector();
          populateGuestLocationSelector();
          syncGuestDevToolFromAvatar();
        });
      }

      if (locationSelect) {
        locationSelect.addEventListener('change', () => {
          const loc = locationSelect.value;
          if (loc && CURRENT_FAM) {
            setBackground(CURRENT_FAM, loc);
          }
        });
      }

      if (avatarSelect) {
        avatarSelect.addEventListener('change', async () => {
          const famId = devGuestState.currentGuestId;
          const path = avatarSelect.value;
          if (path && famId) {
            devGuestState.currentAvatarPath = path;
            setAvatar(famId, path, { offset: getCommitteeOffset(famId) });

            try {
              let bg = '';
              const bgEl = document.getElementById('avatarBg');
              if (bgEl && bgEl.style.backgroundImage) {
                const m = bgEl.style.backgroundImage.match(/background\/([^"')]+)/);
                if (m) bg = encodeURIComponent(decodeURIComponent(m[1]));
              }
              const url = `/familiars/${encodeURIComponent(famId)}/avatar-layout/${path}${bg ? '?bg=' + bg : ''}`;
              const layout = await getJSON(url);
              scaleInput.value = Math.round((layout.scale || 1) * 100);
              posXInput.value = layout.x || '0px';
              posYInput.value = layout.y || '0px';
              mirrorCheck.checked = layout.mirror || false;
              applyGuestDevToolTransform();
            } catch (err) {
              console.error('Failed to fetch guest layout:', err);
              setTimeout(syncGuestDevToolFromAvatar, 150);
            }
          }
        });
      }

      scaleInput.addEventListener('input', applyGuestDevToolTransform);
      posXInput.addEventListener('input', applyGuestDevToolTransform);
      posYInput.addEventListener('input', applyGuestDevToolTransform);
      mirrorCheck.addEventListener('change', applyGuestDevToolTransform);

      document.addEventListener('mousedown', (e) => {
        if (!devGuestState.isOpen) return;
        const famId = devGuestState.currentGuestId;
        const avatarImg = famId ? getAvatarImg(famId) : null;
        if (!avatarImg || e.target !== avatarImg) return;
        e.preventDefault();
        devGuestState.isDragging = true;
        devGuestState.dragStartX = e.clientX;
        devGuestState.dragStartY = e.clientY;
        devGuestState.avatarStartX = parseFloat(posXInput.value) || 0;
        devGuestState.avatarStartY = parseFloat(posYInput.value) || 0;
      });

      document.addEventListener('mousemove', (e) => {
        if (!devGuestState.isDragging) return;
        let deltaX = e.clientX - devGuestState.dragStartX;
        let deltaY = e.clientY - devGuestState.dragStartY;
        if (snapCheck.checked) {
          const gridSize = parseInt(gridSizeInput.value) || 20;
          deltaX = Math.round(deltaX / gridSize) * gridSize;
          deltaY = Math.round(deltaY / gridSize) * gridSize;
        }
        const newX = devGuestState.avatarStartX + deltaX;
        const newY = devGuestState.avatarStartY + deltaY;
        posXInput.value = `${newX}px`;
        posYInput.value = `${newY}px`;
        applyGuestDevToolTransform();
      });

      document.addEventListener('mouseup', () => {
        devGuestState.isDragging = false;
      });

      saveBtn.addEventListener('click', saveGuestDevToolLayout);

      const centerBtn = document.getElementById('devGuestCenterAvatar');
      if (centerBtn) {
        centerBtn.addEventListener('click', () => {
          posXInput.value = '0px';
          posYInput.value = '0px';
          applyGuestDevToolTransform();
        });
      }

      const resetBtn = document.getElementById('devGuestResetDefaults');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          scaleInput.value = '100';
          posXInput.value = '0px';
          posYInput.value = '0px';
          mirrorCheck.checked = false;
          applyGuestDevToolTransform();
        });
      }

      updateGuestDevVisibility();
    }

    // Initialize dev tools after DOM is ready
    initDevTool();
    initGuestDevTool();

    // Sidebar toggle functionality
    function initSidebarToggle() {
      const toggleBtn = document.getElementById('sidebarToggle');
      const appContainer = document.querySelector('.app-container');

      if (!toggleBtn || !appContainer) return;

      // Restore saved state
      const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
      if (isCollapsed) {
        appContainer.classList.add('sidebar-collapsed');
      }

      toggleBtn.addEventListener('click', () => {
        appContainer.classList.toggle('sidebar-collapsed');
        const collapsed = appContainer.classList.contains('sidebar-collapsed');
        localStorage.setItem('sidebarCollapsed', collapsed);
      });
    }

    initSidebarToggle();

    // Textarea auto-resize on input
    function initTextareaAutoResize() {
      const textarea = document.getElementById('message');
      if (!textarea) return;

      const resize = () => {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
      };

      textarea.addEventListener('input', resize);
    }

    initTextareaAutoResize();

  })();
});
