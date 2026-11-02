/**
 * WebSocket addresses (ws or wss as the page is http or https, on the page's host, with the window's
 * language attached), and the JSON channels of `/ws/debug` and `/ws/sessions` over the stream client
 * (`stream.ts`): a frame that is not JSON is reported and dropped; JSON that is not an object is dropped.
 */
import { withLanguage } from './language.ts';
import type { WebUiStreamHandle } from 'cortico/web/shared/client-panel.ts';
import type { Lifecycle } from './lifecycle.ts';
import { openStream, type SocketLike } from './stream.ts';

export interface SocketEnv {
  /** A path such as `/ws/providers/…` to its absolute address. */
  wsUrl(path: string): string;
  createSocket(url: string): SocketLike;
  setTimer(fn: () => void, ms: number): number;
  clearTimer(id: number): void;
}

export interface LocationLike {
  protocol: string;
  host: string;
}

export function wsUrlOf(loc: LocationLike, path: string): string {
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${loc.host}${path}`;
}

export function browserSocketEnv(win: Window & typeof globalThis): SocketEnv {
  return {
    wsUrl: (path) => wsUrlOf(win.location, withLanguage(path)),
    createSocket: (url) => new win.WebSocket(url) as unknown as SocketLike,
    setTimer: (fn, ms) => win.setTimeout(fn, ms),
    clearTimer: (id) => win.clearTimeout(id),
  };
}

export interface FrameworkSocketOptions {
  /** `/ws/debug` / `/ws/sessions` */
  path: string;
  /** abort 停止连接与重连；句柄登记在该 lifecycle。 */
  lifecycle: Lifecycle;
  /** 一帧(已解析)。非对象的帧(数组、裸字符串)不会送到这儿。 */
  onFrame(frame: Readonly<Record<string, unknown>>): void;
  /** 连接和断线通知；主动关闭不报告断线。 */
  onNet?(online: boolean): void;
  onError?(err: unknown): void;
  env: SocketEnv;
}

/** 返回的通道句柄已登记在 lifecycle，可提前 dispose。 */
export function openFrameworkSocket(opts: FrameworkSocketOptions): WebUiStreamHandle {
  const { env } = opts;
  const handle = openStream({
    url: env.wsUrl(opts.path),
    signal: opts.lifecycle.signal,
    createSocket: env.createSocket,
    setTimer: env.setTimer,
    clearTimer: env.clearTimer,
    ...(opts.onError ? { onError: opts.onError } : {}),
    handlers: {
      open: () => opts.onNet?.(true),
      close: (willRetry) => {
        if (willRetry) opts.onNet?.(false);
      },
      message: (text) => {
        let frame: unknown;
        try {
          frame = JSON.parse(text);
        } catch (err) {
          opts.onError?.(err);
          return;
        }
        if (!frame || typeof frame !== 'object' || Array.isArray(frame)) return;
        opts.onFrame(frame as Record<string, unknown>);
      },
    },
  });
  return opts.lifecycle.own(handle);
}
