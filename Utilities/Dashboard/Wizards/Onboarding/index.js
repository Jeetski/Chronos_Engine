const OVERLAY_TAG = 'chronos-onboarding';
let stylesInjected = false;

function apiBase(){
  const origin = window.location.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
  return origin;
}

async function apiRequest(path, { method = 'GET', body } = {}){
  const opts = { method, headers: {} };
  if (body !== undefined){
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const resp = await fetch(apiBase() + path, opts);
  const text = await resp.text();
  let data = text;
  try { data = JSON.parse(text); } catch {}
  if (!resp.ok || (data && data.ok === false)){
    const err = (data && (data.error || data.stderr)) || text || `HTTP ${resp.status}`;
    throw new Error(err);
  }
  return data;
}

function injectStyles(){
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.textContent = `
    .onboarding-overlay {
      position: fixed;
      inset: 0;
      background: radial-gradient(circle at 25% 20%, rgba(49,76,199,0.25), rgba(5,7,15,0.95));
      z-index: 1200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: clamp(16px,3vw,32px);
      backdrop-filter: blur(10px);
    }
    .onboarding-shell {
      width: min(960px, 96vw);
      max-height: 94vh;
      background: linear-gradient(140deg, rgba(8,11,22,0.95), rgba(3,5,12,0.98));
      border: 1px solid rgba(108,138,255,0.25);
      border-radius: 24px;
      box-shadow: 0 30px 90px rgba(0,0,0,0.65);
      display: flex;
      flex-direction: column;
      color: #f1f5ff;
      padding: clamp(20px, 3vw, 32px);
      gap: 18px;
      position: relative;
    }
    .onboarding-header {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .onboarding-hero {
      display: flex;
      align-items: center;
      gap: 18px;
      padding: 18px;
      border-radius: 18px;
      background: linear-gradient(120deg, rgba(15,24,54,0.9), rgba(10,14,30,0.9));
      border: 1px solid rgba(104,133,255,0.2);
      position: relative;
      overflow: hidden;
    }
    .onboarding-hero::after {
      content: "";
      position: absolute;
      inset: -60% auto auto 65%;
      width: 360px;
      height: 360px;
      background: radial-gradient(circle, rgba(73,120,255,0.35), transparent 60%);
      opacity: 0.8;
      pointer-events: none;
    }
    .onboarding-hero-icon {
      position: relative;
      width: 82px;
      height: 82px;
      flex-shrink: 0;
      border-radius: 22px;
      background: linear-gradient(150deg, rgba(150,174,255,0.2), rgba(58,94,255,0.35));
      border: 1px solid rgba(255,255,255,0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #aac0ff;
      z-index: 1;
    }
    .onboarding-hero-icon svg {
      width: 52px;
      height: 52px;
      stroke: currentColor;
    }
    .onboarding-hero-copy {
      display: flex;
      flex-direction: column;
      gap: 6px;
      position: relative;
      z-index: 1;
    }
    .onboarding-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #a9bcff;
      background: rgba(84,115,255,0.2);
      border-radius: 999px;
      padding: 4px 10px;
    }
    .onboarding-hero-copy h1 {
      margin: 0;
      font-size: clamp(22px, 3vw, 30px);
    }
    .onboarding-hero-copy p {
      margin: 0;
      color: #b8c8f2;
    }
    .onboarding-progress {
      font-size: 13px;
      color: #8aa3ff;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .onboarding-stepper {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      padding-bottom: 6px;
    }
    .onboarding-stepper::-webkit-scrollbar {
      height: 6px;
    }
    .onboarding-stepper::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.15);
      border-radius: 999px;
    }
    .stepper-node {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(12,16,28,0.75);
      color: #a6b4df;
      cursor: pointer;
      transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
      font-size: 13px;
      min-width: 140px;
    }
    .stepper-node .step-index {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      color: #d5ddff;
    }
    .stepper-node .stepper-title {
      font-weight: 600;
      color: inherit;
    }
    .stepper-node.active {
      border-color: rgba(107,138,255,0.9);
      background: linear-gradient(135deg, rgba(64,97,255,0.9), rgba(43,64,196,0.9));
      color: #fff;
      box-shadow: 0 10px 30px rgba(52,78,195,0.35);
    }
    .stepper-node.active .step-index {
      background: rgba(255,255,255,0.2);
    }
    .stepper-node.completed {
      border-color: rgba(70,171,128,0.6);
      color: #d2ffe8;
      background: rgba(18,46,32,0.8);
    }
    .stepper-node.completed .step-index {
      background: rgba(70,171,128,0.3);
      color: #fff;
    }
    .onboarding-content {
      flex: 1;
      background: rgba(7,10,20,0.82);
      border: 1px solid rgba(30,42,71,0.75);
      border-radius: 20px;
      padding: 18px;
      display: flex;
      min-height: 0;
    }
    .onboarding-body {
      flex: 1;
      overflow: auto;
      padding-right: 6px;
    }
    .onboarding-body::-webkit-scrollbar {
      width: 6px;
    }
    .onboarding-body::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.15);
      border-radius: 999px;
    }
    .onboarding-body p {
      color: #c4cff1;
      line-height: 1.6;
    }
    .onboarding-footer {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    @media (min-width: 680px){
      .onboarding-footer {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }
    }
    .wizard-status-line {
      font-size: 13px;
      color: #9ebaff;
      min-height: 24px;
      padding: 10px 14px;
      background: rgba(21,28,46,0.85);
      border-radius: 12px;
      border: 1px solid rgba(41,55,92,0.8);
      flex: 1;
    }
    .onboarding-actions {
      display: flex;
      width: 100%;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .onboarding-actions .action-group {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .onboarding-actions button {
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 12px;
      padding: 10px 18px;
      background: rgba(12,14,24,0.9);
      color: inherit;
      cursor: pointer;
      font-size: 15px;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .onboarding-actions button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    .onboarding-actions button:hover:not(:disabled) {
      border-color: rgba(255,255,255,0.35);
      transform: translateY(-1px);
    }
    .onboarding-actions button.primary {
      background: linear-gradient(120deg,#6f89ff,#4f64f2);
      border-color: rgba(143,168,255,0.45);
      color: #fff;
      box-shadow: 0 12px 30px rgba(74,98,255,0.35);
    }
    .onboarding-actions button.ghost {
      background: rgba(12,16,28,0.6);
    }
    .onboarding-actions button.subtle {
      border-color: transparent;
      color: #a8befe;
      background: transparent;
    }
    .wizard-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .wizard-form label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 14px;
      color: #c5d4ff;
    }
    .wizard-form input, .wizard-form textarea, .wizard-form select {
      border-radius: 8px;
      border: 1px solid #293248;
      padding: 8px 10px;
      background: rgba(9,14,22,0.7);
      color: inherit;
    }
    .list-card {
      border: 1px solid #273147;
      border-radius: 12px;
      padding: 12px;
      margin-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: rgba(11,16,25,0.7);
    }
    .list-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .list-row input {
      flex: 1;
    }
    .pill {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(59,100,255,0.15);
      color: #a9bbff;
      font-size: 13px;
    }
    .status-values {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .status-values .value-row {
      display: grid;
      grid-template-columns: 140px 1fr auto;
      gap: 8px;
      align-items: center;
    }
    .status-values .value-row input {
      width: 100%;
    }
    .status-values .value-row button {
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid #34405c;
      background: #111725;
      color: inherit;
      cursor: pointer;
    }
    .items-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill,minmax(240px,1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .items-grid label {
      border: 1px solid #263148;
      border-radius: 12px;
      padding: 10px;
      background: rgba(7,12,20,0.7);
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

const state = {
  nickname: '',
  profile: null,
  categories: [],
  statuses: [],
  statusValues: {},
  currentStatus: {},
  preferences: {},
  createdItems: [],
};

function statusSlug(name){
  return (name || '').toLowerCase().replace(/\s+/g, '_');
}
function statusRootKey(name){
  return (name || '')
    .split(' ')
    .map(part => part ? part[0].toUpperCase() + part.slice(1) : '')
    .join('_') + '_Settings';
}

async function loadProfile(){
  const data = await apiRequest('/api/profile');
  state.profile = data.profile || {};
  state.nickname = state.profile.nickname || state.nickname || 'Pilot';
}

async function saveProfile(nickname){
  await apiRequest('/api/profile', { method: 'POST', body: { nickname } });
  state.nickname = nickname;
}

async function loadCategories(){
  const data = await apiRequest('/api/settings?file=category_settings.yml');
  const categories = data.data?.Category_Settings || {};
  state.categories = Object.entries(categories)
    .sort((a, b) => (a[1].value || 0) - (b[1].value || 0))
    .map(([name, meta]) => ({
      name,
      description: meta.Description || '',
    }));
}

async function saveCategories(){
  const payload = {};
  state.categories.forEach((cat, idx) => {
    if (!cat.name) return;
    payload[cat.name] = {
      value: idx + 1,
      Description: cat.description || '',
    };
  });
  await apiRequest('/api/settings', {
    method: 'POST',
    body: { file: 'category_settings.yml', data: { Category_Settings: payload } },
  });
}

async function loadStatuses(){
  const data = await apiRequest('/api/settings?file=status_settings.yml');
  const entries = (data.data?.Status_Settings || []).slice().sort((a, b) => (a.Rank || 0) - (b.Rank || 0));
  state.statuses = entries.map(entry => ({
    name: entry.Name,
    description: entry.Description || '',
  }));
  for (const entry of state.statuses){
    const slug = statusSlug(entry.name);
    try {
      const valuesData = await apiRequest(`/api/settings?file=${slug}_settings.yml`);
      const rootVal = Object.values(valuesData.data || {})[0] || {};
      const arr = Object.entries(rootVal)
        .sort((a, b) => (a[1].value || 0) - (b[1].value || 0))
        .map(([label, meta]) => ({ label, description: meta.description || '' }));
      state.statusValues[slug] = arr;
    } catch {
      state.statusValues[slug] = [];
    }
  }
  const statusResp = await apiRequest('/api/status/current').catch(()=>({status:{}}));
  state.currentStatus = statusResp.status || {};
}

async function saveStatuses(){
  const payload = state.statuses.map((entry, idx) => ({
    Name: entry.name,
    Description: entry.description || '',
    Rank: idx + 1,
  }));
  await apiRequest('/api/settings', {
    method: 'POST',
    body: { file: 'status_settings.yml', data: { Status_Settings: payload } },
  });
  for (const entry of state.statuses){
    const slug = statusSlug(entry.name);
    const values = state.statusValues[slug] || [];
    const map = {};
    values.forEach((val, idx) => {
      if (!val.label) return;
      map[val.label] = {
        value: idx + 1,
        description: val.description || '',
      };
    });
    await apiRequest('/api/settings', {
      method: 'POST',
      body: { file: `${slug}_settings.yml`, data: { [statusRootKey(entry.name)]: map } },
    });
  }
}

async function updateCurrentStatus(){
  await apiRequest('/api/status/update', { method: 'POST', body: state.currentStatus });
}

async function loadPreferences(){
  const data = await apiRequest('/api/preferences');
  state.preferences = data.preferences || {};
}

async function savePreferences(){
  await apiRequest('/api/preferences', { method: 'POST', body: state.preferences });
}

async function copyItem(type, source, newName){
  await apiRequest('/api/item/copy', {
    method: 'POST',
    body: { type, source, new_name: newName },
  });
  state.createdItems.push(`${type}:${newName}`);
}

async function runCli(command, args = [], properties = {}){
  return apiRequest('/api/cli', { method: 'POST', body: { command, args, properties } });
}

function buildListRow(cat, idx, onChange){
  const row = document.createElement('div');
  row.className = 'list-row';
  const name = document.createElement('input');
  name.placeholder = 'Name';
  name.value = cat.name || '';
  name.addEventListener('input', ()=> {
    cat.name = name.value;
    onChange?.();
  });
  const desc = document.createElement('input');
  desc.placeholder = 'Description';
  desc.value = cat.description || '';
  desc.addEventListener('input', ()=> {
    cat.description = desc.value;
    onChange?.();
  });
  const up = document.createElement('button');
  up.textContent = '↑';
  up.addEventListener('click', ()=> {
    if (idx === 0) return;
    const tmp = state.categories[idx-1];
    state.categories[idx-1] = cat;
    state.categories[idx] = tmp;
    onChange?.(true);
  });
  const down = document.createElement('button');
  down.textContent = '↓';
  down.addEventListener('click', ()=> {
    if (idx === state.categories.length - 1) return;
    const tmp = state.categories[idx+1];
    state.categories[idx+1] = cat;
    state.categories[idx] = tmp;
    onChange?.(true);
  });
  const remove = document.createElement('button');
  remove.textContent = '✕';
  remove.addEventListener('click', ()=> {
    state.categories.splice(idx, 1);
    onChange?.(true);
  });
  row.append(name, desc, up, down, remove);
  return row;
}

function renderCategoryStep(ctx){
  const container = ctx.container;
  container.innerHTML = '';
  const info = document.createElement('p');
  info.textContent = 'Drag/adjust the order so Chronos knows what matters first. These categories drive filters and template scoring.';
  container.appendChild(info);
  const listCard = document.createElement('div');
  listCard.className = 'list-card';
  container.appendChild(listCard);
  const rebuild = (force=false)=>{
    listCard.innerHTML = '';
    state.categories.forEach((cat, idx) => {
      listCard.appendChild(buildListRow(cat, idx, (needRebuild)=> { if (needRebuild) rebuild(true); }));
    });
  };
  rebuild();
  const addBtn = document.createElement('button');
  addBtn.textContent = 'Add Category';
  addBtn.addEventListener('click', ()=> {
    state.categories.push({ name: '', description: '' });
    rebuild(true);
  });
  container.appendChild(addBtn);
  return {
    async beforeNext(){
      await saveCategories();
      ctx.setStatus('Categories saved.');
      return true;
    }
  };
}

function renderStatusStep(ctx){
  const container = ctx.container;
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.display = 'grid';
  wrap.style.gridTemplateColumns = '240px 1fr';
  wrap.style.gap = '16px';
  container.appendChild(wrap);

  let activeIdx = 0;
  const list = document.createElement('div');
  list.className = 'list-card';
  const detail = document.createElement('div');
  detail.className = 'list-card';
  wrap.append(list, detail);

  function select(idx){
    activeIdx = idx;
    renderList();
    renderDetail();
  }

  function renderList(){
    list.innerHTML = '';
    state.statuses.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.style.cursor = 'pointer';
      row.style.background = idx === activeIdx ? 'rgba(59,100,255,0.15)' : '';
      row.addEventListener('click', ()=> select(idx));
      const label = document.createElement('span');
      label.textContent = entry.name;
      row.appendChild(label);
      const up = document.createElement('button'); up.textContent='↑';
      up.addEventListener('click', (ev)=> { ev.stopPropagation(); if (idx>0){ const tmp = state.statuses[idx-1]; state.statuses[idx-1]=entry; state.statuses[idx]=tmp; select(idx-1);} });
      const down = document.createElement('button'); down.textContent='↓';
      down.addEventListener('click', (ev)=> { ev.stopPropagation(); if (idx<state.statuses.length-1){ const tmp = state.statuses[idx+1]; state.statuses[idx+1]=entry; state.statuses[idx]=tmp; select(idx+1);} });
      const remove = document.createElement('button'); remove.textContent='✕';
      remove.addEventListener('click', (ev)=> { ev.stopPropagation(); state.statuses.splice(idx,1); if (activeIdx>=state.statuses.length) activeIdx=Math.max(0,state.statuses.length-1); select(activeIdx); });
      row.append(up, down, remove);
      list.appendChild(row);
    });
    const add = document.createElement('button');
    add.textContent = 'Add Status';
    add.addEventListener('click', ()=> {
      state.statuses.push({ name: `Status ${state.statuses.length+1}`, description: '' });
      state.statusValues[statusSlug(`Status ${state.statuses.length}`)] = [];
      select(state.statuses.length-1);
    });
    list.appendChild(add);
  }

  function renderDetail(){
    detail.innerHTML = '';
    if (!state.statuses.length){
      const empty = document.createElement('p');
      empty.textContent = 'Add at least one status dimension.';
      detail.appendChild(empty);
      return;
    }
    const entry = state.statuses[activeIdx];
    const nameInput = document.createElement('input');
    nameInput.value = entry.name;
    let lastSlug = statusSlug(entry.name);
    nameInput.addEventListener('input', ()=> {
      entry.name = nameInput.value;
      const newSlug = statusSlug(entry.name);
      if (newSlug !== lastSlug){
        state.statusValues[newSlug] = state.statusValues[lastSlug] || state.statusValues[newSlug] || [];
        if (newSlug !== lastSlug){
          delete state.statusValues[lastSlug];
        }
        lastSlug = newSlug;
      }
    });
    const descInput = document.createElement('textarea');
    descInput.value = entry.description || '';
    descInput.rows = 2;
    descInput.addEventListener('input', ()=> entry.description = descInput.value);
    detail.append(labelled('Name', nameInput), labelled('Description', descInput));
    const valuesWrap = document.createElement('div');
    valuesWrap.className = 'status-values';
    const slug = statusSlug(entry.name);
    state.statusValues[slug] = state.statusValues[slug] || [];
    const valueRows = state.statusValues[slug];
    const rebuildValues = ()=>{
      valuesWrap.innerHTML = '';
      valueRows.forEach((val, idx) => {
        const row = document.createElement('div');
        row.className = 'value-row';
        const label = document.createElement('input'); label.placeholder='Label'; label.value = val.label || '';
        label.addEventListener('input', ()=> val.label = label.value);
        const desc = document.createElement('input'); desc.placeholder='Description'; desc.value = val.description || '';
        desc.addEventListener('input', ()=> val.description = desc.value);
        const del = document.createElement('button'); del.textContent='Remove';
        del.addEventListener('click', ()=> { valueRows.splice(idx,1); rebuildValues(); });
        row.append(label, desc, del);
        valuesWrap.appendChild(row);
      });
    };
    rebuildValues();
    const addValue = document.createElement('button');
    addValue.textContent = 'Add Value';
    addValue.addEventListener('click', ()=> { valueRows.push({ label: '', description: '' }); rebuildValues(); });
    detail.append(labelled('Scale Values', valuesWrap), addValue);

    const statusRow = document.createElement('div');
    statusRow.style.marginTop = '10px';
    const select = document.createElement('select');
    const options = valueRows.length ? valueRows : [{ label: 'low' }, { label: 'medium' }, { label: 'high' }];
    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.label;
      option.textContent = opt.label;
      select.appendChild(option);
    });
    const key = statusSlug(entry.name);
    select.value = state.currentStatus[key] || options[0].label;
    select.addEventListener('change', ()=> { state.currentStatus[key] = select.value; });
    statusRow.appendChild(select);
    detail.append(labelled('Current feeling', select));
  }

  function labelled(label, node){
    const wrap = document.createElement('label');
    wrap.textContent = label;
    wrap.appendChild(node);
    return wrap;
  }

  renderList();
  renderDetail();
  return {
    async beforeNext(){
      await saveStatuses();
      await updateCurrentStatus();
      ctx.setStatus('Statuses saved and current values updated.');
      return true;
    }
  };
}

function renderTemplateStep(ctx){
  const container = ctx.container;
  container.innerHTML = '';
  const intro = document.createElement('p');
  intro.textContent = 'Clone the Weekday Example and any routines you want as a baseline. Use the checkboxes to duplicate multiple items at once.';
  container.appendChild(intro);
  const dayInput = document.createElement('input');
  dayInput.value = 'Weekday Flow';
  container.appendChild(labelled('New day template name', dayInput));
  const cloneBtn = document.createElement('button');
  cloneBtn.textContent = 'Clone Weekday Example';
  cloneBtn.addEventListener('click', async ()=>{
    const name = dayInput.value.trim();
    if (!name) return;
    cloneBtn.disabled = true;
    try{
      await copyItem('day', 'Weekday Example', name);
      ctx.setStatus(`Created day template "${name}"`);
    } catch (err){
      ctx.setStatus(err.message);
    } finally {
      cloneBtn.disabled = false;
    }
  });
  container.appendChild(cloneBtn);
  const items = [
    { type: 'routine', source: 'Morning Routine (Example)', label: 'Morning Routine' },
    { type: 'routine', source: 'Evening Routine (Example)', label: 'Evening Routine' },
    { type: 'routine', source: 'Bedtime Routine (Example)', label: 'Bedtime Routine' },
    { type: 'habit', source: 'Creative Practice (Example)', label: 'Creative Practice Habit' },
    { type: 'habit', source: 'Morning Check-In (Example)', label: 'Morning Check-In Habit' },
  ];
  const selections = new Set();
  const grid = document.createElement('div');
  grid.className = 'items-grid';
  items.forEach(item => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', ()=> {
      if (checkbox.checked) selections.add(item);
      else selections.delete(item);
    });
    label.append(checkbox, document.createTextNode(' ' + item.label));
    grid.appendChild(label);
  });
  container.appendChild(grid);
  return {
    async beforeNext(){
      for (const item of selections){
        const newName = `${item.label} (${state.nickname || 'You'})`;
        await copyItem(item.type, item.source, newName);
      }
      if (selections.size){
        ctx.setStatus(`Cloned ${selections.size} example items.`);
      }
      return true;
    }
  };
}

function renderGoalStep(ctx){
  const container = ctx.container;
  container.innerHTML = '';
  const info = document.createElement('p');
  info.textContent = 'Bring goals, commitments, and rewards online with one click.';
  container.appendChild(info);
  const toggles = [
    { key: 'goal', label: 'Learn Guitar Goal Example', type: 'goal', source: 'Learn Guitar Example' },
    { key: 'commitment', label: 'Practice Rhythm Commitment Example', type: 'commitment', source: 'Practice Rhythm Commitment (Example)' },
    { key: 'reward', label: 'Game Break Reward Example', type: 'reward', source: 'Game Break Reward (Example)' },
    { key: 'achievement', label: 'Practice Streak Achievement Example', type: 'achievement', source: 'Practice Streak Achievement (Example)' },
  ];
  const selected = new Set(toggles);
  const grid = document.createElement('div');
  grid.className = 'items-grid';
  toggles.forEach(t => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.addEventListener('change', ()=> {
      if (checkbox.checked) selected.add(t);
      else selected.delete(t);
    });
    label.append(checkbox, document.createTextNode(' ' + t.label));
    grid.appendChild(label);
  });
  container.appendChild(grid);
  return {
    async beforeNext(){
      for (const entry of selected){
        const newName = entry.source.replace('(Example)', `(${state.nickname || 'You'})`).trim();
        await copyItem(entry.type, entry.source, newName);
      }
      if (selected.size){
        ctx.setStatus(`Cloned ${selected.size} long-term items.`);
      }
      return true;
    }
  };
}

function renderPreferencesStep(ctx){
  const container = ctx.container;
  container.innerHTML = '';
  const info = document.createElement('p');
  info.textContent = 'Teach Chronos and any AI copilot how to speak to you.';
  container.appendChild(info);
  const form = document.createElement('div');
  form.className = 'wizard-form';
  Object.keys(state.preferences).forEach(key => {
    const val = state.preferences[key];
    const input = document.createElement('input');
    input.value = String(val);
    input.addEventListener('input', ()=> state.preferences[key] = input.value);
    const label = document.createElement('label');
    label.textContent = key;
    label.appendChild(input);
    form.appendChild(label);
  });
  container.appendChild(form);
  const cliWrap = document.createElement('div');
  cliWrap.className = 'list-card';
  const btn = document.createElement('button');
  btn.textContent = "Run 'today'";
  const output = document.createElement('pre');
  output.style.whiteSpace = 'pre-wrap';
  output.style.maxHeight = '160px';
  output.style.overflow = 'auto';
  btn.addEventListener('click', async ()=>{
    btn.disabled = true;
    try{
      const resp = await runCli('today', []);
      output.textContent = resp.stdout || 'No output.';
    } catch (err){
      output.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
  cliWrap.append(btn, output);
  container.appendChild(cliWrap);
  return {
    async beforeNext(){
      await savePreferences();
      ctx.setStatus('Preferences saved.');
      return true;
    }
  };
}

function renderWrapStep(ctx){
  const container = ctx.container;
  container.innerHTML = '';
  const summary = document.createElement('p');
  summary.textContent = `Nice work, @${state.nickname || 'Pilot'}! Launch the dashboard widgets or re-run this wizard anytime from the menu.`;
  container.appendChild(summary);
  if (state.createdItems.length){
    const list = document.createElement('ul');
    state.createdItems.slice(-8).forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    container.appendChild(list);
  }
  return {};
}

function labelled(text, node){
  const wrap = document.createElement('label');
  wrap.textContent = text;
  wrap.appendChild(node);
  return wrap;
}

const steps = [
  {
    id: 'intro',
    title: 'Welcome',
    async render(ctx){
      if (!state.profile) await loadProfile();
      const container = ctx.container;
      container.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = 'Chronos loves learning who you are. Set your nickname so @nickname matches your vibe.';
      container.appendChild(p);
      const input = document.createElement('input');
      input.value = state.nickname || '';
      container.appendChild(labelled('Nickname', input));
      return {
        async beforeNext(){
          const name = input.value.trim() || 'Pilot';
          await saveProfile(name);
          ctx.setStatus(`Saved nickname ${name}.`);
          return true;
        }
      };
    }
  },
  {
    id: 'categories',
    title: 'Life Categories',
    async render(ctx){
      if (!state.categories.length) await loadCategories();
      return renderCategoryStep(ctx);
    }
  },
  {
    id: 'statuses',
    title: 'Status & Check-In',
    async render(ctx){
      if (!state.statuses.length) await loadStatuses();
      return renderStatusStep(ctx);
    }
  },
  {
    id: 'templates',
    title: 'Templates & Routines',
    async render(ctx){
      return renderTemplateStep(ctx);
    }
  },
  {
    id: 'goals',
    title: 'Goals, Commitments, Rewards',
    async render(ctx){
      return renderGoalStep(ctx);
    }
  },
  {
    id: 'preferences',
    title: 'Preferences & Warm Start',
    async render(ctx){
      if (!Object.keys(state.preferences).length) await loadPreferences();
      return renderPreferencesStep(ctx);
    }
  },
  {
    id: 'wrap',
    title: 'All set',
    async render(ctx){
      return renderWrapStep(ctx);
    }
  },
];

export async function launch(context, options = {}){
  injectStyles();
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.dataset.wizardOverlay = OVERLAY_TAG;

  const shell = document.createElement('div');
  shell.className = 'onboarding-shell';

  const headerWrap = document.createElement('div');
  headerWrap.className = 'onboarding-header';

  const hero = document.createElement('div');
  hero.className = 'onboarding-hero';
  const heroIcon = document.createElement('div');
  heroIcon.className = 'onboarding-hero-icon';
  heroIcon.innerHTML = `
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="2" stroke-opacity="0.35"></circle>
      <path d="M16 36L32 20L48 36" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="M20 40L32 28L44 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"></path>
    </svg>
  `;
  const heroCopy = document.createElement('div');
  heroCopy.className = 'onboarding-hero-copy';
  const heroBadge = document.createElement('div');
  heroBadge.className = 'onboarding-badge';
  heroBadge.textContent = 'Chronos Engine';
  const heroTitle = document.createElement('h1');
  heroTitle.textContent = 'Flight Deck Onboarding';
  const heroSubtitle = document.createElement('p');
  heroSubtitle.textContent = 'Tune nickname, categories, statuses, and templates in one guided flow.';
  const progress = document.createElement('div');
  progress.className = 'onboarding-progress';
  heroCopy.append(heroBadge, heroTitle, heroSubtitle, progress);
  hero.append(heroIcon, heroCopy);

  const stepper = document.createElement('div');
  stepper.className = 'onboarding-stepper';
  const stepperButtons = [];
  steps.forEach((step, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stepper-node';
    const index = document.createElement('span');
    index.className = 'step-index';
    index.textContent = String(idx + 1);
    const label = document.createElement('span');
    label.className = 'stepper-title';
    label.textContent = step.title;
    btn.append(index, label);
    btn.addEventListener('click', ()=> {
      if (idx <= stepIndex){
        stepIndex = idx;
        loadStep();
      }
    });
    stepper.appendChild(btn);
    stepperButtons.push(btn);
  });

  headerWrap.append(hero, stepper);

  const content = document.createElement('div');
  content.className = 'onboarding-content';
  const body = document.createElement('div');
  body.className = 'onboarding-body';
  content.appendChild(body);

  const statusLine = document.createElement('div');
  statusLine.className = 'wizard-status-line';
  const actions = document.createElement('div');
  actions.className = 'onboarding-actions';
  const actionsLeft = document.createElement('div');
  actionsLeft.className = 'action-group';
  const actionsRight = document.createElement('div');
  actionsRight.className = 'action-group';
  const backBtn = document.createElement('button');
  backBtn.className = 'ghost';
  backBtn.textContent = 'Back';
  const skipBtn = document.createElement('button');
  skipBtn.className = 'ghost subtle';
  skipBtn.textContent = 'Skip Step';
  const nextBtn = document.createElement('button');
  nextBtn.className = 'primary';
  nextBtn.textContent = 'Next';
  actionsLeft.append(backBtn, skipBtn);
  actionsRight.append(nextBtn);
  actions.append(actionsLeft, actionsRight);

  const footer = document.createElement('div');
  footer.className = 'onboarding-footer';
  footer.append(statusLine, actions);

  shell.append(headerWrap, content, footer);
  overlay.appendChild(shell);
  document.body.appendChild(overlay);
  const helpBtn = context?.createHelpButton?.('Onboarding', {
    className: 'wizard-help-btn icon-btn help-btn',
    fallbackLabel: 'Chronos Onboarding Wizard'
  });
  if (helpBtn) {
    helpBtn.classList.add('wizard-help-btn');
    shell.appendChild(helpBtn);
  }

  if (context?.bus){
    try { context.bus.emit('wizard:opened', { wizard: options?.wizard }); } catch {}
  }

  let stepIndex = 0;
  let currentHooks = null;

  const ctx = {
    container: body,
    setStatus(msg){ statusLine.textContent = msg || ''; },
  };

  function syncStepper(){
    stepperButtons.forEach((btn, idx) => {
      btn.classList.toggle('active', idx === stepIndex);
      btn.classList.toggle('completed', idx < stepIndex);
    });
    progress.textContent = `Step ${stepIndex + 1} of ${steps.length} · ${steps[stepIndex].title}`;
  }

  async function loadStep(){
    ctx.setStatus('');
    if (currentHooks && typeof currentHooks.cleanup === 'function'){
      try { currentHooks.cleanup(); } catch {}
    }
    syncStepper();
    const step = steps[stepIndex];
    nextBtn.textContent = stepIndex === steps.length - 1 ? 'Finish' : 'Next';
    skipBtn.style.display = stepIndex === steps.length - 1 ? 'none' : '';
    backBtn.disabled = stepIndex === 0;
    currentHooks = await step.render(ctx);
  }

  async function goNext(skip=false){
    if (!skip && currentHooks?.beforeNext){
      const ok = await currentHooks.beforeNext();
      if (ok === false) return;
    }
    if (stepIndex < steps.length - 1){
      stepIndex += 1;
      await loadStep();
    } else {
      overlay.remove();
    }
  }
  async function goBack(){
    if (stepIndex === 0) return;
    stepIndex -= 1;
    await loadStep();
  }

  backBtn.addEventListener('click', ()=> goBack());
  skipBtn.addEventListener('click', ()=> goNext(true));
  nextBtn.addEventListener('click', ()=> goNext(false));
  overlay.addEventListener('click', (ev)=> { if (ev.target === overlay) overlay.remove(); });

  await loadStep();
}
