
let viewContainer = null;
let tabs = [];
let activeTabIndex = -1;
let lastSearch = { query: '', options: { matchCase: false, regex: false, wholeWord: false } };
let lastReplace = { query: '', replace: '' };

// Settings State
let settings = {
    tabSize: 4,
    autoSave: false,
    theme: 'dark', // dark, light
    wordWrap: false,
    lineNumbers: true,
    fontSize: 14,
    showSidebar: true,
    showStatusBar: true
};

function loadSettings() {
    try {
        const s = localStorage.getItem('chronos_editor_settings');
        if (s) {
            const parsed = JSON.parse(s);
            settings = { ...settings, ...parsed };
        }
    } catch { }
}

function saveSettings() {
    try {
        localStorage.setItem('chronos_editor_settings', JSON.stringify(settings));
    } catch { }
}

function applySettings() {
    if (!viewContainer) return;
    const textarea = viewContainer.querySelector('.code-area');
    const gutter = viewContainer.querySelector('#editorGutter');
    const highlight = viewContainer.querySelector('.code-highlight');
    const sidebar = viewContainer.querySelector('.editor-sidebar');
    const statusbar = viewContainer.querySelector('.editor-status-bar');

    // Theme (handled via CSS classes on container)
    viewContainer.classList.remove('theme-light', 'theme-dark');
    viewContainer.classList.add('theme-' + settings.theme);

    // Font Size
    const s = settings.fontSize + 'px';
    textarea.style.fontSize = s;
    gutter.style.fontSize = s;
    highlight.style.fontSize = s;

    // Word Wrap
    textarea.style.whiteSpace = settings.wordWrap ? 'pre-wrap' : 'pre';

    // Line Numbers
    gutter.style.display = settings.lineNumbers ? 'block' : 'none';
    if (settings.lineNumbers) updateGutter(textarea.value);

    // Sidebar
    if (sidebar) sidebar.style.display = settings.showSidebar ? 'flex' : 'none';

    // Status Bar
    if (statusbar) statusbar.style.display = settings.showStatusBar ? 'flex' : 'none';
}

function apiBase() {
    const o = window.location.origin;
    if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
    return o;
}

// Syntax logic (same as before)
const SYNTAX = {
    yml: [
        { regex: /^\s*#.*/gm, token: 'tok-comment' },
        { regex: /^(\s*)([\w\-\d]+)(:)/gm, token: (m) => `${m[1]}<span class="tok-key">${m[2]}</span>${m[3]}` },
        { regex: /(:)\s*(["'].*?["'])/g, token: (m) => `${m[1]} <span class="tok-val">${m[2]}</span>` },
    ],
    chs: [
        { regex: /^\s*#.*/gm, token: 'tok-comment' },
        { regex: /^\s*([A-Z_]+)/gm, token: (m) => `<span class="tok-cmd">${m[1]}</span>` },
        { regex: /(@\{?[a-zA-Z0-9_]+\}?)/g, token: '<span class="tok-flag">$1</span>' },
    ],
    json: [
        { regex: /^\s*(\/\/.*|\/\*[\s\S]*?\*\/)/gm, token: 'tok-comment' },
        { regex: /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")(\s*:)/g, token: (m) => `<span class="tok-key">${m[1]}</span>${m[3]}` },
        { regex: /(:)\s*("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")/g, token: (m) => `${m[1]} <span class="tok-str">${m[2]}</span>` },
        { regex: /\b(true|false|null)\b/g, token: '<span class="tok-val">$1</span>' },
        { regex: /\b-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, token: '<span class="tok-num">$&</span>' }
    ],
    md: [
        { regex: /^#+ .*/gm, token: '<span class="tok-cmd">$&</span>' }, // headers
        { regex: /`[^`]*`/g, token: '<span class="tok-str">$&</span>' }, // code
        { regex: /\*\*[^*]*\*\*/g, token: '<span class="tok-key">$&</span>' }, // bold
        { regex: /\*[^*]*\*/g, token: '<span class="tok-val">$&</span>' }, // italic
        { regex: /\[[^\]]*\]\([^)]*\)/g, token: '<span class="tok-prop">$&</span>' }, // links
    ]
};

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightCode(code, type) {
    let html = escapeHtml(code);
    if (type === 'chs') {
        const lines = html.split('\n');
        html = lines.map((line) => {
            if (/^\s*#/.test(line)) return line.replace(/^(\s*)(#.*)$/, '$1<span class="tok-comment">$2</span>');
            let out = line;
            out = out.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '<span class="tok-str">$&</span>');
            out = out.replace(/@\{?[A-Za-z0-9_.-]+\}?/g, '<span class="tok-var">$&</span>');
            out = out.replace(/\b(if|elseif|else|end|then)\b/gi, '<span class="tok-keyword">$1</span>');
            out = out.replace(/\b(and|or|xor|nor|not|matches|eq|ne|gt|lt|ge|le)\b|==|!=|>=|<=|[<>]/g, '<span class="tok-op">$&</span>');
            out = out.replace(/(^|\s)([A-Za-z][\w-]*)(:)/g, '$1<span class="tok-prop">$2</span>$3');
            out = out.replace(/(^|\s)(--?[\w-]+)/g, '$1<span class="tok-flag">$2</span>');
            out = out.replace(/^(\s*)([A-Za-z_][\w-]*)/g, '$1<span class="tok-cmd">$2</span>');
            out = out.replace(/\b\d+(?:\.\d+)?\b/g, '<span class="tok-num">$&</span>');
            return out;
        }).join('\n');
    } else if (type === 'yml' || type === 'yaml') {
        html = html.replace(/^(\s*)(#.*)$/gm, '$1<span class="tok-comment">$2</span>');
        html = html.replace(/^(\s*)([\w\-\d_]+)(:)/gm, '$1<span class="tok-key">$2</span>$3');
        html = html.replace(/(: )(["'].*?["'])/g, '$1<span class="tok-val">$2</span>');
    } else if (type === 'json') {
        html = html.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")(\s*:)/g, '<span class="tok-key">$1</span>$3');
        html = html.replace(/(:)\s*("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")/g, '$1<span class="tok-str">$2</span>');
        html = html.replace(/\b(true|false|null)\b/g, '<span class="tok-val">$1</span>');
        html = html.replace(/\b-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, '<span class="tok-num">$&</span>');
    } else if (type === 'md' || type === 'markdown') {
        html = html.replace(/^#+ .*/gm, '<span class="tok-cmd">$&</span>');
        html = html.replace(/`[^`]*`/g, '<span class="tok-str">$&</span>');
        html = html.replace(/\*\*[^*]*\*\*/g, '<span class="tok-key">$&</span>');
    }
    return html;
}

// Sidebar logic
async function loadFileTree(dirPath, parentEl) {
    parentEl.innerHTML = '<div style="padding:10px;color:gray">Loading...</div>';
    try {
        const r = await fetch(apiBase() + `/api/editor?path=${encodeURIComponent(dirPath)}`);
        const data = await r.json();
        if (!data.ok || !data.entries) throw new Error(data.error || 'Failed to load');
        parentEl.innerHTML = '';
        data.entries.forEach(entry => {
            const el = document.createElement('div');
            el.className = `file-node ${entry.is_dir ? 'is-dir' : ''}`;
            const icon = entry.is_dir ? '📁' : '📄';
            el.innerHTML = `<span class="icon">${icon}</span> <span class="label">${entry.name}</span>`;
            el.onclick = async (e) => {
                e.stopPropagation();
                const fullPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
                if (entry.is_dir) {
                    renderBreadcrumbs(fullPath, parentEl);
                    loadFileTree(fullPath, parentEl);
                } else {
                    openFile(fullPath);
                    document.querySelectorAll('.file-node').forEach(n => n.classList.remove('active-file'));
                    el.classList.add('active-file');
                }
            };
            parentEl.appendChild(el);
        });
    } catch (e) {
        parentEl.innerHTML = `<div style="color:red;padding:10px">Error: ${e.message}</div>`;
    }
}

function renderBreadcrumbs(path, containerEl) {
    let header = containerEl.previousElementSibling;
    if (!header || !header.classList.contains('editor-sidebar-header')) return;
    header.textContent = path || 'User';
    if (path && path !== 'User' && path !== '.') {
        const upBtn = document.createElement('button');
        upBtn.textContent = '⬆';
        upBtn.title = 'Up one level';
        upBtn.style.cssText = 'background:none; border:none; color:#ccc; float:right; cursor:pointer; font-size:12px;';
        upBtn.onclick = () => {
            const up = path.split('/').slice(0, -1).join('/') || 'User';
            loadFileTree(up, containerEl);
            renderBreadcrumbs(up, containerEl);
        };
        header.appendChild(upBtn);
    }
}

// Active Tab Logic
function getActiveTab() {
    if (activeTabIndex < 0 || activeTabIndex >= tabs.length) return null;
    return tabs[activeTabIndex];
}

async function openFile(path, encoding = null) {
    // Check if open
    const existingIdx = tabs.findIndex(t => t.path === path);
    if (existingIdx >= 0) {
        activeTabIndex = existingIdx;
        const tab = tabs[existingIdx];
        // If encoding specified and different, reload
        if (encoding && tab.encoding !== encoding) {
            tab.encoding = encoding;
            await reloadTabContent(tab);
        }
        renderTabs();
        loadTabContent();
        return;
    }

    // New tab
    const newTab = {
        path: path,
        name: path.split('/').pop(),
        content: '',
        unsaved: false,
        loading: true,
        pinned: false,
        unsaved: false,
        loading: true,
        pinned: false,
        encoding: encoding || 'utf-8',
        language: null
    };
    tabs.push(newTab);
    activeTabIndex = tabs.length - 1;
    renderTabs();

    // reset view
    const codeArea = viewContainer.querySelector('.code-area');
    const highlight = viewContainer.querySelector('.code-highlight');
    codeArea.value = '';
    highlight.innerHTML = 'Loading...';

    if (!path.startsWith('Untitled-')) {
        await reloadTabContent(newTab);
        addToRecentFiles(path);
    } else {
        newTab.loading = false;
        loadTabContent();
    }
}

async function reloadTabContent(tab) {
    tab.loading = true;
    try {
        const r = await fetch(apiBase() + `/api/editor?path=${encodeURIComponent(tab.path)}&encoding=${encodeURIComponent(tab.encoding)}`);
        const data = await r.json();
        if (!data.ok) throw new Error(data.error);

        tab.content = data.content || '';
        if (data.encoding) tab.encoding = data.encoding; // confirm from server
        tab.loading = false;
        loadTabContent();
    } catch (e) {
        tab.content = "Error loading file: " + e.message;
        tab.loading = false;
        loadTabContent();
    }
}

function loadTabContent() {
    const tab = getActiveTab();
    if (!tab) return;

    const codeArea = viewContainer.querySelector('.code-area');
    const highlight = viewContainer.querySelector('.code-highlight');

    codeArea.value = tab.content;
    const ext = tab.language || tab.path.split('.').pop().toLowerCase();

    updateHighlight(tab.content, ext);
    updateGutter(tab.content); // Update lines
    updateStatus(); // Update status bar
}

function renderTabs() {
    const tabsBar = viewContainer.querySelector('#editorTabs');
    tabsBar.innerHTML = '';

    // Sort logic: Pinned first
    const activeTab = getActiveTab();
    tabs.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
    });
    if (activeTab) activeTabIndex = tabs.indexOf(activeTab);

    tabs.forEach((tab, idx) => {
        const el = document.createElement('div');
        el.className = `editor-tab ${idx === activeTabIndex ? 'active' : ''}`;
        el.innerHTML = `
            <span class="tab-pin" style="margin-right:6px;opacity:${tab.pinned ? 1 : 0.3};cursor:pointer;">${tab.pinned ? '📌' : '📍'}</span>
            <span class="tab-name">${tab.name}${tab.unsaved ? ' *' : ''}</span>
            <span class="tab-close">×</span>
        `;

        // Pin handler
        el.querySelector('.tab-pin').addEventListener('click', (e) => {
            e.stopPropagation();
            togglePin(idx);
        });

        el.addEventListener('click', (e) => {
            if (e.target.closest('.tab-pin') || e.target.closest('.tab-close')) return;
            activeTabIndex = idx;
            renderTabs();
            loadTabContent();
        });

        el.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(idx);
        });

        tabsBar.appendChild(el);
    });
}

function togglePin(index) {
    if (tabs[index]) {
        tabs[index].pinned = !tabs[index].pinned;
        renderTabs();
    }
}

function showTabsDropdown(anchorEl) {
    const existing = document.getElementById('tabsDropdown');
    if (existing) { existing.remove(); return; }

    const rect = anchorEl.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.id = 'tabsDropdown';
    Object.assign(dropdown.style, {
        position: 'fixed',
        top: (rect.bottom + 4) + 'px',
        right: (window.innerWidth - rect.right) + 'px',
        background: '#252526',
        border: '1px solid #333',
        zIndex: 9999,
        minWidth: '150px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        maxHeight: '300px',
        overflowY: 'auto'
    });

    // Sort Option (Nested)
    const sortItem = document.createElement('div');
    sortItem.style.padding = '8px 12px';
    sortItem.style.cursor = 'pointer';
    sortItem.style.fontSize = '12px';
    sortItem.style.color = '#ccc';
    sortItem.style.display = 'flex';
    sortItem.style.justifyContent = 'space-between';
    sortItem.innerHTML = '<span>Sort Tabs</span> <span>▶</span>';

    sortItem.onmouseover = () => {
        sortItem.style.background = '#007acc';
        sortItem.style.color = '#fff';
        showSortSubmenu(sortItem, dropdown);
    };
    sortItem.onmouseout = (e) => {
        // Logic to keep selection if moving to submenu is tricky without structure
        // We'll rely on the submenu existence
        if (!document.getElementById('sortSubmenu')) {
            sortItem.style.background = 'transparent';
            sortItem.style.color = '#ccc';
        }
    };
    // Click also opens/toggles
    sortItem.onclick = (e) => {
        e.stopPropagation();
        showSortSubmenu(sortItem, dropdown);
    };

    dropdown.appendChild(sortItem);

    const sep = document.createElement('div');
    sep.style.borderTop = '1px solid #3e3e42';
    sep.style.margin = '4px 0';
    dropdown.appendChild(sep);

    tabs.forEach((tab, idx) => {
        const item = document.createElement('div');
        item.style.padding = '8px 12px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '12px';
        item.style.color = '#ccc';
        if (idx === activeTabIndex) item.style.fontWeight = 'bold';
        item.style.borderBottom = '1px solid #333';
        item.textContent = (tab.pinned ? '📌 ' : '') + tab.name + (tab.unsaved ? ' *' : '');
        item.onmouseover = () => { item.style.background = '#007acc'; item.style.color = '#fff'; };
        item.onmouseout = () => { item.style.background = 'transparent'; item.style.color = '#ccc'; };
        item.onclick = () => {
            activeTabIndex = idx;
            renderTabs();
            loadTabContent();
            dropdown.remove();
        };
        dropdown.appendChild(item);
    });

    const overlay = document.createElement('div');
    Object.assign(overlay.style, { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 });
    overlay.onclick = () => { dropdown.remove(); overlay.remove(); };

    document.body.appendChild(overlay);
    document.body.appendChild(dropdown);
}

function closeTab(index) {
    if (tabs[index].unsaved) {
        if (!confirm('Unsaved changes. Close anyway?')) return;
    }
    tabs.splice(index, 1);
    if (activeTabIndex >= tabs.length) activeTabIndex = tabs.length - 1;
    if (tabs.length === 0) activeTabIndex = -1;

    renderTabs();
    if (activeTabIndex >= 0) loadTabContent();
    else {
        // No tabs left -> Open Untitled
        openFile('Untitled-' + Math.floor(Math.random() * 1000) + '.txt');
    }
}

function updateHighlight(code, ext) {
    const highlight = viewContainer.querySelector('.code-highlight');
    highlight.innerHTML = highlightCode(code, ext) + '<br>';
}

function updateGutter(text) {
    const gutter = viewContainer.querySelector('#editorGutter');
    const lineCount = text.split('\n').length;
    const lines = [];
    for (let i = 1; i <= lineCount; i++) lines.push(`<div class="gutter-line">${i}</div>`);
    gutter.innerHTML = lines.join('');
    // Update status lines
    const sl = viewContainer.querySelector('#statusLines');
    if (sl) sl.textContent = lineCount;
}

function updateStatus() {
    const tab = getActiveTab();
    const codeArea = viewContainer.querySelector('.code-area');

    // Text Length
    const lenEl = viewContainer.querySelector('#statusLen');
    if (lenEl) lenEl.textContent = codeArea.value.length;

    // Cursor Pos
    const start = codeArea.selectionStart;
    const textToCursor = codeArea.value.substring(0, start);
    const lines = textToCursor.split('\n');
    const ln = lines.length;
    const col = lines[lines.length - 1].length + 1;

    const lnEl = viewContainer.querySelector('#statusLn');
    const colEl = viewContainer.querySelector('#statusCol');
    const posEl = viewContainer.querySelector('#statusPos');
    const encEl = viewContainer.querySelector('#statusEnc');

    if (lnEl) lnEl.textContent = ln;
    if (colEl) colEl.textContent = col;
    if (posEl) posEl.textContent = start;
    if (encEl && tab) encEl.textContent = (tab.encoding || 'utf-8').toUpperCase();
}

async function saveFile() {
    const tab = getActiveTab();
    if (!tab) return;
    const content = viewContainer.querySelector('.code-area').value;

    try {
        const r = await fetch(apiBase() + '/api/editor', {
            method: 'POST',
            body: JSON.stringify({ path: tab.path, content, encoding: tab.encoding }),
            headers: { 'Content-Type': 'application/json' }
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error);

        tab.unsaved = false;
        tab.content = content;
        renderTabs();
        window.ChronosBus?.emit?.('toast', { text: 'File saved', type: 'success' });
    } catch (e) {
        window.ChronosBus?.emit?.('toast', { text: 'Save failed: ' + e.message, type: 'error' });
    }
}

// Menu Data
// Menu Data
const MENUS = {
    File: [
        { label: 'New File', action: () => openFile('Untitled-' + Math.floor(Math.random() * 10000) + '.txt') },
        { label: 'Open...', action: () => alert('Use the sidebar to open files.') },
        { separator: true },
        { label: 'Save', action: () => saveFile() },
        { label: 'Save As...', action: () => saveAs() },
        { label: 'Save A Copy As...', action: () => saveCopyAs() },
        { label: 'Save All', action: () => saveAll() },
        { separator: true },
        { label: 'Rename...', action: () => renameFile() },
        { separator: true },
        { label: 'Close', action: () => { const t = getActiveTab(); if (t) closeTab(tabs.indexOf(t)); } },
        { label: 'Close All', action: () => { if (confirm('Close all tabs?')) { tabs = []; activeTabIndex = -1; renderTabs(); loadTabContent(); } } },
        { separator: true },
        { label: 'Print', action: () => printFile() }
    ],
    Edit: [
        { label: 'Undo', action: () => document.execCommand('undo') },
        { label: 'Redo', action: () => document.execCommand('redo') },
        { separator: true },
        { label: 'Cut', action: () => document.execCommand('cut') },
        { label: 'Copy', action: () => document.execCommand('copy') },
        { label: 'Paste', action: () => insertTextFromClipboard() },
        { label: 'Delete', action: () => document.execCommand('delete') },
        { separator: true },
        { label: 'Select All', action: () => { viewContainer.querySelector('.code-area').select(); } },
        { separator: true },
        { label: 'Insert Date/Time', action: () => insertText(new Date().toLocaleString()) },
        { label: 'Toggle Line Comment', action: () => toggleLineComment() },
    ],
    Search: [
        { label: 'Find...', action: () => showSearchDialog('find') },
        { label: 'Find Next', action: () => findNext(lastSearch.query) },
        { label: 'Find Previous', action: () => findNext(lastSearch.query, true) },
        { label: 'Replace...', action: () => showSearchDialog('replace') },
        { separator: true },
        { label: 'Go to Line...', action: () => gotoLine() }
    ],
    View: [
        { label: 'Toggle Sidebar', action: () => { settings.showSidebar = !settings.showSidebar; saveSettings(); applySettings(); } },
        { label: 'Toggle Status Bar', action: () => { settings.showStatusBar = !settings.showStatusBar; saveSettings(); applySettings(); } },
        { label: 'Toggle Line Numbers', action: () => { settings.lineNumbers = !settings.lineNumbers; saveSettings(); applySettings(); } },
        { separator: true },
        { label: 'Toggle Word Wrap', action: () => { settings.wordWrap = !settings.wordWrap; saveSettings(); applySettings(); } },
        { separator: true },
        { label: 'Zoom In', action: () => { settings.fontSize += 2; saveSettings(); applySettings(); } },
        { label: 'Zoom Out', action: () => { settings.fontSize = Math.max(8, settings.fontSize - 2); saveSettings(); applySettings(); } },
        { label: 'Reset Zoom', action: () => { settings.fontSize = 14; saveSettings(); applySettings(); } },
        { separator: true },
        { label: 'Full Screen', action: () => toggleFullScreen() }
    ],
    Settings: [
        { label: 'Tab Size: 2 Spaces', action: () => { settings.tabSize = 2; saveSettings(); alert('Tab size set to 2'); } },
        { label: 'Tab Size: 4 Spaces', action: () => { settings.tabSize = 4; saveSettings(); alert('Tab size set to 4'); } },
        { separator: true },
        { label: 'Auto-Save: On', action: () => { settings.autoSave = true; saveSettings(); alert('Auto-Save Enabled'); } },
        { label: 'Auto-Save: Off', action: () => { settings.autoSave = false; saveSettings(); alert('Auto-Save Disabled'); } },
        { separator: true },
        { label: 'Theme: Dark', action: () => { settings.theme = 'dark'; saveSettings(); applySettings(); } },
        { label: 'Theme: Light', action: () => { settings.theme = 'light'; saveSettings(); applySettings(); } },
    ],
    Language: [
        { label: 'None (Text)', action: () => setLanguage('txt') },
        { label: 'CHS', action: () => setLanguage('chs') },
        { label: 'Markdown', action: () => setLanguage('md') },
        { label: 'JSON', action: () => setLanguage('json') },
        { label: 'YAML', action: () => setLanguage('yml') }
    ],
    Encoding: [
        { label: 'UTF-8', action: () => setEncoding('utf-8') },
        { label: 'ANSI (Windows-1252)', action: () => setEncoding('cp1252') },
        { label: 'UTF-16 LE', action: () => setEncoding('utf-16') },
        { label: 'UTF-16 BE', action: () => setEncoding('utf-16-be') },
        { label: 'ASCII', action: () => setEncoding('ascii') },
        { separator: true },
        { label: 'Reopen with Encoding...', action: () => promptEncoding() }
    ],
    Run: [
        {
            label: 'Run File', action: () => runCurrentFile()
        },
        { separator: true },
        {
            label: 'Run Selection', action: () => {
                const sel = window.getSelection().toString();
                if (!sel) alert('Select some text to run.');
                else {
                    // Send to terminal
                    if (window.ChronosBus) window.ChronosBus.emit('terminal:input', sel);
                    else alert('Terminal not available.');
                }
            }
        }
    ]
};

function showMenu(anchorEl, menuName) {
    const existing = document.getElementById('editorDropdown');
    if (existing) { existing.remove(); if (existing.dataset.trigger === menuName) return; } // Toggle off

    const items = [...MENUS[menuName]]; // Shallow copy to append dynamic items

    if (menuName === 'File') {
        const recent = getRecentFiles();
        if (recent.length > 0) {
            items.push({ separator: true });
            recent.forEach((path, idx) => {
                const name = path.split('/').pop();
                items.push({
                    label: `${idx + 1}: ${name}`,
                    action: () => openFile(path)
                });
            });
        }
    }

    if (!items) return;

    const rect = anchorEl.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.id = 'editorDropdown';
    dropdown.dataset.trigger = menuName;
    Object.assign(dropdown.style, {
        position: 'fixed',
        top: (rect.bottom) + 'px',
        left: (rect.left) + 'px',
        background: '#252526',
        border: '1px solid #333',
        zIndex: 9999,
        minWidth: '200px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        padding: '4px 0',
        color: '#cccccc',
        fontFamily: 'sans-serif',
        fontSize: '13px'
    });

    items.forEach(item => {
        if (item.separator) {
            const sep = document.createElement('div');
            sep.style.borderTop = '1px solid #3e3e42';
            sep.style.margin = '4px 0';
            dropdown.appendChild(sep);
            return;
        }

        const el = document.createElement('div');
        el.style.padding = '6px 20px';
        el.style.cursor = 'pointer';
        el.textContent = item.label;
        el.onmouseover = () => { el.style.background = '#007acc'; el.style.color = '#fff'; };
        el.onmouseout = () => { el.style.background = 'transparent'; el.style.color = '#cccccc'; };
        el.onclick = () => {
            item.action();
            dropdown.remove();
            overlay.remove();
        };
        dropdown.appendChild(el);
    });

    const overlay = document.createElement('div');
    Object.assign(overlay.style, { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 });
    overlay.onclick = () => { dropdown.remove(); overlay.remove(); };

    document.body.appendChild(overlay);
    document.body.appendChild(dropdown);
}

// Editor Actions
function toggleLineComment() {
    const textarea = viewContainer.querySelector('.code-area');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;

    // Find line starts
    let lineStart = val.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = val.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = val.length;

    const block = val.substring(lineStart, lineEnd);
    const lines = block.split('\n');

    const allCommented = lines.every(l => l.trim().startsWith('#'));

    const newLines = lines.map(l => {
        if (allCommented) return l.replace(/^(\s*)# ?/, '$1');
        return l.replace(/^(\s*)/, '$1# ');
    });

    const newBlock = newLines.join('\n');
    textarea.setRangeText(newBlock, lineStart, lineEnd, 'select');
    textarea.dispatchEvent(new Event('input'));
}

function toggleWordWrap() {
    const textarea = viewContainer.querySelector('.code-area');
    const current = textarea.style.whiteSpace;
    textarea.style.whiteSpace = (current === 'pre' || !current) ? 'pre-wrap' : 'pre';
}

function changeFontSize(delta) {
    const textarea = viewContainer.querySelector('.code-area');
    const highlight = viewContainer.querySelector('.code-highlight');
    const gutter = viewContainer.querySelector('#editorGutter');

    // get current
    let size = parseInt(window.getComputedStyle(textarea).fontSize) || 14;
    if (delta === 0) size = 14;
    else size += delta;

    if (size < 8) size = 8;
    if (size > 36) size = 36;

    const s = size + 'px';
    textarea.style.fontSize = s;
    highlight.style.fontSize = s;
    gutter.style.fontSize = s;
}

function gotoLine() {
    const ln = prompt('Go to Line:', '1');
    if (!ln) return;
    const n = parseInt(ln);
    if (isNaN(n)) return;

    const textarea = viewContainer.querySelector('.code-area');
    const lines = textarea.value.split('\n');
    let pos = 0;
    for (let i = 0; i < n - 1 && i < lines.length; i++) {
        pos += lines[i].length + 1; // +1 for newline
    }
    textarea.setSelectionRange(pos, pos);
    textarea.blur();
    textarea.focus();
    // try to center?
    const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight);
    textarea.scrollTop = (n - 1) * lineHeight - (textarea.clientHeight / 2);
}

function findNext(query, reverse = false) {
    if (!query) return;
    lastSearch.query = query;

    const textarea = viewContainer.querySelector('.code-area');
    const val = textarea.value;
    const start = textarea.selectionStart;

    // Build regex
    let flags = 'g';
    if (!lastSearch.options.matchCase) flags += 'i';

    let pattern = query;
    if (!lastSearch.options.regex) {
        // Escape regex chars
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    if (lastSearch.options.wholeWord) {
        pattern = '\\b' + pattern + '\\b';
    }

    let regex;
    try {
        regex = new RegExp(pattern, flags);
    } catch (e) {
        alert('Invalid Regex: ' + e.message);
        return;
    }

    let idx = -1;
    let matchLen = 0;

    // Find all matches
    const matches = [];
    let m;
    while ((m = regex.exec(val)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length });
    }

    if (matches.length === 0) {
        alert('Not found: ' + query);
        return;
    }

    // Find next match relative to cursor
    if (reverse) {
        // Find match where end <= start
        // Find the last match that is before selection
        // selection is [start, end]. reverse means searching before start?
        // standard reverse find usually searches before cursor.
        const currentPos = textarea.selectionStart;
        // find match with start < currentPos
        // scan backwards
        for (let i = matches.length - 1; i >= 0; i--) {
            if (matches[i].start < currentPos) {
                // Found one before
                // if we are currently selecting a match, we want the one before THAT
                // but selectionStart is the beginning of current selection.
                // checking start < currentPos works if currentPos is start of selection.
                // let's try strict less.
                idx = matches[i].start;
                matchLen = matches[i].end - matches[i].start;
                break;
            }
        }
        if (idx === -1) {
            // wrap to end
            const last = matches[matches.length - 1];
            idx = last.start;
            matchLen = last.end - last.start;
        }
    } else {
        // Forward
        const currentPos = textarea.selectionEnd; // search after selection
        const match = matches.find(m => m.start >= currentPos);
        if (match) {
            idx = match.start;
            matchLen = match.end - match.start;
        } else {
            // wrap to start
            idx = matches[0].start;
            matchLen = matches[0].end - matches[0].start;
        }
    }

    if (idx !== -1) {
        textarea.setSelectionRange(idx, idx + matchLen);
        textarea.blur();
        textarea.focus();

        const lines = val.substring(0, idx).split('\n');
        const ln = lines.length;
        const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight);
        const top = (ln - 1) * lineHeight;

        if (top < textarea.scrollTop || top > textarea.scrollTop + textarea.clientHeight) {
            textarea.scrollTop = top - (textarea.clientHeight / 2);
        }
    }
}



function replaceNext() {
    const q = lastSearch.query;
    const r = lastReplace.replace;
    if (!q) return;

    const textarea = viewContainer.querySelector('.code-area');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const sel = textarea.value.substring(start, end);

    // Check if current selection matches query (respecting options)
    // We re-run regex logic to check match
    let flags = '';
    if (!lastSearch.options.matchCase) flags += 'i';
    let pattern = q;
    if (!lastSearch.options.regex) pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (lastSearch.options.wholeWord) pattern = '\\b' + pattern + '\\b';

    let regex;
    try { regex = new RegExp('^' + pattern + '$', flags); }
    catch (e) { findNext(q); return; }

    if (regex.test(sel)) {
        textarea.setRangeText(r, start, end, 'select');
        textarea.dispatchEvent(new Event('input'));
        findNext(q);
    } else {
        findNext(q);
    }
}

function replaceAll() {
    const q = lastSearch.query;
    const r = lastReplace.replace;
    if (!q) return;

    const textarea = viewContainer.querySelector('.code-area');
    const val = textarea.value;

    let flags = 'g';
    if (!lastSearch.options.matchCase) flags += 'i';
    let pattern = q;
    if (!lastSearch.options.regex) pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (lastSearch.options.wholeWord) pattern = '\\b' + pattern + '\\b';

    try {
        const regex = new RegExp(pattern, flags);
        const newVal = val.replace(regex, r);
        if (newVal !== val) {
            textarea.value = newVal;
            textarea.dispatchEvent(new Event('input'));
            // Count? 
            // val.match(regex).length would give count strictly
            const count = (val.match(regex) || []).length;
            alert(`Replaced ${count} occurrences.`);
        } else {
            alert('No occurrences found.');
        }
    } catch (e) {
        alert('Replace failed: ' + e.message);
    }
}

function showSearchDialog(mode) {
    const existing = document.getElementById('searchDialog');
    if (existing) existing.remove();

    const dialog = document.createElement('div');
    dialog.id = 'searchDialog';
    Object.assign(dialog.style, {
        position: 'absolute',
        top: '60px', right: '20px',
        width: '300px',
        background: '#252526',
        border: '1px solid #454545',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        padding: '12px',
        zIndex: 10000,
        color: '#ccc',
        fontFamily: 'sans-serif',
        fontSize: '13px'
    });

    const title = mode === 'replace' ? 'Replace' : 'Find';

    let html = `<div style="margin-bottom:10px;font-weight:bold;display:flex;justify-content:space-between">
        <span>${title}</span>
        <span style="cursor:pointer;" onclick="this.closest('#searchDialog').remove()">×</span>
    </div>`;

    html += `<div style="margin-bottom:8px">
        <label style="display:block;font-size:11px;margin-bottom:4px">Find what:</label>
        <input id="findInput" value="${escapeHtml(lastSearch.query)}" style="width:100%;background:#3c3c3c;border:1px solid #3c3c3c;color:#fff;padding:4px;outline:none;">
    </div>`;

    html += `<div style="display:flex;gap:10px;margin-bottom:8px;font-size:11px;color:#ccc;">
        <label><input type="checkbox" id="optMatchCase" ${lastSearch.options.matchCase ? 'checked' : ''}> Match Case</label>
        <label><input type="checkbox" id="optRegex" ${lastSearch.options.regex ? 'checked' : ''}> Regex</label>
        <label><input type="checkbox" id="optWholeWord" ${lastSearch.options.wholeWord ? 'checked' : ''}> Whole Word</label>
    </div>`;

    if (mode === 'replace') {
        html += `<div style="margin-bottom:8px">
            <label style="display:block;font-size:11px;margin-bottom:4px">Replace with:</label>
            <input id="replaceInput" value="${escapeHtml(lastReplace.replace)}" style="width:100%;background:#3c3c3c;border:1px solid #3c3c3c;color:#fff;padding:4px;outline:none;">
        </div>`;
    }

    html += `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button id="btnFindNext" class="chronos-btn" style="font-size:12px;padding:4px 8px">Find Next</button>`;

    if (mode === 'replace') {
        html += `<button id="btnReplace" class="chronos-btn" style="font-size:12px;padding:4px 8px">Replace</button>
                 <button id="btnReplaceAll" class="chronos-btn" style="font-size:12px;padding:4px 8px">Replace All</button>`;
    }

    html += `</div>`;

    dialog.innerHTML = html;

    // Bind logic
    const input = dialog.querySelector('#findInput');
    const rInput = dialog.querySelector('#replaceInput');
    const optMatchCase = dialog.querySelector('#optMatchCase');
    const optRegex = dialog.querySelector('#optRegex');
    const optWholeWord = dialog.querySelector('#optWholeWord');

    const updateOpts = () => {
        lastSearch.options.matchCase = optMatchCase.checked;
        lastSearch.options.regex = optRegex.checked;
        lastSearch.options.wholeWord = optWholeWord.checked;
    };

    const doFind = () => { lastSearch.query = input.value; updateOpts(); findNext(input.value); };

    dialog.querySelector('#btnFindNext').onclick = doFind;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doFind(); });

    if (mode === 'replace') {
        dialog.querySelector('#btnReplace').onclick = () => {
            lastSearch.query = input.value;
            lastReplace.replace = rInput.value;
            updateOpts();
            replaceNext();
        };
        dialog.querySelector('#btnReplaceAll').onclick = () => {
            lastSearch.query = input.value;
            lastReplace.replace = rInput.value;
            updateOpts();
            replaceAll();
        };
    }

    viewContainer.querySelector('.editor-main').appendChild(dialog); // anchor to main
    input.focus();
    input.select();
}

// Helpers
async function saveAs() {
    const tab = getActiveTab();
    if (!tab) return;
    const newPath = prompt('Save As (Enter new path):', tab.path);
    if (!newPath || newPath === tab.path) return;

    // Save content to new path using api/editor which supports write
    // note: standard saveFile uses POST /api/editor
    const content = viewContainer.querySelector('.code-area').value;
    try {
        const r = await fetch(apiBase() + '/api/editor', {
            method: 'POST',
            body: JSON.stringify({ path: newPath, content }),
            headers: { 'Content-Type': 'application/json' }
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error);

        // Update tab
        tab.path = newPath;
        tab.name = newPath.split('/').pop();
        tab.unsaved = false;
        renderTabs();
        loadFileTree('User', viewContainer.querySelector('#fileTree')); // refresh tree
        alert('File saved as ' + newPath);
    } catch (e) {
        alert('Save As failed: ' + e.message);
    }
}

async function saveCopyAs() {
    const tab = getActiveTab();
    if (!tab) return;
    const newPath = prompt('Save Copy As (Enter path):', tab.path.replace(/(\.[^.]+)$/, '_copy$1'));
    if (!newPath) return;

    const content = viewContainer.querySelector('.code-area').value;
    try {
        const r = await fetch(apiBase() + '/api/editor', {
            method: 'POST',
            body: JSON.stringify({ path: newPath, content }),
            headers: { 'Content-Type': 'application/json' }
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error);
        loadFileTree('User', viewContainer.querySelector('#fileTree'));
        alert('Copy saved to ' + newPath);
    } catch (e) {
        alert('Save Copy failed: ' + e.message);
    }
}

async function saveAll() {
    let saved = 0;
    for (const tab of tabs) {
        if (tab.unsaved) {
            try {
                // background save
                await fetch(apiBase() + '/api/editor', {
                    method: 'POST',
                    body: JSON.stringify({ path: tab.path, content: tab.content }), // might be stale if not active?
                    // actually tab.content is only synced when active... 
                    // WAIT. tab.content is updated on input for active tab.
                    // For inactive tabs it should be up to date if they were edited?
                    // Yes, unsaved implies content is newer than disk.
                    headers: { 'Content-Type': 'application/json' }
                });
                tab.unsaved = false;
                saved++;
            } catch (e) {
                console.error('Failed to save ' + tab.path);
            }
        }
    }
    renderTabs();
    if (saved > 0) alert(`Saved ${saved} files.`);
}

async function renameFile() {
    const tab = getActiveTab();
    if (!tab) return;
    const newPath = prompt('Rename to:', tab.path);
    if (!newPath || newPath === tab.path) return;

    try {
        const r = await fetch(apiBase() + '/api/file/rename', {
            method: 'POST',
            body: JSON.stringify({ old_path: tab.path, new_path: newPath }),
            headers: { 'Content-Type': 'application/json' }
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error);

        tab.path = newPath;
        tab.name = newPath.split('/').pop();
        renderTabs();
        loadFileTree('User', viewContainer.querySelector('#fileTree'));
    } catch (e) {
        alert('Rename failed: ' + e.message);
    }
}

function printFile() {
    window.print();
}

function insertText(text) {
    const textarea = viewContainer.querySelector('.code-area');
    const start = textarea.selectionStart;
    textarea.setRangeText(text, start, textarea.selectionEnd, 'end');
    textarea.dispatchEvent(new Event('input'));
}

function insertTextFromClipboard() {
    navigator.clipboard.readText().then(t => insertText(t)).catch(e => alert('Paste failed: ' + e));
}

// Recent Files Logic
function getRecentFiles() {
    try {
        const raw = localStorage.getItem('chronos_recent_files');
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}

function addToRecentFiles(path) {
    if (!path || path.startsWith('Untitled-')) return;
    let list = getRecentFiles();
    list = list.filter(p => p !== path); // remove existing
    list.unshift(path); // add to front
    if (list.length > 5) list = list.slice(0, 5); // max 5
    localStorage.setItem('chronos_recent_files', JSON.stringify(list));
}

// ... existing code ...

async function setEncoding(enc) {
    const tab = getActiveTab();
    if (!tab) return;
    if (tab.unsaved) {
        if (!confirm('File has unsaved changes. Reopening with new encoding will lose changes. Continue?')) return;
    }
    tab.encoding = enc;
    await reloadTabContent(tab);
    window.ChronosBus?.emit?.('toast', { text: `Reopened as ${enc}`, type: 'info' });
}

function promptEncoding() {
    const enc = prompt('Enter encoding (e.g., latin-1, cp1252):', 'utf-8');
    if (enc) setEncoding(enc);
}

async function runCurrentFile() {
    const tab = getActiveTab();
    if (!tab) return;

    // Save first
    if (tab.unsaved) {
        await saveFile(); // assumes saveFile saves active tab
    }

    // Construct command
    const path = tab.path;
    // If chs, run with interpreter. Else just try to run active file?
    // User specifically asked for chs via chronos engine.
    // If python, maybe python <file>
    let cmd = '';
    if (path.endsWith('.chs')) {
        cmd = `python Modules/Console.py "${path}"`;
    } else if (path.endsWith('.py')) {
        cmd = `python "${path}"`;
    } else {
        // Default callback or cat?
        cmd = `echo "Running ${path}..."`;
    }

    if (window.ChronosBus) {
        window.ChronosBus.emit('terminal:input', cmd);
    } else {
        alert('Terminal integration not ready.');
    }
}

function setLanguage(lang) {
    const tab = getActiveTab();
    if (!tab) return;
    tab.language = lang;
    loadTabContent(); // Re-render highlighting
}

function toggleSidebar() {
    const el = viewContainer.querySelector('.editor-sidebar');
    if (el) el.style.display = (el.style.display === 'none') ? 'flex' : 'none';
}

function toggleStatusBar() {
    const el = viewContainer.querySelector('.editor-status-bar');
    if (el) el.style.display = (el.style.display === 'none') ? 'flex' : 'none';
}

function toggleGutter() {
    const el = viewContainer.querySelector('.editor-gutter');
    if (el) el.style.display = (el.style.display === 'none') ? 'block' : 'none';
}

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(e => {
            console.warn(e);
            // Fallback for element specific if global fails
            viewContainer.requestFullscreen().catch(console.error);
        });
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}

function showSortSubmenu(anchorItem, parentDropdown) {
    const existing = document.getElementById('sortSubmenu');
    if (existing) return; // already open

    const rect = anchorItem.getBoundingClientRect();
    const submenu = document.createElement('div');
    submenu.id = 'sortSubmenu';
    Object.assign(submenu.style, {
        position: 'fixed',
        top: rect.top + 'px',
        left: (rect.left - 160) + 'px', // Open to Left
        background: '#252526',
        border: '1px solid #333',
        zIndex: 10000,
        minWidth: '160px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        padding: '4px 0'
    });

    const sortOpts = [
        { label: 'Name (A-Z)', criteria: 'name-asc' },
        { label: 'Name (Z-A)', criteria: 'name-desc' },
        { label: 'Path (A-Z)', criteria: 'path-asc' },
        { label: 'Path (Z-A)', criteria: 'path-desc' },
        { label: 'Size (Smallest)', criteria: 'size-asc' },
        { label: 'Size (Largest)', criteria: 'size-desc' },
        { label: 'Type (Ext A-Z)', criteria: 'ext-asc' },
        { label: 'Type (Ext Z-A)', criteria: 'ext-desc' },
    ];

    sortOpts.forEach(opt => {
        const item = document.createElement('div');
        item.style.padding = '6px 12px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '12px';
        item.style.color = '#ccc';
        item.textContent = opt.label;
        item.onmouseover = () => { item.style.background = '#007acc'; item.style.color = '#fff'; };
        item.onmouseout = () => { item.style.background = 'transparent'; item.style.color = '#ccc'; };
        item.onclick = () => {
            sortTabs(opt.criteria);
            submenu.remove();
            parentDropdown.remove(); // Close all
            // Remove overlay too if we can access it?
            // The overlay logic in showTabsDropdown relied on a local var 'overlay'
            // We need to clean that up.
            // Actually, clicking here triggers nothing on parent, so overlay stays.
            // We can explicitly remove any 'dropdown-overlay' if we class it, or just use document.elementFromPoint?
            // Easiest: The overlay has an onclick to close. We can simulate that or find it.
            // Or just:
            document.querySelectorAll('#tabsDropdown, #tabsDropdownOverlay').forEach(e => e.remove());
        };
        submenu.appendChild(item);
    });

    submenu.onmouseleave = () => {
        submenu.remove();
        anchorItem.style.background = 'transparent';
        anchorItem.style.color = '#ccc';
    };

    document.body.appendChild(submenu);
}

function sortTabs(criteria) {
    const active = getActiveTab();

    tabs.sort((a, b) => {
        // Pinned always first
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;

        switch (criteria) {
            case 'name-asc': return a.name.localeCompare(b.name);
            case 'name-desc': return b.name.localeCompare(a.name);
            case 'path-asc': return a.path.localeCompare(b.path);
            case 'path-desc': return b.path.localeCompare(a.path);
            case 'size-asc': return (a.content || '').length - (b.content || '').length;
            case 'size-desc': return (b.content || '').length - (a.content || '').length;
            case 'ext-asc': {
                const extA = a.name.split('.').pop();
                const extB = b.name.split('.').pop();
                return extA.localeCompare(extB) || a.name.localeCompare(b.name);
            }
            case 'ext-desc': {
                const extA = a.name.split('.').pop();
                const extB = b.name.split('.').pop();
                return extB.localeCompare(extA) || b.name.localeCompare(a.name);
            }
            default: return 0;
        }
    });

    if (active) activeTabIndex = tabs.indexOf(active);
    renderTabs();
}

export function mount(el) {
    if (!document.getElementById('editor-css')) {
        const link = document.createElement('link');
        link.id = 'editor-css';
        link.rel = 'stylesheet';
        link.href = './Views/Editor/editor.css';
        document.head.appendChild(link);
    }

    viewContainer = el;
    el.className = 'editor-view';
    // ... HTML same as before ...
    el.innerHTML = `
    <div class="editor-sidebar">
      <div class="editor-sidebar-header">Files</div>
      <div class="editor-file-tree" id="fileTree"></div>
    </div>
    <div class="editor-main">
      <div class="editor-menu-strip">
         <span class="menu-item" data-menu="File">File</span>
         <span class="menu-item" data-menu="Edit">Edit</span>
         <span class="menu-item" data-menu="Search">Search</span>
         <span class="menu-item" data-menu="View">View</span>
         <span class="menu-item" data-menu="Encoding">Encoding</span>
         <span class="menu-item" data-menu="Language">Language</span>
         <span class="menu-item" data-menu="Settings">Settings</span>
         <span class="menu-item" data-menu="Run" style="color:#4ec9b0">Run</span>
         <span class="menu-item" style="margin-left:auto">Tabs</span>
      </div>
      <div class="editor-tabs-bar" id="editorTabs"></div>
      <div class="editor-container">
        <div class="editor-gutter" id="editorGutter"></div>
        <div class="editor-scroll-area">
            <textarea class="code-area" spellcheck="false"></textarea>
            <div class="code-highlight"></div>
        </div>
      </div>
      <div class="editor-status-bar">
         <span>Length: <span id="statusLen">0</span></span>
         <span>Lines: <span id="statusLines">0</span></span>
         <span class="spacer"></span>
         <span>Ln <span id="statusLn">1</span>, Col <span id="statusCol">1</span>, Pos <span id="statusPos">0</span></span>
         <div style="width:1px;height:14px;background:rgba(255,255,255,0.2);margin:0 4px"></div>
         <span id="statusEnc">UTF-8</span>
      </div>
    </div>
    `;

    // Sidebar init
    loadFileTree('User', el.querySelector('#fileTree'));

    // Ensure at least one file
    if (tabs.length === 0) {
        openFile('Untitled-1.txt');
    }

    // Get references to DOM elements
    const textarea = el.querySelector('.code-area');
    const highlight = el.querySelector('.code-highlight');
    const gutter = el.querySelector('#editorGutter');

    loadSettings();
    applySettings();

    // Auto-save timer
    let autoSaveTimer = null;
    textarea.addEventListener('input', () => {
        const val = textarea.value;
        const tab = getActiveTab();
        if (tab) {
            tab.content = val;
            tab.unsaved = true;
            renderTabs();
            updateHighlight(val, tab.language || tab.path.split('.').pop());
            updateGutter(val);
            updateStatus();

            if (settings.autoSave) {
                clearTimeout(autoSaveTimer);
                autoSaveTimer = setTimeout(() => {
                    if (tab.unsaved) saveFile();
                }, 1000);
            }
        }
    });

    // Tab Key Handler
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const spaces = ' '.repeat(settings.tabSize || 4);
            document.execCommand('insertText', false, spaces);
        }
    });

    // Scroll Sync
    textarea.addEventListener('scroll', () => {
        highlight.scrollTop = textarea.scrollTop;
        highlight.scrollLeft = textarea.scrollLeft;
        gutter.scrollTop = textarea.scrollTop;
    });

    ['keyup', 'mouseup', 'click'].forEach(evt => {
        textarea.addEventListener(evt, updateStatus);
    });

    textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveFile();
        }
    });

    // Menu Wiring
    el.querySelectorAll('.menu-item[data-menu]').forEach(item => {
        item.onclick = (e) => showMenu(item, item.dataset.menu);
    });

    // Tabs Dropdown
    const tabsMenu = el.querySelector('.menu-item:last-child'); // Tabs
    if (tabsMenu) {
        tabsMenu.onclick = (e) => showTabsDropdown(tabsMenu);
    }
}
