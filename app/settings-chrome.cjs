/** Native window controls over the settings page's 36-DIP title bar. */
const TITLEBAR_HEIGHT = 36;

function settingsChromeOptions(platform) {
  return {
    titleBarStyle: 'hidden',
    ...(platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 11 }, titleBarOverlay: { height: TITLEBAR_HEIGHT } }
      : { titleBarOverlay: { height: TITLEBAR_HEIGHT, color: '#ecedec', symbolColor: '#5c5c60' } }),
  };
}

function applySettingsTheme(win, event, theme) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return;
  if (!/^#[0-9a-f]{6}$/i.test(theme?.color) || !/^#[0-9a-f]{6}$/i.test(theme?.symbolColor)) return;
  win.setBackgroundColor(theme.color);
  if (process.platform !== 'darwin') win.setTitleBarOverlay({ color: theme.color, symbolColor: theme.symbolColor });
}

module.exports = { TITLEBAR_HEIGHT, settingsChromeOptions, applySettingsTheme };
