/**
 * Editor chrome follows the embedding console, its light/dark and its accent; pet palette remains a separate setting.
 * A console that asks for it (`?fit=1`) is told how tall the page is (`companion:height`), sizes the frame to it and
 * scrolls it with the window instead of a scrollbar of the frame's own (dress.css `[data-embedded]`).
 */
export function bindAppearance(doc, win) {
  const params = new URLSearchParams(win.location.search);
  const initial = params.get('appearance');
  const apply = (mode) => {
    if (mode === 'light' || mode === 'dark') doc.documentElement.dataset.uiTheme = mode;
  };
  apply(initial);
  let parentOrigin = null;
  try {
    const ref = new URL(doc.referrer);
    if (ref.protocol === win.location.protocol && ref.hostname === win.location.hostname) parentOrigin = ref.origin;
  } catch { /* A standalone dressing window has no embedding console. */ }
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
