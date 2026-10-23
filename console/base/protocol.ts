/**
 * The parts of the WebUI HTTP API the settings window shares with Core: the headers and query
 * parameter that carry the window's language and the login state, and the paths of panel methods
 * and panel streams, the manifest version and asset paths. Panel contract types come from Cortico
 * (`import type` only);
 * tests/console-api.test.ts locks the routes these build.
 */
import type { ContributingKind } from 'cortico/web/shared/webui-protocol.ts';
import type { WebUiClientBundle, Disposable } from 'cortico/web/shared/client-panel.ts';

export type { Disposable };

/** Every request carries the window's language in this header. */
export const LANGUAGE_HEADER = 'x-cortico-language';
/** A WebSocket handshake carries it in this query parameter. */
export const LANGUAGE_QUERY = 'language';
/** Present on a 401 when the console asks for a login. */
export const AUTH_HEADER = 'x-cortico-auth';

/** POST `{ args }` to call a panel method; the reply is what the method returns. */
export function panelRoute(pageId: string, panelId: string, method: string): string {
  return `/api/webui/providers/${encodeURIComponent(pageId)}/panels/${encodeURIComponent(panelId)}/${encodeURIComponent(method)}`;
}

/** The WebSocket path of a panel's stream. */
export function panelStreamRoute(pageId: string, panelId: string): string {
  return `/ws/providers/${encodeURIComponent(pageId)}/panels/${encodeURIComponent(panelId)}`;
}

/** A request that did not succeed: the HTTP status (0 when no response came) and the server's message. */
export class ConsoleInvokeError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ConsoleInvokeError';
    this.status = status;
  }
}

/** Wraps a cleanup function; it runs once however often `dispose` is called. */
export function toDisposable(cleanup: () => void): Disposable {
  let done = false;
  return {
    dispose() {
      if (done) return;
      done = true;
      cleanup();
    },
  };
}

export type {
  WebUiClientBundle, WebUiMemo, WebUiPanel, WebUiPanelContext, WebUiStreamHandle, WebUiStreamHandlers,
} from 'cortico/web/shared/client-panel.ts';

/** What a panel bundle's default export must look like: an object of panels by id. */
export function isConsoleClientBundle(v: unknown): v is WebUiClientBundle {
  const panels = (v as { panels?: unknown } | null)?.panels;
  return !!panels && typeof panels === 'object' && !Array.isArray(panels);
}

/** The manifest version supported by the page host. */
export const CONSOLE_PROTOCOL_VERSION = 1;
export const CONSOLE_LAMPS_ROUTE = '/api/webui/lamps';

export function pageIdFor(kind: ContributingKind, name: string): string {
  return `${kind}:${name}`;
}

/** Asset paths stay under /assets/ and contain no traversal, encoding or query string. */
export function isSafeAssetUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !/^\/assets\/[A-Za-z0-9._/-]+$/.test(url)) return false;
  if (url.includes('//')) return false;
  return !url.split('/').includes('..');
}
