import { pageIntro } from '../../../base/ui/page.ts';
import { pageTabs } from '../../../base/ui/page-tabs.ts';
import { mountExtensionContent, type ExtensionController } from '../extensions/index.ts';
import { icon } from '../../../base/ui/icons.ts';
import { NEW_DRAFT_ID, providerDrafts } from './drafts.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';
import { get, post } from '../../../base/api.ts';
import { S } from './strings.ts';
import { connectionPath, type HubState, type Connection, type Module, type Detail, type Editing } from './types.ts';
import { mountDetail, type DetailController } from './detail.ts';
import { signOutBeforeDelete } from '../../../features/chatgpt/index.ts';
import { CHATGPT_MODULE } from 'cortico-provider-coo/src/vendors.ts';

/** How often the card list re-reads other deployments' usage. */
const USAGE_REFRESH_MS = 5000;
export function mountProviders(ctx: FeatureContext): void {
  const { root, ui, router, signal } = ctx;
  const intro = pageIntro(ui, S.pageTitle);
  const settings = ui.h('div', 'provider-settings');
  const market = ui.h('div', 'provider-market');
  const panes = { settings, market };
  const started = new Set<string>();
  let catalog: ExtensionController | undefined;
  let current: 'settings' | 'market' | undefined;
  const tabs = pageTabs(root.ownerDocument, signal, [
    { value: 'settings', label: S.settingsTab },
    ...(ctx.capabilities.extensions ? [{ value: 'market', label: S.marketTab }] : []),
  ], { onSelect: value => router.navigate(router.route.segments, value === 'market' ? { view: 'market' } : undefined) });
  intro.classList.add('provider-intro');
  intro.append(tabs.el);
  root.append(intro, settings, market);
  const show = () => {
    if (signal.aborted || router.route.segments[0] !== 'providers') return;
    const next = router.route.query.view === 'market' && ctx.capabilities.extensions ? 'market' : 'settings';
    if (current === next) return;
    current = next;
    settings.hidden = next !== 'settings';
    market.hidden = next !== 'market';
    tabs.setValue(next);
    if (next === 'market') catalog?.activate();
    if (started.has(next)) return;
    started.add(next);
    const child = { ...ctx, root: panes[next], route: router.route };
    if (next === 'market') catalog = mountExtensionContent(child, 'provider');
    else void mountConnections(child).catch(error => {
      if (!signal.aborted) settings.replaceChildren(ui.msgline(String(error), true));
    });
  };
  ctx.lifecycle.own(router.onChange(show));
  show();
}

async function mountConnections(ctx: FeatureContext): Promise<void> {
  const { ui, root } = ctx;
  const report = ui.msgline();
  const layout = ui.h('div', 'connection-hub');
  const index = ui.h('div', 'connection-index');
  const cards = ui.h('div', 'connection-cards');
  const detailRoot = ui.h('div', 'connection-detail');
  layout.append(index, detailRoot); root.append(report, layout);
  const opts = { signal: ctx.signal };
  let state = await get<HubState>('/api/providers', opts);
  state.providers.sort((a, b) => Number(b.name === state.active) - Number(a.name === state.active));
  const modules = await get<Module[]>('/api/provider-modules', opts);
  if (ctx.signal.aborted) return;
  const drafts = providerDrafts(root.ownerDocument.defaultView!.localStorage, state.scope);
  let selected = '';
  let newDraft: Editing | null = drafts.get(NEW_DRAFT_ID);
  const invalid = new Set<string>();
  let controller: DetailController | null = null;
  let renderId = 0;
  interface CardNode {
    el: HTMLElement; title: HTMLElement; model: HTMLElement; status: HTMLElement; secondary: HTMLElement;
    kind: HTMLElement; activate: HTMLButtonElement; erase: HTMLButtonElement;
  }
  const nodes = new Map<string, CardNode>();
  const rows = new Map<string, Connection>();
  const doc = root.ownerDocument;
  const run = (work: () => Promise<unknown>) => { void work().catch(error => { if (!ctx.signal.aborted) report.textContent = String(error); }); };
  // 同时只有一张卡处在「确认删除」态。
  let armed: (() => void) | null = null;
  const disarm = () => { armed?.(); armed = null; };
  const fallback = () => state.providers.find(item => item.name === state.active)?.name || state.providers[0]?.name || '';
  function paint() {
    report.textContent = state.active && !state.providers.some(item => item.name === state.active) ? S.missing + state.active : '';
    const all: Array<Connection | { name: string; moduleTitle: string; model: string | null; readiness: { state: string } }> = [...state.providers];
    if (newDraft) all.unshift({ name: NEW_DRAFT_ID, moduleTitle: moduleName(newDraft.entry.kind), model: newDraft.entry.spec?.model ?? null, readiness: { state: 'draft' } });
    for (const [name, node] of nodes) if (!all.some(item => item.name === name)) { node.el.remove(); nodes.delete(name); }
    for (const item of all) {
      const identity = item.name;
      let node = nodes.get(identity);
      if (!node) {
        const el = ui.h('article', 'connection-card'); el.dataset.provider = identity;
        const title = ui.h('div', 'connection-name');
        const facts = ui.h('div', 'connection-facts');
        const fact = (key: string) => { const box = ui.h('span', `kv kv-${key}`); const value = ui.h('span', 'kv-v'); box.append(ui.h('span', 'kv-k', key), value); facts.append(box); return value; };
        const kind = fact('kind'); const model = fact('model');
        const status = ui.h('div', 'connection-status'); const secondary = ui.h('div', 'connection-secondary');
        const activate = ui.button('⇄', { size: 'sm', onClick: () => run(async () => {
          activate.disabled = true;
          try { await post(connectionPath(identity) + '/activate', {}, opts); state.active = identity; paint(); }
          finally { activate.disabled = false; }
        }) });
        activate.classList.add('connection-activate');
        activate.setAttribute('aria-label', S.activate); activate.title = S.activate;
        const connect = ui.h('div', 'connection-connect'); connect.append(activate, ui.h('span', 'connection-connect-label', S.connect));
        const erase = eraseButton(identity);
        el.append(erase, title, facts, status, secondary, connect);
        el.tabIndex = 0;
        el.addEventListener('keydown', event => { if (event.target === el && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); run(() => select(identity)); } }, opts);
        el.addEventListener('click', event => { if (!(event.target as Element).closest('button')) run(() => select(identity)); }, opts);
        if (identity === NEW_DRAFT_ID) cards.prepend(el); else cards.append(el);
        node = { el, title, kind, model, status, secondary, activate, erase }; nodes.set(identity, node);
      }
      const active = identity === state.active;
      node.el.classList.toggle('is-active', active); node.el.classList.toggle('is-selected', identity === selected);
      node.title.textContent = identity === NEW_DRAFT_ID ? newDraft?.name || S.newName : identity;
      node.title.title = node.title.textContent;
      const draft = identity === NEW_DRAFT_ID ? null : drafts.get(identity);
      const model = draft?.entry.spec?.model || item.model || '—';
      node.kind.textContent = item.moduleTitle; node.kind.title = item.moduleTitle;
      node.model.textContent = model;
      node.model.title = model;
      const readiness = invalid.has(identity) && identity !== NEW_DRAFT_ID ? 'invalid' : item.readiness.state;
      const users = 'usage' in item ? item.usage : [];
      const running = users.filter(user => user.running).map(user => user.name);
      const stopped = users.filter(user => !user.running).map(user => user.name);
      const tone = active || running.length ? 'active' : readiness === 'draft' ? 'draft' : readiness === 'ready' ? 'ready' : 'error';
      node.status.dataset.tone = tone;
      node.status.textContent = `${{ active: '●', ready: '✓', error: '!', draft: '✎' }[tone]} ${active ? S.active : running.length ? S.inUse(S.names(running)) : S.readiness[readiness]}`;
      const notes: string[] = [];
      if ((active || running.length) && readiness !== 'ready') notes.push('! ' + S.readiness[readiness]);
      if (identity !== NEW_DRAFT_ID && drafts.has(identity)) notes.push('✎ ' + S.readiness.draft);
      if (active && running.length) notes.push(S.inUse(S.names(running)));
      if (stopped.length) notes.push(S.selectedBy(S.names(stopped)));
      node.secondary.textContent = notes.join(' · ');
      node.secondary.dataset.tone = (active || running.length) && readiness !== 'ready' ? 'error' : 'draft';
      node.activate.parentElement!.hidden = active || identity === NEW_DRAFT_ID || readiness !== 'ready' || running.length > 0;
      if (identity === NEW_DRAFT_ID) rows.delete(identity); else rows.set(identity, item as Connection);
    }
  }
  /** 删除按钮先伸成「确认删除」,第二次点击才动手;点别处或 Esc 收回。 */
  function eraseButton(identity: string): HTMLButtonElement {
    const el = ui.h('button', 'connection-erase') as HTMLButtonElement;
    el.type = 'button';
    const text = ui.h('span', 'connection-erase-text'); text.append(ui.h('span', '', S.eraseConfirm));
    el.append(icon(doc, 'trash'), text);
    const label = (armedNow: boolean) => { const name = armedNow ? S.eraseConfirm : S.remove; el.title = name; el.setAttribute('aria-label', name); };
    label(false);
    el.addEventListener('click', event => {
      event.stopPropagation();
      const wasArmed = el.classList.contains('is-armed');
      disarm();
      if (wasArmed) { run(() => remove(identity)); return; }
      el.classList.add('is-armed'); label(true);
      armed = () => { el.classList.remove('is-armed'); label(false); };
    }, opts);
    return el;
  }
  async function remove(identity: string): Promise<void> {
    if (identity === NEW_DRAFT_ID) {
      drafts.remove(NEW_DRAFT_ID); newDraft = null; invalid.delete(identity);
      if (selected === NEW_DRAFT_ID) await select(fallback(), true); else paint();
      return;
    }
    // the hub refuses to delete an endpoint in use or changed since: only one it will delete is signed out first
    if (rows.get(identity)?.module === CHATGPT_MODULE) {
      const current = await get<Detail>(connectionPath(identity), opts);
      if (!current.references.length && current.revision === rows.get(identity)?.revision) await signOutBeforeDelete(identity, ctx.signal);
    }
    await post(connectionPath(identity) + '/delete', { expectedRevision: rows.get(identity)?.revision }, opts);
    drafts.remove(identity); invalid.delete(identity);
    await refresh();
    if (selected === identity) await select(fallback(), true);
  }
  async function refresh() { state = await get<HubState>('/api/providers', opts); paint(); }
  async function select(identity: string, force = false): Promise<void> {
    if (!force && identity === selected) return;
    const scrollTop = identity === selected ? detailRoot.scrollTop : 0;
    const gen = ++renderId;
    controller?.dispose(); controller = null;
    // The disposed editor stays visible until its replacement is ready and takes no input meanwhile.
    detailRoot.toggleAttribute('inert', true);
    selected = identity; paint();
    if (!identity) {
      detailRoot.toggleAttribute('inert', false);
      detailRoot.replaceChildren(ui.h('h3', '', S.empty), ui.msgline(S.emptyHint), ui.button(S.create, { onClick: () => run(create) }));
      return;
    }
    try { await openDetail(identity, gen, scrollTop); } catch (error) {
      if (gen === renderId) { detailRoot.replaceChildren(); detailRoot.toggleAttribute('inert', false); }
      throw error;
    }
  }
  async function openDetail(identity: string, gen: number, scrollTop: number): Promise<void> {
    const saved = identity === NEW_DRAFT_ID ? null : await get<Detail>(connectionPath(identity), opts);
    if (gen !== renderId || ctx.signal.aborted) return;
    const detailView = ui.h('div');
    const mounted = await mountDetail({ ctx, root: detailView, modules, saved, draft: identity === NEW_DRAFT_ID ? newDraft : drafts.get(identity),
      // Edits persist as a browser draft as they happen; a form back at its saved state drops the draft.
      changed: (editing, hasErrors, dirty) => {
        if (hasErrors) invalid.add(identity); else invalid.delete(identity);
        if (identity === NEW_DRAFT_ID) { newDraft = editing; drafts.set(editing); }
        else if (dirty) drafts.set(editing); else drafts.remove(identity);
        paint();
      },
      onSaved: async (name, show = true) => { drafts.remove(identity); invalid.delete(identity); if (identity === NEW_DRAFT_ID) newDraft = null; await refresh(); if (show) await select(name, true); },
      cancelled: async () => { drafts.remove(identity); invalid.delete(identity); if (identity === NEW_DRAFT_ID) newDraft = null; await select(identity === NEW_DRAFT_ID ? state.providers.find(item => item.name === state.active)?.name || state.providers[0]?.name || '' : identity, true); },
      deleted: async () => { drafts.remove(identity); invalid.delete(identity); await refresh(); await select(state.providers.find(item => item.name === state.active)?.name || state.providers[0]?.name || '', true); },
      duplicate: async editing => {
        if (newDraft) { await select(NEW_DRAFT_ID); return; }
        const used = new Set(state.providers.map(item => item.name.toLowerCase()));
        const base = editing.name.slice(0, 56); let candidate = base; let number = 2;
        while (used.has(candidate.toLowerCase())) candidate = `${base}-${number++}`;
        editing.name = candidate; newDraft = editing; await select(NEW_DRAFT_ID, true);
      },
    });
    if (gen !== renderId || ctx.signal.aborted) mounted.dispose();
    else {
      detailRoot.replaceChildren(detailView);
      detailRoot.toggleAttribute('inert', false);
      detailRoot.scrollTop = scrollTop;
      controller = mounted;
    }
  }
  async function create() {
    if (newDraft) return select(NEW_DRAFT_ID);
    newDraft = { original: null, name: '', entry: { kind: '', baseUrl: '' }, secretValue: '', raw: {} };
    drafts.set(newDraft);
    await select(NEW_DRAFT_ID, true);
  }
  const moduleName = (kind: string) => modules.find(module => module.id === kind)?.title ?? kind;
  doc.addEventListener('click', event => { if (!(event.target as Element).closest('.connection-erase')) disarm(); }, opts);
  doc.addEventListener('keydown', event => { if (event.key === 'Escape') disarm(); }, opts);
  const creator = ui.h('div', 'connection-create');
  creator.append(ui.button(S.create, { variant: 'primary', onClick: () => run(create) }), ui.h('p', 'connection-create-hint', S.createHint));
  index.append(creator, cards);
  ctx.lifecycle.own({ dispose: () => { renderId++; controller?.dispose(); } });
  let routeName = ctx.route.segments[1];
  ctx.lifecycle.own(ctx.router.onChange(route => {
    if (ctx.signal.aborted || route.segments[0] !== 'providers' || route.query.view === 'market') return;
    const name = route.segments[1];
    if (name && name !== routeName) run(() => select(name));
    routeName = name;
  }));
  // Other deployments' selections and liveness change without this page; the detail form is left alone.
  let refreshing = false;
  ctx.lifecycle.interval(() => {
    if (refreshing) return;
    refreshing = true;
    run(async () => { try { await refresh(); } finally { refreshing = false; } });
  }, USAGE_REFRESH_MS);
  paint();
  const wanted = ctx.route.segments[1] ?? (newDraft ? NEW_DRAFT_ID : undefined);
  await select(wanted && (wanted === NEW_DRAFT_ID || state.providers.some(item => item.name === wanted)) ? wanted : state.providers.find(item => item.name === state.active)?.name ?? state.providers[0]?.name ?? '', true);
}
export const providersFeature: FrameworkFeature = { route: 'providers', label: S.navLabel, icon: 'cpu', navGroup: S.navGroup, mount: mountProviders };
