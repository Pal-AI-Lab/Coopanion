/**
 * Records promo/dist/index.html into an MP4, frame by frame: an offscreen Electron window renders
 * `promo.renderAt(i / fps)`, each captured frame goes to ffmpeg as raw BGRA, and the music track
 * is muxed in. Run `node promo/build.mjs` first.
 *
 *   electron promo/record.cjs [--out file.mp4] [--from sec] [--to sec]
 *
 * ffmpeg comes from $FFMPEG or PATH.
 */
const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

const W = 1920, H = 1080;
const DIST = path.join(__dirname, 'dist');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const OUT = path.resolve(arg('out', path.join(DIST, 'CortiCompanion-promo.mp4')));

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W, height: H, useContentSize: true, show: false, frame: false,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  await win.loadFile(path.join(DIST, 'index.html'), { search: 'record' });
  const page = (js) => win.webContents.executeJavaScript(js);
  const info = await page('document.fonts.ready.then(() => ({ duration: promo.duration, fps: promo.fps, audioStart: promo.audioStart, w: innerWidth, h: innerHeight }))');
  if (info.w !== W || info.h !== H) throw new Error(`viewport is ${info.w}×${info.h}, expected ${W}×${H}`);
  const from = Number(arg('from', 0)), to = Math.min(info.duration, Number(arg('to', info.duration)));
  const first = Math.round(from * info.fps), last = Math.floor(to * info.fps);

  const ff = spawn(process.env.FFMPEG || 'ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${W}x${H}`, '-r', String(info.fps), '-i', '-',
    '-ss', String(info.audioStart + first / info.fps), '-i', path.join(DIST, 'assets', 'bgm.mp3'),
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const closed = new Promise((resolve) => ff.on('close', resolve));

  const started = Date.now();
  for (let i = first; i <= last; i++) {
    // two animation frames so the new DOM state is painted before the capture
    await page(`promo.renderAt(${i / info.fps}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    let img = await win.webContents.capturePage();
    const size = img.getSize();
    if (size.width !== W || size.height !== H) img = img.resize({ width: W, height: H, quality: 'best' });
    if (!ff.stdin.write(img.toBitmap())) await new Promise((r) => ff.stdin.once('drain', r));
    if ((i - first) % 150 === 0) process.stdout.write(`frame ${i}/${last}  ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
  }
  ff.stdin.end();
  const code = await closed;
  process.stdout.write(code === 0 ? `wrote ${OUT}\n` : `ffmpeg exited with ${code}\n`);
  app.exit(code === 0 ? 0 : 1);
}).catch((err) => { console.error(err); app.exit(1); });
