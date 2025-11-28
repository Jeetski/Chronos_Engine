const OVERLAY_TAG = 'chronos-goal-wizard';
let stylesInjected = false;

function injectStyles(){
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.dataset.wizardStyles = OVERLAY_TAG;
  style.textContent = `
    .wizard-overlay {
      position: fixed;
      inset: 0;
      background: rgba(5,7,12,0.75);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(6px);
    }
    .wizard-shell {
      width: min(720px, 90vw);
      max-height: 88vh;
      background: linear-gradient(180deg,#1b2232,#101520);
      border: 1px solid #2d3447;
      border-radius: 16px;
      padding: 24px;
      color: #f1f5ff;
      box-shadow: 0 18px 65px rgba(0,0,0,0.55);
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .wizard-shell h1 {
      margin: 0;
      font-size: 26px;
      letter-spacing: 0.4px;
    }
    .wizard-shell p {
      margin: 0;
      color: #b7c1d9;
      line-height: 1.5;
    }
    .wizard-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
    .wizard-actions button {
      border: 1px solid #4a5270;
      border-radius: 10px;
      padding: 10px 18px;
      font-size: 15px;
      cursor: pointer;
      background: #161c2b;
      color: inherit;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .wizard-actions button.primary {
      background: linear-gradient(180deg,#3a63ff,#2848db);
      border-color: #466fff;
    }
    .wizard-actions button:hover {
      border-color: #5d6fa0;
    }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function removeOverlay(){
  document.querySelectorAll(`[data-wizard-overlay=\"${OVERLAY_TAG}\"]`).forEach(el => el.remove());
}

function renderOverlay(){
  removeOverlay();
  const overlay = document.createElement('div');
  overlay.className = 'wizard-overlay';
  overlay.setAttribute('data-wizard-overlay', OVERLAY_TAG);
  overlay.innerHTML = `
    <div class="wizard-shell">
      <div>
        <h1>Goal Planning Wizard</h1>
        <p>This skeleton wizard mirrors the widget folder structure and will evolve into a full multi-step planner. Use it as the base for designing prompts, collecting inputs, and generating YAML or actions.</p>
      </div>
      <div class="wizard-actions">
        <button type="button" class="dismiss">Close</button>
        <button type="button" class="primary start">Start Draft Flow</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', (ev)=> {
    if (ev.target === overlay) removeOverlay();
  });
  const closeBtn = overlay.querySelector('.dismiss');
  closeBtn?.addEventListener('click', removeOverlay);
  const startBtn = overlay.querySelector('.start');
  startBtn?.addEventListener('click', ()=>{
    startBtn.textContent = 'Drafting...';
    startBtn.disabled = true;
    setTimeout(()=> {
      startBtn.disabled = false;
      startBtn.textContent = 'Start Draft Flow';
    }, 900);
  });
  document.body.appendChild(overlay);
}

export async function launch(context, options = {}){
  injectStyles();
  renderOverlay();
  try {
    context?.bus?.emit?.('wizard:opened', { wizard: options?.wizard });
  } catch {}
}
