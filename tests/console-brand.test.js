// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sidebarBrand } from '../console/rail/brand.ts';

let life;
beforeEach(() => {
  vi.useFakeTimers();
  life = new AbortController();
});
afterEach(() => {
  life.abort();
  document.body.replaceChildren();
  vi.useRealTimers();
});

function mount() {
  const brand = sidebarBrand(document, life.signal);
  document.body.append(brand);
  return brand;
}
const hat = (brand) => brand.querySelector('.companion-brand-hat');

describe('Christmas wordmark', () => {
  it.each([
    [2026, 11, 24, false],
    [2026, 12, 23, false],
    [2026, 12, 24, true],
    [2026, 12, 25, true],
    [2026, 12, 26, false],
    [2027, 1, 24, false],
    [2027, 12, 24, true],
  ])('uses the local calendar date %i/%i/%i (hat: %s)', (year, month, day, visible) => {
    vi.setSystemTime(new Date(year, month - 1, day, 0, 0, 0));
    const brand = mount();
    expect(Boolean(hat(brand))).toBe(visible);
    expect(brand.getAttribute('aria-label')).toBe('Coopanion');
    if (visible) expect(hat(brand).parentElement).toBe(brand.querySelector('.companion-brand'));
  });

  it('adds the hat at December 24 midnight and removes it at December 26 midnight without remounting', () => {
    vi.setSystemTime(new Date(2026, 11, 23, 23, 59, 59, 999));
    const brand = mount();
    expect(hat(brand)).toBeNull();
    vi.advanceTimersByTime(1);
    const original = hat(brand);
    expect(original).not.toBeNull();
    vi.advanceTimersByTime(48 * 60 * 60 * 1000 - 1);
    expect(hat(brand)).toBe(original);
    vi.advanceTimersByTime(1);
    expect(hat(brand)).toBeNull();
  });

  it('rechecks the date on focus and visibility changes', () => {
    vi.setSystemTime(new Date(2026, 11, 23));
    const brand = mount();
    vi.setSystemTime(new Date(2026, 11, 24));
    window.dispatchEvent(new Event('focus'));
    expect(hat(brand)).not.toBeNull();
    vi.setSystemTime(new Date(2026, 11, 26));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(hat(brand)).toBeNull();
  });

  it('stops updating after the rail is disposed', () => {
    vi.setSystemTime(new Date(2026, 11, 23, 23, 59, 59, 999));
    const brand = mount();
    life.abort();
    vi.advanceTimersByTime(1);
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(hat(brand)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
