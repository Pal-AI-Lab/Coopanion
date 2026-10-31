import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/** `host/` is plain CommonJS outside the TypeScript project: the rule is reached through this facade. */
const require_ = createRequire(import.meta.url);
interface AppKit { frontmost(): string | null; orderBack(handle: Buffer): void }
interface Workspace {
  subscribeWorkspaceNotification(event: string, callback: () => void): number;
  unsubscribeWorkspaceNotification(id: number): void;
}
const { APP_STORE, createAppStoreRule } = require_('../host/app-store.cjs') as {
  APP_STORE: string;
  createAppStoreRule(options: {
    window: unknown;
    level: string;
    platform?: string;
    workspace?: Workspace;
    loadAppKit?: () => AppKit;
    onError?: (error: Error) => void;
  }): { stop(): void } | null;
};

const LEVEL = 'floating';

/** A window on the screen's stack: its level, and whether it is at the back of that level. */
class FakeWindow extends EventEmitter {
  visible = true;
  level: string | null = LEVEL;
  atBack = false;
  readonly handle = Buffer.alloc(8);
  isVisible() { return this.visible; }
  setAlwaysOnTop(flag: boolean, level: string) { this.level = flag ? level : null; }
  getNativeWindowHandle() { return this.handle; }
  showInactive() { this.visible = true; this.atBack = false; this.emit('show'); }
  hide() { this.visible = false; }
}

/** The system: which application is active, its activation notifications, and AppKit's ordering. */
function setup(window = new FakeWindow(), initial: string | null = 'com.example.Editor') {
  let front = initial;
  const listeners = new Map<number, () => void>();
  let next = 1;
  const workspace: Workspace = {
    subscribeWorkspaceNotification: (_event, callback) => { listeners.set(next, callback); return next++; },
    unsubscribeWorkspaceNotification: (id) => { listeners.delete(id); },
  };
  const appKit: AppKit = {
    frontmost: () => front,
    // AppKit orders a hidden window in when it is sent back
    orderBack: (handle) => { if (handle === window.handle) { window.visible = true; window.atBack = true; } },
  };
  const rule = createAppStoreRule({ window, level: LEVEL, platform: 'darwin', workspace, loadAppKit: () => appKit })!;
  const activate = (bundle: string | null) => { front = bundle; for (const listener of listeners.values()) listener(); };
  return { window, rule, activate };
}

describe('App Store rule', () => {
  it('sits behind every window while App Store is active and floats again after', () => {
    const { window, activate } = setup();
    expect(window.level).toBe(LEVEL);
    activate(APP_STORE);
    expect(window.level).toBeNull();
    expect(window.atBack).toBe(true);
    activate('com.example.Editor');
    expect(window.level).toBe(LEVEL);
  });

  it('starts behind the other windows when App Store is already active', () => {
    const window = new FakeWindow();
    window.visible = false;
    setup(window, APP_STORE);
    expect(window.level).toBeNull();
    window.showInactive();
    expect(window.atBack).toBe(true);
  });

  it('sends a window shown while App Store is active back again', () => {
    const { window, activate } = setup();
    activate(APP_STORE);
    window.hide();
    window.showInactive();
    expect(window.atBack).toBe(true);
  });

  it('leaves a hidden window hidden', () => {
    const { window, activate } = setup();
    window.hide();
    activate(APP_STORE);
    expect(window.visible).toBe(false);
  });

  it('treats an activation without a bundle identifier as another application', () => {
    const { window, activate } = setup();
    activate(APP_STORE);
    activate(null);
    expect(window.level).toBe(LEVEL);
  });

  it('ignores activations and showing after it stops', () => {
    const { window, rule, activate } = setup();
    rule.stop();
    activate(APP_STORE);
    window.showInactive();
    expect(window.level).toBe(LEVEL);
    expect(window.atBack).toBe(false);
  });

  it('keeps the window floating off macOS or without AppKit', () => {
    const window = new FakeWindow();
    expect(createAppStoreRule({ window, level: LEVEL, platform: 'win32' })).toBeNull();
    const errors: Error[] = [];
    const workspace: Workspace = { subscribeWorkspaceNotification: () => 0, unsubscribeWorkspaceNotification: () => {} };
    const rule = createAppStoreRule({ window, level: LEVEL, platform: 'darwin', workspace,
      loadAppKit: () => { throw new Error('no AppKit'); }, onError: (error) => errors.push(error) });
    expect(rule).toBeNull();
    expect(errors).toHaveLength(1);
    expect(window.level).toBe(LEVEL);
  });
});
