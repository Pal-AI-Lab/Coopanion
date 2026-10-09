/**
 * 字标下面那一行:当前版本与项目地址;GitHub 上最新的正式 Release 比当前版本新时,再多一行去下载的链接。
 * 版本号由 scripts/stage.ts 从 package.json 写进 app-version.ts。查询失败就只显示当前版本。
 */
import { APP_VERSION } from '../app-version.ts';
import { S } from './strings.ts';

export const REPO_URL = 'https://github.com/Pal-AI-Lab/Coopanion';
const RELEASE_API = 'https://api.github.com/repos/Pal-AI-Lab/Coopanion/releases/latest';
/** 与 Cortico 控制台查框架 Release 同一时限。 */
const RELEASE_TIMEOUT_MS = 15_000;

export interface ReleaseUpdate { version: string; url: string }

function versionParts(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

export function isNewer(latest: string, current: string): boolean {
  const left = versionParts(latest);
  const right = versionParts(current);
  if (!left || !right) return false;
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i]! > right[i]!;
  }
  return false;
}

/** 一次启动只查一次;左栏换模式重建时复用同一个结果。 */
let pending: Promise<ReleaseUpdate | null> | null = null;

export function checkRelease(): Promise<ReleaseUpdate | null> {
  pending ??= fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(RELEASE_TIMEOUT_MS) })
    .then((res) => (res.ok ? res.json() as Promise<{ tag_name?: unknown; html_url?: unknown }> : null))
    .then((release) => {
      if (typeof release?.tag_name !== 'string' || typeof release.html_url !== 'string') return null;
      const url = new URL(release.html_url);
      if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null;
      return isNewer(release.tag_name, APP_VERSION) ? { version: release.tag_name.replace(/^v/, ''), url: url.href } : null;
    })
    .catch(() => null);
  return pending;
}

function link(doc: Document, className: string, text: string, href: string): HTMLAnchorElement {
  const a = doc.createElement('a');
  a.className = className;
  a.textContent = text;
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/** 把版本行放进字标容器;有新版本时在它下面补上下载链接。 */
export function mountRelease(doc: Document, brand: Element, signal: AbortSignal): void {
  const repo = link(doc, 'companion-version', `v${APP_VERSION} · GitHub`, REPO_URL);
  repo.title = S.repoHint;
  brand.appendChild(repo);
  void checkRelease().then((update) => {
    if (signal.aborted || !update) return;
    brand.appendChild(link(doc, 'release-hint', S.update(update.version), update.url));
  });
}
