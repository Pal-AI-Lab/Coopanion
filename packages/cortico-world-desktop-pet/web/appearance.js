/**
 * Editor chrome follows the embedding console, its light/dark and its accent; pet palette remains a separate setting.
 * A console that asks for it (`?fit=1`) is told how tall the page is (`companion:height`), sizes the frame to it and
 * scrolls it with the window instead of a scrollbar of the frame's own (dress.css `[data-embedded]`).
 */
/** The origin of the settings window that opened the page (its referrer, on this host), or null. */
function hostOrigin(doc, win) {
  try {
    const ref = new URL(doc.referrer);
    return ref.protocol === win.location.protocol && ref.hostname === win.location.hostname ? ref.origin : null;
  } catch { return null; }
}

/** The host renders the same structured dialog as the standalone page. Files retain their relative paths. */
export function hostDressDialogs(doc, win) {
  const origin = win.parent === win ? null : hostOrigin(doc, win);
  if (!origin) return null;
  let sequence = 0, current = null;
  const receive = (e) => {
    if (!current || e.source !== win.parent || e.origin !== origin || e.data?.type !== 'companion:dialog-action' || e.data.id !== current?.id) return;
    const answer = current.answer; current = null; answer(e.data.result);
  };
  win.addEventListener('message', receive);
  win.addEventListener('pagehide', () => { current = null; win.removeEventListener('message', receive); }, { once: true });
  return {
    show(view, answer) {
      current = { id: ++sequence, answer };
      win.parent.postMessage({ type: 'companion:dialog', id: current.id, view }, origin);
    },
    close() { current = null; win.parent.postMessage({ type: 'companion:dialog-close' }, origin); },
  };
}

export function bindAppearance(doc, win) {
  const params = new URLSearchParams(win.location.search);
  const initial = params.get('appearance');
  const apply = (mode) => {
    if (mode === 'light' || mode === 'dark') doc.documentElement.dataset.uiTheme = mode;
  };
  apply(initial);
  const parentOrigin = hostOrigin(doc, win);
  const applyAccent = (accent) => {
    if (/^#[0-9a-f]{6}$/i.test(String(accent ?? ''))) doc.documentElement.style.setProperty('--host-accent', accent);
  };
  const onMessage = (event) => {
    if (!parentOrigin || event.source !== win.parent || event.origin !== parentOrigin) return;
    if (event.data?.type !== 'companion:appearance') return;
    apply(event.data.mode);
    applyAccent(event.data.accent);
  };
  win.addEventListener('message', onMessage);
  let sizes = null;
  if (parentOrigin && win.parent !== win && params.get('fit') === '1') {
    doc.documentElement.dataset.embedded = '';
    const report = () => win.parent.postMessage({ type: 'companion:height', height: Math.ceil(doc.body.getBoundingClientRect().height) }, parentOrigin);
    sizes = new win.ResizeObserver(report);
    sizes.observe(doc.body);
  }
  return () => { win.removeEventListener('message', onMessage); sizes?.disconnect(); };
}
