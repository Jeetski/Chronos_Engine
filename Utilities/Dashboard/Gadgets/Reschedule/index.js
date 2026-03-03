export function mount(el, context = {}) {
  const apiBase = typeof context.apiBase === 'function'
    ? context.apiBase
    : (() => {
      const o = window.location.origin;
      if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
      return o;
    });
  const showToast = typeof context.showToast === 'function'
    ? context.showToast
    : (msg) => { try { console.log('[DockReschedule]', msg); } catch { } };

  el.innerHTML = `<button class="dock-pin" type="button" data-dock-pin="reschedule">Reschedule</button>`;
  const btn = el.querySelector('[data-dock-pin="reschedule"]');

  const onClick = async () => {
    if (!btn) return;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Rescheduling...';
    try {
      const resp = await fetch(apiBase() + '/api/cli', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'today',
          args: ['reschedule'],
          properties: {},
        }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok || payload?.ok === false) {
        throw new Error(payload?.stderr || payload?.error || 'today reschedule failed');
      }
      try { window.calendarLoadToday?.(true); } catch { }
      showToast('Rescheduled today.', 'success');
    } catch (err) {
      showToast(`Reschedule failed: ${String(err?.message || err || 'unknown error')}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = label || 'Reschedule';
    }
  };

  btn?.addEventListener('click', onClick);
  return {
    destroy() {
      try { btn?.removeEventListener('click', onClick); } catch { }
    },
  };
}
