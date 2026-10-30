// @vitest-environment jsdom
/**
 * The World and provider pages against a faked WebUI API. Its strings are picked when the
 * modules load, so the window language is set to zh before they are imported.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

localStorage.setItem('cortico.console.language', 'zh');
const { createConsoleUi } = await import('../console/base/ui/index.ts');
const { Lifecycle } = await import('../console/base/lifecycle.ts');
const { Router } = await import('../console/base/router.ts');
const { mountExtensionContent, parseInstallInput, arrangeHits, restartOutcome, osAllowed } = await import('../console/advanced/features/extensions/index.ts');
const { mountWorlds } = await import('../console/advanced/features/worlds/index.ts');
const { worldLibrary } = await import('../console/advanced/features/worlds/library.ts');
const { mountProviders } = await import('../console/advanced/features/providers/index.ts');
const { S: extensionStrings } = await import('../console/advanced/features/extensions/strings.ts');
const { S: providerStrings } = await import('../console/advanced/features/providers/strings.ts');
const flush = async (n = 30) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const LIST = {
  dir: 'C:/repo/extensions',
  extensions: [
    { name: 'alpha-mod', spec: '^1.0.0', version: '1.0.0', kind: 'world', api: 3, webUiClient: true, webUi: 'served', loaded: true, worldId: 'alpha', label: '甲扩展', state: 'loaded' },
    { name: 'beta-mod', spec: '^1.0.0', version: '1.0.0', kind: 'world', api: 3, webUiClient: true, webUi: 'missing', loaded: false, reason: '默认导出不是 WorldDefinition', state: 'failed' },
    { name: 'gamma-prov', spec: '^2.0.0', version: '2.0.0', kind: 'provider', api: 3, webUiClient: false, webUi: 'none', loaded: false, state: 'pending-restart', description: '丙' },
    { name: 'delta-mod', spec: '^1.0.0', version: '1.0.0', kind: 'world', api: 3, webUiClient: false, webUi: 'none', loaded: true, worldId: 'delta', state: 'removed' },
    { name: 'epsilon-mod', spec: '^1.0.0', version: '1.0.0', webUiClient: false, loaded: false, reason: 'package.json 缺少 cortico 块(至少要 kind 与 api)。', state: 'failed' },
  ],
};
const HITS = {
  hits: [
    { name: 'found-mod', version: '3.1.0', description: '搜到的', downloads: { total: 130, month: 42, week: 9 }, dependents: 2, publisher: 'someone', license: 'MIT', date: '2026-09-18T00:00:00.000Z', keywords: ['cortico-world', 'chat'], links: { npm: 'https://npm.example/found', repository: 'https://git.example/found' }, installed: false, kind: 'world' },
    { name: 'alpha-mod', version: '1.0.0', description: '已经装了', downloads: { month: 7 }, dependents: 0, date: '2026-01-02T00:00:00.000Z', links: {}, installed: true, kind: 'world' },
    ...Array.from({ length: 11 }, (_, i) => ({
      name: `filler-${i}`, version: '0.1.0', description: '凑数的', downloads: { month: 100 + i }, dependents: 0,
      date: `2026-02-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`, links: {}, installed: false, kind: 'world',
    })),
  ],
};
const DETAIL = {
  name: 'found-mod',
  version: '3.1.0',
  description: '搜到的',
  license: 'MIT',
  keywords: ['cortico-world', 'chat'],
  published: '2026-09-18T00:00:00.000Z',
  created: '2025-12-01T00:00:00.000Z',
  versionCount: 4,
  history: [{ version: '3.1.0', date: '2026-09-18T00:00:00.000Z' }, { version: '3.0.0', date: '2026-07-01T00:00:00.000Z' }],
  manifest: { kind: 'world', api: 4, webUiClient: 'dist/webui.js' },
  warnings: [],
  frameworkApi: 4,
  engines: '>=22',
  unpackedSize: 204800,
  fileCount: 12,
  dependencies: ['ws'],
  maintainers: ['someone'],
  author: 'someone',
  publisher: 'someone',
  links: { npm: 'https://npm.example/found', repository: 'https://git.example/found', bugs: 'https://git.example/found/issues' },
  installed: false,
};
const LIFE = { deployment: 'this-deployment', bootId: 'boot-1', ready: true };
let calls = [];
function stub(over = {}) {
  vi.stubGlobal('fetch', (url, init) => {
    const u = String(url);
    const method = String(init?.method ?? 'GET');
    calls.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    let status = 200;
    let body = {};
    if (u === '/api/worlds') body = { worlds: over.worlds ?? [{ id: 'alpha', label: '甲扩展', status: 'active', visible: true }, { id: 'builtin', label: 'Builtin', status: 'inactive' }] };
    else if (u === '/api/worlds/visibility') body = { driftedWorlds: over.driftedWorlds ?? [] };
    else if (u === '/api/providers') body = { scope: 'test-provider-tabs', active: over.active ?? '', providers: over.providers ?? [] };
    else if (u.startsWith('/api/providers/') && u.endsWith('/delete')) { over.onDelete?.(u); body = { ok: true }; }
    else if (u.startsWith('/api/providers/')) { const name = decodeURIComponent(u.slice('/api/providers/'.length)); body = { name, revision: 'r1', references: over.references?.[name] ?? [], entry: { kind: 'openai', baseUrl: 'https://example.invalid', spec: { model: 'm' } }, secret: null }; }
    else if (u === '/api/provider-modules') body = [];
    else if (u === '/api/extensions') { status = over.listStatus ?? 200; body = status === 200 ? over.list ?? LIST : { error: 'Unavailable' }; }
    else if (u === '/api/extensions/updates') {
      status = over.updateStatus ?? 200;
      body = status === 200 ? over.updates ?? { updates: [], errors: [] } : { error: 'npm unavailable' };
    }
    else if (u.startsWith('/api/extensions/package')) {
      status = over.detailStatus ?? 200;
      body = status === 200 ? { ...DETAIL, ...(over.detail ?? {}) } : { error: 'npm 没有这个包' };
    }
    else if (u.startsWith('/api/extensions/search'))
      body = over.hits ?? (u.includes('kind=provider') ? { hits: [] } : HITS);
    else if (u === '/api/extensions/check') {
      const payload = JSON.parse(init.body);
      status = over.checkStatus ?? 200;
      body = status === 200 ? { name: payload.target.name ?? 'local-mod', version: payload.target.version ?? '1.0.0', kind: payload.kind } : { error: '扩展实际类型为 provider，请切换到对应分类。' };
    }
    else if (u === '/api/extensions/install') {
      status = over.installStatus ?? 200;
      if (status === 200)
        over.onInstall?.(JSON.parse(init.body));
      body = status === 200 ? { ok: true, result: '已安装 x。重启进程后加载。\n+ x 1.0.0' } : { error: 'pnpm add 退出码 1' };
    }
    else if (u === '/api/extensions/uninstall') {
      over.onUninstall?.(JSON.parse(init.body));
      body = { ok: true, result: '已卸载 x。' };
    }
    else if (u === '/api/run/lifecycle')
      body = LIFE;
    else if (u === '/api/run/restart')
      body = over.restart ?? { ok: true, result: '本地关机完成,进程即将退出', steps: [{ label: '按住事件投递', ok: true, elapsedMs: 2 }] };
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  });
}
function mkCtx(caps = { extensions: true, restart: true, supervised: true }, root = document.createElement('div')) {
  document.body.appendChild(root);
  const lifecycle = new Lifecycle(() => { });
  const ui = createConsoleUi({
    memo: { get: () => null, set: () => { } },
    overlayHost: document.body,
    signal: lifecycle.signal,
    doc: document,
  });
  const router = new Router({ win: window, confirmLeave: async () => true, onError: () => { } });
  lifecycle.own(router.start());
  return {
    ctx: {
      ui, root, lifecycle, signal: lifecycle.signal,
      capabilities: caps,
      route: router.route,
      router,
      onError: () => { },
    },
    root,
    lifecycle,
  };
}
const buttons = (el) => [...el.querySelectorAll('button')];
const button = (el, text) => {
  const hit = buttons(el).find((b) => b.textContent?.trim() === text);
  if (!hit)
    throw new Error(`没有「${text}」这颗键`);
  return hit;
};
/** 答一次模态确认:danger 模式的确认键写的是「仍要继续」,普通模式是「确认」。 */
function answer(yes) {
  // 抽屉也是一层 .modal:确认框是后铺上去的那一层
  const layers = [...document.querySelectorAll('.modal')];
  const modal = layers[layers.length - 1];
  if (!modal)
    throw new Error('没有弹出确认框');
  const want = yes ? ['仍要继续', '确认'] : ['取消'];
  const btn = buttons(modal).find((b) => want.includes(b.textContent?.trim() ?? ''));
  if (!btn)
    throw new Error('确认框上找不到按钮');
  btn.click();
}
const cardOf = (root, title) => {
  const hit = [...root.querySelectorAll('.extension-card')].find((c) => c.querySelector('.extension-card-title')?.textContent?.startsWith(title));
  if (!hit)
    throw new Error(`没有「${title}」的卡`);
  return hit;
};
const lives = [];
function mount(caps = { extensions: true, restart: true, supervised: true }) { window.history.replaceState(null, '', '#/world?view=market'); const context = mkCtx({ worlds: true, ...caps }); lives.push(context.lifecycle); mountWorlds(context.ctx); return context; }
const WIDTH = 1100;
beforeEach(() => { calls = []; window.sessionStorage.clear(); window.history.replaceState(null, '', '#/extensions/world'); Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => WIDTH }); HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { lives.splice(0).forEach(life => life.dispose()); vi.unstubAllGlobals(); document.body.replaceChildren(); });
const marketCards = (root) => root.querySelector('.world-catalog-scroll > .extension-grid');
const feedback = (_root) => document.querySelector('.extension-operation-feedback');
const installedInfo = (root, name) => [...root.querySelectorAll('.world-blade')].find(row => row.querySelector('.world-name')?.textContent === name).querySelector('.world-name-info');
const switchTo = async (ctx, kind) => {
  ctx.lifecycle.dispose();
  ctx.root.replaceChildren();
  const next = mkCtx(ctx.capabilities, ctx.root);
  Object.assign(ctx, next.ctx);
  lives.push(next.lifecycle);
  mountExtensionContent(ctx, kind);
  await flush();
};
const filterMarket = (root, value) => { const input = root.querySelector('.world-catalog input[type=search]'); input.value = value; input.dispatchEvent(new Event('input')); };
describe('package authors', () => {
  const detailAuthor = () => [...document.querySelectorAll('.extension-detail .kvtable tr')]
    .find(row => row.children[0].textContent === '作者')?.children[1].textContent;
  it.each([
    { author: 'Local author', registryAuthor: 'Registry author', expected: 'Local author' },
    { author: undefined, registryAuthor: undefined, expected: '未提供' },
  ])('keeps the installed author after searching and loading registry details ($expected)', async ({ author, registryAuthor, expected }) => {
    const publisher = 'Automated publisher';
    stub({
      list: { dir: LIST.dir, extensions: [{ ...LIST.extensions[0], author }] },
      hits: { hits: [{ ...HITS.hits[1], publisher }] },
      detail: { author: registryAuthor, publisher },
    });
    const { root } = mount();
    await flush();
    installedInfo(root, '甲扩展').click();
    await flush();
    expect(detailAuthor()).toBe(expected);
  });
  it.each([
    { author: 'Example author', expected: 'Example author' },
    { author: undefined, expected: '未提供' },
  ])('uses package author on the market card and detail, or marks it missing ($expected)', async ({ author, expected }) => {
    const publisher = 'Automated publisher';
    stub({ hits: { hits: [{ ...HITS.hits[0], publisher }] }, detail: { author, publisher } });
    const { root } = mount();
    await flush();
    const card = marketCards(root).querySelector('.extension-card');
    const byline = card.querySelector('.extension-card-byline');
    // 没填 author 时署名写 npm@账号,没有悬停
    expect(byline.textContent).toContain(author ?? `npm@${publisher}`);
    expect(byline.getAttribute('aria-description')).toBe(author ? `npm: @${publisher}` : null);
    card.click();
    await flush();
    expect(detailAuthor()).toBe(expected);
  });
});
describe('installation feedback', () => {
  it('starts another page at the top of the list, holding no height from the last', async () => {
    stub();
    const { root } = mount(); await flush();
    const size = root.querySelector('.extension-size select');
    size.value = '10'; size.dispatchEvent(new Event('change', { bubbles: true }));
    const grid = marketCards(root);
    const scroller = root.querySelector('.world-catalog-scroll');
    scroller.scrollTop = 900;
    button(root.querySelector('.extension-pager'), extensionStrings.nextPage).click();
    expect(scroller.scrollTop).toBe(0);
    expect(grid.style.minHeight).toBe('');
  });
  async function detail(root) {
    filterMarket(root, 'found');
    marketCards(root).querySelector('[aria-label="found-mod"]').click();
    await flush();
    return document.querySelector('.modal');
  }
  /** The detail page's install control, the market card's own. */
  const detailControl = (box) => box.querySelector('.extension-detail-control .extension-get');
  it('installs the exact version from the detail page with the market card\'s control', async () => {
    const list = { ...LIST, extensions: [...LIST.extensions] };
    stub({ list, onInstall: target => list.extensions.push({ name: target.name, version: target.version, kind: 'world', state: 'pending-restart' }) });
    const { root } = mount();
    await flush();
    const box = await detail(root);
    expect(detailControl(box).getAttribute('aria-label')).toBe(extensionStrings.addToLibrary);
    detailControl(box).click();
    await flush();
    expect(calls.find(c => c.url === '/api/extensions/check')?.body).toEqual({ target: { name: 'found-mod', version: '3.1.0' }, kind: 'world' });
    expect(calls.find(c => c.url === '/api/extensions/install')?.body).toEqual({ name: 'found-mod', version: '3.1.0' });
    expect(calls.filter(c => c.url === '/api/extensions').length).toBe(2);
    // Like the card: no status line, the control itself reads installed afterwards.
    expect(root.querySelector('.world-workspace-status').textContent).not.toContain('安装成功');
    await vi.waitFor(() => expect(detailControl(box).getAttribute('aria-label')).toBe('已安装'));
  });
  it('a refused check stops before installing and shows the reason only in the originating section', async () => {
    stub({ checkStatus: 400 });
    const { root } = mount();
    await flush();
    detailControl(await detail(root)).click();
    await flush();
    expect(calls.some(c => c.url === '/api/extensions/install')).toBe(false);
    expect(document.querySelector('.extension-problem:not(.hidden)')?.textContent).toContain('请切换到对应分类');
    expect(root.querySelector('.world-workspace-status .msgline.bad')).toBeNull();
  });
  it('shows the install progress ring in the detail page while the install runs', async () => {
    stub(); let finish;
    const fetch = globalThis.fetch;
    vi.stubGlobal('fetch', (url, init) => String(url) === '/api/extensions/check' ? new Promise(resolve => { finish = () => resolve(fetch(url, init)); }) : fetch(url, init));
    const { root } = mount(); await flush();
    const box = await detail(root);
    detailControl(box).click(); await flush();
    expect(detailControl(box).classList.contains('is-working')).toBe(true);
    expect(detailControl(box).querySelector('.extension-get-ring')).not.toBeNull();
    finish();
    await vi.waitFor(() => expect(detailControl(box).classList.contains('is-working')).toBe(false));
  });
  it('an install failure from the detail page opens beside its control', async () => {
    stub({ installStatus: 400 });
    const { root } = mount();
    await flush();
    detailControl(await detail(root)).click();
    await flush();
    expect(document.querySelector('.extension-problem:not(.hidden)')?.textContent).toContain('pnpm add 退出码 1');
  });
  it('offers an available update in the detail page and beside the name in My World', async () => {
    const update = (name, from, to) => ({ name, installedVersion: from, latestVersion: to, problems: [] });
    const list = { ...LIST, extensions: [...LIST.extensions, { name: 'found-mod', spec: '^3.0.0', version: '3.0.0', installedVersion: '3.0.0', kind: 'world', api: 3, state: 'loaded' }] };
    stub({ list, updates: { updates: [update('found-mod', '3.0.0', '3.1.0'), update('alpha-mod', '1.0.0', '1.2.0')], errors: [] } });
    const { root, ctx } = mount();
    await flush();
    const box = await detail(root);
    expect(detailControl(box).classList.contains('is-update')).toBe(true);
    expect(detailControl(box).getAttribute('aria-label')).toContain('3.0.0 → 3.1.0');
    box.querySelector('.modalhead .btn')?.click();
    ctx.router.navigate(['world']); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    const row = [...root.querySelectorAll('.world-blade')].find(item => item.dataset.key === 'alpha-mod');
    const badge = row.querySelector('.world-name-info + .world-name-update');
    expect(badge.getAttribute('aria-label')).toContain('1.0.0 → 1.2.0');
    badge.click(); await flush();
    expect(document.querySelector('.modal .modaltitle')?.textContent).toBeTruthy();
  });
  it('blocks incompatible detail installation and dangerous links', async () => {
    stub({ detail: { problems: ['incompatible'], links: { npm: 'javascript:alert(1)' } } });
    const { root } = mount();
    await flush();
    const box = await detail(root);
    expect(detailControl(box).disabled).toBe(true);
    expect(box.querySelector('a')).toBeNull();
  });
  it('a market detail that fails to load shows the error in the drawer and leaves the list intact', async () => {
    stub({ detailStatus: 502 });
    const { root } = mount();
    await flush();
    await detail(root);
    expect(document.querySelector('.modal .msgline.bad')?.textContent).toContain('npm 没有这个包');
    expect(marketCards(root).querySelectorAll('.extension-card').length).toBeGreaterThan(0);
  });
  it('failed package documents are not requested again while filtering', async () => {
    stub({ detailStatus: 502 });
    const { root } = mount();
    await flush();
    const first = calls.filter(c => c.url.startsWith('/api/extensions/package')).length;
    filterMarket(root, 'alpha');
    filterMarket(root, 'filler');
    filterMarket(root, '');
    await flush();
    expect(calls.filter(c => c.url.startsWith('/api/extensions/package')).length).toBe(first);
  });
  it('ignores an old manual check after the source or input changes', async () => {
    stub(); const fetch = globalThis.fetch; let finish;
    vi.stubGlobal('fetch', (url, init) => String(url) === '/api/extensions/check' ? new Promise(resolve => { finish = resolve; }) : fetch(url, init));
    const { root } = mount(); await flush();
    const input = root.querySelector('.world-manual input'); input.value = 'example-world'; input.dispatchEvent(new Event('input'));
    button(root, '检查有效性').click(); await flush();
    button(root, '从本机目录安装').click();
    finish(new Response(JSON.stringify({ name: 'example-world', version: '1.0.0', kind: 'world' }), { status: 200 })); await flush();
    expect(root.querySelector('.extension-manual-actions .msgline').textContent).toBe('');
    expect(button(root, '检查有效性').disabled).toBe(false);
    expect(input.getAttribute('aria-label')).toBe('扩展项目目录');
  });
  it('keeps keyboard focus on the catalog card throughout installation', async () => {
    const list = { ...LIST, extensions: [...LIST.extensions] }; let finish;
    stub({ list, hits: { hits: [HITS.hits[0]] }, onInstall: target => list.extensions.push({ name: target.name, version: target.version, kind: 'world', state: 'pending-restart' }) });
    const fetch = globalThis.fetch;
    vi.stubGlobal('fetch', (url, init) => String(url) === '/api/extensions/check' ? new Promise(resolve => { finish = () => resolve(fetch(url, init)); }) : fetch(url, init));
    const { root } = mount(); await flush();
    const control = root.querySelector('.extension-get'); control.focus(); control.click(); await flush();
    expect(document.activeElement.classList.contains('extension-market-card')).toBe(true);
    // The install settles through a chain of requests whose length in microtask turns differs between
    // Node versions, so wait for the outcome instead of counting turns.
    finish();
    await vi.waitFor(() => expect(root.querySelector('.extension-get').getAttribute('aria-label')).toBe('已安装'));
    expect(document.activeElement.dataset.name).toBe('found-mod');
  });
  it('an empty category says there are no packages yet', async () => {
    stub({ hits: { hits: [] } });
    const { root } = mount();
    await flush();
    expect(marketCards(root).textContent).toContain('npm 上还没有这一类的包');
  });
  it('manual npm input rejects paths and URLs; local source checks and installs the directory', async () => {
    stub();
    const { root } = mount();
    await flush();
    const input = root.querySelector('input[aria-label="包名与版本"]');
    input.value = 'https://example.com';
    input.dispatchEvent(new Event('input'));
    button(root, '安装').click();
    await flush();
    expect(calls.some(c => c.url === '/api/extensions/check' || c.url === '/api/extensions/install')).toBe(false);
    button(root, '从本机目录安装').click();
    await flush();
    const path = root.querySelector('input[aria-label="扩展项目目录"]');
    expect(root.textContent).toContain('运行 Cortico 的电脑');
    path.value = 'C:/work/my-world';
    path.dispatchEvent(new Event('input'));
    button(root, '安装').click();
    await flush();
    expect(calls.find(c => c.url === '/api/extensions/check')?.body).toEqual({ target: { path: 'C:/work/my-world' }, kind: 'world' });
    expect(calls.find(c => c.url === '/api/extensions/install')?.body).toEqual({ path: 'C:/work/my-world' });
  });

});
describe('package avatars', () => {
  it('a declared icon is shown; without one, or when it fails to load, the Cortico mark is shown', async () => {
    stub({ hits: { hits: [{ ...HITS.hits[0], name: 'pictured-world', displayName: 'Pictured', icon: '/api/extensions/icon?name=pictured-world&v=1.2.0' }, { ...HITS.hits[0], name: 'cortico-world-plain' }] } });
    const { root } = mount();
    await flush();
    const pictured = cardOf(root, 'Pictured');
    const image = pictured.querySelector('.extension-avatar img');
    expect(image.getAttribute('src')).toBe('/api/extensions/icon?name=pictured-world&v=1.2.0');
    expect(pictured.querySelector('.extension-avatar-default').hidden).toBe(true);
    image.dispatchEvent(new Event('error'));
    expect(pictured.querySelector('.extension-avatar img')).toBeNull();
    expect(pictured.querySelector('.extension-avatar-default').hidden).toBe(false);
    const plain = cardOf(root, 'cortico-world-plain');
    expect(plain.querySelector('.extension-avatar img')).toBeNull();
    expect(plain.querySelector('.brandmark')).not.toBeNull();
    expect(plain.querySelector('.extension-avatar-default')?.textContent).toBe('');
  });
  it('market cards of packages not installed show the default avatar', async () => {
    stub();
    const { root } = mount();
    await flush();
    filterMarket(root, 'found');
    const card = marketCards(root).querySelector('.extension-card');
    expect(card.querySelector('.brandmark')).not.toBeNull();
    expect(card.querySelector('.extension-avatar-default')?.textContent).toBe('');
  });
});
describe('npm input', () => {
  it('accepts names, scoped names and exact versions or tags only', () => {
    expect(parseInstallInput('@scope/example@1.2.3')).toEqual({ name: '@scope/example', version: '1.2.3' });
    expect(parseInstallInput('@scope/example@next')).toEqual({ name: '@scope/example', version: 'next' });
    for (const value of ['', './path', 'C:\\path', 'https://example.com', 'name; cmd', 'name@^1.0'])
      expect(parseInstallInput(value)).toBeNull();
  });
});
describe('npm os field', () => {
  it('follows npm: a negation excludes, a positive list restricts, nothing means everywhere', () => {
    expect(osAllowed(undefined, 'darwin')).toBe(true);
    expect(osAllowed(['win32'], 'win32')).toBe(true);
    expect(osAllowed(['win32'], 'darwin')).toBe(false);
    expect(osAllowed(['!win32'], 'linux')).toBe(true);
    expect(osAllowed(['!win32'], 'win32')).toBe(false);
    expect(osAllowed(['linux', '!linux'], 'linux')).toBe(false);
  });
});
describe('arrangeHits', () => {
  const hit = (over) => ({ name: 'x', version: '1.0.0', description: '', downloads: { month: 0 }, dependents: 0, links: {}, installed: false, ...over });
  const opts = (over) => ({ filter: '', hideInstalled: false, sort: 'downloads', page: 0, pageSize: 2, ...over });
  it('月下载量未知的排在 0 之后,设了最低下载量时不列出', () => {
    const hits = [
      hit({ name: 'a-unknown', downloads: {} }),
      hit({ name: 'z-zero', downloads: { month: 0 } }),
      hit({ name: 'b-unknown', downloads: {} }),
      hit({ name: 'positive', downloads: { month: 5 } }),
    ];
    const sorted = arrangeHits(hits, opts({ pageSize: 10 })).shown.map(h => h.name);
    expect(sorted).toEqual(['positive', 'z-zero', 'a-unknown', 'b-unknown']);
    expect(arrangeHits(hits, opts({ minDownloads: 1 })).shown.map(h => h.name)).toEqual(['positive']);
  });
  it('筛选看名字、描述与关键字;隐藏已安装是另一道', () => {
    const hits = [
      hit({ name: 'alpha', description: '甲' }),
      hit({ name: 'beta', description: '乙', keywords: ['chat'] }),
      hit({ name: 'gamma', description: '丙', installed: true }),
    ];
    expect(arrangeHits(hits, opts({ filter: 'chat' })).shown.map((h) => h.name)).toEqual(['beta']);
    expect(arrangeHits(hits, opts({ filter: '丙' })).shown.map((h) => h.name)).toEqual(['gamma']);
    expect(arrangeHits(hits, opts({ filter: 'ALPHA' })).shown.map((h) => h.name)).toEqual(['alpha']);
    expect(arrangeHits(hits, opts({ hideInstalled: true })).matched).toBe(2);
  });
  it('三种排序各自的口径;并列时按名字', () => {
    const hits = [
      hit({ name: 'b', downloads: { month: 5 }, dependents: 1, date: '2026-01-01T00:00:00.000Z' }),
      hit({ name: 'a', downloads: { month: 5 }, dependents: 9, date: '2026-05-05T00:00:00.000Z' }),
      hit({ name: 'c', downloads: { month: 90 }, dependents: 0 }),
    ];
    const names = (sort) => arrangeHits(hits, opts({ sort, pageSize: 10 })).shown.map((h) => h.name);
    expect(names('downloads')).toEqual(['c', 'a', 'b']);
    expect(names('name')).toEqual(['a', 'b', 'c']);
    // 没有发布时间的排在最后
    expect(names('date')).toEqual(['a', 'b', 'c']);
  });
  it('页码超出范围收回最后一页;一条都没有时仍是一页', () => {
    const hits = [hit({ name: 'a' }), hit({ name: 'b' }), hit({ name: 'c' })];
    expect(arrangeHits(hits, opts({ page: 9 }))).toMatchObject({ page: 1, pages: 2 });
    expect(arrangeHits(hits, opts({ page: -3 })).page).toBe(0);
    expect(arrangeHits([], opts({}))).toMatchObject({ matched: 0, pages: 1, page: 0, shown: [] });
  });
});
describe('market search', () => {
  const SEARCH_HITS = {
    hits: [
      { name: 'other-mod', version: '1.0.0', description: 'Works with qq too', downloads: { month: 900 }, dependents: 0, links: {}, installed: false, kind: 'world' },
      { name: 'cortico-world-qq', displayName: 'QQ 群聊', version: '1.0.0', description: 'OneBot 适配器', downloads: { month: 5 }, dependents: 0, links: {}, installed: false, kind: 'world', tags: ['voice'] },
    ],
    index: { tags: { voice: { label: '语音' } } },
  };
  const names = (root) => [...marketCards(root).querySelectorAll('.extension-market-card')].map(card => card.dataset.name);
  it('matches every word anywhere, tag names included, and ranks name hits first', async () => {
    stub({ hits: SEARCH_HITS });
    const { root } = mount(); await flush();
    filterMarket(root, '语音 QQ');
    expect(names(root)).toEqual(['cortico-world-qq']);
    expect(marketCards(root).querySelector('.extension-card-title mark').textContent).toBe('QQ');
    filterMarket(root, 'qq');
    expect(names(root)).toEqual(['cortico-world-qq', 'other-mod']);
    filterMarket(root, 'cortico world');
    expect(names(root)).toEqual(['cortico-world-qq']);
  });
  it('offers to clear the other filters when only they hide the query\'s matches', async () => {
    stub({ hits: SEARCH_HITS });
    const { root } = mount(); await flush();
    button(root.querySelector('.world-catalog-filters'), extensionStrings.alreadyInstalled).click();
    filterMarket(root, 'qq');
    expect(names(root)).toEqual([]);
    const empty = marketCards(root).querySelector('.extension-hits-elsewhere');
    expect(empty.textContent).toContain(extensionStrings.hitsElsewhere(2));
    button(empty, extensionStrings.clearOtherFilters).click();
    expect(names(root)).toEqual(['cortico-world-qq', 'other-mod']);
    expect(root.querySelector('.world-catalog input[type=search]').value).toBe('qq');
  });
  it('finds a package by the name its installed World shows', async () => {
    stub();
    const { root } = mount(); await flush();
    filterMarket(root, '甲扩展');
    expect(names(root)).toEqual(['alpha-mod']);
  });
  it('waits for the input method to finish a word before filtering', async () => {
    stub({ hits: SEARCH_HITS });
    const { root } = mount(); await flush();
    const input = root.querySelector('.world-catalog input[type=search]');
    input.value = 'yuyin'; input.dispatchEvent(new InputEvent('input', { isComposing: true }));
    expect(names(root)).toHaveLength(2);
    input.value = '语音'; input.dispatchEvent(new CompositionEvent('compositionend'));
    expect(names(root)).toEqual(['cortico-world-qq']);
  });
});
describe('restart', () => {
  it('waits for a new ready process of the same deployment', () => {
    const before = { deployment: 'same', bootId: 'old', ready: true };
    expect(restartOutcome(before, before)).toBe('waiting');
    expect(restartOutcome(before, { ...before, bootId: 'new', ready: false })).toBe('waiting');
    expect(restartOutcome(before, { ...before, bootId: 'new' })).toBe('ready');
    expect(restartOutcome(before, { ...before, deployment: 'other', bootId: 'new' })).toBe('wrong-deployment');
  });
  it('confirms, reads the process identity, requests the restart and shows incomplete shutdown steps', async () => {
    stub({ restart: { ok: true, result: '本地关机完成', steps: [{ label: '按住事件投递', ok: true, elapsedMs: 2 }, { label: '外部直播平台', ok: false, elapsedMs: 5000, detail: '需手动结束' }] } });
    const { root } = mount();
    await flush();
    button(root.querySelector('.world-restart-footer'), '重启进程').click();
    await flush();
    expect(calls.some(c => c.url === '/api/run/restart')).toBe(false);
    answer(true);
    await flush();
    expect(calls.find(c => c.url === '/api/run/restart')?.method).toBe('POST');
    expect(calls.some(c => c.url === '/api/run/lifecycle')).toBe(true);
    expect(document.body.textContent).toContain('✗ 外部直播平台 · 需手动结束');
    expect(root.querySelector('.extension-restart').disabled).toBe(true);
  });
  it('allows retrying a rejected restart and removes its recovery marker', async () => {
    stub({ restart: { error: 'shutdown rejected' } });
    const { root } = mount(); await flush();
    button(root.querySelector('.world-restart-footer'), '重启进程').click(); await flush(); answer(true); await flush();
    expect(root.querySelector('.extension-restart').disabled).toBe(false);
    expect(root.querySelector('.world-workspace-status').textContent).toContain('shutdown rejected');
    expect(sessionStorage.getItem('cortico.extensions.v3:' + location.origin + ':restart')).toBeNull();
    button(root.querySelector('.world-restart-footer'), '重启进程').click(); await flush();
    expect(document.querySelector('.modal')).not.toBeNull(); answer(false); await flush();
  });
  it('an unsupervised process asks for a manual start', async () => {
    stub();
    const { root } = mount({ extensions: true, restart: true, supervised: false });
    await flush();
    button(root.querySelector('.world-restart-footer'), '重启进程').click();
    await flush();
    expect(document.querySelector('.modal')?.textContent).toContain('需要手动启动');
    answer(false);
    await flush();
    expect(calls.some(c => c.url === '/api/run/restart')).toBe(false);
  });
  it('without the restart capability there is no restart button and pending cards offer details', async () => {
    stub();
    const { ctx, root } = mount({ extensions: true });
    await flush();
    await switchTo(ctx, 'provider');
    expect(buttons(root).map(b => b.textContent)).not.toContain('重启进程');
    cardOf(root, 'gamma-prov').click();
    await flush();
    expect(document.querySelector('.extension-detail')).toBeTruthy();
  });

});
describe('extension review interactions', () => {

  it('opens market details from the card and restores metadata and release rows', async () => {
    stub();
    const { root } = mount();
    await flush();
    filterMarket(root, 'found');
    const card = marketCards(root).querySelector('article');
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    const detail = document.querySelector('.extension-detail');
    expect(detail.textContent).toContain('维护者');
    expect(detail.textContent).toContain('200.0K');
    expect(detail.querySelectorAll('.extension-history > div')).toHaveLength(2);
    expect(detail.querySelector('details')?.open).toBe(false);
    expect(detail.querySelector('summary')?.textContent).toBe('历史版本');
    expect([...detail.querySelectorAll('a')].map(link => link.textContent)).toContain('源代码仓库');
    const byline = card.querySelector('.extension-card-byline')?.textContent;
    expect(byline).toContain('someone');
    expect(byline).toContain('3.1.0');
    const downloads = card.querySelector('.extension-stat-downloads');
    expect(downloads.textContent).toBe('42');
    expect(downloads.getAttribute('aria-description')).toBe('累计 130 · 30 天 42 · 7 天 9');
  });
  it('keeps installed metadata available when registry details fail', async () => {
    stub({ detailStatus: 503, list: { dir: LIST.dir, extensions: [{ ...LIST.extensions[0], metadata: { license: 'MIT', dependencies: ['example-dependency'], links: { repository: 'https://git.example/module' } } }] } });
    const { root } = mount();
    await flush();
    installedInfo(root, '甲扩展').click();
    await flush();
    const detail = document.querySelector('.extension-detail');
    expect([...detail.querySelectorAll('h4')].map(node => node.textContent)).toEqual(['简介', '信息']);
    expect(detail.textContent).toContain('MIT');
    expect(detail.textContent).toContain('example-dependency');
    expect(detail.querySelector('a')?.href).toBe('https://git.example/module');
  });
});

describe('feature contract', () => {

  it('sends no requests after dispose', async () => {
    stub();
    const { root, lifecycle } = mount();
    await flush();
    lifecycle.dispose();
    const before = calls.length;
    root.querySelector('[aria-label=刷新]').click();
    await flush();
    expect(calls.length).toBe(before);
  });
});
describe('extension card and history controls', () => {

  async function installedHistory(options = {}) {
    stub({ ...options, detail: { ...DETAIL, name: 'alpha-mod', version: '2.0.0', history: [
          { version: '2.0.0', date: '2026-03-01' },
          { version: '1.0.0', date: '2026-02-01' },
          { version: '0.9.0', date: '2026-01-01' },
        ], ...options?.detail } });
    const { root } = mount();
    await flush();
    installedInfo(root, '甲扩展').click();
    await flush();
    return document.querySelector('.extension-detail');
  }
  const historyRow = (detail, version) => [...detail.querySelectorAll('.extension-history > div')].find(row => row.querySelector('code')?.textContent === version);
  it('puts package problems below Information and disables the installed release', async () => {
    const detail = await installedHistory({ detail: { problems: ['invalid manifest'] } });
    const headings = detail.querySelectorAll('h4');
    const problem = [...detail.querySelectorAll('.msgline.bad')].find(node => node.textContent === 'invalid manifest');
    expect(headings[1].compareDocumentPosition(problem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button(historyRow(detail, '1.0.0'), '当前版本').disabled).toBe(true);
    expect(button(historyRow(detail, '0.9.0'), '安装此版本').disabled).toBe(false);
  });
  it('installing a release goes through check and install, then refreshes the drawer', async () => {
    const current = { ...LIST, extensions: LIST.extensions.map((item) => ({ ...item })) };
    const detail = await installedHistory({ list: current, onInstall: payload => {
        const item = current.extensions.find((entry) => entry.name === payload.name);
        item.installedVersion = payload.version;
        item.state = 'pending-restart';
      } });
    detail.querySelector('details').open = true;
    button(historyRow(detail, '0.9.0'), '安装此版本').click();
    await flush();
    expect(document.body.textContent).toContain('1.0.0 → 0.9.0');
    answer(true);
    await vi.waitFor(() => expect(detail.querySelector('.extension-operation-feedback')?.textContent).toContain('成功'));
    expect(calls.find(call => call.url === '/api/extensions/check')?.body).toEqual({ target: { name: 'alpha-mod', version: '0.9.0' }, kind: 'world' });
    expect(calls.find(call => call.url === '/api/extensions/install')?.body).toEqual({ name: 'alpha-mod', version: '0.9.0' });
    expect(calls.slice(calls.findIndex(call => call.url === '/api/extensions/install')).some(call => call.url === '/api/extensions/updates')).toBe(true);
    expect(detail.querySelector('details')?.open).toBe(true);
    expect(button(historyRow(detail, '0.9.0'), '当前版本').disabled).toBe(true);
    const installedRow = [...detail.querySelectorAll('tr')].find(row => row.textContent?.includes('已安装版本'));
    expect(installedRow.textContent).toContain('0.9.0');
    expect(document.querySelector('.world-pending-group').textContent).toContain('待生效');
  });
  it('a failed release install keeps the error in the drawer and re-enables the row', async () => {
    const detail = await installedHistory({ installStatus: 400 });
    button(historyRow(detail, '0.9.0'), '安装此版本').click();
    await flush();
    answer(true);
    await vi.waitFor(() => expect(detail.querySelector('.extension-operation-feedback.bad')?.textContent).toContain('pnpm add 退出码 1'));
    expect(button(historyRow(detail, '0.9.0'), '安装此版本').disabled).toBe(false);
  });
  it('a package installed from a local link offers no npm release install', async () => {
    stub({ list: { ...LIST, extensions: [{ ...LIST.extensions[0], spec: 'link:../local' }] }, detail: { ...DETAIL, name: 'alpha-mod' } });
    const { root } = mount();
    await flush();
    cardOf(marketCards(root), '甲扩展').click();
    await flush();
    const actions = [...document.querySelectorAll('.extension-version-action')];
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every(action => action.disabled)).toBe(true);
  });
});

describe('provider connection cards', () => {
  const connection = (name) => ({ name, moduleTitle: 'OpenAI', module: 'openai', model: 'm', revision: 'r1', readiness: { state: 'ready' }, usage: [] });
  async function openConnections(over) {
    stub({ providers: ['a', 'b', 'c'].map(connection), ...over });
    window.history.replaceState(null, '', '#/providers');
    const page = mkCtx({ extensions: true });
    lives.push(page.lifecycle);
    mountProviders(page.ctx);
    await flush(60);
    return page;
  }
  const order = (root) => [...root.querySelectorAll('.connection-cards > .connection-card')].map(card => card.dataset.provider);
  it('asks before deleting a connection, and refuses one a Bot uses', async () => {
    const deleted = [];
    const { root } = await openConnections({ references: { b: ['Coo'] }, onDelete: url => deleted.push(url) });
    const trash = (name) => root.querySelector(`.connection-card[data-provider="${name}"] .connection-erase`);
    trash('b').click(); await flush();
    expect(document.querySelector('.modal').textContent).toContain('Coo');
    answer(true); await flush();
    expect(deleted).toEqual([]);
    trash('a').click(); await flush();
    answer(false); await flush();
    expect(deleted).toEqual([]);
    trash('a').click(); await flush();
    answer(true); await flush(60);
    expect(deleted).toEqual(['/api/providers/a/delete']);
  });
  it('reorders the cards by dragging and keeps the order for the next visit', async () => {
    window.localStorage.clear();
    const { root } = await openConnections();
    expect(order(root)).toEqual(['a', 'b', 'c']);
    const pointer = (type, target, y) => { const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: y }); Object.defineProperty(event, 'pointerId', { value: 3 }); target.dispatchEvent(event); };
    const first = root.querySelector('.connection-card[data-provider="a"] .connection-name');
    pointer('pointerdown', first, 5); pointer('pointermove', window, 300);
    expect(root.querySelector('.connection-drag-copy')).not.toBeNull();
    pointer('pointerup', window, 300); await flush();
    // jsdom lays nothing out, so the drop lands after the last card.
    expect(order(root)).toEqual(['b', 'c', 'a']);
    expect(root.querySelector('.connection-drag-copy')).toBeNull();
    lives.splice(0).forEach(life => life.dispose()); document.body.replaceChildren();
    const again = await openConnections();
    expect(order(again.root)).toEqual(['b', 'c', 'a']);
  });
});

describe('provider page tabs', () => {
  async function openProviders(caps = { extensions: true }) {
    window.history.replaceState(null, '', '#/providers');
    const page = mkCtx(caps);
    lives.push(page.lifecycle);
    mountProviders(page.ctx);
    await flush();
    return page;
  }
  async function navigate(ctx, view) {
    ctx.router.navigate(['providers'], view ? { view } : undefined);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush();
  }
  it('keeps settings and market filters when switching tabs and returning through history', async () => {
    stub();
    const { ctx, root } = await openProviders();
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('.provider-market').hidden).toBe(true);
    expect(calls.some(call => call.url.startsWith('/api/extensions'))).toBe(false);
    await navigate(ctx, 'market');
    const market = root.querySelector('.provider-market');
    expect(root.querySelector('.provider-settings').hidden).toBe(true);
    expect(market.querySelector('.world-catalog')).not.toBeNull();
    expect(market.querySelector('.world-library')).toBeNull();
    expect(market.querySelector('.extension-installed-grid')).toBeNull();
    expect(market.textContent).toContain('gamma-prov');
    expect(calls.some(call => call.url.includes('/api/extensions/search?') && call.url.includes('kind=provider'))).toBe(true);
    const search = market.querySelector('input[type=search]');
    search.value = 'keep this query'; search.dispatchEvent(new Event('input'));
    await navigate(ctx);
    await navigate(ctx, 'market');
    expect(market.querySelector('input[type=search]').value).toBe('keep this query');
    expect(root.querySelectorAll('.extension-category')).toHaveLength(1);
    expect(root.querySelector('.pagetab.active').textContent).toBe(providerStrings.marketTab);
  });
  it('keeps local providers manageable and exposes pending restart without a World dock', async () => {
    const list = { ...LIST, extensions: [{ ...LIST.extensions[2], spec: 'file:C:/fixtures/gamma' }] };
    stub({ list, hits: { hits: [] }, onUninstall: () => { list.extensions[0].state = 'removed'; } });
    const { ctx, root } = await openProviders({ extensions: true, restart: true, supervised: true });
    await navigate(ctx, 'market');
    const market = root.querySelector('.provider-market');
    expect(market.querySelector('.extension-restart').hidden).toBe(false);
    const card = market.querySelector('.extension-market-card');
    expect(card.textContent).toContain('gamma-prov');
    card.querySelector('.extension-get').click(); await flush();
    expect(document.querySelector('.extension-detail').textContent).toContain('2.0.0');
    const drawer = document.querySelector('.extension-detail');
    button(drawer, '删除扩展').click(); await flush(); answer(false); await flush();
    expect(market.querySelector('.extension-market-card')).not.toBeNull();
    button(drawer, '删除扩展').click(); await flush(); answer(true); await flush();
    expect(market.querySelector('.extension-market-card')).toBeNull();
    expect(document.querySelector('.extension-detail')).toBeNull();
    expect(market.querySelector('.extension-restart').hidden).toBe(false);
  });
  it('installs a provider from a catalog card and shows it under the installed filter', async () => {
    const hit = { ...HITS.hits[0], kind: 'provider', name: 'found-provider' };
    const list = { ...LIST, extensions: [] };
    stub({ list, hits: { hits: [hit] }, onInstall: target => list.extensions.push({ name: target.name, version: target.version, kind: 'provider', state: 'pending-restart' }) });
    const { ctx, root } = await openProviders({ extensions: true, restart: true });
    await navigate(ctx, 'market');
    const market = root.querySelector('.provider-market');
    market.querySelector('.extension-get').click(); await flush();
    expect(calls.find(call => call.url === '/api/extensions/check').body.kind).toBe('provider');
    button(market.querySelector('.world-catalog-installation'), '已安装').click(); await flush();
    expect(market.querySelectorAll('.extension-market-card')).toHaveLength(1);
    expect(market.querySelector('.extension-get').getAttribute('aria-label')).toBe('已安装');
    expect(market.querySelector('.extension-restart').hidden).toBe(false);
  });
  it('restores the catalog scroll when search finishes while Settings is visible', async () => {
    stub(); const fetch = globalThis.fetch; let finish;
    vi.stubGlobal('fetch', (url, init) => String(url).startsWith('/api/extensions/search') ? new Promise(resolve => { finish = resolve; }) : fetch(url, init));
    sessionStorage.setItem('cortico.extensions.v3:' + location.origin, JSON.stringify({ provider: { scroll: 240 } }));
    const { ctx, root } = await openProviders(); await navigate(ctx, 'market'); await navigate(ctx);
    finish(new Response(JSON.stringify({ hits: [] }), { status: 200 })); await flush();
    const scroller = root.querySelector('.world-catalog-scroll');
    expect(scroller.scrollTop).toBe(0);
    await navigate(ctx, 'market'); expect(scroller.scrollTop).toBe(240);
  });
  it('hides the market without the extensions capability, including a direct URL', async () => {
    stub();
    const { ctx, root } = await openProviders({});
    await navigate(ctx, 'market');
    expect(root.querySelectorAll('.pagetab')).toHaveLength(1);
    expect(root.querySelector('.provider-settings').hidden).toBe(false);
    expect(calls.some(call => call.url.startsWith('/api/extensions'))).toBe(false);
  });
});

describe('World library and catalog', () => {
  async function openWorlds(over = {}, caps = { worlds: true, extensions: true, worldActivation: true, restart: true, supervised: true }) {
    stub(over); window.localStorage.removeItem('coopanion.world-groups.v1');
    window.history.replaceState(null, '', '#/world?view=market');
    const context = mkCtx(caps); lives.push(context.lifecycle);
    mountWorlds(context.ctx); await flush(); return context;
  }
  it('merges runtime Worlds with packages and puts recent pending downloads first', () => {
    const worlds = [{ id: 'alpha', status: 'active' }, { id: 'builtin', status: 'inactive' }];
    const old = { name: 'older', state: 'pending-restart', kind: 'world' };
    const latest = { name: 'newest', state: 'pending-restart', kind: 'world' };
    const items = worldLibrary(worlds, [...LIST.extensions, old, latest], ['newest']);
    expect(items.map(item => item.key)).toEqual(['newest', 'delta-mod', 'older', 'alpha-mod', 'world:builtin', 'beta-mod', 'epsilon-mod']);
    expect(items.find(item => item.key === 'alpha-mod').world).toBe(worlds[0]);
    expect(items[0].world).toBeUndefined();
  });
  it('keeps the same avatars and scroll position when the library expands into management rows', async () => {
    const { root, ctx } = await openWorlds();
    const rail = root.querySelector('.world-library');
    const railItems = [...rail.querySelectorAll('.world-library-item')];
    const libraryScroll = rail.querySelector('.world-library-list'); libraryScroll.scrollTop = 25;
    expect(rail.querySelectorAll('.world-library-item .navdot, .world-library-item .navlamps')).toHaveLength(0);
    const search = root.querySelector('.world-market input[type=search]');
    search.value = 'found'; search.dispatchEvent(new Event('input', { bubbles: true }));
    const scroll = root.querySelector('.world-catalog-scroll'); scroll.scrollTop = 40;
    ctx.router.navigate(['world']); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    expect(root.querySelector('.world-market').hidden).toBe(true);
    expect(rail.hidden).toBe(false);
    expect(root.querySelector('.world-workspace').dataset.view).toBe('mine');
    ctx.router.navigate(['world'], { view: 'market' }); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    expect(root.querySelector('.world-library')).toBe(rail);
    expect(rail.hidden).toBe(false);
    expect(libraryScroll.scrollTop).toBe(25);
    expect(root.querySelectorAll('.world-blade .world-avatar')).toHaveLength(0);
    expect([...rail.querySelectorAll('.world-library-item')]).toEqual(railItems);
    expect(search.value).toBe('found'); expect(scroll.scrollTop).toBe(40);
    railItems.find(item => item.getAttribute('aria-label') === '甲扩展').click(); await flush();
    expect(root.querySelector('.world-workspace').dataset.view).toBe('market');
    expect(document.querySelector('.extension-detail')).not.toBeNull();
    ctx.router.navigate(['world']); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    railItems.find(item => item.getAttribute('aria-label') === '甲扩展').click(); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    expect(root.querySelector('.world-workspace').dataset.view).toBe('mine');
    expect(document.activeElement.dataset.key).toBe('alpha-mod');
    expect(rail.querySelector('[aria-current=true]').getAttribute('aria-label')).toBe('甲扩展');
  });
  it('keeps catalog metadata beside the title and links an installed package to its row', async () => {
    const hit = { ...HITS.hits[1], summary: { tools: 3, events: 2 } };
    const { root } = await openWorlds({ hits: { hits: [hit] } });
    const card = root.querySelector('.world-catalog .extension-market-card');
    const heading = card.querySelector('.extension-card-titleline');
    expect(heading.querySelector('.extension-card-byline').textContent).toContain('v1.0.0');
    expect(heading.textContent).not.toContain('已安装');
    expect(card.querySelector('.extension-card-spec')).toBeNull();
    const control = card.querySelector('.extension-get');
    expect(control.classList.contains('is-installed')).toBe(true);
    control.click(); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    expect(root.querySelector('.world-workspace').dataset.view).toBe('mine');
    expect(document.activeElement.dataset.key).toBe(hit.name);
  });
  it('offers an installed package\'s update from its market card', async () => {
    const hit = HITS.hits[1];
    const { root } = await openWorlds({ hits: { hits: [hit] }, updates: { updates: [{ name: hit.name, installedVersion: '0.9.0', latestVersion: '1.0.0', problems: [] }], errors: [] } });
    const control = root.querySelector('.world-catalog .extension-market-card .extension-get');
    expect(control.classList.contains('is-update')).toBe(true);
    control.click(); await flush(100);
    expect(calls.find(call => call.url === '/api/extensions/install').body).toEqual({ name: hit.name, version: '1.0.0' });
  });
  it('blocks incompatible updates in the actual market and explains the reason', async () => {
    const { root } = await openWorlds({ updates: { updates: [{ name: 'alpha-mod', installedVersion: '1.0.0', latestVersion: '2.0.0', problems: ['Unsupported API'] }], errors: [] } });
    const control = root.querySelector('.extension-market-card[data-name="alpha-mod"] .extension-get');
    expect(control.disabled).toBe(true);
    expect(control.getAttribute('aria-description')).toContain('Unsupported API');
    control.click(); await flush(); expect(calls.some(call => call.url === '/api/extensions/install')).toBe(false);
  });
  it('reports a failed install beside its control and leaves the status line empty', async () => {
    const { root } = await openWorlds({ hits: { hits: HITS.hits.slice(0, 1) }, installStatus: 500 });
    root.querySelector('.world-catalog .extension-market-card .extension-get').click(); await flush(100);
    const problem = document.querySelector('.extension-problem');
    expect(problem.classList.contains('hidden')).toBe(false);
    expect(problem.textContent).toContain('pnpm add 退出码 1');
    expect(root.querySelector('.world-workspace-status').textContent).toBe('');
    expect(root.querySelector('.world-catalog .extension-get').getAttribute('aria-label')).toBe('添加到我的 World');
    problem.querySelector('.extension-problem-close').click();
    expect(problem.classList.contains('hidden')).toBe(true);
  });
  it('uninstalls an inactive package from its World row after confirmation', async () => {
    const { root, ctx } = await openWorlds();
    ctx.router.navigate(['world']); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    const row = [...root.querySelectorAll('.world-blade')].find(item => item.dataset.key === 'beta-mod');
    row.querySelector('.iobtn-remove').click(); await flush();
    expect(calls.some(call => call.url === '/api/extensions/uninstall')).toBe(false);
    answer(true); await flush(100);
    expect(calls.find(call => call.url === '/api/extensions/uninstall').body).toEqual({ name: 'beta-mod' });
  });
  it('adds from the catalog without opening details, then exposes pending restart in management', async () => {
    const list = structuredClone(LIST);
    const { root } = await openWorlds({ list, hits: { hits: HITS.hits.slice(0, 2) }, onInstall: () => list.extensions.push({ name: 'found-mod', kind: 'world', version: '3.1.0', state: 'pending-restart', loaded: false, webUiClient: true }) });
    const card = cardOf(root, 'found-mod');
    card.querySelector('.extension-get').click(); await flush(100);
    expect(document.querySelector('.modal')).toBeNull();
    expect(root.querySelector('.world-workspace-status').textContent).toBe('');
    expect(root.querySelector('.world-library-item').getAttribute('aria-label')).toBe('found-mod');
    const group = root.querySelector('.world-pending-group');
    expect(group.querySelectorAll('.world-library-entry')).toHaveLength(2);
    expect(group.lastElementChild.className).toBe('world-restart-row');
    expect(group.lastElementChild.querySelector('.world-restart-footer .extension-restart')).not.toBeNull();
    expect(root.querySelector('.world-ready-list .world-blade').dataset.state).toBe('attached');
    button(root, '我的 World').click(); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    const pending = root.querySelector('.world-blade');
    expect(pending.dataset.state).toBe('pending');
    expect(pending.textContent).toContain('待生效');
    expect(buttons(pending).some(item => item.textContent === '激活 World')).toBe(false);
    root.querySelector('.world-blade [aria-label="扩展信息"]').click(); await flush();
    expect(document.querySelector('.extension-detail').textContent).toContain('found-mod');
  });
  it('shows live readings and changes mode only after confirmation', async () => {
    const worlds = [{ id: 'alpha', status: 'active', visible: true, tools: ['read'], lamps: [{ label: 'Link', state: 'online', hint: '2 clients' }] }];
    const { root } = await openWorlds({ worlds }, { worlds: true, worldVisibility: true, worldActivation: true });
    const row = root.querySelector('.world-blade');
    expect(row.textContent).toContain('Link · 2 clients');
    expect(row.querySelector('.world-modes')).toBeNull();
    row.querySelector('[aria-label="停用 World"]').click(); await flush();
    expect(calls.some(call => call.url === '/api/worlds/activation')).toBe(false);
    answer(false); await flush();
    expect(calls.some(call => call.url === '/api/worlds/activation')).toBe(false);
    root.querySelector('[aria-label="对 Coo 隐藏"]').click(); await flush();
    // Hiding asks first; cancelling leaves the World as it was.
    expect(document.querySelector('.modal').textContent).toContain('对 Coo 隐藏');
    expect(calls.some(call => call.url === '/api/worlds/visibility')).toBe(false);
    answer(false); await flush();
    expect(calls.some(call => call.url === '/api/worlds/visibility')).toBe(false);
    root.querySelector('[aria-label="对 Coo 隐藏"]').click(); await flush();
    answer(true); await flush();
    expect(calls.find(call => call.url === '/api/worlds/visibility').body).toEqual({ id: 'alpha', visible: false });
    expect(root.querySelector('.world-feedback').textContent).toBe('');
  });
  it('applies a confirmed visibility change to the current conversation without asking again', async () => {
    const { root } = await openWorlds({ driftedWorlds: ['alpha'] }, { worlds: true, worldVisibility: true });
    root.querySelector('[aria-label="对 Coo 隐藏"]').click(); await flush(100);
    expect(calls.some(call => call.url === '/api/session/reload-prefix')).toBe(false);
    answer(true); await flush(100);
    expect(calls.some(call => call.url === '/api/session/reload-prefix')).toBe(true);
    expect(document.querySelector('.modal')).toBeNull();
    expect(root.querySelector('.world-feedback').textContent).toBe('');
    expect(root.querySelector('.world-management-toolbar')).toBeNull();
  });
  it('keeps runtime Worlds available when the extension list fails to load', async () => {
    const { root } = await openWorlds({ listStatus: 503 });
    expect(root.querySelectorAll('.world-blade')).toHaveLength(2);
    expect(root.querySelector('.world-workspace-status').textContent).toContain('Unavailable');
  });
  it('puts packages new after a restart at the top of the list without replacing avatars', async () => {
    const list = { extensions: [{ name: 'last', worldId: 'last', kind: 'world', state: 'pending-restart' }] };
    const worlds = [{ id: 'builtin', status: 'active' }];
    const { root } = await openWorlds({ list, worlds });
    const pending = root.querySelector('.world-pending-list .world-library-item');
    list.extensions[0].state = 'loaded'; worlds.push({ id: 'last', status: 'inactive' });
    root.querySelector('.world-market [aria-label="刷新"]').click(); await flush(100);
    expect(root.querySelector('.world-pending-group').hidden).toBe(true);
    expect(root.querySelector('.world-ready-list .world-library-item')).toBe(pending);
  });
  it('does not animate entries during ordinary loading or catalog refresh', async () => {
    const original = Element.prototype.animate;
    const animated = [];
    Element.prototype.animate = function() { animated.push(this); return { cancel() {}, finished: Promise.resolve() }; };
    try {
      const { root } = await openWorlds();
      root.querySelector('.world-market [aria-label="刷新"]').click(); await flush(100);
      expect(animated.filter(el => el.classList.contains('world-library-entry'))).toHaveLength(0);
      expect(root.querySelector('.world-management-toolbar')).toBeNull();
      expect([...root.querySelectorAll('.world-library-heading')].map(el => el.textContent)).toEqual(['待生效', '扩展列表']);
    } finally { if (original) Element.prototype.animate = original; else delete Element.prototype.animate; }
  });
  it('restores positions once after reload and waits for both lists', async () => {
    const key = `coopanion.world-layout:${window.location.origin}`;
    window.sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), scroll: 12, positions: [['alpha-mod', 90]] }));
    const animations = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function(frames) { animations.push({ element: this, frames }); return { cancel() {}, finished: Promise.resolve() }; };
    try {
      const { root } = await openWorlds();
      expect(window.sessionStorage.getItem(key)).toBeNull();
      expect(root.querySelector('.world-library-list').scrollTop).toBe(12);
      expect(animations.some(a => a.element.classList.contains('world-library-entry') && a.frames[0].transform === 'translateY(90px)')).toBe(true);
    } finally { if (original) Element.prototype.animate = original; else delete Element.prototype.animate; }
  });
  it('hides the market at once when leaving it, and slides it in when entering', async () => {
    const original = Element.prototype.animate;
    const animations = [];
    Element.prototype.animate = function(frames) {
      let finish;
      const animation = { cancel() {}, playState: 'running', finished: new Promise(resolve => { finish = resolve; }) };
      if (this.classList.contains('world-market')) animations.push({ frames, animation, finish });
      return animation;
    };
    try {
      const { root, ctx } = await openWorlds();
      const market = root.querySelector('.world-market');
      // Leaving: gone at once, with nothing animating it out to show through the rows.
      ctx.router.navigate(['world']); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
      expect(market.hidden).toBe(true);
      expect(animations).toHaveLength(0);
      // Entering: shown and slid in; finishing late changes nothing.
      ctx.router.navigate(['world'], { view: 'market' }); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
      expect(market.hidden).toBe(false);
      expect(animations).toHaveLength(1);
      expect(animations[0].frames.at(-1)).toEqual({ clipPath: 'inset(0 0 0 0%)' });
      animations[0].finish(); await flush();
      expect(market.hidden).toBe(false);
      expect(market.inert).toBe(false);
    } finally { if (original) Element.prototype.animate = original; else delete Element.prototype.animate; }
  });
  it('filters the catalog by installation state and resets it with clear filters', async () => {
    const { root } = await openWorlds({ hits: { hits: HITS.hits.slice(0, 2) } });
    const segment = label => [...root.querySelectorAll('.world-catalog-installation button')].find(item => item.textContent === label);
    segment('已安装').click(); await flush();
    expect([...root.querySelectorAll('.world-catalog .extension-market-card')].map(card => card.dataset.name)).toEqual([HITS.hits[1].name]);
    segment('未安装').click(); await flush();
    expect([...root.querySelectorAll('.world-catalog .extension-market-card')].map(card => card.dataset.name)).toEqual([HITS.hits[0].name]);
    root.querySelector('.world-market [aria-label="清除筛选"]').click(); await flush();
    expect(root.querySelectorAll('.world-catalog .extension-market-card')).toHaveLength(2);
  });
  it('groups the catalog by function tags and lists the remaining tags under their group', async () => {
    const index = { tags: { game: { label: '游戏' }, im: { label: '即时通讯' }, experimental: { label: '实验性', style: 'notice' } } };
    const hits = [{ ...HITS.hits[0], tags: ['im', 'experimental'] }, { ...HITS.hits[1], tags: ['game'] }];
    const { root } = await openWorlds({ hits: { hits, index } });
    const category = id => root.querySelector(`.world-catalog-categories [data-category="${id}"]`);
    expect(category('game').querySelector('.extension-tag-count').textContent).toBe('1');
    expect(category('streaming').hidden).toBe(true);
    const sidebarTags = [...root.querySelectorAll('.world-catalog-filters .extension-tagbar .extension-tag')].map(tag => tag.textContent);
    expect(sidebarTags.some(text => text.startsWith('游戏') || text.startsWith('即时通讯'))).toBe(false);
    expect([...root.querySelectorAll('.world-catalog-filters .extension-tagbar-label')].map(label => label.textContent)).toContain('注意事项');
    category('game').click(); await flush();
    expect([...root.querySelectorAll('.world-catalog .extension-market-card')].map(card => card.dataset.name)).toEqual([HITS.hits[1].name]);
    root.querySelector('.world-market [aria-label="清除筛选"]').click(); await flush();
    expect(root.querySelectorAll('.world-catalog .extension-market-card')).toHaveLength(2);
    expect(category('all').getAttribute('aria-pressed')).toBe('true');
  });
  it.each(['world', 'provider'])('keeps %s market nodes, focus and scrolling when the install source changes', async kind => {
    const { root, ctx } = await openWorlds();
    if (kind === 'provider') await switchTo(ctx, kind);
    const fold = root.querySelector('.world-manual'); fold.open = true; fold.dispatchEvent(new Event('toggle'));
    const scroll = root.querySelector('.world-catalog-scroll'); scroll.scrollTop = 60;
    const firstCard = root.querySelector('.extension-market-card');
    const input = fold.querySelector('input');
    for (const [label, field, placeholder] of [['从本机目录安装', '扩展项目目录', ''], ['从 npm 安装', '包名与版本', `@scope/cortico-${kind}-demo@1.2.3`]]) {
      input.value = 'old input'; input.dispatchEvent(new Event('input'));
      const choice = button(fold, label); choice.focus(); choice.click(); await flush();
      expect(document.activeElement).toBe(choice);
      expect(root.querySelector('.world-manual')).toBe(fold);
      expect(fold.open).toBe(true);
      expect(root.querySelector('.extension-market-card')).toBe(firstCard);
      expect(scroll.scrollTop).toBe(60);
      expect(fold.querySelector('input')).toBe(input);
      expect(input.getAttribute('aria-label')).toBe(field);
      expect(input.placeholder).toBe(placeholder);
      expect(input.value).toBe('');
      expect(fold.querySelector('.extension-manual-folder').disabled).toBe(label === '从 npm 安装');
      expect(fold.querySelectorAll('.extension-install-help>[aria-hidden=false]')).toHaveLength(1);
    }
  });
  it('shows a restart in progress as a spinner beside the button without a status line', async () => {
    const list = { extensions: [{ name: 'late', kind: 'world', state: 'pending-restart' }] };
    const { root } = await openWorlds({ list });
    root.querySelector('.world-restart-footer .extension-restart').click(); await flush();
    answer(true); await flush(100);
    expect(root.querySelector('.world-restart-footer').classList.contains('is-restarting')).toBe(true);
    expect(root.querySelector('.world-restart-footer .extension-restart').disabled).toBe(true);
    expect(root.querySelector('.world-workspace-status').textContent).toBe('');
  });
  it('orders row controls from the sidebar switch to power and opens configuration on a row click', async () => {
    const { root, ctx } = await openWorlds({}, { worlds: true, extensions: true, worldActivation: true, worldVisibility: true, restart: true, supervised: true });
    ctx.router.navigate(['world']); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    const row = [...root.querySelectorAll('.world-blade')].find(item => item.dataset.key === 'alpha-mod');
    expect([...row.querySelectorAll('.world-blade-actions button')].map(item => item.getAttribute('aria-label'))).toEqual(['左栏隐藏', '删除扩展', '对 Coo 隐藏', '停用 World']);
    expect(row.querySelector('.world-blade-identity h3 [aria-label="扩展信息"]')).not.toBeNull();
    // Rows with fewer controls pack them to the right, with no gap at the end.
    const slots = (item) => [...item.querySelectorAll('.world-blade-actions button')].map(button => button.style.getPropertyValue('--slot'));
    expect(slots(row)).toEqual(['1', '2', '3', '4']);
    const failed = [...root.querySelectorAll('.world-blade')].find(item => item.dataset.key === 'beta-mod');
    expect(slots(failed).at(-1)).toBe('4');
    row.querySelector('.world-blade-identity code').click(); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    expect(decodeURIComponent(window.location.hash)).toBe('#/provider/world:alpha');
  });
  it('filters My World by name and state, and keeps a named, collapsed group across reloads', async () => {
    const { root, ctx } = await openWorlds();
    ctx.router.navigate(['world']); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    const visible = () => [...root.querySelectorAll('.world-ready-list .world-library-entry:not(.is-filtered-out)')].map(entry => entry.dataset.key);
    const search = root.querySelector('.world-library-tools input[type=search]');
    search.value = '甲'; search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(visible()).toEqual(['alpha-mod']);
    expect(root.querySelector('.world-library-entry').classList.contains('is-movable')).toBe(false);
    expect(root.querySelector('.world-no-matches').hidden).toBe(true);
    search.value = '不存在的名字'; search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(visible()).toEqual([]);
    expect(root.querySelector('.world-no-matches').hidden).toBe(false);
    search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelector('.world-ready-list .world-library-entry').classList.contains('is-movable')).toBe(true);
    button(root.querySelector('.world-library-tools'), '新建分组').click(); await flush();
    const rename = root.querySelector('.world-group-rename');
    rename.value = '聊天'; rename.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    root.querySelector('.world-group-toggle').click();
    const saved = JSON.parse(window.localStorage.getItem('coopanion.world-groups.v1'));
    expect(Object.values(saved.groups)).toEqual([expect.objectContaining({ name: '聊天', collapsed: true, items: [] })]);
    expect(saved.top[0]).toMatch(/^group:/);
  });
  it('ends a drag the window or the page walks away from, so the pointer shows again', async () => {
    const { root, ctx, lifecycle } = await openWorlds();
    ctx.router.navigate(['world']); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    const pointer = (type, target, y) => { const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: y }); Object.defineProperty(event, 'pointerId', { value: 1 }); target.dispatchEvent(event); };
    const lift = () => { pointer('pointerdown', root.querySelector('.world-ready-list .world-library-entry .world-blade'), 10); pointer('pointermove', window, 400); };
    const hidden = () => document.documentElement.classList.contains('is-list-dragging');
    lift(); expect(hidden()).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(hidden()).toBe(false);
    expect(root.querySelector('.world-drag-copy')).toBeNull();
    lift(); expect(hidden()).toBe(true);
    lives.splice(lives.indexOf(lifecycle), 1); lifecycle.dispose();
    expect(hidden()).toBe(false);
  });
  it('drags a row with the pointer: a lifted copy, no cursor, and the click after the drop opens nothing', async () => {
    const { root, ctx } = await openWorlds();
    ctx.router.navigate(['world']); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    const order = () => [...root.querySelectorAll('.world-ready-list .world-library-entry')].map(entry => entry.dataset.key);
    const [first, ...rest] = order();
    expect(rest.length).toBeGreaterThan(0);
    const pointer = (type, target, y) => { const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: y }); Object.defineProperty(event, 'pointerId', { value: 1 }); target.dispatchEvent(event); };
    const row = root.querySelector(`.world-ready-list .world-library-entry[data-key="${first}"] .world-blade-state, .world-ready-list .world-library-entry[data-key="${first}"] .world-blade`);
    const hash = window.location.hash;
    pointer('pointerdown', row, 10);
    pointer('pointermove', window, 12);
    expect(root.querySelector('.world-drag-copy')).toBeNull();
    pointer('pointermove', window, 400);
    expect(root.querySelector('.world-drag-copy')).not.toBeNull();
    expect(document.documentElement.classList.contains('is-list-dragging')).toBe(true);
    expect(root.querySelector(`.world-library-entry[data-key="${first}"]`).classList.contains('is-dragging')).toBe(true);
    pointer('pointerup', window, 400);
    // The drop re-renders the rows; the click lands on the live one.
    root.querySelector(`.world-ready-list .world-library-entry[data-key="${first}"] .world-blade`).click(); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    expect(window.location.hash).toBe(hash);
    expect(root.querySelector('.world-drag-copy')).toBeNull();
    expect(document.documentElement.classList.contains('is-list-dragging')).toBe(false);
    // jsdom lays nothing out, so the drop lands after the last row.
    expect(order()).toEqual([...rest, first]);
  });
  it('keeps a built-in World on and visible: its hide and power controls are greyed', async () => {
    const worlds = [{ id: 'core', label: 'Core', status: 'active', visible: true }];
    const { root, ctx } = await openWorlds({ worlds }, { worlds: true, extensions: true, worldActivation: true, worldVisibility: true, restart: true, supervised: true });
    ctx.router.navigate(['world']); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    const row = [...root.querySelectorAll('.world-blade')].find(item => item.dataset.key === 'world:core');
    for (const slot of ['visibility', 'power']) expect(row.querySelector(`[data-slot="${slot}"]`).getAttribute('aria-disabled')).toBe('true');
    row.querySelector('[data-slot="power"]').click(); await flush();
    expect(document.querySelector('.modal')).toBeNull();
    expect(calls.some(call => call.url === '/api/worlds/activation')).toBe(false);
  });
  it('recounts a group after one of its rows moves out', async () => {
    window.localStorage.setItem('coopanion.world-groups.v1', JSON.stringify({ top: ['group:g', 'world:builtin'], groups: { g: { name: 'G', collapsed: false, items: ['alpha-mod', 'delta-mod'] } } }));
    stub({}); window.history.replaceState(null, '', '#/world');
    const context = mkCtx({ worlds: true, extensions: true, worldActivation: true, restart: true, supervised: true }); lives.push(context.lifecycle);
    mountWorlds(context.ctx); await flush();
    const root = context.root;
    expect(root.querySelector('.world-group-count').textContent).toBe(String(root.querySelectorAll('.world-group-list .world-library-entry').length));
  });
  it('hides an active World from the sidebar and remembers it', async () => {
    window.localStorage.removeItem('coopanion.world-nav-hidden.v1');
    const { root, ctx } = await openWorlds({}, { worlds: true, extensions: true, worldActivation: true, worldVisibility: true, restart: true, supervised: true });
    ctx.router.navigate(['world']); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    let fired = 0; window.addEventListener('coopanion:world-nav-hidden', () => fired++, { once: true });
    root.querySelector('.world-blade[data-world="alpha"] [data-slot="sidebar"]').click(); await flush();
    expect(JSON.parse(window.localStorage.getItem('coopanion.world-nav-hidden.v1'))).toEqual(['world:alpha']);
    expect(fired).toBe(1);
    expect(root.querySelector('.world-blade[data-world="alpha"] [data-slot="sidebar"]').getAttribute('aria-label')).toBe('左栏显示');
    window.localStorage.removeItem('coopanion.world-nav-hidden.v1');
  });
  it('shows a failed switch beside its control instead of a status line', async () => {
    const { root, ctx } = await openWorlds({ worlds: [{ id: 'alpha', label: '甲扩展', status: 'inactive' }] }, { worlds: true, extensions: true, worldActivation: true, restart: true, supervised: true });
    ctx.router.navigate(['world']); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    vi.stubGlobal('fetch', (url, init) => Promise.resolve(String(url) === '/api/worlds/activation' ? new Response(JSON.stringify({ error: 'World 启动失败' }), { status: 500, headers: { 'Content-Type': 'application/json' } }) : new Response(JSON.stringify(String(url) === '/api/worlds' ? { worlds: [{ id: 'alpha', label: '甲扩展', status: 'inactive' }] } : { extensions: LIST.extensions, dir: '' }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    root.querySelector('.world-blade[data-world="alpha"] [data-slot="power"]').click(); await flush(100);
    const problem = [...document.querySelectorAll('.extension-problem')].find(el => !el.classList.contains('hidden'));
    expect(problem.textContent).toContain('World 启动失败');
    expect(root.querySelector('.world-feedback').textContent).toBe('');
  });
  it('keeps a load failure to its state and opens the reason in the error popover', async () => {
    const { root, ctx } = await openWorlds();
    ctx.router.navigate(['world']); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    const row = [...root.querySelectorAll('.world-blade')].find(item => item.dataset.key === 'beta-mod');
    expect(row.querySelector('.world-blade-note')).toBeNull();
    row.querySelector('.world-state-problem').click();
    const problem = [...document.querySelectorAll('.extension-problem')].find(el => !el.classList.contains('hidden'));
    expect(problem.textContent).toContain('默认导出不是 WorldDefinition');
  });
  it("opens extension info from a World's name", async () => {
    const { root, ctx } = await openWorlds();
    ctx.router.navigate(['world']); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    [...root.querySelectorAll('.world-blade')].find(item => item.dataset.key === 'alpha-mod').querySelector('button.world-name').click(); await flush();
    expect(document.querySelector('.extension-detail')).not.toBeNull();
  });
  it('greys out an unavailable uninstall and names the reason', async () => {
    const { root, ctx } = await openWorlds();
    ctx.router.navigate(['world']); window.dispatchEvent(new HashChangeEvent('hashchange')); await flush();
    const remove = [...root.querySelectorAll('.world-blade')].find(item => item.dataset.key === 'world:builtin').querySelector('.iobtn-remove');
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    expect(remove.title).toBe('随 Coopanion 提供，不能单独删除。');
    remove.click(); await flush();
    expect(document.querySelector('.modal')).toBeNull();
  });
  it('excludes caution tags for good, lists them above the cards and lets them back from there', async () => {
    const key = 'cortico.extensions.exclusions.v1:' + location.origin;
    localStorage.removeItem(key);
    try {
      const index = { tags: { unsafe: { label: '不安全', style: 'warning' }, game: { label: '游戏' } } };
      const hits = [{ ...HITS.hits[0], tags: ['unsafe', 'game'] }, { ...HITS.hits[1], tags: ['game'] }];
      const cards = root => [...root.querySelectorAll('.world-catalog .extension-market-card')].map(card => card.dataset.name);
      const first = await openWorlds({ hits: { hits, index } });
      first.root.querySelector('.world-market [aria-label="隐藏带警示标签的扩展"]').click(); await flush();
      expect(cards(first.root)).toEqual([HITS.hits[1].name]);
      // A new session still excludes it, and the sidebar keeps its row so it can be let back.
      window.sessionStorage.clear();
      const { root } = await openWorlds({ hits: { hits, index } });
      expect(cards(root)).toEqual([HITS.hits[1].name]);
      expect([...root.querySelectorAll('.world-catalog-filters .extension-tag.is-excluded')].map(tag => tag.textContent)).toEqual(['不安全1']);
      expect(root.querySelector('.extension-active-row .extension-active-note').textContent).toBe('隐藏了 1 个');
      root.querySelector('.extension-active-item.is-excluded').click(); await flush();
      expect(cards(root)).toHaveLength(2);
      expect(root.querySelector('.extension-active-filters').hidden).toBe(true);
    } finally { localStorage.removeItem(key); }
  });
  it('adds a tag clicked on a card to the selection, within the current category', async () => {
    const index = { tags: { game: { label: '游戏' } } };
    const { root } = await openWorlds({ hits: { hits: [{ ...HITS.hits[0], tags: ['game'] }, HITS.hits[1]], index } });
    root.querySelector('.world-catalog .extension-market-card .extension-tag').click(); await flush();
    expect(root.querySelector('.world-catalog-categories [data-category="all"]').getAttribute('aria-pressed')).toBe('true');
    expect([...root.querySelectorAll('.extension-active-row .extension-active-item')].map(item => item.textContent)).toEqual(['游戏']);
    expect(root.querySelectorAll('.world-catalog .extension-market-card')).toHaveLength(1);
  });
  it('keeps runtime controls available when the catalog capability is absent', async () => {
    const { root } = await openWorlds({}, { worlds: true, worldActivation: true });
    expect(root.querySelector('.world-workspace').dataset.view).toBe('mine');
    expect(root.querySelectorAll('.pagetab')).toHaveLength(1);
    expect(root.querySelector('.world-blade').classList.contains('is-configurable')).toBe(true);
    root.querySelector('[aria-label="激活 World"]').click(); await flush();
    expect(calls.find(call => call.url === '/api/worlds/activation').body).toEqual({ id: 'builtin', enabled: true });
    expect(calls.some(call => call.url.startsWith('/api/extensions'))).toBe(false);
  });
});
