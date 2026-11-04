import { describe, expect, it } from 'vitest';
import { isShortLink, parseVideoRef, videoUrl } from '../src/video.ts';

describe('parseVideoRef', () => {
  it('reads BV ids, av ids and page URLs', () => {
    expect(parseVideoRef('BV1xx411c7mD')).toEqual({ id: 'BV1xx411c7mD', page: 1, url: videoUrl('BV1xx411c7mD', 1) });
    expect(parseVideoRef('看看 av170001 这个')?.id).toBe('av170001');
    expect(parseVideoRef('https://www.bilibili.com/video/BV1xx411c7mD/?spm_id_from=a&p=3')?.page).toBe(3);
  });

  it('the page argument wins over the URL', () => {
    expect(parseVideoRef('https://www.bilibili.com/video/BV1xx411c7mD?p=3', 2)?.url).toBe(videoUrl('BV1xx411c7mD', 2));
  });

  it('returns null without an id', () => {
    expect(parseVideoRef('https://www.bilibili.com/')).toBeNull();
    expect(parseVideoRef('BV123')).toBeNull();
  });

  it('recognizes short links', () => {
    expect(isShortLink('https://b23.tv/abcDEF')).toBe(true);
    expect(isShortLink('https://www.bilibili.com/video/BV1xx411c7mD')).toBe(false);
  });
});
