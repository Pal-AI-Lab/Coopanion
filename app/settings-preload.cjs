/**
 * Preload of the settings window: the page reads its language from localStorage
 * (`cortico.console.language`) when it loads (console/base/language.ts); here that is the app
 * language, written before each page load.
 *
 * window.coopanionWindow supplies the platform and sends the page palette to the native window controls.
 *
 * In a build that updates itself (app/updater.cjs), the page also gets `window.coopanionUpdate`: the
 * updater's last step and its later ones, which the version line shows (console/features/release.ts).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('coopanionWindow', {
  platform: process.platform,
  setTheme: (theme) => ipcRenderer.send('settings:theme', theme),
});

try {
  localStorage.setItem('cortico.console.language', ipcRenderer.sendSync('settings:language'));
} catch { /* a page without storage (the starting page) */ }

if (ipcRenderer.sendSync('settings:update').auto) {
  contextBridge.exposeInMainWorld('coopanionUpdate', {
    step: () => ipcRenderer.sendSync('settings:update').step,
    onStep: (listener) => {
      const handler = (_e, step) => listener(step);
      ipcRenderer.on('settings:update', handler);
      return () => ipcRenderer.removeListener('settings:update', handler);
    },
  });
}
