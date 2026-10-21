import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { linked, urlRanges } from '../packages/cortico-world-desktop-pet/web/ui.js';

const urls = (text) => urlRanges(text).map(([s, e]) => text.slice(s, e));
const doc = new JSDOM('').window.document;
const html = (text, n) => {
  const p = doc.createElement('p');
  p.append(linked(text, n, doc));
  return p.innerHTML;
};

describe('addresses in what the pet says', () => {
  it('ends an address at Chinese text or a space, and leaves out the sentence punctuation', () => {
    expect(urls('可以来https://github.com/Pal-AI-Lab/Coopanion给我们点个星星！')).toEqual(['https://github.com/Pal-AI-Lab/Coopanion']);
    expect(urls('See https://example.com/a?b=1&c=2. Then http://x.org/, ok')).toEqual(['https://example.com/a?b=1&c=2', 'http://x.org/']);
  });

  it('keeps a closing bracket the address opened and drops one that only closes the sentence', () => {
    expect(urls('(see https://en.wikipedia.org/wiki/Mona_(film))')).toEqual(['https://en.wikipedia.org/wiki/Mona_(film)']);
    expect(urls('(https://example.com/x)')).toEqual(['https://example.com/x']);
  });

  it('links only http and https addresses written out in full', () => {
    expect(urls('javascript:alert(1) ftp://x.org [官网](https://example.com) https://')).toEqual(['https://example.com']);
  });

  it('links an address once it is typed out in full, with the address as both its text and its target', () => {
    const text = '在这里 https://example.com/a 看';
    expect(html(text, 15)).toBe('在这里 https://exa');
    expect(html(text)).toBe('在这里 <a href="https://example.com/a" target="_blank" rel="noopener noreferrer">https://example.com/a</a> 看');
  });
});
