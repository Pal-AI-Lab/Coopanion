// Isolated Chromium text field for the Windows IME test. Only its active window changes layout.
const { app, BrowserWindow } = require('electron');
const { setTimeout: sleep } = require('node:timers/promises');
const koffi = require('koffi');
const user = koffi.load('user32.dll');
const getLayout = user.func('uintptr_t __stdcall GetKeyboardLayout(uint32_t thread)');
const getLayouts = user.func('int __stdcall GetKeyboardLayoutList(int count, _Out_ uintptr_t *layouts)');
const activate = user.func('uintptr_t __stdcall ActivateKeyboardLayout(uintptr_t layout, uint32_t flags)');
const foreground = user.func('uintptr_t __stdcall GetForegroundWindow()');
const imeWindow = koffi.load('imm32.dll').func('uintptr_t __stdcall ImmGetDefaultIMEWnd(uintptr_t window)');
const message = user.func('intptr_t __stdcall SendMessageW(uintptr_t window, uint32_t msg, uintptr_t wparam, intptr_t lparam)');

app.whenReady().then(async () => {
  const scenario = process.argv.find((arg) => arg.startsWith('--scenario=')).slice('--scenario='.length);
  const win = new BrowserWindow({ width: 460, height: 240, show: false });
  const second = scenario === 'switch' ? new BrowserWindow({ width: 420, height: 220, show: false }) : null;
  if (second) await second.loadURL('data:text/html,<textarea autofocus></textarea>');
  const html = scenario === 'form'
    ? '<form><input autofocus><button>Submit</button></form><script>let submits = 0; document.querySelector("form").onsubmit = e => { e.preventDefault(); submits++; }</script>'
    : '<textarea autofocus></textarea>';
  await win.loadURL('data:text/html,' + encodeURIComponent(html));
  win.show();
  win.focus();
  await win.webContents.executeJavaScript('document.querySelector("textarea,input").focus()');
  if (second) {
    win.webContents.on('page-title-updated', (_event, title) => {
      if (title === 'first input') { second.show(); second.focus(); }
    });
    await win.webContents.executeJavaScript('document.addEventListener("input", () => { document.title = "first input"; }, { once: true })');
  }
  const native = win.getNativeWindowHandle();
  const handle = native.length === 8 ? native.readBigUInt64LE() : BigInt(native.readUInt32LE());
  const count = getLayouts(0, null);
  const layouts = new BigUint64Array(count);
  getLayouts(count, layouts);
  const layout = layouts.find((value) => (value & 0xffffn) === 0x0404n);
  const previous = getLayout(0);
  if (layout) activate(layout, 0);
  const ime = imeWindow(handle);
  const open = ime && message(ime, 0x0283, 5, 0);
  if (layout && ime && !open) message(ime, 0x0283, 6, 1);
  process.on('disconnect', () => {
    if (layout && ime && !open) message(ime, 0x0283, 6, 0);
    activate(previous, 0);
    app.quit();
  });
  const unexpectedBlur = () => {
    setImmediate(() => { if (process.connected && !win.isFocused() && !second?.isFocused()) process.send('focus lost'); });
  };
  win.on('blur', unexpectedBlur);
  second?.on('blur', unexpectedBlur);
  process.on('message', async (request) => {
    if (request === 'focus') {
      win.focus();
      win.webContents.focus();
      const deadline = Date.now() + 3000;
      while (BigInt(foreground()) !== handle && Date.now() < deadline) await sleep(50);
      process.send(BigInt(foreground()) === handle);
    }
    else process.send({
      text: await win.webContents.executeJavaScript('document.querySelector("textarea,input").value'),
      submits: scenario === 'form' ? await win.webContents.executeJavaScript('submits') : 0,
      other: second ? await second.webContents.executeJavaScript('document.querySelector("textarea").value') : null,
      switched: second?.isFocused() ?? false,
    });
  });
  process.send({ available: Boolean(layout), active: Boolean(layout && BigInt(getLayout(0)) === layout && ime && message(ime, 0x0283, 5, 0)) });
}).catch((error) => { console.error(error); app.exit(1); });
