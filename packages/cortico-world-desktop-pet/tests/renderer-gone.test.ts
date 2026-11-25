import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/** `host/` is plain CommonJS outside the TypeScript project: the watcher is reached through this facade. */
const require_ = createRequire(import.meta.url);
interface WatchOpts { name: string; log: (line: string) => void; sandboxed: boolean; onSandboxFailure?: () => void; platform?: string }
const { watchRenderer } = require_('../host/renderer-gone.cjs') as {
  watchRenderer(contents: EventEmitter, opts: WatchOpts): void;
};

/** A window's contents with its renderer ends recorded, as watchRenderer sees them. */
function watched(opts: Partial<WatchOpts> = {}) {
  const contents = new EventEmitter();
  const lines: string[] = [];
  let failures = 0;
  watchRenderer(contents, { name: '设置窗口', log: (line) => lines.push(line), sandboxed: true, platform: 'win32', onSandboxFailure: () => { failures += 1; }, ...opts });
  const gone = (reason: string, exitCode = -2147483645) => contents.emit('render-process-gone', {}, { reason, exitCode });
  const load = () => contents.emit('did-finish-load');
  return { lines, failures: () => failures, gone, load };
}

describe('watching a window renderer', () => {
  it('logs each end with its reason and the exit code in hex on Windows', () => {
    const w = watched();
    w.gone('crashed');
    expect(w.lines).toEqual(['设置窗口的渲染进程退出：crashed（退出码 0x80000003），页面还没加载完']);
  });

  it('reports a sandbox failure for a renderer that ended before its page loaded', () => {
    const w = watched();
    w.gone('crashed');
    w.gone('launch-failed');
    expect(w.failures()).toBe(2);
  });

  it('does not report a renderer that ended after its page loaded, and judges the next renderer afresh', () => {
    const w = watched();
    w.load();
    w.gone('crashed');
    expect(w.failures()).toBe(0);
    w.gone('crashed');
    expect(w.failures()).toBe(1);
  });

  it('does not report a renderer that was killed or exited cleanly', () => {
    const w = watched();
    w.gone('killed', 1);
    w.gone('clean-exit', 0);
    expect(w.failures()).toBe(0);
    expect(w.lines).toHaveLength(2);
  });

  it('does not report without the sandbox or off Windows', () => {
    const unsandboxed = watched({ sandboxed: false });
    unsandboxed.gone('crashed');
    const linux = watched({ platform: 'linux' });
    linux.gone('crashed', 139);
    expect([unsandboxed.failures(), linux.failures()]).toEqual([0, 0]);
    expect(linux.lines[0]).toContain('退出码 139');
  });
});
