/**
 * The introduction. On the first start Coo sets things up with the person right where it lives,
 * at the bottom of the screen, one step at a time in its bubble (the desktop-pet World's
 * `dialog`); no window opens:
 *
 * 1. hello, and what to call the person (the desktop-pet World's `user`);
 * 2. how lively to be (`roam`): while the cards are up Coo shows each one, standing still,
 *    strolling, or running back and forth;
 * 3. the DeepSeek key, saved and tested through the console's own endpoint routes;
 * 4. voice input: the speech model is downloaded with one click when it is missing, then how to
 *    talk, with the talk key as a key cap;
 * 5. where the buttons and the menu are, and where settings live.
 *
 * Every step has a close button that ends the introduction. The console's 「使用引导」 runs it
 * again (the World's `pet.guide` panel method). Once it has run, a missing key is asked for in the
 * bubble from time to time (`askForKey`), with the key box right there.
 */
import { existsSync, writeFileSync } from 'node:fs';
import type { DesktopPetWorld, PetDialog, PetDialogAnswer } from 'cortico-world-desktop-pet';

const ENDPOINT = 'deepseek';
const KEY_URL = 'https://platform.deepseek.com/api_keys';
const PET_GROUP = 'world:desktop-pet';
const USER_KEY = 'worlds.desktop-pet.user';
const ROAM_KEY = 'worlds.desktop-pet.roam';
/** The default name for the person: the name box offers it as a placeholder, not as a value. */
const DEFAULT_USER = '伙伴';
/** Names that are only a default (「主人」 was the default before 0.1.2): the name box starts empty for them. */
const DEFAULT_USERS = [DEFAULT_USER, '主人'];
/** Numbered steps, for the dots at the top of the bubble. */
const STEPS = 5;
/** How often a step waiting for the pet page looks again, and a download for its progress. */
const POLL_MS = 500;
const MAC = process.platform === 'darwin';

type Roam = 'off' | 'calm' | 'free';

const S = {
  hello: '你好呀!我是 Coo,以后就住在你屏幕的底边啦,库...',
  helloReply: '你好,Coo!',
  askName: '我该怎么称呼你?',
  nameSend: '就这么叫',
  gotName: (name: string) => `${name},记住啦!`,
  askRoam: '平时我该安静一点,还是活泼一点?点一下,看看我会怎样。',
  roam: {
    off: { label: '不乱动', level: '低', line: '那我就乖乖站着,你叫我我再动。', motion: 'still' },
    calm: { label: '多待着', level: '中', line: '我会时不时溜达一圈,大多时候待着。', motion: 'walk' },
    free: { label: '常走动', level: '高', line: '我可以到处跑来跑去,库...!', motion: 'run' },
  } as const,
  roamOk: '就这样',
  roamDone: '好,就按这个来。',

  askKey: '要和你聊天,我得先连上大模型。把 DeepSeek 的 API Key 贴在这里吧,按用量计费,注意 token 消耗哦。',
  keySend: '连接',
  keyLink: '还没有 Key?去申请',
  keyLater: '稍后再填',
  connecting: '正在连接…',
  keyOk: (model: string) => `连上了${model ? `(${model})` : ''}!现在我能说话啦,库...`,
  keyFail: (why: string) => `没连上:${why}。看看 Key 是不是完整,账户里还有没有余额?再贴一次试试。`,
  keyAlready: (model: string) => `模型已经连好了${model ? `(${model})` : ''},省事,库...`,
  keySkipped: '没关系,等你填好我再开口。之后我会再来问你。',

  askModel: (mb: number) => `要听懂你说话,我得先下载一个语音识别模型(FunASR,约 ${mb} MB,从国内的 ModelScope 下载)。现在下吗?`,
  download: '下载',
  notNow: '先不用',
  downloading: '正在下载语音模型,库...',
  downloaded: '下好了,现在我听得懂你说话啦!',
  downloadFail: (why: string) => `没下载下来:${why}。之后在设置的「语音输入」页可以再试。`,
  modelLater: '好,之后在设置的「语音输入」页一键就能下。',
  talk: (hint: string) => `想和我说话:${hint}。`,
  talkOff: '语音输入现在关着,可以在设置的「语音输入」页打开。',
  talkType: '也可以双击我打字。',
  gotIt: '知道了',
  buttons: '鼠标停在我身上,旁边会冒出几个按钮;右键我能打开菜单,暂停、设置和退出都在里面。',
  ok: '好',
  finish: MAC
    ? '都准备好啦!菜单栏里也有我的图标,想改设置点它就行。'
    : '都准备好啦!任务栏右下角的托盘里也有我的图标,想改设置点它就行。',
  go: '开始吧',
  dress: '先给我换身衣服',
  closed: '好,那先到这儿。想再听我介绍,打开设置,在「开始」页点「使用引导」。',

  ask: {
    first: '我还没连上模型,填好 DeepSeek 的 API Key 我才能和你说话。现在填吗?',
    talked: '我听到了,可还没连上模型,没法回你。把 DeepSeek 的 API Key 贴给我吧?',
    again: '还是没连上模型呢,填好 DeepSeek 的 API Key 我才能陪你聊天。',
  },
  askLater: '等会儿',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GuideDeps {
  pet: () => DesktopPetWorld | null;
  /** The console's origin, `http://127.0.0.1:<port>`. */
  console: string;
  /** Written once the introduction has run, so later starts skip it. */
  doneFile: string;
  /** Shows the dressing page (in the settings window). */
  openDress: () => void;
}

/** Ended with the close button: the rest is skipped. */
class Closed extends Error {}

/** The console's routes, called as the console calls them. */
function api(origin: string) {
  const call = async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', 'x-cortico-language': 'zh' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null) as T & { error?: string } | null;
    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
    return data as T;
  };
  return call;
}

interface Detail { name: string; entry: Record<string, unknown>; revision: string; secretConfigured?: 'none' | 'env' | 'file' }
interface Status { modelConnection?: { ready: boolean; model: string | null } | null }
interface VoiceState {
  enabled?: boolean;
  engine?: 'funasr' | 'system';
  model?: { phase: 'absent' | 'working' | 'ready' | 'error'; done: number; total: number | null; bytes: number; detail: string | null };
  input?: { effectiveMode?: 'hold' | 'toggle' | 'always'; hint?: string; keyLabel?: string; taps?: number };
}

/** The DeepSeek key: whether it is connected, and saving one (tested, and the run resumed once it passes). */
function keyRoutes(origin: string) {
  const call = api(origin);
  const detail = () => call<Detail>(`/api/providers/${ENDPOINT}`);
  return {
    async connected(): Promise<{ ok: boolean; model: string }> {
      const [d, st] = await Promise.all([detail().catch(() => null), call<Status>('/api/status').catch(() => null)]);
      return { ok: !!st?.modelConnection?.ready && !!d?.secretConfigured && d.secretConfigured !== 'none', model: st?.modelConnection?.model ?? '' };
    },
    async save(key: string): Promise<{ ok: boolean; why: string }> {
      try {
        const d = await detail();
        await call(`/api/providers/${ENDPOINT}/save`, { name: d.name, entry: d.entry, expectedRevision: d.revision, secretValue: key });
        const r = await call<{ ok?: boolean; error?: string; status?: number; hint?: string }>(`/api/providers/${ENDPOINT}/test`, {});
        if (r?.ok === false || r?.error) return { ok: false, why: r.hint ?? r.error ?? `HTTP ${r.status ?? '?'}` };
        await call('/api/run/resume', {});
        return { ok: true, why: '' };
      } catch (err) {
        return { ok: false, why: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

/** Steps through the pet's bubble; a step the pet page was not there for waits for it and shows again. */
function talker(pet: () => DesktopPetWorld | null) {
  const connected = () => !!pet()?.petState().connected;
  const show = async (d: PetDialog): Promise<Exclude<PetDialogAnswer, { unavailable: true }>> => {
    for (;;) {
      while (!connected()) await sleep(POLL_MS);
      const a = await pet()!.dialog(d).answer;
      if (!('unavailable' in a)) return a;
      await sleep(POLL_MS);
    }
  };
  return { show, connected };
}

/** Asks for the key in the bubble until it connects or the person puts it off; true once connected. */
async function keyLoop(show: (d: PetDialog) => Promise<PetDialogAnswer>, keys: ReturnType<typeof keyRoutes>, pet: () => DesktopPetWorld | null,
  first: PetDialog, later: string): Promise<boolean> {
  let step = first;
  for (;;) {
    const a = await show(step);
    if ('closed' in a) throw new Closed();
    if (!('text' in a)) return false;
    // the bar stays up while the key is saved and tested; a page gone meanwhile just misses it
    const wait = pet()?.dialog({ text: S.connecting, actions: ['thinking'], step: first.step, input: { kind: 'progress' } });
    const r = await keys.save(a.text);
    wait?.close();
    if (r.ok) {
      const { model } = await keys.connected();
      await show({ ...first, text: S.keyOk(model), actions: ['love', 'jump'], input: undefined });
      return true;
    }
    step = { ...first, text: S.keyFail(r.why), actions: ['sad'], input: keyInput(later) };
  }
}

const keyInput = (later: string): PetDialog['input'] => ({
  kind: 'text', submit: S.keySend, placeholder: 'sk-…', secret: true, maxLength: 200,
  link: { label: S.keyLink, url: KEY_URL }, alt: later,
});

let running = false;

/** Runs the introduction; a second call while it runs does nothing. */
export async function runGuide(deps: GuideDeps): Promise<void> {
  if (running) return;
  running = true;
  const t = talker(deps.pet);
  const call = api(deps.console);
  const keys = keyRoutes(deps.console);
  const step = (n: number, d: PetDialog): Promise<PetDialogAnswer> =>
    t.show({ ...d, step: [n, STEPS], closable: true }).then((a) => { if ('closed' in a) throw new Closed(); return a; });
  try {
    // a moment for Coo to land after the window opens
    while (!t.connected()) await sleep(POLL_MS);
    await sleep(1800);
    const values = await call<{ groups?: Array<{ group: { id: string }; values?: Record<string, unknown> }> }>('/api/config')
      .then((d) => d.groups?.find((g) => g.group.id === PET_GROUP)?.values ?? {}).catch(() => ({} as Record<string, unknown>));
    const setPet = (key: string, value: string) => call('/api/config', { group: PET_GROUP, values: { [key]: value } }).catch(() => {});

    // 1 hello, and a name
    await step(1, { text: S.hello, marks: ['Coo'], actions: ['happy', 'hop'], input: { kind: 'buttons', options: [{ label: S.helloReply, primary: true }] } });
    const saved = typeof values[USER_KEY] === 'string' ? values[USER_KEY] as string : '';
    const a = await step(1, {
      text: S.askName, actions: ['thinking'],
      input: { kind: 'text', submit: S.nameSend, placeholder: DEFAULT_USER, value: saved && !DEFAULT_USERS.includes(saved) ? saved : '', maxLength: 20 },
    });
    const name = 'text' in a ? a.text : saved || DEFAULT_USER;
    if (name !== saved) await setPet(USER_KEY, name);
    await step(1, { text: S.gotName(name), actions: ['love'] });

    // 2 how lively: each card plays out while it is picked
    const ORDER: Roam[] = ['off', 'calm', 'free'];
    const cur = ORDER.indexOf(values[ROAM_KEY] as Roam);
    const r = await step(2, {
      text: S.askRoam,
      input: {
        kind: 'choices', confirm: S.roamOk, value: cur < 0 ? 1 : cur,
        options: ORDER.map((id) => ({ ...S.roam[id], icon: `roam_${id}` })),
      },
    });
    const roam = ORDER['index' in r ? r.index : 1] ?? 'calm';
    await setPet(ROAM_KEY, roam);
    await step(2, { text: S.roamDone, actions: ['nod'] });

    // 3 the model key
    const k = await keys.connected();
    if (k.ok) await step(3, { text: S.keyAlready(k.model), actions: ['happy'] });
    else if (!await keyLoop((d) => step(3, d), keys, deps.pet, { text: S.askKey, actions: ['thinking'], step: [3, STEPS], input: keyInput(S.keyLater) }, S.keyLater)) {
      await step(3, { text: S.keySkipped, actions: ['sad'] });
    }

    // 4 voice input
    let voice = deps.pet()?.voiceState() as VoiceState | undefined;
    if (voice?.enabled !== false && voice?.engine === 'funasr' && voice.model && voice.model.phase !== 'ready') {
      const mb = Math.round(voice.model.bytes / 1048576);
      const d = await step(4, {
        text: S.askModel(mb), actions: ['thinking'],
        input: { kind: 'buttons', options: [{ label: S.download, primary: true }, { label: S.notNow }] },
      });
      if ('index' in d && d.index === 0) {
        const bar = deps.pet()?.dialog({ text: S.downloading, step: [4, STEPS], input: { kind: 'progress', label: `${mb} MB` } });
        void deps.pet()?.installVoice();
        for (;;) {
          await sleep(POLL_MS);
          voice = deps.pet()?.voiceState() as VoiceState | undefined;
          const m = voice?.model;
          if (!m || m.phase === 'ready' || m.phase === 'error' || m.phase === 'absent') break;
          bar?.update({ progress: m.total ? m.done / m.total : null });
        }
        bar?.close();
        if (voice?.model?.phase === 'ready') await step(4, { text: S.downloaded, actions: ['love', 'hop'] });
        else await step(4, { text: S.downloadFail(voice?.model?.detail ?? '?'), actions: ['sad'] });
      } else {
        await step(4, { text: S.modelLater });
      }
    }
    // the World words the hint for the key and mode in force; the key cap acts out the taps and the hold
    const on = voice?.enabled !== false && !!voice?.input?.hint;
    const keyed = on && voice?.input?.effectiveMode !== 'always';
    await step(4, {
      text: `${on ? S.talk(voice!.input!.hint!) : S.talkOff}${S.talkType}`,
      input: { kind: 'buttons', keys: keyed ? voice?.input?.keyLabel : undefined, taps: voice?.input?.taps, options: [{ label: S.gotIt, primary: true }] },
    });

    // 5 the buttons, the menu, and where settings live
    await step(5, { text: S.buttons, actions: ['wink'], input: { kind: 'buttons', options: [{ label: S.ok, primary: true }] } });
    const end = await step(5, { text: S.finish, actions: ['happy'], input: { kind: 'buttons', options: [{ label: S.go, primary: true }, { label: S.dress }] } });
    markDone(deps.doneFile);
    if ('index' in end && end.index === 1) deps.openDress();
  } catch (err) {
    if (!(err instanceof Closed)) throw err;
    markDone(deps.doneFile);
    await t.show({ text: S.closed, actions: ['nod'] });
  } finally {
    running = false;
  }
}

export const guideDone = (file: string) => existsSync(file);

export function markDone(file: string): void {
  try { writeFileSync(file, JSON.stringify({ doneAt: new Date().toISOString() }) + '\n'); } catch { /* read-only data dir: it shows again next start */ }
}

/** Without a key, how long after an ask the pet asks again. */
const ASK_AGAIN_MS = 20 * 60_000;
/** Talking to Coo without a key asks again sooner, but not within this long of the last ask. */
const ASK_TALKED_MS = 90_000;
/** How often the loop looks at the key (it reads the endpoint's `.env`). */
const KEY_POLL_MS = 2000;

/**
 * While no key is set, the pet asks for it in its bubble, with the key box right there: a while
 * after each ask, or sooner once the person talks to Coo (what they said waits, undelivered, for
 * the key). The first ask comes `firstAfterMs` after the call.
 */
export async function askForKey(deps: Pick<GuideDeps, 'pet' | 'console'>, keySet: () => boolean, talked: () => boolean, firstAfterMs: number): Promise<void> {
  const t = talker(deps.pet);
  const keys = keyRoutes(deps.console);
  let lastAsk = Date.now() - ASK_AGAIN_MS + firstAfterMs;
  let asked = false;
  while (!keySet()) {
    const since = Date.now() - lastAsk;
    const spoke = talked();
    if (t.connected() && !running && (since >= ASK_AGAIN_MS || (spoke && since >= ASK_TALKED_MS))) {
      const text = !asked ? S.ask.first : spoke ? S.ask.talked : S.ask.again;
      await keyLoop(t.show, keys, deps.pet, { text, actions: ['thinking'], closable: true, input: keyInput(S.askLater) }, S.askLater).catch(() => false);
      asked = true;
      lastAsk = Date.now();
      talked(); // what was said while the bubble was up got its answer there
    }
    await sleep(KEY_POLL_MS);
  }
}
