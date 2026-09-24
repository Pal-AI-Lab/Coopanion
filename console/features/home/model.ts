/**
 * The DeepSeek key as the home page handles it: read whether the `deepseek` endpoint
 * is connected, save a key to it, test it, and resume the run that started paused without one.
 */
import { get, post } from '../../core/api.ts';

export const ENDPOINT = 'deepseek';
export const KEY_URL = 'https://platform.deepseek.com/api_keys';

export interface Status { loop?: { paused?: boolean }; modelConnection?: { ready: boolean; model: string | null; moduleTitle: string } | null }
export interface Detail { name: string; entry: Record<string, unknown>; revision: string; secretConfigured?: 'none' | 'env' | 'file' }
export interface TestResult { ok: boolean; ms: number | null; why: string | null }

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function readDetail(signal?: AbortSignal): Promise<Detail | null> {
  try {
    return await get<Detail>(`/api/providers/${ENDPOINT}`, { signal });
  } catch {
    return null;
  }
}

export const readStatus = (signal?: AbortSignal) => get<Status>('/api/status', { signal });

/** Ready to talk: the active endpoint answers and the DeepSeek key is set. */
export const keyConnected = (st: Status | null, detail: Detail | null): boolean =>
  !!st?.modelConnection?.ready && !!detail?.secretConfigured && detail.secretConfigured !== 'none';

export async function testKey(signal?: AbortSignal): Promise<TestResult> {
  try {
    const r = await post<{ ok?: boolean; elapsedMs?: number; error?: string; status?: number; hint?: string }>(`/api/providers/${ENDPOINT}/test`, {}, { signal });
    const ok = r?.ok !== false && !r?.error;
    return {
      ok,
      ms: typeof r?.elapsedMs === 'number' ? Math.round(r.elapsedMs) : null,
      why: ok ? null : r?.hint ?? r?.error ?? `HTTP ${r?.status ?? '?'}`,
    };
  } catch (err) {
    return { ok: false, ms: null, why: errText(err) };
  }
}

/** Saves the key (throws when it cannot), tests it, and resumes the run once the test passes. */
export async function saveKey(key: string, detail: Detail | null, signal?: AbortSignal): Promise<TestResult> {
  const d = detail ?? await get<Detail>(`/api/providers/${ENDPOINT}`, { signal });
  await post(`/api/providers/${ENDPOINT}/save`, { name: d.name, entry: d.entry, expectedRevision: d.revision, secretValue: key }, { signal });
  const result = await testKey(signal);
  if (result.ok) await post('/api/run/resume', {}, { signal });
  return result;
}
