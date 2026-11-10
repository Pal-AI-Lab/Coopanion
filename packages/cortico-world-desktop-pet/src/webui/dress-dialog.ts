/** Figure import content inside the settings window's shared modal shell. */
import { openLayer, openModal, modalCard, type OverlayEnv, type Overlay } from '../../../../shared/ui/modal.ts';
import './dress-dialog.css';

export interface DressDialogView {
  title: string;
  body?: string;
  busy?: boolean;
  selectable?: boolean;
  items?: Array<{ key: string; label: string; image?: string; meta: string[]; notice?: string; details?: { title: string; lines: string[] } }>;
  warnings?: string[];
  actions: Array<{ key: string; label: string; kind?: 'primary' | 'danger'; selection?: boolean; file?: 'zip' | 'directory' }>;
}
export interface DressDialogAnswer {
  action: string;
  selected: string[];
  files?: Array<{ path: string; file: File }>;
}

/** Only text and known form controls cross the frame boundary. */
export function isDressDialog(value: unknown): value is DressDialogView {
  if (!value || typeof value !== 'object') return false;
  const v = value as DressDialogView;
  const strings = (xs: unknown): xs is string[] => Array.isArray(xs) && xs.every(x => typeof x === 'string');
  return typeof v.title === 'string' && (v.body === undefined || typeof v.body === 'string')
    && (v.busy === undefined || typeof v.busy === 'boolean')
    && (v.selectable === undefined || typeof v.selectable === 'boolean')
    && (v.warnings === undefined || strings(v.warnings)) && Array.isArray(v.actions)
    && v.actions.every(a => a && typeof a.key === 'string' && typeof a.label === 'string'
      && (a.selection === undefined || typeof a.selection === 'boolean')
      && (a.kind === undefined || a.kind === 'primary' || a.kind === 'danger')
      && (a.file === undefined || a.file === 'zip' || a.file === 'directory'))
    && (v.items === undefined || Array.isArray(v.items) && v.items.every(i => i && typeof i.key === 'string'
      && typeof i.label === 'string' && strings(i.meta) && (i.image === undefined || typeof i.image === 'string')
      && (i.notice === undefined || typeof i.notice === 'string')
      && (i.details === undefined || i.details && typeof i.details.title === 'string' && strings(i.details.lines))));
}

export function showDressDialog(env: OverlayEnv, view: DressDialogView, answer: (result: DressDialogAnswer) => void): Overlay {
  let answered = false;
  const closed = () => { if (!answered) answer({ action: 'cancel', selected: [] }); };
  const layer = view.busy ? openLayer(env, env.doc.createElement('div'), closed) : openModal(env, closed);
  if (view.busy) { layer.el.className = 'modal busy'; layer.el.setAttribute('role', 'dialog'); layer.el.setAttribute('aria-modal', 'true'); layer.el.setAttribute('aria-busy', 'true'); }
  const { card, body } = modalCard(env, layer, view.title, !view.items?.length);
  card.classList.add('figure-dialog');
  const node = (tag: string, cls: string, text = '') => { const el = env.doc.createElement(tag); el.className = cls; el.textContent = text; return el; };
  if (view.body) body.append(node('p', 'figure-dialog-lead', view.body));
  const selected = new Set(view.selectable ? view.items?.map(i => i.key) : []);
  const selectionButtons: HTMLButtonElement[] = [];
  if (view.items?.length) {
    const list = node('div', 'figure-dialog-items');
    for (const item of view.items) {
      const row = node(view.selectable ? 'label' : 'div', 'figure-dialog-item');
      if (view.selectable) {
        const box = env.doc.createElement('input'); box.type = 'checkbox'; box.checked = true; box.value = item.key;
        box.addEventListener('change', () => { if (box.checked) selected.add(item.key); else selected.delete(item.key); for (const b of selectionButtons) b.disabled = selected.size === 0; }, { signal: layer.signal });
        row.append(box);
      }
      if (item.image) {
        const url = URL.canParse(item.image, env.doc.baseURI) ? new URL(item.image, env.doc.baseURI) : null;
        if (url && ['http:', 'https:', 'data:', 'blob:'].includes(url.protocol)) { const img = env.doc.createElement('img'); img.src = url.href; img.alt = ''; row.append(img); }
      }
      const info = node('div', 'figure-dialog-info'); info.append(node('b', '', item.label));
      for (const text of item.meta) info.append(node('span', 'figure-dialog-meta', text));
      if (item.notice) info.append(node('span', 'figure-dialog-note', item.notice));
      if (item.details) { const details = node('details', 'figure-dialog-meta'); details.append(node('summary', '', item.details.title)); for (const text of item.details.lines) details.append(node('p', '', text)); info.append(details); }
      row.append(info); list.append(row);
    }
    body.append(list);
  }
  for (const text of view.warnings ?? []) body.append(node('p', 'figure-dialog-warning', text));
  const finish = (action: string, files?: DressDialogAnswer['files']) => {
    answered = true; layer.close(); answer({ action, selected: [...selected], ...(files ? { files } : {}) });
  };
  if (view.actions.length) {
    const bar = node('div', 'figure-dialog-actions');
    for (const action of view.actions) {
      const btn = env.doc.createElement('button'); btn.type = 'button'; btn.className = `btn sm ${action.kind ?? ''}`; btn.textContent = action.label; btn.dataset.action = action.key;
      if (action.selection) { selectionButtons.push(btn); btn.disabled = selected.size === 0; }
      if (action.file) {
        const input = env.doc.createElement('input'); input.type = 'file'; input.hidden = true;
        if (action.file === 'zip') input.accept = '.zip,application/zip'; else input.setAttribute('webkitdirectory', '');
        input.addEventListener('change', () => { const files = Array.from(input.files ?? []).map(file => ({ path: file.webkitRelativePath || file.name, file })); if (files.length) finish(action.key, files); }, { signal: layer.signal });
        btn.addEventListener('click', () => input.click(), { signal: layer.signal }); bar.append(input);
      } else btn.addEventListener('click', () => finish(action.key), { signal: layer.signal });
      bar.append(btn);
    }
    body.append(bar); bar.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }
  return layer;
}

/**
 * Shows the dialogs of the dressing page in `frame` (web/appearance.js `hostDressDialogs`) until `env.signal` aborts, and
 * sends each answer back through `companion:dialog-action`. Messages count only from that frame at `frame.dataset.origin`.
 */
export function hostFrameDressDialogs(env: OverlayEnv, frame: HTMLIFrameElement): void {
  let dialog: Overlay | undefined;
  env.doc.defaultView!.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== frame.dataset.origin) return;
    if (e.data?.type === 'companion:dialog' && isDressDialog(e.data.view)) {
      dialog?.close();
      dialog = showDressDialog(env, e.data.view, (result) => {
        frame.contentWindow?.postMessage({ type: 'companion:dialog-action', id: e.data.id, result }, e.origin);
      });
    } else if (e.data?.type === 'companion:dialog-close') { dialog?.close(); dialog = undefined; }
  }, { signal: env.signal });
}

/** Standalone dressing pages use the same renderer as the embedding settings window. */
export function localDressDialogs(doc: Document, signal: AbortSignal) {
  let current: Overlay | undefined;
  return {
    show(view: DressDialogView, answer: (result: DressDialogAnswer) => void) { current?.close(); if (signal.aborted) return; current = showDressDialog({ doc, host: doc.body, signal }, view, answer); },
    close() { current?.close(); current = undefined; },
  };
}
