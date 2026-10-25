import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { applySettingsTheme } = require('../app/settings-chrome.cjs');

it('only applies complete palettes from the settings window main frame', () => {
  const webContents = { mainFrame: {} };
  const win = { webContents, background: null, overlay: null,
    setBackgroundColor(color) { this.background = color; },
    setTitleBarOverlay(overlay) { this.overlay = overlay; },
  };
  const fromMain = { sender: webContents, senderFrame: webContents.mainFrame };
  const theme = { color: '#123456', symbolColor: '#abcdef' };
  for (const event of [{ sender: {}, senderFrame: webContents.mainFrame }, { sender: webContents, senderFrame: {} }]) {
    applySettingsTheme(win, event, theme);
    expect(win.background).toBeNull();
  }
  for (const invalid of [null, {}, { ...theme, color: 'bad' }, { color: theme.color }]) {
    applySettingsTheme(win, fromMain, invalid);
    expect(win.background).toBeNull();
  }
  applySettingsTheme(null, fromMain, theme);
  applySettingsTheme(win, fromMain, theme);
  expect(win.background).toBe(theme.color);
  if (process.platform !== 'darwin') expect(win.overlay).toEqual(theme);
});
