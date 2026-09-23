/**
 * 「开始」: the app's home page. Everything the first minutes need on one page, top to bottom in
 * the order it is needed: the DeepSeek key (saved to the `deepseek` endpoint, tested, then the
 * run resumes), the pet (live preview, show, dress up), voice input (switch and model download,
 * through the desktop-pet World's `voice` panel). Computer use is switched on the cua World's own
 * page and asks each turn in the pet's bubble, so it has no control here. Every control calls an endpoint the rest of the console already uses. Styles are in home.css,
 * which scripts/stage.ts adds to the console stylesheet.
 */
import { get, post } from '../../core/api.ts';
import { pick } from '../../core/language.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';

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
    voiceTitle: '语音输入',
    voiceOn: '听麦克风',
    voiceReady: '识别服务运行中',
    voiceStarting: '识别服务启动中',
    voiceNeeds: (mb: number) => `需要先下载识别程序和模型(约 ${mb} MB,只下载一次)`,
    download: '下载',
    downloading: (p: string) => `下载中 ${p}`,
    voiceError: (why: string) => `识别服务没起来:${why}`,
    micDenied: '麦克风被系统拒绝了,在 Windows 设置 → 隐私 → 麦克风里允许。',
    moreTitle: '更多',
    chat: '对话记录',
    extensions: '扩展',
    providers: '模型设置',
    advanced: '运行诊断',
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
    voiceTitle: 'Voice input',
    voiceOn: 'Listen to the microphone',
    voiceReady: 'Speech recognition is running',
    voiceStarting: 'Speech recognition is starting',
    voiceNeeds: (mb: number) => `Needs the recognizer and a model first (about ${mb} MB, once)`,
    download: 'Download',
    downloading: (p: string) => `Downloading ${p}`,
    voiceError: (why: string) => `Speech recognition did not start: ${why}`,
    micDenied: 'Windows denied the microphone; allow it in Settings → Privacy → Microphone.',
    moreTitle: 'More',
    chat: 'Conversation',
    extensions: 'Extensions',
    providers: 'Model settings',
    advanced: 'Diagnostics',
  },
});

interface Status { loop?: { paused?: boolean }; modelConnection?: { ready: boolean; model: string | null; moduleTitle: string } | null }
interface Detail { name: string; entry: Record<string, unknown>; revision: string; secretConfigured?: 'none' | 'env' | 'file' }
interface Artifact { phase: string; done: number; total: number | null; detail: string | null; path: string }
interface PetState { connected: boolean; url: string | null; dressUrl: string | null }
interface VoiceState {
  enabled: boolean; model: string;
  server: { phase: string; detail: string | null } | null;
  runtime: Artifact & { supported: boolean };
  models: Record<string, Artifact & { bytes: number }>;
  mic: { state: string; detail: string | null };
  input: { hint: string };
}

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

  /* ---------- voice ---------- */
  const voice = ui.sheet({ title: S.voiceTitle });
  const voiceSwitch = ui.checkbox(S.voiceOn, { onChange: (on) => void voiceCall('setEnabled', [on]) });
  const voiceLine = ui.rowbar();
  const voicePill = ui.pill('—', 'plain');
  const download = ui.button(S.download, { size: 'sm', variant: 'primary' });
  voiceLine.append(voiceSwitch.el, ui.h('span', 'grow'), voicePill, download);
  const voiceMsg = ui.msgline('');
  const voiceHow = ui.h('p', 'home-note');
  voice.body.append(voiceLine, voiceMsg, voiceHow);
  root.append(voice.el);

  /* ---------- more ---------- */
  const more = ui.sheet({ title: S.moreTitle });
  const links = ui.h('div', 'home-links');
  for (const [label, route] of [[S.chat, 'live'], [S.providers, 'providers'], [S.extensions, 'extensions'], [S.advanced, 'core']] as const) {
    links.append(ui.button(label, { size: 'sm', onClick: () => ctx.router.navigate([route]) }));
  }
  more.body.append(links);
  root.append(more.el);

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
  dress.addEventListener('click', () => { if (petState?.dressUrl) window.open(petState.dressUrl, '_blank'); });

  /* voice */
  const voiceCall = async (method: string, args: unknown[] = []) => {
    try {
      renderVoice(await post<VoiceState>(panelPath(PET_PAGE, 'voice', method), { args }, opts));
    } catch (err) {
      voiceMsg.textContent = errText(err);
    }
  };
  const renderVoice = (v: VoiceState) => {
    voiceSwitch.setChecked(v.enabled);
    voiceHow.textContent = v.input.hint;
    voiceHow.hidden = !v.enabled;
    const m = v.models[v.model];
    const working = v.runtime.phase === 'working' || m?.phase === 'working';
    const missingBytes = (v.runtime.phase === 'ready' ? 0 : 8_600_000) + (m?.phase === 'ready' ? 0 : m?.bytes ?? 0);
    download.hidden = missingBytes === 0 || !v.runtime.supported;
    download.disabled = working;
    voiceMsg.textContent = '';
    voiceMsg.classList.remove('bad');
    if (working) {
      const parts = ([v.runtime, m] as Array<Artifact | undefined>).filter((a): a is Artifact => !!a && a.phase === 'working')
        .map((a) => (a.total ? `${Math.round((a.done / a.total) * 100)}%` : `${Math.round(a.done / 1048576)} MB`));
      voicePill.textContent = S.downloading(parts.join(' · '));
      voicePill.className = 'pill plain';
    } else if (v.server?.phase === 'running' || v.server?.phase === 'external') {
      voicePill.textContent = S.voiceReady;
      voicePill.className = 'pill on';
    } else if (v.server?.phase === 'starting') {
      voicePill.textContent = S.voiceStarting;
      voicePill.className = 'pill plain';
    } else if (missingBytes > 0) {
      voicePill.textContent = S.voiceNeeds(Math.round(missingBytes / 1048576));
      voicePill.className = 'pill plain';
    } else {
      voicePill.textContent = '—';
      if (v.server?.detail) { voiceMsg.textContent = S.voiceError(v.server.detail); voiceMsg.classList.add('bad'); }
    }
    if (v.mic.state === 'denied') { voiceMsg.textContent = S.micDenied; voiceMsg.classList.add('bad'); }
  };
  download.addEventListener('click', () => void voiceCall('install'));

  await Promise.all([refreshModel(), refreshPet(), voiceCall('state')]);
  ctx.lifecycle.interval(() => { void refreshModel(); void refreshPet(); void voiceCall('state'); }, 2000);
}

export const homeFeature: FrameworkFeature = {
  route: 'home',
  label: S.nav,
  icon: 'play',
  navMode: 'primary',
  mount,
};
