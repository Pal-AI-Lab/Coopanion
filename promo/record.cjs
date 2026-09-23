/**
 * Records promo/dist/index.html into an MP4, frame by frame: an offscreen Electron window renders
 * `promo.renderAt(i / fps)`, each captured frame goes to ffmpeg as raw BGRA, and the music and the
 * page's sound effects (`promo.sfxWav`, written next to the page as sfx.wav) are mixed at the page's
 * `promo.mix` levels. Run `node promo/build.mjs` first.
 *
 *   electron promo/record.cjs [--out file.mp4] [--from sec] [--to sec] [--fps n] [--size 2560x1440]
 *
 * The page is laid out at 1920×1080; at another --size the frames come from DevTools screenshots
 * with an emulated device pixel ratio, so text and shapes are rasterised at the output size
 * (an offscreen window ignores the scale-factor switch and cannot be larger than the screen).
 *
 * ffmpeg comes from $FFMPEG or PATH.
 */
const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const W = 1920, H = 1080;
const DIST = path.join(__dirname, 'dist');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const OUT = path.resolve(arg('out', path.join(DIST, 'CortiCompanion-promo.mp4')));
const [OW, OH] = arg('size', `${W}x${H}`).split('x').map(Number);

const HI = OW !== W || OH !== H;
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W, height: H, useContentSize: true, show: false, frame: false,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  await win.loadFile(path.join(DIST, 'index.html'), { search: 'record' });
  const page = (js) => win.webContents.executeJavaScript(js);
  const dbg = win.webContents.debugger;
  if (HI) {
    dbg.attach('1.3');
    await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: OW / W, mobile: false });
  }
  const info = await page('document.fonts.ready.then(() => ({ duration: promo.duration, fps: promo.fps, audioStart: promo.audioStart, w: innerWidth * devicePixelRatio, h: innerHeight * devicePixelRatio }))');
  if (Math.round(info.w) !== OW || Math.round(info.h) !== OH) throw new Error(`viewport renders at ${info.w}×${info.h}, expected ${OW}×${OH}`);
  const from = Number(arg('from', 0)), to = Math.min(info.duration, Number(arg('to', info.duration)));
  const fps = Number(arg('fps', info.fps));
  const first = Math.round(from * fps), last = Math.floor(to * fps);
  const mix = await page('promo.mix');
  const SFX = path.join(DIST, 'sfx.wav');
  fs.writeFileSync(SFX, Buffer.from(await page(`promo.sfxWav(${first / fps}, ${last / fps + 1})`), 'base64'));

  const ff = spawn(process.env.FFMPEG || 'ffmpeg', [
    '-y', '-loglevel', 'error',
    ...(HI ? ['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-'] : ['-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-']),
    '-ss', String(info.audioStart + first / fps), '-i', path.join(DIST, 'assets', 'bgm.mp3'),
    '-i', SFX,
    '-filter_complex', `[1:a]volume=${mix.music}[m];[2:a]pan=stereo|c0=c0|c1=c0[s];[m][s]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const closed = new Promise((resolve) => ff.on('close', resolve));

  const started = Date.now();
  for (let i = first; i <= last; i++) {
    // two animation frames so the new DOM state is painted before the capture
    await page(`promo.renderAt(${i / fps}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    let frame;
    if (HI) frame = Buffer.from((await dbg.sendCommand('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })).data, 'base64');
    else {
      let img = await win.webContents.capturePage();
      const size = img.getSize();
      if (size.width !== W || size.height !== H) img = img.resize({ width: W, height: H, quality: 'best' });
      frame = img.toBitmap();
    }
    if (!ff.stdin.write(frame)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((i - first) % 150 === 0) process.stdout.write(`frame ${i}/${last}  ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
  }
  ff.stdin.end();
  const code = await closed;
  process.stdout.write(code === 0 ? `wrote ${OUT}\n` : `ffmpeg exited with ${code}\n`);
  app.exit(code === 0 ? 0 : 1);
}).catch((err) => { console.error(err); app.exit(1); });
