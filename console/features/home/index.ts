/**
 * 「开始」: the app's home page. Everything the first minutes need on one page, top to bottom in
 * the order it is needed: the DeepSeek key (saved to the `deepseek` endpoint, tested, then the
 * run resumes), then the pet (live preview, show, a button to the dressing page). Computer use is
 * switched on the cua World's own page and asks each turn in the pet's bubble, so it has no control
 * here. Dressing up and voice input have their own pages (features/dress, features/voice); the link
 * to other model services shows in the advanced mode only. Every control calls an endpoint the rest
 * of the console already uses. Styles are in home.css, which scripts/stage.ts adds to the console
 * stylesheet.
 */
import { get, post } from '../../core/api.ts';
import { pick } from '../../core/language.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';
import { readMode } from '../mode.ts';

const ENDPOINT = 'deepseek';
const KEY_URL = 'https://platform.deepseek.com/api_keys';
const PET_PAGE = 'world:desktop-pet';

const S = pick({
  zh: {
    nav: '开始',
    title: 'Coo',
    running: '醒着',
    paused: '暂停中',
    noModel: '还没连上模型',
    pause: '暂停',
    resume: '继续',
    modelTitle: '连接模型',
    modelNeed: '填入 DeepSeek 的 API Key 就能开始。',
    keyLabel: 'API Key',
    keyPlaceholder: 'sk-…',
    getKey: '去 DeepSeek 开放平台申请',
    saveStart: '保存并开始',
    connected: (model: string, title: string) => `已连接 ${title} · ${model}`,
    test: '测试连接',
    changeKey: '换一个 Key',
    otherProvider: '用别的模型服务',
    testing: '正在测试…',
    testOk: (ms: number | null) => `连接正常${ms !== null ? `,耗时 ${ms} ms` : ''}`,
    testFail: (why: string) => `连接失败:${why}`,
    started: '好了,Coo 醒了。',
    petTitle: '桌宠',
    petShown: '在桌面上',
    petHidden: '没有显示',
    showPet: '显示桌宠',
    dress: '装扮',
    petNote: '鼠标停在桌宠身上会出现打字和黑白模式两个按钮;右键打开菜单;按住可以拎起来。',
  },
  en: {
    nav: 'Start',
    title: 'Coo',
    running: 'Awake',
    paused: 'Paused',
    noModel: 'No model connected',
    pause: 'Pause',
    resume: 'Resume',
    modelTitle: 'Connect a model',
    modelNeed: 'Enter a DeepSeek API key to start.',
    keyLabel: 'API Key',
    keyPlaceholder: 'sk-…',
    getKey: 'Get a key on the DeepSeek platform',
    saveStart: 'Save and start',
    connected: (model: string, title: string) => `Connected to ${title} · ${model}`,
    test: 'Test',
    changeKey: 'Use another key',
    otherProvider: 'Use another model service',
    testing: 'Testing…',
    testOk: (ms: number | null) => `Connection works${ms !== null ? `, ${ms} ms` : ''}`,
    testFail: (why: string) => `Connection failed: ${why}`,
    started: 'Done. Coo is awake.',
    petTitle: 'Desktop pet',
    petShown: 'On the desktop',
    petHidden: 'Not shown',
    showPet: 'Show pet',
    dress: 'Dress up',
    petNote: 'Hover the pet for the typing and dark/light buttons; right-click for the menu; hold it to pick it up.',
  },
});

interface Status { loop?: { paused?: boolean }; modelConnection?: { ready: boolean; model: string | null; moduleTitle: string } | null }
interface Detail { name: string; entry: Record<string, unknown>; revision: string; secretConfigured?: 'none' | 'env' | 'file' }
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
  const toggle = ui.button(S.pause, { size: 'sm' });
  head.append(title, state, ui.h('span', 'grow'), toggle);
  root.append(head);

  /* ---------- model ---------- */
  const model = ui.sheet({ title: S.modelTitle });
  const modelMsg = ui.msgline('');
  const keyInput = ui.input({ placeholder: S.keyPlaceholder });
  keyInput.type = 'password';
  keyInput.autocomplete = 'off';
  const keyRow = ui.rowbar();
  const save = ui.button(S.saveStart, { variant: 'primary' });
  keyRow.append(ui.field(S.keyLabel, keyInput), save);
  const getKey = ui.h('a', 'home-link', S.getKey);
  getKey.href = KEY_URL; getKey.target = '_blank'; getKey.rel = 'noopener';
  const need = ui.h('p', 'home-note', S.modelNeed);
  const connectedLine = ui.rowbar();
  const connectedPill = ui.pill('', 'on');
  const test = ui.button(S.test, { size: 'sm' });
  const change = ui.button(S.changeKey, { size: 'sm' });
  const other = ui.h('a', 'home-link', S.otherProvider);
  other.href = '#/providers';
  connectedLine.append(connectedPill, test, change, ui.h('span', 'grow'), other);
  const keyBox = ui.h('div', 'home-keybox');
  keyBox.append(need, keyRow, getKey);
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
  let detail: Detail | null = null;
  let editingKey = false;
  let paused = false;

  const renderStatus = (st: Status) => {
    paused = st.loop?.paused === true;
    const mc = st.modelConnection;
    if (!mc?.ready) { state.textContent = S.noModel; state.className = 'pill off'; }
    else { state.textContent = paused ? S.paused : S.running; state.className = `pill ${paused ? 'plain' : 'on'}`; }
    toggle.textContent = paused ? S.resume : S.pause;
    toggle.disabled = !mc?.ready;
    const ready = !!mc?.ready && !!detail?.secretConfigured && detail.secretConfigured !== 'none';
    connectedLine.hidden = !ready || editingKey;
    keyBox.hidden = ready && !editingKey;
    if (mc?.model) connectedPill.textContent = S.connected(mc.model, mc.moduleTitle);
    // the mode can change while this page stays mounted
    other.hidden = readMode() !== 'advanced';
  };

  const refreshModel = async () => {
    try {
      detail = await get<Detail>(`/api/providers/${ENDPOINT}`, opts);
    } catch { detail = null; }
    renderStatus(await get<Status>('/api/status', opts));
  };

  const runTest = async (): Promise<boolean> => {
    modelMsg.textContent = S.testing;
    modelMsg.classList.remove('bad');
    try {
      const r = await post<{ ok?: boolean; elapsedMs?: number; error?: string; status?: number; hint?: string }>(`/api/providers/${ENDPOINT}/test`, {}, opts);
      const ok = r?.ok !== false && !r?.error;
      modelMsg.textContent = ok ? S.testOk(typeof r?.elapsedMs === 'number' ? Math.round(r.elapsedMs) : null) : S.testFail(r?.hint ?? r?.error ?? `HTTP ${r?.status ?? '?'}`);
      modelMsg.classList.toggle('bad', !ok);
      return ok;
    } catch (err) {
      modelMsg.textContent = S.testFail(errText(err));
      modelMsg.classList.add('bad');
      return false;
    }
  };

  save.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!key) { keyInput.focus(); return; }
    save.disabled = true;
    try {
      const d = detail ?? await get<Detail>(`/api/providers/${ENDPOINT}`, opts);
      await post(`/api/providers/${ENDPOINT}/save`, { name: d.name, entry: d.entry, expectedRevision: d.revision, secretValue: key }, opts);
      keyInput.value = '';
      editingKey = false;
      if (await runTest()) {
        await post('/api/run/resume', {}, opts);
        modelMsg.textContent = S.started;
      }
      await refreshModel();
    } catch (err) {
      modelMsg.textContent = errText(err);
      modelMsg.classList.add('bad');
    } finally {
      save.disabled = false;
    }
  });
  test.addEventListener('click', () => void runTest());
  change.addEventListener('click', () => { editingKey = true; void refreshModel(); keyInput.focus(); });
  toggle.addEventListener('click', async () => {
    await post(paused ? '/api/run/resume' : '/api/run/pause', {}, opts);
    void refreshModel();
  });

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
