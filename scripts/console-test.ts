/**
 * Serves the settings window's page in a browser, beside the operator's own Coopanion:
 *
 * 1. A Core of this checkout on port 17790, with its own deployment home in the system temp
 *    directory (`coopanion-console-test/`, seeded as a new install on the first run and kept
 *    after that), telemetry off, and no pet window.
 * 2. `build/console` under `/coopanion/` on port 17791, every other request (HTTP and WebSocket)
 *    forwarded to that Core with the Core's origin, as app/main.cjs `serveWindow` does for the
 *    settings window; the page gets the deployment's language as settings-preload.cjs gives it.
 *
 * Run: `pnpm run console:test`, then open the printed address. `pnpm run build:cortico` first when
 * `console/` or the submodule changed; the page is read from `build/console` on every request.
 * `--reset` deletes the test home before starting. Ctrl-C stops both.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request, type IncomingHttpHeaders } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DATA = join(tmpdir(), 'coopanion-console-test');
const HOME = join(DATA, 'home');
const CORE_PORT = 17790;
const PAGE_PORT = 17791;
const CORE_ORIGIN = `http://127.0.0.1:${CORE_PORT}`;
const WINDOW_DIR = join(ROOT, 'build', 'console');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json' };

if (process.argv.includes('--reset')) rmSync(DATA, { recursive: true, force: true });
if (!existsSync(join(WINDOW_DIR, 'index.html')) || !existsSync(join(ROOT, 'build', 'cortico', 'src', 'core'))) {
  const staged = spawn(process.execPath, ['--import', 'tsx', join(ROOT, 'scripts', 'stage.ts')], { cwd: ROOT, stdio: 'inherit' });
  if (await new Promise((done) => staged.on('exit', done)) !== 0) process.exit(1);
}

// `cortico/*` resolves to the staged copy, as core/boot.ts arranges before the Core imports it.
await import(pathToFileURL(join(ROOT, 'build', 'cortico', 'src', 'extensions', 'runtime.ts')).href);
const { seed, DEPLOYMENT } = await import('../core/seed.ts');
const configFile = join(HOME, DEPLOYMENT, 'config.json');
const fresh = !existsSync(configFile);
seed(HOME, 'zh');
const config = JSON.parse(readFileSync(configFile, 'utf8'));
if (fresh) {
  config.web = { ...config.web, port: CORE_PORT };
  config.companion = { ...config.companion, telemetry: false };
  writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
}
const language: string = config.language ?? 'zh';

mkdirSync(join(DATA, 'extensions'), { recursive: true });
const core = spawn(process.execPath, ['--import', 'tsx', join(ROOT, 'core', 'boot.ts')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    CORTICO_HOME: HOME,
    CORTICO_EXTENSIONS_DIR: join(DATA, 'extensions'),
    // the pet window command exits at once, so no second pet appears
    CORTICO_DESKTOP_PET_HOST: JSON.stringify([process.execPath, '-e', '']),
    COOPANION_TELEMETRY_URL: 'http://127.0.0.1:9/',
    COOPANION_SYSTEM_LANGUAGE: language,
  },
});
core.on('exit', (code) => { console.error(`Core exited (${code})`); process.exit(code ?? 1); });
const stop = () => { core.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const toCore = (headers: IncomingHttpHeaders): IncomingHttpHeaders => ({ ...headers, host: `127.0.0.1:${CORE_PORT}`, ...(headers.origin ? { origin: CORE_ORIGIN } : {}) });
const languageScript = `<script>localStorage.setItem('cortico.console.language', ${JSON.stringify(language)})</script>`;

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PAGE_PORT}`);
  if (url.pathname.startsWith('/coopanion/')) {
    try {
      const file = resolve(WINDOW_DIR, decodeURIComponent(url.pathname.slice('/coopanion/'.length)) || 'index.html');
      if (!file.startsWith(WINDOW_DIR + sep)) throw new Error('outside the window directory');
      let body: Buffer | string = readFileSync(file);
      if (extname(file) === '.html') body = body.toString('utf8').replace('<script', `${languageScript}<script`);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
    return;
  }
  const out = request(`${CORE_ORIGIN}${req.url}`, { method: req.method, headers: toCore(req.headers) }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.headers);
    answer.pipe(res);
  });
  out.on('error', () => res.writeHead(502).end());
  req.pipe(out);
});
server.on('upgrade', (req, socket, head) => {
  const upstream = connect(CORE_PORT, '127.0.0.1', () => {
    const lines = Object.entries(toCore(req.headers)).map(([key, value]) => `${key}: ${value}`);
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`);
    upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});
server.listen(PAGE_PORT, '127.0.0.1', () => {
  console.log(`settings page: http://127.0.0.1:${PAGE_PORT}/coopanion/#/prompts  (data: ${DATA})`);
});
