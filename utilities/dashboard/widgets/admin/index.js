
export function mount(el, context) {
    // Load CSS
    if (!document.getElementById('admin-css')) {
        const link = document.createElement('link');
        link.id = 'admin-css';
        link.rel = 'stylesheet';
        link.href = new URL('./admin.css', import.meta.url).toString();
        document.head.appendChild(link);
    }

    el.className = 'widget admin-widget';
    el.dataset.uiId = 'widget.admin';

    el.innerHTML = `
    <div class="header" id="adminHeader" data-ui-id="widget.admin.header">
        <div class="title" data-ui-id="widget.admin.title">System Admin</div>
        <div class="controls">
            <button class="icon-btn" title="Minimize" id="btnMin" data-ui-id="widget.admin.minimize_button">_</button>
            <button class="icon-btn" title="Close" id="btnClose" data-ui-id="widget.admin.close_button">x</button>
        </div>
    </div>
    
    <div class="content" style="display:flex; flex-direction:column; gap:12px;">
        <div class="row">
            <span class="hint">System Maintenance & Cleanup Tools</span>
        </div>
        
        <!-- Quick Actions -->
        <div class="admin-grid">
            <div class="admin-card">
                <h4>Logs</h4>
                <div class="desc">Delete old log files</div>
                <button class="btn btn-danger" id="btn-clear-logs">Purge Logs</button>
            </div>
            <div class="admin-card">
                <h4>Schedules</h4>
                <div class="desc">Clean gen. schemas</div>
                <button class="btn btn-danger" id="btn-clear-schedules">Purge Sch.</button>
            </div>
            <div class="admin-card">
                <h4>Cache</h4>
                <div class="desc">Reset Db Mirror</div>
                <button class="btn btn-danger" id="btn-clear-cache">Reset Cache</button>
            </div>
             <div class="admin-card">
                <h4>Temp Files</h4>
                <div class="desc">Clear temp files</div>
                <button class="btn btn-danger" id="btn-clear-temp">Clear Temp</button>
            </div>
        </div>
        
        <!-- Advanced Section -->
        <details class="admin-advanced">
            <summary class="admin-advanced-toggle">⚙️ Advanced Cleanup</summary>
            <div class="admin-advanced-content">
                <div class="admin-section">
                    <label class="admin-label">Specific Database</label>
                    <div class="row" style="gap:8px;">
                        <select id="db-select" class="input" style="flex:1;" data-ui-id="widget.admin.db_select">
                            <option value="">Loading databases...</option>
                        </select>
                        <button class="btn btn-danger" id="btn-clear-db" data-ui-id="widget.admin.clear_db_button">Delete DB</button>
                    </div>
                    <span class="hint" style="font-size:10px;">Deletes a single database mirror. System will rebuild on next access.</span>
                </div>
                
                <div class="admin-section">
                    <label class="admin-label">Registry Cache</label>
                    <div class="row" style="gap:8px;">
                        <select id="registry-select" class="input" style="flex:1;" data-ui-id="widget.admin.registry_select">
                            <option value="wizards">Wizards</option>
                            <option value="themes">Themes</option>
                            <option value="commands">Commands</option>
                            <option value="item_types">Item Types</option>
                        </select>
                        <button class="btn btn-danger" id="btn-clear-registry" data-ui-id="widget.admin.clear_registry_button">Clear Cache</button>
                    </div>
                    <span class="hint" style="font-size:10px;">Forces reload of registry from source files.</span>
                </div>
                
                <div class="admin-section">
                    <label class="admin-label">Archives</label>
                    <button class="btn btn-danger" id="btn-clear-archives" style="width:100%;" data-ui-id="widget.admin.clear_archives_button">Delete All Archives</button>
                    <span class="hint" style="font-size:10px;">Removes all archived items and schedules.</span>
                </div>
            </div>
        </details>
        
        <div id="admin-status" class="admin-status-box" data-ui-id="widget.admin.status_text">Ready.</div>
    </div>

    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;

    const statusEl = el.querySelector('#admin-status');
    const btnClose = el.querySelector('#btnClose');
    const btnMin = el.querySelector('#btnMin');
    const header = el.querySelector('#adminHeader');
    const dbSelect = el.querySelector('#db-select');

    // Standard Minimize/Close
    btnClose.addEventListener('click', () => {
        el.style.display = 'none';
        try { window.ensureWidgetInView?.(el); } catch { }
    });
    btnMin.addEventListener('click', () => {
        el.classList.toggle('minimized');
    });

    // Standard Dragging
    header.addEventListener('pointerdown', (ev) => {
        const startX = ev.clientX, startY = ev.clientY;
        const rect = el.getBoundingClientRect();
        const offX = startX - rect.left, offY = startY - rect.top;
        function onMove(e) {
            el.style.left = Math.max(6, e.clientX - offX) + 'px';
            el.style.top = Math.max(6, e.clientY - offY) + 'px';
            el.style.right = 'auto';
        }
        function onUp() {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    });

    // Resizers
    try {
        if (window.installWidgetResizers) window.installWidgetResizers(el);
    } catch { }

    // Load available databases
    async function loadDatabases() {
        try {
            const res = await fetch('/api/system/databases');
            const data = await res.json().catch(() => ({}));

            if (data.ok && Array.isArray(data.databases)) {
                dbSelect.innerHTML = '<option value="">Select database...</option>';
                data.databases.forEach(db => {
                    const opt = document.createElement('option');
                    opt.value = db.name;
                    const label = db.label || db.name || 'Unknown';
                    const sizeText = (typeof db.size === 'number') ? `${(db.size / 1024).toFixed(1)} KB` : 'missing';
                    opt.textContent = `${label} (${sizeText})`;
                    dbSelect.appendChild(opt);
                });
            } else {
                dbSelect.innerHTML = '<option value="">No databases found</option>';
            }
        } catch {
            dbSelect.innerHTML = '<option value="">Failed to load databases</option>';
        }
    }

    loadDatabases();

    async function runCommand(cmd) {
        statusEl.textContent = `Running '${cmd}'...`;
        statusEl.classList.remove('error');

        try {
            const res = await fetch('/api/system/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd })
            });

            const data = await res.json().catch(() => ({}));

            if (data.ok) {
                const out = (data.stdout || data.message || 'Done').trim();
                statusEl.textContent = `✅ Success\n${out.substring(0, 140)}${out.length > 140 ? '...' : ''}`;
            } else {
                statusEl.textContent = `❌ Error: ${data.error || data.stderr || 'Unknown error'}`;
                statusEl.classList.add('error');
            }
        } catch (err) {
            statusEl.textContent = `❌ Network Error: ${err.message}`;
            statusEl.classList.add('error');
        }
    }

    // Quick Actions
    el.querySelector('#btn-clear-logs').addEventListener('click', () => {
        if (confirm("⚠️ Are you sure you want to delete all log files?\n\nThis will permanently remove all history of system events and debugging information from the user/logs directory.\n\nThis action cannot be undone.")) {
            runCommand("clear logs force");
        }
    });

    el.querySelector('#btn-clear-schedules').addEventListener('click', () => {
        if (confirm("⚠️ Are you sure you want to delete all generated schedules?\n\nThis will remove all daily schedule YAML files from the user/schedules directory. You will lose all historical schedule records.\n\nThis action cannot be undone.")) {
            runCommand("clear schedules force");
        }
    });

    el.querySelector('#btn-clear-cache').addEventListener('click', () => {
        if (confirm("⚠️ Are you sure you want to reset the entire system cache?\n\nThis will wipe the local database mirrors and clear internal states. The system may be slower immediately after as it rebuilds constraints and indices.\n\nContinue?")) {
            runCommand("clear cache force");
        }
    });

    el.querySelector('#btn-clear-temp').addEventListener('click', () => {
        if (confirm("⚠️ Clear all temporary files?\n\nThis will delete .tmp, .bak, and other temporary files.\n\nContinue?")) {
            runCommand("clear temp force");
        }
    });

    // Advanced Actions
    el.querySelector('#btn-clear-db').addEventListener('click', () => {
        const dbName = dbSelect.value;
        if (!dbName) {
            alert("Please select a database first.");
            return;
        }
        if (confirm(`⚠️ Delete database '${dbName}'?\n\nThis specific mirror will be removed and rebuilt on next access.\n\nContinue?`)) {
            runCommand(`clear db:${dbName} force`).then(() => loadDatabases());
        }
    });

    el.querySelector('#btn-clear-registry').addEventListener('click', () => {
        const registry = el.querySelector('#registry-select').value;
        if (confirm(`⚠️ Clear ${registry} registry cache?\n\nThis will force a reload from source files.\n\nContinue?`)) {
            runCommand(`clear registry:${registry} force`);
        }
    });

    el.querySelector('#btn-clear-archives').addEventListener('click', () => {
        if (confirm("⚠️ Delete ALL archived items and schedules?\n\nThis will permanently remove everything in user/archive.\n\nThis action cannot be undone.\n\nContinue?")) {
            runCommand("clear archives force");
        }
    });

    return {
        dispose() { }
    };
}

