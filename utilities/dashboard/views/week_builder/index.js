export async function mount(el, context) {
  const WEEKDAYS = [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' },
  ];

  const state = {
    templateName: '',
    rows: WEEKDAYS.map((day) => ({ ...day, templateName: '' })),
    dayTemplates: [],
    dayTemplateMap: {},
  };

  const apiBase = () => {
    const origin = window.location.origin;
    return (!origin || origin === 'null' || origin.startsWith('file:')) ? 'http://127.0.0.1:7357' : origin;
  };
  const emit = (kind, message) => { try { context?.bus?.emit(`toast:${kind}`, message); } catch {} };
  const jget = async (path) => (await fetch(apiBase() + path)).json();
  const jpost = async (path, body) => {
    const response = await fetch(apiBase() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: response.ok && (!json || json.ok !== false), json, text };
  };
  const yparse = (txt) => {
    try {
      if (typeof window.parseYaml === 'function') return window.parseYaml(String(txt || ''));
    } catch {}
    return null;
  };
  const parseLooseMap = (txt) => {
    const out = {};
    String(txt || '').split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const idx = line.indexOf(':');
      if (idx <= 0) return;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!key) return;
      if (/^(true|false)$/i.test(value)) out[key] = /^true$/i.test(value);
      else if (/^-?\d+(\.\d+)?$/.test(value)) out[key] = Number(value);
      else out[key] = value;
    });
    return out;
  };

  const emptyRows = () => WEEKDAYS.map((day) => ({ ...day, templateName: '' }));
  const dayLabel = (token) => {
    const match = WEEKDAYS.find((day) => day.key === String(token || '').trim().toLowerCase());
    return match ? match.label : String(token || '').trim();
  };
  const normalizeDayTokens = (raw) => {
    let tokens = [];
    if (Array.isArray(raw)) tokens = raw;
    else if (typeof raw === 'string') tokens = raw.replace(/\//g, ',').split(',');
    return tokens
      .map((value) => String(value || '').trim().toLowerCase())
      .filter((value) => WEEKDAYS.some((day) => day.key === value));
  };

  el.innerHTML = `
    <style>
      .wb{display:grid;grid-template-columns:minmax(520px,1fr) minmax(300px,360px);gap:10px;height:100%;min-height:0;color:var(--chronos-text,var(--text,#e6e8ef))}
      .c{border:1px solid var(--chronos-border,var(--border,rgba(255,255,255,.12)));border-radius:12px;padding:10px;background:var(--chronos-surface,var(--panel,rgba(15,17,21,.86)));display:flex;flex-direction:column;min-height:0}
      .r{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      .title{font-weight:700;font-size:14px}
      .sub{font-size:12px;color:var(--chronos-text-muted,var(--text-dim,#9aa4b7))}
      .toolbar{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px}
      .group{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:7px 8px;border:1px solid var(--chronos-border,var(--border,#2b3343));border-radius:10px;background:var(--chronos-surface-soft,rgba(255,255,255,.03))}
      .group.grow{flex:1 1 360px}
      .glabel{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--chronos-text-muted,var(--text-dim,#9aa4b7));padding-right:2px}
      .in,.sel,.ta{border:1px solid var(--chronos-border,var(--border,rgba(255,255,255,.14)));border-radius:8px;background:var(--chronos-surface-soft,rgba(255,255,255,.04));color:var(--chronos-text,var(--text,#e6e8ef));-webkit-text-fill-color:var(--chronos-text,var(--text,#e6e8ef));padding:7px 8px}
      .in:focus,.sel:focus,.ta:focus{outline:none;border-color:var(--chronos-accent,var(--accent,#7aa2f7));box-shadow:0 0 0 2px color-mix(in srgb, var(--chronos-accent,var(--accent,#7aa2f7)) 22%, transparent)}
      .sel option{background:var(--chronos-bg,var(--panel,#0f141d));color:var(--chronos-text,var(--text,#e6e8ef))}
      .ta{min-height:68px;resize:vertical;font-family:Consolas,monospace;font-size:12px}
      .f{display:flex;flex-direction:column;gap:4px}
      .f label{font-size:12px;color:var(--chronos-text-muted,var(--text-dim,#9aa4b7))}
      .slots{display:flex;flex-direction:column;gap:8px;overflow:auto;min-height:0}
      .slot{border:1px solid var(--chronos-border,var(--border,rgba(255,255,255,.12)));border-radius:12px;padding:10px;background:var(--chronos-surface-soft,rgba(255,255,255,.02));display:flex;flex-direction:column;gap:6px}
      .slot.bad{border-color:#f59e0b;background:color-mix(in srgb, #f59e0b 10%, transparent)}
      .slot.good{border-color:color-mix(in srgb, var(--chronos-accent,var(--accent,#7aa2f7)) 38%, var(--chronos-border,var(--border,#2b3343)))}
      .slot-head{display:flex;justify-content:space-between;gap:8px;align-items:center}
      .slot-day{font-size:13px;font-weight:700}
      .slot-state{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--chronos-text-muted,var(--text-dim,#9aa4b7))}
      .slot-state.bad{color:#f59e0b}
      .slot-state.good{color:#86efac}
      .slot-actions{display:flex;gap:6px;flex-wrap:wrap}
      .meta{font-size:11px;color:var(--chronos-text-muted,var(--text-dim,#9aa4b7))}
      .btn{border:1px solid var(--chronos-border,var(--border,rgba(255,255,255,.14)));border-radius:8px;background:var(--chronos-surface-soft,rgba(255,255,255,.06));color:var(--chronos-text,var(--text,#e6e8ef));padding:7px 10px;cursor:pointer;font-size:12px}
      .btn:hover{border-color:var(--chronos-accent,var(--accent,#7aa2f7))}
      .btn.p{border-color:var(--chronos-accent,var(--accent,#7aa2f7));background:var(--chronos-accent-soft,rgba(122,162,247,.2))}
      .mini{padding:5px 8px;font-size:11px}
      .summary{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px}
      @media (max-width:1080px){.wb{grid-template-columns:1fr}}
    </style>
    <div class="wb">
      <section class="c" id="main"></section>
      <section class="c" id="side"></section>
    </div>
  `;

  const main = el.querySelector('#main');
  const side = el.querySelector('#side');

  main.innerHTML = `
    <div class="r" style="justify-content:space-between">
      <div class="title">Week Builder</div>
      <div class="sub">Seven day-template slots</div>
    </div>
    <div class="toolbar">
      <div class="group grow">
        <span class="glabel">Template</span>
        <select id="wName" class="sel" style="min-width:220px;flex:1 1 240px"></select>
        <button id="wLoad" class="btn">Load</button>
        <button id="wSave" class="btn p">Save</button>
        <button id="wSaveAs" class="btn">Save As</button>
        <button id="wNew" class="btn">New</button>
        <button id="wRename" class="btn">Rename</button>
        <button id="wDelete" class="btn">Delete</button>
        <button id="wRefresh" class="btn">Refresh</button>
      </div>
    </div>
    <div class="toolbar">
      <div class="group grow">
        <span class="glabel">Quick Fill</span>
        <select id="fillTemplate" class="sel" style="min-width:220px;flex:1 1 220px"></select>
        <button id="fillAll" class="btn">All 7</button>
        <button id="fillWeekdays" class="btn">Mon-Fri</button>
        <button id="fillWeekend" class="btn">Weekend</button>
        <button id="clearWeek" class="btn">Clear</button>
      </div>
      <div class="group">
        <span class="glabel">Checks</span>
        <button id="validate" class="btn">Validate</button>
        <button id="copy" class="btn">Copy JSON</button>
      </div>
    </div>
    <div class="summary">
      <div id="summaryText" class="sub"></div>
      <div id="valMsg" class="sub"></div>
    </div>
    <div id="weekSlots" class="slots"></div>
  `;

  side.innerHTML = `
    <div class="title">Inspector</div>
    <div class="sub">Week template properties</div>
    <div class="f"><label>Category</label><select id="pCategory" class="sel"><option value="">(none)</option></select></div>
    <div class="f"><label>Tags (comma)</label><input id="pTags" class="in" /></div>
    <div class="f"><label>Notes</label><textarea id="pNotes" class="ta"></textarea></div>
    <div class="f"><label>Status Requirements (YAML map)</label><textarea id="pStatus" class="ta" placeholder="energy: high&#10;focus: medium"></textarea></div>
    <div class="f"><label>Extra Props (YAML map)</label><textarea id="pExtra" class="ta"></textarea></div>
  `;

  const weekName = el.querySelector('#wName');
  const fillTemplate = el.querySelector('#fillTemplate');
  const weekSlots = el.querySelector('#weekSlots');
  const summaryText = el.querySelector('#summaryText');
  const valMsg = el.querySelector('#valMsg');
  const pCategory = el.querySelector('#pCategory');

  const ensureCategoryOption = (value) => {
    const clean = String(value || '').trim();
    if (!clean) return;
    const exists = Array.from(pCategory.options || []).some((option) => String(option.value || '').toLowerCase() === clean.toLowerCase());
    if (exists) return;
    const option = document.createElement('option');
    option.value = clean;
    option.textContent = clean;
    pCategory.appendChild(option);
  };

  const parseCategoryOptions = (payload) => {
    const source = payload?.Category_Settings || payload?.category_settings || payload?.categories || payload;
    if (!source) return [];
    const out = [];
    if (Array.isArray(source)) {
      source.forEach((row) => {
        if (typeof row === 'string') {
          const label = row.trim();
          if (label) out.push({ value: label, label, order: 999 });
          return;
        }
        if (!row || typeof row !== 'object') return;
        const label = String(row.name || row.Name || row.value || row.Value || row.category || row.Category || '').trim();
        if (!label) return;
        const order = Number(row.order || row.Order || row.value_rank || row.Value || 999);
        out.push({ value: label, label, order: Number.isFinite(order) ? order : 999 });
      });
    } else if (typeof source === 'object') {
      Object.entries(source).forEach(([name, meta]) => {
        const label = String(name || '').trim();
        if (!label) return;
        const order = Number(meta?.value ?? meta?.Value ?? meta?.order ?? meta?.Order ?? 999);
        out.push({ value: label, label, order: Number.isFinite(order) ? order : 999 });
      });
    }
    return out.sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label));
  };

  const loadCategoryOptions = async () => {
    const files = ['category_settings.yml', 'Category_Settings.yml'];
    let options = [];
    for (const file of files) {
      try {
        const payload = await jget(`/api/settings?file=${encodeURIComponent(file)}`);
        options = parseCategoryOptions(payload?.data || {});
        if (options.length) break;
      } catch {}
    }
    const keep = String(pCategory.value || '').trim();
    pCategory.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '(none)';
    pCategory.appendChild(none);
    options.forEach((row) => {
      const option = document.createElement('option');
      option.value = row.value;
      option.textContent = row.label;
      pCategory.appendChild(option);
    });
    if (keep) ensureCategoryOption(keep);
    pCategory.value = keep;
  };

  const getTemplateProps = () => {
    const category = String(pCategory.value || '').trim();
    const tagsRaw = String(el.querySelector('#pTags').value || '').trim();
    const notes = String(el.querySelector('#pNotes').value || '').trim();
    const statusRaw = String(el.querySelector('#pStatus').value || '').trim();
    const extraRaw = String(el.querySelector('#pExtra').value || '').trim();
    const out = {};
    if (category) out.category = category;
    if (notes) out.notes = notes;
    if (tagsRaw) {
      const tags = tagsRaw.split(',').map((value) => value.trim()).filter(Boolean);
      if (tags.length) out.tags = tags;
    }
    if (statusRaw) {
      const parsed = yparse(statusRaw);
      out.status_requirements = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : parseLooseMap(statusRaw);
    }
    if (extraRaw) {
      const parsed = yparse(extraRaw);
      Object.assign(out, (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : parseLooseMap(extraRaw));
    }
    return out;
  };

  const setTemplateProps = (template) => {
    const category = String(template?.category || '').trim();
    if (category) ensureCategoryOption(category);
    pCategory.value = category;
    el.querySelector('#pTags').value = Array.isArray(template?.tags) ? template.tags.join(', ') : '';
    el.querySelector('#pNotes').value = String(template?.notes || template?.description || '');
    const statusReqs = template?.status_requirements && typeof template.status_requirements === 'object'
      ? Object.entries(template.status_requirements).map(([key, value]) => `${key}: ${value}`).join('\n')
      : '';
    el.querySelector('#pStatus').value = statusReqs;
    el.querySelector('#pExtra').value = '';
  };

  const summarizeDayTemplate = (template, fallbackName) => {
    const name = String(template?.name || fallbackName || '').trim();
    const daysTokens = normalizeDayTokens(template?.days);
    const category = String(template?.category || '').trim();
    const notes = String(template?.notes || template?.description || '').trim();
    const statusRequirements = template?.status_requirements && typeof template.status_requirements === 'object'
      ? template.status_requirements
      : {};
    return {
      name,
      category,
      notes,
      daysTokens,
      daysLabel: daysTokens.length ? daysTokens.map(dayLabel).join(', ') : 'Any day',
      hasStatusRequirements: Object.keys(statusRequirements).length > 0,
    };
  };

  const setRows = (rows) => {
    state.rows = WEEKDAYS.map((day, index) => {
      const row = rows[index] || {};
      return { ...day, templateName: String(row.templateName || '').trim() };
    });
  };

  const getRowIssue = (row) => {
    const name = String(row?.templateName || '').trim();
    if (!name) return `${row.label}: choose a day template.`;
    const info = state.dayTemplateMap[name.toLowerCase()];
    if (!info) return `${row.label}: "${name}" no longer exists.`;
    if (info.daysTokens.length && !info.daysTokens.includes(row.key)) {
      return `${row.label}: "${info.name}" is limited to ${info.daysLabel}.`;
    }
    return '';
  };

  const validateWeek = ({ emitToast = true } = {}) => {
    const issues = state.rows.map((row) => getRowIssue(row)).filter(Boolean);
    const assignedCount = state.rows.filter((row) => String(row.templateName || '').trim()).length;
    summaryText.textContent = `${assignedCount}/7 days assigned`;
    valMsg.textContent = issues.length ? `Issues: ${issues.join(' | ')}` : 'Week template looks valid.';
    if (emitToast) {
      if (issues.length) emit('error', `Week Builder found ${issues.length} issue${issues.length === 1 ? '' : 's'}.`);
      else emit('ok', 'Week template looks valid.');
    }
    return { ok: issues.length === 0, issues };
  };

  const renderFillTemplateOptions = () => {
    const keep = String(fillTemplate.value || '').trim();
    fillTemplate.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Choose day template';
    fillTemplate.appendChild(blank);
    state.dayTemplates.forEach((info) => {
      const option = document.createElement('option');
      option.value = info.name;
      option.textContent = info.name;
      fillTemplate.appendChild(option);
    });
    fillTemplate.value = state.dayTemplateMap[keep.toLowerCase()] ? keep : '';
  };

  const drawWeek = () => {
    weekSlots.innerHTML = '';
    if (!state.dayTemplates.length) {
      weekSlots.innerHTML = '<div class="sub">No day templates found yet. Create some day templates first.</div>';
      summaryText.textContent = '0/7 days assigned';
      valMsg.textContent = 'Create day templates first.';
      return;
    }

    state.rows.forEach((row, index) => {
      const info = state.dayTemplateMap[String(row.templateName || '').trim().toLowerCase()] || null;
      const issue = getRowIssue(row);

      const card = document.createElement('div');
      card.className = `slot ${issue ? 'bad' : (row.templateName ? 'good' : '')}`.trim();

      const head = document.createElement('div');
      head.className = 'slot-head';
      const label = document.createElement('div');
      label.className = 'slot-day';
      label.textContent = row.label;
      const stateBadge = document.createElement('div');
      stateBadge.className = `slot-state ${issue ? 'bad' : (row.templateName ? 'good' : '')}`.trim();
      stateBadge.textContent = issue ? 'Needs Fix' : (row.templateName ? 'Ready' : 'Empty');
      head.append(label, stateBadge);

      const select = document.createElement('select');
      select.className = 'sel';
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '(none)';
      select.appendChild(blank);
      state.dayTemplates.forEach((template) => {
        const option = document.createElement('option');
        option.value = template.name;
        option.textContent = template.name;
        if (template.name === row.templateName) option.selected = true;
        select.appendChild(option);
      });
      select.onchange = () => {
        state.rows[index] = { ...state.rows[index], templateName: String(select.value || '').trim() };
        drawWeek();
      };

      const actions = document.createElement('div');
      actions.className = 'slot-actions';
      const clearBtn = document.createElement('button');
      clearBtn.className = 'btn mini';
      clearBtn.textContent = 'Clear';
      clearBtn.onclick = () => {
        state.rows[index] = { ...state.rows[index], templateName: '' };
        drawWeek();
      };
      const copyPrevBtn = document.createElement('button');
      copyPrevBtn.className = 'btn mini';
      copyPrevBtn.textContent = 'Copy Above';
      copyPrevBtn.disabled = index === 0;
      copyPrevBtn.onclick = () => {
        if (index === 0) return;
        state.rows[index] = { ...state.rows[index], templateName: String(state.rows[index - 1]?.templateName || '').trim() };
        drawWeek();
      };
      actions.append(clearBtn, copyPrevBtn);

      const meta = document.createElement('div');
      meta.className = 'meta';
      if (!row.templateName) {
        meta.textContent = 'No day template assigned.';
      } else if (!info) {
        meta.textContent = `Missing template: ${row.templateName}`;
      } else {
        const parts = [];
        if (info.category) parts.push(info.category);
        parts.push(`Eligible: ${info.daysLabel}`);
        if (info.hasStatusRequirements) parts.push('status rules');
        meta.textContent = parts.join(' • ');
      }

      const note = document.createElement('div');
      note.className = 'sub';
      if (issue) note.textContent = issue;
      else if (info?.notes) note.textContent = info.notes;
      else note.textContent = row.templateName ? 'This day template fits the selected slot.' : 'Assign a day template for this slot.';

      card.append(head, select, actions, meta, note);
      weekSlots.appendChild(card);
    });

    validateWeek({ emitToast: false });
  };

  const loadDayTemplates = async () => {
    try {
      const payload = await jget('/api/template/list?type=day');
      const names = Array.isArray(payload?.templates) ? payload.templates.map((name) => String(name || '').trim()).filter(Boolean) : [];
      const templates = await Promise.all(names.map(async (name) => {
        try {
          const detail = await jget(`/api/template?type=day&name=${encodeURIComponent(name)}`);
          return summarizeDayTemplate(detail?.template || {}, name);
        } catch {
          return summarizeDayTemplate({}, name);
        }
      }));
      templates.sort((a, b) => a.name.localeCompare(b.name));
      state.dayTemplates = templates;
      state.dayTemplateMap = {};
      templates.forEach((template) => { state.dayTemplateMap[template.name.toLowerCase()] = template; });
      renderFillTemplateOptions();
      drawWeek();
    } catch {
      state.dayTemplates = [];
      state.dayTemplateMap = {};
      renderFillTemplateOptions();
      drawWeek();
    }
  };

  const loadWeekTemplateList = async () => {
    try {
      const payload = await jget('/api/template/list?type=week');
      const names = Array.isArray(payload?.templates) ? payload.templates : [];
      weekName.innerHTML = '';
      names.forEach((name) => {
        const option = document.createElement('option');
        option.value = String(name);
        option.textContent = String(name);
        weekName.appendChild(option);
      });
      if (state.templateName && names.includes(state.templateName)) weekName.value = state.templateName;
      if (!state.templateName && names.length) {
        state.templateName = String(names[0] || '');
        weekName.value = state.templateName;
      }
    } catch {
      weekName.innerHTML = '';
    }
  };

  const loadWeekTemplate = async (name) => {
    const clean = String(name || '').trim();
    if (!clean) {
      emit('error', 'Choose a week template first.');
      return;
    }
    try {
      const payload = await jget(`/api/template?type=week&name=${encodeURIComponent(clean)}`);
      if (!payload?.ok) {
        emit('error', payload?.error || 'Failed to load week template.');
        return;
      }
      const children = Array.isArray(payload.children) ? payload.children : [];
      const dayChildren = children.filter((child) => child && typeof child === 'object' && String(child.type || '').trim().toLowerCase() === 'day');
      setRows(dayChildren.slice(0, WEEKDAYS.length).map((child) => ({ templateName: String(child.name || '').trim() })));
      setTemplateProps(payload.template || {});
      state.templateName = clean;
      weekName.value = clean;
      drawWeek();
      if (children.length !== dayChildren.length || dayChildren.length > WEEKDAYS.length) {
        emit('error', `Loaded "${clean}" but ignored unsupported or extra week entries.`);
      } else {
        emit('ok', `Loaded week template: ${clean}`);
      }
    } catch (error) {
      emit('error', `Week template load failed: ${String(error || '')}`);
    }
  };

  const buildWeekChildren = () => state.rows.map((row) => ({
    type: 'day',
    name: String(row.templateName || '').trim(),
  }));

  const saveWeekTemplate = async (saveAs) => {
    let name = String(weekName.value || state.templateName || '').trim();
    if (saveAs || !name) {
      name = String(prompt('Week template name:', name || '') || '').trim();
      if (!name) return false;
    }

    const valid = validateWeek({ emitToast: false });
    if (!valid.ok) {
      emit('error', 'Assign valid day templates for all seven days before saving.');
      return false;
    }

    const saveChildren = buildWeekChildren();
    const childResponse = await jpost('/api/template', { type: 'week', name, children: saveChildren });
    if (!childResponse.ok) {
      emit('error', childResponse?.json?.error || 'Could not save week template children.');
      return false;
    }

    const propsResponse = await jpost('/api/item', { type: 'week', name, properties: getTemplateProps() });
    if (!propsResponse.ok) {
      emit('error', propsResponse?.json?.error || 'Week children saved, but property update failed.');
      return false;
    }

    state.templateName = name;
    await loadWeekTemplateList();
    weekName.value = name;
    emit('ok', `Saved week template: ${name}`);
    return true;
  };

  const newWeekTemplate = async () => {
    const suggested = String(state.templateName || weekName.value || '').trim();
    const name = String(prompt('New week template name:', suggested ? `${suggested} copy` : '') || '').trim();
    if (!name) return;
    const response = await jpost('/api/template', { type: 'week', name, children: [] });
    if (!response.ok) {
      emit('error', response?.json?.error || 'Could not create new week template.');
      return;
    }
    state.templateName = name;
    setRows(emptyRows());
    setTemplateProps({});
    await loadWeekTemplateList();
    weekName.value = name;
    drawWeek();
    emit('ok', `Created new week template: ${name}`);
  };

  const renameWeekTemplate = async () => {
    const oldName = String(weekName.value || state.templateName || '').trim();
    if (!oldName) {
      emit('error', 'Select a week template to rename.');
      return;
    }
    const next = String(prompt('Rename week template to:', oldName) || '').trim();
    if (!next || next === oldName) return;
    const response = await jpost('/api/item/rename', { type: 'week', old_name: oldName, new_name: next });
    if (!response.ok) {
      emit('error', response?.json?.error || 'Rename failed.');
      return;
    }
    state.templateName = next;
    await loadWeekTemplateList();
    weekName.value = next;
    emit('ok', `Renamed week template to "${next}".`);
  };

  const deleteWeekTemplate = async () => {
    const name = String(weekName.value || state.templateName || '').trim();
    if (!name) {
      emit('error', 'Select a week template to delete.');
      return;
    }
    if (!confirm(`Delete week template "${name}"?`)) return;
    const response = await jpost('/api/item/delete', { type: 'week', name });
    if (!response.ok) {
      emit('error', response?.json?.error || 'Delete failed.');
      return;
    }
    if (state.templateName === name) state.templateName = '';
    await loadWeekTemplateList();
    emit('ok', `Deleted week template "${name}".`);
  };

  const fillRows = (indexes) => {
    const name = String(fillTemplate.value || '').trim();
    if (!name) {
      emit('error', 'Choose a day template in Quick Fill first.');
      return;
    }
    indexes.forEach((index) => {
      state.rows[index] = { ...state.rows[index], templateName: name };
    });
    drawWeek();
    emit('ok', `Filled ${indexes.length} slot${indexes.length === 1 ? '' : 's'} with "${name}".`);
  };

  const clearWeek = () => {
    setRows(emptyRows());
    drawWeek();
    emit('ok', 'Cleared week draft.');
  };

  weekName.onchange = () => { state.templateName = String(weekName.value || '').trim(); };
  el.querySelector('#wLoad').onclick = () => loadWeekTemplate(String(weekName.value || state.templateName || '').trim());
  el.querySelector('#wSave').onclick = () => saveWeekTemplate(false);
  el.querySelector('#wSaveAs').onclick = () => saveWeekTemplate(true);
  el.querySelector('#wNew').onclick = () => newWeekTemplate();
  el.querySelector('#wRename').onclick = () => renameWeekTemplate();
  el.querySelector('#wDelete').onclick = () => deleteWeekTemplate();
  el.querySelector('#wRefresh').onclick = async () => {
    await loadDayTemplates();
    await loadWeekTemplateList();
    emit('ok', 'Week Builder lists refreshed.');
  };
  el.querySelector('#fillAll').onclick = () => fillRows([0, 1, 2, 3, 4, 5, 6]);
  el.querySelector('#fillWeekdays').onclick = () => fillRows([0, 1, 2, 3, 4]);
  el.querySelector('#fillWeekend').onclick = () => fillRows([5, 6]);
  el.querySelector('#clearWeek').onclick = () => clearWeek();
  el.querySelector('#validate').onclick = () => validateWeek();
  el.querySelector('#copy').onclick = async () => {
    try {
      const payload = {
        template: {
          name: state.templateName || String(weekName.value || ''),
          properties: getTemplateProps(),
        },
        children: buildWeekChildren(),
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      emit('ok', 'Week Builder draft copied to clipboard.');
    } catch {
      emit('error', 'Could not copy week draft JSON.');
    }
  };

  await loadCategoryOptions();
  await loadDayTemplates();
  await loadWeekTemplateList();
  drawWeek();
}
