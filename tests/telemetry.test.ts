import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { COUNTERS, crashFields, Telemetry, type ModelTry, type ModelUse } from '../core/telemetry.ts';

const ENDPOINT = { vendor: 'vendor-a', model: 'model-a', endpointKind: 'builtin' } as const;

/** Today's `models` and `providerErrors` as the next send would carry them. */
async function sentDay(feed: (t: Telemetry) => void): Promise<{ models: ModelUse[]; providerErrors: number }> {
  let body: { days: Array<{ models: ModelUse[]; providerErrors: number }> } | null = null;
  const t = new Telemetry({
    dir: mkdtempSync(join(tmpdir(), 'coo-telemetry-')), version: 'test', enabled: () => true,
    snapshot: () => ({}), extensions: () => [],
    fetchImpl: (async (_url: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response(null, { status: 204 }); }) as typeof fetch,
  });
  feed(t);
  await Promise.resolve();
  await t.send();
  return body!.days[0]!;
}

/** One request's tries, recorded together as the session tracker does. */
function request(t: Telemetry, generationId: string, tries: Array<[ModelTry['outcome'], number | null]>): void {
  for (const [outcome, status] of tries) {
    t.usage(ENDPOINT, { promptTokens: 1, completionTokens: 0, cacheHitTokens: 0, attempt: { generationId, outcome, status } });
  }
}

describe('telemetry model failures', () => {
  it('counts a request as failed once, after its retries, by the status of its last try; a cut-off try is not a failure', async () => {
    const day = await sentDay((t) => {
      request(t, 'g1', [['failed', 500], ['failed', 500], ['failed', 502]]);
      request(t, 'g2', [['failed', 429], ['completed', 200]]);
      request(t, 'g3', [['failed', 503], ['aborted', null]]);
      request(t, 'g4', [['failed', null]]);
    });
    expect(day.models).toEqual([expect.objectContaining({ calls: 8, failed: 2, failedStatus: { 502: 1, none: 1 }, aborted: 1 })]);
    expect(day.providerErrors).toBe(2);
  });
});

describe('crash fields', () => {
  it('sends no message and only frames inside the program directory, relative to it', () => {
    const app = join(tmpdir(), 'Coopanion App');
    const extensions = join(app, 'build', 'data', 'extensions');
    const err = new TypeError('cannot read sk-secret from C:\\Users\\someone\\notes.txt\n    at x (' + join(app, 'core', 'fake.ts') + ':1:1)');
    err.stack = [
      String(err),
      `    at Object.run (${join(app, 'core', 'guide.ts')}:212:7)`,
      `    at ${join(tmpdir(), 'someone', 'outside.js')}:3:1`,
      `    at load (${join(extensions, 'node_modules', 'private-ext', 'index.js')}:9:9)`,
      '    at node:internal/process/task_queues:105:5',
      `    at async ${pathToFileURL(join(app, 'build', 'cortico', 'src', 'core', 'loop.ts')).href}:1043:11`,
      `    at step (${join(app, 'packages', 'pet', 'world.ts')}:5:2)`,
      `    at more (${join(app, 'core', 'companion.ts')}:1:1)`,
    ].join('\n');
    Object.assign(err, { code: 'ERR_TEST' });
    const fields = crashFields(err, app, [extensions]);
    expect(fields).toEqual({ error: 'TypeError', code: 'ERR_TEST', frames: ['core/guide.ts:212', 'build/cortico/src/core/loop.ts:1043', 'packages/pet/world.ts:5'] });
  });
});


describe('telemetry state recovery', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
  const stateDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'coo-telemetry-state-'));
    dirs.push(dir);
    return dir;
  };

  it.each(['', '{"installId":', 'null', '{"installId":"old","day":null,"days":[],"queue":[]}'])('recovers invalid state %j and retains the uninstall id', async (content) => {
    const dir = stateDir();
    const file = join(dir, 'telemetry.json');
    writeFileSync(file, content);
    writeFileSync(join(dir, 'telemetry-id'), 'existing-install');
    const t = new Telemetry({ dir, version: 'test', enabled: () => false, snapshot: () => ({}), extensions: () => [],
      fetchImpl: (async () => { throw new Error('disabled telemetry must not send'); }) as typeof fetch });
    t.start();
    await t.stop();
    expect(readFileSync(`${file}.bad`, 'utf8')).toBe(content);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    expect(saved.installId).toBe('existing-install');
    expect(saved.day.counts.sessions).toBe(0);
    expect(saved.queue).toEqual([]);
  });

  it('generates a new id when the state file was deleted', async () => {
    const dir = stateDir();
    writeFileSync(join(dir, 'telemetry-id'), 'previous-install');
    const t = new Telemetry({ dir, version: 'test', enabled: () => false, snapshot: () => ({}), extensions: () => [] });
    t.start();
    await t.stop();
    expect(JSON.parse(readFileSync(join(dir, 'telemetry.json'), 'utf8')).installId).not.toBe('previous-install');
  });

  it('keeps a state file that lacks a counter and model fields added later, those starting at 0', async () => {
    const dir = stateDir();
    const file = join(dir, 'telemetry.json');
    const missing = COUNTERS[COUNTERS.length - 1]!;
    const counts = Object.fromEntries(COUNTERS.filter((c) => c !== missing).map((c) => [c, 3]));
    const model = { vendor: 'vendor', model: 'model', endpointKind: 'builtin', calls: 2, failed: 0, tokensIn: 10, tokensOut: 5 };
    const event = { type: 'onboarding', ts: '2026-10-21T00:00:00.000Z' };
    writeFileSync(file, JSON.stringify({
      installId: 'kept', firstDate: '2026-01-01', chatDays: 5, lastChatDate: '2026-10-21', enabled: true, extensions: [],
      day: { date: '2026-10-22', runningMinutes: 30, minutes: [600], counts, models: { key: model } }, days: [], queue: [event],
    }));
    const t = new Telemetry({ dir, version: 'test', enabled: () => true, snapshot: () => ({}), extensions: () => [],
      now: () => new Date(2026, 9, 22, 12), fetchImpl: (async () => { throw new Error('offline'); }) as typeof fetch });
    t.start();
    await t.stop();
    expect(existsSync(`${file}.bad`)).toBe(false);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    expect(saved).toMatchObject({ installId: 'kept', firstDate: '2026-01-01', chatDays: 5, queue: [event] });
    expect(saved.day.counts[missing]).toBe(0);
    expect(saved.day.counts.messagesText).toBe(3);
    expect(saved.day.models.key).toMatchObject({ calls: 2, tokensIn: 10, tokensCached: 0, aborted: 0 });
  });
});
