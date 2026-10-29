/**
 * The settings window: Coopanion's own front end, which talks to Core only through the WebUI HTTP
 * API (tests/console-api.test.ts locks the routes). The Electron main process serves this build
 * under `/coopanion/` on Core's own origin (app/main.cjs), so requests and WebSockets are same-origin.
 *
 * Normal mode includes pet pages, prompts, usage, chat and World extensions with their pages.
 * Advanced mode also lists model providers, Persona, Memory and diagnostics. Manifest pages mount
 * through the panel contract. Switching modes filters the rail and keeps the open page.
 *
 * The colour scheme is painted from the last record this window saw before anything renders, then
 * from `/api/theme`.
 */
import type { Disposable } from 'cortico/web/shared/client-panel.ts';
import { fetchManifest, get } from './base/api.ts';
import { withLanguage } from './base/language.ts';
import { Lifecycle } from './base/lifecycle.ts';
import { createMemo } from './base/memo.ts';
import type { Page } from './base/page.ts';
import { Router, type Route } from './base/router.ts';
import type { SocketLike } from './base/stream.ts';
import { wsUrlOf } from './base/websocket.ts';
import { applyStoredTheme, disposeThemeStudio } from './base/theme/studio.ts';
import { fetchTheme } from './base/theme/storage.ts';
import { createConsoleUi } from './base/ui/index.ts';
import type { ConsoleIconName } from './base/ui/icons.ts';
import { subscribeLamps } from './base/ui/lamp.ts';
import { BUILTIN_PANELS } from './advanced/console-pages/builtins.ts';
import { ConsolePageHost, PROVIDER_ROUTE } from './advanced/console-pages/host.ts';
import { ConsolePageLoader } from './advanced/console-pages/loader.ts';
import { featureAvailable, type FeatureContext, type FrameworkFeature } from './advanced/features/feature.ts';
import { promptsFeature } from './advanced/features/prompts/index.ts';
import { coreFeature } from './advanced/features/core/index.ts';
import { providersFeature } from './advanced/features/providers/index.ts';
import { traceFeature } from './advanced/features/trace.ts';
import { worldsFeature } from './advanced/features/worlds/index.ts';
import { chatPage } from './features/chat/index.ts';
import { usagePage } from './features/cost/index.ts';
import { dressPage } from './features/dress/index.ts';
import { homePage } from './features/home/index.ts';
import { onModeRequest, readMode, writeMode, type ConsoleMode } from './features/mode.ts';
import { petPage } from './features/pet/index.ts';
import { voicePage } from './features/voice/index.ts';
import { createRail, type NavGroup, type NavItem } from './rail/index.ts';
import { S as R } from './rail/strings.ts';
import { L } from './strings.ts';
import { createTitlebar } from './titlebar.ts';
import { navHidden, NAV_HIDDEN_EVENT } from './base/world-nav.ts';
import { watchPageScrollInset } from './base/ui/page.ts';

/** One entry of the rail and the page it mounts. */
interface Entry {
  route: string;
  label: string;
  icon?: ConsoleIconName;
  /** Listed in the normal mode too. */
  basic: boolean;
  group: 'primary' | 'world-root' | 'integrations' | 'diagnostics';
  needsAny?: readonly string[];
  page?: Page;
  feature?: FrameworkFeature;
}

const fromPage = (page: Page): Entry => ({ route: page.route, label: page.label, icon: page.icon, basic: true, group: 'primary', page });
const fromFeature = (feature: FrameworkFeature, group: Entry['group'], basic = false): Entry => ({
  route: feature.route, label: feature.label, ...(feature.icon ? { icon: feature.icon } : {}), basic, group, feature,
  ...(feature.needsAny ? { needsAny: feature.needsAny } : {}),
});

/** The rail's entries in order. */
export const ENTRIES: readonly Entry[] = [
  fromPage(homePage), fromPage(petPage), fromPage(dressPage), fromPage(voicePage),
  fromFeature(promptsFeature, 'primary', true), fromPage(usagePage), fromPage(chatPage),
  // 模型供应商 keeps the providers page's own name
  fromFeature(providersFeature, 'integrations'),
  fromFeature(traceFeature, 'diagnostics'), fromFeature(coreFeature, 'diagnostics'),
  fromFeature(worldsFeature, 'world-root', true),
];

const HOME = homePage.route;

export function boot(doc: Document = document): Disposable {
  try {
    applyStoredTheme(doc);
  } catch { /* a bad cached record must not keep the window from starting */ }
  doc.getElementById('boot-note')?.remove();
  doc.body.classList.add('companion-sidebar');

  const root = doc.createElement('div');
  root.id = 'kernel-root';
  // manifest pages and the window's own pages each have their own root: the page host empties its own
  const pageRoot = doc.createElement('div');
  const slotHost = doc.createElement('div');
  root.append(pageRoot, slotHost);
  doc.body.append(root);

  const onError = (err: unknown): void => { console.error('[console]', err); };
  const life = new Lifecycle(onError);
  const memo = createMemo('cortico.panel.');
  const router = new Router({ win: window, confirmLeave: async (message) => window.confirm(message), onError });
  const loader = new ConsolePageLoader({
    importModule: (url: string) => import(/* @vite-ignore */ url),
    styleHost: doc.head,
    createLink: () => doc.createElement('link'),
    log: (msg: string, detail?: unknown) => console.warn('[console]', msg, detail ?? ''),
  });
  const hostDeps = {
    doc, overlayHost: doc.body, loader, builtins: BUILTIN_PANELS, router, memo, onError,
    fetchManifest: () => fetchManifest(),
    createSocket: (url: string) => new WebSocket(url) as unknown as SocketLike,
    wsUrl: (path: string) => wsUrlOf(location, withLanguage(path)),
  };
  const host = new ConsolePageHost({ ...hostDeps, root: pageRoot });
  const consolePageHost: NonNullable<FeatureContext['consolePageHost']> = (opts) => new ConsolePageHost({ ...hostDeps, root: opts.root, route: opts.route });

  let mode: ConsoleMode = readMode();
  let capabilities: Record<string, boolean> = {};
  let ready = false;
  const ui = createConsoleUi({ memo, overlayHost: doc.body, signal: life.signal, doc });
  const rail = createRail({
    doc, ui, router, mode, memo, signal: life.signal, content: root, onError,
    onModeToggle: () => setMode(mode === 'advanced' ? 'normal' : 'advanced'),
  });
  doc.body.insertBefore(rail.el, doc.body.firstChild);
  rail.el.after(rail.backdrop);
  doc.body.prepend(createTitlebar(doc, rail.toggle, life.signal));

  const available = (e: Entry) => !e.needsAny?.length || e.needsAny.some((k) => capabilities[k] === true);
  const item = (e: Entry): NavItem => ({ label: e.label, ...(e.icon ? { icon: e.icon } : {}), segments: [e.route], basic: e.basic });
  /** The rail's groups: the pages, the World tree, 接入, 人格与记忆, 诊断. Only active pages of the manifest are listed. */
  const renderNav = (): void => {
    const entries = ENTRIES.filter(available);
    const listed = host.pages.filter((p) => p.availability === 'active');
    const hidden = navHidden(window);
    const pages = (kind: string, icon?: ConsoleIconName) => listed.filter((p) => p.kind === kind && !hidden.has(p.id)).map((p): NavItem => ({
      label: p.label || p.id, ...(icon ? { icon } : {}), segments: [PROVIDER_ROUTE, p.id], basic: kind === 'world', pageId: p.id, lamps: p.lamps ?? [],
    }));
    const of = (group: Entry['group']) => entries.filter((e) => e.group === group).map(item);
    const groups: NavGroup[] = [
      { kind: 'primary', label: '', items: of('primary') },
      { kind: 'world-tree', label: R.groupWorlds, items: of('world-root'), modules: pages('world') },
      { kind: 'framework', label: L.integrations, items: of('integrations') },
      { kind: 'persona', label: L.personaMemory, items: [...pages('persona', 'bot'), ...pages('memory', 'folder-open')] },
      { kind: 'framework', label: L.diagnostics, items: of('diagnostics') },
    ];
    rail.setNav(groups);
  };
  renderNav();
  window.addEventListener(NAV_HIDDEN_EVENT, renderNav, { signal: life.signal });

  life.own(subscribeLamps(doc, (next) => rail.setLamps(next)));
  const setMode = (next: ConsoleMode): void => {
    if (next === mode) return;
    mode = next;
    writeMode(mode);
    rail.setMode(mode, true);
    // the page open now stays, even one the normal mode does not list; the next page picked is checked as usual
  };
  onModeRequest(setMode, life.signal);
  const offNav = host.onNavChange(renderNav);

  let mounted: { route: string; lifecycle: Lifecycle } | null = null;
  let generation = 0;
  const unmount = (): void => {
    const cur = mounted;
    mounted = null;
    generation++;
    cur?.lifecycle.dispose();
    slotHost.replaceChildren();
  };

  const mount = (entry: Entry, route: Route): void => {
    unmount();
    const gen = generation;
    const lifecycle = new Lifecycle(onError);
    mounted = { route: entry.route, lifecycle };
    const slot = doc.createElement('div');
    slot.className = `featureslot featureslot-${entry.route}`;
    slotHost.append(slot);
    watchPageScrollInset(slot, lifecycle.signal);
    const pageUi = createConsoleUi({ memo, overlayHost: doc.body, signal: lifecycle.signal, doc });
    const ctx: FeatureContext = {
      root: slot, lifecycle, signal: lifecycle.signal, ui: pageUi, router, route, capabilities, onError, consolePageHost,
      refreshNav: () => host.refresh(),
    };
    const mountPanel = async (pageId: string, panelId: string, box: HTMLElement): Promise<Disposable> => {
      const embedded = consolePageHost({ root: doc.createElement('div'), route: () => [entry.route] });
      await embedded.load();
      return embedded.mountConnection(pageId, panelId, box, {}, (context) => context);
    };
    const run = () => (entry.feature ? entry.feature.mount(ctx) : entry.page!.mount({ ...ctx, mountPanel }));
    void (async () => {
      try {
        const out = await run();
        if (gen !== generation) { out?.dispose(); return; }
        if (out) lifecycle.own(out);
      } catch (err) {
        if (gen !== generation) return;
        onError(err);
        lifecycle.dispose();
        slot.replaceChildren();
        const card = pageUi.sheet({ title: L.featureLoadFailed(entry.label) });
        card.body.append(pageUi.msgline(err instanceof Error ? err.message : String(err), true));
        slot.append(card.el);
      }
    })();
  };

  const apply = (route: Route): void => {
    rail.setRoute(route);
    if (!ready) return;
    const head = route.segments[0];
    if (head === 'extensions' && (mode === 'advanced' || route.segments[1] !== 'provider')) {
      router.replace([route.segments[1] === 'provider' ? 'providers' : 'world'], { view: 'market' }); return;
    }
    const entry = ENTRIES.find((e) => e.route === head);
    // an empty route, and in the normal mode a page it does not list, open 开始 without a history entry
    const worldPage = head === PROVIDER_ROUTE && host.pages.some((page) => page.id === route.segments[1] && page.kind === 'world');
    const reachable = mode === 'advanced' ? head === PROVIDER_ROUTE || !!entry : !!entry?.basic || worldPage;
    if (!head || !reachable) { router.replace([HOME]); return; }
    // a model module's page is a section of 模型供应商
    if (head === PROVIDER_ROUTE && route.segments[1]?.startsWith('llm:')) { router.replace(['providers']); return; }
    if (head === PROVIDER_ROUTE) {
      unmount();
      const pageId = route.segments[1];
      if (!pageId) { host.unmount(); return; }
      void host.show(pageId, route.segments[2]);
      return;
    }
    if (entry && available(entry) && (!entry.feature || featureAvailable(entry.feature, capabilities))) {
      host.unmount();
      // a page handles a change of its own sub-tab (segments[1]) itself
      if (mounted?.route !== entry.route) mount(entry, route);
      return;
    }
    host.unmount();
    unmount();
  };

  const offRoute = router.onChange(apply);
  const stopRouter = router.start();

  void Promise.allSettled([
    get<{ capabilities?: Record<string, boolean> }>('/api/capabilities').then((r) => { capabilities = r?.capabilities ?? {}; }),
    fetchTheme().then((injected) => {
      disposeThemeStudio();
      applyStoredTheme(doc, { injected });
    }),
    host.load(),
  ]).then(() => {
    if (life.signal.aborted) return;
    ready = true;
    rail.setCapabilities(capabilities);
    renderNav();
    apply(router.route);
  });

  return {
    dispose(): void {
      offNav.dispose();
      unmount();
      host.unmount();
      offRoute.dispose();
      stopRouter.dispose();
      life.dispose();
      rail.el.remove();
      root.remove();
    },
  };
}

if (typeof document !== 'undefined' && document.getElementById('boot-note')) boot();
