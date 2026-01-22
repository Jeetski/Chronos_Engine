export function mount(el, context) {
  // Load CSS
  if (!document.getElementById('terminal-css')) {
    const link = document.createElement('link');
    link.id = 'terminal-css';
    link.rel = 'stylesheet';
    link.href = './Widgets/Terminal/terminal.css';
    document.head.appendChild(link);
  }

  el.className = 'widget terminal-widget';

  const css = `
    .term-content { flex: 1 1 auto; min-height: 0; }
    .term { display:flex; flex-direction:column; gap:8px; height:100%; min-height:0; }
    .screen { 
      flex:1 1 auto; 
      min-height:160px; 
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 100%);
      color:#e6e8ef; 
      border:1px solid rgba(255, 255, 255, 0.08); 
      border-radius:12px; 
      padding:12px; 
      overflow:auto; 
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; 
      font-size: 12px; 
      white-space: pre-wrap; 
      word-break: break-word;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .prompt { display:flex; gap:6px; align-items:center; position: relative; }
    .who { color:#7aa2f7; }
    .input-wrap { position: relative; flex: 1; }
    .in { 
      width: 100%; 
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%);
      color:#e6e8ef; 
      border:1px solid rgba(255, 255, 255, 0.08); 
      border-radius:8px; 
      padding:6px 8px; 
      position: relative; 
      z-index: 2;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .in:focus {
      border-color: rgba(78, 201, 176, 0.4);
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 100%);
    }
    .ghost {
      position:absolute;
      left: 8px;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      color: rgba(230,232,239,0.35);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      pointer-events: none;
      white-space: pre;
      overflow: hidden;
      z-index: 1;
    }
  `;
  el.innerHTML = `
    <style>${css}</style>
    <div class="header" id="tHeader">
      <div class="title">Terminal</div>
      <div class="controls">
        <button class="icon-btn" id="tCopy" title="Copy Output">C</button>
        <button class="icon-btn" id="tMin" title="Minimize">_</button>
        <button class="icon-btn" id="tClose" title="Close">x</button>
      </div>
    </div>
    <div class="content term-content">
      <div class="term">
        <div class="screen" id="tOut"></div>
        <div class="prompt">
          <span class="who" id="tWho">chronos@you</span>
          <div class="input-wrap">
            <input id="tInput" class="in" placeholder="Type a command (e.g., help) and press Enter" />
            <div class="ghost" id="tGhost"></div>
          </div>
          <label class="hint" style="display:flex; align-items:center; gap:4px;"><input type="checkbox" id="tExpand" checked />Expand args</label>
        </div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;

  const outEl = el.querySelector('#tOut');
  const inEl = el.querySelector('#tInput');
  const whoEl = el.querySelector('#tWho');
  const ghostEl = el.querySelector('#tGhost');
  // Global suggestions element
  const suggestEl = document.createElement('div');
  suggestEl.className = 'term-suggest-popup';
  Object.assign(suggestEl.style, {
    position: 'absolute',
    background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.3) 100%)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '10px',
    maxHeight: '160px',
    overflow: 'auto',
    zIndex: '9999',
    display: 'none',
    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '12px'
  });
  document.body.appendChild(suggestEl);

  const btnMin = el.querySelector('#tMin');
  const btnClose = el.querySelector('#tClose');
  const btnCopy = el.querySelector('#tCopy');
  const expandChk = el.querySelector('#tExpand');
  let registry = { commands: {}, aliases: {}, item_types: [], item_names_by_type: {}, properties: {}, status_indicators: [], timer_profiles: [], defaults_keys_by_type: {} };
  let suggestions = [];
  let suggestIndex = -1;
  let registryLoaded = false;
  let registryLoading = null;

  // Dragging
  const header = el.querySelector('#tHeader');
  header?.addEventListener('pointerdown', (ev) => {
    const startX = ev.clientX, startY = ev.clientY; const rect = el.getBoundingClientRect(); const offX = startX - rect.left, offY = startY - rect.top;
    function onMove(e) { el.style.left = Math.max(6, e.clientX - offX) + 'px'; el.style.top = Math.max(6, e.clientY - offY) + 'px'; el.style.right = 'auto'; }
    function onUp() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  });

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  async function postYaml(url, obj) {
    const yaml = (o) => {
      const lines = []; for (const [k, v] of Object.entries(o || {})) {
        if (Array.isArray(v)) { lines.push(`${k}:`); v.forEach(it => lines.push(`  - ${JSON.stringify(it)}`)); }
        else if (typeof v === 'object' && v) { lines.push(`${k}:`); for (const [k2, v2] of Object.entries(v)) lines.push(`  ${k2}: ${JSON.stringify(v2)}`); }
        else { lines.push(`${k}: ${JSON.stringify(v)}`); }
      } return lines.join('\n');
    };
    return await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body: yaml(obj) });
  }

  function println(txt) { outEl.textContent += (txt ? String(txt) : '') + '\n'; outEl.scrollTop = outEl.scrollHeight; }

  async function loadProfile() {
    try {
      const r = await fetch(apiBase() + "/api/profile");
      const j = await r.json();
      const prof = j?.profile || {};
      const nick = prof.nickname || prof.nick || 'user';
      whoEl.textContent = `chronos@${nick}`;
      // Apply theme via server resolver
      try {
        const themeName = prof.theme || (prof.console && prof.console.theme);
        if (themeName) {
          const ts = await fetch(apiBase() + `/api/theme?name=${encodeURIComponent(themeName)}`);
          const tj = await ts.json();
          if (tj && tj.ok) {
            if (tj.background_hex) outEl.style.background = tj.background_hex;
            if (tj.text_hex) { outEl.style.color = tj.text_hex; whoEl.style.color = tj.text_hex; }
          }
        }
      } catch { }
      // Greeting lines (support: welcome/greeting/entry_message/welcome_message; console.* variants)
      try {
        const greet = (prof.welcome || prof.greeting || prof.entry_message || prof.welcome_message || (prof.console && (prof.console.welcome || prof.console.greeting)) || []);
        let lines = [];
        if (typeof greet === 'string') lines = [greet];
        else if (Array.isArray(greet)) lines = greet.slice();
        else if (typeof greet === 'object') {
          // Collect line1..lineN in order
          const keys = Object.keys(greet).filter(k => /^line\d+$/i.test(k)).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')));
          for (const k of keys) { if (greet[k]) lines.push(greet[k]); }
        }
        if (!lines.length) lines = [`Welcome, @nickname.`];
        // Expand vars
        try { await (window.ChronosVars && window.ChronosVars.refresh && window.ChronosVars.refresh(true)); } catch { }
        for (const ln of lines) {
          const out = (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(ln).replace('@nickname', nick)) : String(ln).replace('@nickname', nick);
          println(out);
        }
        println(`Type 'help' to list commands.`);
      } catch { println(`Welcome, ${nick}. Type 'help' to list commands.`); }
    } catch { whoEl.textContent = 'chronos@user'; println(`Welcome. Type 'help' to list commands.`); }
  }

  function splitArgs(line) {
    const out = []; let cur = ''; let q = null; for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === q) { q = null; continue; } cur += c; continue; }
      if (c === '"' || c === '\'\'') { q = c; continue; }
      if (/\s/.test(c)) { if (cur) { out.push(cur); cur = ''; } continue; }
      cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }

  function normalizeWord(word) {
    return String(word || '').trim();
  }

  function resolveAlias(cmd) {
    const aliasMap = registry.aliases || {};
    return aliasMap[cmd] || cmd;
  }

  function getCommandContext(tokens) {
    if (!tokens.length) return null;
    return resolveAlias(tokens[0].toLowerCase());
  }

  function getPropertyValues(key) {
    const props = registry.properties || {};
    if (!key) return [];
    const k = key.toLowerCase();
    if (k === 'category') return props.category?.values || [];
    if (k === 'priority') return props.priority?.values || [];
    if (k === 'quality') return props.quality?.values || [];
    if ((registry.status_indicators || []).includes(k)) {
      return props.status?.children?.[k] || [];
    }
    return [];
  }

  function getAllPropertyKeys() {
    const keys = new Set();
    Object.keys(registry.properties || {}).forEach(k => {
      if (k !== 'status') keys.add(k);
    });
    (registry.status_indicators || []).forEach(k => keys.add(k));
    Object.values(registry.defaults_keys_by_type || {}).forEach(arr => arr.forEach(k => keys.add(String(k))));
    return Array.from(keys);
  }

  const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  function isPropertyToken(token) {
    if (typeof token !== 'string') return false;
    if (!token.includes(':')) return false;
    const [key] = token.split(':', 1);
    return key && /^[A-Za-z][A-Za-z0-9_]*$/.test(key);
  }

  function parseSlot(slot) {
    if (slot.startsWith('kw:')) return { kind: 'kw', value: slot.slice(3), repeatable: false };
    if (slot.startsWith('choice*:')) return { kind: 'choice', value: slot.slice(8).split('|').map(s => s.trim().toLowerCase()).filter(Boolean), repeatable: true };
    if (slot.startsWith('choice:')) return { kind: 'choice', value: slot.slice(7).split('|').map(s => s.trim().toLowerCase()).filter(Boolean), repeatable: false };
    return { kind: slot, value: null, repeatable: false };
  }

  function matchPattern(pattern, positionalTokens) {
    const slots = pattern.slots || [];
    const ctx = {};
    let idx = 0;
    let slotIdx = 0;
    while (slotIdx < slots.length && idx < positionalTokens.length) {
      const slot = slots[slotIdx];
      const parsed = parseSlot(slot);
      const token = positionalTokens[idx];
      const tokenLower = token.toLowerCase();
      if (parsed.kind === 'kw') {
        if (tokenLower !== parsed.value) return null;
        slotIdx += 1;
        idx += 1;
        continue;
      }
      if (parsed.kind === 'choice') {
        if (!parsed.value.includes(tokenLower)) return null;
        idx += 1;
        if (parsed.repeatable && idx < positionalTokens.length && parsed.value.includes(positionalTokens[idx].toLowerCase())) {
          continue;
        }
        slotIdx += 1;
        continue;
      }
      if (parsed.kind === 'item_type') ctx.item_type = tokenLower;
      if (parsed.kind === 'item_name') ctx.item_name = token;
      if (parsed.kind === 'item_property') ctx.item_property = tokenLower;
      if (parsed.kind === 'timer_profile') ctx.timer_profile = tokenLower;
      slotIdx += 1;
      idx += 1;
    }
    if (idx < positionalTokens.length) return null;
    const nextSlot = slotIdx < slots.length ? slots[slotIdx] : null;
    return { context: ctx, nextSlot, complete: slotIdx >= slots.length };
  }

  function propertyKeyCandidates(pattern) {
    const allowed = pattern.property_keys || [];
    if (allowed.length) {
      const keys = new Set();
      for (const key of allowed) {
        if (key === 'status_indicators') {
          (registry.status_indicators || []).forEach(ind => keys.add(ind));
        } else {
          keys.add(key);
        }
      }
      return Array.from(keys);
    }
    return getAllPropertyKeys();
  }

  function itemPropertyKeys(itemType) {
    if (itemType) {
      const defaults = registry.defaults_keys_by_type || {};
      const keys = defaults[itemType] || [];
      if (keys.length) return Array.from(new Set(keys.map(k => String(k))));
    }
    return getAllPropertyKeys();
  }

  function buildSuggestions(value) {
    const trimmed = value;
    const beforeCursor = trimmed;
    const endsWithSpace = /\s$/.test(beforeCursor);
    const tokens = splitArgs(beforeCursor);
    const current = endsWithSpace ? '' : (tokens[tokens.length - 1] || '');
    const baseTokens = endsWithSpace ? tokens : tokens.slice(0, -1);
    const cmd = getCommandContext(baseTokens);
    const results = new Set();

    if (!baseTokens.length) {
      Object.keys(registry.commands || {}).forEach(c => results.add(c));
      Object.keys(registry.aliases || {}).forEach(a => results.add(a));
      return { list: Array.from(results).sort(), current };
    }
    const cmdDef = registry.commands?.[cmd] || {};
    const syntax = cmdDef.syntax || [];

    if (cmd === 'list' && baseTokens.includes('then')) {
      const thenIdx = baseTokens.indexOf('then');
      const nestedTokens = baseTokens.slice(thenIdx + 1);
      const nestedCurrent = (tokens.length > thenIdx + 1) ? current : '';
      if (!nestedTokens.length && !nestedCurrent) {
        Object.keys(registry.commands || {}).forEach(c => results.add(c));
        Object.keys(registry.aliases || {}).forEach(a => results.add(a));
        return { list: Array.from(results).sort(), current: nestedCurrent };
      }
      let nestedText = [...nestedTokens, ...(nestedCurrent ? [nestedCurrent] : [])].join(' ');
      if (endsWithSpace && tokens.length > thenIdx + 1 && !nestedCurrent) nestedText += ' ';
      const nested = buildSuggestions(nestedText);
      return { list: nested.list, current: nested.current };
    }

    if (cmd === 'bulk' && baseTokens.length >= 2) {
      const nestedTokens = baseTokens.slice(1);
      const nestedCurrent = (tokens.length > 1) ? current : '';
      let nestedText = [...nestedTokens, ...(nestedCurrent ? [nestedCurrent] : [])].join(' ');
      if (endsWithSpace && tokens.length > 1 && !nestedCurrent) nestedText += ' ';
      const nested = buildSuggestions(nestedText);
      nested.list.forEach(s => results.add(s));
      const pattern = syntax[0] || {};
      if (pattern.allow_properties) {
        if (current.includes(':')) {
          const [key] = current.split(':', 2);
          getPropertyValues(key).forEach(v => results.add(`${key}:${v}`));
        } else {
          propertyKeyCandidates(pattern).forEach(k => results.add(`${k}:`));
        }
      }
      return { list: Array.from(results).sort(), current: nested.current };
    }

    if (syntax.length) {
      const positional = baseTokens.slice(1).filter(t => !isPropertyToken(t));
      let matchedAny = false;
      for (const pattern of syntax) {
        const match = matchPattern(pattern, positional);
        if (!match) continue;
        matchedAny = true;
        if (!match.nextSlot) {
          if (pattern.allow_properties) {
            if (current.includes(':')) {
              const [key] = current.split(':', 2);
              getPropertyValues(key).forEach(v => results.add(`${key}:${v}`));
            } else {
              propertyKeyCandidates(pattern).forEach(k => results.add(`${k}:`));
            }
            if (cmd === 'list' && !baseTokens.includes('then')) results.add('then');
          }
          continue;
        }
        const parsed = parseSlot(match.nextSlot);
        if (parsed.kind === 'kw') results.add(parsed.value);
        else if (parsed.kind === 'choice') parsed.value.forEach(v => results.add(v));
        else if (parsed.kind === 'item_type') (registry.item_types || []).forEach(t => results.add(t));
        else if (parsed.kind === 'item_name') {
          const names = registry.item_names_by_type?.[match.context.item_type || ''] || [];
          names.forEach(n => results.add(n));
        }
        else if (parsed.kind === 'item_property') itemPropertyKeys(match.context.item_type).forEach(k => results.add(k));
        else if (parsed.kind === 'command') {
          Object.keys(registry.commands || {}).forEach(c => results.add(c));
          Object.keys(registry.aliases || {}).forEach(a => results.add(a));
        }
        else if (parsed.kind === 'weekday') WEEKDAYS.forEach(d => results.add(d));
        else if (parsed.kind === 'month') MONTHS.forEach(m => results.add(m));
        else if (parsed.kind === 'timer_profile') (registry.timer_profiles || []).forEach(p => results.add(p));
      }
      if (matchedAny) return { list: Array.from(results).sort(), current };
    }

    if (baseTokens.length === 1) {
      const subs = registry.commands?.[cmd]?.subcommands || [];
      subs.forEach(s => results.add(s));
    }

    return { list: Array.from(results).sort(), current };
  }

  function renderSuggestions(value) {
    if (!registryLoaded) {
      if (!registryLoading) {
        registryLoading = loadRegistry().finally(() => {
          registryLoaded = true;
          registryLoading = null;
          renderSuggestions(inEl.value || '');
        });
      }
      return;
    }
    const { list, current } = buildSuggestions(value);
    const needle = normalizeWord(current).toLowerCase();
    suggestions = list.filter(s => !needle || s.toLowerCase().startsWith(needle));
    suggestIndex = suggestions.length ? 0 : -1;
    if (!suggestions.length) {
      suggestEl.style.display = 'none';
      ghostEl.textContent = '';
      return;
    }
    const top = suggestions[0];
    ghostEl.textContent = current ? (current + top.slice(current.length)) : top;

    // Update position
    const rect = inEl.getBoundingClientRect();
    suggestEl.style.top = (rect.bottom + 4) + 'px';
    suggestEl.style.left = rect.left + 'px';
    suggestEl.style.width = rect.width + 'px';

    suggestEl.innerHTML = suggestions.map((s, idx) => {
      const active = idx === suggestIndex;
      const bg = active ? '#1a2334' : 'transparent';
      const color = '#e6e8ef';
      return `<div class="term-suggest-item" data-idx="${idx}" style="padding:6px 8px; cursor:pointer; font-size:12px; color:${color}; background:${bg}; transition:background 0.1s;">${s}</div>`;
    }).join('');
    suggestEl.style.display = 'block';
  }

  function applySuggestion(index) {
    if (!suggestions.length || index < 0) return;
    const value = inEl.value;
    const endsWithSpace = /\s$/.test(value);
    const tokens = splitArgs(value);
    const quoteIfNeeded = (text) => {
      if (!text) return text;
      if (/[\s]/.test(text) && !/^["']/.test(text)) {
        return `"${text}"`;
      }
      return text;
    };
    if (endsWithSpace || !tokens.length) {
      inEl.value = value + quoteIfNeeded(suggestions[index]) + ' ';
    } else {
      tokens[tokens.length - 1] = quoteIfNeeded(suggestions[index]);
      inEl.value = tokens.join(' ') + ' ';
    }
    renderSuggestions(inEl.value);
  }

  suggestEl.addEventListener('mousedown', (e) => {
    const row = e.target?.closest?.('.term-suggest-item');
    if (!row) return;
    const idx = Number(row.dataset.idx || 0);
    applySuggestion(idx);
    inEl.focus();
  });

  async function runCli(line) {
    if (!line.trim()) return;
    println(`${whoEl.textContent}> ${line}`);
    const parts = splitArgs(line.trim());
    const cmd = parts.shift() || '';
    // vars helper: set/unset
    if (cmd.toLowerCase() === 'vars') {
      try {
        const r = await fetch(apiBase() + "/api/vars");
        const j = await r.json();
        println(JSON.stringify(j?.vars || {}, null, 2));
      } catch (e) { println(String(e)); }
      return;
    }
    if (cmd.toLowerCase() === 'set') {
      const kv = {}; for (const token of parts) { const [k, ...rest] = token.split(':'); if (!k) continue; kv[k] = rest.join(':'); }
      try { const r = await postYaml(apiBase() + "/api/vars", { set: kv }); const j = await r.json(); println('vars set'); try { context?.bus?.emit('vars:changed'); } catch { } } catch (e) { println(String(e)); }
      return;
    }
    if (cmd.toLowerCase() === 'unset') {
      try { const r = await postYaml(apiBase() + "/api/vars", { unset: parts }); const j = await r.json(); println('vars unset'); try { context?.bus?.emit('vars:changed'); } catch { } } catch (e) { println(String(e)); }
      return;
    }
    if (cmd.toLowerCase() === 'exit') {
      try {
        const r = await fetch(apiBase() + "/api/profile"); const j = await r.json(); const prof = j?.profile || {};
        const bye = prof.exit_message || prof.goodbye_message || prof.goodbye || (prof.console && (prof.console.exit_message || prof.console.goodbye_message)) || {};
        let lines = [];
        if (typeof bye === 'string') lines = [bye];
        else if (Array.isArray(bye)) lines = bye.slice();
        else if (typeof bye === 'object') {
          const keys = Object.keys(bye).filter(k => /^line\d+$/i.test(k)).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')));
          for (const k of keys) { if (bye[k]) lines.push(bye[k]); }
        }
        if (!lines.length) lines = ["Safe travels, @nickname.", "Returning you to baseline reality..."];
        try { await (window.ChronosVars && window.ChronosVars.refresh && window.ChronosVars.refresh(true)); } catch { }
        for (const ln of lines) { const out = (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(ln)) : String(ln); println(out.replace('@nickname', whoEl.textContent.split('@')[1] || 'user')); }
      } catch { println('Goodbye.'); }
      el.style.display = 'none'; return;
    }
    // Expand arguments if toggle is on (except for vars/set/unset/exit)
    try {
      if (expandChk && expandChk.checked && !['vars', 'set', 'unset', 'exit'].includes(cmd.toLowerCase())) {
        const exp = (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand : (s) => s;
        for (let i = 0; i < parts.length; i++) { parts[i] = exp(parts[i]); }
      }
    } catch { }
    // Check registry
    let endpoint = '/api/cli';
    let payload_key = 'command';
    let extra_payload = { args: parts, properties: {} };

    // If not in registry (and registry loaded), assume shell execution
    if (registryLoaded && !registry.commands[cmd] && !registry.aliases[cmd]) {
      endpoint = '/api/shell/exec';
      payload_key = 'cmd';
      extra_payload = {}; // args are part of cmd string for shell exec?
      // For shell exec, we need the full original line or reconstruct it
      // The endpoint expects { cmd: "full command line" }
      // We stripped the first token 'cmd' from parts.
      // Let's reconstruct or pass 'line'
      extra_payload = {};
    }

    // Run real CLI or Shell
    try {
      let body = {};
      if (endpoint === '/api/shell/exec') {
        // For shell, send raw line less any potential initial spaces
        body = { cmd: line.trim() };
      } else {
        // For internal CLI
        body = { command: cmd, args: parts, properties: {} };
      }

      const r = await postYaml(apiBase() + endpoint, body);
      let payload = null;
      try {
        payload = await r.json();
      } catch {
        try {
          const text = await r.text();
          if (text && text.trim().startsWith('{')) payload = JSON.parse(text);
        } catch { }
      }
      if (payload && typeof payload === 'object') {
        const out = payload.stdout || '';
        const err = payload.stderr || payload.error || '';
        if (out) println(out);
        if (err) println(err);
        if (!out && !err && payload.ok === false) println('Command failed.');
      } else {
        const text = await r.text();
        if (text) println(text);
      }
    } catch (e) {
      println(String(e));
    }
  }

  const hist = []; let hi = -1;
  inEl.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      if (suggestions.length) {
        e.preventDefault();
        applySuggestion(suggestIndex >= 0 ? suggestIndex : 0);
        return;
      }
      e.preventDefault(); const line = inEl.value; inEl.value = ''; hist.push(line); hi = hist.length; await runCli(line);
    } else if (suggestions.length && e.key === 'ArrowUp') {
      e.preventDefault();
      suggestIndex = Math.max(0, suggestIndex - 1);
      renderSuggestions(inEl.value);
    } else if (suggestions.length && e.key === 'ArrowDown') {
      e.preventDefault();
      suggestIndex = Math.min(suggestions.length - 1, suggestIndex + 1);
      renderSuggestions(inEl.value);
    } else if (e.key === 'ArrowUp') {
      if (hi > 0) { hi--; inEl.value = hist[hi] || ''; setTimeout(() => inEl.setSelectionRange(inEl.value.length, inEl.value.length), 0); }
    } else if (e.key === 'ArrowDown') {
      if (hi < hist.length) { hi++; inEl.value = hist[hi] || ''; setTimeout(() => inEl.setSelectionRange(inEl.value.length, inEl.value.length), 0); }
    } else if (e.key === 'Tab') {
      if (suggestions.length) {
        e.preventDefault();
        applySuggestion(suggestIndex >= 0 ? suggestIndex : 0);
      }
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      outEl.textContent = '';
    }
  });

  inEl.addEventListener('input', () => {
    renderSuggestions(inEl.value);
  });

  inEl.addEventListener('focus', () => {
    renderSuggestions(inEl.value || '');
  });

  inEl.addEventListener('blur', () => {
    setTimeout(() => { suggestEl.style.display = 'none'; ghostEl.textContent = ''; }, 150);
  });

  async function loadRegistry() {
    try {
      const [cmdRes, itemRes, propRes] = await Promise.all([
        fetch(apiBase() + '/api/registry?name=command'),
        fetch(apiBase() + '/api/registry?name=item'),
        fetch(apiBase() + '/api/registry?name=property'),
      ]);
      if (!cmdRes.ok || !itemRes.ok || !propRes.ok) {
        throw new Error(`Registry fetch failed: ${cmdRes.status}/${itemRes.status}/${propRes.status}`);
      }
      const cmdJson = await cmdRes.json();
      const itemJson = await itemRes.json();
      const propJson = await propRes.json();
      registry.commands = cmdJson?.registry?.commands || {};
      registry.aliases = cmdJson?.registry?.aliases || {};
      registry.item_types = itemJson?.registry?.item_types || [];
      registry.item_names_by_type = itemJson?.registry?.item_names_by_type || {};
      registry.properties = propJson?.registry?.properties || {};
      registry.status_indicators = propJson?.registry?.status_indicators || [];
      registry.timer_profiles = propJson?.registry?.timer_profiles || [];
      registry.defaults_keys_by_type = propJson?.registry?.defaults_keys_by_type || {};
      registryLoaded = true;
    } catch (e) {
      registryLoaded = true;
      try { console.warn('[Chronos][Terminal] Registry load failed', e); } catch { }
    }
  }

  btnClose.addEventListener('click', () => {
    println('Goodbye.');
    el.style.display = 'none';
    suggestEl.style.display = 'none';
    try { context?.bus?.emit('widget:closed', 'Terminal'); } catch { }
  });
  btnMin.addEventListener('click', () => { const c = el.querySelector('.content'); if (!c) return; c.style.display = (c.style.display === 'none' ? '' : 'none'); });
  btnCopy.addEventListener('click', () => {
    const text = outEl.innerText;
    navigator.clipboard.writeText(text).then(() => {
      const original = btnCopy.textContent;
      btnCopy.textContent = '✓';
      setTimeout(() => btnCopy.textContent = original, 1000);
    }).catch(err => {
      println('Copy failed: ' + err);
    });
  });

  // Resizers
  function edgeDrag(startRect, cb) { return (ev) => { ev.preventDefault(); function move(e) { cb(e, startRect); } function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); } window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); } }
  const re = el.querySelector('.resizer.e'); const rs = el.querySelector('.resizer.s'); const rse = el.querySelector('.resizer.se');
  if (re) re.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(360, e.clientX - sr.left) + 'px'; })(ev); });
  if (rs) rs.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.height = Math.max(220, e.clientY - sr.top) + 'px'; })(ev); });
  if (rse) rse.addEventListener('pointerdown', (ev) => { const r = el.getBoundingClientRect(); edgeDrag(r, (e, sr) => { el.style.width = Math.max(360, e.clientX - sr.left) + 'px'; el.style.height = Math.max(220, e.clientY - sr.top) + 'px'; })(ev); });

  loadProfile();
  loadRegistry();

  // Listen for external commands
  const busHandler = (cmd) => {
    if (el.style.display === 'none') {
      el.style.display = 'flex'; // Ensure visible
      // try to maximize if minimized? 
      const c = el.querySelector('.content');
      if (c && c.style.display === 'none') c.style.display = '';
    }
    // Simulate typing or just run?
    // Let's just run it to be fast, but maybe show it in history?
    hist.push(cmd);
    hi = hist.length;
    runCli(cmd);
  };

  if (context && context.bus) {
    context.bus.on('terminal:input', busHandler);
  } else if (window.ChronosBus) {
    // Fallback
    window.ChronosBus.on('terminal:input', busHandler);
  }

  return {
    unmount() {
      if (context && context.bus) context.bus.off('terminal:input', busHandler);
      else if (window.ChronosBus && window.ChronosBus.off) window.ChronosBus.off('terminal:input', busHandler);

      try {
        if (suggestEl && suggestEl.parentNode) suggestEl.parentNode.removeChild(suggestEl);
      } catch { }
    }
  };
}
