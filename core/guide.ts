/**
 * The introduction. On the first start Coo sets things up with the person right where it lives,
 * at the bottom of the screen, one step at a time in its bubble (the desktop-pet World's
 * `dialog`); no window opens:
 *
 * 0. the app language: Coo calls out in no language, each card says hello in a language over its name, and the
 *    language in force is picked (the system's on a first start); the rest speaks the one picked;
 * 1. hello, what to call the person (the desktop-pet World's `user`), and where they heard of
 *    Coopanion (for the usage statistics; one of the buttons skips it);
 * 2. who Coo is, while its self-description is still one the app ships (`seed.ts` PERSONAS, the whale's on the
 *    GitHub build only): each card dresses Coo in its colours while it is picked and has Coo say a line in that
 *    voice; the pick becomes the self-description (the prefix is reloaded) and the look, which the dressing page changes later;
 * 3. how lively to be (`roam`): while the cards are up Coo shows each one, standing still,
 *    strolling, or running back and forth;
 * 4. the response mode (`touch.wakeOn`): quiet, default or eager, each card with a line on what it does;
 * 5. the model service (the services Coo Pet Provider offers, in the order for the app's language,
 *    each card with its logo; the services that take mainland China accounts only behind a "more"
 *    card outside Chinese), the model (the service's cheap default that reads images, or any name
 *    typed in) and the key, saved, tested and made active through the WebUI endpoint routes,
 *    on the platform for the language (`defaultRegion`) unless the service is already connected on
 *    the other one; a ChatGPT plan is signed in in the system browser instead of the model and key;
 * 6. voice input: the speech model of the engine in force (FunASR or Whisper, by the app language)
 *    is downloaded with one click when it is missing, then how to talk, with the talk key as a key cap;
 * 7. the hover buttons, picked on cards (up to the World's MAX_HOVER_BUTTONS): the right-click menu shows the same ones
 *    and the run controls; that Coo's persona is in the settings window's
 *    「系统提示词」 page, and where settings live.
 *
 * However it ends, walked through or closed, it calls `onEnd` with the record of what was said in
 * the bubble (an API key shows as typed in, never as itself). Every step has a close button that
 * ends the introduction, and every question after the language page a back button (`walk`): the question before
 * shows again with what it was answered with, and what is answered from there on is what holds. A speech model
 * downloaded meanwhile is shown as there and not downloaded again. The console's 「使用向导」 runs it
 * again (the World's `pet.guide` panel method). Once it has run, a missing key is asked for in the
 * bubble from time to time (`askForKey`), with the key box right there, and each time the person
 * talks to Coo without one, Coo asks whether to connect a model now.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { LANGUAGES, LANGUAGE_NAMES, type Language } from 'cortico/core/language.ts';
import type { DesktopPetWorld, PetDialog, PetDialogAnswer, PetDialogHandle, PetDialogInput } from 'cortico-world-desktop-pet';
import { MAX_HOVER_BUTTONS, PET_ACTIONS, USER_MAX, capFor, hoverButtonList, petText, type PetAction } from 'cortico-world-desktop-pet';
import { VENDOR_ICONS, defaultRegion, localized, siteOf, vendorName, vendorsFor, type Vendor } from 'cortico-provider-coo';
import { connectChatGPT, connectVendor, currentConnection, type Connection, type WebUiCall } from 'cortico-provider-coo/src/connect.ts';
import { signInReason } from 'cortico-provider-coo/src/strings.ts';
import { coreText } from './i18n/index.ts';
import type { ModelLanguage } from './language.ts';
import { PERSONAS, applyPersona, personaOf, type PersonaId } from './seed.ts';

const PET_GROUP = 'world:desktop-pet';
/** The app's own settings group, where the app language is (`language`), as the 「习惯」 page saves it. */
const APP_GROUP = 'companion';
const USER_KEY = 'worlds.desktop-pet.user';
const ROAM_KEY = 'worlds.desktop-pet.roam';
const WAKE_KEY = 'worlds.desktop-pet.touch.wakeOn';
const HOVER_KEY = 'worlds.desktop-pet.hoverButtons';
/** Each action's card icon on the hover-button page, the icon its button wears (web/ui.js `ICONS`). */
const ACTION_ICONS: Record<PetAction, string> = { chat: 'chat', voice: 'mic', roam: 'roam_calm', theme: 'moon', sound: 'sound', hide: 'eyeOff', size: 'resize', dress: 'shirt', worlds: 'boxes' };
/**
 * The default names of earlier versions (「主人」 up to 0.1.1, 「伙伴」 up to 0.1.19): the name box starts empty
 * for them, with the app language's default name (the desktop-pet World's) as its placeholder.
 */
const OLD_DEFAULT_USERS = ['伙伴', '主人'];
/** How Coo moves while each liveliness card is picked. */
const MOTIONS = { off: 'still', calm: 'walk', free: 'run' } as const;
/**
 * How each persona's card shows it: what Coo does when it is picked and the look it wears, Coo in a palette of its
 * own (the four after Cultist Simulator's principles are named for them on the dressing page) or the whale.
 */
const PERSONA_LOOKS: Record<PersonaId, { act: string; skin: { figure: string; palette?: string } }> = {
  coo: { act: 'look', skin: { figure: 'coo', palette: 'mint' } },
  grail: { act: 'love', skin: { figure: 'coo', palette: 'grail' } },
  forge: { act: 'nod', skin: { figure: 'coo', palette: 'forge' } },
  heart: { act: 'hop', skin: { figure: 'coo', palette: 'heart' } },
  winter: { act: 'sit', skin: { figure: 'coo', palette: 'winter' } },
  whale: { act: 'happy', skin: { figure: 'whale' } },
};
/** The whale card's icon colour, DeepSeek's blue; the others take their palette's. */
const WHALE_TINT = { light: '#4D6BFE', dark: '#7B93FF' };
/** Sentence-ending marks a reason comes with, taken off before it goes into a line of the introduction. */
const trimEnd = (text: string) => text.replace(/[\s.!?。．！？]+$/, '');
/** Steps, for the dots at the top of the bubble: the language page (step 0) and the seven numbered ones. */
const STEPS = 8;
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
const ROAMS: Roam[] = ['off', 'calm', 'free'];
/** The response modes the introduction offers, in their order; `custom` is the Habits page's. */
type Wake = 'none' | 'poke' | 'all';
const WAKES: Wake[] = ['none', 'poke', 'all'];

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
  /** Coo's workspace, where the persona picked is written. */
  workspace: string;
  /** The whale's persona is offered (the GitHub build). */
  whale: boolean;
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
  zh: { coo: (text: string) => `Coo:${text}`, person: (text: string) => `对方:${text}`, closed: '(对方点了关闭,引导到这里结束)', back: '(对方点了上一步)', key: '(填了 API Key)' },
  en: { coo: (text: string) => `Coo: ${text}`, person: (text: string) => `Person: ${text}`, closed: '(the person closed it here, which ended the introduction)', back: '(the person went back a step)', key: '(an API Key was entered)' },
} satisfies Record<ModelLanguage, unknown>;

/** One step for the record: Coo's line and, when the step asked something, the answer. */
export function noteStep(d: PetDialog, a: PetDialogAnswer, language: ModelLanguage = 'zh'): string[] {
  const r = RECORD_TEXT[language];
  const lines = [r.coo(d.text)];
  const input = d.input;
  if ('closed' in a) lines.push(r.closed);
  else if ('back' in a) lines.push(r.back);
  else if ('index' in a && (input?.kind === 'buttons' || input?.kind === 'choices')) lines.push(r.person(String(input.options[a.index]?.label ?? a.index)));
  else if ('picked' in a && input?.kind === 'pick') lines.push(r.person(a.picked.map((i) => input.options[i]?.label ?? i).join(', ')));
  else if ('text' in a) lines.push(r.person(input?.kind === 'text' && input.secret ? r.key : a.text));
  else if ('alt' in a && input?.kind === 'text' && input.alt) lines.push(r.person(input.alt));
  return lines;
}

/** The WebUI routes, called as the settings window calls them; receipts and errors come back in `language`. */
function api(origin: string, language: () => Language): WebUiCall {
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
  input?: { mode?: 'hold' | 'toggle' | 'always'; hint?: string; keyLabel?: string; taps?: number };
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
 * How a page of a walk ended: answered, which the back button can return to; passed, not shown or shown with
 * nothing to answer; or with the back button.
 */
type Turn = 'answered' | 'passed' | 'back';
/** A page of a walk; `back` labels its back button, absent while there is no page to return to. */
type Page = (back: string | undefined) => Promise<Turn>;

/**
 * Runs `pages` in order. The back button runs the last page answered again, and the pages after it from there: a
 * page shows what it was answered with before, and its new answer is the one that holds. `back()` is the button's
 * label; without it no page offers one.
 */
async function walk(pages: Page[], back?: () => string): Promise<void> {
  const trail: number[] = [];
  for (let i = 0; i < pages.length;) {
    const turn = await pages[i]!(back && trail.length ? back() : undefined);
    if (turn === 'back') { i = trail.pop()!; continue; }
    if (turn === 'answered') trail.push(i);
    i++;
  }
}

/** What the pages that connect a service were answered with, shown again when the back button returns to them. */
interface ConnectState {
  /** The connection as the service cards last found it: the service in use stays on its platform. */
  current: Connection | null;
  vendor: Vendor | null;
  model: { vendor: Vendor; name: string } | null;
  key: { vendor: Vendor; text: string } | null;
  /** The service connected the last time through the pages, null when it was put off. */
  connected: Vendor | null;
}

/**
 * The pages, for `walk`, that ask in the bubble which service to use and then for its model and key, or for a
 * ChatGPT sign-in, until it connects or the person puts it off. The service cards are the services for the language
 * and a last card that unfolds the `more` ones, shown from the start when the service in use is one of them. `ask`
 * is the question over the cards and `later` the answer that puts it off, both read as each page shows; `show` gets
 * each line with its name for the usage statistics (`guide_closed.at`); `onConnected` hears of each service
 * connected. The service in use stays on its platform; another one goes on the platform for the language.
 */
function connectPages(show: (d: PetDialog, at: string) => Promise<PetDialogAnswer>, call: WebUiCall, pet: () => DesktopPetWorld | null,
  ask: () => Omit<PetDialog, 'input'>, later: () => string, language: () => Language, onConnected: (vendor: Vendor) => void): { pages: Page[]; state: ConnectState } {
  const s: ConnectState = { current: null, vendor: null, model: null, key: null, connected: null };
  const card = (v: Vendor) => ({ label: vendorName(v, language()), image: logo(v) });
  const connected = async (vendor: Vendor) => {
    const { model } = await currentConnection(call);
    const name = vendorName(vendor, language());
    await show({ ...ask(), text: lines(language()).keyOk(name, model), marks: [name], actions: ['love', 'jump'] }, 'key-ok');
    s.connected = vendor;
    onConnected(vendor);
  };

  const vendorPage: Page = async (back) => {
    const S = lines(language());
    const { shown, more } = vendorsFor(language());
    const list = [...shown, ...more];
    s.current = await currentConnection(call);
    const picked = await show({
      ...ask(), back,
      input: {
        kind: 'choices', confirm: S.vendorOk, value: Math.max(0, list.indexOf(s.vendor ?? s.current.vendor ?? list[0]!)),
        options: shown.map(card), ...(more.length ? { more: { label: S.moreVendors, image: MORE_ICON, options: more.map(card) } } : {}),
      },
    }, 'vendor');
    if ('closed' in picked) throw new Closed();
    if ('back' in picked) return 'back';
    s.vendor = list['index' in picked ? picked.index : 0]!;
    return 'answered';
  };

  const modelPage: Page = async (back) => {
    const v = s.vendor!;
    if (v.signIn) return 'passed';
    const S = lines(language());
    const m = await show({
      ...ask(), text: S.pickModel(v.model), marks: [v.model], actions: ['thinking'], back,
      input: { kind: 'text', submit: S.modelOk, value: s.model?.vendor === v ? s.model.name : v.model, maxLength: 120, suggestions: [v.model, ...(v.models ?? [])] },
    }, 'model');
    if ('closed' in m) throw new Closed();
    if ('back' in m) return 'back';
    s.model = { vendor: v, name: 'text' in m ? m.text.trim() : v.model };
    return 'answered';
  };

  const keyPage: Page = async (back) => {
    const v = s.vendor!;
    if (v.signIn) return 'passed';
    const S = lines(language());
    const name = vendorName(v, language());
    const region = (s.current?.vendor === v ? s.current.region : null) ?? defaultRegion(language());
    const box: Extract<PetDialogInput, { kind: 'text' }> = {
      kind: 'text', submit: S.keySend, placeholder: localized(v.keyHint, language()), secret: true, maxLength: 200,
      link: { label: S.keyLink(name), url: siteOf(v, region).keyUrl }, alt: later(),
    };
    let line: PetDialog = { ...ask(), text: S.askKey(name), actions: ['thinking'], back, input: { ...box, value: s.key?.vendor === v ? s.key.text : undefined } };
    for (;;) {
      const a = await show(line, 'key');
      if ('closed' in a) throw new Closed();
      if ('back' in a) return 'back';
      if (!('text' in a)) { s.connected = null; return 'answered'; }
      s.key = { vendor: v, text: a.text };
      // the bar stays up while the key is saved and tested; a page gone meanwhile just misses it
      const wait = pet()?.dialog({ text: S.connecting, actions: ['thinking'], step: line.step, input: { kind: 'progress' } });
      const r = await connectVendor(call, v, a.text, s.model!.name, region);
      wait?.close();
      if (r.ok) { await connected(v); return 'answered'; }
      line = { ...line, text: S.keyFail(trimEnd(r.why ?? '?')), actions: ['sad'], input: box };
    }
  };

  /**
   * A ChatGPT plan: the button sends the sign-in page to the system browser (through the app's main process), and a
   * bar waits in the bubble until the browser comes back; closing the bar stops the wait.
   */
  const signInPage: Page = async (back) => {
    const v = s.vendor!;
    if (!v.signIn) return 'passed';
    const S = lines(language());
    let line: PetDialog = { ...ask(), text: S.chatgptAsk, actions: ['thinking'], back, input: { kind: 'buttons', options: [{ label: S.chatgptGo, primary: true }, { label: later() }] } };
    for (;;) {
      const a = await show(line, 'sign-in');
      if ('closed' in a) throw new Closed();
      if ('back' in a) return 'back';
      if (!('index' in a) || a.index !== 0) { s.connected = null; return 'answered'; }
      const stop = new AbortController();
      const wait = pet()?.dialog({ text: S.chatgptWaiting, actions: ['thinking'], step: line.step, closable: true, input: { kind: 'progress' } });
      void wait?.answer.then((w) => { if ('closed' in w) stop.abort(); });
      const r = await connectChatGPT(call, (url) => process.send?.({ type: 'companion:browse', url }), { signal: stop.signal });
      wait?.close();
      if (r.ok) { await connected(v); return 'answered'; }
      if (!stop.signal.aborted) line = { ...line, text: S.chatgptFail(trimEnd(signInReason(r.why ?? '?', language()))), actions: ['sad'] };
    }
  };

  return { pages: [vendorPage, modelPage, keyPage, signInPage], state: s };
}

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
  /** The answers the statistics count, one of each type, sent when the introduction ends: answering again after the back button replaces it. */
  const answers = new Map<string, Record<string, unknown>>();
  const answer = (type: string, fields: Record<string, unknown>) => { answers.set(type, fields); };
  const sendAnswers = () => {
    for (const [type, fields] of answers) deps.track?.(type, fields);
    answers.clear();
  };
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
    /** The language picked on the language page, which holds to the introduction's end, and its lines. */
    let language = deps.language();
    let S = lines(language);
    /** The pet's settings as read here and as the introduction then sets them. */
    const values = await call<{ groups?: Array<{ group: { id: string }; values?: Record<string, unknown> }> }>('/api/config')
      .then((d) => d.groups?.find((g) => g.group.id === PET_GROUP)?.values ?? {}).catch(() => ({} as Record<string, unknown>));
    const setPet = async (key: string, value: string) => {
      values[key] = value;
      await call('/api/config', { group: PET_GROUP, values: { [key]: value } }).catch(() => {});
    };
    const answered = (a: PetDialogAnswer): Turn => ('back' in a ? 'back' : 'answered');
    /** The source answered, drawn as the main button when the back button shows the page again. */
    let source: string | null = null;
    /** A model was connected when the introduction first reached step 5, and still is: the step only says so. */
    let keyReady: boolean | null = null;
    /** The speech model download was offered: once the model is there, the page shows that it is. */
    let voiceOffered = false;
    let dress = false;
    const connect = connectPages((d, line) => step(5, line, d), call, deps.pet,
      () => ({ text: S.askVendor(vendorName(vendorsFor(language).shown[0]!, language)), actions: ['thinking'], step: [6, STEPS] }),
      () => S.keyLater, () => language, (vendor) => answer('model_connected', { via: 'guide', vendor: vendor.id }));
    const keyAlready = (k: Connection) =>
      step(5, 'key-ready', { text: S.keyAlready([k.vendor ? vendorName(k.vendor, language) : '', k.model].filter(Boolean).join(' · ')), actions: ['happy'] });

    const pages: Page[] = [
      // 0 the language
      async () => {
        const current = deps.language();
        const l = await step(0, 'language', {
          text: LANGUAGE_PAGE.ask, marks: [LANGUAGE_PAGE.ask], actions: ['happy'],
          input: { kind: 'choices', confirm: LANGUAGE_PAGE.ok, value: LANGUAGES.indexOf(current), options: LANGUAGES.map(languageCard) },
        });
        const picked = 'index' in l ? LANGUAGES[l.index]! : current;
        // the config API writes the live config before it answers; a failed write leaves the language as it was
        if (picked !== current) await call('/api/config', { group: APP_GROUP, values: { language: picked } }).catch(() => {});
        language = deps.language();
        S = lines(language);
        return 'answered';
      },

      // 1 hello, a name, and where they heard of Coopanion
      async (back) => answered(await step(1, 'hello', { text: S.hello, marks: ['Coo'], actions: ['happy', 'hop'], back, input: { kind: 'buttons', options: [{ label: S.helloReply, primary: true }] } })),
      async (back) => {
        const saved = typeof values[USER_KEY] === 'string' ? values[USER_KEY] as string : '';
        const defaultName = petText(language).defaultUser;
        const a = await step(1, 'name', {
          text: S.askName, actions: ['thinking'], back,
          input: { kind: 'text', submit: S.nameSend, placeholder: defaultName, value: saved && !OLD_DEFAULT_USERS.includes(saved) ? saved : '', maxLength: capFor(USER_MAX, language) },
        });
        if ('back' in a) return 'back';
        const named = 'text' in a ? a.text : saved || defaultName;
        name = named;
        if (named !== saved) await setPet(USER_KEY, named);
        await step(1, 'name-ok', { text: S.gotName(named), actions: ['love'] });
        return 'answered';
      },
      async (back) => {
        const src = await step(1, 'source', {
          text: S.askSource, actions: ['thinking'], back,
          input: { kind: 'buttons', options: S.sources.map(([label, id]) => ({ label, primary: id === source })) },
        });
        if ('back' in src) return 'back';
        source = S.sources['index' in src ? src.index : S.sources.length - 1]?.[1] ?? 'skip';
        answer('source', { answer: source });
        if (source !== 'skip') await step(1, 'source-ok', { text: S.sourceThanks, actions: ['nod'] });
        return 'answered';
      },

      // 2 who Coo is, while its self-description is still one the app ships: each card dresses Coo in its colours and
      // has it say a line in that persona's voice; the pick becomes the self-description and the look
      async (back) => {
        const shipped = personaOf(deps.workspace);
        if (!shipped) return 'passed';
        const ids = PERSONAS.filter((id) => id !== 'whale' || deps.whale);
        const p = await step(2, 'persona-pick', {
          text: S.askPersona, actions: ['thinking'], back,
          input: {
            kind: 'choices', list: true, confirm: S.roamOk, value: Math.max(0, ids.indexOf(shipped)),
            options: ids.map((id) => ({ ...S.personas[id], icon: `persona_${id}`, actions: [PERSONA_LOOKS[id].act], skin: PERSONA_LOOKS[id].skin, ...(id === 'whale' ? { tint: WHALE_TINT } : {}) })),
            hint: { text: S.dressHint.text, mark: S.dressHint.dress, icon: 'shirt' },
          },
        });
        if ('back' in p) return 'back';
        const picked = ids['index' in p ? p.index : 0] ?? 'coo';
        answer('persona', { id: picked });
        deps.pet()?.dress(PERSONA_LOOKS[picked].skin);
        if (picked !== shipped) {
          applyPersona(deps.workspace, picked, language);
          // the session reads the new self-description from its next request on
          await call('/api/session/reload-prefix', {}).catch(() => {});
        }
        return 'answered';
      },

      // 3 how lively: each card plays out while it is picked
      async (back) => {
        const cur = ROAMS.indexOf(values[ROAM_KEY] as Roam);
        const r = await step(3, 'roam', {
          text: S.askRoam, back,
          input: {
            kind: 'choices', confirm: S.roamOk, value: cur < 0 ? 1 : cur,
            options: ROAMS.map((id) => ({ ...S.roam[id], motion: MOTIONS[id], icon: `roam_${id}` })),
          },
        });
        if ('back' in r) return 'back';
        await setPet(ROAM_KEY, ROAMS['index' in r ? r.index : 1] ?? 'calm');
        await step(3, 'roam-ok', { text: S.roamDone, actions: ['nod'] });
        return 'answered';
      },

      // 4 the response mode
      async (back) => {
        const wakeNow = WAKES.indexOf(values[WAKE_KEY] as Wake);
        const w = await step(4, 'wake', {
          text: S.askWake, marks: [S.wakeTitle], actions: ['thinking'], back,
          input: { kind: 'choices', confirm: S.roamOk, value: wakeNow < 0 ? 1 : wakeNow, options: WAKES.map((id) => S.wake[id]) },
        });
        if ('back' in w) return 'back';
        const wake = WAKES['index' in w ? w.index : 1] ?? 'poke';
        if (wake !== values[WAKE_KEY]) await setPet(WAKE_KEY, wake);
        await step(4, 'wake-ok', { text: S.roamDone, actions: ['nod'] });
        return 'answered';
      },

      // 5 the model key: the service, its model and key, or a line that one is connected already
      async () => {
        if (keyReady === false) return 'passed';
        const k = await currentConnection(call);
        keyReady = k.ready;
        if (k.ready) await keyAlready(k);
        return 'passed';
      },
      ...connect.pages.map((page): Page => (back) => (keyReady ? Promise.resolve('passed') : page(back))),
      async () => {
        if (keyReady || connect.state.connected) return 'passed';
        // put off after the back button returned to a service connected before: that one is still in use
        const k = await currentConnection(call);
        if (k.ready) await keyAlready(k);
        else await step(5, 'key-later', { text: S.keySkipped, actions: ['sad'] });
        return 'passed';
      },

      // 6 voice input: the speech model of the engine in force, when it is missing
      async (back) => {
        const voice = deps.pet()?.voiceState() as VoiceState | undefined;
        const engine = voice?.enabled !== false && (voice?.engine === 'funasr' || voice?.engine === 'whisper') ? voice.engine : null;
        const model = engine ? voice?.model : undefined;
        if (!model || (model.phase === 'ready' && !voiceOffered)) return 'passed';
        // downloaded since it was offered: the page says so, and nothing is downloaded again
        if (model.phase === 'ready') return answered(await step(6, 'voice-ready', { text: S.downloaded, actions: ['happy'], back, input: { kind: 'buttons', options: [{ label: S.next, primary: true }] } }));
        voiceOffered = true;
        const mb = Math.round(model.bytes / 1048576);
        const d = await step(6, 'voice-download', {
          text: S.askModel(engine === 'whisper' ? 'Whisper' : 'FunASR', mb), actions: ['thinking'], back,
          input: { kind: 'buttons', options: [{ label: S.download, primary: true }, { label: S.notNow }] },
        });
        if ('back' in d) return 'back';
        if (!('index' in d) || d.index !== 0) {
          answer('voice_model', { result: 'later' });
          await step(6, 'voice-later', { text: S.modelLater });
          return 'answered';
        }
        const bar = deps.pet()?.dialog({ text: S.downloading, step: [7, STEPS], input: { kind: 'progress', label: `${mb} MB` } });
        void deps.pet()?.installVoice();
        let m: VoiceState['model'];
        for (;;) {
          await sleep(POLL_MS);
          m = (deps.pet()?.voiceState() as VoiceState | undefined)?.model;
          if (!m || m.phase === 'ready' || m.phase === 'error' || m.phase === 'absent') break;
          bar?.update({ progress: m.total ? m.done / m.total : null });
        }
        bar?.close();
        const ready = m?.phase === 'ready';
        answer('voice_model', { result: ready ? 'ready' : 'failed' });
        if (ready) await step(6, 'voice-ready', { text: S.downloaded, actions: ['love', 'hop'] });
        else await step(6, 'voice-failed', { text: S.downloadFail(m?.detail ?? '?'), actions: ['sad'] });
        return 'answered';
      },
      // the World words the hint for the key and mode in force; the key cap acts out the taps and the hold
      async (back) => {
        const voice = deps.pet()?.voiceState() as VoiceState | undefined;
        const on = voice?.enabled !== false && !!voice?.input?.hint;
        const keyed = on && voice?.input?.mode !== 'always';
        return answered(await step(6, 'talk', {
          text: `${on ? S.talk(voice!.input!.hint!) : S.talkOff}${S.talkType}`, back,
          input: { kind: 'buttons', keys: keyed ? voice?.input?.keyLabel : undefined, taps: voice?.input?.taps, options: [{ label: S.gotIt, primary: true }] },
        }));
      },

      // 7 the hover buttons, which the right-click menu shows too, and where settings live
      async (back) => {
        const saved = hoverButtonList(typeof values[HOVER_KEY] === 'string' ? values[HOVER_KEY] as string : 'chat,voice');
        const names = petText(language).consent.actions;
        const a = await step(7, 'buttons', {
          text: S.buttons, actions: ['wink'], back,
          input: {
            kind: 'pick', confirm: S.ok, max: MAX_HOVER_BUTTONS, value: saved.map((id) => PET_ACTIONS.indexOf(id)),
            options: PET_ACTIONS.map((id) => ({ label: names[id] ?? id, icon: ACTION_ICONS[id] })),
          },
        });
        if ('back' in a) return 'back';
        // in the actions' order, as the Habits page keeps them; an empty answer leaves them as they were
        const ids = 'picked' in a ? a.picked.map((i) => PET_ACTIONS[i]).filter((id): id is PetAction => !!id).slice(0, MAX_HOVER_BUTTONS) : [];
        const picked = ids.length ? ids : saved;
        answer('hover_buttons', { ids: picked });
        if (picked.join(',') !== values[HOVER_KEY]) await setPet(HOVER_KEY, picked.join(','));
        return 'answered';
      },
      async (back) => answered(await step(7, 'persona', { text: S.persona, marks: [S.personaMark], actions: ['happy'], back, input: { kind: 'buttons', options: [{ label: S.personaOk, primary: true }] } })),
      async (back) => {
        const end = await step(7, 'finish', { text: S.finish, actions: ['happy'], back, input: { kind: 'buttons', options: [{ label: S.go, primary: true }, { label: S.dress }] } });
        if ('back' in end) return 'back';
        dress = 'index' in end && end.index === 1;
        return 'answered';
      },
    ];
    await walk(pages, () => S.back);
    markDone(deps.doneFile);
    sendAnswers();
    deps.track?.('guide_finished', {});
    deps.onEnd?.({ finished: true, name, step: reached, transcript });
    if (dress) deps.openDress();
  } catch (err) {
    if (!(err instanceof Closed)) throw err;
    sendAnswers();
    deps.track?.('guide_closed', { step: reached, at });
    markDone(deps.doneFile);
    const closed = lines(deps.language()).closed;
    await t.show({ text: closed, actions: ['nod'] });
    transcript.push(RECORD_TEXT[deps.modelLanguage?.() ?? 'zh'].coo(closed));
    deps.onEnd?.({ finished: false, name, step: reached, transcript });
  } finally {
    sendAnswers();
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
    const { pages } = connectPages(show, call, deps.pet, () => ({ text, actions: ['thinking'], closable: true }), () => lines(deps.language()).askLater, deps.language,
      (vendor) => deps.track?.('model_connected', { via, vendor: vendor.id }));
    await walk(pages).catch((err: unknown) => { if (err instanceof Closed) throw err; });
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
