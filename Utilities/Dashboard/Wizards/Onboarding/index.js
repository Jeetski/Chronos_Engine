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
      background: rgba(7,10,18,0.82);
      z-index: 1200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      backdrop-filter: blur(6px);
    }
    .onboarding-shell {
      width: min(920px, 95vw);
      max-height: 92vh;
      background: linear-gradient(180deg,#151d2c,#0d121b);
      border: 1px solid #293248;
      border-radius: 18px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.55);
      display: flex;
      flex-direction: column;
      color: #f1f5ff;
      padding: 24px;
      gap: 20px;
    }
    .onboarding-shell h1 {
      margin: 0;
      font-size: 26px;
    }
    .onboarding-shell h2 {
      margin: 0 0 6px;
      font-size: 20px;
      color: #97a6ce;
    }
    .onboarding-progress {
      font-size: 14px;
      letter-spacing: 0.4px;
      color: #8da0d0;
    }
    .onboarding-body {
      flex: 1;
      overflow: auto;
      padding-right: 6px;
    }
    .onboarding-body p {
      color: #b5c2e5;
      line-height: 1.5;
    }
    .onboarding-actions {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .onboarding-actions button {
      border: 1px solid #3c4661;
      border-radius: 10px;
      padding: 10px 18px;
      background: #141a28;
      color: inherit;
      cursor: pointer;
      font-size: 15px;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .onboarding-actions button.primary {
      background: linear-gradient(180deg,#3b64ff,#2849da);
      border-color: #456fff;
    }
    .onboarding-actions button:hover {
      border-color: #53628c;
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
    .wizard-status-line {
      font-size: 13px;
      color: #9ab0ff;
      min-height: 20px;
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
  const header = document.createElement('h1');
  header.textContent = 'Chronos Onboarding';
  const progress = document.createElement('div');
  progress.className = 'onboarding-progress';
  const body = document.createElement('div');
  body.className = 'onboarding-body';
  const statusLine = document.createElement('div');
  statusLine.className = 'wizard-status-line';
  const actions = document.createElement('div');
  actions.className = 'onboarding-actions';
  const backBtn = document.createElement('button');
  backBtn.textContent = 'Back';
  const skipBtn = document.createElement('button');
  skipBtn.textContent = 'Skip Step';
  const nextBtn = document.createElement('button');
  nextBtn.className = 'primary';
  nextBtn.textContent = 'Next';
  actions.append(backBtn, skipBtn, nextBtn);
  shell.append(header, progress, body, statusLine, actions);
  overlay.appendChild(shell);
  document.body.appendChild(overlay);
  if (context?.bus){
    try { context.bus.emit('wizard:opened', { wizard: options?.wizard }); } catch {}
  }

  let stepIndex = 0;
  let currentHooks = null;

  const ctx = {
    container: body,
    setStatus(msg){ statusLine.textContent = msg || ''; },
  };

  async function loadStep(){
    ctx.setStatus('');
    if (currentHooks && typeof currentHooks.cleanup === 'function'){
      try { currentHooks.cleanup(); } catch {}
    }
    const step = steps[stepIndex];
    progress.textContent = `Step ${stepIndex + 1} of ${steps.length}`;
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
