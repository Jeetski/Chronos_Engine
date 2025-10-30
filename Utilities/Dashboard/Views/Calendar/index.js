export function mount(el, context) {
  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.minHeight = '0';
  container.style.height = '100%';
  container.style.overflow = 'auto';
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.background = 'repeating-conic-gradient(from 45deg, #0e131c 0% 25%, #0b0f16 0% 50%) 50% / 26px 26px';
  container.appendChild(canvas);
  el.appendChild(container);

  const ctx = canvas.getContext('2d');

  // State
  let viewMode = 'year';
  let selectedMonth = null;
  let selectedYear = new Date().getFullYear();
  let monthRects = [];
  let weekRects = [];
  let selectedWeekStart = null;
  let dayRects = [];
  let dayCellRects = [];
  let selectedDayDate = null;
  let dayDrag = null; // disabled for selection-only mode
  let dayGroups = [];
  let selectedStartMin = null;
  let selectedItem = null; // { text, type, start, end }
  let dayBlocksStore = load('pm_day_blocks', {});
  try { window.dayBlocksStore = dayBlocksStore; } catch {}
  // Default zoom: three "-" clicks from 1.00 => 0.25
  let pxPerMinute = (window.__calendarPxPerMin ?? 0.25); // pixels per minute (0.25 => ~360px total)
  // Ensure global zoom reflects the initial value so +/- controls use the same baseline
  try { if (window.__calendarPxPerMin == null) window.__calendarPxPerMin = pxPerMinute; } catch {}
  let hierarchyLevel = (window.__calendarLevel ?? 0); // 0=routines,1=subroutines,2=microroutines,3=items

  // API helpers for /api/today
  function apiBase(){ const o = window.location.origin; if (!o || o==='null' || o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  function parseBlocksYaml(text){
    const lines = String(text||'').replace(/\r\n?/g,'\n').split('\n');
    const blocks = []; let cur=null; let inBlocks=false;
    for (let raw of lines){
      const line = raw.replace(/#.*$/,'');
      if (!line.trim()) continue;
      if (!inBlocks) { if (/^\s*blocks\s*:/i.test(line)) { inBlocks=true; } continue; }
      if (/^\s*-\s*/.test(line)) { if (cur) blocks.push(cur); cur={}; continue; }
      const m = line.match(/^\s*(\w+)\s*:\s*(.+)$/); if (m && cur) { cur[m[1].toLowerCase()] = m[2].trim(); }
    }
    if (cur) blocks.push(cur);
    return blocks;
  }
  let todayBlocks = null; let todayLoadedAt = 0;
  async function loadTodayBlocks(force=false){
    if (!force && todayBlocks && (Date.now()-todayLoadedAt) < 3000) return todayBlocks;
    try{
      const resp = await fetch(apiBase()+"/api/today");
      const text = await resp.text();
      const parsed = parseBlocksYaml(text);
      function toMin(s){ const m=String(s||'').match(/(\d{1,2}):(\d{2})/); if(!m) return null; return parseInt(m[1],10)*60 + parseInt(m[2],10); }
      todayBlocks = parsed.map(b=>({
        start: toMin(b.start),
        end: toMin(b.end),
        text: String(b.text||''),
        type: String(b.type||'').toLowerCase(),
        depth: (b.depth!=null? parseInt(b.depth,10):0),
        is_parallel: /^true$/i.test(String(b.is_parallel||'')),
        order: (b.order!=null? parseInt(b.order,10):0),
      }));
      todayLoadedAt = Date.now();
      try { window.__todayBlocks = todayBlocks; } catch {}
    } catch (e){ todayBlocks = []; }
    return todayBlocks;
  }
  try { window.calendarLoadToday = ()=>loadTodayBlocks(true); } catch {}
  // (removed duplicate helpers)

  function save(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch{} }
  function load(key, fallback){ try{ const v = localStorage.getItem(key); return v? JSON.parse(v): fallback; }catch{ return fallback; } }

  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
  function dateAtMidnight(d){ const n=new Date(d); n.setHours(0,0,0,0); return n; }
  function weekMonday(d){ const n=dateAtMidnight(d); const off=(n.getDay()+6)%7; n.setDate(n.getDate()-off); return n; }
  function sameDay(a,b){ return dateAtMidnight(a).getTime()===dateAtMidnight(b).getTime(); }
  function getCss(varName, fallback){ const v=getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); return v||fallback; }
  function withAlpha(color,a){ if(/^#([0-9a-f]{6})$/i.test(color)){ const r=parseInt(color.slice(1,3),16), g=parseInt(color.slice(3,5),16), b=parseInt(color.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; } return color; }
  function roundRect(ctx,x,y,w,h,r){ const rr=Math.min(r,w/2,h/2); ctx.beginPath(); ctx.moveTo(x+rr,y); ctx.arcTo(x+w,y,x+w,y+h,rr); ctx.arcTo(x+w,y+h,x,y+h,rr); ctx.arcTo(x,y+h,x,y,rr); ctx.arcTo(x,y,x+w,y,rr); ctx.closePath(); }
  function colorForDay(dayDate,today){ if(dayDate<today) return getCss('--danger','#ef6a6a'); if(sameDay(dayDate,today)) return getCss('--accent','#7aa2f7'); return getCss('--ok','#5bdc82'); }

  function resizeCanvas(){
    const dpr=Math.max(1, window.devicePixelRatio||1);
    const rect=canvas.parentElement.getBoundingClientRect();
    const pad=14, headerH=36; const totalH = pad+headerH+pad + Math.floor(24*60*pxPerMinute) + pad;
    canvas.style.width=rect.width+'px';
    canvas.style.height= totalH+'px';
    canvas.width=Math.max(1, Math.floor(rect.width*dpr));
    canvas.height=Math.max(1, Math.floor(totalH*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function drawYearGrid(){ const now=new Date(); const year=selectedYear||now.getFullYear(); const currentMonth=now.getMonth(); const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const w=canvas.clientWidth,h=canvas.clientHeight; ctx.clearRect(0,0,w,h); ctx.fillStyle='#0b0f16'; ctx.fillRect(0,0,w,h); const cols=4,rows=3,pad=14; const cellW=(w-pad*(cols+1))/cols; const cellH=(h-pad*(rows+1))/rows; ctx.save(); ctx.lineWidth=2; ctx.textBaseline='middle'; ctx.textAlign='center'; ctx.font='600 16px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'; monthRects=[]; for(let i=0;i<12;i++){ const r=Math.floor(i/cols), c=i%cols; const x=pad+c*(cellW+pad), y=pad+r*(cellH+pad); let fill; if(year<now.getFullYear()||(year===now.getFullYear()&&i<currentMonth)) fill=getCss('--danger','#ef6a6a'); else if(year===now.getFullYear()&&i===currentMonth) fill=getCss('--accent','#7aa2f7'); else fill=getCss('--ok','#5bdc82'); ctx.fillStyle=withAlpha(fill,0.18); roundRect(ctx,x,y,cellW,cellH,10); ctx.fill(); ctx.strokeStyle=withAlpha(fill,0.55); roundRect(ctx,x,y,cellW,cellH,10); ctx.stroke(); ctx.fillStyle='#e6e8ef'; ctx.fillText(`${months[i]} ${year}`, x+cellW/2, y+cellH/2); monthRects.push({i,x,y,w:cellW,h:cellH}); } ctx.restore(); viewMode='year'; }

  function drawMonthGrid(month=(new Date()).getMonth(), year=(new Date()).getFullYear()){ selectedMonth=month; selectedYear=year; const w=canvas.clientWidth,h=canvas.clientHeight; ctx.clearRect(0,0,w,h); const pad=14, headerH=36; const gridTop=pad+headerH+pad; const colW=(w-pad*8)/7; const rowH=(h-gridTop-pad*6)/6; ctx.save(); ctx.textBaseline='middle'; ctx.font='600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'; const monthsLong=['January','February','March','April','May','June','July','August','September','October','November','December']; const title=`${monthsLong[month]} ${year}`; ctx.fillStyle='#e6e8ef'; ctx.fillText(title, pad, pad+headerH/2); const dows=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; ctx.fillStyle='#a6adbb'; for(let i=0;i<7;i++){ ctx.fillText(dows[i], pad+i*(colW+pad)+colW/2, gridTop-10); } const first=new Date(year,month,1); const start=weekMonday(first); dayCellRects=[]; const today=dateAtMidnight(new Date()); for(let r=0;r<6;r++){ for(let c=0;c<7;c++){ const x=pad+c*(colW+pad); const y=gridTop+r*(rowH+pad); const d=new Date(start); d.setDate(start.getDate()+r*7+c); const inMonth=d.getMonth()===month; const dayColor=colorForDay(d,today); ctx.fillStyle=withAlpha(dayColor, inMonth?0.18:0.06); roundRect(ctx,x,y,colW,rowH,10); ctx.fill(); ctx.strokeStyle=withAlpha(dayColor, inMonth?0.45:0.2); roundRect(ctx,x,y,colW,rowH,10); ctx.stroke(); ctx.fillStyle=inMonth?'#e6e8ef':'#6b7382'; ctx.textAlign='right'; ctx.fillText(String(d.getDate()), x+colW-6, y+14); ctx.textAlign='left'; dayCellRects.push({ x,y,w:colW,h:rowH,date:dateAtMidnight(d) }); } } ctx.restore(); viewMode='month'; }

  function drawWeekGrid(weekStart=selectedWeekStart||weekMonday(new Date())){ selectedWeekStart=new Date(weekStart); const w=canvas.clientWidth,h=canvas.clientHeight; ctx.clearRect(0,0,w,h); const pad=14, headerH=36; const gridTop=pad+headerH+pad; const cols=7; const cellW=(w-pad*(cols+1))/cols; const cellH=h-gridTop-pad; ctx.save(); ctx.textBaseline='middle'; ctx.textAlign='left'; ctx.font='600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'; const monthsLong=['January','February','March','April','May','June','July','August','September','October','November','December']; const monday=weekMonday(weekStart); const title=`Week of ${monthsLong[monday.getMonth()]} ${monday.getDate()}, ${monday.getFullYear()}`; ctx.fillStyle='#e6e8ef'; ctx.fillText(title, pad, pad+headerH/2); const dows=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; const today=dateAtMidnight(new Date()); dayRects=[]; for(let c=0;c<cols;c++){ const x=pad+c*(cellW+pad); const y=gridTop; const dayDate=new Date(monday); dayDate.setDate(monday.getDate()+c); const dayColor=colorForDay(dayDate,today); ctx.fillStyle=withAlpha(dayColor,0.18); roundRect(ctx,x,y,cellW,cellH,10); ctx.fill(); ctx.strokeStyle=withAlpha(dayColor,0.45); roundRect(ctx,x,y,cellW,cellH,10); ctx.stroke(); ctx.textAlign='center'; ctx.fillStyle='#a6adbb'; ctx.fillText(`${dows[c]} ${dayDate.getDate()}`, x+cellW/2, y+14); ctx.textAlign='left'; dayRects.push({ x,y,w:cellW,h:cellH,date:dateAtMidnight(dayDate) }); } ctx.restore(); viewMode='week'; }

  function drawDayGrid(day=dateAtMidnight(new Date()), previewDrag=false){
    selectedDayDate=new Date(day);
    // Refresh blocks from window/localStorage to reflect Today widget updates
    try { if (window.dayBlocksStore) dayBlocksStore = window.dayBlocksStore; else dayBlocksStore = load('pm_day_blocks', dayBlocksStore||{}); } catch { dayBlocksStore = load('pm_day_blocks', dayBlocksStore||{}); }
    const w=canvas.clientWidth,h=canvas.clientHeight; ctx.clearRect(0,0,w,h);
    const pad=14, headerH=36, gutter=60; const gridTop=pad+headerH+pad; const heightAvail=Math.max(1, h-gridTop-pad); ctx.save(); ctx.textBaseline='middle'; ctx.font='600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    const monthsLong=['January','February','March','April','May','June','July','August','September','October','November','December']; const title=`${monthsLong[day.getMonth()]} ${day.getDate()}, ${day.getFullYear()}`; ctx.fillStyle='#e6e8ef'; ctx.fillText(title, pad, pad+headerH/2);
    // Time ticks based on zoom (every 60 or 30 minutes)
    const stepMin = (pxPerMinute >= 2 ? 30 : 60);
    ctx.fillStyle='#a6adbb';
    for(let m=0; m<=24*60; m+=stepMin){ const y=gridTop + m*pxPerMinute; const label=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); ctx.fillText(label, pad, y); }
    const colX=pad+gutter; const colW=w-colX-pad; ctx.fillStyle=withAlpha(getCss('--accent','#7aa2f7'),0.08); roundRect(ctx,colX,gridTop,colW,heightAvail,10); ctx.fill(); ctx.strokeStyle=withAlpha(getCss('--accent','#7aa2f7'),0.25); roundRect(ctx,colX,gridTop,colW,heightAvail,10); ctx.stroke();
    // Text-only timeline from today's schedule (via API)
    const key=dayKey(day);
    function minToHM(min){ const h=Math.floor(min/60)%24; const m=min%60; return String(h).padStart(2,'0')+":"+String(m).padStart(2,'0'); }
    const drawTextBlocks = (arr)=>{
      ctx.fillStyle = '#e6e8ef';
      ctx.font = '600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      const padX = 8;
      // Type-based hierarchy filter:
      // 0 => routines only, 1 => subroutines only, 2 => microroutines only, 3 => leaf items (non-templates)
      const containerTypes = new Set(['routine','subroutine','microroutine']);
      let allowSet = null;
      if (hierarchyLevel === 0) allowSet = new Set(['routine']);
      else if (hierarchyLevel === 1) allowSet = new Set(['subroutine']);
      else if (hierarchyLevel === 2) allowSet = new Set(['microroutine']);
      // hierarchyLevel === 3 -> leaf items (not in containerTypes)
      const filtered = (arr||[]).filter(b => {
        if (typeof b.start !== 'number') return false;
        const t = String(b.type||'').toLowerCase();
        if (allowSet) return allowSet.has(t);
        return !containerTypes.has(t);
      });
      // Render groups of entries that share the same start time on a single line, separated by semicolons
      try {
        const sorted = [...filtered].sort((a,b)=> (a.start-b.start) || ((a.order??0)-(b.order??0)) || String(a.text||'').localeCompare(String(b.text||'')) );
        const groups = new Map();
        for (const b of sorted){
          const k = b.start|0; // minute precision
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(b);
        }
        const starts = Array.from(groups.keys()).sort((a,b)=>a-b);
        starts.forEach(startMin => {
          const items = groups.get(startMin) || [];
          const y0 = gridTop + (startMin*pxPerMinute); const lineY = y0 + 12;
        const pieces = items.map(it => String(it.text||''));
        let text = minToHM(startMin) + '  ' + pieces.join('; ');
          while (ctx.measureText(text).width > colW - padX*2 && text.length > 3){ text = text.slice(0, -4) + 'ï¿½?ï¿½'; }
          ctx.fillText(text, colX + padX, lineY);
        });
        return;
      } catch {}
      filtered.sort((a,b)=> (a.start-b.start) || ((a.order??0)-(b.order??0)) || String(a.text||'').localeCompare(String(b.text||'')) );
      filtered.forEach(b=>{
        const y0=gridTop + (b.start*pxPerMinute); const lineY = y0 + 12;
        const prefix = b.is_parallel ? 'âˆ¥ ' : '';
        let text = minToHM(b.start) + '  ' + prefix + String(b.text||'');
        while (ctx.measureText(text).width > colW - padX*2 && text.length > 3){ text = text.slice(0, -4) + 'â€¦'; }
        ctx.fillText(text, colX + padX, lineY);
      });
    };
    if (!todayBlocks) {
      // Load once asynchronously, then redraw
      loadTodayBlocks().then(()=>{ try{ redrawCurrentView(); }catch{} });
    }
    drawTextBlocks(todayBlocks);
    // Build groups for hit-testing based on current hierarchy filter
    try {
      const containerTypes = new Set(['routine','subroutine','microroutine']);
      let allowSet = null;
      if (hierarchyLevel === 0) allowSet = new Set(['routine']);
      else if (hierarchyLevel === 1) allowSet = new Set(['subroutine']);
      else if (hierarchyLevel === 2) allowSet = new Set(['microroutine']);
      const filtered = (todayBlocks||[]).filter(b => {
        if (typeof b.start !== 'number') return false;
        const t = String(b.type||'').toLowerCase();
        if (allowSet) return allowSet.has(t);
        return !containerTypes.has(t);
      });
      const sorted = [...filtered].sort((a,b)=> (a.start-b.start) || ((a.order??0)-(b.order??0)) || String(a.text||'').localeCompare(String(b.text||'')) );
      const groups = new Map();
      for (const b of sorted){ const k=b.start|0; if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(b); }
      dayGroups = [];
      Array.from(groups.keys()).sort((a,b)=>a-b).forEach(startMin => {
        const y0 = gridTop + (startMin*pxPerMinute);
        dayGroups.push({ startMin, y0, y1: y0+24, items: groups.get(startMin)||[] });
      });
      // Draw selection highlight overlay if any
      if (selectedStartMin != null){
        const y0 = gridTop + (selectedStartMin*pxPerMinute);
        ctx.save();
        ctx.fillStyle = withAlpha(getCss('--accent','#7aa2f7'), 0.12);
        roundRect(ctx, colX+2, y0+2, colW-4, 20, 6);
        ctx.fill();
        ctx.restore();
      }
    } catch {}
    if(previewDrag&&dayDrag){ let y0=Math.min(dayDrag.y0,dayDrag.y1); let y1=Math.max(dayDrag.y0,dayDrag.y1); y0=Math.max(gridTop,y0); y1=Math.min(canvas.clientHeight- pad,y1); ctx.fillStyle=withAlpha(getCss('--accent','#7aa2f7'),0.25); roundRect(ctx,colX,y0,colW,Math.max(8,y1-y0),8); ctx.fill(); }
    ctx.restore(); viewMode='day';
  }

  function dayKey(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }

  function redrawCurrentView(){ try { if (window.dayBlocksStore) dayBlocksStore = window.dayBlocksStore; } catch {}
    try { pxPerMinute = (window.__calendarPxPerMin ?? pxPerMinute); } catch {}
    try { hierarchyLevel = (window.__calendarLevel ?? hierarchyLevel); } catch {}
    // Recompute canvas height for current zoom
    resizeCanvas();
    if(viewMode==='year') drawYearGrid(); else if(viewMode==='month') drawMonthGrid(selectedMonth ?? (new Date()).getMonth(), selectedYear); else if(viewMode==='week') drawWeekGrid(selectedWeekStart); else if(viewMode==='day') drawDayGrid(selectedDayDate);
  }
  try { window.redraw = redrawCurrentView; } catch {}

  function getPos(e){ const rect=canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }

  function handleViewClick(x,y, ev){
    if(viewMode==='year'){
      const hit=monthRects.find(r=> x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h); if(hit){ selectedMonth=hit.i; drawMonthGrid(selectedMonth, selectedYear);} 
      return;
    }
    if(viewMode==='month'){
      const hitDay=dayCellRects.find(r=> x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h); if(hitDay){ selectedDayDate=hitDay.date; drawDayGrid(selectedDayDate); return; }
      const hitW=weekRects.find(r=> x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h); if(hitW){ selectedWeekStart=hitW.monday; drawWeekGrid(selectedWeekStart); }
      return;
    }
    if(viewMode==='week'){
      const hitD=dayRects.find(r=> x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h); if(hitD){ selectedDayDate=hitD.date; drawDayGrid(selectedDayDate);} 
      return;
    }
    if(viewMode==='day'){
      if (activeTool === 'select'){
        // Click elsewhere clears selection in select mode
        selectRect = null; selectedItem = null; selectedStartMin = null;
        redrawCurrentView();
        return;
      }
      const hit = dayGroups.find(g => y >= g.y0 && y <= g.y1);
      if (!hit) return;
      selectedStartMin = hit.startMin|0;
      if (activeTool === 'picker' && hit.items && hit.items.length > 1) {
        return showGroupPicker(ev, hit.items);
      }
      const it = (hit.items && hit.items[0]) || null;
      if (it){
        selectedItem = { text: String(it.text||''), type: String(it.type||''), start: it.start, end: it.end };
        try { if (context && context.bus) context.bus.emit('calendar:selected', selectedItem); } catch {}
      }
      redrawCurrentView();
      return;
    }
  }

  function showGroupPicker(ev, items){
    try { document.getElementById('calendarGroupPicker')?.remove(); } catch {}
    const menu = document.createElement('div');
    menu.id = 'calendarGroupPicker';
    menu.style.position = 'fixed';
    const lx = (ev && ev.clientX) ? ev.clientX : (window.innerWidth/2);
    const ly = (ev && ev.clientY) ? ev.clientY : (window.innerHeight/2);
    menu.style.left = (lx + 6) + 'px';
    menu.style.top = (ly + 6) + 'px';
    menu.style.background = 'rgba(21,25,35,0.95)';
    menu.style.border = '1px solid #222835';
    menu.style.borderRadius = '8px';
    menu.style.padding = '6px 0';
    menu.style.boxShadow = '0 14px 40px rgba(0,0,0,0.35)';
    menu.style.zIndex = '10';
    items.forEach(it => {
      const row = document.createElement('div');
      row.textContent = String(it.text||'');
      row.style.padding = '6px 10px';
      row.style.cursor = 'pointer';
      row.style.color = '#e6e8ef';
      row.addEventListener('mouseenter', ()=> row.style.background = '#0f141d');
      row.addEventListener('mouseleave', ()=> row.style.background = 'transparent');
      row.addEventListener('click', ()=>{
        selectedItem = { text: String(it.text||''), type: String(it.type||''), start: it.start, end: it.end };
        try { if (context && context.bus) context.bus.emit('calendar:selected', selectedItem); } catch {}
        try { document.body.removeChild(menu); } catch {}
        redrawCurrentView();
      });
      menu.appendChild(row);
    });
    function onDoc(e){ if (!menu.contains(e.target)){ try{ document.body.removeChild(menu); document.removeEventListener('mousedown', onDoc); }catch{} } }
    document.addEventListener('mousedown', onDoc);
    document.body.appendChild(menu);
  }

  function handleViewPointerDown(e,x,y){ return false; }
  function handleViewPointerMove(e,x,y){ return; }
  function handleViewPointerUp(e){ return; }

  function onPointerDown(e){ const pt=getPos(e); if(handleViewPointerDown(e, pt.x, pt.y)) return; handleViewClick(pt.x, pt.y, e); }
  function onPointerMove(e){ const pt=getPos(e); handleViewPointerMove(e, pt.x, pt.y); }
  function onPointerUp(e){ handleViewPointerUp(e); }
  function onKeyDown(e){ if(e.key==='Escape'){ if(viewMode==='day'){ viewMode='week'; drawWeekGrid(selectedWeekStart || weekMonday(selectedDayDate || new Date())); } else if(viewMode==='week'){ viewMode='month'; drawMonthGrid(selectedMonth ?? (new Date()).getMonth(), selectedYear); } else if(viewMode==='month'){ viewMode='year'; selectedMonth=null; selectedWeekStart=null; drawYearGrid(); } } }

  const debouncedResize = debounce(()=>{ resizeCanvas(); redrawCurrentView(); }, 120);

  // Init
  resizeCanvas();
  drawYearGrid();
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', debouncedResize);
  try { new ResizeObserver(()=>debouncedResize()).observe(document.getElementById('center')); } catch {}

  return {
    unmount(){
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', debouncedResize);
    }
  };
}

// Overlay controls for zoom and hierarchy (mounted outside module for simplicity)
try {
  (function addCalendarControls(){
    const root = document.getElementById('view');
    if (!root) return;
    let panel = document.getElementById('calendarControls');
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'calendarControls';
    panel.style.position = 'absolute';
    panel.style.top = '10px';
    panel.style.right = '10px';
    panel.style.display = 'flex';
    panel.style.gap = '6px';
    panel.style.zIndex = '6';
    panel.style.background = 'rgba(21,25,35,0.85)';
    panel.style.border = '1px solid #222835';
    panel.style.borderRadius = '8px';
    panel.style.padding = '6px';
    const mkBtn = (label)=>{ const b=document.createElement('button'); b.textContent=label; b.className='btn'; b.style.padding='4px 8px'; return b; };
    const timeMinus = mkBtn('Zoom -'); const timePlus = mkBtn('Zoom +');
    const levelMinus = mkBtn('Level -'); const levelPlus = mkBtn('Level +');
    const levelLabel = document.createElement('span'); levelLabel.style.color='#a6adbb'; levelLabel.style.padding='4px 6px';
    function updateLabel(){ const map=['Routines','Subroutines','Microroutines','Items']; levelLabel.textContent = map[Math.max(0, Math.min(3, (window.__calendarLevel??0)))] || 'Items'; }
    updateLabel();
    timeMinus.addEventListener('click', ()=>{ window.__calendarPxPerMin = Math.max(0.25, (window.__calendarPxPerMin??1) - 0.25); if (typeof window.redraw==='function'){ window.redraw(); } });
    timePlus.addEventListener('click', ()=>{ window.__calendarPxPerMin = Math.min(4, (window.__calendarPxPerMin??1) + 0.25); if (typeof window.redraw==='function'){ window.redraw(); } });
    levelMinus.addEventListener('click', ()=>{ window.__calendarLevel = Math.max(0, (window.__calendarLevel??0) - 1); updateLabel(); if (typeof window.redraw==='function'){ window.redraw(); } });
    levelPlus.addEventListener('click', ()=>{ window.__calendarLevel = Math.min(3, (window.__calendarLevel??0) + 1); updateLabel(); if (typeof window.redraw==='function'){ window.redraw(); } });
    // Toolstrip controls
    const toolCursor = mkBtn('Cursor');
    const toolSelect = mkBtn('Select');
    const toolPicker = mkBtn('Picker');
    const toolEraser = mkBtn('Eraser');
    function setTool(t){
      activeTool = t; window.__calendarTool = t;
      [toolCursor, toolSelect, toolPicker, toolEraser].forEach(b=> b.classList.remove('btn-primary'));
      if (t==='cursor') toolCursor.classList.add('btn-primary');
      if (t==='select') toolSelect.classList.add('btn-primary');
      if (t==='picker') toolPicker.classList.add('btn-primary');
      if (t==='eraser') toolEraser.classList.add('btn-primary');
      try{ window.redraw(); }catch{}
    }
    toolCursor.addEventListener('click', ()=> setTool('cursor'));
    toolSelect.addEventListener('click', ()=> setTool('select'));
    toolPicker.addEventListener('click', ()=> setTool('picker'));
    toolEraser.addEventListener('click', ()=> setTool('eraser'));
    setTool(window.__calendarTool ?? 'cursor');
    panel.append(timeMinus, timePlus, levelMinus, levelPlus, levelLabel, toolCursor, toolSelect, toolPicker, toolEraser);
    root.appendChild(panel);
  })();
} catch {}

