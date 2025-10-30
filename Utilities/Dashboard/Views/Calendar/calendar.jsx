/* global React, ReactDOM */

function CalendarView() {
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // State
    let viewMode = 'year'; // 'year' | 'month' | 'week' | 'day'
    let selectedMonth = null; // 0-11
    let selectedYear = new Date().getFullYear();
    let monthRects = [];
    let weekRects = [];
    let selectedWeekStart = null; // Date
    let dayRects = [];
    let dayCellRects = [];
    let selectedDayDate = null; // Date
    let dayDrag = null; // {y0, y1}
    let dayBlocksStore = getStore('pm_day_blocks', {});

    function setStore(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
    }
    function getStore(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    }

    function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
    function px(n) { return Math.round(n) + 'px'; }

    function dateAtMidnight(d) { const n = new Date(d); n.setHours(0,0,0,0); return n; }
    function weekMonday(d) { const n = dateAtMidnight(d); const off = (n.getDay()+6)%7; n.setDate(n.getDate()-off); return n; }
    function cmpDays(a,b){ return dateAtMidnight(a).getTime() - dateAtMidnight(b).getTime(); }
    function sameDay(a,b){ return cmpDays(a,b)===0; }
    function getCss(varName, fallback) { const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); return val || fallback; }
    function withAlpha(color, a) { if (/^#([0-9a-f]{6})$/i.test(color)) { const r=parseInt(color.slice(1,3),16); const g=parseInt(color.slice(3,5),16); const b=parseInt(color.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; } return color; }
    function roundRect(ctx, x, y, w, h, r){ const rr=Math.min(r,w/2,h/2); ctx.beginPath(); ctx.moveTo(x+rr,y); ctx.arcTo(x+w,y,x+w,y+h,rr); ctx.arcTo(x+w,y+h,x,y+h,rr); ctx.arcTo(x,y+h,x,y,rr); ctx.arcTo(x,y,x+w,y,rr); ctx.closePath(); }

    function colorForDay(dayDate, today) {
      if (dayDate < today) return getCss('--danger', '#ef6a6a');
      if (sameDay(dayDate, today)) return getCss('--accent', '#7aa2f7');
      return getCss('--ok', '#5bdc82');
    }

    function resizeCanvas() {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawYearGrid() {
      const now = new Date();
      const year = selectedYear || now.getFullYear();
      const currentMonth = now.getMonth();
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0,0,w,h);
      ctx.fillStyle = '#0b0f16'; ctx.fillRect(0,0,w,h);
      const cols=4, rows=3, pad=14; const cellW=(w-pad*(cols+1))/cols; const cellH=(h-pad*(rows+1))/rows;
      ctx.save(); ctx.lineWidth=2; ctx.textBaseline='middle'; ctx.textAlign='center'; ctx.font='600 16px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      monthRects = [];
      for (let i=0;i<12;i++){
        const r=Math.floor(i/cols), c=i%cols; const x=pad+c*(cellW+pad); const y=pad+r*(cellH+pad);
        let fill; if (year<now.getFullYear() || (year===now.getFullYear() && i<currentMonth)) fill=getCss('--danger','#ef6a6a');
        else if (year===now.getFullYear() && i===currentMonth) fill=getCss('--accent','#7aa2f7'); else fill=getCss('--ok','#5bdc82');
        ctx.fillStyle=withAlpha(fill,0.18); roundRect(ctx,x,y,cellW,cellH,10); ctx.fill(); ctx.strokeStyle=withAlpha(fill,0.55); roundRect(ctx,x,y,cellW,cellH,10); ctx.stroke();
        ctx.fillStyle='#e6e8ef'; ctx.fillText(`${months[i]} ${year}`, x+cellW/2, y+cellH/2);
        monthRects.push({ i, x, y, w: cellW, h: cellH });
      }
      ctx.restore();
      viewMode='year';
    }

    function drawMonthGrid(month=(new Date()).getMonth(), year=(new Date()).getFullYear()){
      selectedMonth = month; selectedYear = year;
      const now=new Date(); const w=canvas.clientWidth, h=canvas.clientHeight; ctx.clearRect(0,0,w,h);
      const pad=14, headerH=36; const gridTop=pad+headerH+pad; const colW=(w-pad*8)/7; const rowH=(h-gridTop-pad*6)/6;
      ctx.save(); ctx.textBaseline='middle'; ctx.font='600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      const monthsLong=['January','February','March','April','May','June','July','August','September','October','November','December'];
      const title=`${monthsLong[month]} ${year}`; ctx.fillStyle='#e6e8ef'; ctx.fillText(title, pad, pad+headerH/2);
      const dows=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; ctx.fillStyle='#a6adbb';
      for(let i=0;i<7;i++){ ctx.fillText(dows[i], pad+i*(colW+pad)+colW/2, gridTop-10); }
      const first=new Date(year,month,1); const start=weekMonday(first);
      dayCellRects=[]; const today=dateAtMidnight(new Date());
      for(let r=0;r<6;r++){
        for(let c=0;c<7;c++){
          const x=pad+c*(colW+pad); const y=gridTop+r*(rowH+pad);
          const d=new Date(start); d.setDate(start.getDate()+r*7+c); const inMonth=d.getMonth()===month;
          const dayColor=colorForDay(d,today);
          ctx.fillStyle=withAlpha(dayColor, inMonth?0.18:0.06); roundRect(ctx,x,y,colW,rowH,10); ctx.fill(); ctx.strokeStyle=withAlpha(dayColor, inMonth?0.45:0.2); roundRect(ctx,x,y,colW,rowH,10); ctx.stroke();
          ctx.fillStyle=inMonth?'#e6e8ef':'#6b7382'; ctx.textAlign='right'; ctx.fillText(String(d.getDate()), x+colW-6, y+14); ctx.textAlign='left';
          dayCellRects.push({ x,y,w:colW,h:rowH,date:dateAtMidnight(d) });
        }
      }
      ctx.restore(); viewMode='month';
    }

    function drawWeekGrid(weekStart=selectedWeekStart||weekMonday(new Date())){
      selectedWeekStart = new Date(weekStart);
      const w=canvas.clientWidth, h=canvas.clientHeight; ctx.clearRect(0,0,w,h);
      const pad=14, headerH=36; const gridTop=pad+headerH+pad; const cols=7; const cellW=(w-pad*(cols+1))/cols; const cellH=h-gridTop-pad;
      ctx.save(); ctx.textBaseline='middle'; ctx.textAlign='left'; ctx.font='600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      const monthsLong=['January','February','March','April','May','June','July','August','September','October','November','December'];
      const monday=weekMonday(weekStart);
      const title=`Week of ${monthsLong[monday.getMonth()]} ${monday.getDate()}, ${monday.getFullYear()}`; ctx.fillStyle='#e6e8ef'; ctx.fillText(title, pad, pad+headerH/2);
      const dows=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; const today=dateAtMidnight(new Date()); dayRects=[];
      for(let c=0;c<cols;c++){
        const x=pad+c*(cellW+pad); const y=gridTop; const dayDate=new Date(monday); dayDate.setDate(monday.getDate()+c); const dayColor=colorForDay(dayDate,today);
        ctx.fillStyle=withAlpha(dayColor,0.18); roundRect(ctx,x,y,cellW,cellH,10); ctx.fill(); ctx.strokeStyle=withAlpha(dayColor,0.45); roundRect(ctx,x,y,cellW,cellH,10); ctx.stroke();
        ctx.textAlign='center'; ctx.fillStyle='#a6adbb'; ctx.fillText(`${dows[c]} ${dayDate.getDate()}`, x+cellW/2, y+14); ctx.textAlign='left';
        dayRects.push({ x,y,w:cellW,h:cellH,date:dateAtMidnight(dayDate) });
      }
      ctx.restore(); viewMode='week';
    }

    function drawDayGrid(day=dateAtMidnight(new Date()), previewDrag=false){
      selectedDayDate = new Date(day);
      const w=canvas.clientWidth, h=canvas.clientHeight; ctx.clearRect(0,0,w,h);
      const pad=14, headerH=36, gutter=60; const gridTop=pad+headerH+pad; const heightAvail=h-gridTop-pad;
      ctx.save(); ctx.textBaseline='middle'; ctx.font='600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      const monthsLong=['January','February','March','April','May','June','July','August','September','October','November','December'];
      const title=`${monthsLong[day.getMonth()]} ${day.getDate()}, ${day.getFullYear()}`; ctx.fillStyle='#e6e8ef'; ctx.fillText(title, pad, pad+headerH/2);
      // Time axis
      ctx.fillStyle='#a6adbb'; for(let hhh=0; hhh<=24; hhh+=2){ const y=gridTop + (hhh/24)*heightAvail; ctx.fillText(String(hhh).padStart(2,'0')+':00', pad, y); }
      // Background block
      const colX=pad+gutter; const colW=w-colX-pad; ctx.fillStyle=withAlpha(getCss('--accent','#7aa2f7'),0.08); roundRect(ctx,colX,gridTop,colW,heightAvail,10); ctx.fill(); ctx.strokeStyle=withAlpha(getCss('--accent','#7aa2f7'),0.25); roundRect(ctx,colX,gridTop,colW,heightAvail,10); ctx.stroke();
      // Draw existing blocks
      const key=dayKey(day); const blocks=dayBlocksStore[key]||[]; blocks.forEach(b=>{ const y0=gridTop + (b.start/1440)*heightAvail; const y1=gridTop + (b.end/1440)*heightAvail; ctx.fillStyle=withAlpha(getCss('--ok','#5bdc82'),0.35); roundRect(ctx,colX,y0,colW,Math.max(8,y1-y0),8); ctx.fill(); ctx.strokeStyle=withAlpha(getCss('--ok','#5bdc82'),0.65); roundRect(ctx,colX,y0,colW,Math.max(8,y1-y0),8); ctx.stroke(); });
      // Preview drag
      if (previewDrag && dayDrag){ let y0=Math.min(dayDrag.y0,dayDrag.y1); let y1=Math.max(dayDrag.y0,dayDrag.y1); y0=Math.max(gridTop,y0); y1=Math.min(canvas.clientHeight - pad,y1); ctx.fillStyle=withAlpha(getCss('--accent','#7aa2f7'),0.25); roundRect(ctx,colX,y0,colW,Math.max(8,y1-y0),8); ctx.fill(); }
      ctx.restore(); viewMode='day';
    }

    function dayKey(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }

    function redrawCurrentView(){ if (viewMode==='year') drawYearGrid(); else if (viewMode==='month') drawMonthGrid(selectedMonth ?? (new Date()).getMonth(), selectedYear); else if (viewMode==='week') drawWeekGrid(selectedWeekStart); else if (viewMode==='day') drawDayGrid(selectedDayDate); }

    function getPos(e){ const rect=canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }

    function handleViewClick(x,y){ if (viewMode==='year'){ const hit=monthRects.find(r=> x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h); if (hit){ selectedMonth=hit.i; drawMonthGrid(selectedMonth, selectedYear);} } else if (viewMode==='month'){ const hitDay=dayCellRects.find(r=> x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h); if (hitDay){ selectedDayDate=hitDay.date; drawDayGrid(selectedDayDate); return; } const hitW=weekRects.find(r=> x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h); if (hitW){ selectedWeekStart=hitW.monday; drawWeekGrid(selectedWeekStart);} } else if (viewMode==='week'){ const hitD=dayRects.find(r=> x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h); if (hitD){ selectedDayDate=hitD.date; drawDayGrid(selectedDayDate);} } }

    function handleViewPointerDown(e,x,y){ if (viewMode!=='day') return false; const pad=14, headerH=36, gutter=60; const gridTop=pad+headerH+pad; if (y<gridTop) return false; if (x<pad+gutter) return false; dayDrag={ y0:y, y1:y }; canvas.setPointerCapture(e.pointerId); return true; }
    function handleViewPointerMove(e,x,y){ if (!dayDrag) return; dayDrag.y1=y; if (viewMode==='day') drawDayGrid(selectedDayDate, true); }
    function handleViewPointerUp(e){ if (!dayDrag) return; const pad=14, headerH=36, gutter=60; const gridTop=pad+headerH+pad; const h=canvas.clientHeight; const heightAvail=h-gridTop-pad; const minPerPx=24*60/Math.max(1,heightAvail); let y0=Math.min(dayDrag.y0,dayDrag.y1); let y1=Math.max(dayDrag.y0,dayDrag.y1); y0=Math.max(gridTop,y0); y1=Math.min(h - pad,y1); let startMin=Math.round((y0-gridTop)*minPerPx); let endMin=Math.round((y1-gridTop)*minPerPx); if (endMin-startMin<15) endMin=startMin+15; const key=dayKey(selectedDayDate); if (!dayBlocksStore[key]) dayBlocksStore[key]=[]; dayBlocksStore[key].push({ start:startMin, end:endMin, text:''}); setStore('pm_day_blocks', dayBlocksStore); dayDrag=null; drawDayGrid(selectedDayDate); }

    // Pointer events
    function onPointerDown(e){ const pt=getPos(e); if (handleViewPointerDown(e, pt.x, pt.y)) return; handleViewClick(pt.x, pt.y); }
    function onPointerMove(e){ const pt=getPos(e); handleViewPointerMove(e, pt.x, pt.y); }
    function onPointerUp(e){ handleViewPointerUp(e); }

    function onKeyDown(e){ if (e.key==='Escape'){ if (viewMode==='day'){ viewMode='week'; drawWeekGrid(selectedWeekStart || weekMonday(selectedDayDate || new Date())); } else if (viewMode==='week'){ viewMode='month'; drawMonthGrid(selectedMonth ?? (new Date()).getMonth(), selectedYear); } else if (viewMode==='month'){ viewMode='year'; selectedMonth=null; selectedWeekStart=null; drawYearGrid(); } } }

    const debouncedResize = debounce(() => { resizeCanvas(); redrawCurrentView(); }, 120);

    // Mount
    resizeCanvas();
    drawYearGrid();
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', debouncedResize);
    try { new ResizeObserver(() => debouncedResize()).observe(document.getElementById('center')); } catch {}

    // Cleanup
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', debouncedResize);
    };
  }, []);

  return (
    React.createElement('div', { style: { position: 'relative', minHeight: 0, height: '100%' } },
      React.createElement('canvas', { id: 'calendarCanvas', ref: canvasRef, style: { width: '100%', height: '100%', display: 'block', background: 'repeating-conic-gradient(from 45deg, #0e131c 0% 25%, #0b0f16 0% 50%) 50% / 26px 26px' } })
    )
  );
}

window.CalendarView = CalendarView;
