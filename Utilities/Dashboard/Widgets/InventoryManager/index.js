export function mount(el, context){
  const tpl = `
    <style>
      .inv-body { display:flex; flex-direction:column; gap:10px; height:100%; min-height:0; }
      .inv-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .inv-toolbar input { flex:1 1 200px; }
      .inv-toolbar select { flex:0 0 180px; }
      .inv-new { display:flex; gap:8px; flex-wrap:wrap; background:#0f141d; border:1px solid var(--border); border-radius:10px; padding:8px; }
      .inv-new input { flex:1 1 180px; }
      .inv-layout { flex:1 1 0; min-height:320px; display:flex; gap:10px; overflow:hidden; }
      .inv-list { flex:0 0 38%; min-width:240px; background:#0f141d; border:1px solid var(--border); border-radius:10px; display:flex; flex-direction:column; }
      .inv-list-rows { flex:1 1 auto; overflow:auto; padding:6px; display:flex; flex-direction:column; gap:6px; }
      .inv-row { border:1px solid #222835; border-radius:8px; padding:8px; cursor:pointer; transition: border-color 120ms ease, background 120ms ease; }
      .inv-row:hover { border-color:#31405f; }
      .inv-row.active { border-color:#4c6ef5; background:rgba(76,110,245,0.08); }
      .inv-row-name { font-weight:700; color:var(--text); }
      .inv-row-meta { color:var(--text-dim); font-size:12px; margin-top:4px; display:flex; gap:8px; flex-wrap:wrap; }
      .inv-detail { flex:1 1 0; min-width:280px; border:1px solid var(--border); border-radius:10px; padding:10px; background:#0f141d; overflow:auto; }
      .inv-detail h3 { margin:14px 0 6px; font-size:15px; letter-spacing:0.2px; }
      .inv-detail .section { border:1px solid #1f2533; border-radius:8px; padding:10px; margin-bottom:10px; background:#0b111c; }
      .inv-detail .section-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; font-weight:600; }
      .inv-items, .inv-tools { display:flex; flex-direction:column; gap:6px; }
      .inv-entry { border:1px solid #222835; border-radius:8px; padding:8px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
      .inv-entry .name { font-weight:600; flex:1 1 auto; }
      .inv-entry .meta { color:var(--text-dim); font-size:12px; }
      .inv-entry input[type="number"] { width:80px; }
      .inv-entry .actions { display:flex; gap:6px; }
      .inv-form { margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; }
      .inv-form input { flex:1 1 160px; }
      .inv-status { font-size:12px; color:var(--text-dim); min-height:18px; }
      .inv-empty { color:var(--text-dim); font-style:italic; }
    </style>
    <div class="header">
      <div class="title">Inventory Manager</div>
      <div class="controls">
        <button class="icon-btn" data-action="minimize" title="Minimize">_</button>
        <button class="icon-btn" data-action="close" title="Close">x</button>
      </div>
    </div>
    <div class="content inv-body">
      <div class="inv-toolbar">
        <input id="invSearch" class="input" placeholder="Search inventories..." />
        <select id="invPlaceFilter" class="input">
          <option value="">All places</option>
        </select>
        <button class="btn" id="invSearchBtn">Search</button>
        <button class="btn" id="invRefresh">Refresh</button>
        <span class="spacer"></span>
      </div>
      <div class="inv-new">
        <input id="invNewName" class="input" placeholder="New inventory name" />
        <input id="invNewPlaces" class="input" placeholder="Places (comma separated)" />
        <input id="invNewTags" class="input" placeholder="Tags (comma separated)" />
        <button class="btn btn-primary" id="invCreateBtn">Create</button>
      </div>
      <div class="inv-layout">
        <div class="inv-list">
          <div id="invCount" class="hint" style="padding:8px 10px; border-bottom:1px solid #222835;"></div>
          <div class="inv-list-rows" id="invList"></div>
        </div>
        <div class="inv-detail" id="invDetail">
          <div class="inv-empty">Select an inventory to see details.</div>
        </div>
      </div>
      <div class="inv-status" id="invStatus"></div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const searchEl = el.querySelector('#invSearch');
  const placeSel = el.querySelector('#invPlaceFilter');
  const listEl = el.querySelector('#invList');
  const countEl = el.querySelector('#invCount');
  const detailEl = el.querySelector('#invDetail');
  const statusEl = el.querySelector('#invStatus');
  const refreshBtn = el.querySelector('#invRefresh');
  const searchBtn = el.querySelector('#invSearchBtn');
  const createBtn = el.querySelector('#invCreateBtn');
  const newNameEl = el.querySelector('#invNewName');
  const newPlacesEl = el.querySelector('#invNewPlaces');
  const newTagsEl = el.querySelector('#invNewTags');
  const btnMin = el.querySelector('[data-action="minimize"]');
  const btnClose = el.querySelector('[data-action="close"]');

  const state = {
    inventories: [],
    selected: null,
    places: [],
  };

  function apiBase(){
    const origin = window.location.origin;
    if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
    return origin;
  }

  function setStatus(msg = '', tone = 'info'){
    const colors = { info: '#a6adbb', success: '#8ef7c2', error: '#ff9aa2', warn: '#ffd77a' };
    statusEl.textContent = msg;
    statusEl.style.color = colors[tone] || colors.info;
  }

  function toList(value){
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === '') return [];
    return [value];
  }

  async function fetchJson(url, options){
    const resp = await fetch(url, options);
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = {}; }
    if (!resp.ok || (data && data.ok === false)){
      const err = (data && data.error) || text || `HTTP ${resp.status}`;
      throw new Error(err);
    }
    return data;
  }

  async function loadPlaces(){
    try {
      const data = await fetchJson(`${apiBase()}/api/settings?file=place_settings.yml`);
      const entries = (data?.data?.Place_Settings) || (data?.data?.place_settings) || {};
      state.places = Object.keys(entries);
      renderPlaceOptions();
    } catch {
      state.places = [];
      renderPlaceOptions();
    }
  }

  function renderPlaceOptions(){
    const options = ['<option value="">All places</option>']
      .concat(state.places.map(place => `<option value="${place}">${place}</option>`));
    placeSel.innerHTML = options.join('');
  }

  async function loadInventories(keepSelection = true){
    try {
      setStatus('Loading inventories...', 'info');
      const data = await fetchJson(`${apiBase()}/api/items?type=inventory`);
      state.inventories = (data.items || data || []).map(item => item || {});
      renderList();
      const prior = keepSelection && state.selected ? state.selected.name : null;
      if (prior){
        await selectInventory(prior);
      } else if (!state.selected && state.inventories.length){
        await selectInventory(state.inventories[0].name);
      } else if (!state.inventories.length){
        state.selected = null;
        renderDetail();
      }
      setStatus(`Loaded ${state.inventories.length} inventories.`, 'success');
    } catch (err) {
      setStatus(err.message || 'Failed to load inventories.', 'error');
    }
  }

  function filteredInventories(){
    const term = (searchEl.value || '').trim().toLowerCase();
    const place = (placeSel.value || '').trim().toLowerCase();
    return state.inventories.filter(inv => {
      const name = String(inv.name || '').toLowerCase();
      if (term && !name.includes(term)) return false;
      if (place){
        const places = toList(inv.places || inv.location).map(p => String(p).toLowerCase());
        if (!places.includes(place)) return false;
      }
      return true;
    });
  }

  function renderList(){
    const entries = filteredInventories();
    const total = state.inventories.length;
    countEl.textContent = total ? `${entries.length} / ${total} inventories` : 'No inventories';
    listEl.innerHTML = '';
    if (!entries.length){
      const empty = document.createElement('div');
      empty.className = 'inv-empty';
      empty.textContent = 'No inventories match the current filters.';
      listEl.appendChild(empty);
      return;
    }
    entries.forEach(inv => {
      const row = document.createElement('div');
      row.className = 'inv-row';
      row.dataset.name = inv.name;
      if (state.selected && state.selected.name === inv.name){
        row.classList.add('active');
      }
      const places = toList(inv.places || inv.location);
      const tags = toList(inv.tags);
      const items = toList(inv.inventory_items || inv.items || []);
      const tools = toList(inv.tools);
      row.innerHTML = `
        <div class="inv-row-name">${inv.name || 'Unnamed inventory'}</div>
        <div class="inv-row-meta">
          ${places.length ? `<span>${places.join(', ')}</span>` : ''}
          <span>${items.length} items</span>
          <span>${tools.length} tools</span>
          ${tags.length ? `<span>Tags: ${tags.join(', ')}</span>` : ''}
        </div>
      `;
      row.addEventListener('click', ()=> selectInventory(inv.name));
      listEl.appendChild(row);
    });
  }

  async function selectInventory(name){
    if (!name) return;
    try {
      setStatus(`Loading ${name}...`, 'info');
      const data = await fetchJson(`${apiBase()}/api/item?type=inventory&name=${encodeURIComponent(name)}`);
      const item = data.item || data.data || {};
      state.selected = item;
      renderList();
      renderDetail();
      setStatus(`Loaded ${name}.`, 'success');
    } catch (err) {
      setStatus(err.message || 'Failed to load inventory.', 'error');
    }
  }

  function renderDetail(){
    if (!state.selected){
      detailEl.innerHTML = '<div class="inv-empty">Select an inventory to see details.</div>';
      return;
    }
    const inv = state.selected;
    const places = toList(inv.places || inv.location);
    const tags = toList(inv.tags);
    const items = Array.isArray(inv.inventory_items) ? inv.inventory_items
      : Array.isArray(inv.items) ? inv.items : [];
    const tools = Array.isArray(inv.tools) ? inv.tools : [];
    detailEl.innerHTML = `
      <div>
        <h2 style="margin:0 0 6px;">${inv.name || 'Inventory'}</h2>
        ${inv.description ? `<p class="hint" style="margin-top:0;">${inv.description}</p>` : ''}
        ${places.length ? `<div class="hint">Places: ${places.join(', ')}</div>` : ''}
        ${tags.length ? `<div class="hint">Tags: ${tags.join(', ')}</div>` : ''}
      </div>
      <div class="section">
        <div class="section-header">
          <span>Inventory Items (${items.length})</span>
        </div>
        <div class="inv-items">
          ${items.length ? items.map(entry => `
            <div class="inv-entry" data-item="${entry.name}">
              <div class="name">${entry.name}</div>
              <div class="meta">qty</div>
              <input type="number" min="0" class="input" data-qty value="${entry.quantity ?? 1}" />
              <div class="actions">
                <button class="btn btn-secondary" data-action="update-item" data-name="${entry.name}">Update</button>
                <button class="btn btn-secondary" data-action="remove-item" data-name="${entry.name}">Remove</button>
              </div>
            </div>
          `).join('') : '<div class="inv-empty">No items linked.</div>'}
        </div>
        <form class="inv-form" data-form="add-item">
          <input name="name" class="input" placeholder="Item name" required />
          <input name="quantity" type="number" min="1" class="input" value="1" required />
          <button class="btn btn-primary" type="submit">Add Item</button>
        </form>
      </div>
      <div class="section">
        <div class="section-header">
          <span>Tools (${tools.length})</span>
        </div>
        <div class="inv-tools">
          ${tools.length ? tools.map(entry => `
            <div class="inv-entry" data-tool="${entry.name}">
              <div class="name">${entry.name}</div>
              <div class="actions">
                <button class="btn btn-secondary" data-action="remove-tool" data-name="${entry.name}">Remove</button>
              </div>
            </div>
          `).join('') : '<div class="inv-empty">No tools linked.</div>'}
        </div>
        <form class="inv-form" data-form="add-tool">
          <input name="name" class="input" placeholder="Tool name" required />
          <button class="btn btn-primary" type="submit">Add Tool</button>
        </form>
      </div>
      ${inv.notes ? `<div class="section"><div class="section-header"><span>Notes</span></div><div>${String(inv.notes).replace(/\\n/g, '<br/>')}</div></div>` : ''}
    `;
  }

  async function saveInventory(data){
    const payload = {
      type: 'inventory',
      name: data.name,
      properties: Object.assign({}, data, { type: 'inventory', name: data.name })
    };
    await fetchJson(`${apiBase()}/api/item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async function modifyInventory(mutator, successMsg){
    if (!state.selected) return;
    const clone = JSON.parse(JSON.stringify(state.selected));
    mutator(clone);
    try {
      await saveInventory(clone);
      state.selected = clone;
      await loadInventories(true);
      setStatus(successMsg || 'Inventory updated.', 'success');
    } catch (err) {
      setStatus(err.message || 'Failed to update inventory.', 'error');
    }
  }

  async function handleCreateInventory(){
    const name = newNameEl.value.trim();
    if (!name){
      setStatus('Inventory name is required.', 'warn');
      return;
    }
    const places = newPlacesEl.value.split(',').map(s => s.trim()).filter(Boolean);
    const tags = newTagsEl.value.split(',').map(s => s.trim()).filter(Boolean);
    const payload = {
      name,
      type: 'inventory',
      description: '',
      places,
      tags,
      inventory_items: [],
      tools: [],
    };
    try {
      await saveInventory(payload);
      newNameEl.value = '';
      newPlacesEl.value = '';
      newTagsEl.value = '';
      await loadInventories(false);
      await selectInventory(name);
      setStatus(`Created inventory '${name}'.`, 'success');
    } catch (err) {
      setStatus(err.message || 'Failed to create inventory.', 'error');
    }
  }

  detailEl.addEventListener('click', (ev)=>{
    const actionBtn = ev.target.closest('[data-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    const name = actionBtn.dataset.name;
    if (!state.selected) return;

    if (action === 'remove-item'){
      modifyInventory(data => {
        const items = Array.isArray(data.inventory_items) ? data.inventory_items
          : Array.isArray(data.items) ? data.items : [];
        data.inventory_items = items.filter(entry => String(entry.name).toLowerCase() !== String(name).toLowerCase());
        if ('items' in data) delete data.items;
      }, `Removed item '${name}'.`);
    }
    if (action === 'update-item'){
      const entryEl = actionBtn.closest('.inv-entry');
      const qtyInput = entryEl?.querySelector('input[data-qty]');
      const qty = qtyInput ? parseInt(qtyInput.value, 10) || 0 : 0;
      modifyInventory(data => {
        const items = Array.isArray(data.inventory_items) ? data.inventory_items
          : Array.isArray(data.items) ? data.items : [];
        items.forEach(entry => {
          if (String(entry.name).toLowerCase() === String(name).toLowerCase()){
            entry.quantity = qty;
          }
        });
        data.inventory_items = items;
        if ('items' in data) delete data.items;
      }, `Updated quantity for '${name}'.`);
    }
    if (action === 'remove-tool'){
      modifyInventory(data => {
        const tools = Array.isArray(data.tools) ? data.tools : [];
        data.tools = tools.filter(entry => String(entry.name).toLowerCase() !== String(name).toLowerCase());
      }, `Removed tool '${name}'.`);
    }
  });

  detailEl.addEventListener('submit', (ev)=>{
    const form = ev.target;
    if (!form.dataset.form) return;
    ev.preventDefault();
    if (!state.selected){
      setStatus('Select an inventory first.', 'warn');
      return;
    }
    const formData = new FormData(form);
    if (form.dataset.form === 'add-item'){
      const name = (formData.get('name') || '').toString().trim();
      const qty = parseInt(formData.get('quantity'), 10) || 1;
      if (!name){
        setStatus('Item name is required.', 'warn');
        return;
      }
      modifyInventory(data => {
        const items = Array.isArray(data.inventory_items) ? data.inventory_items
          : Array.isArray(data.items) ? data.items : [];
        const existing = items.find(entry => String(entry.name).toLowerCase() === name.toLowerCase());
        if (existing){
          existing.quantity = qty;
        } else {
          items.push({ type: 'inventory_item', name, quantity: qty });
        }
        data.inventory_items = items;
        if ('items' in data) delete data.items;
      }, `Linked '${name}'.`);
      form.reset();
      const qtyInput = form.querySelector('[name="quantity"]');
      if (qtyInput) qtyInput.value = 1;
    }
    if (form.dataset.form === 'add-tool'){
      const name = (formData.get('name') || '').toString().trim();
      if (!name){
        setStatus('Tool name is required.', 'warn');
        return;
      }
      modifyInventory(data => {
        const tools = Array.isArray(data.tools) ? data.tools : [];
        if (!tools.some(entry => String(entry.name).toLowerCase() === name.toLowerCase())){
          tools.push({ type: 'tool', name });
        }
        data.tools = tools;
      }, `Linked tool '${name}'.`);
      form.reset();
    }
  });

  btnMin?.addEventListener('click', ()=> el.classList.toggle('minimized'));
  btnClose?.addEventListener('click', ()=> { el.style.display = 'none'; try { context?.bus?.emit?.('widget:closed','InventoryManager'); } catch {} });
  refreshBtn?.addEventListener('click', ()=> loadInventories(true));
  searchBtn?.addEventListener('click', ()=> renderList());
  searchEl?.addEventListener('keydown', (ev)=> { if (ev.key === 'Enter'){ ev.preventDefault(); renderList(); } });
  placeSel?.addEventListener('change', ()=> renderList());
  createBtn?.addEventListener('click', handleCreateInventory);

  loadPlaces();
  loadInventories(false);
}
