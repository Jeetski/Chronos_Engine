export function Inspector() {
  let el = null;
  let currentScope = 'none';
  let currentData = null;
  let loadedItems = [];
  let loadedGoalSummaries = [];
  let loadedTemplates = [];
  let lastMonthHeatmap = null;
  const completionsCache = new Map();
  const completionsRangeCache = new Map();
  const AUTO_RESCHEDULE_KEY = 'calendar_auto_reschedule';
  let overlayPresets = [];
  let overlayPresetsLoaded = false;
  let quickWinsState = {
    items: [],
    loading: false,
    error: null,
    settings: null,
    lastDate: null,
  };
  let monthSnapshotState = {
    key: null,
    loading: false,
    error: null,
    metrics: null,
  };
  const INSERT_ALLOWED_TYPES = ['habit', 'task', 'routine', 'subroutine', 'microroutine', 'window', 'timeblock'];
  const INSERT_ALLOWED_SET = new Set(INSERT_ALLOWED_TYPES);

  function isTruthyFlag(value) {
    if (typeof value === 'boolean') return value;
    const s = String(value ?? '').trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'on';
  }

  function normalizeInsertDisplayType(row) {
    const type = String(row?.type || '').trim().toLowerCase();
    if (!type) return '';
    if (type === 'chore') return 'habit';
    if (type === 'habit_stack' || type === 'habit stack') return 'microroutine';
    if (type === 'window') return 'window';
    if (type === 'microroutine' && isTruthyFlag(row?.window)) return 'window';
    if (INSERT_ALLOWED_SET.has(type)) return type;
    return '';
  }

  function resolveInsertCommandType(row, displayType) {
    const baseType = String(row?.type || '').trim().toLowerCase();
    if (displayType === 'window') {
      // Window templates are represented as microroutines with `window: true`.
      return baseType === 'window' ? 'microroutine' : (baseType || 'microroutine');
    }
    if (displayType === 'habit') {
      return baseType === 'chore' ? 'habit' : (baseType || 'habit');
    }
    if (displayType === 'microroutine') {
      return (baseType === 'habit_stack' || baseType === 'habit stack') ? 'microroutine' : (baseType || 'microroutine');
    }
    return baseType || displayType || 'task';
  }

  function mount(targetEl) {
    el = targetEl;
    render();
  }

  async function update(scope, data) {
    currentScope = scope;
    currentData = data;

    if (scope === 'year' || scope === 'month' || scope === 'day') {
      if (!loadedItems.length) await fetchItems();
    }
    if (scope === 'year') {
      if (!loadedGoalSummaries.length) await fetchGoalSummaries();
    }
    if (scope === 'day') {
      if (!loadedTemplates.length) await fetchTemplates();
    }
    if (scope === 'month') {
      if (!overlayPresetsLoaded) await loadOverlayPresets();
      const monthCtx = getSelectedMonthContext();
      if (monthCtx && monthSnapshotState.key !== monthCtx.key) {
        await refreshMonthSnapshot(monthCtx);
      }
    }
    if (scope === 'day') {
      if (!quickWinsState.settings) await loadQuickWinsSettings();
      const dateKey = currentData?.dateKey || currentData?.dateISO || getDayKey(new Date());
      if (dateKey && quickWinsState.lastDate !== dateKey) {
        await refreshQuickWins(dateKey);
      }
    }

    if (scope === 'item') {
      const itemName = currentData?.item?.text || currentData?.item?.id;
      if (itemName) {
        currentData.itemStats = { loading: true };
        render();
        const stats = await buildCompletionStats(itemName);
        currentData.itemStats = { loading: false, ...stats };
      }
    }

    render();
  }

  // --- API Helpers ---
  function apiBase() {
    return (window.location.origin && !window.location.origin.startsWith('file'))
      ? window.location.origin
      : 'http://127.0.0.1:7357';
  }

  async function fetchItems() {
    try {
      const resp = await fetch(apiBase() + '/api/items');
      const json = await resp.json();
      if (json.ok && Array.isArray(json.items)) loadedItems = json.items;
    } catch (e) {
      loadedItems = [];
    }
  }

  async function fetchGoalSummaries() {
    try {
      const resp = await fetch(apiBase() + '/api/goals');
      const json = await resp.json();
      if (json.ok && Array.isArray(json.goals)) loadedGoalSummaries = json.goals;
      else loadedGoalSummaries = [];
    } catch (e) {
      loadedGoalSummaries = [];
    }
  }

  async function fetchTemplates() {
    const types = ['routine', 'subroutine', 'microroutine', 'timeblock'];
    const out = [];
    for (const t of types) {
      try {
        const resp = await fetch(apiBase() + `/api/template/list?type=${encodeURIComponent(t)}`);
        const json = await resp.json();
        if (json.ok && Array.isArray(json.templates)) {
          json.templates.forEach(name => out.push({ name, type: t }));
        }
      } catch { }
    }
    loadedTemplates = out;
  }

  function emitToast(type, message) {
    try { window?.context?.bus?.emit(`toast:${type}`, message); } catch { }
  }

  async function runCli(command, args = [], properties = {}) {
    try {
      if (typeof window.ChronosRunCliCommand === 'function') {
        const result = await window.ChronosRunCliCommand({ command, args, properties });
        if (result?.canceled) {
          return {
            ok: false,
            text: result?.choice === 'edit_sleep' ? 'Sleep settings opened.' : 'Command canceled.',
            stdout: '',
            stderr: '',
            error: '',
            canceled: true,
          };
        }
        const payload = result?.data || {};
        const resp = result?.response;
        return {
          ok: !!(resp?.ok && payload?.ok !== false),
          text: String(payload?.stdout || payload?.stderr || payload?.error || ''),
          stdout: String(payload?.stdout || ''),
          stderr: String(payload?.stderr || ''),
          error: payload?.error ? String(payload.error) : '',
        };
      }
      const propLines = Object.entries(properties || {})
        .map(([k, v]) => `  ${k}: ${String(v)}`).join('\n');
      const body = `command: ${command}\nargs:\n${(args || []).map(a => '  - ' + String(a)).join('\n')}\n${propLines ? 'properties:\n' + propLines + '\n' : ''}`;
      const resp = await fetch(apiBase() + '/api/cli', {
        method: 'POST',
        headers: { 'Content-Type': 'text/yaml' },
        body,
      });
      const text = await resp.text();
      let payload = null;
      try { payload = JSON.parse(text); } catch { }
      return {
        ok: resp.ok && (payload?.ok !== false),
        text,
        stdout: String(payload?.stdout || ''),
        stderr: String(payload?.stderr || ''),
        error: payload?.error ? String(payload.error) : '',
      };
    } catch (e) {
      return { ok: false, text: String(e || 'Request failed'), stdout: '', stderr: '', error: String(e || '') };
    }
  }

  function cliFailureText(result) {
    if (!result || result.ok === false) {
      return String(result?.error || result?.stderr || result?.text || 'Command failed.');
    }
    const out = String(result.stdout || result.text || '');
    if (/❌/.test(out) || /\bError\b/i.test(out) || /\bInvalid format\b/i.test(out)) {
      return out.trim();
    }
    return '';
  }

  async function readProjectFile(path) {
    try {
      const resp = await fetch(apiBase() + `/api/file/read?path=${encodeURIComponent(path)}`);
      const json = await resp.json();
      if (!resp.ok || !json.ok) return null;
      return String(json.content || '');
    } catch {
      return null;
    }
  }

  async function loadTypeOptions() {
    return INSERT_ALLOWED_TYPES.slice();
  }

  // --- Data Helpers ---
  function getDayKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  async function loadCompletions(dateObj) {
    try {
      const key = getDayKey(dateObj);
      if (completionsCache.has(key)) return completionsCache.get(key);
      const resp = await fetch(apiBase() + `/api/completions?date=${key}`);
      const text = await resp.text();
      // Parse minimal YAML: completed: [ - name ]
      const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
      let inList = false; const names = [];
      for (const raw of lines) {
        const line = raw.replace(/#.*$/, '');
        if (!line.trim()) continue;
        if (!inList) {
          if (/^\s*completed\s*:/i.test(line)) inList = true;
          continue;
        }
        const m = line.match(/^\s*-\s*(.+)$/);
        if (m) names.push(m[1].trim());
      }
      completionsCache.set(key, names);
      return names;
    } catch {
      return [];
    }
  }

  async function loadCompletionsRange(startDate, endDate) {
    try {
      const startKey = getDayKey(startDate);
      const endKey = getDayKey(endDate);
      const rangeKey = `${startKey}_${endKey}`;
      if (completionsRangeCache.has(rangeKey)) return completionsRangeCache.get(rangeKey);
      const resp = await fetch(apiBase() + `/api/completions?start=${startKey}&end=${endKey}`);
      const text = await resp.text();
      let parsed = null;
      try {
        if (typeof window !== 'undefined' && typeof window.parseYaml === 'function') {
          parsed = window.parseYaml(text);
        }
      } catch { }
      const byDate = (parsed && parsed.completed_by_date && typeof parsed.completed_by_date === 'object') ? parsed.completed_by_date : {};
      Object.entries(byDate).forEach(([dateKey, entries]) => {
        if (Array.isArray(entries)) completionsCache.set(dateKey, entries.map(v => String(v)));
      });
      completionsRangeCache.set(rangeKey, byDate);
      return byDate;
    } catch {
      return {};
    }
  }

  function parseHmToMinutes(value) {
    if (!value) return null;
    const m = String(value).match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (Number.isNaN(h) || Number.isNaN(mm)) return null;
    return (h * 60) + mm;
  }

  function flattenScheduleData(scheduleData) {
    const blocks = [];
    const walk = (items, depth = 0) => {
      if (!Array.isArray(items)) return;
      items.forEach((it, orderIdx) => {
        if (!it || typeof it !== 'object') return;
        const original = (it.original_item_data && typeof it.original_item_data === 'object') ? it.original_item_data : {};
        const name = it.name || original.name || '';
        const type = String(it.type || original.type || '').toLowerCase();
        const start = parseHmToMinutes(it.start_time || original.start_time || it.ideal_start_time);
        const end = parseHmToMinutes(it.end_time || original.end_time || it.ideal_end_time);
        if (name && start != null && end != null && end > start) {
          blocks.push({ text: String(name), type, start, end, depth, order: Number(orderIdx) || 0 });
        }
        const children = it.children || it.items || [];
        if (Array.isArray(children) && children.length) walk(children, depth + 1);
      });
    };

    if (Array.isArray(scheduleData)) walk(scheduleData, 0);
    else if (scheduleData && typeof scheduleData === 'object') {
      const root = scheduleData.items || scheduleData.children || [];
      walk(root, 0);
    }
    return blocks;
  }

  function parseScheduleYamlContent(text) {
    if (!text || !String(text).trim()) return [];
    try {
      if (typeof window !== 'undefined' && typeof window.parseYaml === 'function') {
        const parsed = window.parseYaml(String(text));
        return flattenScheduleData(parsed);
      }
    } catch { }
    return [];
  }

  function getSelectedMonthContext() {
    const now = new Date();
    const year = Number(window.__calendarSelectedYear ?? now.getFullYear());
    const monthIndex = Number(window.__calendarSelectedMonth ?? now.getMonth());
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return null;
    const first = new Date(year, monthIndex, 1);
    const last = new Date(year, monthIndex + 1, 0);
    return {
      year,
      monthIndex,
      month: monthIndex + 1,
      totalDays: last.getDate(),
      first,
      last,
      key: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    };
  }

  function parseDateOnly(value) {
    const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return new Date(y, m - 1, d);
  }

  function formatDateLabel(dateObj) {
    if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '';
    return dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function collectDeadlineDueEntries(startDate, endDate) {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return [];
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) return [];
    const out = [];
    (loadedItems || []).forEach((item) => {
      if (!item || typeof item !== 'object' || isCompletedStatus(item)) return;
      const name = item.name || 'Untitled';
      const type = String(item.type || 'item');
      const priority = String(item.priority || '').trim();
      const deadline = parseDateOnly(item.deadline);
      const dueDate = parseDateOnly(item.due_date || item.due);
      if (deadline && deadline >= startDate && deadline <= endDate) {
        out.push({ kind: 'deadline', date: deadline, name, type, priority });
      }
      if (dueDate && dueDate >= startDate && dueDate <= endDate) {
        out.push({ kind: 'due_date', date: dueDate, name, type, priority });
      }
    });
    out.sort((a, b) => {
      const delta = a.date - b.date;
      if (delta !== 0) return delta;
      if (a.kind === 'deadline' && b.kind !== 'deadline') return -1;
      if (a.kind !== 'deadline' && b.kind === 'deadline') return 1;
      return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
    });
    return out;
  }

  function renderDeadlineDueSection(startDate, endDate, options = {}) {
    const entries = collectDeadlineDueEntries(startDate, endDate);
    const maxRows = Number(options.maxRows || 16);
    const visible = entries.slice(0, maxRows);
    const deadlineCount = entries.filter(e => e.kind === 'deadline').length;
    const dueCount = entries.filter(e => e.kind === 'due_date').length;
    return `
      <div class="inspector-kv">
        <div><span>Deadlines</span><span>${deadlineCount}</span></div>
        <div><span>Due Dates</span><span>${dueCount}</span></div>
        <div><span>Total</span><span>${entries.length}</span></div>
      </div>
      <div class="inspector-list">
        ${visible.length ? visible.map((entry) => {
        const kindLabel = entry.kind === 'deadline' ? 'DEADLINE' : 'DUE';
        const pr = entry.priority ? ` • ${entry.priority}` : '';
        return `<div class="inspector-card">${formatDateLabel(entry.date)} • ${kindLabel} • ${entry.type}${pr}<br/>${entry.name}</div>`;
      }).join('') : '<div class="inspector-muted">No deadlines or due dates in this range.</div>'}
      </div>
      ${entries.length > visible.length ? `<div class="inspector-muted">Showing ${visible.length} of ${entries.length} entries.</div>` : ''}
    `;
  }

  function isCompletedStatus(item) {
    const s = String(item?.status || '').toLowerCase();
    return s === 'complete' || s === 'completed' || !!item?.complete;
  }

  function formatMinutesShort(totalMinutes) {
    const mins = Math.max(0, Math.round(Number(totalMinutes || 0)));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!h) return `${m}m`;
    if (!m) return `${h}h`;
    return `${h}h ${m}m`;
  }

  async function refreshMonthSnapshot(ctx) {
    if (!ctx) return;
    monthSnapshotState.loading = true;
    monthSnapshotState.error = null;
    monthSnapshotState.metrics = null;
    monthSnapshotState.key = ctx.key;
    render();

    try {
      const monthStart = new Date(ctx.first);
      const monthEnd = new Date(ctx.last);
      const completionsByDate = await loadCompletionsRange(monthStart, monthEnd);

      let scheduledMinutes = 0;
      let scheduledBlocks = 0;
      let completedScheduledBlocks = 0;
      let missedBlocks = 0;
      let streakBreakDays = 0;
      let busiestDay = null;
      let busiestMinutes = 0;

      for (let day = 1; day <= ctx.totalDays; day++) {
        const dateObj = new Date(ctx.year, ctx.monthIndex, day);
        const dateKey = getDayKey(dateObj);
        const path = `user/schedules/schedule_${dateKey}.yml`;
        const content = await readProjectFile(path);
        if (!content) continue;
        const blocks = parseScheduleYamlContent(content);
        if (!blocks.length) continue;

        const completedNames = new Set(((completionsByDate && completionsByDate[dateKey]) || []).map(v => String(v || '').toLowerCase()));
        let dayMinutes = 0;
        let dayHasRoutine = false;
        let dayCompletedRoutine = false;

        blocks.forEach(block => {
          const minutes = Math.max(0, Number(block.end || 0) - Number(block.start || 0));
          dayMinutes += minutes;
          scheduledMinutes += minutes;
          scheduledBlocks += 1;

          const done = completedNames.has(String(block.text || '').toLowerCase());
          if (done) completedScheduledBlocks += 1;
          else missedBlocks += 1;

          const type = String(block.type || '').toLowerCase();
          const isRoutineish = type === 'habit' || type === 'routine' || type === 'subroutine' || type === 'microroutine';
          if (isRoutineish) {
            dayHasRoutine = true;
            if (done) dayCompletedRoutine = true;
          }
        });

        if (dayHasRoutine && !dayCompletedRoutine) streakBreakDays += 1;
        if (dayMinutes > busiestMinutes) {
          busiestMinutes = dayMinutes;
          busiestDay = dateKey;
        }
      }

      const avgMinutesPerDay = scheduledMinutes / Math.max(1, ctx.totalDays);
      const completionRate = scheduledBlocks ? Math.round((completedScheduledBlocks / scheduledBlocks) * 100) : 0;

      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const dueItems = [];
      const deadlineItems = [];
      const overdueItems = [];
      const dueSoonRisk = [];

      (loadedItems || []).forEach(item => {
        if (!item || typeof item !== 'object' || isCompletedStatus(item)) return;
        const dueDate = parseDateOnly(item.due_date || item.due);
        const deadline = parseDateOnly(item.deadline);

        if (dueDate && dueDate >= monthStart && dueDate <= monthEnd) dueItems.push(item);
        if (deadline && deadline >= monthStart && deadline <= monthEnd) deadlineItems.push(item);

        const effective = deadline || dueDate;
        if (!effective) return;
        if (effective < monthStart) overdueItems.push(item);
        const daysAway = Math.round((effective.getTime() - now.getTime()) / 86400000);
        if (daysAway >= 0 && daysAway <= 7) {
          dueSoonRisk.push({
            name: item.name || 'Untitled',
            type: item.type || 'item',
            priority: String(item.priority || '').toLowerCase(),
            date: effective,
          });
        }
      });

      dueSoonRisk.sort((a, b) => {
        const pA = a.priority === 'high' ? 0 : (a.priority === 'medium' ? 1 : 2);
        const pB = b.priority === 'high' ? 0 : (b.priority === 'medium' ? 1 : 2);
        if (pA !== pB) return pA - pB;
        return a.date - b.date;
      });

      monthSnapshotState.metrics = {
        scheduledLoad: formatMinutesShort(scheduledMinutes),
        avgPerDay: formatMinutesShort(avgMinutesPerDay),
        busiestDay: busiestDay || 'n/a',
        busiestLoad: formatMinutesShort(busiestMinutes),
        dueThisMonth: dueItems.length,
        deadlinesThisMonth: deadlineItems.length,
        overdueCarryIn: overdueItems.length,
        dueSoon7d: dueSoonRisk.length,
        completionRate,
        scheduledBlocks,
        completedScheduledBlocks,
        missedBlocks,
        streakBreakDays,
        topRisk: dueSoonRisk.slice(0, 4),
      };
      monthSnapshotState.error = null;
    } catch (e) {
      monthSnapshotState.error = 'Unable to compute month snapshot.';
      monthSnapshotState.metrics = null;
    } finally {
      monthSnapshotState.loading = false;
      render();
    }
  }

  async function buildCompletionStats(itemName) {
    const now = new Date();
    const target = String(itemName || '').toLowerCase();
    const counts = { week: 0, month: 0, year: 0 };
    const start = new Date(now);
    start.setDate(now.getDate() - 364);
    await loadCompletionsRange(start, now);

    for (let i = 0; i < 365; i++) {
      const dateObj = new Date(now);
      dateObj.setDate(now.getDate() - i);
      const completed = await loadCompletions(dateObj);
      const matches = completed.filter(name => String(name || '').toLowerCase() === target);
      const inc = matches.length;
      if (i < 7) counts.week += inc;
      if (i < 30) counts.month += inc;
      counts.year += inc;
    }

    return counts;
  }

  function getScheduleStore() {
    try {
      if (window.dayBlocksStore && typeof window.dayBlocksStore === 'object') return window.dayBlocksStore;
      const raw = localStorage.getItem('pm_day_blocks');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function summarizeItemSchedule(itemName) {
    const store = getScheduleStore();
    const now = new Date();
    const todayKey = getDayKey(now);
    const yearKey = todayKey.slice(0, 4);
    let weekCount = 0;
    let monthCount = 0;
    let yearCount = 0;
    let totalMinutes = 0;

    const sameWeek = (a, b) => {
      const d = new Date(a);
      const e = new Date(b);
      const day = (d.getDay() + 6) % 7;
      const monday = new Date(d); monday.setDate(d.getDate() - day); monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      return e >= monday && e <= sunday;
    };

    Object.entries(store || {}).forEach(([dateKey, blocks]) => {
      if (!Array.isArray(blocks)) return;
      const dateObj = new Date(dateKey);
      if (Number.isNaN(dateObj.getTime())) return;
      const matches = blocks.filter(b => String(b.text || '').toLowerCase() === String(itemName || '').toLowerCase());
      if (!matches.length) return;
      const mins = matches.reduce((sum, b) => sum + Math.max(0, (b.end || 0) - (b.start || 0)), 0);
      totalMinutes += mins;
      if (String(dateKey).startsWith(yearKey)) yearCount += matches.length;
      if (dateObj.getMonth() === now.getMonth() && dateObj.getFullYear() === now.getFullYear()) monthCount += matches.length;
      if (sameWeek(now, dateObj)) weekCount += matches.length;
    });

    return { weekCount, monthCount, yearCount, totalMinutes };
  }

  async function loadOverlayPresets(force = false) {
    if (overlayPresetsLoaded && !force) return overlayPresets;
    try {
      const resp = await fetch(apiBase() + '/api/calendar/overlays');
      const json = await resp.json();
      if (json.ok && Array.isArray(json.presets)) {
        overlayPresets = json.presets;
      } else {
        overlayPresets = [];
      }
      overlayPresetsLoaded = true;
      return overlayPresets;
    } catch {
      overlayPresetsLoaded = true;
      overlayPresets = [];
      return [];
    }
  }

  function getOverlayPresets() {
    return overlayPresets || [];
  }

  async function saveOverlayPreset(preset) {
    try {
      const body = [
        `name: ${String(preset.name || '').trim()}`,
        `mode: ${String(preset.mode || '').trim()}`,
        `value: ${String(preset.value || '').trim()}`,
        `use_momentum: ${preset.use_momentum ? 'true' : 'false'}`,
        `kind: ${String(preset.kind || 'custom')}`,
      ].join('\n') + '\n';
      const resp = await fetch(apiBase() + '/api/calendar/overlays', {
        method: 'POST',
        headers: { 'Content-Type': 'text/yaml' },
        body,
      });
      const json = await resp.json();
      if (json.ok) {
        await loadOverlayPresets(true);
      }
      return json.ok;
    } catch {
      return false;
    }
  }

  async function deleteOverlayPreset(name) {
    try {
      const body = `name: ${String(name || '').trim()}\n`;
      const resp = await fetch(apiBase() + '/api/calendar/overlays/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'text/yaml' },
        body,
      });
      const json = await resp.json();
      if (json.ok) {
        await loadOverlayPresets(true);
      }
      return json.ok;
    } catch {
      return false;
    }
  }

  function defaultQuickWinsSettings() {
    return {
      max_minutes: 15,
      days_window: 3,
      limit: 20,
      include_missed: true,
      include_overdue: true,
      include_due: true,
      quick_label: 'quick',
    };
  }

  function normalizeQuickWinsSettings(raw) {
    const base = defaultQuickWinsSettings();
    if (!raw || typeof raw !== 'object') return base;
    const merged = { ...base, ...raw };
    merged.max_minutes = Number.isFinite(Number(merged.max_minutes)) ? Number(merged.max_minutes) : base.max_minutes;
    merged.days_window = Number.isFinite(Number(merged.days_window)) ? Number(merged.days_window) : base.days_window;
    merged.limit = Number.isFinite(Number(merged.limit)) ? Number(merged.limit) : base.limit;
    merged.include_missed = !!merged.include_missed;
    merged.include_overdue = !!merged.include_overdue;
    merged.include_due = !!merged.include_due;
    merged.quick_label = String(merged.quick_label || base.quick_label);
    return merged;
  }

  async function readSettingsFile(name) {
    try {
      const resp = await fetch(apiBase() + `/api/settings?file=${encodeURIComponent(name)}`);
      if (!resp.ok) return { ok: false };
      const json = await resp.json();
      return json;
    } catch {
      return { ok: false };
    }
  }

  async function writeSettingsFile(name, content) {
    try {
      const resp = await fetch(apiBase() + `/api/settings?file=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: content,
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  function yamlScalar(value) {
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    const s = String(value ?? '');
    if (!s.length) return "''";
    if (/^[A-Za-z0-9._-]+$/.test(s)) return s;
    return JSON.stringify(s);
  }

  function buildYaml(value, indent = 0) {
    const pad = '  '.repeat(indent);
    if (Array.isArray(value)) {
      if (!value.length) return pad + '[]';
      return value.map(item => `${pad}-\n${buildYaml(item, indent + 1)}`).join('\n');
    }
    if (typeof value === 'object' && value !== null) {
      return Object.entries(value).map(([k, v]) => {
        if (v === undefined || v === null) return '';
        if (Array.isArray(v) && !v.length) return '';
        if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) return '';
        if (Array.isArray(v) || typeof v === 'object') {
          return `${pad}${k}:\n${buildYaml(v, indent + 1)}`;
        }
        return `${pad}${k}: ${yamlScalar(v)}`;
      }).filter(Boolean).join('\n');
    }
    return pad + yamlScalar(value);
  }

  async function loadQuickWinsSettings(force = false) {
    if (quickWinsState.settings && !force) return quickWinsState.settings;
    const defaults = defaultQuickWinsSettings();
    try {
      const res = await readSettingsFile('quick_wins_settings.yml');
      if (res?.ok && res?.data && typeof res.data === 'object') {
        quickWinsState.settings = normalizeQuickWinsSettings(res.data);
      } else {
        quickWinsState.settings = defaults;
      }
    } catch {
      quickWinsState.settings = defaults;
    }
    return quickWinsState.settings;
  }

  async function saveQuickWinsSettings(settings) {
    const normalized = normalizeQuickWinsSettings(settings);
    const yaml = buildYaml(normalized) + '\n';
    const ok = await writeSettingsFile('quick_wins_settings.yml', yaml);
    if (ok) quickWinsState.settings = normalized;
    return ok;
  }

  async function refreshQuickWins(dateKey, overrides = null) {
    if (!dateKey) return;
    const base = normalizeQuickWinsSettings(quickWinsState.settings);
    const settings = normalizeQuickWinsSettings({ ...base, ...(overrides || {}) });
    quickWinsState.loading = true;
    quickWinsState.error = null;
    quickWinsState.lastDate = dateKey;
    render();
    const props = {
      format: 'json',
      date: dateKey,
      minutes: settings.max_minutes,
      days: settings.days_window,
      limit: settings.limit,
      missed: settings.include_missed,
      overdue: settings.include_overdue,
      due: settings.include_due,
    };
    const res = await runCli('quickwins', [], props);
    if (!res.ok) {
      quickWinsState.loading = false;
      quickWinsState.items = [];
      quickWinsState.error = res.text || 'Quick wins failed.';
      render();
      return;
    }
    try {
      let parsed = null;
      let raw = String(res.text || '').trim();
      if (raw) {
        try {
          const outer = JSON.parse(raw);
          if (outer && typeof outer === 'object' && typeof outer.stdout === 'string') {
            raw = outer.stdout.trim();
          } else {
            parsed = outer;
          }
        } catch { }
      }
      if (!parsed && raw) {
        parsed = JSON.parse(raw);
      }
      quickWinsState.items = Array.isArray(parsed?.items) ? parsed.items : [];
      quickWinsState.error = null;
    } catch (e) {
      quickWinsState.items = [];
      quickWinsState.error = 'Quick wins response was invalid.';
    }
    quickWinsState.loading = false;
    render();
  }

  function uniqueChecklistLabel(base, existing) {
    let label = base;
    let counter = 2;
    const labels = new Set((existing || []).map(l => String(l.label || '').toLowerCase()));
    while (labels.has(label.toLowerCase())) {
      label = `${base} (${counter})`;
      counter += 1;
    }
    return label;
  }

  function quickWinsChecklistItems(items) {
    return (items || []).map(row => ({
      id: (window.crypto?.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).slice(2)),
      text: row.name || row.text || 'Quick Win',
      type: row.type || 'task',
      name: row.name || row.text || '',
      daily: false,
    })).filter(row => row.name);
  }

  async function copyQuickWinsToChecklist(dateKey) {
    const items = quickWinsChecklistItems(quickWinsState.items || []);
    if (!items.length) return { ok: false, error: 'No quick wins to copy.' };
    const res = await readSettingsFile('checklists.yml');
    const payload = (res?.data && typeof res.data === 'object') ? res.data : { lists: [] };
    if (!Array.isArray(payload.lists)) payload.lists = [];
    const baseLabel = `Quick Wins ${dateKey}`;
    const label = uniqueChecklistLabel(baseLabel, payload.lists);
    const id = `quick_wins_${String(dateKey || '').replace(/-/g, '')}_${Math.random().toString(36).slice(2, 6)}`;
    payload.lists.push({
      id,
      label,
      items,
      completed: {},
      completed_daily: {},
    });
    const yaml = buildYaml(payload) + '\n';
    const ok = await writeSettingsFile('checklists.yml', yaml);
    return { ok, label };
  }

  // --- Render Logic ---
  function render() {
    if (!el) return;
    el.innerHTML = renderShell(renderContent());
    attachEvents();
  }

  function renderShell(contentHtml) {
    return `
      <div class="inspector-shell">
        <div class="inspector-header">
          <div class="inspector-title">${getPayloadTitle()}</div>
          <div class="inspector-subtitle">${getPayloadSubtitle()}</div>
        </div>
        <div class="inspector-body">${contentHtml}</div>
      </div>
    `;
  }

  function getPayloadTitle() {
    switch (currentScope) {
      case 'year': return `Year ${currentData?.year || ''}`;
      case 'month': return currentData?.label || 'Month View';
      case 'week': return 'Weekly Overview';
      case 'day': return currentData?.dateString || 'Day View';
      case 'item': return currentData?.item?.text || 'Item Details';
      default: return 'Calendar Inspector';
    }
  }

  function getPayloadSubtitle() {
    switch (currentScope) {
      case 'year': return 'Resolutions and Annual Goals';
      case 'month': return 'Heatmaps and Patterns';
      case 'week': return 'Rhythm & Balance';
      case 'day': return 'Operations Console';
      case 'item': return 'Control + Stats';
      default: return 'Select an element to view details';
    }
  }

  function renderContent() {
    if (currentScope === 'none') return `<div class="inspector-empty">No selection</div>`;
    if (currentScope === 'year') return renderYearContent();
    if (currentScope === 'month') return renderMonthContent();
    if (currentScope === 'day') return renderDayContent();
    if (currentScope === 'item') return renderItemContent();
    return `<div class="inspector-empty">Content for ${currentScope} coming soon...</div>`;
  }

  function renderCollapsibleSection(title, bodyHtml, options = {}) {
    const attrs = options.attrs ? ` ${options.attrs}` : '';
    const openAttr = options.open ? ' open' : '';
    return `
      <details class="inspector-section inspector-collapsible"${openAttr}${attrs}>
        <summary class="inspector-section-title">${title}</summary>
        <div class="inspector-section-content">${bodyHtml}</div>
      </details>
    `;
  }

  function calculateResolutionProgress(item) {
    const type = String(item?.type || 'task').toLowerCase();
    if (type === 'goal') {
      const milestones = Array.isArray(item?.milestones) ? item.milestones : [];
      if (!milestones.length) return { percent: 0, label: 'No milestones' };
      const completed = milestones.filter(m => m?.status === 'complete' || m?.status === 'completed' || m?.complete).length;
      const percent = Math.round((completed / milestones.length) * 100);
      return { percent, label: `${completed}/${milestones.length} milestones` };
    }
    if (type === 'habit') {
      const currentStreak = Number(item?.current_streak || 0);
      const targetStreak = Number(item?.target_streak || 30) || 30;
      const percent = Math.min(100, Math.round((currentStreak / targetStreak) * 100));
      if (item?.polarity === 'bad') {
        const cleanStreak = Number(item?.clean_current_streak || 0);
        return { percent, label: `${cleanStreak} day clean streak` };
      }
      return { percent, label: `${currentStreak} day streak` };
    }
    if (type === 'commitment') {
      const percent = Math.max(0, Math.min(100, Math.round(Number(item?.success_rate || 0))));
      return { percent, label: `${percent}% success rate` };
    }
    if (type === 'task') {
      const complete = item?.status === 'complete' || item?.status === 'completed' || !!item?.complete;
      return { percent: complete ? 100 : 0, label: complete ? 'Complete' : 'Not done' };
    }
    if (type === 'project') {
      const tasks = Array.isArray(item?.tasks) ? item.tasks : [];
      if (!tasks.length) return { percent: 0, label: 'No tasks' };
      const done = tasks.filter(t => t?.complete || t?.status === 'complete' || t?.status === 'completed').length;
      const percent = Math.round((done / tasks.length) * 100);
      return { percent, label: `${done}/${tasks.length} tasks` };
    }
    if (type === 'routine') return { percent: 100, label: 'Active routine' };
    return { percent: 0, label: 'Unknown type' };
  }

  function renderYearContent() {
    const year = Number(currentData?.year) || (new Date()).getFullYear();
    const projectsByName = new Map(
      loadedItems
        .filter(i => String(i?.type || '').toLowerCase() === 'project' && i?.name && i?.resolution)
        .map(i => [String(i.name), i.resolution])
    );
    const goalsByName = new Map(
      loadedItems
        .filter(i => String(i?.type || '').toLowerCase() === 'goal' && i?.name)
        .map(i => [String(i.name), i])
    );
    const effectiveResolution = (item) => {
      if (!item) return null;
      if (item.resolution) return item.resolution;
      if (item.resolution_ref) return projectsByName.get(String(item.resolution_ref)) || null;
      const t = String(item.type || '').toLowerCase();
      if ((t === 'goal' || t === 'milestone') && item.project) {
        return projectsByName.get(String(item.project)) || null;
      }
      if (t === 'milestone' && item.goal) {
        const g = goalsByName.get(String(item.goal));
        if (g?.project) return projectsByName.get(String(g.project)) || null;
      }
      return null;
    };
    const resolutionItems = loadedItems.filter(item => {
      const res = effectiveResolution(item);
      if (!res) return false;
      const resYearRaw = res?.year;
      if (resYearRaw == null || resYearRaw === '') return true;
      const resYear = Number(resYearRaw);
      return Number.isFinite(resYear) && resYear === year;
    });
    const resolutionSummaries = (() => {
      const map = new Map();
      resolutionItems.forEach((item) => {
        const res = effectiveResolution(item);
        if (!res) return;
        const key = [
          String(res.year ?? ''),
          String(res.affirmation || ''),
          String(res.raw_text || ''),
        ].join('||');
        if (!map.has(key)) map.set(key, { resolution: res, items: [] });
        map.get(key).items.push(item);
      });
      const summaries = Array.from(map.values()).map((entry) => {
        const percent = entry.items.length
          ? Math.round(entry.items.reduce((sum, it) => sum + Number(calculateResolutionProgress(it).percent || 0), 0) / entry.items.length)
          : 0;
        return {
          resolution: entry.resolution,
          percent,
          label: `${entry.items.length} linked items`,
        };
      });
      summaries.sort((a, b) => Number(b.percent || 0) - Number(a.percent || 0));
      return summaries;
    })();
    const annualGoals = loadedGoalSummaries.filter(goal => {
      const datedField = String(goal?.due_date || goal?.deadline || '').trim();
      if (datedField) {
        const dueYear = Number(String(datedField).slice(0, 4));
        if (Number.isFinite(dueYear)) return dueYear === year;
      }
      const rawGoal = goalsByName.get(String(goal?.name || ''));
      const rawDatedField = String(rawGoal?.due_date ?? rawGoal?.deadline ?? '').trim();
      if (rawDatedField) {
        const rawYear = Number(String(rawDatedField).slice(0, 4));
        if (Number.isFinite(rawYear)) return rawYear === year;
      }
      const explicitYear = Number(rawGoal?.year ?? rawGoal?.target_year ?? rawGoal?.resolution?.year);
      return Number.isFinite(explicitYear) && explicitYear === year;
    });
    const annualGoalsByQuarter = { Q1: [], Q2: [], Q3: [], Q4: [], Unscheduled: [] };
    const parseQuarterNumber = (value) => {
      if (value == null) return null;
      const text = String(value).trim().toUpperCase();
      if (!text) return null;
      const match = text.match(/Q?\s*([1-4])/);
      if (!match) return null;
      const quarter = Number(match[1]);
      return Number.isFinite(quarter) ? quarter : null;
    };
    const quarterFromDate = (dateValue) => {
      const dateText = String(dateValue || '').trim();
      if (!dateText) return null;
      const month = Number(dateText.slice(5, 7));
      if (!Number.isFinite(month) || month < 1 || month > 12) return null;
      return Math.ceil(month / 3);
    };
    annualGoals.forEach(goal => {
      const rawGoal = goalsByName.get(String(goal?.name || '')) || {};
      const explicitQuarter = parseQuarterNumber(
        rawGoal?.quarter ??
        rawGoal?.target_quarter ??
        rawGoal?.resolution?.quarter ??
        goal?.quarter ??
        goal?.target_quarter
      );
      const quarterFromDueDate = quarterFromDate(
        goal?.due_date ||
        goal?.deadline ||
        rawGoal?.due_date ||
        rawGoal?.deadline
      );
      const quarter = explicitQuarter || quarterFromDueDate;
      if (quarter >= 1 && quarter <= 4) {
        annualGoalsByQuarter[`Q${quarter}`].push(goal);
      } else {
        annualGoalsByQuarter.Unscheduled.push(goal);
      }
    });

    return `
      ${renderCollapsibleSection('Resolutions', `${resolutionSummaries.length ? `
          <div class="inspector-goal-rings">
            ${resolutionSummaries.slice(0, 12).map((summary) => {
      const percent = Math.max(0, Math.min(100, Number(summary.percent || 0)));
      const res = summary.resolution || {};
      const label = res?.affirmation || 'Untitled Resolution';
      const meta = summary.label || '';
      return `
                <div class="inspector-goal-ring-card">
                  <div class="inspector-goal-ring" style="--p:${percent};">
                    <div class="inspector-goal-ring-center">${percent}%</div>
                  </div>
                  <div class="inspector-goal-ring-name">${label}</div>
                  <div class="inspector-goal-ring-meta">${meta}</div>
                </div>
              `;
    }).join('')}
          </div>
        ` : '<div class="inspector-muted">No resolutions found for this year.</div>'}`)}
      ${renderCollapsibleSection('Annual Goals', `${annualGoals.length ? `
          <div class="inspector-quarter-grid">
            ${['Q1', 'Q2', 'Q3', 'Q4'].map(quarterLabel => {
      const goals = annualGoalsByQuarter[quarterLabel] || [];
      return `
              <div class="inspector-quarter-card">
                <div class="inspector-quarter-head">
                  <span class="inspector-quarter-name">${quarterLabel}</span>
                  <span class="inspector-quarter-count">${goals.length}</span>
                </div>
                ${goals.length ? `
                  <div class="inspector-goal-rings">
                    ${goals.slice(0, 6).map(g => {
            const completed = Math.max(0, Number(g.milestones_completed || 0));
            const total = Math.max(0, Number(g.milestones_total || 0));
            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
            return `
                      <div class="inspector-goal-ring-card">
                        <div class="inspector-goal-ring" style="--p:${percent};">
                          <div class="inspector-goal-ring-center">${percent}%</div>
                        </div>
                        <div class="inspector-goal-ring-name">${g.name || 'Untitled Goal'}</div>
                        <div class="inspector-goal-ring-meta">${completed}/${total} milestones</div>
                      </div>
                    `;
          }).join('')}
                  </div>
                ` : '<div class="inspector-muted">No goals in this quarter.</div>'}
              </div>
            `;
    }).join('')}
          </div>
          ${annualGoalsByQuarter.Unscheduled.length ? `
            <div class="inspector-quarter-unscheduled">
              <div class="inspector-quarter-head">
                <span class="inspector-quarter-name">Unscheduled</span>
                <span class="inspector-quarter-count">${annualGoalsByQuarter.Unscheduled.length}</span>
              </div>
              <div class="inspector-list">
                ${annualGoalsByQuarter.Unscheduled.slice(0, 8).map(g => `<div class="inspector-card">${g.name || 'Untitled Goal'}</div>`).join('')}
              </div>
              </div>
            ` : ''}
        ` : '<div class="inspector-muted">No annual goals found for this year.</div>'}`)}
    `;
  }

  function renderMonthContent() {
    const monthCtx = getSelectedMonthContext();
    const monthDeadlinesHtml = monthCtx
      ? renderDeadlineDueSection(monthCtx.first, monthCtx.last, { maxRows: 20 })
      : '<div class="inspector-muted">No month selected.</div>';
    const presets = getOverlayPresets();
    const monthSnapshotHtml = monthSnapshotState.loading
      ? '<div class="inspector-muted">Calculating month snapshot...</div>'
      : (monthSnapshotState.error
        ? `<div class="inspector-muted">${monthSnapshotState.error}</div>`
        : (() => {
          const m = monthSnapshotState.metrics;
          if (!m) return '<div class="inspector-muted">No month data yet.</div>';
          const riskList = m.topRisk.length
            ? `<div class="inspector-list">${m.topRisk.map(r => `<div class="inspector-card">${r.name} (${r.type})</div>`).join('')}</div>`
            : '<div class="inspector-muted">No near-term risk items.</div>';
          return `
            <div class="inspector-kv">
              <div><span>Scheduled Load</span><span>${m.scheduledLoad}</span></div>
              <div><span>Average / Day</span><span>${m.avgPerDay}</span></div>
              <div><span>Busiest Day</span><span>${m.busiestDay} (${m.busiestLoad})</span></div>
              <div><span>Due This Month</span><span>${m.dueThisMonth}</span></div>
              <div><span>Deadlines This Month</span><span>${m.deadlinesThisMonth}</span></div>
              <div><span>Overdue Carry-In</span><span>${m.overdueCarryIn}</span></div>
              <div><span>Due in 7 Days</span><span>${m.dueSoon7d}</span></div>
              <div><span>Completion Rate</span><span>${m.completionRate}% (${m.completedScheduledBlocks}/${m.scheduledBlocks})</span></div>
              <div><span>Missed Blocks</span><span>${m.missedBlocks}</span></div>
              <div><span>Streak Break Days</span><span>${m.streakBreakDays}</span></div>
            </div>
            <div class="inspector-section-title" style="margin-top:10px;">Top Risk Items</div>
            ${riskList}
          `;
        })());
    return `
      ${renderCollapsibleSection('Deadlines & Due Dates', `
        ${monthDeadlinesHtml}
      `)}
      ${renderCollapsibleSection('Default Presets', `
        <div class="inspector-grid">
          <button class="inspector-btn" data-action="overlay-clear">Clear</button>
          <button class="inspector-btn" data-action="overlay-reload">Reload Presets</button>
        </div>
        <div class="inspector-list">
          ${presets.filter(p => (p.kind || '').toLowerCase() === 'default').length ? presets.filter(p => (p.kind || '').toLowerCase() === 'default').map(p => `
            <div class="inspector-row">
              <button class="inspector-btn" data-action="overlay-preset" data-mode="${p.mode || ''}" data-value="${p.value || ''}" data-momentum="${p.use_momentum ? 'true' : 'false'}">${p.name}</button>
            </div>
          `).join('') : '<div class="inspector-muted">No default presets found.</div>'}
        </div>
        <div class="inspector-muted">Heatmaps map from low to high intensity.</div>
      `)}
      ${renderCollapsibleSection('Custom Presets', `
        <div class="inspector-list">
          ${presets.filter(p => (p.kind || '').toLowerCase() !== 'default').length ? presets.filter(p => (p.kind || '').toLowerCase() !== 'default').map(p => `
            <div class="inspector-row">
              <button class="inspector-btn" data-action="overlay-preset" data-mode="${p.mode || ''}" data-value="${p.value || ''}" data-momentum="${p.use_momentum ? 'true' : 'false'}">${p.name}</button>
              <button class="inspector-btn inspector-btn-ghost" data-action="overlay-preset-delete" data-name="${p.name}">✕</button>
            </div>
          `).join('') : '<div class="inspector-muted">No custom presets saved yet.</div>'}
        </div>
      `)}
      ${renderCollapsibleSection('Custom Overlay', `
        <div class="inspector-field">
          <label>Filter Mode</label>
          <select class="inspector-input" id="overlayMode">
            <option value="name">Name contains</option>
            <option value="type">Type</option>
            <option value="category">Category</option>
            <option value="priority">Priority</option>
            <option value="status">Status</option>
            <option value="tags">Tag</option>
            <option value="project">Project</option>
            <option value="goal">Goal</option>
            <option value="happiness">Happiness</option>
            <option value="custom_property">Custom Property</option>
          </select>
        </div>
        <div class="inspector-field" id="overlayCustomKeyWrap" style="display:none;">
          <label>Property Key</label>
          <input class="inspector-input" id="overlayCustomKey" placeholder="e.g., focus_depth" />
        </div>
        <div class="inspector-field">
          <label>Value</label>
          <input class="inspector-input" id="overlayValue" placeholder="e.g., Deep Work / Work / high" />
        </div>
        <div class="inspector-grid">
          <button class="inspector-btn" data-action="overlay-custom">Apply</button>
          <button class="inspector-btn" data-action="overlay-save">Save Preset</button>
        </div>
        <div class="inspector-muted">Custom overlays use completion history + item properties.</div>
      `)}
      ${renderCollapsibleSection('Month Snapshot', `
        ${monthSnapshotHtml}
      `)}
    `;
  }

  function renderDayContent() {
    const autoReschedule = (localStorage.getItem(AUTO_RESCHEDULE_KEY) || 'true') === 'true';
    const quickSettings = normalizeQuickWinsSettings(quickWinsState.settings);
    const quickDateKey = currentData?.dateKey || currentData?.dateISO || getDayKey(new Date());
    const isQuickToday = quickDateKey === getDayKey(new Date());
    const dayDate = parseDateOnly(quickDateKey) || new Date();
    const dayDeadlinesHtml = renderDeadlineDueSection(dayDate, dayDate, { maxRows: 30 });
    const quickItems = Array.isArray(quickWinsState.items) ? quickWinsState.items : [];
    const quickLabel = quickSettings.quick_label || 'quick';
    const quickListHtml = quickWinsState.loading
      ? '<div class="inspector-muted">Loading quick wins...</div>'
      : (quickItems.length ? quickItems.map(it => {
        const minutes = Number(it.minutes || 0);
        const minutesLabel = (!minutes || minutes <= 0) ? quickLabel : (it.inferred ? `~${minutes}m` : `${minutes}m`);
        const type = it.type || 'task';
        const name = it.name || 'Untitled';
        return `
          <div class="inspector-row inspector-quick-row">
            <div class="inspector-quick-main">
              <div class="inspector-quick-title">${name}</div>
              <div class="inspector-quick-reason">${type} - ${it.reason || ''}</div>
            </div>
            <div class="inspector-pill">${minutesLabel}</div>
            <div class="inspector-quick-actions">
              <button class="inspector-btn inspector-btn-ghost" data-action="quickwins-complete" data-name="${name}" data-type="${type}" data-minutes="${minutes}" ${isQuickToday ? '' : 'disabled'}>✓</button>
              <button class="inspector-btn inspector-btn-ghost" data-action="quickwins-inject" data-name="${name}" data-type="${type}" ${isQuickToday ? '' : 'disabled'}>+</button>
            </div>
          </div>
        `;
      }).join('') : '<div class="inspector-muted">No quick wins found.</div>');
    return `
      ${renderCollapsibleSection('Deadlines & Due Dates', `
        ${dayDeadlinesHtml}
      `)}
      ${renderCollapsibleSection('Insert Schedulables', `
        <div class="inspector-field">
          <label>Search items</label>
          <input class="inspector-input" id="insertSearch" placeholder="Type to search" />
        </div>
        <div class="inspector-field">
          <label>Filter type</label>
          <select class="inspector-input" id="insertType">
            <option value="">All types</option>
          </select>
        </div>
        <div class="inspector-list" id="insertResults"></div>
        <div class="inspector-muted">Allowed: habits/chores, tasks, routines, subroutines, microroutines/habit stacks, windows, timeblocks.</div>
      `)}

      ${renderCollapsibleSection('Actions', `
        <div class="inspector-grid">
          <button class="inspector-btn" data-action="start-day">Start Day + Open Timer</button>
        </div>
        <div class="inspector-grid">
          <button class="inspector-btn" data-action="reschedule">Reschedule</button>
          <button class="inspector-btn" data-action="open-scheduler">Open Scheduler</button>
          <button class="inspector-btn" data-action="open-status">Open Status</button>
        </div>
        <div class="inspector-grid">
          <button class="inspector-btn" data-action="shift-15">Shift +15m</button>
          <button class="inspector-btn" data-action="compact">Compact Gaps</button>
          <button class="inspector-btn" data-action="save-day-template">Save Day Template</button>
        </div>
        <label class="inspector-toggle">
          <input type="checkbox" id="autoRescheduleToggle" ${autoReschedule ? 'checked' : ''} />
          Auto-apply changes
        </label>
        <div class="inspector-section-title" style="margin-top:10px;">Injection Policy</div>
        <div class="inspector-grid">
          <label class="inspector-toggle">
            <input type="checkbox" id="injectForceToggle" />
            Force inject (replace overlaps)
          </label>
          <label class="inspector-toggle">
            <input type="checkbox" id="injectOverrideAnchorToggle" />
            Allow anchor override
          </label>
        </div>
        <div class="inspector-muted">Used by Insert and Quick Wins inject actions.</div>
      `)}

      ${renderCollapsibleSection('Quick Wins', `
        <div class="inspector-muted">For ${quickDateKey}${isQuickToday ? ' (today)' : ''}</div>
        <div class="inspector-grid">
          <div class="inspector-field">
            <label>Max minutes</label>
            <input class="inspector-input" id="quickWinsMinutes" type="number" min="1" value="${quickSettings.max_minutes}" />
          </div>
          <div class="inspector-field">
            <label>Days window</label>
            <input class="inspector-input" id="quickWinsDays" type="number" min="0" value="${quickSettings.days_window}" />
          </div>
          <div class="inspector-field">
            <label>Limit</label>
            <input class="inspector-input" id="quickWinsLimit" type="number" min="0" value="${quickSettings.limit}" />
          </div>
        </div>
        <div class="inspector-grid">
          <label class="inspector-toggle">
            <input type="checkbox" id="quickWinsMissed" ${quickSettings.include_missed ? 'checked' : ''} />
            Missed schedule
          </label>
          <label class="inspector-toggle">
            <input type="checkbox" id="quickWinsOverdue" ${quickSettings.include_overdue ? 'checked' : ''} />
            Overdue
          </label>
          <label class="inspector-toggle">
            <input type="checkbox" id="quickWinsDue" ${quickSettings.include_due ? 'checked' : ''} />
            Due soon
          </label>
        </div>
        <div class="inspector-grid">
          <button class="inspector-btn" data-action="quickwins-refresh">Refresh</button>
          <button class="inspector-btn" data-action="quickwins-save">Save Defaults</button>
          <button class="inspector-btn" data-action="quickwins-copy">Copy to Checklist</button>
        </div>
        ${quickWinsState.error ? `<div class="inspector-muted">${quickWinsState.error}</div>` : ''}
        <div class="inspector-list" id="quickWinsList">${quickListHtml}</div>
        ${isQuickToday ? '' : '<div class="inspector-muted">Inject/complete actions only affect today.</div>'}
      `, { attrs: 'data-quickwins-section' })}
    `;
  }

  function renderItemContent() {
    const item = currentData.item || {};
    const safeName = item.text || item.id || 'Unknown';
    const anchored = !!item.anchored || String(item.reschedule || '').toLowerCase() === 'never';
    const rawStart = String(item.start || '');
    const rawEnd = String(item.end || '');
    const safeStart = /^\d{2}:\d{2}$/.test(rawStart) ? rawStart : '';
    const safeEnd = /^\d{2}:\d{2}$/.test(rawEnd) ? rawEnd : '';
    const stats = summarizeItemSchedule(safeName);
    const completionStats = currentData?.itemStats || {};
    const loadingStats = completionStats.loading;
    const items = Array.isArray(currentData?.items) ? currentData.items : [];
    const multi = items.length > 1;

    return `
      ${multi ? `
      ${renderCollapsibleSection('Multi-Select', `
        <div class="inspector-muted">Selected ${items.length} blocks.</div>
        <div class="inspector-grid">
          <button class="inspector-btn" data-action="merge-selected">Merge Selected</button>
          <button class="inspector-btn" data-action="clear-selection">Clear Selection</button>
        </div>
        <div class="inspector-list">
          ${items.map(it => `<div class="inspector-card">${it.text || 'Untitled'}</div>`).join('')}
        </div>
      `)}
      ` : ''}
      ${renderCollapsibleSection('Quick Actions', `
        <div class="inspector-muted">Anchor: ${anchored ? 'Anchored' : 'Flexible'}</div>
        <div class="inspector-grid">
          <button class="inspector-btn" data-action="start-now" data-id="${safeName}">Start Now</button>
          <button class="inspector-btn" data-action="delay-5" data-id="${safeName}">Delay +5</button>
          <button class="inspector-btn" data-action="delay-15" data-id="${safeName}">Delay +15</button>
          <button class="inspector-btn" data-action="delay-30" data-id="${safeName}">Delay +30</button>
        </div>
        <div class="inspector-grid">
          <button class="inspector-btn" data-action="trim-5" data-id="${safeName}">Trim -5</button>
          <button class="inspector-btn" data-action="trim-15" data-id="${safeName}">Trim -15</button>
          <button class="inspector-btn" data-action="trim-30" data-id="${safeName}">Trim -30</button>
          <button class="inspector-btn" data-action="stretch-5" data-id="${safeName}">Stretch +5</button>
        </div>
        <div class="inspector-grid">
          <button class="inspector-btn" data-action="stretch-15" data-id="${safeName}">Stretch +15</button>
          <button class="inspector-btn" data-action="stretch-30" data-id="${safeName}">Stretch +30</button>
          <input class="inspector-input" id="trimCustom" placeholder="-min" />
          <button class="inspector-btn" data-action="trim-custom" data-id="${safeName}">Trim</button>
        </div>
        <div class="inspector-grid">
          <input class="inspector-input" id="stretchCustom" placeholder="+min" />
          <button class="inspector-btn" data-action="stretch-custom" data-id="${safeName}">Stretch</button>
          <button class="inspector-btn" data-action="cut" data-id="${safeName}">Cut</button>
        </div>
        <div class="inspector-grid">
          <button class="inspector-btn" data-action="anchor-today" data-id="${safeName}">Anchor Today</button>
          <button class="inspector-btn" data-action="anchor-always" data-id="${safeName}">Anchor Always</button>
          <button class="inspector-btn" data-action="split" data-id="${safeName}">Split</button>
          <button class="inspector-btn" data-action="merge" data-id="${safeName}">Merge</button>
        </div>
      `)}

      ${renderCollapsibleSection('Completion', `
        ${multi ? '<div class="inspector-muted">Applies to selected blocks.</div>' : ''}
        <div class="inspector-grid">
          <button class="inspector-btn" data-action="mark-completed">✓ Done</button>
          <button class="inspector-btn" data-action="mark-skipped">⊘ Skipped</button>
          <button class="inspector-btn" data-action="skip-today">⏭ Skip Today</button>
          <button class="inspector-btn" data-action="mark-delayed">⏰ Delayed</button>
        </div>
        <div class="inspector-field">
          <label>Did (Actuals)</label>
          <div class="inspector-grid">
            <input class="inspector-input" id="inspectorDidStart" type="time" step="60" value="${safeStart}" />
            <input class="inspector-input" id="inspectorDidEnd" type="time" step="60" value="${safeEnd}" />
            <select class="inspector-input" id="inspectorDidStatus">
              <option value="completed">completed</option>
              <option value="partial">partial</option>
              <option value="skipped">skipped</option>
            </select>
          </div>
        </div>
        <div class="inspector-grid">
          <input class="inspector-input" id="inspectorDidNote" placeholder="note" />
          <button class="inspector-btn" data-action="did-log">✓ Did</button>
        </div>
      `)}

      ${renderCollapsibleSection('Stats (Scheduled vs Completed)', `
        <div class="inspector-kv">
          <div><span>Week Scheduled</span><span>${stats.weekCount}</span></div>
          <div><span>Week Completed</span><span>${loadingStats ? '...' : (completionStats.week ?? 0)}</span></div>
          <div><span>Month Scheduled</span><span>${stats.monthCount}</span></div>
          <div><span>Month Completed</span><span>${loadingStats ? '...' : (completionStats.month ?? 0)}</span></div>
          <div><span>Year Scheduled</span><span>${stats.yearCount}</span></div>
          <div><span>Year Completed</span><span>${loadingStats ? '...' : (completionStats.year ?? 0)}</span></div>
          <div><span>Total Minutes</span><span>${stats.totalMinutes}</span></div>
        </div>
        <div class="inspector-muted">Completion stats are based on block completions. Scheduled counts are from cached schedules.</div>
      `)}

      ${renderCollapsibleSection('Edit Block', `
        <div class="inspector-field">
          <label>Title</label>
          <input type="text" id="inspector-edit-title" class="inspector-input" value="${safeName}" />
        </div>
        <div class="inspector-field">
          <label>Type</label>
          <div class="inspector-pill">${item.type || 'item'}</div>
        </div>
        <div class="inspector-grid">
          <button class="inspector-btn" data-action="save-item" data-id="${safeName}">Save Changes</button>
          <button class="inspector-btn" data-action="delete-item" data-id="${safeName}">Delete</button>
        </div>
      `)}
    `;
  }

  function attachEvents() {
    if (!el) return;
    const selectedItem = currentData?.item || {};
    const selectedItems = Array.isArray(currentData?.items) ? currentData.items : [];
    const selectedName = selectedItem.text || selectedItem.id || '';
    const selectedType = String(selectedItem.type || '').trim() || 'task';
    const didStartInput = el.querySelector('#inspectorDidStart');
    const didEndInput = el.querySelector('#inspectorDidEnd');
    const didStatusInput = el.querySelector('#inspectorDidStatus');
    const didNoteInput = el.querySelector('#inspectorDidNote');
    const completionDate = String(currentData?.dateKey || currentData?.dateISO || '').trim();
    const resolveTargets = () => {
      if (selectedItems.length) return selectedItems.filter(it => it && it.text);
      if (selectedName) return [{ text: selectedName, start: selectedItem.start || '' }];
      return [];
    };
    const resolveCompletionTargets = () => {
      if (selectedItems.length) return selectedItems.filter(it => it && it.text);
      if (selectedName) return [{ text: selectedName, start: selectedItem.start || '', end: selectedItem.end || '' }];
      return [];
    };
    const applyChangeForTargets = async (targets, timeResolver) => {
      for (const it of targets) {
        const nextTime = timeResolver(it);
        if (!nextTime) continue;
        await runAndReschedule('change', [it.text, nextTime]);
      }
    };
    const autoRescheduleToggle = el.querySelector('#autoRescheduleToggle');
    const injectForceToggle = el.querySelector('#injectForceToggle');
    const injectOverrideAnchorToggle = el.querySelector('#injectOverrideAnchorToggle');

    if (autoRescheduleToggle) {
      autoRescheduleToggle.addEventListener('change', () => {
        localStorage.setItem(AUTO_RESCHEDULE_KEY, autoRescheduleToggle.checked ? 'true' : 'false');
      });
    }

    const shouldAutoReschedule = () => (localStorage.getItem(AUTO_RESCHEDULE_KEY) || 'true') === 'true';

    async function runAndReschedule(command, args, props = {}) {
      const res = await runCli(command, args, props);
      if (res.ok && shouldAutoReschedule()) {
        await runCli('today', ['reschedule']);
        try { window.__calendarRefreshDayList?.(); } catch { }
      }
      return res;
    }

    function readInjectProperties(type) {
      const props = { type };
      if (injectForceToggle?.checked) props.force = true;
      if (injectOverrideAnchorToggle?.checked) props.override_anchor = true;
      return props;
    }

    function toTimeString(dateObj) {
      const h = String(dateObj.getHours()).padStart(2, '0');
      const m = String(dateObj.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }

    function parseTimeString(value) {
      if (!value || typeof value !== 'string') return null;
      const match = value.match(/(\d{1,2}):(\d{2})/);
      if (!match) return null;
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      return { h, m };
    }

    function addMinutesToTime(value, delta) {
      const parsed = parseTimeString(value);
      const base = new Date();
      if (!parsed) {
        base.setMinutes(base.getMinutes() + delta);
        return toTimeString(base);
      }
      base.setHours(parsed.h, parsed.m, 0, 0);
      base.setMinutes(base.getMinutes() + delta);
      return toTimeString(base);
    }

    // Inject list with items
    const insertList = el.querySelector('#insertResults');
    const insertSearch = el.querySelector('#insertSearch');
    const insertType = el.querySelector('#insertType');

    if (insertType) {
      loadTypeOptions().then(types => {
        insertType.innerHTML = '';
        const all = document.createElement('option');
        all.value = '';
        all.textContent = 'All allowed';
        insertType.appendChild(all);
        types.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t; opt.textContent = t;
          insertType.appendChild(opt);
        });
      });
    }

    function renderInsertList() {
      if (!insertList) return;
      const query = String(insertSearch?.value || '').toLowerCase().trim();
      const filterType = String(insertType?.value || '').toLowerCase().trim();
      const items = (loadedItems || [])
        .map(i => {
          const displayType = normalizeInsertDisplayType(i);
          if (!displayType) return null;
          return {
            name: i.name,
            type: resolveInsertCommandType(i, displayType),
            displayType,
            isTemplate: false,
          };
        })
        .filter(Boolean)
        .filter(i => !filterType || i.displayType === filterType)
        .filter(i => !query || String(i.name || '').toLowerCase().includes(query))
        .slice(0, 50);
      const templates = (loadedTemplates || [])
        .map(t => {
          const displayType = normalizeInsertDisplayType(t);
          if (!displayType) return null;
          return {
            name: t.name,
            type: resolveInsertCommandType(t, displayType),
            displayType,
            isTemplate: true,
          };
        })
        .filter(Boolean)
        .filter(t => !filterType || t.displayType === filterType)
        .filter(t => !query || String(t.name || '').toLowerCase().includes(query))
        .slice(0, 50);
      const mergedRaw = [...items, ...templates];
      const templateLike = new Set(['routine', 'subroutine', 'microroutine', 'window', 'timeblock']);
      const deduped = new Map();
      for (const row of mergedRaw) {
        const nameKey = String(row?.name || '').trim().toLowerCase();
        const typeKey = String(row?.displayType || '').trim().toLowerCase();
        if (!nameKey || !typeKey) continue;
        const key = `${nameKey}::${typeKey}`;
        const prev = deduped.get(key);
        if (!prev) {
          deduped.set(key, row);
          continue;
        }
        // Prefer template source for template-like types, otherwise prefer item source.
        const preferTemplate = templateLike.has(typeKey);
        const takeRow = preferTemplate ? (!!row.isTemplate && !prev.isTemplate) : (!row.isTemplate && !!prev.isTemplate);
        if (takeRow) deduped.set(key, row);
      }
      const merged = Array.from(deduped.values()).slice(0, 60);

      insertList.innerHTML = merged.length ? merged.map(i => `
        <div class="inspector-item">
          <span class="inspector-item-icon">◇</span>
          <div class="inspector-item-meta">
            <div class="inspector-item-name">${i.name || 'Untitled'}</div>
            <div class="inspector-item-type">${i.isTemplate ? `${i.displayType} template` : (i.displayType || 'item')}</div>
          </div>
          <button class="inspector-btn inspector-btn-ghost" data-action="insert-now" data-name="${i.name}" data-type="${i.type || 'task'}" title="Insert now">▶</button>
        </div>
      `).join('') : '<div class="inspector-muted">No items found.</div>';
    }

    insertSearch?.addEventListener('input', renderInsertList);
    insertType?.addEventListener('change', renderInsertList);
    renderInsertList();

    el.querySelectorAll('[data-action="insert-now"]').forEach(b => b.onclick = async () => {
      const name = String(b.dataset.name || '').trim();
      const type = String(b.dataset.type || 'task').trim();
      if (!name) return;
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const res = await runCli('today', ['inject', name, 'at', time], readInjectProperties(type));
      if (res.ok) {
        emitToast('success', `Inserted ${name} at ${time}`);
        try { window.__calendarRefreshDayList?.(); } catch { }
      } else {
        emitToast('error', res.text || 'Insert failed.');
      }
    });

    // Quick Wins controls
    const quickWinsSection = el.querySelector('[data-quickwins-section]');
    if (quickWinsSection) {
      const quickWinsMinutes = el.querySelector('#quickWinsMinutes');
      const quickWinsDays = el.querySelector('#quickWinsDays');
      const quickWinsLimit = el.querySelector('#quickWinsLimit');
      const quickWinsMissed = el.querySelector('#quickWinsMissed');
      const quickWinsOverdue = el.querySelector('#quickWinsOverdue');
      const quickWinsDue = el.querySelector('#quickWinsDue');
      const selectedDayKey = currentData?.dateKey || currentData?.dateISO || getDayKey(new Date());
      const isToday = selectedDayKey === getDayKey(new Date());

      const readQuickWinsInputs = () => {
        const base = normalizeQuickWinsSettings(quickWinsState.settings);
        const minutes = parseInt(String(quickWinsMinutes?.value || ''), 10);
        const days = parseInt(String(quickWinsDays?.value || ''), 10);
        const limit = parseInt(String(quickWinsLimit?.value || ''), 10);
        return {
          max_minutes: Number.isFinite(minutes) ? minutes : base.max_minutes,
          days_window: Number.isFinite(days) ? days : base.days_window,
          limit: Number.isFinite(limit) ? limit : base.limit,
          include_missed: !!quickWinsMissed?.checked,
          include_overdue: !!quickWinsOverdue?.checked,
          include_due: !!quickWinsDue?.checked,
          quick_label: base.quick_label,
        };
      };

      el.querySelectorAll('[data-action="quickwins-refresh"]').forEach(b => b.onclick = async () => {
        const settings = readQuickWinsInputs();
        quickWinsState.settings = settings;
        await refreshQuickWins(selectedDayKey, settings);
      });

      el.querySelectorAll('[data-action="quickwins-save"]').forEach(b => b.onclick = async () => {
        const settings = readQuickWinsInputs();
        const ok = await saveQuickWinsSettings(settings);
        if (ok) emitToast('success', 'Quick wins defaults saved.');
        else emitToast('error', 'Failed to save quick wins defaults.');
      });

      el.querySelectorAll('[data-action="quickwins-copy"]').forEach(b => b.onclick = async () => {
        const result = await copyQuickWinsToChecklist(selectedDayKey);
        if (result.ok) emitToast('success', `Copied to checklist: ${result.label}`);
        else emitToast('error', result.error || 'Copy failed.');
      });

      el.querySelectorAll('[data-action="quickwins-complete"]').forEach(b => b.onclick = async () => {
        if (!isToday) {
          emitToast('info', 'Complete actions only apply to today.');
          return;
        }
        const name = String(b.dataset.name || '').trim();
        const type = String(b.dataset.type || 'task').trim();
        if (!name) return;
        const minutes = parseInt(String(b.dataset.minutes || ''), 10);
        const props = {};
        if (Number.isFinite(minutes) && minutes > 0) props.minutes = minutes;
        const res = await runCli('complete', [type, name], props);
        if (res.ok) emitToast('success', `Completed ${name}.`);
        else emitToast('error', res.text || 'Complete failed.');
      });

      el.querySelectorAll('[data-action="quickwins-inject"]').forEach(b => b.onclick = async () => {
        if (!isToday) return;
        const name = String(b.dataset.name || '').trim();
        const type = String(b.dataset.type || 'task').trim();
        if (!name) return;
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const res = await runCli('today', ['inject', name, 'at', time], readInjectProperties(type));
        if (res.ok) {
          emitToast('success', `Injected ${name} at ${time}.`);
          try { window.__calendarRefreshDayList?.(); } catch { }
        } else {
          emitToast('error', res.text || 'Inject failed.');
        }
      });
    }

    // Overlay buttons
    const overlayMode = el.querySelector('#overlayMode');
    const overlayValue = el.querySelector('#overlayValue');
    const overlayCustomKeyWrap = el.querySelector('#overlayCustomKeyWrap');
    const overlayCustomKey = el.querySelector('#overlayCustomKey');

    function resolveOverlayFilter() {
      const modeRaw = String(overlayMode?.value || 'name').trim();
      const value = String(overlayValue?.value || '').trim();
      if (modeRaw !== 'custom_property') return { mode: modeRaw, value };
      const customKey = String(overlayCustomKey?.value || '').trim().toLowerCase();
      return { mode: customKey, value, invalid: !customKey };
    }

    function syncOverlayModeUi() {
      const isCustom = String(overlayMode?.value || '') === 'custom_property';
      if (overlayCustomKeyWrap) overlayCustomKeyWrap.style.display = isCustom ? 'flex' : 'none';
    }
    if (overlayMode) overlayMode.addEventListener('change', syncOverlayModeUi);
    syncOverlayModeUi();

    el.querySelectorAll('[data-action="overlay-clear"]').forEach(b => b.onclick = () => {
      try { window.__calendarSetOverlay?.(null, {}); } catch { }
    });
    el.querySelectorAll('[data-action="overlay-reload"]').forEach(b => b.onclick = async () => {
      await loadOverlayPresets(true);
      render();
    });
    el.querySelectorAll('[data-action="overlay-custom"]').forEach(b => b.onclick = () => {
      const filter = resolveOverlayFilter();
      if (filter.invalid) { emitToast('info', 'Enter a property key first.'); return; }
      const mode = filter.mode;
      const value = filter.value;
      if (!value) { emitToast('info', 'Enter a value first.'); return; }
      buildCompletionHeatmap({ useMomentum: false, mode, value });
    });
    el.querySelectorAll('[data-action="overlay-save"]').forEach(b => b.onclick = () => {
      const filter = resolveOverlayFilter();
      if (filter.invalid) { emitToast('info', 'Enter a property key first.'); return; }
      const mode = filter.mode;
      const value = filter.value;
      if (!value) { emitToast('info', 'Enter a value first.'); return; }
      const name = prompt('Preset name?', value) || '';
      if (!name.trim()) return;
      saveOverlayPreset({ name: name.trim(), mode, value, use_momentum: false, kind: 'custom' }).then((ok) => {
        if (!ok) emitToast('error', 'Failed to save preset.');
        render();
      });
    });
    el.querySelectorAll('[data-action="overlay-preset"]').forEach(b => b.onclick = () => {
      const mode = String(b.dataset.mode || '').trim();
      const value = String(b.dataset.value || '').trim();
      const useMomentum = String(b.dataset.momentum || '').trim() === 'true';
      if (!mode) return;
      if (mode === 'happiness_scheduled') {
        buildHappinessHeatmap('scheduled');
        return;
      }
      if (mode === 'happiness_completed') {
        buildHappinessHeatmap('completed');
        return;
      }
      if (value) buildCompletionHeatmap({ useMomentum, mode, value });
    });
    el.querySelectorAll('[data-action="overlay-preset-delete"]').forEach(b => b.onclick = () => {
      const name = String(b.dataset.name || '').trim();
      if (!name) return;
      deleteOverlayPreset(name).then((ok) => {
        if (!ok) emitToast('error', 'Failed to delete preset.');
        render();
      });
    });

    // Day actions
    el.querySelectorAll('[data-action="start-day"]').forEach(b => b.onclick = async () => {
      const btn = b;
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Starting...';
        try {
          if (typeof window.ChronosStartDay === 'function') {
          const result = await window.ChronosStartDay({ source: 'calendar-inspector', target: 'day' });
          if (result?.canceled) return;
          } else {
            const resp = await fetch(apiBase() + '/api/day/start', {
              method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: 'day' }),
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || data.ok === false) throw new Error(data.error || data.stderr || `HTTP ${resp.status}`);
        }
        try { window.ChronosBus?.emit?.('timer:show', { source: 'calendar-inspector' }); } catch { }
        try { window.__calendarRefreshDayList?.(true); } catch { }
        emitToast('success', 'Day started. Timer opened.');
      } catch (err) {
        emitToast('error', `Failed to start day: ${err?.message || err}`);
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });
    el.querySelectorAll('[data-action="reschedule"]').forEach(b => b.onclick = async () => {
      const res = await runCli('today', ['reschedule']);
      if (res.ok) emitToast('success', 'Rescheduled.');
      else emitToast('error', res.text || 'Reschedule failed.');
    });
    el.querySelectorAll('[data-action="open-scheduler"]').forEach(b => b.onclick = () => {
      let opened = false;
      try { window?.context?.bus?.emit('widget:show', 'Today'); opened = true; } catch { }
      try { window?.ChronosBus?.emit?.('widget:show', 'Today'); opened = true; } catch { }
      try {
        const widget = document.querySelector('[data-widget="Today"]');
        if (widget) {
          widget.style.display = '';
          window?.ChronosFocusWidget?.(widget);
          opened = true;
        }
      } catch { }
      if (!opened) emitToast('error', 'Scheduler widget is not available.');
    });
    el.querySelectorAll('[data-action="open-status"]').forEach(b => b.onclick = () => {
      let opened = false;
      try { window?.context?.bus?.emit('widget:show', 'Status'); opened = true; } catch { }
      try { window?.ChronosBus?.emit?.('widget:show', 'Status'); opened = true; } catch { }
      try {
        const widget = document.querySelector('[data-widget="Status"]');
        if (widget) {
          widget.style.display = '';
          window?.ChronosFocusWidget?.(widget);
          opened = true;
        }
      } catch { }
      if (!opened) emitToast('error', 'Status widget is not available.');
    });
    el.querySelectorAll('[data-action="shift-15"]').forEach(b => b.onclick = async () => {
      const targets = resolveCompletionTargets();
      if (selectedItems.length > 1 && targets.length) {
        for (const it of targets) {
          if (!it?.text) continue;
          const props = {};
          if (completionDate) props.date = completionDate;
          if (it.start) props.start_time = it.start;
          await runAndReschedule('shift', [it.text, '15'], props);
        }
        return;
      }
      const props = {};
      if (completionDate) props.date = completionDate;
      if (selectedItem?.start) props.start_time = selectedItem.start;
      const id = String(selectedItem?.text || selectedItem?.id || '').trim();
      if (!id) return;
      const res = await runAndReschedule('shift', [id, '15'], props);
      if (!res?.ok) emitToast('error', res.text || 'Shift failed.');
    });
    el.querySelectorAll('[data-action="compact"]').forEach(b => b.onclick = () => emitToast('info', 'Compact gaps pending.'));
    el.querySelectorAll('[data-action="save-day-template"]').forEach(b => b.onclick = async () => {
      const name = prompt('Template name?', '') || '';
      if (!name.trim()) return;
      const weekday = (prompt('Bind to weekday? (e.g., Monday) Leave blank for none.', '') || '').trim();
      const overwrite = confirm('Overwrite if template exists?');
      const props = {};
      if (weekday) props.weekday = weekday;
      if (overwrite) props.overwrite = 'true';
      const res = await runCli('template', ['save', 'day', name.trim()], props);
      if (res.ok) emitToast('success', `Saved day template: ${name.trim()}`);
      else emitToast('error', res.text || 'Save failed.');
    });

    // Item actions
    function emitDayListCompletionFeedback(status, marks) {
      const normalizedStatus = String(status || '').trim().toLowerCase();
      const rows = (Array.isArray(marks) ? marks : [])
        .map((it) => ({
          text: String(it?.text || '').trim(),
          start: String(it?.start || '').trim(),
          end: String(it?.end || '').trim(),
        }))
        .filter((it) => !!it.text);
      if (!normalizedStatus || !rows.length) return;
      try {
        window.dispatchEvent(new CustomEvent('chronos:calendar:completion-marked', {
          detail: {
            status: normalizedStatus,
            date: completionDate || '',
            marks: rows,
          },
        }));
      } catch { }
    }
    async function markTargets(status) {
      const targets = resolveCompletionTargets();
      if (!targets.length) return;
      let failed = 0;
      let failure = '';
      for (const it of targets) {
        const props = {};
        if (completionDate) props.date = completionDate;
        if (it.start) props.start_time = it.start;
        if (it.end) props.end_time = it.end;
        const res = await runCli('mark', [`${it.text}:${status}`], props);
        const err = cliFailureText(res);
        if (err) {
          failed += 1;
          if (!failure) failure = err;
        } else {
          emitDayListCompletionFeedback(status, [it]);
        }
      }
      if (failed) {
        emitToast('error', failure || `Failed to mark ${failed} block${failed > 1 ? 's' : ''}.`);
        return;
      }
      const statusLabel = status === 'skipped' ? 'skipped for today' : status;
      emitToast('success', `Marked ${targets.length} block${targets.length > 1 ? 's' : ''} as ${statusLabel}.`);
    }

    el.querySelectorAll('[data-action="mark-completed"]').forEach(b => b.onclick = async () => markTargets('completed'));
    el.querySelectorAll('[data-action="mark-skipped"]').forEach(b => b.onclick = async () => markTargets('skipped'));
    el.querySelectorAll('[data-action="skip-today"]').forEach(b => b.onclick = async () => markTargets('skipped'));
    el.querySelectorAll('[data-action="mark-delayed"]').forEach(b => b.onclick = async () => markTargets('delayed'));
    el.querySelectorAll('[data-action="did-log"]').forEach(b => b.onclick = async () => {
      const targets = resolveCompletionTargets();
      if (!targets.length) return;
      const status = String(didStatusInput?.value || 'completed').trim();
      const note = String(didNoteInput?.value || '').trim();
      const useInputTimes = !!(String(didStartInput?.value || '').trim() || String(didEndInput?.value || '').trim());
      let failed = 0;
      let failure = '';
      for (const it of targets) {
        const props = {};
        if (completionDate) props.date = completionDate;
        const st = useInputTimes ? String(didStartInput?.value || '').trim() : String(it.start || '').trim();
        const en = useInputTimes ? String(didEndInput?.value || '').trim() : String(it.end || '').trim();
        if (st) props.start_time = st;
        if (en) props.end_time = en;
        if (status) props.status = status;
        if (note) props.note = note;
        const res = await runCli('did', [it.text], props);
        const err = cliFailureText(res);
        if (err) {
          failed += 1;
          if (!failure) failure = err;
        } else {
          emitDayListCompletionFeedback(status, [it]);
        }
      }
      if (failed) {
        emitToast('error', failure || `Failed to log actuals for ${failed} block${failed > 1 ? 's' : ''}.`);
        return;
      }
      emitToast('success', `Logged actuals for ${targets.length} block${targets.length > 1 ? 's' : ''}.`);
    });

    el.querySelectorAll('[data-action="trim-5"]').forEach(b => b.onclick = async () => {
      if (selectedItems.length > 1) {
        for (const it of selectedItems) {
          if (!it?.text) continue;
          await runAndReschedule('trim', [it.text, '5']);
        }
        return;
      }
      await runAndReschedule('trim', [b.dataset.id, '5']);
    });
    el.querySelectorAll('[data-action="trim-15"]').forEach(b => b.onclick = async () => {
      if (selectedItems.length > 1) {
        for (const it of selectedItems) {
          if (!it?.text) continue;
          await runAndReschedule('trim', [it.text, '15']);
        }
        return;
      }
      await runAndReschedule('trim', [b.dataset.id, '15']);
    });
    el.querySelectorAll('[data-action="trim-30"]').forEach(b => b.onclick = async () => {
      if (selectedItems.length > 1) {
        for (const it of selectedItems) {
          if (!it?.text) continue;
          await runAndReschedule('trim', [it.text, '30']);
        }
        return;
      }
      await runAndReschedule('trim', [b.dataset.id, '30']);
    });
    el.querySelectorAll('[data-action="stretch-5"]').forEach(b => b.onclick = async () => {
      if (selectedItems.length > 1) {
        for (const it of selectedItems) {
          if (!it?.text) continue;
          await runAndReschedule('stretch', [it.text, '5']);
        }
        return;
      }
      await runAndReschedule('stretch', [b.dataset.id, '5']);
    });
    el.querySelectorAll('[data-action="stretch-15"]').forEach(b => b.onclick = async () => {
      if (selectedItems.length > 1) {
        for (const it of selectedItems) {
          if (!it?.text) continue;
          await runAndReschedule('stretch', [it.text, '15']);
        }
        return;
      }
      await runAndReschedule('stretch', [b.dataset.id, '15']);
    });
    el.querySelectorAll('[data-action="stretch-30"]').forEach(b => b.onclick = async () => {
      if (selectedItems.length > 1) {
        for (const it of selectedItems) {
          if (!it?.text) continue;
          await runAndReschedule('stretch', [it.text, '30']);
        }
        return;
      }
      await runAndReschedule('stretch', [b.dataset.id, '30']);
    });
    el.querySelectorAll('[data-action="trim-custom"]').forEach(b => b.onclick = async () => {
      const input = el.querySelector('#trimCustom');
      const raw = String(input?.value || '').trim();
      const minutes = parseInt(raw, 10);
      if (!minutes || minutes <= 0) return;
      if (selectedItems.length > 1) {
        for (const it of selectedItems) {
          if (!it?.text) continue;
          await runAndReschedule('trim', [it.text, String(minutes)]);
        }
        return;
      }
      await runAndReschedule('trim', [b.dataset.id, String(minutes)]);
    });
    el.querySelectorAll('[data-action="stretch-custom"]').forEach(b => b.onclick = async () => {
      const input = el.querySelector('#stretchCustom');
      const raw = String(input?.value || '').trim();
      const minutes = parseInt(raw, 10);
      if (!minutes || minutes <= 0) return;
      if (selectedItems.length > 1) {
        for (const it of selectedItems) {
          if (!it?.text) continue;
          await runAndReschedule('stretch', [it.text, String(minutes)]);
        }
        return;
      }
      await runAndReschedule('stretch', [b.dataset.id, String(minutes)]);
    });
    el.querySelectorAll('[data-action="cut"]').forEach(b => b.onclick = async () => {
      if (selectedItems.length > 1) {
        for (const it of selectedItems) {
          if (!it?.text) continue;
          await runAndReschedule('cut', [it.text]);
        }
        return;
      }
      await runAndReschedule('cut', [b.dataset.id]);
    });
    el.querySelectorAll('[data-action="start-now"]').forEach(b => b.onclick = async () => {
      const targets = resolveTargets();
      if (!targets.length) return;
      const nowStr = toTimeString(new Date());
      await applyChangeForTargets(targets, () => nowStr);
    });
    el.querySelectorAll('[data-action="delay-5"]').forEach(b => b.onclick = async () => {
      const targets = resolveTargets();
      if (!targets.length) return;
      await applyChangeForTargets(targets, (it) => addMinutesToTime(it.start || '', 5));
    });
    el.querySelectorAll('[data-action="delay-15"]').forEach(b => b.onclick = async () => {
      const targets = resolveTargets();
      if (!targets.length) return;
      await applyChangeForTargets(targets, (it) => addMinutesToTime(it.start || '', 15));
    });
    el.querySelectorAll('[data-action="delay-30"]').forEach(b => b.onclick = async () => {
      const targets = resolveTargets();
      if (!targets.length) return;
      await applyChangeForTargets(targets, (it) => addMinutesToTime(it.start || '', 30));
    });
    el.querySelectorAll('[data-action="anchor-today"]').forEach(b => b.onclick = async () => {
      if (selectedItems.length > 1) {
        for (const it of selectedItems) {
          if (!it?.text) continue;
          await runAndReschedule('anchor', [it.text], { scope: 'today' });
        }
        return;
      }
      if (!selectedName) return;
      await runAndReschedule('anchor', [selectedName], { scope: 'today' });
    });
    el.querySelectorAll('[data-action="anchor-always"]').forEach(b => b.onclick = async () => {
      if (selectedItems.length > 1) {
        for (const it of selectedItems) {
          if (!it?.text) continue;
          await runAndReschedule('anchor', [it.text], { scope: 'item', type: selectedType || 'task' });
        }
        return;
      }
      if (!selectedName) return;
      await runAndReschedule('anchor', [selectedName], { scope: 'item', type: selectedType || 'task' });
    });
    el.querySelectorAll('[data-action="split"]').forEach(b => b.onclick = async () => {
      const raw = prompt('Split into how many parts?', '2') || '';
      const count = parseInt(raw, 10);
      if (!count || count < 2) return;
      if (selectedItems.length > 1) {
        for (const it of selectedItems) {
          if (!it?.text) continue;
          await runAndReschedule('split', [it.text], { count });
        }
        return;
      }
      if (!selectedName) return;
      await runAndReschedule('split', [selectedName], { count });
    });
    el.querySelectorAll('[data-action="merge"]').forEach(b => b.onclick = async () => {
      if (!selectedName) return;
      const other = prompt('Merge with which block?', '') || '';
      if (!other.trim()) return;
      await runAndReschedule('merge', [selectedName, 'with', other.trim()]);
    });
    el.querySelectorAll('[data-action="merge-selected"]').forEach(b => b.onclick = async () => {
      if (!selectedItems.length) return;
      const primary = selectedItems[0];
      const rest = selectedItems.slice(1);
      for (const other of rest) {
        if (!other?.text || !primary?.text) continue;
        await runAndReschedule('merge', [primary.text, 'with', other.text]);
      }
    });
    el.querySelectorAll('[data-action="clear-selection"]').forEach(b => b.onclick = () => {
      try { window.__calendarClearSelection?.(); } catch { }
    });

    try {
      window.__calendarMergeSelected = async (items) => {
        if (!Array.isArray(items) || items.length < 2) return;
        const primary = items[0];
        const rest = items.slice(1);
        for (const other of rest) {
          if (!other?.text || !primary?.text) continue;
          await runCli('merge', [primary.text, 'with', other.text]);
        }
      };
    } catch { }

    el.querySelectorAll('[data-action="save-item"]').forEach(b => {
      b.onclick = () => emitToast('info', 'Save wiring coming soon.');
    });
    el.querySelectorAll('[data-action="delete-item"]').forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.id;
        if (!id) return;
        if (!confirm(`Delete '${id}'?`)) return;
        // Default to task until selection exposes type
        const res = await runCli('delete', [selectedType || 'task', id]);
        if (res.ok) emitToast('success', 'Deleted.');
        else emitToast('error', res.text || 'Delete failed.');
      };
    });
  }

  function buildItemLookup() {
    const lookup = new Map();
    (loadedItems || []).forEach(item => {
      const name = String(item.name || '').toLowerCase();
      if (name) lookup.set(name, item);
    });
    return lookup;
  }

  function matchesItemProperty(item, key, value) {
    if (!item) return false;
    const target = String(value || '').toLowerCase();
    if (!target) return false;
    const raw = item[key];
    if (raw == null) return false;
    if (Array.isArray(raw)) {
      return raw.some(v => String(v || '').toLowerCase().includes(target));
    }
    return String(raw).toLowerCase().includes(target);
  }

  async function buildCompletionHeatmap({ useMomentum = false, mode = 'name', value = null } = {}) {
    try {
      const year = window.__calendarSelectedYear || new Date().getFullYear();
      const month = (window.__calendarSelectedMonth != null) ? window.__calendarSelectedMonth : new Date().getMonth();
      const cacheKey = `${year}-${month}-${useMomentum ? 'm' : 'c'}-${mode}-${value || ''}`;
      if (lastMonthHeatmap && lastMonthHeatmap.key === cacheKey) {
        window.__calendarSetOverlay?.('completions', lastMonthHeatmap.data);
        return;
      }

      const totalDays = daysInMonth(year, month);
      const rangeStart = new Date(year, month, 1);
      rangeStart.setDate(rangeStart.getDate() - 1);
      const rangeEnd = new Date(year, month, totalDays);
      await loadCompletionsRange(rangeStart, rangeEnd);
      const scores = {};
      let max = 1;
      const lookup = buildItemLookup();
      for (let day = 1; day <= totalDays; day++) {
        const dateObj = new Date(year, month, day);
        const completed = await loadCompletions(dateObj);
        let filtered = completed;

      const skipFilter = (mode === 'all') || (String(value || '').trim() === '*');
      if (value && !skipFilter) {
        if (mode === 'name') {
          const target = String(value || '').toLowerCase();
          filtered = completed.filter(name => String(name || '').toLowerCase().includes(target));
        } else {
          const target = String(value || '').toLowerCase();
          filtered = completed.filter(name => {
            const item = lookup.get(String(name || '').toLowerCase());
            return matchesItemProperty(item, mode, target);
          });
        }
      }

        let dayValue = filtered.length;
        if (useMomentum) {
          const prev = new Date(dateObj); prev.setDate(prev.getDate() - 1);
          const prevCompleted = await loadCompletions(prev);
          let prevFiltered = prevCompleted;
          if (value && !skipFilter) {
            if (mode === 'name') {
              const target = String(value || '').toLowerCase();
              prevFiltered = prevCompleted.filter(name => String(name || '').toLowerCase().includes(target));
            } else {
              const target = String(value || '').toLowerCase();
              prevFiltered = prevCompleted.filter(name => {
                const item = lookup.get(String(name || '').toLowerCase());
                return matchesItemProperty(item, mode, target);
              });
            }
          }
          dayValue = dayValue + (prevFiltered.length * 0.5);
        }

        scores[getDayKey(dateObj)] = dayValue;
        if (dayValue > max) max = dayValue;
      }
      // normalize
      const heatmap = {};
      Object.entries(scores).forEach(([k, v]) => {
        heatmap[k] = max ? (v / max) : 0;
      });
      lastMonthHeatmap = { key: cacheKey, data: heatmap };
      window.__calendarSetOverlay?.('completions', heatmap);
    } catch (e) {
      emitToast('error', 'Heatmap load failed.');
    }
  }

  async function buildHappinessHeatmap(mode = 'scheduled') {
    try {
      const year = window.__calendarSelectedYear || new Date().getFullYear();
      const monthIdx = (window.__calendarSelectedMonth != null) ? window.__calendarSelectedMonth : new Date().getMonth();
      const month = monthIdx + 1;
      const resp = await fetch(apiBase() + `/api/calendar/happiness?mode=${encodeURIComponent(mode)}&year=${year}&month=${month}`);
      const json = await resp.json();
      if (!resp.ok || !json.ok) throw new Error(json.error || 'Failed to load happiness overlay');
      const heatmap = json.heatmap || {};
      window.__calendarSetOverlay?.(`happiness_${mode}`, heatmap);
    } catch (e) {
      emitToast('error', 'Happiness overlay load failed.');
    }
  }

  // Styles
  (function injectStyles() {
    if (document.getElementById('inspector-v2-styles')) return;
    const s = document.createElement('style');
    s.id = 'inspector-v2-styles';
    s.textContent = `
      .calendar-inspector, .inspector-shell {
        font-family: var(--font-console, var(--chronos-font-mono, "IBM Plex Mono", "Cascadia Code", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace));
      }
      .inspector-shell { display: flex; flex-direction: column; height: 100%; color: var(--chronos-text, #e6e8ef); }
      .inspector-header { padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(10,12,16,0.6); }
      .inspector-title { font-size: 15px; font-weight: 700; letter-spacing: 0.3px; }
      .inspector-subtitle { font-size: 12px; color: var(--chronos-text-muted, #9aa4b7); margin-top: 6px; }
      .inspector-body { padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
      .inspector-section { padding: 12px; border-radius: 12px; background: rgba(18,22,30,0.6); border: 1px solid rgba(255,255,255,0.06); }
      .inspector-section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--chronos-text-muted, #9aa4b7); margin-bottom: 10px; }
      .inspector-collapsible > .inspector-section-title { margin-bottom: 0; cursor: pointer; list-style: none; user-select: none; }
      .inspector-collapsible > .inspector-section-title::-webkit-details-marker { display: none; }
      .inspector-collapsible > .inspector-section-title::after {
        content: '+';
        float: right;
        color: var(--chronos-text-muted, #9aa4b7);
        font-weight: 700;
      }
      .inspector-collapsible[open] > .inspector-section-title::after { content: '-'; }
      .inspector-section-content { margin-top: 10px; }
      .inspector-muted { font-size: 12px; color: var(--chronos-text-muted, #9aa4b7); }
      .inspector-soft { color: var(--chronos-text-muted, #9aa4b7); }
      .inspector-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin-top: 8px; }
      .inspector-btn { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: var(--chronos-text); padding: 8px 10px; border-radius: 8px; font-size: 12px; cursor: pointer; text-align: center; }
      .inspector-btn:hover { background: rgba(255,255,255,0.12); }
      .inspector-btn-ghost { width: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
      .inspector-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
      .inspector-field label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--chronos-text-muted, #9aa4b7); }
      .inspector-input { background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px; color: var(--chronos-text); font-size: 12px; }
      .inspector-card-list { display: grid; gap: 8px; }
      .inspector-card { padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); font-size: 12px; }
      .inspector-progress { margin-bottom: 10px; }
      .inspector-progress-label { display: flex; justify-content: space-between; font-size: 11px; color: var(--chronos-text-muted, #9aa4b7); margin-bottom: 6px; }
      .inspector-progress-track { height: 6px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; }
      .inspector-progress-fill { height: 100%; background: var(--chronos-accent, #7aa2f7); }
      .inspector-goal-rings { display: grid; grid-template-columns: repeat(auto-fit, minmax(122px, 1fr)); gap: 12px; }
      .inspector-quarter-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .inspector-quarter-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
        border-radius: 10px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .inspector-quarter-head { display: flex; align-items: center; justify-content: space-between; }
      .inspector-quarter-name {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.8px;
        text-transform: uppercase;
        color: var(--chronos-text, #e6e8ef);
      }
      .inspector-quarter-count {
        min-width: 22px;
        height: 22px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        background: rgba(122,162,247,0.18);
        border: 1px solid rgba(122,162,247,0.35);
        color: var(--chronos-text, #e6e8ef);
      }
      .inspector-quarter-unscheduled { margin-top: 12px; }
      .inspector-goal-ring-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 10px 8px;
        border-radius: 10px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .inspector-goal-ring {
        --p: 0;
        --ring-size: 84px;
        width: var(--ring-size);
        height: var(--ring-size);
        border-radius: 50%;
        background: conic-gradient(var(--chronos-accent, #7aa2f7) calc(var(--p) * 1%), rgba(255,255,255,0.12) 0);
        display: grid;
        place-items: center;
      }
      .inspector-goal-ring-center {
        width: calc(var(--ring-size) - 16px);
        height: calc(var(--ring-size) - 16px);
        border-radius: 50%;
        background: rgba(12,16,23,0.95);
        border: 1px solid rgba(255,255,255,0.08);
        display: grid;
        place-items: center;
        font-size: 14px;
        font-weight: 700;
        color: var(--chronos-text, #e6e8ef);
      }
      .inspector-goal-ring-name {
        font-size: 11px;
        font-weight: 600;
        text-align: center;
        color: var(--chronos-text, #e6e8ef);
        line-height: 1.25;
      }
      .inspector-goal-ring-meta {
        font-size: 10px;
        text-align: center;
        color: var(--chronos-text-muted, #9aa4b7);
      }
      .inspector-kv { display: grid; gap: 8px; }
      .inspector-kv div { display: flex; justify-content: space-between; font-size: 12px; color: var(--chronos-text); }
      .inspector-pill { background: rgba(255,255,255,0.08); border-radius: 999px; padding: 6px 10px; font-size: 12px; color: var(--chronos-text-muted, #9aa4b7); }
      .inspector-list { display: grid; gap: 6px; max-height: 240px; overflow-y: auto; padding-right: 4px; }
      .inspector-item { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); cursor: grab; }
      .inspector-item:hover { background: rgba(255,255,255,0.08); }
      .inspector-item-icon { font-size: 12px; color: var(--chronos-text-muted, #9aa4b7); }
      .inspector-item-meta { display: flex; flex-direction: column; gap: 2px; }
      .inspector-item-name { font-size: 12px; color: var(--chronos-text); }
      .inspector-item-type { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--chronos-text-muted, #9aa4b7); }
      .inspector-row { display: flex; align-items: center; gap: 8px; }
      .inspector-empty { text-align: center; color: var(--chronos-text-muted, #9aa4b7); padding: 40px 0; }
      .inspector-quick-row { align-items: flex-start; }
      .inspector-quick-main { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
      .inspector-quick-title { font-size: 12px; color: var(--chronos-text); font-weight: 600; }
      .inspector-quick-reason { font-size: 10px; color: var(--chronos-text-muted, #9aa4b7); }
      .inspector-quick-actions { display: flex; gap: 6px; align-items: center; }
    `;
    document.head.appendChild(s);
  })();

  return { mount, update };
}

