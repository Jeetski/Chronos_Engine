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
        // Move to left side, floating
        panel.style.left = '10px';
        panel.style.right = '';
        panel.style.display = 'flex';
        panel.style.gap = '6px';
        panel.style.zIndex = '12';
        panel.style.background = 'rgba(21,25,35,0.65)'; // semi-transparent
        panel.style.border = '1px solid #222835';
        panel.style.borderRadius = '8px';
        panel.style.padding = '6px';
        panel.style.backdropFilter = 'blur(2px)';
        panel.style.cursor = 'grab';
        panel.style.userSelect = 'none';
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
        // Hover feedback for transparency
        panel.addEventListener('mouseenter', ()=>{ panel.style.background = 'rgba(21,25,35,0.85)'; });
        panel.addEventListener('mouseleave', ()=>{ panel.style.background = 'rgba(21,25,35,0.65)'; });

        // Make panel draggable
        (function makeDraggable(box){
          function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
          function loadPos(){ try { return JSON.parse(localStorage.getItem('calendarControlsPos')||'{}'); } catch { return {}; } }
          function savePos(left, top){ try { localStorage.setItem('calendarControlsPos', JSON.stringify({left, top})); } catch {}
          }
          // Restore saved position if available
          try {
            const pos = loadPos();
            if (typeof pos.left === 'number' && typeof pos.top === 'number'){
              box.style.left = pos.left + 'px';
              box.style.top = pos.top + 'px';
            }
          } catch {}
          box.addEventListener('pointerdown', (ev)=>{
            if (ev.button !== 0) return; // left only
            ev.preventDefault(); ev.stopPropagation();
            box.style.cursor = 'grabbing';
            const rect = box.getBoundingClientRect();
            const offX = ev.clientX - rect.left;
            const offY = ev.clientY - rect.top;
            function move(e){
              const nx = clamp(e.clientX - offX, 4, window.innerWidth - rect.width - 4);
              const ny = clamp(e.clientY - offY, 0, window.innerHeight - rect.height - 4);
              box.style.left = Math.round(nx) + 'px';
              box.style.top = Math.round(ny) + 'px';
            }
            function up(){
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
              box.style.cursor = 'grab';
              // Persist position
              try { const l = parseInt(box.style.left||'10'); const t = parseInt(box.style.top||'10'); savePos(l, t); } catch {}
            }
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          });
        })(panel);

        // fx toggle for variable expansion in calendar labels
        const fxWrap = document.createElement('label'); fxWrap.className='hint'; fxWrap.style.display='flex'; fxWrap.style.alignItems='center'; fxWrap.style.gap='6px';
        const fx = document.createElement('input'); fx.type='checkbox'; fx.id='calendarFxToggle'; fx.checked = (window.__calendarFxExpand !== false);
        fxWrap.append(fx, document.createTextNode('fx'));
        panel.appendChild(fxWrap);
        fx.addEventListener('change', ()=>{ window.__calendarFxExpand = fx.checked; try{ window.redraw?.(); }catch{} });

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

  // View menu — Calendar + Template Builder
  const viewMenu = document.getElementById('menu-view');
  if (viewMenu) {
    viewMenu.innerHTML = '';
    function addView(name,label){
      const it = document.createElement('div'); it.className='item';
      const check = document.createElement('span'); check.className='check'; check.textContent = (window.__currentView===name)?'✅':'';
      const span = document.createElement('span'); span.textContent = label;
      it.append(check, span);
      it.addEventListener('click', async () => {
        closeMenus();
        try { await mountView(viewEl, name); window.__currentView=name; } catch (e) { console.error('[Chronos][app] View switch error:', e); }
        // Refresh menu checkmarks
        viewMenu.querySelectorAll('.item .check').forEach(el=> el.textContent=''); check.textContent='✅';
      });
      viewMenu.appendChild(it);
    }
    addView('Calendar','Calendar');
    addView('TemplateBuilder','Template Builder');
  }

  console.log('[Chronos][app] Dashboard app ready');
  // Listen for widget:show to reveal/pulse a widget (e.g., ItemManager)
  try {
    (window.__chronosBus = context?.bus)?.on('widget:show', (name)=>{
      const el = document.querySelector(`[data-widget="${name}"]`);
      if (!el) return;
      el.style.display='';
      try { window.ensureWidgetInView?.(el); } catch {}
      // Pulse
      el.style.boxShadow='0 0 0 2px #7aa2f7, var(--shadow)';
      setTimeout(()=>{ el.style.boxShadow='var(--shadow)'; }, 900);
    });
  } catch {}
});

export {};
