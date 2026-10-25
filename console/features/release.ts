/** Title-bar version link and update status. Native builds use the updater bridge;
 * other builds check GitHub. Steam manages its own updates.
 */
import { APP_CHANNEL, APP_VERSION } from '../app-version.ts';
import { S } from './strings.ts';

const REPO_URL = 'https://github.com/Pal-AI-Lab/Coopanion';
const RELEASES_URL = `${REPO_URL}/releases/latest`;

/** 更新器的一步(app/updater.cjs)。 */
export interface UpdateStep { phase: 'downloading' | 'ready' | 'failed'; version: string }
declare global {
  interface Window {
    /** 只在能自己更新的版本里有:上一步(还没有就是 null),以及订阅之后每一步、返回退订。 */
    coopanionUpdate?: { step(): UpdateStep | null; onStep(listener: (step: UpdateStep) => void): () => void };
  }
}
const RELEASE_API = 'https://api.github.com/repos/Pal-AI-Lab/Coopanion/releases/latest';
/** 与 Cortico WebUI 查框架 Release 同一时限。 */
const RELEASE_TIMEOUT_MS = 15_000;

interface ReleaseUpdate { version: string; url: string }

function versionParts(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

function isNewer(latest: string, current: string): boolean {
  const left = versionParts(latest);
  const right = versionParts(current);
  if (!left || !right) return false;
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i]! > right[i]!;
  }
  return false;
}

/** Share one release check across mounts. */
let pending: Promise<ReleaseUpdate | null> | null = null;

function checkRelease(): Promise<ReleaseUpdate | null> {
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

function stepHint(doc: Document, step: UpdateStep): HTMLElement {
  if (step.phase === 'failed') {
    const hint = link(doc, 'release-hint', S.updateFailedShort(step.version), RELEASES_URL);
    hint.title = S.updateFailed(step.version);
    hint.setAttribute('aria-label', hint.title);
    return hint;
  }
  const hint = doc.createElement('span');
  hint.className = 'release-hint';
  hint.textContent = step.phase === 'downloading' ? S.updateDownloadingShort(step.version) : S.updateReadyShort(step.version);
  hint.title = step.phase === 'downloading' ? S.updateDownloading(step.version) : S.updateReady(step.version);
  hint.setAttribute('aria-label', hint.title);
  return hint;
}

export function mountRelease(doc: Document, container: Element, signal: AbortSignal): void {
  const repo = link(doc, 'companion-version', `v${APP_VERSION} - GitHub`, REPO_URL);
  repo.title = S.repoHint;
  container.appendChild(repo);
  if (APP_CHANNEL === 'steam') return;
  const status = doc.createElement('div');
  status.className = 'companion-update';
  status.setAttribute('role', 'status');
  container.append(status);
  const updater = doc.defaultView?.coopanionUpdate;
  if (updater) {
    const show = (step: UpdateStep | null) => {
      if (!step) return;
      const hint = stepHint(doc, step);
      status.replaceChildren(hint);
    };
    show(updater.step());
    const stop = updater.onStep(show);
    signal.addEventListener('abort', stop, { once: true });
    return;
  }
  void checkRelease().then((update) => {
    if (signal.aborted || !update) return;
    const hint = link(doc, 'release-hint', S.updateShort(update.version), update.url);
    hint.title = S.update(update.version);
    hint.setAttribute('aria-label', hint.title);
    status.append(hint);
  });
}
