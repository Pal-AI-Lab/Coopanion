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

/** `theme` holds two of the page's palette colours, each `#rrggbb` (`normalizePalette` in console/base/theme/schemes.ts). */
function applySettingsTheme(win, theme) {
  win.setBackgroundColor(theme.color);
  if (process.platform !== 'darwin') win.setTitleBarOverlay({ color: theme.color, symbolColor: theme.symbolColor });
}

module.exports = { settingsChromeOptions, applySettingsTheme };
