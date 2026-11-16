import './modal.css';
import type { Disposable } from 'cortico/web/shared/client-panel.ts';
/** 浮层的生存环境：文档、挂载点、面板生命周期。 */
export interface OverlayEnv {
  doc: Document;
  /** 浮层挂在这里。**不能是面板的 `root`**——那个在 unmount 时会被清空。 */
  host: HTMLElement;
  /** 面板的 `ctx.signal`。abort = 面板没了，浮层必须跟着消失。 */
  signal: AbortSignal;
}

/** close 与 dispose 幂等，并终止本层的 signal。 */
export interface Overlay extends Disposable {
  el: HTMLElement;
  close(): void;
  /** 本层的生命周期：`close()` 即 abort。层内的监听全挂它。 */
  signal: AbortSignal;
}

/** 面板卸载后返回的空句柄。 */
export const noopDisposable: Disposable = { dispose() {} };

/** 浮层随面板关闭；提前关闭时移除面板上的监听。 */
export function openLayer(env: OverlayEnv, el: HTMLElement, onClose?: () => void): Overlay {
  const ac = new (env.doc.defaultView?.AbortController ?? AbortController)();
  const close = (): void => {
    if (ac.signal.aborted) return;
    ac.abort();
    el.remove();
    onClose?.();
  };
  env.signal.addEventListener('abort', close, { once: true, signal: ac.signal });
  env.host.appendChild(el);
  return { el, close, signal: ac.signal, dispose: close };
}

/**
 * 铺一层 `.modal` 遮罩，接好"点遮罩 / 按 Esc 关闭"。
 * `onClose` 只会被调一次；重复调用 `close()` 是安全的。
 */
export function openModal(env: OverlayEnv, onClose: () => void): Overlay {
  const el = env.doc.createElement('div'); el.className = 'modal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  const layer = openLayer(env, el, onClose);

  env.doc.addEventListener(
    'keydown',
    (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') layer.close();
    },
    { signal: layer.signal },
  );
  // 按下位置决定是否关闭，卡片内开始的拖选不关闭弹窗。
  el.addEventListener(
    'mousedown',
    (ev: MouseEvent) => {
      if (ev.target === el) layer.close();
    },
    { signal: layer.signal },
  );
  return layer;
}


/** The same card and scrollable content for confirmations, notices and structured dialogs. */
export function modalCard(env: OverlayEnv, layer: Overlay, title: string, narrow = false) {
  const card = env.doc.createElement('div'); card.className = 'modalcard';
  if (narrow) { card.classList.add('confirm-card'); card.style.width = 'min(460px,92vw)'; }
  const head = env.doc.createElement('div'); head.className = 'modalhead';
  const heading = env.doc.createElement('span'); heading.className = 'modaltitle'; heading.textContent = title;
  const body = env.doc.createElement('div'); body.className = 'modalbody';
  head.append(heading); card.append(head, body); layer.el.append(card);
  return { card, head, body };
}
