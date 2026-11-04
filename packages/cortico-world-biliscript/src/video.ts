/** Bilibili video references: what the transcribe tool accepts and the URL handed to the worker. */

export interface VideoRef {
  /** `BV…` or `av…`. */
  id: string;
  /** Part number, from 1. */
  page: number;
  url: string;
}

const BV_RE = /\bBV[0-9A-Za-z]{10}\b/;
const AV_RE = /(?:^|[^0-9A-Za-z])av(\d+)\b/i;
const SHORT_HOSTS = new Set(['b23.tv', 'bili2233.cn']);

export function videoUrl(id: string, page: number): string {
  return `https://www.bilibili.com/video/${id}/${page > 1 ? `?p=${page}` : ''}`;
}

/** BV id, av id, or a video page URL; `page` wins over a `p` query in the URL. Null when none is found. */
export function parseVideoRef(input: string, page?: number): VideoRef | null {
  const text = input.trim();
  const bv = BV_RE.exec(text);
  const av = bv ? null : AV_RE.exec(text);
  const id = bv ? bv[0] : av ? `av${av[1]}` : null;
  if (!id) return null;
  let p = page;
  if (p === undefined) {
    const q = /[?&]p=(\d+)/.exec(text);
    p = q ? Number(q[1]) : 1;
  }
  const n = Math.max(1, Math.floor(p));
  return { id, page: n, url: videoUrl(id, n) };
}

/** A b23.tv-style short link, which has to be followed before it names a video. */
export function isShortLink(input: string): boolean {
  try {
    const host = new URL(input.trim()).hostname.toLowerCase();
    return SHORT_HOSTS.has(host);
  } catch {
    return false;
  }
}

/** Follows one redirect of a short link and returns its target. */
export async function resolveShortLink(input: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(input.trim(), { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  const location = res.headers.get('location');
  if (!location) throw new Error(`${input} answered ${res.status} without a redirect`);
  return location;
}
