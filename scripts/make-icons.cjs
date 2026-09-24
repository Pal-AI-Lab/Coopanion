/**
 * Renders Coo, the pet's own figure from pet-core, into the app's icons and the default avatar:
 * app/icons/icon.png (512), icon.ico (16–256, PNG entries), tray.png (32), tray@2x.png (64),
 * trayTemplate.png (18) and trayTemplate@2x.png (36) for the macOS menu bar (the figure alone in
 * black: the menu bar tints a template image to its own color), and core/seed/avatar.png (512,
 * square, for the console to crop round).
 *
 * The figure is the dark-theme side of the mint palette (white body, mint eyes) on a dark
 * rounded tile, the way the pet looks on the desktop by default. Chromium rasterizes each size
 * separately, so small icons get their own hinting instead of a downscaled 512.
 *
 * Run: `pnpm run build:icons` (electron scripts/make-icons.cjs).
 */
const { app, BrowserWindow } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = join(__dirname, '..');
const ICONS = join(ROOT, 'app', 'icons');
const PET_CORE = pathToFileURL(join(ROOT, 'packages', 'cortico-world-desktop-pet', 'web', 'pet-core.js')).href;
const TILE = '#0D1117', INK = '#FFFFFF', EYE = '#2FD59B';
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const PREVIEW = process.argv.includes('--preview');

/** One tile of `size` px: the figure centred, feet near the bottom; `round` is the corner radius ratio. */
function tileHtml(markup, size, round) {
  // the standing figure spans x 26–230 and y 26–256 in logo units; the view centres it with a margin
  return `<div style="width:${size}px;height:${size}px;border-radius:${size * round}px;background:${TILE};display:grid;place-items:center;overflow:hidden">`
    + `<svg viewBox="-37 -24 330 330" style="width:${size}px;height:${size}px;display:block">${markup}</svg></div>`;
}

app.whenReady().then(async () => {
  const { mini, defaultSkin } = await import(PET_CORE);
  const markup = mini('neutral', defaultSkin());
  const win = new BrowserWindow({ width: 600, height: 600, show: false, transparent: true, backgroundColor: '#00000000', webPreferences: { offscreen: true } });
  const css = `html,body{margin:0;background:transparent}.ink{stroke:${INK}}.inkf{fill:${INK}}.eye{stroke:${EYE}}`;
  const shoot = async (size, round) => {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><style>${css}</style>${tileHtml(markup, size, round)}`)}`);
    await new Promise((r) => setTimeout(r, 150));
    return (await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })).toPNG();
  };

  /** The figure alone, black on transparent, `size` px square. */
  const template = async (size) => {
    const html = `<!doctype html><style>html,body{margin:0;background:transparent}.ink{stroke:#000}.inkf{fill:#000}.eye{stroke:#000}</style>`
      + `<svg viewBox="-12 -12 280 280" style="width:${size}px;height:${size}px;display:block">${markup}</svg>`;
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((r) => setTimeout(r, 150));
    return (await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })).toPNG();
  };
  if (process.argv.includes('--template')) {
    writeFileSync(join(ICONS, 'trayTemplate.png'), await template(18));
    writeFileSync(join(ICONS, 'trayTemplate@2x.png'), await template(36));
    app.quit();
    return;
  }

  if (PREVIEW) {
    writeFileSync(join(ROOT, 'scratch', 'icon-preview.png'), await shoot(512, 56 / 256));
    writeFileSync(join(ROOT, 'scratch', 'icon-preview-32.png'), await shoot(32, 56 / 256));
    app.quit();
    return;
  }
  mkdirSync(ICONS, { recursive: true });
  writeFileSync(join(ICONS, 'icon.png'), await shoot(512, 56 / 256));
  writeFileSync(join(ICONS, 'tray.png'), await shoot(32, 56 / 256));
  writeFileSync(join(ICONS, 'tray@2x.png'), await shoot(64, 56 / 256));
  writeFileSync(join(ICONS, 'trayTemplate.png'), await template(18));
  writeFileSync(join(ICONS, 'trayTemplate@2x.png'), await template(36));
  const entries = [];
  for (const size of ICO_SIZES) entries.push({ size, png: await shoot(size, 56 / 256) });
  writeFileSync(join(ICONS, 'icon.ico'), ico(entries));
  writeFileSync(join(ROOT, 'core', 'seed', 'avatar.png'), await shoot(512, 0));
  console.log(`icons → ${ICONS}; avatar → core/seed/avatar.png`);
  app.quit();
});

/** ICO container with PNG-compressed entries (Windows Vista and later). */
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(({ size, png }, i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, at); head.writeUInt8(size >= 256 ? 0 : size, at + 1);
    head.writeUInt16LE(1, at + 4); head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(png.length, at + 8); head.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...entries.map((e) => e.png)]);
}
