/**
 * The introduction. On the first start Coo sets things up with the person right where it lives,
 * at the bottom of the screen, one step at a time in its bubble (the desktop-pet World's
 * `dialog`); no window opens:
 *
 * 0. the app language: Coo calls out in no language, each card says hello in a language over its name, and the
 *    language in force is picked (the system's on a first start); the rest speaks the one picked;
 * 1. hello, what to call the person (the desktop-pet World's `user`), and where they heard of
 *    Coopanion (for the usage statistics; one of the buttons skips it);
 * 2. how lively to be (`roam`): while the cards are up Coo shows each one, standing still,
 *    strolling, or running back and forth;
 * 3. the response mode (`touch.wakeOn`): quiet, default or eager, each card with a line on what it does;
 * 4. the model service (the services Coo Pet Provider offers, in the order for the app's language,
 *    each card with its logo; the services that take mainland China accounts only behind a "more"
 *    card outside Chinese), the model (the service's cheap default that reads images, or any name
 *    typed in) and the key, saved, tested and made active through the console's own endpoint routes,
 *    on the platform for the language (`defaultRegion`) unless the service is already connected on
 *    the other one;
 * 5. voice input: the speech model of the engine in force (FunASR or Whisper, by the app language)
 *    is downloaded with one click when it is missing, then how to talk, with the talk key as a key cap;
 * 6. where the buttons and the menu are, that Coo's persona is in the settings window's
 *    「系统提示词」 page, and where settings live.
 *
 * However it ends, walked through or closed, it calls `onEnd` with the record of what was said in
 * the bubble (an API key shows as typed in, never as itself). Every step has a close button that
 * ends the introduction. The console's 「使用向导」 runs it
 * again (the World's `pet.guide` panel method). Once it has run, a missing key is asked for in the
 * bubble from time to time (`askForKey`), with the key box right there, and each time the person
 * talks to Coo without one, Coo asks whether to connect a model now.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { LANGUAGES, LANGUAGE_NAMES, type Language } from 'cortico/core/language.ts';
import type { DesktopPetWorld, PetDialog, PetDialogAnswer, PetDialogHandle } from 'cortico-world-desktop-pet';
import { USER_MAX, capFor, petText } from 'cortico-world-desktop-pet';
import { VENDOR_ICONS, defaultRegion, localized, siteOf, vendorName, vendorsFor, type Region, type Vendor } from 'cortico-provider-coo';
import { connectVendor, currentConnection, type ConsoleCall } from 'cortico-provider-coo/src/connect.ts';
import { coreText } from './i18n/index.ts';
import type { ModelLanguage } from './language.ts';

const PET_GROUP = 'world:desktop-pet';
/** The app's own settings group, where the app language is (`language`), as the 「习惯」 page saves it. */
const APP_GROUP = 'companion';
const USER_KEY = 'worlds.desktop-pet.user';
const ROAM_KEY = 'worlds.desktop-pet.roam';
const WAKE_KEY = 'worlds.desktop-pet.touch.wakeOn';
/**
 * The default names of earlier versions (「主人」 up to 0.1.1, 「伙伴」 up to 0.1.19): the name box starts empty
 * for them, with the app language's default name (the desktop-pet World's) as its placeholder.
 */
const OLD_DEFAULT_USERS = ['伙伴', '主人'];
/** How Coo moves while each liveliness card is picked. */
const MOTIONS = { off: 'still', calm: 'walk', free: 'run' } as const;
/** Sentence-ending marks a reason comes with, taken off before it goes into a line of the introduction. */
const trimEnd = (text: string) => text.replace(/[\s.!?。．！？]+$/, '');
/** Steps, for the dots at the top of the bubble: the language page (step 0) and the six numbered ones. */
const STEPS = 7;
/**
 * The language page's words: Coo's call in no language, before any line in the language picked, and a check
 * button. Not in core/i18n, since they never follow the app language.
 */
const LANGUAGE_PAGE = { ask: 'Coo! Coo...?', ok: '✓' };
/** Each language's card says hello in it. */
const GREETINGS: Readonly<Record<Language, string>> = {
  zh: '你好！', 'zh-Hant': '哈囉！', en: 'Hello!', ja: 'こんにちは！', ko: '안녕하세요!', fr: 'Bonjour !',
  de: 'Hallo!', 'es-419': '¡Hola!', 'pt-BR': 'Olá!', it: 'Ciao!', ru: 'Привет!',
};
/** A language's card: hello in it, and its name, without the region (「Español (Latinoamérica)」), as the only Spanish and the only Portuguese offered, below. */
const languageCard = (code: Language) => ({ label: GREETINGS[code], note: LANGUAGE_NAMES[code].replace(/\s*\(.+\)$/, '') });
/** How often a step waiting for the pet page looks again, and a download for its progress. */
const POLL_MS = 500;

type Roam = 'off' | 'calm' | 'free';
/** The response modes the introduction offers, in their order; `custom` is the Habits page's. */
type Wake = 'none' | 'poke' | 'all';

/** The introduction's lines in the app language. */
const lines = (language: Language) => coreText(language).guide;

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
  /** The app's language: the lines, the order and names of the model services, and which of a service's platforms a new endpoint is on. Read at each step. */
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
  en: { coo: (text: string) => `Coo: ${text}`, person: (text: string) => `Person: ${text}`, closed: '(the person closed it here, which ended the introduction)', key: '(an API Key was entered)' },
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

/** The console's routes, called as the console calls them; receipts and errors come back in `language`. */
function api(origin: string, language: () => Language): ConsoleCall {
  const call = async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', 'x-cortico-language': language() },
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
  engine?: 'funasr' | 'whisper' | 'system';
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
/** The 「more」 card's picture: a plus drawn like the logos (the page sets it on the same white tile), so the card lines up with them. */
const MORE_ICON = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>').toString('base64')}`;

/**
 * The service picked on the cards: the services for `language`, and a last card that unfolds the
 * `more` ones in the bubble, which are shown from the start when the service in use is one of them.
 */
async function pickVendor(show: (d: PetDialog, at: string) => Promise<PetDialogAnswer>, ask: Omit<PetDialog, 'input'>, language: Language, current: Vendor | null): Promise<Vendor> {
  const S = lines(language);
  const { shown, more } = vendorsFor(language);
  const list = [...shown, ...more];
  const card = (v: Vendor) => ({ label: vendorName(v, language), image: logo(v) });
  const picked = await show({
    ...ask,
    input: {
      kind: 'choices', confirm: S.vendorOk, value: Math.max(0, list.indexOf(current ?? list[0]!)),
      options: shown.map(card), ...(more.length ? { more: { label: S.moreVendors, image: MORE_ICON, options: more.map(card) } } : {}),
    },
  }, 'vendor');
  if ('closed' in picked) throw new Closed();
  return list['index' in picked ? picked.index : 0]!;
}

/**
 * Asks which service to use and then for its key, in the bubble, until it connects or the person
 * puts it off; the service once connected, null when put off. `ask` is the question over the
 * service cards; `show` gets each line with its name for the usage statistics (`guide_closed.at`).
 * The service in use stays on its platform; another one goes on the platform for `language`.
 */
async function connectLoop(show: (d: PetDialog, at: string) => Promise<PetDialogAnswer>, call: ConsoleCall, pet: () => DesktopPetWorld | null,
  ask: Omit<PetDialog, 'input'>, later: string, language: Language): Promise<Vendor | null> {
  const S = lines(language);
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
    step = keyStep(S.keyFail(trimEnd(r.why ?? '?')), ['sad']);
  }
}

const keyInput = (v: Vendor, region: Region, language: Language, later: string): PetDialog['input'] => ({
  kind: 'text', submit: lines(language).keySend, placeholder: localized(v.keyHint, language), secret: true, maxLength: 200,
  link: { label: lines(language).keyLink(vendorName(v, language)), url: siteOf(v, region).keyUrl }, alt: later,
});

let running = false;
/** askForKey's bubble while it is up; the introduction closes it when it starts. */
let asking: PetDialogHandle | null = null;

/** Runs the introduction; a second call while it runs does nothing. */
export async function runGuide(deps: GuideDeps): Promise<void> {
  if (running) return;
  running = true;
  asking?.close();
  const t = talker(deps.pet);
  const call = api(deps.console, deps.language);
  let reached = 0;
  /** The line on screen, by name: where a close happened. */
  let at = '';
  let name: string | null = null;
  const transcript: string[] = [];
  const step = (n: number, line: string, d: PetDialog): Promise<PetDialogAnswer> => {
    if (n > reached) { reached = n; deps.track?.('guide_step', { step: n }); }
    at = line;
    // step 0, the language page, is the first dot; the numbers the statistics count (guide_step) stay as they were
    return t.show({ ...d, step: [n + 1, STEPS], closable: true }).then((a) => {
      transcript.push(...noteStep(d, a, deps.modelLanguage?.() ?? 'zh'));
      if ('closed' in a) throw new Closed();
      return a;
    });
  };
  try {
    // a moment for Coo to land after the window opens
    while (!t.connected()) await sleep(POLL_MS);
    await sleep(1800);
    // 0 the language
    const current = deps.language();
    const l = await step(0, 'language', {
      text: LANGUAGE_PAGE.ask, marks: [LANGUAGE_PAGE.ask], actions: ['happy'],
      input: { kind: 'choices', confirm: LANGUAGE_PAGE.ok, value: LANGUAGES.indexOf(current), options: LANGUAGES.map(languageCard) },
    });
    const picked = 'index' in l ? LANGUAGES[l.index]! : current;
    // the config API writes the live config before it answers; a failed write leaves the language as it was
    if (picked !== current) await call('/api/config', { group: APP_GROUP, values: { language: picked } }).catch(() => {});
    // the language picked holds to the introduction's end
    const language = deps.language();
    const S = lines(language);
    const defaultName = petText(language).defaultUser;
    const values = await call<{ groups?: Array<{ group: { id: string }; values?: Record<string, unknown> }> }>('/api/config')
      .then((d) => d.groups?.find((g) => g.group.id === PET_GROUP)?.values ?? {}).catch(() => ({} as Record<string, unknown>));
    const setPet = (key: string, value: string) => call('/api/config', { group: PET_GROUP, values: { [key]: value } }).catch(() => {});

    // 1 hello, and a name
    await step(1, 'hello', { text: S.hello, marks: ['Coo'], actions: ['happy', 'hop'], input: { kind: 'buttons', options: [{ label: S.helloReply, primary: true }] } });
    const saved = typeof values[USER_KEY] === 'string' ? values[USER_KEY] as string : '';
    const a = await step(1, 'name', {
      text: S.askName, actions: ['thinking'],
      input: { kind: 'text', submit: S.nameSend, placeholder: defaultName, value: saved && !OLD_DEFAULT_USERS.includes(saved) ? saved : '', maxLength: capFor(USER_MAX, language) },
    });
    const named = 'text' in a ? a.text : saved || defaultName;
    name = named;
    if (named !== saved) await setPet(USER_KEY, named);
    await step(1, 'name-ok', { text: S.gotName(named), actions: ['love'] });
    const src = await step(1, 'source', {
      text: S.askSource, actions: ['thinking'],
      input: { kind: 'buttons', options: S.sources.map(([label]) => ({ label })) },
    });
    const source = S.sources['index' in src ? src.index : S.sources.length - 1]?.[1] ?? 'skip';
    deps.track?.('source', { answer: source });
    if (source !== 'skip') await step(1, 'source-ok', { text: S.sourceThanks, actions: ['nod'] });

    // 2 how lively: each card plays out while it is picked
    const ORDER: Roam[] = ['off', 'calm', 'free'];
    const cur = ORDER.indexOf(values[ROAM_KEY] as Roam);
    const r = await step(2, 'roam', {
      text: S.askRoam,
      input: {
        kind: 'choices', confirm: S.roamOk, value: cur < 0 ? 1 : cur,
        options: ORDER.map((id) => ({ ...S.roam[id], motion: MOTIONS[id], icon: `roam_${id}` })),
      },
    });
    const roam = ORDER['index' in r ? r.index : 1] ?? 'calm';
    await setPet(ROAM_KEY, roam);
    await step(2, 'roam-ok', { text: S.roamDone, actions: ['nod'] });

    // 3 the response mode
    const WAKES: Wake[] = ['none', 'poke', 'all'];
    const wakeNow = WAKES.indexOf(values[WAKE_KEY] as Wake);
    const w = await step(3, 'wake', {
      text: S.askWake, marks: [S.wakeTitle], actions: ['thinking'],
      input: { kind: 'choices', confirm: S.roamOk, value: wakeNow < 0 ? 1 : wakeNow, options: WAKES.map((id) => S.wake[id]) },
    });
    const wake = WAKES['index' in w ? w.index : 1] ?? 'poke';
    if (wake !== values[WAKE_KEY]) await setPet(WAKE_KEY, wake);
    await step(3, 'wake-ok', { text: S.roamDone, actions: ['nod'] });

    // 4 the model key
    const k = await currentConnection(call);
    if (k.ready) await step(4, 'key-ready', { text: S.keyAlready([k.vendor ? vendorName(k.vendor, language) : '', k.model].filter(Boolean).join(' · ')), actions: ['happy'] });
    else {
      const ask: Omit<PetDialog, 'input'> = { text: S.askVendor(vendorName(vendorsFor(language).shown[0]!, language)), actions: ['thinking'], step: [5, STEPS] };
      const vendor = await connectLoop((d, line) => step(4, line, d), call, deps.pet, ask, S.keyLater, language);
      if (vendor) deps.track?.('model_connected', { via: 'guide', vendor: vendor.id });
      else await step(4, 'key-later', { text: S.keySkipped, actions: ['sad'] });
    }

    // 5 voice input
    let voice = deps.pet()?.voiceState() as VoiceState | undefined;
    if (voice?.enabled !== false && (voice?.engine === 'funasr' || voice?.engine === 'whisper') && voice.model && voice.model.phase !== 'ready') {
      const mb = Math.round(voice.model.bytes / 1048576);
      const d = await step(5, 'voice-download', {
        text: S.askModel(voice.engine === 'whisper' ? 'Whisper' : 'FunASR', mb), actions: ['thinking'],
        input: { kind: 'buttons', options: [{ label: S.download, primary: true }, { label: S.notNow }] },
      });
      if ('index' in d && d.index === 0) {
        const bar = deps.pet()?.dialog({ text: S.downloading, step: [6, STEPS], input: { kind: 'progress', label: `${mb} MB` } });
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
        if (ready) await step(5, 'voice-ready', { text: S.downloaded, actions: ['love', 'hop'] });
        else await step(5, 'voice-failed', { text: S.downloadFail(voice?.model?.detail ?? '?'), actions: ['sad'] });
      } else {
        deps.track?.('voice_model', { result: 'later' });
        await step(5, 'voice-later', { text: S.modelLater });
      }
    }
    // the World words the hint for the key and mode in force; the key cap acts out the taps and the hold
    const on = voice?.enabled !== false && !!voice?.input?.hint;
    const keyed = on && voice?.input?.effectiveMode !== 'always';
    await step(5, 'talk', {
      text: `${on ? S.talk(voice!.input!.hint!) : S.talkOff}${S.talkType}`,
      input: { kind: 'buttons', keys: keyed ? voice?.input?.keyLabel : undefined, taps: voice?.input?.taps, options: [{ label: S.gotIt, primary: true }] },
    });

    // 6 the buttons, the menu, and where settings live
    await step(6, 'buttons', { text: S.buttons, actions: ['wink'], input: { kind: 'buttons', options: [{ label: S.ok, primary: true }] } });
    await step(6, 'persona', { text: S.persona, marks: [S.personaMark], actions: ['happy'], input: { kind: 'buttons', options: [{ label: S.personaOk, primary: true }] } });
    const end = await step(6, 'finish', { text: S.finish, actions: ['happy'], input: { kind: 'buttons', options: [{ label: S.go, primary: true }, { label: S.dress }] } });
    markDone(deps.doneFile);
    deps.track?.('guide_finished', {});
    deps.onEnd?.({ finished: true, name, step: reached, transcript });
    if ('index' in end && end.index === 1) deps.openDress();
  } catch (err) {
    if (!(err instanceof Closed)) throw err;
    deps.track?.('guide_closed', { step: reached, at });
    markDone(deps.doneFile);
    const closed = lines(deps.language()).closed;
    await t.show({ text: closed, actions: ['nod'] });
    transcript.push(RECORD_TEXT[deps.modelLanguage?.() ?? 'zh'].coo(closed));
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
  const call = api(deps.console, deps.language);
  let lastAsk = Date.now() - ASK_AGAIN_MS + firstAfterMs;
  let asked = false;
  /**
   * Its bubbles step aside for the introduction (the console's 「使用向导」 can start it while one is up): none
   * opens while it runs, and runGuide closes the one up; either way the ask ends with Closed.
   */
  const show = async (d: PetDialog): Promise<Exclude<PetDialogAnswer, { unavailable: true }>> => {
    for (;;) {
      while (!running && !t.connected()) await sleep(POLL_MS);
      if (running) throw new Closed();
      asking = deps.pet()!.dialog(d);
      const a = await asking.answer;
      asking = null;
      if (running) throw new Closed();
      if (!('unavailable' in a)) return a;
      await sleep(POLL_MS);
    }
  };
  const connect = async (text: string, via: string) => {
    // a failed call ends this ask only; the introduction taking over ends it too, and the loop waits for it
    const vendor = await connectLoop(show, call, deps.pet, { text, actions: ['thinking'], closable: true }, lines(deps.language()).askLater, deps.language())
      .catch((err: unknown) => { if (err instanceof Closed) throw err; return null; });
    if (vendor) deps.track?.('model_connected', { via, vendor: vendor.id });
  };
  while (!keySet()) {
    const ready = t.connected() && !running;
    const S = lines(deps.language());
    try {
      if (ready && talked()) {
        const a = await show({
          text: S.noModel, actions: ['thinking'], closable: true,
          input: { kind: 'buttons', options: [{ label: S.noModelGo, primary: true }, { label: S.noModelLater }] },
        });
        const go = 'index' in a && a.index === 0;
        deps.track?.('key_prompt', { answer: go ? 'connect' : 'later' });
        if (go) await connect(S.askVendor(vendorName(vendorsFor(deps.language()).shown[0]!, deps.language())), 'prompt');
      } else if (ready && Date.now() - lastAsk >= ASK_AGAIN_MS) {
        await connect(asked ? S.askAgain : S.askFirst, 'ask');
      } else {
        await sleep(KEY_POLL_MS);
        continue;
      }
    } catch (err) {
      if (!(err instanceof Closed)) throw err;
      // the introduction took over (it asks for the key itself): the next ask waits a full while after it;
      // closed by the person, it counts as an ask like any other
      if (running) {
        while (running) await sleep(KEY_POLL_MS);
        lastAsk = Date.now();
        continue;
      }
    }
    asked = true;
    lastAsk = Date.now();
    talked(); // what was said while the bubble was up got its answer there
  }
}
