/** World library, runtime controls and extension catalog share one persistent navigation rail. */
import { resolveConsoleLinkHref } from '../../../base/theme/handoff.ts';
import { pageIdFor } from '../../../base/protocol.ts';
import type { WebUiBadge, WebUiLamp, WebUiLink } from 'cortico/web/shared/webui-protocol.ts';
import { get, post } from '../../../base/api.ts';
import { PROVIDER_ROUTE } from '../../console-pages/host.ts';
import { icon, type ConsoleIconName } from '../../../base/ui/icons.ts';
import { lampRow, paintLamps, subscribeLamps } from '../../../base/ui/lamp.ts';
import { pageIntro } from '../../../base/ui/page.ts';
import { pageTabs } from '../../../base/ui/page-tabs.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';
import { mountExtensionContent, iconUrl, type ExtensionView, type ExtensionController } from '../extensions/index.ts';
import { S as E } from '../extensions/strings.ts';
import { worldLibrary, type WorldLibraryItem } from './library.ts';
import { S } from './strings.ts';

const worldPageId = (id: string) => pageIdFor('world', id);
export interface WorldView {
  id: string;
  status: 'active' | 'inactive' | 'missing';
  /** World 自报的状态灯,一条链路一颗(仅 active 有意义)。 */
  lamps?: WebUiLamp[];
  /** 人类可读名;没有就退回 id。 */
  label?: string;
  /** Persona定义的渠道;false = 部署侧选配的外挂;undefined = 没说。 */
  declared?: boolean;
  /** 当前对 agent 可见(仅 active 有意义)。 */
  visible?: boolean;
  /** 可见性已改,但当前 system 前缀还是按旧的烘出来的。 */
  prefixDrifted?: boolean;
  /** 装不上的原因(仅 missing)。原样显示,这一页不改写措辞。 */
  reason?: string;
  workspace?: string;
  tools?: string[];
  badges?: WebUiBadge[];
  links?: WebUiLink[];
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isAbort(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === 'AbortError';
}


export function mountWorlds(ctx: FeatureContext): void {
  const { ui, root, signal, lifecycle, router } = ctx;
  const doc = root.ownerDocument, win = doc.defaultView!;
  const canToggleVisibility = ctx.capabilities.worldVisibility === true;
  const canActivate = ctx.capabilities.worldActivation === true;
  const canBrowse = ctx.capabilities.extensions === true;
  let worlds: WorldView[] = [], extensions: readonly ExtensionView[] = [];
  let selected = '', current = '', generation = 0, focusRequested = false;
  let market: ExtensionController | undefined;
  const recent: string[] = [];
  const lampNodes = new Map<string, HTMLSpanElement>();
  const railNodes = new Map<string, HTMLButtonElement>();
  lifecycle.own(subscribeLamps(doc, lamps => {
    for (const [id, el] of lampNodes) paintLamps(el, lamps[id] ?? []);
  }));
  const intro = pageIntro(ui, S.introTitle); intro.classList.add('world-intro');
  const tabs = pageTabs(doc, signal, [
    { value: 'mine', label: S.myWorlds },
    ...(canBrowse ? [{ value: 'market', label: S.marketTab }] : []),
  ], { onSelect: value => router.navigate(['world'], value === 'market' ? { view: 'market' } : undefined) });
  intro.append(tabs.el);
  const workspace = ui.h('div', 'world-workspace');
  const rail = ui.h('nav', 'world-library'); rail.setAttribute('aria-label', S.library);
  const railTitle = ui.h('div', 'world-library-heading', S.library);
  const railList = ui.h('div', 'world-library-list'); rail.append(railTitle, railList);
  const stage = ui.h('div', 'world-stage');
  const status = ui.h('div', 'world-workspace-status');
  const mine = ui.h('div', 'world-pane world-mine');
  const catalog = ui.h('div', 'world-pane world-market');
  const management = ui.h('div', 'world-management-scroll');
  const toolbar = ui.rowbar(); toolbar.classList.add('world-management-toolbar');
  const msg = ui.msgline(); msg.setAttribute('role', 'status');
  const reloadBtn = ui.button(S.reloadPrefixBtn, { size: 'sm', onClick: () => void reloadPrefix(reloadBtn) });
  toolbar.append(ui.h('span', 'grow'), reloadBtn, ui.button(E.refresh, { size: 'sm', onClick: () => void refresh() }));
  const grid = ui.h('div', 'world-blades');
  management.append(msg, grid); mine.append(toolbar, management);
  stage.append(status, mine, catalog); workspace.append(rail, stage); root.append(intro, workspace);
  const reduceMotion = () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const show = () => {
    if (signal.aborted || router.route.segments[0] !== 'world') return;
    const next = canBrowse && router.route.query.view === 'market' ? 'market' : 'mine';
    if (next === current) return;
    const previous = current; current = next;
    mine.hidden = next !== 'mine'; catalog.hidden = next !== 'market'; tabs.setValue(next);
    if (next === 'mine' && focusRequested) focusSelected();
    const pane = next === 'mine' ? mine : catalog;
    if (previous && !reduceMotion()) pane.animate?.([{ opacity: 0, transform: `translateX(${next === 'mine' ? '-12' : '12'}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 200, easing: 'ease-out' });
  };
  lifecycle.own(router.onChange(show)); show();
  if (canBrowse) market = mountExtensionContent({ ...ctx, root: catalog }, 'world', catalog, {
    statusRoot: status,
    onChange: items => { extensions = items; render(); void load(); },
    onAdded: name => { const previous = recent.indexOf(name); if (previous >= 0) recent.splice(previous, 1); recent.unshift(name); selected = name; railList.scrollTop = 0; },
  });
  else status.hidden = true;
  async function refresh(): Promise<void> {
    if (market) await market.refresh(); else await load();
  }
  function setMsg(text: string, bad?: boolean): void {
    msg.textContent = text;
    msg.className = 'msgline' + (bad ? ' bad' : '');
  }

  async function reloadPrefix(btn?: HTMLButtonElement): Promise<void> {
    const lock = btn ? ui.disable(btn) : null;
    try {
      const out = await post<{ result?: string }>(
        '/api/session/reload-prefix',
        undefined,
        { signal: ctx.signal },
      );
      if (ctx.signal.aborted) return;
      setMsg(out?.result || S.prefixReloaded);
      await refresh();
    } catch (err) {
      if (isAbort(err) || ctx.signal.aborted) return;
      setMsg(S.prefixReloadFailed(errText(err)), true);
    } finally {
      lock?.dispose();
    }
  }

  /**
   * 可见性只改「对 agent 是否可见」。事件投递立即生效;环境提示词与工具同属缓存前缀,
   * 要等一次前缀重载才跟上——所以服务端报了漂移时问一句,操作者说了算。
   */
  async function toggleVisibility(
    m: WorldView,
    wantVisible: boolean,
    btn: HTMLButtonElement,
  ): Promise<void> {
    const lock = ui.disable(btn);
    let drifted = 0;
    try {
      const out = await post<{ result?: string; driftedWorlds?: string[] }>(
        '/api/worlds/visibility',
        { id: m.id, visible: wantVisible },
        { signal: ctx.signal },
      );
      if (ctx.signal.aborted) return;
      setMsg(out?.result || S.updated);
      drifted = (out?.driftedWorlds ?? []).length;
      await refresh();
    } catch (err) {
      if (isAbort(err) || ctx.signal.aborted) return;
      setMsg(S.toggleFailed(errText(err)), true);
      return;
    } finally {
      lock.dispose();
    }
    if (drifted === 0) return;
    const name = m.label || m.id;
    const ok = await ui.confirm({
      title: S.reloadNowTitle,
      body: S.reloadNowBody(name, wantVisible),
    });
    if (!ok || ctx.signal.aborted) return;
    await reloadPrefix();
  }

  /** 激活、停用与重启请求执行期间禁用相关按钮，完成后刷新清单。 */
  async function activation(m: WorldView, wantEnabled: boolean, btn: HTMLButtonElement): Promise<void> {
    const name = m.label || m.id;
    if (!wantEnabled) {
      const ok = await ui.confirm({
        title: S.deactivateTitle(name),
        body: S.deactivateBody(m.id),
        danger: true,
      });
      if (!ok || ctx.signal.aborted) return;
    }
    const lock = ui.disable(btn);
    try {
      const out = await post<{ result?: string }>(
        '/api/worlds/activation',
        { id: m.id, enabled: wantEnabled },
        { signal: ctx.signal },
      );
      if (ctx.signal.aborted) return;
      setMsg(out?.result || (wantEnabled ? S.activated : S.deactivated));
      void ctx.refreshNav?.().catch(ctx.onError);
      await refresh();
    } catch (err) {
      if (isAbort(err) || ctx.signal.aborted) return;
      setMsg(wantEnabled ? S.activateFailed(errText(err)) : S.deactivateFailed(errText(err)), true);
    } finally {
      lock.dispose();
    }
  }

  async function restart(m: WorldView, btn: HTMLButtonElement): Promise<void> {
    const name = m.label || m.id;
    const ok = await ui.confirm({
      title: S.restartTitle(name),
      body: S.restartBody,
    });
    if (!ok || ctx.signal.aborted) return;
    const lock = ui.disable(btn);
    try {
      const out = await post<{ result?: string }>(
        '/api/worlds/restart',
        { id: m.id },
        { signal: ctx.signal },
      );
      if (ctx.signal.aborted) return;
      setMsg(out?.result || S.restarted);
      await refresh();
    } catch (err) {
      if (isAbort(err) || ctx.signal.aborted) return;
      setMsg(S.restartFailed(errText(err)), true);
    } finally {
      lock.dispose();
    }
  }

  function iconButton(
    name: ConsoleIconName,
    label: string,
    cls: string,
    onClick: (btn: HTMLButtonElement) => void,
  ): HTMLButtonElement {
    const btn = ui.h('button', `iobtn ${cls}`);
    btn.type = 'button';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.appendChild(icon(doc, name));
    btn.addEventListener('click', () => onClick(btn), { signal: ctx.signal });
    return btn;
  }


  function avatar(item: WorldLibraryItem): HTMLElement {
    const box = ui.h('span', 'world-avatar');
    const initials = item.label.replace(/^cortico-world-/, '');
    box.append(ui.h('span', '', Array.from(initials).slice(0, 2).join('').toUpperCase()));
    if (item.extension?.icon) {
      const img = ui.h('img'); img.alt = ''; img.src = iconUrl(item.extension.name, item.extension.installedVersion ?? item.extension.version);
      img.addEventListener('error', () => img.remove(), { once: true, signal }); box.append(img);
    }
    return box;
  }
  function select(item: WorldLibraryItem) {
    selected = item.key; focusRequested = true;
    router.navigate(['world']);
    for (const [key, node] of railNodes) node.setAttribute('aria-current', key === selected ? 'true' : 'false');
    if (current === 'mine') focusSelected();
  }
  function focusSelected() {
    focusRequested = false;
    const row = Array.from(grid.children).find(row => (row as HTMLElement).dataset.key === selected) as HTMLElement | undefined;
    if (row) { row.scrollIntoView?.({ block: 'nearest', behavior: reduceMotion() ? 'instant' : 'smooth' }); row.focus({ preventScroll: true }); }
  }
  function renderRail(items: readonly WorldLibraryItem[]) {
    const positions = new Map(Array.from(railNodes, ([key, node]) => [key, node.getBoundingClientRect().top]));
    for (const [key, node] of railNodes) if (!items.some(item => item.key === key)) { node.remove(); railNodes.delete(key); }
    for (const item of items) {
      let node = railNodes.get(item.key);
      if (!node) {
        node = ui.h('button', 'world-library-item'); node.type = 'button';
        node.append(avatar(item), ui.h('span', 'world-library-name', item.label.replace(/^cortico-world-/, '')));
        node.addEventListener('click', () => select(item), { signal }); railNodes.set(item.key, node);
      }
      const name = node.querySelector('.world-library-name')!;
      name.textContent = item.label.replace(/^cortico-world-/, '');
      node.title = item.label; node.setAttribute('aria-label', item.label); node.setAttribute('aria-current', item.key === selected ? 'true' : 'false');
      railList.append(node);
    }
    for (const [key, node] of railNodes) {
      const before = positions.get(key), delta = before === undefined ? 0 : before - node.getBoundingClientRect().top;
      if (delta && !reduceMotion()) node.animate?.([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' });
    }
  }
  function worldRow(item: WorldLibraryItem): HTMLElement {
    const row = ui.h('article', 'world-blade'); row.dataset.key = item.key; row.tabIndex = -1;
    const { world: m, extension: pack } = item;
    const pending = pack?.state === 'pending-restart' || pack?.state === 'removed';
    const failed = pack?.state === 'failed' || m?.status === 'missing';
    row.dataset.state = pending ? 'pending' : failed ? 'failed' : m?.status === 'active' ? m.visible === false ? 'running' : 'attached' : 'inactive';
    const identity = ui.h('div', 'world-blade-identity');
    const heading = ui.h('h3');
    if (m) {
      const details = ui.h('button', 'world-name', item.label); details.type = 'button';
      details.addEventListener('click', () => showDetails(m), { signal }); heading.append(details);
    } else heading.textContent = item.label;
    identity.append(heading, ui.h('code', '', m?.id ?? pack?.name ?? item.key));
    const readings = ui.h('div', 'world-blade-readings');
    const state = pending ? pack?.state === 'removed' ? E.stateRemoved : E.statePendingRestart : failed ? E.stateFailed : m?.status === 'active' ? m.visible === false ? S.modeRunning : S.modeAttached : S.modeOff;
    readings.append(ui.h('span', 'world-state', state));
    if (m?.status === 'active') {
      const lamps = lampRow(doc, m.lamps ?? []); readings.append(lamps); lampNodes.set(worldPageId(m.id), lamps);
    }
    if (m?.prefixDrifted) readings.append(ui.pill(S.prefixPending));
    const actions = ui.h('div', 'world-blade-actions');
    if (m && !pending && !failed) {
      if (m.status === 'active') {
        if (canToggleVisibility) actions.append(iconButton(m.visible === false ? 'eye-off' : 'eye', m.visible === false ? S.showToAgent : S.hideFromAgent, m.visible === false ? '' : 'iobtn-visible', btn => void toggleVisibility(m, m.visible === false, btn)));
        if (canActivate) actions.append(iconButton('refresh', S.restartWorld, '', btn => void restart(m, btn)), iconButton('power', S.deactivateWorld, 'iobtn-stop', btn => void activation(m, false, btn)));
      } else if (canActivate) {
        const start = ui.button(S.activateWorld, { size: 'sm', onClick: () => void activation(m, true, start) }); actions.append(start);
      }
    }
    if (m) actions.append(ui.button(S.configure, { size: 'sm', onClick: () => router.navigate([PROVIDER_ROUTE, worldPageId(m.id)]) }));
    if (pack) actions.append(iconButton('package', S.manageExtension, '', () => market?.manage(pack.name)));
    row.append(avatar(item), identity, readings, actions);
    if (failed) row.append(ui.h('p', 'world-blade-note bad', m?.reason || pack?.reason || S.missingReasonDefault));
    else if (pending) row.append(ui.h('p', 'world-blade-note', E.restartNeeded));
    else if (m?.status === 'inactive' && !canActivate) row.append(ui.h('p', 'world-blade-note', S.inactiveNoteManual(m.id)));
    else if (!m) row.append(ui.h('p', 'world-blade-note', E.worldNotLoaded));
    return row;
  }
  let detailsDrawer: ReturnType<typeof ui.drawer> | undefined;
  lifecycle.add(() => detailsDrawer?.dispose());
  function showDetails(m: WorldView): void {
    const box = ui.h('div');
    const badges = ui.rowbar();
    if (m.declared !== undefined) badges.append(ui.pill(m.declared ? S.declaredByPersona : S.optionalAddon));
    badges.append(...(m.badges ?? []).map(badge => ui.pill(`${badge.label} ${badge.value}`, badge.tone)));
    box.append(badges, ui.kv([
      { k: S.kvTools, v: (m.tools ?? []).join(S.listSep) || S.kvNone },
      { k: S.kvWorkspace, v: m.workspace || '—' },
    ]));
    if (m.prefixDrifted) box.append(ui.msgline(S.driftNote));
    const actions = ui.actions();
    for (const link of m.links ?? []) if (link.href) actions.append(ui.button(link.label || S.open, {
      size: 'sm', onClick: () => win.open(resolveConsoleLinkHref(doc, link), '_blank', 'noopener'),
    }));
    box.append(actions);
    detailsDrawer?.dispose(); detailsDrawer = ui.drawer(m.label || m.id, box);
  }
  function render(): void {
    const items = worldLibrary(worlds, extensions, recent);
    lampNodes.clear(); renderRail(items);
    grid.replaceChildren(...items.map(worldRow));
    if (!items.length) grid.append(ui.placeholder(S.noWorlds));
    reloadBtn.hidden = !worlds.some(world => world.prefixDrifted);
  }
  async function load(): Promise<void> {
    if (!ctx.capabilities.worlds) { render(); return; }
    const own = ++generation;
    try {
      const data = await get<{ worlds: WorldView[] }>('/api/worlds', { signal });
      if (signal.aborted || own !== generation) return;
      worlds = data.worlds; render();
    } catch (error) {
      if (!signal.aborted && own === generation) setMsg(S.listLoadFailed(errText(error)), true);
    }
  }
  grid.append(ui.placeholder(S.loading));
  void load();
}

export const worldsFeature: FrameworkFeature = {
  route: 'world', label: S.navLabel, icon: 'boxes', navMode: 'world-root',
  needsAny: ['worlds', 'extensions'], mount: mountWorlds,
};
