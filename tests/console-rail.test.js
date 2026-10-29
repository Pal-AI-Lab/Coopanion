// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRail } from '../console/rail/index.ts';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { Router } from '../console/base/router.ts';
import { L } from '../console/strings.ts';

class MediaQuery extends EventTarget {
  constructor(media, matches) { super(); this.media = media; this.matches = matches; }
  set(matches) {
    this.matches = matches;
    this.dispatchEvent(new Event('change'));
  }
}

const nav = [
  { kind: 'primary', label: '', items: [
    { label: 'Home', icon: 'play', segments: ['home'], basic: true },
    { label: 'Chat', icon: 'bot', segments: ['chat'], basic: true },
  ] },
  { kind: 'framework', label: 'Diagnostics', items: [{ label: 'Core', icon: 'cpu', segments: ['core'], basic: false }] },
];
let queries;
let disposals;
let saved;

function mount() {
  const life = new AbortController();
  const memo = {
    get: (key, fallback) => saved.has(key) ? saved.get(key) : fallback,
    set: (key, value) => saved.set(key, value),
  };
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, memo, signal: life.signal });
  const router = new Router({ win: window, onError: (err) => { throw err; } });
  const content = document.getElementById('kernel-root');
  const rail = createRail({ doc: document, ui, router, mode: 'normal', memo, signal: life.signal, content, onModeToggle() {}, onError: (err) => { throw err; } });
  rail.setNav(nav);
  document.body.prepend(rail.el);
  rail.el.after(rail.backdrop);
  document.body.prepend(rail.toggle);
  const offRoute = router.onChange((route) => rail.setRoute(route));
  const stopRouter = router.start();
  const dispose = () => { life.abort(); offRoute.dispose(); stopRouter.dispose(); rail.el.remove(); };
  disposals.push(dispose);
  return {
    rail, dispose,
    toggle: rail.toggle,
  };
}

beforeEach(() => {
  saved = new Map();
  disposals = [];
  document.body.replaceChildren();
  const content = document.createElement('main');
  content.id = 'kernel-root';
  document.body.append(content);
  history.replaceState(null, '', '/');
  queries = new Map([
    ['(max-width: 1000px)', new MediaQuery('(max-width: 1000px)', false)],
    ['(max-width: 720px)', new MediaQuery('(max-width: 720px)', false)],
  ]);
  vi.stubGlobal('matchMedia', (query) => queries.get(query) ?? new MediaQuery(query, false));
  vi.stubGlobal('fetch', async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
});
afterEach(() => {
  disposals.forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

describe('settings window rail', () => {
  it('folds away a World page leaving the sidebar before redrawing, and animates one that joins', () => {
    vi.useFakeTimers();
    try {
      const { rail } = mount();
      rail.setMode('advanced', false);
      const world = (pageIds) => [...nav, { kind: 'world-tree', label: 'World', items: [], modules: pageIds.map((pageId) => ({ label: pageId, segments: ['provider', pageId], basic: false, pageId, lamps: [] })) }];
      rail.setNav(world(['world:a', 'world:b']));
      rail.setNav(world(['world:a']));
      const leaving = rail.el.querySelector('a.navitem[href*="world:b"], a.navitem[href*="world%3Ab"]');
      expect(leaving.classList.contains('companion-depart')).toBe(true);
      vi.advanceTimersByTime(400);
      expect(rail.el.querySelector('a.navitem[href*="world:b"], a.navitem[href*="world%3Ab"]')).toBeNull();
      rail.setNav(world(['world:a', 'world:b']));
      expect(rail.el.querySelector('a.navitem[href*="world:b"], a.navitem[href*="world%3Ab"]').classList.contains('companion-arrive')).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it('retains the C and both eyes while toggling and restores the choice after remount', () => {
    const { rail, toggle, dispose } = mount();
    const eyes = [...rail.el.querySelectorAll('.companion-brand .accent')];
    const c = rail.el.querySelector('.companion-brand-c');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    expect(toggle.getAttribute('aria-label')).toBe(L.expandSidebar);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect([...rail.el.querySelectorAll('.companion-brand .accent')]).toEqual(eyes);
    expect(rail.el.querySelector('.companion-brand-c')).toBe(c);
    expect(eyes).toHaveLength(2);
    dispose();
    const restored = mount();
    expect(restored.toggle.getAttribute('aria-expanded')).toBe('false');
    restored.toggle.click();
    expect(restored.toggle.getAttribute('aria-label')).toBe(L.collapseSidebar);
  });

  it('folds at the compact breakpoint after a person expands it', () => {
    const { toggle } = mount();
    queries.get('(max-width: 1000px)').set(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    queries.get('(max-width: 1000px)').set(false);
    queries.get('(max-width: 1000px)').set(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('starts compact even when the saved choice was expanded', () => {
    saved.set('companion.sidebar.collapsed', false);
    queries.get('(max-width: 1000px)').set(true);
    expect(mount().toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the small-screen overlay on Escape, backdrop and navigation without replacing the desktop choice', () => {
    const { rail, toggle } = mount();
    queries.get('(max-width: 1000px)').set(true);
    queries.get('(max-width: 720px)').set(true);
    const backdrop = document.querySelector('.companion-sidebar-backdrop');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(backdrop.hidden).toBe(false);
    expect(document.getElementById('kernel-root').inert).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(backdrop.hidden).toBe(true);
    expect(document.getElementById('kernel-root').inert).toBe(false);
    expect(document.activeElement).toBe(toggle);
    toggle.click();
    backdrop.click();
    expect(backdrop.hidden).toBe(true);
    toggle.click();
    rail.el.querySelector('a.navitem').click();
    expect(backdrop.hidden).toBe(true);
    queries.get('(max-width: 720px)').set(false);
    queries.get('(max-width: 1000px)').set(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('names its entries in the folded rail and marks the current page', async () => {
    const { rail, toggle } = mount();
    toggle.click();
    const item = rail.el.querySelector('a[href="#/chat"]');
    expect(item.getAttribute('aria-label')).toBe('Chat');
    item.focus();
    const tooltip = document.querySelector('.companion-sidebar-tooltip');
    expect(tooltip.hidden).toBe(false);
    expect(tooltip.textContent).toBe('Chat');
    item.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(item.getAttribute('aria-current')).toBe('page');
    expect(rail.el.querySelector('a[href="#/home"]').getAttribute('aria-current')).toBeNull();
  });

  it('lists only the basic entries in the normal mode and every entry in the advanced mode', () => {
    const { rail } = mount();
    const core = rail.el.querySelector('a[href="#/core"]');
    expect(core.closest('.navgroup').hidden).toBe(true);
    expect(document.body.classList.contains('companion-normal')).toBe(true);
    rail.setMode('advanced', false);
    expect(core.closest('.navgroup').hidden).toBe(false);
    expect(core.hidden).toBe(false);
    expect(document.body.classList.contains('companion-normal')).toBe(false);
  });

  it('releases media listeners and overlays when the rail stops', () => {
    const { toggle, dispose } = mount();
    dispose();
    queries.get('(max-width: 1000px)').set(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.companion-sidebar-tooltip')).toBeNull();
    expect(document.querySelector('.companion-sidebar-backdrop')).toBeNull();
  });
});


it('enables the upper fade only while navigation has scrolled away from the top', () => {
  const { rail } = mount();
  const nav = rail.el.querySelector('nav');
  expect(nav.classList.contains('is-scrolled')).toBe(false);
  nav.scrollTop = 30; nav.dispatchEvent(new Event('scroll'));
  expect(nav.classList.contains('is-scrolled')).toBe(true);
  nav.scrollTop = 0; nav.dispatchEvent(new Event('scroll'));
  expect(nav.classList.contains('is-scrolled')).toBe(false);
});
