import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderConfirmation } from '../packages/cortico-world-desktop-pet/web/confirm-view.js';

const html = readFileSync(new URL('../packages/cortico-world-desktop-pet/web/confirm.html', import.meta.url), 'utf8');
const pages = [];
afterEach(() => { for (const page of pages.splice(0)) page.close(); });

function preview(patch = {}) {
  const dom = new JSDOM(html), answers = [];
  pages.push(dom.window);
  const request = { caption: 'Computer use', question: 'May Coo use your computer?',
    options: ['Allow', 'Deny'], theme: 'dark', ...patch };
  renderConfirmation(dom.window.document, request, index => answers.push(index), 'Close');
  return { doc: dom.window.document, win: dom.window, answers };
}

describe('standalone permission card', () => {
  it.each(['light', 'dark'])('renders the %s theme and focuses refusal without answering', theme => {
    const { doc, answers } = preview({ theme });
    expect(doc.documentElement.dataset.theme).toBe(theme);
    expect(doc.querySelector('#caption').textContent).toBe('Computer use');
    expect(doc.querySelector('#question').textContent).toBe('May Coo use your computer?');
    expect(doc.activeElement.textContent).toBe('Deny');
    expect(answers).toEqual([]);
  });

  it('keeps localized request text literal, including command snippets', () => {
    const { doc } = preview({ caption: '电脑操作', question: '<img src=x onerror="alert(1)">\n可以吗？', options: ['可以', '这次不行'] });
    expect(doc.title).toBe('电脑操作');
    expect(doc.querySelector('#question').textContent).toBe('<img src=x onerror="alert(1)">\n可以吗？');
    expect(doc.querySelector('#question img')).toBeNull();
    expect([...doc.querySelectorAll('.choice')].map(b => b.textContent)).toEqual(['这次不行', '可以']);
  });

  it.each([0, 1, 2])('returns choice %s once, preserving three-choice indices', index => {
    const { doc, answers } = preview({ options: ['Allow', 'Always allow', 'Deny'] });
    [...doc.querySelectorAll('.choice')].find(b => b.textContent === ['Allow', 'Always allow', 'Deny'][index]).click();
    doc.querySelector('.allow').click();
    expect(answers).toEqual([index]);
    expect([...doc.querySelectorAll('button')].every(b => b.disabled)).toBe(true);
  });

  it.each(['close', 'Escape'])('dismisses with %s without approving', method => {
    const { doc, win, answers } = preview();
    if (method === 'close') doc.querySelector('#close').click();
    else doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
    doc.querySelector('.allow').click();
    expect(answers).toEqual([null]);
    expect(doc.querySelector('#close').getAttribute('aria-label')).toBe('Close');
  });
});
