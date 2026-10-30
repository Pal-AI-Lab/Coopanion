// @vitest-environment jsdom
/** The extension page's Markdown (descriptions, comments, release notes) comes from third parties: raw HTML stays text, links are http(s) only. */
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../console/advanced/features/extensions/markdown.ts';

const render = (source) => { const box = document.createElement('div'); box.append(renderMarkdown(document, source)); return box; };
describe('renderMarkdown', () => {
  it('keeps raw HTML in the package description as text', () => {
    const box = render('<img src=x onerror="alert(1)"> **粗体**');
    expect(box.querySelector('img')).toBeNull();
    expect(box.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(box.querySelector('strong')?.textContent).toBe('粗体');
  });
  it('links only http(s) and opens them in a new window', () => {
    const box = render('[好](https://example.com) [坏](javascript:alert(1))');
    const links = [...box.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://example.com']);
    expect(links[0].target).toBe('_blank');
    expect(box.textContent).toContain('[坏](javascript:alert(1))');
  });
  it('closes a code block only on a fence alone on its line, so text written right after one still shows', () => {
    const box = render(['```markdown', '', '```官方大佬，此为求助帖'].join('\n'));
    expect(box.querySelectorAll('pre')).toHaveLength(1);
    expect(box.querySelector('pre').textContent).toContain('官方大佬，此为求助帖');
    const closed = render(['```', 'code', '```  ', 'after'].join('\n'));
    expect(closed.querySelector('pre').textContent).toBe('code');
    expect(closed.querySelector('p').textContent).toBe('after');
  });
});
