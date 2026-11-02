/**
 * Decider mode, for figures with large word tables of their own: the bot sees no word table and writes how it feels
 * with each bubble (`feeling`); a decision model on OpenRouter picks the words of the body on screen that show it,
 * one multiple-choice question per part of the body. Off by default (`decider.enabled`), and in force only while the
 * World has an OpenRouter key. A failed decision leaves the body as it is; nothing picks words in its place.
 *
 * - `buildQuestions`: a face, a head, an arm and a body question, each with a keep option first and the body's
 *   words as the rest, keyed by their first names, with their looks and other names as the guidance. Every word but
 *   walk and run is in exactly one question (`questionOf`).
 * - `buildState`: the figure, the feeling and the line about to be said.
 * - `pickGroup`: from the answers to one group of words, in the order the page plays them (`orderGroup`).
 * - `stripMarkers`: a bubble's text without the markers the bot writes out of habit.
 * - `DeciderClient`: the HTTP call with a timeout and a circuit breaker; the key is read at each call and never
 *   kept, logged or put in an error.
 *
 * What the decision model reads is in the model-text language (`DECIDER_TEXT`), as the environment prompts are.
 */
import { requestJson } from 'cortico/providers/transport/response-http.ts';
import { cutChars } from './i18n/index.ts';
import type { ModelLanguage } from './model-text.ts';
import { INLINE_TAG_MAX, vocabId, type VocabWord } from './script.ts';

export const DECIDER_DEFAULT_MODEL = 'typesafe/jev-1.14';
export const DECIDER_URL = 'https://openrouter.ai/api/alpha/decisions';
/** Consecutive failures that open the breaker, and how long it stays open. */
export const BREAKER_FAILS = 3;
export const BREAKER_MS = 60_000;
/** Longest feeling and line the decision model reads, and the longest state, in characters. */
export const FEELING_MAX = 200;
const LINE_MAX = 200;
const STATE_MAX = 1500;
/** How much of an error message a failure keeps, in characters. */
const DETAIL_MAX = 120;

export type QuestionId = 'face' | 'head' | 'arm' | 'body';
const QUESTION_IDS: readonly QuestionId[] = ['face', 'head', 'arm', 'body'];

const zh = {
  instructions: {
    face: '它这一刻脸上是什么表情?',
    head: '它的头要不要做个动作(点头、摇头之类)?',
    arm: '它的手要不要做个手势或手上的动作?',
    body: '它的身体或姿势要不要变(坐下、跳、转身之类)?',
  } as Record<QuestionId, string>,
  keep: { face: '不换表情', head: '头不动', arm: '手不动', body: '保持现在的姿势' } as Record<QuestionId, string>,
  keepAbout: {
    face: '脸上没有特别的变化,保持现在的表情',
    head: '不需要点头、摇头这类头部动作',
    arm: '不需要手势',
    body: '不需要换姿势或全身动作',
  } as Record<QuestionId, string>,
  /** A word's guidance, joined by `sep`. */
  sep: ';',
  aliases: (names: string[]) => `也叫:${names.join('、')}`,
  lasting: '会一直保持下去',
  intro: (body: string) => `你是桌面上的一个小角色:${body}。下面是它此刻的状态,请替它选出最贴切的表情和动作;多数时候一两个部位动一动就够,不贴切就选「不动」类的选项。`,
  feeling: (s: string) => `它此刻的心情:${s}`,
  text: (s: string) => `它正要说的话:${s}`,
};

const en: typeof zh = {
  instructions: {
    face: 'What expression is on its face right now?',
    head: 'Does its head make a move (a nod, a shake)?',
    arm: 'Do its arms make a gesture?',
    body: 'Does its body or posture change (sitting down, a jump, turning round)?',
  },
  keep: { face: 'same face', head: 'head still', arm: 'arms still', body: 'same posture' },
  keepAbout: {
    face: 'Nothing special on its face; it stays as it is',
    head: 'No nod, shake or other head move',
    arm: 'No gesture',
    body: 'No change of posture and no whole-body move',
  },
  sep: '; ',
  aliases: (names) => `also called: ${names.join(', ')}`,
  lasting: 'it stays like this',
  intro: (body) => `You are a small character on a desktop: ${body}. Below is how it is right now; pick the expression and moves that fit it best. One or two parts moving is usually enough; when nothing fits, pick the options that keep it still.`,
  feeling: (s) => `How it feels: ${s}`,
  text: (s) => `What it is about to say: ${s}`,
};

/** What the decision model reads, in the model-text language. */
export const DECIDER_TEXT: Record<ModelLanguage, typeof zh> = { zh, en };

/* ---------------- parts and questions ---------------- */

/** A part of the body a word takes. `stance`: it stands or sits still for it (not walking, jumping or dancing). */
type Part = 'face' | 'head' | 'arm' | 'body' | 'stance';
const ALL: readonly Part[] = ['face', 'head', 'arm', 'body', 'stance'];
/**
 * The parts each kit motion takes (web/kit/body.js `act`). Asleep, nothing else shows; the dizzy face covers any
 * other; a bow and a spin need it still. A pack's own expression takes the face, its own motion all but the face.
 */
const PARTS: Readonly<Record<string, readonly Part[]>> = {
  nod: ['head'], shake: ['head'],
  wave: ['arm'], shiver: ['arm'],
  bow: ['arm', 'stance'], spin: ['arm', 'stance'], turn: ['stance'],
  sit: ['body'],
  sleep: ALL,
  dizzy: ['body', 'stance', 'face'],
  stand: ['body', 'stance'], walk: ['body', 'stance'], run: ['body', 'stance'], look: ['body', 'stance'],
  dance: ['body', 'stance'], jump: ['body', 'stance'], hop: ['body', 'stance'],
  flap: ['body', 'stance', 'arm'],
};

function partsOf(v: VocabWord): readonly Part[] {
  return PARTS[v.id] ?? (v.kind === 'expression' ? ['face'] : ['head', 'arm', 'body', 'stance']);
}

/** Whether two words take a part in common, so they are not picked together. */
export function clashes(a: VocabWord, b: VocabWord): boolean {
  const pb = partsOf(b);
  return partsOf(a).some((p) => pb.includes(p));
}

/** Which question a word is asked in, or null for walk and run (`pet_move_to` moves the body). */
export function questionOf(v: VocabWord): QuestionId | null {
  if (v.kind === 'expression') return 'face';
  if (v.id === 'walk' || v.id === 'run') return null;
  const parts = partsOf(v);
  if (parts.length === 1 && parts[0] === 'head') return 'head';
  if (parts.includes('arm') && !parts.includes('body')) return 'arm';
  return 'body';
}

/** The page plays a group's words one after another: posture and whole-body moves, arms, head, then the face, which a motion after it would clear. */
const RANK: Record<QuestionId, number> = { body: 0, arm: 1, head: 2, face: 3 };
export function orderGroup(ids: readonly string[], vocab: readonly VocabWord[]): string[] {
  const rank = (id: string) => { const v = vocab.find((w) => w.id === id); const q = v ? questionOf(v) : null; return q ? RANK[q] : 0; };
  return [...ids].sort((a, b) => rank(a) - rank(b));
}

/** A word's name in `language`: its first name there, its id when it has none. */
export function firstName(v: VocabWord, language: ModelLanguage = 'zh'): string {
  return v.names[language]?.[0] ?? v.id;
}

export interface Option {
  /** The key the decision model answers with. */
  key: string;
  /** The word, or null for the question's keep option. */
  id: string | null;
  about: string;
}

export interface Question {
  id: QuestionId;
  instructions: string;
  options: Option[];
}

/**
 * The questions for the body whose vocabulary is `vocab`, in order face, head, arm, body; a question without a word
 * is left out. `forSay`: for a bubble, which sleep is left out of (asleep, it cannot talk).
 */
export function buildQuestions(vocab: readonly VocabWord[], language: ModelLanguage = 'zh', forSay = false): Question[] {
  const t = DECIDER_TEXT[language];
  const taken = new Set<string>();
  const out: Question[] = [];
  for (const id of QUESTION_IDS) {
    const words = vocab.filter((v) => questionOf(v) === id && !(forSay && v.id === 'sleep'));
    if (!words.length) continue;
    // a keep key that names a word would read as that word
    const keep = vocabId(t.keep[id], vocab) === null ? t.keep[id] : `(${t.keep[id]})`;
    const options: Option[] = [{ key: keep, id: null, about: t.keepAbout[id] }];
    for (const v of words) {
      let key = firstName(v, language);
      if (taken.has(key) || key === keep) key = `${key} (${v.id})`;
      taken.add(key);
      options.push({ key, id: v.id, about: aboutOf(v, language) });
    }
    out.push({ id, instructions: t.instructions[id], options });
  }
  return out;
}

/** An option's guidance: what it looks like, its other names, and that a posture lasts. */
function aboutOf(v: VocabWord, language: ModelLanguage): string {
  const t = DECIDER_TEXT[language];
  const about = (v.about[language] ?? v.about.zh ?? Object.values(v.about)[0] ?? '').trim();
  const names = (v.names[language] ?? []).slice(1);
  const parts = [about || firstName(v, language)];
  if (names.length) parts.push(t.aliases(names));
  if (v.lasting) parts.push(t.lasting);
  return parts.join(t.sep);
}

/**
 * A bubble's text without the markers written out of habit: every closed `【…】` on one line of at most 64
 * characters, and a `<…>` or `＜…＞` of at most INLINE_TAG_MAX characters that names a word of `vocab`. Other angle
 * brackets are the text (`a < b`, `3<5`, `<3`).
 */
export function stripMarkers(text: string, vocab: readonly VocabWord[]): string {
  const names = (inner: string) => inner.length <= INLINE_TAG_MAX && inner.split(/[,，、\s+＋]+/).some((w) => w !== '' && vocabId(w, vocab) !== null);
  const out = text.replace(/【[^【】\n]{0,64}】|<([^<>\n]*)>|＜([^＜＞\n]*)＞/g, (all, b?: string, c?: string) => (b === undefined && c === undefined) || names(b ?? c!) ? '' : all);
  return out === text ? text : out.trim();
}

/* ---------------- state, request and answers ---------------- */

const clip = (s: string, n: number) => { const cut = cutChars(s, n); return cut === s ? s : `${cut}…`; };

/** What the decision model reads besides the questions: the figure as the prompt describes it, the feeling and the line, one a line. */
export function buildState(c: { body: string; feeling: string; text?: string }, language: ModelLanguage = 'zh'): string {
  const t = DECIDER_TEXT[language];
  const lines = [t.intro(c.body), t.feeling(clip(c.feeling.trim(), FEELING_MAX))];
  if (c.text?.trim()) lines.push(t.text(clip(c.text.trim(), LINE_MAX)));
  return cutChars(lines.join('\n'), STATE_MAX);
}

export interface DecisionRequest {
  model: string;
  state: string;
  questions: Record<string, { type: 'choice'; instructions: string; criteria: Record<string, string> }>;
}

export function buildRequest(model: string, state: string, questions: readonly Question[]): DecisionRequest {
  return {
    model,
    state,
    questions: Object.fromEntries(questions.map((q) => [q.id, {
      type: 'choice' as const, instructions: q.instructions, criteria: Object.fromEntries(q.options.map((o) => [o.key, o.about])),
    }])),
  };
}

export interface Answer {
  choice: string | null;
  probabilities: Record<string, number>;
}

/** The answers of a response body (unknown fields ignored, an answer with neither a choice nor probabilities left out), or null without any. */
export function parseAnswers(body: unknown): Record<string, Answer> | null {
  const raw = (body as { answers?: unknown } | null)?.answers;
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, Answer> = {};
  for (const [name, a] of Object.entries(raw as Record<string, unknown>)) {
    if (!a || typeof a !== 'object') continue;
    const r = a as Record<string, unknown>;
    const probabilities: Record<string, number> = {};
    if (r.probabilities && typeof r.probabilities === 'object') {
      for (const [k, v] of Object.entries(r.probabilities as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v)) probabilities[k] = v;
    }
    const choice = typeof r.choice === 'string' ? r.choice : null;
    if (choice === null && !Object.keys(probabilities).length) continue;
    out[name] = { choice, probabilities };
  }
  return Object.keys(out).length ? out : null;
}

/* ---------------- from answers to a group ---------------- */

/** The least probability a question's winner needs to move that part of the body. */
export const FLOOR: Readonly<Record<QuestionId, number>> = { face: .20, head: .30, arm: .30, body: .55 };
/** Falling asleep needs more: the body stops answering for it. */
export const SLEEP_FLOOR = .70;
/** At most this many parts besides the face move at once. */
export const BUDGET = 2;

/** A question's most likely option: by probability, or the choice alone as certain. */
function winner(q: Question, a: Answer | undefined): { key: string; p: number } | null {
  if (!a) return null;
  const keys = new Set(q.options.map((o) => o.key));
  const ps = Object.entries(a.probabilities).filter(([k]) => keys.has(k)).sort((x, y) => y[1] - x[1]);
  if (ps.length) return { key: ps[0]![0], p: ps[0]![1] };
  return a.choice && keys.has(a.choice) ? { key: a.choice, p: 1 } : null;
}

/**
 * The words the answers come to, in the order the page plays them. Each question's winner moves its part when it is
 * a word at or above its floor. Then, most likely first, a word is kept unless it takes a part a kept one takes
 * (`clashes`) or would be a part beyond BUDGET (the face is not counted). `feel` (`pet_feel`): the bot asks for the
 * body itself, so a posture the body stays in (sit, sleep) goes first.
 */
export function pickGroup(questions: readonly Question[], answers: Readonly<Record<string, Answer>>, vocab: readonly VocabWord[], feel = false): string[] {
  const byId = new Map(vocab.map((v) => [v.id, v]));
  const cands: Array<{ q: QuestionId; v: VocabWord; p: number }> = [];
  for (const q of questions) {
    const win = winner(q, answers[q.id]);
    const v = byId.get(q.options.find((o) => o.key === win?.key)?.id ?? '');
    if (win && v && win.p >= Math.max(FLOOR[q.id], v.id === 'sleep' ? SLEEP_FLOOR : 0)) cands.push({ q: q.id, v, p: win.p });
  }
  const rank = (c: (typeof cands)[number]) => (feel && c.q === 'body' && c.v.lasting ? Infinity : c.p);
  const kept: typeof cands = [];
  let parts = 0;
  for (const c of cands.sort((a, b) => rank(b) - rank(a))) {
    if (kept.some((k) => clashes(k.v, c.v)) || (c.q !== 'face' && parts >= BUDGET)) continue;
    if (c.q !== 'face') parts++;
    kept.push(c);
  }
  return orderGroup(kept.map((c) => c.v.id), vocab);
}

/* ---------------- the client ---------------- */

/** Why a decision failed: no key, the timeout, an error status, an answer it cannot read, no connection, the breaker open, a stop. */
export type DecideFailure = 'nokey' | 'timeout' | 'http' | 'bad' | 'network' | 'breaker' | 'aborted';
/** The failures that count toward the breaker. */
type Counted = 'timeout' | 'http' | 'bad' | 'network';

export type DecideResult =
  | { ok: true; answers: Record<string, Answer> }
  | { ok: false; reason: DecideFailure; detail: string };

export interface DeciderClientOptions {
  url: () => string;
  /** Read at each call; '' means no key. */
  key: () => string;
  timeoutMs: () => number;
  fetch?: typeof fetch;
  now?: () => number;
  /** Told when the breaker opens, with the last failure. */
  warn?: (msg: string) => void;
}

export class DeciderClient {
  private fails = 0;
  private openUntil = 0;
  private readonly controllers = new Set<AbortController>();
  /** The last call that went out and failed, until one is answered: its reason and its detail without the key. */
  lastFailure: { reason: Counted; detail: string } | null = null;

  constructor(private readonly o: DeciderClientOptions) {}

  private now(): number {
    return this.o.now?.() ?? Date.now();
  }

  /** The breaker is open: calls fail at once until it closes. */
  get open(): boolean {
    return this.now() < this.openUntil;
  }

  /** One decision, given up at the timeout or when `signal` aborts (`aborted`, not counted as a failure). */
  async decide(body: DecisionRequest, signal?: AbortSignal): Promise<DecideResult> {
    if (this.open) return { ok: false, reason: 'breaker', detail: '' };
    const key = this.o.key();
    if (!key) return { ok: false, reason: 'nokey', detail: '' };
    if (signal?.aborted) return { ok: false, reason: 'aborted', detail: '' };
    // the key goes before the message is cut, so no part of it is left
    const detailOf = (s: string) => cutChars((key.length >= 4 ? s.split(key).join('***') : s).replace(/\s+/g, ' ').trim(), DETAIL_MAX);
    const ctrl = new AbortController();
    const stop = () => ctrl.abort();
    signal?.addEventListener('abort', stop, { once: true });
    this.controllers.add(ctrl);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, Math.max(1, this.o.timeoutMs()));
    try {
      const res = await (this.o.fetch ?? fetch)(this.o.url(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'X-Title': 'Coopanion' },
        body: requestJson(body),
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = '';
        try { msg = String((JSON.parse(text) as { error?: { message?: unknown } }).error?.message ?? ''); } catch { /* not JSON */ }
        return this.failed('http', detailOf(`${res.status} ${msg}`));
      }
      let answers: Record<string, Answer> | null = null;
      try { answers = parseAnswers(JSON.parse(text)); } catch { /* not JSON */ }
      if (!answers) return this.failed('bad', '');
      this.fails = 0;
      this.lastFailure = null;
      return { ok: true, answers };
    } catch (err) {
      if (timedOut) return this.failed('timeout', '');
      if (ctrl.signal.aborted) return { ok: false, reason: 'aborted', detail: '' };
      return this.failed('network', detailOf((err as Error)?.message ?? String(err)));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      this.controllers.delete(ctrl);
    }
  }

  private failed(reason: Counted, detail: string): DecideResult {
    this.lastFailure = { reason, detail };
    if (++this.fails >= BREAKER_FAILS) {
      this.fails = 0;
      this.openUntil = this.now() + BREAKER_MS;
      this.o.warn?.(`决策模型连续 ${BREAKER_FAILS} 次失败(最后一次:${reason}${detail ? ` ${detail}` : ''}),${BREAKER_MS / 1000} 秒内不再请求`);
    }
    return { ok: false, reason, detail };
  }

  /** Closes the breaker and forgets the failures (a new key, a change of mode). */
  reset(): void {
    this.fails = 0;
    this.openUntil = 0;
    this.lastFailure = null;
  }

  /** Aborts the calls in flight (World stop). */
  abortAll(): void {
    for (const c of this.controllers) c.abort();
    this.controllers.clear();
  }
}
