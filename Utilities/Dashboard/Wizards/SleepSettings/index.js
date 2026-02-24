const OVERLAY_TAG = 'chronos-sleep-hygiene-wizard';
let contextRef = null;
let stylesInjected = false;

const DAY_LIST = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const state = {
  step: 0,
  mode: 'monophasic',
  bedtime: '22:00',
  wake: '06:00',
  splits: 3,
  sleepIn: true,
  applyMode: 'selected',
  hygiene: {
    mealBufferHours: 3,
    screenCutoffMinutes: 60,
    caffeineCutoffHours: 8,
    blackoutRoom: true,
  },
  status: '',
};

function apiBase() {
  const o = window.location?.origin;
  if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
  return o;
}

async function apiRequest(path, { method = 'GET', body } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const resp = await fetch(apiBase() + path, opts);
  const text = await resp.text();
  let data = text;
  try { data = JSON.parse(text); } catch { }
  if (!resp.ok || (data && data.ok === false)) {
    const err = (data && (data.error || data.stderr)) || text || `HTTP ${resp.status}`;
    throw new Error(err);
  }
  return data;
}

function defaultDays() { return DAY_LIST.map(d => d.key); }

function parseTimeToMinutes(value) {
  if (!value) return null;
  const parts = String(value).split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function addMinutes(time, delta) {
  const start = parseTimeToMinutes(time);
  if (start === null) return time;
  const total = (start + delta + 1440) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function buildDraftBlocks() {
  const allDays = defaultDays();
  if (state.mode === 'biphasic') {
    const blocks = [
      { label: 'Core Sleep', start: state.bedtime, end: state.wake, days: allDays, sleep: true },
      { label: 'Second Sleep', start: '14:00', end: '15:00', days: allDays, sleep: true },
    ];
    if (state.sleepIn) {
      blocks.push({ label: 'Sleep In', start: addMinutes(state.bedtime, 60), end: addMinutes(state.wake, 120), days: ['sat', 'sun'], sleep: true });
    }
    return blocks;
  }
  if (state.mode === 'polyphasic') {
    const count = Math.max(3, Math.min(6, parseInt(state.splits || 3, 10) || 3));
    return Array.from({ length: count }).map((_, i) => {
      const start = addMinutes('00:00', i * Math.floor(1440 / count));
      const end = addMinutes(start, 90);
      return { label: `Sleep ${i + 1}`, start, end, days: allDays, sleep: true };
    });
  }
  const mono = [{ label: 'Core Sleep', start: state.bedtime, end: state.wake, days: allDays, sleep: true }];
  if (state.sleepIn) {
    mono.push({ label: 'Sleep In', start: addMinutes(state.bedtime, 60), end: addMinutes(state.wake, 120), days: ['sat', 'sun'], sleep: true });
  }
  return mono;
}

async function itemExists(type, name) {
  try {
    await apiRequest(`/api/item?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`);
    return true;
  } catch {
    return false;
  }
}

async function createExampleBedtimePack() {
  const pack = [
    {
      type: 'microroutine',
      name: 'Sleep Hygiene - Last Meal Buffer',
      data: {
        name: 'Sleep Hygiene - Last Meal Buffer',
        type: 'microroutine',
        duration: 10,
        category: 'sleep',
        sleep: true,
        tags: ['sleep', 'hygiene', 'bedtime'],
        description: `Finish your final meal at least ${state.hygiene.mealBufferHours} hour(s) before bed.`,
      },
    },
    {
      type: 'microroutine',
      name: 'Sleep Hygiene - Digital Sunset',
      data: {
        name: 'Sleep Hygiene - Digital Sunset',
        type: 'microroutine',
        duration: 15,
        category: 'sleep',
        sleep: true,
        tags: ['sleep', 'hygiene', 'bedtime'],
        description: `No screens for ${state.hygiene.screenCutoffMinutes} minute(s) before bed.`,
      },
    },
    {
      type: 'microroutine',
      name: 'Sleep Hygiene - Blackout Setup',
      data: {
        name: 'Sleep Hygiene - Blackout Setup',
        type: 'microroutine',
        duration: 10,
        category: 'sleep',
        sleep: true,
        tags: ['sleep', 'hygiene', 'bedtime'],
        description: state.hygiene.blackoutRoom
          ? 'Darken room fully, cool the space, reduce noise.'
          : 'Prepare room for consistent low-light wind-down.',
      },
    },
  ];

  let created = 0;
  let skipped = 0;
  for (const entry of pack) {
    if (await itemExists(entry.type, entry.name)) {
      skipped += 1;
      continue;
    }
    await apiRequest('/api/item', {
      method: 'POST',
      body: { type: entry.type, name: entry.name, data: entry.data },
    });
    created += 1;
  }

  const routineName = 'Bedtime Routine (Sleep Hygiene)';
  if (!(await itemExists('routine', routineName))) {
    await apiRequest('/api/item', {
      method: 'POST',
      body: {
        type: 'routine',
        name: routineName,
        data: {
          name: routineName,
          type: 'routine',
          category: 'sleep',
          sleep: true,
          tags: ['sleep', 'hygiene', 'bedtime'],
          description: 'Example routine generated by Sleep Hygiene Wizard.',
          children: pack.map(p => ({ type: p.type, name: p.name })),
        },
      },
    });
    created += 1;
  } else {
    skipped += 1;
  }

  return { created, skipped };
}

function injectStyles() {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.textContent = `
    .sleepwiz2-overlay { position: fixed; inset: 0; z-index: 1200; display:flex; align-items:center; justify-content:center; background: var(--chronos-overlay-gradient); backdrop-filter: var(--chronos-overlay-blur); padding: 20px; }
    .sleepwiz2-shell { width: min(920px, 96vw); max-height: 92vh; overflow:auto; background: var(--chronos-surface-strong); border:1px solid var(--chronos-border-strong); border-radius: 18px; box-shadow: 0 22px 64px rgba(0,0,0,0.55); color: var(--chronos-text); padding: 16px; display:flex; flex-direction:column; gap:12px; position: relative; }
    .sleepwiz2-title { margin:0; font-size: 24px; }
    .sleepwiz2-sub { margin:0; color: var(--chronos-text-muted); }
    .sleepwiz2-chat { display:flex; flex-direction:column; gap:8px; }
    .sleepwiz2-msg { border:1px solid var(--chronos-border); border-radius: 12px; padding: 10px; background: var(--chronos-surface-soft); }
    .sleepwiz2-msg.agent { border-color: rgba(122,162,247,0.35); }
    .sleepwiz2-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
    .sleepwiz2-input { border:1px solid var(--chronos-border); border-radius:8px; padding:7px 9px; background: rgba(8,12,22,0.8); color: var(--chronos-text); }
    .sleepwiz2-btn { border:1px solid var(--chronos-border); border-radius:8px; padding:7px 10px; background: rgba(255,255,255,0.05); color: var(--chronos-text); cursor: pointer; }
    .sleepwiz2-btn.primary { background: var(--chronos-accent-gradient); color:#fff; border-color: rgba(122,162,247,0.45); }
    .sleepwiz2-footer { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; }
    .sleepwiz2-status { font-size:12px; color: var(--chronos-text-muted); min-height:18px; }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function closeWizard() {
  const current = document.querySelector(`[data-wizard-overlay="${OVERLAY_TAG}"]`);
  if (current) current.remove();
}

function openSleepWidgetWithDraft() {
  const draft = {
    mode: state.mode,
    splits: state.splits,
    blocks: buildDraftBlocks(),
    applyMode: state.applyMode,
    hygiene: { ...state.hygiene },
  };
  try { window.__chronosSleepWizardDraft = draft; } catch { }
  try { window.ChronosBus?.emit?.('widget:show', 'SleepSettings'); } catch { }
}

function renderStepContent(root) {
  root.innerHTML = '';

  const chat = createEl('div', 'sleepwiz2-chat');
  const say = (text) => {
    const msg = createEl('div', 'sleepwiz2-msg agent', text);
    chat.appendChild(msg);
  };

  if (state.step === 0) {
    say('Let\'s shape your sleep schedule. What pattern feels closest right now?');
    const row = createEl('div', 'sleepwiz2-row');
    ['monophasic', 'biphasic', 'polyphasic'].forEach(mode => {
      const btn = createEl('button', 'sleepwiz2-btn', mode);
      btn.addEventListener('click', () => {
        state.mode = mode;
        state.step = 1;
        render();
      });
      row.appendChild(btn);
    });
    chat.appendChild(row);
  } else if (state.step === 1) {
    say('What bedtime and wake time should we start from?');
    const row = createEl('div', 'sleepwiz2-row');
    const bed = document.createElement('input');
    bed.type = 'time';
    bed.className = 'sleepwiz2-input';
    bed.value = state.bedtime;
    const wake = document.createElement('input');
    wake.type = 'time';
    wake.className = 'sleepwiz2-input';
    wake.value = state.wake;
    const next = createEl('button', 'sleepwiz2-btn primary', 'Looks good');
    next.addEventListener('click', () => {
      state.bedtime = bed.value || state.bedtime;
      state.wake = wake.value || state.wake;
      state.step = 2;
      render();
    });
    row.append(createEl('span', null, 'Bedtime'), bed, createEl('span', null, 'Wake'), wake, next);
    chat.appendChild(row);
  } else if (state.step === 2) {
    say('Do you want a weekend sleep-in block?');
    const row = createEl('div', 'sleepwiz2-row');
    const yes = createEl('button', 'sleepwiz2-btn', 'Yes');
    yes.addEventListener('click', () => { state.sleepIn = true; state.step = 3; render(); });
    const no = createEl('button', 'sleepwiz2-btn', 'No');
    no.addEventListener('click', () => { state.sleepIn = false; state.step = 3; render(); });
    row.append(yes, no);
    chat.appendChild(row);

    if (state.mode === 'polyphasic') {
      const poly = createEl('div', 'sleepwiz2-row');
      poly.append(createEl('span', null, 'Polyphasic splits'));
      const splits = document.createElement('input');
      splits.type = 'number';
      splits.className = 'sleepwiz2-input';
      splits.min = '3';
      splits.max = '6';
      splits.value = String(state.splits);
      splits.addEventListener('input', () => { state.splits = Math.max(3, Math.min(6, Number(splits.value) || 3)); });
      poly.appendChild(splits);
      chat.appendChild(poly);
    }
  } else if (state.step === 3) {
    say('Now let\'s optimize sleep hygiene habits.');
    const box = createEl('div', 'sleepwiz2-msg');

    const meal = createEl('div', 'sleepwiz2-row');
    meal.append(createEl('span', null, 'Last meal before bed (hours)'));
    const mealInput = document.createElement('input');
    mealInput.type = 'number';
    mealInput.className = 'sleepwiz2-input';
    mealInput.min = '1';
    mealInput.max = '6';
    mealInput.value = String(state.hygiene.mealBufferHours);
    mealInput.addEventListener('input', () => { state.hygiene.mealBufferHours = Math.max(1, Math.min(6, Number(mealInput.value) || 3)); });
    meal.appendChild(mealInput);

    const screen = createEl('div', 'sleepwiz2-row');
    screen.append(createEl('span', null, 'No screen time before bed (minutes)'));
    const screenInput = document.createElement('input');
    screenInput.type = 'number';
    screenInput.className = 'sleepwiz2-input';
    screenInput.min = '15';
    screenInput.max = '180';
    screenInput.value = String(state.hygiene.screenCutoffMinutes);
    screenInput.addEventListener('input', () => { state.hygiene.screenCutoffMinutes = Math.max(15, Math.min(180, Number(screenInput.value) || 60)); });
    screen.appendChild(screenInput);

    const caffeine = createEl('div', 'sleepwiz2-row');
    caffeine.append(createEl('span', null, 'Caffeine cutoff before bed (hours)'));
    const caffeineInput = document.createElement('input');
    caffeineInput.type = 'number';
    caffeineInput.className = 'sleepwiz2-input';
    caffeineInput.min = '4';
    caffeineInput.max = '14';
    caffeineInput.value = String(state.hygiene.caffeineCutoffHours);
    caffeineInput.addEventListener('input', () => { state.hygiene.caffeineCutoffHours = Math.max(4, Math.min(14, Number(caffeineInput.value) || 8)); });
    caffeine.appendChild(caffeineInput);

    const blackout = createEl('label', 'sleepwiz2-row');
    const blackoutInput = document.createElement('input');
    blackoutInput.type = 'checkbox';
    blackoutInput.checked = !!state.hygiene.blackoutRoom;
    blackoutInput.addEventListener('change', () => { state.hygiene.blackoutRoom = blackoutInput.checked; });
    blackout.append(blackoutInput, document.createTextNode('Blackout room at bedtime'));

    const next = createEl('button', 'sleepwiz2-btn primary', 'Continue');
    next.addEventListener('click', () => { state.step = 4; render(); });

    box.append(meal, screen, caffeine, blackout, next);
    chat.appendChild(box);
  } else if (state.step === 4) {
    say('Where should I apply these sleep anchors?');
    const row = createEl('div', 'sleepwiz2-row');
    ['selected', 'all', 'new'].forEach(m => {
      const btn = createEl('button', `sleepwiz2-btn${state.applyMode === m ? ' primary' : ''}`, m === 'selected' ? 'Selected templates' : m === 'all' ? 'All templates' : 'New template');
      btn.addEventListener('click', () => {
        state.applyMode = m;
        render();
      });
      row.appendChild(btn);
    });
    chat.appendChild(row);

    const summary = createEl('div', 'sleepwiz2-msg');
    const blocks = buildDraftBlocks();
    summary.textContent = `Draft ready: ${blocks.length} sleep block(s). Hygiene defaults: meal ${state.hygiene.mealBufferHours}h, screens ${state.hygiene.screenCutoffMinutes}m, caffeine ${state.hygiene.caffeineCutoffHours}h, blackout ${state.hygiene.blackoutRoom ? 'on' : 'off'}.`;
    chat.appendChild(summary);

    const makePack = createEl('button', 'sleepwiz2-btn', 'Create Example Bedtime Microroutines');
    makePack.addEventListener('click', async () => {
      try {
        state.status = 'Creating bedtime examples...';
        render();
        const result = await createExampleBedtimePack();
        state.status = `Created ${result.created}, skipped ${result.skipped}.`;
        render();
      } catch (err) {
        state.status = `Example creation failed: ${err.message}`;
        render();
      }
    });
    chat.appendChild(makePack);

    const open = createEl('button', 'sleepwiz2-btn primary', 'Open Sleep Settings Widget With This Draft');
    open.addEventListener('click', () => {
      openSleepWidgetWithDraft();
      closeWizard();
    });
    chat.appendChild(open);
  }

  root.appendChild(chat);
}

function render() {
  const overlay = document.querySelector(`[data-wizard-overlay="${OVERLAY_TAG}"]`);
  if (!overlay) return;
  overlay.innerHTML = '';

  const shell = createEl('div', 'sleepwiz2-shell chronos-wizard-shell');
  const h1 = createEl('h1', 'sleepwiz2-title', 'Sleep Hygiene Wizard');
  const sub = createEl('p', 'sleepwiz2-sub', 'Guided setup with optimization habits and bedtime routine examples.');
  const body = createEl('div');
  renderStepContent(body);

  const footer = createEl('div', 'sleepwiz2-footer');
  const left = createEl('div', 'sleepwiz2-row');
  const back = createEl('button', 'sleepwiz2-btn', 'Back');
  back.disabled = state.step === 0;
  back.addEventListener('click', () => {
    state.step = Math.max(0, state.step - 1);
    render();
  });
  const close = createEl('button', 'sleepwiz2-btn', 'Close');
  close.addEventListener('click', closeWizard);
  left.append(back, close);

  const defaultStatus = state.step < 4 ? 'Progressing through guided setup...' : 'Ready to open widget and/or create examples.';
  const status = createEl('div', 'sleepwiz2-status', state.status || defaultStatus);

  footer.append(left, status);

  const helpBtn = contextRef?.createHelpButton?.('SleepSettings', {
    className: 'wizard-help-btn icon-btn help-btn',
    fallbackLabel: 'Sleep Hygiene Wizard',
  });
  if (helpBtn) shell.appendChild(helpBtn);

  shell.append(h1, sub, body, footer);
  overlay.appendChild(shell);
}

export async function launch(context) {
  contextRef = context;
  state.step = 0;
  state.status = '';
  injectStyles();

  const overlay = document.createElement('div');
  overlay.className = 'sleepwiz2-overlay chronos-wizard-overlay';
  overlay.dataset.wizardOverlay = OVERLAY_TAG;
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) closeWizard(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeWizard();
  }, { once: true });

  document.body.appendChild(overlay);
  render();
}
