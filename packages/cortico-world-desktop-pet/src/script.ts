/**
 * Speech scripts for the pet's bubble. Markers name expressions and motions:
 *
 * - `【a, b】` blocking: runs the words, then starts a new bubble with the text after it.
 * - `<a, b>` inline: runs the words when typing reaches that point, without a new bubble.
 *
 * The words are the vocabulary of the body on screen (its pack's `vocab`, src/packs.ts), by id or
 * by any of their names; unknown words are dropped and reported back. An inline marker longer than
 * `INLINE_TAG_MAX` or spanning a line is text.
 */

/** One word of a body's vocabulary. */
export interface VocabWord {
  id: string;
  kind: 'expression' | 'motion';
  /** Names the bot may write it by, by language; the id always works. */
  names: Record<string, string[]>;
  /** What it looks like on this body, by language. */
  about: Record<string, string>;
  /** Seconds the page waits after it before the next word in a row. */
  seconds: number;
  /** Held until the next word (sitting, sleeping). */
  lasting?: boolean;
}

const lookups = new WeakMap<readonly VocabWord[], Map<string, VocabWord>>();
function lookup(vocab: readonly VocabWord[]): Map<string, VocabWord> {
  let m = lookups.get(vocab);
  if (!m) {
    m = new Map();
    for (const v of vocab) {
      m.set(v.id, v);
      for (const n of Object.values(v.names).flat()) m.set(n, v);
    }
    lookups.set(vocab, m);
  }
  return m;
}

/** The id of a word of `vocab` (its id or one of its names), or null. */
export function vocabId(word: string, vocab: readonly VocabWord[]): string | null {
  const m = lookup(vocab);
  return m.get(word.trim().toLowerCase())?.id ?? m.get(word.trim())?.id ?? null;
}

export interface Anchor {
  /** Character offset in the beat's text. */
  at: number;
  actions: string[];
}

export interface Beat {
  actions: string[];
  text: string;
  anchors: Anchor[];
}

export interface ParsedScript {
  beats: Beat[];
  dropped: string[];
}

export const INLINE_TAG_MAX = 32;

function words(inner: string, dropped: string[], vocab: readonly VocabWord[]): string[] {
  const out: string[] = [];
  for (const w of inner.split(/[,，、\s]+/)) {
    if (!w) continue;
    const id = vocabId(w, vocab);
    if (id) out.push(id);
    else dropped.push(w);
  }
  return out;
}

export function parseScript(script: string, vocab: readonly VocabWord[]): ParsedScript {
  const dropped: string[] = [];
  const beats: Beat[] = [];
  let cur: Beat = { actions: [], text: '', anchors: [] };
  let i = 0;
  while (i < script.length) {
    const ch = script[i];
    if (ch === '【') {
      const end = script.indexOf('】', i + 1);
      if (end < 0) { cur.text += script.slice(i); break; }
      const acts = words(script.slice(i + 1, end), dropped, vocab);
      if (cur.text.trim() || cur.actions.length || cur.anchors.length) beats.push(cur);
      cur = { actions: acts, text: '', anchors: [] };
      i = end + 1;
      continue;
    }
    if (ch === '<' || ch === '＜') {
      const close = ch === '<' ? '>' : '＞';
      const end = script.indexOf(close, i + 1);
      const inner = end < 0 ? '' : script.slice(i + 1, end);
      if (end < 0 || inner.length > INLINE_TAG_MAX || /\n/.test(inner)) { cur.text += ch; i++; continue; }
      const acts = words(inner, dropped, vocab);
      if (acts.length) cur.anchors.push({ at: cur.text.length, actions: acts });
      i = end + 1;
      continue;
    }
    cur.text += ch;
    i++;
  }
  if (cur.text.trim() || cur.actions.length || cur.anchors.length) beats.push(cur);
  for (const b of beats) {
    const lead = b.text.length - b.text.trimStart().length;
    b.text = b.text.trim();
    for (const a of b.anchors) a.at = Math.max(0, Math.min(b.text.length, a.at - lead));
  }
  return { beats, dropped };
}

/** Seconds a script stays on screen: typing at ~20 chars/s, plus reading time per bubble. */
export function estimateSeconds(beats: readonly Beat[]): number {
  let s = 0;
  for (const b of beats) {
    if (b.actions.length) s += .5;
    if (b.text) s += b.text.length / 20 + 1.6 + b.text.length * .07;
  }
  return Math.round(s * 10) / 10;
}

/** Validates an action list for `pet_act`, splitting known ids from unknown words. */
export function parseActions(list: readonly unknown[], vocab: readonly VocabWord[]): { actions: string[]; dropped: string[] } {
  const actions: string[] = [];
  const dropped: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string') { dropped.push(String(raw)); continue; }
    const id = vocabId(raw, vocab);
    if (id) actions.push(id);
    else dropped.push(raw);
  }
  return { actions, dropped };
}

/** The vocabulary as the bot's prompt shows it: expressions, then motions, with names and looks in `language`. */
export function vocabTable(vocab: readonly VocabWord[], language = 'zh'): string {
  const pick = <T>(by: Record<string, T>): T | undefined => by[language] ?? by.zh ?? Object.values(by)[0];
  const rows = (kind: VocabWord['kind']) => vocab.filter((v) => v.kind === kind)
    .map((v) => `| ${v.id} | ${(pick(v.names) ?? []).join(' / ')} | ${pick(v.about) ?? ''}${v.lasting ? ',保持到下一个动作' : ''} |`).join('\n');
  return `表情(持续几秒后回到平常的脸):\n\n| 词 | 中文 | 样子 |\n|---|---|---|\n${rows('expression')}\n\n`
    + `动作:\n\n| 词 | 中文 | 样子 |\n|---|---|---|\n${rows('motion')}`;
}
