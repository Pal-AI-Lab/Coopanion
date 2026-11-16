import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../app/main.cjs', import.meta.url), 'utf8');
const start = main.indexOf('/** Whether the pet is on the desktop, as last read');
const code = main.slice(start, main.indexOf('function trayItems()', start));
const flush = () => new Promise((resolve) => setTimeout(resolve));

/** The tray's show/hide code from main.cjs against a World whose `pet-shown` comes in the order under test. */
function tray(onDesktop, order, refuse = false) {
  const world = { onDesktop };
  const handlers = {};
  const menus = [];
  const change = (shown) => {
    world.onDesktop = shown;
    if (order === 'before the reply') handlers['pet-shown'](shown);
    else setTimeout(() => handlers['pet-shown'](shown));
  };
  const core = { state: 'running', on: (name, fn) => { handlers[name] = fn; } };
  const panel = async (_page, _panel, method) => {
    if (method === 'state') return { onDesktop: world.onDesktop };
    if (method === 'hideWindow') {
      if (refuse) return null;
      change(false);
    }
    return {};
  };
  const showPet = async () => change(true);
  const refreshTray = () => menus.push(api.entry());
  const api = new Function('core', 'panel', 'showPet', 'refreshTray', `${code}\nreturn { togglePet, entry: () => petOnDesktop };`)(core, panel, showPet, refreshTray);
  return { ...api, world, menus };
}

describe('the tray entry that shows or hides the pet', () => {
  it.each([
    ['hiding', 'before the reply', true],
    ['hiding', 'after the reply', true],
    ['showing', 'before the reply', false],
    ['showing', 'after the reply', false],
  ])('follows the World when %s and pet-shown comes %s', async (_action, order, onDesktop) => {
    const t = tray(onDesktop, order);
    await t.togglePet();
    await flush();
    expect(t.world.onDesktop).toBe(!onDesktop);
    expect(t.entry()).toBe(t.world.onDesktop);
    expect(t.menus.at(-1)).toBe(t.world.onDesktop);
  });

  it('keeps the entry when the Core refuses to hide the pet', async () => {
    const t = tray(true, 'after the reply', true);
    await t.togglePet();
    await flush();
    expect(t.entry()).toBe(true);
  });
});
