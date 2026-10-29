import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it } from 'vitest';

const { registerChatExport } = createRequire(import.meta.url)('../app/chat-export.cjs');
let dir, handlers, win, event, selection, revealed;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'coo-chat-export-'));
  handlers = new Map();
  win = { webContents: { mainFrame: {} } };
  event = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
  selection = { canceled: false, filePath: join(dir, 'conversation.md') };
  revealed = [];
  registerChatExport({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    dialog: { showSaveDialog: async () => selection },
    shell: { showItemInFolder: (file) => revealed.push(file) },
    getWindow: () => win, documents: () => dir,
  });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const save = (data = { name: 'coopanion-chat-all.md', text: '你好\nこんにちは\n**hello**' }, sender = event) => handlers.get('settings:export-chat')(sender, data);
const reveal = (sender = event) => handlers.get('settings:reveal-chat-export')(sender);

it('saves the chosen transcript as UTF-8 and reveals only the last successful export', async () => {
  await reveal();
  expect(revealed).toEqual([]);
  const text = '你好\nこんにちは\n**hello**';
  expect(await save({ name: 'coopanion-chat-2026-10-22.md', text })).toBe(true);
  expect(readFileSync(selection.filePath, 'utf8')).toBe(text);
  await reveal();
  expect(revealed).toEqual([selection.filePath]);
  selection = { canceled: true };
  expect(await save()).toBe(false);
  await reveal();
  expect(revealed[1]).toBe(revealed[0]);
});

it('rejects another renderer and a child frame before opening a save dialog or revealing a file', async () => {
  for (const sender of [{ ...event, sender: {} }, { ...event, senderFrame: {} }]) {
    await expect(save(undefined, sender)).rejects.toThrow('sender');
    expect(() => reveal(sender)).toThrow('sender');
  }
  expect(revealed).toEqual([]);
});

it('rejects paths supplied as export names and reports write failures', async () => {
  await expect(save({ name: '../outside.md', text: 'text' })).rejects.toThrow('Invalid chat export');
  selection = { canceled: false, filePath: join(dir, 'missing', 'chat.md') };
  await expect(save()).rejects.toThrow();
  reveal();
  expect(revealed).toEqual([]);
});
