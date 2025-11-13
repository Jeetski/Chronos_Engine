// Simple app bootstrapper with debug logs
import { mountWidget, mountView } from './core/runtime.js';

function ready(fn){ if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

ready(async () => {
  console.log('[Chronos][app] Booting dashboard app');

  // Ensure logo loads when opened via file:// by pointing to API base
  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  try {
    const logo = document.getElementById('chronosLogo');
    if (logo) {
      const want = apiBase() + '/assets/Logo_No_Background.png';
      if (!logo.src || logo.src.startsWith('file:') || logo.src.endsWith('/assets/Logo_No_Background.png')) {
        logo.src = want;
      }
      logo.addEventListener('error', ()=>{ logo.src = want; });
    }
  } catch {}

  // Mount Calendar view
  const viewEl = document.getElementById('view');
  if (viewEl) {
    try { await mountView(viewEl, 'Calendar'); } catch (e) { console.error('[Chronos][app] View mount error:', e); }
    // Ensure calendar overlay controls exist (zoom/level + toolstrip)
    try {
      if (!document.getElementById('calendarControls')) {
        const panel = document.createElement('div');
        panel.id = 'calendarControls';
        panel.style.position = 'absolute';
        panel.style.top = '10px';
        panel.style.right = '10px';
        panel.style.display = 'flex';
        panel.style.gap = '6px';
        panel.style.zIndex = '10';
        panel.style.background = 'rgba(21,25,35,0.85)';
        panel.style.border = '1px solid #222835';
        panel.style.borderRadius = '8px';
        panel.style.padding = '6px';
        const mkBtn = (label)=>{ const b=document.createElement('button'); b.textContent=label; b.className='btn'; b.style.padding='4px 8px'; return b; };
        const mkIconBtn = (glyph, title)=>{ const b=document.createElement('button'); b.className='btn'; b.style.padding='4px 8px'; b.textContent = glyph; if(title) b.title = title; return b; };
        const lbl = document.createElement('span'); lbl.style.color='#a6adbb'; lbl.style.padding='4px 6px';
        function updateLevel(){ const map=['Routines','Subroutines','Microroutines','Items']; lbl.textContent = map[Math.max(0, Math.min(3, (window.__calendarLevel??0)))] || 'Items'; }
        const zoomMinus = mkIconBtn('➖', 'Zoom out');
        const zoomPlus = mkIconBtn('➕', 'Zoom in');
        const levelMinus = mkIconBtn('▲', 'Level up');
        const levelPlus = mkIconBtn('▼', 'Level down');
        zoomMinus.addEventListener('click', ()=>{ window.__calendarPxPerMin = Math.max(0.25, (window.__calendarPxPerMin??1) - 0.25); window.redraw?.(); });
        zoomPlus.addEventListener('click', ()=>{ window.__calendarPxPerMin = Math.min(4, (window.__calendarPxPerMin??1) + 0.25); window.redraw?.(); });
        levelMinus.addEventListener('click', ()=>{ window.__calendarLevel = Math.max(0, (window.__calendarLevel??0) - 1); updateLevel(); window.redraw?.(); });
        levelPlus.addEventListener('click', ()=>{ window.__calendarLevel = Math.min(3, (window.__calendarLevel??0) + 1); updateLevel(); window.redraw?.(); });
        updateLevel();
        // Toolstrip
        const toolCursor = mkIconBtn('🖱️', 'Cursor');
        const toolSelect = mkIconBtn('🔳', 'Select');
        const toolPicker = mkIconBtn('🎯', 'Picker');
        const toolEraser = mkIconBtn('🧹', 'Eraser');
        function setTool(t){
          window.__calendarTool = t;
          [toolCursor, toolSelect, toolPicker, toolEraser].forEach(b=> b.classList.remove('btn-primary'));
          if (t==='cursor') toolCursor.classList.add('btn-primary');
          if (t==='select') toolSelect.classList.add('btn-primary');
          if (t==='picker') toolPicker.classList.add('btn-primary');
          if (t==='eraser') toolEraser.classList.add('btn-primary');
        }
        toolCursor.addEventListener('click', ()=>{ setTool('cursor'); window.redraw?.(); });
        toolSelect.addEventListener('click', ()=>{ setTool('select'); window.redraw?.(); });
        toolPicker.addEventListener('click', ()=>{ setTool('picker'); window.redraw?.(); });
        toolEraser.addEventListener('click', ()=>{ setTool('eraser'); window.redraw?.(); });
        setTool(window.__calendarTool ?? 'cursor');
        panel.append(zoomMinus, zoomPlus, levelMinus, levelPlus, lbl, toolCursor, toolSelect, toolPicker, toolEraser);
        viewEl.appendChild(panel);
      }
    } catch (e) { console.warn('[Chronos][app] Could not build calendar controls:', e); }
  } else {
    console.warn('[Chronos][app] No #view element found');
  }

  // Mount widgets found by data-widget attribute
  const widgetEls = Array.from(document.querySelectorAll('[data-widget]'));
  console.log(`[Chronos][app] Found ${widgetEls.length} widget container(s)`);
  for (const el of widgetEls) {
    const name = el.getAttribute('data-widget');
    try { await mountWidget(el, name); } catch (e) { console.error('[Chronos][app] Widget mount error:', name, e); }
  }

  // Simple topbar menus
  function closeMenus(){ document.querySelectorAll('#topbar .dropdown').forEach(d=>d.classList.remove('open')); }
  document.querySelectorAll('#topbar .menubtn').forEach(btn => {
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const id = btn.getAttribute('data-menu');
      // Rebuild widgets menu each time it opens so checkmarks reflect current visibility
      if (id === 'widgets') buildWidgetsMenu();
      closeMenus();
      const menu = document.getElementById('menu-'+id);
      if (menu) menu.classList.add('open');
    });
  });
  document.addEventListener('click', closeMenus);

  // Build/rebuild widgets dropdown based on current visibility
  function buildWidgetsMenu(){
    const widgetsMenu = document.getElementById('menu-widgets');
    if (!widgetsMenu) return;
    widgetsMenu.innerHTML = '';
    for (const el of widgetEls) {
      const id = el.id || el.getAttribute('data-widget') || 'widget';
      const label = el.getAttribute('data-label') || el.getAttribute('data-widget') || id;
      const item = document.createElement('div');
      item.className = 'item';
      const check = document.createElement('span');
      check.className = 'check';
      check.textContent = (el.style.display === 'none') ? '' : '✅';
      const span = document.createElement('span');
      span.textContent = label;
      item.append(check, span);
      item.addEventListener('click', () => {
        el.style.display = (el.style.display === 'none' ? '' : 'none');
        check.textContent = el.style.display === 'none' ? '' : '✅';
        closeMenus();
        try { if (el.style.display !== 'none') window.ensureWidgetInView?.(el); } catch {}
      });
      widgetsMenu.appendChild(item);
    }
  }
  // Initial build
  buildWidgetsMenu();

  // Keep menu in sync when widgets close themselves
  function hookWidgetCloseButtons(){
    ['notesClose','statusClose','todayClose'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => setTimeout(buildWidgetsMenu, 0));
    });
  }
  hookWidgetCloseButtons();
  // Also observe visibility changes as a fallback
  try {
    const mo = new MutationObserver(() => buildWidgetsMenu());
    widgetEls.forEach(el => mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] }));
  } catch {}

  // View menu — currently only Calendar
  const viewMenu = document.getElementById('menu-view');
  if (viewMenu) {
    viewMenu.innerHTML = '';
    const item = document.createElement('div');
    item.className = 'item';
    const check = document.createElement('span'); check.className = 'check'; check.textContent = '✅';
    const span = document.createElement('span'); span.textContent = 'Calendar';
    item.append(check, span);
    item.addEventListener('click', () => { closeMenus(); /* single view for now */ });
    viewMenu.appendChild(item);
  }

  console.log('[Chronos][app] Dashboard app ready');
});

export {};

