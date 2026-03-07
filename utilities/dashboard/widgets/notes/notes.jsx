/* global React, ReactDOM */

const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
};

function NotesWidget() {
  const [val, setVal] = React.useState(() => store.get('pm_notes', ''));
  React.useEffect(() => { const t = setTimeout(() => store.set('pm_notes', val), 250); return () => clearTimeout(t); }, [val]);

  async function copy() {
    try { await navigator.clipboard.writeText(val); } catch {}
  }

  return (
    React.createElement(React.Fragment, null,
      React.createElement('textarea', {
        className: 'textarea',
        placeholder: 'Write notes here...',
        value: val,
        onChange: e => setVal(e.target.value)
      }),
      React.createElement('div', { className: 'row' },
        React.createElement('span', { className: 'hint' }, 'Autosaves locally'),
        React.createElement('div', { className: 'spacer' }),
        React.createElement('button', { className: 'btn', onClick: copy }, 'Copy')
      )
    )
  );
}

window.NotesWidget = NotesWidget;

