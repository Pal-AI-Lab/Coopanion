// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new NodeURL('../packages/cortico-world-desktop-pet/web/pet.css', import.meta.url), 'utf8');

describe('online pet rendering', () => {
  it('gives a remote figure the same full-stage frame as the local figure', () => {
    document.head.replaceChildren();
    document.body.innerHTML = '<div class="online-layer"><div class="online-figure"><div class="figure-clip"><iframe class="figure-frame"></iframe></div></div></div>';
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const frame = document.querySelector('.online-layer iframe');
    const clip = document.querySelector('.online-layer .figure-clip');
    expect(getComputedStyle(frame).position).toBe('absolute');
    expect(getComputedStyle(frame).width).toBe('100%');
    expect(getComputedStyle(frame).height).toBe('100%');
    expect(getComputedStyle(clip).position).toBe('absolute');
    expect(getComputedStyle(clip).inset).toBe('0px');
  });
});
