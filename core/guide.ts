/**
 * The introduction. On the first start Coo sets things up with the person right where it lives,
 * at the bottom of the screen, one step at a time in its bubble (the desktop-pet World's
 * `dialog`); no window opens:
 *
 * 1. hello, what to call the person (the desktop-pet World's `user`), and where they heard of
 *    Coopanion (for the usage statistics; one of the buttons skips it);
 * 2. how lively to be (`roam`): while the cards are up Coo shows each one, standing still,
 *    strolling, or running back and forth;
 * 3. the model service (the services Coo Pet Provider offers, in the order for the app's language,
 *    each card with its logo; the services that take mainland China accounts only behind a "more"
 *    card outside Chinese), the model (the service's cheap default that reads images, or any name
 *    typed in) and the key, saved, tested and made active through the console's own endpoint routes,
 *    on the platform for the language (`defaultRegion`) unless the service is already connected on
 *    the other one;
 * 4. voice input: the speech model is downloaded with one click when it is missing, then how to
 *    talk, with the talk key as a key cap;
 * 5. where the buttons and the menu are, that Coo's persona is in the settings window's
 *    「系统提示词」 page, and where settings live.
 *
 * However it ends, walked through or closed, it calls `onEnd` with the record of what was said in
 * the bubble (an API key shows as typed in, never as itself). Every step has a close button that
 * ends the introduction. The console's 「使用引导」 runs it
 * again (the World's `pet.guide` panel method). Once it has run, a missing key is asked for in the
 * bubble from time to time (`askForKey`), with the key box right there, and each time the person
 * talks to Coo without one, Coo asks whether to connect a model now.
 */
import { existsSync, writeFileSync } from 'node:fs';
import type { DesktopPetWorld, PetDialog, PetDialogAnswer } from 'cortico-world-desktop-pet';
import { VENDOR_ICONS, defaultRegion, localized, siteOf, vendorName, vendorsFor, type Language, type Region, type Vendor } from 'cortico-provider-coo';
import { connectVendor, currentConnection, type ConsoleCall } from 'cortico-provider-coo/src/connect.ts';
import type { ModelLanguage } from './language.ts';

const PET_GROUP = 'world:desktop-pet';
const USER_KEY = 'worlds.desktop-pet.user';
const ROAM_KEY = 'worlds.desktop-pet.roam';
/** The default name for the person: the name box offers it as a placeholder, not as a value. */
const DEFAULT_USER = '伙伴';
/** Names that are only a default (「主人」 was the default before 0.1.2): the name box starts empty for them. */
const DEFAULT_USERS = [DEFAULT_USER, '主人'];
/** Answers to 「你是从哪里认识我的?」 and the ids they are reported as; the last skips. */
const SOURCES: ReadonlyArray<[label: string, id: string]> = [
  ['B站', 'bilibili'], ['小红书', 'xiaohongshu'], ['抖音', 'douyin'], ['GitHub', 'github'], ['朋友推荐', 'friend'], ['其他', 'other'], ['不告诉你', 'skip'],
];
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
  askSource: '你是从哪里认识我的?',
  sourceThanks: '原来是这样,库...',
  askRoam: '平时我该安静一点,还是活泼一点?点一下,看看我会怎样。',
  roam: {
    off: { label: '不乱动', level: '低', line: '那我就乖乖站着,你叫我我再动。', motion: 'still' },
    calm: { label: '多待着', level: '中', line: '我会时不时溜达一圈,大多时候待着。', motion: 'walk' },
    free: { label: '常走动', level: '高', line: '我可以到处跑来跑去,库...!', motion: 'run' },
  } as const,
  roamOk: '就这样',
  roamDone: '好,就按这个来。',

  askVendor: (first: string) => `要和你聊天,我得先连上大模型。用哪一家的?拿不准就选 ${first}。`,
  vendorOk: '就用这家',
  moreVendors: '更多…',
  pickModel: (model: string) => `默认用 ${model},便宜,还能看图。想用别的模型,改成它的名字就行。`,
  modelOk: '就用这个',
  askKey: (name: string) => `把 ${name} 的 API Key 贴在这里吧。按用量计费,注意 token 消耗哦。`,
  keySend: '连接',
  keyLink: (name: string) => `还没有 Key?去${name}申请`,
  keyLater: '稍后再填',
  connecting: '正在连接…',
  keyOk: (name: string, model: string) => `连上 ${name} 了${model ? `(${model})` : ''}!现在我能说话啦,库...`,
  keyFail: (why: string) => `没连上:${why.replace(/[。.!！]+$/, '')}。看看 Key 是不是完整,账户里还有没有余额?再贴一次试试。`,
  keyAlready: (name: string, model: string) => `模型已经连好了(${[name, model].filter(Boolean).join(' · ')}),省事,库...`,
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
  talkType: '也可以把鼠标停在我身上,点旁边的气泡按钮打字。',
  gotIt: '知道了',
  buttons: '鼠标停在我身上,旁边会冒出几个按钮;右键我能打开菜单,暂停、设置和退出都在里面。',
  ok: '好',
  persona: '我是什么性子、怎么说话,都写在设置窗口的「系统提示词」页里。想让我换个样子,可以去那里改;直接告诉我也行,我自己来改。',
  personaOk: '明白了',
  finish: MAC
    ? '都准备好啦!菜单栏里也有我的图标,想改设置点它就行。'
    : process.platform === 'linux'
      ? '都准备好啦!想改设置的话,右键我打开菜单就行;桌面的托盘区里要是有我的图标,点它也可以。'
      : '都准备好啦!任务栏右下角的托盘里也有我的图标,想改设置点它就行。',
  go: '开始吧',
  dress: '先给我换身衣服',
  closed: '好,那先到这儿。想再听我介绍,打开设置,在「开始」页点「使用引导」。',

  ask: {
    first: '我还没连上模型,填好 API Key 我才能和你说话。用哪一家的?',
    again: '还是没连上模型呢,填好 API Key 我才能陪你聊天。用哪一家的?',
  },
  askLater: '等会儿',
  noModel: '当前未接通模型,要去接通模型吗?',
  noModelGo: '去接通',
  noModelLater: '等会儿',
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
  /** The introduction ended, walked through or closed. */
  onEnd?: (end: GuideEnd) => void;
  /** Usage statistics: each step reached, the source answer, a model connected, the voice model download, and how the introduction ended. */
  track?: (type: string, fields: Record<string, unknown>) => void;
  /** The app's language: the order and names of the model services, and which of a service's platforms a new endpoint is on. */
  language: () => Language;
  /** The language of the record's own words (who said a line, a close, a key typed in); Chinese when absent. */
  modelLanguage?: () => ModelLanguage;
}

export interface GuideEnd {
  /** Walked through to the end, not closed early. */
  finished: boolean;
  /** What the person is called; null when it closed before the name was asked. */
  name: string | null;
  /** The last numbered step reached. */
  step: number;
  /** Coo's lines and the person's answers, in order, as they were shown. */
  transcript: string[];
}

/** Ended with the close button: the rest is skipped. */
class Closed extends Error {}

/** The record's own words, in the model-text language; the lines and answers in it are as the bubble showed them. */
const RECORD_TEXT = {
  zh: { coo: (text: string) => `Coo:${text}`, person: (text: string) => `对方:${text}`, closed: '(对方点了关闭,引导到这里结束)', key: '(填了 API Key)' },
  en: { coo: (text: string) => `Coo: ${text}`, person: (text: string) => `Person: ${text}`, closed: '(the person closed it here, which ended the introduction)', key: '(an API key was entered)' },
} satisfies Record<ModelLanguage, unknown>;

/** One step for the record: Coo's line and, when the step asked something, the answer. */
export function noteStep(d: PetDialog, a: PetDialogAnswer, language: ModelLanguage = 'zh'): string[] {
  const r = RECORD_TEXT[language];
  const lines = [r.coo(d.text)];
  const input = d.input;
  if ('closed' in a) lines.push(r.closed);
  else if ('index' in a && (input?.kind === 'buttons' || input?.kind === 'choices')) lines.push(r.person(String(input.options[a.index]?.label ?? a.index)));
  else if ('text' in a) lines.push(r.person(input?.kind === 'text' && input.secret ? r.key : a.text));
  else if ('alt' in a && input?.kind === 'text' && input.alt) lines.push(r.person(input.alt));
  return lines;
}

/** The console's routes, called as the console calls them. */
function api(origin: string): ConsoleCall {
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

interface VoiceState {
  enabled?: boolean;
  engine?: 'funasr' | 'system';
  model?: { phase: 'absent' | 'working' | 'ready' | 'error'; done: number; total: number | null; bytes: number; detail: string | null };
  input?: { effectiveMode?: 'hold' | 'toggle' | 'always'; hint?: string; keyLabel?: string; taps?: number };
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

/** A service's logo as a data URL for a card in the bubble. */
const logo = (v: Vendor) => `data:image/svg+xml;base64,${Buffer.from(VENDOR_ICONS[v.id] ?? '').toString('base64')}`;

/**
 * The service picked on the cards: the services for `language`, and a last card that shows the
 * `more` ones too, which are shown from the start when the service in use is one of them.
 */
async function pickVendor(show: (d: PetDialog, at: string) => Promise<PetDialogAnswer>, ask: Omit<PetDialog, 'input'>, language: Language, current: Vendor | null): Promise<Vendor> {
  const { shown, more } = vendorsFor(language);
  let list = current && more.includes(current) ? [...shown, ...more] : shown;
  for (;;) {
    const folded = list.length < shown.length + more.length;
    const picked = await show({
      ...ask,
      input: {
        kind: 'choices', confirm: S.vendorOk, value: Math.max(0, list.indexOf(current ?? list[0]!)),
        options: [...list.map((v) => ({ label: vendorName(v, language), image: logo(v) })), ...(folded ? [{ label: S.moreVendors }] : [])],
      },
    }, 'vendor');
    if ('closed' in picked) throw new Closed();
    const index = 'index' in picked ? picked.index : 0;
    if (index < list.length) return list[index]!;
    list = [...shown, ...more];
    current = more[0] ?? null;
  }
}

/**
 * Asks which service to use and then for its key, in the bubble, until it connects or the person
 * puts it off; the service once connected, null when put off. `ask` is the question over the
 * service cards; `show` gets each line with its name for the usage statistics (`guide_closed.at`).
 * The service in use stays on its platform; another one goes on the platform for `language`.
 */
async function connectLoop(show: (d: PetDialog, at: string) => Promise<PetDialogAnswer>, call: ConsoleCall, pet: () => DesktopPetWorld | null,
  ask: Omit<PetDialog, 'input'>, later: string, language: Language): Promise<Vendor | null> {
  const current = await currentConnection(call);
  const vendor = await pickVendor(show, ask, language, current.vendor);
  const region = (current.vendor === vendor ? current.region : null) ?? defaultRegion(language);
  const name = vendorName(vendor, language);
  const m = await show({
    ...ask, text: S.pickModel(vendor.model), marks: [vendor.model], actions: ['thinking'],
    input: { kind: 'text', submit: S.modelOk, value: vendor.model, maxLength: 120, suggestions: [vendor.model, ...(vendor.models ?? [])] },
  }, 'model');
  if ('closed' in m) throw new Closed();
  const model = 'text' in m ? m.text.trim() : vendor.model;
  const keyStep = (text: string, actions: string[]): PetDialog => ({ ...ask, text, actions, input: keyInput(vendor, region, language, later) });
  let step = keyStep(S.askKey(name), ['thinking']);
  for (;;) {
    const a = await show(step, 'key');
    if ('closed' in a) throw new Closed();
    if (!('text' in a)) return null;
    // the bar stays up while the key is saved and tested; a page gone meanwhile just misses it
    const wait = pet()?.dialog({ text: S.connecting, actions: ['thinking'], step: ask.step, input: { kind: 'progress' } });
    const r = await connectVendor(call, vendor, a.text, model, region);
    wait?.close();
    if (r.ok) {
      const { model } = await currentConnection(call);
      await show({ ...ask, text: S.keyOk(name, model), marks: [name], actions: ['love', 'jump'] }, 'key-ok');
      return vendor;
    }
    step = keyStep(S.keyFail(r.why ?? '?'), ['sad']);
  }
}

const keyInput = (v: Vendor, region: Region, language: Language, later: string): PetDialog['input'] => ({
  kind: 'text', submit: S.keySend, placeholder: localized(v.keyHint, language), secret: true, maxLength: 200,
  link: { label: S.keyLink(vendorName(v, language)), url: siteOf(v, region).keyUrl }, alt: later,
});

let running = false;

/** Runs the introduction; a second call while it runs does nothing. */
export async function runGuide(deps: GuideDeps): Promise<void> {
  if (running) return;
  running = true;
  const t = talker(deps.pet);
  const call = api(deps.console);
  let reached = 0;
  /** The line on screen, by name: where a close happened. */
  let at = '';
  let name: string | null = null;
  const transcript: string[] = [];
  const step = (n: number, line: string, d: PetDialog): Promise<PetDialogAnswer> => {
    if (n > reached) { reached = n; deps.track?.('guide_step', { step: n }); }
    at = line;
    return t.show({ ...d, step: [n, STEPS], closable: true }).then((a) => {
      transcript.push(...noteStep(d, a, deps.modelLanguage?.() ?? 'zh'));
      if ('closed' in a) throw new Closed();
      return a;
    });
  };
  try {
    // a moment for Coo to land after the window opens
    while (!t.connected()) await sleep(POLL_MS);
    await sleep(1800);
    const values = await call<{ groups?: Array<{ group: { id: string }; values?: Record<string, unknown> }> }>('/api/config')
      .then((d) => d.groups?.find((g) => g.group.id === PET_GROUP)?.values ?? {}).catch(() => ({} as Record<string, unknown>));
    const setPet = (key: string, value: string) => call('/api/config', { group: PET_GROUP, values: { [key]: value } }).catch(() => {});

    // 1 hello, and a name
    await step(1, 'hello', { text: S.hello, marks: ['Coo'], actions: ['happy', 'hop'], input: { kind: 'buttons', options: [{ label: S.helloReply, primary: true }] } });
    const saved = typeof values[USER_KEY] === 'string' ? values[USER_KEY] as string : '';
    const a = await step(1, 'name', {
      text: S.askName, actions: ['thinking'],
      input: { kind: 'text', submit: S.nameSend, placeholder: DEFAULT_USER, value: saved && !DEFAULT_USERS.includes(saved) ? saved : '', maxLength: 20 },
    });
    const named = 'text' in a ? a.text : saved || DEFAULT_USER;
    name = named;
    if (named !== saved) await setPet(USER_KEY, named);
    await step(1, 'name-ok', { text: S.gotName(named), actions: ['love'] });
    const src = await step(1, 'source', {
      text: S.askSource, actions: ['thinking'],
      input: { kind: 'buttons', options: SOURCES.map(([label]) => ({ label })) },
    });
    const source = SOURCES['index' in src ? src.index : SOURCES.length - 1]?.[1] ?? 'skip';
    deps.track?.('source', { answer: source });
    if (source !== 'skip') await step(1, 'source-ok', { text: S.sourceThanks, actions: ['nod'] });

    // 2 how lively: each card plays out while it is picked
    const ORDER: Roam[] = ['off', 'calm', 'free'];
    const cur = ORDER.indexOf(values[ROAM_KEY] as Roam);
    const r = await step(2, 'roam', {
      text: S.askRoam,
      input: {
        kind: 'choices', confirm: S.roamOk, value: cur < 0 ? 1 : cur,
        options: ORDER.map((id) => ({ ...S.roam[id], icon: `roam_${id}` })),
      },
    });
    const roam = ORDER['index' in r ? r.index : 1] ?? 'calm';
    await setPet(ROAM_KEY, roam);
    await step(2, 'roam-ok', { text: S.roamDone, actions: ['nod'] });

    // 3 the model key
    const k = await currentConnection(call);
    const language = deps.language();
    if (k.ready) await step(3, 'key-ready', { text: S.keyAlready(k.vendor ? vendorName(k.vendor, language) : '', k.model), actions: ['happy'] });
    else {
      const ask: Omit<PetDialog, 'input'> = { text: S.askVendor(vendorName(vendorsFor(language).shown[0]!, language)), actions: ['thinking'], step: [3, STEPS] };
      const vendor = await connectLoop((d, line) => step(3, line, d), call, deps.pet, ask, S.keyLater, language);
      if (vendor) deps.track?.('model_connected', { via: 'guide', vendor: vendor.id });
      else await step(3, 'key-later', { text: S.keySkipped, actions: ['sad'] });
    }

    // 4 voice input
    let voice = deps.pet()?.voiceState() as VoiceState | undefined;
    if (voice?.enabled !== false && voice?.engine === 'funasr' && voice.model && voice.model.phase !== 'ready') {
      const mb = Math.round(voice.model.bytes / 1048576);
      const d = await step(4, 'voice-download', {
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
        const ready = voice?.model?.phase === 'ready';
        deps.track?.('voice_model', { result: ready ? 'ready' : 'failed' });
        if (ready) await step(4, 'voice-ready', { text: S.downloaded, actions: ['love', 'hop'] });
        else await step(4, 'voice-failed', { text: S.downloadFail(voice?.model?.detail ?? '?'), actions: ['sad'] });
      } else {
        deps.track?.('voice_model', { result: 'later' });
        await step(4, 'voice-later', { text: S.modelLater });
      }
    }
    // the World words the hint for the key and mode in force; the key cap acts out the taps and the hold
    const on = voice?.enabled !== false && !!voice?.input?.hint;
    const keyed = on && voice?.input?.effectiveMode !== 'always';
    await step(4, 'talk', {
      text: `${on ? S.talk(voice!.input!.hint!) : S.talkOff}${S.talkType}`,
      input: { kind: 'buttons', keys: keyed ? voice?.input?.keyLabel : undefined, taps: voice?.input?.taps, options: [{ label: S.gotIt, primary: true }] },
    });

    // 5 the buttons, the menu, and where settings live
    await step(5, 'buttons', { text: S.buttons, actions: ['wink'], input: { kind: 'buttons', options: [{ label: S.ok, primary: true }] } });
    await step(5, 'persona', { text: S.persona, marks: ['系统提示词'], actions: ['happy'], input: { kind: 'buttons', options: [{ label: S.personaOk, primary: true }] } });
    const end = await step(5, 'finish', { text: S.finish, actions: ['happy'], input: { kind: 'buttons', options: [{ label: S.go, primary: true }, { label: S.dress }] } });
    markDone(deps.doneFile);
    deps.track?.('guide_finished', {});
    deps.onEnd?.({ finished: true, name, step: reached, transcript });
    if ('index' in end && end.index === 1) deps.openDress();
  } catch (err) {
    if (!(err instanceof Closed)) throw err;
    deps.track?.('guide_closed', { step: reached, at });
    markDone(deps.doneFile);
    await t.show({ text: S.closed, actions: ['nod'] });
    transcript.push(RECORD_TEXT[deps.modelLanguage?.() ?? 'zh'].coo(S.closed));
    deps.onEnd?.({ finished: false, name, step: reached, transcript });
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
/** How often the loop looks at the key (it reads the endpoint's `.env`). */
const KEY_POLL_MS = 2000;

/**
 * While no key is set, the pet asks for it in its bubble, with the key box right there, a while
 * after each ask; the first ask comes `firstAfterMs` after the call. Each time the person talks to
 * Coo (what they said waits, undelivered, for the key), Coo first says no model is connected and
 * asks whether to connect one now.
 */
export async function askForKey(deps: Pick<GuideDeps, 'pet' | 'console' | 'track' | 'language'>, keySet: () => boolean, talked: () => boolean, firstAfterMs: number): Promise<void> {
  const t = talker(deps.pet);
  const call = api(deps.console);
  let lastAsk = Date.now() - ASK_AGAIN_MS + firstAfterMs;
  let asked = false;
  const connect = async (text: string, via: string) => {
    const vendor = await connectLoop(t.show, call, deps.pet, { text, actions: ['thinking'], closable: true }, S.askLater, deps.language()).catch(() => null);
    if (vendor) deps.track?.('model_connected', { via, vendor: vendor.id });
  };
  while (!keySet()) {
    const ready = t.connected() && !running;
    if (ready && talked()) {
      const a = await t.show({
        text: S.noModel, actions: ['thinking'], closable: true,
        input: { kind: 'buttons', options: [{ label: S.noModelGo, primary: true }, { label: S.noModelLater }] },
      });
      const go = 'index' in a && a.index === 0;
      deps.track?.('key_prompt', { answer: go ? 'connect' : 'later' });
      if (go) await connect(S.askVendor(vendorName(vendorsFor(deps.language()).shown[0]!, deps.language())), 'prompt');
    } else if (ready && Date.now() - lastAsk >= ASK_AGAIN_MS) {
      await connect(asked ? S.ask.again : S.ask.first, 'ask');
    } else {
      await sleep(KEY_POLL_MS);
      continue;
    }
    asked = true;
    lastAsk = Date.now();
    talked(); // what was said while the bubble was up got its answer there
  }
}
