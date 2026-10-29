/** Owns a permission question across the pet bubble and an independent approval window. */
const { join } = require('node:path');

function createConfirmations({ BrowserWindow, screen, getPet, origin, onStandalone, platform = process.platform }) {
  const pending = new Map();
  const finish = (id, index) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (entry.window && !entry.window.isDestroyed()) entry.window.destroy();
    entry.resolve(index);
  };
  const closeAll = () => { for (const [id] of pending) finish(id, null); };
  const show = (id, entry) => {
    if (entry.window) return;
    const pet = getPet(), bounds = pet?.getBounds();
    const area = (bounds ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay()).workArea;
    const margin = 16;
    const width = Math.min(420, area.width - margin * 2), height = Math.min(248, area.height - margin * 2);
    const win = entry.window = new BrowserWindow({
      width, height,
      x: area.x + area.width - width - margin, y: area.y + area.height - height - margin,
      title: entry.request.caption, frame: false, transparent: true, backgroundColor: '#00000000',
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      alwaysOnTop: true, hasShadow: true, show: false,
      webPreferences: { preload: join(__dirname, 'confirm-preload.cjs'), contextIsolation: true, sandbox: true },
    });
    if (platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', e => e.preventDefault());
    win.webContents.on('render-process-gone', () => finish(id, null));
    win.webContents.on('did-fail-load', () => finish(id, null));
    win.once('closed', () => finish(id, null));
    win.once('ready-to-show', () => { if (pending.get(id) === entry) win.showInactive(); });
    onStandalone(id);
    void win.loadURL(`${origin}/confirm`).catch(() => finish(id, null));
  };
  return {
    ask(request) {
      if (!request || typeof request.id !== 'string' || typeof request.question !== 'string'
        || typeof request.caption !== 'string' || !Array.isArray(request.options)
        || ![2, 3].includes(request.options.length) || !request.options.every(x => typeof x === 'string')
        || pending.has(request.id)) return Promise.resolve(null);
      return new Promise(resolve => {
        const entry = { request, resolve, window: null };
        pending.set(request.id, entry);
        if (!getPet()?.isVisible()) show(request.id, entry);
      });
    },
    hidden() { for (const [id, entry] of pending) show(id, entry); },
    focused() { return [...pending.values()].some(({ window }) => window && !window.isDestroyed() && window.isFocused()); },
    watchPet(pet) {
      pet.webContents.on('render-process-gone', closeAll);
      pet.webContents.on('destroyed', closeAll);
      pet.webContents.on('did-start-navigation', details => {
        if (details.isMainFrame && !details.isSameDocument) closeAll();
      });
    },
    answerBubble(id, index) {
      const entry = pending.get(id);
      if (entry && !entry.window && getPet()?.isVisible()) finish(id, validIndex(entry, index));
    },
    state(sender) { return [...pending.values()].find(entry => entry.window?.webContents === sender)?.request ?? null; },
    answerWindow(sender, index) {
      for (const [id, entry] of pending) if (entry.window?.webContents === sender) finish(id, validIndex(entry, index));
    },
    close: id => finish(id, null),
    closeAll,
  };
}

function validIndex(entry, index) {
  return Number.isInteger(index) && index >= 0 && index < entry.request.options.length ? index : null;
}

module.exports = { createConfirmations };
