export function mount(el) {
  // Load CSS
  if (!document.getElementById('settings-css')) {
    const link = document.createElement('link');
    link.id = 'settings-css';
    link.rel = 'stylesheet';
    link.href = './Widgets/Settings/settings.css';
    document.head.appendChild(link);
  }

  el.className = 'widget settings-widget';

  el.innerHTML = `
    <div class="header" id="settingsHeader">
      <div class="title">Settings</div>
      <div class="controls">
        <button class="icon-btn" id="settingsMin" title="Minimize">_</button>
        <button class="icon-btn" id="settingsClose" title="Close">x</button>
      </div>
    </div>
    <div class="content" style="display:flex; flex-direction:column; gap:8px;">
      <div class="row" style="gap:8px; align-items:center;">
        <label for="settingsFile" class="hint">File:</label>
        <select id="settingsFile" class="input" style="flex:1 1 auto;"></select>
        <button id="reloadBtn" class="btn btn-secondary">Reload</button>
      </div>
      <!-- Toggle between Form and YAML modes -->
      <div class="row" style="gap:8px; align-items:center;">
        <label class="hint" style="display:flex; align-items:center; gap:6px;">
          <input type="checkbox" id="formModeToggle" checked />
          Smart Form Mode
        </label>
      </div>
      <div class="row" style="gap:8px; align-items:center;">
        <button id="addSectionBtn" class="btn btn-secondary">Add Section</button>
        <button id="addFieldBtn" class="btn btn-secondary">Add Field</button>
        <span class="hint" style="font-size:11px;">Form mode adds simple keys and sections.</span>
      </div>
      <!-- Dynamic content container (form or YAML editor) -->
      <div id="dynamicContent" style="display:flex; flex-direction:column; gap:10px; max-height:400px; overflow-y:auto;"></div>
      <div class="row" style="gap:8px; align-items:center; justify-content:flex-end;">
        <span id="settingsStatus" class="hint" style="flex:1 1 auto;"></span>
        <button id="saveBtn" class="btn btn-primary">Save</button>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;

  const content = el.querySelector('.content') || el;
  const sel = content.querySelector('#settingsFile');
  const dynamicContent = content.querySelector('#dynamicContent');
  const btnSave = content.querySelector('#saveBtn');
  const btnReload = content.querySelector('#reloadBtn');
  const status = content.querySelector('#settingsStatus');
  const formModeToggle = content.querySelector('#formModeToggle');
  const addSectionBtn = content.querySelector('#addSectionBtn');
  const addFieldBtn = content.querySelector('#addFieldBtn');

  let currentMode = 'form';
  let parsedData = {};
  let rawYaml = '';
  let autocompleteCache = {}; // Cache for loaded setting options

  function apiBase() { const o = window.location.origin; if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  function setStatus(msg, ok = true) { if (status) { status.textContent = msg; status.style.color = ok ? '#a6adbb' : '#ef6a6a'; } }

  // Mapping: field name -> settings file to fetch options from
  const AUTOCOMPLETE_MAP = {
    priority: 'priority_settings.yml',
    category: 'category_settings.yml',
    status: 'status_settings.yml',
    energy: 'energy_settings.yml',
    focus: 'focus_settings.yml',
    emotion: 'emotion_settings.yml',
    vibe: 'vibe_settings.yml',
    place: 'place_settings.yml',
  };

  async function fetchAutocompleteOptions(fieldKey) {
    const settingsFile = AUTOCOMPLETE_MAP[fieldKey.toLowerCase()];
    if (!settingsFile) return null;

    // Check cache
    if (autocompleteCache[settingsFile]) return autocompleteCache[settingsFile];

    try {
      const r = await fetch(apiBase() + '/api/settings?file=' + encodeURIComponent(settingsFile));
      const data = await r.json();
      const yamlText = data?.content ?? '';

      // Parse options (assumes format like Category_Settings: [{ Name: "Work" }, ...])
      const options = extractOptionsFromYaml(yamlText, fieldKey);
      autocompleteCache[settingsFile] = options;
      return options;
    } catch (e) {
      console.warn('[Settings] Failed to fetch autocomplete for', fieldKey, e);
      return null;
    }
  }

  function extractOptionsFromYaml(yamlText, fieldKey) {
    // Simple extraction: look for "Name:" fields in the YAML
    const options = [];
    const lines = yamlText.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Match "Name: value" or "- Name: value"
      const match = trimmed.match(/^-?\s*Name:\s*(.+)$/i);
      if (match) {
        let value = match[1].trim();
        // Remove quotes if present
        value = value.replace(/^["']|["']$/g, '');
        if (value) options.push(value);
      }
    }

    return options;
  }

  async function listFiles() {
    try {
      const r = await fetch(apiBase() + '/api/settings');
      const data = await r.json();
      if (!data || !Array.isArray(data.files)) throw new Error('Invalid response');
      sel.innerHTML = '';
      for (const f of data.files) { const opt = document.createElement('option'); opt.value = f; opt.textContent = f; sel.appendChild(opt); }
      if (data.files.length) { await loadFile(data.files[0]); }
      setStatus('Loaded settings files.');
    } catch (e) { setStatus('Failed to list settings files.', false); }
  }

  async function loadFile(name) {
    try {
      const r = await fetch(apiBase() + '/api/settings?file=' + encodeURIComponent(name));
      const data = await r.json();
      rawYaml = data?.content ?? '';

      for (const o of Array.from(sel.options)) { if (o.value === name) sel.value = name; }

      if (formModeToggle.checked) {
        await renderSmartForm(rawYaml);
      } else {
        renderYamlEditor(rawYaml);
      }

      setStatus(`Loaded ${name}`);
    } catch (e) { setStatus('Failed to load file.', false); }
  }

  function renderYamlEditor(yamlText) {
    currentMode = 'yaml';
    dynamicContent.innerHTML = `
      <textarea id="settingsEditor" class="textarea" placeholder="# YAML settings..." style="min-height: 280px;">${yamlText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
    `;
  }

  async function renderSmartForm(yamlText) {
    currentMode = 'form';
    parsedData = parseYamlWithComments(yamlText);

    // Pre-fetch autocomplete options for detected fields
    const fieldsToPrefetch = new Set();
    for (const section of parsedData.sections) {
      for (const field of section.fields) {
        if (AUTOCOMPLETE_MAP[field.key.toLowerCase()]) {
          fieldsToPrefetch.add(field.key.toLowerCase());
        }
      }
    }

    await Promise.all([...fieldsToPrefetch].map(f => fetchAutocompleteOptions(f)));

    await renderFormFromParsed();
  }

  async function renderFormFromParsed() {
    dynamicContent.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px; padding:6px;">
        ${await generateSmartFields(parsedData)}
      </div>
    `;

    dynamicContent.querySelectorAll('input, select, textarea').forEach(input => {
      input.addEventListener('input', () => updateParsedData(input));
      input.addEventListener('change', () => updateParsedData(input));
    });
  }

  function parseYamlWithComments(yamlText) {
    const lines = yamlText.split('\n');
    const result = { sections: [] };
    let currentSection = null;
    let currentComment = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('#')) {
        const commentText = trimmed.slice(1).trim();
        if (!commentText.startsWith('===') && !commentText.startsWith('---')) {
          currentComment += (currentComment ? ' ' : '') + commentText;
        }
        continue;
      }

      if (!trimmed) {
        currentComment = '';
        continue;
      }

      if (trimmed.endsWith(':') && !trimmed.includes('  ')) {
        const sectionName = trimmed.slice(0, -1);
        currentSection = {
          name: sectionName,
          comment: currentComment,
          fields: [],
        };
        result.sections.push(currentSection);
        currentComment = '';
        continue;
      }

      if (trimmed.includes(':')) {
        const colonIndex = trimmed.indexOf(':');
        const key = trimmed.slice(0, colonIndex).trim();
        let value = trimmed.slice(colonIndex + 1).trim();

        let inlineComment = '';
        if (value.includes('#')) {
          const hashIndex = value.indexOf('#');
          inlineComment = value.slice(hashIndex + 1).trim();
          value = value.slice(0, hashIndex).trim();
        }

        const field = {
          key: key,
          value: value || '',
          type: detectType(value),
          comment: currentComment || inlineComment,
        };

        if (currentSection) {
          currentSection.fields.push(field);
        } else {
          if (result.sections.length === 0 || result.sections[0].name !== '__root__') {
            result.sections.unshift({ name: '__root__', comment: '', fields: [] });
          }
          result.sections[0].fields.push(field);
        }

        currentComment = '';
      }
    }

    return result;
  }

  function detectType(value) {
    if (!value || value === 'null') return 'text';
    if (value === 'true' || value === 'false') return 'boolean';
    if (!isNaN(value) && value !== '') return 'number';
    return 'text';
  }

  async function generateSmartFields(data) {
    let html = '';

    for (const section of data.sections) {
      if (section.name === '__root__') {
        const fieldsHtml = await Promise.all(section.fields.map(f => createFieldHtml(f, section.name)));
        html += fieldsHtml.join('');
      } else {
        const fieldsHtml = await Promise.all(section.fields.map(f => createFieldHtml(f, section.name)));
        html += `
          <details open style="border:1px solid var(--border); border-radius:8px; padding:10px; background:rgba(15,17,21,0.3);">
            <summary style="cursor:pointer; font-weight:700; color:var(--text); margin-bottom:8px; user-select:none;">
              ${section.name}
            </summary>
            ${section.comment ? `<div class="hint" style="margin-bottom:10px; font-size:11px;">${section.comment}</div>` : ''}
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${fieldsHtml.join('')}
            </div>
          </details>
        `;
      }
    }

    return html || '<div class="hint">No parseable settings found.</div>';
  }

  async function createFieldHtml(field, sectionName) {
    const id = `field_${sectionName}_${field.key}`.replace(/[^a-zA-Z0-9_]/g, '_');
    const dataPath = `${sectionName}.${field.key}`;
    const datalistId = `datalist_${id}`;
    const escapeAttr = (val) => String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Check if this field has autocomplete options
    const autocompleteOptions = await fetchAutocompleteOptions(field.key);

    let inputHtml = '';

    if (field.type === 'boolean') {
      const checked = (field.value === 'true') ? 'checked' : '';
      inputHtml = `
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="${id}" data-path="${dataPath}" ${checked} style="width:auto;"/>
          <label for="${id}" style="font-weight:600; color:var(--text); cursor:pointer;">${field.key}</label>
        </div>
        ${field.comment ? `<span class="hint" style="font-size:11px; margin-top:2px;">${field.comment}</span>` : ''}
      `;
    } else {
      const inputType = field.type === 'number' ? 'number' : 'text';
      const listAttr = autocompleteOptions ? `list="${datalistId}"` : '';
      const datalist = autocompleteOptions ? `
        <datalist id="${datalistId}">
          ${autocompleteOptions.map(opt => `<option value="${escapeAttr(opt)}">${opt}</option>`).join('')}
        </datalist>
      ` : '';

      inputHtml = `
        <div style="display:flex; flex-direction:column; gap:4px;">
          <label for="${id}" style="font-weight:600; color:var(--text);">${field.key}</label>
          <input type="${inputType}" id="${id}" data-path="${dataPath}" value="${escapeAttr(field.value)}" class="input" ${listAttr} autocomplete="off" />
          ${datalist}
          ${field.comment ? `<span class="hint" style="font-size:11px;">${field.comment}</span>` : ''}
          ${autocompleteOptions ? `<span class="hint" style="font-size:10px; color:#7aa2f7;">💡 Autocomplete from ${AUTOCOMPLETE_MAP[field.key.toLowerCase()]}</span>` : ''}
        </div>
      `;
    }

    return `<div>${inputHtml}</div>`;
  }

  function updateParsedData(input) {
    const path = input.dataset.path;
    const [sectionName, key] = path.split('.');

    let value;
    if (input.type === 'checkbox') {
      value = input.checked ? 'true' : 'false';
    } else {
      value = input.value;
    }

    const section = parsedData.sections.find(s => s.name === sectionName);
    if (section) {
      const field = section.fields.find(f => f.key === key);
      if (field) field.value = value;
    }
  }

  function formToYaml(data) {
    let yaml = '';

    for (const section of data.sections) {
      if (section.name === '__root__') {
        for (const field of section.fields) {
          if (field.comment) yaml += `# ${field.comment}\n`;
          yaml += `${field.key}: ${field.value}\n`;
        }
        if (section.fields.length) yaml += '\n';
      } else {
        if (section.comment) yaml += `# ${section.comment}\n`;
        yaml += `${section.name}:\n`;
        for (const field of section.fields) {
          const commentSuffix = field.comment ? `  # ${field.comment}` : '';
          yaml += `  ${field.key}: ${field.value}${commentSuffix}\n`;
        }
        yaml += '\n';
      }
    }

    return yaml;
  }

  async function save() {
    const name = sel.value || '';
    if (!name) { setStatus('Select a file first.', false); return; }

    let body;
    if (currentMode === 'yaml') {
      const txt = dynamicContent.querySelector('#settingsEditor');
      body = txt?.value || '';
    } else {
      body = formToYaml(parsedData);
    }

    try {
      const resp = await fetch(apiBase() + '/api/settings?file=' + encodeURIComponent(name), {
        method: 'POST', headers: { 'Content-Type': 'text/yaml' }, body
      });
      if (!resp.ok) { setStatus('Save failed.', false); return; }
      setStatus('✅ Saved.');
    } catch (e) { setStatus('Save failed.', false); }
  }

  btnSave?.addEventListener('click', save);
  btnReload?.addEventListener('click', () => { if (sel.value) loadFile(sel.value); else listFiles(); });
  sel?.addEventListener('change', () => { if (sel.value) loadFile(sel.value); });
  formModeToggle?.addEventListener('change', () => {
    if (sel.value) loadFile(sel.value);
  });
  addSectionBtn?.addEventListener('click', async () => {
    if (currentMode !== 'form') { setStatus('Switch to Smart Form Mode to add sections.', false); return; }
    const name = (window.prompt('Section name:') || '').trim();
    if (!name) return;
    if (parsedData.sections.find(s => s.name === name)) {
      setStatus('Section already exists.', false);
      return;
    }
    parsedData.sections.push({ name, comment: '', fields: [] });
    await renderFormFromParsed();
    setStatus(`Added section ${name}`);
  });
  addFieldBtn?.addEventListener('click', async () => {
    if (currentMode !== 'form') { setStatus('Switch to Smart Form Mode to add fields.', false); return; }
    const key = (window.prompt('Field key:') || '').trim();
    if (!key) return;
    const value = (window.prompt('Field value (blank allowed):') || '').trim();
    const sectionNameInput = (window.prompt('Section name (blank for root):') || '').trim();
    const sectionName = sectionNameInput || '__root__';
    let section = parsedData.sections.find(s => s.name === sectionName);
    if (!section) {
      section = { name: sectionName, comment: '', fields: [] };
      parsedData.sections.push(section);
    }
    if (section.fields.find(f => f.key === key)) {
      setStatus('Field already exists in that section.', false);
      return;
    }
    section.fields.push({ key, value, type: detectType(value), comment: '' });
    await renderFormFromParsed();
    setStatus(`Added field ${key}`);
  });

  el.querySelector('#settingsMin')?.addEventListener('click', () => el.classList.toggle('minimized'));
  el.querySelector('#settingsClose')?.addEventListener('click', () => el.style.display = 'none');

  listFiles();
  return {};
}
