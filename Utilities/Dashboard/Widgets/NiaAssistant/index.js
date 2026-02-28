export function mount(el, context) {
  if (!document.getElementById('nia-assistant-css')) {
    const link = document.createElement('link');
    link.id = 'nia-assistant-css';
    link.rel = 'stylesheet';
    link.href = './Widgets/NiaAssistant/nia-assistant.css';
    document.head.appendChild(link);
  }

  el.className = 'widget nia-assistant-widget';

  el.innerHTML = `
    <div class="nia-shell" id="niaShell">
      <button type="button" class="nia-orb" id="niaOrb" aria-expanded="false" title="Open Nia AI Assistant">
        <span class="nia-orb-letter">Nia</span>
      </button>

      <section class="nia-panel" id="niaPanel" aria-label="Nia AI Assistant">
        <header class="nia-panel-header header" id="niaHeader">
          <div class="nia-title-wrap">
            <div class="nia-title">Nia AI Assistant</div>
            <div class="nia-subtitle">Chronos copilot</div>
          </div>
          <div class="controls">
            <button class="icon-btn" id="niaMin" title="Collapse">_</button>
            <button class="icon-btn" id="niaSettingsBtn" title="Nia settings">⚙</button>
            <button class="icon-btn" id="niaClose" title="Close">x</button>
          </div>
        </header>
        <div class="nia-content content">
          <section class="nia-settings" id="niaSettings" hidden>
            <div class="nia-settings-head">
              <div class="nia-settings-title">Nia Settings</div>
              <button class="icon-btn" id="niaSettingsClose" title="Close settings">x</button>
            </div>
            <button class="btn nia-settings-btn" id="niaEditAgentPrefs" type="button">Edit Agent Preferences</button>
            <button class="btn nia-settings-btn" id="niaEditPrefSettings" type="button">Edit Preference Settings</button>
            <button class="btn nia-settings-btn" id="niaEditPilotBrief" type="button">Edit Pilot Brief</button>
            <button class="btn nia-settings-btn" id="niaManageMemories" type="button">Manage Memories</button>
            <label class="nia-settings-label" for="niaAgentCli">AI Agent CLI</label>
            <select class="nia-settings-select" id="niaAgentCli">
              <option value="codex">Codex</option>
              <option value="gemini">Gemini</option>
            </select>
            <label class="nia-settings-toggle">
              <input type="checkbox" id="niaUseMemories" />
              <span>Use memories</span>
            </label>
            <div class="nia-settings-actions">
              <button class="btn" id="niaDeleteMemories" type="button">Delete memories</button>
            </div>
          </section>
          <div class="nia-log" id="niaLog" aria-live="polite">
          </div>
          <div class="nia-input-row">
            <div class="nia-add-wrap" id="niaAddWrap">
              <button class="btn nia-attach" id="niaAdd" type="button" title="More actions" aria-label="More actions">+</button>
              <div class="nia-add-menu" id="niaAddMenu" role="menu" aria-label="Nia actions">
                <button class="nia-add-item" id="niaMenuAttach" type="button" role="menuitem">
                  <span class="nia-add-icon">📎</span>
                  <span class="nia-add-label">Attach a file</span>
                </button>
                <button class="nia-add-item" id="niaMenuWizards" type="button" role="menuitem">
                  <span class="nia-add-icon">🪄</span>
                  <span class="nia-add-label">Wizards</span>
                </button>
              </div>
            </div>
            <input class="input nia-input" id="niaInput" placeholder="Prompt Nia..." />
            <button class="btn btn-primary nia-send" id="niaSend" type="button">Send</button>
            <input id="niaFileInput" type="file" multiple hidden />
          </div>
        </div>
      </section>
    </div>
  `;

  const shell = el.querySelector('#niaShell');
  const orb = el.querySelector('#niaOrb');
  const panel = el.querySelector('#niaPanel');
  const btnMin = el.querySelector('#niaMin');
  const btnSettings = el.querySelector('#niaSettingsBtn');
  const btnClose = el.querySelector('#niaClose');
  const settingsPane = el.querySelector('#niaSettings');
  const settingsClose = el.querySelector('#niaSettingsClose');
  const btnEditAgentPrefs = el.querySelector('#niaEditAgentPrefs');
  const btnEditPrefSettings = el.querySelector('#niaEditPrefSettings');
  const btnEditPilotBrief = el.querySelector('#niaEditPilotBrief');
  const btnManageMemories = el.querySelector('#niaManageMemories');
  const selAgentCli = el.querySelector('#niaAgentCli');
  const chkUseMemories = el.querySelector('#niaUseMemories');
  const btnDeleteMemories = el.querySelector('#niaDeleteMemories');
  const send = el.querySelector('#niaSend');
  const addBtn = el.querySelector('#niaAdd');
  const addMenu = el.querySelector('#niaAddMenu');
  const menuAttach = el.querySelector('#niaMenuAttach');
  const menuWizards = el.querySelector('#niaMenuWizards');
  const fileInput = el.querySelector('#niaFileInput');
  const input = el.querySelector('#niaInput');
  const log = el.querySelector('#niaLog');
  const header = el.querySelector('#niaHeader');
  const familiarId = 'nia';
  let pendingFiles = [];
  let isSending = false;
  let userName = 'You';
  let userAvatarUrl = '';
  let niaName = 'Nia';
  let niaAvatarUrl = '';
  let aducBaseUrl = 'http://127.0.0.1:8080';
  let initialGreetingBubble = null;

  function apiBase() {
    const origin = window.location.origin;
    if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://127.0.0.1:7357';
    return origin;
  }

  async function apiGet(path) {
    const resp = await fetch(apiBase() + path);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
    return data;
  }

  async function apiPost(path, body) {
    const resp = await fetch(apiBase() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false || data.error) throw new Error(data.error || `HTTP ${resp.status}`);
    return data;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const NIA_PREFS_PATH = 'Agents Dress Up Committee/familiars/nia/docs/preferences.md';
  const NIA_MEM_PATH = 'Agents Dress Up Committee/familiars/nia/docs/memories.md';
  const NIA_MEMORY_JSON_PATH = 'Agents Dress Up Committee/familiars/nia/memory.json';
  const PREF_SETTINGS_PATH = 'User/Profile/preferences_settings.yml';
  const PILOT_BRIEF_PATH = 'User/Profile/pilot_brief.md';

  function fallbackAvatarDataUrl(label) {
    const txt = encodeURIComponent(String(label || '?').slice(0, 1).toUpperCase() || '?');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#243044"/><text x="50%" y="54%" font-family="Arial" font-size="26" fill="#dcecff" text-anchor="middle">${txt}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function setAducBaseFrom(statusObj) {
    const url = String(statusObj?.url || '').trim();
    if (url) aducBaseUrl = url.replace(/\/+$/, '');
    niaAvatarUrl = `${aducBaseUrl}/familiars/${encodeURIComponent(familiarId)}/profile/profile.png`;
  }

  function refreshAssistantIdentityInLog() {
    const avatarSrc = niaAvatarUrl ? `${niaAvatarUrl}?t=${Date.now()}` : fallbackAvatarDataUrl('N');
    try {
      el.querySelectorAll('.nia-row-assistant .nia-person-avatar').forEach((img) => {
        img.src = avatarSrc;
        img.onerror = () => { img.src = fallbackAvatarDataUrl(niaName); };
      });
      el.querySelectorAll('.nia-row-assistant .nia-person-name').forEach((nameEl) => {
        nameEl.textContent = niaName;
      });
    } catch { }
  }

  async function loadNiaIdentity() {
    try {
      const data = await apiGet('/api/aduc/familiars');
      const list = Array.isArray(data?.familiars) ? data.familiars : [];
      const found = list.find((f) => String(f?.id || '').toLowerCase() === familiarId);
      const n = String(found?.name || '').trim();
      if (n) niaName = n;
    } catch { }
    refreshAssistantIdentityInLog();
  }

  async function loadUserIdentity() {
    try {
      const data = await apiGet('/api/profile');
      const profile = data?.profile || {};
      const nick = String(profile?.nickname || '').trim();
      if (nick) userName = nick;
    } catch { }
    userAvatarUrl = `${apiBase()}/api/profile/avatar`;
    try {
      if (initialGreetingBubble) initialGreetingBubble.textContent = `Hello ${userName}, I'm Nia. How can I help you today?`;
    } catch { }
  }

  function senderMeta(role) {
    if (role === 'user') {
      return { name: userName || 'You', avatar: userAvatarUrl || fallbackAvatarDataUrl('U') };
    }
    return { name: niaName || 'Nia', avatar: niaAvatarUrl || fallbackAvatarDataUrl('N') };
  }

  async function ensureAducReady() {
    let st = await apiGet('/api/aduc/status').catch(() => null);
    if (st?.running) {
      setAducBaseFrom(st);
      await loadNiaIdentity();
      return true;
    }
    const started = await apiGet('/api/aduc/start').catch(() => null);
    if (started) setAducBaseFrom(started);
    for (let i = 0; i < 40; i += 1) {
      await sleep(350);
      st = await apiGet('/api/aduc/status').catch(() => null);
      if (st?.running) {
        setAducBaseFrom(st);
        await loadNiaIdentity();
        return true;
      }
    }
    return false;
  }

  async function waitForReply(turnId) {
    for (let i = 0; i < 120; i += 1) {
      const q = `/api/aduc/cli/status?familiar=${encodeURIComponent(familiarId)}&turn_id=${encodeURIComponent(turnId)}`;
      const st = await apiGet(q).catch(() => null);
      if (st?.status === 'responded') return st;
      if (st?.status === 'cancelled') throw new Error('Cancelled.');
      await sleep(900);
    }
    throw new Error('Timed out waiting for Nia reply.');
  }

  const STATE_KEY = 'chronos_nia_widget_open_v1';

  function normalizeAgentCli(value) {
    const next = String(value || '').trim().toLowerCase();
    return next === 'gemini' ? 'gemini' : 'codex';
  }

  function escapeHtml(text) {
    return String(text || '').replace(/[&<>"']/g, (ch) => (
      ch === '&' ? '&amp;'
        : ch === '<' ? '&lt;'
        : ch === '>' ? '&gt;'
        : ch === '"' ? '&quot;'
        : '&#39;'
    ));
  }

  function formatInlineMarkdown(text) {
    let s = escapeHtml(text);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    return s;
  }

  function markdownToHtml(md) {
    const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let inCode = false;
    let code = [];
    let listType = null;
    let quoteOpen = false;
    let para = [];

    const flushPara = () => {
      if (!para.length) return;
      out.push(`<p>${formatInlineMarkdown(para.join(' '))}</p>`);
      para = [];
    };
    const closeList = () => {
      if (!listType) return;
      out.push(listType === 'ol' ? '</ol>' : '</ul>');
      listType = null;
    };
    const closeQuote = () => {
      if (!quoteOpen) return;
      out.push('</blockquote>');
      quoteOpen = false;
    };

    for (const lineRaw of lines) {
      const line = lineRaw || '';
      const trim = line.trim();

      if (inCode) {
        if (/^```/.test(trim)) {
          out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
          inCode = false;
          code = [];
        } else {
          code.push(line);
        }
        continue;
      }

      if (/^```/.test(trim)) {
        flushPara();
        closeList();
        closeQuote();
        inCode = true;
        code = [];
        continue;
      }

      if (!trim) {
        flushPara();
        closeList();
        closeQuote();
        continue;
      }

      const heading = trim.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushPara();
        closeList();
        closeQuote();
        const level = heading[1].length;
        out.push(`<h${level}>${formatInlineMarkdown(heading[2])}</h${level}>`);
        continue;
      }

      if (/^---+$/.test(trim) || /^\*\*\*+$/.test(trim)) {
        flushPara();
        closeList();
        closeQuote();
        out.push('<hr/>');
        continue;
      }

      const quote = trim.match(/^>\s?(.*)$/);
      if (quote) {
        flushPara();
        closeList();
        if (!quoteOpen) {
          out.push('<blockquote>');
          quoteOpen = true;
        }
        out.push(`<p>${formatInlineMarkdown(quote[1])}</p>`);
        continue;
      }

      const ol = trim.match(/^\d+\.\s+(.+)$/);
      if (ol) {
        flushPara();
        closeQuote();
        if (listType !== 'ol') {
          closeList();
          out.push('<ol>');
          listType = 'ol';
        }
        out.push(`<li>${formatInlineMarkdown(ol[1])}</li>`);
        continue;
      }

      const ul = trim.match(/^[-*]\s+(.+)$/);
      if (ul) {
        flushPara();
        closeQuote();
        if (listType !== 'ul') {
          closeList();
          out.push('<ul>');
          listType = 'ul';
        }
        out.push(`<li>${formatInlineMarkdown(ul[1])}</li>`);
        continue;
      }

      closeList();
      closeQuote();
      para.push(trim);
    }

    flushPara();
    closeList();
    closeQuote();

    if (inCode) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    return out.join('\n');
  }

  function stripHiddenControlLines(text) {
    let out = String(text || '');
    // Remove full-line hearts directives, with or without angle brackets.
    out = out.replace(/^\s*<?\s*hearts\s*:\s*[^>\r\n]+>?\s*$/gim, '');
    // Remove inline hearts tags if present.
    out = out.replace(/<\s*hearts\s*:\s*[^>]+>/gi, '');
    return out.trim();
  }

  const appendMsg = (text, role, opts = {}) => {
    if (!log) return;
    const meta = senderMeta(role);

    const rowEl = document.createElement('div');
    rowEl.className = `nia-row ${role === 'user' ? 'nia-row-user' : 'nia-row-assistant'}`;

    const person = document.createElement('div');
    person.className = 'nia-person';

    const avatar = document.createElement('img');
    avatar.className = 'nia-person-avatar';
    avatar.alt = `${meta.name} avatar`;
    avatar.src = meta.avatar;
    avatar.onerror = () => { avatar.src = fallbackAvatarDataUrl(meta.name); };
    person.appendChild(avatar);

    const nameEl = document.createElement('div');
    nameEl.className = 'nia-person-name';
    nameEl.textContent = meta.name;
    person.appendChild(nameEl);

    const bubble = document.createElement('div');
    bubble.className = `nia-msg ${role === 'user' ? 'nia-msg-user' : 'nia-msg-assistant'}`;
    if (opts.markdown) bubble.innerHTML = markdownToHtml(String(text || ''));
    else bubble.textContent = String(text || '');
    if (role === 'user') {
      rowEl.appendChild(bubble);
      rowEl.appendChild(person);
    } else {
      rowEl.appendChild(person);
      rowEl.appendChild(bubble);
    }

    log.appendChild(rowEl);
    log.scrollTop = log.scrollHeight;
    return bubble;
  };
  const setBusy = (busy) => {
    isSending = !!busy;
    if (send) send.disabled = !!busy;
    if (input) input.disabled = !!busy;
  };

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
        appendMsg('Notes widget bus not available.', 'assistant');
        return;
      }
      showNotesWidget();
      closeSettings();
    } catch {
      appendMsg('Could not open Notes widget.', 'assistant');
    }
  }

  async function loadNiaSettingsState() {
    const ready = await ensureAducReady();
    if (!ready) throw new Error('ADUC is not ready.');
    const data = await apiGet('/api/aduc/settings');
    if (chkUseMemories) chkUseMemories.checked = !!data?.include_memory;
    if (selAgentCli) {
      const cli = normalizeAgentCli(data?.cli_backend);
      selAgentCli.value = cli;
      selAgentCli.dataset.lastValue = cli;
    }
  }

  async function setUseMemories(enabled) {
    const ready = await ensureAducReady();
    if (!ready) throw new Error('ADUC is not ready.');
    await apiPost('/api/aduc/settings', { include_memory: !!enabled });
  }

  async function setAgentCli(value) {
    const ready = await ensureAducReady();
    if (!ready) throw new Error('ADUC is not ready.');
    const cli = normalizeAgentCli(value);
    await apiPost('/api/aduc/settings', { cli_backend: cli });
    try { context?.bus?.emit('nia:agent-cli-changed', { cli }); } catch { }
    return cli;
  }

  async function deleteNiaMemories() {
    await ensureAducReady();
    await Promise.all([
      apiPost('/api/file/write', { path: NIA_MEMORY_JSON_PATH, content: '{\n  "entries": []\n}\n' }),
      apiPost('/api/aduc/cli/memory/clear', { familiar: familiarId }),
    ]);
  }

  const openSettings = async () => {
    settingsPane?.removeAttribute('hidden');
    panel?.classList.add('is-settings-open');
    try {
      await loadNiaSettingsState();
    } catch {
      appendMsg('Failed to load Nia settings state.', 'assistant');
    }
  };
  const closeSettings = () => {
    settingsPane?.setAttribute('hidden', 'hidden');
    panel?.classList.remove('is-settings-open');
  };

  const startThinkingIndicator = () => {
    const bubble = appendMsg('Thinking. (0s)', 'assistant');

    let secs = 0;
    let dots = 1;
    const timer = window.setInterval(() => {
      secs += 1;
      dots = (dots % 3) + 1;
      if (bubble) bubble.textContent = `Thinking${'.'.repeat(dots)} (${secs}s)`;
      if (log) log.scrollTop = log.scrollHeight;
    }, 1000);

    return {
      bubble,
      stop() {
        try { window.clearInterval(timer); } catch { }
      },
    };
  };

  const setOpen = (open) => {
    shell?.classList.toggle('is-open', !!open);
    orb?.setAttribute('aria-expanded', open ? 'true' : 'false');
    try { localStorage.setItem(STATE_KEY, open ? '1' : '0'); } catch { }
  };

  let isOpen = false;
  try { isOpen = localStorage.getItem(STATE_KEY) === '1'; } catch { }
  setOpen(isOpen);
  if (selAgentCli) selAgentCli.value = 'codex';
  niaAvatarUrl = `${apiBase()}/api/nia/profile/avatar`;
  loadUserIdentity().catch(() => { });
  initialGreetingBubble = appendMsg(`Hello ${userName}, I'm Nia. How can I help you today?`, 'assistant');

  orb?.addEventListener('click', () => {
    isOpen = !shell.classList.contains('is-open');
    setOpen(isOpen);
    if (isOpen) input?.focus();
  });
  btnMin?.addEventListener('click', () => setOpen(false));
  btnSettings?.addEventListener('click', () => {
    if (settingsPane?.hasAttribute('hidden')) openSettings();
    else closeSettings();
  });
  settingsClose?.addEventListener('click', closeSettings);
  btnEditAgentPrefs?.addEventListener('click', () => openFileInNotes(NIA_PREFS_PATH, 'nia agent preferences'));
  btnEditPrefSettings?.addEventListener('click', () => openFileInNotes(PREF_SETTINGS_PATH, 'preferences settings', 'yaml'));
  btnEditPilotBrief?.addEventListener('click', () => openFileInNotes(PILOT_BRIEF_PATH, 'pilot brief'));
  btnManageMemories?.addEventListener('click', () => openFileInNotes(NIA_MEM_PATH, 'nia memories'));
  selAgentCli?.addEventListener('change', () => {
    const previous = normalizeAgentCli(selAgentCli.dataset.lastValue || selAgentCli.value || 'codex');
    const selected = normalizeAgentCli(selAgentCli.value);
    setAgentCli(selected)
      .then((saved) => {
        selAgentCli.dataset.lastValue = saved;
        selAgentCli.value = saved;
        appendMsg(`AI agent CLI set to ${saved}.`, 'assistant');
      })
      .catch(() => {
        selAgentCli.value = previous;
        appendMsg('Failed to update AI agent CLI.', 'assistant');
      });
  });
  chkUseMemories?.addEventListener('change', () => {
    setUseMemories(!!chkUseMemories.checked)
      .then(() => appendMsg(`Use memories ${chkUseMemories.checked ? 'enabled' : 'disabled'}.`, 'assistant'))
      .catch(() => {
        appendMsg('Failed to update Use memories setting.', 'assistant');
        chkUseMemories.checked = !chkUseMemories.checked;
      });
  });
  btnDeleteMemories?.addEventListener('click', () => {
    const ok = window.confirm('Delete Nia memories and clear conversation history for Nia?');
    if (!ok) return;
    deleteNiaMemories()
      .then(() => appendMsg('Nia memories deleted.', 'assistant'))
      .catch(() => appendMsg('Failed to delete Nia memories.', 'assistant'));
  });
  btnClose?.addEventListener('click', () => { el.style.display = 'none'; });

  const onSend = () => {
    if (isSending) return;
    const text = String(input?.value || '').trim();
    if (!text) return;
    const fileLine = pendingFiles.length ? `\n\nAttached files: ${pendingFiles.join(', ')}` : '';
    const outbound = `${text}${fileLine}`;
    appendMsg(text, 'user');
    if (pendingFiles.length) appendMsg(`Attached: ${pendingFiles.join(', ')}`, 'assistant');
    pendingFiles = [];
    if (fileInput) fileInput.value = '';
    if (input) input.value = '';
    setBusy(true);
    const thinking = startThinkingIndicator();
    (async () => {
      const ready = await ensureAducReady();
      if (!ready) throw new Error('ADUC did not start in time.');
      const chat = await apiPost('/api/aduc/chat', { familiar: familiarId, message: outbound });
      const turnId = String(chat?.turn_id || '').trim();
      if (!turnId) throw new Error('Missing turn id from ADUC.');
      const reply = await waitForReply(turnId);
      thinking.stop();
      if (thinking.bubble) {
        const cleanedReply = stripHiddenControlLines(String(reply?.reply || '...'));
        thinking.bubble.innerHTML = markdownToHtml(cleanedReply || '...');
      }
    })().catch((err) => {
      thinking.stop();
      if (thinking.bubble) {
        thinking.bubble.textContent = `Nia connection error: ${String(err?.message || err || 'unknown error')}`;
      }
    }).finally(() => {
      thinking.stop();
      setBusy(false);
      input?.focus();
    });
  };
  send?.addEventListener('click', onSend);
  const closeAddMenu = () => addMenu?.classList.remove('open');
  addBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    addMenu?.classList.toggle('open');
  });
  menuAttach?.addEventListener('click', () => {
    closeAddMenu();
    fileInput?.click();
  });
  menuWizards?.addEventListener('click', () => {
    closeAddMenu();
    appendMsg('Wizards menu coming soon.', 'assistant');
  });
  document.addEventListener('click', (ev) => {
    const target = ev.target;
    if (!(target instanceof Node)) return;
    if (!el.contains(target)) return;
    if (target === addBtn || addBtn?.contains(target)) return;
    if (target === addMenu || addMenu?.contains(target)) return;
    closeAddMenu();
  });
  fileInput?.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;
    pendingFiles = files.map((f) => f.name);
    appendMsg(`Queued attachments: ${pendingFiles.join(', ')}`, 'assistant');
  });
  input?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      onSend();
    }
  });

  try {
    context?.bus?.on('nia:open-settings', () => {
      setOpen(true);
      void openSettings();
      try { input?.focus(); } catch { }
    });
  } catch { }

  // Optional light drag by panel header.
  header?.addEventListener('pointerdown', (ev) => {
    const rect = panel?.getBoundingClientRect();
    if (!rect) return;
    const offX = ev.clientX - rect.left;
    const offY = ev.clientY - rect.top;
    const move = (e) => {
      if (!panel) return;
      panel.style.left = `${Math.max(6, e.clientX - offX)}px`;
      panel.style.top = `${Math.max(44, e.clientY - offY)}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  try { context?.bus?.emit('nia:mounted'); } catch { }
  return {};
}
