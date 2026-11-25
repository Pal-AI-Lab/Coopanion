/**
 * Requests to the WebUI HTTP API. Each carries the window's language and takes an abort signal.
 * A non-2xx reply or a body that is not JSON throws `ConsoleInvokeError`, with the server's
 * `error` when it gave one; an abort is thrown as it is. An empty success is null.
 */
import type { WebUiManifest } from 'cortico/web/shared/webui-protocol.ts';
import type { PathPickerOptions } from 'cortico/web/shared/path-picker.ts';
import { languageHeaders } from './language.ts';
import { AUTH_HEADER, ConsoleInvokeError, panelRoute } from './protocol.ts';
import { S } from './strings.ts';

export interface RequestOptions {
  signal?: AbortSignal;
  keepalive?: boolean;
}

/** How much of a reply an error message quotes. */
const SNIPPET_MAX = 200;

function snippet(text: string): string {
  const s = text.trim();
  return s.length > SNIPPET_MAX ? `${s.slice(0, SNIPPET_MAX)}…` : s;
}

const isAbortError = (err: unknown): boolean => (err as { name?: unknown } | null)?.name === 'AbortError';

function normalizeError(err: unknown, status: number): never {
  if (isAbortError(err) || err instanceof ConsoleInvokeError) throw err;
  throw new ConsoleInvokeError(String(err), status);
}

async function send(path: string, init: RequestInit, opts?: RequestOptions): Promise<Response> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: { ...languageHeaders(), ...(init.headers as Record<string, string> | undefined) },
      ...(opts?.signal ? { signal: opts.signal } : {}),
      ...(opts?.keepalive ? { keepalive: true } : {}),
    });
    // the login expired: the page reloads and the console answers with its login page
    if (res.status === 401 && res.headers.get(AUTH_HEADER) !== null) location.reload();
    return res;
  } catch (err) {
    normalizeError(err, 0);
  }
}

async function readText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch (err) {
    normalizeError(err, res.status);
  }
}

async function throwHttpError(res: Response): Promise<never> {
  const text = await readText(res);
  let message = `HTTP ${res.status}`;
  try {
    const err = (JSON.parse(text) as { error?: unknown } | null)?.error;
    if (typeof err === 'string' && err !== '') message = err;
  } catch {
    if (text.trim() !== '') message = S.httpStatus(res.status, snippet(text));
  }
  throw new ConsoleInvokeError(message, res.status);
}

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) await throwHttpError(res);
  if (res.status === 204) return null as T;
  const text = await readText(res);
  if (text.trim() === '') return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ConsoleInvokeError(S.notJson(res.status, snippet(text)), res.status);
  }
}

async function readBlob(res: Response): Promise<Blob> {
  if (!res.ok) await throwHttpError(res);
  try {
    return await res.blob();
  } catch (err) {
    normalizeError(err, res.status);
  }
}

export async function get<T>(path: string, opts?: RequestOptions): Promise<T> {
  return readJson<T>(await send(path, { method: 'GET' }, opts));
}

export async function post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  return readJson<T>(await send(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }, opts));
}

/** Uploads a binary body. */
export async function postBlob<T>(path: string, body: Blob, opts?: RequestOptions): Promise<T> {
  return readJson<T>(await send(path, {
    method: 'POST',
    headers: { 'Content-Type': body.type || 'application/octet-stream' },
    body,
  }, opts));
}

/** Writes keys of one config group; the server checks them against the group's schema. Answers with the server's receipt. */
export async function setConfig(groupId: string, values: Record<string, unknown>, opts?: RequestOptions): Promise<string> {
  const response = await post<{ result?: string }>('/api/config', { group: groupId, values }, opts);
  return response.result || groupId;
}

/** Calls a panel method: POST `{ args }`. */
export function invokePanel<T>(pageId: string, panelId: string, method: string, args?: unknown[], opts?: RequestOptions): Promise<T> {
  return post<T>(panelRoute(pageId, panelId, method), { args: args ?? [] }, opts);
}

/** The same, for a method that answers with bytes (audio, images). */
export async function invokePanelBinary(pageId: string, panelId: string, method: string, args?: unknown[], opts?: RequestOptions): Promise<Blob> {
  return readBlob(await send(panelRoute(pageId, panelId, method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args: args ?? [] }),
  }, opts));
}

/** Opens a path picker on the machine that runs Core (`POST /api/path-picker`); null when it was cancelled. */
export async function pickPath(options: PathPickerOptions, opts?: RequestOptions): Promise<string | null> {
  return (await post<{ path: string | null }>('/api/path-picker', options, opts)).path;
}

/** Every page's declaration (`GET /api/webui/manifest`). */
export function fetchManifest(opts?: RequestOptions): Promise<WebUiManifest> {
  return get<WebUiManifest>('/api/webui/manifest', opts);
}
