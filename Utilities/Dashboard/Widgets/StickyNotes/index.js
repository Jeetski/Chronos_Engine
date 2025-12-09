const STYLE_ID = 'sticky-notes-widget-style';
const COLORS = [
  { id: 'amber', label: 'Amber', swatch: '#f7d57a' },
  { id: 'citrus', label: 'Citrus', swatch: '#ffd6a5' },
  { id: 'mint', label: 'Mint', swatch: '#c7f9cc' },
  { id: 'aqua', label: 'Aqua', swatch: '#b4e9ff' },
  { id: 'lilac', label: 'Lilac', swatch: '#e3c6ff' },
  { id: 'slate', label: 'Slate', swatch: '#dfe6f3' },
];
const DEFAULT_COLOR = 'amber';
const SAVE_DEBOUNCE_MS = 600;

function injectStyles(){
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .sticky-notes-shell {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .sticky-new-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      background: rgba(12,16,24,0.85);
    }
    .sticky-new-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .sticky-new-meta select {
      max-width: 160px;
    }
    .sticky-status-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .sticky-status {
      font-size: 12px;
      color: #8f9abc;
    }
    .sticky-status.error {
      color: #ff99a8;
    }
    .sticky-notes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px;
    }
    .sticky-note-card {
      border-radius: 14px;
      padding: 12px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.35);
      display: flex;
      flex-direction: column;
      gap: 8px;
      border: 1px solid rgba(0,0,0,0.1);
    }
    .sticky-note-card[data-color="amber"] { background: linear-gradient(180deg, #fef1c4, #f7d57a); }
    .sticky-note-card[data-color="citrus"] { background: linear-gradient(180deg, #ffe6c9, #ffd6a5); }
    .sticky-note-card[data-color="mint"] { background: linear-gradient(180deg, #e6ffef, #c7f9cc); }
    .sticky-note-card[data-color="aqua"] { background: linear-gradient(180deg, #e6f8ff, #b4e9ff); }
    .sticky-note-card[data-color="lilac"] { background: linear-gradient(180deg, #f2e6ff, #e3c6ff); }
    .sticky-note-card[data-color="slate"] { background: linear-gradient(180deg, #eff3fa, #dfe6f3); }
    .sticky-note-card.is-pinned {
      border-color: rgba(255,255,255,0.4);
      box-shadow: 0 12px 26px rgba(0,0,0,0.45);
    }
    .sticky-note-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      color: #1a1f2b;
    }
    .sticky-note-actions {
      display: inline-flex;
      gap: 6px;
    }
    .sticky-note-actions button {
      border: none;
      border-radius: 8px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      background: rgba(0,0,0,0.1);
      color: #1f2430;
    }
    .sticky-note-actions button:hover {
      background: rgba(0,0,0,0.2);
    }
    .sticky-note-card textarea {
      min-height: 110px;
      border-radius: 10px;
      border: 1px solid rgba(0,0,0,0.1);
      padding: 8px;
      resize: vertical;
      font-size: 13px;
      background: rgba(255,255,255,0.4);
      color: #1a1f2b;
      font-family: inherit;
    }
    .sticky-note-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      color: #2b2f3a;
      flex-wrap: wrap;
    }
    .sticky-note-footer select {
      border-radius: 8px;
      border: 1px solid rgba(0,0,0,0.2);
      padding: 4px 8px;
      background: rgba(255,255,255,0.6);
      color: #1a1f2b;
    }
    .sticky-empty {
      padding: 20px;
      text-align: center;
      color: #8f9abc;
      border: 1px dashed rgba(255,255,255,0.2);
      border-radius: 12px;
    }
  `;
  document.head.appendChild(style);
}

function apiBase(){
  const origin = window.location?.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

function formatUpdated(value){
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

export function mount(el){
  injectStyles();
  el.innerHTML = `
    <div class="header">
      <div class="title">Sticky Notes</div>
      <div class="controls">
        <button class="icon-btn" data-action="refresh" title="Refresh">↺</button>
        <button class="icon-btn" data-action="minimize" title="Minimize">_</button>
        <button class="icon-btn" data-action="close" title="Close">x</button>
      </div>
    </div>
    <div class="content sticky-notes-shell">
      <form class="sticky-new-form">
        <input type="text" class="input" id="stickyNewTitle" placeholder="Title (optional)" />
        <textarea class="textarea" id="stickyNewBody" placeholder="Write a quick note..."></textarea>
        <div class="sticky-new-meta">
          <select class="input" id="stickyNewColor"></select>
          <label class="hint"><input type="checkbox" id="stickyNewPinned" /> Pin to top</label>
          <div class="spacer"></div>
          <button type="submit" class="btn btn-primary" id="stickyCreateBtn">Add Note</button>
        </div>
      </form>
      <div class="sticky-status-row">
        <div class="sticky-status" id="stickyStatus"></div>
        <div class="spacer"></div>
        <button class="btn btn-secondary" id="stickyReloadBtn">Refresh</button>
      </div>
      <div class="sticky-notes-grid" id="stickyNotesGrid"></div>
    </div>
  `;

  const btnMin = el.querySelector('[data-action="minimize"]');
  const btnClose = el.querySelector('[data-action="close"]');
  const headerRefresh = el.querySelector('[data-action="refresh"]');
  const createForm = el.querySelector('.sticky-new-form');
  const titleInput = el.querySelector('#stickyNewTitle');
  const bodyInput = el.querySelector('#stickyNewBody');
  const colorSelect = el.querySelector('#stickyNewColor');
  const pinnedCheckbox = el.querySelector('#stickyNewPinned');
  const reloadBtn = el.querySelector('#stickyReloadBtn');
  const grid = el.querySelector('#stickyNotesGrid');
  const statusEl = el.querySelector('#stickyStatus');

  COLORS.forEach(color => {
    const opt = document.createElement('option');
    opt.value = color.id;
    opt.textContent = color.label;
    colorSelect.appendChild(opt);
  });
  colorSelect.value = DEFAULT_COLOR;

  btnMin?.addEventListener('click', () => el.classList.toggle('minimized'));
  btnClose?.addEventListener('click', () => { el.style.display = 'none'; });

  const state = {
    notes: [],
    loading: false,
  };
  const pendingUpdates = new Map();
  const pendingTimers = new Map();

  function setStatus(text, isError = false){
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.classList.toggle('error', !!isError);
  }

  function sortNotes(notes){
    return [...notes].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });
  }

  function renderNotes(){
    if (!grid) return;
    grid.innerHTML = '';
    if (!state.notes.length){
      const empty = document.createElement('div');
      empty.className = 'sticky-empty';
      empty.textContent = 'No sticky notes yet. Capture a thought above.';
      grid.appendChild(empty);
      return;
    }
    const ordered = sortNotes(state.notes);
    ordered.forEach(note => {
      const card = document.createElement('section');
      card.className = 'sticky-note-card';
      card.dataset.color = note.color || DEFAULT_COLOR;
      card.classList.toggle('is-pinned', !!note.pinned);
      card.innerHTML = `
        <div class="sticky-note-header">
          <span title="Chronos note name">${note.name}</span>
          <div class="sticky-note-actions">
            <button type="button" data-action="reminder">Reminder</button>
            <button type="button" data-action="delete">Delete</button>
          </div>
        </div>
        <textarea data-field="content" spellcheck="false"></textarea>
        <div class="sticky-note-footer">
          <label>
            Color
            <select data-field="color"></select>
          </label>
          <label>
            <input type="checkbox" data-field="pinned" />
            Pin
          </label>
          <span class="sticky-note-updated">${formatUpdated(note.updated)}</span>
        </div>
      `;
      const textarea = card.querySelector('textarea');
      if (textarea) textarea.value = note.content || '';
      const colorField = card.querySelector('select[data-field="color"]');
      if (colorField){
        COLORS.forEach(color => {
          const option = document.createElement('option');
          option.value = color.id;
          option.textContent = color.label;
          colorField.appendChild(option);
        });
        colorField.value = note.color || DEFAULT_COLOR;
      }
      const pinToggle = card.querySelector('input[data-field="pinned"]');
      if (pinToggle) pinToggle.checked = !!note.pinned;

      textarea?.addEventListener('input', (ev)=>{
        scheduleUpdate(note.name, { content: ev.target.value });
      });
      colorField?.addEventListener('change', (ev)=>{
        const sel = ev.target.value || DEFAULT_COLOR;
        card.dataset.color = sel;
        scheduleUpdate(note.name, { color: sel });
      });
      pinToggle?.addEventListener('change', (ev)=>{
        const checked = !!ev.target.checked;
        card.classList.toggle('is-pinned', checked);
        scheduleUpdate(note.name, { pinned: checked });
      });
      card.querySelector('[data-action="delete"]')?.addEventListener('click', ()=> confirmDelete(note));
      card.querySelector('[data-action="reminder"]')?.addEventListener('click', ()=> promptReminder(note));

      grid.appendChild(card);
    });
  }

  async function fetchNotes(){
    state.loading = true;
    setStatus('Loading notes...');
    try {
      const resp = await fetch(`${apiBase()}/api/sticky-notes`);
      const data = await resp.json().catch(()=> ({}));
      if (!resp.ok || data.ok === false){
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      state.notes = Array.isArray(data.notes) ? data.notes : [];
      renderNotes();
      setStatus(`Loaded ${state.notes.length} note${state.notes.length === 1 ? '' : 's'}`);
    } catch (err) {
      console.error('[StickyNotes] fetch failed', err);
      setStatus(`Failed to load notes: ${err?.message || err}`, true);
    } finally {
      state.loading = false;
    }
  }

  function resetForm(){
    if (titleInput) titleInput.value = '';
    if (bodyInput) bodyInput.value = '';
    if (colorSelect) colorSelect.value = DEFAULT_COLOR;
    if (pinnedCheckbox) pinnedCheckbox.checked = false;
  }

  async function createNote(){
    const content = (bodyInput?.value || '').trim();
    const title = (titleInput?.value || '').trim();
    if (!content){
      setStatus('Write something before adding a note.', true);
      return;
    }
    const payload = {
      name: title,
      content,
      color: colorSelect?.value || DEFAULT_COLOR,
      pinned: !!pinnedCheckbox?.checked,
    };
    try {
      setStatus('Saving note...');
      const resp = await fetch(`${apiBase()}/api/sticky-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(()=> ({}));
      if (!resp.ok || data.ok === false){
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      resetForm();
      await fetchNotes();
      setStatus('Sticky note saved.');
    } catch (err) {
      console.error('[StickyNotes] create failed', err);
      setStatus(`Failed to save note: ${err?.message || err}`, true);
    }
  }

  function scheduleUpdate(name, patch){
    if (!name) return;
    const prev = pendingUpdates.get(name) || {};
    const merged = { ...prev, ...patch };
    pendingUpdates.set(name, merged);
    if (pendingTimers.has(name)){
      clearTimeout(pendingTimers.get(name));
    }
    const handle = setTimeout(()=> {
      pendingTimers.delete(name);
      const latest = pendingUpdates.get(name) || {};
      pendingUpdates.delete(name);
      sendUpdate(name, latest);
    }, SAVE_DEBOUNCE_MS);
    pendingTimers.set(name, handle);
  }

  async function sendUpdate(name, patch){
    if (!name) return;
    try {
      const resp = await fetch(`${apiBase()}/api/sticky-notes/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ...patch }),
      });
      const data = await resp.json().catch(()=> ({}));
      if (!resp.ok || data.ok === false){
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      if (data.note){
        mergeNote(data.note);
      }
      setStatus('Saved.');
    } catch (err) {
      console.error('[StickyNotes] update failed', err);
      setStatus(`Failed to update note: ${err?.message || err}`, true);
    }
  }

  function mergeNote(note){
    const idx = state.notes.findIndex(n => n.name === note.name);
    if (idx >= 0){
      state.notes[idx] = note;
    } else {
      state.notes.push(note);
    }
    renderNotes();
  }

  async function confirmDelete(note){
    if (!note?.name) return;
    if (!window.confirm(`Delete sticky note "${note.name}"?`)) return;
    try {
      const resp = await fetch(`${apiBase()}/api/sticky-notes/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: note.name }),
      });
      const data = await resp.json().catch(()=> ({}));
      if (!resp.ok || data.ok === false){
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      state.notes = state.notes.filter(n => n.name !== note.name);
      renderNotes();
      setStatus('Note deleted.');
    } catch (err) {
      console.error('[StickyNotes] delete failed', err);
      setStatus(`Failed to delete note: ${err?.message || err}`, true);
    }
  }

  async function promptReminder(note){
    if (!note?.name) return;
    const time = window.prompt('Reminder time (HH:MM)', '09:00');
    if (!time) return;
    const date = window.prompt('Date (YYYY-MM-DD, optional)', '');
    const message = window.prompt('Reminder message', `Review note "${note.name}"`) || '';
    try {
      const resp = await fetch(`${apiBase()}/api/sticky-notes/reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: note.name,
          time,
          date: date || undefined,
          message,
        }),
      });
      const data = await resp.json().catch(()=> ({}));
      if (!resp.ok || data.ok === false){
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      setStatus(`Reminder "${data.reminder}" created.`);
    } catch (err) {
      console.error('[StickyNotes] reminder failed', err);
      setStatus(`Failed to create reminder: ${err?.message || err}`, true);
    }
  }

  headerRefresh?.addEventListener('click', ()=> fetchNotes());
  reloadBtn?.addEventListener('click', ()=> fetchNotes());
  createForm?.addEventListener('submit', (ev)=>{
    ev.preventDefault();
    createNote();
  });

  fetchNotes();

  return {
    refresh: fetchNotes,
  };
}
