import { readdirSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { DELAY_MS, LEAVE_MS, SHOW_MS, mountHints, tipOf, tipWithoutNote } from '../packages/cortico-world-desktop-pet/web/hints.js';

describe('hover hints on the pet pages', () => {
  let win;
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); win?.close(); });

  function page(options = { autoClose: true }) {
    win = new JSDOM('<!doctype html><body><button data-tip="大小"><span class="ic"></span></button><button data-tip="装扮"></button></body>').window;
    // jsdom's timers are the window's: the fake clock drives them through the page's own setTimeout
    win.setTimeout = setTimeout; win.clearTimeout = clearTimeout;
    mountHints(win.document, options);
    const [size, dress] = win.document.querySelectorAll('button');
    const box = win.document.querySelector('.hint');
    const over = (el, from = null) => el.dispatchEvent(new win.MouseEvent('pointerover', { bubbles: true, relatedTarget: from }));
    const out = (el, to = null) => el.dispatchEvent(new win.MouseEvent('pointerout', { bubbles: true, relatedTarget: to }));
    return { size, dress, box, over, out };
  }

  it('shows a moment after the pointer arrives and closes on its own while the pointer stays', () => {
    const { size, box, over } = page();
    over(size);
    vi.advanceTimersByTime(DELAY_MS);
    expect(box.hidden).toBe(false);
    expect(box.textContent).toBe('大小');
    vi.advanceTimersByTime(SHOW_MS - 1);
    expect(box.hidden).toBe(false);
    // fading out, then gone
    vi.advanceTimersByTime(1);
    expect(box.classList.contains('leaving')).toBe(true);
    vi.advanceTimersByTime(LEAVE_MS);
    expect(box.hidden).toBe(true);
    expect(box.classList.contains('leaving')).toBe(false);
    // moving within the button does not bring it back
    over(size.querySelector('.ic'), size);
    vi.advanceTimersByTime(2 * SHOW_MS);
    expect(box.hidden).toBe(true);
  });

  it('shows again once the pointer has left the button and come back', () => {
    const { size, dress, box, over, out } = page();
    over(size);
    vi.advanceTimersByTime(DELAY_MS + SHOW_MS + LEAVE_MS);
    out(size, dress);
    over(size, dress);
    vi.advanceTimersByTime(DELAY_MS);
    expect(box.hidden).toBe(false);
  });

  it('fades out when the pointer leaves, and goes at once on a press', () => {
    const { size, dress, box, over, out } = page();
    over(size);
    vi.advanceTimersByTime(DELAY_MS);
    out(size, null);
    expect(box.classList.contains('leaving')).toBe(true);
    vi.advanceTimersByTime(LEAVE_MS);
    expect(box.hidden).toBe(true);
    over(dress);
    vi.advanceTimersByTime(DELAY_MS);
    dress.dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true }));
    expect(box.hidden).toBe(true);
  });

  it('stays while the pointer does without autoClose, as in the dress window', () => {
    const { size, box, over } = page({});
    over(size);
    vi.advanceTimersByTime(DELAY_MS + 3 * SHOW_MS);
    expect(box.hidden).toBe(false);
  });

  it('does not show beside a button hidden or fading out before the delay ends', () => {
    const { size, dress, box, over } = page();
    over(size);
    size.hidden = true;
    vi.advanceTimersByTime(DELAY_MS);
    expect(box.hidden).toBe(true);
    over(dress);
    dress.classList.add('leaving');
    vi.advanceTimersByTime(DELAY_MS);
    expect(box.hidden).toBe(true);
  });
});

describe('hint text of the pet buttons in every language', () => {
  const dir = new URL('../packages/cortico-world-desktop-pet/web/i18n/', import.meta.url);
  const codes = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
  const tables = {};
  beforeAll(async () => {
    const zh = (await import(new URL('zh.js', dir).href)).default, en = (await import(new URL('en.js', dir).href)).default;
    for (const c of codes) tables[c] = { ...(c === 'zh-Hant' ? zh : en), ...(await import(new URL(`${c}.js`, dir).href)).default };
  });
  // the labels whose part after ' · ' says what a click does; the hint keeps what comes before
  const SWITCHES = ['action.voiceOff', 'action.voiceNotReady', 'action.voiceOn', 'action.roam', 'action.themeDark', 'action.themeLight', 'action.soundOn', 'action.soundOff'];
  const PLAIN = ['action.chat', 'action.chatDoubleClick', 'action.dress', 'action.worlds'];

  it('covers the eleven app languages', () => { expect(codes).toHaveLength(11); });

  it('cuts a switch label at its one dot, keeping the name and the state', () => {
    for (const c of codes) for (const key of SWITCHES) {
      const label = tables[c][key];
      expect(label.split('·'), `${c} ${key}`).toHaveLength(2);
      const tip = tipOf(label);
      expect(tip.length, `${c} ${key}`).toBeGreaterThan(0);
      expect(label.startsWith(tip), `${c} ${key}`).toBe(true);
    }
  });

  it('keeps a label with no dot whole, and the hide button without its closing note', () => {
    for (const c of codes) {
      for (const key of PLAIN) expect(tipOf(tables[c][key]), `${c} ${key}`).toBe(tables[c][key].trim());
      const hide = tables[c]['action.hide'], tip = tipWithoutNote(hide);
      expect(tip.length, c).toBeGreaterThan(0);
      expect(tip.length, c).toBeLessThan(hide.length);
      expect(tip, c).not.toMatch(/[（()）]/);
    }
  });
});
