export async function mount(el, context) {
  const TYPES = ['task','habit','routine','subroutine','microroutine','window','timeblock','buffer','break'];
  const ALIAS = { chore: 'habit', habit_stack: 'microroutine', 'habit stack': 'microroutine' };
  const COLORS = { task:'#7aa2f7', habit:'#86efac', routine:'#f59e0b', subroutine:'#f97316', microroutine:'#fb7185', window:'#38bdf8', timeblock:'#c084fc', buffer:'#94a3b8', break:'#22d3ee' };

  const state = {
    palette: [],
    schedule: [],
    selected: -1,
    filterType: '',
    templateName: '',
    history: [],
    future: [],
  };

  const apiBase = () => {
    const o = window.location.origin;
    return (!o || o === 'null' || o.startsWith('file:')) ? 'http://127.0.0.1:7357' : o;
  };
  const emit = (k, m) => { try { context?.bus?.emit(`toast:${k}`, m); } catch {} };
  const jget = async (p) => (await fetch(apiBase() + p)).json();
  const jpost = async (p, body) => {
    const r = await fetch(apiBase() + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
    return { ok: r.ok && (!j || j.ok !== false), j, t };
  };
  const runCli = async (command, args = [], properties = {}) => {
    const propLines = Object.entries(properties || {}).map(([k, v]) => `  ${k}: ${String(v)}`).join('\n');
    const body = `command: ${command}\nargs:\n${(args || []).map((a) => `  - ${String(a)}`).join('\n')}\n${propLines ? `properties:\n${propLines}\n` : ''}`;
    try {
      const r = await fetch(apiBase() + '/api/cli', { method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch {}
      return { ok: r.ok && (!j || j.ok !== false), j, text: t };
    } catch (e) {
      return { ok: false, j: null, text: String(e || '') };
    }
  };
  const readFile = async (p) => { try { const x = await jget(`/api/file/read?path=${encodeURIComponent(p)}`); return x?.ok ? String(x.content || '') : null; } catch { return null; } };
  const yparse = (txt) => { try { if (typeof window.parseYaml === 'function') return window.parseYaml(String(txt || '')); } catch {} return null; };

  const normType = (t) => ALIAS[String(t || '').trim().toLowerCase()] || String(t || '').trim().toLowerCase();
  const hm = (v) => { const m = String(v || '').match(/^(\d{1,2}):(\d{2})$/); if (!m) return null; const h = Number(m[1]), mm = Number(m[2]); if (h < 0 || h > 23 || mm < 0 || mm > 59) return null; return h * 60 + mm; };
  const durFromTimes = (s, e, d = 30) => { const a = hm(s), b = hm(e); return (a == null || b == null || b <= a) ? d : (b - a); };
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const inferDuration = (row) => {
    const d0 = Number(row?.duration || row?.minutes || 0);
    if (Number.isFinite(d0) && d0 > 0) return d0;
    const d1 = Number(row?.estimated_duration || 0);
    if (Number.isFinite(d1) && d1 > 0) return d1;
    if (String(row?.type || '').toLowerCase() === 'break') return 15;
    if (String(row?.type || '').toLowerCase() === 'buffer') return 10;
    return 30;
  };
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const pushHistory = () => {
    state.history.push(clone(state.schedule));
    if (state.history.length > 80) state.history.shift();
    state.future = [];
  };
  const parseLooseMap = (txt) => {
    const o = {}; String(txt || '').split(/\r?\n/).forEach((raw) => {
      const line = raw.trim(); if (!line || line.startsWith('#')) return;
      const i = line.indexOf(':'); if (i <= 0) return;
      const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim(); if (!k) return;
      if (/^(true|false)$/i.test(v)) o[k] = /^true$/i.test(v); else if (/^-?\d+(\.\d+)?$/.test(v)) o[k] = Number(v); else o[k] = v;
    });
    return o;
  };

  el.innerHTML = `
    <style>
      .db{display:grid;grid-template-columns:minmax(260px,310px) minmax(420px,1fr) minmax(280px,360px);gap:10px;height:100%;min-height:0;color:var(--chronos-text,var(--text,#e6e8ef))}
      .c{border:1px solid var(--chronos-border,var(--border,rgba(255,255,255,.12)));border-radius:12px;padding:10px;background:var(--chronos-surface,var(--panel,rgba(15,17,21,.86)));display:flex;flex-direction:column;min-height:0}
      .r{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.title{font-weight:700;font-size:14px}.sub{font-size:12px;color:var(--chronos-text-muted,var(--text-dim,#9aa4b7))}
      .in,.sel,.ta{border:1px solid var(--chronos-border,var(--border,rgba(255,255,255,.14)));border-radius:8px;background:var(--chronos-surface-soft,rgba(255,255,255,.04));color:var(--chronos-text,var(--text,#e6e8ef));-webkit-text-fill-color:var(--chronos-text,var(--text,#e6e8ef));padding:7px 8px}
      .in:focus,.sel:focus,.ta:focus{outline:none;border-color:var(--chronos-accent,var(--accent,#7aa2f7));box-shadow:0 0 0 2px color-mix(in srgb, var(--chronos-accent,var(--accent,#7aa2f7)) 22%, transparent)}
      .in::placeholder,.ta::placeholder{color:var(--chronos-text-muted,var(--text-dim,#9aa4b7))}
      .sel option{background:var(--chronos-bg,var(--panel,#0f141d));color:var(--chronos-text,var(--text,#e6e8ef))}
      #pTypeSelect{background:var(--chronos-surface-soft,rgba(255,255,255,.04));color:var(--chronos-text,var(--text,#e6e8ef));-webkit-text-fill-color:var(--chronos-text,var(--text,#e6e8ef));border-color:var(--chronos-border,var(--border,#2b3343))}
      #pTypeSelect option{background:var(--chronos-bg,var(--panel,#0f141d));color:var(--chronos-text,var(--text,#e6e8ef))}
      .ta{min-height:68px;resize:vertical;font-family:Consolas,monospace;font-size:12px}
      .list{flex:1;overflow:auto;display:flex;flex-direction:column;gap:6px;min-height:0}.item,.blk{border:1px solid var(--chronos-border,var(--border,rgba(255,255,255,.12)));border-radius:10px;padding:8px;background:var(--chronos-surface-soft,rgba(255,255,255,.02))}
      #left{display:flex;flex-direction:column;min-height:0;overflow:hidden}
      #mid{display:flex;flex-direction:column;min-height:0;overflow:hidden}
      #pList{flex:1 1 auto;min-height:0;max-height:none}
      #timeline{flex:1 1 auto;min-height:0;max-height:none}
      .item{cursor:grab}.blk.sel{box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--chronos-accent,var(--accent,#7aa2f7)) 65%, transparent);border-color:var(--chronos-accent,var(--accent,#7aa2f7))}
      .row{display:flex;align-items:center;gap:8px}.dot{width:9px;height:9px;border-radius:50%}.name{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;font-weight:600}.typ{font-size:11px;color:var(--chronos-text-muted,var(--text-dim,#9aa4b7));text-transform:uppercase}
      .meta{font-size:11px;color:var(--chronos-text-muted,var(--text-dim,#9aa4b7));margin-top:4px}.dz{border:1px dashed color-mix(in srgb, var(--chronos-accent,var(--accent,#7aa2f7)) 45%, var(--chronos-border,var(--border,#2b3343)));border-radius:10px;min-height:40px;display:flex;align-items:center;justify-content:center;color:var(--chronos-text-muted,var(--text-dim,#9aa4b7));font-size:12px;background:color-mix(in srgb, var(--chronos-accent-soft,rgba(122,162,247,.18)) 55%, transparent)}
      .dz.a{background:color-mix(in srgb, var(--chronos-accent-soft,rgba(122,162,247,.18)) 95%, transparent);border-color:var(--chronos-accent,var(--accent,#7aa2f7));color:var(--chronos-text,var(--text,#e6e8ef))}
      .btn{border:1px solid var(--chronos-border,var(--border,rgba(255,255,255,.14)));border-radius:8px;background:var(--chronos-surface-soft,rgba(255,255,255,.06));color:var(--chronos-text,var(--text,#e6e8ef));padding:7px 10px;cursor:pointer;font-size:12px}
      .btn:hover{border-color:var(--chronos-accent,var(--accent,#7aa2f7))}
      .btn.p{border-color:var(--chronos-accent,var(--accent,#7aa2f7));background:var(--chronos-accent-soft,rgba(122,162,247,.2))}
      .f{display:flex;flex-direction:column;gap:4px}.f label{font-size:12px;color:var(--chronos-text-muted,var(--text-dim,#9aa4b7))}
      .mid-controls{margin-bottom:8px;border:1px solid var(--chronos-border,var(--border,#2b3343));border-radius:10px;background:var(--chronos-surface-soft,rgba(255,255,255,.03))}
      .mid-controls>summary{list-style:none;cursor:pointer;user-select:none;padding:8px 10px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--chronos-text-muted,var(--text-dim,#9aa4b7));border-bottom:1px solid var(--chronos-border,var(--border,#2b3343))}
      .mid-controls>summary::-webkit-details-marker{display:none}
      .mid-controls[open]>summary{color:var(--chronos-text,var(--text,#e6e8ef))}
      .mid-controls-body{display:flex;flex-direction:column;gap:8px;padding:8px}
      .toolbar{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap}
      .group{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:7px 8px;border:1px solid var(--chronos-border,var(--border,#2b3343));border-radius:10px;background:var(--chronos-surface-soft,rgba(255,255,255,.03))}
      .group.grow{flex:1 1 380px}
      .glabel{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--chronos-text-muted,var(--text-dim,#9aa4b7));padding-right:2px}
      .cbox{display:inline-flex;gap:4px;align-items:center;color:var(--chronos-text-muted,var(--text-dim,#9aa4b7));font-size:12px}
      .cbox input{accent-color:var(--chronos-accent,var(--accent,#7aa2f7))}
      @media (max-width:1120px){.db{grid-template-columns:1fr}}
    </style>
    <div class="db">
      <section class="c" id="left"></section>
      <section class="c" id="mid"></section>
      <section class="c" id="right"></section>
    </div>
  `;

  const left = el.querySelector('#left');
  const mid = el.querySelector('#mid');
  const right = el.querySelector('#right');
  left.innerHTML = `
    <div class="r" style="justify-content:space-between"><div class="title">Schedulables</div><div class="sub">Drag into timeline</div></div>
    <input id="pSearch" class="in" placeholder="Search..." />
    <select id="pTypeSelect" class="sel">
      <option value="">all</option>
    </select>
    <div id="pList" class="list"></div>
  `;
  mid.innerHTML = `
    <div class="r" style="justify-content:space-between"><div class="title">Day Builder</div><div class="sub">Scheduling view</div></div>
    <details class="mid-controls" id="midControls" open>
      <summary>Controls</summary>
      <div class="mid-controls-body">
      <div class="toolbar">
        <div class="group grow">
          <span class="glabel">Template</span>
          <select id="tName" class="sel" style="min-width:220px;flex:1 1 240px"></select>
          <button id="tLoad" class="btn">Load</button>
          <button id="tSave" class="btn p">Save</button>
          <button id="tSaveAs" class="btn">Save As</button>
          <button id="tNew" class="btn">New</button>
          <button id="tRename" class="btn">Rename</button>
          <button id="tDelete" class="btn">Delete</button>
          <button id="tRefresh" class="btn">Refresh</button>
        </div>
      </div>
      <div class="toolbar">
        <div class="group">
          <span class="glabel">Schedule</span>
          <button id="sToday" class="btn">Load Today</button>
          <input id="sDate" class="in" type="date" style="width:170px" />
          <button id="sLoad" class="btn">Load Date</button>
        </div>
        <div class="group">
          <span class="glabel">Auto Insert</span>
          <button id="auto" class="btn">Buffers/Breaks</button>
          <label class="cbox"><input id="autoBuf" type="checkbox" checked /> buffers</label>
          <label class="cbox"><input id="autoBrk" type="checkbox" checked /> breaks</label>
        </div>
      </div>
      <div class="toolbar">
        <div class="group grow">
          <span class="glabel">Draft Actions</span>
          <button id="applyToday" class="btn p">Apply To Today</button>
          <button id="undo" class="btn">Undo</button>
          <button id="redo" class="btn">Redo</button>
          <button id="snap5" class="btn">Snap 5m</button>
          <button id="pack" class="btn">Auto Pack</button>
          <input id="packStart" class="in" value="08:00" style="width:80px" />
          <button id="validate" class="btn">Validate</button>
          <button id="qa" class="btn">QA</button>
          <button id="clear" class="btn">Clear</button>
          <button id="copy" class="btn">Copy JSON</button>
        </div>
      </div>
      <div id="valMsg" class="sub"></div>
      </div>
    </details>
    <div id="timeline" class="list"></div>
  `;
  right.innerHTML = `
    <div class="title">Inspector</div>
    <div class="sub">Day template properties</div>
    <div class="f"><label>Category</label><select id="pCategory" class="sel"><option value="">(none)</option></select></div>
    <div class="f"><label>Tags (comma)</label><input id="pTags" class="in" /></div>
    <div class="f"><label>Notes</label><textarea id="pNotes" class="ta"></textarea></div>
    <div class="f"><label>Status Requirements (YAML map)</label><textarea id="pStatus" class="ta" placeholder="energy: high&#10;focus: medium"></textarea></div>
    <div class="f"><label>Extra Props (YAML map)</label><textarea id="pExtra" class="ta"></textarea></div>
    <hr style="border:none;border-top:1px solid rgba(255,255,255,.12);width:100%" />
    <div class="sub">Selected block</div>
    <div id="bInspector" class="list" style="flex:0 0 auto;max-height:52%"></div>
  `;

  const pSearch = el.querySelector('#pSearch');
  const pTypeSelect = el.querySelector('#pTypeSelect');
  const pList = el.querySelector('#pList');
  const pCategory = el.querySelector('#pCategory');
  const tName = el.querySelector('#tName');
  const timeline = el.querySelector('#timeline');
  const bInspector = el.querySelector('#bInspector');
  const sDate = el.querySelector('#sDate');
  const valMsg = el.querySelector('#valMsg');
  const packStart = el.querySelector('#packStart');

  const ensureCategoryOption = (value) => {
    const v = String(value || '').trim();
    if (!v) return;
    const has = Array.from(pCategory.options || []).some((o) => String(o.value || '').toLowerCase() === v.toLowerCase());
    if (has) return;
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    pCategory.appendChild(opt);
  };

  const parseCategoryOptions = (payload) => {
    const src = payload?.Category_Settings || payload?.category_settings || payload?.categories || payload;
    if (!src) return [];
    const out = [];
    if (Array.isArray(src)) {
      src.forEach((row) => {
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
    } else if (src && typeof src === 'object') {
      Object.entries(src).forEach(([name, meta]) => {
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
        const j = await jget(`/api/settings?file=${encodeURIComponent(file)}`);
        options = parseCategoryOptions(j?.data || {});
        if (options.length) break;
      } catch {}
    }
    const keep = String(pCategory.value || '').trim();
    pCategory.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '(none)';
    pCategory.appendChild(none);
    options.forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      pCategory.appendChild(opt);
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
    if (tagsRaw) { const tags = tagsRaw.split(',').map((x) => x.trim()).filter(Boolean); if (tags.length) out.tags = tags; }
    if (statusRaw) { const p = yparse(statusRaw); out.status_requirements = (p && typeof p === 'object' && !Array.isArray(p)) ? p : parseLooseMap(statusRaw); }
    if (extraRaw) { const p = yparse(extraRaw); Object.assign(out, (p && typeof p === 'object' && !Array.isArray(p)) ? p : parseLooseMap(extraRaw)); }
    return out;
  };

  const loadPalette = async () => {
    const out = [];
    try {
      const payload = await jget('/api/items');
      const items = Array.isArray(payload?.items) ? payload.items : [];
      items.forEach((row) => {
        const t = normType(row?.type);
        if (!TYPES.includes(t)) return;
        if (t === 'buffer' || t === 'break') return;
        const n = String(row?.name || '').trim();
        if (!n) return;
        out.push({ id: `item:${t}:${n}`.toLowerCase(), source: 'item', type: t, name: n, duration: inferDuration(row) });
      });
    } catch {}

    const templateTypes = ['routine', 'subroutine', 'microroutine', 'window', 'timeblock'];
    for (const t of templateTypes) {
      try {
        const canonical = normType(t);
        if (!TYPES.includes(canonical)) continue;
        const payload = await jget(`/api/template/list?type=${encodeURIComponent(t)}`);
        const names = Array.isArray(payload?.templates) ? payload.templates : [];
        names.forEach((n) => {
          const clean = String(n || '').trim();
          if (!clean) return;
          out.push({ id: `template:${canonical}:${clean}`.toLowerCase(), source: 'template', type: canonical, name: clean, duration: 30 });
        });
      } catch {}
    }

    out.push({ id: 'builtin:buffer:block', source: 'builtin', type: 'buffer', name: 'Buffer Block', duration: 10 });
    out.push({ id: 'builtin:break:block', source: 'builtin', type: 'break', name: 'Break Block', duration: 15 });

    const dedup = new Map();
    out.forEach((x) => {
      const key = `${x.type}::${x.name}`.toLowerCase();
      if (!dedup.has(key)) dedup.set(key, x);
    });
    state.palette = Array.from(dedup.values()).sort((a, b) => {
      const t = a.type.localeCompare(b.type);
      if (t !== 0) return t;
      return a.name.localeCompare(b.name);
    });
    drawPalette();
  };

  const setTemplateProps = (tpl) => {
    const category = String(tpl?.category || '').trim();
    if (category) ensureCategoryOption(category);
    pCategory.value = category;
    el.querySelector('#pTags').value = Array.isArray(tpl?.tags) ? tpl.tags.join(', ') : '';
    el.querySelector('#pNotes').value = String(tpl?.notes || tpl?.description || '');
    const sr = tpl?.status_requirements && typeof tpl.status_requirements === 'object'
      ? Object.entries(tpl.status_requirements).map(([k,v]) => `${k}: ${v}`).join('\n') : '';
    el.querySelector('#pStatus').value = sr;
    el.querySelector('#pExtra').value = '';
  };

  const flattenTemplateChildren = (nodes, level = 0, out = []) => {
    if (!Array.isArray(nodes)) return out;
    nodes.forEach((c) => {
      if (!c || typeof c !== 'object') return;
      const t = normType(c?.window ? 'window' : (c?.type || ''));
      const sType = (t === 'timeblock' && (c?.is_buffer || c?.timeblock_subtype === 'buffer')) ? 'buffer' : ((t === 'timeblock' && c?.timeblock_subtype === 'break') ? 'break' : t);
      if (TYPES.includes(sType)) {
        const st = String(c.ideal_start_time || c.start_time || '');
        const et = String(c.ideal_end_time || c.end_time || '');
        out.push({
          type: sType,
          name: String(c.name || 'Untitled'),
          duration: Number(c.duration || durFromTimes(st, et, 30)) || 30,
          start_time: /^\d{1,2}:\d{2}$/.test(st) ? st : '',
          end_time: /^\d{1,2}:\d{2}$/.test(et) ? et : '',
          anchored: !!(c.anchored || String(c.reschedule || '').toLowerCase() === 'never'),
          source: 'template',
          level: Math.max(0, Number(level) || 0),
          window_name: String(c.window_name || ''),
          window_filters: (c.filters && typeof c.filters === 'object') ? c.filters : {},
          timeblock_subtype: String(c.timeblock_subtype || ''),
        });
      }
      flattenTemplateChildren(c.children || c.items || [], level + 1, out);
    });
    return out;
  };

  const filteredPalette = () => {
    const q = String(pSearch.value || '').trim().toLowerCase();
    return state.palette.filter((x) => (!state.filterType || x.type === state.filterType) && (!q || x.name.toLowerCase().includes(q) || x.type.includes(q)));
  };

  const drawTypes = () => {
    const cur = String(state.filterType || '');
    pTypeSelect.innerHTML = '';
    const opts = [{ label: 'all', value: '' }, ...TYPES.map((t) => ({ label: t, value: t }))];
    opts.forEach((o) => {
      const op = document.createElement('option');
      op.value = o.value;
      op.textContent = o.label;
      if (o.value === cur) op.selected = true;
      pTypeSelect.appendChild(op);
    });
    pTypeSelect.onchange = () => { state.filterType = String(pTypeSelect.value || ''); drawPalette(); };
  };

  const dragPayload = (ev, payload) => { try { ev.dataTransfer.setData('application/json', JSON.stringify(payload)); ev.dataTransfer.effectAllowed = 'copyMove'; } catch {} };
  const parsePayload = (ev) => { try { const raw = ev.dataTransfer.getData('application/json'); return raw ? JSON.parse(raw) : null; } catch { return null; } };
  const drawPalette = () => {
    drawTypes();
    pList.innerHTML = '';
    const rows = filteredPalette();
    if (!rows.length) { pList.innerHTML = '<div class="dz">No schedulables</div>'; return; }
    rows.forEach((x) => {
      const d = document.createElement('div'); d.className = 'item'; d.draggable = true;
      d.addEventListener('dragstart', (ev) => dragPayload(ev, { kind: 'palette', item: x }));
      d.innerHTML = `<div class="row"><span class="dot" style="background:${COLORS[x.type] || '#a5b4fc'}"></span><span class="name" title="${x.name}">${x.name}</span><span class="typ">${x.type}</span></div><div class="meta">${x.source} • ${x.duration}m</div>`;
      pList.appendChild(d);
    });
  };

  const dropZone = (idx) => {
    const z = document.createElement('div'); z.className = 'dz'; z.textContent = 'Drop block here';
    z.addEventListener('dragover', (ev) => { ev.preventDefault(); z.classList.add('a'); });
    z.addEventListener('dragleave', () => z.classList.remove('a'));
    z.addEventListener('drop', (ev) => {
      ev.preventDefault(); z.classList.remove('a');
      const p = parsePayload(ev); if (!p) return;
      if (p.kind === 'palette' && p.item) {
        pushHistory();
        const n = {
          type: normType(p.item.type),
          name: String(p.item.name || 'Untitled'),
          duration: Number(p.item.duration) > 0 ? Number(p.item.duration) : 30,
          start_time: '',
          end_time: '',
          anchored: false,
          source: p.item.source || 'palette',
          level: 0,
          window_name: '',
          window_filters: {},
          timeblock_subtype: '',
        };
        state.schedule.splice(idx, 0, n); state.selected = idx; drawTimeline(); drawInspector(); return;
      }
      if (p.kind === 'schedule') {
        pushHistory();
        const from = Number(p.index); if (!Number.isInteger(from) || from < 0 || from >= state.schedule.length) return;
        const [mv] = state.schedule.splice(from, 1); const to = from < idx ? idx - 1 : idx; state.schedule.splice(to, 0, mv); state.selected = to; drawTimeline(); drawInspector();
      }
    });
    return z;
  };

  const drawTimeline = () => {
    timeline.innerHTML = '';
    if (!state.schedule.length) {
      const z = dropZone(0); z.textContent = 'Drop from palette to start'; timeline.appendChild(z); return;
    }
    for (let i = 0; i <= state.schedule.length; i += 1) {
      timeline.appendChild(dropZone(i));
      if (i === state.schedule.length) break;
      const b = state.schedule[i];
      const row = document.createElement('div'); row.className = `blk${state.selected === i ? ' sel' : ''}`; row.draggable = true;
      row.addEventListener('dragstart', (ev) => dragPayload(ev, { kind: 'schedule', index: i }));
      row.addEventListener('click', () => { state.selected = i; drawTimeline(); drawInspector(); });
      const tm = [b.start_time, b.end_time].filter(Boolean).join(' - ');
      const anchor = b.anchored ? '<span class="typ" style="color:#f7d37a">ANCHOR</span>' : '';
      row.style.marginLeft = `${Math.max(0, Number(b.level) || 0) * 18}px`;
      row.innerHTML = `<div class="row"><span class="dot" style="background:${COLORS[b.type] || '#a5b4fc'}"></span><span class="name">${b.name}</span>${anchor}<span class="typ">${b.type}</span></div><div class="meta">${tm || 'no fixed time'} • ${b.duration || 30}m</div>`;
      timeline.appendChild(row);
    }
  };

  const setSel = (patch) => {
    if (state.selected < 0 || state.selected >= state.schedule.length) return;
    state.schedule[state.selected] = { ...state.schedule[state.selected], ...patch };
    drawTimeline();
  };

  const drawInspector = () => {
    bInspector.innerHTML = '';
    if (state.selected < 0 || state.selected >= state.schedule.length) { bInspector.innerHTML = '<div class="sub">Select a block to edit</div>'; return; }
    const b = state.schedule[state.selected];

    const mk = (label, node) => { const w = document.createElement('div'); w.className = 'f'; const l = document.createElement('label'); l.textContent = label; w.append(l, node); return w; };
    const type = document.createElement('select'); type.className = 'sel'; TYPES.forEach((t) => { const o = document.createElement('option'); o.value = t; o.textContent = t; if (t === b.type) o.selected = true; type.appendChild(o); }); type.onchange = () => { pushHistory(); setSel({ type: type.value }); drawInspector(); };
    const name = document.createElement('input'); name.className = 'in'; name.value = String(b.name || ''); name.oninput = () => setSel({ name: name.value });
    const dur = document.createElement('input'); dur.className = 'in'; dur.type = 'number'; dur.min = '1'; dur.value = String(b.duration || 30); dur.oninput = () => { const n = Number(dur.value); setSel({ duration: (Number.isFinite(n) && n > 0) ? n : 30 }); };
    const st = document.createElement('input'); st.className = 'in'; st.placeholder = 'HH:MM'; st.value = String(b.start_time || ''); st.oninput = () => {
      const start = st.value.trim();
      const duration = Number(dur.value) > 0 ? Number(dur.value) : 30;
      const autoEnd = !!autoEndInput.checked;
      if (autoEnd && hm(start) != null) {
        const e = hm(start) + duration;
        const hh = Math.max(0, Math.min(23, Math.floor(e / 60)));
        const mm = Math.max(0, Math.min(59, e % 60));
        et.value = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      }
      setSel({ start_time: start, end_time: et.value.trim() });
    };
    const et = document.createElement('input'); et.className = 'in'; et.placeholder = 'HH:MM'; et.value = String(b.end_time || ''); et.oninput = () => {
      const start = st.value.trim();
      const end = et.value.trim();
      const nDur = durFromTimes(start, end, Number(dur.value) || 30);
      dur.value = String(nDur);
      setSel({ end_time: end, duration: nDur });
    };
    const ancWrap = document.createElement('label'); ancWrap.className = 'sub'; const anc = document.createElement('input'); anc.type = 'checkbox'; anc.checked = !!b.anchored; anc.onchange = () => { setSel({ anchored: !!anc.checked }); drawInspector(); }; ancWrap.append(anc, document.createTextNode(' Pinned Anchor'));
    const autoEndWrap = document.createElement('label'); autoEndWrap.className = 'sub'; const autoEndInput = document.createElement('input'); autoEndInput.type = 'checkbox'; autoEndInput.checked = true; autoEndWrap.append(autoEndInput, document.createTextNode(' Auto end from start+duration'));
    const level = document.createElement('input'); level.className = 'in'; level.type = 'number'; level.min = '0'; level.max = '8'; level.value = String(Math.max(0, Number(b.level) || 0)); level.oninput = () => { const lv = Math.max(0, Number(level.value) || 0); setSel({ level: lv }); };

    const windowName = document.createElement('input'); windowName.className = 'in'; windowName.value = String(b.window_name || ''); windowName.placeholder = 'Window name';
    windowName.oninput = () => setSel({ window_name: windowName.value });
    const windowFilters = document.createElement('textarea'); windowFilters.className = 'ta'; windowFilters.style.minHeight = '56px';
    windowFilters.value = b.window_filters && typeof b.window_filters === 'object'
      ? Object.entries(b.window_filters).map(([k, v]) => `${k}: ${v}`).join('\n')
      : '';
    windowFilters.oninput = () => { const p = yparse(windowFilters.value); setSel({ window_filters: (p && typeof p === 'object' && !Array.isArray(p)) ? p : parseLooseMap(windowFilters.value) }); };

    const tbSubtype = document.createElement('select'); tbSubtype.className = 'sel';
    ['','generic','free','category','buffer','break'].forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v || '(none)'; if (String(b.timeblock_subtype || '') === v) o.selected = true; tbSubtype.appendChild(o); });
    tbSubtype.onchange = () => setSel({ timeblock_subtype: tbSubtype.value });

    const acts = document.createElement('div'); acts.className = 'r';
    const dup = document.createElement('button'); dup.className = 'btn'; dup.textContent = 'Duplicate'; dup.onclick = () => { pushHistory(); state.schedule.splice(state.selected + 1, 0, { ...state.schedule[state.selected] }); state.selected += 1; drawTimeline(); drawInspector(); };
    const del = document.createElement('button'); del.className = 'btn'; del.textContent = 'Delete'; del.onclick = () => { pushHistory(); state.schedule.splice(state.selected, 1); state.selected = state.schedule.length ? Math.max(0, Math.min(state.selected, state.schedule.length - 1)) : -1; drawTimeline(); drawInspector(); };
    const indent = document.createElement('button'); indent.className = 'btn'; indent.textContent = 'Indent'; indent.onclick = () => { pushHistory(); setSel({ level: Math.min(8, (Number(b.level) || 0) + 1) }); drawInspector(); };
    const outdent = document.createElement('button'); outdent.className = 'btn'; outdent.textContent = 'Outdent'; outdent.onclick = () => { pushHistory(); setSel({ level: Math.max(0, (Number(b.level) || 0) - 1) }); drawInspector(); };
    acts.append(dup, del, indent, outdent);

    bInspector.append(mk('Type', type), mk('Name', name), mk('Duration (minutes)', dur), mk('Start Time', st), mk('End Time', et), autoEndWrap, ancWrap, mk('Hierarchy Level', level));
    if (String(b.type) === 'window') bInspector.append(mk('Window Name', windowName), mk('Window Filters (YAML map)', windowFilters));
    if (String(b.type) === 'timeblock') bInspector.append(mk('Timeblock Subtype', tbSubtype));
    bInspector.append(acts);
  };
  const loadTemplateList = async () => {
    try {
      const p = await jget('/api/template/list?type=day');
      const names = Array.isArray(p?.templates) ? p.templates : [];
      tName.innerHTML = '';
      names.forEach((n) => { const o = document.createElement('option'); o.value = o.textContent = String(n); tName.appendChild(o); });
      if (state.templateName && names.includes(state.templateName)) tName.value = state.templateName;
      if (!state.templateName && names.length) { state.templateName = names[0]; tName.value = names[0]; }
    } catch { tName.innerHTML = ''; }
  };

  const loadDayTemplate = async (name) => {
    const n = String(name || '').trim(); if (!n) { emit('error', 'Choose a day template first.'); return; }
    try {
      const p = await jget(`/api/template?type=day&name=${encodeURIComponent(n)}`);
      if (!p?.ok) { emit('error', p?.error || 'Failed to load template.'); return; }
      state.templateName = n; tName.value = n;
      state.schedule = flattenTemplateChildren(Array.isArray(p.children) ? p.children : []);
      state.selected = state.schedule.length ? 0 : -1;
      setTemplateProps(p.template || {});
      drawTimeline(); drawInspector(); emit('ok', `Loaded day template: ${n}`);
    } catch (e) { emit('error', `Template load failed: ${String(e || '')}`); }
  };

  const buildHierarchyChildren = () => {
    const roots = [];
    const stack = [];
    state.schedule.forEach((b) => {
      const lvl = Math.max(0, Number(b.level) || 0);
      const c = { type: b.type, name: b.name };
      if (Number(b.duration) > 0) c.duration = Number(b.duration);
      if (b.start_time) c.ideal_start_time = b.start_time;
      if (b.end_time) c.ideal_end_time = b.end_time;
      if (b.anchored) { c.anchored = true; c.reschedule = 'never'; }
      if (b.type === 'window') {
        c.window = true;
        if (b.window_name) c.window_name = String(b.window_name);
        if (b.window_filters && typeof b.window_filters === 'object' && Object.keys(b.window_filters).length) c.filters = b.window_filters;
      }
      if (b.type === 'timeblock' && b.timeblock_subtype) c.timeblock_subtype = String(b.timeblock_subtype);
      if (b.type === 'buffer') { c.type = 'timeblock'; c.is_buffer = true; c.timeblock_subtype = 'buffer'; c.name = b.name || 'Buffer'; }
      if (b.type === 'break') { c.type = 'timeblock'; c.is_buffer = true; c.timeblock_subtype = 'break'; c.name = b.name || 'Break'; }

      while (stack.length > lvl) stack.pop();
      const parent = stack[stack.length - 1];
      if (parent) {
        parent.children = Array.isArray(parent.children) ? parent.children : [];
        parent.children.push(c);
      } else {
        roots.push(c);
      }
      stack.push(c);
    });
    return roots;
  };

  const saveDayTemplate = async (saveAs) => {
    let n = String(tName.value || state.templateName || '').trim();
    if (saveAs || !n) { n = String(prompt('Day template name:', n || '') || '').trim(); if (!n) return false; }

    const children = buildHierarchyChildren();

    const r1 = await jpost('/api/template', { type: 'day', name: n, children });
    if (!r1.ok) { emit('error', r1?.j?.error || 'Could not save template children.'); return false; }
    const r2 = await jpost('/api/item', { type: 'day', name: n, properties: getTemplateProps() });
    if (!r2.ok) { emit('error', r2?.j?.error || 'Children saved, property update failed.'); return false; }

    state.templateName = n; await loadTemplateList(); tName.value = n; emit('ok', `Saved day template: ${n}`);
    return true;
  };

  const newDayTemplate = async () => {
    const suggested = String(state.templateName || tName.value || '').trim();
    const n = String(prompt('New day template name:', suggested ? `${suggested} copy` : '') || '').trim();
    if (!n) return;

    const r = await jpost('/api/template', { type: 'day', name: n, children: [] });
    if (!r.ok) {
      emit('error', r?.j?.error || 'Could not create new template.');
      return;
    }

    state.templateName = n;
    state.schedule = [];
    state.selected = -1;
    setTemplateProps({});
    await loadTemplateList();
    tName.value = n;
    drawTimeline();
    drawInspector();
    emit('ok', `Created new template: ${n}`);
  };

  const loadScheduleForDate = async (key) => {
    const k = String(key || '').trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) { emit('error', 'Use YYYY-MM-DD.'); return; }
    const txt = await readFile(`user/schedules/schedule_${k}.yml`);
    if (txt) {
      const y = yparse(txt);
      if (y) {
        const rows = [];
        const walk = (items, level = 0) => {
          if (!Array.isArray(items)) return;
          items.forEach((it) => {
            if (!it || typeof it !== 'object') return;
            const o = (it.original_item_data && typeof it.original_item_data === 'object') ? it.original_item_data : {};
            const tRaw = normType(it.type || o.type || '');
            let t = tRaw;
            if (tRaw === 'timeblock' && (it.is_buffer || o.is_buffer)) t = 'buffer';
            if (tRaw === 'timeblock' && (it.timeblock_subtype === 'break' || String(it.name || '').toLowerCase().includes('break'))) t = 'break';
            if ((tRaw === 'window') || it.window) t = 'window';
            if (TYPES.includes(t)) {
              const st = String(it.start_time || o.start_time || it.ideal_start_time || o.ideal_start_time || '');
              const et = String(it.end_time || o.end_time || it.ideal_end_time || o.ideal_end_time || '');
              rows.push({
                type: t,
                name: String(it.name || o.name || 'Untitled'),
                duration: Number(it.duration || o.duration || durFromTimes(st, et, 30)) || 30,
                start_time: /^\d{1,2}:\d{2}$/.test(st) ? st : '',
                end_time: /^\d{1,2}:\d{2}$/.test(et) ? et : '',
                anchored: !!(it.anchored || o.anchored || String(it.reschedule || o.reschedule || '').toLowerCase() === 'never'),
                source: 'schedule',
                level: Math.max(0, Number(level) || 0),
                window_name: String(it.window_name || o.window_name || ''),
                window_filters: (it.filters && typeof it.filters === 'object') ? it.filters : ((o.filters && typeof o.filters === 'object') ? o.filters : {}),
                timeblock_subtype: String(it.timeblock_subtype || o.timeblock_subtype || ''),
              });
            }
            walk(it.children || it.items || [], level + 1);
          });
        };
        if (Array.isArray(y)) walk(y, 0); else if (y && typeof y === 'object') walk(y.items || y.children || [], 0);
        state.schedule = rows; state.selected = rows.length ? 0 : -1; drawTimeline(); drawInspector(); emit('ok', `Loaded generated schedule for ${k}`); return;
      }
    }
    if (k === todayKey()) {
      try {
        const todayText = await fetchText('/api/today');
        const y = yparse(todayText);
        const blocks = Array.isArray(y?.blocks) ? y.blocks : [];
        const rows = blocks.map((b) => {
          let t = normType(b?.type || '');
          if (t === 'timeblock' && String(b?.text || '').toLowerCase().includes('break')) t = 'break';
          if (!TYPES.includes(t)) return null;
          return {
            type: t,
            name: String(b?.text || 'Untitled'),
            duration: durFromTimes(b?.start, b?.end, 30),
            start_time: String(b?.start || ''),
            end_time: String(b?.end || ''),
            anchored: !!b?.anchored,
            source: 'schedule',
            level: Math.max(0, Number(b?.depth) || 0),
            window_name: String(b?.window_name || ''),
            window_filters: {},
            timeblock_subtype: '',
          };
        }).filter(Boolean);
        if (rows.length) {
          state.schedule = rows;
          state.selected = 0;
          drawTimeline();
          drawInspector();
          emit('ok', `Loaded today's schedule`);
          return;
        }
      } catch {}
    }
    emit('error', `Could not load schedule for ${k}.`);
  };
  const autoInsert = async () => {
    if (!state.schedule.length) { emit('error', 'Load or build a schedule draft first.'); return; }
    pushHistory();
    const rawBuf = await readFile('user/settings/Buffer_Settings.yml');
    const rawTs = await readFile('user/settings/Timer_Settings.yml');
    const rawTp = await readFile('user/settings/Timer_Profiles.yml');
    const b = (yparse(rawBuf) && typeof yparse(rawBuf) === 'object') ? yparse(rawBuf) : {};
    const ts = (yparse(rawTs) && typeof yparse(rawTs) === 'object') ? yparse(rawTs) : {};
    const tp = (yparse(rawTp) && typeof yparse(rawTp) === 'object') ? yparse(rawTp) : {};
    const tb = b.template_buffers || {}; const dy = b.global_dynamic_buffer || {};
    const profile = tp[String(ts.default_profile || '').trim()] || {};
    const cfg = {
      day: Number(tb.day_template_default_buffer_minutes || 0),
      r: Number(tb.routine_buffer_minutes || 0),
      s: Number(tb.subroutine_buffer_minutes || 0),
      m: Number(tb.microroutine_buffer_minutes || 0),
      di: Number(dy.buffer_interval_minutes || 0),
      dd: Number(dy.buffer_duration_minutes || 0),
      f: Number(profile.focus_minutes || 0),
      sb: Number(profile.short_break_minutes || 0),
      le: Number(profile.long_break_every || 0),
      lb: Number(profile.long_break_minutes || 0),
    };

    const doBuf = !!el.querySelector('#autoBuf')?.checked;
    const doBrk = !!el.querySelector('#autoBrk')?.checked;
    let sinceDyn = 0, sinceBrk = 0, cycles = 0;
    const out = [];

    state.schedule.forEach((x, i) => {
      const b0 = { ...x }; out.push(b0);
      const work = (b0.type !== 'buffer' && b0.type !== 'break');
      if (!work) { if (b0.type === 'break') sinceBrk = 0; return; }
      const d = Number(b0.duration) > 0 ? Number(b0.duration) : 0;
      sinceDyn += d; sinceBrk += d;
      const next = state.schedule[i + 1]; const nextIsSpecial = !next || next.type === 'buffer' || next.type === 'break';
      if (nextIsSpecial) return;

      if (doBuf) {
        let tBuf = 0; if (b0.type === 'routine') tBuf = cfg.r; else if (b0.type === 'subroutine') tBuf = cfg.s; else if (b0.type === 'microroutine') tBuf = cfg.m; else tBuf = cfg.day;
        if (tBuf > 0) { out.push({ type: 'buffer', name: 'Buffer', duration: tBuf, start_time: '', end_time: '', anchored: false, source: 'auto' }); sinceDyn = 0; }
        if (cfg.di > 0 && cfg.dd > 0 && sinceDyn >= cfg.di) { out.push({ type: 'buffer', name: 'Dynamic Buffer', duration: cfg.dd, start_time: '', end_time: '', anchored: false, source: 'auto' }); sinceDyn = 0; }
      }

      if (doBrk && cfg.f > 0 && cfg.sb > 0 && sinceBrk >= cfg.f) {
        cycles += 1; const isLong = cfg.le > 0 && cfg.lb > 0 && (cycles % cfg.le === 0); const bd = isLong ? cfg.lb : cfg.sb;
        out.push({ type: 'break', name: isLong ? 'Long Break' : 'Break', duration: bd, start_time: '', end_time: '', anchored: false, source: 'auto' });
        sinceBrk = 0;
      }
    });

    state.schedule = out; drawTimeline(); drawInspector(); emit('ok', 'Inserted buffers/breaks from settings.');
  };

  const validateDraft = () => {
    const issues = [];
    const fixed = [];
    state.schedule.forEach((b, i) => {
      const s = hm(b.start_time);
      const e = hm(b.end_time);
      const duration = Number(b.duration) || 0;
      if (b.start_time && s == null) issues.push(`Row ${i + 1}: invalid start time "${b.start_time}"`);
      if (b.end_time && e == null) issues.push(`Row ${i + 1}: invalid end time "${b.end_time}"`);
      if (s != null && e != null && e <= s) issues.push(`Row ${i + 1}: end must be after start`);
      if (duration <= 0) issues.push(`Row ${i + 1}: duration must be > 0`);
      if (b.anchored && (s == null || e == null)) issues.push(`Row ${i + 1}: anchor should have start/end time`);
      if (s != null && e != null) fixed.push({ i, s, e, name: String(b.name || '') });
    });
    fixed.sort((a, b) => a.s - b.s);
    for (let i = 1; i < fixed.length; i += 1) {
      const prev = fixed[i - 1];
      const curr = fixed[i];
      if (curr.s < prev.e) issues.push(`Overlap: "${prev.name}" and "${curr.name}"`);
    }
    valMsg.textContent = issues.length ? `Issues: ${issues.join(' | ')}` : 'No validation issues.';
    return { ok: issues.length === 0, issues };
  };

  const snapTo5 = () => {
    pushHistory();
    state.schedule = state.schedule.map((b) => {
      const s = hm(b.start_time);
      const e = hm(b.end_time);
      const round5 = (m) => (m == null ? '' : `${String(Math.floor((m + 2) / 5) * 5 / 60 | 0).padStart(2, '0')}:${String((Math.floor((m + 2) / 5) * 5) % 60).padStart(2, '0')}`);
      const ns = round5(s);
      const ne = round5(e);
      const d = (hm(ns) != null && hm(ne) != null) ? durFromTimes(ns, ne, b.duration) : b.duration;
      return { ...b, start_time: ns || b.start_time, end_time: ne || b.end_time, duration: d };
    });
    drawTimeline();
    drawInspector();
  };

  const autoPack = () => {
    const start = hm(String(packStart.value || '').trim());
    if (start == null) { emit('error', 'Invalid pack start time. Use HH:MM'); return; }
    pushHistory();
    let cursor = start;
    state.schedule = state.schedule.map((b) => {
      const d = Math.max(1, Number(b.duration) || 30);
      const st = `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`;
      const end = cursor + d;
      const et = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
      cursor = end;
      return { ...b, start_time: st, end_time: et };
    });
    drawTimeline();
    drawInspector();
  };

  const undo = () => {
    if (!state.history.length) return;
    state.future.push(clone(state.schedule));
    state.schedule = state.history.pop();
    state.selected = state.schedule.length ? Math.min(Math.max(state.selected, 0), state.schedule.length - 1) : -1;
    drawTimeline();
    drawInspector();
  };

  const redo = () => {
    if (!state.future.length) return;
    state.history.push(clone(state.schedule));
    state.schedule = state.future.pop();
    state.selected = state.schedule.length ? Math.min(Math.max(state.selected, 0), state.schedule.length - 1) : -1;
    drawTimeline();
    drawInspector();
  };

  const applyDraftToToday = async () => {
    const valid = validateDraft();
    if (!valid.ok) {
      emit('error', 'Fix validation issues before applying to today.');
      return;
    }
    let name = String(state.templateName || tName.value || '').trim();
    if (!name) {
      name = String(prompt('Template name required before apply:', 'Day Builder Draft') || '').trim();
      if (!name) return;
      state.templateName = name;
      tName.value = name;
    }
    const saved = await saveDayTemplate(false);
    if (saved === false) return;
    name = String(state.templateName || tName.value || name).trim();
    const res = await runCli('today', ['reschedule', `template:${name}`], {});
    if (!res.ok) {
      emit('error', res?.j?.error || res?.text || 'Apply to today failed.');
      return;
    }
    emit('ok', `Applied draft to today using template "${name}".`);
  };

  const renameTemplate = async () => {
    const oldName = String(tName.value || state.templateName || '').trim();
    if (!oldName) { emit('error', 'Select a template to rename.'); return; }
    const next = String(prompt('Rename template to:', oldName) || '').trim();
    if (!next || next === oldName) return;
    const r = await jpost('/api/item/rename', { type: 'day', old_name: oldName, new_name: next });
    if (!r.ok) { emit('error', r?.j?.error || 'Rename failed.'); return; }
    state.templateName = next;
    await loadTemplateList();
    tName.value = next;
    emit('ok', `Renamed template to "${next}".`);
  };

  const deleteTemplate = async () => {
    const name = String(tName.value || state.templateName || '').trim();
    if (!name) { emit('error', 'Select a template to delete.'); return; }
    if (!confirm(`Delete day template "${name}"?`)) return;
    const r = await jpost('/api/item/delete', { type: 'day', name });
    if (!r.ok) { emit('error', r?.j?.error || 'Delete failed.'); return; }
    if (state.templateName === name) state.templateName = '';
    await loadTemplateList();
    emit('ok', `Deleted template "${name}".`);
  };

  const qaCheck = () => {
    const checks = [];
    checks.push(`palette:${state.palette.length}`);
    checks.push(`blocks:${state.schedule.length}`);
    checks.push(`selected:${state.selected}`);
    const v = validateDraft();
    checks.push(`valid:${v.ok}`);
    checks.push(`history:${state.history.length}`);
    checks.push(`future:${state.future.length}`);
    valMsg.textContent = `QA ${checks.join(' | ')}`;
    emit('ok', 'Day Builder QA check complete.');
  };

  pSearch.oninput = () => drawPalette();
  el.querySelector('#tNew').onclick = () => newDayTemplate();
  el.querySelector('#tRename').onclick = () => renameTemplate();
  el.querySelector('#tDelete').onclick = () => deleteTemplate();
  el.querySelector('#tRefresh').onclick = () => loadTemplateList();
  el.querySelector('#tLoad').onclick = () => loadDayTemplate(String(tName.value || '').trim());
  el.querySelector('#tSave').onclick = () => saveDayTemplate(false);
  el.querySelector('#tSaveAs').onclick = () => saveDayTemplate(true);
  el.querySelector('#sToday').onclick = async () => { const d = todayKey(); sDate.value = d; await loadScheduleForDate(d); };
  el.querySelector('#sLoad').onclick = async () => loadScheduleForDate(String(sDate.value || '').trim());
  el.querySelector('#auto').onclick = () => autoInsert();
  el.querySelector('#applyToday').onclick = () => applyDraftToToday();
  el.querySelector('#undo').onclick = () => undo();
  el.querySelector('#redo').onclick = () => redo();
  el.querySelector('#snap5').onclick = () => snapTo5();
  el.querySelector('#pack').onclick = () => autoPack();
  el.querySelector('#validate').onclick = () => validateDraft();
  el.querySelector('#qa').onclick = () => qaCheck();
  el.querySelector('#clear').onclick = () => { pushHistory(); state.schedule = []; state.selected = -1; drawTimeline(); drawInspector(); };
  el.querySelector('#copy').onclick = async () => {
    try {
      const payload = { template: { name: state.templateName || String(tName.value || ''), properties: getTemplateProps() }, items: state.schedule };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      emit('ok', 'Day Builder draft copied to clipboard.');
    } catch { emit('error', 'Could not copy draft JSON.'); }
  };

  sDate.value = todayKey();
  drawPalette(); drawTimeline(); drawInspector();
  await loadCategoryOptions();
  await loadPalette();
  await loadTemplateList();
}

