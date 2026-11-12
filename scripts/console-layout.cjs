/**
 * Settings-window layout check across the UI languages: text that overflows, is cut, wraps inside
 * a control or has its glyphs clipped in some language while Simplified Chinese shows it whole.
 *
 * Starts scripts/console-test.ts on a fresh home (`coopanion-console-layout/` in the system temp
 * directory, deleted at every start), then loads the settings page in advanced mode in an offscreen
 * Electron window at the settings window's default size, once per language. On each rail page, and
 * on each of its page tabs, it measures every visible element that has text of its own. The page is
 * read from `build/console`: run `pnpm run build:cortico` after changing `console/` or the submodule.
 *
 * Run: pnpm run console:layout [-- options]
 *   --langs de,fr     languages checked against zh (default: every other UI language)
 *   --size 1200x820   window content size (default: DEFAULT_SIZE in app/settings-size.cjs)
 *   --port 17890      Core port; the page is on the next one
 *   --json <file>     also write every finding of every language, zh included
 *   --against <file>  a file an earlier run wrote with --json: sort findings into new, fixed, remaining
 *
 * A finding is a kind on an element path. It is reported for a language when zh has no finding
 * of the same kind on the same path, except glyph findings, which are reported in every language.
 *   overflow        content wider than its box, painted past its edge
 *   ellipsis        cut with an ellipsis
 *   clip-x, clip-y  cut by an overflow-hidden box of its own
 *   clamp           cut by a line clamp
 *   wrap            a button, tab, label or chip on more than one line
 *   glyph-text      the first line's ink crosses the edge of the nearest box that hides overflow
 *   glyph-probe     the same with accented capitals and descenders (PROBE) in the element's font
 *
 * Not measured: text inside an editor, code or SVG; elements hidden or under an ancestor with
 * opacity 0; text the market index supplies (extension descriptions, tags, platforms, counts).
 * Glyph checks skip text whose clipping box scrolls, because scrolling shows the rest.
 * Core and page output goes to `console-test.log` in the temp directory.
 */
const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const { mkdirSync, openSync, readFileSync, writeFileSync } = require('node:fs');
const { rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { DEFAULT_SIZE } = require('../app/settings-size.cjs');
const { LANGUAGES } = require('../app/i18n/index.cjs');

const ROOT = resolve(__dirname, '..');
const option = (name) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : process.argv[at + 1];
};
const BASE = 'zh';
const LANGS = [BASE, ...(option('--langs')?.split(',') ?? LANGUAGES).filter((l) => l !== BASE)];
const [WIDTH, HEIGHT] = option('--size')?.split('x').map(Number) ?? [DEFAULT_SIZE.width, DEFAULT_SIZE.height];
const PORT = Number(option('--port') ?? 17890);
const PAGE = `http://127.0.0.1:${PORT + 1}`;
const DATA = join(tmpdir(), 'coopanion-console-layout');
const LOG = join(DATA, 'console-test.log');
/** Market cards carry the index's own text; its length is not a translation's. */
const CONTENT = /extension-(description|os|stat|tag|new-badge|certified-badge)/;

app.setPath('userData', `${DATA}-electron`);
app.disableHardwareAcceleration();
let server;

function fail(message) {
  console.error(message);
  server?.removeAllListeners('exit');
  if (server?.connected) server.disconnect();
  process.exitCode = 1;
  app.exit(1);
}

async function startServer() {
  // the seeded workspace's git objects are read-only; Electron's rmSync stops at them on Windows, rm clears them
  await rm(DATA, { recursive: true, force: true, maxRetries: 5 });
  mkdirSync(DATA, { recursive: true });
  const log = openSync(LOG, 'w');
  server = spawn(process.env.npm_node_execpath || 'node', ['--import', 'tsx', join(ROOT, 'scripts', 'console-test.ts'), '--port', String(PORT), '--data', DATA], {
    cwd: ROOT,
    stdio: ['ignore', log, log, 'ipc'],
    windowsHide: true,
  });
  server.on('exit', (code) => fail(`console-test exited (${code}); see ${LOG}`));
}

async function serverReady() {
  for (const until = Date.now() + 120_000; Date.now() < until; await new Promise((r) => setTimeout(r, 500))) {
    try {
      if ((await fetch(`${PAGE}/api/theme`)).ok) return;
    } catch { /* not listening yet */ }
  }
  throw new Error(`no Core behind ${PAGE} after 120 s; see ${LOG}`);
}

/** Runs inside the page; self-contained, since it is sent as source. Returns findings by view. */
async function auditPage() {
  const PROBE = 'ÉÅgjpqyрзу';
  const CONTROL = 'button, [role=tab], label, .chip, .tag, .pill, .badge, .navitem, .seg, .pagetab';
  const SKIP = 'svg, script, style, textarea, .cm-editor, pre, code';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const canvas = document.createElement('canvas').getContext('2d');
  const ink = new Map();
  const inkOf = (font, text) => {
    const key = font + '|' + text;
    if (!ink.has(key)) {
      canvas.font = font;
      const m = canvas.measureText(text);
      ink.set(key, { ascent: m.fontBoundingBoxAscent, up: m.actualBoundingBoxAscent, down: m.actualBoundingBoxDescent });
    }
    return ink.get(key);
  };
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  };
  const pathOf = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
      const c = [...e.classList].filter((x) => !/^(is-|active|open|current)/.test(x)).slice(0, 2).join('.');
      parts.unshift(e.tagName.toLowerCase() + (c ? '.' + c : ''));
    }
    return parts.join('>');
  };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const clipBox = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') return { e, s };
    }
    return null;
  };
  const scrolls = (v) => v === 'auto' || v === 'scroll';
  const lineCount = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
  };

  function glyphCut(el, s) {
    const clip = clipBox(el);
    if (!clip || scrolls(clip.s.overflowX) || scrolls(clip.s.overflowY)) return null;
    const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    const range = document.createRange();
    range.selectNodeContents(node);
    const line = range.getClientRects()[0];
    const box = clip.e.getBoundingClientRect();
    if (!line || line.bottom < box.top || line.top > box.bottom || line.right < box.left || line.left > box.right) return null;
    const font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const own = inkOf(font, node.textContent.trim());
    const baseline = line.top + own.ascent;
    const margin = clip.s.overflowY === 'clip' ? parseFloat(clip.s.overflowClipMargin) || 0 : 0;
    const top = box.top + parseFloat(clip.s.borderTopWidth) - margin;
    const bottom = box.bottom - parseFloat(clip.s.borderBottomWidth) + margin;
    for (const [kind, m] of [['glyph-text', own], ['glyph-probe', inkOf(font, PROBE)]]) {
      const cut = Math.max(top - (baseline - m.up), baseline + m.down - bottom);
      if (cut > 0.4) return { kind, cut: +cut.toFixed(1) };
    }
    return null;
  }

  function measure() {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const text = ownText(el);
      if (!/\p{L}/u.test(text) || el.closest(SKIP) || !shown(el)) continue;
      const s = getComputedStyle(el);
      const at = { id: pathOf(el), text: text.slice(0, 60) };
      if (el.scrollWidth > el.clientWidth + 1) {
        if (s.overflowX !== 'visible') out.push({ kind: s.textOverflow === 'ellipsis' ? 'ellipsis' : 'clip-x', ...at });
        else if (s.display !== 'inline') out.push({ kind: 'overflow', ...at, by: el.scrollWidth - el.clientWidth });
      }
      if (el.scrollHeight > el.clientHeight + 2 && (s.overflowY === 'hidden' || s.overflowY === 'clip')) {
        out.push({ kind: s.webkitLineClamp && s.webkitLineClamp !== 'none' ? 'clamp' : 'clip-y', ...at });
      }
      if (el.closest(CONTROL) && lineCount(el) > 1) out.push({ kind: 'wrap', ...at });
      if (s.whiteSpace.startsWith('nowrap') || s.overflowY === 'hidden' || s.overflowY === 'clip') {
        const cut = glyphCut(el, s);
        if (cut) out.push({ ...cut, ...at });
      }
    }
    return out;
  }

  const views = {};
  const routes = [...document.querySelectorAll('a.navitem')].map((a) => a.getAttribute('href'));
  for (const route of routes) {
    location.hash = route;
    await sleep(900);
    views[route] = measure();
    const tabs = [...document.querySelectorAll('.pagetab, [role=tab]')].filter(shown);
    for (let i = 1; i < tabs.length; i++) {
      tabs[i].click();
      await sleep(900);
      views[`${route} tab ${i + 1}`] = measure();
    }
  }
  return views;
}

const keyOf = (f) => `${f.kind} ${f.id}`;

/** Findings some language has beyond zh, by key, with the first view and sample seen. */
function report(run) {
  const base = new Set(Object.values(run[BASE]).flat().filter((f) => !f.kind.startsWith('glyph')).map(keyOf));
  const rows = new Map();
  for (const [lang, views] of Object.entries(run)) {
    for (const [view, findings] of Object.entries(views)) {
      for (const f of findings) {
        if (base.has(keyOf(f)) || CONTENT.test(f.id)) continue;
        const key = keyOf(f);
        const sample = `${lang}: ${f.text}${f.cut ? ` (${f.cut}px)` : ''}${f.by ? ` (+${f.by}px)` : ''}`;
        if (!rows.has(key)) rows.set(key, { kind: f.kind, id: f.id, view, sample, langs: new Set() });
        rows.get(key).langs.add(lang);
      }
    }
  }
  return rows;
}

function print(title, rows) {
  if (!rows.length) return;
  console.log(`\n${title} (${rows.length})`);
  const byView = new Map();
  for (const row of rows) byView.set(row.view, [...(byView.get(row.view) ?? []), row]);
  for (const [view, list] of byView) {
    console.log(`  ${view}`);
    for (const row of list.sort((a, b) => a.kind.localeCompare(b.kind))) {
      const langs = row.langs.size === LANGS.length ? 'all' : [...row.langs].join(' ');
      console.log(`    ${row.kind.padEnd(11)} ${row.id}`);
      console.log(`    ${''.padEnd(11)} ${langs} · ${row.sample}`);
    }
  }
}

/** Bounds one language's run: a page that waits on a dialog never answers. */
const within = (promise, what) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error(`${what} took over 5 minutes`)), 300_000))]);

async function main() {
  for (const lang of LANGS) if (!LANGUAGES.includes(lang)) throw new Error(`unknown language ${lang}; known: ${LANGUAGES.join(' ')}`);
  await startServer();
  await serverReady();
  const win = new BrowserWindow({ width: WIDTH, height: HEIGHT, show: false, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadURL(`${PAGE}/coopanion/#/home`);
  await win.webContents.executeJavaScript(`localStorage.setItem('companion.mode', 'advanced')`);
  const run = {};
  process.stdout.write(`${WIDTH}x${HEIGHT}:`);
  for (const lang of LANGS) {
    await win.loadURL(`${PAGE}/coopanion/?lang=${lang}#/home`);
    await new Promise((r) => setTimeout(r, 1500));
    run[lang] = await within(win.webContents.executeJavaScript(`(${auditPage})()`), lang);
    process.stdout.write(` ${lang}`);
  }
  console.log();
  const json = option('--json');
  if (json) writeFileSync(json, JSON.stringify(run, null, 1) + '\n');

  const now = report(run);
  const against = option('--against');
  if (against) {
    const before = report(JSON.parse(readFileSync(against, 'utf8')));
    print('NEW', [...now].filter(([k]) => !before.has(k)).map(([, v]) => v));
    print('FIXED', [...before].filter(([k]) => !now.has(k)).map(([, v]) => v));
    print('REMAINING', [...now].filter(([k]) => before.has(k)).map(([, v]) => v));
  } else {
    print('FINDINGS', [...now.values()]);
  }
  if (!now.size) console.log('no findings beyond zh');
  server.removeAllListeners('exit');
  server.disconnect();
  app.quit();
}

app.whenReady().then(main).catch((error) => fail(error.stack ?? String(error)));
