/**
 * The remote's button edges as Vokie writes them, and the file tail that reads them
 * (`src/vokie/log-watch.ts`). Real files, no mocking of the file system.
 */
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEdgeLine, VokieLogWatch } from '../src/vokie/log-watch.ts';
import type { RemoteEdge } from '../src/vokie/gesture.ts';

const DOWN = "[2026-10-22 18:12:16.919] [info]  google-tv-remote-helper { type: 'button', button: 'siri', event: 'down', sessionId: 9 }";
const UP = "[2026-10-22 18:12:17.121] [info]  google-tv-remote-helper { type: 'button', button: 'siri', event: 'up', sessionId: 9 }";

const dirs: string[] = [];

function tempLog(initial = ''): string {
  const dir = mkdtempSync(join(tmpdir(), 'vokie-log-'));
  dirs.push(dir);
  const file = join(dir, 'app.log');
  writeFileSync(file, initial);
  return file;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves once `edges` holds `n` edges, or rejects after a second. */
async function waitFor(edges: RemoteEdge[], n: number): Promise<void> {
  const until = Date.now() + 2000;
  while (edges.length < n) {
    if (Date.now() > until) throw new Error(`only ${edges.length}/${n} edges`);
    await sleep(20);
  }
}

describe('parseEdgeLine', () => {
  it('reads the voice key with the log line’s own time', () => {
    const edge = parseEdgeLine(DOWN);
    expect(edge).toMatchObject({ page: 0x0c, usage: 0x221, down: true });
    expect(edge!.ts).toBe(new Date(2026, 9, 22, 18, 12, 16, 919).getTime());
    expect(parseEdgeLine(UP)).toMatchObject({ usage: 0x221, down: false });
  });

  it('names the OK and back keys, and drops every other line', () => {
    expect(parseEdgeLine("[2026-10-22 18:12:16.919] [info]  google-tv-remote-helper { type: 'button', button: 'select', event: 'down', sessionId: 3 }")?.usage).toBe(0x41);
    expect(parseEdgeLine("[2026-10-22 18:12:16.919] [info]  google-tv-remote-helper { type: 'button', button: 'back', event: 'down', sessionId: 4 }")?.usage).toBe(0x224);
    // a button this bridge does not act on, another module's line, and text that is not a line
    expect(parseEdgeLine("[2026-10-22 18:12:16.919] [info]  google-tv-remote-helper { type: 'button', button: 'power', event: 'down', sessionId: 5 }")).toBeNull();
    expect(parseEdgeLine("[2026-10-22 18:12:16.919] [info]  google-tv-remote-helper { type: 'connected', deviceId: '18d1:9450:47545145a489' }")).toBeNull();
    expect(parseEdgeLine('hello')).toBeNull();
  });
});

describe('VokieLogWatch', () => {
  it('reports only the presses written after it started', async () => {
    const file = tempLog(`${DOWN}\n${UP}\n`);
    const edges: RemoteEdge[] = [];
    const watch = new VokieLogWatch({ file: () => file, pollMs: 10, onEdge: (e) => edges.push(e) });
    watch.start();
    try {
      await sleep(60);
      expect(edges).toHaveLength(0);
      appendFileSync(file, `${DOWN}\n${UP}\n`);
      await waitFor(edges, 2);
      expect(edges.map((e) => e.down)).toEqual([true, false]);
      expect(watch.state().phase).toBe('running');
    } finally {
      watch.stop();
    }
  });

  it('reassembles a line that arrives in two writes', async () => {
    const file = tempLog();
    const edges: RemoteEdge[] = [];
    const watch = new VokieLogWatch({ file: () => file, pollMs: 10, onEdge: (e) => edges.push(e) });
    watch.start();
    try {
      appendFileSync(file, DOWN.slice(0, 60));
      await sleep(40);
      expect(edges).toHaveLength(0);
      appendFileSync(file, `${DOWN.slice(60)}\n`);
      await waitFor(edges, 1);
      expect(edges[0]).toMatchObject({ usage: 0x221, down: true });
    } finally {
      watch.stop();
    }
  });

  it('starts over when Vokie rotates the log', async () => {
    const file = tempLog('x'.repeat(200));
    const edges: RemoteEdge[] = [];
    const watch = new VokieLogWatch({ file: () => file, pollMs: 10, onEdge: (e) => edges.push(e) });
    watch.start();
    try {
      await sleep(40);
      // rotated: a shorter file, whose first line is a real press
      writeFileSync(file, `${DOWN}\n`);
      await waitFor(edges, 1);
      expect(edges[0]!.down).toBe(true);
    } finally {
      watch.stop();
    }
  });

  it('waits for a file that does not exist yet', async () => {
    const file = tempLog();
    rmSync(file);
    const edges: RemoteEdge[] = [];
    const watch = new VokieLogWatch({ file: () => file, pollMs: 10, onEdge: (e) => edges.push(e) });
    watch.start();
    try {
      await sleep(40);
      expect(watch.state()).toMatchObject({ phase: 'waiting', detail: 'missing' });
      writeFileSync(file, `${DOWN}\n`);
      await waitFor(edges, 1);
      expect(watch.state().phase).toBe('running');
    } finally {
      watch.stop();
    }
  });
});
