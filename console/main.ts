/**
 * Coopanion 的控制台入口:由 scripts/stage.ts 覆盖在 Cortico 的 src/web/client/main.ts 上。
 * 与上游的差别:
 * - 页面表多了关于桌宠的四页「开始」「习惯」「装扮」「语音输入」(features/home、pet、dress、voice),其余页重排、改了几个分组名;
 * - 两种模式(features/mode.ts):普通模式左栏只有那四页和「用量与成本」,别的路由都回到「开始」,底栏只留暂停键;
 *   高级模式再接上 Cortico 的全部页面。左栏底部的开关切换模式,页面也可以经 requestMode 请求换,换模式时重建左栏;
 * - 空路由打开「开始」;
 * - 左栏各组按「桌宠四页 · 对话 → World → 设置 → Persona & Memory → 高级」重排。
 * 其余逐字沿用上游。
 */

import { fetchManifest, get } from './core/api.ts';
import { pick, withLanguage } from './core/language.ts';
import { Lifecycle } from './core/lifecycle.ts';
import { Router, type Route } from './core/router.ts';
import type { SocketLike } from './core/stream.ts';
import { wsUrlOf } from './core/websocket.ts';
import { BUILTIN_PANELS } from './console-pages/builtins.ts';
import { ConsolePageHost, PROVIDER_ROUTE } from './console-pages/host.ts';
import { ConsolePageLoader } from './console-pages/loader.ts';
import { createConsoleUi } from './ui/index.ts';
import { subscribeLamps } from './ui/lamp.ts';
import { applyStoredTheme } from './theme/studio.ts';
import { createShell, type ConsoleShell } from './shell/index.ts';
import { featureAvailable, type FeatureContext, type FrameworkFeature } from './features/feature.ts';
import { liveFeature } from './features/live/index.ts';
import { coreFeature } from './features/core/index.ts';
import { usageFeature } from './features/usage/index.ts';
import { providersFeature } from './features/providers/index.ts';
import { worldsFeature } from './features/worlds/index.ts';
import { extensionsFeature } from './features/extensions/index.ts';
import { appearanceFeature } from './features/appearance/index.ts';
import { promptsFeature } from './features/prompts/index.ts';
import { settingsFeature } from './features/settings/index.ts';
import { homeFeature } from './features/home/index.ts';
import { petFeature } from './features/pet/index.ts';
import { dressFeature } from './features/dress/index.ts';
import { voiceFeature } from './features/voice/index.ts';
import { onModeRequest, readMode, writeMode, type ConsoleMode } from './features/mode.ts';
import { icon } from './ui/icons.ts';
import { coopanionWordmark } from './branding.ts';
import type { ConsoleMemo } from '../shared/client-panel.ts';

/**
 * 控制台自己的页面。与贡献方的页无关——那一路完全由 manifest 驱动。
 *
 * 顺序即左栏顺序。`hidden` 的页面(外观)不进左栏,
 * 但仍要在这张表里:路由分派只认这张表,设置页里嵌着它的同时,直达链接也要能开。
 */
const L = pick({
  zh: {
    chat: '对话', model: '模型', settings: '设置', advanced: '高级',
    toAdvanced: '高级模式', toAdvancedHint: '显示 Cortico 的全部设置:对话记录、模型、扩展、World、记忆与运行诊断',
    toNormal: '回到普通模式', toNormalHint: '只显示关于桌宠的页面',
  },
  en: {
    chat: 'Chat', model: 'Model', settings: 'Settings', advanced: 'Advanced',
    toAdvanced: 'Advanced mode', toAdvancedHint: 'Show all of Cortico: conversation, models, extensions, Worlds, memory and diagnostics',
    toNormal: 'Back to normal mode', toNormalHint: 'Show only the pages about the pet',
  },
});

/** 普通模式的全部页面:关于桌宠的四页,加上花了多少钱。高级模式里它们仍排在最前。 */
export const BASIC_FEATURES: readonly FrameworkFeature[] = [homeFeature, petFeature, dressFeature, voiceFeature, { ...usageFeature, navMode: 'primary' }];

export const FEATURES: readonly FrameworkFeature[] = [
  ...BASIC_FEATURES,
  { ...liveFeature, label: L.chat },
  { ...providersFeature, label: L.model, navMode: 'group', navGroup: L.settings },
  { ...extensionsFeature, navMode: 'group', navGroup: L.settings },
  { ...coreFeature, navMode: 'group', navGroup: L.advanced },
  worldsFeature, promptsFeature, appearanceFeature, settingsFeature,
];

/** 左栏分组的显示顺序;上游 shell 按类型固定追加,这里在它画完之后挪位置。 */
function navRank(el: Element): number {
  if (el.classList.contains('navgroup-primary')) return 0;
  if (el.classList.contains('navgroup-world-tree')) return 1;
  const label = el.getAttribute('aria-label');
  if (label === L.settings) return 2;
  if (el.classList.contains('navgroup-persona')) return 3;
  if (label === L.advanced) return 4;
  return 5;
}

function orderNav(nav: Element): void {
  const groups = [...nav.children];
  const sorted = [...groups].sort((a, b) => navRank(a) - navRank(b));
  if (sorted.every((g, i) => g === groups[i])) return;
  for (const g of sorted) nav.appendChild(g);
}

/** feature 挂载抛错时那张错误卡的标题。 */
const featureLoadFailed = pick({
  zh: (label: string) => `「${label}」没能加载`,
  en: (label: string) => `"${label}" failed to load`,
});

/** localStorage 后端；无痕模式下静默降级成内存，不抛。 */
export function createMemo(prefix: string): ConsoleMemo {
  const fallback = new Map<string, unknown>();
  return {
    get<T>(key: string, dflt: T): T {
      const k = prefix + key;
      // 本会话写过的值优先:localStorage 写不进去(无痕、配额满)时只有内存表是新的。
      if (fallback.has(k)) return fallback.get(k) as T;
      try {
        const raw = localStorage.getItem(k);
        return raw === null ? dflt : (JSON.parse(raw) as T);
      } catch {
        return dflt;
      }
    },
    set(key: string, value: unknown): void {
      const k = prefix + key;
      fallback.set(k, value);
      try {
        localStorage.setItem(k, JSON.stringify(value));
      } catch { /* 无痕/配额满:这轮只留在内存里 */ }
    },
  };
}

export function boot(doc: Document = document): { dispose(): void } {
  // 首次渲染前应用主题。
  try {
    applyStoredTheme(doc);
  } catch { /* 主题读坏了不该拦住整个控制台 */ }

  // 首屏提示已经完成使命——内核跑起来了。摘不掉它才说明脚本没起来。
  doc.getElementById('boot-note')?.remove();

  let root = doc.getElementById('kernel-root');
  if (!root) {
    root = doc.createElement('div');
    root.id = 'kernel-root';
    doc.body.appendChild(root);
  }
  /**
   * 贡献方的页与 framework feature 各自拥有独立根容器。ConsolePageHost.unmount() 清空其根节点时，不得影响 feature 的 DOM。
   */
  const pageRoot = doc.createElement('div');
  const featureRoot = doc.createElement('div');
  root.replaceChildren(pageRoot, featureRoot);

  const onError = (err: unknown): void => {
    console.error('[console]', err);
  };

  const loader = new ConsolePageLoader({
    importModule: (url) => import(/* @vite-ignore */ url),
    styleHost: doc.head,
    createLink: () => doc.createElement('link'),
    log: (msg, detail) => console.warn('[console]', msg, detail ?? ''),
  });

  const router = new Router({
    win: window,
    confirmLeave: async (message) => window.confirm(message),
    onError,
  });

  const memo = createMemo('cortico.panel.');

  const hostDeps = {
    doc,
    overlayHost: doc.body,
    loader,
    builtins: BUILTIN_PANELS,
    router,
    fetchManifest: () => fetchManifest(),
    memo,
    createSocket: (url: string) => new WebSocket(url) as unknown as SocketLike,
    wsUrl: (path: string) => wsUrlOf(location, withLanguage(path)),
    onError,
  };
  const host = new ConsolePageHost({ ...hostDeps, root: pageRoot });
  /** 框架页里嵌别的页的面板用的宿主:同一套加载器与 memo,只换容器与路由前缀。 */
  const consolePageHost: NonNullable<FeatureContext['consolePageHost']> = (opts) =>
    new ConsolePageHost({ ...hostDeps, root: opts.root, route: opts.route });

  /** 框架能力清单；获取失败时不启用可选能力。 */
  let capabilities: Record<string, boolean> = {};
  /** capabilities 与 manifest 都到齐了吗。到齐之前不渲染任何一页。 */
  let ready = false;
  /** 到齐之前就 dispose 了:那一拍回来什么都不做。 */
  let disposed = false;

  /**
   * 左栏外壳。它自己不探活、不认识任何具体 World:框架页那段由 FEATURES 按
   * capability 过滤,贡献方那段完全由 manifest 驱动。普通模式只给它 BASIC_FEATURES、
   * 不给 manifest 的页;换模式时整个重建。
   */
  let mode: ConsoleMode = readMode();
  /** 普通模式左栏不列 manifest 的页(World、Persona、Memory)。 */
  const visiblePages = () => (mode === 'advanced' ? host.pages : []);
  /** 普通模式只认那几页的路由。 */
  const reachable = (head: string | undefined): boolean =>
    mode === 'advanced' || BASIC_FEATURES.some((f) => f.route === head);

  const shellLife = new Lifecycle(onError);
  let shell!: ConsoleShell;
  let shellBuild: Lifecycle | null = null;
  const buildShell = (): void => {
    shellBuild?.dispose();
    const life = shellLife.own(new Lifecycle(onError));
    shellBuild = life;
    const ui = createConsoleUi({ memo, overlayHost: doc.body, signal: life.signal, doc });
    const advanced = mode === 'advanced';
    const next = createShell({ doc, ui, router, features: advanced ? FEATURES : BASIC_FEATURES, onError });
    const brand = next.el.querySelector('.brand');
    brand?.setAttribute('aria-label', 'Coopanion');
    brand?.replaceChildren(coopanionWordmark(doc));
    shell = next;
    life.own({ dispose: () => { next.dispose(); next.el.remove(); } });
    doc.body.insertBefore(next.el, doc.body.firstChild);
    doc.body.classList.toggle('companion-normal', !advanced);
    const nav = next.el.querySelector('nav.stack');
    if (nav) {
      const observer = new MutationObserver(() => orderNav(nav));
      observer.observe(nav, { childList: true });
      life.own({ dispose: () => observer.disconnect() });
    }

    const toggle = ui.h('button', 'companion-mode');
    toggle.type = 'button';
    toggle.title = advanced ? L.toNormalHint : L.toAdvancedHint;
    toggle.append(icon(doc, advanced ? 'eye-off' : 'settings', 'navicon'), ui.h('span', 'lbl', advanced ? L.toNormal : L.toAdvanced));
    toggle.addEventListener('click', () => setMode(advanced ? 'normal' : 'advanced'), { signal: life.signal });
    next.el.insertBefore(toggle, next.el.querySelector('.railfoot'));

    if (ready) {
      next.setCapabilities(capabilities);
      next.setPages(visiblePages());
    }
    next.setRoute(router.route);
  };
  const setMode = (next: ConsoleMode): void => {
    if (next === mode) return;
    mode = next;
    writeMode(mode);
    buildShell();
    apply(router.route);
  };
  buildShell();
  onModeRequest(setMode, shellLife.signal);
  const offNav = host.onNavChange(() => shell.setPages(visiblePages()));

  /**
   * 状态灯的活数据。manifest 只在开页与显式刷新时取，而灯要跟得上"引擎起来了没"，
   * 所以走那条只回灯的轻端点（节拍与不叠发都归 `subscribeLamps`）。
   */
  shellLife.own(subscribeLamps(doc, (lamps) => shell.setLamps(lamps)));

  /** 当前挂着的 framework feature（贡献方那边由 host 自己管）。 */
  let mounted: { route: string; lifecycle: Lifecycle } | null = null;
  let generation = 0;

  const unmountFeature = (): void => {
    const cur = mounted;
    mounted = null;
    generation++;
    if (cur) cur.lifecycle.dispose();
    featureRoot.replaceChildren();
  };

  const findFeature = (name: string | undefined): FrameworkFeature | undefined =>
    name === undefined ? undefined : FEATURES.find((f) => f.route === name);

  const mountFeature = (feature: FrameworkFeature, route: Route): void => {
    unmountFeature();
    const gen = generation;
    const lifecycle = new Lifecycle(onError);
    mounted = { route: feature.route, lifecycle };

    const slot = doc.createElement('div');
    slot.className = `featureslot featureslot-${feature.route}`;
    featureRoot.appendChild(slot);

    const ui = createConsoleUi({ memo, overlayHost: doc.body, signal: lifecycle.signal, doc });
    void (async () => {
      try {
        const out = await feature.mount({
          root: slot, lifecycle, signal: lifecycle.signal, ui, router, route,
          capabilities, onError, consolePageHost,
          refreshNav: () => host.refresh(),
        });
        if (gen !== generation) {
          if (out && typeof out.dispose === 'function') out.dispose();
          return;
        }
        if (out && typeof out.dispose === 'function') lifecycle.own(out);
      } catch (err) {
        if (gen !== generation) return;
        onError(err);
        lifecycle.dispose();
        slot.replaceChildren();
        const card = ui.sheet({ title: featureLoadFailed(feature.label), en: 'feature error' });
        card.body.appendChild(ui.msgline(err instanceof Error ? err.message : String(err), true));
        slot.appendChild(card.el);
      }
    })();
  };

  const apply = (route: Route): void => {
    shell.setRoute(route);
    // 页面加载依赖完整的 capabilities；就绪后重新应用当前路由。
    if (!ready) return;
    // 空路由替换为「开始」，不增加历史条目。
    if (route.segments.length === 0) {
      router.replace(['home']);
      return;
    }
    const head = route.segments[0];

    if (!reachable(head)) {
      router.replace(['home']);
      return;
    }
    if (head === PROVIDER_ROUTE && route.segments[1]?.startsWith('llm:')) {
      router.replace(['providers']);
      return;
    }
    if (head === PROVIDER_ROUTE) {
      unmountFeature();
      const pageId = route.segments[1];
      if (!pageId) { host.unmount(); return; }
      void host.show(pageId, route.segments[2]);
      return;
    }

    const feature = findFeature(head);
    if (feature && featureAvailable(feature, capabilities)) {
      host.unmount();
      // 同一个 feature 内部换子页签(segments[1] 变)由它自己处理，不重挂。
      if (mounted?.route === feature.route) return;
      mountFeature(feature, route);
      return;
    }

    // 没人认领:清空台面。左栏仍在,导航照常可用。
    host.unmount();
    unmountFeature();
  };

  const offRoute = router.onChange(apply);
  const stopRouter = router.start();

  // capabilities 与 manifest 就绪后按当前路由渲染。
  void Promise.allSettled([
    get<{ capabilities?: Record<string, boolean> }>('/api/capabilities')
      .then((r) => { capabilities = r?.capabilities ?? {}; }),
    host.load(),
  ]).then(() => {
    if (disposed) return;
    ready = true;
    shell.setCapabilities(capabilities);
    shell.setPages(visiblePages());
    apply(router.route);
  });

  return {
    dispose(): void {
      disposed = true;
      offNav.dispose();
      shellLife.dispose();
      offRoute.dispose();
      stopRouter.dispose();
      unmountFeature();
      host.unmount();
    },
  };
}

// 作为 bundle 入口被加载时自动启动:真页面带着 boot-note。测试 import 时没有它,不自动跑。
if (typeof document !== 'undefined' && document.getElementById('boot-note')) {
  boot();
}
