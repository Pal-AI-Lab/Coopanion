import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { bindAppearance } from '../packages/cortico-world-desktop-pet/web/appearance.js';

function fixture(referrer = 'http://127.0.0.1:17788/') {
  const dom = new JSDOM('<html data-theme="dark"></html>', { url: 'http://127.0.0.1:7797/dress?appearance=light', ...(referrer ? { referrer } : {}) });
  const { window: win } = dom;
  const dispose = bindAppearance(win.document, win);
  const send = (origin, mode, source = win.parent) => win.dispatchEvent(new win.MessageEvent('message', { origin, source, data: { type: 'companion:appearance', mode } }));
  return { dom, win, dispose, send };
}

describe('embedded dressing appearance', () => {
  it('follows the console without changing the pet palette, and removes its listener', () => {
    const { dom, win, dispose, send } = fixture();
    expect(win.document.documentElement.dataset.uiTheme).toBe('light');
    send('http://127.0.0.1:17788', 'dark');
    expect(win.document.documentElement.dataset.uiTheme).toBe('dark');
    send('http://127.0.0.1:17788', 'light');
    expect(win.document.documentElement.dataset.theme).toBe('dark');
    dispose(); send('http://127.0.0.1:17788', 'dark');
    expect(win.document.documentElement.dataset.uiTheme).toBe('light');
    dom.window.close();
  });
  it('rejects other origins, ports, sources and invalid appearance values', () => {
    const { dom, win, send } = fixture();
    send('http://evil.test', 'dark');
    send('http://127.0.0.1:9999', 'dark');
    send('http://127.0.0.1:17788', 'dark', null);
    send('http://127.0.0.1:17788', 'invalid');
    expect(win.document.documentElement.dataset.uiTheme).toBe('light');
    dom.window.close();
  });
  it('does not accept theme messages without an embedding console referrer', () => {
    const { dom, win, send } = fixture('');
    send('http://127.0.0.1:17788', 'dark');
    expect(win.document.documentElement.dataset.uiTheme).toBe('light');
    dom.window.close();
  });
});
