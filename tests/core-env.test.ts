import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { coreEnvironment, lookupProxy, PROXY_LOOKUP_MS } = require('../app/core-env.cjs') as {
  coreEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
  lookupProxy(url: string, resolveProxy: (url: string) => Promise<string>): Promise<{ proxy: string | null, rule: string }>;
  PROXY_LOOKUP_MS: number;
};

describe('Core proxy environment', () => {
  it('answers HTTP and HTTPS system proxies, and DIRECT for DIRECT, SOCKS and a failed or unanswered lookup', async () => {
    const proxy = async (rule: string | Error) => (await lookupProxy('https://api.test/', async () => { if (rule instanceof Error) throw rule; return rule; })).proxy;
    expect(await proxy('PROXY proxy.test:7890; DIRECT')).toBe('http://proxy.test:7890');
    expect(await proxy('HTTPS proxy.test:443')).toBe('https://proxy.test:443');
    expect(await proxy('DIRECT')).toBeNull();
    expect(await proxy('SOCKS5 proxy.test:1080')).toBeNull();
    expect(await proxy(new Error('lookup failed'))).toBeNull();
    vi.useFakeTimers();
    try {
      const pending = lookupProxy('https://api.test/', () => new Promise<string>(() => {}));
      await vi.advanceTimersByTimeAsync(PROXY_LOOKUP_MS);
      const unanswered = await pending;
      expect(unanswered.proxy).toBeNull();
      expect(unanswered.rule).toContain('timed out');
    } finally { vi.useRealTimers(); }
  });

  it('has the Core ask for the system proxy only when the environment has no proxy variables of its own', () => {
    expect(coreEnvironment({}).COOPANION_SYSTEM_PROXY).toBe('1');
    expect(coreEnvironment({ https_proxy: 'http://own.test:8080' }).COOPANION_SYSTEM_PROXY).toBeUndefined();
  });

  it('preserves proxy settings and both bypass lists without losing local IPC', () => {
    const source = { HTTP_PROXY: 'http://proxy.test:8080', NO_PROXY: 'one.test', no_proxy: 'two.test, localhost' };
    const env = coreEnvironment(source);
    expect(env.HTTP_PROXY).toBe(source.HTTP_PROXY);
    expect(env.NO_PROXY).toBe(env.no_proxy);
    expect(env.NO_PROXY?.split(',')).toEqual(['one.test', 'two.test', 'localhost', '127.0.0.1', '::1', '[::1]']);
    expect(source.no_proxy).toBe('two.test, localhost');
  });

  it('routes fetch and HTTP through the proxy while localhost remains direct in Electron Node', async () => {
    const hits: string[] = [];
    const target = createServer((req, res) => res.end(req.url));
    const proxy = createServer();
    await new Promise<void>(r => target.listen(0, '127.0.0.1', r));
    const targetPort = (target.address() as { port: number }).port;
    proxy.on('connect', (req, socket, head) => {
      hits.push(req.url ?? '');
      const upstream = connect(targetPort, '127.0.0.1', () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        upstream.pipe(socket); socket.pipe(upstream);
      });
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
      socket.on('close', () => upstream.destroy());
    });
    // node:http uses an absolute URL for a plain HTTP proxy request.
    proxy.on('request', (req, res) => { hits.push(req.url ?? ''); res.end('http-proxy'); });
    await new Promise<void>(r => proxy.listen(0, '127.0.0.1', r));
    const proxyUrl = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
    try {
      const code = `(async()=>{const a=await(await fetch('http://model.invalid/model')).text();const b=await(await fetch('http://127.0.0.1:${targetPort}/local')).text();const c=await new Promise((ok,no)=>require('node:http').get('http://download.invalid/archive',r=>{let s='';r.on('data',d=>s+=d);r.on('end',()=>ok(s));}).on('error',no));console.log(JSON.stringify([a,b,c]));})().catch(e=>{console.error(e);process.exit(1)});`;
      const child = spawn(require('electron'), ['--use-env-proxy', '-e', code], { env: coreEnvironment({ ...process.env, HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl, http_proxy: proxyUrl, https_proxy: proxyUrl, NO_PROXY: '', no_proxy: 'unrelated.invalid' }), stdio: ['ignore','pipe','pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', d => stdout += d); child.stderr.on('data', d => stderr += d);
      const exit = await new Promise<number | null>((r, reject) => { child.on('exit', r); child.on('error', reject); });
      expect(exit, stderr).toBe(0);
      expect(JSON.parse(stdout.trim())).toEqual(['/model', '/local', 'http-proxy']);
      expect(hits).toEqual(['model.invalid:80', 'http://download.invalid/archive']);
    } finally { target.closeAllConnections(); target.close(); proxy.closeAllConnections(); proxy.close(); }
  });
});
