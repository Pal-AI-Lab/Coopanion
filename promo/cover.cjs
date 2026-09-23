/**
 * Screenshots the cover page (promo/dist/cover.html, from `node promo/build.mjs`) to a PNG. The page
 * is laid out at 1920×1080; --size sets the emulated device pixel ratio so it is rasterised at
 * the output size.
 *
 *   electron promo/cover.cjs [--size 2560x1440] [--out cover.png] [--page file.html]
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const W = 1920, H = 1080;
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const [OW, OH] = arg('size', '2560x1440').split('x').map(Number);
const PAGE = path.resolve(arg('page', path.join(__dirname, 'dist', 'cover.html')));
const OUT = path.resolve(arg('out', path.join(__dirname, 'dist', 'cover.png')));

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H, useContentSize: true, show: false, frame: false, webPreferences: { offscreen: true } });
  await win.loadFile(PAGE);
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: OW / W, mobile: false });
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))');
  const { data } = await dbg.sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT, Buffer.from(data, 'base64'));
  process.stdout.write(`wrote ${OUT}\n`);
  app.exit(0);
}).catch((err) => { console.error(err); app.exit(1); });
