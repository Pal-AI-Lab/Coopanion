/**
 * 「开始」: the app's home page. Everything the first minutes need on one page, top to bottom in
 * the order it is needed: the model service and its key (a row of services with their logos,
 * DeepSeek first; the key is saved to that service's own endpoint, tested, the endpoint made active
 * and the run resumed), then the pet (live preview, show, a button to the dressing page). Computer use is
 * switched on the cua World's own page and asks each turn in the pet's bubble, so it has no control
 * here. Dressing up and voice input have their own pages (features/dress, features/voice); the link
 * to other model services shows with or without a key, and in the normal mode asks before it
 * switches to the advanced mode, where the model pages are; 「使用引导」 at the top has Coo run its
 * introduction again on the desktop (the app's Core holds it; this window steps aside for it).
 * Saving and testing the key lives in model.ts. Every
 * control calls an endpoint the rest of the console already uses. Styles are in home.css, which
 * scripts/stage.ts adds to the console stylesheet.
 */
import { post } from '../../core/api.ts';
import { pick } from '../../core/language.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';
import { readMode, requestMode } from '../mode.ts';
import { connectVendor, consoleCall, readStatus, testEndpoint, VENDOR_ICONS, VENDORS, vendorOf, type ConnectResult, type Status, type Vendor } from './model.ts';

const PET_PAGE = 'world:desktop-pet';

const S = pick({
  zh: {
    nav: '开始',
    title: 'Coo',
    running: '醒着',
    paused: '暂停中',
    noModel: '还没连上模型',
    modelTitle: '连接模型',
    modelNeed: '选一家模型服务,填入它的 API Key 就能开始。拿不准就选 DeepSeek。',
    keyLabel: (name: string) => `${name} 的 API Key`,
    getKey: (name: string) => `去${name}申请 Key`,
    saveStart: '保存并开始',
    connected: (model: string, title: string) => `已连接 ${title} · ${model}`,
    test: '测试连接',
    changeKey: '换一家或换 Key',
    otherProvider: '用别的模型服务',
    toAdvancedTitle: '是否切换为高级模式?',
    toAdvancedBody: '别的模型服务在高级模式的「模型」页里设置。之后可在左下角重新切换回普通模式。',
    testing: '正在测试…',
    testOk: (ms: number | null) => `连接正常${ms !== null ? `,耗时 ${ms} ms` : ''}`,
    testFail: (why: string) => `连接失败:${why}`,
    started: '好了,Coo 醒了。',
    petTitle: '桌宠',
    petShown: '在桌面上',
    petHidden: '没有显示',
    showPet: '显示桌宠',
    dress: '装扮',
    petNote: '鼠标停在桌宠身上会出现打字和麦克风两个按钮;右键打开菜单;按住可以拎起来。',
    guide: '使用引导',
    guideHint: '让 Coo 在屏幕底边再带你走一遍',
  },
  en: {
    nav: 'Start',
    title: 'Coo',
    running: 'Awake',
    paused: 'Paused',
    noModel: 'No model connected',
    modelTitle: 'Connect a model',
    modelNeed: 'Pick a model service and enter its API key to start. DeepSeek if unsure.',
    keyLabel: (name: string) => `${name} API key`,
    getKey: (name: string) => `Get a ${name} key`,
    saveStart: 'Save and start',
    connected: (model: string, title: string) => `Connected to ${title} · ${model}`,
    test: 'Test',
    changeKey: 'Change service or key',
    otherProvider: 'Use another model service',
    toAdvancedTitle: 'Switch to advanced mode?',
    toAdvancedBody: 'Other model services are set up on the Model page of advanced mode. You can switch back to normal mode at the bottom left.',
    testing: 'Testing…',
    testOk: (ms: number | null) => `Connection works${ms !== null ? `, ${ms} ms` : ''}`,
    testFail: (why: string) => `Connection failed: ${why}`,
    started: 'Done. Coo is awake.',
    petTitle: 'Desktop pet',
    petShown: 'On the desktop',
    petHidden: 'Not shown',
    showPet: 'Show pet',
    dress: 'Dress up',
    petNote: 'Hover the pet for the typing and microphone buttons; right-click for the menu; hold it to pick it up.',
    guide: 'Guide',
    guideHint: 'Coo walks you through it again at the bottom of the screen',
  },
});

interface PetState { connected: boolean; url: string | null }

const panelPath = (page: string, panel: string, method: string) => `/api/console/providers/${encodeURIComponent(page)}/panels/${panel}/${method}`;
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function mount(ctx: FeatureContext): Promise<void> {
  const { ui, root, signal } = ctx;
  const opts = { signal };
  root.classList.add('home');

  /* ---------- status ---------- */
  const head = ui.h('div', 'home-head');
  const title = ui.h('h1', 'home-title', S.title);
  const state = ui.pill('—', 'plain');
  const guide = ui.button(S.guide, { size: 'sm', onClick: () => { void post(panelPath(PET_PAGE, 'pet', 'guide'), { args: [] }, opts).catch((err) => ui.toast(String(err instanceof Error ? err.message : err))); } });
  guide.title = S.guideHint;
  head.append(title, state, ui.h('span', 'grow'), guide);
  root.append(head);

  /* ---------- model ---------- */
  const model = ui.sheet({ title: S.modelTitle });
  const modelMsg = ui.msgline('');
  const call = consoleCall(signal);
  /** The service the key box is for: picked on the row of logos. */
  let vendor: Vendor = VENDORS[0]!;
  const vendorRow = ui.h('div', 'home-vendors');
  const vendorButtons = VENDORS.map((v) => {
    const b = ui.h('button', 'home-vendor');
    b.type = 'button';
    const mark = ui.h('span', 'home-vendormark');
    // the marks are the provider package's own static SVGs
    mark.innerHTML = VENDOR_ICONS[v.id] ?? '';
    b.append(mark, ui.h('span', null, v.name));
    b.addEventListener('click', () => pickVendor(v), opts);
    vendorRow.append(b);
    return b;
  });
  const keyInput = ui.input({});
  keyInput.type = 'password';
  keyInput.autocomplete = 'off';
  const keyRow = ui.rowbar();
  const save = ui.button(S.saveStart, { variant: 'primary' });
  const keyField = ui.field(S.keyLabel(vendor.name), keyInput);
  keyRow.append(keyField, save);
  const getKey = ui.h('a', 'home-link', '');
  getKey.target = '_blank'; getKey.rel = 'noopener';
  const pickVendor = (v: Vendor) => {
    vendor = v;
    vendorButtons.forEach((b, i) => b.classList.toggle('on', VENDORS[i] === v));
    keyInput.placeholder = v.keyHint;
    const label = keyField.querySelector('.fieldlabel');
    if (label) label.textContent = S.keyLabel(v.name);
    getKey.textContent = S.getKey(v.name);
    getKey.href = v.keyUrl;
  };
  pickVendor(vendor);
  const need = ui.h('p', 'home-note', S.modelNeed);
  const connectedLine = ui.rowbar();
  const connectedPill = ui.pill('', 'on');
  const test = ui.button(S.test, { size: 'sm' });
  const change = ui.button(S.changeKey, { size: 'sm' });
  /** 两处各一个:连上时在状态行末尾,没填 Key 时在申请链接旁。普通模式先问一声再切到高级模式。 */
  const otherLink = () => {
    const a = ui.h('a', 'home-link', S.otherProvider);
    a.href = '#/providers';
    a.addEventListener('click', async (e) => {
      if (readMode() === 'advanced') return;
      e.preventDefault();
      if (!await ui.confirm({ title: S.toAdvancedTitle, body: S.toAdvancedBody })) return;
      requestMode('advanced');
      ctx.router.navigate(['providers']);
    }, opts);
    return a;
  };
  connectedLine.append(connectedPill, test, change, ui.h('span', 'grow'), otherLink());
  const links = ui.rowbar();
  links.append(getKey, ui.h('span', 'grow'), otherLink());
  const keyBox = ui.h('div', 'home-keybox');
  keyBox.append(need, vendorRow, keyRow, links);
  model.body.append(connectedLine, keyBox, modelMsg);
  root.append(model.el);

  /* ---------- pet ---------- */
  const pet = ui.sheet({ title: S.petTitle });
  const petLine = ui.rowbar();
  const petPill = ui.pill('—', 'plain');
  const showPet = ui.button(S.showPet, { size: 'sm' });
  const dress = ui.button(S.dress, { size: 'sm', variant: 'primary' });
  petLine.append(petPill, ui.h('span', 'grow'), showPet, dress);
  const preview = ui.h('iframe', 'home-petframe');
  preview.title = S.petTitle;
  pet.body.append(petLine, preview, ui.h('p', 'home-note', S.petNote));
  root.append(pet.el);

  /* ---------- behaviour ---------- */
  let editingKey = false;
  let status: Status | null = null;
  let vendorShown = false;

  const renderStatus = (st: Status) => {
    status = st;
    const paused = st.loop?.paused === true;
    const mc = st.modelConnection;
    if (!mc?.ready) { state.textContent = S.noModel; state.className = 'pill off'; }
    else { state.textContent = paused ? S.paused : S.running; state.className = `pill ${paused ? 'plain' : 'on'}`; }
    const ready = !!mc?.ready;
    connectedLine.hidden = !ready || editingKey;
    keyBox.hidden = ready && !editingKey;
    const current = vendorOf(mc?.baseUrl);
    if (mc?.model) connectedPill.textContent = S.connected(mc.model, current?.name ?? mc.moduleTitle);
    // the key box starts on the service in use, once
    if (!vendorShown && current) { vendorShown = true; pickVendor(current); }
  };

  const refreshModel = async () => {
    renderStatus(await readStatus(signal));
  };

  const showTest = (r: ConnectResult) => {
    modelMsg.textContent = r.ok ? S.testOk(r.ms) : S.testFail(r.why ?? '');
    modelMsg.classList.toggle('bad', !r.ok);
  };
  const testing = () => {
    modelMsg.textContent = S.testing;
    modelMsg.classList.remove('bad');
  };

  save.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!key) { keyInput.focus(); return; }
    save.disabled = true;
    try {
      testing();
      const r = await connectVendor(call, vendor, key);
      keyInput.value = '';
      editingKey = false;
      showTest(r);
      if (r.ok) modelMsg.textContent = S.started;
      await refreshModel();
    } catch (err) {
      modelMsg.textContent = errText(err);
      modelMsg.classList.add('bad');
    } finally {
      save.disabled = false;
    }
  });
  test.addEventListener('click', async () => {
    const name = status?.modelConnection?.name;
    if (!name) return;
    testing();
    showTest(await testEndpoint(call, name));
  });
  change.addEventListener('click', () => { editingKey = true; void refreshModel(); keyInput.focus(); });

  /* pet */
  let petState: PetState | null = null;
  const refreshPet = async () => {
    try {
      petState = await post<PetState>(panelPath(PET_PAGE, 'pet', 'state'), { args: [] }, opts);
    } catch { petState = null; }
    petPill.textContent = petState?.connected ? S.petShown : S.petHidden;
    petPill.className = `pill ${petState?.connected ? 'on' : 'plain'}`;
    if (petState?.url && preview.dataset.src !== petState.url) {
      preview.dataset.src = petState.url;
      preview.src = petState.url;
    }
  };
  showPet.addEventListener('click', async () => {
    await post(panelPath(PET_PAGE, 'pet', 'closeWindow'), { args: [] }, opts).catch(() => null);
    await post(panelPath(PET_PAGE, 'pet', 'openWindow'), { args: [] }, opts).catch(() => null);
    setTimeout(() => void refreshPet(), 1500);
  });
  dress.addEventListener('click', () => ctx.router.navigate(['dress']));

  await Promise.all([refreshModel(), refreshPet()]);
  ctx.lifecycle.interval(() => { void refreshModel(); void refreshPet(); }, 2000);
}

export const homeFeature: FrameworkFeature = {
  route: 'home',
  label: S.nav,
  icon: 'play',
  navMode: 'primary',
  mount,
};
