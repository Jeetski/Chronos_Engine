let el = null;
let profileData = {};
let unlockedTitles = [];

function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

async function loadProfile() {
  try {
    const resp = await fetch(apiBase() + '/api/profile');
    const data = await resp.json();
    if (data && data.ok && data.profile) {
      profileData = data.profile;
      render();
    }
  } catch (e) {
    console.error('Profile load failed:', e);
  }
}

async function loadUnlockedTitles() {
  try {
    const resp = await fetch(apiBase() + '/api/achievements');
    const data = await resp.json();
    const achievements = Array.isArray(data?.achievements) ? data.achievements : [];
    const titles = achievements
      .filter(a => String(a?.state || a?.status || '').toLowerCase() === 'awarded' && a?.title)
      .map(a => String(a.title).trim())
      .filter(Boolean);
    unlockedTitles = Array.from(new Set(titles)).sort((a, b) => a.localeCompare(b));
  } catch (e) {
    unlockedTitles = [];
    console.error('Unlocked titles load failed:', e);
  }
}

function renderTitleOptions(selectedTitle) {
  const titleInput = el.querySelector('#profile-title');
  if (!titleInput) return;
  titleInput.innerHTML = '';

  if (!unlockedTitles.length) {
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'No unlocked titles';
    titleInput.appendChild(none);
    titleInput.disabled = true;
    return;
  }

  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Select unlocked title...';
  titleInput.appendChild(blank);

  unlockedTitles.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    titleInput.appendChild(opt);
  });

  const next = unlockedTitles.includes(String(selectedTitle || '')) ? String(selectedTitle || '') : '';
  titleInput.value = next;
  titleInput.disabled = false;
}

function render() {
  const nicknameInput = el.querySelector('#nickname');
  if (nicknameInput) nicknameInput.value = profileData.nickname || '';
  renderTitleOptions(profileData.title || '');

  // Welcome (greeting) lines
  const welcome = (profileData && profileData.welcome) || {};
  const w1 = el.querySelector('#welcome-line1'); if (w1) w1.value = welcome.line1 || '';
  const w2 = el.querySelector('#welcome-line2'); if (w2) w2.value = welcome.line2 || '';
  const w3 = el.querySelector('#welcome-line3'); if (w3) w3.value = welcome.line3 || '';

  // Exit/Goodbye lines (fallback to exit_message/goodbye_message if exit missing)
  const exitMsg = (profileData && (profileData.exit || profileData.exit_message || profileData.goodbye_message)) || {};
  const e1 = el.querySelector('#exit-line1'); if (e1) e1.value = exitMsg.line1 || '';
  const e2 = el.querySelector('#exit-line2'); if (e2) e2.value = exitMsg.line2 || '';

  const avatarPreview = el.querySelector('#avatar-preview');
  if (avatarPreview) {
    avatarPreview.innerHTML = '';
    const img = document.createElement('img');
    img.style.maxWidth = '100px';
    img.style.maxHeight = '100px';
    img.style.borderRadius = '50%';
    const dataUrl = profileData.avatar_data_url;
    if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
      img.src = dataUrl;
      avatarPreview.appendChild(img);
    } else {
      // Fallback to server-served avatar endpoint
      img.src = apiBase() + '/api/profile/avatar';
      img.onerror = () => { avatarPreview.innerHTML = ''; };
      avatarPreview.appendChild(img);
    }
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = dataUrl;
  });
}

async function fileToPngDataUrl(file) {
  const rawDataUrl = await readFileAsDataUrl(file);
  // If already PNG we can skip conversion.
  if (rawDataUrl.startsWith('data:image/png;base64,')) return rawDataUrl;
  const img = await dataUrlToImage(rawDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, img.naturalWidth || img.width || 1);
  canvas.height = Math.max(1, img.naturalHeight || img.height || 1);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to initialize canvas');
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function mount(elem, context) {
  // Load CSS
  if (!document.getElementById('profile-css')) {
    const link = document.createElement('link');
    link.id = 'profile-css';
    link.rel = 'stylesheet';
    link.href = './Widgets/Profile/profile.css';
    document.head.appendChild(link);
  }

  el = elem;
  elem.className = 'widget profile-widget';

  const resp = await fetch('./Widgets/Profile/template.html');
  el.innerHTML = await resp.text();
  // Widen default width to accommodate two panels
  try { if (!el.style.width) el.style.width = '900px'; } catch { }

  // Dragging via header
  const header = el.querySelector('.header');
  if (header) {
    header.addEventListener('pointerdown', (ev) => {
      const startX = ev.clientX;
      const startY = ev.clientY;
      const rect = el.getBoundingClientRect();
      const offX = startX - rect.left;
      const offY = startY - rect.top;
      function onMove(e) {
        el.style.left = Math.max(6, e.clientX - offX) + 'px';
        el.style.top = Math.max(6, e.clientY - offY) + 'px';
        el.style.right = 'auto';
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  // Close button
  const closeBtn = el.querySelector('#profileClose');
  if (closeBtn) closeBtn.addEventListener('click', () => { el.style.display = 'none'; });

  // Save button
  const saveBtn = el.querySelector('#save-profile');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const payload = {
        nickname: (el.querySelector('#nickname')?.value || '').trim(),
        title: (el.querySelector('#profile-title')?.value || '').trim(),
        welcome: {
          line1: el.querySelector('#welcome-line1')?.value || '',
          line2: el.querySelector('#welcome-line2')?.value || '',
          line3: el.querySelector('#welcome-line3')?.value || '',
        },
        exit: {
          line1: el.querySelector('#exit-line1')?.value || '',
          line2: el.querySelector('#exit-line2')?.value || '',
        }
      };
      try {
        const respSave = await fetch(apiBase() + '/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const ok = respSave.ok; // server returns JSON ok:true, but treat HTTP ok as success
        if (!ok) throw new Error('Save failed');
        await loadProfile();
      } catch (e) {
        console.error('Profile save failed:', e);
        alert('Save failed');
      }
    });
  }

  // Avatar change
  const changeAvatarBtn = el.querySelector('#change-avatar');
  const avatarFileInput = el.querySelector('#avatar-file');
  if (changeAvatarBtn && avatarFileInput) {
    changeAvatarBtn.addEventListener('click', () => avatarFileInput.click());
    avatarFileInput.addEventListener('change', async () => {
      const file = avatarFileInput.files && avatarFileInput.files[0];
      if (!file) return;
      try {
        const avatarDataUrl = await fileToPngDataUrl(file);
        const respUpload = await fetch(apiBase() + '/api/profile/avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatar_data_url: avatarDataUrl }),
        });
        if (!respUpload.ok) throw new Error('Avatar upload failed');
        await loadProfile();
      } catch (e) {
        console.error('Avatar update failed:', e);
        alert('Avatar update failed');
      } finally {
        avatarFileInput.value = '';
      }
    });
  }

  // Edit preferences / pilot brief markdown via Notes widget
  const editPrefsBtn = el.querySelector('#edit-preferences-md');
  const editPrefsSettingsBtn = el.querySelector('#edit-preferences-settings');
  const editPilotBriefBtn = el.querySelector('#edit-pilot-brief');
  function showNotesWidget() {
    try {
      const notesEl = document.querySelector('[data-widget="Notes"]');
      if (notesEl) {
        notesEl.style.display = '';
        notesEl.classList.remove('minimized');
        try { window.ChronosFocusWidget?.(notesEl); } catch { }
      }
    } catch { }
    try { context?.bus?.emit('widget:show', 'Notes'); } catch { }
    try { window?.ChronosBus?.emit?.('widget:show', 'Notes'); } catch { }
  }
  function openFileInNotes(path, title, format = 'markdown') {
    try {
      const payload = { path, format, title };
      if (context?.bus) {
        context.bus.emit('notes:openFile', payload);
      } else if (window?.ChronosBus && typeof window.ChronosBus.emit === 'function') {
        window.ChronosBus.emit('notes:openFile', payload);
      } else {
        alert('Notes widget bus not available');
        return;
      }
      showNotesWidget();
    } catch { }
  }
  if (editPrefsBtn) {
    editPrefsBtn.addEventListener('click', () => openFileInNotes('user/profile/preferences.md', 'preferences'));
  }
  if (editPrefsSettingsBtn) {
    editPrefsSettingsBtn.addEventListener('click', () => openFileInNotes('user/profile/preferences_settings.yml', 'preferences settings', 'yaml'));
  }
  if (editPilotBriefBtn) {
    editPilotBriefBtn.addEventListener('click', () => openFileInNotes('user/profile/pilot_brief.md', 'pilot brief'));
  }

  // Resizers
  function edgeDrag(startRect, cb) {
    return (ev) => {
      ev.preventDefault();
      function move(e) { cb(e, startRect); }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
  }
  const re = el.querySelector('.resizer.e');
  const rs = el.querySelector('.resizer.s');
  const rse = el.querySelector('.resizer.se');
  if (re) re.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(560, e.clientX - sr.left) + 'px'; })(ev); });
  if (rs) rs.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.height = Math.max(160, e.clientY - sr.top) + 'px'; })(ev); });
  if (rse) rse.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(560, e.clientX - sr.left) + 'px'; el.style.height = Math.max(160, e.clientY - sr.top) + 'px'; })(ev); });

  await loadUnlockedTitles();
  await loadProfile();
}

