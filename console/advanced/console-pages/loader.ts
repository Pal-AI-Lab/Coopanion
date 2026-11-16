/**
 * 按 manifest URL 懒加载扩展；进行中的加载去重，成功模块缓存，失败允许重试。
 * 浏览器仍可能缓存失败的 ESM URL；重新构建后的内容 hash URL 可避开该缓存。
 * JS 与 CSS URL 均校验清单规定的路径和字符。样式与 JS 分开加载，只在该页显示期间生效（见 scope-css.ts）。
 */

import {
  isConsoleClientBundle,
  isSafeAssetUrl,
  type WebUiClientBundle,
  type WebUiPanel,
} from '../../base/protocol.ts';
import type { WebUiAssetEntry } from 'cortico/web/shared/webui-protocol.ts';
import type { Disposable } from 'cortico/web/shared/client-panel.ts';
import { scopeExtensionCss } from './scope-css.ts';
import { S } from './strings.ts';

/** 一份已建好的页面样式表；attach 后对文档生效，detach 后撤下。 */
export interface PageStyle {
  attach(): void;
  detach(): void;
}

export interface LoaderDeps {
  importModule(url: string): Promise<unknown>;
  fetchText(url: string): Promise<string>;
  /** 建一份样式表，`url()` 按 `baseUrl` 解析。 */
  createStyle(css: string, baseUrl: string): PageStyle;
  log?(message: string, detail?: Record<string, unknown>): void;
}

interface StyleEntry {
  users: number;
  style: PageStyle | null;
}

export class PanelBundleError extends Error {
  readonly pageId: string;
  constructor(pageId: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'PanelBundleError';
    this.pageId = pageId;
    if (cause !== undefined) this.cause = cause;
  }
}

export class ConsolePageLoader {
  private readonly deps: LoaderDeps;
  private readonly loaded = new Map<string, WebUiClientBundle>();
  private readonly inFlight = new Map<string, Promise<WebUiClientBundle>>();
  private readonly styles = new Map<string, StyleEntry>();

  constructor(deps: LoaderDeps) {
    this.deps = deps;
  }

  /** 已加载的扩展集合，供核对懒加载行为。 */
  get loadedPages(): string[] {
    return [...this.loaded.keys()];
  }

  async load(pageId: string, asset: WebUiAssetEntry | undefined): Promise<WebUiClientBundle> {
    const cached = this.loaded.get(pageId);
    if (cached) return cached;

    const pending = this.inFlight.get(pageId);
    if (pending) return pending;

    const task = this.loadOnce(pageId, asset);
    this.inFlight.set(pageId, task);
    try {
      const bundle = await task;
      this.loaded.set(pageId, bundle);
      return bundle;
    } finally {
      // 成功与否都要摘掉:失败不缓存,下次可以重来。
      this.inFlight.delete(pageId);
    }
  }

  private async loadOnce(
    pageId: string,
    asset: WebUiAssetEntry | undefined,
  ): Promise<WebUiClientBundle> {
    if (!asset) {
      throw new PanelBundleError(pageId, S.noBundle(pageId));
    }
    if (!isSafeAssetUrl(asset.js)) {
      throw new PanelBundleError(pageId, S.badBundleUrl(pageId));
    }
    let mod: unknown;
    try {
      mod = await this.deps.importModule(asset.js);
    } catch (err) {
      throw new PanelBundleError(pageId, S.bundleLoadFailed(pageId, String(err)), err);
    }

    const candidate = (mod as { default?: unknown } | null)?.default;
    if (!isConsoleClientBundle(candidate)) {
      throw new PanelBundleError(pageId, S.badDefaultExport(pageId));
    }
    return candidate;
  }

  /**
   * 让该页的样式在返回的句柄释放前生效。页头与宿主视图也跟随页面改写的变量，所以样式不等 JS 装成。
   * 同页的多次使用共用一份样式表，按使用计数挂上与撤下；首次使用时下载，下载失败的下次使用时重试。
   */
  useStyle(pageId: string, asset: WebUiAssetEntry | undefined): Disposable {
    const href = asset?.css;
    if (!href) return { dispose() {} };
    if (!isSafeAssetUrl(href)) {
      this.deps.log?.(`「${pageId}」的样式地址不合法，已跳过`, { href: String(href) });
      return { dispose() {} };
    }
    let entry = this.styles.get(pageId);
    if (!entry) {
      const created: StyleEntry = { users: 0, style: null };
      entry = created;
      this.styles.set(pageId, created);
      void this.deps.fetchText(href).then((text) => {
        const { css, droppedImports } = scopeExtensionCss(text, pageId);
        if (droppedImports) this.deps.log?.(`「${pageId}」的样式含 @import，已忽略`, { href, count: droppedImports });
        created.style = this.deps.createStyle(css, href);
        if (created.users > 0) created.style.attach();
      }, (err: unknown) => {
        this.styles.delete(pageId);
        this.deps.log?.(`「${pageId}」的样式加载失败`, { href, error: String(err) });
      });
    }
    const current = entry;
    if (current.users++ === 0) current.style?.attach();
    let done = false;
    return {
      dispose() {
        if (done) return;
        done = true;
        if (--current.users === 0) current.style?.detach();
      },
    };
  }

  /** 获取声明的面板实现；缺失时错误列出扩展提供的面板键。 */
  async resolvePanel(
    pageId: string,
    panelId: string,
    asset: WebUiAssetEntry | undefined,
  ): Promise<WebUiPanel> {
    const bundle = await this.load(pageId, asset);
    const panel = bundle.panels[panelId];
    // 分别报告键缺失与实现不合法。
    if (!(panelId in bundle.panels)) {
      const known = Object.keys(bundle.panels).join(' / ') || S.none;
      throw new PanelBundleError(pageId, S.noSuchBundlePanel(pageId, panelId, known));
    }
    if (!panel || typeof panel.mount !== 'function') {
      throw new PanelBundleError(pageId, S.badPanelImpl(pageId, panelId));
    }
    return panel;
  }
}
