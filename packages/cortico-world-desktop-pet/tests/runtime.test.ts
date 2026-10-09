/**
 * Managed downloads against local file servers: the speech model fetched file by file from the
 * first source that has it, checksum rejection, falling back to the second source, the `.partial`
 * protocol, and archive unpacking for the Electron runtime. Nothing reaches the network.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { FUNASR_MODEL, RuntimeStore, extract, type ModelSpec } from '../src/runtime/store.ts';

function zipOf(dir: string, out: string): void {
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const r = spawnSync(tar, ['-a', '-cf', out, '-C', dir, '.'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
}

/** Serves `files` by their last path segment; `hits` lists what was asked for. */
async function fileServer(files: Record<string, Buffer>) {
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? '').split('?')[0]!.split('/').pop() ?? '');
    hits.push(name);
    const body = files[name];
    if (!body) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-length': String(body.length) }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { server, url, hits };
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const MODEL = Buffer.from('a model');
const TOKENS = Buffer.from('a b c');

/** A two-file model like FunASR's, fetched from `primary`, then `backup`. */
function spec(primary: string, backup: string): ModelSpec {
  return {
    id: 'test-model',
    files: [
      { role: 'model', name: 'model.int8.onnx', bytes: MODEL.length, sha256: sha(MODEL) },
      { role: 'tokens', name: 'tokens.txt', bytes: TOKENS.length, sha256: sha(TOKENS) },
    ],
    sources: [(f) => `${primary}/models/${f}`, (f) => `${backup}/mirror/${f}`],
  };
}

describe('the FunASR model', () => {
  it('is pinned to two files and fetched from ModelScope first', () => {
    expect(FUNASR_MODEL.files.map((f) => f.name)).toEqual(['model.int8.onnx', 'tokens.txt']);
    expect(new URL(FUNASR_MODEL.sources[0]!('tokens.txt')).host).toBe('modelscope.cn');
  });

  it('downloads every file from the first source and checks each one', async () => {
    const a = await fileServer({ 'model.int8.onnx': MODEL, 'tokens.txt': TOKENS });
    const b = await fileServer({});
    try {
      const root = mkdtempSync(join(tmpdir(), 'pet-m-'));
      const store = new RuntimeStore({ runtimesRoot: () => root, modelsDir: () => root, funasrModel: spec(a.url, b.url) });
      expect(store.funasr.state().phase).toBe('absent');
      await store.funasr.install();
      expect(store.funasr.state()).toMatchObject({ phase: 'ready', done: store.funasr.bytes });
      expect(readFileSync(store.funasr.file('tokens.txt'), 'utf8')).toBe('a b c');
      expect(readdirSync(store.funasr.dir).sort()).toEqual(['model.int8.onnx', 'tokens.txt']);
      expect(b.hits).toEqual([]);
    } finally {
      a.server.close(); b.server.close();
    }
  });

  it('falls back to the next source when the first does not answer with the file', async () => {
    const a = await fileServer({ 'tokens.txt': TOKENS });
    const b = await fileServer({ 'model.int8.onnx': MODEL });
    try {
      const root = mkdtempSync(join(tmpdir(), 'pet-m-'));
      const store = new RuntimeStore({ runtimesRoot: () => root, modelsDir: () => root, funasrModel: spec(a.url, b.url) });
      await store.funasr.install();
      expect(store.funasr.state().phase).toBe('ready');
      expect(b.hits).toEqual(['model.int8.onnx']);
    } finally {
      a.server.close(); b.server.close();
    }
  });

  it('rejects a file whose checksum does not match on every source and leaves no partial file', async () => {
    const a = await fileServer({ 'model.int8.onnx': Buffer.from('not a model'), 'tokens.txt': TOKENS });
    const b = await fileServer({});
    try {
      const root = mkdtempSync(join(tmpdir(), 'pet-m-'));
      const store = new RuntimeStore({ runtimesRoot: () => root, modelsDir: () => root, funasrModel: spec(a.url, b.url) });
      await store.funasr.install();
      const st = store.funasr.state();
      expect(st.phase).toBe('error');
      expect(st.detail).toContain('校验不符');
      expect(st.detail).toContain('HTTP 404');
      expect(readdirSync(store.funasr.dir).filter((f) => f.endsWith('.partial'))).toEqual([]);
    } finally {
      a.server.close(); b.server.close();
    }
  });
});

describe.skipIf(process.platform !== 'win32' && process.platform !== 'darwin')('the Electron runtime', () => {
  it('reports an HTTP failure as an error state and leaves no partial directory', async () => {
    const a = await fileServer({});
    try {
      const root = mkdtempSync(join(tmpdir(), 'pet-rt-'));
      const fetchImpl: typeof fetch = (input, init) => fetch(`${a.url}${new URL(String(input)).pathname}`, init);
      const store = new RuntimeStore({ runtimesRoot: () => root, modelsDir: () => join(root, 'm'), fetchImpl });
      await store.electron.install();
      expect(store.electron.state()).toMatchObject({ phase: 'error', detail: 'HTTP 404' });
      expect(existsSync(`${store.electron.dir}.partial`)).toBe(false);
    } finally {
      a.server.close();
    }
  });

  it('extract unpacks a zip with the system tar', async () => {
    const stage = mkdtempSync(join(tmpdir(), 'pet-zip-'));
    writeFileSync(join(stage, 'a.txt'), 'hello');
    const archive = join(mkdtempSync(join(tmpdir(), 'pet-arc-')), 'x.zip');
    zipOf(stage, archive);
    const out = mkdtempSync(join(tmpdir(), 'pet-out-'));
    await extract(archive, out);
    expect(readFileSync(join(out, 'a.txt'), 'utf8')).toBe('hello');
  });
});
