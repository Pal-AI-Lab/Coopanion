const { writeFile } = require('node:fs/promises');
const { join } = require('node:path');

/** Only the settings main frame can save a transcript or reveal its last saved file. */
function registerChatExport({ ipcMain, dialog, shell, getWindow, documents }) {
  let lastFile;
  const senderWindow = (event) => {
    const win = getWindow();
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) {
      throw new Error('Invalid chat export sender');
    }
    return win;
  };
  ipcMain.handle('settings:export-chat', async (event, data) => {
    const win = senderWindow(event);
    if (!data || typeof data.text !== 'string' || typeof data.name !== 'string'
      || !/^coopanion-chat-(?:all|\d{4}-\d{2}-\d{2})\.md$/.test(data.name)) {
      throw new Error('Invalid chat export');
    }
    const result = await dialog.showSaveDialog(win, { defaultPath: join(documents(), data.name) });
    if (result.canceled || !result.filePath) return false;
    await writeFile(result.filePath, data.text, 'utf8');
    lastFile = result.filePath;
    return true;
  });
  ipcMain.handle('settings:reveal-chat-export', (event) => {
    senderWindow(event);
    if (lastFile) shell.showItemInFolder(lastFile);
  });
}

module.exports = { registerChatExport };
