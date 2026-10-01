import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { crashFields, Telemetry, type ModelTry, type ModelUse } from '../core/telemetry.ts';

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
