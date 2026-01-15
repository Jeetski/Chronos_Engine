let el = null;
let profileData = {};

function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }

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

function render() {
  const nicknameInput = el.querySelector('#nickname');
  if (nicknameInput) nicknameInput.value = profileData.nickname || '';

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

  // Preferences on the right side (dynamic)
  const prefContainer = el.querySelector('#agent-preferences-container');
  if (prefContainer) {
    prefContainer.innerHTML = '';
    const prefs = (profileData && profileData.preferences) || {};
    const frag = document.createDocumentFragment();

    function renderField(label, value, path) {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.gap = '8px';
      const lab = document.createElement('label');
      lab.textContent = label;
      lab.style.minWidth = '140px';
      row.appendChild(lab);
      let input;
      if (typeof value === 'boolean') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!value;
        input.disabled = true; // read-only for now
      } else if (typeof value === 'number') {
        input = document.createElement('input');
        input.type = 'number';
        input.value = String(value);
        input.disabled = true;
      } else if (Array.isArray(value)) {
        input = document.createElement('input');
        input.type = 'text';
        input.value = value.join(', ');
        input.disabled = true;
      } else if (value && typeof value === 'object') {
        // Nested object: render nested fields indented
        const box = document.createElement('div');
        box.style.display = 'flex';
        box.style.flexDirection = 'column';
        box.style.gap = '4px';
        for (const k of Object.keys(value)) {
          const sub = document.createElement('div');
          sub.style.display = 'flex';
          sub.style.gap = '8px';
          const subLab = document.createElement('label');
          subLab.textContent = k;
          subLab.style.minWidth = '120px';
          const subInput = document.createElement('input');
          const v = value[k];
          if (typeof v === 'boolean') { subInput.type = 'checkbox'; subInput.checked = !!v; subInput.disabled = true; }
          else if (typeof v === 'number') { subInput.type = 'number'; subInput.value = String(v); subInput.disabled = true; }
          else if (Array.isArray(v)) { subInput.type = 'text'; subInput.value = v.join(', '); subInput.disabled = true; }
          else { subInput.type = 'text'; subInput.value = (v==null?'':String(v)); subInput.disabled = true; }
          sub.appendChild(subLab);
          sub.appendChild(subInput);
          box.appendChild(sub);
        }
        input = box;
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.value = (value==null?'':String(value));
        input.disabled = true;
      }
      row.appendChild(input);
      frag.appendChild(row);
    }

    for (const key of Object.keys(prefs)) {
      renderField(key, prefs[key], key);
    }
    prefContainer.appendChild(frag);
  }
}

export async function mount(elem, context) {
  el = elem;
  const resp = await fetch('./Widgets/Profile/template.html');
  el.innerHTML = await resp.text();
  // Widen default width to accommodate two panels
  try { if (!el.style.width) el.style.width = '640px'; } catch {}

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
        const resp = await fetch(apiBase() + '/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const ok = resp.ok; // server returns JSON ok:true, but treat HTTP ok as success
        if (!ok) throw new Error('Save failed');
        await loadProfile();
      } catch (e) {
        console.error('Profile save failed:', e);
        alert('Save failed');
      }
    });
  }

  // Edit preferences / pilot brief markdown via Notes widget
  const editPrefsBtn = el.querySelector('#edit-preferences-md');
  const editPilotBriefBtn = el.querySelector('#edit-pilot-brief');
  function showNotesWidget(){
    try {
      const notesEl = document.querySelector('[data-widget="Notes"]');
      if (notesEl){
        notesEl.style.display = '';
        notesEl.classList.remove('minimized');
        try { window.ChronosFocusWidget?.(notesEl); } catch {}
      }
    } catch {}
    try { context?.bus?.emit('widget:show','Notes'); } catch {}
    try { window?.ChronosBus?.emit?.('widget:show','Notes'); } catch {}
  }
  function openFileInNotes(path, title){
    try {
      const payload = { path, format: 'markdown', title };
      if (context?.bus) {
        context.bus.emit('notes:openFile', payload);
      } else if (window?.ChronosBus && typeof window.ChronosBus.emit === 'function') {
        window.ChronosBus.emit('notes:openFile', payload);
      } else {
        alert('Notes widget bus not available');
        return;
      }
      showNotesWidget();
    } catch {}
  }
  if (editPrefsBtn) {
    editPrefsBtn.addEventListener('click', () => openFileInNotes('User/Profile/preferences.md', 'preferences'));
  }
  if (editPilotBriefBtn) {
    editPilotBriefBtn.addEventListener('click', () => openFileInNotes('User/Profile/pilot_brief.md', 'pilot brief'));
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
  if (re) re.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(260, e.clientX - sr.left) + 'px'; })(ev); });
  if (rs) rs.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.height = Math.max(160, e.clientY - sr.top) + 'px'; })(ev); });
  if (rse) rse.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(260, e.clientX - sr.left) + 'px'; el.style.height = Math.max(160, e.clientY - sr.top) + 'px'; })(ev); });

  await loadProfile();
}
