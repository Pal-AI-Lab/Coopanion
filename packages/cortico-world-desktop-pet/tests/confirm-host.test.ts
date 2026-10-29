import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

interface Request {
  id: string;
  question: string;
  caption: string;
  options: string[];
}

interface Confirmations {
  ask(request: unknown): Promise<number | null>;
  hidden(): void;
  focused(): boolean;
  watchPet(pet: FakeWindow): void;
  answerBubble(id: string, index: unknown): void;
  state(sender: unknown): Request | null;
  answerWindow(sender: unknown, index: unknown): void;
  close(id: string): void;
  closeAll(): void;
}

interface WindowOptions {
  show?: boolean;
  [key: string]: unknown;
}

class FakeWebContents extends EventEmitter {
  openHandler: (() => { action: string }) | null = null;

  setWindowOpenHandler(handler: () => { action: string }): void {
    this.openHandler = handler;
  }
}

/** Destroying a window emits closed synchronously, including during answer handling. */
class FakeWindow extends EventEmitter {
  readonly webContents = new FakeWebContents();
  private visible: boolean;
  private destroyed = false;
  private focused = false;
  showCount = 0;
  destroyCount = 0;
  url: string | null = null;
  workspaces: { on: boolean; visibleOnFullScreen?: boolean; skipTransformProcessType?: boolean } | null = null;

  constructor(readonly options: WindowOptions = {}) {
    super();
    this.visible = options.show !== false;
  }

  isVisible(): boolean { return this.visible; }
  isDestroyed(): boolean { return this.destroyed; }
  isFocused(): boolean { return this.focused; }
  getBounds() { return { x: 100, y: 50, width: 1200, height: 800 }; }

  focus(): void {
    if (!this.visible || this.destroyed) return;
    this.focused = true;
    this.emit('focus');
  }

  blur(): void {
    this.focused = false;
    this.emit('blur');
  }

  hide(): void {
    if (!this.visible || this.destroyed) return;
    this.visible = false;
    this.blur();
    this.emit('hide');
  }

  show(): void {
    if (this.destroyed) throw new Error('Cannot show a destroyed window');
    this.showCount++;
    this.visible = true;
    this.focus();
    this.emit('show');
  }

  destroy(): void {
    if (this.destroyed) throw new Error('Window destroyed twice');
    this.destroyCount++;
    this.close();
  }

  showInactive(): void {
    if (this.destroyed) throw new Error('Cannot show a destroyed window');
    this.showCount++;
    this.visible = true;
    this.emit('show');
  }

  close(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.visible = false;
    this.blur();
    this.webContents.emit('destroyed');
    this.emit('closed');
  }

  loadURL(url: string): Promise<void> {
    this.url = url;
    return Promise.resolve();
  }

  setVisibleOnAllWorkspaces(on: boolean, options: { visibleOnFullScreen?: boolean; skipTransformProcessType?: boolean }): void {
    this.workspaces = { on, ...options };
  }
}

const { createConfirmations } = createRequire(import.meta.url)('../host/confirm.cjs') as {
  createConfirmations(options: {
    BrowserWindow: new (options: WindowOptions) => FakeWindow;
    screen: { getDisplayMatching(bounds: unknown): { workArea: Area }; getPrimaryDisplay(): { workArea: Area } };
    getPet(): FakeWindow | null;
    origin: string;
    onStandalone(id: string): void;
    platform: NodeJS.Platform;
  }): Confirmations;
};

const cleanup: Confirmations[] = [];
afterEach(() => {
  for (const controller of cleanup.splice(0)) controller.closeAll();
});

function request(id = 'permission'): Request {
  return { id, question: 'May I use the computer?', caption: 'Permission', options: ['Allow', 'Deny'] };
}

interface Area { x: number; y: number; width: number; height: number }
function setup({ visible = true, platform = 'win32' as NodeJS.Platform,
  area = { x: 0, y: 0, width: 1920, height: 1040 }, noPet = false } = {}) {
  const pet = new FakeWindow({ show: visible });
  const windows: FakeWindow[] = [];
  const standalone: string[] = [];
  class ApprovalWindow extends FakeWindow {
    constructor(options: WindowOptions) {
      super(options);
      windows.push(this);
    }
  }
  const controller = createConfirmations({
    BrowserWindow: ApprovalWindow, getPet: () => noPet ? null : pet,
    screen: { getDisplayMatching: () => ({ workArea: area }),
      getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }) },
    origin: 'http://127.0.0.1:8123', platform,
    onStandalone: id => standalone.push(id),
  });
  pet.on('hide', () => controller.hidden());
  cleanup.push(controller);
  const ask = (input: unknown = request()) => {
    const answers: Array<number | null> = [];
    const result = controller.ask(input).then(index => { answers.push(index); return index; });
    return { result, answers };
  };
  return { controller, pet, windows, standalone, ask };
}

describe('createConfirmations', () => {
  it.each([
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: -1920, y: 40, width: 1920, height: 1040 },
    { x: 1980, y: -1080, width: 1860, height: 1080 },
    { x: 0, y: 0, width: 400, height: 280 },
  ])('keeps the card inside the pet display work area %j', async area => {
    const { windows, ask, controller } = setup({ visible: false, area });
    const answer = ask();
    const win = windows[0]!;
    const { x, y, width, height } = win.options as unknown as Area;
    expect(x).toBeGreaterThanOrEqual(area.x + 16);
    expect(y).toBeGreaterThanOrEqual(area.y + 16);
    expect(x + width).toBe(area.x + area.width - 16);
    expect(y + height).toBe(area.y + area.height - 16);
    win.emit('ready-to-show');
    expect(win.isVisible()).toBe(true);
    expect(win.isFocused()).toBe(false);
    controller.close('permission');
    expect(await answer.result).toBeNull();
  });

  it('uses the primary display if the pet window is absent', async () => {
    const { windows, ask, controller } = setup({ noPet: true,
      area: { x: -1920, y: 0, width: 1920, height: 1040 } });
    const answer = ask();
    expect(windows[0]!.options).toMatchObject({ x: 1484, y: 776, width: 420, height: 248 });
    controller.close('permission');
    expect(await answer.result).toBeNull();
  });

  it('reports standalone focus from the actual window until it blurs or closes', async () => {
    const { controller, windows, ask } = setup({ visible: false });
    expect(controller.focused()).toBe(false);
    const answer = ask();
    const win = windows[0]!;
    expect(controller.focused()).toBe(false);
    win.emit('ready-to-show');
    expect(win.isVisible()).toBe(true);
    expect(controller.focused()).toBe(false);
    win.focus();
    expect(controller.focused()).toBe(true);
    win.blur();
    expect(win.isVisible()).toBe(true);
    expect(controller.focused()).toBe(false);
    win.focus();
    expect(controller.focused()).toBe(true);
    controller.close('permission');
    expect(await answer.result).toBeNull();
    expect(controller.focused()).toBe(false);
  });

  it('does not treat focus on the pet bubble as standalone focus', async () => {
    const { controller, pet, windows, ask } = setup();
    pet.focus();
    const answer = ask();
    expect(pet.isFocused()).toBe(true);
    expect(windows).toHaveLength(0);
    expect(controller.focused()).toBe(false);
    controller.answerBubble('permission', 0);
    expect(await answer.result).toBe(0);
    expect(controller.focused()).toBe(false);
  });

  const pageExits = [
    { label: 'renderer termination', event: 'render-process-gone', args: [{}, { reason: 'crashed', exitCode: 1 }] },
    { label: 'web contents destruction', event: 'destroyed', args: [] },
    { label: 'main-frame document navigation', event: 'did-start-navigation',
      args: [{ url: 'http://127.0.0.1:8123/pet', isSameDocument: false, isMainFrame: true, frame: null }] },
  ];

  it.each(pageExits.flatMap(exit => [false, true].map(shown => ({ ...exit, shown }))))(
    'revokes bubble and standalone requests once on pet $label with card shown=$shown', async ({ event, args, shown }) => {
      const { controller, pet, windows, ask } = setup({ visible: false });
      controller.watchPet(pet);
      const standalone = ask(request('standalone'));
      const win = windows[0]!;
      if (shown) win.emit('ready-to-show');
      expect(win.isVisible()).toBe(shown);
      pet.show();
      const bubble = ask(request('bubble'));

      pet.webContents.emit(event, ...args);
      pet.webContents.emit(event, ...args);
      win.emit('ready-to-show');
      controller.answerWindow(win.webContents, 0);
      controller.answerBubble('bubble', 0);
      pet.hide();

      expect(await standalone.result).toBeNull();
      expect(await bubble.result).toBeNull();
      expect(standalone.answers).toEqual([null]);
      expect(bubble.answers).toEqual([null]);
      expect(win.isDestroyed()).toBe(true);
      expect(win.destroyCount).toBe(1);
      expect(win.showCount).toBe(shown ? 1 : 0);
      expect(controller.state(win.webContents)).toBeNull();
      expect(controller.focused()).toBe(false);
      expect(windows).toHaveLength(1);
    });

  it.each([
    { isSameDocument: true, isMainFrame: true },
    { isSameDocument: false, isMainFrame: false },
    { isSameDocument: true, isMainFrame: false },
  ])('preserves requests on navigation with sameDocument=$isSameDocument mainFrame=$isMainFrame', async ({ isSameDocument, isMainFrame }) => {
    const { controller, pet, windows, ask } = setup({ visible: false });
    controller.watchPet(pet);
    const answer = ask();
    const win = windows[0]!;

    pet.webContents.emit('did-start-navigation', { url: 'http://127.0.0.1:8123/pet#same', isSameDocument, isMainFrame, frame: null });
    await Promise.resolve();
    expect(answer.answers).toEqual([]);
    expect(win.isDestroyed()).toBe(false);
    expect(controller.state(win.webContents)).toEqual(request());
    controller.answerWindow(win.webContents, 0);
    expect(await answer.result).toBe(0);
  });

  it('accepts a new document request after revoking the previous document', async () => {
    const { controller, pet, ask } = setup();
    controller.watchPet(pet);
    const old = ask(request('old'));
    pet.webContents.emit('did-start-navigation', { url: 'http://127.0.0.1:8123/pet', isSameDocument: false, isMainFrame: true, frame: null });
    expect(await old.result).toBeNull();

    const current = ask(request('current'));
    controller.answerBubble('old', 0);
    expect(current.answers).toEqual([]);
    controller.answerBubble('current', 0);
    expect(await current.result).toBe(0);
    expect(old.answers).toEqual([null]);
  });

  it('leaves a visible pet question in its bubble without opening a window', async () => {
    const { controller, pet, windows, standalone, ask } = setup();
    const answer = ask();
    await Promise.resolve();

    expect(answer.answers).toEqual([]);
    expect(windows).toHaveLength(0);
    expect(standalone).toEqual([]);
    expect(pet.isVisible()).toBe(true);
    controller.answerBubble('permission', 0);
    expect(await answer.result).toBe(0);
    controller.hidden();
    expect(windows).toHaveLength(0);
  });

  it('migrates on hide exactly once and shows only the approval window', async () => {
    const { controller, pet, windows, standalone, ask } = setup();
    const answer = ask();
    pet.hide();
    controller.hidden();
    controller.hidden();

    expect(windows).toHaveLength(1);
    expect(standalone).toEqual(['permission']);
    const win = windows[0]!;
    expect(controller.state(win.webContents)).toEqual(request());
    expect(win.isVisible()).toBe(false);
    expect(win.url).toBe('http://127.0.0.1:8123/confirm');
    win.emit('ready-to-show');
    expect(win.isVisible()).toBe(true);
    expect(pet.isVisible()).toBe(false);
    expect(pet.showCount).toBe(0);
    controller.answerWindow(win.webContents, 1);
    expect(await answer.result).toBe(1);
    expect(pet.isVisible()).toBe(false);
  });

  it('creates an approval window immediately when the pet is already hidden', async () => {
    const { controller, pet, windows, standalone, ask } = setup({ visible: false });
    const answer = ask();

    expect(windows).toHaveLength(1);
    expect(standalone).toEqual(['permission']);
    const win = windows[0]!;
    win.emit('ready-to-show');
    expect(win.isVisible()).toBe(true);
    expect(pet.isVisible()).toBe(false);
    controller.answerWindow(win.webContents, 0);
    expect(await answer.result).toBe(0);
    expect(pet.showCount).toBe(0);
  });

  it('ignores late bubble approvals after migration even if the pet becomes visible again', async () => {
    const { controller, pet, windows, ask } = setup();
    const answer = ask();
    pet.hide();
    const win = windows[0]!;
    controller.answerBubble('permission', 0);
    pet.show();
    controller.answerBubble('permission', 0);
    await Promise.resolve();

    expect(answer.answers).toEqual([]);
    expect(controller.state(win.webContents)).toEqual(request());
    expect(win.isDestroyed()).toBe(false);
    controller.answerWindow(win.webContents, 1);
    expect(await answer.result).toBe(1);
  });

  it('rejects bubble approval when actual visibility has changed before hidden is handled', async () => {
    const { controller, pet, windows, ask } = setup();
    const answer = ask();
    pet.removeAllListeners('hide');
    pet.hide();
    controller.answerBubble('permission', 0);
    await Promise.resolve();

    expect(answer.answers).toEqual([]);
    expect(windows).toHaveLength(0);
    controller.hidden();
    controller.answerWindow(windows[0]!.webContents, 1);
    expect(await answer.result).toBe(1);
  });

  it('allows only the approval window sender to read and answer its question', async () => {
    const { controller, pet, windows, ask } = setup({ visible: false });
    const answer = ask();
    const win = windows[0]!;
    for (const sender of [pet.webContents, new FakeWebContents(), win, {}]) {
      expect(controller.state(sender)).toBeNull();
      controller.answerWindow(sender, 0);
    }
    await Promise.resolve();

    expect(answer.answers).toEqual([]);
    expect(controller.state(win.webContents)).toEqual(request());
    controller.answerWindow(win.webContents, 1);
    expect(await answer.result).toBe(1);
  });

  it.each([
    { label: 'yes', index: 0 },
    { label: 'no', index: 1 },
    { label: 'dismissed', index: null },
  ])('settles a correct window $label answer once and destroys its window', async ({ index }) => {
    const { controller, windows, ask } = setup({ visible: false });
    const answer = ask();
    const win = windows[0]!;

    controller.answerWindow(win.webContents, index);
    controller.answerWindow(win.webContents, 0);
    controller.answerBubble('permission', 0);
    controller.close('permission');
    win.emit('ready-to-show');

    expect(await answer.result).toBe(index);
    expect(answer.answers).toEqual([index]);
    expect(win.isDestroyed()).toBe(true);
    expect(win.destroyCount).toBe(1);
    expect(win.showCount).toBe(0);
    expect(controller.state(win.webContents)).toBeNull();
  });

  it.each([-1, 2, 0.5, '0', undefined])('treats invalid window answer %s as dismissal', async index => {
    const { controller, windows, ask } = setup({ visible: false });
    const answer = ask();
    controller.answerWindow(windows[0]!.webContents, index);
    expect(await answer.result).toBeNull();
    expect(windows[0]!.isDestroyed()).toBe(true);
  });

  it.each([1, 2])('preserves choice index %i for a three-option approval', async index => {
    const { controller, windows, ask } = setup({ visible: false });
    const answer = ask({ ...request(), options: ['Allow', 'Always allow', 'Deny'] });
    controller.answerWindow(windows[0]!.webContents, index);
    expect(await answer.result).toBe(index);
  });

  it('an approval window answers only its own pending question', async () => {
    const { controller, windows, ask } = setup({ visible: false });
    const first = ask(request('first'));
    const second = ask(request('second'));
    controller.answerWindow(windows[0]!.webContents, 0);
    expect(await first.result).toBe(0);
    expect(second.answers).toEqual([]);
    expect(windows[1]!.isDestroyed()).toBe(false);
    expect(controller.state(windows[1]!.webContents)?.id).toBe('second');
    controller.answerWindow(windows[0]!.webContents, 0);
    controller.answerWindow(windows[1]!.webContents, 1);
    expect(await second.result).toBe(1);
  });

  it.each([true, false])('close settles only the requested question with visible pet=%s', async visible => {
    const { controller, windows, ask } = setup({ visible });
    const first = ask(request('first'));
    const second = ask(request('second'));
    controller.close('missing');
    controller.close('first');
    controller.close('first');

    expect(await first.result).toBeNull();
    expect(first.answers).toEqual([null]);
    expect(second.answers).toEqual([]);
    if (!visible) {
      expect(windows[0]!.isDestroyed()).toBe(true);
      expect(windows[0]!.destroyCount).toBe(1);
      expect(windows[1]!.isDestroyed()).toBe(false);
      controller.answerWindow(windows[1]!.webContents, 0);
    } else controller.answerBubble('second', 0);
    expect(await second.result).toBe(0);
  });

  it('closeAll settles both bubble and standalone questions and prevents delayed showing', async () => {
    const { controller, pet, windows, standalone, ask } = setup({ visible: false });
    const standaloneAnswer = ask(request('standalone'));
    const win = windows[0]!;
    pet.show();
    const bubbleAnswer = ask(request('bubble'));

    controller.closeAll();
    controller.closeAll();
    win.emit('ready-to-show');
    controller.answerWindow(win.webContents, 0);
    controller.answerBubble('bubble', 0);
    pet.hide();

    expect(await standaloneAnswer.result).toBeNull();
    expect(await bubbleAnswer.result).toBeNull();
    expect(standaloneAnswer.answers).toEqual([null]);
    expect(bubbleAnswer.answers).toEqual([null]);
    expect(win.isDestroyed()).toBe(true);
    expect(win.destroyCount).toBe(1);
    expect(win.showCount).toBe(0);
    expect(controller.state(win.webContents)).toBeNull();
    expect(windows).toHaveLength(1);
    expect(standalone).toEqual(['standalone']);
  });

  it('closing the standalone window dismisses the question', async () => {
    const { controller, windows, ask } = setup({ visible: false });
    const answer = ask();
    const win = windows[0]!;
    win.close();
    controller.answerWindow(win.webContents, 0);
    controller.hidden();

    expect(await answer.result).toBeNull();
    expect(answer.answers).toEqual([null]);
    expect(controller.state(win.webContents)).toBeNull();
    expect(windows).toHaveLength(1);
  });

  it.each(['render-process-gone', 'did-fail-load'])('dismisses and destroys a failed window on %s', async event => {
    const { controller, windows, ask } = setup({ visible: false });
    const answer = ask();
    const win = windows[0]!;
    win.webContents.emit(event);
    controller.answerWindow(win.webContents, 0);
    expect(await answer.result).toBeNull();
    expect(win.isDestroyed()).toBe(true);
    expect(win.destroyCount).toBe(1);
  });

  it.each(['darwin', 'win32', 'linux'] as const)('configures standalone fullscreen visibility on %s', async platform => {
    const { controller, pet, windows, ask } = setup({ visible: false, platform });
    const answer = ask();
    const win = windows[0]!;
    if (platform === 'darwin') expect(win.workspaces).toMatchObject({ on: true, visibleOnFullScreen: true });
    else expect(win.workspaces).toBeNull();
    win.emit('ready-to-show');
    expect(win.isVisible()).toBe(true);
    expect(pet.isVisible()).toBe(false);
    controller.closeAll();
    expect(await answer.result).toBeNull();
  });

  it.each([true, false])('rejects duplicate IDs without replacing a pending question with visible pet=%s', async visible => {
    const { controller, pet, windows, standalone, ask } = setup({ visible });
    const original = request();
    const answer = ask(original);
    expect(await controller.ask({ ...original, question: 'Replacement?', options: ['Yes', 'No', 'Later'] })).toBeNull();
    expect(answer.answers).toEqual([]);
    expect(windows).toHaveLength(visible ? 0 : 1);
    expect(standalone).toHaveLength(visible ? 0 : 1);
    if (visible) pet.hide();
    expect(controller.state(windows[0]!.webContents)).toEqual(original);
    controller.answerWindow(windows[0]!.webContents, 1);
    expect(await answer.result).toBe(1);
  });

  it.each([
    { label: 'null request', value: null },
    { label: 'missing ID', value: { question: 'Question', caption: 'Permission', options: ['Yes', 'No'] } },
    { label: 'numeric ID', value: { ...request(), id: 42 } },
    { label: 'missing question', value: { id: 'bad', caption: 'Permission', options: ['Yes', 'No'] } },
    { label: 'non-string question', value: { ...request('bad'), question: false } },
    { label: 'missing caption', value: { id: 'bad', question: 'Question', options: ['Yes', 'No'] } },
    { label: 'non-string caption', value: { ...request('bad'), caption: null } },
    { label: 'non-array options', value: { ...request('bad'), options: 'Yes,No' } },
    { label: 'one option', value: { ...request('bad'), options: ['Yes'] } },
    { label: 'four options', value: { ...request('bad'), options: ['A', 'B', 'C', 'D'] } },
    { label: 'non-string option', value: { ...request('bad'), options: ['Yes', 1] } },
  ])('rejects $label without changing an existing request', async ({ value }) => {
    const { controller, windows, standalone, ask } = setup({ visible: false });
    const original = request();
    const answer = ask(original);
    const win = windows[0]!;

    expect(await controller.ask(value)).toBeNull();
    expect(answer.answers).toEqual([]);
    expect(windows).toHaveLength(1);
    expect(standalone).toEqual([original.id]);
    expect(controller.state(win.webContents)).toEqual(original);
    expect(win.isDestroyed()).toBe(false);
    controller.answerWindow(win.webContents, 0);
    expect(await answer.result).toBe(0);
  });
});
