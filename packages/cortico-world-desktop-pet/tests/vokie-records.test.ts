/**
 * Vokie's finished sessions as the pet's way in: the transcript cleaning and the history tail
 * (`src/vokie/records.ts`), against a real local HTTP server that answers like Vokie's.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanTranscript, VokieRecordsWatch, type VokieRecord } from '../src/vokie/records.ts';

const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A record as `/v1/data/records` returns it. */
function record(id: number, type: string, transcript: string, status = 'completed'): unknown {
  return { id, type, status, create_time: 1_790_000_000_000 + id, transcription: { transcript, transcript_chars: transcript.length } };
}

/** A Vokie-history stand-in: `set` decides what the next read answers with. */
async function fakeVokie(): Promise<{ port: number; set: (records: unknown[]) => void }> {
  let records: unknown[] = [];
  const server = createServer((_req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, count: records.length, records }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { port: (server.address() as { port: number }).port, set: (next) => { records = next; } };
}

describe('cleanTranscript', () => {
  it('drops the timestamp and speaker lines of a segment transcript and joins the words', () => {
    expect(cleanTranscript('00:00:01\nSPEAKER_00: 你帮我看一下这个\n00:00:10\nSPEAKER_00: 模块是不是没加载')).toBe('你帮我看一下这个模块是不是没加载');
  });

  it('keeps a space between Latin segments and drops a transcript that is only noise', () => {
    expect(cleanTranscript('00:00:00\nUNKNOWN: hello there\n00:00:02\nUNKNOWN: general kenobi')).toBe('hello there general kenobi');
    expect(cleanTranscript('00:00:01\nUNKNOWN: 嗯。')).toBe('嗯。');
    expect(cleanTranscript('00:00:01\nSPEAKER_00:   ')).toBe('');
    expect(cleanTranscript('')).toBe('');
  });

  it('leaves a sentence alone when its colon is not an uppercase speaker tag', () => {
    expect(cleanTranscript('注意: 我把这个放在这里')).toBe('注意: 我把这个放在这里');
  });
});

describe('VokieRecordsWatch', () => {
  it('reports only the sessions finished after it started, cleaned', async () => {
    const vokie = await fakeVokie();
    vokie.set([record(5, 'toggle', '00:00:01\nSPEAKER_00: 早上好')]);
    const got: VokieRecord[] = [];
    const watch = new VokieRecordsWatch({ port: () => vokie.port, pollMs: 40, onRecord: (r) => got.push(r) });
    watch.start();
    try {
      await expect.poll(() => watch.state().phase, { timeout: 2000 }).toBe('running');
      await sleep(80);
      expect(got).toHaveLength(0);
      vokie.set([
        record(5, 'toggle', '00:00:01\nSPEAKER_00: 早上好'),
        record(6, 'toggle', '00:00:01\nSPEAKER_00: 帮我看看这个插件\n00:00:03\nSPEAKER_00: 有没有装上'),
      ]);
      await expect.poll(() => got.length, { timeout: 2000 }).toBe(1);
      expect(got[0]).toMatchObject({ id: 6, type: 'toggle', text: '帮我看看这个插件有没有装上' });
    } finally {
      watch.stop();
    }
  });

  it('reports every kind of session, and leaves out unfinished ones and a session that heard nothing', async () => {
    const vokie = await fakeVokie();
    vokie.set([]);
    const got: VokieRecord[] = [];
    const watch = new VokieRecordsWatch({ port: () => vokie.port, pollMs: 40, onRecord: (r) => got.push(r) });
    watch.start();
    try {
      await expect.poll(() => watch.state().phase, { timeout: 2000 }).toBe('running');
      await sleep(80);
      vokie.set([
        record(10, 'ptt', '00:00:01\nUNKNOWN: 这是听写', 'completed'),
        record(11, 'toggle', '00:00:01\nUNKNOWN: 还在录', 'processing'),
        record(12, 'toggle', '00:00:01\nUNKNOWN: 嗯。', 'completed'),
        record(13, 'toggle', '00:00:02\nSPEAKER_00: 这句要', 'completed'),
      ]);
      await expect.poll(() => got.length, { timeout: 2000 }).toBe(2);
      expect(got.map((r) => r.id)).toEqual([10, 13]);
      expect(got.map((r) => r.type)).toEqual(['ptt', 'toggle']);
    } finally {
      watch.stop();
    }
  });

  it('delivers a session that was first seen while it was still running', async () => {
    const vokie = await fakeVokie();
    vokie.set([]);
    const got: VokieRecord[] = [];
    const watch = new VokieRecordsWatch({ port: () => vokie.port, pollMs: 40, onRecord: (r) => got.push(r) });
    watch.start();
    try {
      await expect.poll(() => watch.state().phase, { timeout: 2000 }).toBe('running');
      await sleep(80);
      // Vokie writes the row when the session starts and fills it in when it ends
      vokie.set([record(30, 'ptt', '', 'processing')]);
      await sleep(120);
      expect(got).toHaveLength(0);
      vokie.set([record(30, 'ptt', '00:00:01\nUNKNOWN: 这句是后填上的', 'completed')]);
      await expect.poll(() => got.length, { timeout: 2000 }).toBe(1);
      expect(got[0]).toMatchObject({ id: 30, type: 'ptt', text: '这句是后填上的' });
    } finally {
      watch.stop();
    }
  });

  it('keeps polling when the history cannot be read, and works again when it can', async () => {
    let broken = true;
    let records: unknown[] = [];
    const server = createServer((_req, res) => {
      if (broken) { res.statusCode = 503; res.end('no'); return; }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, records }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const got: VokieRecord[] = [];
    const watch = new VokieRecordsWatch({ port: () => port, pollMs: 40, onRecord: (r) => got.push(r) });
    watch.start();
    try {
      await expect.poll(() => watch.state().detail, { timeout: 2000 }).toBe('http 503');
      broken = false;
      records = [record(20, 'toggle', '好的')];
      await expect.poll(() => watch.state().phase, { timeout: 2000 }).toBe('running');
      // the first good read only takes a baseline: what was there before is not replayed
      expect(got).toHaveLength(0);
      records = [record(20, 'toggle', '好的'), record(21, 'toggle', '请把这个放在这里')];
      await expect.poll(() => got.length, { timeout: 2000 }).toBe(1);
      expect(got[0]).toMatchObject({ id: 21, text: '请把这个放在这里' });
    } finally {
      watch.stop();
    }
    expect(watch.state().phase).toBe('stopped');
    await sleep(60);
  });
});
