import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { CUA_DEFAULTS } from '../../../src/cua/config.ts';
import { Cua } from '../../../src/cua/cua.ts';
import { FakeHost } from '../../helpers/fake-host.ts';

it.runIf(process.platform === 'win32').for(['multiline', 'selection', 'form', 'switch'])('types with a Taiwanese IME: %s', async (scenario, { skip }) => {
  const host = new FakeHost();
  const world = new Cua({ cfg: () => ({ ...CUA_DEFAULTS, enabled: true, permission: 'never-ask', userIdleMs: 300 }) });
  const profile = await mkdtemp(join(tmpdir(), 'cua-ime-'));
  const editor = fork(fileURLToPath(new URL('./ime-editor.cjs', import.meta.url)), [`--user-data-dir=${profile}`, `--scenario=${scenario}`], {
    execPath: createRequire(import.meta.url)('electron'), execArgv: [], stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  const exited = once(editor, 'exit');
  try {
    const [ready] = await Promise.race([once(editor, 'message'), exited.then(() => { throw new Error('editor exited before ready'); })]);
    skip(!ready.available, 'Taiwanese input method unavailable');
    expect(ready.active).toBe(true);
    world.start(host);
    await world.ready();
    const cancel = new AbortController();
    editor.on('message', (event) => { if (event === 'focus lost') cancel.abort(); });
    const focused = once(editor, 'message');
    editor.send('focus');
    expect((await focused)[0]).toBe(true);
    const text = scenario === 'form' ? '甲「乙」【丙】。\n' : '甲「乙」【丙】《丁》🐉。\n戊——己……庚！'.repeat(scenario === 'switch' ? 35 : 3);
    const tool = world.tools().find((entry) => entry.name === 'pet_cua_type')!;
    const result = await tool.handler({ text, screenshot: false }, { role: 'main', log: host.log, signal: cancel.signal });
    expect(result, JSON.stringify(result)).not.toHaveProperty('failed', true);
    const received = once(editor, 'message');
    editor.send('read');
    const [actual] = await received;
    if (scenario === 'switch') {
      expect(actual.switched).toBe(true);
      expect(actual.other).toBe('');
      expect(actual.text.length).toBeGreaterThan(0);
      expect(actual.text.length).toBeLessThan(text.length);
      expect(text.startsWith(actual.text)).toBe(true);
      const receipt = /(\d+)\/(\d+)/.exec(result.text);
      expect(receipt, result.text).not.toBeNull();
      expect(Number(receipt![2])).toBe([...text].length);
      expect(Number(receipt![1])).toBeGreaterThanOrEqual([...actual.text].length);
      expect(Number(receipt![1])).toBeLessThan([...text].length);
      expect(cancel.signal.aborted).toBe(false);
    } else if (scenario === 'form') {
      expect(actual.text).toBe(text.trimEnd());
      expect(actual.submits).toBe(1);
    } else if (scenario === 'selection') {
      expect(actual.text).toBe(`前${text}后`);
    } else expect(actual.text).toBe(text);
  } finally {
    if (editor.connected) editor.disconnect();
    await world.stop();
    await exited;
    await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  }
});
