/**
 * The settings window's left rail: the Coopanion mark, the pages in their groups (setNav), the button that
 * switches between the normal and the advanced mode, and the foot (shut down, pause/resume with the
 * run state in words, the avatar and the bot's name). The normal mode shows only the entries marked
 * basic; switching fades the others in or out.
 *
 * Folded, the rail shows icons only and a tooltip names what is under the pointer. At 1000px or less
 * it folds when the width crosses the breakpoint; below 720px it opens over the
 * page, with a backdrop that folds it again. Pause and resume, shutting down and renaming go to Core
 * through `/api/run/*` and `/api/config`.
 */
import type { WebUiMemo, WebUi } from 'cortico/web/shared/client-panel.ts';
import { get, post, setConfig } from '../base/api.ts';
import type { WebUiLamp } from 'cortico/web/shared/webui-protocol.ts';
import { buildHash, type Route, type Router } from '../base/router.ts';
import { icon, type ConsoleIconName } from '../base/ui/icons.ts';
import { lampRow, paintLamps } from '../base/ui/lamp.ts';
import type { ConsoleMode } from '../features/mode.ts';
import { onNameSaved } from '../features/bot-name.ts';
import { sidebarBrand } from './brand.ts';
import { L } from '../strings.ts';
import { createAvatarControl } from './avatar.ts';
import { S } from './strings.ts';
import { fold, prefersStill } from '../base/motion.ts';

const COLLAPSED_KEY = 'companion.sidebar.collapsed';
const DEFAULT_NAME = 'bot';

/** One entry: where it goes, and the page whose lamps it shows (a page from the manifest). */
export interface NavItem {
  label: string;
  icon?: ConsoleIconName;
  segments: readonly string[];
  /** Listed in the normal mode too. */
  basic: boolean;
  pageId?: string;
  lamps?: readonly WebUiLamp[];
}

/** `primary` entries stand alone; the others sit under a title. `modules` are a World tree's instances. */
export interface NavGroup {
  kind: 'primary' | 'world-tree' | 'framework' | 'persona';
  label: string;
  items: readonly NavItem[];
  modules?: readonly NavItem[];
}

export interface RailDeps {
  doc: Document;
  ui: WebUi;
  router: Router;
  mode: ConsoleMode;
  memo: WebUiMemo;
  signal: AbortSignal;
  /** The page area: inert while the narrow rail is open over it. */
  content: HTMLElement;
  /** The mode button was pressed. */
  onModeToggle(): void;
  onError(err: unknown): void;
}

export interface Rail {
  readonly el: HTMLElement;
  /** Mounted in the title bar; its state and click handler belong to the rail. */
  readonly toggle: HTMLButtonElement;
  /** Goes right after `el`: on a narrow window it covers the page while the rail is open. */
  readonly backdrop: HTMLElement;
  setRoute(route: Route): void;
  setNav(groups: readonly NavGroup[]): void;
  setMode(mode: ConsoleMode, animate: boolean): void;
  /** A new reading of the manifest pages' lamps; only the dots change. */
  setLamps(lamps: Record<string, readonly WebUiLamp[]>): void;
  setCapabilities(capabilities: Record<string, boolean>): void;
}

export function createRail(deps: RailDeps): Rail {
  const { doc, ui, router, signal, onError } = deps;
  const win = doc.defaultView!;
  let capabilities: Record<string, boolean> = {};

  const el = ui.h('div');
  el.id = 'rail';

  /* ---------- brand ---------- */
  const brand = ui.h('div', 'brand');
  const toggle = ui.h('button', 'companion-sidebar-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'companion-navigation');
  toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/><path class="companion-sidebar-chevron" d="m16 9-3 3 3 3"/></svg>';
  brand.append(sidebarBrand(doc));

  /* ---------- pages ---------- */
  const nav = ui.h('nav', 'stack');
  nav.id = 'companion-navigation';
  nav.setAttribute('aria-label', S.navAria);
  nav.addEventListener('scroll', () => nav.classList.toggle('is-scrolled', nav.scrollTop > 0), { signal });
  let entries: Array<{ item: HTMLAnchorElement; segments: readonly string[]; pageId?: string; lamps?: HTMLSpanElement }> = [];
  let lamps: Record<string, readonly WebUiLamp[]> = {};
  let navLife: AbortController | null = null;
  signal.addEventListener('abort', () => navLife?.abort(), { once: true });
  let route: Route | null = null;
  let mode: ConsoleMode = deps.mode;

  const addItem = (parent: HTMLElement, it: NavItem, itemSignal: AbortSignal): void => {
    const item = ui.h('a', 'navitem');
    item.href = buildHash(it.segments);
    item.setAttribute('aria-label', it.label);
    item.dataset.basic = String(it.basic);
    // a World instance has no icon of its own: the folded rail shows a generic one
    item.append(icon(doc, it.icon ?? 'boxes', it.icon ? 'navicon' : 'navicon companion-module-icon'));
    item.append(ui.h('span', 'lbl', it.label));
    const entry: (typeof entries)[number] = { item, segments: it.segments };
    if (it.pageId) {
      entry.pageId = it.pageId;
      entry.lamps = lampRow(doc, lamps[it.pageId] ?? it.lamps ?? []);
      item.append(entry.lamps);
    }
    // a modified or middle click keeps the browser's own behaviour
    item.addEventListener('click', (ev) => {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      router.navigate(it.segments);
    }, { signal: itemSignal });
    parent.append(item);
    entries.push(entry);
  };

  const group = (cls: string, label: string, titled: boolean): HTMLElement => {
    const g = ui.h('div', `navgroup ${cls}`);
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', label);
    if (titled) g.append(ui.h('div', 'stacklabel', label));
    nav.append(g);
    return g;
  };

  /** Draws the groups in order; entries the normal mode does not list are hidden at once. */
  /** Pages listed by the last draw; a page new since then arrives with an animation. */
  let listedPages: Set<string> | null = null;
  /** How long a page takes to join or leave the sidebar. */
  const DEPART_MS = 200, ARRIVE_MS = 220;
  /** A page joining or leaving moves with its neighbours: its height, padding, a short slide and the fade together. */
  const move = (item: HTMLElement, open: boolean, duration: number) => fold(item, open, { duration, easing: 'cubic-bezier(.4, 0, .2, 1)', shift: -8, hide: false, clip: false });
  let departing: ReturnType<typeof setTimeout> | undefined;
  signal.addEventListener('abort', () => clearTimeout(departing), { once: true });
  /** Pages that leave the sidebar fold away first; the redraw follows. */
  const setNav = (groups: readonly NavGroup[]): void => {
    clearTimeout(departing); departing = undefined;
    const next = new Set(groups.flatMap((g) => [...g.items, ...(g.modules ?? [])]).flatMap((it) => it.pageId ? [it.pageId] : []));
    const leaving = entries.filter((entry) => entry.pageId && !next.has(entry.pageId) && !entry.item.hidden && entry.item.isConnected);
    const still = prefersStill(doc.defaultView);
    if (!leaving.length || still) { drawNav(groups); return; }
    for (const { item } of leaving) { item.classList.add('companion-depart'); move(item, false, DEPART_MS); }
    departing = setTimeout(() => { departing = undefined; drawNav(groups); }, DEPART_MS);
  };
  const drawNav = (groups: readonly NavGroup[]): void => {
    const before = listedPages;
    navLife?.abort();
    navLife = new AbortController();
    const itemSignal = navLife.signal;
    entries = [];
    nav.replaceChildren();
    for (const g of groups) {
      if (!g.items.length && !g.modules?.length) continue;
      if (g.kind === 'primary') {
        for (const it of g.items) addItem(group('navgroup-framework navgroup-primary', it.label, false), it, itemSignal);
        continue;
      }
      const box = group(g.kind === 'persona' ? 'navgroup-persona navgroup-provider' : g.kind === 'world-tree' ? 'navgroup-world-tree' : 'navgroup-framework', g.label, g.kind !== 'world-tree');
      for (const it of g.items) addItem(box, it, itemSignal);
      if (g.modules?.length) {
        const list = ui.h('div', 'navmodule-list');
        list.setAttribute('role', 'group');
        list.setAttribute('aria-label', S.moduleInstancesAria);
        box.append(list);
        for (const it of g.modules) addItem(list, it, itemSignal);
      }
    }
    applyRoute();
    filterNav(false);
    listedPages = new Set(entries.flatMap((entry) => entry.pageId ? [entry.pageId] : []));
    const still = prefersStill(doc.defaultView);
    if (before && !still) for (const { item, pageId } of entries) if (pageId && !before.has(pageId) && !item.hidden) {
      item.classList.add('companion-arrive');
      move(item, true, ARRIVE_MS);
      setTimeout(() => item.classList.remove('companion-arrive'), ARRIVE_MS);
    }
  };

  const applyRoute = (): void => {
    for (const { item, segments } of entries) {
      const on = !!route && segments.every((s, i) => route!.segments[i] === s);
      item.classList.toggle('active', on);
      if (on) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    }
  };

  /** How long an entry takes to fade in or out when the mode changes (companion.css `.companion-enter`, `.companion-leave`). */
  const FADE_MS = 200;
  /** Shows or hides one entry or group; on a mode change it fades, at once otherwise. */
  const showEntry = (x: HTMLElement, show: boolean, animate: boolean): void => {
    x.classList.remove('companion-enter', 'companion-leave');
    if (!animate || show === !x.hidden) { x.hidden = !show; return; }
    if (show) {
      x.hidden = false;
      void x.offsetWidth;
      x.classList.add('companion-enter');
      x.addEventListener('animationend', () => x.classList.remove('companion-enter'), { once: true });
    } else {
      x.classList.add('companion-leave');
      setTimeout(() => { if (x.classList.contains('companion-leave')) { x.classList.remove('companion-leave'); x.hidden = true; } }, FADE_MS);
    }
  };
  /** In the normal mode only the entries marked basic show; a group with none of them goes as a whole. */
  const filterNav = (animate: boolean): void => {
    const shown = (item: HTMLElement) => mode === 'advanced' || item.dataset.basic === 'true';
    const fading = animate && !nav.querySelector('.companion-leave');
    for (const g of nav.querySelectorAll<HTMLElement>('.navgroup')) {
      const items = [...g.querySelectorAll<HTMLAnchorElement>('a.navitem')];
      const any = items.some(shown);
      // a group that goes as a whole fades as a whole, its entries untouched until it is gone; inside a group that
      // stays, each entry fades on its own
      if (!(animate && !any && !g.hidden)) for (const item of items) showEntry(item, shown(item), animate && any);
      showEntry(g, any, animate);
    }
    // entries going out shorten the list: scroll to where it will end up while they fade, rather than jump there after
    if (fading && nav.querySelector('.companion-leave')) {
      const from = nav.scrollTop;
      const leaving = [...nav.querySelectorAll<HTMLElement>('.companion-leave')];
      for (const x of leaving) x.style.display = 'none';
      const to = Math.max(0, Math.min(from, nav.scrollHeight - nav.clientHeight));
      for (const x of leaving) x.style.display = '';
      nav.scrollTop = from;
      if (to < from && !prefersStill(win)) {
        const start = performance.now();
        const step = (now: number): void => {
          const k = Math.min(1, (now - start) / FADE_MS);
          nav.scrollTop = from + (to - from) * (1 - (1 - k) ** 3);
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      } else nav.scrollTop = to;
    }
  };

  const modeButton = ui.h('button', 'companion-mode');
  modeButton.type = 'button';
  modeButton.addEventListener('click', () => {
    // a short press animation on the button itself
    modeButton.classList.remove('companion-pressed');
    void modeButton.offsetWidth;
    modeButton.classList.add('companion-pressed');
    deps.onModeToggle();
  }, { signal });
  modeButton.addEventListener('animationend', () => modeButton.classList.remove('companion-pressed'), { signal });
  const renderMode = (animate: boolean): void => {
    const advanced = mode === 'advanced';
    modeButton.setAttribute('aria-description', advanced ? L.toNormalHint : L.toAdvancedHint);
    modeButton.setAttribute('aria-label', advanced ? L.toNormal : L.toAdvanced);
    modeButton.replaceChildren(icon(doc, advanced ? 'eye-off' : 'settings', 'navicon'), ui.h('span', 'lbl', advanced ? L.toNormal : L.toAdvanced));
    doc.body.classList.toggle('companion-normal', !advanced);
    filterNav(animate);
  };
  renderMode(false);

  /* ---------- foot ---------- */
  const foot = ui.h('div', 'railfoot');
  const avatar = createAvatarControl({ doc, ui, signal, onError });
  const name = ui.h('button', 'rail-name');
  name.type = 'button';
  name.setAttribute('aria-description', S.renameTitle);
  const nameText = ui.h('span', 'rail-name-text', DEFAULT_NAME);
  const nameEdit = ui.h('span', 'rail-name-edit');
  nameEdit.setAttribute('aria-hidden', 'true');
  nameEdit.append(icon(doc, 'pencil'));
  name.append(nameText, nameEdit);
  const ident = ui.h('div', 'rail-ident');
  ident.append(name);
  const who = ui.h('div', 'rail-who');
  who.append(avatar.el, ident);
  const actions = ui.h('div', 'rail-actions');
  const shutdown = ui.h('button', 'rail-action rail-shutdown');
  shutdown.type = 'button';
  shutdown.append(icon(doc, 'power'));
  const run = ui.h('button', 'rail-action rail-run');
  run.type = 'button';
  // the run state in words right of the pause/resume key, in the key's color; a click on it is a click on the key
  const runState = ui.h('span', 'companion-runstate');
  runState.setAttribute('aria-hidden', 'true');
  runState.addEventListener('click', () => run.click(), { signal });
  actions.append(shutdown, run, runState);
  foot.append(who, actions);

  el.append(brand, nav, modeButton, foot);

  let paused = false;
  let runPending = false;
  const renderRun = (): void => {
    const available = capabilities.run === true;
    run.disabled = !available || runPending;
    run.replaceChildren(icon(doc, paused ? 'play' : 'pause'));
    run.setAttribute('aria-label', paused ? S.runResume : S.runPause);
    run.classList.toggle('paused', paused);
    runState.textContent = paused ? L.paused : L.running;
    runState.classList.toggle('paused', paused);
    runState.hidden = !available;
  };
  run.addEventListener('click', () => {
    if (runPending || capabilities.run !== true) return;
    runPending = true;
    renderRun();
    void post<{ paused?: boolean; result?: string }>(paused ? '/api/run/resume' : '/api/run/pause', undefined, { signal })
      .then((out) => {
        paused = out.paused === true;
        if (out.result) ui.toast(out.result);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string } | null)?.name === 'AbortError') return;
        onError(err);
        ui.toast(err instanceof Error ? err.message : String(err), 'bad');
      })
      .finally(() => {
        runPending = false;
        renderRun();
      });
  }, { signal });

  let shuttingDown = false;
  const renderPower = (): void => {
    const can = capabilities.shutdown === true;
    shutdown.hidden = !can;
    shutdown.disabled = !can || shuttingDown;
    shutdown.setAttribute('aria-label', S.shutdownAria);
    shutdown.setAttribute('aria-description', shuttingDown ? S.finishing : S.shutdownTitle);
  };
  shutdown.addEventListener('click', () => void (async () => {
    if (shuttingDown || capabilities.shutdown !== true) return;
    if (!await ui.confirm({ title: S.confirmShutdownTitle, body: S.shutdownBody, danger: true }) || signal.aborted) return;
    if (!await ui.confirm({ title: S.confirmShutdownAgainTitle, body: S.confirmShutdownAgainBody, danger: true }) || signal.aborted) return;
    shuttingDown = true;
    renderPower();
    const hold = ui.toast(S.finishingToast);
    try {
      const out = await post<{
        ok?: boolean; localComplete?: boolean; result?: string; error?: string;
        steps?: Array<{ label: string; ok: boolean; elapsedMs: number; detail?: string }>;
        externalChecks?: Array<{ status: 'verified-ended' | 'still-live' | 'unknown' }>;
      }>('/api/run/shutdown', undefined, { signal });
      if (out?.error) throw new Error(out.error);
      const steps = out?.steps ?? [];
      const localComplete = out?.localComplete ?? steps.every((step) => step.ok);
      const externalUnverified = (out?.externalChecks ?? []).some((check) => check.status !== 'verified-ended');
      const lines = steps.map((s) => `${s.ok ? '✓' : '✗'} ${s.label} · ${(s.elapsedMs / 1000).toFixed(1)}s${s.ok ? '' : ` — ${s.detail ?? S.stepIncomplete}`}`);
      void ui.confirm({
        title: !localComplete ? S.resultLocalIncomplete
          : externalUnverified ? S.resultExternalUnverified
          : out?.ok === false ? S.resultUnverified : S.doneShutdown,
        body: [out?.result ?? S.resultDefault, '', ...lines].join('\n'),
      });
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') return;
      // the process can exit before its answer arrives: the result is unknown, not a failure
      onError(err);
      ui.toast(S.noReceipt(String((err as Error)?.message ?? err)), 'bad');
    } finally {
      hold.dispose();
      shuttingDown = false;
      renderPower();
    }
  })(), { signal });

  /* ---------- the bot's name ---------- */
  let shownName = DEFAULT_NAME;
  const setName = (next: unknown): void => {
    shownName = typeof next === 'string' && next.trim() !== '' ? next.trim() : DEFAULT_NAME;
    nameText.textContent = shownName;
    avatar.setLabel(shownName);
    doc.title = S.docTitle(shownName);
  };
  // the name is `displayName` in Core's config; Enter or leaving the box saves it, Escape drops the edit
  name.addEventListener('click', () => {
    const field = ui.input({ value: shownName });
    field.className = 'field rail-rename';
    name.replaceWith(field);
    field.focus();
    field.select();
    let done = false;
    const finish = (save: boolean): void => {
      if (done) return;
      done = true;
      const next = field.value.trim();
      field.replaceWith(name);
      if (!save || !next || next === shownName) return;
      setName(next);
      void setConfig('core', { displayName: next }).then(
        () => ui.toast(S.renameSaved),
        (err) => {
          ui.toast(S.renameFailed(String((err as Error)?.message ?? err)), 'bad');
          onError(err);
        },
      );
    };
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') finish(true);
      else if (event.key === 'Escape') finish(false);
    }, { signal });
    field.addEventListener('blur', () => finish(true), { signal });
  }, { signal });
  onNameSaved(setName, signal);
  void get<{ displayName?: unknown; loop?: { paused?: unknown } } | null>('/api/status', { signal }).then((st) => {
    setName(st?.displayName);
    paused = st?.loop?.paused === true;
    renderRun();
  }).catch(() => { /* the name stays the default */ });

  /* ---------- folding ---------- */
  const backdrop = ui.h('button', 'companion-sidebar-backdrop');
  backdrop.type = 'button';
  backdrop.tabIndex = -1;
  backdrop.setAttribute('aria-label', L.collapseSidebar);
  const tooltip = ui.h('div', 'companion-sidebar-tooltip');
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.hidden = true;
  doc.body.append(tooltip);
  const hideTip = (): void => { tooltip.hidden = true; };

  const compact = win.matchMedia('(max-width: 1000px)');
  const narrow = win.matchMedia('(max-width: 720px)');
  let preference = deps.memo.get<unknown>(COLLAPSED_KEY, null) === true;
  let collapsed = false;

  /**
   * The foot changes layout when the rail folds (a row of keys over the avatar, or one column), which CSS can't
   * animate: grow or shrink its height and slide the keys from where they were (FLIP), the run state's words riding
   * along with the pause key as they fade.
   */
  const flip = (change: () => void): void => {
    const moving = typeof foot.animate === 'function' && !prefersStill(win)
      ? Array.from(foot.querySelectorAll<HTMLElement>('.rail-who, .rail-action, .companion-runstate')).filter((x) => !x.hidden)
      : [];
    const before = moving.map((x) => x.getBoundingClientRect());
    const height = foot.getBoundingClientRect().height;
    // clicked again mid-way: start from where things are on screen now, and measure the new layout without the old animations
    for (const x of moving.length ? [foot, ...moving] : []) for (const a of x.getAnimations()) a.cancel();
    change();
    if (!moving.length) return;
    const options: KeyframeAnimationOptions = { duration: 260, easing: 'cubic-bezier(.22, 1, .36, 1)' };
    foot.animate([{ height: `${height}px`, boxSizing: 'border-box' }, { height: `${foot.getBoundingClientRect().height}px`, boxSizing: 'border-box' }], options);
    const at = moving.indexOf(run);
    const runMove = at < 0 ? null : { x: run.getBoundingClientRect().left - before[at]!.left, y: run.getBoundingClientRect().top - before[at]!.top };
    moving.forEach((x, i) => {
      const now = x.getBoundingClientRect();
      const dx = before[i]!.left - now.left;
      const dy = before[i]!.top - now.top;
      // folded, the words have no place of their own (they are taken out of the column): they ride with the pause key
      if (runMove && x === runState) {
        const [from, to] = collapsed
          ? [[dx, dy], [dx + runMove.x, dy + runMove.y]]
          : [[-runMove.x, -runMove.y], [0, 0]];
        x.animate([{ transform: `translate(${from[0]}px, ${from[1]}px)` }, { transform: `translate(${to[0]}px, ${to[1]}px)` }], options);
        return;
      }
      if (dx || dy) x.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], options);
    });
  };

  const render = (next: boolean, animate = false): void => {
    if (animate && next !== collapsed) { flip(() => render(next)); return; }
    collapsed = next;
    el.classList.toggle('is-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? L.expandSidebar : L.collapseSidebar);
    toggle.title = collapsed ? L.expandSidebar : L.collapseSidebar;
    backdrop.hidden = collapsed || !narrow.matches;
    deps.content.inert = !backdrop.hidden;
    hideTip();
  };
  const resize = (): void => render(compact.matches || preference);
  toggle.addEventListener('click', () => {
    if (!narrow.matches) {
      preference = !collapsed;
      deps.memo.set(COLLAPSED_KEY, preference);
    }
    render(!collapsed, true);
  }, { signal });
  const close = (): void => { render(true, true); toggle.focus(); };
  backdrop.addEventListener('click', close, { signal });
  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    hideTip();
    if (narrow.matches && !collapsed) close();
  }, { signal });
  nav.addEventListener('click', (event) => {
    if (narrow.matches && (event.target as Element).closest('a.navitem')) render(true, true);
  }, { signal });
  compact.addEventListener('change', resize, { signal });
  narrow.addEventListener('change', resize, { signal });

  const showTip = (event: Event): void => {
    const target = (event.target as Element).closest<HTMLElement>('a.navitem, .companion-mode, .rail-action, .rail-avatar');
    if (!collapsed || !target || target.hidden) return;
    const label = target.getAttribute('aria-label');
    if (!label) return;
    tooltip.textContent = label;
    tooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    tooltip.style.left = `${el.getBoundingClientRect().right + 10}px`;
    tooltip.style.top = `${Math.max(8, Math.min(win.innerHeight - tooltip.offsetHeight - 8, rect.top + (rect.height - tooltip.offsetHeight) / 2))}px`;
  };
  el.addEventListener('pointerover', showTip, { signal });
  el.addEventListener('focusin', showTip, { signal });
  el.addEventListener('pointerout', hideTip, { signal });
  el.addEventListener('focusout', hideTip, { signal });
  nav.addEventListener('scroll', hideTip, { signal });
  el.addEventListener('click', hideTip, { signal });
  win.addEventListener('resize', hideTip, { signal });

  signal.addEventListener('abort', () => {
    tooltip.remove();
    backdrop.remove();
    deps.content.inert = false;
  }, { once: true });

  renderRun();
  renderPower();
  resize();

  return {
    el,
    toggle,
    backdrop,
    setRoute(next: Route): void {
      route = next;
      applyRoute();
    },
    setNav,
    setMode(next: ConsoleMode, animate: boolean): void {
      mode = next;
      renderMode(animate);
    },
    setLamps(next: Record<string, readonly WebUiLamp[]>): void {
      lamps = next;
      for (const entry of entries) if (entry.lamps && entry.pageId) paintLamps(entry.lamps, lamps[entry.pageId] ?? []);
    },
    setCapabilities(next: Record<string, boolean>): void {
      capabilities = next;
      renderRun();
      renderPower();
    },
  };
}
