/**
 * Connecting a service through a Cortico console's provider routes, as the app's guide and its
 * Start page do: each service gets its own endpoint for each of its platforms (`endpointName`), so
 * switching back and forth keeps each key. `call` is the caller's way to reach the console (fetch in the Core, the
 * console's own api in the browser); nothing here imports Node or the DOM.
 */
import { endpointName, locate, vendorEntry, type Region, type Vendor } from './vendors.ts';

/** GET when `body` is left out, POST otherwise; throws on an error status. */
export type ConsoleCall = <T>(path: string, body?: unknown) => Promise<T>;

export interface Connection {
  /** The active endpoint has its model and key and its module is available. */
  ready: boolean;
  /** Which service the active endpoint is, when it is one of these. */
  vendor: Vendor | null;
  /** Which of the service's platforms; null for a service with one platform. */
  region: Region | null;
  model: string;
}

export interface ConnectResult { ok: boolean; why: string | null; ms: number | null }

interface Status { modelConnection?: { ready: boolean; model: string | null; baseUrl?: string } | null }
interface Detail { name: string; entry: Record<string, unknown>; revision: string }
interface TestReply { ok?: boolean; elapsedMs?: number; error?: string; status?: number; hint?: string }

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function currentConnection(call: ConsoleCall): Promise<Connection> {
  const mc = (await call<Status>('/api/status').catch(() => null))?.modelConnection;
  const at = locate(mc?.baseUrl);
  return { ready: !!mc?.ready, vendor: at?.vendor ?? null, region: at?.region ?? null, model: mc?.model ?? '' };
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
 * Saves `key` and `model` for `vendor` on `region` (creating its endpoint the first time), tests it,
 * and once the test passes makes it the active endpoint and resumes the run, which starts paused
 * without a key. An empty `key` keeps the one the endpoint has; a new endpoint needs one. An empty
 * `model` keeps the endpoint's model, or takes the service's default for a new endpoint. `region`
 * matters only for a service with a platform per region.
 */
export async function connectVendor(call: ConsoleCall, vendor: Vendor, key: string, model = '', region: Region = 'cn'): Promise<ConnectResult> {
  const secretValue = key.trim() || undefined;
  const typed = model.trim();
  const name = endpointName(vendor, region);
  try {
    const list = await call<{ providers: Array<{ name: string }> }>('/api/providers');
    if (list.providers.some((p) => p.name === name)) {
      const d = await call<Detail>(`/api/providers/${encodeURIComponent(name)}`);
      const entry = { ...d.entry };
      if (typed) {
        entry.spec = { ...(d.entry.spec as Record<string, unknown> | undefined), model: typed };
        entry.multimodal = (vendor.vision ?? []).includes(typed);
      }
      await call(`/api/providers/${encodeURIComponent(name)}/save`, { name: d.name, entry, expectedRevision: d.revision, secretValue });
    } else {
      await call('/api/providers', { name, entry: vendorEntry(vendor, typed || vendor.model, region), secretValue });
    }
  } catch (err) {
    return { ok: false, ms: null, why: errText(err) };
  }
  const r = await testEndpoint(call, name);
  if (!r.ok) return r;
  try {
    await call(`/api/providers/${encodeURIComponent(name)}/activate`, {});
    await call('/api/run/resume', {});
  } catch (err) {
    return { ok: false, ms: r.ms, why: errText(err) };
  }
  return r;
}
