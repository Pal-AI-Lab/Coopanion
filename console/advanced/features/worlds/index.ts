/** Both World views keep the same avatar nodes and row geometry. */
import { resolveConsoleLinkHref } from '../../../base/theme/handoff.ts';
import { pageIdFor } from '../../../base/protocol.ts';
import type { WebUiBadge, WebUiLamp, WebUiLink } from 'cortico/web/shared/webui-protocol.ts';
import { get, post } from '../../../base/api.ts';
import { PROVIDER_ROUTE } from '../../console-pages/host.ts';
import { icon, type ConsoleIconName } from '../../../base/ui/icons.ts';
import { lampRow, subscribeLamps } from '../../../base/ui/lamp.ts';
import { pageIntro } from '../../../base/ui/page.ts';
import { pageTabs } from '../../../base/ui/page-tabs.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';
import { mountExtensionContent, iconUrl, type ExtensionView, type ExtensionController } from '../extensions/index.ts';
import { S as E } from '../extensions/strings.ts';
import { worldLibrary, needsRestart, type WorldLibraryItem } from './library.ts';
import { S } from './strings.ts';
import { S as UI } from '../../../base/ui/strings.ts';

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
  let worldsReady = !ctx.capabilities.worlds, extensionsReady = !canBrowse;
  const layoutKey = `coopanion.world-layout:${win.location.origin}`;
  let savedLayout: { positions: [string, number][]; scroll: number; at: number } | undefined;
  try {
    const value = JSON.parse(win.sessionStorage.getItem(layoutKey) || 'null');
    win.sessionStorage.removeItem(layoutKey);
    if (value && Number.isFinite(value.at) && Date.now() - value.at < 120000 && Number.isFinite(value.scroll)
      && Array.isArray(value.positions) && value.positions.every((pair: unknown) => Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string' && Number.isFinite(pair[1]))) savedLayout = value;
  } catch { /* Storage may be unavailable. */ }

  const lampNodes = new Map<string, HTMLSpanElement>();
  const railNodes = new Map<string, HTMLButtonElement>();
  const movements = new Set<Animation>();
  lifecycle.add(() => { for (const animation of movements) animation.cancel(); });
  lifecycle.own(subscribeLamps(doc, lamps => {
    for (const [id, el] of lampNodes) paintSignals(el, lamps[id] ?? []);
  }));
  const intro = pageIntro(ui, S.introTitle); intro.classList.add('world-intro');
  const tabs = pageTabs(doc, signal, [
    { value: 'mine', label: S.myWorlds },
    ...(canBrowse ? [{ value: 'market', label: S.marketTab }] : []),
  ], { onSelect: value => router.navigate(['world'], value === 'market' ? { view: 'market' } : undefined) });
  intro.append(tabs.el);
  const workspace = ui.h('div', 'world-workspace');
  const rail = ui.h('section', 'world-library'); rail.setAttribute('aria-label', S.extensionList);
  const railList = ui.h('div', 'world-library-list');
  const pendingGroup = ui.h('div', 'world-pending-group');
  const pendingList = ui.h('div', 'world-pending-list');
  const restartRoot = ui.h('div', 'world-restart-footer');
  const readyList = ui.h('div', 'world-ready-list');
  const readyGroup = ui.h('div', 'world-ready-group');
  pendingGroup.append(ui.h('h2', 'world-library-heading', E.statePendingRestart), pendingList, restartRoot); pendingGroup.hidden = true;
  readyGroup.append(ui.h('h2', 'world-library-heading', S.extensionList), readyList);
  railList.append(pendingGroup, readyGroup);
  const status = ui.h('div', 'world-workspace-status');
  const catalog = ui.h('div', 'world-pane world-market');
  const msg = ui.msgline(); msg.setAttribute('role', 'status');
  rail.append(railList);
  const feedback = ui.h('div', 'world-feedback'); feedback.append(msg);
  workspace.append(rail, catalog); root.append(intro, status, feedback, workspace);
  const reduceMotion = () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let transition: Animation | undefined;
  lifecycle.add(() => transition?.cancel());
  const show = () => {
    if (signal.aborted || router.route.segments[0] !== 'world') return;
    const next = canBrowse && router.route.query.view === 'market' ? 'market' : 'mine';
    if (next === current) return;
    const previous = current; current = next;
    const style = transition?.playState === 'running' ? win.getComputedStyle(catalog) : undefined;
    const interrupted = style ? { clipPath: style.clipPath } : undefined;
    transition?.cancel();
    workspace.dataset.view = next;
    tabs.setValue(next);
    catalog.inert = next !== 'market';
    for (const row of railList.querySelectorAll<HTMLElement>('.world-blade')) row.inert = next === 'market';
    if (next === 'mine' && catalog.contains(doc.activeElement)) tabs.el.querySelector<HTMLButtonElement>('[aria-current=page]')?.focus();
    if (next === 'mine' && focusRequested) focusSelected();
    const closed = { clipPath: 'inset(0 0 0 100%)' };
    const open = { clipPath: 'inset(0 0 0 0%)' };
    catalog.hidden = false;
    if (previous && !reduceMotion() && catalog.animate) {
      transition = catalog.animate(next === 'market' ? [interrupted ?? closed, open] : [interrupted ?? open, closed], { duration: 360, easing: 'cubic-bezier(.2,.7,.2,1)' });
      const own = transition;
      void own.finished.then(() => { if (transition === own) catalog.hidden = current !== 'market'; }, () => {});
    } else catalog.hidden = next !== 'market';
  };
  lifecycle.own(router.onChange(show)); show();
  if (canBrowse) market = mountExtensionContent({ ...ctx, root: catalog }, 'world', catalog, {
    statusRoot: status, restartRoot,
    beforeReload: () => {
      try { win.sessionStorage.setItem(layoutKey, JSON.stringify({ positions: [...railNodes].filter(([, node]) => node.parentElement!.dataset.state === 'pending').map(([key, node]) => [key, node.parentElement!.getBoundingClientRect().top]), scroll: railList.scrollTop, at: Date.now() })); } catch { /* Storage may be unavailable. */ }
    },
    onChange: items => { extensions = items; extensionsReady = true; void load(); },
    onLoadError: () => { extensionsReady = true; render(); },
    onAdded: name => { const previous = recent.indexOf(name); if (previous >= 0) recent.splice(previous, 1); recent.unshift(name); selected = name; railList.scrollTop = 0; },
  });
  else status.hidden = true;
  function setMsg(text: string, bad?: boolean): void {
    msg.textContent = text;
    msg.className = 'msgline' + (bad ? ' bad' : '');
  }

  async function reloadPrefix(): Promise<void> {
    try {
      await post('/api/session/reload-prefix', undefined, { signal });
      if (!signal.aborted) await load();
    } catch (err) {
      if (!isAbort(err) && !signal.aborted) setMsg(S.prefixReloadFailed(errText(err)), true);
    }
  }

  const changingWorlds = new Set<string>();
  async function changeWorld(m: WorldView, action: 'activation' | 'visibility', value: boolean): Promise<void> {
    if (changingWorlds.has(m.id)) return;
    changingWorlds.add(m.id); setMsg(''); render();
    let drifted = false;
    try {
      if (action === 'activation' && !value && (!await ui.confirm({ title: S.deactivateTitle(m.label || m.id), body: S.deactivateBody(m.id), danger: true }) || signal.aborted)) return;
      const out = await post<{ driftedWorlds?: string[] }>(`/api/worlds/${action}`, action === 'activation' ? { id: m.id, enabled: value } : { id: m.id, visible: value }, { signal });
      drifted = action === 'visibility' && !!out.driftedWorlds?.length;
      if (!signal.aborted) void ctx.refreshNav?.().catch(ctx.onError);
    } catch (error) {
      if (!isAbort(error) && !signal.aborted) setMsg(S.toggleFailed(errText(error)), true);
    } finally {
      changingWorlds.delete(m.id);
      if (!signal.aborted) await load();
    }
    if (drifted && !signal.aborted && await ui.confirm({ title: S.reloadNowTitle, body: S.reloadNowBody(m.label || m.id, value) })) await reloadPrefix();
  }

  async function restart(m: WorldView): Promise<void> {
    if (changingWorlds.has(m.id)) return;
    const name = m.label || m.id;
    const ok = await ui.confirm({
      title: S.restartTitle(name),
      body: S.restartBody,
    });
    if (!ok || ctx.signal.aborted) return;
    changingWorlds.add(m.id); setMsg(''); render();
    try {
      await post(
        '/api/worlds/restart',
        { id: m.id },
        { signal: ctx.signal },
      );
    } catch (err) {
      if (isAbort(err) || ctx.signal.aborted) return;
      setMsg(S.restartFailed(errText(err)), true);
    } finally {
      changingWorlds.delete(m.id);
      if (!signal.aborted) await load();
    }
  }

  function iconButton(
    name: ConsoleIconName,
    label: string,
    cls: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = ui.h('button', `iobtn ${cls}`);
    btn.type = 'button';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.appendChild(icon(doc, name));
    btn.addEventListener('click', onClick, { signal: ctx.signal });
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
    const row = Array.from(railList.querySelectorAll<HTMLElement>('.world-blade')).find(row => row.dataset.key === selected);
    if (row) { row.scrollIntoView?.({ block: 'nearest', behavior: reduceMotion() ? 'instant' : 'smooth' }); row.focus({ preventScroll: true }); }
  }
  function renderRail(items: readonly WorldLibraryItem[]) {
    const restored = worldsReady && extensionsReady ? savedLayout : undefined;
    const positions = new Map(restored?.positions);
    if (restored) savedLayout = undefined;
    pendingGroup.hidden = !items.some(needsRestart);
    for (const [key, node] of railNodes) if (!items.some(item => item.key === key)) { node.parentElement?.remove(); railNodes.delete(key); }
    const cursors = new Map<HTMLElement, Element | null>([[pendingList, pendingList.firstElementChild], [readyList, readyList.firstElementChild]]);
    for (const item of items) {
      let node = railNodes.get(item.key);
      if (!node) {
        node = ui.h('button', 'world-library-item'); node.type = 'button';
        node.append(avatar(item));
        node.addEventListener('click', () => select(item), { signal }); railNodes.set(item.key, node);
      }
      node.title = item.label; node.setAttribute('aria-label', item.label); node.setAttribute('aria-current', item.key === selected ? 'true' : 'false');
      const row = worldRow(item); row.inert = current === 'market';
      let entry = node.parentElement;
      if (!entry) { entry = ui.h('div', 'world-library-entry'); entry.append(node, row); }
      else entry.querySelector('.world-blade')!.replaceWith(row);
      entry.dataset.state = row.dataset.state;
      const group = needsRestart(item) ? pendingList : readyList;
      const cursor = cursors.get(group)!;
      if (entry !== cursor) group.insertBefore(entry, cursor);
      cursors.set(group, entry.nextElementSibling);
    }
    if (restored) railList.scrollTop = restored.scroll;
    for (const [key, node] of railNodes) {
      const before = positions.get(key), delta = before === undefined ? 0 : before - node.parentElement!.getBoundingClientRect().top;
      if (delta && node.parentElement!.dataset.state !== 'pending' && node.parentElement!.dataset.state !== 'failed' && !reduceMotion()) {
        const animation = node.parentElement!.animate?.([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { duration: 480, easing: 'cubic-bezier(.2,.7,.2,1)' });
        if (animation) { movements.add(animation); void animation.finished.then(() => movements.delete(animation), () => movements.delete(animation)); }
      }
    }
  }
  function paintSignals(host: HTMLElement, lamps: readonly WebUiLamp[]): void {
    const signature = JSON.stringify(lamps);
    if (host.dataset.lamps === signature) return;
    host.dataset.lamps = signature;
    host.replaceChildren(...lamps.map(lamp => {
      const reading = ui.h('span', 'world-signal');
      const text = `${lamp.label} · ${lamp.hint || UI.lamp[lamp.state]}`;
      reading.title = text; reading.append(lampRow(doc, [lamp]), ui.h('span', '', text)); return reading;
    }));
    host.hidden = !lamps.length;
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
      const lamps = ui.h('span', 'world-signals'); paintSignals(lamps, m.lamps ?? []); readings.append(lamps); lampNodes.set(worldPageId(m.id), lamps);
    }
    if (m?.prefixDrifted) readings.append(ui.pill(S.prefixPending));
    const actions = ui.h('div', 'world-blade-actions');
    if (m && !pending && !failed) {
      if (m.status === 'active') {
        if (canToggleVisibility) actions.append(iconButton(m.visible === false ? 'eye-off' : 'eye', m.visible === false ? S.showToAgent : S.hideFromAgent, m.visible === false ? '' : 'iobtn-visible', () => void changeWorld(m, 'visibility', m.visible === false)));
        if (canActivate) actions.append(iconButton('refresh', S.restartWorld, '', () => void restart(m)), iconButton('power', S.deactivateWorld, 'iobtn-stop', () => void changeWorld(m, 'activation', false)));
      } else if (canActivate) actions.append(iconButton('power', S.activateWorld, '', () => void changeWorld(m, 'activation', true)));
      if (changingWorlds.has(m.id)) for (const button of actions.querySelectorAll('button')) button.disabled = true;
    }
    if (m) actions.append(ui.button(S.configure, { size: 'sm', onClick: () => router.navigate([PROVIDER_ROUTE, worldPageId(m.id)]) }));
    if (pack) actions.append(iconButton('package', S.manageExtension, '', () => market?.manage(pack.name)));
    row.append(identity, readings, actions);
    if (failed) row.append(ui.h('p', 'world-blade-note bad', m?.reason || pack?.reason || S.missingReasonDefault));
    else if (m?.status === 'inactive' && !canActivate) row.append(ui.h('p', 'world-blade-note', S.inactiveNoteManual(m.id)));
    else if (!m && !pending) row.append(ui.h('p', 'world-blade-note', E.worldNotLoaded));
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
    if (!worldsReady || !extensionsReady || signal.aborted) return;
    const items = worldLibrary(worlds, extensions, recent);
    readyList.querySelector('.placeholder')?.remove();
    lampNodes.clear(); renderRail(items);
    if (!items.length) readyList.replaceChildren(ui.placeholder(S.noWorlds));
    readyGroup.hidden = !!items.length && !items.some(item => !needsRestart(item));
  }
  async function load(): Promise<void> {
    if (!ctx.capabilities.worlds) { render(); return; }
    const own = ++generation;
    try {
      const data = await get<{ worlds: WorldView[] }>('/api/worlds', { signal });
      if (signal.aborted || own !== generation) return;
      worlds = data.worlds; worldsReady = true; render();
    } catch (error) {
      if (!signal.aborted && own === generation) { worldsReady = true; setMsg(S.listLoadFailed(errText(error)), true); render(); }
    }
  }
  readyList.append(ui.placeholder(S.loading));
  void load();
}

export const worldsFeature: FrameworkFeature = {
  route: 'world', label: S.navLabel, icon: 'boxes', navMode: 'world-root',
  needsAny: ['worlds', 'extensions'], mount: mountWorlds,
};
