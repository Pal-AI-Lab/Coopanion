import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = fileURLToPath(new URL('../', import.meta.url));
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

async function exercise(mode: 'clean' | 'hung' | 'console') {
  const root = mkdtempSync(join(tmpdir(), 'coo-core-host-'));
  roots.push(root);
  mkdirSync(join(root, 'core'));
  symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'), 'junction');
  writeFileSync(join(root, 'core/boot.ts'), `
    process.on('SIGTERM', () => {});
    process.on('disconnect', () => process.exit(0));
    process.on('message', (msg) => {
      if (msg.type === 'companion:shutdown' && process.env.COOPANION_TEST_STOP !== 'hung') process.exit(0);
      if (msg.type === 'test:exit') process.exit(0);
    });
    process.send({ type: 'companion:ready', port: 1, dataDir: process.cwd() });
  `);
  writeFileSync(join(root, 'drive.cjs'), `
    const { once } = require('node:events');
    const { CoreHost } = require(process.env.COOPANION_TEST_HOST);
    const host = new CoreHost({ appRoot: process.cwd(), logDir: 'logs', env: process.env, resolveProxy: async () => 'DIRECT' });
    const states = [];
    const exits = [];
    host.on('state', (state, exit) => { states.push(state); if (exit) exits.push(exit); });
    (async () => {
      const ready = once(host, 'ready');
      await host.start();
      await ready;
      const original = host.child;
      const exited = once(original, 'exit');
      let replacement = null;
      if (process.env.COOPANION_TEST_STOP === 'hung') {
        const stop = host.stop.bind(host);
        host.stop = () => stop(30);
        const readyAgain = once(host, 'ready');
        await host.restart();
        await readyAgain;
        replacement = host.child.pid;
      } else if (process.env.COOPANION_TEST_STOP === 'console') {
        host.expectStop();
        host.send({ type: 'test:exit' });
        await exited;
        // longer than the 3 s restart delay: a restart would show up as a new child
        await new Promise((done) => setTimeout(done, 3500));
        replacement = host.child?.pid ?? null;
      }
      await host.stop();
      const [code, signal] = await exited;
      console.log(JSON.stringify({ code, signal, original: original.pid, replacement,
        child: host.child, port: host.port, state: host.state, crashes: host.crashes, states, exits }));
    })().catch((err) => { console.error(err); process.exitCode = 1; host.child?.kill('SIGKILL'); });
  `);
  const child = spawn(require('electron'), [join(root, 'drive.cjs')], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', COOPANION_TEST_STOP: mode, COOPANION_TEST_HOST: join(repo, 'app/core-host.cjs') },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
    killSignal: 'SIGKILL',
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise<number | null>((resolve, reject) => { child.on('close', resolve); child.on('error', reject); });
  expect(code, stderr).toBe(0);
  return JSON.parse(stdout.trim());
}

describe('Core shutdown', () => {
  it('exits promptly after a cooperative shutdown without keeping the grace timer alive', async () => {
    const result = await exercise('clean');
    expect(result).toMatchObject({ code: 0, child: null, port: null, state: 'stopped', crashes: [] });
    expect(result.states).toEqual(['starting', 'running', 'stopped']);
  });

  it('restarts after a child that ignores shutdown is killed, without counting a crash', async () => {
    const result = await exercise('hung');
    expect(result.replacement).not.toBe(result.original);
    expect(result).toMatchObject({ child: null, port: null, state: 'stopped', crashes: [] });
    expect(result.states).toEqual(['starting', 'running', 'stopped', 'starting', 'running', 'stopped']);
  });

  it('leaves Core stopped after the console asked for a shutdown, with no crash notification', async () => {
    const result = await exercise('console');
    expect(result).toMatchObject({ replacement: null, child: null, port: null, state: 'stopped', crashes: [] });
    expect(result.states).toEqual(['starting', 'running', 'stopped']);
    expect(result.exits).toEqual([]);
  });
});
