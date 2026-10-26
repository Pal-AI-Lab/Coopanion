// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { mountRelease } from '../console/features/release.ts';
import { S } from '../console/features/strings.ts';

/** The preload's bridge in a build that updates itself (app/settings-preload.cjs), driven by the test. */
function updater(first) {
  const listeners = new Set();
  window.coopanionUpdate = {
    step: () => first,
    onStep: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  return { tell: (step) => listeners.forEach((l) => l(step)), listening: () => listeners.size };
}

afterEach(() => { delete window.coopanionUpdate; document.body.replaceChildren(); });

describe('the version line of a build that updates itself', () => {
  it('shows the updater\'s step in place of a download link, and a link to the releases only once a download failed', () => {
    const run = updater(null);
    const brand = document.createElement('div');
    const life = new AbortController();
    mountRelease(document, brand, life.signal);
    expect(brand.querySelector('.release-hint')).toBeNull();

    run.tell({ phase: 'downloading', version: '9.9.9' });
    expect(brand.querySelector('.release-hint').textContent).toBe(S.updateDownloadingShort('9.9.9'));
    expect(brand.querySelector('a.release-hint')).toBeNull();

    run.tell({ phase: 'ready', version: '9.9.9' });
    expect(brand.querySelectorAll('.release-hint')).toHaveLength(1);
    expect(brand.querySelector('.release-hint').textContent).toBe(S.updateReadyShort('9.9.9'));

    expect(brand.querySelector('.release-hint').title).toBe(S.updateReady('9.9.9'));

    run.tell({ phase: 'failed', version: '9.9.9' });
    const link = brand.querySelector('a.release-hint');
    expect(link.textContent).toBe(S.updateFailedShort('9.9.9'));
    expect(link.title).toBe(S.updateFailed('9.9.9'));
    expect(link.href).toMatch(/\/releases\/latest$/);

    life.abort();
    expect(run.listening()).toBe(0);
  });

  it('shows a step the updater reached before the window opened', () => {
    updater({ phase: 'ready', version: '9.9.9' });
    const brand = document.createElement('div');
    mountRelease(document, brand, new AbortController().signal);
    expect(brand.querySelector('.release-hint').textContent).toBe(S.updateReadyShort('9.9.9'));
  });
});
