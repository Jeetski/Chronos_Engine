export function mount(el, context) {
  const tpl = `
    <div class="header" id="debugHeader">
      <div class="title">Debug Console</div>
      <div class="controls">
        <button class="icon-btn" id="debugMin" title="Minimize">_</button>
        <button class="icon-btn" id="debugClear" title="Clear">⌫</button>
        <button class="icon-btn" id="debugClose" title="Close">x</button>
      </div>
    </div>
    <div class="content" style="gap:8px; display:flex; flex-direction:column; min-height:0;">
      <div class="row" style="gap:8px; align-items:center;">
        <label class="hint">Capture:</label>
        <label class="hint"><input type="checkbox" id="capLog" checked /> log</label>
        <label class="hint"><input type="checkbox" id="capInfo" checked /> info</label>
        <label class="hint"><input type="checkbox" id="capWarn" checked /> warn</label>
        <label class="hint"><input type="checkbox" id="capError" checked /> error</label>
        <label class="hint"><input type="checkbox" id="capOnErr" checked /> onerror</label>
        <div class="spacer"></div>
        <button class="btn" id="debugCopy">Copy</button>
      </div>
      <pre id="debugOut" style="flex:1 1 auto; min-height:120px; overflow:auto; background:#0f141d; border:1px solid #222835; border-radius:8px; padding:8px; white-space:pre-wrap;">(capturing logs...)</pre>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const header = el.querySelector('#debugHeader');
  const btnMin = el.querySelector('#debugMin');
  const btnClear = el.querySelector('#debugClear');
  const btnClose = el.querySelector('#debugClose');
  const out = el.querySelector('#debugOut');
  const cbLog = el.querySelector('#capLog');
  const cbInfo = el.querySelector('#capInfo');
  const cbWarn = el.querySelector('#capWarn');
  const cbError = el.querySelector('#capError');
  const cbOnErr = el.querySelector('#capOnErr');
  const btnCopy = el.querySelector('#debugCopy');

  // Dragging
  header.addEventListener('pointerdown', (ev)=>{
    const startX=ev.clientX, startY=ev.clientY; const rect=el.getBoundingClientRect(); const offX=startX-rect.left, offY=startY-rect.top;
    function onMove(e){ el.style.left=Math.max(6, e.clientX-offX)+'px'; el.style.top=Math.max(6, e.clientY-offY)+'px'; el.style.right='auto'; }
    function onUp(){ window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  });
  btnMin.addEventListener('click', ()=> el.classList.toggle('minimized'));
  btnClose.addEventListener('click', ()=> el.style.display='none');
  btnClear.addEventListener('click', ()=> { out.textContent=''; });
  btnCopy.addEventListener('click', async ()=>{
    try{ await navigator.clipboard.writeText(out.textContent||''); }catch{}
  });

  const orig = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  function ts(){ const d=new Date(); return d.toISOString().split('T')[1].replace('Z',''); }
  function append(kind, args){
    const msg = Array.from(args).map(a=>{
      if (a instanceof Error) return a.stack||a.message||String(a);
      if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
      return String(a);
    }).join(' ');
    out.textContent += `[${ts()}] ${kind.toUpperCase()} ${msg}\n`;
    out.scrollTop = out.scrollHeight;
  }
  function wrap(kind){
    return function(...args){
      try{
        if ((kind==='log' && cbLog.checked) || (kind==='info' && cbInfo.checked) || (kind==='warn' && cbWarn.checked) || (kind==='error' && cbError.checked)){
          append(kind, args);
        }
      } catch{}
      try { return orig[kind](...args); } catch{}
    }
  }
  console.log = wrap('log');
  console.info = wrap('info');
  console.warn = wrap('warn');
  console.error = wrap('error');

  function onWinErr(message, source, lineno, colno, error){ if (cbOnErr.checked) append('onerror', [message, `at ${source}:${lineno}:${colno}`, error||'']); return false; }
  function onRejection(ev){ try{ const reason = ev && (ev.reason || ev); append('unhandledrejection', [reason]); }catch{} }
  window.addEventListener('error', onWinErr);
  window.addEventListener('unhandledrejection', onRejection);

  // Basic resize handles
  (function enableResize(){
    const east = el.querySelector('.resizer.e'); const south = el.querySelector('.resizer.s'); const se = el.querySelector('.resizer.se');
    function drag(elm, dir){ return (ev)=>{
      ev.preventDefault(); const startX=ev.clientX, startY=ev.clientY; const rect=el.getBoundingClientRect();
      function onMove(e){ if(dir.includes('e')) el.style.width=Math.max(280, rect.width + (e.clientX-startX))+'px'; if(dir.includes('s')) el.style.height=Math.max(160, rect.height + (e.clientY-startY))+'px'; }
      function onUp(){ window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    } }
    if (east) east.addEventListener('pointerdown', drag(el, 'e'));
    if (south) south.addEventListener('pointerdown', drag(el, 's'));
    if (se) se.addEventListener('pointerdown', drag(el, 'es'));
  })();

  return {
    unmount(){
      try{ console.log = orig.log; console.info = orig.info; console.warn = orig.warn; console.error = orig.error; }catch{}
      try{ window.removeEventListener('error', onWinErr); window.removeEventListener('unhandledrejection', onRejection); }catch{}
    }
  };
}
