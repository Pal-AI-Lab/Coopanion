// @vitest-environment jsdom
/** Hover hints (`console/base/ui/hover-hint.ts`) and the extension info page's pictures (`extensions/gallery.ts`). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountHoverHints } from '../console/base/ui/hover-hint.ts';
import { gallery, takeImages } from '../console/advanced/features/extensions/gallery.ts';

const lives = [];
afterEach(() => { lives.splice(0).forEach(life => life.abort()); document.body.replaceChildren(); vi.useRealTimers(); });
const mount = () => { const life = new AbortController(); lives.push(life); mountHoverHints(document, life.signal); return document.querySelector('.hover-hint'); };
const enter = (el) => el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));

describe('hover hints', () => {
  it('shows a title in the console box instead of the system tooltip, a moment after the pointer arrives', () => {
    vi.useFakeTimers();
    const box = mount();
    const button = document.createElement('button'); button.title = '刷新';
    document.body.append(button);
    enter(button);
    expect(button.hasAttribute('title')).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('刷新');
    expect(box.classList.contains('hidden')).toBe(true);
    vi.advanceTimersByTime(500);
    expect(box.classList.contains('hidden')).toBe(false);
    expect(box.textContent).toBe('刷新');
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(box.classList.contains('hidden')).toBe(true);
  });

  it('only takes titles away in the rail', () => {
    vi.useFakeTimers();
    const box = mount();
    const rail = document.createElement('nav'); rail.id = 'rail';
    const dot = document.createElement('span'); dot.title = '主链路 正常'; dot.setAttribute('aria-label', '主链路 正常');
    rail.append(dot); document.body.append(rail);
    enter(dot);
    vi.advanceTimersByTime(500);
    expect(dot.hasAttribute('title')).toBe(false);
    expect(box.classList.contains('hidden')).toBe(true);
  });
});

describe('extension pictures', () => {
  it('takes https pictures out of a description and leaves the rest', () => {
    const { text, images } = takeImages('上面是截图\n\n![主界面](https://example.com/a.png)\n\n![](http://example.com/b.png) 结尾');
    expect(images).toEqual([{ src: 'https://example.com/a.png', alt: '主界面' }]);
    expect(text).toBe('上面是截图\n\n![](http://example.com/b.png) 结尾');
    expect(takeImages('没有图片').text).toBe('没有图片');
  });

  it('opens a picture in the lightbox and pages through them', () => {
    const life = new AbortController(); lives.push(life);
    HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
    HTMLDialogElement.prototype.close ??= function () { this.open = false; this.dispatchEvent(new Event('close')); };
    const row = gallery(document, [{ src: 'https://example.com/1.png', alt: '' }, { src: 'https://example.com/2.png', alt: '二' }], life.signal);
    document.body.append(row);
    const shots = row.querySelectorAll('.extension-gallery-shot');
    expect(shots).toHaveLength(2);
    shots[1].click();
    const lightbox = document.querySelector('.extension-lightbox');
    expect(lightbox.querySelector('img').alt).toBe('二');
    expect(lightbox.querySelector('.extension-lightbox-count').textContent).toBe('2 / 2');
    lightbox.querySelector('.extension-lightbox-nav.is-next').click();
    expect(lightbox.querySelector('.extension-lightbox-count').textContent).toBe('1 / 2');
    lightbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.extension-lightbox')).toBeNull();
  });
});
