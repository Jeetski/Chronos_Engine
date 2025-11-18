export function mount(el, context){
  const css = `
    .term { display:flex; flex-direction:column; gap:8px; height:100%; }
    .screen { flex:1; background:#0b0f16; color:#e6e8ef; border:1px solid #222835; border-radius:8px; padding:8px; overflow:auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; white-space: pre-wrap; }
    .prompt { display:flex; gap:6px; align-items:center; }
    .who { color:#7aa2f7; }
    .in { flex:1; background:#0f141d; color:#e6e8ef; border:1px solid #222835; border-radius:6px; padding:6px 8px; }
  `;
  el.innerHTML = `
    <style>${css}</style>
    <div class="header" id="tHeader">
      <div class="title">Terminal</div>
      <div class="controls">
        <button class="icon-btn" id="tMin" title="Minimize">_</button>
        <button class="icon-btn" id="tClose" title="Close">x</button>
      </div>
    </div>
    <div class="content">
      <div class="term">
        <div class="screen" id="tOut"></div>
        <div class="prompt">
          <span class="who" id="tWho">chronos@you</span>
          <input id="tInput" class="in" placeholder="Type a command (e.g., help) and press Enter" />
          <label class="hint" style="display:flex; align-items:center; gap:4px;"><input type="checkbox" id="tExpand" checked />Expand args</label>
        </div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;

  const outEl = el.querySelector('#tOut');
  const inEl = el.querySelector('#tInput');
  const whoEl = el.querySelector('#tWho');
  const btnMin = el.querySelector('#tMin');
  const btnClose = el.querySelector('#tClose');
  const expandChk = el.querySelector('#tExpand');

  function apiBase(){ const o=window.location.origin; if(!o||o==='null'||o.startsWith('file:')) return 'http://127.0.0.1:7357'; return o; }
  async function postYaml(url, obj){
    const yaml = (o)=>{ const lines=[]; for(const [k,v] of Object.entries(o||{})){
      if(Array.isArray(v)){ lines.push(`${k}:`); v.forEach(it=> lines.push(`  - ${JSON.stringify(it)}`)); }
      else if(typeof v==='object' && v){ lines.push(`${k}:`); for(const [k2,v2] of Object.entries(v)) lines.push(`  ${k2}: ${JSON.stringify(v2)}`); }
      else { lines.push(`${k}: ${JSON.stringify(v)}`); }
    } return lines.join('\n'); };
    return await fetch(url, { method:'POST', headers:{ 'Content-Type':'text/yaml' }, body: yaml(obj) });
  }

  function println(txt){ outEl.textContent += (txt? String(txt) : '') + '\n'; outEl.scrollTop = outEl.scrollHeight; }

  async function loadProfile(){
    try {
      const r = await fetch(apiBase()+"/api/profile");
      const j = await r.json();
      const prof = j?.profile || {};
      const nick = prof.nickname || prof.nick || 'user';
      whoEl.textContent = `chronos@${nick}`;
      // Apply theme via server resolver
      try {
        const themeName = prof.theme || (prof.console && prof.console.theme);
        if (themeName){
          const ts = await fetch(apiBase()+`/api/theme?name=${encodeURIComponent(themeName)}`);
          const tj = await ts.json();
          if (tj && tj.ok){
            if (tj.background_hex) outEl.style.background = tj.background_hex;
            if (tj.text_hex) { outEl.style.color = tj.text_hex; whoEl.style.color = tj.text_hex; }
          }
        }
      } catch {}
      // Greeting lines (support: welcome/greeting/entry_message/welcome_message; console.* variants)
      try {
        const greet = (prof.welcome || prof.greeting || prof.entry_message || prof.welcome_message || (prof.console && (prof.console.welcome || prof.console.greeting)) || []);
        let lines = [];
        if (typeof greet === 'string') lines = [greet];
        else if (Array.isArray(greet)) lines = greet.slice();
        else if (typeof greet === 'object') {
          // Collect line1..lineN in order
          const keys = Object.keys(greet).filter(k=>/^line\d+$/i.test(k)).sort((a,b)=> parseInt(a.replace(/\D/g,'')) - parseInt(b.replace(/\D/g,'')));
          for (const k of keys){ if (greet[k]) lines.push(greet[k]); }
        }
        if (!lines.length) lines = [`Welcome, @nickname.`];
        // Expand vars
        try { await (window.ChronosVars && window.ChronosVars.refresh && window.ChronosVars.refresh(true)); } catch {}
        for (const ln of lines){
          const out = (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(ln).replace('@nickname', nick)) : String(ln).replace('@nickname', nick);
          println(out);
        }
        println(`Type 'help' to list commands.`);
      } catch { println(`Welcome, ${nick}. Type 'help' to list commands.`); }
    } catch { whoEl.textContent = 'chronos@user'; println(`Welcome. Type 'help' to list commands.`); }
  }

  function splitArgs(line){
    const out=[]; let cur=''; let q=null; for(let i=0;i<line.length;i++){
      const c=line[i];
      if (q){ if (c===q){ q=null; continue;} cur+=c; continue; }
      if (c==='"' || c==='\'\''){ q=c; continue; }
      if (/\s/.test(c)){ if(cur){ out.push(cur); cur=''; } continue; }
      cur+=c;
    }
    if (cur) out.push(cur);
    return out;
  }

  async function runCli(line){
    if (!line.trim()) return;
    println(`${whoEl.textContent}> ${line}`);
    const parts = splitArgs(line.trim());
    const cmd = parts.shift()||'';
    // vars helper: set/unset
    if (cmd.toLowerCase()==='vars'){
      try {
        const r = await fetch(apiBase()+"/api/vars");
        const j = await r.json();
        println(JSON.stringify(j?.vars||{}, null, 2));
      } catch (e) { println(String(e)); }
      return;
    }
    if (cmd.toLowerCase()==='set'){
      const kv = {}; for(const token of parts){ const [k,...rest]=token.split(':'); if(!k) continue; kv[k]=rest.join(':'); }
      try{ const r = await postYaml(apiBase()+"/api/vars", { set: kv }); const j=await r.json(); println('vars set'); try{ context?.bus?.emit('vars:changed'); }catch{} }catch(e){ println(String(e)); }
      return;
    }
    if (cmd.toLowerCase()==='unset'){
      try{ const r = await postYaml(apiBase()+"/api/vars", { unset: parts }); const j=await r.json(); println('vars unset'); try{ context?.bus?.emit('vars:changed'); }catch{} }catch(e){ println(String(e)); }
      return;
    }
    if (cmd.toLowerCase()==='exit'){
      try {
        const r = await fetch(apiBase()+"/api/profile"); const j = await r.json(); const prof = j?.profile || {};
        const bye = prof.exit_message || prof.goodbye_message || prof.goodbye || (prof.console && (prof.console.exit_message || prof.console.goodbye_message)) || {};
        let lines = [];
        if (typeof bye === 'string') lines = [bye];
        else if (Array.isArray(bye)) lines = bye.slice();
        else if (typeof bye === 'object') {
          const keys = Object.keys(bye).filter(k=>/^line\d+$/i.test(k)).sort((a,b)=> parseInt(a.replace(/\D/g,'')) - parseInt(b.replace(/\D/g,'')));
          for (const k of keys){ if (bye[k]) lines.push(bye[k]); }
        }
        if (!lines.length) lines = ["Safe travels, @nickname.", "Returning you to baseline reality..."];
        try { await (window.ChronosVars && window.ChronosVars.refresh && window.ChronosVars.refresh(true)); } catch {}
        for (const ln of lines){ const out = (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand(String(ln)) : String(ln); println(out.replace('@nickname', whoEl.textContent.split('@')[1]||'user')); }
      } catch { println('Goodbye.'); }
      el.style.display='none'; return;
    }
    // Expand arguments if toggle is on (except for vars/set/unset/exit)
    try {
      if (expandChk && expandChk.checked && !['vars','set','unset','exit'].includes(cmd.toLowerCase())){
        const exp = (window.ChronosVars && window.ChronosVars.expand) ? window.ChronosVars.expand : (s)=>s;
        for (let i=0;i<parts.length;i++){ parts[i] = exp(parts[i]); }
      }
    } catch {}
    // Run real CLI
    try {
      const r = await postYaml(apiBase()+"/api/cli", { command: cmd, args: parts, properties: {} });
      const text = await r.text();
      // Server returns YAML with ok/stdout/stderr; just print the raw for now
      println(text);
    } catch (e) {
      println(String(e));
    }
  }

  const hist=[]; let hi=-1;
  inEl.addEventListener('keydown', async (e)=>{
    if (e.key==='Enter'){
      e.preventDefault(); const line=inEl.value; inEl.value=''; hist.push(line); hi=hist.length; await runCli(line);
    } else if (e.key==='ArrowUp'){
      if (hi>0){ hi--; inEl.value = hist[hi]||''; setTimeout(()=> inEl.setSelectionRange(inEl.value.length,inEl.value.length),0); }
    } else if (e.key==='ArrowDown'){
      if (hi < hist.length){ hi++; inEl.value = hist[hi]||''; setTimeout(()=> inEl.setSelectionRange(inEl.value.length,inEl.value.length),0); }
    } else if (e.ctrlKey && e.key.toLowerCase()==='l'){
      outEl.textContent='';
    }
  });

  btnClose.addEventListener('click', ()=>{ println('Goodbye.'); el.style.display='none'; try{ context?.bus?.emit('widget:closed','Terminal'); }catch{} });
  btnMin.addEventListener('click', ()=>{ const c=el.querySelector('.content'); if(!c) return; c.style.display = (c.style.display==='none'?'':'none'); });

  loadProfile();
}
