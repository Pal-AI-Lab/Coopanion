/** 浮层挂载到调用方提供的 host，并随面板 signal 关闭。confirm 取消或 abort 时返回 false；abort 后不显示新浮层。 */

import type { Disposable } from 'cortico/web/shared/client-panel.ts';
import { h } from './dom.ts';
import { button, rowbar } from './sheet.ts';
import { S } from './strings.ts';
import { icon } from './icons.ts';

export { type OverlayEnv, type Overlay, noopDisposable } from '../../../shared/ui/modal.ts';
import { openLayer, openModal, modalCard, noopDisposable, type OverlayEnv, type Overlay } from '../../../shared/ui/modal.ts';

/** How long a toast stays. */
export const TOAST_MS = 2000;
/** How long an error toast stays; hovering or focusing it pauses the countdown. */
export const ERROR_TOAST_MS = 6000;

/**
 * 底部通知自动消失。每个 ui 实例只保留最新一条；面板 abort 后不显示。
 * 焦点在错误通知里时，Esc 只关闭这条通知，不传给下面的弹窗。
 */
export function toast(
  env: OverlayEnv,
  text: string,
  tone: 'ok' | 'bad' | undefined,
  prev: Overlay | null,
): Overlay | null {
  prev?.close();
  if (env.signal.aborted) return null;
  const el = h(env.doc, 'div', tone === 'bad' ? 'toast bad' : 'toast');
  el.setAttribute('role', tone === 'bad' ? 'alert' : 'status');
  el.append(h(env.doc, 'span', 'toast-text', text));
  const layer = openLayer(env, el);
  const duration = tone === 'bad' ? ERROR_TOAST_MS : TOAST_MS;
  el.style.setProperty('--toast-duration', `${duration}ms`);
  if (tone === 'bad') {
    const close = button(env.doc, layer.signal, '', { size: 'sm', onClick: () => layer.close() });
    close.className = 'extension-problem-close';
    close.setAttribute('aria-label', S.close);
    close.append(icon(env.doc, 'close'));
    el.append(close);
    el.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      layer.close();
    }, { signal: layer.signal });
  }
  let timer = setTimeout(() => layer.close(), duration);
  let remaining = duration, started = Date.now(), paused = false;
  const pause = () => {
    if (paused) return;
    paused = true; remaining -= Date.now() - started;
    clearTimeout(timer); el.style.animationPlayState = 'paused';
  };
  const resume = () => {
    if (!paused || el.matches(':hover') || el.contains(env.doc.activeElement)) return;
    paused = false; started = Date.now();
    el.style.animationPlayState = 'running';
    clearTimeout(timer); timer = setTimeout(() => layer.close(), remaining);
  };
  el.addEventListener('pointerenter', pause, { signal: layer.signal });
  el.addEventListener('pointerleave', resume, { signal: layer.signal });
  el.addEventListener('focusin', pause, { signal: layer.signal });
  el.addEventListener('focusout', resume, { signal: layer.signal });
  // 提前关掉(被下一条顶掉、或面板卸载)时把定时器也撤了,免得留一个空转的回调
  layer.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return layer;
}

/**
 * 模态确认。resolve 之后 DOM 与监听都已清干净。`body` 是节点时原样挂入;`ok` 换掉确认键的字。
 * `notice`:只是告知,只有一个「知道了」(见 notice)。
 */
export function confirm(
  env: OverlayEnv,
  opts: { title: string; body?: string | HTMLElement; danger?: boolean; ok?: string; notice?: boolean },
): Promise<boolean> {
  // 面板已经卸了:不弹窗,直接按"没答应"收场
  if (env.signal.aborted) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    // 默认答案就是 false,所以**任何**关闭路径(取消键 / Esc / 点遮罩 / 面板 abort)
    // 都会 resolve false,不必各自记得去 settle。
    let answer = false;
    const modal = openModal(env, () => resolve(answer));
    const settle = (v: boolean): void => {
      answer = v;
      modal.close();
    };

    const doc = env.doc;
    const { body } = modalCard(env, modal, opts.title, true);
    if (typeof opts.body === 'string') body.appendChild(h(doc, 'div', null, opts.body));
    else if (opts.body) body.appendChild(opts.body);

    const bar = rowbar(doc);
    bar.appendChild(h(doc, 'span', 'grow'));
    if (!opts.notice) bar.appendChild(
      button(doc, modal.signal, S.cancel, { size: 'sm', onClick: () => settle(false) }),
    );
    const ok = button(doc, modal.signal, opts.ok ?? (opts.notice ? S.gotIt : opts.danger ? S.proceedAnyway : S.confirm), {
      size: 'sm',
      variant: opts.danger ? 'danger' : 'primary',
      onClick: () => settle(true),
    });
    bar.appendChild(ok);
    body.appendChild(bar);

    ok.focus?.();
  });
}

/** 告知:与 confirm 同一张卡,只有一个「知道了」,没有要选的。 */
export function notice(env: OverlayEnv, opts: { title: string; body?: string | HTMLElement }): Promise<void> {
  return confirm(env, { ...opts, notice: true }).then(() => undefined);
}

/** busy 不响应 Esc、遮罩或关闭按钮；由返回的 Disposable 或面板 abort 关闭。 */
export function busy(env: OverlayEnv, title: string, text?: string): Disposable {
  if (env.signal.aborted) return noopDisposable;
  const doc = env.doc;
  const el = h(doc, 'div', 'modal busy');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-busy', 'true');
  const layer = openLayer(env, el);
  const { body } = modalCard(env, layer, title, true);
  if (text) body.appendChild(h(doc, 'div', 'busytext', text));
  return layer;
}

/** 遮罩上居中一张图；点图或遮罩、按 Esc 都关闭。 */
export function lightbox(env: OverlayEnv, src: string, alt = ''): Disposable {
  if (env.signal.aborted) return noopDisposable;
  const modal = openModal(env, () => {});
  modal.el.className = 'modal lightbox';
  const image = h(env.doc, 'img', 'lightbox-image');
  image.alt = alt;
  image.src = src;
  modal.el.appendChild(image);
  modal.el.addEventListener('click', () => modal.close(), { signal: modal.signal });
  return modal;
}

/** 可关闭的抽屉；字符串正文显示为 pre.mono，节点正文直接挂入 modalbody。 */
export function drawer(env: OverlayEnv, title: string, body: string | HTMLElement): Disposable {
  if (env.signal.aborted) return noopDisposable;
  const doc = env.doc;
  const modal = openModal(env, () => {});
  const { head, body: bodyEl } = modalCard(env, modal, title);
  head.append(button(doc, modal.signal, S.close, { size: 'sm', onClick: () => modal.close() }));
  bodyEl.appendChild(typeof body === 'string' ? h(doc, 'pre', 'mono', body) : body);
  return modal;
}
