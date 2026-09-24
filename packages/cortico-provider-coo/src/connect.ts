/**
 * Connecting a service through a Cortico console's provider routes, as the app's guide and its
 * Start page do: each service gets its own endpoint, named by the service's id, so switching back
 * and forth keeps each key. `call` is the caller's way to reach the console (fetch in the Core, the
 * console's own api in the browser); nothing here imports Node or the DOM.
 */
import { vendorEntry, vendorOf, type Vendor } from './vendors.ts';

/** GET when `body` is left out, POST otherwise; throws on an error status. */
export type ConsoleCall = <T>(path: string, body?: unknown) => Promise<T>;

export interface Connection {
  /** The active endpoint has its model and key and its module is available. */
  ready: boolean;
  /** Which service the active endpoint is, when it is one of these. */
  vendor: Vendor | null;
  model: string;
}

export interface ConnectResult { ok: boolean; why: string | null; ms: number | null }

interface Status { modelConnection?: { ready: boolean; model: string | null; baseUrl?: string } | null }
interface Detail { name: string; entry: Record<string, unknown>; revision: string }
interface TestReply { ok?: boolean; elapsedMs?: number; error?: string; status?: number; hint?: string }

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function currentConnection(call: ConsoleCall): Promise<Connection> {
  const mc = (await call<Status>('/api/status').catch(() => null))?.modelConnection;
  return { ready: !!mc?.ready, vendor: mc?.baseUrl ? vendorOf(mc.baseUrl) : null, model: mc?.model ?? '' };
}

/** Tests the endpoint `name` as it is saved. */
export async function testEndpoint(call: ConsoleCall, name: string): Promise<ConnectResult> {
  try {
    const r = await call<TestReply>(`/api/providers/${encodeURIComponent(name)}/test`, {});
    const ok = r?.ok !== false && !r?.error;
    return { ok, ms: typeof r?.elapsedMs === 'number' ? Math.round(r.elapsedMs) : null, why: ok ? null : r?.hint ?? r?.error ?? `HTTP ${r?.status ?? '?'}` };
  } catch (err) {
    return { ok: false, ms: null, why: errText(err) };
  }
}

/**
 * Saves `key` for `vendor` (creating its endpoint the first time), tests it, and once the test
 * passes makes it the active endpoint and resumes the run, which starts paused without a key.
 */
export async function connectVendor(call: ConsoleCall, vendor: Vendor, key: string): Promise<ConnectResult> {
  try {
    const list = await call<{ providers: Array<{ name: string }> }>('/api/providers');
    if (list.providers.some((p) => p.name === vendor.id)) {
      const d = await call<Detail>(`/api/providers/${encodeURIComponent(vendor.id)}`);
      await call(`/api/providers/${encodeURIComponent(vendor.id)}/save`, { name: d.name, entry: d.entry, expectedRevision: d.revision, secretValue: key });
    } else {
      await call('/api/providers', { name: vendor.id, entry: vendorEntry(vendor), secretValue: key });
    }
  } catch (err) {
    return { ok: false, ms: null, why: errText(err) };
  }
  const r = await testEndpoint(call, vendor.id);
  if (!r.ok) return r;
  try {
    await call(`/api/providers/${encodeURIComponent(vendor.id)}/activate`, {});
    await call('/api/run/resume', {});
  } catch (err) {
    return { ok: false, ms: r.ms, why: errText(err) };
  }
  return r;
}
